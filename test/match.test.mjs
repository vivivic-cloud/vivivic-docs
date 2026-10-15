import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 맞춰보기, 맞춤판정, itemRows, 제품차이, 벤더피아사전, 적합성, 맞댈자 } from '../js/match.js';
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
