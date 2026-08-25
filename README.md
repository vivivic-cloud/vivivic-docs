# VIVIVIC 서류관리

수입 발주 차수별 서류 진행 현황을 한 화면에서 보는 도구입니다.
구글 드라이브의 `중국` 폴더를 읽어 파일명으로 **거래처 · 차수 · 7단계**를 판정하고,
결과를 Firebase에 올려 팀이 함께 봅니다. 파일 본체는 옮기지 않습니다.

- 라이브: `https://vivivic-cloud.github.io/vivivic-docs/`
- 데모: 뒤에 `?demo=1` — 로그인 없이 둘러봅니다.
- 로그인: 에이엠티 앱과 **같은 Firebase 계정**(프로젝트 `vivivic-4b7ef`)

## 무엇을 해주나

| | |
|---|---|
| 차수 인식 | `AMT(ZH)26-18`, `제헤우드 26-14차`, `ZEHE-ING26 -15`, `AMT2026-19` 등 여러 표기를 하나로 묶습니다 |
| 7단계 판정 | 발주서 → 계약금서류(PI 30%) → 계약금영수증 → 상차이미지 → 잔액서류(CI&PL 70%) → 잔액입금영수증 → 선하증권 |
| 이상 감지 | 영수증만 있고 원본이 없는 경우, 앞단계를 건너뛴 경우, 같은 파일이 여러 벌 저장된 경우 |
| 직접 입력 | 계약 총액 · 실출하 총액 · 컨테이너 번호 · 출항/도착일 · 마감일 · 메모 |
| 서류 열기 | 목록에서 누르면 원본 PDF·엑셀이 새 탭에서 열립니다 |

## 데이터가 흐르는 길

```
구글 드라이브 (원본 PDF·엑셀, 그대로 둠)
        │  맥 Chrome에서 "드라이브 스캔" 한 번
        ▼
Firestore  artifacts/vivivic-4b7ef/public/data/
        ├── docs_files    파일 목록 (이름·경로·크기·수정일)
        └── docs_overlay  차수별 입력값 (금액·컨테이너·일정·메모)
        │  실시간 구독(onSnapshot)
        ▼
브라우저 — 폰이든 PC든 로그인만 하면 바로 보임
```

스캔은 **맥·PC Chrome에서 한 번**만 하면 됩니다. 그 뒤로는 누구나 어디서든 조회·입력할 수 있고, 입력값은 실시간으로 공유됩니다.
원본 PDF를 여는 건 폴더 권한이 살아 있는 기기에서만 됩니다.

## 구조

```
index.html            화면 (VIVIVIC 공통 디자인 토큰)
css/app.css           빌드된 Tailwind (CDN 미사용)
js/parse.js           파일명 → 거래처·차수·단계 판정 (순수 함수, 테스트 대상)
js/fsaccess.js        File System Access API + 폴더 핸들 영속화
js/firebase.js        Auth·Firestore (SDK는 동적 import)
js/app.js             렌더링·필터·상세 서랍·스캔 업로드
data/demo.json        데모 데이터 (거래처·제품명은 가명)
test/parse.test.mjs   파서 단위 테스트
build-single.py       단일 HTML 번들 빌드
dist/pages/index.html 배포본 (이 폴더를 Pages 루트로)
```

## 개발

```sh
npm test              # 파서 단위 테스트
npm run build:css     # Tailwind 다시 빌드
python3 build-single.py               # Pages 배포본
python3 build-single.py --force-demo  # 공유용 데모 단일 파일
npm run dev           # http://localhost:8080
```

`main` 에 push하면 Actions가 테스트를 돌리고 통과하면 Pages로 배포합니다.

## 제약

- **폴더 스캔**은 Chrome / Edge 데스크톱에서만 됩니다. 조회는 어느 브라우저에서나 됩니다.
- 판정은 파일명 규칙에 의존합니다. 규칙에서 벗어난 파일은 "분류하지 못한 파일"로 따로 모입니다.
- 새 파일이 생기면 스캔을 다시 눌러야 합니다. Drive API로 자동 동기화하는 건 다음 단계입니다.

## 통합 예정

VIVIVIC 통합 발주 시스템(에이엠티 앱)의 네 번째 탭으로 합쳐질 예정입니다.
헤더·색상·컴포넌트를 그쪽과 동일하게 맞춰 두었습니다 (`#37352f` / `#ededeb` / `#f1f1ef`, Inter, rounded-2xl 카드).
