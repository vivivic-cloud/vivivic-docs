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

/* 연동 범위 — 제헤우드 차수 폴더 + 중국/견적관리 만(사장님 10-30). 드라이브는 가짜, UrlFetch 수를 셉니다. */
import { batchFromPath } from '../js/parse.js';

test('차수폴더인가_ — parse.js batchFromPath 와 같은 답 (제헤우드 실물 폴더 이름)', () => {
  const 이름들 = ['Zh-26-13', 'zh-26-07', 'Zh-26-18차', 'zh-26-25 (1)', '26-22', 'bj-26-05차', 'AMT2026-19',
    '01_발주서', '02_계약서', '08_작업지시서', '견적서류', '분류전', '무제 폴더', '무제 폴더 (3)', '샘플요청서',
    '제품공통정보', '컴플레인-양산중', '검수', '샘플', 'zh_2026_08', '26-085'];
  for (const n of 이름들) assert.equal(gs.차수폴더인가_(n), !!batchFromPath(n + '/x'), n);
  assert.equal(gs.차수폴더인가_('Zh-26-13'), true);
  assert.equal(gs.차수폴더인가_('분류전'), false);
});

function 가짜드라이브(나무) {
  // 나무: { id: [name, parentId, 폴더?, mime?] }
  const 부름 = [];
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), ctx);
  ctx.ScriptApp = { getOAuthToken: () => 't' };
  ctx.findRoot_ = () => ({ getId: () => 'root', getName: () => '중국' });
  ctx.UrlFetchApp = { fetch(url) {
    부름.push(url);
    const q = decodeURIComponent(/[?&]q=([^&]*)/.exec(url)[1]);
    const 부모 = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
    const 폴더만 = q.includes('mimeType = \'application/vnd.google-apps.folder\'');
    const 글속 = /fullText contains/.test(q);
    const files = Object.entries(나무)
      .filter(([, [, p, 폴더]]) => 부모.includes(p) && (!폴더만 || 폴더) && !글속)
      .map(([id, [name, p, 폴더, mime]]) => ({ id, name, parents: [p], modifiedTime: '2026-10-01T00:00:00Z',
        mimeType: 폴더 ? 'application/vnd.google-apps.folder' : (mime || 'application/pdf') }));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ files }) };
  } };
  return { ctx, 부름 };
}

const 나무 = {
  zh: ['제헤우드', 'root', 1], bj: ['베이지아', 'root', 1], q: ['견적관리', 'root', 1], qm: ['견적모음', 'root', 1],
  b1: ['Zh-26-13', 'zh', 1], b2: ['zh-26-25 (1)', 'zh', 1], b3: ['Zh-26-18차', 'zh', 1],
  n1: ['분류전', 'zh', 1], n2: ['01_발주서', 'zh', 1],
  s1: ['검수', 'b1', 1], s2: ['사진', 's1', 1], s3: ['더깊이', 's2', 1],
  f1: ['ZH26-13 CI&PL.xlsx', 'b1'], f2: ['a.jpg', 's1'], f3: ['b.jpg', 's2'], f4: ['너무깊음.jpg', 's3'],
  f5: ['ZH26-25 PO.pdf', 'b2'], f6: ['~$잠금.xlsx', 'b3'], f7: ['분류전 CI.xlsx', 'n1'], f8: ['발주.pdf', 'n2'],
  f9: ['zh 바로밑.pdf', 'zh'], fb: ['bj-26-05 CI.xlsx', 'bj'],
  qf1: ['웨이팡견적비교표.xlsx', 'q', 0, 'application/vnd.ms-excel'], qs: ['웨이팡', 'q', 1],
  qf2: ['테이블 견적20261003.xls', 'qs', 0, 'application/vnd.ms-excel'], qf3: ['메모.txt', 'qs', 0, 'text/plain'],
  qf4: ['그림.png', 'qs', 0, 'image/png'], qmf: ['견적 모음.xlsx', 'qm', 0, 'application/vnd.ms-excel'],
};

test('walk_ — 제헤우드 차수 폴더만, 층마다 한 번에 묻는다', () => {
  const { ctx, 부름 } = 가짜드라이브(나무);
  const out = [];
  ctx.walk_('root', '중국', '', 0, out);
  assert.deepEqual(out.map((f) => f.path).sort(), [
    '제헤우드/Zh-26-13/ZH26-13 CI&PL.xlsx', '제헤우드/Zh-26-13/검수/a.jpg', '제헤우드/Zh-26-13/검수/사진/b.jpg',
    '제헤우드/zh-26-25 (1)/ZH26-25 PO.pdf']);
  assert.ok(out.every((f) => f.vendor === '제헤우드'));
  // 중국 1 · 제헤우드 1 · 차수 층 1 · 검수 층 1 · 사진 층 1 — 베이지아·분류전·01_발주서 는 안 묻는다
  assert.equal(부름.length, 5);
  assert.ok(!부름.some((u) => /'(bj|n1|n2|q|qm|s3)'/.test(decodeURIComponent(u))));
});

test('listMany_ — 폴더가 많으면 주소가 2KB 를 안 넘게 끊는다', () => {
  const 많은 = Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['1AbCdEfGhIjKlMnOpQrStUvWxYz' + i, ['x' + i, 'root', 1]]));
  const { ctx, 부름 } = 가짜드라이브(많은);
  const got = ctx.listMany_(Object.keys(많은), false);
  assert.equal(got.length, 0);
  assert.ok(부름.length >= 2 && 부름.length <= 5, String(부름.length));
  assert.ok(부름.every((u) => u.length < 2000), String(Math.max(...부름.map((u) => u.length))));
});

test('견적목록_ — 중국/견적관리 안(하위 포함)만, 견적모음은 안 본다', () => {
  const { ctx, 부름 } = 가짜드라이브(나무);
  const r = ctx.견적목록_({});
  assert.equal(r.ok, true);
  assert.deepEqual([...r.files.map((f) => f.name)].sort(), ['웨이팡견적비교표.xlsx', '테이블 견적20261003.xls']);
  assert.ok(!부름.some((u) => /'qm'/.test(decodeURIComponent(u))));
});

test('sync — 범위 안에서 없어진 파일만 지우고, 범위 밖 문서는 확인 전까지 남긴다', () => {
  const zh = { ...파일('ZH CI&PL.xlsx'), path: '제헤우드/Zh-26-13/ZH CI&PL.xlsx', vendor: '제헤우드' };
  const existing = {
    '제헤우드~Zh-26-13~ZH CI&PL.xlsx': { ...있던(zh, true), path: zh.path },
    '제헤우드~Zh-26-13~지운것.pdf': { name: '지운것.pdf', path: '제헤우드/Zh-26-13/지운것.pdf', vendor: '제헤우드' },
    '베이지아~bj-26-05~CI.xlsx': { name: 'CI.xlsx', path: '베이지아/bj-26-05/CI.xlsx', vendor: '베이지아' },
    '제헤우드~분류전~a.pdf': { name: 'a.pdf', path: '제헤우드/분류전/a.pdf', vendor: '제헤우드' },
  };
  const { 쓰기 } = 가짜sync({ files: [zh], existing });
  assert.deepEqual(쓰기.flat().map((w) => w.delete && w.delete.split('/').pop()), ['제헤우드~Zh-26-13~지운것.pdf']);
  assert.equal(gs.범위안인가_('제헤우드/zh-26-25 (1)/검수/a.jpg'), true);
  assert.equal(gs.범위안인가_('제헤우드/분류전/a.pdf'), false);
  assert.equal(gs.범위안인가_('천진세라믹/26-03/a.pdf'), false);
});
