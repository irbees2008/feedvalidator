import os
import sys
import unittest
from unittest import mock

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import open_graph


class OpenGraphTest(unittest.TestCase):
    def testParserExtractsOpenGraphTwitterAndPageMetadata(self):
        parser = open_graph.MetaParser()
        parser.feed(
            '<html><head><title>Страница</title>'
            '<meta property="og:title" content="Новости &amp; статьи">'
            '<meta name="twitter:card" content="summary_large_image">'
            '<meta name="description" content="Описание">'
            '<link rel="canonical" href="/main"></head></html>'
        )
        parser.close()

        self.assertEqual(parser.open_graph['og:title'], ['Новости & статьи'])
        self.assertEqual(parser.twitter['twitter:card'], ['summary_large_image'])
        self.assertEqual(' '.join(parser.title_parts), 'Страница')
        self.assertEqual(parser.description, 'Описание')
        self.assertEqual(parser.canonical, '/main')

    def testNormaliseUrlAllowsOnlyStandardHttpPorts(self):
        normalized, scheme, hostname, port, target = open_graph._normalise_url('https://example.com/page?q=1')

        self.assertEqual(normalized, 'https://example.com/page?q=1')
        self.assertEqual((scheme, hostname, port, target), ('https', 'example.com', 443, '/page?q=1'))
        for url in ('ftp://example.com/', 'https://example.com:8443/', 'http://example.com:0/'):
            with self.subTest(url=url):
                with self.assertRaises(open_graph.OpenGraphError):
                    open_graph._normalise_url(url)

    def testRejectsLoopbackAndLocalAddresses(self):
        for host in ('127.0.0.1', 'localhost', '::1'):
            with self.subTest(host=host):
                with self.assertRaises(open_graph.OpenGraphError):
                    open_graph._public_addresses(host, 80)

    def testInspectUrlExtractsAndValidatesTags(self):
        document = (
            '<html><head><title>Page</title>'
            '<meta property="og:title" content="A title">'
            '<meta property="og:type" content="website">'
            '<meta property="og:url" content="https://example.com/page">'
            '<meta property="og:image" content="/share.png">'
            '<meta property="og:image" content="/duplicate.png">'
            '<meta name="twitter:card" content="summary_large_image">'
            '</head></html>'
        )
        with mock.patch.object(open_graph, '_fetch_once', return_value=(
            'document', 'https://example.com/page', document
        )):
            result = open_graph.inspect_url('https://example.com/page')

        self.assertEqual(result['title'], 'A title')
        self.assertEqual(result['image'], 'https://example.com/share.png')
        self.assertTrue(any(issue['level'] == 'warning' and issue['tag'] == 'og:image'
                            for issue in result['issues']))
        self.assertFalse(any(issue['tag'] == 'twitter:card' for issue in result['issues']))
        self.assertTrue(any(issue['level'] == 'warning' and issue['tag'] == 'og:description'
                            for issue in result['issues']))


if __name__ == '__main__':
    unittest.main()
