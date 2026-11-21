#!/usr/bin/env python3
"""Generate styled HTML help pages from validator diagnostic XML."""
import html
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)
from site_config import SITE_URL

ALLOWED_TAGS = {
    'a', 'b', 'blockquote', 'br', 'cite', 'code', 'dd', 'del', 'div', 'dl', 'dt',
    'em', 'i', 'ins', 'li', 'ol', 'p', 'pre', 'q', 'samp', 'span', 'strong', 'ul',
}
ALLOWED_ATTRIBUTES = {'class', 'href', 'title'}


def local_name(tag):
    return tag.rsplit('}', 1)[-1]


def safe_href(value):
    value = value.strip()
    if value.startswith(('https://', 'http://', 'mailto:', '../', './', '/', '#')):
        return value
    return ''


def render_node(node):
    tag = local_name(node.tag)
    if tag not in ALLOWED_TAGS:
        body = html.escape(node.text or '', quote=False)
        for child in node:
            body += render_node(child)
            body += html.escape(child.tail or '', quote=False)
        return body

    attrs = []
    for key, value in node.attrib.items():
        name = local_name(key)
        if name not in ALLOWED_ATTRIBUTES:
            continue
        if name == 'href':
            value = safe_href(value)
            if not value:
                continue
        attrs.append(' %s="%s"' % (name, html.escape(value, quote=True)))

    opening = '<%s%s>' % (tag, ''.join(attrs))
    if tag == 'br':
        return opening
    body = html.escape(node.text or '', quote=False)
    for child in node:
        body += render_node(child)
        body += html.escape(child.tail or '', quote=False)
    return opening + body + '</%s>' % tag


def find_section(root, section):
    for node in root.iter():
        if node.attrib.get('id') == section:
            return ''.join(render_node(child) for child in node)
    return ''


def plain_text(markup):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', markup)).split())


def build(source, target, template):
    root = ET.parse(source).getroot()
    message = find_section(root, 'message')
    if not message:
        raise ValueError('В XML нет раздела message: ' + source)
    title = plain_text(message)
    category = os.path.basename(os.path.dirname(source))
    name = os.path.splitext(os.path.basename(source))[0]
    canonical = '%s/docs/%s/%s.html' % (SITE_URL.rstrip('/'), category, name)
    page = template
    page = page.replace('{{TITLE}}', html.escape(title))
    page = page.replace('{{CANONICAL}}', html.escape(canonical, quote=True))
    page = page.replace('{{MESSAGE}}', message)
    page = page.replace('{{EXPLANATION}}', find_section(root, 'explanation') or '<p>Дополнительное пояснение не указано.</p>')
    page = page.replace('{{SOLUTION}}', find_section(root, 'solution') or '<p>Для этого сообщения отдельная рекомендация не указана. Сверьте элемент с требованиями соответствующего формата.</p>')
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, 'w', encoding='utf-8', newline='\n') as output:
        output.write(page)


def main(argv):
    if len(argv) < 4:
        raise SystemExit('Использование: build-html-docs.py template.html каталог-документации исходный.xml [...]')
    template_path = os.path.abspath(argv[1])
    target_root = os.path.abspath(argv[2])
    with open(template_path, encoding='utf-8') as source:
        template = source.read()
    for source_path in argv[3:]:
        source_path = os.path.abspath(source_path)
        if not source_path.lower().endswith('.xml') or not os.path.isfile(source_path):
            continue
        category = os.path.basename(os.path.dirname(source_path))
        target = os.path.join(target_root, category, os.path.splitext(os.path.basename(source_path))[0] + '.html')
        build(source_path, target, template)


if __name__ == '__main__':
    main(sys.argv)
