import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 칸역할, 양식분석, 표로양식, 머리기본값, 발주이력, 최근발주표, 담을줄, 직접줄, 직접줄쓰기, 빈직접줄, 줄값, 발주합계, 가격칸키, 발주서값, 칸이름 } from '../js/order.js';

/* 가짜 양식 — 실물(해피코 발주서·제헤우드 合同)의 꼴만 본떴습니다. 이름·값은 지어낸 것입니다. */
const 빈 = (n) => Array(n).fill('');
const 줄 = (o, n = 22) => { const r = 빈(n); for (const [k, v] of Object.entries(o)) r[k.charCodeAt(0) - 65] = v; return r; };

// 해피코 꼴 — 머리 두 줄(박스사이즈 옆으로 합침), 숨긴 칸, 합계 낱말 없는 합계줄, 표 밖 메모 칸
const 가짜해피코 = () => ({
  name: '26-29차 발주서',
  rows: [
    빈(22), 줄({ B: 'PURCHASE ORDER' }), 줄({ B: 'ING FURNITURE\nSOME ROAD' }), 빈(22), 빈(22), 줄({ U: '1/1' }),
    줄({ B: 'Supplier', D: 'Some Furniture Co.', I: '    PO NO' }),
    줄({ I: '    Delivery Date', Q: '2026.11.24 (상차요청일)' }),
    줄({ I: '   Order Date', Q: '2026.10.23' }),
    줄({ I: '   Remark', Q: ' HPC 26-29 (ABT 57 cbm)' }),
    줄({ B: '* 작업전 체크' }), 빈(22), 줄({ B: '         Order Detail' }),
    줄({ B: 'no.', C: 'code#', D: 'ITEM NAME/COLOR\n(KRO)', E: 'ITEM NAME\n(ENG)', F: 'SIZE', I: 'PRICE\n(FOB Qingdao)', K: '박스사이즈', P: 'ORDER\nQTY', Q: 'AMOUNT', S: 'cbm', T: 'cbm합', U: 'remark' }),
    줄({ K: '가로', L: '세로' }),
    줄({ B: '1', C: 'AA_01', D: '가나 책장 화이트', E: 'Gana white', I: '¥280.80', P: '39', Q: '¥10,951.20', S: '0.160', T: '6.240', W: '메모' }),
    줄({ B: '2', C: 'AA_02', D: '가나 책장 블랙', E: 'Gana black', I: '¥100.00', Q: '¥-', S: '0.100', T: '0.000' }),
    줄({ P: '39', Q: '¥10,951.20', T: '6.240' }),
    빈(22), 빈(22), 줄({ B: 'TOTAL', Q: '¥5,000.00' }), 빈(22),
    줄({ D: '다른 메모 줄' }),
  ],
  식: { '15,16': 'P16*I16', '15,19': 'S16*P16', '16,16': 'P17*I17' },
  숨긴칸: [5, 10, 11, 18, 19],
  숨긴줄: [],
  합침: [{ s: { r: 13, c: 10 }, e: { r: 13, c: 11 } }, { s: { r: 13, c: 1 }, e: { r: 14, c: 1 } }, { s: { r: 13, c: 2 }, e: { r: 14, c: 2 } }],
});

// 제헤우드 꼴 — 머리 한 줄, 이미지 칸, 이름표 쌍점, 낱개 CBM 은 숨긴 이름 없는 칸, 합계·비율 줄, 아래 조건
const 가짜제헤우드 = () => ({
  name: '合同',
  rows: [
    줄({ A: 'SOME WOOD CO.,LTD' }), 빈(22), 빈(22), 줄({ A: ' CONTRACT' }),
    줄({ A: 'TO:', C: 'ING  FURNITURE', I: 'PI No.:', J: 'ZH000000' }),
    줄({ I: 'Order Date: ', J: '2026.10.30' }),
    줄({ C: 'AMT(ZH)26-30', I: 'Delivery Date:', J: '2026.12.05' }),
    빈(22),
    줄({ A: 'NO.', B: 'ZH#', C: 'CODE#', D: 'Product model', E: 'IMAGE', F: 'Specifcation', G: 'Color', H: 'Quantity', I: 'PRICE (FOBQingdao)', J: 'Amount', K: 'CBM' }),
    줄({ A: '1', B: 'ZH-1', C: 'BB_S1', D: 'Bed SS', F: '1110*2010', G: 'Oak', H: '40', I: '￥444.5', J: '￥17,780.0', K: '7.68', L: '0.192' }),
    줄({ A: '2', B: 'ZH-2', C: 'BB_S2', D: 'Bed Q', F: '1610*2010', G: 'Black', H: '20', I: '￥624.5', J: '￥12,490.0', K: '5.54', L: '0.277' }),
    줄({ A: 'TOTAL', H: '60', J: '￥30,270.0', K: '13' }),
    줄({ B: 'DEPOSIT 30%', J: '￥9,081.0' }), 줄({ B: 'BALANCE 70%', J: '￥21,189.0' }),
    빈(22), 줄({ A: '1.Payment Term: CNY9081 30% deposit' }), 줄({ A: '2.Trade Terms:  FOB' }),
  ],
  식: { '9,9': 'H10*I10', '9,10': 'L10*H10', '9,0': 'ROW()-9' },
  숨긴칸: [11],
  숨긴줄: [],
  합침: [],
});

test('칸역할 — 실물에서 본 머리 이름', () => {
  const 표 = { 'code#': 'code', 'ITEM NAME/COLOR\n(KRO)': 'name', 'Product model': 'name', 'ORDER\nQTY': 'qty', 'Qty pcs': 'qty',
    'PRICE (FOB Qingdao)': 'price', AMOUNT: 'amount', Total: 'amount', 'Carton Volume (CBM)': 'cbm', Specifcation: 'size', 'Packing size(mm)': 'size',
    'FABRIC / COLOR': 'color', 'no.': 'no', IMAGE: 'image', 'ZH#': '', remark: 'remark' };
  for (const [글, 역할] of Object.entries(표)) assert.equal(칸역할(글), 역할, 글);
});

test('양식분석 — 해피코 꼴: 머리 두 줄·숨긴 칸·머리칸·표 밖 메모 뺌', () => {
  const t = 양식분석([{ name: 'Sheet2', rows: [['1400'], ['600']] }, 가짜해피코()]);
  assert.equal(t.시트, '26-29차 발주서');
  assert.equal(t.제목, 'PURCHASE ORDER');
  assert.equal(t.시작, 15);
  assert.equal(t.끝, 17);
  const 보임 = t.칸.filter((k) => !k.숨김).map((k) => k.라벨);
  assert.deepEqual(보임, ['no.', 'code#', 'ITEM NAME/COLOR (KRO)', 'ITEM NAME (ENG)', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT', 'remark']);
  assert.ok(t.칸.some((k) => k.라벨 === '박스사이즈 가로' && k.숨김));
  assert.deepEqual(t.칸.find((k) => k.역할 === 'amount').식, [15, 8]);
  assert.deepEqual(t.머리칸.map((k) => k.라벨), ['Supplier', 'PO NO', 'Delivery Date', 'Order Date', 'Remark']);
  assert.equal(t.머리칸[1].값, '');
});

test('양식분석 — 제헤우드 꼴: 쌍점 이름표·차수 글·합계 비율·아래 글', () => {
  const t = 양식분석([가짜제헤우드()]);
  assert.equal(t.제목.trim(), 'CONTRACT');
  assert.equal(t.끝 - t.시작, 2);
  assert.deepEqual(t.머리칸.map((k) => [k.라벨, k.값]), [['TO', 'ING  FURNITURE'], ['PI No.', 'ZH000000'], ['Order Date', '2026.10.30'], ['차수', 'AMT(ZH)26-30'], ['Delivery Date', '2026.12.05']]);
  assert.deepEqual(t.합계.map((x) => x.비율), [null, 0.3, 0.7]);
  assert.equal(t.아래.length, 2);
  assert.deepEqual(t.칸.find((k) => k.역할 === 'no').식, undefined);   // ROW() 는 안 믿음
  assert.equal(t.칸.find((k) => k.역할 === 'image').라벨, 'IMAGE');
});

test('양식분석 — 품목표가 없으면 null', () => {
  assert.equal(양식분석([{ name: 'x', rows: [['제목'], ['글', '글']] }]), null);
});

test('머리기본값 — 차수는 새 차수로, 발주일은 오늘, 번호·납기는 비움, 받는 곳은 그대로', () => {
  const 틀 = 양식분석([가짜제헤우드()]);
  const 값 = (라벨) => 머리기본값(틀.머리칸.find((k) => k.라벨 === 라벨), { 차수: '26-31', 오늘: '2026.11.06' });
  assert.equal(값('차수'), 'AMT(ZH)26-31');
  assert.equal(값('Order Date'), '2026.11.06');
  assert.equal(값('Delivery Date'), '');
  assert.equal(값('PI No.'), '');
  assert.equal(값('TO'), 'ING  FURNITURE');
  const 해 = 양식분석([가짜해피코()]);
  assert.equal(머리기본값(해.머리칸.find((k) => k.라벨 === 'Remark'), { 차수: '26-31' }), 'HPC 26-31 (ABT 57 cbm)');
  assert.equal(머리기본값({ 값: '2025-11-28', 종류: '' }, { 차수: '26-31' }), '2025-11-28');
});

const 표 = (rows, f) => ({ name: '발주서', rows: rows.map((c) => ({ c })), h: 1, f: f ?? rows.length });
const 차수들 = () => [
  { batch: '26-01', year: 26, no: 1, docs: [{ stageKey: 'order', path: 'a', cipl: { sheets: [표([
    ['code#', 'ITEM NAME', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT'],
    ['AA_01', '옛 이름', '¥200.00', '10', '¥2,000.00'],
    ['AA_09', '수량 빈 줄', '¥1.00', '', ''],
    ['AA_03', '옛 제품', '¥30.00', '5', '¥150.00'],
    ['TOTAL', '', '', '15', '¥2,150.00'],
  ], 4)] } }] },
  { batch: '26-02', year: 26, no: 2, 확정: 'c', docs: [
    { stageKey: 'order', path: 'b', cipl: { sheets: [표([['code#', 'ITEM NAME', 'ORDER QTY'], ['ZZ_99', '수정전', '3']])] } },
    { stageKey: 'order', path: 'c', cipl: { sheets: [표([
      ['code#', 'ITEM NAME', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT'],
      ['AA▁01', '새 이름', '¥280.80', '39', '¥10,951.20'],
    ])] } },
    { stageKey: 'cipl', path: 'd', cipl: { items: [{ code: 'CC_07', name: '잔액서류만', qty: 2, price: '5', colors: ['Oak'] }] } },
  ] },
];

test('발주이력 — 수량 있는 줄만·확정 발주서만·밑줄 꼴 합침·늦은 차수 값 먼저·잔액서류 items 받침', () => {
  const r = 발주이력(차수들());
  assert.deepEqual(r.map((x) => x.code), ['AA_03', 'AA▁01', 'CC_07']);
  const a = r.find((x) => x.code === 'AA▁01');
  assert.equal(a.name, '새 이름');
  assert.equal(a.price, '¥280.80');
  assert.equal(a.최근, '26-02');
  assert.equal(a.차수수, 2);
  assert.equal(r.find((x) => x.code === 'CC_07').color, 'Oak');
});

test('최근발주표 — 가장 늦은 차수의 수량 칸 있는 표', () => {
  const t = 최근발주표(차수들());
  assert.equal(t.rows[0].c.length, 3);
  const 틀 = 표로양식(최근발주표([차수들()[0]]));
  assert.deepEqual(틀.칸.map((k) => k.역할), ['code', 'name', 'price', 'qty', 'amount']);
  assert.deepEqual(틀.머리칸.map((k) => k.라벨), ['PO NO', 'Order Date', 'Delivery Date', 'Remark']);
});

test('줄값 — 같은 머리면 그 값, 금액·식 계산, 순번, 비고는 안 옮김, 고침이 이김', () => {
  const 틀 = 양식분석([가짜해피코()]);
  const p = { 열쇠: 'k', code: 'AA_01', name: '가나', price: '¥280.80', qty: 10, 칸: { itemnamecolorkro: '서류 이름', remark: '옛 비고' } };
  const x = 담을줄(p);
  const 값 = (라벨, 줄 = x, i = 0) => 줄값(틀.칸.find((k) => k.라벨 === 라벨), 줄, i, 틀);
  assert.equal(값('no.', x, 2).값, '3');
  assert.equal(값('code#').값, 'AA_01');
  assert.equal(값('ITEM NAME/COLOR (KRO)').값, '서류 이름');
  assert.equal(값('remark').값, '');
  assert.deepEqual(값('AMOUNT'), { 값: '', 계산: true });
  x.qty = 39;
  assert.deepEqual(값('AMOUNT'), { 값: '¥10,951.20', 계산: true });
  x.고침['pricefobqingdao'] = '¥100.00';
  assert.equal(값('AMOUNT').값, '¥3,900.00');
});

test('줄값 — 재료를 모르는 계산 칸은 지난 값 ÷ 지난 수량, 그것도 없으면 입력', () => {
  const 틀 = 양식분석([가짜제헤우드()]);
  const k = 틀.칸.find((c) => c.라벨 === 'CBM');
  assert.deepEqual(k.식, [11, 7]);
  const x = 담을줄({ 열쇠: 'k', code: 'BB_S1', price: '￥444.5', qty: 40, 칸: { cbm: '7.68' } });
  x.qty = 20;
  assert.equal(줄값(k, x, 0, 틀).값, '3.84');
  assert.equal(줄값(k, x, 0, 틀).계산, true);
  const y = 담을줄({ 열쇠: 'j', code: 'BB_S2', price: '￥1', qty: null, 칸: {} });
  assert.equal(줄값(k, y, 0, 틀).계산, undefined);
});

test('발주합계 — 수량·금액 합, 30% 줄', () => {
  const 틀 = 양식분석([가짜제헤우드()]);
  const 줄들 = [
    { ...담을줄({ 열쇠: 'a', code: 'A', price: '￥10.0', 칸: {} }), qty: 2 },
    { ...담을줄({ 열쇠: 'b', code: 'B', price: '￥5.5', 칸: {} }), qty: 2 },
  ];
  const 합 = 발주합계(틀, 줄들);
  assert.equal(합.칸.quantity, '4');
  assert.equal(합.칸.amount, '￥31.0');
  assert.deepEqual(합.비율줄[0], { 라벨: 'DEPOSIT 30%', 값: '￥9.30' });
});

test('가격칸키 — 단가·금액 칸', () => {
  const 틀 = 양식분석([가짜제헤우드()]);
  const 키 = 가격칸키(틀);
  assert.ok(키.has('pricefobqingdao') && 키.has('amount'));
  assert.ok(!키.has('quantity') && !키.has('cbm'));
});

test('발주서값 — 내보낼 값이 자리(r·c)와 함께', () => {
  const 틀 = 양식분석([가짜제헤우드()]);
  const 값 = 발주서값(틀, { 머리: { to: 'X' }, 줄: [{ ...담을줄({ 열쇠: 'a', code: 'A', price: '￥10.0', 칸: {} }), qty: 2 }], 아래: {} });
  assert.deepEqual(값.머리[0], { r: 4, c: 2, 값: 'X' });
  assert.equal(값.시작, 9);
  assert.equal(값.줄[0].find((x) => x.c === 9).값, '￥20.0');
});

test('직접 추가한 줄 — 담은 줄과 같은 꼴로 저장·양식 칸·합계를 그대로 탑니다', () => {
  const 틀 = { 칸: [
    { c: 0, 키: 'code#', 라벨: 'CODE#', 역할: 'code' }, { c: 1, 키: 'name', 라벨: 'NAME', 역할: 'name' },
    { c: 2, 키: 'color', 라벨: 'COLOR', 역할: 'color' }, { c: 3, 키: 'qty', 라벨: 'QTY', 역할: 'qty' },
    { c: 4, 키: 'price', 라벨: 'PRICE', 역할: 'price' }, { c: 5, 키: 'amount', 라벨: 'AMOUNT', 역할: 'amount' },
  ], 머리칸: [], 아래: [], 합계: [] };
  const 칸 = Object.fromEntries(틀.칸.map((k) => [k.키, k]));
  const x = 직접줄();
  assert.deepEqual(Object.keys(x).sort(), [...Object.keys(담을줄({ 열쇠: 'a', code: 'A' })), '직접'].sort());
  직접줄쓰기(x, 'code', 'NEW▁01', 틀);
  직접줄쓰기(x, 'name', '새 의자', 틀);
  x.qty = 2;
  assert.equal(x.열쇠, 'NEW_01');
  const 살아난 = JSON.parse(JSON.stringify(x));     // docs_발주함 은 JSON 글입니다
  assert.equal(살아난.직접, true);
  assert.equal(줄값(칸['code#'], 살아난, 0, 틀).값, 'NEW▁01');
  assert.equal(줄값(칸.name, 살아난, 0, 틀).값, '새 의자');
  assert.equal(줄값(칸.color, 살아난, 0, 틀).값, '');
  assert.equal(줄값(칸.amount, 살아난, 0, 틀).값, '');          // 단가를 모르면 사람이 넣습니다
  살아난.고침.price = '￥10.0';
  assert.deepEqual(줄값(칸.amount, 살아난, 0, 틀), { 값: '￥20.0', 계산: true });
  assert.equal(발주합계(틀, [살아난]).칸.amount, '￥20.0');
  assert.equal(발주서값(틀, { 줄: [살아난] }).줄[0][0].값, 'NEW▁01');
});

test('직접줄쓰기 — 발주서 칸에서 고친 값이 남아 코드·이름을 가리지 않습니다', () => {
  const 틀 = { 칸: [{ c: 0, 키: 'code#', 라벨: 'CODE#', 역할: 'code' }] };
  const x = 직접줄();
  x.고침['code#'] = '옛값';
  직접줄쓰기(x, 'code', 'B', 틀);
  assert.equal(줄값(틀.칸[0], x, 0, 틀).값, 'B');
  직접줄쓰기(x, 'name', '양식 없어도 됨');
  assert.equal(x.name, '양식 없어도 됨');
});

test('빈직접줄 — 눌러만 둔 줄만 걷고 담은 줄·적은 줄은 둡니다', () => {
  assert.equal(빈직접줄(직접줄()), true);
  assert.equal(빈직접줄({ ...직접줄(), code: ' ' }), true);
  assert.equal(빈직접줄({ ...직접줄(), name: '이름만' }), false);
  assert.equal(빈직접줄({ ...직접줄(), qty: 3 }), false);
  assert.equal(빈직접줄({ ...직접줄(), 고침: { price: '1' } }), false);
  assert.equal(빈직접줄(담을줄({ 열쇠: '', code: '', name: '' })), false);
});

/* 제목 없는 칸 — 해피코 INVOICE 꼴. 값은 지어낸 것입니다. */
const 가짜INVOICE = (값들 = ['2米书柜-AA', '1米桌子', '书柜1200-BB'], 덧 = {}) => ({
  name: 'INVOICE',
  rows: [
    ['Description of goods', 'ITEM NO', '', 'QUANTITY', 'PRICE', 'AMOUNT', 'Remark'],
    ...값들.map((v, i) => [`Gana ${i}`, `AA_0${i}`, v, '10', '¥5.00', '¥50.00', '']),
    ['TOTAL', '', '', '30', '', '¥150.00', ''],
  ],
  식: { '1,5': 'D2*E2' },
  ...덧,
});
const 빈칸 = (틀) => 틀.칸.find((k) => k.c === 2);

test('칸이름 — ITEM NO 옆 중국어 칸에 제목, 키·라벨은 그대로', () => {
  const 틀 = 양식분석([가짜INVOICE()]);
  const k = 빈칸(틀);
  assert.equal(k.키, '칸2');
  assert.equal(k.라벨, '');
  assert.equal(칸이름(k, 틀), '중국어 품명');
  assert.equal(칸이름(틀.칸[1], 틀), 'ITEM NO');
  assert.ok(!가격칸키(틀).has('칸2'));
});

test('칸이름 — 저장된 옛 틀은 값이 없어도 자리로 붙고, 적어 둔 값이 남는다', () => {
  // 값 기록이 없던 때의 틀 그대로 — JSON 왕복
  const 옛 = JSON.parse(JSON.stringify(양식분석([가짜INVOICE()])));
  옛.칸.forEach((k) => delete k.한자);
  assert.equal(칸이름(빈칸(옛), 옛), '중국어 품명');
  const 줄하나 = { code: 'AA_00', qty: 10, 칸: {}, 고침: { 칸2: '적어 둔 품명' } };
  assert.equal(줄값(빈칸(옛), 줄하나, 0, 옛).값, '적어 둔 품명');
});

test('칸이름 — 다른 빈 칸에는 안 붙인다', () => {
  // 값이 영어·한글·숫자
  for (const 값 of [['Gana', 'Dana', 'Rana'], ['가나 책장', '다나 책상', '라나 의자'], ['1', '2', '3']]) {
    const 틀 = 양식분석([가짜INVOICE(값)]);
    assert.equal(칸이름(빈칸(틀), 틀), '', 값[0]);
  }
  // 숨긴 칸
  const 숨 = 양식분석([가짜INVOICE(undefined, { 숨긴칸: [2] })]);
  assert.equal(칸이름(빈칸(숨), 숨), '');
  // 계산 재료 — 금액이 이 칸을 곱합니다
  const 재료 = 양식분석([가짜INVOICE(undefined, { 식: { '1,5': 'C2*D2' } })]);
  assert.equal(칸이름(빈칸(재료), 재료), '');
  // 옆이 ITEM NO 가 아닌 코드 칸, ITEM NO 와 떨어진 칸
  const 틀 = 양식분석([가짜INVOICE()]);
  const 옛꼴 = (왼, c = 2) => ({ 칸: [{ 키: 'a', 라벨: 왼, 역할: 'code', c: 1 }, { 키: `칸${c}`, 라벨: '', 역할: '', c }] });
  assert.equal(칸이름({ 라벨: '', 역할: '', c: 2 }, 옛꼴('code#')), '');
  assert.equal(칸이름({ 라벨: '', 역할: '', c: 3 }, 옛꼴('ITEM NO', 3)), '');
  assert.equal(칸이름({ 라벨: '', 역할: '', c: 3 }, 틀), '');
});
