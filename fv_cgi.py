# -*- coding: utf-8 -*-
"""Общие функции для CGI-обработчиков инструментов, отвечающих в формате JSON."""
import hashlib
import json
import os
import sys
import tempfile
import time
import traceback
from urllib.parse import parse_qs

MAX_FORM_BYTES = 8192


def respond(status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    out = sys.stdout.buffer
    out.write(('Status: ' + status + '\r\n').encode('ascii'))
    out.write(b'Content-Type: application/json; charset=utf-8\r\n')
    out.write(b'Cache-Control: no-store\r\n')
    out.write(b'X-Content-Type-Options: nosniff\r\n')
    out.write(('Content-Length: ' + str(len(body)) + '\r\n\r\n').encode('ascii'))
    out.write(body)
    out.flush()


def read_form(max_bytes=MAX_FORM_BYTES):
    """Читает POST-форму (application/x-www-form-urlencoded). Возвращает словарь строк.

    При неверном методе, размере или кодировке сразу отправляет ответ и возвращает None.
    """
    if os.environ.get('REQUEST_METHOD', '').upper() != 'POST':
        respond('405 Method Not Allowed', {'error': 'Используйте POST-запрос.'})
        return None
    try:
        length = int(os.environ.get('CONTENT_LENGTH', '0'))
    except ValueError:
        length = 0
    if length < 1 or length > max_bytes:
        respond('400 Bad Request', {'error': 'Некорректный размер запроса.'})
        return None
    try:
        raw = sys.stdin.buffer.read(length).decode('utf-8', errors='strict')
    except UnicodeDecodeError:
        respond('400 Bad Request', {'error': 'Запрос должен быть в кодировке UTF-8.'})
        return None
    return {key: values[0] for key, values in parse_qs(raw).items()}


RATE_LIMIT = 60
RATE_WINDOW = 60


def rate_limited(limit=None, window=None):
    """Скользящее окно по IP: не больше limit запросов за window секунд.

    Счётчики лежат во временном каталоге. Сбой хранилища не блокирует запросы.
    """
    limit = limit or int(os.environ.get('FV_RATE_LIMIT', RATE_LIMIT))
    window = window or RATE_WINDOW
    ip = os.environ.get('REMOTE_ADDR', '')
    if not ip:
        return False
    try:
        name = hashlib.sha256(ip.encode('utf-8')).hexdigest()[:32]
        folder = os.path.join(tempfile.gettempdir(), 'fv_rate')
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name)
        now = time.time()
        try:
            with open(path, 'r') as handle:
                stamps = [float(x) for x in handle.read().split() if now - float(x) < window]
        except (OSError, ValueError):
            stamps = []
        if len(stamps) >= limit:
            return True
        stamps.append(now)
        with open(path, 'w') as handle:
            handle.write(' '.join('%.2f' % x for x in stamps))
    except OSError:
        return False
    return False


def run(handler, errors=(), failure_message='Внутренняя ошибка при обработке запроса.', max_bytes=MAX_FORM_BYTES):
    """Вызывает handler(form) и отправляет результат как JSON.

    Исключения из errors превращаются в ответ 400 с их текстом. Остальные сбои
    пишутся в stderr, посетитель получает нейтральное сообщение.
    """
    try:
        if os.environ.get('REQUEST_METHOD', '').upper() == 'POST' and rate_limited():
            respond('429 Too Many Requests', {'error': 'Слишком много запросов. Повторите через минуту.'})
            return
        form = read_form(max_bytes)
        if form is None:
            return
        try:
            respond('200 OK', handler(form))
        except errors as error:
            respond('400 Bad Request', {'error': str(error)})
    except Exception:
        traceback.print_exc(file=sys.stderr)
        respond('500 Internal Server Error', {'error': failure_message})
