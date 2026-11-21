# -*- coding: utf-8 -*-
"""DNS Lookup: минимальный DNS-клиент на стандартной библиотеке (UDP с переходом на TCP).

Запросы уходят только на публичные резолверы из RESOLVERS, адрес сервера задать нельзя.
"""
import ipaddress
import random
import re
import socket
import struct

RESOLVERS = {
    'cloudflare': ('Cloudflare 1.1.1.1', '1.1.1.1'),
    'google': ('Google 8.8.8.8', '8.8.8.8'),
    'quad9': ('Quad9 9.9.9.9', '9.9.9.9'),
}
DEFAULT_RESOLVER = 'cloudflare'

TYPES = {'A': 1, 'NS': 2, 'CNAME': 5, 'SOA': 6, 'PTR': 12, 'MX': 15, 'TXT': 16, 'AAAA': 28, 'CAA': 257}
TYPE_NAMES = {v: k for k, v in TYPES.items()}
RCODES = {1: 'Ошибка формата запроса', 2: 'Сбой DNS-сервера', 3: 'Домен не существует (NXDOMAIN)',
          4: 'Тип запроса не поддерживается', 5: 'Запрос отклонён сервером'}

TIMEOUT = 4
MAX_RECORDS = 100
_LABEL = re.compile(r'^(?!-)[a-z0-9_-]{1,63}(?<!-)$', re.I)


class DnsError(Exception):
    pass


def normalise_name(raw):
    name = str(raw or '').strip().rstrip('.')
    if '://' in name:
        name = name.split('://', 1)[1]
    name = name.split('/', 1)[0].split('?', 1)[0]
    if not name:
        raise DnsError('Введите доменное имя.')
    try:
        ascii_name = name.encode('idna').decode('ascii')
    except UnicodeError:
        raise DnsError('Некорректное доменное имя.')
    if len(ascii_name) > 253 or not all(_LABEL.match(part) for part in ascii_name.split('.')):
        raise DnsError('Некорректное доменное имя.')
    return ascii_name.lower()


def reverse_name(raw):
    try:
        return ipaddress.ip_address(str(raw).strip()).reverse_pointer
    except ValueError:
        raise DnsError('Для PTR введите IP-адрес.')


def _encode_name(name):
    out = b''
    for label in name.split('.'):
        out += bytes([len(label)]) + label.encode('ascii')
    return out + b'\x00'


def _read_name(data, pos):
    labels, jumped, end = [], False, pos
    for _ in range(128):
        if pos >= len(data):
            raise DnsError('Повреждённый DNS-ответ.')
        length = data[pos]
        if length & 0xC0 == 0xC0:
            if pos + 1 >= len(data):
                raise DnsError('Повреждённый DNS-ответ.')
            pointer = ((length & 0x3F) << 8) | data[pos + 1]
            if not jumped:
                end = pos + 2
            pos, jumped = pointer, True
            continue
        pos += 1
        if length == 0:
            if not jumped:
                end = pos
            return '.'.join(labels) or '.', end
        labels.append(data[pos:pos + length].decode('ascii', 'replace'))
        pos += length
    raise DnsError('Повреждённый DNS-ответ.')


def _query(resolver_ip, name, rtype):
    qid = random.randint(0, 65535)
    packet = struct.pack('>HHHHHH', qid, 0x0100, 1, 0, 0, 0) + _encode_name(name) + struct.pack('>HH', rtype, 1)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(TIMEOUT)
            sock.sendto(packet, (resolver_ip, 53))
            data, _ = sock.recvfrom(4096)
        if len(data) >= 4 and data[0:2] == struct.pack('>H', qid) and data[2] & 0x02:
            data = _query_tcp(resolver_ip, packet)
    except socket.timeout:
        raise DnsError('DNS-сервер не ответил вовремя.')
    except OSError:
        raise DnsError('Не удалось связаться с DNS-сервером.')
    if len(data) < 12 or data[0:2] != struct.pack('>H', qid):
        raise DnsError('Некорректный ответ DNS-сервера.')
    return data


def _query_tcp(resolver_ip, packet):
    with socket.create_connection((resolver_ip, 53), timeout=TIMEOUT) as sock:
        sock.sendall(struct.pack('>H', len(packet)) + packet)
        head = b''
        while len(head) < 2:
            chunk = sock.recv(2 - len(head))
            if not chunk:
                raise DnsError('Некорректный ответ DNS-сервера.')
            head += chunk
        size = struct.unpack('>H', head)[0]
        data = b''
        while len(data) < size:
            chunk = sock.recv(size - len(data))
            if not chunk:
                break
            data += chunk
    return data


def _parse_rdata(data, pos, rdlen, rtype):
    end = pos + rdlen
    if rtype == 1 and rdlen == 4:
        return socket.inet_ntoa(data[pos:end])
    if rtype == 28 and rdlen == 16:
        return str(ipaddress.IPv6Address(data[pos:end]))
    if rtype in (2, 5, 12):
        return _read_name(data, pos)[0]
    if rtype == 15:
        pref = struct.unpack('>H', data[pos:pos + 2])[0]
        return '%d %s' % (pref, _read_name(data, pos + 2)[0])
    if rtype == 16:
        parts, cur = [], pos
        while cur < end:
            n = data[cur]
            parts.append(data[cur + 1:cur + 1 + n].decode('utf-8', 'replace'))
            cur += 1 + n
        return ''.join(parts)
    if rtype == 6:
        mname, cur = _read_name(data, pos)
        rname, cur = _read_name(data, cur)
        serial, refresh, retry, expire, minimum = struct.unpack('>IIIII', data[cur:cur + 20])
        return '%s %s serial=%d refresh=%d retry=%d expire=%d minimum=%d' % (mname, rname, serial, refresh, retry, expire, minimum)
    if rtype == 257:
        flags, tag_len = data[pos], data[pos + 1]
        tag = data[pos + 2:pos + 2 + tag_len].decode('ascii', 'replace')
        value = data[pos + 2 + tag_len:end].decode('utf-8', 'replace')
        return '%d %s "%s"' % (flags, tag, value)
    return data[pos:end].hex()


def lookup(raw_name, rtype_name='A', resolver='cloudflare'):
    rtype_name = str(rtype_name or 'A').upper()
    if rtype_name not in TYPES:
        raise DnsError('Неподдерживаемый тип записи.')
    if resolver not in RESOLVERS:
        resolver = DEFAULT_RESOLVER
    name = reverse_name(raw_name) if rtype_name == 'PTR' else normalise_name(raw_name)
    rtype = TYPES[rtype_name]
    label, ip = RESOLVERS[resolver]
    data = _query(ip, name, rtype)

    flags = struct.unpack('>H', data[2:4])[0]
    rcode = flags & 0x0F
    qd, an = struct.unpack('>HH', data[4:8])
    pos = 12
    for _ in range(qd):
        pos = _read_name(data, pos)[1] + 4
    records = []
    for _ in range(min(an, 500)):
        owner, pos = _read_name(data, pos)
        if pos + 10 > len(data):
            raise DnsError('Повреждённый DNS-ответ.')
        t, _cls, ttl, rdlen = struct.unpack('>HHIH', data[pos:pos + 10])
        pos += 10
        value = _parse_rdata(data, pos, rdlen, t)
        pos += rdlen
        records.append({'name': owner, 'type': TYPE_NAMES.get(t, str(t)), 'ttl': ttl, 'value': value})
    if rcode and rcode != 3:
        raise DnsError(RCODES.get(rcode, 'Ошибка DNS (код %d).' % rcode))
    return {
        'name': name,
        'query_type': rtype_name,
        'resolver': label,
        'nxdomain': rcode == 3,
        'authoritative': bool(flags & 0x0400),
        'records': records[:MAX_RECORDS],
    }
