"""Адрес сайта берётся из site.json (поле "url") или переменной окружения FV_SITE_URL."""
import json
import os

DEFAULT_SITE_URL = 'https://lab.ngcms.org'
_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site.json')


def normalize(url):
    url = (url or '').strip().rstrip('/')
    if not url.lower().startswith(('http://', 'https://')):
        raise ValueError('site url must start with http:// or https://: %r' % url)
    return url


def load_site_url():
    value = os.environ.get('FV_SITE_URL')
    if not value:
        try:
            with open(_CONFIG_FILE, encoding='utf-8-sig') as f:
                value = json.load(f).get('url')
        except (OSError, ValueError):
            value = None
    try:
        return normalize(value or DEFAULT_SITE_URL)
    except ValueError:
        return DEFAULT_SITE_URL


SITE_URL = load_site_url()
