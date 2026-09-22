/**
 * 차수가 지금 어디까지 왔는지 한 마디로 — 사장님이 주신 네 마디 그대로입니다.
 *
 *   발주서가 오면      → 발주시작
 *   계약금영수증이 오면 → 생산중
 *   잔액서류가 오면     → 상차완료
 *   잔액영수증이 오면   → 거래완료
 *
 * 가장 멀리 간 것 하나만 적습니다. 중간을 건너뛰었어도 가장 멀리 간 것으로 적습니다 —
 * 실제로 그렇게 된 것이니 그대로 적는 것이 맞습니다.
 * 넷 가운데 하나도 없으면 아무 말도 적지 않습니다(없는 말을 지어내지 않습니다).
 * 선하증권(B/L)은 이 넷에 없습니다 — 거래완료 뒤에 와도 글자는 그대로입니다.
 *
 * 읽기만 하는 셈입니다. 아무것도 저장하지 않습니다.
 */

/** 뒤(먼 것)부터 봅니다 — 먼저 걸리는 것이 가장 멀리 간 것입니다. */
export const PROGRESS_WORDS = [
  { key: 'balReceipt', word: '거래완료' },
  { key: 'cipl', word: '상차완료' },
  { key: 'piReceipt', word: '생산중' },
  { key: 'order', word: '발주시작' },
];

/**
 * @param {{stages?: {key: string, docs: unknown[]}[]}} b 차수 하나
 * @returns {string} 네 마디 가운데 하나, 또는 빈 글자
 */
export function progressWord(b) {
  const 있나 = (key) => (b?.stages ?? []).some((s) => s.key === key && (s.docs?.length ?? 0) > 0);
  for (const { key, word } of PROGRESS_WORDS) if (있나(key)) return word;
  return '';
}
