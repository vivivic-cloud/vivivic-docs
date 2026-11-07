/* ── 서류 구성 분석 — 순수 함수 (사장님 11-07) ─────────────
   「대표양식 올리기 저런 낱말 더하기가 아니라 실제 양식을 업로드 하면 분석해서
     해당업체의 각 서류들이 어떻게 구성되어 있는지 정확히 파악하라는 말이야」
   올린 파일 전체를 시트마다 훑어 구성을 만듭니다 — 시트 · 품목표 자리 · 칸마다 뜻 · 머리칸(번호·날짜·거래처) · 합계·부속 줄 · 숨긴 칸.
   칸 뜻은 머리 글로 먼저 짐작하고, **값의 모양과 칸끼리의 셈(금액 = 수량 × 단가)** 으로 고칩니다. 제목 없는 칸도 값으로 읽힙니다.
   그 구성이 ① 서류 종류 감지(구성맞대기) ② 품목 읽기(구성품목) 에 그대로 쓰입니다. 화면은 js/app.js 「대표양식」.
   ⚠ 공개 저장소입니다. 시험·주석의 거래처·제품 이름은 가짜로 씁니다. 실물 재기는 저장소 밖에서. */
import { 분석시트, 글칸, 머리칸읽기 } from './order.js';
import { 대조숫자, 가격칸 } from './match.js';
import { 제품줄인가, classify } from './parse.js';

export const 구성판 = 1;
const 샘플수 = 2, 글귀수 = 6;

/* 칸 뜻 — 화면에 찍는 이름. 빈 값은 「모름」. */
export const 뜻말 = {
  no: '번호', code: '코드', alt: '거래처 번호', pno: '产品号', name: '품명', cn: '중국어 품명', marks: '화인',
  color: '색상', size: '규격', material: '재질', image: '사진',
  qty: '수량', price: '단가', amount: '금액', money: '돈(기타)',
  ctn: '박스 수', perctn: '입수', packsize: '포장 규격', packing: '포장', cbm: 'CBM', tcbm: '총 CBM', nw: '순중량', gw: '총중량',
  remark: '비고', '': '모름',
};
export const 뜻차례 = ['code', 'name', 'cn', 'qty', 'price', 'amount', 'alt', 'pno', 'no', 'color', 'size', 'material', 'ctn', 'perctn', 'packsize', 'packing', 'cbm', 'tcbm', 'nw', 'gw', 'marks', 'image', 'money', 'remark', ''];
export const 돈뜻 = new Set(['price', 'amount', 'money']);
export const 머리뜻말 = { 번호: '번호', 날짜: '날짜', 거래처: '거래처', 차수: '차수', '': '글' };

/* 머리 글로 먼저 짐작하는 표 — 위에서부터. 값이 뒤에서 고칩니다. 맞대기에는 이 표를 안 쓰고 양식에 적힌 글 그대로를 씁니다. */
const 뜻표 = [
  ['no', /^(no|num|sn|seq|번호|순번|序号)$/],
  ['image', /image|이미지|사진|图片|picture|photo/],
  ['marks', /^marks?|唛头|화인/],
  ['perctn', /pcsctn|pcsperctn|qtyctn|입수|装箱数/],
  ['ctn', /qtycarton|^ctns?$|^cartons?$|^qtyctns?$|箱数|박스수/],
  ['tcbm', /totalcbm|measurement|총cbm|总立方|총부피|헤보트/],
  ['cbm', /cbm|volume|체적|부피|立方/],
  ['nw', /^nw|netweight|净重|순중량/],
  ['gw', /^gw|grossweight|毛重|총중량/],
  ['packsize', /packingsize|포장규격|外箱|카톤규격|박스사이즈/],
  ['packing', /^packing(ctns?)?$/],
  ['qty', /qty|quantity|수량|数量/],
  ['amount', /amount|금액|金额|총액|^total$|^합계$|totalprice|总价/],
  ['price', /price|단가|单价|^fob|가격|매입가/],
  ['money', /환율|운임|세금/],
  ['remark', /remark|비고|备注|^note|^memo/],
  ['alt', /^zh$|^mfgno$/],
  ['pno', /产品号|产品编/],
  ['code', /code|코드|품번|货号|itemno/],
  ['name', /itemname|productmodel|model|description|품명|상품명|제품명|단품명|品名|productname|goods|^name$/],
  ['material', /mater|matral|재질|材质/],
  ['color', /colou?r|색상|颜色|fabric/],
  ['size', /size|규격|사이즈|specif|^spec|dimension|尺寸/],
];
const 첫뜻 = (라벨) => { const k = 글칸(라벨); return (k && 뜻표.find(([, re]) => re.test(k))?.[0]) || ''; };

const 찬값 = (값들) => 값들.map((v) => String(v ?? '').trim()).filter(Boolean);
const 과반 = (값들, 시험) => 값들.length > 0 && 값들.filter(시험).length * 2 > 값들.length;
const 한글 = /[가-힣]/, 한자 = /[一-鿿]/;
// 대조숫자는 앞 기호 넉 자를 떼어 AA-1 도 숫자로 읽습니다. 칸의 값을 가릴 때는 글자로 시작하면 숫자가 아닙니다.
const 숫자인가 = (v) => /^(CNY|USD|RMB)?[^\dA-Za-z\u3131-\ud7a3\u4e00-\u9fff]{0,3}\s*-?\d[\d,]*(\.\d+)?\s*[%A-Za-z]{0,4}$/.test(String(v ?? '').trim()) && 대조숫자(v) !== null;
const 코드꼴 = (v) => v.length <= 24 && /^[A-Za-z0-9][\w\u2581\-./*+#]*$/.test(v);

/** 값만 보고 칸 뜻을 짐작합니다. */
function 값뜻(값들) {
  const 찬 = 찬값(값들);
  if (!찬.length) return '';
  if (찬.every((v) => /^\d+$/.test(v)) && 찬.every((v, i) => i === 0 || Number(v) >= Number(찬[i - 1]))
    && Number(찬.at(-1)) - Number(찬[0]) === 찬.length - 1 && 찬.length > 1) return 'no';
  if (찬.every(숫자인가)) return '';                 // 숫자 칸은 셈으로 가립니다(뜻고치기)
  if (!찬.some((v) => 한글.test(v)) && 과반(찬, (v) => 한자.test(v))) return 'cn';
  if (과반(찬, (v) => 코드꼴(v) && /[A-Za-z]/.test(v))) return 'code';
  if (과반(찬, (v) => 한글.test(v) || /[A-Za-z]{2,}\s+\S/.test(v))) return 'name';
  return '';
}

/* 곱셈 관계를 찾습니다 — 금액 = 수량 × 단가. 맞은 줄 수를 돌려줍니다. */
function 곱맞음(a, b, c) {
  let 맞음 = 0, 전체 = 0;
  for (let i = 0; i < c.length; i++) {
    if (a[i] === null || b[i] === null || c[i] === null) continue;
    전체++;
    if (Math.abs(a[i] * b[i] - c[i]) <= Math.max(0.011, Math.abs(c[i]) * 0.006)) 맞음++;
  }
  return { 맞음, 전체 };
}

/* 뜻 고치기 — 값이 머리 글을 이깁니다. 칸마다 { 뜻, 출처 } 를 남깁니다. */
function 뜻고치기(칸들, 값칸) {
  for (const k of 칸들) {
    if (k.숨김) { k.뜻 = 첫뜻(k.라벨); k.출처 = k.뜻 ? '머리' : ''; continue; }
    const 값 = 값칸(k.c);
    const 머리 = 첫뜻(k.라벨), 값쪽 = 값뜻(값);
    let 뜻 = 머리, 출처 = 머리 ? '머리' : '';
    if (!머리 && 값쪽) { 뜻 = 값쪽; 출처 = '값'; }
    else if (머리 === 'code' && 값쪽 === 'no') { 뜻 = 'no'; 출처 = '값'; }    // 번호뿐인 ITEM NO 는 줄 번호입니다
    else if (머리 === 'name' && 값쪽 === 'code' && !칸들.some((x) => 첫뜻(x.라벨) === 'code')) { 뜻 = 'code'; 출처 = '값'; }   // 설명 칸에 코드를 적는 양식
    k.뜻 = 뜻; k.출처 = 출처;
  }
  const 보임 = 칸들.filter((k) => !k.숨김);
  // 숫자 칸의 셈 — 이름을 모르는 칸도 곱셈으로 뜻이 납니다.
  const 숫자칸 = 보임.filter((k) => { const v = 찬값(값칸(k.c)); return v.length && v.every(숫자인가); });
  const 수 = new Map(숫자칸.map((k) => [k.c, 값칸(k.c).map((v) => 대조숫자(v))]));
  const 검산 = [];
  const 칸뜻 = (t) => 숫자칸.filter((k) => k.뜻 === t);
  const 금액 = 칸뜻('amount')[0], 수량 = 칸뜻('qty')[0], 단가 = 칸뜻('price')[0];
  if (금액 && 수량 && 단가) {
    const r = 곱맞음(수.get(수량.c), 수.get(단가.c), 수.get(금액.c));
    if (r.전체) 검산.push({ 이름: '금액 = 수량 × 단가', ...r });
  } else {
    for (const c of 숫자칸) for (const a of 숫자칸) for (const b of 숫자칸) {
      if (a.c >= b.c || c === a || c === b) continue;
      const r = 곱맞음(수.get(a.c), 수.get(b.c), 수.get(c.c));
      if (r.전체 < 2 || r.맞음 < r.전체 * 0.8) continue;
      const 정수칸 = (k) => 찬값(값칸(k.c)).every((v) => !/\.\d/.test(v));     // 2.00 은 돈입니다 — 값이 아니라 적힌 꼴로 봅니다
      const 정수a = 정수칸(a), 정수b = 정수칸(b);
      if (정수a === 정수b || !(c.뜻 === '' || c.뜻 === 'amount')) continue;
      const [q, p] = 정수a ? [a, b] : [b, a];
      for (const [k, 뜻] of [[q, 'qty'], [p, 'price'], [c, 'amount']]) if (!k.뜻) { k.뜻 = 뜻; k.출처 = '셈'; }
      검산.push({ 이름: '금액 = 수량 × 단가', ...r });
      return 검산;
    }
  }
  // 그래도 수량 칸을 모르면 — 정수뿐인 칸이 하나일 때만
  if (!칸뜻('qty').length) {
    const 정수 = 숫자칸.filter((k) => !k.뜻 && 찬값(값칸(k.c)).every((v) => !/\.\d/.test(v)));
    if (정수.length === 1) { 정수[0].뜻 = 'qty'; 정수[0].출처 = '값'; }
  }
  return 검산;
}

/* 낱말로 표를 못 찾은 시트 — 값으로 찾습니다. 머리 후보 = 글자 칸이 셋 이상인 줄, 그 밑으로 같은 칸이 차고 숫자 칸이 있는 줄이 이어져야 합니다. */
function 값으로표찾기(시트) {
  const { rows } = 시트;
  const 숨은줄 = new Set(시트.숨긴줄 ?? []);
  let 최고 = null;
  for (let r = 0; r < rows.length - 2; r++) {
    if (숨은줄.has(r)) continue;
    const 머리칸 = rows[r].flatMap((v, c) => (v && !숫자인가(v) && v.length <= 40 ? [c] : []));
    if (머리칸.length < 3) continue;
    let n = 0;
    for (let i = r + 1; i < rows.length && n < 300; i++) {
      const 찬 = 머리칸.filter((c) => rows[i]?.[c]);
      const 숫자 = 찬.filter((c) => 숫자인가(rows[i][c]));
      if (찬.length * 2 < 머리칸.length || !숫자.length || 숫자.length === 찬.length) break;
      n++;
    }
    if (n >= 2 && (!최고 || n > 최고.n)) 최고 = { r, n, 머리칸 };
  }
  if (!최고) return null;
  const 값 = (c) => rows.slice(최고.r + 1, 최고.r + 1 + 최고.n).map((x) => x[c]);
  const 칸들 = 최고.머리칸.map((c) => ({ c, 라벨: rows[최고.r][c] }));
  뜻고치기(칸들, 값);
  const 역할 = {};
  for (const k of 칸들) if (['qty', 'code', 'name', 'price', 'amount'].includes(k.뜻)) 역할[k.c] = k.뜻;
  if (!Object.values(역할).includes('qty') || !(Object.values(역할).includes('code') || Object.values(역할).includes('name'))) return null;
  return { r: 최고.r, 역할 };
}

export const 열글 = (c) => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

const 날값 = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^(19|20)?\d{2}[./년-]\s*\d{1,2}[./월-]\s*\d{1,2}/;
const 거래처말 = /^(to|from|supplier|seller|buyer|vendor|consignee|shipper|shipperexporter|messrs|attn|attention|거래처|공급사|받는곳|보내는곳)$/;
const 번호말 = /(no|number|번호)$/;
const 날말 = /date|日期|납기|발주일|주문일|상차일/;
function 머리뜻(칸) {
  const k = 글칸(칸.라벨).replace(/\d+$/, '');
  if (k === '차수' || 칸.키 === '차수') return '차수';
  if (날말.test(k) || 날값.test(String(칸.값 ?? '').trim())) return '날짜';
  if (거래처말.test(k)) return '거래처';
  if (번호말.test(k) || 칸.종류 === '번호') return '번호';
  return '';
}

const 글자른 = (v, n = 44) => String(v ?? '').replace(/\s*\n\s*/g, ' ').trim().slice(0, n);

/* 시트 하나의 구성 */
function 시트구성(시트) {
  const 틀 = 분석시트(시트) ?? (() => { const 힌트 = 값으로표찾기(시트); return 힌트 ? 분석시트({ ...시트, 힌트 }) : null; })();
  const 위글 = 시트.rows.slice(0, 틀 ? 틀.머리줄 : 12).flat().map((v) => 글자른(v)).filter(Boolean);
  const 제목 = 틀?.제목 || 위글.find((v) => 문서제목.test(글칸(v))) || '';
  const 구 = { 이름: 글자른(시트.name, 40), 줄: 시트.rows.length, 제목, 머리칸: [], 표: null, 아래: [] };
  if (!틀) { 구.글 = 위글.slice(0, 4); return 구; }
  const 숨은줄 = new Set(시트.숨긴줄 ?? []);
  const 몸줄 = [];
  for (let r = 틀.시작; r < 틀.끝; r++) if (!숨은줄.has(r)) 몸줄.push(r);
  const 값칸 = (c) => 몸줄.map((r) => 시트.rows[r]?.[c] ?? '');
  const 칸들 = 틀.칸.map((k) => ({ c: k.c, 열: 열글(k.c), 라벨: 글자른(k.라벨, 40), 숨김: k.숨김 ? true : undefined }));
  const 검산 = 뜻고치기(칸들, 값칸);
  for (const k of 칸들) if (!k.숨김) k.샘플 = 찬값(값칸(k.c)).slice(0, 샘플수).map((v) => 글자른(v, 30));
  // 합계 칸 맞춰 보기 — 품목 수량을 더한 값이 합계 줄 숫자와 같은가
  const 수량 = 칸들.find((k) => k.뜻 === 'qty' && !k.숨김);
  const 합줄 = 틀.합계[0];
  if (수량 && 합줄) {
    const 합 = 값칸(수량.c).reduce((s, v) => s + (대조숫자(v) ?? 0), 0);
    const 값 = 대조숫자(시트.rows[합줄.r]?.[수량.c]);
    if (값 !== null) 검산.push({ 이름: '수량 합계', 맞음: Math.abs(합 - 값) < 0.5 ? 1 : 0, 전체: 1 });
  }
  구.표 = { 머리: 틀.머리줄, 시작: 틀.시작, 끝: 틀.끝, 품목: 몸줄.length, 칸: 칸들, 합계: 틀.합계.map((x) => 글자른(x.라벨, 40)).filter(Boolean), 검산 };
  구.머리칸 = 틀.머리칸.map((k) => ({ 키: k.키, 라벨: 글자른(k.라벨, 30), 뜻: 머리뜻(k), 자리: k.c >= 0 ? `${열글(k.c)}${k.r + 1}` : '', 값: 글자른(k.값, 40) }));
  구.아래 = 틀.아래.slice(0, 글귀수).map((x) => 글자른(x.글, 60));
  return 구;
}

/* ── 서류 종류 판정 — 거래처 양식 없이 구성만 보고 ────────
   시트·표·제목·합계 줄의 짜임으로 봅니다. 파일 이름은 가장 약한 근거입니다. */
const 문서제목 = /^(commercialinvoice|proformainvoice|invoice|packinglist|purchaseorder|ordersheet|contract|salescontract|발주서|주문서|구매발주서|合同|销售合同|订单|形式发票|商业发票|装箱单|出货明细)$/;
export function 구성갈래(구성) {
  const 점수 = { order: 0, pi: 0, cipl: 0 };
  const 까닭 = { order: [], pi: [], cipl: [] };
  const 더 = (k, n, 말) => { 점수[k] += n; if (!까닭[k].includes(말)) 까닭[k].push(말); };
  const 시트들 = 구성?.시트 ?? [];
  const 표들 = 시트들.filter((s) => s.표);
  const 인보 = 시트들.find((s) => /invoice|^ci$/.test(글칸(s.이름))), 패킹 = 시트들.find((s) => /packing|^pl$/.test(글칸(s.이름)));
  if (인보 && 패킹) 더('cipl', 3, `시트 ${인보.이름.trim()} · ${패킹.이름.trim()}`);
  for (const s of 시트들) {
    const 제 = 글칸(s.제목);
    if (/commercialinvoice|packinglist|装箱单|商业发票|出货明细/.test(제)) 더('cipl', 3, `제목 ${s.제목}`);
    if (/proforma|形式发票|contract|合同/.test(제)) 더('pi', 4, `제목 ${s.제목}`);
    if (/purchaseorder|ordersheet|발주서|주문서|订单/.test(제)) 더('order', 4, `제목 ${s.제목}`);
    if (!제 && /合同|contract/.test(글칸(s.이름))) 더('pi', 2, `시트 ${s.이름.trim()}`);
    if (/발주서|ordersheet/.test(글칸(s.이름))) 더('order', 2, `시트 ${s.이름.trim()}`);
    const 키들 = s.머리칸.map((k) => 글칸(k.라벨));
    if (키들.some((k) => /^(pono|ponumber|발주번호)$/.test(k)) && 키들.some((k) => /deliverydate|납기/.test(k))) 더('order', 2, '머리칸 PO NO · 납기');
    if (키들.some((k) => /^invoicedate/.test(k))) 더('cipl', 1, '머리칸 INVOICE DATE');
  }
  for (const s of 표들) {
    const 뜻들 = new Set(s.표.칸.filter((k) => !k.숨김).map((k) => k.뜻));
    if (뜻들.has('nw') && 뜻들.has('gw')) 더('cipl', 3, '표 N.W · G.W');
    const 합 = s.표.합계.map(글칸).join(' ');
    if (/deposit|계약금/.test(합) && /30%|30/.test(합) && !패킹) 더('pi', 3, '합계 DEPOSIT 30%');
  }
  const 줄 = Object.entries(점수).sort((a, z) => z[1] - a[1]);
  const [첫, 둘] = 줄;
  if (첫[1] < 3 || 첫[1] === 둘[1]) return { key: '', 점수, 까닭: [] };
  return { key: 첫[0], 점수, 까닭: 까닭[첫[0]].slice(0, 3) };
}

/* 올린 파일의 구성이 그 칸과 어긋나나 — 이름이 그 칸이면 구성이 달라도 안 막습니다(베이지아 PI 는 양식이 CI 그대로입니다). */
export function 구성어긋남(구성, 칸) {
  const 갈래 = 구성?.갈래?.key;
  if (!갈래 || 갈래 === 칸) return '';
  return classify(구성.파일 ?? '').key === 칸 ? '' : 갈래;
}

/** 구성 분석 — 시트 전체. 시트들 = order.js 워크북읽기 꼴(또는 PDF시트). 표를 하나도 못 찾아도 구성은 돌려줍니다(시트 이름·제목으로 맞댑니다). */
export function 구성분석(시트들, { 꼴 = 'x', 파일 = '', 숨긴시트 = [] } = {}) {
  const 구성 = { v: 구성판, 꼴, 파일, 시트: (시트들 ?? []).map(시트구성) };
  if (숨긴시트.length) 구성.숨긴시트 = 숨긴시트.slice(0, 12);
  구성.갈래 = 구성갈래(구성);
  return 구성;
}

/** 이미 저장된 발주서 틀(docs_발주양식) → 구성. 시트 하나뿐이고 값은 틀에 남은 것만입니다. */
export function 틀구성(틀, 파일 = '') {
  if (!틀) return null;
  const 칸들 = 틀.칸.map((k) => ({ c: k.c, 열: 열글(k.c), 라벨: 글자른(k.라벨, 40), 숨김: k.숨김 ? true : undefined }));
  뜻고치기(칸들, () => []);
  // 값이 없어 제목 없는 칸을 못 읽습니다 — 틀이 적어 둔 한자 칸만.
  for (const k of 칸들) if (!k.뜻 && !k.라벨 && 틀.칸.find((x) => x.c === k.c)?.한자 !== false && 칸들.find((x) => x.c === k.c - 1)?.뜻 === 'code') { k.뜻 = 'cn'; k.출처 = '값'; }
  const 제목 = 틀.제목 || (틀.고정 ?? []).map((x) => 글자른(x.글)).find((v) => 문서제목.test(글칸(v))) || '';
  const 시트 = { 이름: 글자른(틀.시트, 40), 줄: 틀.끝, 제목, 아래: (틀.아래 ?? []).slice(0, 글귀수).map((x) => 글자른(x.글, 60)),
    머리칸: (틀.머리칸 ?? []).map((k) => ({ 키: k.키, 라벨: 글자른(k.라벨, 30), 뜻: 머리뜻(k), 자리: k.c >= 0 ? `${열글(k.c)}${k.r + 1}` : '', 값: 글자른(k.값, 40) })),
    표: { 머리: 틀.머리줄, 시작: 틀.시작, 끝: 틀.끝, 품목: 틀.끝 - 틀.시작, 칸: 칸들, 합계: (틀.합계 ?? []).map((x) => 글자른(x.라벨, 40)).filter(Boolean), 검산: [] } };
  const 구성 = { v: 구성판, 꼴: 'x', 파일, 시트: [시트], 틀에서: true };
  구성.갈래 = 구성갈래(구성);
  // 시트 하나만 남은 잔액서류 — 시트 이름·파일 이름이 짐작을 돕습니다.
  if (!구성.갈래.key) {
    const 이름쪽 = classify(파일).key;
    if (['order', 'pi', 'cipl'].includes(이름쪽)) 구성.갈래 = { key: 이름쪽, 점수: 구성.갈래.점수, 까닭: ['파일 이름'] };
  }
  return 구성;
}

/* ── 구성 맞대기 — 이 서류가 그 거래처의 어느 서류인가 ─────
   재료 = sniff { kind, sheets, text } + 있으면 표(cipl.sheets). 양식에 적힌 글 그대로와 맞댑니다 — 낱말 표가 아닙니다.
   시트 구성 3 · 표 칸 6 · 제목·머리칸 3. 어느 쪽이 없으면 그 몫을 뺀 나머지로 셉니다.
   문턱·간격은 임시입니다(11-07 실물로 잼 — CLAUDE.md). */
export const 맞대기문턱 = 0.6, 맞대기문턱PDF = 0.5, 맞대기간격 = 0.1;
const 값없는시트 = /^(sheet|시트|wps|工作表)?\d*$/;
function 구성점수(구성, 재) {
  const 시트 = (구성.시트 ?? []);
  const 양시트 = 시트.map((s) => 글칸(s.이름)).filter((n) => n && !값없는시트.test(n));
  const 들 = (라벨) => { const k = 글칸(라벨); return k.length >= 2 && 재.글.includes(k); };
  const 표라벨 = [...new Set(시트.flatMap((s) => (s.표?.칸 ?? []).filter((k) => !k.숨김 && k.라벨).map((k) => k.라벨)))];
  const 머리라벨 = [...new Set(시트.flatMap((s) => [s.제목, ...s.머리칸.map((k) => k.라벨)]).filter((v) => v && !/^차수$/.test(v)))];
  const 줄 = [];
  let 합 = 0, 몫 = 0;
  const 재기 = (이름, 무게, 맞음, 전체) => {
    if (!전체) return;
    몫 += 무게; 합 += 무게 * 맞음 / 전체;
    줄.push(`${이름} ${맞음}/${전체}`);
  };
  if (재.시트.length && 양시트.length) 재기('시트', 3, 양시트.filter((n) => 재.시트.includes(n)).length, 양시트.length);
  if (표라벨.length) 재기('표 칸', 6, 표라벨.filter(들).length, 표라벨.length);
  if (머리라벨.length) 재기('머리', 3, 머리라벨.filter(들).length, 머리라벨.length);
  return { 점: 몫 ? 합 / 몫 : 0, 줄 };
}

/**
 * 구성들 = { order: 구성, pi: 구성, cipl: 구성 }. → { key, 점, 말 } 또는 null.
 * 말은 사람이 읽는 까닭 — 「구성 잔액서류 86% · 시트 2/2 · 표 칸 9/11 · 머리 3/4」.
 */
export function 구성맞대기(sniff, 구성들, { 표들 = [], pdf만 = false, 말 = {} } = {}) {
  const 있는 = Object.entries(구성들 ?? {}).filter(([, g]) => g?.시트?.length);
  if (!있는.length || !sniff) return null;
  const 표글 = 표들.flatMap((t) => (t?.rows ?? []).slice(0, t?.h ?? 1).flatMap((r) => r.c ?? r)).join(' ');
  const 재 = { 시트: (sniff.sheets ?? []).map(글칸).filter(Boolean), 글: 글칸(`${sniff.text ?? ''} ${표글}`) };
  if (재.글.length < 10 && !재.시트.length) return null;          // 글자 없는 스캔은 무리하지 않습니다
  const 줄 = 있는.map(([key, g]) => ({ key, ...구성점수(g, 재) })).sort((a, z) => z.점 - a.점);
  const [첫, 둘] = 줄;
  const 문턱 = pdf만 && sniff.kind === 'p' ? 맞대기문턱PDF : 맞대기문턱;
  if (첫.점 < 문턱 || (둘 && 첫.점 - 둘.점 < 맞대기간격)) return null;
  return { key: 첫.key, 점: 첫.점, 말: `구성 ${말[첫.key] ?? 첫.key} ${Math.round(첫.점 * 100)}% · ${첫.줄.join(' · ')}` };
}

/* ── 구성으로 품목 읽기 ──────────────────────────────── */
const 표줄 = (t) => (t?.rows ?? []).map((r) => (Array.isArray(r) ? r : r?.c ?? []));

/** 서버가 떠 둔 표의 칸 → 구성 칸. 서버는 빈 칸을 뺐으니 글자로 맞춥니다. { 뜻: 칸 번호 } 또는 null(이 구성의 표가 아님). */
export function 표칸풀이(t, 시트) {
  const 칸들 = (시트?.표?.칸 ?? []).filter((k) => !k.숨김);
  const rows = 표줄(t), h = t?.h ?? 1;
  if (!칸들.length || !rows.length) return null;
  const 너비 = Math.max(...rows.map((r) => r.length));
  const 머리 = Array.from({ length: 너비 }, (_, c) => 글칸(rows.slice(0, h).map((r) => String(r[c] ?? '')).join(' ')));
  const 잡힘 = new Map();   // 구성 칸 c → 표 칸
  const 쓴 = new Set();
  for (const k of 칸들) {
    if (!k.라벨) continue;
    const 키 = 글칸(k.라벨);
    const i = 머리.findIndex((m, c) => !쓴.has(c) && (m === 키 || (m && (m.startsWith(키) || 키.startsWith(m)))));
    if (i >= 0) { 잡힘.set(k.c, i); 쓴.add(i); }
  }
  const 라벨칸 = 칸들.filter((k) => k.라벨).length;
  if (!라벨칸 || 잡힘.size * 5 < 라벨칸 * 3) return null;
  // 제목 없는 칸 — 왼쪽 이웃 다음 칸. 표에도 제목이 비어 있어야 합니다.
  for (const k of 칸들) {
    if (k.라벨) continue;
    const 왼 = 잡힘.get(k.c - 1);
    if (왼 !== undefined && 왼 + 1 < 너비 && !머리[왼 + 1]) { 잡힘.set(k.c, 왼 + 1); 쓴.add(왼 + 1); }
  }
  const 뜻 = {};
  for (const k of 칸들) if (k.뜻 && 잡힘.has(k.c) && 뜻[k.뜻] === undefined) 뜻[k.뜻] = 잡힘.get(k.c);
  return 뜻;
}

const 시트찾기 = (구성, 이름) => (구성?.시트 ?? []).find((s) => s.표 && 글칸(s.이름) === 글칸(이름));

/** 표 → 구성의 칸 뜻. 같은 이름 시트가 먼저, 없으면 표가 있는 시트 가운데 맞는 것. */
export function 구성칸뜻(t, 구성) {
  const 먼저 = 시트찾기(구성, t?.name);
  for (const s of [먼저, ...(구성?.시트 ?? [])]) {
    if (!s?.표) continue;
    const 뜻 = 표칸풀이(t, s);
    if (뜻) return 뜻;
  }
  return null;
}

const 줄합계 = /^(s?\/?(sub)?total|합계|소계|총계|合计|总计)/i;

/**
 * 서류의 표(cipl.sheets)에서 품목을 뽑습니다 — 서버 표가 칸 이름을 못 읽은 서류를 위해. readItems 와 같은 꼴입니다.
 * 코드 칸 + 수량 칸이 맞은 표 가운데 첫 표를 씁니다. 못 읽으면 빈 배열.
 */
export function 구성품목(표들, 구성) {
  for (const t of 표들 ?? []) {
    const 뜻 = 구성칸뜻(t, 구성);
    if (뜻?.code === undefined || 뜻.qty === undefined) continue;
    const rows = 표줄(t), h = t.h ?? 1, f = Math.min(t.f ?? rows.length, rows.length);
    const 모음 = new Map();
    for (const r of rows.slice(h, f)) {
      const 글 = (k) => (뜻[k] === undefined ? '' : String(r[뜻[k]] ?? '').trim());
      const code = 글('code').replace(/\s+/g, ' ');
      if (!code || !제품줄인가(code) || r.some((v) => 줄합계.test(String(v ?? '').trim()))) continue;
      const qty = 대조숫자(글('qty'));
      if (!qty) continue;
      const 것 = 모음.get(code) ?? { code, name: 글('name').slice(0, 40), qty: 0, price: 대조숫자(글('price')), amount: 0, colors: [], size: 글('packsize') || 글('size') || null, perCtn: 글('perctn') || null, cbm: 대조숫자(글('cbm')), pno: 글('pno') || null, cn: 글('cn') || null };
      것.qty += qty;
      const a = 대조숫자(글('amount'));
      것.amount = a === null ? null : 것.amount === null ? null : 것.amount + a;
      const 색 = 글('color').slice(0, 24);
      if (색 && !것.colors.includes(색)) 것.colors.push(색);
      모음.set(code, 것);
    }
    if (모음.size) return [...모음.values()];
  }
  return [];
}

const 달 = (v) => String(v).padStart(2, '0');
/** 서류 날짜 글 → 2026-11-03. 202610.15 · 2026.10.15 · 11/3/26(임시 — 월/일/연으로 봅니다). 못 읽으면 ''. */
export function 날짜글(v) {
  const 글 = String(v ?? '').trim();
  let m = /(20\d{2})\s*[.\-/년]?\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(글) ?? /(20\d{2})(\d{2})(\d{2})/.exec(글);
  if (m) return Number(m[2]) <= 12 && Number(m[3]) <= 31 ? `${m[1]}-${달(m[2])}-${달(m[3])}` : '';
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(글);
  return m && Number(m[1]) <= 12 && Number(m[2]) <= 31 ? `20${m[3]}-${달(m[1])}-${달(m[2])}` : '';
}

/**
 * 서류의 표 위 글(표.위 — 서버가 떠 둠)에서 구성이 안 자리표의 번호·날짜를 읽습니다. → { 번호, 날짜 }
 * 줄 자리는 서류마다 밀리니 이름표로 찾습니다. 이름표는 대표양식에 적힌 그대로입니다.
 */
export function 구성머리값(표들, 구성) {
  const 답 = {};
  for (const t of 표들 ?? []) {
    const rows = (t?.위 ?? []).map((r) => (Array.isArray(r) ? r : r?.c ?? []));
    if (!rows.length) continue;
    const 시트 = 시트찾기(구성, t.name) ?? (구성?.시트 ?? []).find((s) => s.머리칸?.length);
    if (!시트) continue;
    const 너비 = Math.max(...rows.map((r) => r.length));
    const { 머리칸 } = 머리칸읽기(rows, new Set(), new Set(), rows.length, 너비);
    for (const k of 시트.머리칸) {
      if (k.뜻 !== '번호' && k.뜻 !== '날짜') continue;
      const 값 = 머리칸.find((x) => x.키 === k.키)?.값;
      if (!값 || 답[k.뜻]) continue;
      if (k.뜻 === '날짜') { const d = 날짜글(값); if (d) 답.날짜 = d; } else 답.번호 = 값;
    }
  }
  return 답;
}

/** 대표양식 구성으로 서류 하나를 채웁니다 — 서버가 칸을 못 읽어 빈 값만. 읽어 둔 값은 안 덮습니다. 바뀔 게 없으면 doc 그대로. */
export function 구성보강(doc, 구성들) {
  const 구성 = 구성들?.[doc.stageKey];
  const 표들 = doc.cipl?.sheets;
  if (!구성?.시트?.length || !표들?.length) return doc;
  const 뜻표들 = 표들.map((t) => { const 뜻 = 구성칸뜻(t, 구성); return 뜻 ? { ...t, 뜻 } : t; });
  const cipl = { ...doc.cipl, sheets: 뜻표들 };
  if (!doc.cipl.items?.length) {
    const 품목 = 구성품목(표들, 구성);
    if (품목.length && !doc.cipl.sheets.some((t) => t.name === '발주서')) { cipl.items = 품목; cipl.구성품목 = true; }
  }
  const 머리 = 구성머리값(표들, 구성);
  if (머리.번호 && !cipl.brief?.piNo) cipl.brief = { ...cipl.brief, piNo: 머리.번호 };
  if (머리.날짜 && !cipl.invoiceDate) cipl.invoiceDate = 머리.날짜;
  return { ...doc, cipl };
}

/** 구성 칸이 보여 줄 값을 가려야 하나 — 뜻이 돈이거나 가격칸 규칙에 걸립니다. */
export function 구성가림(시트) {
  const 칸들 = 시트?.표?.칸 ?? [];
  const { 칸 } = 가격칸({ rows: [칸들.map((k) => k.라벨)], h: 1 });
  return new Set(칸들.flatMap((k, i) => (칸.has(i) || 돈뜻.has(k.뜻) ? [k.c] : [])));
}

/* ── PDF ─ 글자 조각의 자리로 표를 다시 짭니다 ────────────
   쪽들 = [{ 넓이, 높이, 조각: [{ x, y, w, 글 }] }] — y 는 쪽 아래에서 위로(pdf.js 그대로).
   머리 글이 여러 줄로 쌓여 있고(PRICE / (FOB / Qingdao) 품명도 두 줄이라, 줄이 아니라 **수량 칸 숫자**를 줄 기준으로 삼습니다.
   글자가 없으면 { 스캔: true } — 추측하지 않습니다. */
const 스캔글자 = 20;
function 세로줄들(조각, 틈 = 3) {
  const 줄들 = [];
  for (const g of [...조각].sort((a, b) => a.Y - b.Y || a.x - b.x)) {
    const 끝 = 줄들.at(-1);
    if (끝 && Math.abs(끝.Y - g.Y) <= 틈) 끝.조각.push(g);
    else 줄들.push({ Y: g.Y, 조각: [g] });
  }
  return 줄들;
}

/* 쌓인 글을 칸으로 — x 가 겹치는 조각끼리 위에서 아래로 잇습니다. */
function 쌓인칸(조각) {
  const 칸들 = [];
  for (const g of [...조각].sort((a, b) => a.Y - b.Y || a.x - b.x)) {
    const 왼 = g.x, 오 = g.x + Math.max(g.w, 6);
    const 칸 = 칸들.find((k) => 왼 < k.오 + 2 && 오 > k.왼 - 2);
    if (칸) { 칸.왼 = Math.min(칸.왼, 왼); 칸.오 = Math.max(칸.오, 오); 칸.글.push(g.글); }
    else 칸들.push({ 왼, 오, 글: [g.글] });
  }
  return 칸들.sort((a, b) => a.왼 - b.왼).map((k) => ({ ...k, 라벨: k.글.join(' ').replace(/\s+/g, ' ').trim() }));
}

function PDF머리찾기(줄들) {
  for (let i = 0; i < 줄들.length; i++) {
    let 조각 = [];
    for (let j = i; j < 줄들.length && j < i + 6; j++) {
      if (j > i && 줄들[j].Y - 줄들[j - 1].Y > 16) break;
      조각 = 조각.concat(줄들[j].조각);
      const 칸들 = 쌓인칸(조각);
      const 뜻들 = 칸들.map((k) => 첫뜻(k.라벨));
      if (칸들.length >= 3 && 뜻들.includes('qty') && (뜻들.includes('code') || 뜻들.includes('name'))) {
        // 머리는 숫자 없는 줄이 이어질 때까지
        let 끝 = j;
        const 머리조각 = (g) => /^\(.*\)?$|\)$/.test(g.글) || (g.글.length <= 10 && !한글.test(g.글) && !숫자인가(g.글));
        while (끝 + 1 < 줄들.length && 줄들[끝 + 1].Y - 줄들[끝].Y <= 15 && 줄들[끝 + 1].조각.every(머리조각)) {
          끝++;
          조각 = 조각.concat(줄들[끝].조각);
        }
        // 위쪽 줄(「Order Detail」)이 칸을 잇지 않게 — 빼도 머리가 되면 뺍니다.
        let 첫 = i;
        const 범위칸 = (a) => 쌓인칸(줄들.slice(a, 끝 + 1).flatMap((x) => x.조각));
        const 뜻없는줄 = (a) => 줄들[a].조각.every((g) => !첫뜻(g.글));
        while (첫 < 끝 && (범위칸(첫 + 1).length > 범위칸(첫).length || (뜻없는줄(첫) && 범위칸(첫 + 1).length === 범위칸(첫).length))) 첫++;
        return { 시작: 첫, 끝, 칸들: 범위칸(첫) };
      }
    }
  }
  return null;
}

/* 표 위 글 — 쌓인 이름표(Delivery / Date)를 잇고 같은 높이끼리 한 줄로. */
function 위줄들(조각) {
  const 덩이 = [];
  for (const g of [...조각].sort((a, b) => a.Y - b.Y || a.x - b.x)) {
    const 짝 = !숫자인가(g.글) && 덩이.find((d) => g.Y - d.끝 <= 14 && g.Y > d.끝 + 3 && Math.abs((d.x + d.w / 2) - (g.x + g.w / 2)) <= 14 && d.글.length < 16 && g.글.length < 16 && !숫자인가(d.글));
    if (짝) { 짝.글 = `${짝.글} ${g.글}`; 짝.끝 = g.Y; 짝.Y = (짝.Y + g.Y) / 2; }
    else 덩이.push({ ...g, 끝: g.Y });
  }
  return 세로줄들(덩이.map((d) => ({ ...d })), 7).map((줄) => 줄.조각.sort((a, b) => a.x - b.x).map((g) => g.글));
}

export function PDF시트(쪽들) {
  const 모두 = [];
  let 밑 = 0;
  (쪽들 ?? []).forEach((p) => {
    for (const g of p.조각 ?? []) {
      const 글 = String(g.글 ?? '').replace(/\s+/g, ' ').trim();
      if (글) 모두.push({ x: g.x, w: g.w ?? 0, 글, Y: 밑 + p.높이 - g.y });
    }
    밑 += p.높이;
  });
  if (모두.map((g) => g.글).join('').length < 스캔글자) return { 스캔: true, 시트들: [] };
  const 줄들 = 세로줄들(모두);
  const 머리 = PDF머리찾기(줄들);
  const 위 = (n) => 위줄들(줄들.slice(0, n).flatMap((x) => x.조각));
  if (!머리) return { 시트들: [{ name: 'PDF', rows: 위(줄들.length), 식: {}, 숨긴칸: [], 숨긴줄: [], 합침: [] }] };

  const 칸들 = 머리.칸들;
  const 너비 = 칸들.length;
  const 칸찾기 = (g) => {
    const 가운데 = g.x + g.w / 2;
    let 최고 = 0, 거리 = Infinity;
    칸들.forEach((k, i) => {
      const d = 가운데 < k.왼 ? k.왼 - 가운데 : 가운데 > k.오 ? 가운데 - k.오 : 0;
      if (d < 거리) { 거리 = d; 최고 = i; }
    });
    return 최고;
  };
  const 밑줄들 = 줄들.slice(머리.끝 + 1);
  const 합계자리 = 밑줄들.findIndex((줄) => 줄.조각.some((g) => 줄합계.test(g.글) || /^(합계|TOTAL)/i.test(g.글)));
  const 몸 = 합계자리 < 0 ? 밑줄들 : 밑줄들.slice(0, 합계자리);
  const 수량칸 = 칸들.findIndex((k) => 첫뜻(k.라벨) === 'qty');
  const 몸조각 = 몸.flatMap((x) => x.조각);
  let 기준 = 몸조각.filter((g) => 칸찾기(g) === 수량칸 && 숫자인가(g.글)).map((g) => g.Y).sort((a, b) => a - b);
  // 표가 끝난 뒤 글은 기준에서 멉니다 — 기준 간격의 세 배 넘게 떨어진 곳에서 끊습니다.
  if (기준.length >= 3) {
    const 간격 = 기준.slice(1).map((y, i) => y - 기준[i]).sort((a, b) => a - b)[Math.floor((기준.length - 1) / 2)];
    const 끊 = 기준.findIndex((y, i) => i > 0 && y - 기준[i - 1] > 간격 * 4);
    if (끊 > 0) 기준 = 기준.slice(0, 끊);
  }
  const 몸줄 = 기준.map(() => Array.from({ length: 너비 }, () => []));
  const 간 = 기준.length > 1 ? 기준[1] - 기준[0] : 30;
  const 남은 = [];
  for (const g of 몸조각) {
    let 최고 = -1, 거리 = Infinity;
    기준.forEach((y, i) => { const d = Math.abs(y - g.Y); if (d < 거리) { 거리 = d; 최고 = i; } });
    if (최고 < 0 || 거리 > Math.max(간, 24)) { 남은.push(g); continue; }
    몸줄[최고][칸찾기(g)].push(g);
  }
  const 줄글 = 몸줄.map((r) => r.map((칸) => 칸.sort((a, b) => a.Y - b.Y || a.x - b.x).map((g) => g.글).join(' ')));
  const 위글 = 위(머리.시작);
  const 뒤 = [...세로줄들(남은), ...(합계자리 < 0 ? [] : 밑줄들.slice(합계자리))];
  const 뒤줄 = 뒤.map((줄) => { const r = Array.from({ length: 너비 }, () => ''); for (const g of 줄.조각) { const c = 칸찾기(g); r[c] = r[c] ? `${r[c]} ${g.글}` : g.글; } return r; });
  const 끼움 = (r) => [...r, ...Array.from({ length: Math.max(0, 너비 - r.length) }, () => '')];
  const rows = [...위글.map(끼움), 칸들.map((k) => k.라벨), ...줄글, ...뒤줄];
  return { 시트들: [{ name: 'PDF', rows, 식: {}, 숨긴칸: [], 숨긴줄: [], 합침: [] }] };
}
