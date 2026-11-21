"""Безопасная обработка необработанных исключений в CGI.

Подробности (трассировка, пути, значения переменных) пишутся только в stderr,
то есть в журнал ошибок веб-сервера. Посетитель видит нейтральную страницу.
Режим отладки включается переменной окружения FV_DEBUG=1 (только для разработки).
"""
import os
import sys
import traceback

_PAGE = ('<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
         '<meta name="robots" content="noindex"><title>Ошибка сервера</title></head>'
         '<body><h1>Внутренняя ошибка сервера</h1>'
         '<p>Не удалось обработать запрос. Попробуйте позже.</p></body></html>')


def _hook(exc_type, exc, tb):
    try:
        traceback.print_exception(exc_type, exc, tb, file=sys.stderr)
        sys.stderr.flush()
    except Exception:
        pass
    try:
        out = getattr(sys.stdout, 'buffer', None) or sys.stdout
        data = ('Status: 500 Internal Server Error\r\nContent-Type: text/html; charset=utf-8\r\n'
                'Cache-Control: no-store\r\n\r\n' + _PAGE).encode('utf-8')
        out.write(data)
        out.flush()
    except Exception:
        pass


def enable():
    if os.environ.get('FV_DEBUG') == '1':
        import cgitb
        cgitb.enable()
    else:
        sys.excepthook = _hook
