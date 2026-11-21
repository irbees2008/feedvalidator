#!/usr/bin/python
import os
import sys
import unittest
from os.path import dirname, join

curdir = os.path.abspath(os.path.dirname(sys.argv[0]))
srcdir = os.path.split(curdir)[0]
if srcdir not in sys.path:
    sys.path.insert(0, srcdir)
basedir = os.path.split(srcdir)[0]

from feedvalidator.base import namespaces

class HowtoNsTest(unittest.TestCase):
    def test_howto_declare_namespaces(self):
        base = dirname(dirname(dirname(os.path.abspath(__file__))))
        filename = join(base, 'docs', 'howto', 'declare_namespaces.html')

        with open(filename, 'r', encoding='utf-8', errors='replace') as handle:
            page = handle.read()

        for uri, prefix in list(namespaces.items()):
            if prefix == 'xml':
                continue
            if prefix == 'soap':
                continue
            if uri.find('ModWiki') > 0:
                continue

            xmlns = 'xmlns:%s="%s"' % (prefix, uri)
            self.assertTrue(page.find(xmlns) >= 0, xmlns)

def buildTestSuite():
    suite = unittest.TestSuite()
    loader = unittest.TestLoader()
    suite.addTest(loader.loadTestsFromTestCase(HowtoNsTest))
    return suite

if __name__ == '__main__':
    unittest.main()
