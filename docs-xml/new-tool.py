#!/usr/bin/env python3
"""Заготовка нового инструмента.

Запуск:  python docs-xml/new-tool.py slug "Название" "Описание для SEO" [--short "Пункт меню"]

Создаёт <slug>.html и js/<slug>.js, добавляет страницу в menu.json, build-pages.py,
apply-site-url.py, build-sitemap.py и запускает build-pages.py и apply-site-url.py.
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
HERE = os.path.join(ROOT, 'docs-xml')
sys.path.insert(0, ROOT)
from site_config import SITE_URL  # noqa: E402

PAGE = '''<!DOCTYPE html>
<html lang="ru" class="js">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>{title} онлайн — FEED Валидатор</title>
	<meta name="description" content="{desc}">
	<meta name="robots" content="index,follow,max-image-preview:large">
	<link rel="canonical" href="{url}">
	<meta name="theme-color" content="#1F65DB">
	<meta property="og:type" content="website">
	<meta property="og:site_name" content="FEED Валидатор">
	<meta property="og:locale" content="ru_RU">
	<meta property="og:title" content="{title} онлайн — FEED Валидатор">
	<meta property="og:description" content="{desc}">
	<meta property="og:url" content="{url}">
	<meta name="twitter:card" content="summary">
	<meta name="twitter:title" content="{title} онлайн — FEED Валидатор">
	<meta name="twitter:description" content="{desc}">
	<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebApplication","name":"{title}","url":"{url}","applicationCategory":"DeveloperApplication","operatingSystem":"Any","inLanguage":"ru","isPartOf":{{"@type":"WebSite","name":"FEED Валидатор","url":"{site}/"}},"offers":{{"@type":"Offer","price":"0","priceCurrency":"RUB"}}}}</script>
	<link rel="shortcut icon" href="favicon.ico">
	<link rel="stylesheet" href="assets/css/vendor.bundle.css">
	<link rel="stylesheet" href="assets/css/style.css?ver=131">
	<link rel="stylesheet" href="assets/css/theme.css?ver=131">
	<link rel="stylesheet" href="css/fv-theme.css">
</head>
<body>

	<!--fv:navbar-->
	<!--/fv:navbar-->

		<div class="header-content">
			<div class="container">
				<div class="row">
					<div class="col-md-8 col-md-offset-2 text-center">
						<div class="header-texts">
							<h1 class="wow fadeInUp" data-wow-duration=".5s">{title}</h1>
							<p class="lead wow fadeInUp" data-wow-duration=".5s" data-wow-delay=".3s">{desc}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="feature-boxes fv-panel-wrap fv-tool">
		<div class="container">
			<div class="row">
				<div class="col-md-12">
					<section class="fv-panel" id="{slug}-tool" aria-label="{title}">
						<div class="fv-tab-content">
							<div id="{slug}-error" class="fv-error" role="alert" hidden></div>
							<!-- Интерфейс инструмента -->
						</div>
					</section>
				</div>
			</div>
		</div>
	</div>

	<div class="footer-section section">
		<div class="container">
			<div class="row text-center">
				<div class="col-md-12">
					<!--fv:footer-nav-->
					<!--/fv:footer-nav-->
				</div>
			</div>
		</div>
	</div>

	<script src="assets/js/jquery.bundle.js"></script>
	<script src="assets/js/script.js"></script>
	<script src="js/fv-common.js"></script>
	<script src="js/{slug}.js"></script>
</body>
</html>
'''

JS = '''(function () {{
  'use strict';
  var error = document.getElementById('{slug}-error');
  // Помощники: FV.copyText, FV.download, FV.showError, FV.postForm, FV.debounce, FV.storage
  FV.clearError(error);
}})();
'''


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def patch(name, old, new):
    path = os.path.join(HERE, name)
    with open(path, encoding='utf-8', newline='') as fh:
        text = fh.read()
    if old not in text:
        sys.exit('Не найдено место вставки в %s: %s' % (name, old))
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text.replace(old, new, 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slug')
    ap.add_argument('title')
    ap.add_argument('description')
    ap.add_argument('--short')
    ap.add_argument('--brand', help='название в логотипе, например "Favicon Генератор"')
    ap.add_argument('--group', default='Генераторы', help='группа выпадающего меню')
    args = ap.parse_args()
    if not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', args.slug):
        sys.exit('slug: только латиница, цифры и дефисы')
    page = args.slug + '.html'
    if os.path.exists(os.path.join(ROOT, page)):
        sys.exit('Страница уже существует: ' + page)

    write(os.path.join(ROOT, page), PAGE.format(
        slug=args.slug, title=args.title, desc=args.description,
        url='%s/%s' % (SITE_URL, page), site=SITE_URL))
    write(os.path.join(ROOT, 'js', args.slug + '.js'), JS.format(slug=args.slug))

    menu_path = os.path.join(ROOT, 'templates', 'partials', 'menu.json')
    with open(menu_path, encoding='utf-8') as fh:
        menu = json.load(fh)
    same = [i for i, m in enumerate(menu) if m.get('group') == args.group]
    index = same[-1] + 1 if same else next((i for i, m in enumerate(menu) if not m.get('nav')), len(menu))
    menu.insert(index, {'label': args.short or args.title, 'path': page, 'nav': True, 'group': args.group,
                        'brand': args.brand or args.title, 'desc': args.description})
    with open(menu_path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('[\n' + ',\n'.join('  ' + json.dumps(m, ensure_ascii=False) for m in menu) + '\n]\n')

    patch('build-pages.py', "'fancy-text.html', ", "'fancy-text.html', '%s', " % page)
    patch('apply-site-url.py', "'fancy-text.html', ", "'fancy-text.html', '%s', " % page)
    patch('build-sitemap.py', "('/fancy-text.html', 'fancy-text.html', 'monthly', '0.8'),",
          "('/fancy-text.html', 'fancy-text.html', 'monthly', '0.8'),\n"
          "    ('/%s', '%s', 'monthly', '0.8')," % (page, page))

    for script in ('build-pages.py', 'apply-site-url.py', 'build-sitemap.py'):
        subprocess.check_call([sys.executable, os.path.join(HERE, script)])
    print('Готово: %s, js/%s.js' % (page, args.slug))


if __name__ == '__main__':
    main()
