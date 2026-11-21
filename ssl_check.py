# -*- coding: utf-8 -*-
"""SSL Checker: сертификат, срок действия, издатель и параметры TLS."""
import socket
import ssl
import time

import fv_net
import open_graph as _og

TIMEOUT = 8
EXPIRY_WARN_DAYS = 14


def _name(parts):
    result = {}
    for rdn in parts or ():
        for key, value in rdn:
            result.setdefault(key, value)
    return result


def _connect(hostname, port, address, verify):
    family, socktype, protocol, sockaddr = address
    context = ssl.create_default_context() if verify else ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    if not verify:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    sock = socket.socket(family, socktype, protocol)
    context.set_alpn_protocols(['h2', 'http/1.1'])
    sock.settimeout(TIMEOUT)
    try:
        sock.connect(sockaddr)
        wrapped = context.wrap_socket(sock, server_hostname=hostname)
    except Exception:
        sock.close()
        raise
    try:
        return {
            'cert': wrapped.getpeercert() if verify else {},
            'version': wrapped.version(),
            'cipher': (wrapped.cipher() or ('', '', 0))[0],
            'alpn': wrapped.selected_alpn_protocol(),
        }
    finally:
        wrapped.close()


def check_host(raw):
    raw = str(raw).strip()
    if '://' not in raw:
        raw = 'https://' + raw
    _, scheme, hostname, port, _ = _og._normalise_url(raw)
    if scheme != 'https':
        raise fv_net.NetError('Для проверки SSL укажите HTTPS-адрес.')
    addresses = _og._public_addresses(hostname, port)

    started = time.monotonic()
    last_error = None
    verify_error = None
    info = None
    for address in addresses:
        try:
            info = _connect(hostname, port, address, True)
            ip = address[3][0]
            break
        except ssl.SSLCertVerificationError as error:
            verify_error = error.verify_message or str(error)
            try:
                info = _connect(hostname, port, address, False)
                ip = address[3][0]
                break
            except (OSError, ssl.SSLError) as inner:
                last_error = inner
        except (OSError, ssl.SSLError) as error:
            last_error = error
    if info is None:
        raise fv_net.NetError('Не удалось установить TLS-соединение: ' + str(last_error or 'ошибка соединения'))

    result = {
        'host': hostname,
        'port': port,
        'ip': ip,
        'elapsed_ms': int((time.monotonic() - started) * 1000),
        'valid': verify_error is None,
        'verify_error': verify_error,
        'tls_version': info['version'],
        'cipher': info['cipher'],
        'http2': info['alpn'] == 'h2',
        'certificate': None,
    }
    cert = info['cert']
    if cert:
        not_after = ssl.cert_time_to_seconds(cert['notAfter'])
        not_before = ssl.cert_time_to_seconds(cert['notBefore'])
        subject = _name(cert.get('subject'))
        issuer = _name(cert.get('issuer'))
        result['certificate'] = {
            'subject': subject.get('commonName', ''),
            'issuer': issuer.get('organizationName') or issuer.get('commonName', ''),
            'issuer_cn': issuer.get('commonName', ''),
            'not_before': cert['notBefore'],
            'not_after': cert['notAfter'],
            'days_left': int((not_after - time.time()) // 86400),
            'valid_days': int((not_after - not_before) // 86400),
            'san': [value for kind, value in cert.get('subjectAltName', ()) if kind == 'DNS'][:50],
            'serial': cert.get('serialNumber', ''),
            'ocsp': list(cert.get('OCSP', ()))[:3],
            'ca_issuers': list(cert.get('caIssuers', ()))[:3],
        }
    return result
