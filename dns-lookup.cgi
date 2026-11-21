#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
import sys

from dns_lookup import DnsError, lookup
from fv_cgi import run


sys.stdout.reconfigure(encoding='utf-8')

run(lambda form: lookup(form.get('name', ''), form.get('type', 'A'), form.get('resolver', 'cloudflare')),
    errors=(DnsError,), failure_message='Внутренняя ошибка при DNS-запросе.')
