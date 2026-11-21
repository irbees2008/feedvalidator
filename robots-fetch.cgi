#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
import sys

from fv_cgi import run
from fv_net import NetError
from robots_fetch import fetch_robots


sys.stdout.reconfigure(encoding='utf-8')

run(lambda form: fetch_robots(form.get('url', '')), errors=(NetError,),
    failure_message='Внутренняя ошибка при загрузке robots.txt.')
