# -*- coding: utf-8 -*-
"""HTTP Status Checker: статус, цепочка перенаправлений, заголовки и время ответа."""
import fv_net

PROBE_BYTES = 262144
HEADER_LIMIT = 40
VALUE_LIMIT = 500


def check_url(raw_url, method='GET'):
    method = 'HEAD' if str(method).upper() == 'HEAD' else 'GET'
    url = fv_net.normalise_url(raw_url)
    result = fv_net.fetch(url, method=method, max_bytes=PROBE_BYTES, accept='*/*')
    headers = result['headers']
    length = headers.get('content-length')
    size = int(length) if length and length.isdigit() else len(result['body'])
    return {
        'url': url,
        'method': method,
        'final_url': result['final_url'],
        'status': result['status'],
        'reason': result['reason'],
        'ip': result['ip'],
        'elapsed_ms': result['elapsed_ms'],
        'https': result['final_url'].lower().startswith('https://'),
        'content_type': headers.get('content-type', ''),
        'size': size,
        'size_exact': bool(length and length.isdigit()) or not result['truncated'],
        'redirects': result['redirects'],
        'redirect_count': len(result['redirects']),
        'headers': [[k, v[:VALUE_LIMIT]] for k, v in list(headers.items())[:HEADER_LIMIT]],
    }
