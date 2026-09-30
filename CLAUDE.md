# VIVIVIC 서류관리

수입 발주 차수별 서류 진행 현황 도구. 구글 드라이브 `중국` 폴더의 파일명을 읽어
**거래처 · 차수 · 7단계**를 판정하고, 결과를 Firebase에 올려 팀이 함께 봅니다.
파일 본체는 옮기지 않고 목록만 다룹니다.

- 라이브: https://vivivic-cloud.github.io/vivivic-docs/
- 데모: 뒤에 `?demo=1`
- Firebase 프로젝트 `vivivic-4b7ef` (에이엠티 앱과 같은 계정)

## 명령

```sh
node --test test/*.test.mjs          # 파서 단위 테스트 (npm test)
npm run build:css                    # Tailwind 재빌드 (CDN 미사용)
python3 build-single.py              # dist/pages/index.html — Pages 배포본
python3 build-single.py --force-demo # dist/index.html — Artifact 공유용 데모
npm run dev                          # http://localhost:8080

clasp push -f                        # appsscript/ → Apps Script 프로젝트
clasp deploy --description "..."     # 웹앱 새 판 배포
clasp list-deployments               # 배포 목록
```

Apps Script 는 `clasp` 로 밀어넣습니다 (`.clasp.json` 에 scriptId).
코드를 고치면 `clasp push -f` → `clasp deploy` → 새 `/exec` 주소를 한 번 호출하면
`ensureUrl_()` 이 그 주소를 Firestore `docs_config/sync` 에 적어, 앱이 그걸 부릅니다.

## 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 전체. 모달·서랍·액션바가 전부 여기 있음 |
| `js/parse.js` | 파일명 → 거래처·차수·단계 판정. **순수 함수만.** 테스트 대상 |
| `js/fsaccess.js` | File System Access API, 폴더 핸들을 IndexedDB에 영속 |
| `js/firebase.js` | Auth·Firestore. SDK는 동적 import |
| `js/app.js` | 렌더링·필터·상세 서랍·미리보기·스캔 업로드 |
| `appsscript/sync.gs` | 드라이브를 10분마다 훑어 Firestore 갱신 (맥이 꺼져 있어도 돎) |
| `data/demo.json` | 데모 데이터. 거래처·제품명은 가명 |
| `build-single.py` | 멀티파일 → 단일 HTML 번들 |

Firestore 컬렉션은 `artifacts/vivivic-4b7ef/public/data/` 아래
`docs_files`(파일 목록) · `docs_overlay`(차수별 입력값) · `docs_rules`(사용자 규칙) 셋입니다.

## 알아둘 것

**동기화는 타이머가 아니라 앱이 부릅니다.** 앱을 켜거나 새로고침하면
`askSync()` 가 Firestore 에서 웹앱 주소를 읽어 한 번 부릅니다(1분에 한 번으로 제한).
Apps Script 는 드라이브를 훑어 지문을 떠 보고, 지난번과 같으면 Firestore 를 건드리지
않습니다 — 매번 전부 다시 쓰면 무료 한도를 넘고 브라우저마다 그걸 다시 받습니다.

**소스와 배포본이 같은 저장소에 있습니다.** `vivivic-cloud/vivivic-docs` 의 main 루트가
소스(`js/`, `css/`, `test/`, `appsscript/`, `index.html`, `build-single.py`)이고,
빌드 결과물은 `docs/index.html` 한 자리입니다.

**배포는 Actions가 아니라 Pages 브랜치 배포입니다. 소스는 main 브랜치의 `/docs`.**
`.github/workflows/pages.yml` 은 실제로 돌지 않습니다. `python3 build-single.py` 가
`docs/index.html` 을 직접 만드니, **커밋해서 밀면 그게 배포**입니다:

```sh
python3 build-single.py
git add -A && git commit -m "..." && git push
```

Pages 빌드는 1분쯤 걸립니다. `curl -s https://vivivic-cloud.github.io/vivivic-docs/ | grep -o 'tracking-wider">v[0-9.]*'`
로 버전이 바뀌었는지 확인합니다.

**버전 문자열은 `index.html` 안에 두 군데 있습니다** — 로그인 카드와 헤더의
`tracking-wider` 스팬. `checkForUpdate()` 가 배포본에서 이 문자열을 정규식으로 읽어
새 버전을 감지하므로, 판올림할 때 두 곳을 같이 고쳐야 합니다.

**서류에서 뽑는 규칙을 고치면 `sync.gs` 의 `READ_VERSION` 을 올립니다.**
`MARK_VERSION` 만 올리면 전체를 다시 훑기는 하지만, 파일별로 "이미 `cipl` 칸이 있다"고
보고 넘어가 정작 다시 읽지 않습니다. `READ_VERSION` 은 지문에도 들어가고 각 문서에
`cipl.v` 로 찍히므로, 이것만 올리면 전부 다시 읽습니다. 다 읽는 데 sync 를 서너 번
불러야 합니다(한 번에 4분까지만 읽고 나머지는 다음 호출로 미룹니다).

**사본은 없습니다. 작업 폴더는 `~/Projects/vivivic-docs` 하나뿐입니다.**
예전에 `~/Downloads` 에 있던 사본 둘은 2026-09-08 에 치웠습니다
(되돌리기 꾸러미: `~/.trash-vivivic/`).

**`~/Downloads`·`~/Documents` 에 두지 마세요.** 맥이 백그라운드로 도는 프로그램의
접근을 막아서, 바이글의 코드 보기 같은 것이 이 폴더를 못 읽습니다.

**보링 파일 알맹이를 내주는 갈래가 `doPost` 에 있습니다.**
`보링파일내주기_` · `보링아래인가_` · `BORING_SHARE_MAX` 셋입니다.
관리자가 썼습니다 — `1cc1ad2`, `@43` 으로 배포됨.
`doPost` 는 몸통의 `일` 이 `'보링파일'` 일 때만 이 갈래로 갑니다. 나머지는 여태처럼
`파일내주기_` 로 갑니다. 받는 것은 `{ 일, driveId }`, 돌려주는 것은 `{ ok, name, b64 }`.

**이 갈래는 로그인으로 잠그지 않습니다.** 폰에 로그인이 없어 잠그면 사장님이 못 쓰십니다.
자물쇠는 넷입니다 — **볼 폴더 아래만 · `.cix`·`.bpp` 만 · 2MB · 읽기만.**
**넷 가운데 하나도 빼지 마세요.** 그 넷이 여기 자물쇠 전부입니다.
`shareAllow` 를 이 갈래로 끌어오지 마세요 — 서류 쪽 파일째 보내기와 남입니다.
주소와 파일 번호를 둘 다 아는 사람은 그 폴더의 보링 파일을 읽을 수 있습니다.
사장님도 그렇게 아십니다.

**`보링아래인가_` 를 `중국아래인가_` 와 합치지 마세요. 뿌리가 다릅니다.**
`중국아래인가_` 는 `ROOT_FOLDER`(`중국`) 밑을 보고, `보링아래인가_` 는
`boring_config/설정` 의 `folder` 밑을 봅니다. 꼴만 같습니다.

**보링 갈래에서 드라이브에 쓰지 마세요.** 옮기기·이름바꾸기·지우기·공유설정 금지입니다.

## 화면 글자

**구구절절한 설명을 화면에 만들지 않습니다.** 알려야 할 것은 한두 낱말 딱지로 씁니다.
사장님이 2026-09-28 에 여러 번 짚으신 집 전체 규칙입니다.

- **남깁니다** — 한두 낱말 이름표·단추 이름·숫자 딱지 (「보내기」 「3벌」 「생산중」).
- **줄입니다** — 실수를 막아 주는 경고는 지우지 말고 한두 낱말로.
  「이 서류는 드라이브 주소가 없어 보낼 수 없습니다」 → 「주소 없음」
- **지웁니다** — 순전한 도움말·안내·까닭 늘어놓기. 문장으로 된 것.
- **화면에 같은 것이 두 번 나오면 뒤엣것을 지웁니다.** 위에서 고른 값을 밑에 다시
  늘어놓은 줄은, 낱말과 숫자뿐이어도 지웁니다.
- 되읊기라도 **값이 어긋날 때는 새 소식**입니다. 어긋날 때만 보입니다.
- 헷갈리면 **지웁니다**. 뜻이 사라지면 안 되고, 문장이 남으면 안 됩니다.
- 코드 주석은 그대로 둡니다 — 화면에 안 나옵니다.

고친 뒤에는 **낱말 뿌리로** 훑습니다(「습니다」「됩니다」「합니다」「주세요」「수 있」
「지 못했」「않았」「없습니다」). 문장 그대로 찾으면 놓칩니다.
원본과 `docs/index.html` **둘 다** 봐야 합니다.

## 코드 관례

- 주석·UI 문구는 한국어. 설명체가 아니라 **말하듯 짧게** 씁니다 ("~합니다").
- `js/parse.js` 에는 부수효과 없는 순수 함수만 둡니다. 브라우저와 Node 테스트 양쪽에서 그대로 씁니다.
- 판정 규칙을 건드리면 `test/parse.test.mjs` 에 케이스를 같이 추가합니다.
- 디자인 토큰은 에이엠티 앱과 맞춰 둡니다: `#37352f` / `#ededeb` / `#f1f1ef`, Inter, `rounded-2xl` 카드.
- 빌드 없이 브라우저에서 바로 도는 ESM. 번들러·프레임워크 없음.
