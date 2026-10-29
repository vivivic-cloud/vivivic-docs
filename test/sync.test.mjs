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
