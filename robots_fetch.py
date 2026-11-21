# -*- coding: utf-8 -*-
"""Загрузка robots.txt по адресу сайта (проверка и разбор выполняются в браузере)."""
from urllib.parse import urlsplit

import fv_net

MAX_BYTES = 524288


def fetch_robots(raw_url):
    url = fv_net.normalise_url(raw_url)
    parts = urlsplit(url)
    if not parts.path.lower().endswith('/robots.txt'):
        url = '%s://%s/robots.txt' % (parts.scheme, parts.netloc)
    result = fv_net.fetch(url, max_bytes=MAX_BYTES, accept='text/plain,*/*;q=0.5')
    text = fv_net.decode_body(result) if result['status'] == 200 else ''
    return {
        'url': url,
        'final_url': result['final_url'],
        'status': result['status'],
        'reason': result['reason'],
        'content_type': result['headers'].get('content-type', ''),
        'truncated': result['truncated'],
        'redirect_count': len(result['redirects']),
        'text': text,
    }
