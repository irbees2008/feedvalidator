#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
import sys

from fv_cgi import run
from open_graph import OpenGraphError, inspect_url


sys.stdout.reconfigure(encoding='utf-8')

run(lambda form: inspect_url(form.get('url', '')), errors=(OpenGraphError,),
    failure_message='Внутренняя ошибка при проверке страницы.')
