/**
 * 잔액서류(CI&PL)와 발주서를 숫자로 맞춰 봅니다.
 *
 * ⚠ 박스수량과 중량은 발주서에서 안 나옵니다 — 발주서 PDF 에 그 칸이 없습니다.
 *   그래서 없는 것을 있는 척 맞추지 않고, 양쪽에 다 있는 것만 맞춰 봅니다:
 *   수량 · 금액 · 부피(CBM) · 품목별 수량.
 *
 * 한쪽에 값이 없는 칸은 아예 빼 둡니다 — 맞았다고도 틀렸다고도 하지 않습니다.
 * '모르는 것' 과 '틀린 것' 은 다릅니다.
 *
 * 화면과 얽히지 않은 순수한 셈이라 브라우저와 Node 검사 양쪽에서 그대로 씁니다.
 */

/* 코드를 맞대는 셈(`코드열쇠`)은 **js/parse.js 한 자리**에 있습니다. 여기서 또 만들지 마십시오.
   서류끼리 맞댈 때도 벤더피아와 맞댈 때도 같은 것을 불러야 둘이 안 갈라집니다. */
import { 코드열쇠, 제품줄인가 } from './parse.js';

/**
 * 두 서류의 품목을 코드로 맞춰 보고, 무엇이 새로 들어오고 빠지고 수량이 바뀌었는지 줄로 만듭니다.
 * "수량 +51" 만으로는 어느 제품이 늘었는지 알 수 없습니다.
 */
export function itemRows(before, now) {
  if (!before?.length || !now?.length) return [];
  // 밑줄 꼴만 다른 코드는 같은 것으로 봅니다 — 발주서와 잔액서류가 서로 다른 꼴을 쓰는 일이 있습니다.
  // 보이는 코드는 날것 그대로입니다. 맞대는 열쇠만 표식 자리를 하나로 봅니다.
  const key = (list) => new Map(list.map((x) => [코드열쇠(x.code), x]));
  const A = key(before);
  const B = key(now);
  const rows = [];

  // 줄에 적는 코드는 **날것**입니다 — 열쇠는 맞대는 데만 씁니다.
  for (const [열쇠, x] of B) {
    const was = A.get(열쇠);
    const code = String(x.code ?? '');
    if (!was) rows.push({ kind: '추가', name: x.name || code, code, from: null, to: x.qty });
    else if (was.qty !== x.qty)
      rows.push({ kind: '수량', name: x.name || code, code, from: was.qty, to: x.qty });
  }
  for (const [열쇠, x] of A)
    if (!B.has(열쇠)) {
      const code = String(x.code ?? '');
      rows.push({ kind: '빠짐', name: x.name || code, code, from: x.qty, to: null });
    }

  // 새로 들어온 것 → 수량이 바뀐 것 → 빠진 것 차례로 봅니다.
  const rank = { 추가: 0, 수량: 1, 빠짐: 2 };
  return rows.sort((a, b) => rank[a.kind] - rank[b.kind] || Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

/**
 * itemRows 의 줄을 사장님이 물으신 셋으로 갈라 담습니다.
 *   「어떤 제품이 덜 실렸나 · 더 실렸나 · 발주에 없던 제품이 생겼나」
 * 앞(before)이 발주, 뒤(now)가 출고일 때의 말입니다.
 * 아예 안 실린 것(빠짐)은 덜 실림 안에 둡니다 — 모자란 것은 한자리에서 봐야 합니다.
 */
export function 제품차이(줄) {
  const 덜실림 = [], 더실림 = [], 없던것 = [];
  for (const r of 줄 ?? []) {
    if (r.kind === '추가') 없던것.push({ ...r, 준것: r.to });
    else if (r.kind === '빠짐') 덜실림.push({ ...r, 모자람: r.from, 안실림: true });
    else if (r.kind === '수량') {
      const 차 = r.to - r.from;
      if (차 < 0) 덜실림.push({ ...r, 모자람: -차 });
      else if (차 > 0) 더실림.push({ ...r, 더함: 차 });
    }
  }
  const 큰것먼저 = (a, b) => (b.모자람 ?? b.더함 ?? b.준것 ?? 0) - (a.모자람 ?? a.더함 ?? a.준것 ?? 0);
  return {
    덜실림: 덜실림.sort(큰것먼저),
    더실림: 더실림.sort(큰것먼저),
    없던것: 없던것.sort(큰것먼저),
    있나: 덜실림.length + 더실림.length + 없던것.length > 0,
  };
}

const 숫 = (v) => { const n = Number(v); return Number.isFinite(n) && n ? n : 0; };

/**
 * 발주서 한 장을 잔액서류 한 장과 맞춰 봅니다.
 * @returns {{항: object[], 품목다른줄: number|null, 맞은수: number, 견준수: number,
 *            못댐: boolean, 다맞음: boolean, 하나도안맞음: boolean, 못댄것: string[]}}
 */
export function 맞춰보기(발주, d) {
  const a = 발주?.cipl ?? {}, z = d?.cipl ?? {};
  const ab = a.brief ?? {}, zb = z.brief ?? {};
  const 항 = [];
  const 넣기 = (이름, x, y, 단위) => {
    if (!x || !y) return;                    // 한쪽이 없으면 맞춰 보지 않습니다
    // 부피는 서류마다 반올림이 달라, 1% 안이면 같은 것으로 봅니다. 수량·금액은 딱 맞아야 합니다.
    const 결 = x === y ? '같음'
             : (단위 === 'CBM' && Math.abs(x - y) / Math.max(x, y) <= 0.01) ? '가까움' : '다름';
    항.push({ 이름, 발주: x, 잔액: y, 단위, 결 });
  };
  넣기('수량', 숫(ab.qty), 숫(zb.qty) || 숫(z.pcs), 'pcs');
  넣기('금액', 숫(ab.amount), 숫(zb.amount), '');
  넣기('부피', 숫(ab.cbm), 숫(zb.cbm) || 숫(z.cbm), 'CBM');

  // 잔액서류에는 있는데 발주서에 없어 못 댄 것 — 화면에 그대로 적어 줍니다.
  const 못댄것 = [];
  if (숫(z.cartons) && !숫(ab.cartons)) 못댄것.push('박스수');
  if (숫(z.gross) && !숫(ab.gross)) 못댄것.push('중량');
  if (숫(zb.cbm) || 숫(z.cbm)) { if (!숫(ab.cbm)) 못댄것.push('부피'); }

  const 품목 = (a.items?.length && z.items?.length) ? itemRows(a.items, z.items) : null;
  const 맞은수 = 항.filter((x) => x.결 !== '다름').length;
  // 숫자도 품목도 하나 못 대 봤으면 '못댐' 입니다. 맞다고도 틀리다고도 할 수 없습니다.
  const 못댐 = 항.length === 0 && 품목 === null;
  return {
    항, 품목다른줄: 품목 ? 품목.length : null, 못댄것,
    맞은수, 견준수: 항.length, 못댐,
    다맞음: 항.length > 0 && 맞은수 === 항.length && (품목 === null || 품목.length === 0),
    하나도안맞음: !못댐 && 맞은수 === 0 && 품목다른줄있고다름(품목),
  };
}

const 품목다른줄있고다름 = (품목) => 품목 === null || 품목.length > 0;

/**
 * 발주서 여러 장을 잔액서류 하나와 맞춰 보고, 무엇이라 말할지 고릅니다.
 *
 * ⚠ '대 볼 것이 아예 없음' 과 '대 봤는데 하나도 안 맞음' 은 다릅니다.
 *   앞엣것을 「하나도 없습니다」 라고 하면 사장님은 「없다」 로 읽으십니다.
 *   모르는 것을 틀렸다고 하지 않습니다.
 *
 * @returns {'못댐'|'하나도안맞음'|'하나가다맞음'|'여럿이다맞음'|'골라야함'}
 */
export function 맞춤판정(잰것) {
  const 다맞는것 = 잰것.filter((x) => x.다맞음);
  if (다맞는것.length === 1) return '하나가다맞음';
  if (다맞는것.length > 1) return '여럿이다맞음';
  // 한 장도 대 보지 못했으면 '없다' 가 아니라 '모른다' 입니다.
  if (잰것.length === 0 || 잰것.every((x) => x.못댐)) return '못댐';
  if (잰것.every((x) => x.못댐 || x.하나도안맞음)) return '하나도안맞음';
  return '골라야함';
}

/**
 * 벤더피아 상품 줄에서 「단품코드 → 단품명」 사전을 짓습니다.
 *
 * 벤더피아는 상품 한 줄 안에 단품 여럿을 「+」 로 이어 붙여 둡니다.
 *   단품코드 「EF-al55 + bd-whsqa」 · 단품명 「55형 다리 + 흰 손잡이」
 * ⚠ 「 + 」(빈칸 포함)로 쪼개면 안 됩니다 — 빈칸이 없는 줄이 섞여 있습니다.
 *   「+」 로 쪼개고 앞뒤 빈칸을 텁니다.
 * ⚠ 단품**명** 안에도 「+」 가 든 줄이 있어 코드 수와 이름 수가 안 맞습니다.
 *   그래서 **수가 맞는 줄로 사전을 먼저 짓고**, 안 맞는 줄은 그 사전으로 메웁니다.
 *   같은 코드면 이름은 늘 하나라는 것이 저쪽에서 확인돼 있습니다.
 */
export function 벤더피아사전(rows) {
  const 쪼갬 = (v) => String(v ?? '').split('+').map((x) => x.trim()).filter(Boolean);
  const 사전 = new Map();
  const 남은것 = [];

  for (const r of rows ?? []) {
    /* ⚠ 저쪽 코드에도 `▁`(U+2581) 가 섞여 있을 수 있습니다 — 저쪽은 제가 못 읽습니다.
       서류 쪽과 **같은 손질**을 해 둡니다. 한쪽만 다듬으면 또 안 맞습니다.
       단품**명** 은 손대지 않습니다 — 화면에 보이는 글자입니다. */
    const codes = 쪼갬(r?.단품코드);
    const names = 쪼갬(r?.단품명);
    if (!codes.length) continue;
    /* ⚠ 저쪽 코드에도 밑줄 꼴이 섞여 있을 수 있습니다 — 저쪽은 제가 못 읽습니다.
       사전의 **열쇠**를 코드열쇠로 둡니다. 서류 쪽도 같은 열쇠로 찾습니다.
       단품**명** 은 손대지 않습니다 — 화면에 보이는 글자입니다. */
    if (codes.length === names.length) {
      codes.forEach((c, i) => { const k = 코드열쇠(c); if (!사전.has(k)) 사전.set(k, names[i]); });
    } else 남은것.push(codes);
  }
  // 수가 안 맞던 줄 — 이름을 짝지을 수 없습니다. 사전에 이미 있는 코드만 살립니다.
  let 못메운코드 = 0;
  for (const codes of 남은것) for (const c of codes) if (!사전.has(코드열쇠(c))) 못메운코드++;

  return { 사전, 줄수: (rows ?? []).length, 단품수: 사전.size, 못메운코드 };
}

/* ── 적합성 — 이 서류가 이 차수 것이 맞나 ────────────────
 * 사장님 10-15 — 「원산지co장 또는 선하증권 서류가 도착했을때 … 적합성 검사가 필요해」
 *
 * 신호등 셋뿐입니다. 폰에서 한눈에 보셔야 합니다.
 *   맞음  — 이름·폴더에 차수가 적혔거나, **번호가 같은 서류**와 묶였습니다
 *   아마  — 끈이 없어 **날짜로 짐작**했습니다
 *   다름  — 붙을 자리를 못 찾았습니다. 가까웠던 차수를 같이 적습니다
 *
 * ⚠ 여기서 **파일을 옮기지 않습니다.** 판단만 보여 주고 고르는 것은 사람입니다.
 * ⚠ 숫자(카톤·총중량) 맞대기는 아직 **없습니다** — 서류가 PDF 라 속을 읽으려면
 *   앱스 스크립트가 밀려야 합니다. 그 자리는 아래 `맞댈자` 로 비워 두었습니다.
 */
export function 적합성(doc) {
  if (!doc) return { 등급: '다름', 까닭: '서류 없음', 갈자리: null };
  // 제 이름이나 폴더에 차수가 적혀 있으면 더 볼 것이 없습니다.
  if (doc.batchBy) return { 등급: '맞음', 까닭: doc.batchBy === 'folder' ? '폴더에 차수' : '이름에 차수', 갈자리: null };
  // 번호가 같은 서류와 묶인 것 — 비엘번호·원산지증명 번호·문서번호가 여기 옵니다.
  if (doc.joinedBy) return { 등급: '맞음', 까닭: `번호 ${doc.joinedBy}`, 갈자리: null };
  // 끈이 없어 날짜로 짐작한 것.
  if (doc.guessed) return { 등급: '아마', 까닭: doc.guessed, 갈자리: null };
  return { 등급: '다름', 까닭: '끈 없음', 갈자리: doc.후보 ?? null };
}

/**
 * 서류마다 자가 다릅니다 — 10-15 사장님 말씀, 원산지증명(C/O)은 **부분 발행**됩니다.
 *   선하증권·전신방출 → 카톤·총중량이 **같아야** 합니다
 *   원산지증명(C/O)   → 잔액서류에 **품기면** 됩니다. 중량은 **넘지만 않으면** 됩니다.
 * ⚠⚠ **C/O 가 작다고 「다름」 으로 두지 마십시오.** 그것이 합격선입니다.
 */
export function 맞댈자(stageKey) {
  return stageKey === 'fta' ? '품음' : '같음';
}

/**
 * 그 차수의 수량을 **어느 서류에서** 가져오고 **무엇이라 부를지**.
 * 사장님 10-16 — 「잔액서류 올라오기전 **발주수량(입고전)** · 잔액서류가 있는 차수는 **상차수량**」
 * ⚠ 글귀는 사장님이 적어 주신 그대로입니다. 바꿔 부르면 저쪽(벤더피아)에서 못 찾습니다.
 * ⚠ 잔액서류가 왔으면 그것이 참말입니다 — 실제로 실린 수량이라 발주수량보다 셉니다.
 */
export function 수량출처(잔액서류수) {
  return 잔액서류수 > 0
    ? { 어디: '상차수량', 잔액있음: true }
    : { 어디: '발주수량(입고전)', 잔액있음: false };
}

/* ── 발주서 ↔ 잔액서류 대조 ───────────────────────────────
 * 사장님 10-29 — 「발주서 텍스트화 한 자료와 잔액서류 텍스트화한 자료를 서로 비교하여
 *   차이점을 분석한 내용을 차수별 상세 잔액서류 아래 적어지게 해줘」
 *
 * 재료는 내용보기 팝업이 그리는 표 그대로입니다 — 서버가 떠 둔 cipl.sheets 의 { rows: [{c}], h, f }.
 * 새로 읽지 않습니다. 머리줄(rows[0..h-1])에서 칸을 찾고, h..f-1 줄을 품목으로 봅니다.
 *
 * ⚠ 코드는 **코드열쇠**(밑줄 꼴만 하나로)로만 맞댑니다. `-`·공백이 다르면 다른 제품입니다.
 *   비슷해 보인다고 같다고 치지 않습니다.
 * ⚠ 돈 칸은 **숫자만** 봅니다 — 앞뒤 통화 기호(¥ 가 글자로 바꿀 때 깨져 옵니다)는 떼고 견줍니다.
 * ⚠ 수량 0 줄은 주문 안 한 줄입니다(발주서에 0 으로 남겨 두는 색이 있습니다). 빼고 봅니다.
 */

// 칸 이름 — js/parse.js 의 ITEM_COLS 와 같은 낱말에, 표에서 실제로 본 꼴을 더했습니다.
//   발주서 「PRICE (FOB Qingdao)」 · 제헤우드 CI 금액 칸 「Total」 · 베이지아 발주서 「FABRIC / COLOR」.
const 대조칸 = [
  ['code', [/^code#?$/, /^품번$/, /^코드$/]],
  ['name', [/^productmodel$/, /^itemname$/, /^품명$/, /^descriptionofgoods$/]],
  ['qty', [/^quantity/, /^orderqty$/, /^qtypcs$/, /^qty$/, /^수량$/]],
  ['price', [/^unitprice/, /^price/, /^fob/, /^단가/, /^u\/price/]],
  ['amount', [/^amount/, /^totalamount/, /^totalvalue/, /^total$/, /^금액/, /^합계금액/]],
  ['color', [/(?:^|\/)colou?r$/, /^색상$/, /^색$/, /^颜色/]],
];
const 칸글 = (v) => String(v ?? '').replace(/[\s.()]+/g, '').toLowerCase();
const 합계말 = /total|合计|總計|总计|小计|합계/i;

/** 돈·수량 글자 → 숫자. 앞뒤에 붙은 기호 몇 글자(¥ · 깨진 ¥ · CNY · $)는 떼고, 그 밖엔 빈칸입니다. */
export function 대조숫자(v) {
  const 글 = String(v ?? '').replace(/[,\s]/g, '');
  const m = 글.match(/^[^\d\-]{0,4}(-?\d+(?:\.\d+)?)[^\d]{0,4}$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 표 한 장 → 코드열쇠마다 { code, qty, price[], amount, colors[], name }. */
export function 대조품목(t) {
  const rows = (t?.rows ?? []).map((r) => (Array.isArray(r) ? r : r?.c ?? []));
  if (!rows.length) return null;
  const h = Math.max(1, t.h ?? 1), f = Math.min(t.f ?? rows.length, rows.length);
  const cols = {};
  for (const r of rows.slice(0, h))
    r.forEach((v, c) => {
      const k = 칸글(v);
      if (!k) return;
      for (const [key, res] of 대조칸) if (cols[key] === undefined && res.some((re) => re.test(k))) cols[key] = c;
    });
  if (cols.qty === undefined) return null;
  const 몸 = rows.slice(h, f).filter((r) => !r.some((v) => 합계말.test(String(v ?? ''))));

  /* 코드 칸이 없는 양식 — 베이지아 CI 는 「Description of Goods」 칸에 코드(AMT-S03-01)를 적습니다.
     그 칸 글이 **하나도 빠짐없이 코드 꼴**(숫자가 든 짧은 번호표)일 때만 코드로 씁니다. */
  let 코드칸 = cols.code, 이름칸 = cols.name;
  if (코드칸 === undefined && 이름칸 !== undefined) {
    const 글들 = 몸.map((r) => String(r[이름칸] ?? '').trim()).filter(Boolean);
    if (글들.length && 글들.every((x) => 제품줄인가(x) && /\d/.test(x))) { 코드칸 = 이름칸; 이름칸 = undefined; }
  }

  const 품 = new Map();
  let 코드없는줄 = 0;
  for (const r of 몸) {
    const qty = 대조숫자(r[cols.qty]);
    if (!qty) continue;                                  // 빈 수량·0 은 주문 안 한 줄
    const code = 코드칸 === undefined ? '' : String(r[코드칸] ?? '').trim().replace(/\s+/g, ' ');
    if (!code || !제품줄인가(code)) { 코드없는줄++; continue; }
    const 열쇠 = 코드열쇠(code);
    const it = 품.get(열쇠) ?? { code, qty: 0, price: [], amount: null, colors: [], name: '' };
    it.qty += qty;
    const p = cols.price === undefined ? null : 대조숫자(r[cols.price]);
    if (p !== null && !it.price.includes(p)) it.price.push(p);
    const a = cols.amount === undefined ? null : 대조숫자(r[cols.amount]);
    if (a !== null) it.amount = (it.amount ?? 0) + a;
    const c = cols.color === undefined ? '' : String(r[cols.color] ?? '').trim();
    if (c && !it.colors.includes(c)) it.colors.push(c);
    if (!it.name && 이름칸 !== undefined) it.name = String(r[이름칸] ?? '').trim();
    품.set(열쇠, it);
  }
  return {
    품, 코드없는줄, 코드칸있음: 코드칸 !== undefined,
    // TOTAL 줄이 표 끝에 있나 — 발주서 표가 쪽마다 나뉘면 서버가 첫 쪽 표만 떠 TOTAL 이 없습니다.
    합계줄: rows.slice(f).some((r) => r.some((v) => 합계말.test(String(v ?? '')))),
    칸: { price: cols.price !== undefined, amount: cols.amount !== undefined,
         color: cols.color !== undefined, name: 이름칸 !== undefined },
  };
}

const 돈같음 = (x, y) => Math.round(x * 100) === Math.round(y * 100);
const 글뼈 = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
// 한쪽이 다른 쪽을 품으면 같은 것 — 발주서 「내추럴오크 Natural Oak」 와 CI 「Natural Oak」.
const 품나 = (x, y) => { const a = 글뼈(x), b = 글뼈(y); return !!a && !!b && (a.includes(b) || b.includes(a)); };

/* 색·모델명 — 양식마다 적는 말이 달라(한글+영문 / 영문만) 글자가 같을 수 없습니다.
   그래서 **한쪽이 다른 쪽을 품으면 같음**으로 보고, 맞댄 것 가운데 반 이상이 그렇게 맞을 때만
   안 맞는 것을 「다름」 으로 적습니다. 반도 안 맞으면 두 서류가 다른 말로 적은 것이라 견주지 않습니다.
   ⚠ 서버가 칸 글을 60자에서 자릅니다 — 58자 넘는 것은 잘렸을 수 있어 견주지 않습니다. */
function 글대조(짝) {
  const 볼것 = 짝.filter(([, x, y]) => x && y && x.length < 58 && y.length < 58);
  if (!볼것.length) return [];
  const 다른것 = 볼것.filter(([, x, y]) => !품나(x, y));
  return 다른것.length * 2 <= 볼것.length ? 다른것 : [];
}

/**
 * 발주서 표 하나와 잔액서류 표 하나를 코드로 맞댑니다.
 * @returns {{ 줄: {kind,name,code,from,to}[], 못댐: string|null, 단가없음: boolean,
 *             합계줄없음: boolean, 코드없는줄: {발주: number, 잔액: number} }}
 *   합계줄없음 — 발주서 표 끝에 TOTAL 줄이 없습니다. 표가 잘렸을 수 있어 「잔액서류만」 이 거짓일 수 있습니다.
 *   줄의 from 은 발주서, to 는 잔액서류 값입니다. 줄이 비고 못댐이 null 이면 차이 없음입니다.
 */
export function 발주대조(발주표, 잔액표) {
  const A = 대조품목(발주표), B = 대조품목(잔액표);
  const 빈 = { 줄: [], 단가없음: false, 합계줄없음: false, 코드없는줄: { 발주: 0, 잔액: 0 } };
  if (!A) return { ...빈, 못댐: '발주서 품목 못 읽음' };
  if (!B) return { ...빈, 못댐: '잔액서류 품목 못 읽음' };
  const 코드없는줄 = { 발주: A.코드없는줄, 잔액: B.코드없는줄 };
  const 합계줄없음 = !A.합계줄;
  if (!A.코드칸있음) return { ...빈, 코드없는줄, 합계줄없음, 못댐: '발주서 코드 칸 없음' };
  if (!B.코드칸있음) return { ...빈, 코드없는줄, 합계줄없음, 못댐: '잔액서류 코드 칸 없음' };

  const 줄 = [];
  const 덧 = (kind, it, from, to) => 줄.push({ kind, name: it.code, code: '', from, to });
  const 둘다 = [];
  for (const [k, a] of A.품) if (!B.품.has(k)) 덧('발주서만', a, a.qty, null); else 둘다.push([a, B.품.get(k)]);
  for (const [k, b] of B.품) if (!A.품.has(k)) 덧('잔액서류만', b, null, b.qty);

  for (const [a, b] of 둘다) if (a.qty !== b.qty) 덧('수량', a, a.qty, b.qty);

  // 단가 — 발주서에 단가가 하나도 없으면 「발주서에 단가 없음」 한 번만. 줄마다 단가가 여럿이면 견주지 않습니다.
  const 단가있음 = 둘다.some(([a]) => a.price.length);
  const 단가없음 = B.칸.price && 둘다.length > 0 && !단가있음;
  for (const [a, b] of 둘다)
    if (a.price.length === 1 && b.price.length === 1 && !돈같음(a.price[0], b.price[0])) 덧('단가', a, a.price[0], b.price[0]);
  for (const [a, b] of 둘다)
    if (a.amount !== null && b.amount !== null && !돈같음(a.amount, b.amount)) 덧('금액', a, a.amount, b.amount);

  if (A.칸.color && B.칸.color)
    for (const [a, x, y] of 글대조(둘다.map(([a, b]) => [a, a.colors.join(' · '), b.colors.join(' · ')]))) 덧('색상', a, x, y);
  if (A.칸.name && B.칸.name)
    for (const [a, x, y] of 글대조(둘다.map(([a, b]) => [a, a.name, b.name]))) 덧('모델명', a, x, y);

  // 합계 — 품목 줄을 더한 것끼리. 금액은 양쪽 다 금액이 적힌 줄이 있을 때만.
  const 더 = (m, k) => [...m.values()].reduce((s, x) => (x[k] === null ? s : s + x[k]), 0);
  const 금액있나 = (m) => [...m.values()].some((x) => x.amount !== null);
  const 합 = { kind: '합계', code: '' };
  if (더(A.품, 'qty') !== 더(B.품, 'qty')) 줄.push({ ...합, name: '수량', from: 더(A.품, 'qty'), to: 더(B.품, 'qty') });
  if (금액있나(A.품) && 금액있나(B.품) && !돈같음(더(A.품, 'amount'), 더(B.품, 'amount')))
    줄.push({ ...합, name: '금액', from: 더(A.품, 'amount'), to: 더(B.품, 'amount') });
  return { 줄, 못댐: null, 단가없음, 합계줄없음, 코드없는줄 };
}

/* ── 내용보기 ↔ 벤더피아 단품 ─────────────────────────────
 * 사장님 11-02 「발주 또는 잔액서류 내용보기에서 나타나는 제품코드(code#) 값을 … 벤더피아 단품관리의 제품코드들과
 *   일치성을 확인하여 … 코드와 상품명이 일치한다면 내용보기의 상품명을 벤더피아연동의 동일한 단품버튼으로 …
 *   일치하지 않는 내용은 붉은색으로 표기하여 벤더피아와 일치하지 않는 제품임을 알려줘」
 *
 * 단품 목록 = 창고 `납품내역_단품목록` — 벤더피아연동이 단품관리를 열 때 올립니다(goods.js 단품목록올리기).
 *   문서 `단품_1`·`단품_2`… 칸 `줄` = ["단품코드\t단품명\t판매상태", …]. 여기서는 읽기만.
 * ⚠ 코드는 **코드열쇠**(밑줄 꼴만 하나로)로만 맞댑니다. `-`·공백·대소문자가 다르면 다른 단품입니다.
 */

/** `납품내역_단품목록` 문서들 → 코드열쇠 → { 코드, 이름, 상태, 양품? }. 같은 열쇠가 둘이면 앞의 것.
 *  넷째 칸 양품수(벤더피아연동 0.34.82~, 재고조회 단품별 합)는 숫자일 때만 `양품` — 빈칸·옛 세 칸 줄은 없음. */
export function 벤더피아단품사전(문서들) {
  const 사전 = new Map();
  const 차례 = (문서들 ?? [])
    .map((d) => [/^단품_(\d+)$/.exec(d?.id ?? '')?.[1], d?.줄])
    .filter(([n, 줄]) => n && Array.isArray(줄))
    .sort((a, b) => a[0] - b[0]);
  for (const [, 줄] of 차례)
    for (const s of 줄) {
      const [코드 = '', 이름 = '', 상태 = '', 양 = ''] = String(s ?? '').split('\t').map((v) => v.trim());
      const k = 코드열쇠(코드);
      if (!코드 || 사전.has(k)) continue;
      const x = { 코드, 이름, 상태 };
      if (/^-?\d+$/.test(양)) x.양품 = Number(양);
      사전.set(k, x);
    }
  return 사전;
}

/** `납품내역_상품목록` 문서들 → 단품 코드열쇠 → 그 단품이 든 상품들 [{ 코드, 이름, 상태, 단품들 }] (받은 차례). */
export function 벤더피아상품연결(문서들) {
  const m = new Map();
  const 차례 = (문서들 ?? [])
    .map((d) => [/^상품_(\d+)$/.exec(d?.id ?? '')?.[1], d?.줄])
    .filter(([n, 줄]) => n && Array.isArray(줄))
    .sort((a, b) => a[0] - b[0]);
  for (const [, 줄] of 차례)
    for (const s of 줄) {
      const [코드 = '', 이름 = '', 상태 = '', 단 = ''] = String(s ?? '').split('\t');
      if (!코드.trim()) continue;
      const x = { 코드: 코드.trim(), 이름: 이름.trim(), 상태: 상태.trim(), 단품들: 단.split(/[,+]/).map((v) => v.trim()).filter(Boolean) };
      for (const k of new Set(x.단품들.map(코드열쇠))) { if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    }
  return m;
}

/* 상품명 견주기 — 띄어쓰기·대소문자·괄호·문장부호는 안 봅니다(NFKC 뒤 글자와 숫자만).
   그렇게 다듬은 두 이름이 **같거나 한쪽이 다른 쪽을 품으면** 같은 이름입니다
   (발주서 대조의 색·모델명과 같은 결 — 「리안 2100 거실장 화이트」 ↔ 「리안 2100 거실장 화이트(해피코)」).
   ⚠ 맞음 판정에는 안 씁니다(코드만, 사장님 11-02) — 단추로 바꿀 이름 칸을 고를 때만 봅니다. */
export const 이름뼈 = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const 이름같음 = (x, y) => {
  const a = 이름뼈(x), b = 이름뼈(y);
  return a.length > 1 && b.length > 1 && (a === b || a.includes(b) || b.includes(a));
};

/* 이름 후보(v0.104.0) — 사장님 11-02 「…벤더피아 없음으로 표기될경우 해당 상품명을 벤더피아연동 단품관리에서 검색하여
   상품명이 일치하는경우 해당 단품코드를 보여주고 클릭/ 수정하여 연동이 가능하게 해줘」.
   이름같음 그대로(뼈가 같거나 한쪽이 품음). 다만 품는 쪽 짧은 뼈가 4글자 아래면 안 봅니다 — 「블랙」 같은 낱말이 다 걸립니다.
   같은 뼈가 먼저, 그다음 받은 차례. 제안만 합니다 — 맞음으로 치지 않습니다. */
export function 이름후보(이름글들, 사전, 최대 = 6) {
  const 뼈들 = [...new Set((이름글들 ?? []).map(이름뼈).filter((b) => b.length > 1))];
  if (!뼈들.length || !사전) return [];
  const 같음 = [], 품음 = [];
  for (const vp of 사전.values()) {
    const v = 이름뼈(vp.이름);
    if (v.length < 2) continue;
    if (뼈들.includes(v)) 같음.push(vp);
    else if (뼈들.some((b) => Math.min(b.length, v.length) >= 4 && (b.includes(v) || v.includes(b)))) 품음.push(vp);
  }
  return [...같음, ...품음].slice(0, 최대);
}

// 상품명으로 볼 칸 — 해피코 「ITEM NAME/COLOR (KRO)」·「ITEM NAME (ENG)」, 제헤우드 「Product model」 …
const 이름칸말 = /productmodel|itemname|품명|상품명|단품명|제품명|descriptionofgoods|^description$|^model$/;
const 코드칸말 = [/^code#?$/, /^품번$/, /^코드$/, /^단품코드$/];

/**
 * 내용보기 표 한 장의 몸줄을 벤더피아 단품과 맞댑니다.
 * @param t     서버가 떠 둔 { rows: [{c:[…]}], h, f }
 * @param 사전  벤더피아단품사전(…) 의 Map
 * @param 연결  서류 코드열쇠 → 벤더피아 단품코드(사람이 이은 것, docs_config/단품연결). 없어도 됨.
 * @returns {{ 칸: {code, names}, 줄: Map<rowIndex, {kind, 칸?, vp?, 열쇠?, 이음?, 후보?}> } | { 못댐: '코드 칸 없음' }}
 *   kind — '맞음'(코드만 맞으면, 칸 = 단추로 바꿀 상품명 칸) · '코드없음' · '없음'(벤더피아에 코드 없음).
 *   맞대는 차례(v0.104.0): ① 코드 일치 → ② 이어 둔 연결(이음: true) → ③ 이름 후보(후보: [vp…], 제안만 — 여전히 '없음').
 *   머리줄·합계줄(f 뒤)·빈 줄·S/TOTAL 줄·코드 칸 글이 제품 꼴이 아닌 줄은 줄에 안 넣습니다(안 칠함).
 */
export function 벤더피아맞대기(t, 사전, 연결) {
  const rows = (t?.rows ?? []).map((r) => (Array.isArray(r) ? r : r?.c ?? []));
  const h = Math.max(1, t?.h ?? 1), f = Math.min(t?.f ?? rows.length, rows.length);
  let code;
  const names = [];
  for (const r of rows.slice(0, h))
    r.forEach((v, c) => {
      const k = 칸글(v);
      if (!k) return;
      if (code === undefined && 코드칸말.some((re) => re.test(k))) code = c;
      else if (이름칸말.test(k) && !names.includes(c)) names.push(c);
    });
  if (code === undefined) return { 못댐: '코드 칸 없음' };
  const 줄 = new Map();
  for (let i = h; i < f; i++) {
    const r = rows[i];
    const 글 = (c) => String(r[c] ?? '').trim();
    if (!r.some((v) => String(v ?? '').trim())) continue;               // 빈 줄
    if (r.some((v) => 합계말.test(String(v ?? '')))) continue;          // S/TOTAL 같은 중간 합계
    const 코드 = 글(code).replace(/\s+/g, ' ');
    const 이름들 = names.filter((c) => 글(c));
    if (!코드) { if (이름들.length) 줄.set(i, { kind: '코드없음' }); continue; }
    if (!제품줄인가(코드)) continue;
    const 열쇠 = 코드열쇠(코드);
    let vp = 사전?.get(열쇠), 이음 = false;
    if (!vp && 연결?.get(열쇠)) { vp = 사전?.get(코드열쇠(연결.get(열쇠))); 이음 = !!vp; }
    if (!vp) { 줄.set(i, { kind: '없음', 열쇠, 후보: 이름후보(이름들.map(글), 사전) }); continue; }
    // 코드만 맞으면 맞음(사장님 11-02) — 단추는 이름이 닮은 칸, 없으면 첫 이름 칸.
    줄.set(i, { kind: '맞음', 칸: 이름들.find((c) => 이름같음(글(c), vp.이름)) ?? 이름들[0], vp, 열쇠, 이음 });
  }
  return { 칸: { code, names }, 줄 };
}

/* ── 가격 칸 가리기 (v0.99.0) ───────────────────────────
   사장님 11-02 「내용보기에 나타나는 정보중 FOB / AMOUNT/TOTAL등 가격정보를 블러처리하여 나타나게 해주고
   해당정보를 볼 수 있는 권한의 아이디만 볼 수 있다고 안내 해주세요.」
   원본 양식이라 칸 이름이 서류마다 다릅니다 — 머리줄(h 줄 전부 이어 붙인 글)로 가격 칸을 알아봅니다.
   11-02 드라이브 동기 폴더 제헤우드·해피코 엑셀 139·PDF 276 에서 센 가격 머리:
     PRICE (FOB Qingdao) · PRICE (FOBQingdao) · FOB · AMOUNT · Amount · Total(제헤우드 CI 금액) · Unit Price · 매입가 · 환율적용 운임세금
   임시통합은 단가 · 금액. 베이지아 CI 는 둘째 머리줄이 「CNY」.
   가리는 것: ① 가격 칸의 값 ② 어느 칸이든 통화 표(¥ $ CNY USD …)가 붙은 값 ③ 합계줄(f 뒤)의 숫자 — 수량·CBM·무게 칸은 뺌.
   가리지 않는 것: 머리줄 · 수량·CBM·무게·크기 · 빈 칸. 칸 이름 자체는 보입니다. */
const 가격말 = /price|fob|amount|단가|금액|가격|매입가|원가|환율|운임|单价|金额|总价|价格|货值|usd|cny|rmb|currency|value|cost/i;
const 합계칸말 = /^(sub)?total$|^합계$|^총계$|^합$|^合计$|^总计$/;
const 비가격말 = /cbm|qty|quantity|수량|数量|pcs|ctn|carton|kg|weight|^nw|^gw|毛重|净重|立方|volume|size|규격|사이즈|부피|입수/;
const 돈표 = /[¥￥$€£]|&yen;|(?:^|[^a-z])(?:cny|usd|rmb)(?:$|[^a-z])/i;

/** 표 한 장 → { 칸: 가격 칸 Set, 가릴(v, c, i) } — i 는 rows 안 줄 번호(머리 포함). */
export function 가격칸(t) {
  const rows = (t?.rows ?? []).map((r) => (Array.isArray(r) ? r : r?.c ?? []));
  const h = t?.h ?? 1, f = Math.min(t?.f ?? rows.length, rows.length);
  const 너비 = Math.max(0, ...rows.map((r) => r.length));
  const 머리 = Array.from({ length: 너비 }, (_, c) =>
    rows.slice(0, h).map((r) => String(r[c] ?? '').trim()).filter(Boolean).join(' '));
  const 칸 = new Set(), 비가격 = new Set();
  머리.forEach((m, c) => {
    if (!m) { if (칸.has(c - 1)) 칸.add(c); return; }       // 옆으로 합친 머리(colspan) 밑 칸은 왼쪽 가격 칸을 따름
    const k = 칸글(m);
    if (가격말.test(m) || 합계칸말.test(k)) 칸.add(c);
    else if (비가격말.test(k)) 비가격.add(c);
  });
  const 가릴 = (v, c, i) => {
    const s = String(v ?? '').trim();
    if (i < h || !s) return false;
    if (칸.has(c) || 돈표.test(s)) return true;
    return i >= f && !비가격.has(c) && 대조숫자(s) !== null;
  };
  return { 칸, 가릴 };
}
