/* ── 발주서 만들기 — 순수 함수 (11-06 사장님) ─────────────
   「발주하기 버튼으로 발주생성시 발주서 생성을 위해 제품선택을 해야 합니다. 제품선택은 해당업체 폴더에서
     한번이라도 발주된 제품을 선택하여 발주함에 넣는 방식으로 발주서를 만듭니다. 발주서는 거래처별 양식이 다르니
     해당 거래처의 대표양식을 업로드하면 해당 양식에 맞게 입력이 이뤄지도록 입력폼이 생성되어야 합니다.」
   여기는 부수효과 없는 함수만 둡니다(브라우저·Node 시험 양쪽). 화면은 js/app.js 「발주서 만들기」.
   ⚠ 틀(양식 분석 결과)에 칸 자리(r·c)를 남겨 둡니다 — 나중에 원본 양식에 값을 써 내보낼 때 씁니다.
   ⚠ 공개 저장소입니다. 시험·주석의 거래처·제품 이름은 가짜로 씁니다. */
import { 코드열쇠, 제품줄인가 } from './parse.js';
import { 대조숫자, 가격칸 } from './match.js';

const 최대줄 = 600, 최대칸 = 60;

/** 칸 이름 견주기 — 빈칸·문장부호를 뗀 소문자. */
export const 글칸 = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[\s.()（）:：#*/\\\-_,]+/g, '');

/* 칸 이름 → 역할. 위에서부터 봅니다 — 「ITEM NAME/COLOR」 는 이름, 「Carton Volume (CBM)」 은 cbm. */
const 역할표 = [
  ['no', /^(no|num|번호|순번|序号)$/],
  ['image', /image|이미지|사진|图片|picture|photo/],
  ['qty', /qty|quantity|수량|数量/],
  ['amount', /amount|금액|金额|총액|^total$|^합계$|totalprice|总价/],
  ['price', /price|단가|单价|^fob|가격|매입가/],
  ['cbm', /cbm|volume|체적|부피/],
  ['remark', /remark|비고|备注|^note|^memo/],
  ['code', /code|코드|품번|货号|itemno/],
  ['name', /itemname|productmodel|model|description|품명|상품명|제품명|단품명|品名|productname|goods|^name$/],
  ['color', /colou?r|색상|颜色|fabric/],
  ['size', /size|규격|사이즈|specif|^spec|dimension|尺寸/],
];
export function 칸역할(라벨) {
  const k = 글칸(라벨);
  return (k && 역할표.find(([, re]) => re.test(k))?.[0]) || '';
}

/* 제목 없는 칸의 화면 이름 (사장님 11-07) — 해피코 INVOICE 는 ITEM NO 옆 칸이 머리 글 없이 중국어 품명입니다.
   라벨·키는 안 건드립니다: 입력값은 고침[키] 에 있고, 라벨은 가격칸·표 끝 셈이 씁니다. 화면에 찍을 때만 이 이름을 씁니다.
   k.한자 — 새로 올린 틀은 true/false. 옛 틀은 값이 안 남아 undefined 라 자리만 봅니다. */
const 한자칸인가 = (값들) => {
  const 찬 = 값들.map((v) => String(v ?? '').trim()).filter(Boolean);
  return !찬.some((v) => /[\uac00-\ud7a3]/.test(v)) && 찬.filter((v) => /[\u4e00-\u9fff]/.test(v)).length * 2 > 찬.length;
};

/** 칸의 화면 이름. 제목이 있으면 그것, 없으면 ITEM NO 바로 오른쪽 입력 칸만 「중국어 품명」. */
export function 칸이름(칸, 틀) {
  if (칸.라벨) return 칸.라벨;
  if (칸.숨김 || 칸.역할 || 칸.식 || 칸.한자 === false) return '';
  const 왼 = 틀.칸.find((k) => k.c === 칸.c - 1);
  if (!왼 || 왼.숨김 || 왼.역할 !== 'code' || 글칸(왼.라벨) !== 'itemno') return '';
  return 틀.칸.some((k) => k.식?.includes(칸.c)) ? '' : '중국어 품명';
}

/** 품목표 머리인가 — 수량 칸 + 코드나 이름 칸, 그리고 칸이 셋 이상. */
function 머리줄인가(칸들) {
  const 역할들 = 칸들.map(칸역할);
  return 칸들.filter(Boolean).length >= 3 && 역할들.includes('qty') && (역할들.includes('code') || 역할들.includes('name'));
}

/* 엑셀 한 권 → 분석에 넘길 꼴. 숨긴 시트는 뺍니다. X 는 SheetJS. */
export function 워크북읽기(wb, X) {
  const 숨긴 = new Set((wb.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name));
  return wb.SheetNames.filter((n) => !숨긴.has(n) && wb.Sheets[n]?.['!ref']).map((name) => {
    const s = wb.Sheets[name];
    const 범위 = X.utils.decode_range(s['!ref']);
    const 끝줄 = Math.min(범위.e.r, 최대줄 - 1), 끝칸 = Math.min(범위.e.c, 최대칸 - 1);
    const rows = [], 식 = {};
    for (let r = 0; r <= 끝줄; r++) {
      const 줄 = [];
      for (let c = 0; c <= 끝칸; c++) {
        const cell = s[X.utils.encode_cell({ r, c })];
        줄.push(cell ? String(cell.w ?? cell.v ?? '').trim() : '');
        if (cell?.f) 식[`${r},${c}`] = String(cell.f);
      }
      rows.push(줄);
    }
    const 숨김 = (목록) => (목록 ?? []).flatMap((x, i) => (x?.hidden ? [i] : []));
    return { name, rows, 식, 숨긴칸: 숨김(s['!cols']), 숨긴줄: 숨김(s['!rows']), 합침: s['!merges'] ?? [] };
  });
}

/* 칸 식 — 같은 줄 칸끼리 곱한 것만 알아봅니다(=P16*I16). 나머지 식은 안 믿습니다. 칸 번호 목록을 돌려줍니다. */
const 칸번호 = (글) => [...글].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function 곱식(f, r) {
  const s = String(f ?? '').replace(/[\s$=]/g, '').toUpperCase();
  if (!/^[A-Z]+\d+(\*[A-Z]+\d+)+$/.test(s)) return null;
  const 조각 = s.split('*').map((x) => /^([A-Z]+)(\d+)$/.exec(x));
  if (조각.some((m) => Number(m[2]) - 1 !== r)) return null;
  return 조각.map((m) => 칸번호(m[1]));
}

const 합계말 = /^(s?\/?(sub)?total.*|합계.*|소계.*|총계.*|총합.*|合计.*|总计.*|deposit.*|balance.*|계약금.*|잔금.*|잔액.*)$/;
const 머리말 = /^(to|from|supplier|seller|buyer|vendor|consignee|shipper|attn|attention|tel|fax|email|contact|po|pono|ponumber|pino|orderno|ordernumber|contractno|invoiceno|date|orderdate|deliverydate|shipdate|loadingdate|duedate|remarks?|memo|note|받는곳|보내는곳|담당|담당자|거래처|공급사|발주번호|발주일|주문일|납기|납기일|상차일|비고|메모)$/;
const 제목말 = /^(purchaseorder|ordersheet|order|contract|proformainvoice|발주서|주문서|구매발주서|合同|订单)$/;
const 차수글 = /(?<![\d-])(\d{2})\s*-\s*(\d{1,2})(?![\d-])/;
const 날말 = /date|日期|일$|납기/, 번호말 = /no$|number|번호/;

export function 머리칸읽기(rows, 숨은줄, 숨은칸, 끝줄, 끝칸) {
  const 머리칸 = [], 고정 = [];
  let 제목 = '';
  const 키들 = new Set();
  const 넣기 = (라벨, 값, r, c) => {
    const 키 = 글칸(라벨);
    if (!키 || 키들.has(키)) return;
    키들.add(키);
    const k = 키.replace(/\d+$/, '');
    머리칸.push({ 키, 라벨: String(라벨).trim(), 값: String(값 ?? '').trim(), 종류: 날말.test(k) ? '날짜' : 번호말.test(k) ? '번호' : '', r, c });
  };
  for (let r = 0; r < 끝줄; r++) {
    if (숨은줄.has(r)) continue;
    const 줄 = (rows[r] ?? []).slice(0, 끝칸 + 1);
    const 찬칸 = 줄.flatMap((v, c) => (v && !숨은칸.has(c) ? [c] : []));
    for (let i = 0; i < 찬칸.length; i++) {
      const c = 찬칸[i];
      const 글 = 줄[c];
      const 다음 = 찬칸[i + 1];
      const 뒤글 = 다음 === undefined ? '' : 줄[다음];
      if (!제목 && 제목말.test(글칸(글))) { 제목 = 글; continue; }
      const m = /^([^:：\n]{1,24})[:：]\s*(.*)$/.exec(글);
      if (m && 글.length <= 60) {
        if (m[2]) { 넣기(m[1], m[2], r, c); continue; }
        // 값이 옆 칸 — 옆 칸이 또 이름표면 이 칸 값은 빈칸입니다
        const 비었나 = 뒤글 === '' || 머리말.test(글칸(뒤글)) || /[:：]$/.test(뒤글);
        넣기(m[1], 비었나 ? '' : 뒤글, r, 비었나 ? c + 1 : 다음);
        if (!비었나) i++;
        continue;
      }
      if (머리말.test(글칸(글))) {
        const 비었나 = 뒤글 === '' || 머리말.test(글칸(뒤글)) || /[:：]$/.test(뒤글);
        넣기(글, 비었나 ? '' : 뒤글, r, 비었나 ? c + 1 : 다음);
        if (!비었나) i++;
        continue;
      }
      if (글.length <= 40 && 차수글.test(글)) { 넣기('차수', 글, r, c); continue; }
      고정.push({ 글, r, c });
    }
  }
  return { 제목, 머리칸, 고정 };
}

/* 시트 하나 분석. 시트.힌트 = { r, 역할: { 칸: 역할 } } — 낱말로 못 찾은 표를 값으로 찾았을 때(js/form.js)만 넘어옵니다. */
export function 분석시트(시트) {
  const { rows, 식 = {}, 합침 = [], 힌트 } = 시트;
  const 숨은줄 = new Set(시트.숨긴줄 ?? []), 숨은칸 = new Set(시트.숨긴칸 ?? []);
  const 머리 = 힌트 ? 힌트.r : rows.findIndex((r, i) => !숨은줄.has(i) && 머리줄인가(r));
  if (머리 < 0) return null;
  const 역할글 = (라벨, c) => 힌트?.역할?.[c] ?? 칸역할(라벨);

  // 합친 칸은 위 왼쪽 글을 따릅니다 — 박스사이즈(K:M) 처럼 옆으로 합친 머리.
  const 머리글 = (r, c) => {
    const m = 합침.find((x) => x.s.r <= r && r <= x.e.r && x.s.c <= c && c <= x.e.c);
    return String((m ? rows[m.s.r]?.[m.s.c] : rows[r]?.[c]) ?? '').trim();
  };
  const 너비 = Math.max(...rows.slice(머리, 머리 + 2).map((r) => r.length));
  const 윗줄 = Array.from({ length: 너비 }, (_, c) => 머리글(머리, c));
  const 역할 = 윗줄.map(역할글);
  const 코드칸 = 역할.indexOf('code'), 이름칸 = 역할.indexOf('name');
  const 볼칸 = 코드칸 >= 0 ? 코드칸 : 이름칸;
  // 머리가 두 줄인가 — 세로로 합친 칸이 있거나, 밑줄의 코드·이름 칸이 비고 다른 칸에 글이 있으면.
  const 세로합침 = 합침.some((x) => x.s.r === 머리 && x.e.r > 머리);
  const 밑줄 = rows[머리 + 1] ?? [];
  const 수량머리 = 역할.indexOf('qty');
  const 두줄 = 세로합침 || (!String(밑줄[볼칸] ?? '').trim() && 밑줄.some((v) => v && 대조숫자(v) === null))
    || (수량머리 >= 0 && !!String(밑줄[수량머리] ?? '').trim() && 대조숫자(밑줄[수량머리]) === null);   // 수량 칸이 「(PCS)」 면 머리 둘째 줄
  const 시작 = 머리 + (두줄 ? 2 : 1);

  const 칸들 = [];
  const 키들 = new Set();
  // 머리 글이 있거나 밑으로 값이 있는 칸만
  for (let c = 0; c < 너비; c++) {
    const 위 = 윗줄[c];
    const 아래 = 두줄 ? 머리글(머리 + 1, c) : '';
    const 라벨 = 아래 && 아래 !== 위 ? `${위} ${아래}`.trim() : 위;
    const 값있나 = rows.slice(시작).some((r) => String(r[c] ?? '').trim());
    if (!라벨 && !값있나) continue;
    let 키 = 글칸(라벨) || `칸${c}`;
    for (let n = 2; 키들.has(키); n++) 키 = `${글칸(라벨) || `칸${c}`}~${n}`;
    키들.add(키);
    칸들.push({ 키, 라벨: 라벨.replace(/\s*\n\s*/g, ' ').trim(), 역할: 역할글(라벨, c) || '', c, 숨김: 숨은칸.has(c) || undefined });
  }
  if (!칸들.some((k) => k.역할 === 'qty')) return null;
  const 오른쪽끝 = Math.max(...칸들.filter((k) => k.라벨 || (힌트 && !k.숨김)).map((k) => k.c));
  // 표 밖 메모 칸(이름 없이 오른쪽에 적어 둔 것)은 뺍니다. 숨긴 칸은 식 재료라 둡니다.
  for (let i = 칸들.length - 1; i >= 0; i--) if (!칸들[i].라벨 && !칸들[i].숨김 && 칸들[i].c > 오른쪽끝) 칸들.splice(i, 1);

  // 품목 줄 — 코드·이름 칸이 비거나 합계 글이 나오면 끝. 빈 줄 하나쯤은 건넙니다.
  const 품목줄인가 = (i) => {
    const r = rows[i] ?? [];
    const 글들 = r.slice(0, 오른쪽끝 + 1).filter(Boolean);
    if (글들.some((v) => 합계말.test(글칸(v)))) return false;
    return !!(String(r[코드칸] ?? '').trim() || String(r[이름칸] ?? '').trim());
  };
  let 끝 = 시작;
  while (끝 < rows.length && (품목줄인가(끝) || (품목줄인가(끝 + 1) && !(rows[끝] ?? []).some(Boolean)))) 끝++;

  // 제목 없는 칸은 값이 한자인지 적어 둡니다 — 칸이름 이 씁니다. 틀에 값이 안 남아 여기서만 압니다.
  for (const k of 칸들) if (!k.라벨) k.한자 = 한자칸인가(rows.slice(시작, 끝).map((r) => r[k.c]));

  // 칸 식은 품목 줄 가운데 처음 나온 것
  for (const k of 칸들) {
    for (let i = 시작; i < 끝; i++) {
      const 곱 = 곱식(식[`${i},${k.c}`], i);
      if (곱) { k.식 = 곱; break; }
      if (식[`${i},${k.c}`]) break;
    }
  }

  // 합계 덩이 — 끝 뒤로 빈 줄을 하나 지날 때까지. 낱말에 30% 가 있으면 비율 줄입니다.
  const 합계 = [];
  let 뒤 = 끝, 빈 = 0;
  for (; 뒤 < rows.length && 빈 < 3; 뒤++) {
    const 줄 = (rows[뒤] ?? []).slice(0, 오른쪽끝 + 1);
    if (숨은줄.has(뒤)) continue;
    const 글들 = 줄.filter(Boolean);
    if (!글들.length) { 빈++; continue; }
    const 낱말 = 글들.find((v) => 대조숫자(v) === null) ?? '';
    if (낱말 && !합계말.test(글칸(낱말))) break;
    빈 = 0;
    const 퍼 = /(\d{1,3})\s*%/.exec(낱말);
    합계.push({ 라벨: 낱말, 비율: 퍼 ? Number(퍼[1]) / 100 : null, r: 뒤 });
  }

  // 아래 글 — 조건·은행 같은 줄. 줄마다 하나.
  const 아래 = [];
  for (let i = 뒤; i < rows.length && 아래.length < 40; i++) {
    if (숨은줄.has(i)) continue;
    const 글들 = (rows[i] ?? []).slice(0, 오른쪽끝 + 1).filter((v, c) => v && !숨은칸.has(c));
    if (!글들.length || 글들.every((v) => 대조숫자(v) !== null)) continue;
    아래.push({ 키: `줄${i}`, 글: 글들.join('  ').replace(/\s*\n\s*/g, ' ').slice(0, 300), r: i });
  }

  const { 제목, 머리칸, 고정 } = 머리칸읽기(rows, 숨은줄, 숨은칸, 머리, 오른쪽끝);
  return { v: 1, 시트: 시트.name, 제목, 머리줄: 머리, 시작, 끝, 칸: 칸들, 머리칸, 고정, 합계, 아래 };
}

/** 양식 분석 — 시트들 가운데 품목 줄이 가장 많은 시트. 품목표를 못 찾으면 null. */
export function 양식분석(시트들) {
  return (시트들 ?? []).map(분석시트).filter(Boolean)
    .sort((a, z) => (z.끝 - z.시작) - (a.끝 - a.시작))[0] ?? null;
}

const 기본머리 = ['PO NO', 'Order Date', 'Delivery Date', 'Remark'];

/** 이미 읽어 둔 발주서 표(cipl.sheets 한 장)로 틀 만들기 — 엑셀 양식이 없을 때(PDF). 머리칸은 기본 넷. */
export function 표로양식(t) {
  const 틀 = 양식분석([{ name: t?.name ?? '발주서', rows: (t?.rows ?? []).map((r) => r.c ?? r) }]);
  if (!틀) return null;
  틀.아래 = [];
  틀.머리칸 = 기본머리.map((라벨) => {
    const 키 = 글칸(라벨);
    return { 키, 라벨, 값: '', 종류: /date/.test(키) ? '날짜' : /no$/.test(키) ? '번호' : '', r: -1, c: -1 };
  });
  return 틀;
}

/** 머리칸 기본값 — 예전 발주의 번호·날짜를 그대로 두지 않습니다. 차수가 든 글은 새 차수로 바꾸고, 발주일은 오늘. */
export function 머리기본값(칸, { 차수 = '', 오늘 = '' } = {}) {
  const 값 = String(칸.값 ?? '');
  if (차수 && 차수글.test(값)) return 값.replace(차수글, 차수);
  if (칸.종류 === '날짜') return /order|발주|주문/.test(칸.키) ? 오늘 : '';
  if (칸.종류 === '번호') return '';
  return 값;
}

/** 표의 칸 찾기 — 머리 줄들을 이어 붙여 역할을 봅니다. */
function 표칸읽기(t) {
  const rows = (t?.rows ?? []).map((r) => r.c ?? r ?? []);
  const h = t?.h ?? 1;
  const 너비 = Math.max(0, ...rows.slice(0, h).map((r) => r.length));
  const 라벨 = Array.from({ length: 너비 }, (_, c) =>
    rows.slice(0, h).map((r) => String(r[c] ?? '').trim()).filter(Boolean).join(' '));
  const 역할 = 라벨.map(칸역할);
  return { rows, h, f: Math.min(t?.f ?? rows.length, rows.length), 라벨, 역할 };
}

/* 표 하나에서 코드 있는 줄을 뽑습니다. 수량 칸이 있는데 0·빈칸이면 주문 안 한 줄입니다(해피코 발주서는 제품을 다 늘어놓고 수량만 넣습니다). */
function 표줄들(t) {
  const { rows, h, f, 라벨, 역할 } = 표칸읽기(t);
  const 칸 = (r) => 역할.indexOf(r);
  if (칸('code') < 0) return [];
  const 줄들 = [];
  for (let i = h; i < f; i++) {
    const r = rows[i];
    const code = String(r[칸('code')] ?? '').trim();
    if (!code || !제품줄인가(code)) continue;
    const q = 칸('qty') < 0 ? null : 대조숫자(r[칸('qty')]);
    if (칸('qty') >= 0 && !(q > 0)) continue;
    const 값 = (k) => (칸(k) < 0 ? '' : String(r[칸(k)] ?? '').trim());
    const 칸값 = {};
    라벨.forEach((l, c) => { const v = String(r[c] ?? '').trim(); if (l && v) 칸값[글칸(l)] = v; });
    줄들.push({ code, name: 값('name'), color: 값('color'), size: 값('size'), price: 값('price'), qty: q, 칸: 칸값 });
  }
  return 줄들;
}

/** 그 거래처에서 한 번이라도 발주된 제품. 차수들 = [{ batch, year, no, 확정, docs }].
    발주서(확정이 있으면 그 장만)·잔액서류에서 읽어 둔 표로 셉니다 — 새로 안 읽습니다. 늦은 차수 값이 먼저입니다. */
export function 발주이력(차수들) {
  const 순서 = [...(차수들 ?? [])].sort((a, z) => (z.year ?? 0) - (a.year ?? 0) || (z.no ?? 0) - (a.no ?? 0));
  const 모음 = new Map();
  for (const b of 순서) {
    const 서류 = (b.docs ?? []).filter((d) => (d.stageKey === 'order' && (!b.확정 || d.path === b.확정 || !(b.docs ?? []).some((x) => x.path === b.확정))) || d.stageKey === 'cipl');
    서류.sort((a, z) => (a.stageKey === 'order' ? 0 : 1) - (z.stageKey === 'order' ? 0 : 1));
    const 본코드 = new Set();
    for (const d of 서류) {
      const 표들 = (d.cipl?.sheets ?? (d.cipl?.sheet ? [d.cipl.sheet] : [])).filter((t) => t?.rows?.length);
      const 줄들 = 표들.flatMap(표줄들);
      const 뽑은 = 줄들.length ? 줄들 : (d.cipl?.items ?? [])
        .filter((x) => 제품줄인가(String(x?.code ?? '').trim()))
        .map((x) => ({ code: String(x.code).trim(), name: String(x.name ?? '').trim(), color: (x.colors ?? []).join(' · '), size: String(x.size ?? ''), price: x.price == null ? '' : String(x.price), qty: x.qty ?? null, 칸: {} }));
      for (const x of 뽑은) {
        const 열쇠 = 코드열쇠(x.code);
        const 것 = 모음.get(열쇠);
        if (!것) 모음.set(열쇠, { 열쇠, ...x, 칸: { ...x.칸 }, 최근: b.batch, 차수수: 1 });
        else {
          for (const k of ['name', 'color', 'size', 'price', 'qty']) if ((것[k] === '' || 것[k] == null) && x[k] !== '' && x[k] != null) 것[k] = x[k];
          for (const [k, v] of Object.entries(x.칸)) if (!것.칸[k]) 것.칸[k] = v;
          if (!본코드.has(열쇠) && 것.최근 !== b.batch) 것.차수수 += 1;
        }
        본코드.add(열쇠);
      }
    }
  }
  return [...모음.values()].sort((a, z) => a.code.localeCompare(z.code));
}

/** 가장 늦은 차수의 발주서 표 — 양식이 없을 때 칸을 잡습니다. */
export function 최근발주표(차수들) {
  const 순서 = [...(차수들 ?? [])].sort((a, z) => (z.year ?? 0) - (a.year ?? 0) || (z.no ?? 0) - (a.no ?? 0));
  for (const b of 순서) for (const d of b.docs ?? []) {
    if (d.stageKey !== 'order') continue;
    const t = (d.cipl?.sheets ?? []).find((x) => x?.rows?.length && 표칸읽기(x).역할.includes('qty'));
    if (t) return t;
  }
  return null;
}

/** 발주함 줄 하나 — 담을 때 값을 떠 둡니다. 서류가 바뀌어도 쓰던 발주서는 안 바뀝니다. */
export function 담을줄(제품) {
  const { 열쇠, code, name, color, size, price, 칸, qty } = 제품;
  return { 열쇠, code, name, color, size, price, 칸: 칸 ?? {}, 옛수량: qty ?? null, qty: 0, 고침: {} };
}

/** 직접 추가한 줄(11-07 사장님) — 처음 발주하는 품목. 담을줄과 같은 꼴이고 코드·이름만 사람이 적습니다. 나머지는 빈칸. */
export const 직접줄 = () => ({ ...담을줄({ 열쇠: '', code: '', name: '' }), 직접: true });

/** 직접 줄의 코드·이름을 고칩니다. 줄 값이 한 곳에만 있게 발주서 칸의 고친 값은 걷습니다. */
export function 직접줄쓰기(줄, 갈래, 글, 틀) {
  줄[갈래] = 글;
  if (갈래 === 'code') 줄.열쇠 = 코드열쇠(글);
  const 칸 = 틀 && 주칸(틀, 갈래);
  if (칸) delete 줄.고침[칸.키];
}

/** 코드·이름·수량·고친 값이 다 빈 직접 줄 — 눌러만 둔 줄은 발주서로 안 넘깁니다. */
export const 빈직접줄 = (줄) => !!줄.직접 && !String(줄.code ?? '').trim() && !String(줄.name ?? '').trim()
  && !Number(줄.qty) && !Object.values(줄.고침 ?? {}).some((v) => String(v ?? '').trim());

const 자리수 = (s) => (/\.(\d+)/.exec(String(s ?? '').replace(/,/g, ''))?.[1].length ?? 0);
const 앞표 = (s) => /^[^\d-]*/.exec(String(s ?? '').trim())?.[0] ?? '';
const 숫자글 = (n, 자리) => n.toLocaleString('en-US', { minimumFractionDigits: 자리, maximumFractionDigits: 자리 });
const 주칸 = (틀, 역할) => 틀.칸.find((k) => k.역할 === 역할);

/* 곱할 칸 — 양식의 식이 먼저, 없으면 금액 = 단가 × 수량. */
function 곱칸(칸, 틀) {
  if (칸.식) return 칸.식;
  const p = 주칸(틀, 'price'), q = 주칸(틀, 'qty');
  return 칸.역할 === 'amount' && p && q ? [p.c, q.c] : null;
}
export const 계산칸인가 = (칸, 틀) => !!곱칸(칸, 틀);

/** 품목 줄의 칸 값. 계산 칸은 { 값, 계산: true } — 재료를 모르면 빈칸으로 돌려줘 사람이 넣습니다. */
export function 줄값(칸, 줄, i, 틀, 깊이 = 0) {
  const 곱 = 깊이 < 4 ? 곱칸(칸, 틀) : null;
  if (곱) {
    const 재료 = 곱.map((c) => 틀.칸.find((k) => k.c === c));
    const q = 주칸(틀, 'qty');
    const 값들 = 재료.map((k) => (k ? 대조숫자(줄값(k, 줄, i, 틀, 깊이 + 1).값) : null));
    const 모름 = 곱.some((c, n) => c !== q?.c && 값들[n] === null);
    const 돈칸 = 재료.find((k) => k?.역할 === 'price');
    const 본보기 = 돈칸 ? 줄값(돈칸, 줄, i, 틀, 깊이 + 1).값 : 줄.칸?.[칸.키];
    const 쓸표 = 앞표(본보기);
    const 자리 = 돈칸 ? Math.min(2, 자리수(본보기)) : Math.max(2, 자리수(줄.칸?.[칸.키]));
    // 재료를 모르는 칸(숨긴 낱개 CBM 처럼) — 그 제품 지난 값 ÷ 지난 수량 으로. 그것도 없으면 사람이 넣습니다.
    const 옛 = 대조숫자(줄.칸?.[칸.키]);
    const 낱개 = 옛 !== null && 줄.옛수량 > 0 && 곱.includes(q?.c) ? 옛 / 줄.옛수량 : null;
    if (모름 && 낱개 === null) return { 값: 줄.고침?.[칸.키] ?? '' };
    if (곱.includes(q?.c) && !(Number(줄.qty) > 0)) return { 값: '', 계산: true };
    const n = 모름 ? 낱개 * Number(줄.qty) : 값들.reduce((a, c) => a * c, 1);
    return { 값: 쓸표 + 숫자글(n, 자리), 계산: true };
  }
  if (칸.역할 === 'no') return { 값: String(i + 1), 계산: true };
  if (칸.역할 === 'qty' && 칸 === 주칸(틀, 'qty')) return { 값: 줄.qty ? String(줄.qty) : '' };
  if (줄.고침?.[칸.키] != null) return { 값: 줄.고침[칸.키] };
  if (칸.역할 === 'code' && 칸 === 주칸(틀, 'code')) return { 값: 줄.code };
  if (칸.역할 === 'remark' || 칸.역할 === 'qty' || 칸.역할 === 'amount') return { 값: '' };
  const 같은칸 = 줄.칸?.[칸.키];
  if (같은칸) return { 값: 같은칸 };
  if (칸 === 주칸(틀, 칸.역할)) {
    if (칸.역할 === 'name') return { 값: 줄.name ?? '' };
    if (칸.역할 === 'color') return { 값: 줄.color ?? '' };
    if (칸.역할 === 'size') return { 값: 줄.size ?? '' };
    if (칸.역할 === 'price') return { 값: 줄.price ?? '' };
  }
  return { 값: '' };
}

/** 합계 줄 — 수량 칸과 계산 칸을 더합니다. 키 → 글 + 비율 줄. */
export function 발주합계(틀, 줄들) {
  const 칸값 = {};
  let 금액 = null, 금액글 = '';
  for (const k of 틀.칸) {
    const 수량칸 = k.역할 === 'qty' && k === 주칸(틀, 'qty');
    if (!수량칸 && !계산칸인가(k, 틀)) continue;
    let 합 = 0, 표 = '', 자리 = 0, 있나 = false;
    (줄들 ?? []).forEach((줄, i) => {
      const v = 줄값(k, 줄, i, 틀).값;
      const n = 대조숫자(v);
      if (n === null) return;
      있나 = true; 합 += n; 표 ||= 앞표(v); 자리 = Math.max(자리, 자리수(v));
    });
    if (!있나) continue;
    칸값[k.키] = 표 + 숫자글(합, 자리);
    if (k === 주칸(틀, 'amount')) { 금액 = 합; 금액글 = 표; }
  }
  const 비율줄 = (틀.합계 ?? []).filter((x) => x.비율 != null && 금액 !== null)
    .map((x) => ({ 라벨: x.라벨, 값: 금액글 + 숫자글(금액 * x.비율, 2) }));
  return { 칸: 칸값, 비율줄 };
}

/** 틀에서 가격으로 볼 칸의 키들 — 역할과 가격칸(v0.99.0) 규칙 둘 다. */
export function 가격칸키(틀) {
  const 보임 = 틀.칸;
  const { 칸 } = 가격칸({ rows: [보임.map((k) => k.라벨)], h: 1 });
  return new Set(보임.flatMap((k, i) => (칸.has(i) || k.역할 === 'price' || k.역할 === 'amount' ? [k.키] : [])));
}

/** 내보내기용 값 — 나중에 원본 양식에 쓸 때 이걸 쓰면 됩니다(r·c 자리 포함). */
export function 발주서값(틀, 판) {
  return {
    머리: 틀.머리칸.map((k) => ({ r: k.r, c: k.c, 값: 판.머리?.[k.키] ?? '' })),
    시작: 틀.시작,
    줄: (판.줄 ?? []).map((줄, i) => 틀.칸.map((k) => ({ c: k.c, 값: 줄값(k, 줄, i, 틀).값 }))),
    아래: 틀.아래.map((x) => ({ r: x.r, 값: 판.아래?.[x.키] ?? x.글 })),
  };
}
