# -*- coding: utf-8 -*-
"""PHP Compatibility Checker: php -l и разбор токенизатором PHP на стороне сервера.

Код пользователя никогда не выполняется: php -l только компилирует файл,
а анализатор вызывает token_get_all(). Оба процесса работают с таймаутом
и без php.ini (-n).
"""
import glob
import json
import os
import re
import shutil
import subprocess
import tempfile

MAX_CODE_BYTES = 200000
TIMEOUT = 8
TARGETS = ('7.0', '7.2', '7.4', '8.0', '8.1', '8.2', '8.3', '8.4')


class PhpCompatError(Exception):
    pass


ANALYZER = r'''<?php
$file = $argv[1];
$target = $argv[2];
$src = file_get_contents($file);
$tokens = token_get_all($src);
$out = array();
function add(&$out, $line, $sev, $msg, $hint) {
    $out[] = array('line' => $line, 'severity' => $sev, 'message' => $msg, 'hint' => $hint);
}
// имя => array(устарела с, удалена в, подсказка)
$funcs = array(
    'each' => array('7.2', '8.0', 'Используйте foreach.'),
    'create_function' => array('7.2', '8.0', 'Используйте анонимную функцию.'),
    '__autoload' => array('7.2', '8.0', 'Используйте spl_autoload_register().'),
    'money_format' => array('7.4', '8.0', 'Используйте NumberFormatter.'),
    'get_magic_quotes_gpc' => array('7.4', '8.0', 'Всегда возвращает false — условие можно убрать.'),
    'get_magic_quotes_runtime' => array('7.4', '8.0', 'Всегда возвращает false — условие можно убрать.'),
    'set_magic_quotes_runtime' => array('5.3', '7.0', 'Функция удалена, magic quotes больше нет.'),
    'convert_cyr_string' => array('7.3', '8.0', 'Используйте mb_convert_encoding().'),
    'hebrevc' => array('7.4', '8.0', 'Используйте nl2br(hebrev()).'),
    'ezmlm_hash' => array('7.4', '8.0', 'Функция не имеет замены.'),
    'restore_include_path' => array('7.4', '8.0', 'Используйте ini_restore(\'include_path\').'),
    'image2wbmp' => array('7.3', '8.0', 'Используйте imagewbmp().'),
    'png2wbmp' => array('7.2', '8.0', 'Используйте imagecreatefrompng + imagewbmp.'),
    'jpeg2wbmp' => array('7.2', '8.0', 'Используйте imagecreatefromjpeg + imagewbmp.'),
    'fgetss' => array('7.3', '8.0', 'Используйте fgets() + strip_tags().'),
    'gzgetss' => array('7.3', '8.0', 'Используйте gzgets() + strip_tags().'),
    'is_real' => array('7.4', '8.0', 'Используйте is_float().'),
    'call_user_method' => array('4.1', '7.0', 'Используйте call_user_func().'),
    'call_user_method_array' => array('4.1', '7.0', 'Используйте call_user_func_array().'),
    'sql_regcase' => array('5.3', '7.0', 'Функция удалена.'),
    'split' => array('5.3', '7.0', 'Используйте preg_split() или explode().'),
    'spliti' => array('5.3', '7.0', 'Используйте preg_split().'),
    'libxml_disable_entity_loader' => array('8.0', null, 'Внешние сущности по умолчанию отключены — вызов не нужен.'),
    'utf8_encode' => array('8.2', null, 'Используйте mb_convert_encoding() или iconv().'),
    'utf8_decode' => array('8.2', null, 'Используйте mb_convert_encoding() или iconv().'),
    'strftime' => array('8.1', null, 'Используйте date() или IntlDateFormatter.'),
    'gmstrftime' => array('8.1', null, 'Используйте gmdate() или IntlDateFormatter.'),
    'strptime' => array('8.1', null, 'Используйте date_parse_from_format().'),
    'date_sunrise' => array('8.1', null, 'Используйте date_sun_info().'),
    'date_sunset' => array('8.1', null, 'Используйте date_sun_info().'),
    'odbc_result_all' => array('8.1', null, 'Функция устарела.'),
    'mhash' => array('8.1', null, 'Используйте hash_hmac() и hash().'),
    'mhash_count' => array('8.1', null, 'Используйте hash_algos().'),
    'mhash_get_block_size' => array('8.1', null, 'Используйте hash_algos().'),
    'mhash_get_hash_name' => array('8.1', null, 'Используйте hash_algos().'),
    'mhash_keygen_s2k' => array('8.1', null, 'Используйте hash_pbkdf2().'),
);
$prefixes = array(
    'mysql_' => array('5.5', '7.0', 'Расширение mysql удалено. Используйте mysqli или PDO.'),
    'ereg' => array('5.3', '7.0', 'Функции ereg* удалены. Используйте preg_*.'),
    'mcrypt_' => array('7.1', '7.2', 'Расширение mcrypt удалено. Используйте openssl или sodium.'),
);
$consts = array(
    'FILTER_SANITIZE_STRING' => array('8.1', null, 'Используйте htmlspecialchars() или другой фильтр.'),
    'FILTER_SANITIZE_STRIPPED' => array('8.1', null, 'Используйте htmlspecialchars() или другой фильтр.'),
);
$features = array(
    'T_POW' => array('5.6', 'оператор **'),
    'T_ELLIPSIS' => array('5.6', 'оператор ...'),
    'T_COALESCE' => array('7.0', 'оператор ??'),
    'T_SPACESHIP' => array('7.0', 'оператор <=>'),
    'T_FN' => array('7.4', 'стрелочная функция fn'),
    'T_COALESCE_EQUAL' => array('7.4', 'оператор ??='),
    'T_MATCH' => array('8.0', 'выражение match'),
    'T_NULLSAFE_OBJECT_OPERATOR' => array('8.0', 'оператор ?->'),
    'T_ATTRIBUTE' => array('8.0', 'атрибуты #[...]'),
    'T_ENUM' => array('8.1', 'enum'),
    'T_READONLY' => array('8.1', 'модификатор readonly'),
);
$skip = array(T_WHITESPACE, T_COMMENT, T_DOC_COMMENT);
$sig = array();
foreach ($tokens as $t) {
    if (is_array($t) && in_array($t[0], $skip, true)) { continue; }
    $sig[] = $t;
}
$line = 1;
$seenFeature = array();
for ($i = 0, $n = count($sig); $i < $n; $i++) {
    $t = $sig[$i];
    $isArr = is_array($t);
    $id = $isArr ? $t[0] : null;
    $text = $isArr ? $t[1] : $t;
    if ($isArr) { $line = $t[2]; }

    foreach ($features as $const => $info) {
        if (defined($const) && $id === constant($const) && version_compare($target, $info[0], '<') && !isset($seenFeature[$const])) {
            $seenFeature[$const] = true;
            add($out, $line, 'error', 'Синтаксис «' . $info[1] . '» требует PHP ' . $info[0] . ' и новее', 'Целевая версия — ' . $target . '. Перепишите конструкцию без этой возможности.');
        }
    }
    if ($id === T_UNSET_CAST) { add($out, $line, version_compare($target, '8.0', '>=') ? 'error' : 'warn', 'Приведение (unset) удалено в PHP 8.0', 'Присвойте null напрямую.'); }
    if ($id === T_DOUBLE_CAST && stripos($text, 'real') !== false) { add($out, $line, version_compare($target, '8.0', '>=') ? 'error' : 'warn', 'Приведение (real) удалено в PHP 8.0', 'Используйте (float).'); }
    if ($id === T_OPEN_TAG && $text === '<?' ) { add($out, $line, 'warn', 'Короткий открывающий тег <?', 'Зависит от short_open_tag. Используйте <?php.'); }
    if ($id === T_DOLLAR_OPEN_CURLY_BRACES && version_compare($target, '8.2', '>=')) { add($out, $line, 'warn', 'Интерполяция "${var}" устарела с PHP 8.2', 'Используйте "{$var}".'); }
    if ($id === T_VARIABLE && $text === '$php_errormsg' && version_compare($target, '8.0', '>=')) { add($out, $line, 'error', '$php_errormsg удалена в PHP 8.0', 'Используйте error_get_last().'); }

    if ($id === T_STRING) {
        $name = strtolower($text);
        $prev = $i > 0 ? $sig[$i - 1] : null;
        $prevId = is_array($prev) ? $prev[0] : null;
        $next = $i + 1 < $n ? $sig[$i + 1] : null;
        $isCall = $next === '(' && !in_array($prevId, array(T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NEW, defined('T_NULLSAFE_OBJECT_OPERATOR') ? T_NULLSAFE_OBJECT_OPERATOR : -1), true);
        $isDef = $prevId === T_FUNCTION;
        if (($isCall || ($isDef && $name === '__autoload')) && isset($funcs[$name])) {
            $f = $funcs[$name];
            if ($f[1] !== null && version_compare($target, $f[1], '>=')) {
                add($out, $line, 'error', $text . '() удалена в PHP ' . $f[1], $f[2]);
            } elseif (version_compare($target, $f[0], '>=')) {
                add($out, $line, 'warn', $text . '() устарела с PHP ' . $f[0], $f[2]);
            }
        } elseif ($isCall) {
            foreach ($prefixes as $p => $f) {
                if (strpos($name, $p) === 0) {
                    if (version_compare($target, $f[1], '>=')) { add($out, $line, 'error', $text . '() удалена в PHP ' . $f[1], $f[2]); }
                    elseif (version_compare($target, $f[0], '>=')) { add($out, $line, 'warn', $text . '() устарела с PHP ' . $f[0], $f[2]); }
                    break;
                }
            }
        }
        $up = strtoupper($text);
        if (!$isCall && isset($consts[$up])) {
            $f = $consts[$up];
            if (version_compare($target, $f[0], '>=')) { add($out, $line, 'warn', 'Константа ' . $up . ' устарела с PHP ' . $f[0], $f[2]); }
        }
    }
    if ($id === T_CONSTANT_ENCAPSED_STRING && preg_match('/^[\'"]\/.*\/[a-z]*e[a-z]*[\'"]$/s', $text)) {
        if ($i > 1 && $sig[$i - 1] === '(' && is_array($sig[$i - 2]) && strtolower($sig[$i - 2][1]) === 'preg_replace' && version_compare($target, '7.0', '>=')) {
            add($out, $line, 'error', 'Модификатор /e в preg_replace удалён в PHP 7.0', 'Используйте preg_replace_callback().');
        }
    }
}
echo json_encode(array('issues' => $out), JSON_UNESCAPED_UNICODE);
'''


def find_php():
    path = os.environ.get('FV_PHP')
    if path and os.path.isfile(path):
        return path
    found = shutil.which('php') or shutil.which('php-cli')
    if found:
        return found
    # Запасной вариант для локальной разработки в OSPanel
    candidates = sorted(glob.glob(r'C:\OSPanell\modules\PHP-*\php.exe'), reverse=True)
    return candidates[0] if candidates else None


def _run(args, timeout=TIMEOUT):
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout, stdin=subprocess.DEVNULL, check=False)
    except subprocess.TimeoutExpired:
        raise PhpCompatError('Проверка заняла слишком много времени.')
    except OSError:
        raise PhpCompatError('Не удалось запустить PHP на сервере.')
    return proc.returncode, proc.stdout.decode('utf-8', errors='replace'), proc.stderr.decode('utf-8', errors='replace')


def check_code(code, target):
    target = (target or '').strip()
    if target not in TARGETS:
        raise PhpCompatError('Выберите версию PHP из списка.')
    if not code or not code.strip():
        raise PhpCompatError('Вставьте PHP-код для проверки.')
    raw = code.encode('utf-8')
    if len(raw) > MAX_CODE_BYTES:
        raise PhpCompatError('Код больше %d КБ.' % (MAX_CODE_BYTES // 1000))
    php = find_php()
    if not php:
        raise PhpCompatError('PHP на сервере недоступен: проверка невозможна.')

    folder = tempfile.mkdtemp(prefix='fv_php_')
    try:
        user_file = os.path.join(folder, 'code.php')
        analyzer_file = os.path.join(folder, 'scan.php')
        with open(user_file, 'wb') as handle:
            handle.write(raw)
        with open(analyzer_file, 'w', encoding='utf-8') as handle:
            handle.write(ANALYZER)

        base = [php, '-d', 'memory_limit=128M', '-d', 'max_execution_time=5',
        '-d', 'display_errors=1', '-d', 'html_errors=0']
        _, version_out, _ = _run([php, '-r', 'echo PHP_VERSION;'])
        php_version = version_out.strip()[:20]

        code_rc, lint_out, lint_err = _run(base + ['-l', user_file])
        syntax_errors = []
        for match in re.finditer(r'(?:PHP )?(Parse error|Fatal error):\s+(.+?) in .+? on line (\d+)', lint_out + '\n' + lint_err):
            syntax_errors.append({'line': int(match.group(3)), 'message': match.group(2).strip()})
        if code_rc != 0 and not syntax_errors:
            syntax_errors.append({'line': 0, 'message': 'php -l завершился с ошибкой.'})

        scan_rc, scan_out, scan_err = _run(base + [analyzer_file, user_file, target])
        issues = []
        try:
            issues = json.loads(scan_out).get('issues', [])
        except ValueError:
            if 'tokenizer' in (scan_out + scan_err).lower() or 'token_get_all' in (scan_out + scan_err):
                raise PhpCompatError('На сервере нет расширения PHP tokenizer.')
            raise PhpCompatError('Не удалось разобрать код токенизатором PHP.')
    finally:
        shutil.rmtree(folder, ignore_errors=True)

    issues.sort(key=lambda item: (item.get('line', 0), item.get('severity', '')))
    return {
        'target': target,
        'php_version': php_version,
        'syntax_ok': not syntax_errors,
        'syntax_errors': syntax_errors[:20],
        'issues': issues[:300],
    }
