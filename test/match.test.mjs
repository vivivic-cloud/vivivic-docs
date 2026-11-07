import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 맞춰보기, 맞춤판정, itemRows, 제품차이, 벤더피아사전, 적합성, 맞댈자, 수량출처, 발주대조, 대조숫자, 벤더피아단품사전, 벤더피아상품연결, 벤더피아맞대기, 이름같음, 이름후보, 정식이름, 찾을이름들, 가격칸, 같은발주인가, 발주판묶기, 양식묶기, 수량판, 차수수량 } from '../js/match.js';
import { 코드열쇠 } from '../js/parse.js';
import { 벤더피아줄벗기기 } from '../js/firebase.js';

const 품 = (...쌍) => 쌍.map(([code, qty]) => ({ code, name: code, qty }));

/** 발주서 한 장 — 안 넣은 칸은 없는 것입니다(발주서 PDF 에 늘 다 있지는 않습니다). */
const 발주서 = ({ qty, amount, cbm, items } = {}) => ({
  cipl: {
    brief: { ...(qty ? { qty } : {}), ...(amount ? { amount } : {}), ...(cbm ? { cbm } : {}) },
    ...(items ? { items } : {}),
  },
});
/** 잔액서류 한 장 */
const 잔액서류 = ({ qty, amount, cbm, cartons, gross, items } = {}) => ({
  cipl: {
    pcs: qty ?? 0, cartons: cartons ?? 0, cbm: cbm ?? 0, gross: gross ?? 0,
    brief: { ...(qty ? { qty } : {}), ...(amount ? { amount } : {}), ...(cbm ? { cbm } : {}) },
    ...(items ? { items } : {}),
  },
});

test('맞춰보기 — 다 맞으면 다맞음', () => {
  const m = 맞춰보기(발주서({ qty: 297, amount: 113379, cbm: 58, items: 품(['A', 10], ['B', 5]) }),
                     잔액서류({ qty: 297, amount: 113379, cbm: 58, items: 품(['A', 10], ['B', 5]) }));
  assert.equal(m.다맞음, true);
  assert.equal(m.하나도안맞음, false);
  assert.equal(m.못댐, false);
  assert.equal(m.견준수, 3);
  assert.equal(m.맞은수, 3);
  assert.equal(m.품목다른줄, 0);
});

test('맞춰보기 — 하나만 어긋나면 다맞음이 아니다', () => {
  const m = 맞춰보기(발주서({ qty: 297, amount: 98000, cbm: 58, items: 품(['A', 10]) }),
                     잔액서류({ qty: 297, amount: 113379, cbm: 58, items: 품(['A', 10]) }));
  assert.equal(m.다맞음, false);
  assert.equal(m.하나도안맞음, false);      // 두 가지는 맞았습니다
  assert.equal(m.맞은수, 2);
  assert.equal(m.항.find((x) => x.이름 === '금액').결, '다름');
});

test('맞춰보기 — 하나도 안 맞으면 하나도안맞음', () => {
  const m = 맞춰보기(발주서({ qty: 190, amount: 70000, items: 품(['C', 1]) }),
                     잔액서류({ qty: 355, amount: 141000, items: 품(['A', 10]) }));
  assert.equal(m.맞은수, 0);
  assert.equal(m.하나도안맞음, true);
  assert.equal(m.못댐, false);
});

test('맞춰보기 — 댈 것이 아예 없으면 못댐 (틀린 것이 아니다)', () => {
  const m = 맞춰보기(발주서({}), 잔액서류({ qty: 355, amount: 141000, cartons: 470, gross: 7400 }));
  assert.equal(m.못댐, true);
  assert.equal(m.하나도안맞음, false, '모르는 것을 틀렸다고 하면 안 됩니다');
  assert.equal(m.다맞음, false);
  assert.equal(m.견준수, 0);
  assert.equal(m.품목다른줄, null);
});

test('맞춰보기 — 한쪽에만 값이 있는 칸은 아예 대지 않는다', () => {
  // 발주서에 부피가 없습니다 — 부피 칸은 항에 안 들어갑니다.
  const m = 맞춰보기(발주서({ qty: 297, amount: 113379 }),
                     잔액서류({ qty: 297, amount: 113379, cbm: 58, cartons: 395, gross: 6200 }));
  assert.equal(m.견준수, 2);
  assert.equal(m.항.some((x) => x.이름 === '부피'), false);
  assert.deepEqual(m.못댄것, ['박스수', '중량', '부피']);
  assert.equal(m.다맞음, true, '댄 것이 다 맞으면 다맞음입니다');
});

test('맞춰보기 — 부피는 1% 안이면 가까움, 수량·금액은 딱 맞아야 한다', () => {
  const 가까운 = 맞춰보기(발주서({ cbm: 58 }), 잔액서류({ cbm: 58.3 }));
  assert.equal(가까운.항[0].결, '가까움');          // 0.51% 차이
  const 먼 = 맞춰보기(발주서({ cbm: 58 }), 잔액서류({ cbm: 60 }));
  assert.equal(먼.항[0].결, '다름');                 // 3.3% 차이
  const 수량 = 맞춰보기(발주서({ qty: 297 }), 잔액서류({ qty: 298 }));
  assert.equal(수량.항[0].결, '다름', '수량은 하나만 달라도 다름입니다');
});

test('맞춤판정 — 다섯 갈래', () => {
  const 다맞음 = { 다맞음: true, 못댐: false, 하나도안맞음: false };
  const 어긋남 = { 다맞음: false, 못댐: false, 하나도안맞음: true };
  const 반만 = { 다맞음: false, 못댐: false, 하나도안맞음: false };
  const 못댐 = { 다맞음: false, 못댐: true, 하나도안맞음: false };
  assert.equal(맞춤판정([다맞음, 어긋남, 어긋남]), '하나가다맞음');
  assert.equal(맞춤판정([다맞음, 다맞음]), '여럿이다맞음');
  assert.equal(맞춤판정([어긋남, 어긋남]), '하나도안맞음');
  assert.equal(맞춤판정([못댐, 못댐]), '못댐');
  assert.equal(맞춤판정([]), '못댐');
  assert.equal(맞춤판정([반만, 어긋남]), '골라야함');
});

test('맞춤판정 — 못 댄 장이 섞여 있어도 댄 것이 다 어긋나면 하나도안맞음', () => {
  const 어긋남 = { 다맞음: false, 못댐: false, 하나도안맞음: true };
  const 못댐 = { 다맞음: false, 못댐: true, 하나도안맞음: false };
  assert.equal(맞춤판정([못댐, 어긋남]), '하나도안맞음');
});

test('itemRows — 추가·수량·빠짐을 가린다', () => {
  const rows = itemRows(품(['A', 10], ['B', 5]), 품(['A', 12], ['C', 1]));
  assert.deepEqual(rows.map((r) => [r.kind, r.code]), [['추가', 'C'], ['수량', 'A'], ['빠짐', 'B']]);
  assert.deepEqual(itemRows([], 품(['A', 1])), [], '한쪽이 비면 댈 것이 없습니다');
});

test('제품차이 — 덜 실림·더 실림·발주에 없던 것으로 갈린다', () => {
  // 발주(앞) → 출고(뒤)
  const 줄 = itemRows(품(['A', 10], ['B', 5], ['D', 7]), 품(['A', 8], ['B', 9], ['C', 3]));
  const g = 제품차이(줄);
  assert.deepEqual(g.덜실림.map((r) => [r.code, r.모자람, !!r.안실림]), [['D', 7, true], ['A', 2, false]]);
  assert.deepEqual(g.더실림.map((r) => [r.code, r.더함]), [['B', 4]]);
  assert.deepEqual(g.없던것.map((r) => [r.code, r.준것]), [['C', 3]]);
  assert.equal(g.있나, true);
});

test('제품차이 — 다 같으면 셋 다 비고 있나는 거짓', () => {
  const g = 제품차이(itemRows(품(['A', 10]), 품(['A', 10])));
  assert.deepEqual([g.덜실림.length, g.더실림.length, g.없던것.length, g.있나], [0, 0, 0, false]);
  assert.equal(제품차이(null).있나, false, '댈 것이 없어도 터지지 않습니다');
});

test('제품차이 — 이름이 서류마다 달라도 코드가 같으면 한 줄로 묶인다', () => {
  const 발주 = [{ code: 'myT_3C', name: '토리 마이토이 3단 교구장', qty: 100 }];
  const 출고 = [{ code: 'myT_3C', name: 'TORY MY TOY 3-TIER SHELF', qty: 88 }];
  const g = 제품차이(itemRows(발주, 출고));
  assert.equal(g.덜실림.length, 1, '이름이 달라도 두 줄로 갈라지지 않습니다');
  assert.equal(g.덜실림[0].모자람, 12);
  assert.equal(g.없던것.length + g.더실림.length, 0);
});

test('벤더피아사전 — 「+」 로 쪼개고, 수가 맞는 줄로 먼저 짓는다', () => {
  const { 사전, 단품수, 못메운코드 } = 벤더피아사전([
    { 단품코드: 'EF-al55 + bd-whsqa', 단품명: '55형 다리 + 흰 손잡이' },
    { 단품코드: 'EC_0209m', 단품명: '구구단 선반' },
    // 이름 안에 「+」 가 들어 수가 안 맞는 줄 — 앞 줄 사전으로 메워집니다
    { 단품코드: 'EF-al55 + EC_0209m', 단품명: '55형 다리 + 구구단 + 선반' },
    // 빈칸 없이 붙여 쓴 줄
    { 단품코드: 'aa-1+bb-2', 단품명: '가 + 나' },
  ]);
  assert.equal(사전.get('EF-al55'), '55형 다리');
  assert.equal(사전.get('bd-whsqa'), '흰 손잡이');
  assert.equal(사전.get('EC_0209m'), '구구단 선반');
  assert.equal(사전.get('aa-1'), '가');
  assert.equal(사전.get('bb-2'), '나');
  assert.equal(단품수, 5);
  assert.equal(못메운코드, 0, '수가 안 맞던 줄의 코드도 사전에 이미 있으면 셈에서 빠집니다');
});

test('벤더피아사전 — 빈손이어도 터지지 않는다', () => {
  assert.equal(벤더피아사전(null).단품수, 0);
  assert.equal(벤더피아사전([{ 단품코드: '', 단품명: '' }]).단품수, 0);
});


test('벤더피아줄벗기기 — 엑셀 한 줄은 `fields` 밑에 있다', () => {
  // 10-11 관리자가 진짜 문서 꼴로 재서 잡았다. 벗기지 않으면 사전이 통째로 빈다 —
  // 화면은 「읽혔다」 고 하면서 「맞음 0 / 전체 N」 이 뜬다. 읽기가 된 것처럼 보여 더 나쁘다.
  const 진짜꼴 = {
    fields: { 단품코드: 'bkS_2 +myT_3C', 단품명: '이단 책장 + 마이토이 교구장' },
    source: '벤더피아 상품목록', fileName: 'x.xlsx', updatedAt: 0,
  };
  const 줄 = 벤더피아줄벗기기(진짜꼴);
  assert.equal(줄.단품코드, 'bkS_2 +myT_3C');
  assert.equal(줄.source, undefined, '겉껍질은 안 넘어와야 한다');

  // 사전이 실제로 채워진다
  const { 사전, 단품수 } = 벤더피아사전([진짜꼴].map(벤더피아줄벗기기));
  assert.equal(단품수, 2);
  assert.equal(사전.get('bkS_2'), '이단 책장');
  assert.equal(사전.get('myT_3C'), '마이토이 교구장');

  // fields 가 없는 문서가 섞여도 터지지 않는다
  assert.deepEqual(벤더피아줄벗기기({ 단품코드: 'newX' }), { 단품코드: 'newX' });
  assert.equal(벤더피아줄벗기기(null), null);
});

test('벤더피아사전 — 저쪽 코드에 밑줄 꼴이 섞여 있어도 서류 코드와 맞는다', () => {
  // 사전의 열쇠는 코드열쇠입니다. 서류 쪽도 같은 열쇠로 찾습니다 — 날것은 양쪽 다 그대로입니다.
  const { 사전, 단품수 } = 벤더피아사전([
    { 단품코드: 'myT\u25813C + bd-whsqa', 단품명: '마이토이 교구장 + 흰 손잡이' },
  ]);
  assert.equal(단품수, 2);
  assert.equal(사전.get(코드열쇠('myT_3C')), '마이토이 교구장', '서류가 보통 밑줄을 써도 찾힙니다');
  assert.equal(사전.get(코드열쇠('myT\u25813C')), '마이토이 교구장', '저쪽 꼴로도 찾힙니다');
  assert.equal(사전.get(코드열쇠('bd-whsqa')), '흰 손잡이', '하이픈은 그대로입니다');
  assert.equal(사전.get(코드열쇠('bd_whsqa')), undefined, '하이픈과 밑줄은 다른 것입니다');
});

test('itemRows — 발주서와 잔액서류의 밑줄 꼴이 달라도 같은 제품으로 맞댄다', () => {
  const 발주 = [{ code: 'myT\u25813C', name: '마이토이 교구장', qty: 100 }];
  const 잔액 = [{ code: 'myT_3C', name: '마이토이 교구장', qty: 80 }];
  const 줄 = itemRows(발주, 잔액);
  assert.equal(줄.length, 1, '「없던 것」·「빠짐」 두 줄로 갈리면 안 됩니다');
  assert.equal(줄[0].kind, '수량');
  assert.deepEqual([줄[0].from, 줄[0].to], [100, 80]);
  assert.equal(줄[0].code, 'myT_3C', '적히는 코드는 날것입니다');

  // ⚠ 가름표가 다르면 남입니다 — 합치면 안 됩니다
  const 남 = itemRows([{ code: 'BHP8_B', name: '보링 받침 8', qty: 10 }],
                      [{ code: 'BHP_B', name: '보링 받침', qty: 10 }]);
  assert.equal(남.length, 2, 'BHP8_B 와 BHP_B 는 서로 남입니다');
});

/* 10-15 사장님 — 「원산지co장 또는 선하증권 서류가 도착했을때 … 적합성 검사가 필요해」
   신호등 셋뿐입니다. 파일은 안 옮깁니다 — 판단만 보여 줍니다. */
test('적합성 — 신호등 셋. 못 붙은 서류는 갈 자리를 같이 적는다', () => {
  // 맞음 — 이름·폴더에 차수가 적혔거나, 번호가 같은 서류와 묶였습니다
  assert.deepEqual(적합성({ batchBy: 'name' }).등급, '맞음');
  assert.deepEqual(적합성({ batchBy: 'folder' }).등급, '맞음');
  const 번호 = 적합성({ joinedBy: 'SOFRNQB2638116' });
  assert.equal(번호.등급, '맞음');
  assert.match(번호.까닭, /SOFRNQB2638116/);

  // 아마 — 끈이 없어 날짜로 짐작했습니다
  assert.equal(적합성({ guessed: '선적일 2026-08-15 — 이 차수 서류와 2일 차이' }).등급, '아마');

  // 다름 — 못 붙었습니다. 가까웠던 차수를 같이 적습니다
  const 다름 = 적합성({ 후보: [{ batch: '26-18', gap: 9 }, { batch: '26-17', gap: 12 }] });
  assert.equal(다름.등급, '다름');
  assert.equal(다름.갈자리[0].batch, '26-18', '어느 차수에 맞는지 이름을 적습니다');
  assert.equal(적합성({}).갈자리, null, '가까운 것조차 없으면 비워 둡니다');
  assert.equal(적합성(null).등급, '다름', '빈손에서도 안 터집니다');

  // ⚠ 적힌 차수가 가장 셉니다 — 짐작이 그것을 덮으면 안 됩니다
  assert.equal(적합성({ batchBy: 'name', guessed: '선적일 …', 후보: [] }).등급, '맞음');
});

/* ⚠⚠ 원산지증명(C/O)은 **부분 발행**됩니다 — 작다고 「다름」 이 되면 안 됩니다.
      10-15 사장님 말씀입니다. 이 못을 빼지 마십시오. */
test('맞댈자 — 선하증권은 같아야 하고, 원산지증명은 품기면 된다', () => {
  assert.equal(맞댈자('bl'), '같음', '선하증권·전신방출은 카톤·중량이 같아야 합니다');
  assert.equal(맞댈자('fta'), '품음', 'C/O 는 잔액서류에 품기면 됩니다');
  assert.equal(맞댈자('cipl'), '같음');
});

/* 10-16 사장님 — 「잔액서류 올라오기전 **발주수량(입고전)** · 잔액서류가 있는 차수는 **상차수량**」
   ⚠ 글귀를 바꿔 부르지 마십시오. 벤더피아가 이 낱말로 찾습니다. */
test('수량출처 — 잔액서류가 있으면 상차수량, 없으면 발주수량(입고전)', () => {
  assert.deepEqual(수량출처(0), { 어디: '발주수량(입고전)', 잔액있음: false });
  assert.deepEqual(수량출처(1), { 어디: '상차수량', 잔액있음: true });
  assert.deepEqual(수량출처(3), { 어디: '상차수량', 잔액있음: true }, '여러 장이어도 상차수량입니다');
  // ⚠ 글귀가 한 글자라도 달라지면 저쪽에서 못 찾습니다
  assert.equal(수량출처(0).어디, '발주수량(입고전)');
  assert.equal(수량출처(1).어디, '상차수량');
});

/* ── 발주서 ↔ 잔액서류 대조 (사장님 10-29) ── 표는 서버가 떠 둔 cipl.sheets 꼴 그대로 */
const 표 = (rows, h = 1, f) => ({ rows: rows.map((c) => ({ c })), h, f: f ?? rows.length });
// 제헤우드 26-16 발주서(실물 그대로 줄인 것) — ¥ 가 깨져 온 꼴, 수량 0 줄 하나.
const 제발주 = 표([
  ['ZH#', 'ITEM NAME', 'code#', 'COLOR', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT'],
  ['ZH-31', '비요크 무헤드 침대 SS Bjork Bed w/o Head SS', 'ZBY_SSN', '내추럴오크 Natural Oak', 'Â¥467.0', '30', 'Â¥14,010.00'],
  ['ZH-36', '비요크 침대 헤드 LK Bjork Head LK', 'BH_LKN', '내추럴오크 Natural Oak', '¥273.5', '0', '¥0.00'],
  ['ZH-36', '비요크 침대 헤드 LK Bjork Head LK', 'BH_LKB', '블랙 Black', '¥273.5', '10', '¥2,735.00'],
  ['TOTAL', '', '', '', '', '40', '¥16,745.00'],
], 1, 4);
const 제잔액 = 표([
  ['CODE#', 'Product model', 'COLOR', 'Qty pcs', 'FOB', 'Total '],
  ['ZBY_SSN', 'Bjork Bed w/o Head  SS', 'Natural Oak', '30', '509', '15270'],
  ['BH_LKB', 'Bjork Head LK', 'Black', '10', '273.5', '2735'],
  ['', '', '', '40', '', '18005'],
], 1, 3);

test('대조숫자 — 깨진 ¥·CNY 를 떼고 숫자만, 글자가 길면 빈칸', () => {
  assert.equal(대조숫자('¥14,010.00'), 14010);
  assert.equal(대조숫자('Â¥467.0'), 467);
  assert.equal(대조숫자('ï¿¥1,001.50'), 1001.5);
  assert.equal(대조숫자('CNY 282'), 282);
  assert.equal(대조숫자(''), null);
  assert.equal(대조숫자('(PCS)'), null);
  assert.equal(대조숫자('1pcs/ctn'), null);
});

test('발주대조 — 제헤우드: 단가·금액·합계 금액만 다르고, 수량 0 줄·색·모델명은 차이 아님', () => {
  const r = 발주대조(제발주, 제잔액);
  assert.equal(r.못댐, null);
  assert.equal(r.합계줄없음, false);
  assert.deepEqual(r.줄.map((x) => [x.kind, x.name, x.from, x.to]), [
    ['단가', 'ZBY_SSN', 467, 509],
    ['금액', 'ZBY_SSN', 14010, 15270],
    ['합계', '금액', 16745, 18005],
  ]);
});

test('발주대조 — 깨진 기호만 다르면 차이 없음', () => {
  const 잔 = 표([
    ['CODE#', 'Product model', 'COLOR', 'Qty pcs', 'FOB', 'Total '],
    ['ZBY_SSN', 'Bjork Bed w/o Head SS', 'Natural Oak', '30', '¥467', '¥14,010'],
    ['BH_LKB', 'Bjork Head LK', 'Black', '10', '273.50', '2,735.00'],
  ]);
  assert.deepEqual(발주대조(제발주, 잔).줄, []);
});

test('발주대조 — 색이 다르면 색상, 반 넘게 다르면 견주지 않음', () => {
  const 잔 = (c1, c2) => 표([
    ['CODE#', 'COLOR', 'Qty pcs'],
    ['ZBY_SSN', c1, '30'],
    ['BH_LKB', c2, '10'],
  ]);
  assert.deepEqual(발주대조(제발주, 잔('Natural Oak', 'White')).줄.map((x) => [x.kind, x.name, x.to]),
    [['색상', 'BH_LKB', 'White']]);
  assert.deepEqual(발주대조(제발주, 잔('체리', '흰색')).줄, []);
});

test('발주대조 — 베이지아: 코드가 Description 칸에, 머리줄 둘, 수량·합계 차이', () => {
  const 발 = 표([
    ['no.', 'ITEM NAME', 'code#', 'FABRIC / COLOR', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT'],
    ['1', '포니엘 패브릭 침대 SS', 'AMT-S03-01', 'comodo ivory', '¥1,001.50', '52', '¥52,078'],
    ['2', '포니엘 포켓 가드', 'AMT-S03-03', 'comodo ivory', '¥282.00', '40', '¥11,280'],
    ['TOTAL', '', '', '', '', '', '¥63,358.00'],
  ], 1, 3);
  const 잔 = 표([
    ['Marks&Numbers', 'Description of Goods', 'Quantity', 'Unit Price', 'Amount'],
    ['N/M', 'BED', '(PCS)', 'CNY', 'CNY'],
    ['', 'AMT-S03-01', '48', '1001.5', '48072'],
    ['', 'AMT-S03-03', '40', '282', '11280'],
    ['', 'TOTAL VALUE', '88', '', '59352'],
  ], 2, 4);
  const r = 발주대조(발, 잔);
  assert.deepEqual(r.줄.map((x) => [x.kind, x.name, x.from, x.to]), [
    ['수량', 'AMT-S03-01', 52, 48],
    ['금액', 'AMT-S03-01', 52078, 48072],
    ['합계', '수량', 92, 88],
    ['합계', '금액', 63358, 59352],
  ]);
});

test('발주대조 — 단가 빈 발주서는 단가없음, 단가 줄은 안 적음', () => {
  const 발 = 표([
    ['no.', 'code#', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT'],
    ['1', 'AMT-S03-01', '', '50', ''],
    ['TOTAL', '', '', '', ''],
  ], 1, 2);
  const 잔 = 표([['Description of Goods', 'Quantity', 'Unit Price', 'Amount'], ['AMT-S03-01', '50', '1001.5', '50075']]);
  const r = 발주대조(발, 잔);
  assert.equal(r.단가없음, true);
  assert.deepEqual(r.줄, []);
});

test('발주대조 — 밑줄 꼴만 다르면 같은 코드, 하이픈은 다른 코드', () => {
  const 발 = 표([['code#', 'ORDER QTY'], ['myT\u25813C', '5'], ['BHP-B', '2'], ['TOTAL', '7']], 1, 3);
  const 잔 = 표([['CODE#', 'Qty pcs'], ['myT_3C', '5'], ['BHP_B', '2']]);
  assert.deepEqual(발주대조(발, 잔).줄.map((x) => [x.kind, x.name]), [['발주서만', 'BHP-B'], ['잔액서류만', 'BHP_B']]);
});

test('발주대조 — TOTAL 줄 없는 발주서는 합계줄없음, 못 읽은 표는 못댐', () => {
  const 발 = 표([['code#', 'ORDER QTY'], ['A-1', '5']]);
  const 잔 = 표([['CODE#', 'Qty pcs'], ['A-1', '5']]);
  assert.equal(발주대조(발, 잔).합계줄없음, true);
  assert.equal(발주대조(표([['아무', '것']]), 잔).못댐, '발주서 품목 못 읽음');
  assert.equal(발주대조(발, null).못댐, '잔액서류 품목 못 읽음');
  assert.equal(발주대조(표([['ITEM NAME', 'QTY'], ['식탁 의자 세트 흰색', '3']]), 잔).못댐, '발주서 코드 칸 없음');
});

/* ── 내용보기 ↔ 벤더피아 단품 (v0.87.0) ── */
const 단품문서 = [
  { id: '_정보', 단품수: 4 },
  { id: '단품_2', 줄: ['E-al21wt\t알렉스 2100 거실장 화이트\t판매중'] },
  { id: '단품_1', 줄: ['LS_liwh\t리안 2100 거실장 화이트(해피코)\t판매중', 'myT▁L3C\t토리 마이토이 로우 3단 책장\t판매중', 'LS_liwh\t뒤에 온 같은 코드\t중지'] },
];

test('벤더피아단품사전 — 단품_N 차례, 코드열쇠로, 같은 열쇠는 앞의 것', () => {
  const m = 벤더피아단품사전(단품문서);
  assert.equal(m.size, 3);
  assert.equal(m.get('LS_liwh').이름, '리안 2100 거실장 화이트(해피코)');
  assert.equal(m.get('myT_L3C').코드, 'myT▁L3C');
  assert.equal(m.get('E-al21wt').상태, '판매중');
});

test('벤더피아단품사전 — 넷째 칸 양품수는 숫자일 때만 (벤더피아연동 0.34.82)', () => {
  const m = 벤더피아단품사전([{ id: '단품_1', 줄: ['A1\t가\t판매중\t12', 'A2\t나\t판매중\t', 'A3\t다\t판매중', 'A4\t라\t중지\t0'] }]);
  assert.equal(m.get('A1').양품, 12);
  assert.ok(!('양품' in m.get('A2')));
  assert.ok(!('양품' in m.get('A3')));
  assert.equal(m.get('A4').양품, 0);
});

test('이름같음 — 띄어쓰기·대소문자·괄호는 안 보고, 품으면 같음', () => {
  assert.ok(이름같음('리안 2100  거실장 화이트', '리안 2100 거실장 화이트(해피코)'));
  assert.ok(이름같음('PLUS Desk 1200(white)', 'plus desk 1200 white'));
  assert.ok(!이름같음('알렉스 2100 거실장 발리오크', '알렉스 2100 거실장 화이트'));
  assert.ok(!이름같음('', '리안'));
});

test('벤더피아맞대기 — 코드만 맞으면 맞음·없음·코드없음, 머리·합계·빈 줄은 안 칠함', () => {
  const 사전 = 벤더피아단품사전(단품문서);
  const t = {
    h: 1, f: 7,
    rows: [
      { c: ['no.', 'code#', 'ITEM NAME/COLOR\n(KRO)', 'ITEM NAME\n(ENG)', 'ORDER QTY'] },
      { c: ['1', 'LS_liwh', '리안 2100 거실장 화이트', 'LIAN Room cabinet 2100 (white)', '10'] },
      { c: ['2', 'E-al21wt\n', '알렉스 2100 거실장 발리오크', 'Alex Room cabinet', '5'] },
      { c: ['3', 'E_al21wt', '알렉스 2100 거실장 화이트', '', '5'] },          // `-` 와 `_` 는 다른 코드
      { c: ['4', '', '이름만 있는 줄', '', '1'] },
      { c: ['', '', '', '', ''] },
      { c: ['', '', 'S/TOTAL', '', '21'] },
      { c: ['', '', 'TOTAL', '', '21'] },
    ],
  };
  const r = 벤더피아맞대기(t, 사전);
  assert.deepEqual(r.칸, { code: 1, names: [2, 3] });
  assert.equal(r.줄.get(1).kind, '맞음');
  assert.equal(r.줄.get(1).칸, 2);
  assert.equal(r.줄.get(2).kind, '맞음');                     // 이름이 달라도 코드가 맞으면 맞음
  assert.equal(r.줄.get(2).칸, 2);
  assert.equal(r.줄.get(2).vp.이름, '알렉스 2100 거실장 화이트');
  assert.equal(r.줄.get(3).kind, '없음');
  assert.equal(r.줄.get(4).kind, '코드없음');
  assert.ok(!r.줄.has(0) && !r.줄.has(5) && !r.줄.has(6) && !r.줄.has(7));
});

test('벤더피아맞대기 — 밑줄 꼴(▁)은 같은 코드, 대소문자는 다른 코드', () => {
  const 사전 = 벤더피아단품사전(단품문서);
  const t = { h: 1, rows: [{ c: ['CODE#', 'Product model'] }, { c: ['myT_L3C', '토리 마이토이 로우 3단 책장'] }, { c: ['MYT_L3C', '토리 마이토이 로우 3단 책장'] }] };
  const r = 벤더피아맞대기(t, 사전);
  assert.equal(r.줄.get(1).kind, '맞음');
  assert.equal(r.줄.get(2).kind, '없음');
});

test('벤더피아맞대기 — 제헤우드 영어 이름 ↔ 벤더피아 한글 단품명도 코드만 맞으면 맞음(myT_3C)', () => {
  const 사전 = 벤더피아단품사전([{ id: '단품_1', 줄: ['myT_3C\t토리 마이토이 3단 책장\t판매중'] }]);
  const t = { h: 1, rows: [{ c: ['CODE#', 'Product model', 'Qty pcs'] }, { c: ['myT_3C', 'MyToy 3-tier bookcase', '20'] }] };
  const r = 벤더피아맞대기(t, 사전);
  assert.equal(r.줄.get(1).kind, '맞음');
  assert.equal(r.줄.get(1).칸, 1);
  assert.equal(r.줄.get(1).vp.이름, '토리 마이토이 3단 책장');
});

test('벤더피아맞대기 — 코드 칸이 없으면 못댐(칠하지 않음)', () => {
  assert.deepEqual(벤더피아맞대기({ h: 1, rows: [{ c: ['Description of Goods', 'Quantity'] }, { c: ['AMT-S03-01', '3'] }] }, new Map()), { 못댐: '코드 칸 없음' });
});

test('벤더피아상품연결 — 단품 열쇠마다 그 단품이 든 상품', () => {
  const m = 벤더피아상품연결([{ id: '상품_1', 줄: ['P1\t리안 세트\t판매중\tLS_liwh,E-al21wt', 'P2\t리안 단품\t판매중\tLS▁liwh'] }]);
  assert.deepEqual(m.get('LS_liwh').map((x) => x.코드), ['P1', 'P2']);
  assert.equal(m.get('E-al21wt').length, 1);
});

test('벤더피아맞대기 — 임시통합 발주 표(단품코드·단품명 칸)도 같은 논리, 합계줄은 안 칠함', async () => {
  const { 임시발주묶기 } = await import('../js/parse.js');
  const 사전 = 벤더피아단품사전([{ id: '단품_1', 줄: ['A1\t에이원\t판매중\t3'] }]);
  const [b] = 임시발주묶기('가', [
    ['1', 'ZH26-01', '외자', '', '2026-01-01', '', 'A1', '에이원 수입명', '1', '1', '0', '0', 'Y'],
    ['1', 'ZH26-01', '외자', '', '2026-01-01', '', 'B9', '비구', '1', '1', '0', '0', 'Y'],
    ['1', 'ZH26-01', '외자', '', '2026-01-01', '', '', '이름만', '1', '1', '0', '0', 'Y'],
  ]);
  const m = 벤더피아맞대기(b.표, 사전);
  assert.equal(m.칸.code, 4);
  assert.deepEqual([...m.줄].map(([i, x]) => [i, x.kind]), [[1, '맞음'], [2, '없음'], [3, '코드없음']]);
});

test('벤더피아맞대기 — 차례: 코드 일치 → 이어 둔 연결 → 이름 후보(제안만)', () => {
  const 사전 = 벤더피아단품사전([{ id: '단품_1', 줄: [
    'aloc_lgB\t알베로 원형(세라믹) 다리_블랙\t판매중\t5',
    'alce10b\t알베로 원형(세라믹) 식탁 프레임 1000_블랙\t판매중\t37',
    'X9\t알베로원형세라믹다리블랙\t판매중\t',
    'BK\t블랙\t판매중\t',
  ] }]);
  const t = { h: 1, rows: [
    { c: ['단품코드', '단품명'] },
    { c: ['aloc_lgb', '알베로 원형(세라믹) 다리_블랙'] },
    { c: ['alce10b', '알베로 원형(세라믹) 식탁 프레임 1000_블랙'] },
    { c: ['zz_1', '아무 이름'] },
  ] };
  const r = 벤더피아맞대기(t, 사전);
  const 없 = r.줄.get(1);
  assert.equal(없.kind, '없음');                       // 대소문자 다르면 다른 코드 — 그대로
  assert.equal(없.열쇠, 'aloc_lgb');
  assert.deepEqual(없.후보.map((v) => v.코드), ['aloc_lgB', 'X9']);   // 같은 이름 둘 다, 「블랙」 은 짧아 안 걸림
  assert.equal(r.줄.get(2).kind, '맞음');
  assert.equal(r.줄.get(2).이음, false);
  assert.deepEqual(r.줄.get(3).후보, []);
  // 이어 두면 맞음(이음) — 연결이 코드 일치를 덮지는 않음
  const 연결 = new Map([['aloc_lgb', 'aloc_lgB'], ['alce10b', 'X9'], ['zz_1', '없는코드']]);
  const r2 = 벤더피아맞대기(t, 사전, 연결);
  assert.equal(r2.줄.get(1).kind, '맞음');
  assert.equal(r2.줄.get(1).이음, true);
  assert.equal(r2.줄.get(1).vp.양품, 5);
  assert.equal(r2.줄.get(2).vp.코드, 'alce10b');
  assert.equal(r2.줄.get(2).이음, false);
  assert.equal(r2.줄.get(3).kind, '없음');              // 목록에 없는 코드로 이은 것은 없음
});

test('이름후보 — 뼈가 같은 것 먼저, 품는 것은 4글자부터, 최대 개수', () => {
  const 사전 = 벤더피아단품사전([{ id: '단품_1', 줄: ['A\t토리 3단 선반(화이트)\t판매중', 'B\t토리3단선반\t판매중', 'C\t토리 3단 선반 화이트\t판매중', 'D\t선반\t판매중'] }]);
  assert.deepEqual(이름후보(['토리 3단 선반 화이트'], 사전).map((v) => v.코드), ['A', 'C', 'B']);
  assert.deepEqual(이름후보(['토리 3단 선반 화이트'], 사전, 1).map((v) => v.코드), ['A']);
  assert.deepEqual(이름후보([''], 사전), []);
  assert.deepEqual(이름후보(['x'], null), []);
});

test('정식이름 — 제헤우드 ITEM NAME 두 줄은 윗줄 한글 정식 명칭만', () => {
  assert.equal(정식이름('토리 마이토이 3단 교구장\nTori mytoy 3s bookshelf'), '토리 마이토이 3단 교구장');
  assert.equal(정식이름('토리 마이토이 3단 교구장 Tori mytoy 3s bookshelf'), '토리 마이토이 3단 교구장');   // 서버가 붙인 꼴
  assert.equal(정식이름('토리 마이토이 낮은 4단 교구장 Tori mytoy Low 4s bookshelf'), '토리 마이토이 낮은 4단 교구장');
  assert.equal(정식이름('알베로 원형(세라믹) 식탁 프레임 1000_블랙'), '알베로 원형(세라믹) 식탁 프레임 1000_블랙');
  assert.equal(정식이름('Tori mytoy 3s bookshelf'), 'Tori mytoy 3s bookshelf');
  assert.equal(정식이름(''), '');
  // 해피코 — KRO·ENG 칸이 따로면 한글 칸만
  assert.deepEqual(찾을이름들(['리안 2100 거실장 화이트', 'LIAN 2100 TV stand white']), ['리안 2100 거실장 화이트']);
  assert.deepEqual(찾을이름들(['Only English']), ['Only English']);
});

test('이름후보 — 영어 꼬리는 찾는 데 안 씀(제헤우드 발주서)', () => {
  const 사전 = 벤더피아단품사전([{ id: '단품_1', 줄: ['myT_3CR\t토리 마이토이 3단 교구장_크림\t판매중\t4', 'EN1\tTori mytoy 3s bookshelf\t판매중'] }]);
  const t = { h: 1, rows: [{ c: ['code#', 'ITEM NAME'] }, { c: ['myT_3C', '토리 마이토이 3단 교구장 Tori mytoy 3s bookshelf'] }] };
  const m = 벤더피아맞대기(t, 사전).줄.get(1);
  assert.equal(m.이름, '토리 마이토이 3단 교구장');
  assert.deepEqual(m.후보.map((v) => v.코드), ['myT_3CR']);
});

test('가격칸 — 머리줄 이름으로 가격 칸, 수량·CBM 은 그대로, 합계줄 돈도 가림', () => {
  // 제헤우드 발주서 꼴
  const po = { h: 1, f: 3, rows: [
    { c: ['no.', 'code#', 'ITEM NAME', 'ORDER QTY', 'PRICE (FOB Qingdao)', 'AMOUNT', 'CBM', 'remark'] },
    { c: ['1', 'myT_3C', '토리 3단', '30', '¥113.00', '¥3,390.00', '0.12', ''] },
    { c: ['2', 'myT_4C', '토리 4단', '20', '¥146.00', '¥2,920.00', '0.15', ''] },
    { c: ['', 'TOTAL', '', '50', '', '¥6,310.00', '0.27', ''] },
  ] };
  const p = 가격칸(po);
  assert.deepEqual([...p.칸], [4, 5]);
  assert.equal(p.가릴('PRICE (FOB Qingdao)', 4, 0), false);   // 머리는 보임
  assert.equal(p.가릴('¥113.00', 4, 1), true);
  assert.equal(p.가릴('30', 3, 1), false);
  assert.equal(p.가릴('0.12', 6, 1), false);
  assert.equal(p.가릴('50', 3, 3), false);                     // 합계 수량
  assert.equal(p.가릴('0.27', 6, 3), false);                   // 합계 CBM
  assert.equal(p.가릴('¥6,310.00', 5, 3), true);
  assert.equal(p.가릴('', 5, 3), false);
  // 제헤우드 CI — 금액 칸이 「Total」, 「Total CBM」 은 아님
  const ci = 가격칸({ h: 1, rows: [{ c: ['CODE#', 'Product model', 'Qty pcs', 'Qty Carton', 'FOB', 'Total', 'Total CBM', 'N.W. (KGS)'] }] });
  assert.deepEqual([...ci.칸], [4, 5]);
  // 베이지아 CI — 둘째 머리줄 CNY, 수량 밑 (PCS)
  const by = 가격칸({ h: 2, rows: [{ c: ['Description of Goods', 'Quantity', 'Unit Price', ''] }, { c: ['', '(PCS)', 'CNY', 'CNY'] }] });
  assert.deepEqual([...by.칸], [2, 3]);
  // 임시통합 — 단가·금액, 합계줄
  const tmp = 가격칸({ h: 1, f: 2, rows: [
    { c: ['PO번호', '단품코드', '발주수량', '입고수량', '단가', '금액'] },
    { c: ['P1', 'A_1', '10', '10', '5,000', '50,000'] },
    { c: ['합계', '', '10', '10', '', '50,000'] },
  ] });
  assert.deepEqual([...tmp.칸], [4, 5]);
  assert.equal(tmp.가릴('10', 2, 2), false);
  // 옆으로 합친 머리 밑 칸, 통화 표가 붙은 값은 칸 이름이 없어도
  const 합친 = 가격칸({ h: 1, f: 2, rows: [{ c: ['code#', 'AMOUNT', '', 'remark'] }, { c: ['A', '¥', '100', 'USD 30'] }, { c: ['Deposit', '', '', '1,200'] }] });
  assert.deepEqual([...합친.칸], [1, 2]);
  assert.equal(합친.가릴('USD 30', 3, 1), true);
  assert.equal(합친.가릴('1,200', 3, 2), true);               // 합계줄 숫자는 모르는 칸이어도
  // 해피코 머리: 헤보트 CBM · cbm합 · Carton Volume 은 가격 아님
  const hp = 가격칸({ h: 1, rows: [{ c: ['code#', 'ITEM NAME (ENG)', 'ORDER QTY', '헤보트 CBM', 'cbm합', 'Carton Volume (CBM)', 'PRICE (FOB Qingdao)', 'AMOUNT', '환율적용 운임세금 1.15', '매입가'] }] });
  assert.deepEqual([...hp.칸], [6, 7, 8, 9]);
});

/* ── 양식만 다른 같은 발주서 (사장님 11-07) ── 이름·코드·숫자는 지어낸 것입니다. */
const 합 = (줄, i) => String(줄.reduce((s, r) => s + (대조숫자(r[i]) ?? 0), 0));
const 양식표 = (줄, 끝 = true) => ({
  name: '발주서', h: 1, f: 줄.length + 1,
  rows: [['no.', 'code#', 'ITEM NAME', 'PRICE (FOB Qingdao)', 'ORDER QTY', 'AMOUNT'], ...줄.map((r, i) => [String(i + 1), ...r]),
    ...(끝 ? [['TOTAL', '', '', '', 합(줄, 3), 합(줄, 4)]] : [])],
});
const 양식서류 = (name, 줄, brief = {}, 끝 = true) => ({ name, path: `해피코/Hp-26-01/${name}`, mtime: 1, cipl: { brief, sheets: [양식표(줄, 끝)] } });
const 줄1 = [['AA_1', '가', '¥100.00', '10', '¥ 1,000.00'], ['BB-2', '나', '¥20.00', '5', '¥ 100.00']];

test('같은발주인가 — PDF 와 엑셀이 표 내용이 같으면 같은 발주 (돈 표기가 달라도)', () => {
  const pdf = 양식서류('HPC-26-1차_20260101.pdf', 줄1, { orderDate: '2026-01-01' });
  const xls = 양식서류('다른이름.xlsx', [['AA▁1', '가나다', '100', '10', '1000'], ['BB-2', '라', '20', '5', '100']], { orderDate: '2026-01-01' }, false);
  assert.equal(같은발주인가(pdf, xls), true);
});

test('같은발주인가 — 일부만 같으면 안 묶는다', () => {
  const pdf = 양식서류('a.pdf', 줄1);
  const 다름 = (줄) => 같은발주인가(pdf, 양식서류('b.xlsx', 줄));
  assert.equal(다름([줄1[0]]), false, '품목이 빠짐');
  assert.equal(다름([...줄1, ['CC_3', '다', '¥1.00', '1', '¥1.00']]), false, '품목이 더 있음');
  assert.equal(다름([['AA_1', '가', '¥100.00', '11', '¥ 1,000.00'], 줄1[1]]), false, '수량 다름');
  assert.equal(다름([['AA_1', '가', '¥100.00', '10', '¥ 1,100.00'], 줄1[1]]), false, '금액 다름');
  assert.equal(다름([['AA_1', '가', '¥90.00', '10', '¥ 1,000.00'], 줄1[1]]), false, '단가 다름');
  assert.equal(다름([['AA-1', '가', '¥100.00', '10', '¥ 1,000.00'], 줄1[1]]), false, '코드 꼴 다름(- 와 _ 는 다른 코드)');
});

test('같은발주인가 — 이름이 같아도 내용이 다르면 다른 발주, 이름이 달라도 같으면 같은 발주', () => {
  const 이름같음 = [양식서류('HPC-26-1차.pdf', 줄1), 양식서류('HPC-26-1차.xlsx', [['AA_1', '가', '¥100.00', '12', '¥ 1,200.00'], 줄1[1]])];
  assert.equal(같은발주인가(...이름같음), false);
  assert.equal(같은발주인가(양식서류('완전히.pdf', 줄1), 양식서류('다른 이름.pdf', 줄1)), true);
});

test('같은발주인가 — 품목이 같아도 납기가 고쳐졌으면 다른 판', () => {
  const a = 양식서류('a.pdf', 줄1, { orderDate: '2026-01-01', deliveryDate: '2026-02-01' });
  assert.equal(같은발주인가(a, 양식서류('b.xlsx', 줄1, { orderDate: '2026-01-01', deliveryDate: '2026-03-01' })), false);
  assert.equal(같은발주인가(a, 양식서류('c.xlsx', 줄1, { orderDate: '2026-01-02', deliveryDate: '2026-02-01' })), false);
  assert.equal(같은발주인가(a, 양식서류('d.xlsx', 줄1, { orderDate: '2026-01-01' })), false, '납기를 적어 넣은 수정본');
});

test('같은발주인가 — 못 읽거나 표가 잘렸으면 묶지 않는다', () => {
  const pdf = 양식서류('a.pdf', 줄1);
  assert.equal(같은발주인가(pdf, { name: 'b.xlsx', path: 'b.xlsx' }), false, '엑셀을 아직 안 읽음');
  assert.equal(같은발주인가(pdf, { name: 'c.xlsx', cipl: { sheets: [] } }), false, '읽을 표 없음');
  assert.equal(같은발주인가(양식서류('쪽나뉨.pdf', 줄1, {}, false), 양식서류('b.xlsx', 줄1)), false, 'PDF 합계줄 없음');
  assert.equal(같은발주인가(양식서류('a.pdf', []), 양식서류('b.pdf', [])), false, '품목 없음');
  const 끝 = (d, q, a) => { d.cipl.sheets[0].rows.push(['', '', '', '', q, a]); return d; };
  assert.equal(같은발주인가(끝(양식서류('숫자합계.pdf', 줄1, {}, false), '15', '¥1,100.00'), 양식서류('b.xlsx', 줄1)), true, '낱말 없는 합계줄(해피코)');
  assert.equal(같은발주인가(끝(양식서류('a.pdf', 줄1, {}, false), '15', '¥1,100.00'), 끝(양식서류('b.pdf', 줄1, {}, false), '15', '¥1,100.00')), true);
  assert.equal(같은발주인가(끝(양식서류('a.pdf', 줄1, {}, false), '15', '¥1,100.00'), 끝(양식서류('b.pdf', 줄1, {}, false), '14', '¥900.00')), false, '줄을 취소해 합계만 다름(해피코 26-2)');
  // 표가 첫 쪽에서 끊긴 PDF 끼리 — 글자에서 읽은 총수량·총금액이 같을 때만
  const 끊김 = (n, b) => 양식서류(n, 줄1, b, false);
  assert.equal(같은발주인가(끊김('a.pdf', { qty: 15, amount: 1100 }), 끊김('b.pdf', { qty: 15, amount: 1100 })), true, '제헤우드 26-03');
  assert.equal(같은발주인가(끊김('a.pdf', { qty: 15, amount: 1100 }), 끊김('b.pdf', { qty: 15, amount: 900 })), false, '뒤쪽이 다름');
  assert.equal(같은발주인가(끊김('a.pdf', {}), 끊김('b.pdf', {})), false, '총합을 모름');
});

test('발주판묶기 — 수정 전·후는 판으로 나뉘고 판마다 PDF 가 대표', () => {
  const 수정줄 = [줄1[0], ['BB-2', '나', '¥20.00', '7', '¥ 140.00']];
  const [판1, 판2, ...더] = 발주판묶기([
    양식서류('1차수정.xlsx', 수정줄), 양식서류('1차수정.pdf', 수정줄), 양식서류('처음.xlsx', 줄1), 양식서류('처음.pdf', 줄1),
  ]);
  assert.equal(더.length, 0);
  assert.equal(판1.name, '1차수정.pdf');
  assert.deepEqual(판1.양식들.map((d) => [d.양식, d.name]), [['PDF', '1차수정.pdf'], ['엑셀', '1차수정.xlsx']]);
  assert.equal(판2.name, '처음.pdf');
});

test('발주판묶기 — 같은 꼴 양식은 번호, 셋도 한 판', () => {
  const [판] = 발주판묶기([양식서류('a.pdf', 줄1), 양식서류('b.pdf', 줄1), 양식서류('c.xlsx', 줄1)]);
  assert.deepEqual(판.양식들.map((d) => d.양식), ['PDF 1', 'PDF 2', '엑셀']);
});

test('양식묶기 — 발주서 칸만 접고 b.docs 는 그대로, 혼자면 그대로', () => {
  const docs = [양식서류('a.pdf', 줄1), 양식서류('a.xlsx', 줄1)];
  const b = { docs, stages: [{ key: 'order', docs }, { key: 'cipl', docs: [] }] };
  const 뒤 = 양식묶기(b);
  assert.equal(뒤.stages[0].docs.length, 1);
  assert.equal(뒤.stages[0].docs[0].양식들.length, 2);
  assert.equal(뒤.docs.length, 2);
  assert.equal(뒤.stages[1], b.stages[1]);
  const 혼자 = { docs: docs.slice(0, 1), stages: [{ key: 'order', docs: docs.slice(0, 1) }] };
  assert.equal(양식묶기(혼자), 혼자);
  assert.equal(양식묶기({ 임시: true, docs: [] }).stages, undefined);
});

/* ── 한 차수의 수량은 한 판만 (v0.115.0) ── 이름·코드는 지어낸 것입니다 */
const 줄 = (...짝) => 짝.map(([code, qty]) => ({ code, qty }));
const 발주 = (name, items, 덧 = {}) => ({ name, path: `가/Hp-26-02/${name}`, stageKey: 'order', cipl: { items, sheets: [] }, ...덧 });
const 잔액장 = (name, items) => ({ name, path: `가/Hp-26-02/${name}`, stageKey: 'cipl', cipl: { items } });
const 차수 = (판들, 잔액 = []) => ({ id: '가::26-02', batch: '26-02', vendor: '가',
  docs: [...판들.flatMap((d) => d.양식들 ?? [d]), ...잔액],
  stages: [{ key: 'order', docs: 판들 }, { key: 'cipl', docs: 잔액 }] });
const 원본 = 발주('HPC-26-2차 _20260106.pdf', 줄(['AA_1', 100], ['BB_1', 50]));
const 수정 = 발주('HPC-26-2차 (수정) _20260223.pdf', 줄(['AA_1', 80], ['BB_1', 50]));
const 둘째 = 발주('HPC-26-2차 (2차수정) _20260303.pdf', 줄(['AA_1', 70], ['CC_1', 5]));

test('차수수량 — 확정이 없으면 가장 늦은 판 하나만 센다', () => {
  const b = 차수([수정, 원본, 둘째]);
  assert.equal(수량판(b).name, 둘째.name);
  assert.deepEqual(차수수량(b, 'AA_1'), { batch: '26-02', 수량: 70, 어디: '발주수량(입고전)', 잔액있음: false });
  assert.equal(차수수량(b, 'BB_1'), null, '최신 판에서 빠진 단품은 없음');
});

test('차수수량 — 확정 발주서가 있으면 더 늦은 판이 있어도 그 판', () => {
  const b = 차수([원본, 수정, 둘째]);
  assert.equal(차수수량(b, 'AA_1', 수정.path).수량, 80);
  assert.equal(차수수량(b, 'CC_1', 수정.path), null);
});

test('차수수량 — 확정 경로가 그 차수에 없으면 확정이 없는 것으로 본다', () => {
  assert.equal(차수수량(차수([원본, 둘째]), 'AA_1', '가/딴곳/없는.pdf').수량, 70);
});

test('차수수량 — 양식만 다른 같은 발주는 한 판', () => {
  const 판 = { ...둘째, 양식들: [{ ...둘째, 양식: 'PDF' }, { ...둘째, name: '엑셀.xlsx', path: '가/엑셀.xlsx', 양식: '엑셀' }] };
  assert.equal(차수수량(차수([원본, 판]), 'AA_1').수량, 70);
  assert.equal(차수수량(차수([원본, 판]), 'AA_1', '가/엑셀.xlsx').수량, 70, '엑셀 양식으로 확정해도 그 판');
});

test('차수수량 — 수량을 못 읽은 판은 건너뛰되, 확정한 판은 다른 판으로 메우지 않는다', () => {
  const 못읽음 = 발주('HPC-26-2차 (3차수정) _20260401.pdf', []);
  assert.equal(차수수량(차수([원본, 못읽음]), 'AA_1').수량, 100);
  assert.equal(차수수량(차수([원본, 못읽음]), 'AA_1', 못읽음.path), null);
});

test('차수수량 — items 가 빈 엑셀 발주서는 표에서 읽는다', () => {
  const 표 = { rows: [{ c: ['code#', 'ORDER QTY'] }, { c: ['AA_1', '60'] }, { c: ['BB_1', '0'] }], h: 1, f: 3 };
  const 엑셀 = 발주('HPC-26-2차 (3차수정) _20260401.xlsx', [], { cipl: { items: [], sheets: [표] } });
  assert.equal(차수수량(차수([원본, 엑셀]), 'AA_1').수량, 60);
  assert.equal(차수수량(차수([원본, 엑셀]), 'BB_1'), null);
});

test('차수수량 — 이름에 날짜가 없으면 수정 차례, 그것도 같으면 올린 시각', () => {
  const a = 발주('가 발주서.pdf', 줄(['AA_1', 1]), { ctime: 100 });
  const b = 발주('나 발주서.pdf', 줄(['AA_1', 2]), { ctime: 200 });
  const c = 발주('다 발주서 수정.pdf', 줄(['AA_1', 3]), { ctime: 50 });
  assert.equal(차수수량(차수([a, b]), 'AA_1').수량, 2);
  assert.equal(차수수량(차수([a, b, c]), 'AA_1').수량, 3);
});

test('차수수량 — 잔액서류가 있으면 여태처럼 잔액서류를 더하고 발주서는 안 본다', () => {
  const b = 차수([원본, 둘째], [잔액장('CI 1.xlsx', 줄(['AA_1', 30])), 잔액장('CI 2.xlsx', 줄(['AA_1', 12]))]);
  assert.deepEqual(차수수량(b, 'AA_1', 둘째.path), { batch: '26-02', 수량: 42, 어디: '상차수량', 잔액있음: true });
  assert.equal(차수수량(b, 'CC_1'), null);
});

test('차수수량 — 제헤우드 꼴: 발주서가 한 장이면 예전과 같다', () => {
  const b = 차수([발주('AMT(ZH)26-30 Ordersheet_2026.10.27.pdf', 줄(['BY_N4', 60], ['BY▁N4', 4]))]);
  assert.equal(차수수량(b, 'BY_N4').수량, 64, '밑줄 꼴만 다른 줄은 한 단품');
});

test('차수수량 — 임시통합 차수는 수량이 없다', () => {
  // 임시통합은 cipl 이 없고 벤더피아로 가는 state.batches 에도 안 들어갑니다.
  const b = 차수([{ name: 'PO 1', path: '임시:1', stageKey: 'order', 임시: { po: '1' } }]);
  assert.equal(차수수량(b, 'AA_1'), null);
  assert.equal(수량판(b), null);
});

/* ── ITEM NO 코드 칸 (해피코 잔액서류, 사장님 11-07) ── 값은 지어낸 것입니다. */
const 품번표 = (머리, 줄, f) => ({ rows: [머리, ...줄].map((c) => ({ c })), h: 1, f: f ?? 줄.length + 1 });
const 사전하나 = 벤더피아단품사전([{ id: '단품_1', 줄: ['AB-01\t가나 책장\t판매중\t7'] }]);

test('ITEM NO — 벤더피아 맞대기·발주서 대조의 코드 칸이 된다', () => {
  for (const 머리칸 of ['ITEM NO', 'Item No.', 'Item No', 'Item\n no.']) {
    const t = 품번표(['Description of goods', 머리칸, '', 'QUANTITY', 'PRICE', 'AMOUNT'], [
      ['Gana shelf 가나 책장', 'AB-01', '书架', '10', '￥5.00', '￥50.00'],
      ['Dara desk 다라 책상', 'cd_02', '书桌', '3', '￥4.00', '￥12.00'],
      ['TOTAL', '', '', '13', '', '￥62.00'],
    ], 3);
    const m = 벤더피아맞대기(t, 사전하나);
    assert.equal(m.칸.code, 1, 머리칸);
    assert.deepEqual(m.칸.names, [0]);
    assert.equal(m.줄.get(1).kind, '맞음');
    assert.equal(m.줄.get(1).vp.양품, 7);
    assert.equal(m.줄.get(1).칸, 0);
    assert.equal(m.줄.get(2).kind, '없음');
    assert.equal(m.줄.has(3), false, '합계줄은 안 칠함');
  }
  const 발주 = { rows: [['code#', 'ITEM NAME', 'ORDER QTY', 'PRICE', 'AMOUNT'], ['AB-01', '가나', '10', '5', '50'], ['TOTAL', '', '10', '', '50']].map((c) => ({ c })), h: 1, f: 2 };
  const 잔액 = 품번표(['Description of goods', 'ITEM NO', 'QUANTITY', 'PRICE', 'AMOUNT'], [['Gana', 'AB-01', '12', '5', '60'], ['Dara', 'cd_02', '3', '4', '12']]);
  const r = 발주대조(발주, 잔액);
  assert.equal(r.못댐, null);
  assert.ok(r.줄.some((x) => x.kind === '잔액서류만' && x.name === 'cd_02'));
  assert.ok(r.줄.some((x) => x.kind === '수량' && x.from === 10 && x.to === 12));
});

test('ITEM NO — 값이 숫자뿐이면 줄 번호라 코드가 아니다', () => {
  const t = 품번표(['Item No.', 'Description of goods', 'QUANTITY'], [['1', 'AMT-S03-01', '5'], ['2', 'AMT-S03-02', '6'], ['TOTAL', '', '11']], 3);
  assert.deepEqual(벤더피아맞대기(t, 사전하나), { 못댐: '코드 칸 없음' });
  // 베이지아 꼴 — 설명 칸을 코드로 쓰는 길은 그대로입니다. 자기와 맞대 차이 없음.
  assert.equal(발주대조(t, t).못댐, null);
  assert.equal(발주대조(t, t).코드없는줄.발주, 0);
});

test('ITEM NO — CODE# 이 있으면 CODE# 이 이긴다, 칸 차례와 상관없이', () => {
  const t = 품번표(['Item No.', 'CODE#', 'Product model', 'Qty pcs'], [['ZH-31', 'AB-01', '가나 책장', '5']]);
  const m = 벤더피아맞대기(t, 사전하나);
  assert.equal(m.칸.code, 1);
  assert.equal(m.줄.get(1).kind, '맞음');
});

test('ITEM NO — 값이 붙은 글귀·다른 칸 이름은 코드 칸이 아니다', () => {
  for (const 머리칸 of ['ITEM no : ZH-31/32/33', 'ITEM NAME', 'Item', 'No.', 'Item Notes']) {
    const t = 품번표([머리칸, 'QUANTITY'], [['AB-01', '5']]);
    assert.deepEqual(벤더피아맞대기(t, 사전하나), { 못댐: '코드 칸 없음' }, 머리칸);
  }
});
