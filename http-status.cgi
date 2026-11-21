#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
import sys

from fv_cgi import run
from fv_net import NetError
from http_status import check_url


sys.stdout.reconfigure(encoding='utf-8')

run(lambda form: check_url(form.get('url', ''), form.get('method', 'GET')), errors=(NetError,),
    failure_message='Внутренняя ошибка при проверке адреса.')
