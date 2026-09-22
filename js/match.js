/**
 * 잔액서류(CI&PL)와 발주서를 숫자로 맞춰 봅니다.
 *
 * ⚠ 박스수량과 중량은 발주서에서 안 나옵니다 — 발주서 PDF 에 그 칸이 없습니다.
 *   그래서 없는 것을 있는 척 맞추지 않고, 양쪽에 다 있는 것만 맞춰 봅니다:
 *   수량 · 금액 · 부피(CBM) · 품목별 수량.
 *
 * 한쪽에 값이 없는 칸은 아예 빼 둡니다 — 맞았다고도 틀렸다고도 하지 않습니다.
 * '모르는 것' 과 '틀린 것' 은 다릅니다.
 *
 * 화면과 얽히지 않은 순수한 셈이라 브라우저와 Node 검사 양쪽에서 그대로 씁니다.
 */

/**
 * 두 서류의 품목을 코드로 맞춰 보고, 무엇이 새로 들어오고 빠지고 수량이 바뀌었는지 줄로 만듭니다.
 * "수량 +51" 만으로는 어느 제품이 늘었는지 알 수 없습니다.
 */
export function itemRows(before, now) {
  if (!before?.length || !now?.length) return [];
  const key = (list) => new Map(list.map((x) => [String(x.code), x]));
  const A = key(before);
  const B = key(now);
  const rows = [];

  for (const [code, x] of B) {
    const was = A.get(code);
    if (!was) rows.push({ kind: '추가', name: x.name || code, code, from: null, to: x.qty });
    else if (was.qty !== x.qty)
      rows.push({ kind: '수량', name: x.name || code, code, from: was.qty, to: x.qty });
  }
  for (const [code, x] of A)
    if (!B.has(code)) rows.push({ kind: '빠짐', name: x.name || code, code, from: x.qty, to: null });

  // 새로 들어온 것 → 수량이 바뀐 것 → 빠진 것 차례로 봅니다.
  const rank = { 추가: 0, 수량: 1, 빠짐: 2 };
  return rows.sort((a, b) => rank[a.kind] - rank[b.kind] || Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

const 숫 = (v) => { const n = Number(v); return Number.isFinite(n) && n ? n : 0; };

/**
 * 발주서 한 장을 잔액서류 한 장과 맞춰 봅니다.
 * @returns {{항: object[], 품목다른줄: number|null, 맞은수: number, 견준수: number,
 *            못댐: boolean, 다맞음: boolean, 하나도안맞음: boolean, 못댄것: string[]}}
 */
export function 맞춰보기(발주, d) {
  const a = 발주?.cipl ?? {}, z = d?.cipl ?? {};
  const ab = a.brief ?? {}, zb = z.brief ?? {};
  const 항 = [];
  const 넣기 = (이름, x, y, 단위) => {
    if (!x || !y) return;                    // 한쪽이 없으면 맞춰 보지 않습니다
    // 부피는 서류마다 반올림이 달라, 1% 안이면 같은 것으로 봅니다. 수량·금액은 딱 맞아야 합니다.
    const 결 = x === y ? '같음'
             : (단위 === 'CBM' && Math.abs(x - y) / Math.max(x, y) <= 0.01) ? '가까움' : '다름';
    항.push({ 이름, 발주: x, 잔액: y, 단위, 결 });
  };
  넣기('수량', 숫(ab.qty), 숫(zb.qty) || 숫(z.pcs), 'pcs');
  넣기('금액', 숫(ab.amount), 숫(zb.amount), '');
  넣기('부피', 숫(ab.cbm), 숫(zb.cbm) || 숫(z.cbm), 'CBM');

  // 잔액서류에는 있는데 발주서에 없어 못 댄 것 — 화면에 그대로 적어 줍니다.
  const 못댄것 = [];
  if (숫(z.cartons) && !숫(ab.cartons)) 못댄것.push('박스수');
  if (숫(z.gross) && !숫(ab.gross)) 못댄것.push('중량');
  if (숫(zb.cbm) || 숫(z.cbm)) { if (!숫(ab.cbm)) 못댄것.push('부피'); }

  const 품목 = (a.items?.length && z.items?.length) ? itemRows(a.items, z.items) : null;
  const 맞은수 = 항.filter((x) => x.결 !== '다름').length;
  // 숫자도 품목도 하나 못 대 봤으면 '못댐' 입니다. 맞다고도 틀리다고도 할 수 없습니다.
  const 못댐 = 항.length === 0 && 품목 === null;
  return {
    항, 품목다른줄: 품목 ? 품목.length : null, 못댄것,
    맞은수, 견준수: 항.length, 못댐,
    다맞음: 항.length > 0 && 맞은수 === 항.length && (품목 === null || 품목.length === 0),
    하나도안맞음: !못댐 && 맞은수 === 0 && 품목다른줄있고다름(품목),
  };
}

const 품목다른줄있고다름 = (품목) => 품목 === null || 품목.length > 0;

/**
 * 발주서 여러 장을 잔액서류 하나와 맞춰 보고, 무엇이라 말할지 고릅니다.
 *
 * ⚠ '대 볼 것이 아예 없음' 과 '대 봤는데 하나도 안 맞음' 은 다릅니다.
 *   앞엣것을 「하나도 없습니다」 라고 하면 사장님은 「없다」 로 읽으십니다.
 *   모르는 것을 틀렸다고 하지 않습니다.
 *
 * @returns {'못댐'|'하나도안맞음'|'하나가다맞음'|'여럿이다맞음'|'골라야함'}
 */
export function 맞춤판정(잰것) {
  const 다맞는것 = 잰것.filter((x) => x.다맞음);
  if (다맞는것.length === 1) return '하나가다맞음';
  if (다맞는것.length > 1) return '여럿이다맞음';
  // 한 장도 대 보지 못했으면 '없다' 가 아니라 '모른다' 입니다.
  if (잰것.length === 0 || 잰것.every((x) => x.못댐)) return '못댐';
  if (잰것.every((x) => x.못댐 || x.하나도안맞음)) return '하나도안맞음';
  return '골라야함';
}
