#!/usr/bin/env python3
"""Build the Russian documentation hub and diagnostic-message index."""
import html
import json
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'docs-index-header.html')
FOOTER = os.path.join(HERE, 'docs-index-footer.html')
OUT = os.path.join(ROOT, 'docs', 'index.html')

GROUP_TITLES = {
    'Проверить': 'Проверки сайта и SEO',
    'Кодирование': 'Кодирование и форматирование',
    'Генераторы': 'Генераторы и редакторы',
    'Утилиты': 'Утилиты',
    'NGCMS': 'Инструменты NGCMS',
}
MESSAGE_SECTIONS = (
    ('error', 'Ошибки'),
    ('warning', 'Предупреждения'),
    ('info', 'Информация'),
)


def message_title(path):
    root = ET.parse(path).getroot()
    for node in root.iter():
        if node.attrib.get('id') == 'message':
            return ' '.join(''.join(node.itertext()).split())
    raise ValueError('Не найден заголовок сообщения: ' + path)


def diagnostics():
    result = []
    for kind, title in MESSAGE_SECTIONS:
        folder = os.path.join(ROOT, 'docs-xml', kind)
        messages = []
        for filename in os.listdir(folder):
            name, ext = os.path.splitext(filename)
            if ext.lower() != '.xml':
                continue
            label = message_title(os.path.join(folder, filename))
            messages.append((name, label))
        messages.sort(key=lambda item: item[0].lower())
        result.append((kind, title, messages))
    return result


def render_tools():
    with open(os.path.join(ROOT, 'templates', 'partials', 'menu.json'), encoding='utf-8-sig') as source:
        menu = json.load(source)
    groups = []
    grouped = {}
    for item in menu:
        group = item.get('group')
        if group and item.get('path'):
            grouped.setdefault(group, []).append(item)

    for group, items in grouped.items():
        title = GROUP_TITLES.get(group, group)
        parts = [
            '<section class="fv-doc-tools-group">',
            '<h3>%s</h3>' % html.escape(title),
            '<ul class="fv-doc-tools-list">',
        ]
        for item in items:
            path = '../' + item['path']
            label = item.get('brand') or item['label']
            desc = item.get('desc', '')
            parts.append(
                '<li><a href="%s">%s</a><span>%s</span></li>' % (
                    html.escape(path, quote=True),
                    html.escape(label),
                    html.escape(desc),
                )
            )
        parts.extend(['</ul>', '</section>'])
        groups.append('\n'.join(parts))
    return '\n'.join(groups)


def render_diagnostics(all_sections):
    output = []
    total = sum(len(items) for _, _, items in all_sections)
    output.append(
        '<p class="fv-doc-count">В справочнике %d описаний. Названия сохранены в оригинале, '
        'как в отчёте валидатора, чтобы их было проще найти.</p>' % total
    )
    output.append(
        '<label class="fv-doc-search-label" for="docs-search">Найти сообщение</label>'
        '<input class="form-control fv-doc-search" id="docs-search" type="search" '
        'placeholder="Введите текст сообщения, например HTTP Error" autocomplete="off">'
    )
    output.append('<p id="docs-search-status" class="fv-doc-count" aria-live="polite"></p>')
    for kind, title, messages in all_sections:
        output.append(
            '<details class="fv-doc-details" id="docs-%s" data-doc-section>' % kind
        )
        output.append(
            '<summary>%s <span>(%d)</span></summary>' % (title, len(messages))
        )
        output.append('<ul class="fv-doc-message-list">')
        for name, label in messages:
            searchable = (name + ' ' + label).lower()
            output.append(
                '<li data-doc-message data-search="%s"><a href="%s/%s.html">%s</a></li>' % (
                    html.escape(searchable, quote=True),
                    kind,
                    html.escape(name, quote=True),
                    html.escape(label),
                )
            )
        output.append('</ul></details>')
    output.append('<script src="../js/docs-search.js"></script>')
    return '\n'.join(output)


def main():
    with open(SOURCE, encoding='utf-8') as header:
        content = header.read()
    sections = diagnostics()
    content = content.replace('{{TOOLS}}', render_tools())
    content = content.replace('{{DIAGNOSTICS}}', render_diagnostics(sections))
    with open(FOOTER, encoding='utf-8') as footer:
        content += footer.read()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as target:
        target.write(content)
    with open(os.path.join(ROOT, 'templates', 'partials', 'menu.json'), encoding='utf-8-sig') as source:
        tool_count = sum(1 for item in json.load(source) if item.get('group'))
    print('Создан индекс документации: %d инструментов, %d сообщений' % (
        tool_count,
        sum(len(items) for _, _, items in sections),
    ))


if __name__ == '__main__':
    main()
