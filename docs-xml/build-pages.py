#!/usr/bin/env python3
"""Подставляет общие шапку и меню подвала (templates/partials) в статические страницы.

Запуск:  python docs-xml/build-pages.py
Блоки между <!--fv:navbar-->...<!--/fv:navbar--> и <!--fv:footer-nav-->...<!--/fv:footer-nav-->
перезаписываются; при первом запуске маркеры расставляются вокруг существующей разметки.
Запускать после правки menu.json, navbar.html или footer-nav.html.
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)
import partials  # noqa: E402

PAGES = ['index.html', 'base64.html', 'open-graph.html', 'favicon-generator.html', 'markdown-editor.html',
         'fonts.html',
         'url-encoder.html', 'fancy-text.html', 'image-to-pixel-art.html', 'image-animation.html', 'pixel-art-maker.html', 'php-compat-checker.html', 'plugin-checker.html', 'template-checker.html', 'twig-playground.html', 'sql-analyzer.html', 'bbcode-preview.html', 'qr-code.html', 'image-compressor.html', 'image-converter.html', 'user-agent-parser.html', 'cron-generator.html', 'color-tools.html', 'timestamp-converter.html', 'schema-validator.html', 'ssl-checker.html', 'security-headers-checker.html', 'regex-tester.html', 'html-entities.html', 'jwt-decoder.html', 'dns-lookup.html', 'sitemap-validator.html', 'robots-txt-validator.html', 'http-status-checker.html', 'meta-tags-analyzer.html', 'json-formatter.html', 'about.html', 'terms.html', 'docs/index.html']
PAGES.extend(['docs/howto/declare_namespaces.html', 'docs/howto/install_and_run.html'])


def all_pages():
    pages = list(PAGES)
    for kind in ('error', 'warning', 'info'):
        folder = os.path.join(ROOT, 'docs', kind)
        if os.path.isdir(folder):
            pages.extend(os.path.join('docs', kind, name) for name in os.listdir(folder)
                         if name.endswith('.html'))
    return pages

BLOCKS = [
    ('navbar', re.compile(r'<div id="home" class="header-section.*?</nav>\s*</div>', re.S)),
    ('footer-nav', re.compile(r'<ul class="footer-navigation[^>]*>.*?</ul>', re.S)),
        ('tools', None),
    ]


def indent_block(text, indent):
    return '\n'.join((indent + line) if line.strip() else line for line in text.strip('\n').split('\n'))


def build(page):
    path = os.path.join(ROOT, page)
    with open(path, 'rb') as f:
        raw = f.read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    text = (raw[3:] if bom else raw).decode('utf-8')
    crlf = '\r\n' in text
    text = text.replace('\r\n', '\n')

    page_dir = os.path.dirname(page).replace('\\', '/')
    page_path = '' if page == 'index.html' else page.replace('\\', '/')
    if page_path == 'docs/index.html':
        page_path = 'docs/'
    renderers = {
        'navbar': partials.render_navbar(page_path, page_dir),
        'footer-nav': partials.render_footer_nav(page_path, page_dir),
        'tools': partials.render_tools(page_dir),
    }

    for name, pattern in BLOCKS:
        if name == 'tools' and '<!--fv:tools-->' not in text:
            continue
        marked = re.compile(r'(?P<indent>[ \t]*)<!--fv:%s-->.*?<!--/fv:%s-->' % (name, name), re.S)
        m = marked.search(text)
        if m is None:
            m = pattern.search(text)
            if m is None:
                raise SystemExit('%s: блок %s не найден' % (page, name))
            line_start = text.rfind('\n', 0, m.start()) + 1
            indent = text[line_start:m.start()]
            if indent.strip():
                indent = ''
            else:
                m = re.compile(re.escape(indent) + re.escape(m.group(0))).search(text, line_start)
        else:
            indent = m.group('indent')
        body = indent_block(renderers[name], indent)
        block = '%s<!--fv:%s-->\n%s\n%s<!--/fv:%s-->' % (indent, name, body, indent, name)
        text = text[:m.start()] + block + text[m.end():]

    if crlf:
        text = text.replace('\n', '\r\n')
    with open(path, 'wb') as f:
        f.write((b'\xef\xbb\xbf' if bom else b'') + text.encode('utf-8'))


def main():
    pages = all_pages()
    for page in pages:
        build(page)
    print('Обновлено страниц: %d' % len(pages))


if __name__ == '__main__':
    sys.exit(main())
