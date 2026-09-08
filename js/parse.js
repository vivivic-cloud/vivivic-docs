/**
 * VIVIVIC 서류관리 — 파일명 파서
 * 순수 함수만 둡니다. 브라우저와 Node(테스트) 양쪽에서 그대로 씁니다.
 */

export const STAGES = [
  { id: 1, key: 'order', label: '발주서', short: '발주' },
  { id: 2, key: 'pi', label: '계약금서류 (PI 30%)', short: 'PI' },
  { id: 3, key: 'piReceipt', label: '계약금영수증', short: '계약금영수증' },
  { id: 4, key: 'loading', label: '상차이미지', short: '상차' },
  { id: 5, key: 'cipl', label: '잔액서류 (CI&PL 70%)', short: 'CI&PL' },
  { id: 6, key: 'balReceipt', label: '잔액입금영수증', short: '잔금영수증' },
  { id: 7, key: 'bl', label: '선하증권', short: 'B/L' },
];

/** 7단계에 속하지 않지만 따로 모아두면 유용한 분류 */
export const ASIDE = [
  { key: 'dev', label: '제품개발' },
  { key: 'fta', label: 'FTA · 원산지' },
  { key: 'etc', label: '미분류' },
];

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** 카카오톡 다운로드 접두사, 중복 확장자 등을 걷어냅니다. */
export function normalizeName(name) {
  // 맥은 파일명의 한글을 자모로 쪼개 저장합니다(NFD). 그대로 두면 "영수증" 이
  // 규칙의 "영수증" 과 안 맞습니다. 먼저 합쳐 놓고 시작합니다.
  let n = String(name).normalize('NFC');
  n = n.replace(/^TalkFile_+/i, '');
  // "....pdf.pdf" → "....pdf"
  n = n.replace(/(\.[a-z0-9]{2,5})\1+$/i, '$1');
  return n.trim();
}

export function extOf(name) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif']);

/**
 * 파일명에 나오는 거래처 코드.
 * 폴더는 사람이 잘못 넣을 수 있으니, 파일명에 근거가 있으면 그쪽을 믿습니다.
 * 확실한 것만 둡니다 — ING·JW 처럼 여러 거래처에 걸쳐 나오는 표기는 넣지 않습니다.
 */
export const VENDOR_ALIAS = {
  ZH: '제헤우드',
  ZEHE: '제헤우드',
};

/** 서류 안에 찍혀 오는 상호 → 거래처. 파일명·폴더가 없을 때의 마지막 근거입니다. */
export const SUPPLIER_ALIAS = [
  [/zehe/i, '제헤우드'],
  [/beijia/i, '베이지아'],
];

/**
 * 파일명만 보고 거래처를 정합니다. 근거가 없으면 null 을 돌려주고,
 * 그때만 폴더 이름을 씁니다.
 * @param vendors 이번 스캔에서 실제로 본 거래처 이름들
 */
export function parseVendor(rawName, vendors = [], doc = null) {
  const n = normalizeName(rawName);

  // 0) 서류 안에 상호가 찍혀 있으면 그게 가장 확실합니다.
  const supplier = doc?.cipl?.supplier;
  if (supplier) {
    const hit = SUPPLIER_ALIAS.find(([re]) => re.test(supplier));
    if (hit && vendors.includes(hit[1])) return hit[1];
  }

  // 1) 거래처 이름이 그대로 적혀 있으면 가장 확실합니다.
  for (const v of vendors) {
    if (v && v !== '(루트)' && n.includes(v)) return v;
  }

  // 2) 문서번호 안의 거래처 코드 — "26-085-AMT-ZH-16"
  const m = /-AMT-([A-Z]{2,4})-/i.exec(n);
  if (m) {
    const hit = VENDOR_ALIAS[m[1].toUpperCase()];
    if (hit && vendors.includes(hit)) return hit;
  }

  // 3) "AMT(ZH)26-11", "ZEHE-ING26 -15"
  const m2 = /\(([A-Z]{2,4})\)|\b(ZEHE|ZH)\b/i.exec(n);
  const code = (m2?.[1] ?? m2?.[2] ?? '').toUpperCase();
  const hit2 = VENDOR_ALIAS[code];
  if (hit2 && vendors.includes(hit2)) return hit2;

  return null;
}

/**
 * 파일명에서 차수를 뽑습니다. → { year: 26, no: 18, label: '26-18' } | null
 * 확신이 높은 패턴부터 시도합니다.
 */
export function parseBatch(rawName) {
  const n = normalizeName(rawName);

  // 1) 한글 명시형이 가장 확실합니다: "제헤우드 26-18차", "26-14차"
  let m = /(\d{2})\s*-\s*(\d{1,2})\s*차/.exec(n);
  if (m) return mk(m[1], m[2]);

  // 2) 거래처 코드가 붙은 형태: "AMT(ZH)26-18", "ING26-14", "ZEHE-ING26 -15"
  m = /(?:ZH|ING|JW|BJ)\)?\s*-?\s*(?:20)?(\d{2})\s*-\s*(\d{1,2})(?!\d)/i.exec(n);
  if (m) return mk(m[1], m[2]);

  // 3) "AMT2026-18", "AMT2026-19书架"
  m = /AMT\s*(?:20)?(\d{2})\s*-\s*(\d{1,2})(?!\d)/i.exec(n);
  if (m) return mk(m[1], m[2]);

  // 4) 문서번호가 해를 알려주는 경우: "25-182-AMT-13-B-포니엘 6차" → 25-06
  //    문서번호 앞 두 자리가 해입니다. 차수는 "N차" 표기를 먼저 믿고,
  //    없으면 "AMT-ZH-16" 처럼 거래처 코드 뒤에 붙은 번호를 씁니다.
  const docNo = /(\d{2})-\d{3}-AMT/i.exec(n);
  if (docNo) {
    const cha = /(?:^|[^\d])(\d{1,2})\s*차/.exec(n);
    if (cha) return mk(docNo[1], cha[1]);
    const tail = /-AMT-(?:[A-Z]{2}-)?(\d{1,2})(?!\d)/i.exec(n);
    if (tail) return mk(docNo[1], tail[1]);
  }

  // 5) "(제헤우드 26-16)" 처럼 차 없이 적힌 것, "26-16.17" 같은 복수 차수 → 첫 번째만.
  //    뒤에 숫자가 더 붙으면 차수가 아니라 문서번호입니다 — 26-085 는 26-08차가 아닙니다.
  m = /(?:^|[^\d])(2[4-9])\s*-\s*(\d{1,2})(?!\d)/.exec(n);
  if (m) return mk(m[1], m[2]);

  return null;

  function mk(y, no) {
    const year = Number(y) % 100;
    const num = Number(no);
    if (!Number.isFinite(year) || !Number.isFinite(num) || num < 1 || num > 60) return null;
    return { year, no: num, label: `${String(year).padStart(2, '0')}-${String(num).padStart(2, '0')}` };
  }
}

/**
 * 파일명을 7단계 중 하나(또는 부가 분류)로 판정합니다.
 * → { key, stage|null, why }
 */
export function classify(rawName) {
  const n = normalizeName(rawName);
  const ext = extOf(n);
  const hit = (key, why) => ({ key, stage: STAGE_BY_KEY[key]?.id ?? null, why });

  // 7. 선하증권 — SHBL / HBL / MBL / B/L / 선하증권
  if (/선하증권|\b(?:SH|H|M)?BL[-_ ]?[A-Z0-9]{4,}|\bB\s*\/\s*L\b|提单/i.test(n)) return hit('bl', '선하증권 키워드');

  // 6/3. 영수증 계열은 30% / 70% 로 갈립니다
  const isReceipt = /영수증|수령증|receipt/i.test(n);
  if (isReceipt) {
    if (/잔금|잔액|70\s*%|balance/i.test(n)) return hit('balReceipt', '영수증 + 잔금/70%');
    if (/계약금|30\s*%|선수금|deposit/i.test(n)) return hit('piReceipt', '영수증 + 계약금/30%');
    return hit('piReceipt', '영수증 (기본 계약금으로 분류)');
  }

  // 5. 잔액서류 — CI&PL / 인보이스+패킹
  if (/CI\s*[&＆和]\s*PL|CI\s*_?\s*PL\b|packing\s*list|装箱单/i.test(n)) return hit('cipl', 'CI&PL');
  if (/70\s*%/.test(n)) return hit('cipl', '70% 표기');

  // 2. 계약금서류 — PI 번호, 그리고 거래처가 보내오는 订单合同(주문계약서)
  if (/(?<![A-Za-z])PI(?![A-Za-z])|proforma|形式发票/i.test(n)) return hit('pi', 'PI 번호');
  // 合同 은 계약서입니다. 이걸 받고 계약금 30%를 넣으므로 발주서가 아니라 계약금서류로 봅니다.
  if (/合同|계약서|주문계약/.test(n)) return hit('pi', '계약서(合同)');
  if (/30\s*%/.test(n)) return hit('pi', '30% 표기');

  // 4. 상차이미지
  if (/상차|装[车車]|裝車|loading/i.test(n)) return hit('loading', '상차 키워드');

  // 1. 발주서 — AMT이 내보내는 Ordersheet·PO 쪽만입니다.
  //    거래처가 보내오는 중국어 파일(订单·报价 등)은 발주서가 될 수 없습니다.
  if (/ordersheet|order\s*sheet|(?<![A-Za-z])PO(?![A-Za-z])|purchase\s*order|발주서|주문서/i.test(n))
    return hit('order', '발주 키워드');

  // 부가: FTA·원산지
  if (/\bFTA\b|원산지|C\/O\b|certificate\s*of\s*origin/i.test(n)) return hit('fta', 'FTA·원산지');

  // 부가: 제품개발 (견적/도면/작업지시)
  if (/견적|报价|報價|quotation|도면|작업지.{0,2}서|지시서|설명서|说明|사양|스펙|spec/i.test(n) || ext === 'dxf')
    return hit('dev', '견적·도면·지시서');

  // 이미지인데 상차 표기가 없는 경우
  if (IMAGE_EXT.has(ext)) return hit('etc', '분류 근거 없는 이미지');

  return hit('etc', '규칙에 걸리지 않음');
}


/* ── 중국어 파일명 뜻풀이 ─────────────────────────────── */

/**
 * 거래처가 보내오는 파일명에 나오는 말들입니다.
 * 긴 것부터 맞춰 보므로 순서가 중요합니다 — 形式发票和装箱单 이 形式发票 보다 먼저.
 */
export const CJK_GLOSS = [
  ['形式发票和装箱单发给客户', 'PI·패킹리스트 거래처 발송'],
  ['形式发票和装箱单', 'PI·패킹리스트'],
  ['形式发票', '프로포마 인보이스(PI)'],
  ['装箱单', '패킹리스트'],
  ['电放单', '전신방출 선하증권'],
  ['立方数', '재화 부피'],
  ['两种方案', '두 가지 안'],
  ['组合柜', '조합장'],
  ['转角柜', '코너장'],
  ['复合板', '복합판'],
  ['白色', '흰색'],
  ['箱唛', '화인'],
  ['旋转', '회전'],
  ['书架', '책장'],
  ['产品', '제품'],
  ['订单', '주문'],
  ['合同', '계약서'],
  ['报价', '견적'],
  ['報價', '견적'],
  ['发票', '인보이스'],
  ['提单', '선하증권'],
  ['装车', '상차'],
  ['裝車', '상차'],
  ['客户', '거래처'],
  ['发给', '발송'],
  ['说明', '설명'],
  ['方案', '안'],
  ['贸易', '무역'],
  ['床', '침대'],
  ['柜', '장'],
  ['加', '추가'],
  ['和', '및'],
  ['年', '년'],
];

/**
 * 중국어가 든 파일명을 대충 풀어 줍니다. 없으면 null.
 * 사전에 있는 말만 바꾸고 모르는 글자는 그대로 둡니다 — 번역기가 아니라 길잡이입니다.
 */
export function glossCJK(rawName) {
  const runs = normalizeName(rawName).match(/[\u4e00-\u9fff]+/g);
  if (!runs) return null;

  return runs
    .map((run) => {
      let rest = run;
      const words = [];
      while (rest) {
        const hit = CJK_GLOSS.find(([zh]) => rest.startsWith(zh));
        if (hit) {
          words.push(hit[1]);
          rest = rest.slice(hit[0].length);
        } else {
          words.push(rest[0]); // 모르는 글자는 그대로 둡니다
          rest = rest.slice(1);
        }
      }
      return words.join(' ');
    })
    .join(' · ');
}

/* ── 잔액서류(CI&PL) 요약 ──────────────────────────────── */

/** 셀 글자를 견주기 좋게 다듬습니다 — "G.W. \n(KGS)" 를 "gwkgs" 로. */
const cell = (v) => String(v ?? '').replace(/[\s.()]+/g, '').toLowerCase();

/**
 * 어느 칸이 무엇인지 알아보는 규칙.
 * 거래처마다 머리글이 다릅니다 — "Qty Carton" 도 있고 "PACKING (CTNS)" 도 있습니다.
 */
const CIPL_COLS = [
  ['cartons', [/qtycarton/, /ctns/, /箱数/]],
  ['cbm', [/totalcbm/, /^volumecbm$/, /^cbm$/, /立方/]],
  ['gross', [/^gw/, /grossweight/, /毛重/]],
  ['net', [/^nw/, /netweight/, /净重/]],
  ['pcs', [/qtypcs/, /quantitypcs/, /^pcs$/]],
];

/** 합계 줄임을 대놓고 밝히는 말 */
const TOTAL_ROW = /total|合计|總計|总计|小计|합계/i;

/**
 * 잔액서류(CI&PL)의 패킹리스트에서 카톤수·CBM·중량을 뽑습니다.
 * rows 는 sheet_to_json(header:1) 로 뽑은 배열의 배열입니다.
 *
 * 합계 줄을 같이 더하면 두 배가 됩니다. 그런데 합계 줄이 "TOTAL" 이라고
 * 써 있는 양식도 있고, 그냥 숫자만 있는 양식도 있습니다. 그래서 마지막 줄이
 * 나머지의 합과 맞아떨어지면 그건 합계 줄로 보고 빼냅니다.
 */
export function readCipl(rows) {
  if (!Array.isArray(rows)) return null;

  // 1) 머리글 찾기. 두 줄에 걸쳐 있는 양식이 있어 아랫줄까지 붙여 봅니다.
  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const merged = [];
    for (const r of [rows[i] ?? [], rows[i + 1] ?? []])
      r.forEach((v, c) => (merged[c] = (merged[c] ?? '') + cell(v)));

    const found = {};
    merged.forEach((t, c) => {
      if (!t) return;
      for (const [key, res] of CIPL_COLS)
        if (found[key] === undefined && res.some((re) => re.test(t))) found[key] = c;
    });
    if (found.cartons !== undefined && found.cbm !== undefined) {
      head = i;
      cols = found;
      break;
    }
  }
  if (head < 0) return null;

  // 2) 카톤 칸에 숫자가 있는 줄만 추립니다. 합계라고 써 있는 줄은 뺍니다.
  const keys = Object.keys(cols);
  const picked = [];
  for (let i = head + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.some((v) => TOTAL_ROW.test(String(v ?? '')))) continue;
    if (!Number.isFinite(Number(row[cols.cartons]))) continue;
    picked.push(Object.fromEntries(keys.map((k) => [k, Number(row[cols[k]]) || 0])));
  }
  if (!picked.length) return null;

  // 3) 마지막 줄이 나머지의 합이면 그건 합계 줄입니다.
  const add = (list, k) => list.reduce((n, r) => n + r[k], 0);
  const last = picked[picked.length - 1];
  const rest = picked.slice(0, -1);
  const looksTotal =
    rest.length > 0 && Math.abs(add(rest, 'cartons') - last.cartons) <= Math.max(1, last.cartons * 0.02);
  const body = looksTotal ? rest : picked;

  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const a = add(body, 'gross');
  const b = add(body, 'net');
  // 총중량은 순중량보다 작을 수 없습니다(포장 무게가 더해지니까요).
  // 실제 서류에는 두 칸이 뒤바뀐 게 흔해서, 큰 쪽을 총중량으로 봅니다.
  const swapped = a > 0 && b > 0 && a < b;
  return {
    lines: body.length,
    pcs: Math.round(add(body, 'pcs')),
    cartons: Math.round(add(body, 'cartons')),
    cbm: round(add(body, 'cbm'), 3),
    gross: round(Math.max(a, b), 1),
    net: round(a && b ? Math.min(a, b) : 0, 1),
    swapped,
  };
}

/* ── 서류 간추리기 ────────────────────────────────────── */

/** 머리말에 이름표를 달고 오는 값들 */
const BRIEF_LABELS = [
  ['piNo', /^pino$/],
  ['orderDate', /^orderdate$/],
  ['deliveryDate', /^deliverydate$/],
  ['invoiceDate', /^invoicedate/],
];

/** 합계 줄에서 찾을 칸 */
const BRIEF_COLS = [
  ['qty', [/^quantity$/, /qtypcs/, /^수량$/]],
  ['amount', [/^amount$/, /^총액$/]],
  ['cbm', [/^cbm$/, /totalcbm/]],
];

/** "2026.08.03" · "20260803" → 2026-08-03 */
function briefDate(v) {
  const t = String(v ?? '').trim();
  let m = /(20\d{2})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})/.exec(t);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`;
}

/**
 * 서류 한 장을 한 줄로 간추립니다.
 * 같은 칸에 서류가 여러 장일 때 무엇이 다른지 눈으로 가리려는 용도입니다.
 * (수정본이 쌓이면 파일명만으로는 구별이 안 됩니다.)
 */
export function readBrief(rows) {
  if (!Array.isArray(rows)) return null;
  const out = {};

  // 1) 이름표가 붙은 값 — 이름표 오른쪽에서 가장 가까운 값을 집습니다.
  for (let i = 0; i < Math.min(rows.length, 14); i++) {
    const row = rows[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      const key = cell(row[c]).replace(/[:：]/g, '');
      const hit = BRIEF_LABELS.find(([, re]) => re.test(key));
      if (!hit) continue;
      for (let k = c + 1; k < row.length; k++) {
        const v = String(row[k] ?? '').trim();
        if (!v) continue;
        out[hit[0]] = hit[0].endsWith('Date') ? briefDate(v) ?? v : v;
        break;
      }
    }
  }

  // 2) 합계 줄 — 머리글로 어느 칸이 무엇인지 알아냅니다.
  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const found = {};
    (rows[i] ?? []).forEach((v, c) => {
      const t = cell(v);
      if (!t) return;
      for (const [key, res] of BRIEF_COLS)
        if (found[key] === undefined && res.some((re) => re.test(t))) found[key] = c;
    });
    if (found.qty !== undefined && found.amount !== undefined) {
      head = i;
      cols = found;
      break;
    }
  }
  if (head >= 0) {
    for (let i = head + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (!/^total$/i.test(String(row[0] ?? '').trim())) continue;
      for (const [key, c] of Object.entries(cols)) {
        const n = Number(row[c]);
        if (Number.isFinite(n) && n) out[key] = n;
      }
      // 컨테이너 표기가 같은 줄에 섞여 옵니다 — "40HC*1"
      const box = row.map((v) => String(v ?? '')).find((v) => /\d{2}\s*(HC|GP|FT)\b/i.test(v));
      if (box) out.container = box.trim();
      break;
    }
  }

  // 3) 계약금·잔금
  for (const row of rows) {
    const label = (row ?? []).map((v) => cell(v)).find((t) => /^(deposit|balance)\d{0,3}%?$/.test(t));
    if (!label) continue;
    const nums = (row ?? []).map(Number).filter((n) => Number.isFinite(n) && n);
    if (nums.length) out[label.startsWith('deposit') ? 'deposit' : 'balance'] = nums[nums.length - 1];
  }

  return Object.keys(out).length ? out : null;
}

/* ── 서류 안의 품목 ───────────────────────────────────── */

const ITEM_COLS = [
  ['code', [/^code#?$/, /^품번$/, /^코드$/]],
  ['alt', [/^zh#?$/, /^no#?$/]],
  ['name', [/^productmodel$/, /^itemname$/, /^품명$/, /^descriptionofgoods$/]],
  ['qty', [/^quantity$/, /^orderqty$/, /^qtypcs$/, /^qty$/, /^수량$/]],
];

/**
 * 서류의 품목 줄을 뽑습니다 — 무엇이 몇 개인지.
 * 합계만 견주면 "수량 +10" 까지만 알 수 있습니다.
 * 어떤 제품이 늘고 줄었는지 보려면 품목이 있어야 합니다.
 */
export function readItems(rows) {
  if (!Array.isArray(rows)) return null;

  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const found = {};
    (rows[i] ?? []).forEach((v, c) => {
      const t = cell(v);
      if (!t) return;
      for (const [key, res] of ITEM_COLS)
        if (found[key] === undefined && res.some((re) => re.test(t))) found[key] = c;
    });
    if (found.qty !== undefined && (found.code !== undefined || found.alt !== undefined)) {
      head = i;
      cols = found;
      break;
    }
  }
  if (head < 0) return null;

  const codeCol = cols.code ?? cols.alt;
  const out = new Map();
  for (let i = head + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.some((v) => TOTAL_ROW.test(String(v ?? '')))) break; // 합계 줄에서 멈춥니다
    const code = String(row[codeCol] ?? '').trim().replace(/\s+/g, ' ');
    const qty = Number(row[cols.qty]);
    if (!code || !Number.isFinite(qty)) continue;

    const name = String(row[cols.name] ?? '').trim().split(/\r?\n/)[0].slice(0, 40);
    const had = out.get(code);
    // 같은 코드가 색깔별로 여러 줄인 양식이 있습니다 — 합쳐서 셉니다.
    if (had) had.qty += qty;
    else out.set(code, { code, name, qty });
  }
  return out.size ? [...out.values()] : null;
}

/* ── 발주서 PDF 안의 품목 ─────────────────────────────────
 * 구글 문서로 바꾸면 표가 "탭 + 칸 내용" 으로 풀립니다.
 * 칸 순서는 판마다 조금씩 다릅니다(일련번호 유무, 빈 칸 하나 더).
 * 그래서 자리를 세지 않고 **금액 → 수량 → 금액** 이 이어지는 자리를 찾습니다.
 * 그 바로 앞 두 칸이 코드·색이고, 이름은 거기서 몇 칸 더 앞을 되짚어 찾습니다.
 */

const PDF_MONEY = /^[¥$₩]\s*[\d,]+(?:\.\d+)?$/;
const PDF_INT = /^[\d,]+$/;
const PDF_CODE = /^[A-Za-z0-9][A-Za-z0-9_\-./]{1,24}$/;
const PDF_SIZE = /^\d+\s*\*/;

export function readPdfItems(text) {
  if (!text) return null;
  const cells = String(text)
    .split('\t')
    .map((c) => c.replace(/\u00a0/g, ' ').trim());

  const out = new Map();
  let lastName = '';

  for (let i = 2; i + 2 < cells.length; i++) {
    if (!PDF_MONEY.test(cells[i])) continue;
    if (!PDF_INT.test(cells[i + 1]) || !PDF_MONEY.test(cells[i + 2])) continue;

    const code = cells[i - 2];
    if (!PDF_CODE.test(code)) continue;

    // 이름은 색·코드·치수 앞에 있습니다. 색깔만 다른 이어지는 줄은
    // 앞 칸이 죄다 비어 있어, 바로 위 품목의 이름을 물려받습니다.
    let name = '';
    for (let k = i - 3; k >= i - 6 && k >= 0; k--) {
      const c = cells[k];
      if (!c || PDF_SIZE.test(c) || PDF_MONEY.test(c) || PDF_INT.test(c) || PDF_CODE.test(c)) continue;
      name = c.split(/\r?\n/)[0].trim().slice(0, 40);
      break;
    }
    if (name) lastName = name;
    else name = lastName;

    const qty = Number(cells[i + 1].replace(/,/g, ''));
    if (!Number.isFinite(qty)) continue;

    const had = out.get(code);
    if (had) had.qty += qty;
    else out.set(code, { code, name, qty });
  }

  return out.size ? [...out.values()] : null;
}

/* ── 사용자 정의 규칙 ─────────────────────────────────────
 * 파일명 규칙만으로 안 잡히는 파일을 사람이 직접 정의합니다.
 * rule = {
 *   id, matchType: 'path' | 'contains' | 'regex',
 *   match,                     // 경로(전체 일치) 또는 키워드/정규식
 *   action: 'assign' | 'exclude',
 *   vendor?, batch?, stageKey?, // action === 'assign' 일 때
 *   note?
 * }
 * 적용 순서: 패턴 규칙(등록 순) → 개별 파일 지정(가장 강함)
 */

export function ruleMatches(rule, doc) {
  const hay = `${doc.path} ${doc.name}`.normalize('NFC');
  switch (rule.matchType) {
    case 'path':
      return doc.path === rule.match;
    case 'contains':
      return hay.toLowerCase().includes(String(rule.match).toLowerCase());
    case 'regex':
      try {
        return new RegExp(rule.match, 'i').test(hay);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** 한 파일에 적용될 규칙들을 순서대로 겹쳐 최종 판정을 냅니다. */
export function applyRules(doc, rules) {
  if (!rules || !rules.length) return doc;
  const ordered = [
    ...rules.filter((r) => r.matchType !== 'path'),
    ...rules.filter((r) => r.matchType === 'path'),
  ];
  let out = doc;
  for (const rule of ordered) {
    if (!ruleMatches(rule, doc)) continue;
    if (rule.action === 'exclude') {
      out = { ...out, excluded: true, excludedBy: rule.id ?? rule.match };
      continue;
    }
    out = {
      ...out,
      excluded: false,
      ...(rule.vendor ? { vendor: rule.vendor } : {}),
      ...(rule.batch ? { batch: rule.batch, batchBy: rule.id ?? rule.match } : {}),
      ...(rule.stageKey ? { stageKey: rule.stageKey, stageId: STAGE_BY_KEY[rule.stageKey]?.id ?? null, why: '직접 지정' } : {}),
    };
  }
  return out;
}

/** 파일명에서 규칙 후보 키워드를 뽑아 제안합니다. */
export function suggestKeyword(name) {
  const n = normalizeName(name).replace(/\.[a-z0-9]{1,6}$/i, '');
  // 날짜·괄호·연번을 걷어내고 남는 가장 긴 토막
  const cleaned = n
    .replace(/\(\d+\)/g, ' ')
    .replace(/20\d{2}[.\-_ ]?\d{2}[.\-_ ]?\d{2}/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/[_\-.]+/g, ' ');
  const parts = cleaned
    .split(/\s+/)
    .map((x) => x.replace(/^\d+/, '').replace(/\d+$/, ''))
    .filter((x) => x.length >= 2);
  if (!parts.length) return n.slice(0, 20);
  return parts.sort((a, b) => b.length - a.length)[0].slice(0, 30);
}

/** 파일명에서 날짜(YYYY-MM-DD)를 추정합니다. */
export function parseDate(rawName) {
  const n = normalizeName(rawName);
  let m = /(20\d{2})[.\-_ ]?(\d{2})[.\-_ ]?(\d{2})(?!\d)/.exec(n);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(?:^|[^\d])(2[4-9])(\d{2})(\d{2})(?!\d)/.exec(n); // 260813
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** PI 문서번호 (예: 26-094-AMT-ZH-18 → 26-094) */
export function parseDocNo(rawName) {
  const m = /(\d{2}-\d{3})-AMT/i.exec(normalizeName(rawName));
  return m ? m[1] : null;
}

/**
 * 경로에 차수 폴더가 있으면 거기서 읽습니다 — "제헤우드/Zh-26-18차/사진.jpg" → 26-18.
 * 파일명에 차수가 있으면 그게 먼저고, 없을 때만 폴더를 봅니다.
 */
export function batchFromPath(path) {
  const parts = String(path).split('/').slice(0, -1); // 파일명은 뺍니다
  for (let i = parts.length - 1; i >= 0; i--) {
    // 폴더 이름은 사람이 직접 짓습니다. 밑줄도, 네 자리 연도도 받아 줍니다.
    // (파일명에는 이렇게까지 풀어주지 않습니다 — 날짜를 차수로 잘못 읽을 수 있어서요.)
    const seg = parts[i].replace(/_/g, '-').replace(/(^|[^\d])20(2[4-9])\s*-/g, '$1$2-');
    const got = parseBatch(seg);
    if (got) return got;
  }
  return null;
}

/**
 * 한 발주에서 나온 서류들을 잇는 번호를 뽑습니다.
 * 차수 표기가 없어도 이 번호가 같으면 같은 발주입니다.
 */
export function orderIds(rawName) {
  const n = normalizeName(rawName);
  const out = new Set();
  // 거래처 문서번호 — F-021, SN-028
  for (const m of n.matchAll(/(?:^|[^A-Za-z0-9])([FS]N?-\d{3})(?!\d)/gi)) out.add(m[1].toUpperCase());
  // 선사 예약번호 — SOFRNQB2615115
  for (const m of n.matchAll(/(SOF[A-Z]{2,3}QB\d{6,7})/gi)) out.add(m[1].toUpperCase());
  // 원산지증명 번호 — XLTTJ26010059
  for (const m of n.matchAll(/(XLTTJ\d{8,})/gi)) out.add(m[1].toUpperCase());
  // AMT 문서번호 — 26-085
  for (const m of n.matchAll(/(\d{2}-\d{3})-AMT/gi)) out.add(m[1]);
  return [...out];
}

/**
 * 선적일. 선하증권은 "HBL-...-ING-4.29.pdf" 처럼 월.일만 적혀 옵니다.
 * 해는 파일이 올라온 시각에서 빌립니다 — 그래서 추정입니다.
 */
export function shipDate(doc) {
  const exact = parseDate(doc.name);
  if (exact) return exact;
  const m = /-[A-Z]{2,4}-(\d{1,2})\.(\d{1,2})(?!\d)/i.exec(normalizeName(doc.name));
  if (!m || !doc.mtime) return null;
  const year = new Date(doc.mtime).getFullYear();
  return `${year}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

const NEAR_DAYS = 7;
const NEAR_DAYS_PAPER = 14;
/** 선적 시점에 오가는 문서 — 이름에 차수가 없어도 날짜로 이을 만합니다. */
const SHIP_TIME = new Set(['bl', 'fta']);
/** 서류 안에 인보이스 날짜가 적혀 오는 것들 */
const PAPER_TIME = new Set(['pi', 'cipl']);

/** 이 서류가 오간 시점 — 이름에 날짜가 없으면 올라온 시각으로 갈음합니다. */
const whenOf = (d) => d.date ?? (d.mtime ? new Date(d.mtime).toISOString().slice(0, 10) : null);
const dayGap = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;

/**
 * 파일 목록 → 차수별로 묶인 구조.
 * files: [{ name, path, size, mtime, vendor }]
 */
export function buildBatches(files, rules = []) {
  // 이번 스캔에서 본 거래처 이름들 — 파일명에서 거래처를 읽을 때 대조표로 씁니다.
  const vendors = [...new Set(files.map((f) => f.vendor).filter(Boolean))];

  const docs = [];
  const excluded = [];

  for (const f of files) {
    const fromName = parseBatch(f.name);
    const fromPath = fromName ? null : batchFromPath(f.path);
    const parsed = fromName ?? fromPath;

    let cls = classify(f.name);
    // 차수 폴더에 올린 사진은 상차 이미지입니다. 파일명이 해시라도 이걸로 잡힙니다.
    if (fromPath && cls.key === 'etc' && IMAGE_EXT.has(extOf(f.name)))
      cls = { key: 'loading', stage: STAGE_BY_KEY.loading.id, why: '차수 폴더에 올린 사진' };

    const named = parseVendor(f.name, vendors, f);
    let doc = {
      ...f,
      // 폴더는 사람이 잘못 넣을 수 있습니다. 파일명에 근거가 있으면 그쪽이 이깁니다.
      vendor: named ?? f.vendor,
      folderVendor: f.vendor,
      misfiled: !!named && named !== f.vendor,
      display: normalizeName(f.name),
      stageKey: cls.key,
      stageId: cls.stage,
      why: cls.why,
      date: parseDate(f.name),
      docNo: parseDocNo(f.name),
      batch: parsed ? parsed.label : null,
      batchBy: fromName ? 'name' : fromPath ? 'folder' : null,
    };
    doc = applyRules(doc, rules);
    if (doc.excluded) {
      excluded.push(doc);
      continue;
    }
    doc.ids = orderIds(doc.name);
    docs.push(doc);
  }

  // ── 같은 발주끼리 잇습니다 ──
  // 차수 표기든 문서번호든, 하나라도 겹치면 같은 발주로 봅니다.
  const parent = docs.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const first = new Map();
  docs.forEach((d, i) => {
    const keys = [];
    if (d.batch) keys.push(`${d.vendor}|b:${d.batch}`);
    for (const id of d.ids) keys.push(`${d.vendor}|i:${id}`);
    for (const k of keys) {
      if (first.has(k)) union(first.get(k), i);
      else first.set(k, i);
    }
  });

  // 묶음마다 차수 이름을 정합니다 — 회원 중에 차수를 가진 게 있으면 그걸 씁니다.
  const members = new Map();
  docs.forEach((d, i) => {
    const r = find(i);
    if (!members.has(r)) members.set(r, []);
    members.get(r).push(d);
  });

  const batches = new Map();
  const unassigned = [];

  for (const group of members.values()) {
    const votes = new Map();
    for (const d of group) if (d.batch) votes.set(d.batch, (votes.get(d.batch) ?? 0) + 1);
    const label = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // 차수 이름이 없는 묶음은 아직 발주로 못 봅니다. 미분류로 둡니다.
    if (!label) {
      unassigned.push(...group);
      continue;
    }
    for (const d of group) {
      // 자기 이름엔 차수가 없었는데 번호로 딸려온 서류입니다.
      if (!d.batch) d.joinedBy = d.ids.join(', ');
      d.batch = label;
      put(d, label);
    }
  }

  // ── 아직 못 붙은 서류를 선적일로 이어봅니다 ──
  // 선하증권처럼 이름에 차수가 없는 것들입니다. 후보가 하나뿐일 때만 붙입니다.
  const stillLoose = [];
  for (const d of unassigned) {
    // 어디에 견줄지는 서류 성격에 따라 다릅니다.
    let when = null;
    let pool = null;
    let gate = NEAR_DAYS;
    let why = '';

    if (SHIP_TIME.has(d.stageKey)) {
      // 선하증권은 이름에 선적일이 적혀 옵니다. 선적 시점 문서(CI&PL)하고만 견줍니다.
      when = shipDate(d);
      pool = (b) => b.docs.filter((x) => x.stageKey === 'cipl' && x.date).map((x) => x.date);
      why = '선적일';
    } else if (PAPER_TIME.has(d.stageKey) && d.cipl?.invoiceDate) {
      // 파일명에 차수가 없는 거래처는 서류 **안**의 인보이스 날짜가 유일한 단서입니다.
      when = d.cipl.invoiceDate;
      pool = (b) => b.docs.map(whenOf).filter(Boolean);
      gate = NEAR_DAYS_PAPER;
      why = '서류에 적힌 날짜';
    }

    if (!when || !pool) {
      stillLoose.push(d);
      continue;
    }

    const ranked = [...batches.values()]
      .filter((b) => b.vendor === d.vendor)
      .map((b) => ({ b, gap: Math.min(...pool(b).map((x) => dayGap(x, when)), Infinity) }))
      .filter((x) => x.gap <= gate)
      .sort((a, b) => a.gap - b.gap);

    // 1등이 2등보다 확실히 가까울 때만 붙입니다. 비슷하면 사람이 봐야 합니다.
    const clear = ranked[0] && (!ranked[1] || ranked[1].gap - ranked[0].gap >= 2);

    // 잔액서류는 선적 수치의 근거라, 이미 제대로 붙은 게 있으면 추정으로 얹지 않습니다.
    // 이때 2등으로 떠넘기지도 않습니다 — 엉뚱한 차수에 들어가느니 미분류가 낫습니다.
    const taken =
      clear && d.stageKey === 'cipl' && ranked[0].b.docs.some((x) => x.stageKey === 'cipl' && !x.guessed);

    if (clear && !taken) {
      d.batch = ranked[0].b.batch;
      d.guessed = `${why} ${when} 이 이 차수 서류와 ${Math.round(ranked[0].gap)}일 차이`;
      ranked[0].b.docs.push(d);
    } else {
      stillLoose.push(d);
    }
  }

  const list = [...batches.values()].map(summarize);
  list.sort((a, b) => b.year - a.year || b.no - a.no || a.vendor.localeCompare(b.vendor));
  return { batches: list, unassigned: collapse(stillLoose), excluded: collapse(excluded) };

  function put(doc, label) {
    const [y, no] = label.split('-').map(Number);
    const id = `${doc.vendor}::${label}`;
    if (!batches.has(id)) batches.set(id, { id, vendor: doc.vendor, batch: label, year: y, no, docs: [] });
    batches.get(id).docs.push(doc);
  }
}

/** 차수 하나에 대해 단계별 채움 여부·진행률·이상 징후를 계산합니다. */
export function summarize(raw) {
  // 내용이 같은 파일은 한 건으로 접고 시작합니다.
  const b = { ...raw, docs: collapse(raw.docs) };

  const stages = STAGES.map((s) => ({
    ...s,
    docs: b.docs.filter((d) => d.stageKey === s.key),
  }));
  const aside = ASIDE.map((a) => ({ ...a, docs: b.docs.filter((d) => d.stageKey === a.key) }));

  const done = stages.filter((s) => s.docs.length > 0).length;
  const issues = findIssues(b, stages);

  // 마지막으로 움직인 날짜
  const dates = b.docs.map((d) => d.date).filter(Boolean).sort();
  const lastDate = dates.length ? dates[dates.length - 1] : null;

  return {
    ...b,
    stages,
    aside,
    done,
    total: STAGES.length,
    percent: Math.round((done / STAGES.length) * 100),
    issues,
    lastDate,
    status: done === STAGES.length ? 'done' : done === 0 ? 'empty' : 'active',
  };
}

/** 서류 흐름상 앞뒤가 안 맞는 지점을 찾아냅니다. */
export function findIssues(b, stages) {
  const out = [];
  const has = (key) => stages.find((s) => s.key === key).docs.length > 0;

  // 영수증은 있는데 원본 서류가 없는 경우
  if (has('piReceipt') && !has('pi'))
    out.push({ level: 'warn', text: '계약금 영수증은 있는데 PI 원본이 없습니다.' });
  if (has('balReceipt') && !has('cipl'))
    out.push({ level: 'warn', text: '잔금 영수증은 있는데 CI&PL이 없습니다.' });

  // 뒷단계가 앞단계를 앞질러 간 경우
  const filled = stages.filter((s) => s.docs.length > 0).map((s) => s.id);
  if (filled.length) {
    const max = Math.max(...filled);
    const gaps = [];
    for (let i = 1; i < max; i++) if (!filled.includes(i)) gaps.push(i);
    if (gaps.length)
      out.push({
        level: 'warn',
        text: `${max}단계까지 진행됐는데 ${gaps.map((g) => `${g}단계`).join(', ')}가 비어 있습니다.`,
      });
  }

  // 파일명이 가리키는 거래처와 실제 폴더가 다른 경우
  for (const d of b.docs.filter((x) => x.misfiled)) {
    out.push({
      level: 'warn',
      text: `"${d.display}" 는 ${d.folderVendor} 폴더에 있습니다. 파일명을 보고 ${d.vendor} 로 넣었습니다.`,
    });
  }

  // 같은 파일이 여러 벌
  for (const dup of findDuplicates(b.docs)) {
    out.push({
      level: 'info',
      text: `"${dup.display}" 가 ${dup.count}벌 있습니다${dup.byHash ? ' (내용이 같은 파일)' : ''}.`,
      files: dup.files,
    });
  }

  return out;
}

/**
 * 같은 파일인지 가리는 열쇠.
 * 드라이브가 주는 md5 가 있으면 **내용**으로 봅니다 — 이름이 달라도 내용이 같으면 한 파일입니다.
 * md5 가 없으면(브라우저 수동 스캔) 이름·크기로 갈음합니다.
 */
export function dupKey(d) {
  const who = d.vendor ?? '';
  if (d.md5) return `${who}|h:${d.md5}`;
  return `${who}|n:${d.display}|${d.size ?? ''}`;
}

/**
 * 내용이 같은 파일을 한 건으로 접습니다.
 * 남는 건 사라지지 않고 copies 에 경로로 남아, 어디에 몇 벌 있는지 볼 수 있습니다.
 */
export function collapse(docs) {
  const first = new Map();
  const out = [];
  for (const d of docs) {
    const k = dupKey(d);
    const head = first.get(k);
    if (head) {
      head.copies.push(d.path);
      continue;
    }
    const doc = { ...d, copies: [], byHash: !!d.md5 };
    first.set(k, doc);
    out.push(doc);
  }
  return out;
}

/** 접힌 결과에서 중복 묶음만 추려냅니다. */
export function findDuplicates(docs) {
  return docs
    .filter((d) => d.copies?.length)
    .map((d) => ({
      display: d.display,
      count: d.copies.length + 1,
      files: [d.path, ...d.copies],
      byHash: !!d.byHash,
    }));
}
