#!/usr/bin/env python3
"""Прописывает адрес сайта из site.json во все статические страницы, robots.txt и sitemap.xml.

Запуск:  python docs-xml/apply-site-url.py [https://example.com]
Если адрес передан аргументом, он сначала сохраняется в site.json.
Скрипт можно запускать повторно: старый адрес заменяется на актуальный.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)
import site_config  # noqa: E402

CONFIG = os.path.join(ROOT, 'site.json')
# Строки, где адрес сайта — это canonical, og:url или JSON-LD.
LINE = re.compile(r'rel="canonical"|property="og:url"|application/ld\+json')
URL = re.compile(r'https?://(?!schema\.org)[^"/\s<]+')
PAGES = ['index.html', 'base64.html', 'open-graph.html', 'favicon-generator.html', 'markdown-editor.html',
         'fonts.html',
         'url-encoder.html', 'fancy-text.html', 'image-to-pixel-art.html', 'image-animation.html', 'pixel-art-maker.html', 'php-compat-checker.html', 'plugin-checker.html', 'template-checker.html', 'twig-playground.html', 'sql-analyzer.html', 'bbcode-preview.html', 'qr-code.html', 'image-compressor.html', 'image-converter.html', 'user-agent-parser.html', 'cron-generator.html', 'color-tools.html', 'timestamp-converter.html', 'schema-validator.html', 'ssl-checker.html', 'security-headers-checker.html', 'regex-tester.html', 'html-entities.html', 'jwt-decoder.html', 'dns-lookup.html', 'sitemap-validator.html', 'robots-txt-validator.html', 'http-status-checker.html', 'meta-tags-analyzer.html', 'json-formatter.html', 'about.html', 'terms.html', os.path.join('docs', 'index.html')]
PAGES.extend([
    os.path.join('docs', 'howto', 'declare_namespaces.html'),
    os.path.join('docs', 'howto', 'install_and_run.html'),
])


def rewrite(path, transform):
    with open(path, 'rb') as f:
        raw = f.read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    text = raw[3:].decode('utf-8') if bom else raw.decode('utf-8')
    new = transform(text)
    if new == text:
        return False
    with open(path, 'wb') as f:
        f.write((b'\xef\xbb\xbf' if bom else b'') + new.encode('utf-8'))
    return True


def main():
    if len(sys.argv) > 1:
        url = site_config.normalize(sys.argv[1])
        with open(CONFIG, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'url': url}, f, indent=2)
            f.write('\n')
    else:
        url = site_config.load_site_url()

    def pages(text):
        return ''.join(URL.sub(url, line) if LINE.search(line) else line for line in text.splitlines(True))

    def robots(text):
        return re.sub(r'(?m)^Sitemap:.*$', 'Sitemap: %s/sitemap.xml' % url, text)

    changed = [p for p in PAGES if os.path.exists(os.path.join(ROOT, p)) and rewrite(os.path.join(ROOT, p), pages)]
    if rewrite(os.path.join(ROOT, 'robots.txt'), robots):
        changed.append('robots.txt')
    subprocess.check_call([sys.executable, os.path.join(ROOT, 'docs-xml', 'build-sitemap.py')])
    print('Адрес сайта: %s; обновлено файлов: %d' % (url, len(changed)))


if __name__ == '__main__':
    sys.exit(main())
