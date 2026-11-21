"""Общие шапка и подвал-навигация: единый источник для статических страниц и CGI.

Меню — templates/partials/menu.json, разметка — templates/partials/navbar.html
и footer-nav.html. Ссылки считаются относительно каталога страницы.
"""
import html
import json
import os
import posixpath

ROOT = os.path.dirname(os.path.abspath(__file__))
PARTIALS = os.path.join(ROOT, 'templates', 'partials')


def _read(name):
    with open(os.path.join(PARTIALS, name), encoding='utf-8-sig') as f:
        return f.read()


def menu():
    return json.loads(_read('menu.json'))


def href(path, page_dir=''):
    """Относительная ссылка на path (корневой путь сайта) со страницы из каталога page_dir."""
    base = page_dir.strip('/') or '.'
    if path == '' or path.endswith('/'):
        rel = posixpath.relpath(path.rstrip('/') or '.', base)
        return './' if rel == '.' else rel + '/'
    return posixpath.relpath(path, base)


def _items(entries, page_path, page_dir, tab=''):
    lines = []
    for item in entries:
        link = html.escape(href(item['path'], page_dir), quote=True)
        label = html.escape(item['label'])
        if item['path'] == page_path:
            lines.append('%s<li class="active"><a href="%s" aria-current="page">%s</a></li>' % (tab, link, label))
        else:
            lines.append('%s<li><a href="%s">%s</a></li>' % (tab, link, label))
    return '\n'.join(lines)


def _nav_items(entries, page_path, page_dir):
    """Пункты верхнего меню: элементы с полем group собираются в выпадающие списки."""
    out, groups = [], {}
    for item in entries:
        name = item.get('group')
        if not name:
            out.append(_items([item], page_path, page_dir))
            continue
        if name not in groups:
            groups[name] = []
            out.append(groups[name])
        groups[name].append(item)
    lines = []
    for entry in out:
        if isinstance(entry, str):
            lines.append(entry)
            continue
        active = any(i['path'] == page_path for i in entry)
        lines.append('<li class="dropdown%s">' % (' active' if active else ''))
        lines.append('<a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" '
                     'aria-haspopup="true" aria-expanded="false">%s</a>' % html.escape(entry[0]['group']))
        lines.append('<ul class="dropdown-menu">')
        lines.append(_items(entry, page_path, page_dir))
        lines.append('</ul>')
        lines.append('</li>')
    return '\n'.join(lines)


DEFAULT_BRAND = 'FEED Валидатор'
LOGO_CLASSES = ('lg-f', 'lg-e1', 'lg-e2', 'lg-d')


def render_logo(brand):
    """Первое слово делится на четыре цветные части (Favicon -> Fa|vi|co|n), остальное — обычным текстом."""
    word, _, rest = brand.strip().partition(' ')
    size, extra = divmod(len(word), 4)
    parts, pos = [], 0
    for index, css in enumerate(LOGO_CLASSES):
        length = size + (1 if index < extra else 0)
        if length:
            parts.append('<span class="%s">%s</span>' % (css, html.escape(word[pos:pos + length])))
        pos += length
    tail = ' ' + html.escape(rest) if rest else ''
    return '<span class="lg-hash">#</span> ' + ''.join(parts) + tail


HOME_BRAND = 'Lab.NGcms'


def page_brand(page_path):
    if page_path == '':
        return HOME_BRAND
    for item in menu():
        if item['path'] == page_path and item.get('brand'):
            return item['brand']
    return DEFAULT_BRAND


def render_navbar(page_path='', page_dir=''):
    items = [i for i in menu() if i.get('nav')]
    return (_read('navbar.html')
            .replace('{{home}}', href('', page_dir))
            .replace('{{logo}}', render_logo(page_brand(page_path)))
            .replace('{{items}}', _nav_items(items, page_path, page_dir)))


def groups():
    return json.loads(_read('groups.json'))


def render_tools(page_dir=''):
    """Каталог инструментов по группам меню: карточка с описанием и кнопкой перехода."""
    entries = menu()
    out = []
    for group in groups():
        out.append('<div class="fv-catalog-group">')
        out.append('<div class="fv-catalog-head"><h2><i class="fa %s" aria-hidden="true"></i> %s</h2><p>%s</p></div>' % (
            html.escape(group['icon']), html.escape(group['name']), html.escape(group['desc'])))
        out.append('<div class="row fv-catalog-row">')
        for item in entries:
            if item.get('group') != group['name']:
                continue
            link = html.escape(href(item['path'], page_dir), quote=True)
            out.append('<div class="col-md-4 col-sm-6">')
            out.append('<article class="fv-tool-card">')
            out.append('<h3><a href="%s">%s</a></h3>' % (link, html.escape(item.get('brand') or item['label'])))
            out.append('<p>%s</p>' % html.escape(item.get('desc', '')))
            out.append('<a class="fv-btn" href="%s">Открыть</a>' % link)
            out.append('</article>')
            out.append('</div>')
        out.append('</div>')
        out.append('</div>')
    return '\n'.join(out)


def render_footer_nav(page_path='', page_dir=''):
    return _read('footer-nav.html').replace('{{items}}', _items([i for i in menu() if not i.get('nav')], None, page_dir))
