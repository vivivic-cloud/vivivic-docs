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

test('pdfTable_ — 위아래로 합친 ZH#·상품명·크기·단가를 아래 줄에도 (zh-26-27 myT_4B, 11-02)', () => {
  // 실물 꼴: 4C·4B 가 ZH_02·이름·크기·단가를 합쳐 쓰고, 수량·금액은 줄마다. 금액을 합쳐 쓴 경우도 넣음.
  const html = '<table>' +
    '<tr><td>ZH#</td><td>Product model</td><td>Size</td><td>code#</td><td>ORDER QTY</td><td>PRICE</td><td>AMOUNT</td></tr>' +
    '<tr><td>ZH_01</td><td>토리 3단</td><td>826*260*800</td><td>myT_3C</td><td>50</td><td>&yen;113.00</td><td>5,650</td></tr>' +
    '<tr><td rowspan="2">ZH_02</td><td rowspan="2">토리 4단</td><td rowspan="2">826*260*1125</td><td>myT_4C</td><td>20</td><td rowspan="2">&yen;146.00</td><td rowspan="2">4,380</td></tr>' +
    '<tr><td>myT_4B</td><td>10</td></tr>' +
    '<tr><td>ZH_03</td><td>토리 낮은 3단</td><td>826*260*550</td><td>myT_L3C</td><td>100</td><td>&yen;111.00</td><td>11,100</td></tr>' +
    '<tr><td colspan="4">TOTAL</td><td>180</td><td></td><td>21,130</td></tr>' +
    '</table>';
  const t = gs.pdfTable_(html);
  assert.deepEqual([...t.rows[3]], ['ZH_02', '토리 4단', '826*260*1125', 'myT_4B', '10', '¥146.00', '']);
  assert.deepEqual([...t.rows[2]], ['ZH_02', '토리 4단', '826*260*1125', 'myT_4C', '20', '¥146.00', '4,380']);
  assert.equal(t.f, 5); // 합계줄 자리 그대로
  // 견적서 쪽 html표들_ 격자는 그대로 빈 칸
  assert.equal(gs.html표들_(html)[0][3][0], '');
});

test('원본표_ — 엑셀 CI 의 Product model 병합을 아래 줄에도, 수량·번호는 안 채움 (Zh-26-20, 11-02)', () => {
  const shown = [
    ['NO.', 'CODE#', 'Product model', 'Qty pcs', 'FOB', 'Amount'],
    ['1', 'myT▁L3C', 'Tori mytoy Low 3s', '450', '111', '49950'],
    ['', 'myT▁L3B', '', '20', '111', '2220'],
    ['', 'TOTAL', '', '470', '', '52170'],
  ];
  const 칸 = (r, c, n, m = 1) => ({ getRow: () => r, getColumn: () => c, getNumRows: () => n, getNumColumns: () => m });
  const sh = {
    getName: () => 'CI',
    getDataRange: () => ({ getDisplayValues: () => shown.map((r) => r.slice()), getMergedRanges: () => [칸(2, 1, 2), 칸(2, 3, 2)] }),
  };
  const t = gs.원본표_(shown, sh);
  assert.deepEqual([...t.rows[2]], ['', 'myT▁L3B', 'Tori mytoy Low 3s', '20', '111', '2220']);
  assert.equal(t.f, 3);
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
  ctx.밖지우기_ = () => { 차례.push('밖'); return '밖 지움 0'; };
  ctx.sync();
  return { 쓰기, 차례, props };
}
const 파일 = (name, md5 = 'a') => ({ name, path: 'V/' + name, vendor: 'V', size: 1, mtime: 1, ctime: 1, driveId: 'd' + name, md5 });
const 있던 = (f, cipl) => ({ name: f.name, vendor: f.vendor, size: '1', mtime: '1', ctime: '1', md5: f.md5, driveId: f.driveId, hasCipl: !!cipl, readV: cipl ? vm.runInContext('READ_VERSION', gs) : 0 });

test('sync — 새 서류는 기본 칸이 먼저 커밋되고, 읽은 뒤 cipl 칸만 따로 쓴다', () => {
  const ci = 파일('제헤우드 26-1 CI&PL.xlsx'), 사진 = 파일('상차1.jpg');
  const { 쓰기, 차례, props } = 가짜sync({ files: [ci, 사진], existing: {}, props: { dropDone: '1030' } });
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
  zh: ['제헤우드', 'root', 1], hp: ['해피코', 'root', 1], bj: ['베이지아', 'root', 1], q: ['견적관리', 'root', 1], qm: ['견적모음', 'root', 1],
  b1: ['Zh-26-13', 'zh', 1], b2: ['zh-26-25 (1)', 'zh', 1], b3: ['Zh-26-18차', 'zh', 1],
  n1: ['분류전', 'zh', 1], n2: ['01_발주서', 'zh', 1],
  s1: ['검수', 'b1', 1], s2: ['사진', 's1', 1], s3: ['더깊이', 's2', 1],
  f1: ['ZH26-13 CI&PL.xlsx', 'b1'], f2: ['a.jpg', 's1'], f3: ['b.jpg', 's2'], f4: ['너무깊음.jpg', 's3'],
  f5: ['ZH26-25 PO.pdf', 'b2'], f6: ['~$잠금.xlsx', 'b3'], f7: ['분류전 CI.xlsx', 'n1'], f8: ['발주.pdf', 'n2'],
  f9: ['zh 바로밑.pdf', 'zh'], fb: ['bj-26-05 CI.xlsx', 'bj'],
  h1: ['Hp-26-01', 'hp', 1], h2: ['분류전', 'hp', 1],
  hf1: ['HPC-26-1차 _20260106.pdf', 'h1'], hf2: ['HPC-26-13차~16차 수정_20260513.pdf', 'h2'], hf3: ['해피코 바로밑.pdf', 'hp'],
  qf1: ['웨이팡견적비교표.xlsx', 'q', 0, 'application/vnd.ms-excel'], qs: ['웨이팡', 'q', 1],
  qf2: ['테이블 견적20261003.xls', 'qs', 0, 'application/vnd.ms-excel'], qf3: ['메모.txt', 'qs', 0, 'text/plain'],
  qf4: ['그림.png', 'qs', 0, 'image/png'], qmf: ['견적 모음.xlsx', 'qm', 0, 'application/vnd.ms-excel'],
};

test('walk_ — 제헤우드·해피코 차수 폴더만, 층마다 한 번에 묻는다', () => {
  const { ctx, 부름 } = 가짜드라이브(나무);
  const out = [];
  ctx.walk_('root', '중국', '', 0, out);
  assert.deepEqual(out.map((f) => f.path).sort(), [
    '제헤우드/Zh-26-13/ZH26-13 CI&PL.xlsx', '제헤우드/Zh-26-13/검수/a.jpg', '제헤우드/Zh-26-13/검수/사진/b.jpg',
    '제헤우드/zh-26-25 (1)/ZH26-25 PO.pdf', '해피코/Hp-26-01/HPC-26-1차 _20260106.pdf']);
  for (const f of out) assert.equal(f.vendor, f.path.split('/')[0]);
  // 중국 1 · 거래처 둘 자식 1 · 차수 층 1 · 검수 층 1 · 사진 층 1 — 베이지아·분류전·01_발주서 는 안 묻는다
  assert.equal(부름.length, 5);
  assert.ok(!부름.some((u) => /'(bj|n1|n2|h2|q|qm|s3)'/.test(decodeURIComponent(u))));
});

test('isOrderPdf_ — 해피코 발주서 PDF 를 읽는다(parse.js classify 와 같게)', () => {
  assert.equal(gs.isOrderPdf_('HPC-26-10차 _20260325.pdf'), true);
  assert.equal(gs.isOrderPdf_('HPC-26-10차 _20260325.xlsx'), false);
  assert.equal(gs.isOrderPdf_('TalkFile_AMT(ZH)26-27 Ordersheet_2026.10.13.pdf.pdf'), true);
  assert.equal(gs.범위안인가_('해피코/Hp-26-01/a.pdf'), true);
  assert.equal(gs.범위안인가_('해피코/분류전/a.pdf'), false);
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

test('sync — 세 폴더 밖 docs_files 는 지우고, 제헤우드·해피코 안 차수 밖은 남긴다(10-30)', () => {
  const zh = { ...파일('ZH CI&PL.xlsx'), path: '제헤우드/Zh-26-13/ZH CI&PL.xlsx', vendor: '제헤우드' };
  const existing = {
    '제헤우드~Zh-26-13~ZH CI&PL.xlsx': { ...있던(zh, true), path: zh.path },
    '제헤우드~Zh-26-13~지운것.pdf': { name: '지운것.pdf', path: '제헤우드/Zh-26-13/지운것.pdf', vendor: '제헤우드' },
    '베이지아~bj-26-05~CI.xlsx': { name: 'CI.xlsx', path: '베이지아/bj-26-05/CI.xlsx', vendor: '베이지아' },
    '제헤우드~분류전~a.pdf': { name: 'a.pdf', path: '제헤우드/분류전/a.pdf', vendor: '제헤우드' },
  };
  existing['해피코~분류전~b.pdf'] = { name: 'b.pdf', path: '해피코/분류전/b.pdf', vendor: '해피코' };
  existing['견적관리~q.xlsx'] = { name: 'q.xlsx', path: '견적관리/q.xlsx', vendor: '견적관리' };
  existing['(루트)~r.pdf'] = { name: 'r.pdf', path: 'r.pdf', vendor: '(루트)' };
  const { 쓰기, 차례, props } = 가짜sync({ files: [zh], existing });
  assert.deepEqual(쓰기.flat().map((w) => w.delete && w.delete.split('/').pop()).sort(),
    ['(루트)~r.pdf', '베이지아~bj-26-05~CI.xlsx', '제헤우드~Zh-26-13~지운것.pdf']);
  assert.equal(차례[0], '밖');
  assert.equal(props.dropDone, '1030');
  // 두 번째부터는 다른 컬렉션 지우기를 안 부릅니다
  assert.ok(!가짜sync({ files: [zh], existing: {}, props: { dropDone: '1030' } }).차례.includes('밖'));
  assert.equal(gs.범위안인가_('제헤우드/zh-26-25 (1)/검수/a.jpg'), true);
  assert.equal(gs.범위안인가_('제헤우드/분류전/a.pdf'), false);
  assert.equal(gs.범위안인가_('천진세라믹/26-03/a.pdf'), false);
});

test('밖지우기_ — 다른 거래처 overlay·rules·단품수량·boxes·quotes 를 백업한 뒤 지운다', () => {
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), ctx);
  ctx.ScriptApp = { getOAuthToken: () => 't' };
  const S = (v) => ({ stringValue: v });
  const 문서 = (c, id, f) => ({ name: 'projects/p/databases/(default)/documents/artifacts/vivivic-4b7ef/public/data/' + c + '/' + id, fields: f });
  const 창고 = {
    docs_overlay: [문서('docs_overlay', 'a', { batchId: S('베이지아::26-05') }), 문서('docs_overlay', 'b', { batchId: S('제헤우드::26-13') }),
      문서('docs_overlay', 'c', { batchId: S('해피코::26-01') })],
    docs_rules: [문서('docs_rules', 'r1', { vendor: S('베이지아'), matchType: S('contains'), match: S('BJ') }),
      문서('docs_rules', 'r2', { matchType: S('path'), match: S('천진세라믹/26-03/a.pdf') }),
      문서('docs_rules', 'r3', { matchType: S('path'), match: S('제헤우드/분류전/a.pdf') }),
      문서('docs_rules', 'r4', { matchType: S('contains'), match: S('영수증') })],
    docs_단품수량: [문서('docs_단품수량', '베이지아~A1', { vendor: S('베이지아') }), 문서('docs_단품수량', '제헤우드~Z1', { vendor: S('제헤우드') })],
    docs_quotes: [문서('docs_quotes', 'qin', { driveId: S('qin') }), 문서('docs_quotes', 'qout', { driveId: S('qout') })],
  };
  const 박스 = { list: { arrayValue: { values: [{ mapValue: { fields: { vendor: S('베이지아'), name: S('x') } } },
    { mapValue: { fields: { vendor: S('제헤우드'), name: S('y') } } }] } } };
  const 보냄 = [];
  ctx.UrlFetchApp = { fetch(url, o) {
    const ok = (b) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(b) });
    if (url.endsWith(':commit')) { 보냄.push(JSON.parse(o.payload).writes); return ok({}); }
    if (url.includes('googleapis.com/drive')) {
      const q = decodeURIComponent(/[?&]q=([^&]*)/.exec(url)[1]);
      if (q.includes("'root' in parents")) return ok({ files: [{ id: 'qd', name: '견적관리', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }] });
      if (q.includes("'qd' in parents")) return ok({ files: [{ id: 'qin', name: 'a 견적.xlsx', mimeType: 'x', parents: ['qd'] }] });
      return ok({ files: [] });
    }
    if (url.includes('/docs_config/boxes')) return ok({ fields: 박스 });
    const c = Object.keys(창고).find((k) => url.includes('/' + encodeURIComponent(k) + '?'));
    return ok({ documents: 창고[c] });
  } };
  const 글 = ctx.밖지우기_({ getId: () => 'root' });
  assert.equal(글, '밖 지움 overlay 1 · rules 2 · 단품수량 1 · boxes 1 · quotes 1');
  const 백업 = 보냄.slice(0, -1).flat();
  assert.deepEqual(백업.map((w) => w.update.name.split('/').pop()).sort(), ['1030-boxes-0', '1030-overlay-0', '1030-rules-0', '1030-단품수량-0']);
  const 끝 = 보냄.at(-1);
  assert.deepEqual(끝.filter((w) => w.delete).map((w) => w.delete.split('/').pop()).sort(), ['a', 'qout', 'r1', 'r2', '베이지아~A1']);
  const 박스쓰기 = 끝.find((w) => w.update);
  assert.deepEqual(박스쓰기.update.fields.list.arrayValue.values.map((x) => x.mapValue.fields.vendor.stringValue), ['제헤우드']);
});

/* 차수 서랍 올리기(11-01) — DriveApp·Firestore 는 가짜. */
function 가짜서랍({ props = { shareAllow: 'a@b.c', fbKey: 'k' } } = {}) {
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), ctx);
  let n = 0;
  const 쓰기 = [];
  const 불림 = { 표확인: 0 };
  const 모두 = {};
  class 폴더 {
    constructor(name, parent) { this.id = 'F' + (++n) + 'xxxxxxxxxx'; this.name = name; this.parent = parent; this.kids = []; this.files = []; 모두[this.id] = this; if (parent) parent.kids.push(this); }
    getId() { return this.id; } getName() { return this.name; }
    getFolders() { const a = [...this.kids]; return { hasNext: () => a.length > 0, next: () => a.shift() }; }
    getFiles() { const a = [...this.files]; return { hasNext: () => a.length > 0, next: () => a.shift() }; }
    getParents() { const a = this.parent ? [this.parent] : []; return { hasNext: () => a.length > 0, next: () => a.shift() }; }
    createFolder(name) { return new 폴더(name, this); }
    createFile(blob) { return new 파일(blob.name, this); }
  }
  class 파일 {
    constructor(name, parent) { this.id = 'D' + (++n) + 'xxxxxxxxxx'; this.name = name; this.parent = parent; parent.files.push(this); 모두[this.id] = this; }
    getId() { return this.id; } getName() { return this.name; } setName(v) { this.name = v; }
    getMimeType() { return 'application/pdf'; } isTrashed() { return false; } getSize() { return 3; } getLastUpdated() { return new Date(0); }
    getParents() { const a = [this.parent]; return { hasNext: () => a.length > 0, next: () => a.shift() }; }
    moveTo(f) { this.parent.files = this.parent.files.filter((x) => x !== this); this.parent = f; f.files.push(this); }
  }
  const 중국 = new 폴더('중국');
  const 제헤 = new 폴더('제헤우드', 중국);
  const 차 = new 폴더('Zh-26-29', 제헤);
  const 다른차 = new 폴더('Zh-26-01', 제헤);
  const 분류전 = new 폴더('분류전', 제헤);
  new 폴더('베이지아', 중국);
  new 파일('견적.pdf', 차);
  ctx.findRoot_ = () => 중국;
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) };
  ctx.표확인_ = () => { 불림.표확인++; return 'a@b.c'; };
  ctx.Utilities = { base64Decode: (s) => Buffer.from(s, 'base64'), newBlob: (b, m, name) => ({ name }), getUuid: () => 'u' + (++n) };
  ctx.DriveApp = { getFileById: (id) => 모두[id] };
  ctx.드라이브_ = (p) => { const f = 모두[p.split('/')[1].split('?')[0]]; return { id: f.id, name: f.name, size: '3', md5Checksum: 'm', modifiedTime: '2026-11-01T00:00:00Z', createdTime: '2026-11-01T00:00:00Z', mimeType: 'application/pdf' }; };
  ctx.commit_ = (w) => 쓰기.push(...w);
  ctx.orderCipl_ = () => ({ mapValue: { fields: {} } });
  ctx.ciplValue_ = () => ({ mapValue: { fields: {} } });
  return { ctx, 쓰기, 불림, 차 };
}

test('서랍 — 자물쇠: shareAllow·fbKey 가 비면 꺼짐, 확인은 로그인 확인 없이', () => {
  const 꺼짐 = 가짜서랍({ props: { shareAllow: 'a@b.c' } });
  assert.equal(꺼짐.ctx.서랍_({ 일: '올리기' }).why, 'off');
  const 켜짐 = 가짜서랍();
  assert.equal(켜짐.ctx.서랍_({ 일: '서랍확인' }).ok, true);
  assert.equal(켜짐.불림.표확인, 0);
  assert.equal(켜짐.ctx.서랍_({ 일: '올리기', b64: 'x'.repeat(41 * 1024 * 1024) }).why, 'big');
  assert.equal(켜짐.불림.표확인, 0);
});

test('서랍 — 범위: 거래처 차수 폴더만, 검수·샘플 밖 하위는 안 됨', () => {
  const { ctx } = 가짜서랍();
  assert.equal(ctx.차수곳_('제헤우드/분류전', ''), null);
  assert.equal(ctx.차수곳_('베이지아/26-01', ''), null);
  assert.equal(ctx.차수곳_('제헤우드/Zh-26-29/x', ''), null);
  assert.equal(ctx.차수곳_('제헤우드/Zh-26-29', '기타'), null);
  assert.equal(ctx.차수곳_('제헤우드/Zh-26-29', '검수').path, '제헤우드/Zh-26-29/검수');   // 없으면 만듦
});

test('서랍 — 올리기: 같은 이름은 (2), docs_files 기본 칸 + 기록을 한 번에', () => {
  const { ctx, 쓰기, 차 } = 가짜서랍();
  const r = ctx.서랍_({ 일: '올리기', path: '제헤우드/Zh-26-29', sub: '', name: '견적.pdf', b64: 'YWJj', idToken: 't' });
  assert.equal(r.ok, true);
  assert.equal(r.path, '제헤우드/Zh-26-29/견적 (2).pdf');
  assert.equal(차.files.length, 2);
  assert.equal(쓰기[0].update.name.endsWith('docs_files/제헤우드~Zh-26-29~견적 (2).pdf'), true);
  assert.equal(쓰기[0].update.fields.md5.stringValue, 'm');
  assert.ok(쓰기[1].update.name.includes('docs_moves/'));
  assert.equal(쓰기[1].update.fields['일'].stringValue, '올림');
});

test('차수표_ — parse.js batchFromPath 의 label 과 같다', () => {
  for (const n of ['Zh-26-13', 'zh-26-07', 'Zh-26-18차', 'zh-26-25 (1)', 'Hp-26-29', 'zh_2026_08', '분류전', '26-085', 'Zh-26-61'])
    assert.equal(gs.차수표_(n), batchFromPath(n + '/x')?.label ?? null, n);
});

test('발주하기 — 자물쇠, 목록(빈 폴더 포함), 같은 차수는 안 만듦, 만들면 폴더 + overlay folder 칸', () => {
  const 꺼짐 = 가짜서랍({ props: { fbKey: 'k' } });
  assert.equal(꺼짐.ctx.발주하기_({ 일: '차수목록', vendor: '제헤우드' }).why, 'off');
  assert.equal(꺼짐.불림.표확인, 0);
  const { ctx, 쓰기, 차 } = 가짜서랍();
  assert.equal(ctx.발주하기_({ 일: '차수목록', vendor: '베이지아' }).why, 'out');
  assert.deepEqual([...ctx.발주하기_({ 일: '차수목록', vendor: '제헤우드' }).names], ['Zh-26-29', 'Zh-26-01']);
  assert.equal(ctx.발주하기_({ 일: '차수만들기', vendor: '제헤우드', name: '분류전2' }).why, 'bad');
  const 겹 = ctx.발주하기_({ 일: '차수만들기', vendor: '제헤우드', name: 'zh-26-29차' });
  assert.equal(겹.why, 'dup');
  assert.equal(겹.name, 'Zh-26-29');
  assert.equal(쓰기.length, 0);
  const r = ctx.발주하기_({ 일: '차수만들기', vendor: '제헤우드', name: 'Zh-26-30', idToken: 't' });
  assert.equal(r.ok, true);
  assert.equal(r.batchId, '제헤우드::26-30');
  assert.equal(r.folder, '제헤우드/Zh-26-30');
  assert.ok(차.parent.kids.some((k) => k.name === 'Zh-26-30'));
  assert.ok(쓰기[0].update.name.endsWith('docs_overlay/제헤우드::26-30'));
  assert.deepEqual([...쓰기[0].updateMask.fieldPaths].sort(), ['batchId', 'folder', 'folderId', 'madeAt', 'madeBy']);
  assert.equal(쓰기[0].update.fields.folder.stringValue, '제헤우드/Zh-26-30');
  assert.equal(쓰기[1].update.fields['일'].stringValue, '차수만듦');
  // 만든 뒤에는 목록에 있고 다시 못 만듦
  assert.equal(ctx.발주하기_({ 일: '차수만들기', vendor: '제헤우드', name: 'Zh-26-30' }).why, 'dup');
  // 서랍 「올리기」 가 그 폴더를 곧장 찾는다
  assert.equal(ctx.차수곳_('제헤우드/Zh-26-30', '').path, '제헤우드/Zh-26-30');
});

test('임시발주표_ — 머리줄 찾기, 세로 합친 PO번호 채움, 코드 끝 빈칸 뗌, 필터 상관없이 내자·외자 다', () => {
  const 머리 = ['PO번호', '구매발주명', '내자/외자 구분', '구매사명', '입고창고', '발주일', '입고일', '단품코드', '단품명', '옵션', '발주수량', '입고수량', '단가', '금액', '배송사', '송장번호', '송장등록', '입고여부'];
  const 줄 = (po, 명, 구분, 사명, 코드) => [po, 명, 구분, 사명, '0.본사', '2026-10-28', '', 코드, 코드 ? '이름' : '', '', '2', '', '1,000', '2,000', '', '', '', 'N'];
  const t = gs.임시발주표_([머리, 줄('2230', 'ZH26-01', '외자', '가공장-수입', 'A1 '), 줄('', 'ZH26-01', '외자', '가공장-수입', 'A2'),
    줄('2229', '1028나가구', '내자', '나가구', 'n_x1'), 줄('2228', '본사', '내/외자', '가공장-수입', '')]);
  assert.equal(t.줄, 3);                                     // 코드·이름 다 빈 줄은 뺌
  const [a, b] = t.사명들;
  assert.equal(a.name, '가공장-수입');
  assert.deepEqual([...a.rows[1]].slice(0, 7), ['2230', 'ZH26-01', '외자', '0.본사', '2026-10-28', '', 'A2']);
  assert.equal(a.rows[0][6], 'A1');
  assert.deepEqual([...b.구분], ['내자']);
  assert.deepEqual([...a.구분], ['외자']);
  assert.deepEqual(JSON.parse(JSON.stringify(t.목록[1])), { id: '나가구', name: '나가구', 구분: ['내자'], 줄: 1, po: [['2229', '1028나가구', '2026-10-28']] });
});

test('임시쓰기_ — 구매사명마다 한 문서 + _목록, 없어진 구매사명은 지움', () => {
  const t = gs.임시발주표_([['PO번호', '구매발주명', '구매사명', '단품코드'], ['1', 'a', '가', 'X']]);
  const r = gs.임시쓰기_(t, ['가', '옛곳'], '파일.xlsx', '2026-11-02');
  const names = [...r.writes].map((w) => (w.update ? w.update.name : w.delete).split('/').slice(-2).join('/'));
  assert.deepEqual(names, ['docs_임시발주/가', 'docs_임시발주/옛곳', 'docs_임시발주/_목록']);
  assert.ok(r.writes[1].delete);
  const 칸 = r.writes[0].update.fields;
  assert.equal(칸.rows.arrayValue.values[0].mapValue.fields.c.arrayValue.values[0].stringValue, '1');   // 줄은 {c:[…]}
  assert.equal(r.writes[2].update.fields['사명들'].arrayValue.values[0].mapValue.fields.po.arrayValue.values[0].mapValue.fields.c.arrayValue.values[1].stringValue, 'a');
});

test('양식올리기 — 자물쇠, 거래처/대표양식 에 저장(같은 이름은 (2)), 대표양식은 차수 폴더가 아님', () => {
  assert.equal(가짜서랍({ props: { fbKey: 'k' } }).ctx.서랍_({ 일: '양식올리기', vendor: '제헤우드' }).why, 'off');
  const { ctx, 쓰기 } = 가짜서랍();
  ctx.Utilities.base64Decode = () => [1, 2, 3];
  ctx.Utilities.newBlob = (b, m, name) => ({ name });
  assert.equal(ctx.서랍_({ 일: '양식올리기', vendor: '베이지아', name: 'a.xlsx', b64: 'AA' }).why, 'out');
  const r = ctx.서랍_({ 일: '양식올리기', vendor: '제헤우드', name: 'a.xlsx', b64: 'AA' });
  assert.equal(r.path, '제헤우드/대표양식/a.xlsx');
  assert.equal(ctx.서랍_({ 일: '양식올리기', vendor: '제헤우드', name: 'a.xlsx', b64: 'AA' }).path, '제헤우드/대표양식/a (2).xlsx');
  assert.equal(쓰기.at(-1).update.fields['일'].stringValue, '양식올림');
  assert.equal(ctx.차수폴더인가_('대표양식'), false);
});

test('PDF내주기_ — 사본으로 PDF 를 뽑아 이름만 바꿔 주고, 사본을 지운다. 원본은 안 건드림', () => {
  const 부름 = [];
  const 응답 = (code, body, bytes) => ({ getResponseCode: () => code, getContentText: () => body, getContent: () => bytes });
  gs.UrlFetchApp = { fetch: (u, o = {}) => {
    부름.push([o.method ?? 'get', u]);
    if (u.endsWith('/copy')) return 응답(200, JSON.stringify({ id: 'COPY' }));
    if (o.method === 'delete') return 응답(204, '');
    return 응답(200, '', [0x25, 0x50, 0x44, 0x46]);
  } };
  gs.ScriptApp = { getOAuthToken: () => 't' };
  gs.Utilities = { sleep() {}, base64Encode: (b) => `b64:${b.length}` };
  gs.SpreadsheetApp = { openById: () => { throw new Error('없음'); } };
  const file = { getId: () => 'ORIG', getName: () => 'AMT합同.8.03.xlsx', getSize: () => 1000 };
  const r = gs.PDF내주기_(file);
  assert.equal(r.ok, true);
  assert.equal(r.name, 'AMT합同.8.03.pdf');
  assert.equal(r.mime, 'application/pdf');
  assert.equal(r.b64, 'b64:4');
  assert.deepEqual(부름.map(([m]) => m), ['post', 'get', 'delete']);
  assert.match(부름[0][1], /files\/ORIG\/copy$/);
  assert.match(부름[1][1], /spreadsheets\/d\/COPY\/export\?format=pdf.*fitw=true.*portrait=true/);
  assert.match(부름[2][1], /files\/COPY$/);       // 지운 것은 사본

  부름.length = 0;
  assert.equal(gs.PDF내주기_({ getId: () => 'X', getName: () => '도면.dwg', getSize: () => 1 }).why, 'kind');
  assert.equal(부름.length, 0);

  // 내보내기가 실패해도 사본은 지운다
  gs.UrlFetchApp = { fetch: (u, o = {}) => {
    부름.push([o.method ?? 'get', u]);
    return u.endsWith('/copy') ? 응답(200, JSON.stringify({ id: 'COPY' })) : 응답(500, '');
  } };
  assert.equal(gs.PDF내주기_(file).why, 'read');
  assert.equal(부름.at(-1)[0], 'delete');
});

test('PDF꼴_ 과 parse.js PDF로바꿀꼴 이 같은 꼴을 본다', async () => {
  const { PDF로바꿀꼴 } = await import('../js/parse.js');
  for (const n of ['a.xlsx', 'a.xlsm', 'a.XLS', 'a.docx', 'a.doc', 'a.pptx', 'a.ppt', 'a.pdf', 'a.dwg', 'a.zip', 'a.csv'])
    assert.equal(!!gs.PDF꼴_(n), PDF로바꿀꼴(n), n);
});

/* 드라이브·UrlFetch 를 가짜로 — 큰 원본 · 원본 인쇄 방향 · 한 번 더 · html 응답 (v0.111.0) */
function PDF틀(이름, { 내보내기 = [{ code: 200, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }], 크기 = 1000, xml = null } = {}) {
  const 부름 = [];
  const g = vm.createContext({ console: { warn() {}, log() {} } });
  vm.runInContext(readFileSync(new URL('../appsscript/sync.gs', import.meta.url), 'utf8'), g);
  g.ScriptApp = { getOAuthToken: () => 't' };
  g.SpreadsheetApp = { openById() { throw new Error('시트 안 엶'); } };
  g.Utilities = {
    sleep() {},
    base64Encode: (b) => `b64:${b.length}`,
    unzip: () => (xml ?? []).map((x, i) => ({ getName: () => `xl/worksheets/sheet${i + 1}.xml`, getDataAsString: () => x })),
  };
  g.UrlFetchApp = {
    fetch(url, opt = {}) {
      부름.push({ url, method: opt.method ?? 'get' });
      if (opt.method === 'post') return { getResponseCode: () => 200, getContentText: () => '{"id":"COPY1"}' };
      if (opt.method === 'delete') return { getResponseCode: () => 204 };
      const r = 내보내기.shift() ?? { code: 500, bytes: [] };
      return { getResponseCode: () => r.code, getContent: () => r.bytes };
    },
  };
  const file = { getName: () => 이름, getId: () => 'SRC1', getSize: () => 크기, getBlob: () => ({ setContentType() { return this; } }) };
  return { g, 부름, file };
}

test('PDF내주기_ — xlsx 에 적힌 인쇄 방향을 따른다', () => {
  const 가로 = PDF틀('a.xlsx', { xml: ['<worksheet/>', '<pageSetup paperSize="9" orientation="landscape"/>'] });
  가로.g.PDF내주기_(가로.file);
  assert.match(가로.부름[1].url, /portrait=false/);
  const 세로 = PDF틀('a.xlsx', { xml: ['<pageSetup orientation="portrait"/>', '<pageSetup orientation="landscape"/>'] });
  세로.g.PDF내주기_(세로.file);
  assert.match(세로.부름[1].url, /portrait=true/);
});

test('PDF내주기_ — 10MB 넘는 엑셀도 바꾸고, 30MB 넘으면 사본도 안 만든다', () => {
  const 큰 = PDF틀('a.xlsx', { 크기: 20 * 1024 * 1024 });
  assert.equal(큰.g.PDF내주기_(큰.file).ok, true);
  const 너무 = PDF틀('a.xlsx', { 크기: 31 * 1024 * 1024 });
  assert.equal(너무.g.PDF내주기_(너무.file).why, 'big');
  assert.equal(너무.부름.length, 0);
});

test('PDF내주기_ — 내보내기 실패는 한 번 더, 그래도 안 되거나 html 이 오면 read, 사본은 늘 지운다', () => {
  const 두번 = PDF틀('a.xlsx', { 내보내기: [{ code: 500, bytes: [] }, { code: 200, bytes: [0x25, 0x50, 0x44, 0x46] }] });
  assert.equal(두번.g.PDF내주기_(두번.file).ok, true);
  assert.equal(두번.부름.filter((x) => x.method === 'get').length, 2);
  const 글 = PDF틀('a.xlsx', { 내보내기: [{ code: 200, bytes: [0x3c, 0x21, 0x64, 0x6f] }] });
  assert.equal(글.g.PDF내주기_(글.file).why, 'read');
  assert.equal(글.부름.at(-1).method, 'delete');
  assert.match(글.부름.at(-1).url, /files\/COPY1$/);
});

test('파일내주기_ — pdf 부탁도 같은 자물쇠: shareAllow 가 비면 off', () => {
  const { g } = PDF틀('a.xlsx');
  g.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
  assert.equal(g.파일내주기_({ pdf: true, driveId: 'abcdefghijklmn', idToken: 'x' }).why, 'off');
});
