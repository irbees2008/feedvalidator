# Запуск Feed Validator в OSPanel

## Требования

- Windows и установленный OSPanel.
- Python **3.12.x**. Основной обработчик использует Python 3, а в проекте есть зависимость от модуля `cgi`, удалённого в Python 3.13.
- Apache в OSPanel с поддержкой CGI (`mod_cgi` или `mod_cgid`).

Скачать установщик Python можно на [официальной странице загрузок для Windows](https://www.python.org/downloads/windows/): выберите Python 3.12 и установщик для вашей разрядности. OSPanel доступен на [официальном сайте](https://ospanel.io/).

## Установка Python и зависимостей

1. При установке Python выберите папку:

   ```text
   C:\OSPanell\modules\python
   ```

   После установки файл интерпретатора должен находиться здесь:

   ```text
   C:\OSPanell\modules\python\python.exe
   ```

2. Откройте командную строку и выполните:

   ```cmd
   C:\OSPanell\modules\python\python.exe --version
   C:\OSPanell\modules\python\python.exe -m ensurepip --upgrade
   C:\OSPanell\modules\python\python.exe -m pip install --upgrade pip
   C:\OSPanell\modules\python\python.exe -m pip install -r C:\OSPanell\home\feedvalidator.ru\requirements.txt
   ```

## Настройка OSPanel

1. Откройте OSPanel → **Настройки → Модули** и включите CGI в Apache (`mod_cgi` или `mod_cgid`).
2. В управлении доменами добавьте `feedvalidator.ru` и укажите каталог:

   ```text
   C:\OSPanell\home\feedvalidator.ru
   ```

3. В CGI-файлах проекта уже указан интерпретатор `C:\OSPanell\modules\python\python.exe`. Если вы установили Python в другое место, замените путь в первой строке каждого файла `.cgi` на фактический путь.
4. Перезапустите Apache и откройте `http://feedvalidator.ru/`.

## Если сайт не запускается

- **Ошибка 500:** проверьте наличие `C:\OSPanell\modules\python\python.exe`, точное совпадение пути в CGI-файлах и журнал Apache.
- **`TypeError: catching classes that do not inherit from BaseException`:** обновите `src\feedvalidator\logging.py`; `ValidationFailure` должна наследоваться от `Exception`.
- **`AttributeError: 'str' object has no attribute 'decode'`:** обновите `check.cgi`; обработчик должен преобразовывать в UTF-8 только значения типа `bytes`.
- **`malformed header from script 'check.cgi'`:** обновите `check.cgi` до текущей версии проекта; CGI-заголовки должны выводиться отдельными строками перед HTML.
- **В браузере отображается исходный код `.cgi`:** в шаблоне `C:\OSPanell\config\Apache\default\templates\httpd.conf` включите `LoadModule cgi_module modules/mod_cgi.so` и добавьте `ScriptInterpreterSource Script`. Не редактируйте `C:\OSPanell\modules\Apache\conf\httpd.conf`: OSPanel пересоздаёт его при запуске. После изменений перезапустите Apache.
- **`ModuleNotFoundError`:** установите нужный пакет через тот же `python.exe`, который прописан в CGI-файлах.
- **403 Forbidden:** проверьте, разрешён ли CGI для домена и применяются ли правила `.htaccess`; перезапустите Apache.
- **Журнал OSPanel:** проверьте `C:\OSPanell\logs\Apache_error.log` и `C:\OSPanell\logs\Apache_access.log`. Расположение логов может зависеть от версии и конфигурации OSPanel.

`time.cgi` использует `email.utils` и работает с Python 3.12.

Инструкции по размещению проекта на VPS с Linux приведены в [README.md](./README.md).
