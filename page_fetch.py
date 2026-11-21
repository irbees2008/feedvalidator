# -*- coding: utf-8 -*-
"""Загрузка HTML-страницы по адресу (разбор выполняется в браузере)."""
import fv_net

MAX_BYTES = 1048576


def fetch_page(raw_url):
    url = fv_net.normalise_url(raw_url)
    result = fv_net.fetch(url, max_bytes=MAX_BYTES, accept='text/html,application/xhtml+xml,*/*;q=0.5')
    text = fv_net.decode_body(result) if result['status'] == 200 else ''
    return {
        'url': url,
        'final_url': result['final_url'],
        'status': result['status'],
        'reason': result['reason'],
        'content_type': result['headers'].get('content-type', ''),
        'truncated': result['truncated'],
        'text': text,
    }
