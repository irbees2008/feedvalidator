#!C:\OSPanell\modules\python\python.exe
print("Content-type: text/plain\r\n\r\n", end=' ')

from email.utils import formatdate
import time

print("Current time:\n")
print("  RFC 2822: " + formatdate(usegmt=True))
print("  RFC 3339: " + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
