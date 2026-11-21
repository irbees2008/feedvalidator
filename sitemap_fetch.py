# -*- coding: utf-8 -*-
"""Загрузка Sitemap по адресу (разбор и проверки выполняются в браузере)."""
import fv_net

MAX_BYTES = 2097152


def fetch_sitemap(raw_url):
    url = fv_net.normalise_url(raw_url)
    result = fv_net.fetch(url, max_bytes=MAX_BYTES, accept='application/xml,text/xml,*/*;q=0.5')
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
