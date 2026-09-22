import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressWord } from '../js/progress.js';

/** 차수 하나를 흉내 냅니다 — 서류가 든 단계 열쇠만 넘깁니다. */
const 차수 = (...열쇠들) => ({
  stages: ['order', 'pi', 'piReceipt', 'loading', 'cipl', 'balReceipt', 'bl']
    .map((key) => ({ key, docs: 열쇠들.includes(key) ? [{}] : [] })),
});

test('progressWord — 넷 가운데 하나도 없으면 아무 말도 안 적는다', () => {
  assert.equal(progressWord(차수()), '');
  // PI 나 상차이미지만 있는 차수도 넷에 안 드니 빈 글자입니다.
  assert.equal(progressWord(차수('pi')), '');
  assert.equal(progressWord(차수('loading')), '');
  assert.equal(progressWord(차수('pi', 'loading')), '');
});

test('progressWord — 발주서만 있으면 발주시작', () => {
  assert.equal(progressWord(차수('order')), '발주시작');
  assert.equal(progressWord(차수('order', 'pi')), '발주시작');
});

test('progressWord — 계약금영수증까지 오면 생산중', () => {
  assert.equal(progressWord(차수('order', 'pi', 'piReceipt')), '생산중');
  assert.equal(progressWord(차수('order', 'piReceipt', 'loading')), '생산중');
});

test('progressWord — 잔액서류까지 오면 상차완료', () => {
  assert.equal(progressWord(차수('order', 'pi', 'piReceipt', 'loading', 'cipl')), '상차완료');
});

test('progressWord — 잔액영수증까지 오면 거래완료', () => {
  assert.equal(
    progressWord(차수('order', 'pi', 'piReceipt', 'loading', 'cipl', 'balReceipt')),
    '거래완료',
  );
});

test('progressWord — 건너뛰어도 가장 멀리 간 것으로 적는다', () => {
  // 계약금영수증이 없는데 잔액영수증이 있으면 거래완료입니다.
  assert.equal(progressWord(차수('order', 'balReceipt')), '거래완료');
  // 발주서가 없어도 잔액서류가 있으면 상차완료입니다.
  assert.equal(progressWord(차수('cipl')), '상차완료');
});

test('progressWord — 선하증권은 넷에 없다. 거래완료 뒤에 와도 글자는 그대로', () => {
  assert.equal(progressWord(차수('order', 'cipl', 'balReceipt', 'bl')), '거래완료');
  // 선하증권만 있으면 넷 가운데 하나도 없는 것입니다.
  assert.equal(progressWord(차수('bl')), '');
});

test('progressWord — 차수가 이상해도 멈추지 않는다', () => {
  assert.equal(progressWord(null), '');
  assert.equal(progressWord({}), '');
  assert.equal(progressWord({ stages: [] }), '');
});
