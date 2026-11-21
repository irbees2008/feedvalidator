#!/usr/bin/env python3
"""Build a static catalog of font files from the site's fonts directory."""
import json
import os
from urllib.parse import quote

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FONT_DIR = os.path.join(ROOT, 'fonts')
CATALOG = os.path.join(FONT_DIR, 'catalog.txt')
FORMATS = {'.eot', '.otf', '.svg', '.ttf', '.woff', '.woff2'}


def build_catalog():
    os.makedirs(FONT_DIR, exist_ok=True)
    entries = []
    for current, dirs, filenames in os.walk(FONT_DIR, followlinks=False):
        dirs[:] = [name for name in dirs if not os.path.islink(os.path.join(current, name))]
        for filename in filenames:
            path = os.path.join(current, filename)
            extension = os.path.splitext(filename)[1].lower()
            if extension not in FORMATS or os.path.islink(path):
                continue
            relative = os.path.relpath(path, ROOT).replace(os.sep, '/')
            url = '/' + '/'.join(quote(part, safe='') for part in relative.split('/'))
            entries.append({
                'name': os.path.relpath(path, FONT_DIR).replace(os.sep, '/'),
                'url': url,
                'format': extension[1:],
                'size': os.path.getsize(path),
            })
    entries.sort(key=lambda item: item['name'].casefold())
    with open(CATALOG, 'w', encoding='utf-8', newline='\n') as output:
        json.dump({'fonts': entries}, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print('Каталог шрифтов: %d файлов' % len(entries))


if __name__ == '__main__':
    build_catalog()
