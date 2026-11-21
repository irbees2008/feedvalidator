#!C:\OSPanell\modules\python\python.exe
# -*- coding: utf-8 -*-
from config import *

import cgi, sys, os, urllib.parse, sys, re, urllib.request, urllib.parse, urllib.error, html, json
import safe_errors
safe_errors.enable()

import codecs
import datetime
import time
from html.parser import HTMLParser
ENCODING='UTF-8'
sys.stdout.reconfigure(encoding=ENCODING)

# Used for CGI parameters
decUTF8 = codecs.getdecoder('utf-8')
decW1252 = codecs.getdecoder('windows-1252')

def decodeFormData(value):
    if isinstance(value, bytes):
        try:
            return decUTF8(value)[0]
        except UnicodeDecodeError:
            return decW1252(value)[0]
    return value

if PYDIR not in sys.path:
    sys.path.insert(0, PYDIR)

if WEBDIR not in sys.path:
    sys.path.insert(0, WEBDIR)

if SRCDIR not in sys.path:
    sys.path.insert(0, SRCDIR)
import feedparser
import feedvalidator
from feedvalidator.logging import FEEDTYPEDISPLAY, VALIDFEEDGRAPHIC

from feedvalidator.logging import Info, Warning, Error, ValidationFailure
from feedvalidator.logging import TYPE_RSS1, TYPE_RSS2, TYPE_ATOM, TYPE_ATOM_ENTRY, TYPE_OPENSEARCH, TYPE_XRD
from feedvalidator.logging import TYPE_APP_SERVICE, TYPE_APP_CATEGORIES

def applyTemplate(templateFile, params={}):
    params['CSSURL'] = CSSURL
    if templateFile in ('navbar.tmpl', 'footer.tmpl'):
        import partials
        params['navbar'] = partials.render_navbar('check.cgi')
        params['footer_nav'] = partials.render_footer_nav('check.cgi')
    fsock = codecs.open(os.path.join(WEBDIR, 'templates', templateFile), 'r', 'utf-8')
    data = fsock.read() % params
    fsock.close()
    return data.encode('utf-8')

def renderIndex(value='http://', activeTab='url', rawdata='', showWelcome=True):
    return applyTemplate('index.tmpl', {
        'value': value,
        'rawdata': rawdata,
        'welcomeClass': '' if showWelcome else 'hidden',
        'urlActive': 'active' if activeTab == 'url' else '',
        'manualActive': 'active' if activeTab == 'manual' else '',
        'fileActive': 'active' if activeTab == 'file' else ''
    })

from site_config import SITE_URL
SITE_NAME = 'FEED Валидатор'
HOME_TITLE = 'Валидатор RSS и Atom лент онлайн — проверка по ссылке, XML или файлу — ' + SITE_NAME
HOME_DESCRIPTION = ('Бесплатный онлайн-валидатор RSS, Atom и KML: проверьте ленту по ссылке, XML-коду или файлу, '
                    'найдите ошибки и предупреждения и посмотрите предпросмотр записей.')

def seoBlock(title, description, path, indexable):
    title = html.escape(title, quote=True)
    description = html.escape(description, quote=True)
    url = SITE_URL + path
    robots = 'index,follow,max-image-preview:large' if indexable else 'noindex,follow'
    lines = [
        '<meta name="description" content="%s">' % description,
        '<meta name="robots" content="%s">' % robots,
        '<link rel="canonical" href="%s">' % url,
        '<meta name="theme-color" content="#1F65DB">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="%s">' % SITE_NAME,
        '<meta property="og:locale" content="ru_RU">',
        '<meta property="og:title" content="%s">' % title,
        '<meta property="og:description" content="%s">' % description,
        '<meta property="og:url" content="%s">' % url,
        '<meta name="twitter:card" content="summary">',
        '<meta name="twitter:title" content="%s">' % title,
        '<meta name="twitter:description" content="%s">' % description,
    ]
    if indexable:
        data = {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            'name': SITE_NAME,
            'url': url,
            'description': HOME_DESCRIPTION,
            'applicationCategory': 'DeveloperApplication',
            'operatingSystem': 'Any',
            'inLanguage': 'ru',
            'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'RUB'},
        }
        lines.append('<script type="application/ld+json">%s</script>' % json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    return '\n'.join(lines)

def renderHeader(title, home=False):
    if home:
        title = HOME_TITLE
        seo = seoBlock(title, HOME_DESCRIPTION, '/check.cgi', True)
    else:
        # title уже экранирован через escapeURL, поэтому в метаданные идёт общий заголовок
        seo = seoBlock('Результат проверки ленты — ' + SITE_NAME, HOME_DESCRIPTION, '/check.cgi', False)
    return applyTemplate('header.tmpl', {'title': title if not home else html.escape(title, quote=False), 'seo': seo}) + applyTemplate('navbar.tmpl')

class PreviewTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

class PreviewImageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'img':
            source = dict(attrs).get('src', '').strip()
            if source:
                self.sources.append(source)

def previewText(value):
    parser = PreviewTextParser()
    parser.feed(html.unescape(str(value)))
    parser.close()
    return ' '.join(' '.join(parser.parts).split())

def previewImage(entry, baseURL):
    candidates = []
    for field in ('media_thumbnail', 'media_content', 'enclosures', 'links'):
        values = entry.get(field, [])
        if isinstance(values, dict):
            values = [values]
        for value in values:
            imageType = str(value.get('type', '')).lower()
            medium = str(value.get('medium', '')).lower()
            if field == 'media_thumbnail' or imageType.startswith('image/') or medium == 'image':
                candidate = value.get('url') or value.get('href')
                if candidate:
                    candidates.append(candidate)

    for value in [entry.get('summary', '')] + [
        item.get('value', '') for item in entry.get('content', [])
    ]:
        parser = PreviewImageParser()
        parser.feed(html.unescape(str(value)))
        parser.close()
        candidates.extend(parser.sources)

    for candidate in candidates:
        candidate = urllib.parse.urljoin(baseURL, str(candidate).strip()) if baseURL else str(candidate).strip()
        try:
            parts = urllib.parse.urlsplit(candidate)
        except ValueError:
            continue
        if parts.scheme.lower() in ('http', 'https') and parts.netloc and not parts.username and not parts.password:
            return html.escape(candidate, quote=True)
    return ''

def buildFeedPreview(rawdata, feedType, baseURL):
    if feedType not in (TYPE_RSS1, TYPE_RSS2, TYPE_ATOM, TYPE_ATOM_ENTRY):
        return None

    parsed = feedparser.parse(rawdata)
    feedTitle = previewText(parsed.feed.get('title', '')) or 'RSS / Atom'
    entries = parsed.entries
    cards = []

    for entry in entries[:10]:
        title = previewText(entry.get('title', '')) or 'Без заголовка'
        imageURL = previewImage(entry, baseURL)
        safeLink = ''
        link = str(entry.get('link', '')).strip()
        if link:
            candidate = urllib.parse.urljoin(baseURL, link) if baseURL else link
            try:
                linkParts = urllib.parse.urlsplit(candidate)
            except ValueError:
                linkParts = None
            if linkParts and linkParts.scheme.lower() in ('http', 'https') and linkParts.netloc:
                safeLink = html.escape(candidate, quote=True)

        titleHTML = html.escape(title)
        if safeLink:
            titleHTML = '<a href="%s">%s</a>' % (safeLink, titleHTML)

        card = [
            '<article class="feed-card">',
        ]
        if imageURL:
            card.append('<img class="feed-card-image" src="%s" alt="%s" decoding="async" referrerpolicy="no-referrer" />' % (imageURL, html.escape(title, quote=True)))
        card.extend([
            '<h3 class="feed-card-title">%s</h3>' % titleHTML
        ])

        published = previewText(entry.get('published') or entry.get('updated') or '')
        if published:
            card.append('<p class="feed-card-date">%s</p>' % html.escape(published))

        summary = entry.get('summary', '')
        if not summary:
            content = entry.get('content', [])
            if content:
                summary = content[0].get('value', '')
        summary = previewText(summary)
        if len(summary) > 360:
            summary = summary[:357].rstrip() + '...'
        if summary:
            card.append('<p class="feed-card-summary">%s</p>' % html.escape(summary))

        if safeLink:
            card.append('<a class="feed-card-link" href="%s">Открыть публикацию</a>' % safeLink)
        card.append('</article>')
        cards.append(''.join(card))

    count = len(entries)
    if count > 10:
        countText = 'Показаны первые 10 из %s записей' % count
    else:
        countText = 'Записей: %s' % count

    if not cards:
        cards.append('<p class="feed-preview-empty">В ленте пока нет записей.</p>')

    return applyTemplate('feed_preview.tmpl', {
        'feedTitle': html.escape(feedTitle),
        'countText': html.escape(countText),
        'cards': ''.join(cards)
    })

def feedReportRow(status, label, value, detail=''):
    icons = {'ok': '✓', 'warning': '⚠', 'info': 'ℹ', 'error': '✗'}
    detailHTML = '<small>%s</small>' % html.escape(detail) if detail else ''
    labelClass = 'feed-report-label feed-report-macro' if label.startswith('%') else 'feed-report-label'
    return (
        '<div class="feed-report-row report-%s">'
        '<span class="feed-report-icon" aria-hidden="true">%s</span>'
        '<strong class="%s">%s</strong>'
        '<span class="feed-report-value">%s</span>%s</div>'
    ) % (
        status,
        icons[status],
        labelClass,
        html.escape(label),
        html.escape(str(value)),
        detailHTML
    )

def feedReportSection(title, rows):
    return '<section class="feed-report-section"><h3>%s</h3><div class="feed-report-rows">%s</div></section>' % (
        html.escape(title),
        ''.join(rows)
    )

def reportDate(entry):
    return entry.get('published_parsed') or entry.get('updated_parsed')

def reportHasDescription(entry):
    return bool(previewText(entry.get('summary', '')) or entry.get('content'))

def reportHasImage(entry, baseURL):
    return bool(previewImage(entry, baseURL))

def reportBytes(value):
    size = float(value)
    for unit in ('Б', 'КБ', 'МБ'):
        if size < 1024 or unit == 'МБ':
            return ('%.1f %s' % (size, unit)) if unit != 'Б' else ('%s %s' % (int(size), unit))
        size /= 1024

def buildFeedReport(rawdata, feedType, sourceURL, httpInfo, sourceKind, verdict, events, messagesHTML=None):
    parsed = feedparser.parse(rawdata)
    entries = parsed.entries
    isRSS = feedType in (TYPE_RSS1, TYPE_RSS2)
    isRSS2 = feedType == TYPE_RSS2
    feedTitle = previewText(parsed.feed.get('title', ''))
    feedLink = parsed.feed.get('link', '')
    feedDescription = previewText(parsed.feed.get('subtitle', ''))
    dates = [reportDate(entry) for entry in entries]
    dated = [date for date in dates if date]
    allDates = bool(entries) and len(dated) == len(entries)
    ordered = allDates and all(tuple(dates[i][:6]) >= tuple(dates[i + 1][:6]) for i in range(len(dates) - 1))
    newest = max(dated, key=lambda date: tuple(date[:6])) if dated else None
    if newest:
        lastUpdate = datetime.datetime(*newest[:6], tzinfo=datetime.timezone.utc).strftime('%d.%m.%Y %H:%M UTC')
    else:
        lastUpdate = 'Не указана'

    hasTitlesAndLinks = bool(entries) and all(
        previewText(entry.get('title', '')) and entry.get('link') for entry in entries
    )
    hasDescriptions = bool(entries) and all(reportHasDescription(entry) for entry in entries)
    imageEntries = [reportHasImage(entry, sourceURL) for entry in entries]
    hasImages = bool(entries) and all(imageEntries)
    latestEntry = entries[0] if entries else {}
    latestHasImage = reportHasImage(latestEntry, sourceURL) if latestEntry else False
    hasFullContent = bool(entries) and all(bool(entry.get('content')) for entry in entries)

    sections = []
    sourceName = {'manual': 'Ручной ввод XML', 'file': 'Загруженный файл'}.get(sourceKind, 'URL')
    httpRows = [
        feedReportRow('info', 'Источник', sourceURL or sourceName)
    ]
    if httpInfo:
        statusCode = httpInfo.get('status')
        statusText = '%s %s' % (statusCode or 'Ответ', httpInfo.get('reason', ''))
        statusClass = 'ok' if statusCode and 200 <= statusCode < 300 else 'warning'
        statusText += ', %s мс, %s' % (
            httpInfo.get('durationMs', 0),
            reportBytes(httpInfo.get('downloadedBytes', 0))
        )
        httpRows.append(feedReportRow(statusClass, 'HTTP-ответ', statusText))
        finalURL = httpInfo.get('finalURL') or sourceURL
        isHTTPS = urllib.parse.urlsplit(finalURL).scheme.lower() == 'https'
        httpRows.append(feedReportRow(
            'ok' if isHTTPS else 'warning',
            'HTTPS',
            'Лента отдаётся по HTTPS' if isHTTPS else 'Лента доступна без HTTPS',
            '' if isHTTPS else 'HTTPS защищает запросы читателей и предотвращает подмену ленты.'
        ))
        httpRows.append(feedReportRow(
            'ok' if httpInfo.get('contentType') else 'warning',
            'Content-Type',
            httpInfo.get('contentType') or 'Не указан'
        ))
        compression = httpInfo.get('contentEncoding', '').lower()
        if compression:
            httpRows.append(feedReportRow('ok', 'Сжатие', 'Ответ сжат: %s' % compression))
        else:
            httpRows.append(feedReportRow(
                'info', 'Сжатие', 'Ответ не сжимается',
                'Для больших лент gzip может уменьшить трафик и ускорить загрузку.'
            ))
        hasValidators = bool(httpInfo.get('etag') or httpInfo.get('lastModified'))
        validatorValue = ', '.join(
            name for name, value in (
                ('ETag', httpInfo.get('etag')),
                ('Last-Modified', httpInfo.get('lastModified'))
            ) if value
        )
        httpRows.append(feedReportRow(
            'ok' if hasValidators else 'warning',
            'Условный запрос',
            validatorValue or 'Нет ETag и Last-Modified',
            '' if hasValidators else 'Без этих заголовков клиенты обычно повторно загружают всю ленту.'
        ))
    else:
        httpRows.append(feedReportRow(
            'info', 'HTTP-параметры', 'Недоступны для этого способа проверки',
            'Для проверки HTTP-ответа укажите URL ленты.'
        ))
    sections.append(feedReportSection('Загрузка ленты', httpRows))

    declaredEncoding = re.search(
        r'<\?xml[^>]*encoding\s*=\s*["\']([^"\']+)["\']',
        rawdata[:512],
        re.IGNORECASE
    )
    encoding = declaredEncoding.group(1) if declaredEncoding else (parsed.get('encoding') or 'UTF-8')
    sections.append(feedReportSection('XML и кодировка', [
        feedReportRow('ok', 'Well-formed XML', 'Документ разбирается без синтаксических ошибок'),
        feedReportRow('ok', 'Кодировка', encoding.upper())
    ]))

    formatNames = {
        TYPE_RSS1: 'RSS 1.0',
        TYPE_RSS2: 'RSS 2.0',
        TYPE_ATOM: 'Atom 1.0',
        TYPE_ATOM_ENTRY: 'Atom 1.0 Entry'
    }
    formatName = formatNames.get(feedType, FEEDTYPEDISPLAY.get(feedType, 'Неизвестный формат'))
    formatStatus = 'ok' if feedType in formatNames else 'warning'
    if isRSS:
        requiredFields = bool(feedTitle and feedLink and feedDescription)
        requiredValue = '<title>, <link> и <description> на месте' if requiredFields else 'Не хватает обязательных элементов канала'
    else:
        requiredFields = bool(feedTitle and feedLink)
        requiredValue = 'Заголовок и ссылка на месте' if requiredFields else 'Не хватает заголовка или ссылки'

    selfLinks = [
        item.get('href', '') for item in parsed.feed.get('links', [])
        if item.get('rel') == 'self' and item.get('href')
    ]
    selfMismatch = any(event.__class__.__name__ == 'SelfDoesntMatchLocation' for event in events)
    if selfLinks and not selfMismatch:
        selfStatus, selfValue = 'ok', 'Ссылка rel="self" указана'
    elif selfMismatch:
        selfStatus, selfValue = 'warning', 'rel="self" не совпадает с адресом ленты'
    else:
        selfStatus, selfValue = 'info', 'rel="self" не указан'

    hasTitleOrText = bool(entries) and all(
        previewText(entry.get('title', '')) or reportHasDescription(entry) for entry in entries
    )
    specRows = [
        feedReportRow(formatStatus, 'Формат', formatName),
        feedReportRow('ok' if requiredFields else 'error', 'Обязательные элементы', requiredValue),
        feedReportRow(selfStatus, 'Ссылка на себя', selfValue),
        feedReportRow(
            'ok' if hasTitleOrText else 'warning',
            'Содержимое записей',
            'У каждой записи есть заголовок или описание' if hasTitleOrText else 'У некоторых записей нет ни заголовка, ни описания'
        )
    ]
    sections.append(feedReportSection('Соответствие спецификации', specRows))

    dateStatus = 'ok' if allDates else 'warning'
    orderStatus = 'ok' if ordered else 'warning'
    sections.append(feedReportSection('Содержимое ленты', [
        feedReportRow('info', 'Записи', '%s записей в ленте' % len(entries)),
        feedReportRow(
            dateStatus, 'Даты записей',
            'Дата есть у всех записей' if allDates else 'Дата есть не у всех записей'
        ),
        feedReportRow(
            orderStatus, 'Порядок записей',
            'Записи идут от новых к старым' if ordered else 'Порядок по дате не подтверждён'
        ),
        feedReportRow('info', 'Свежесть', 'Последняя запись: %s' % lastUpdate)
    ]))

    if isRSS2:
        lastHasTitleLink = bool(latestEntry and previewText(latestEntry.get('title', '')) and latestEntry.get('link'))
        lastHasDescription = bool(latestEntry and reportHasDescription(latestEntry))
        macroRows = [
            feedReportRow('ok' if feedTitle else 'warning', '%RSSTITLE%', 'Название ленты'),
            feedReportRow('ok' if hasTitlesAndLinks else 'warning', '%LASTHEADER%', 'Заголовок-ссылка последней записи'),
            feedReportRow('ok' if hasTitlesAndLinks else 'warning', '%RSSHEADERS%', 'Список заголовков-ссылок'),
            feedReportRow('ok' if lastHasTitleLink and lastHasDescription else 'warning', '%LASTPOST%', 'Последняя запись с описанием'),
            feedReportRow('ok' if hasTitlesAndLinks and hasDescriptions else 'warning', '%RSSPOSTS%', 'Записи с описаниями'),
            feedReportRow('ok' if hasImages else 'warning', '%ITEM_IMAGE%', 'Картинка у каждой записи'),
            feedReportRow('ok' if latestHasImage else 'warning', '%LASTPOSTIMG%', 'Картинка у последней записи'),
            feedReportRow('ok' if hasImages else 'warning', '%RSSPOSTSIMG%', 'Картинки у всех записей'),
            feedReportRow(
                'ok' if hasFullContent else 'info',
                '%RSSPOSTSHTML%',
                'Полный HTML-текст записей' if hasFullContent else 'content:encoded отсутствует'
            )
        ]
        mailReady = bool(entries and feedTitle and hasTitlesAndLinks and hasDescriptions and allDates)
        if mailReady:
            limitations = []
            if not hasImages:
                limitations.append('у части записей нет картинок')
            if not hasFullContent:
                limitations.append('%RSSPOSTSHTML% недоступен')
            if limitations:
                mailStatus = 'warning'
                mailSummary = 'Лента готова к RSS-рассылке, но ' + '; '.join(limitations)
            else:
                mailStatus, mailSummary = 'ok', 'Лента готова к RSS-рассылке'
        else:
            mailStatus, mailSummary = 'error', 'Для RSS-рассылки не хватает обязательных данных'
        macroRows.append(feedReportRow(mailStatus, 'Итог по рассылке', mailSummary))
        sections.append(feedReportSection('Пригодность для RSS-рассылки', macroRows))
    else:
        sections.append(feedReportSection('Пригодность для RSS-рассылки', [
            feedReportRow('warning', 'Формат ленты', '%s — требуется RSS 2.0 для описанных макросов' % formatName)
        ]))

    httpRecommendations = bool(httpInfo) and (
        not (httpInfo.get('etag') or httpInfo.get('lastModified'))
        or urllib.parse.urlsplit(httpInfo.get('finalURL') or sourceURL).scheme.lower() != 'https'
        or not (httpInfo.get('status') and 200 <= httpInfo['status'] < 300)
        or not httpInfo.get('contentType')
    )
    contentWarnings = (
        not requiredFields
        or selfMismatch
        or not allDates
        or not ordered
        or (isRSS2 and not (mailReady and hasImages))
        or not isRSS2
    )
    if verdict == Error:
        verdictClass, verdictText = 'error', 'Не прошла проверку'
    elif verdict == Warning or httpRecommendations or contentWarnings:
        verdictClass, verdictText = 'warning', 'Валидна с замечаниями'
    else:
        verdictClass, verdictText = 'ok', 'Валидна'

    if messagesHTML is not None:
        sections.append(
            '<section class="feed-report-section"><h3>Сообщения валидатора</h3>'
            '<div class="feed-report-messages result-messages">%s</div></section>' % messagesHTML
        )

    return applyTemplate('feed_report.tmpl', {
        'verdictClass': verdictClass,
        'verdictText': verdictText,
        'sections': ''.join(sections)
    })

def sanitizeURL(url):
    # Allow feed: URIs, as described by draft-obasanjo-feed-URI-scheme-02
    if url.lower().startswith('feed:'):
      url = url[5:]
      if url.startswith('//'):
        url = 'http:' + url

    # Fix malformed protocol: https//... or http//... (missing colon)
    import re as _re
    url = _re.sub(r'^(https?)/{1,}', lambda m: m.group(1) + '://', url, flags=_re.IGNORECASE)

    if not url.split(':')[0].lower() in ['http','https']:
        url = 'http://%s' % url
    url = url.strip()

    # strip user and password
    url = re.sub(r'^(\w*://)[-+.\w]*(:[-+.\w]+)?@', r'\1' ,url)

    return url

def escapeURL(url):
    parts = list(urllib.parse.urlparse(url))
    safe = ['/', '/:@', '/', '/', '/?&=;', '/']
    for i in range(0,len(parts)):
      parts[i] = urllib.parse.quote(urllib.parse.unquote(parts[i]),safe[i])
    url = html.escape(urllib.parse.urlunparse(parts))
    try:
      return url.decode('idna')
    except:
      return url

import feedvalidator.formatter.text_html

def buildCodeListing(events, rawdata, url):
    # print feed
    codelines = []
    linenum = 1
    linesWithErrors = [e.params.get('line', 0) for e in events]
    for line in rawdata.split('\n'):
        line = feedvalidator.formatter.text_html.escapeAndMark(line)
        if not line: line = '&nbsp;'
        linetype = linenum in linesWithErrors and "b" or "a"
        codelines.append(applyTemplate('code_listing_line.tmpl', {"line":line, "linenum":linenum, "linetype":linetype}).decode('utf-8'))
        linenum += 1
    codelisting = "".join(codelines)
    return applyTemplate('code_listing.tmpl', {"codelisting":codelisting, "url":escapeURL(url)})

def yieldEventList(output, wrap=True):
  errors, warnings = output.getErrors(), output.getWarnings()

  if wrap:
    yield '<section class="result-card result-messages"><h2>Сообщения валидатора</h2>'
  yield output.header()
  for o in output.getErrors():
    yield o.encode('utf-8')
  if errors and warnings:
    yield output.footer()
    if len(warnings) == 1:
      yield applyTemplate('andwarn1.tmpl')
    else:
      yield applyTemplate('andwarn2.tmpl')
    yield output.header()
  for o in output.getWarnings():
    yield o.encode('utf-8')
  yield output.footer()
  if wrap:
    yield '</section>'

def renderEventListHTML(output):
  return ''.join(
    item.decode('utf-8') if isinstance(item, bytes) else item
    for item in yieldEventList(output, wrap=False)
  )

from feedvalidator.formatter.text_html import Formatter

def postvalidate(url, events, rawdata, feedType, autofind=1, requestInfo=None):
    """returns dictionary including 'url', 'events', 'rawdata', 'output', 'specialCase', 'feedType'"""
    # filter based on compatibility level
    from feedvalidator import compatibility
    filterFunc = compatibility.AA # hardcoded for now
    events = filterFunc(events)

    specialCase = None
    formattedOutput = Formatter(events, rawdata)
    if formattedOutput:
        # check for special cases
        specialCase = compatibility.analyze(events, rawdata)
        if (specialCase == 'html') and autofind:
            try:
                try:
                    import feedfinder
                    rssurls = feedfinder.getLinks(rawdata,url)
                except:
                    rssurls = [url]
                if rssurls:
                    url = rssurls[0]
                    params = feedvalidator.validateURL(url, firstOccurrenceOnly=1, wantRawData=1)
                    events = params['loggedEvents']
                    rawdata = params['rawdata']
                    feedType = params['feedType']
                    requestInfo = params.get('httpInfo')
                    return postvalidate(url, events, rawdata, feedType, autofind=0, requestInfo=requestInfo)
            except:
                pass

    return {"url":url, "events":events, "rawdata":rawdata, "output":formattedOutput, "specialCase":specialCase, "feedType":feedType, "httpInfo":requestInfo}

def checker_app(environ, start_response):

    method = environ['REQUEST_METHOD'].lower()
    contentType = environ.get('CONTENT_TYPE', None)
    output_option = ''
    activeTab = 'url'
    requestInfo = None

    if (method == 'get') or (contentType and cgi.parse_header(contentType)[0].lower() == 'application/x-www-form-urlencoded'):
        fs = cgi.FieldStorage(fp=environ.get('wsgi.input',None), environ=environ)
        url = fs.getvalue("url") or ''
        try:
          if url:
              url = str(url)
        except (UnicodeError, TypeError):
          pass
        manual = fs.getvalue("manual") or 0
        if manual:
            activeTab = 'manual'
        rawdata = fs.getvalue("rawdata") or ''
        output_option = fs.getvalue("output") or ''

        # XXX Should use 'charset'
        rawdata = decodeFormData(rawdata)

        rawdata = rawdata[:feedvalidator.MAXDATALENGTH].replace('\r\n', '\n').replace('\r', '\n')
    elif contentType and 'multipart/form-data' in contentType:
        # Обработка загрузки файла
        fs = cgi.FieldStorage(fp=environ.get('wsgi.input',None), environ=environ)
        manual = fs.getvalue("manual") or 0
        activeTab = 'file'
        url = ''
        rawdata = ''
        output_option = ''

        if "uploadfile" in fs:
            fileitem = fs["uploadfile"]
            if fileitem.file:
                rawdata = fileitem.file.read()
                rawdata = decodeFormData(rawdata)
                rawdata = rawdata[:feedvalidator.MAXDATALENGTH].replace('\r\n', '\n').replace('\r', '\n')
    else:
        url = None
        manual = None
        rawdata = None

    if (output_option == "soap12"):
        # SOAP
        try:
            if ((method == 'post') and (not rawdata)):
                params = feedvalidator.validateStream(sys.stdin, contentType=contentType)
            elif rawdata :
                params = feedvalidator.validateString(rawdata, firstOccurrenceOnly=1)
            elif url:
                url = sanitizeURL(url)
                params = feedvalidator.validateURL(url, firstOccurrenceOnly=1, wantRawData=1)

            events = params['loggedEvents']
            feedType = params['feedType']

            # filter based on compatibility level
            from feedvalidator import compatibility
            filterFunc = compatibility.AA # hardcoded for now
            events = filterFunc(events)

            events_error = list()
            events_warn = list()
            events_info = list()


            # format as xml
            from feedvalidator.formatter.text_xml import Formatter as xmlformat
            output = xmlformat(events)

            for event in events:
                if isinstance(event,Error): events_error.append(output.format(event))
                if isinstance(event,Warning): events_warn.append(output.format(event))
                if isinstance(event,Info): events_info.append(output.format(event))
            if len(events_error) > 0:
                validation_bool = "false"
            else:
                validation_bool = "true"

            from datetime import datetime
            right_now = datetime.now()
            validationtime = str( right_now.isoformat())

            body = applyTemplate('soap.tmpl', {
              'errorlist':"\n".join( events_error), 'errorcount': str(len(events_error)),
              'warninglist':"\n".join( events_warn), 'warningcount': str(len(events_warn)),
              'infolist':"\n".join( events_info), 'infocount': str(len(events_info)),
              'home_url': HOMEURL, 'url': url, 'date_time': validationtime, 'validation_bool': validation_bool
              })
            start_response('200 OK', [('Content-type', 'application/soap+xml; charset=' + ENCODING)])
            yield body

        except:
            import traceback
            traceback.print_exc(file=sys.stderr)

            start_response('500 Internal Server Error', [('Content-type', 'text/xml; charset=' + ENCODING)])

            yield applyTemplate('fault.tmpl', {'code': 'soap:Server',
              'string': 'Internal server error'})

    else:
        start_response('200 OK', [('Content-type', 'text/html; charset=' + ENCODING)])

        if url or rawdata:
            # validate
            goon = 0
            if rawdata:
                # validate raw data (from text form)
                try:
                    params = feedvalidator.validateString(rawdata, firstOccurrenceOnly=1)
                    events = params['loggedEvents']
                    feedType = params['feedType']
                    goon = 1
                except ValidationFailure as vfv:
                    yield renderHeader('Feed Validator Results: %s' % escapeURL(url))
                    yield renderIndex(escapeURL(url), activeTab, html.escape(rawdata), showWelcome=False)
                    output = Formatter([vfv.event], None)
                    for item in yieldEventList(output):
                        yield item
                    yield applyTemplate('error.tmpl')
                except:
                    import traceback
                    traceback.print_exc(file=sys.stderr)
                    yield renderHeader('Feed Validator Results: %s' % escapeURL(url))
                    yield renderIndex(escapeURL(url), activeTab, html.escape(rawdata), showWelcome=False)
                    yield applyTemplate('error.tmpl')
            else:
                url = sanitizeURL(url)
                try:
                    params = feedvalidator.validateURL(url, firstOccurrenceOnly=1, wantRawData=1)
                    events = params['loggedEvents']
                    rawdata = params['rawdata']
                    feedType = params['feedType']
                    requestInfo = params.get('httpInfo')
                    goon = 1
                except ValidationFailure as vfv:
                    yield renderHeader('Feed Validator Results: %s' % escapeURL(url))
                    yield renderIndex(escapeURL(url), showWelcome=False)
                    output = Formatter([vfv.event], None)
                    for item in yieldEventList(output):
                        yield item
                    yield applyTemplate('error.tmpl')
                except:
                    import traceback
                    traceback.print_exc(file=sys.stderr)
                    yield renderHeader('Feed Validator Results: %s' % escapeURL(url))
                    yield renderIndex(escapeURL(url), showWelcome=False)
                    yield applyTemplate('error.tmpl')
            if goon:
                # post-validate (will do RSS autodiscovery if needed)
                validationData = postvalidate(url, events, rawdata, feedType, requestInfo=requestInfo)

                # write output header
                url = validationData['url']
                feedType = validationData['feedType']
                rawdata = validationData['rawdata']

                htmlUrl = escapeURL(urllib.parse.quote(url))
                htmlUrl = htmlUrl.encode('idna').decode('ascii')
                docType = 'feed'
                if feedType == TYPE_ATOM_ENTRY: docType = 'entry'
                if feedType == TYPE_XRD: docType = 'document'
                if feedType == TYPE_APP_CATEGORIES: docType = 'Document'
                if feedType == TYPE_APP_SERVICE: docType = 'Document'
                if feedType == TYPE_OPENSEARCH: docType = 'description document'

                yield renderHeader('Feed Validator Results: %s' % escapeURL(url))
                if manual:
                    yield renderIndex(escapeURL(url), activeTab, html.escape(rawdata), showWelcome=False)
                else:
                    yield renderIndex(escapeURL(url), showWelcome=False)

                output = validationData.get('output', None)

                # print special case, if any
                specialCase = validationData.get('specialCase', None)
                if specialCase:
                    yield applyTemplate('%s.tmpl' % specialCase)

                msc = output.mostSeriousClass()

                # Explain the overall verdict
                if msc == Error:
                    from feedvalidator.logging import ObsoleteNamespace
                    if len(output.getErrors())==1 and \
                        isinstance(output.data[0],ObsoleteNamespace):
                        yield applyTemplate('notsupported.tmpl')
                    elif specialCase != 'html':
                        yield applyTemplate('invalid.tmpl')
                else:
                    yield applyTemplate('congrats.tmpl', {"feedType":FEEDTYPEDISPLAY[feedType], "graphic":VALIDFEEDGRAPHIC[feedType], "docType":docType})
                    if msc == Warning:
                        yield applyTemplate('warning.tmpl')
                    elif msc == Info:
                        yield applyTemplate('info.tmpl')

                if specialCase == 'html':
                    messagesHTML = None
                elif output:
                    messagesHTML = renderEventListHTML(output)
                else:
                    messagesHTML = '<p class="feed-report-empty">Ошибок и предупреждений нет.</p>'

                yield buildFeedReport(
                    rawdata,
                    feedType,
                    url,
                    validationData.get('httpInfo'),
                    activeTab if manual else 'url',
                    msc,
                    validationData['events'],
                    messagesHTML
                )

                preview = buildFeedPreview(rawdata, feedType, url)
                if preview:
                    yield preview

                if output:
                    # print code listing
                    yield buildCodeListing(validationData['events'], validationData['rawdata'], url)

                # As long as there were no errors, show that the feed is valid
                if msc != Error:
                    # valid
                    yield applyTemplate('valid.tmpl', {"url":htmlUrl, "srcUrl":htmlUrl, "feedType":FEEDTYPEDISPLAY[feedType], "graphic":VALIDFEEDGRAPHIC[feedType], "HOMEURL":HOMEURL, "docType":docType})
        else:
            # nothing to validate, just write basic form
            yield renderHeader('Feed Validator for Atom and RSS', home=True)
            if manual:
                yield renderIndex(activeTab=activeTab)
            else:
                yield renderIndex()
            yield applyTemplate('special.tmpl', {})

        yield applyTemplate('footer.tmpl')

if __name__ == "__main__":
    if len(sys.argv)==1 or not sys.argv[1].isdigit():
        def start_response(status, headers):
            print('Status: %s' % status)
            for header,value in headers:
                print('%s: %s' % (header, value))
            print()
        for output in checker_app(os.environ, start_response):
            if isinstance(output, bytes):
                output = output.decode(ENCODING)
            print(output)
    else:
        # export HTTP_HOST=http://feedvalidator.org/
        # export SCRIPT_NAME=check.cgi
        # export SCRIPT_FILENAME=/home/rubys/svn/feedvalidator/check.cgi
        import fcgi
        port=int(sys.argv[1])
        fcgi.WSGIServer(checker_app, bindAddress=("127.0.0.1", port)).run()
