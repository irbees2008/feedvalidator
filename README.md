# Feed Validator

Инструкции по запуску проекта локально в OSPanel и размещению на хостинге.

После проверки RSS/Atom отображаются диагностический отчёт по HTTP/XML/содержимому и предпросмотр первых 10 записей в виде карточек. Для RSS 2.0 отчёт также проверяет пригодность ленты для макросов RSS-рассылки. Замечания и ошибки валидатора выводятся отдельным блоком внутри отчёта. Изображения карточек берутся из `media:thumbnail`, `media:content` или графических вложений RSS/Atom.

Страница [open-graph.html](./open-graph.html) проверяет метатеги Open Graph по публичному URL и помогает сгенерировать теги с предпросмотром. Запрос выполняется сервером; разрешены только публичные HTTP(S)-адреса на стандартных портах, с ограничением времени, размера HTML и числа перенаправлений.

Страница [favicon-generator.html](./favicon-generator.html) создаёт favicon из картинки, текста или эмодзи (ICO, PNG 16–512, manifest, HTML) и конвертирует GIF в PNG-кадры (по умолчанию 30) для анимированного favicon с готовым скриптом. Всё работает в браузере, результат скачивается ZIP-архивом.

Страница [markdown-editor.html](./markdown-editor.html) — редактор Markdown с живым предпросмотром, панелью форматирования, шпаргалкой, экспортом в .md и .html. Исходный HTML экранируется, в ссылках и картинках разрешены только http/https; черновик хранится в localStorage.

Страница [url-encoder.html](./url-encoder.html) — кодирование и декодирование URL (encodeURIComponent / encodeURI), режим «пробел как +», разбор параметров запроса. Работает в браузере.

Страница [fancy-text.html](./fancy-text.html) — генератор красивого текста: более 30 Unicode-стилей (жирный, курсив, каллиграфия, фрактура, в кружках, зачёркнутый и др.) с копированием в один клик. Латинские стили не меняют кириллицу, комбинируемые — работают и с ней.

## Требования и загрузки

- **Python 3.12.x** — [официальная страница загрузок Python для Windows](https://www.python.org/downloads/windows/). Выберите Python 3.12 и установщик Windows подходящей разрядности. Python 3.13+ не подходит без изменений кода: в проекте используется модуль `cgi`.
- **OSPanel** — [официальный сайт OSPanel](https://ospanel.io/).
- Для хостинга нужен VPS или выделенный сервер с Apache и поддержкой CGI. Уточните у провайдера, разрешён ли запуск CGI: на обычном shared-хостинге эта возможность часто отключена.

> Старая информация о Python 2.x в исходной документации больше не актуальна для основного обработчика `check.cgi`.

## Локальный запуск в OSPanel (Windows)

1. Установите Python 3.12 в `C:\OSPanell\modules\python\`. При выборе папки установки укажите этот путь явно.
2. Проверьте Python и установите пакеты в той же версии Python, которую будет запускать CGI:

   ```cmd
   C:\OSPanell\modules\python\python.exe --version
   C:\OSPanell\modules\python\python.exe -m ensurepip --upgrade
   C:\OSPanell\modules\python\python.exe -m pip install --upgrade pip
   C:\OSPanell\modules\python\python.exe -m pip install -r C:\OSPanell\home\feedvalidator.ru\requirements.txt
   ```

3. В настройках OSPanel включите CGI для Apache.
4. Добавьте домен `feedvalidator.ru` и укажите корень сайта:

   ```text
   C:\OSPanell\home\feedvalidator.ru
   ```

5. Перезапустите Apache и откройте `http://feedvalidator.ru/`.

Подробная инструкция и разбор типовых ошибок: [INSTALL_OSPANEL.md](./INSTALL_OSPANEL.md).

## Размещение на VPS с Linux и Apache

1. Подготовьте VPS с Linux, Apache, Python 3.12 и доступом администратора. На shared-хостинге сначала запросите у поддержки подтверждение, что Apache CGI разрешён.
2. Загрузите файлы проекта в каталог сайта, например `/var/www/feedvalidator.ru`.
3. Установите зависимости в отдельное виртуальное окружение вне каталога сайта:

   ```sh
   python3.12 -m venv /opt/feedvalidator-venv
   /opt/feedvalidator-venv/bin/python -m pip install --upgrade pip
   /opt/feedvalidator-venv/bin/python -m pip install -r /var/www/feedvalidator.ru/requirements.txt
   ```

4. В начале CGI-файлов (`check.cgi`, `index.cgi`, `time.cgi`, `open-graph.cgi`) замените Windows-путь к Python на путь виртуального окружения:

   ```text
   #!/opt/feedvalidator-venv/bin/python
   ```

   Затем разрешите запуск CGI-файлов:

   ```sh
   chmod 755 /var/www/feedvalidator.ru/*.cgi
   ```

5. Настройте виртуальный хост Apache: укажите `DocumentRoot /var/www/feedvalidator.ru`, разрешите CGI для `.cgi` и включите необходимые модули Apache (`cgi` или `cgid`, а также `rewrite`). За основу можно взять [sites-available-feedvalidator.conf](./sites-available-feedvalidator.conf), заменив в нём каталог `/feedvalidator` на каталог сайта.
6. Направьте DNS-запись домена на IP-адрес VPS, настройте HTTPS средствами хостинга или через Let’s Encrypt и перезапустите Apache.
7. При ошибке 500 проверьте журнал Apache. На Debian/Ubuntu это обычно `/var/log/apache2/error.log`.

## Известные ограничения

- Python должен быть версии 3.12.x: проект пока не подготовлен к Python 3.13 и новее.
- `time.cgi` переведён на `email.utils`; он служебный и закрыт в `.htaccess`.
- `php-compat.cgi` (PHP Compatibility Checker) вызывает CLI PHP (`php -l` и токенизатор); на сервере нужен `php`. Путь можно задать переменной окружения `FV_PHP`.
- Поддержку CGI, прав на запуск файлов и настройки Apache необходимо подтвердить у хостинг-провайдера; одного размещения файлов недостаточно.

## Адрес сайта (домен)

Домен хранится в одном месте — [site.json](./site.json) (поле url, сейчас https://lab.ngcms.org); переменная окружения FV_SITE_URL его переопределяет. check.cgi, Open Graph-проверка и sitemap.xml берут адрес оттуда. Чтобы сменить домен в статических страницах (canonical, og:url, JSON-LD), obots.txt и sitemap.xml, выполните:

```text
python docs-xml/apply-site-url.py https://example.com
```

Без аргумента скрипт применит адрес из site.json. Запускать можно повторно.

## Документация

Раздел `docs/` оформляется общими компонентами сайта. Индекс инструментария строится из `menu.json`, а справки об ошибках, предупреждениях и информационных сообщениях — из XML в `docs-xml/`. Для пересборки используйте `make -C docs-xml`; отдельно индекс можно пересоздать командой `python docs-xml/build-docs-index.py`. После пересборки запустите `python docs-xml/build-pages.py`, чтобы обновить навигацию и подвал, затем `python docs-xml/apply-site-url.py`, чтобы применить canonical URL из `site.json`.

Названия диагностических сообщений и исторические пояснения стандартов сохранены на английском там, где они должны совпадать с текстом валидатора или первоисточником; навигация и вводные инструкции переведены на русский.

## Общие шапка и подвал

Меню хранится в [templates/partials/menu.json](./templates/partials/menu.json): пункты с полем `group` собираются в выпадающие списки верхнего меню («Проверить», «Кодирование», «Генераторы»), в подвале только пункты с `"nav": false` («О проекте», «Документация», «Условия»). Поле `brand` задаёт название в логотипе страницы (первое слово делится на четыре цветные части: `Favicon Генератор` → `Fa|vi|co|n`); для страниц без `brand` берётся «FEED Валидатор». Разметка — в `templates/partials/navbar.html` и `footer-nav.html`. Главная `index.html` — каталог инструментов: карточки по группам строятся из `menu.json` (поля `desc`, `brand`) и `templates/partials/groups.json` в блок `<!--fv:tools-->` командой `build-pages.py`; валидатор ленты открывается по `check.cgi`. `check.cgi` подставляет их через `partials.py`. В статические страницы они попадают командой:

```text
python docs-xml/build-pages.py
```

Скрипт заменяет блоки между маркерами `<!--fv:navbar-->` и `<!--fv:footer-nav-->`, подсвечивает текущий пункт и подбирает относительные ссылки (для `docs/index.html` — с `../`). После правки меню запустите его заново; повторный запуск безопасен. Скрипт также обновляет навигацию в справках диагностик и руководствах `docs/howto/`; страница `register.html` остаётся отдельной.

`image-to-pixel-art.html` конвертирует растровые изображения в пиксель-арт локально в браузере: ширина сетки 8–128 px, оригинальные цвета или одна из трёх палитр, дизеринг Floyd–Steinberg, сетка и экспорт PNG в масштабе 4×–16×. Ограничения входа — 25 МБ и 40 мегапикселей; SVG не принимается.

`image-animation.html` создаёт GIF из загруженного изображения с шестью эффектами: вращение по горизонтали и вертикали, пульсация, оборот на 360°, покачивание и прыжок. Предпросмотр, настройка скорости и размера кадра, GIF из 30 кадров; файлы обрабатываются локально.

`fonts.html` показывает шрифты из `fonts/`, генерирует примеры `@font-face` и конвертирует файлы в браузере. После изменения каталога запустите `python docs-xml/build-font-catalog.py`; список сохраняется в `fonts/catalog.txt` в JSON-формате, так как `.htaccess` запрещает отдавать файлы `.json`. При конвертации файлы шрифтов остаются в браузере, а модуль `fonteditor-core` 2.6.3 (MIT) и WOFF2 WebAssembly загружаются с jsDelivr.

## Новый инструмент

`python docs-xml/new-tool.py slug "Название" "Описание"` создаёт страницу и `js/slug.js`, добавляет её в `menu.json`, списки `build-pages.py`, `apply-site-url.py`, `build-sitemap.py` и пересобирает шапку, подвал и sitemap. Общие помощники: `js/fv-common.js` (объект `FV`), классы `.fv-card`, `.fv-result`, `.fv-error`, `.fv-actions`, `.fv-code`. Серверные инструменты строятся на `fv_net.fetch` (защита от SSRF) и `fv_cgi.run`.

## Проверки

Запуск существующего Python-набора из корня проекта:

```cmd
C:\OSPanell\modules\python\python.exe runtest.py
```

Для браузерных инструментов откройте соответствующие страницы локально и проверьте загрузку файла, основные настройки и скачивание результата. Для PHP Compatibility дополнительно нужен установленный CLI PHP.
Сейчас набор содержит 2247 тестов; 19 legacy-сценариев `validtest` завершаются ошибками и требуют отдельного разбора.

## Безопасность

- Необработанные исключения не показываются посетителям: трассировка пишется в журнал ошибок веб-сервера (stderr), в браузер уходит нейтральная страница. Для разработки можно включить подробный вывод переменной окружения `FV_DEBUG=1`.
- Обработчик `status.cgi` (выполнял команды git) удалён; .htaccess закрывает доступ к `time.cgi`, `site.json`, `*.py`, `*.pyc` и `*.tmpl`.
