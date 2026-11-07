import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { 구성분석, 구성갈래, 구성어긋남, 구성맞대기, 구성품목, 구성보강, 구성머리값, 구성칸뜻, 구성가림, 틀구성, PDF시트, 날짜글, 표칸풀이 } from '../js/form.js';
import { buildBatches, 내용판별 } from '../js/parse.js';
import { 대조품목, 벤더피아맞대기, 가격칸 } from '../js/match.js';

const 시트 = (name, rows, 더 = {}) => ({ name, rows, 식: {}, 숨긴칸: [], 숨긴줄: [], 합침: [], ...더 });

// 가짜 잔액서류 — 실물 꼴만 흉내 냅니다. ITEM NO 옆 칸은 제목이 없고 중국어입니다.
const 인보이스 = 시트('INVOICE ', [
  ['가나무역유한공사'],
  ['Tel:+00-000'],
  [],
  ['COMMERCIAL INVOICE'],
  ['TO:'],
  ['ABC SHOP', '', '', '', 'PI NO.', 'XX-1-27'],
  ['', '', '', '', 'DATE:', '11/3/26'],
  [],
  ['Description of goods', 'ITEM NO', '', 'QUANTITY', 'PRICE', 'AMOUNT', 'Remark'],
  ['Alpha desk', 'AB-one', '书桌-白', '39', '￥200.00', '￥7,800.00', ''],
  ['Beta shelf', 'CD_two', '书架', '20', '￥100.50', '￥2,010.00', ''],
  ['Gamma leg', 'EF3', '桌腿', '5', '￥10.00', '￥50.00', ''],
  ['TOTAL', '', '', '64', '', '￥9,860.00', ''],
  [],
  ['BANK NAME: 가나은행'],
]);
const 패킹 = 시트('PACKING LIST', [
  ['가나무역유한공사'], ['Tel:+00-000'], [], ['PACKING LIST'], ['TO:'],
  ['ABC SHOP', '', '', '', '', 'PI NO.', 'XX-1-27'], ['', '', '', '', '', 'DATE:', '11/3/26'], [],
  ['Description of goods', 'ITEM NO', '', 'CTNS', 'QUANTITY', 'N.W', 'G.W', 'MEASUREMENT'],
  ['Alpha desk', 'AB-one', '书桌-白', '39', '39', '100', '120', '6.6'],
  ['Beta shelf', 'CD_two', '书架', '20', '20', '50', '60', '1.6'],
  ['Gamma leg', 'EF3', '桌腿', '5', '5', '5', '6', '0.1'],
  ['TOTAL', '', '', '64', '64', '155', '186', '8.3'],
]);
// 가짜 발주서 — 숨긴 칸이 있습니다.
const 발주서 = 시트('가나 26-28차 발주서', [
  ['', 'PURCHASE ORDER'],
  ['', 'Supplier', '', '가나무역', '', '', '', 'PO NO', ''],
  ['', '', '', '', '', '', '', 'Delivery Date', '2026.11.17'],
  ['', '', '', '', '', '', '', 'Order Date', '2026.10.23'],
  ['', 'no.', 'code#', 'ITEM NAME', 'COLOR', 'PRICE (FOB Qingdao)', '환율', 'ORDER QTY', 'AMOUNT'],
  ['', '1', 'AB-one', 'Alpha desk', 'Oak', '¥200.00', '1.15', '39', '¥7,800.00'],
  ['', '2', 'CD_two', 'Beta shelf', 'White', '¥100.50', '1.15', '20', '¥2,010.00'],
], { 숨긴칸: [6] });
// 가짜 계약서
const 계약서 = 시트('合同', [
  ['가나 WOOD CO LTD'], [], ['CONTRACT'],
  ['TO:', '', 'ABC SHOP', '', '', '', 'PI No.:', 'ZZ261026'],
  ['', '', '', '', '', '', 'Order Date:', '2026.10.26'],
  [],
  ['NO.', 'ZH#', 'CODE#', 'Product model', 'Quantity', 'PRICE (FOBQingdao)', 'Amount', 'CBM'],
  ['1', 'ZH-31', 'BY_SSN1', 'Alpha bed', '60', '￥444.5', '￥26,670.0', '11.52'],
  ['2', 'ZH-32', 'BY_QKN1', 'Beta bed', '20', '￥624.5', '￥12,490.0', '5.54'],
  ['TOTAL', '', '', '', '80', '', '￥39,160.0', '17.06'],
  ['DEPOSIT 30%', '', '', '', '', '', '￥11,748.0', ''],
  ['BALANCE 70%', '', '', '', '', '', '￥27,412.0', ''],
]);

const 잔액구성 = 구성분석([인보이스, 패킹], { 파일: 'ABC 出货明细.xlsx' });
const 발주구성 = 구성분석([발주서], { 파일: 'HPC-26-28차_20261023.xlsx' });
const 계약구성 = 구성분석([계약서], { 파일: 'AMT2026-30合同.xlsx' });
const 칸 = (구성, s, c) => 구성.시트[s].표.칸.find((k) => k.c === c);

test('구성분석 — 시트마다 표 자리·품목 줄·칸 뜻, ITEM NO·제목 없는 칸이 값으로 읽힌다', () => {
  assert.equal(잔액구성.시트.length, 2);
  const 표 = 잔액구성.시트[0].표;
  assert.equal(표.머리, 8);
  assert.equal(표.품목, 3);
  assert.equal(칸(잔액구성, 0, 1).뜻, 'code');
  assert.equal(칸(잔액구성, 0, 2).뜻, 'cn');
  assert.equal(칸(잔액구성, 0, 2).출처, '값');
  assert.deepEqual(칸(잔액구성, 0, 2).샘플, ['书桌-白', '书架']);
  assert.equal(칸(잔액구성, 1, 3).뜻, 'ctn');
  assert.equal(칸(잔액구성, 1, 5).뜻, 'nw');
  assert.equal(칸(잔액구성, 1, 7).뜻, 'tcbm');
});

test('구성분석 — 셈이 맞는지 적어 둔다(금액 = 수량 × 단가 · 수량 합계)', () => {
  const 검 = 잔액구성.시트[0].표.검산;
  assert.deepEqual(검.map((x) => [x.이름, x.맞음, x.전체]), [['금액 = 수량 × 단가', 3, 3], ['수량 합계', 1, 1]]);
});

test('구성분석 — 머리칸은 뜻과 자리까지, 합계·부속 줄도', () => {
  const 머리 = 잔액구성.시트[0].머리칸;
  const 찾기 = (이름) => 머리.find((k) => k.라벨 === 이름);
  assert.deepEqual([찾기('PI NO.').뜻, 찾기('PI NO.').자리, 찾기('PI NO.').값], ['번호', 'F6', 'XX-1-27']);
  assert.equal(찾기('DATE').뜻, '날짜');
  assert.equal(찾기('TO').뜻, '거래처');
  assert.deepEqual(잔액구성.시트[0].표.합계, ['TOTAL']);
  assert.ok(잔액구성.시트[0].아래.some((x) => x.startsWith('BANK')));
});

test('구성분석 — 숨긴 칸을 따로 적고, 숨긴 칸 값은 샘플에 없다', () => {
  const k = 칸(발주구성, 0, 6);
  assert.equal(k.숨김, true);
  assert.equal(k.샘플, undefined);
  assert.equal(구성가림(발주구성.시트[0]).has(5), true);
});

test('구성분석 — 머리 낱말이 없어도 값과 곱셈으로 표를 찾는다', () => {
  const g = 구성분석([시트('x', [
    ['가나', '다라', '마바', '사아', '자차'],
    ['AA-1', '하나 책상', '10', '2.50', '25.00'],
    ['BB-2', '둘 책장', '4', '3.00', '12.00'],
    ['CC-3', '셋 다리', '6', '1.50', '9.00'],
  ])]);
  const 표 = g.시트[0].표;
  assert.equal(표.품목, 3);
  assert.deepEqual(표.칸.map((k) => k.뜻), ['code', 'name', 'qty', 'price', 'amount']);
  assert.equal(표.칸[3].출처, '셈');
});

test('구성분석 — 표가 없는 시트도 이름·제목은 남고, 설명 칸의 코드는 코드로 본다', () => {
  const g = 구성분석([시트('Sheet2', [['1400'], ['600']]), 시트('CI', [
    ['COMMERCIAL INVOICE'],
    ['Marks&Numbers', 'Description of Goods', 'Quantity', 'Unit Price', 'Amount'],
    ['N/M', 'BED', '(PCS)', 'CNY', 'CNY'],
    ['', 'AB-S03-01', '48', '1001.5', '￥48,072.00'],
    ['', 'AB-S03-03', '40', '282', '￥11,280.00'],
    ['', 'TOTAL VALUE', '88PCS', '', '￥59,352.00'],
  ])]);
  assert.equal(g.시트[0].표, null);
  const 표 = g.시트[1].표;
  assert.equal(표.품목, 2);
  assert.equal(표.칸.find((k) => k.c === 1).뜻, 'code');
  assert.equal(표.검산.find((x) => x.이름 === '수량 합계').맞음, 1);
});

test('구성갈래 — 낱말 표가 아니라 시트·제목·표 짜임으로 종류를 가른다', () => {
  assert.equal(잔액구성.갈래.key, 'cipl');
  assert.ok(잔액구성.갈래.까닭.some((x) => x.includes('INVOICE')));
  assert.equal(발주구성.갈래.key, 'order');
  assert.equal(계약구성.갈래.key, 'pi');
  assert.equal(구성갈래({ 시트: [] }).key, '');
});

test('구성어긋남 — 발주서 칸에 잔액서류를 올리면 잡고, 이름이 그 칸이면 막지 않는다', () => {
  assert.equal(구성어긋남(잔액구성, 'order'), 'cipl');
  assert.equal(구성어긋남(잔액구성, 'cipl'), '');
  assert.equal(구성어긋남({ ...잔액구성, 파일: 'F-028形式发票.xlsx' }, 'pi'), '');   // 베이지아 PI 는 양식이 CI 입니다
});

test('틀구성 — 저장된 발주서 틀이 잔액서류 INVOICE 면 어긋남이 보인다', () => {
  const 틀 = { 시트: 'INVOICE ', 제목: '', 고정: [{ 글: 'COMMERCIAL INVOICE' }], 머리줄: 14, 시작: 15, 끝: 30, 머리칸: [{ 키: 'pino', 라벨: 'PI NO.', 값: 'X', r: 9, c: 5 }], 합계: [{ 라벨: 'TOTAL' }], 아래: [],
    칸: [{ c: 0, 라벨: 'Description of goods' }, { c: 1, 라벨: 'ITEM NO' }, { c: 2, 라벨: '', 한자: true }, { c: 3, 라벨: 'QUANTITY' }] };
  const g = 틀구성(틀, 'TalkFile_修改ING第26-27次出货明细2026.11.5.xlsx');
  assert.equal(구성어긋남(g, 'order'), 'cipl');
  assert.equal(g.시트[0].표.칸.find((k) => k.c === 2).뜻, 'cn');
});

const 재료 = (시트이름들, 글, kind = 'x') => ({ kind, sheets: 시트이름들, text: 글 });
const 말 = { order: '발주서', pi: '계약금서류', cipl: '잔액서류' };

test('구성맞대기 — 시트·표 칸·머리가 맞는 종류로, 까닭을 사람이 읽게', () => {
  const 판 = { order: 발주구성, cipl: 잔액구성 };
  const r = 구성맞대기(재료(['INVOICE ', 'PACKING LIST'], 'COMMERCIAL INVOICE TO: PI NO. DATE: Description of goods ITEM NO QUANTITY PRICE AMOUNT Remark CTNS N.W G.W MEASUREMENT'), 판, { 말 });
  assert.equal(r.key, 'cipl');
  assert.match(r.말, /^구성 잔액서류 \d+% · 시트 2\/2 · 표 칸/);
});

test('구성맞대기 — 이름이 달라도 표 칸이 맞으면 찾고, 안 맞으면 null', () => {
  const 판 = { order: 발주구성, cipl: 잔액구성 };
  const r = 구성맞대기(재료([], 'PURCHASE ORDER Supplier PO NO Delivery Date Order Date no. code# ITEM NAME COLOR PRICE (FOB Qingdao) ORDER QTY AMOUNT', 'p'), 판, { 말 });
  assert.equal(r.key, 'order');
  assert.equal(구성맞대기(재료([], '품질 안전 스티커 시안 안내 글입니다 아무 표도 없습니다', 'p'), 판, { 말 }), null);
  assert.equal(구성맞대기(재료([], '', 'p'), 판, { 말 }), null);   // 글자 없는 스캔
});

test('내용판별 — 구성이 있으면 낱말 단서는 안 쓰고, 공통 선하증권이 먼저다', () => {
  const 나 = { 칸: { order: { 낱말: [{ w: '안쪽 낱말', 곳: '직접' }] } } };
  const 글 = 재료([], '여기에 안쪽 낱말 이 들어 있는 서류입니다 한참');
  assert.equal(내용판별(글, 나).key, 'order');
  assert.equal(내용판별(글, 나, () => null), null);
  assert.equal(내용판별(글, 나, () => ({ key: 'cipl', 말: '구성 잔액서류 90%' })).key, 'cipl');
  assert.equal(내용판별(재료([], 'BILL OF LADING shipper consignee 서류입니다'), 나, () => ({ key: 'cipl', 말: 'x' })).key, 'bl');
});

// 서버가 떠 둔 표 꼴 — 안 쓴 칸은 빠지고 줄은 { c } 입니다.
const 서버표 = { name: 'INVOICE ', h: 1, f: 3, rows: [
  { c: ['Description of goods', 'ITEM NO', '', 'QUANTITY', 'PRICE', 'AMOUNT'] },
  { c: ['Alpha desk', 'AB-one', '书桌-白', '39', '￥200.00', '￥7,800.00'] },
  { c: ['Beta shelf', 'CD_two', '书架', '20', '￥100.50', '￥2,010.00'] },
  { c: ['TOTAL', '', '', '59', '', '￥9,810.00'] },
], 위: [{ c: ['COMMERCIAL INVOICE'] }, { c: ['ABC SHOP', '', '', '', 'PI NO.', 'XX-9-27'] }, { c: ['', '', '', '', 'DATE:', '11/3/26'] }] };

test('표칸풀이 — 서버 표의 칸을 구성으로 푼다(제목 없는 칸은 왼쪽 이웃 다음)', () => {
  const 뜻 = 표칸풀이(서버표, 잔액구성.시트[0]);
  assert.deepEqual([뜻.code, 뜻.cn, 뜻.qty, 뜻.price, 뜻.amount], [1, 2, 3, 4, 5]);
  assert.equal(구성칸뜻({ name: 'x', h: 1, rows: [{ c: ['가', '나', '다'] }] }, 잔액구성), null);
});

test('구성품목 — 코드·수량·중국어 품명까지, 합계 줄·0 수량은 뺀다', () => {
  const 품 = 구성품목([서버표], 잔액구성);
  assert.deepEqual(품.map((x) => [x.code, x.qty, x.cn, x.price]), [['AB-one', 39, '书桌-白', 200], ['CD_two', 20, '书架', 100.5]]);
  assert.equal(품[0].amount, 7800);
});

test('구성머리값 · 날짜글 — 번호·날짜를 이름표로 찾는다', () => {
  assert.deepEqual(구성머리값([서버표], 잔액구성), { 번호: 'XX-9-27', 날짜: '2026-11-03' });
  assert.equal(날짜글('202610.15'), '2026-10-15');
  assert.equal(날짜글('2026.11.17 (상차요청일)'), '2026-11-17');
  assert.equal(날짜글('없음'), '');
});

test('구성보강 — 서버가 못 읽은 품목만 채우고, 읽어 둔 값은 안 덮는다', () => {
  const 빈 = { stageKey: 'cipl', cipl: { sheets: [서버표], items: [] } };
  const 찬 = 구성보강(빈, { cipl: 잔액구성 });
  assert.equal(찬.cipl.items.length, 2);
  assert.equal(찬.cipl.구성품목, true);
  assert.equal(찬.cipl.invoiceDate, '2026-11-03');
  assert.equal(찬.cipl.brief.piNo, 'XX-9-27');
  assert.equal(빈.cipl.items.length, 0);   // 원본은 그대로
  const 있음 = 구성보강({ stageKey: 'cipl', cipl: { sheets: [서버표], items: [{ code: 'Z1', qty: 1 }], invoiceDate: '2026-01-01' } }, { cipl: 잔액구성 });
  assert.deepEqual(있음.cipl.items, [{ code: 'Z1', qty: 1 }]);
  assert.equal(있음.cipl.invoiceDate, '2026-01-01');
  const 없음 = { stageKey: 'pi', cipl: { sheets: [서버표] } };
  assert.equal(구성보강(없음, { cipl: 잔액구성 }), 없음);
});

test('구성보강 — 표에 칸 뜻을 달아 대조·벤더피아 맞대기·가격 가림이 이름표 없이도 돈다', () => {
  const 낯선 = { name: 'INVOICE ', h: 1, f: 2, rows: [{ c: ['품목이라', '번호표', '', '개수', '값', '돈'] }, { c: ['Alpha', 'AB-one', '书桌', '3', '2.00', '6.00'] }, { c: ['합', '', '', '3', '', '6.00'] }] };
  const 구성 = 구성분석([시트('INVOICE ', [['품목이라', '번호표', '', '개수', '값', '돈'], ['Alpha desk', 'AB-one', '书桌', '3', '2.00', '6.00'], ['Beta shelf', 'CD-two', '书架', '2', '4.00', '8.00']])]);
  const 표 = 구성.시트[0].표;
  assert.deepEqual(표.칸.map((k) => k.뜻), ['name', 'code', 'cn', 'qty', 'price', 'amount']);
  const d = 구성보강({ stageKey: 'cipl', cipl: { sheets: [낯선], items: [] } }, { cipl: 구성 });
  const t = d.cipl.sheets[0];
  assert.deepEqual([...대조품목(t).품.keys()], ['AB-one']);
  assert.equal(벤더피아맞대기(t, new Map([['AB-one', { name: 'x' }]])).줄.get(1).kind, '맞음');
  assert.ok(가격칸(t).칸.has(4));
});

test('buildBatches — 이름으로 못 가른 서류는 구성으로, 이름이 있는 서류는 그대로', () => {
  const 구성일 = { 감지: () => (s) => 구성맞대기(s, { cipl: 잔액구성 }, { 말 }), 보강: (d) => 구성보강(d, { cipl: 잔액구성 }) };
  const sniff = 재료(['INVOICE ', 'PACKING LIST'], 'COMMERCIAL INVOICE TO: PI NO. DATE: Description of goods ITEM NO QUANTITY PRICE AMOUNT Remark CTNS N.W G.W MEASUREMENT');
  const { batches } = buildBatches([
    { name: '알수없는파일.xlsx', path: '가나/Hp-26-30/알수없는파일.xlsx', vendor: '가나', size: 1, mtime: 1, sniff, cipl: { sheets: [서버표], items: [] } },
    { name: 'CI&PL.xlsx', path: '가나/Hp-26-30/CI&PL.xlsx', vendor: '가나', size: 1, mtime: 1, sniff: 재료([], 'PURCHASE ORDER 안내 글입니다 아주 많습니다') },
  ], [], {}, 구성일);
  const docs = batches[0].docs;
  const 알 = docs.find((d) => d.name.startsWith('알수없는'));
  assert.equal(알.stageKey, 'cipl');
  assert.equal(알.감지, true);
  assert.match(알.why, /구성 잔액서류/);
  assert.equal(알.cipl.items.length, 2);
  assert.equal(docs.find((d) => d.name.startsWith('CI&PL')).감지, undefined);
});

/* PDF — 머리 글이 쌓여 있고 품명이 두 줄인 꼴. 글자 조각의 자리로 표를 다시 짭니다. */
const 쪽 = (조각) => [{ 넓이: 800, 높이: 1000, 조각: 조각.map(([x, y, 글, w = 글.length * 5]) => ({ x, y, w, 글 })) }];
const PDF조각 = 쪽([
  [300, 960, 'PURCHASE ORDER'],
  [460, 900, 'PO NO'], [510, 900, '26-1-ZZ'],
  [460, 880, 'Order'], [460, 868, 'Date'], [510, 874, '2026.10.13'],
  [40, 820, 'Order Detail'],
  [40, 790, 'code#'], [120, 800, 'ITEM NAME'], [120, 788, '(KRO)'],
  [300, 804, 'PRICE'], [300, 792, '(FOB'], [300, 780, 'Qingdao)'],
  [400, 796, 'ORDER'], [400, 784, 'QTY'], [500, 790, 'AMOUNT'],
  [40, 740, 'AB-one'], [120, 746, '가나 책상'], [120, 734, 'Alpha desk'], [300, 740, '¥200.00'], [400, 740, '39'], [500, 740, '¥7,800.00'],
  [40, 700, 'CD_two'], [120, 706, '다라 책장'], [120, 694, 'Beta shelf'], [300, 700, '¥100.50'], [400, 700, '20'], [500, 700, '¥2,010.00'],
  [120, 660, 'TOTAL'], [400, 660, '59'], [500, 660, '¥9,810.00'],
]);

test('PDF시트 — 쌓인 머리·두 줄 품명을 다시 짜서 같은 분석에 넣는다', () => {
  const r = PDF시트(PDF조각);
  const g = 구성분석(r.시트들, { 꼴: 'p', 파일: 'x.pdf' });
  const 표 = g.시트[0].표;
  assert.deepEqual(표.칸.map((k) => [k.라벨, k.뜻]), [['code#', 'code'], ['ITEM NAME (KRO)', 'name'], ['PRICE (FOB Qingdao)', 'price'], ['ORDER QTY', 'qty'], ['AMOUNT', 'amount']]);
  assert.equal(표.품목, 2);
  assert.deepEqual(표.칸[1].샘플, ['가나 책상 Alpha desk', '다라 책장 Beta shelf']);
  assert.deepEqual(표.검산[0], { 이름: '금액 = 수량 × 단가', 맞음: 2, 전체: 2 });
  assert.equal(g.시트[0].머리칸.find((k) => k.라벨 === 'PO NO').값, '26-1-ZZ');
  assert.equal(g.시트[0].머리칸.find((k) => k.라벨 === 'Order Date').값, '2026.10.13');
  assert.equal(g.갈래.key, 'order');
});

test('PDF시트 — 글자가 없으면 스캔, 표가 없으면 시트만', () => {
  assert.equal(PDF시트(쪽([[10, 10, '가']])).스캔, true);
  assert.equal(PDF시트([{ 넓이: 800, 높이: 1000, 조각: [] }]).스캔, true);
  const r = PDF시트(쪽([[10, 900, '은행 송금 영수증입니다 표는 없습니다 아무것도'], [10, 880, '금액 100']]));
  assert.ok(!r.스캔);
  assert.equal(구성분석(r.시트들, { 꼴: 'p' }).시트[0].표, null);
});

const gs = vm.createContext({});
vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), gs);
test('원본표_ — 표 위 글을 위 칸에 담고 Firestore 값으로 나간다(앱의 구성머리값 재료)', () => {
  const rows = [['COMMERCIAL INVOICE'], [], ['ABC', '', 'PI NO.', 'XX-1'], ['CODE#', 'Qty pcs'], ['AB-1', 3]];
  const sh = { getName: () => 'CI', getDataRange: () => ({ getDisplayValues: () => rows.map((r) => r.map(String)), getMergedRanges: () => [] }) };
  const 표 = gs.원본표_(rows, sh);
  assert.deepEqual(표.위.map((r) => [...r]), [['COMMERCIAL INVOICE'], ['ABC', '', 'PI NO.', 'XX-1']]);
  const v = gs.sheetValue_(표).mapValue.fields;
  assert.equal(v.위.arrayValue.values.length, 2);
  assert.equal(gs.sheetValue_({ name: 'x', h: 1, f: 1, rows: [] }).mapValue.fields.위, undefined);
});
