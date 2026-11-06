import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 테마색, 색글, 칸서식, 글꼴글, 범위읽기, 칸너비px, 식계산, 모양읽기, 꼬리값, 시트표본 } from '../js/sheet.js';
import { 담을줄 } from '../js/order.js';

/* 가짜 표본 — 라이브러리 없이 모양읽기 를 돌립니다. 이름·값은 지어낸 것입니다. */
const 틀 = () => ({
  시트: '발주', 머리줄: 3, 시작: 4, 끝: 7,
  칸: [
    { 키: 'no', 라벨: 'NO', 역할: 'no', c: 0 },
    { 키: 'code', 라벨: 'CODE', 역할: 'code', c: 1 },
    { 키: 'image', 라벨: 'IMAGE', 역할: 'image', c: 2 },
    { 키: 'hide', 라벨: '숨김', 역할: '', c: 3, 숨김: true },
    { 키: 'qty', 라벨: 'QTY', 역할: 'qty', c: 4 },
    { 키: 'price', 라벨: 'PRICE', 역할: 'price', c: 5 },
    { 키: 'amount', 라벨: 'AMOUNT', 역할: 'amount', c: 6, 식: [4, 5] },
  ],
  머리칸: [
    { 키: 'pono', 라벨: 'PO NO', 값: '', 종류: '번호', r: 1, c: 1 },
    { 키: 'to', 라벨: 'TO', 값: 'ABC', 종류: '', r: 2, c: 0 },
  ],
  합계: [{ 라벨: 'TOTAL', 비율: null, r: 7 }, { 라벨: 'DEPOSIT 30%', 비율: 0.3, r: 8 }],
  아래: [{ 키: '줄9', 글: '1.Terms  은행', r: 9 }],
});
const 시트글 = () => ({
  rows: [
    ['ABC COMPANY', '', '', '', '', '', ''],
    ['PO NO', '', 'x', '', '', '', ''],
    ['TO: ABC', '', '', '', '', '', ''],
    ['NO', 'CODE', 'IMAGE', '숨김', 'QTY', 'PRICE', 'AMOUNT'],
    ['1', 'OLD_01', '', '', '5', '¥10.00', '¥50.00'],
    ['2', 'OLD_02', '', '', '5', '¥20.00', '¥100.00'],
    ['3', 'OLD_03', '', '', '5', '¥30.00', '¥150.00'],
    ['TOTAL', '', '', '', '15', '', '¥300.00'],
    ['DEPOSIT 30%', '', '', '', '', '', '¥90.00'],
    ['1.Terms', '은행', '', '', '', '', ''],
    ['메모', '', '', '', '', '', '', '바깥'],
  ],
  식: { '7,4': 'SUM(E5:E7)', '7,6': 'SUM(G5:G7)', '8,6': 'G8*0.3' },
});
const 표본 = (덧 = {}) => ({
  서식있음: true, 테마: 테마색(''), 배율: 0.55, 인쇄범위: 범위읽기('A1:G10'),
  합침: [범위읽기('A1:G1'), 범위읽기('A2:B2'), 범위읽기('C5:C6')],
  칸수: 8, 줄수: 11,
  칸너비: (c) => (c === 3 ? 0 : 80),
  줄높이: (r) => (r === 5 ? 0 : 30 + r),
  칸: (r, c) => ({ style: { border: r === 3 ? { bottom: { style: 'medium' } } : {}, font: { bold: r === 0, size: 11 } }, 숫자: false, 런: null }),
  그림들: () => [
    { id: '1', 꼴: 'png', 바이트: [1], tl: { r: 4, c: 2, x: 1, y: 2 }, br: { r: 4, c: 3, x: 0, y: 20 } },
    { id: '2', 꼴: 'png', 바이트: [2], tl: { r: 9, c: 5, x: 3, y: 0 }, br: { r: 9, c: 6, x: 0, y: 25 } },
  ],
  ...덧,
});
const 줄 = (code, qty, price) => ({ ...담을줄({ 열쇠: code.toLowerCase(), code, price, 칸: {} }), qty });

test('테마색 — xml 에서 뽑고, 없으면 기본', () => {
  assert.equal(테마색('')[1], '000000');
  assert.equal(테마색('<a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1>')[1], '111111');
});

test('색글 — argb·테마+밝기·번호표·자동', () => {
  assert.equal(색글({ argb: 'FF00B0F0' }), '#00B0F0');
  assert.equal(색글({ theme: 0, tint: -0.5 }), '#808080');
  assert.equal(색글({ indexed: 2 }), '#FF0000');
  assert.equal(색글({ indexed: 64 }), '');
  assert.equal(색글(null), '');
});

test('칸서식 — 글꼴·칠·맞춤·줄바꿈·선', () => {
  const css = 칸서식({
    font: { name: 'Arial', size: 12, bold: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  }, { top: { style: 'thick' }, left: { style: 'double' } }, undefined);
  for (const 글 of ['font-size:12pt', 'font-weight:700', 'background-color:#EEEEEE', 'text-align:center', 'vertical-align:middle', 'white-space:pre-wrap', 'border-top:3px solid #000', 'border-left:3px double #000']) assert.ok(css.includes(글), 글);
  assert.ok(칸서식({}, {}, undefined, true).includes('text-align:right'));
  assert.ok(칸서식({}, {}, undefined).includes('vertical-align:bottom'));
});

test('글꼴글 — 따옴표를 못 넣습니다', () => {
  assert.ok(!글꼴글("a';color:red").includes(';color'));
});

test('범위읽기·칸너비', () => {
  assert.deepEqual(범위읽기("'시트'!$A$1:$V$131"), { s: { r: 0, c: 0 }, e: { r: 130, c: 21 } });
  assert.equal(칸너비px(9.140625, 7), 64);
  assert.equal(범위읽기(''), null);
});

test('식계산 — 네 칙·함수, 모르는 꼴은 null', () => {
  const 값 = (a) => ({ K27: 100, K28: 30 }[a] ?? null);
  const 범 = () => [1, 2, 3];
  assert.equal(식계산('K27*0.3', 값, 범), 30);
  assert.equal(식계산('=K27-K28', 값, 범), 70);
  assert.equal(식계산('SUM(I10:I26)', 값, 범), 6);
  assert.equal(식계산('SUBTOTAL(9,Q16:Q126)', 값, 범), 6);
  assert.equal(식계산('ROUND(K27/3,2)', 값, 범), 33.33);
  assert.equal(식계산('VLOOKUP(A1,B1:C2,2)', 값, 범), null);
  assert.equal(식계산('Z9+1', 값, 범), null);
});

test('모양읽기 — 숨긴 칸·줄 빠짐, 합침, 품목 옛 값 안 담음', () => {
  const { 모양 } = 모양읽기(표본(), 틀(), 시트글());
  assert.deepEqual(모양.칸.map((k) => k.c), [0, 1, 2, 4, 5, 6]);
  assert.equal(모양.배율, 0.55);
  assert.equal(모양.줄[0].칸[0].cs, 6);          // 숨긴 칸을 뺀 넓이
  assert.equal(모양.틀줄.length, 2);             // 숨긴 줄 하나 빠짐
  assert.ok(!JSON.stringify(모양).includes('¥10.00'));
  assert.ok(모양.틀줄.every((x) => x.칸.every((k) => !k.t && !k.rs)));   // 세로 합침을 풂
  assert.equal(모양.끼움, 4);
  assert.ok(!JSON.stringify(모양).includes('바깥'));
});

test('모양읽기 — 머리칸 값 자리·이름표 든 칸', () => {
  const { 모양 } = 모양읽기(표본(), 틀(), 시트글());
  const 칸 = (r, c) => 모양.줄.find((x) => x.r === r).칸.find((k) => k.c === c);
  assert.equal(칸(1, 2).k, 'pono');              // 이름표 합침(A:B) 다음 칸
  assert.equal(칸(2, 0).k, 'to');
  assert.equal(칸(2, 0).앞, 'TO: ');
  assert.equal(칸(9, 0).a, 1);
  assert.equal(칸(7, 6).a, undefined);
});

test('모양읽기 — 그림은 품목 줄이면 코드 몫, 아니면 칸에', () => {
  const { 모양, 그림재료 } = 모양읽기(표본(), 틀(), 시트글());
  assert.equal(그림재료.length, 2);
  assert.equal(모양.품목그림.old_01?.id ?? 모양.품목그림.OLD_01?.id, '1');
  assert.equal(모양.줄.find((x) => x.r === 9).칸.find((k) => k.c === 5).g[0].x, 3);
});

test('모양읽기 — 표를 안 품는 인쇄 범위는 안 믿습니다', () => {
  const { 모양 } = 모양읽기(표본({ 인쇄범위: 범위읽기('A8:G8') }), 틀(), 시트글());
  assert.equal(모양.줄[0].r, 0);
  assert.ok(모양.줄.some((x) => x.r === 9));
  assert.ok(!모양.칸.some((k) => k.c === 7));     // 표 오른쪽 메모 칸은 그래도 뺍니다
});

test('꼬리값 — 양식의 식대로, 줄이 바뀌면 다시', () => {
  const { 모양 } = 모양읽기(표본(), 틀(), 시트글());
  const 값 = 꼬리값(모양, 틀(), [줄('NEW_01', 2, '¥10.00'), 줄('NEW_02', 3, '¥100.00')]);
  assert.equal(값['7,4'], '5');
  assert.equal(값['7,6'], '¥320.00');
  assert.equal(값['8,6'], '¥96.00');
});

test('꼬리값 — 제품이 없으면 옛 합계를 비웁니다', () => {
  const { 모양 } = 모양읽기(표본(), 틀(), 시트글());
  const 값 = 꼬리값(모양, 틀(), []);
  assert.equal(값['7,6'], '');
  assert.equal(값['8,6'], '');
});

test('꼬리값 — 품목 한 줄을 집은 식은 안 믿고 합계로', () => {
  const 글 = 시트글();
  글.식['7,6'] = 'G5+G7';
  const { 모양 } = 모양읽기(표본(), 틀(), 글);
  assert.equal(꼬리값(모양, 틀(), [줄('NEW_01', 2, '¥10.00')])['7,6'], '¥20.00');
});

test('시트표본 — 서식 없는 파일도 칸·합침·숨김을 잡습니다', () => {
  const X = { utils: { decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 10, c: 6 } }) } };
  const s = { '!ref': 'A1:G11', '!merges': [범위읽기('A1:G1')], '!cols': [{ wpx: 50 }, {}, {}, { hidden: true }], '!rows': [{ hpt: 30 }] };
  const b = 시트표본(s, 시트글(), X);
  assert.equal(b.칸너비(0), 50);
  assert.equal(b.칸너비(3), 0);
  assert.equal(b.줄높이(0), 40);
  const { 모양 } = 모양읽기(b, 틀(), 시트글());
  assert.equal(모양.서식있음, false);
  assert.equal(모양.줄[0].칸[0].cs, 6);
});
