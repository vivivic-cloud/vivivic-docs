#!/usr/bin/env python3
"""
멀티파일 앱을 단일 HTML로 묶습니다.

- 기본         → docs/index.html       (GitHub Pages 가 보는 자리. 커밋하면 그게 배포입니다)
- --force-demo → dist/index.html        (Artifact 공유용, 로그인 없이 데모)

<!doctype>/<html>/<head>/<body> 껍데기는 빼고 내용만 남깁니다.
Artifact는 알아서 감싸고, Pages용은 wrap()이 감쌉니다.
"""
import json
import re
import subprocess
import sys
import pathlib

ROOT = pathlib.Path(__file__).parent
FORCE_DEMO = '--force-demo' in sys.argv

IMPORT_RE = re.compile(r'^import\s+[\s\S]*?from\s+[\'"]([^\'"]+)[\'"];\s*$', re.M)

hoisted = []


def strip_imports(src):
    """외부(https) import는 위로 끌어올리고, 로컬 import는 지웁니다."""
    def take(m):
        if m.group(1).startswith('http'):
            hoisted.append(m.group(0))
        return ''
    return IMPORT_RE.sub(take, src)


def module(path, ns):
    """ESM 파일을 IIFE 네임스페이스로 바꿉니다."""
    src = (ROOT / path).read_text(encoding='utf-8')
    names = re.findall(r'^export\s+(?:const|function|let|class|async function)\s+([A-Za-z_$][\w$]*)', src, re.M)
    src = strip_imports(src)
    src = re.sub(r'^export\s+', '', src, flags=re.M)
    return f'const {ns} = (() => {{\n{src}\nreturn {{ {", ".join(sorted(set(names)))} }};\n}})();\n'


# Tailwind는 쓰는 클래스만 골라 담습니다. 화면을 고치고 CSS를 다시 안 빌드하면
# 새 클래스가 통째로 빠진 채 배포됩니다 — 눈으로는 "왜 격자가 안 되지" 로만 보입니다.
# (mtime 으로는 못 잡습니다. tailwind 는 내용이 같으면 파일을 건드리지 않습니다.)
css_file = ROOT / 'css' / 'app.css'
tw = ROOT / 'node_modules' / '.bin' / 'tailwindcss'
if tw.exists():
    subprocess.run(
        [str(tw), '-c', 'tailwind.config.js', '-i', 'css/src.css', '-o', 'css/app.css', '--minify'],
        cwd=ROOT, check=True, capture_output=True,
    )
else:
    print('!! tailwindcss 가 없습니다 — npm install 후 다시 빌드하세요. CSS가 낡았을 수 있습니다.')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = css_file.read_text(encoding='utf-8')
demo = json.loads((ROOT / 'data' / 'demo.json').read_text(encoding='utf-8'))

# 순서가 중요합니다: hoisted 를 채운 뒤에 이어붙입니다.
mods = module('js/parse.js', 'PARSE') + module('js/fsaccess.js', 'FS') + module('js/firebase.js', 'DB')

app = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')
# app.js 가 parse.js 에서 가져오는 이름들을 그대로 PARSE 에서 꺼내 씁니다.
named = re.search(r"import\s*\{([^}]*)\}\s*from\s*'\./parse\.js';", app)
picks = named.group(1).strip() if named else 'STAGES, buildBatches'
app = strip_imports(app)
app = f'const {{ {picks} }} = PARSE;\n' + app

bundle = (
    '\n'.join(dict.fromkeys(hoisted))
    + f'\nconst SINGLE_FILE = {str(FORCE_DEMO).lower()};\n'
    + f'const DEMO = {json.dumps(demo, ensure_ascii=False)};\n'
    + mods
    + app
)

xlsx_lib = (ROOT / 'js' / 'vendor' / 'xlsx.full.min.js').read_text(encoding='utf-8')

body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
head = re.search(r'<head[^>]*>(.*)</head>', html, re.S).group(1)
head = head.replace('<link rel="stylesheet" href="./css/app.css" />', f'<style>{css}</style>')
head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>', '', head)
body = re.sub(
    r'\s*<script src="\./js/vendor/xlsx\.full\.min\.js"></script>\s*<script type="module" src="\./js/app\.js"></script>',
    '',
    body,
)

inner = head + body + f'<script>{xlsx_lib}</script>\n' + f'<script type="module">\n{bundle}\n</script>\n'

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
pages = dist / 'pages'
pages.mkdir(exist_ok=True)

if FORCE_DEMO:
    # Artifact 공유용: 껍데기 없이, 로그인 없이 데모로 바로 진입
    out = dist / 'index.html'
    out.write_text(inner, encoding='utf-8')
else:
    # GitHub Pages용: 완전한 문서, 로그인 화면부터.
    # Pages 가 main/docs 를 보므로 여기에 바로 씁니다 — 커밋·푸시가 곧 배포입니다.
    docs = ROOT / 'docs'
    docs.mkdir(exist_ok=True)
    out = docs / 'index.html'
    out.write_text(
        '<!doctype html>\n<html lang="ko">\n<head>\n'
        '<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        + inner + '\n</html>\n',
        encoding='utf-8',
    )
    (docs / '.nojekyll').write_text('', encoding='utf-8')

print(f'{out} · {out.stat().st_size // 1024} KB')
