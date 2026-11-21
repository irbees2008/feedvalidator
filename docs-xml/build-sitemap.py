#!/usr/bin/env python3
"""Генерирует sitemap.xml в корне сайта: страницы инструментов и справка docs/."""
import os
import sys
from datetime import datetime, timezone
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)
from site_config import SITE_URL as SITE  # noqa: E402

PAGES = [
    ('/', 'index.html', 'weekly', '1.0'),
    ('/check.cgi', 'templates/index.tmpl', 'weekly', '0.9'),
    ('/base64.html', 'base64.html', 'monthly', '0.8'),
    ('/open-graph.html', 'open-graph.html', 'monthly', '0.8'),
    ('/favicon-generator.html', 'favicon-generator.html', 'monthly', '0.8'),
    ('/markdown-editor.html', 'markdown-editor.html', 'monthly', '0.8'),
    ('/url-encoder.html', 'url-encoder.html', 'monthly', '0.8'),
    ('/fancy-text.html', 'fancy-text.html', 'monthly', '0.8'),
    ('/image-to-pixel-art.html', 'image-to-pixel-art.html', 'monthly', '0.8'),
    ('/image-animation.html', 'image-animation.html', 'monthly', '0.8'),
    ('/pixel-art-maker.html', 'pixel-art-maker.html', 'monthly', '0.8'),
    ('/php-compat-checker.html', 'php-compat-checker.html', 'monthly', '0.8'),
    ('/plugin-checker.html', 'plugin-checker.html', 'monthly', '0.8'),
    ('/template-checker.html', 'template-checker.html', 'monthly', '0.8'),
    ('/twig-playground.html', 'twig-playground.html', 'monthly', '0.8'),
    ('/sql-analyzer.html', 'sql-analyzer.html', 'monthly', '0.8'),
    ('/bbcode-preview.html', 'bbcode-preview.html', 'monthly', '0.8'),
    ('/qr-code.html', 'qr-code.html', 'monthly', '0.8'),
    ('/image-compressor.html', 'image-compressor.html', 'monthly', '0.8'),
    ('/image-converter.html', 'image-converter.html', 'monthly', '0.8'),
    ('/fonts.html', 'fonts.html', 'monthly', '0.8'),
    ('/user-agent-parser.html', 'user-agent-parser.html', 'monthly', '0.8'),
    ('/cron-generator.html', 'cron-generator.html', 'monthly', '0.8'),
    ('/color-tools.html', 'color-tools.html', 'monthly', '0.8'),
    ('/timestamp-converter.html', 'timestamp-converter.html', 'monthly', '0.8'),
    ('/schema-validator.html', 'schema-validator.html', 'monthly', '0.8'),
    ('/ssl-checker.html', 'ssl-checker.html', 'monthly', '0.8'),
    ('/security-headers-checker.html', 'security-headers-checker.html', 'monthly', '0.8'),
    ('/regex-tester.html', 'regex-tester.html', 'monthly', '0.8'),
    ('/html-entities.html', 'html-entities.html', 'monthly', '0.8'),
    ('/jwt-decoder.html', 'jwt-decoder.html', 'monthly', '0.8'),
    ('/dns-lookup.html', 'dns-lookup.html', 'monthly', '0.8'),
    ('/sitemap-validator.html', 'sitemap-validator.html', 'monthly', '0.8'),
    ('/robots-txt-validator.html', 'robots-txt-validator.html', 'monthly', '0.8'),
    ('/http-status-checker.html', 'http-status-checker.html', 'monthly', '0.8'),
    ('/meta-tags-analyzer.html', 'meta-tags-analyzer.html', 'monthly', '0.8'),
    ('/json-formatter.html', 'json-formatter.html', 'monthly', '0.8'),
    ('/docs/', 'docs/index.html', 'monthly', '0.6'),
    ('/about.html', 'about.html', 'yearly', '0.4'),
    ('/terms.html', 'terms.html', 'yearly', '0.3'),
]


def lastmod(path):
    if not path:
        path = 'templates/index.tmpl'
    stamp = os.path.getmtime(os.path.join(ROOT, path))
    return datetime.fromtimestamp(stamp, timezone.utc).strftime('%Y-%m-%d')


def entries():
    for loc, path, freq, priority in PAGES:
        yield loc, lastmod(path), freq, priority
    for kind in ('error', 'warning', 'info', 'howto'):
        folder = os.path.join(ROOT, 'docs', kind)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if name.endswith('.html') and name != 'index.html':
                rel = 'docs/%s/%s' % (kind, name)
                yield '/' + rel, lastmod(rel), 'yearly', '0.5'


def main():
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, mod, freq, priority in entries():
        out.append('  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>'
                   % (escape(SITE + loc), mod, freq, priority))
    out.append('</urlset>')
    target = os.path.join(ROOT, 'sitemap.xml')
    with open(target, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')
    print('%s: %d URL' % (target, len(out) - 3))


if __name__ == '__main__':
    sys.exit(main())
