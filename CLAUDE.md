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
| `appsscript/sync.gs` | 드라이브를 훑어 Firestore 갱신. **앱이 부를 때만 돕니다** (10-15 사장님) |
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

**⚠ 값이 안 차면 스크립트가 드라이브 휴지통에 있는지 먼저 보세요.** 10-21 에 「VIVIVIC 서류 동기화」 가 휴지통에 들어가 있어 `/exec` 가 「Authorization needed」 만 냈습니다. 꺼내고 편집기에서 `sync` 를 네 번 실행해 다 읽었습니다(57 → 49 → 54 → 46건, 남은 것 0).

**2026-10-21 서버를 `clasp push -f` + 고정 배포 `@45` 로 밀었습니다** — 그 전까지 돌던 판은 `READ_VERSION 2`(09-22) 였습니다. `appsscript/붙여넣기.md` 는 이제 안 해도 됩니다. 익명 curl 은 예전 배포들도 403 입니다 — 앱은 로그인된 브라우저에서 부릅니다.

**차수 폴더 안 `검수/` · `샘플/` 은 서랍의 「5. 검수」 「6. 샘플」 칸입니다 (v0.70.0, 10-22).**
`parse.js` 의 `SUBDIRS` · `subdirOf(path)` 가 차수 폴더 **바로 밑** 이 두 폴더를 알아보고
`stageKey` 를 `inspect` / `sample` 로 줍니다 — 이름이 무엇이든 폴더가 이깁니다(사진이 상차로 새지 않게).
차수는 하나에 `b.sub` 로 따로 담기고 **7단계 진행·점·`done` 에는 안 셉니다.**
서랍에서는 상차이미지 바로 밑에 끼우고, 번호는 놓인 차례(1~9)로 붙입니다 — 그래서 잔액서류가 7, B/L 이 9 로 보입니다.
사진은 `photoGrid`, 나머지는 확장자 딱지 + 이름(`docLink`) → 누르면 원래 보기판·드라이브 열기.
서버(`sync.gs`)는 안 고쳤습니다 — `walk_` 가 이미 깊이 4까지 내려가 `거래처/차수/검수/파일` 을 읽습니다.
10-22 현재 두 폴더는 24곳(베이지아 3 · 제헤우드 21) 모두 비어 있습니다.

**제품관리 표 위에 검색칸이 있습니다 (v0.71.0, `cfd8f56`, 10-26).**
`index.html` 의 `#dpr-q` → `dprFind()`. `docsOpenProd()` 가 줄마다 `data-q` 에
CODE# · Product model(없으면 단품명) · 产品号 를 소문자로 붙여 두고, `dprFind` 가 거기서 찾아
`tr.hidden` · 거래처 덩이(`.dpr-g`) `hidden` 을 켭니다. `docsOpenProd` 끝에서 `dprFind()` 를 다시 불러
친 글자가 남아 있으면 다시 열어도 걸러진 채 뜹니다. 칸을 늘리면 `찾을글` 도 같이 고칩니다.
10-26 현재 `npm test` 에 `buildBatches — 잔액서류가 이미 있으면 추정으로 얹지 않는다` 하나가 깨져 있습니다(이 일과 무관, 그 전부터).

**차수 서랍 「7. 잔액서류」 에 「내용보기」 단추가 있습니다 (v0.72.0, `269e80f`, 10-26).**
서류가 있을 때만 `#ciplView` 가 뜨고, 누르면 `openCiplView()`(`js/app.js` renderDrawer 안)가
상세보기와 같은 팝업 `#diffView` 에 표를 그립니다. 값은 `docs단품(vendor)` 의 `차수들` 가운데
**그 차수 줄만** 남겨 넘깁니다 — 새로 뽑지 않습니다. 하나도 없으면 「읽은 값 없음」.
표는 `index.html` 의 `dpr표(codes)` 하나를 제품관리(`docsOpenProd`)와 같이 씁니다.
스타일도 `:is(#docs-prod, .dpr-pop) .dpr-t` 로 함께 — 팝업 쪽 감싸개 `.dpr-pop` 이 색 토큰·글꼴을 들고 있습니다
(`--vg-*` 토큰은 판들(`#docs-prod` 등)에만 걸려 있어 `#diffView` 안에서는 비기 때문). 칸을 바꾸면 `dpr표` 한 곳만.

**잔액서류 내용보기 팝업은 원본 양식 그대로입니다 (v0.73.0, `d4c777d`, 10-26).** 사장님 「잔액서류 내용보기 양식은 잔액서류의 양식을 따라야지」.
v0.72.0 의 제품관리 여덟 칸(`dpr표`)을 버리고, 서버 `원본표_(rows, sheet)` 가 **품목 표가 처음 나오는 시트**에서
머리줄(수량 칸 + 코드/이름 칸)부터 은행·`Signature` 글귀 앞까지를 `getDisplayValues()` 글자 그대로 떠
`cipl.sheet = { name, rows: [{c:[...]}], h, f }` 로 담습니다(빈 칸·빈 줄은 뺌). `h` 머리줄 수(베이지아는 「(PCS) CNY」 줄까지 2),
`f` 합계줄이 시작하는 자리(TOTAL 낱말 또는 코드·이름 칸이 빈 줄 — 제헤우드는 합계·Deposit·Balance 셋).
⚠ Firestore 는 배열 안 배열이 안 돼 줄마다 `{c:[]}` 로 감쌉니다. `READ_VERSION` 10 → 11.
`openCiplView()`(`js/app.js`)는 그 차수 「잔액서류」 단계 서류의 `cipl.sheet` 만 그립니다 — 같은 표 서류가 둘이면 하나, 다르면 파일 이름 딱지 밑에 따로.
모양은 `.dpr-t` 그대로, 합계줄만 `.dpr-pop .dpr-t tr.dpr-f` 로 굵게. `dpr표` 는 이제 제품관리만 씁니다.
서버는 **고정 배포 주소 그대로** `clasp deploy -i AKfycbx0V…` 로 `@46` 에 올렸습니다(주소가 안 바뀌어 `docs_config/sync` 손댈 것 없음).
`clasp run sync` 는 안 됩니다(API 실행 배포 없음 → NOT_FOUND). 대신 10-26 에는 **익명 `curl -sL <@45 주소>/exec` 가 200** 으로 sync 를 돌렸습니다(한 번 4-5분, 끝에 「파일 … · 서류 읽음 …건 · 시간 모자라 미룸 …건」). 여섯 번 불러 미룸 0 — 다 읽었습니다.

**잔액서류 내용보기 위에 CI · PL 시트 칩이 있습니다 (v0.74.0, `32c632d`, 10-26).** 사장님 「잔액 서류에는 항상 ci pl 두가지 시트가 있으니 내용보기에서도 두가지 시트필터로 보여줘」.
실제 파일(제헤우드 .xls/.xlsx · 베이지아 · 삐에노)은 시트 이름이 모두 `CI` · `PL` 입니다. `원본표_` 머리줄 찾기는 PL 에도 맞습니다(`CODE#`+`Qty pcs`, `Description of Goods`+`Quantity`).
서버 `ciplOf_` 가 이제 시트마다 `원본표_` 를 떠 **`cipl.sheets: [{name,rows,h,f}, …]`** 로 담습니다(예전 `cipl.sheet` 하나는 안 씀). `READ_VERSION` 11 → 12, 고정 배포 주소 그대로 `@47`.
`openCiplView(고른)`(`js/app.js`)는 서류들의 시트 이름을 모아 둘 이상이면 앱 필터 칩(`.chip chip-on/off`, 감싸개 `.dpr-tabs`)을 띄우고, 누르면 `openCiplView(이름)` 으로 다시 그립니다.
예전 판이 떠 둔 `cipl.sheet` 는 시트 하나로 읽으니, 다시 읽히기 전엔 칩 없이 CI 표만 보입니다.
⚠ `index.html` `.dpr-sn:first-child` 줄 끝에 떠돌던 `*/` 가 다음 `.dpr-pop{…}` 규칙(색 토큰·글꼴)을 통째로 버리게 하고 있어 같이 걷었습니다. CSS 에 주석 닫는 표만 남기지 마세요.

**⚠ 규칙 — 표를 새로 만들 때 가로 넘침은 공용 방법 `.vv-x` 로 표 안에서만 (사장님 10-26).** 「아 진짜 표만들때 가로스크롤좀 현위치에서 보이게 해주세요 전체화면 스크롤은 좀 만들지 말고」.
표를 감싸는 상자에 `class="vv-x"` 만 붙이면 됩니다 — `overflow-x-auto` 를 따로 쓰지 마세요. 페이지·팝업 전체 가로 스크롤 금지.
`index.html` 끝 스크립트(「표 가로 막대」)가 `.vv-x` 를 `.vv-xw` 로 감싸고 밑에 늘 보이는 막대 `.vv-xbar`(sticky bottom:0)를 붙입니다 —
긴 표 맨 밑까지 안 내려가도 지금 자리 화면 아래에 막대가 보입니다. 맥 트랙패드가 기본 막대를 숨기니 기본 막대는 끄고 직접 그립니다(끌기·누르기 됨, 넘칠 때만 보임).
다시 그려진 표는 MutationObserver 가 알아서 붙입니다. 쓰는 곳: 제품관리 · 잔액서류 내용보기 CI·PL · 변동 상세 두 표 · 엑셀 미리보기(v0.75.0, `5786bec`).

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
