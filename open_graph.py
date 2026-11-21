# -*- coding: utf-8 -*-
"""Safe, bounded fetch and Open Graph extraction for the Open Graph checker."""

import http.client
import ipaddress
import socket
import ssl
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

from site_config import SITE_URL


MAX_URL_LENGTH = 2048
MAX_PAGE_SIZE = 2 * 1024 * 1024
REQUEST_TIMEOUT = 8
MAX_REDIRECTS = 4


class OpenGraphError(Exception):
    pass


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.open_graph = {}
        self.twitter = {}
        self.title_parts = []
        self.in_title = False
        self.description = ''
        self.canonical = ''

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        tag = tag.lower()
        if tag == 'title':
            self.in_title = True
        elif tag == 'meta':
            name = (values.get('property') or values.get('name') or '').strip().lower()
            content = (values.get('content') or '').strip()
            if name.startswith('og:'):
                self.open_graph.setdefault(name, []).append(content)
            elif name.startswith('twitter:'):
                self.twitter.setdefault(name, []).append(content)
            elif name == 'description' and not self.description:
                self.description = content
        elif tag == 'link':
            relations = (values.get('rel') or '').lower().split()
            if 'canonical' in relations and not self.canonical:
                self.canonical = (values.get('href') or '').strip()

    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)


def _normalise_url(value):
    value = value.strip()
    if not value or len(value) > MAX_URL_LENGTH:
        raise OpenGraphError('Укажите URL длиной не более 2048 символов.')
    if any(ord(char) <= 32 or ord(char) == 127 or char == '\\' for char in value):
        raise OpenGraphError('URL содержит недопустимые символы.')

    try:
        parsed = urlsplit(value)
        scheme = parsed.scheme.lower()
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        raise OpenGraphError('Не удалось разобрать URL. Проверьте его формат.')

    if scheme not in ('http', 'https') or not hostname:
        raise OpenGraphError('Поддерживаются только полные URL, начинающиеся с http:// или https://.')
    if parsed.username is not None or parsed.password is not None:
        raise OpenGraphError('URL с именем пользователя или паролем не поддерживается.')
    if '%' in hostname:
        raise OpenGraphError('URL с закодированным именем хоста не поддерживается.')

    try:
        hostname = hostname.encode('idna').decode('ascii').lower()
    except UnicodeError:
        raise OpenGraphError('Некорректное имя хоста в URL.')

    port = port if port is not None else (443 if scheme == 'https' else 80)
    if port != (443 if scheme == 'https' else 80):
        raise OpenGraphError('Для безопасности доступны только стандартные порты HTTP (80) и HTTPS (443).')

    path = quote(parsed.path or '/', safe="/%:@!$&'()*+,;=-._~")
    query = quote(parsed.query, safe="/?@!$&'()*+,;=:%-._~")
    normalized = urlunsplit((scheme, parsed.netloc, path, query, ''))
    return normalized, scheme, hostname, port, path + (('?' + query) if query else '')


def _embedded_ipv4_is_private(address):
    # NAT64 (64:ff9b::/96) и 6to4 (2002::/16) могут нести локальный IPv4 внутри публичного на вид IPv6
    if address.version != 6:
        return False
    packed = address.packed
    if address in ipaddress.ip_network('64:ff9b::/96'):
        embedded = packed[12:16]
    elif address in ipaddress.ip_network('2002::/16'):
        embedded = packed[2:6]
    else:
        return False
    return not ipaddress.IPv4Address(embedded).is_global


def _public_addresses(hostname, port):
    try:
        records = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise OpenGraphError('Не удалось найти сервер по этому адресу.')

    addresses = []
    for family, socktype, protocol, _, sockaddr in records:
        try:
            address = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            continue
        if not address.is_global or _embedded_ipv4_is_private(address):
            raise OpenGraphError('Проверка адресов локальной сети и специальных IP-адресов запрещена.')
        item = (family, socktype, protocol, sockaddr)
        if item not in addresses:
            addresses.append(item)
    if not addresses:
        raise OpenGraphError('Для сайта не найден доступный публичный IP-адрес.')
    return addresses


def _tls_context():
    # Тот же набор корневых сертификатов, что и у основного валидатора
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


class _PinnedConnection(http.client.HTTPConnection):
    def __init__(self, hostname, port, address, timeout, use_tls):
        super().__init__(host=hostname, port=port, timeout=timeout)
        self.address = address
        self.use_tls = use_tls
        self.tls_context = _tls_context() if use_tls else None

    def connect(self):
        family, socktype, protocol, sockaddr = self.address
        sock = socket.socket(family, socktype, protocol)
        sock.settimeout(self.timeout)
        try:
            sock.connect(sockaddr)
            if self.use_tls:
                sock = self.tls_context.wrap_socket(sock, server_hostname=self.host)
            self.sock = sock
        except Exception:
            sock.close()
            raise


def _fetch_once(url):
    normalized, scheme, hostname, port, target = _normalise_url(url)
    addresses = _public_addresses(hostname, port)
    last_error = None
    response = None
    connection = None

    for address in addresses:
        connection = _PinnedConnection(hostname, port, address, REQUEST_TIMEOUT, scheme == 'https')
        try:
            connection.putrequest('GET', target, skip_host=True, skip_accept_encoding=True)
            display_host = '[' + hostname + ']' if ':' in hostname else hostname
            if port != (443 if scheme == 'https' else 80):
                display_host += ':' + str(port)
            connection.putheader('Host', display_host)
            connection.putheader('User-Agent', 'FEEDValidator-OpenGraph/1.0 (+%s/)' % SITE_URL)
            connection.putheader('Accept', 'text/html,application/xhtml+xml;q=0.9')
            connection.putheader('Accept-Encoding', 'identity')
            connection.putheader('Connection', 'close')
            connection.endheaders()
            response = connection.getresponse()
            break
        except (OSError, http.client.HTTPException, ssl.SSLError) as error:
            last_error = error
            connection.close()
            connection = None

    if response is None:
        if connection:
            connection.close()
        raise OpenGraphError('Не удалось подключиться к сайту: ' + str(last_error or 'ошибка соединения'))

    try:
        if response.status in (301, 302, 303, 307, 308):
            location = response.getheader('Location')
            if not location:
                raise OpenGraphError('Сайт перенаправляет запрос без адреса назначения.')
            return 'redirect', urljoin(normalized, location), None
        if response.status < 200 or response.status >= 300:
            raise OpenGraphError('Сайт вернул HTTP ' + str(response.status) + '.')

        content_type = response.getheader('Content-Type', '').split(';', 1)[0].strip().lower()
        if content_type not in ('text/html', 'application/xhtml+xml'):
            raise OpenGraphError('По этому адресу получена не HTML-страница.')

        content_length = response.getheader('Content-Length')
        if content_length:
            try:
                if int(content_length) > MAX_PAGE_SIZE:
                    raise OpenGraphError('HTML-страница больше допустимого лимита 2 МБ.')
            except ValueError:
                pass

        try:
            data = response.read(MAX_PAGE_SIZE + 1)
        except (OSError, http.client.HTTPException, ssl.SSLError) as error:
            raise OpenGraphError('Не удалось полностью загрузить HTML-страницу: ' + str(error))
        if len(data) > MAX_PAGE_SIZE:
            raise OpenGraphError('HTML-страница больше допустимого лимита 2 МБ.')
        charset = response.headers.get_content_charset() or 'utf-8'
        try:
            document = data.decode(charset, errors='replace')
        except LookupError:
            document = data.decode('utf-8', errors='replace')
        return 'document', normalized, document
    finally:
        connection.close()


def validate_page_url(url):
    normalized, _, _, _, _ = _normalise_url(url)
    return normalized


def _validate_tags(tags, final_url, canonical, twitter):
    issues = []

    def add(level, tag, message):
        issues.append({'level': level, 'tag': tag, 'message': message})

    required = ('og:title', 'og:type', 'og:url', 'og:image')
    for key in required:
        values = [value for value in tags.get(key, []) if value]
        if not values:
            add('error', key, 'Обязательный тег отсутствует или пуст.')
    if not [value for value in tags.get('og:description', []) if value]:
        add('warning', 'og:description', 'Добавьте краткое описание страницы.')

    for key, values in tags.items():
        nonempty = [value for value in values if value]
        if len(nonempty) > 1:
            add('warning', key, 'Тег указан несколько раз; оставьте одно значение.')

    title = next(iter(tags.get('og:title', [])), '').strip()
    description = next(iter(tags.get('og:description', [])), '').strip()
    if title and len(title) > 60:
        add('warning', 'og:title', 'Заголовок длиннее рекомендуемых 60 символов.')
    if description and len(description) > 155:
        add('warning', 'og:description', 'Описание длиннее рекомендуемых 155 символов.')

    for key in ('og:url', 'og:image'):
        value = next(iter(tags.get(key, [])), '').strip()
        if value:
            try:
                parsed = urlsplit(value)
                if parsed.scheme not in ('http', 'https') or not parsed.hostname:
                    raise ValueError()
                parsed.port
            except ValueError:
                add('error', key, 'Значение должно быть полным абсолютным URL с http:// или https://.')
            else:
                if key == 'og:image' and parsed.scheme == 'http':
                    add('warning', key, 'Для изображения предпочтителен защищённый HTTPS URL.')

    if canonical:
        absolute_canonical = urljoin(final_url, canonical)
        og_url = next(iter(tags.get('og:url', [])), '').strip()
        if og_url and absolute_canonical.rstrip('/') != og_url.rstrip('/'):
            add('warning', 'og:url', 'og:url отличается от canonical URL страницы.')
    if not any(tags.get('og:image:alt', [])):
        add('warning', 'og:image:alt', 'Добавьте альтернативное описание изображения.')
    if not any(twitter.get('twitter:card', [])):
        add('warning', 'twitter:card', 'Добавьте twitter:card для предпросмотра в X.')
    return issues


def inspect_url(url):
    current = validate_page_url(url)
    for redirect_number in range(MAX_REDIRECTS + 1):
        result, target, content = _fetch_once(current)
        if result == 'redirect':
            if redirect_number == MAX_REDIRECTS:
                raise OpenGraphError('Сайт перенаправляет слишком много раз.')
            current = urljoin(current, target)
            validate_page_url(current)
            continue
        parser = MetaParser()
        parser.feed(content)
        parser.close()

        tags = parser.open_graph
        title = next(iter(tags.get('og:title', [])), '') or ' '.join(' '.join(parser.title_parts).split())
        description = next(iter(tags.get('og:description', [])), '') or parser.description
        image = next(iter(tags.get('og:image', [])), '')
        if image:
            image = urljoin(current, image)
        return {
            'url': current,
            'title': title,
            'description': description,
            'image': image,
            'canonical': urljoin(current, parser.canonical) if parser.canonical else '',
            'open_graph': tags,
            'twitter': parser.twitter,
            'issues': _validate_tags(tags, current, parser.canonical, parser.twitter)
        }
    raise OpenGraphError('Не удалось загрузить страницу.')
