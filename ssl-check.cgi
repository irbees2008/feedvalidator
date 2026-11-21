#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
import sys

from fv_cgi import run
from fv_net import NetError
from ssl_check import check_host


sys.stdout.reconfigure(encoding='utf-8')

run(lambda form: check_host(form.get('host', '')),
    errors=(NetError,), failure_message='Внутренняя ошибка при проверке SSL.')
