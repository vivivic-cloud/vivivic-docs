import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { 대조숫자 } from '../js/match.js';

// appsscript/sync.gs 를 그대로 띄웁니다 — 맨 위에서 Apps Script 를 부르지 않아 Node 에서도 뜹니다.
const gs = vm.createContext({});
vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), gs);

test('html글_ — 구글 문서 html 의 「&yen;」 를 ¥ 로 (10-28 발주서 넷 다 이렇게 옴)', () => {
  assert.equal(gs.html글_('<td><p><span>&yen;113.00</span></p></td>'), '¥113.00');
  assert.equal(gs.html글_('&yen;26,670.00'), '¥26,670.00');
});

test('pdfTable_ — 발주서 금액 칸이 ¥ 로 나오고 대조숫자로 읽힌다', () => {
  const html = '<table>' +
    '<tr><td>CODE#</td><td>Product model</td><td>Unit price</td><td>Qty</td><td>Amount</td></tr>' +
    '<tr><td>A1</td><td>edge</td><td>&yen;113.00</td><td>50</td><td>&yen;5,650.00</td></tr>' +
    '<tr><td>TOTAL</td><td></td><td></td><td>50</td><td>&yen;5,650.00</td></tr>' +
    '</table>';
  const t = gs.pdfTable_(html);
  assert.deepEqual([...t.rows[1]], ['A1', 'edge', '¥113.00', '50', '¥5,650.00']);
  assert.equal(대조숫자(t.rows[1][4]), 5650);
});

/* sync — 목록 먼저 쓰고, 서류는 읽는 대로 cipl 칸만 묶어 씁니다(10-30). 드라이브·Firestore 는 가짜. */
function 가짜sync({ files, existing, props = {}, 읽기ms = 0, 시작 = 0 }) {
  const 쓰기 = [];
  const 차례 = [];
  let 지금 = 시작;
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), ctx);
  ctx.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [지금])); } };
  ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = v; },
    deleteProperty: (k) => { delete props[k]; },
  }) };
  ctx.Utilities = { formatDate: () => '' };
  ctx.findRoot_ = () => ({ getId: () => 'r', getName: () => '중국' });
  ctx.walk_ = (a, b, c, d, out) => files.forEach((f) => out.push(f));
  ctx.fingerprint_ = () => 'M';
  ctx.listExisting_ = () => existing;
  ctx.commit_ = (w) => { if (!w.length) return; 쓰기.push(w); 차례.push('commit'); };   // 진짜도 빈 것은 안 보냄
  ctx.pdfText_ = () => { 지금 += 읽기ms; 차례.push('read'); return { text: '', html: '' }; };
  ctx.ciplOf_ = () => { 지금 += 읽기ms; 차례.push('read'); return { cartons: 1, sheets: [] }; };
  ctx.보링훑기_ = () => {};
  ctx.sync();
  return { 쓰기, 차례, props };
}
const 파일 = (name, md5 = 'a') => ({ name, path: 'V/' + name, vendor: 'V', size: 1, mtime: 1, ctime: 1, driveId: 'd' + name, md5 });
const 있던 = (f, cipl) => ({ name: f.name, vendor: f.vendor, size: '1', mtime: '1', ctime: '1', md5: f.md5, driveId: f.driveId, hasCipl: !!cipl, readV: cipl ? 14 : 0 });

test('sync — 새 서류는 기본 칸이 먼저 커밋되고, 읽은 뒤 cipl 칸만 따로 쓴다', () => {
  const ci = 파일('제헤우드 26-1 CI&PL.xlsx'), 사진 = 파일('상차1.jpg');
  const { 쓰기, 차례, props } = 가짜sync({ files: [ci, 사진], existing: {} });
  assert.deepEqual(차례, ['commit', 'read', 'commit']);
  assert.equal(쓰기[0].length, 2);
  assert.ok(쓰기[0].every((w) => !w.update.fields.cipl && !w.updateMask.fieldPaths.includes('cipl')));
  assert.deepEqual([...쓰기[1][0].updateMask.fieldPaths], ['cipl']);
  assert.equal(props.mark, 'M');
  assert.equal(props.retryCipl, undefined);
});

test('sync — 내용이 바뀐 서류는 예전 cipl 을 지우고, 바뀌지 않은 다시 읽기는 기본 칸을 안 쓴다', () => {
  const 바뀜 = 파일('a CI&PL.xlsx', 'new'), 그대로 = 파일('b CI&PL.xlsx');
  const existing = {
    'V~a CI&PL.xlsx': { ...있던(바뀜, true), md5: 'old' },
    'V~b CI&PL.xlsx': { ...있던(그대로, true), readV: 13 },
  };
  const { 쓰기 } = 가짜sync({ files: [바뀜, 그대로], existing });
  assert.equal(쓰기[0].length, 1);
  assert.ok(쓰기[0][0].updateMask.fieldPaths.includes('cipl'));
  assert.equal(쓰기[0][0].update.fields.cipl, undefined);
  assert.equal(쓰기[1].length, 2);
  assert.ok(쓰기[1].every((w) => w.updateMask.fieldPaths.length === 1));
});

test('sync — 5건씩 묶어 쓰고, 4분 넘으면 미루고 retryCipl 을 남긴다', () => {
  const files = Array.from({ length: 12 }, (_, i) => 파일('x' + i + ' CI&PL.xlsx'));
  const existing = Object.fromEntries(files.map((f) => ['V~' + f.name, 있던(f, false)]));
  // 하나 읽는 데 30초 → 20초마다 쓰기, 0·30…240초에 9건 읽고 3건 미룸
  const { 쓰기, props } = 가짜sync({ files, existing, 읽기ms: 30000 });
  assert.equal(쓰기.flat().length, 9);
  assert.ok(쓰기.length >= 5);
  assert.equal(props.retryCipl, '1');
  const 빠른 = 가짜sync({ files, existing, 읽기ms: 1000 });
  assert.deepEqual(빠른.쓰기.map((w) => w.length), [5, 5, 2]);
  assert.equal(빠른.props.retryCipl, undefined);
});

test('sync — 지문이 같아도 retryCipl 이 있으면 끝내지 않고 이어 읽는다', () => {
  const f = 파일('x CI&PL.xlsx');
  const { 쓰기 } = 가짜sync({ files: [f], existing: { 'V~x CI&PL.xlsx': 있던(f, false) }, props: { mark: 'M', retryCipl: '1' } });
  assert.equal(쓰기.flat().length, 1);
  const 끝 = 가짜sync({ files: [f], existing: { 'V~x CI&PL.xlsx': 있던(f, true) }, props: { mark: 'M' } });
  assert.equal(끝.쓰기.length, 0);
});
