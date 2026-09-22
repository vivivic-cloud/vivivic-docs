import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 맞춰보기, 맞춤판정, itemRows } from '../js/match.js';

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
