#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
import sys

from fv_cgi import run
from php_compat import PhpCompatError, MAX_CODE_BYTES, check_code


sys.stdout.reconfigure(encoding='utf-8')

run(lambda form: check_code(form.get('code', ''), form.get('target', '')),
    errors=(PhpCompatError,), failure_message='Внутренняя ошибка при проверке PHP-кода.',
    max_bytes=MAX_CODE_BYTES * 3 + 1024)
