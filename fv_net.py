# -*- coding: utf-8 -*-
"""Безопасная загрузка адресов для серверных инструментов.

Использует проверенные функции open_graph.py: разбор URL, только публичные IP,
подключение к уже проверенному адресу (защита от DNS rebinding), ограниченные порты.
Каждый переход по редиректу проверяется заново.
"""
import http.client
import socket
import ssl
import time
from urllib.parse import urljoin

import open_graph as _og
from site_config import SITE_URL

NetError = _og.OpenGraphError

REDIRECT_CODES = (301, 302, 303, 307, 308)
DEFAULT_MAX_BYTES = 1024 * 1024
DEFAULT_TIMEOUT = 8
DEFAULT_MAX_REDIRECTS = 5
USER_AGENT = 'FEEDValidator-Tools/1.0 (+%s/)' % SITE_URL


def normalise_url(url):
    """Возвращает проверенный по формату URL или бросает NetError."""
    return _og._normalise_url(url)[0]


def _request_once(url, method, max_bytes, accept, timeout):
    normalized, scheme, hostname, port, target = _og._normalise_url(url)
    addresses = _og._public_addresses(hostname, port)
    last_error = None
    started = time.monotonic()

    for address in addresses:
        connection = _og._PinnedConnection(hostname, port, address, timeout, scheme == 'https')
        try:
            connection.putrequest(method, target, skip_host=True, skip_accept_encoding=True)
            display_host = '[' + hostname + ']' if ':' in hostname else hostname
            if port != (443 if scheme == 'https' else 80):
                display_host += ':' + str(port)
            connection.putheader('Host', display_host)
            connection.putheader('User-Agent', USER_AGENT)
            connection.putheader('Accept', accept)
            connection.putheader('Accept-Encoding', 'identity')
            connection.putheader('Connection', 'close')
            connection.endheaders()
            response = connection.getresponse()
        except (OSError, http.client.HTTPException, ssl.SSLError) as error:
            last_error = error
            connection.close()
            continue

        try:
            body = b''
            truncated = False
            if method != 'HEAD' and max_bytes:
                try:
                    body = response.read(max_bytes + 1)
                except (OSError, http.client.HTTPException, ssl.SSLError) as error:
                    raise NetError('Не удалось полностью загрузить ответ: ' + str(error))
                if len(body) > max_bytes:
                    body = body[:max_bytes]
                    truncated = True
            headers = {}
            for name, value in response.getheaders():
                headers.setdefault(name.lower(), value)
            return {
                'url': normalized,
                'status': response.status,
                'reason': response.reason or '',
                'headers': headers,
                'body': body,
                'truncated': truncated,
                'ip': address[3][0],
                'elapsed_ms': int((time.monotonic() - started) * 1000),
                'charset': response.headers.get_content_charset(),
            }
        finally:
            connection.close()

    raise NetError('Не удалось подключиться к сайту: ' + str(last_error or 'ошибка соединения'))


def fetch(url, method='GET', max_bytes=DEFAULT_MAX_BYTES, accept='*/*',
          follow_redirects=True, max_redirects=DEFAULT_MAX_REDIRECTS, timeout=DEFAULT_TIMEOUT):
    """Загружает URL и возвращает словарь с итоговым ответом и цепочкой редиректов.

    Ответы с ошибочным HTTP-статусом не считаются исключением: инструменту нужен
    сам статус. NetError возникает при небезопасном адресе или сбое соединения.
    """
    method = method.upper()
    if method not in ('GET', 'HEAD'):
        raise NetError('Поддерживаются только методы GET и HEAD.')

    chain = []
    current = url
    while True:
        result = _request_once(current, method, max_bytes, accept, timeout)
        location = result['headers'].get('location')
        if follow_redirects and result['status'] in REDIRECT_CODES and location:
            chain.append({'url': result['url'], 'status': result['status'], 'location': location,
                          'elapsed_ms': result['elapsed_ms']})
            if len(chain) > max_redirects:
                raise NetError('Слишком много перенаправлений (больше %d).' % max_redirects)
            current = urljoin(result['url'], location)
            continue
        result['redirects'] = chain
        result['final_url'] = result['url']
        return result


def decode_body(result, default='utf-8'):
    """Декодирует тело ответа по заявленной кодировке, не падая на ошибках."""
    for charset in (result.get('charset'), default):
        if not charset:
            continue
        try:
            return result['body'].decode(charset, errors='replace')
        except LookupError:
            continue
    return result['body'].decode('utf-8', errors='replace')
