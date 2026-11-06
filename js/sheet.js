/* ── 양식 모양 — 올린 엑셀을 격자 그대로 다시 그릴 정보 (11-06 사장님) ─────────
   「양식 업로드시 업로드한 서류의 표모양등 모든 구성이 동일하게 나타나야 합니다.」
   order.js 양식분석 은 「어느 칸이 무엇인가」(틀)를 찾고, 여기는 「어떻게 생겼나」(모양)를 뜹니다. 둘을 같이 씁니다.
   글자(표시 글) = SheetJS, 서식(글꼴·칸색·테두리·그림) = ExcelJS — SheetJS 무료판은 서식을 못 읽고 ExcelJS 는 숫자 서식을 못 입힙니다.
   순수 함수만 둡니다. 표본(엑셀표본·시트표본) 뒤에 라이브러리를 숨겨 시험합니다.
   ⚠ 품목 줄의 옛 값은 담지 않습니다 — 칸 모양만. 예전 발주 값이 새 발주서에 남으면 안 됩니다.
   ⚠ 공개 저장소입니다. 시험·주석의 거래처 이름은 가짜로 씁니다. */
import { 코드열쇠 } from './parse.js';
import { 대조숫자 } from './match.js';
import { 줄값, 발주합계 } from './order.js';

const 최대줄 = 600, 최대칸 = 60;

/* ── 색 ─────────────────────────────── */
const 기본테마 = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646', '0000FF', '800080'];
const 색표 = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '.repeat(2)
  + '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF '
  + '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 '
  + '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333').trim().split(/\s+/);

/** 테마 xml → 색 열둘(엑셀 칸 번호 차례: 밝1·어둠1·밝2·어둠2·강조6·링크2). */
export function 테마색(xml) {
  const 색 = (이름) => new RegExp(`<a:${이름}>[\\s\\S]*?(?:lastClr|val)="([0-9A-Fa-f]{6})"`).exec(xml ?? '')?.[1];
  const 값들 = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(색);
  return 값들.map((v, i) => v ?? 기본테마[i]);
}

function 밝기(hex, tint) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0, l = (max + min) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const 조각 = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6];
  return 조각.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** 엑셀 색 값 → '#RRGGBB'. 없거나 자동이면 ''. */
export function 색글(색, 테마 = 기본테마) {
  if (!색) return '';
  let hex = '';
  if (색.argb) hex = String(색.argb).slice(-6);
  else if (색.theme != null) hex = 테마[색.theme] ?? '';
  else if (색.indexed != null) hex = 색표[색.indexed] ?? '';
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return '';
  return `#${색.tint ? 밝기(hex, 색.tint) : hex.toUpperCase()}`;
}

/* ── 칸 서식 → CSS ──────────────────── */
const 선표 = { thin: '1px solid', hair: '1px dotted', dotted: '1px dotted', dashed: '1px dashed', dashDot: '1px dashed', dashDotDot: '1px dashed',
  medium: '2px solid', mediumDashed: '2px dashed', mediumDashDot: '2px dashed', mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed', thick: '3px solid', double: '3px double' };
const 선글 = (선, 테마) => {
  const 꼴 = 선표[선?.style];
  return 꼴 ? `${꼴} ${색글(선.color, 테마) || '#000'}` : '';
};
const 굴림꼴 = /宋|仿|楷|明|serif|times|batang|바탕|궁서|명조|song|ming/i;
export const 글꼴글 = (이름) => {
  const 뒤 = 굴림꼴.test(이름 ?? '') ? "'Songti SC','AppleMyungjo',serif" : "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
  return 이름 ? `'${String(이름).replace(/['"\\;]/g, '')}',${뒤}` : 뒤;
};

/** 글꼴만 — 칸 안 글자 조각(rich text)도 같이 씁니다. */
export function 글꼴서식(f, 테마) {
  const 조각 = [];
  if (!f) return '';
  if (f.name) 조각.push(`font-family:${글꼴글(f.name)}`);
  if (f.size) 조각.push(`font-size:${f.size}pt`);
  if (f.bold) 조각.push('font-weight:700');
  if (f.italic) 조각.push('font-style:italic');
  const 줄 = [f.underline && 'underline', f.strike && 'line-through'].filter(Boolean).join(' ');
  if (줄) 조각.push(`text-decoration:${줄}`);
  const 색 = 색글(f.color, 테마);
  if (색) 조각.push(`color:${색}`);
  return 조각.join(';');
}

/** 칸 하나의 CSS. 선 = { top, right, bottom, left } — 합친 칸은 가장자리 칸들에서 모아 줍니다. */
export function 칸서식(칸, 선, 테마, 숫자 = false) {
  const 조각 = [];
  const 글꼴 = 글꼴서식(칸?.font, 테마);
  if (글꼴) 조각.push(글꼴);
  const 칠 = 칸?.fill;
  if (칠?.type === 'pattern' && 칠.pattern === 'solid') {
    const 색 = 색글(칠.fgColor, 테마) || 색글(칠.bgColor, 테마);
    if (색) 조각.push(`background-color:${색}`);
  }
  const a = 칸?.alignment ?? {};
  const 가로 = { center: 'center', centerContinuous: 'center', distributed: 'center', right: 'right', left: 'left', justify: 'justify' }[a.horizontal] ?? (숫자 ? 'right' : '');
  if (가로) 조각.push(`text-align:${가로}`);
  조각.push(`vertical-align:${{ top: 'top', middle: 'middle', center: 'middle', justify: 'top', distributed: 'middle' }[a.vertical] ?? 'bottom'}`);
  조각.push(`white-space:${a.wrapText ? 'pre-wrap' : 'pre'}`);
  if (a.indent) 조각.push(`padding-${가로 === 'right' ? 'right' : 'left'}:${a.indent * 9 + 2}px`);
  const 돌림 = a.textRotation;
  if (돌림 === 'vertical' || 돌림 === 255) 조각.push('writing-mode:vertical-rl;text-orientation:upright');
  else if (돌림 === 90) 조각.push('writing-mode:vertical-rl;transform:rotate(180deg)');
  else if (돌림 === -90) 조각.push('writing-mode:vertical-rl');
  for (const 쪽 of ['top', 'right', 'bottom', 'left']) {
    const 글 = 선글(선?.[쪽], 테마);
    if (글) 조각.push(`border-${쪽}:${글}`);
  }
  return 조각.join(';');
}

/* ── 크기 ───────────────────────────── */
/* 글자폭(가장 넓은 숫자) — 칸 너비는 기본 글꼴의 숫자 몇 개 꼴로 적혀 있습니다. 표는 윈도 96dpi 값. */
export function 글자폭(글꼴) {
  const 이름 = String(글꼴?.name ?? '');
  const 크기 = Number(글꼴?.size) || 11;
  const 기준 = /calibri|arial|times|verdana|tahoma/i.test(이름) ? 7 : 이름 ? 8 : 7;
  return Math.max(5, Math.round(기준 * 크기 / 11));
}
export const 칸너비px = (w, 폭) => Math.trunc(((256 * w + Math.trunc(128 / 폭)) / 256) * 폭);
export const 줄높이px = (pt) => Math.round((pt * 96) / 72 * 100) / 100;

const 칸번호 = (글) => [...글.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
/** 'A1:V131' → { s:{r,c}, e:{r,c} }. 여러 조각이면 첫 조각. */
export function 범위읽기(글) {
  const m = /\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?/.exec(String(글 ?? '').split(/[,;]/)[0].split('!').pop());
  if (!m) return null;
  const s = { r: Number(m[2]) - 1, c: 칸번호(m[1]) };
  return { s, e: m[3] ? { r: Number(m[4]) - 1, c: 칸번호(m[3]) } : s };
}

/* ── 표본 — 라이브러리를 가립니다 ────── */
/** ExcelJS 워크시트 → 표본. wb 는 ExcelJS Workbook, 기본글꼴은 SheetJS wb.Styles.Fonts[0](ExcelJS 는 안 내줍니다). */
export function 엑셀표본(wb, 시트이름, 기본글꼴) {
  const ws = wb.getWorksheet(시트이름);
  if (!ws) return null;
  const 폭 = 글자폭(기본글꼴);
  const 기본폭 = ws.properties?.defaultColWidth;
  const 기본높이 = ws.properties?.defaultRowHeight || 15;
  const 테마 = 테마색(wb.model?.themes?.theme1);
  const 뜸 = ws.views?.[0];
  return {
    서식있음: true,
    테마,
    배율: (뜸?.zoomScale || 100) / 100,
    인쇄범위: 범위읽기(ws.pageSetup?.printArea),
    합침: (ws.model?.merges ?? []).map(범위읽기).filter(Boolean),
    칸수: Math.min(최대칸, ws.columnCount),
    줄수: Math.min(최대줄, ws.rowCount),
    칸너비: (c) => {
      const k = ws.getColumn(c + 1);
      const w = k.width ?? 기본폭;
      return k.hidden ? 0 : w ? 칸너비px(w, 폭) : 64;
    },
    줄높이: (r) => {
      const 줄 = ws.getRow(r + 1);
      return 줄.hidden ? 0 : 줄높이px(줄.height ?? 기본높이);
    },
    칸: (r, c) => {
      const x = ws.getRow(r + 1).getCell(c + 1);
      const v = x.value;
      const 숫자 = typeof v === 'number' || typeof (v?.result) === 'number' || v instanceof Date;
      return { style: x.style ?? {}, 숫자, 런: Array.isArray(v?.richText) ? v.richText : null };
    },
    그림들: () => ws.getImages().flatMap((그림) => {
      const 미디어 = wb.getImage(Number(그림.imageId));
      const { tl, br, ext } = 그림.range ?? {};
      if (!미디어 || !tl) return [];
      const 자리 = (p) => p && { r: p.nativeRow ?? Math.floor(p.row), c: p.nativeCol ?? Math.floor(p.col), x: (p.nativeColOff ?? 0) / 9525, y: (p.nativeRowOff ?? 0) / 9525 };
      return [{ id: String(그림.imageId), 꼴: 미디어.extension, 바이트: 미디어.buffer, tl: 자리(tl), br: 자리(br), ext }];
    }),
  };
}

/** SheetJS 시트 → 표본. 서식이 없습니다(.xls·.csv·ExcelJS 가 못 연 파일). */
export function 시트표본(s, 시트글, X) {
  const 범위 = s?.['!ref'] ? X.utils.decode_range(s['!ref']) : null;
  const 칸들 = s?.['!cols'] ?? [], 줄들 = s?.['!rows'] ?? [];
  return {
    서식있음: false,
    테마: 기본테마,
    배율: 1,
    인쇄범위: null,
    합침: s?.['!merges'] ?? [],
    칸수: Math.min(최대칸, (범위?.e.c ?? -1) + 1),
    줄수: Math.min(최대줄, (범위?.e.r ?? -1) + 1),
    칸너비: (c) => {
      const k = 칸들[c];
      if (k?.hidden) return 0;
      return Math.round(k?.wpx ?? (k?.wch ? k.wch * 7 + 5 : k?.width ? k.width * 7 + 5 : 64));
    },
    줄높이: (r) => {
      const k = 줄들[r];
      if (k?.hidden) return 0;
      return k?.hpx ?? (k?.hpt ? 줄높이px(k.hpt) : 20);
    },
    칸: (r, c) => {
      const 글 = String(시트글.rows?.[r]?.[c] ?? '');
      const 선 = { style: 'thin', color: { argb: 'FFBFBFBF' } };
      return { style: 글 ? { border: { top: 선, right: 선, bottom: 선, left: 선 } } : {}, 숫자: !!글 && 대조숫자(글) !== null, 런: null };
    },
    그림들: () => [],
  };
}

/* ── 모양 뜨기 ──────────────────────── */
/* 쓰는 범위 — 인쇄 범위가 품목표를 온전히 품으면 그것(메모 칸은 밖에 있습니다). 아니면 글이나 칠이 있는 데까지, 칸은 품목표 오른쪽 끝까지.
   ⚠ 실물에 인쇄 범위가 엉뚱하게 남은 파일이 있습니다(합계 한 줄만 잡힌 제헤우드 合同 5건). 믿으면 표가 통째로 사라집니다. */
function 쓰는범위(표본, 시트글, 틀) {
  const 표끝칸 = Math.max(0, ...틀.칸.filter((k) => k.라벨 && !k.숨김).map((k) => k.c));
  const p = 표본.인쇄범위;
  const 끝줄 = 틀.끝 + ((틀.합계 ?? []).length ? 1 : 0) - 1;
  if (p && p.s.r <= 틀.머리줄 && p.e.r >= 끝줄 && p.e.c >= 표끝칸) {
    return { 줄0: p.s.r, 줄끝: Math.min(p.e.r, 최대줄 - 1), 칸0: p.s.c, 칸끝: Math.min(p.e.c, 최대칸 - 1) };
  }
  let 줄끝 = 0;
  const 찼나 = (r, c) => {
    if (String(시트글.rows?.[r]?.[c] ?? '').trim()) return true;
    const st = 표본.칸(r, c).style ?? {};
    return !!(st.border && Object.keys(st.border).length) || st.fill?.pattern === 'solid';
  };
  for (let r = 0; r < 표본.줄수; r++) for (let c = 0; c <= 표끝칸; c++) if (찼나(r, c)) 줄끝 = Math.max(줄끝, r);
  return { 줄0: 0, 줄끝, 칸0: 0, 칸끝: 표끝칸 };
}

/** 표본 + 틀 + 시트 글 → 모양(JSON 으로 담을 꼴). 그림 알맹이는 빼고 자리만 — 그림은 화면 쪽이 줄여 넣습니다. */
export function 모양읽기(표본, 틀, 시트글) {
  const 쓰는 = 쓰는범위(표본, 시트글, 틀);
  const { 테마 } = 표본;
  const 품목 = (r) => r >= 틀.시작 && r < 틀.끝;
  const 칸폭 = new Map(), 줄폭 = new Map();
  for (let c = 쓰는.칸0; c <= 쓰는.칸끝; c++) { const w = 표본.칸너비(c); if (w > 0) 칸폭.set(c, w); }
  for (let r = 쓰는.줄0; r <= 쓰는.줄끝; r++) { const h = 표본.줄높이(r); if (h > 0) 줄폭.set(r, h); }
  const 합침표 = new Map();
  for (const m of 표본.합침 ?? []) for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) 합침표.set(`${r},${c}`, m);
  // 품목 줄의 세로 합침은 풉니다 — 줄마다 제품이 다릅니다. 표 머리·아래가 품목 칸까지 내려온 것도 끊습니다.
  const 합침찾기 = (r, c) => {
    const m = 합침표.get(`${r},${c}`);
    if (!m) return null;
    if (품목(r) && m.s.r !== m.e.r) return null;
    return m;
  };

  const 서식들 = [], 서식번호 = new Map();
  const 서식 = (css) => {
    if (!서식번호.has(css)) { 서식번호.set(css, 서식들.length); 서식들.push(css); }
    return 서식번호.get(css);
  };
  const 머리자리 = new Map();
  for (const k of 틀.머리칸 ?? []) if (k.r >= 0) 머리자리.set(`${k.r},${k.c}`, k);

  const 첫보임칸 = (m) => { for (let c = m.s.c; c <= m.e.c; c++) if (칸폭.has(c)) return c; return -1; };
  const 첫보임줄 = (m) => { for (let r = m.s.r; r <= m.e.r; r++) if (줄폭.has(r)) return r; return -1; };

  const 칸만들기 = (r, c, 글담기) => {
    const m = 합침찾기(r, c);
    if (m && (r !== (품목(r) ? r : 첫보임줄(m)) || c !== 첫보임칸(m))) return null;
    const 위 = m ? m.s.r : r, 왼 = m ? m.s.c : c;
    const 원 = 표본.칸(위, 왼);
    const st = 원.style ?? {};
    const 아래끝 = m ? m.e.r : r, 오른끝 = m ? m.e.c : c;
    const 가장자리 = (쪽, 칸들) => {
      for (const [y, x] of 칸들) { const b = 표본.칸(y, x).style?.border?.[쪽]; if (b?.style) return b; }
      return null;
    };
    const 열들 = Array.from({ length: 오른끝 - 왼 + 1 }, (_, i) => 왼 + i);
    const 행들 = Array.from({ length: 아래끝 - 위 + 1 }, (_, i) => 위 + i);
    const 선 = {
      top: 가장자리('top', 열들.map((x) => [위, x])),
      bottom: 가장자리('bottom', 열들.map((x) => [아래끝, x])),
      left: 가장자리('left', 행들.map((y) => [y, 왼])),
      right: 가장자리('right', 행들.map((y) => [y, 오른끝])),
    };
    const 칸 = { c, s: 서식(칸서식(st, 선, 테마, 원.숫자)) };
    if (m) {
      const cs = 열들.filter((x) => 칸폭.has(x)).length, rs = 행들.filter((y) => 줄폭.has(y)).length;
      if (cs > 1) 칸.cs = cs;
      if (rs > 1) 칸.rs = rs;
    }
    if (글담기) {
      const 글 = String(시트글.rows?.[위]?.[왼] ?? '');
      if (글) 칸.t = 글;
      if (원.런 && 글) {
        칸.런 = 원.런.map((x) => [String(x.text ?? ''), 서식(글꼴서식(x.font, 테마))]);
      }
      const 식 = 시트글.식?.[`${위},${왼}`];
      if (식) 칸.f = String(식);
    }
    return 칸;
  };

  const 줄들 = [], 틀줄 = [];
  let 틀자리 = [...줄폭.keys()].filter(품목);
  // 거른 양식은 품목 줄이 다 숨어 있을 수 있습니다 — 모양은 있으니 첫 줄을 씁니다.
  const 숨은틀 = !틀자리.length && 틀.끝 > 틀.시작;
  if (숨은틀) 틀자리 = [틀.시작];
  for (const r of 틀자리) {
    const 칸들 = [...칸폭.keys()].map((c) => 칸만들기(r, c, false)).filter(Boolean);
    틀줄.push({ h: 숨은틀 ? 줄폭.get(틀.시작 - 1) ?? 표본.줄높이(틀.시작 - 1) ?? 20 : 줄폭.get(r), 칸: 칸들 });
  }
  let 틀넣은 = false;
  const 품목앞줄 = [];
  for (const r of 줄폭.keys()) {
    if (품목(r)) continue;
    if (r >= 틀.끝 && !틀넣은) { 틀넣은 = true; 품목앞줄.push(줄들.length); }
    줄들.push({ r, h: 줄폭.get(r), 칸: [...칸폭.keys()].map((c) => 칸만들기(r, c, true)).filter(Boolean) });
  }

  // 머리칸 값 자리 — 틀은 「이름표 옆 칸」 으로 잡습니다. 그 칸이 이름표 합침 안이면 합침 다음 보이는 칸으로 넘깁니다.
  const 줄표 = new Map(줄들.map((x) => [x.r, x]));
  for (const k of 틀.머리칸 ?? []) {
    const 줄 = 줄표.get(k.r);
    if (!줄) continue;
    let 칸 = 줄.칸.find((x) => x.c === k.c);
    if (!칸) {
      const 뒤 = 줄.칸.filter((x) => x.c > k.c);
      const 끝칸 = 줄.칸.find((x) => x.c <= k.c && x.c + 1 > k.c - 40 && 칸덮나(x, k.c, [...칸폭.keys()]));
      칸 = k.값 ? 끝칸 : 뒤[0];
    }
    if (!칸) continue;
    칸.k = k.키;
    const 이름표 = new RegExp(`^\\s*${k.라벨.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]\\s*`).exec(칸.t ?? '');
    if (이름표) 칸.앞 = 이름표[0];
  }
  // 아래 글은 칸마다 고칩니다(틀.아래 는 줄 하나로 묶인 글 — 판.아래 예전 값은 글 칸이 하나인 줄에서만 잇습니다).
  const 아래줄 = new Set((틀.아래 ?? []).map((x) => x.r));
  for (const 줄 of 줄들) {
    if (!아래줄.has(줄.r)) continue;
    for (const 칸 of 줄.칸) if (칸.t && 대조숫자(칸.t) === null && !칸.f) 칸.a = 1;
  }

  // 그림 자리 — 품목 줄 그림은 그 코드 몫으로, 나머지는 놓인 칸에 붙입니다. 표가 늘어도 칸을 따라 움직입니다.
  const 칸합 = (a, b) => { let n = 0; for (let c = a; c < b; c++) n += 칸폭.get(c) ?? 0; return n; };
  const 줄합 = (a, b) => { let n = 0; for (let r = a; r < b; r++) n += 줄폭.get(r) ?? 0; return n; };
  const 코드칸 = 틀.칸.find((k) => k.역할 === 'code')?.c;
  const 그림 = [], 품목그림 = {};
  const 그림재료 = [];
  for (const g of 표본.그림들?.() ?? []) {
    const { r, c, x, y } = g.tl;
    const w = g.br ? 칸합(c, g.br.c) - x + g.br.x : (g.ext?.width ?? 0);
    const h = g.br ? 줄합(r, g.br.r) - y + g.br.y : (g.ext?.height ?? 0);
    if (w <= 1 || h <= 1) continue;
    const 자리 = { id: g.id, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    if (품목(r)) {
      const 열쇠 = 코드칸 === undefined ? '' : 코드열쇠(String(시트글.rows?.[r]?.[코드칸] ?? '').trim());
      if (!열쇠) continue;
      품목그림[열쇠] = 자리;
    } else {
      if (r > 쓰는.줄끝 || c > 쓰는.칸끝) continue;
      const 줄 = 줄표.get(r);
      if (!줄) continue;
      const 칸 = 줄.칸.find((k) => k.c === c) ?? 줄.칸.filter((k) => k.c < c).pop();
      if (!칸) continue;
      (칸.g ??= []).push({ ...자리, x: 자리.x + 칸합(칸.c, c) });
      그림.push(자리);
    }
    if (!그림재료.some((x) => x.id === g.id)) 그림재료.push({ id: g.id, 꼴: g.꼴, 바이트: g.바이트 });
  }

  const 칸너비들 = [...칸폭.entries()].map(([c, w]) => ({ c, w }));
  const 모양 = {
    v: 1, 서식있음: !!표본.서식있음, 배율: Math.min(1, Math.max(0.5, 표본.배율 || 1)),
    칸: 칸너비들, 서식: 서식들, 줄: 줄들, 틀줄, 끼움: 품목앞줄[0] ?? 줄들.length,
    품목그림, 그림: {},
  };
  return { 모양, 그림재료 };
}

function 칸덮나(칸, c, 칸들) {
  const i = 칸들.indexOf(칸.c);
  return i >= 0 && 칸들.slice(i, i + (칸.cs ?? 1)).includes(c);
}

/* ── 식 계산 ────────────────────────── */
/* 양식 합계 칸의 식을 그대로 셉니다. 네 칙·SUM·SUBTOTAL·ROUND 만. 모르는 꼴은 null — 값을 꾸미지 않습니다. */
export function 식계산(식, 칸값, 범위값) {
  const 글 = String(식 ?? '').replace(/^=/, '').replace(/\$/g, '').toUpperCase();
  let i = 0;
  const 틈 = () => { while (글[i] === ' ') i++; };
  const 낱 = (re) => {
    틈();
    re.lastIndex = i;
    const m = re.exec(글);
    if (m) i = re.lastIndex;
    return m;
  };
  const 식하나 = () => {
    let v = 곱();
    for (;;) {
      틈();
      if (글[i] === '+') { i++; v += 곱(); } else if (글[i] === '-') { i++; v -= 곱(); } else return v;
    }
  };
  const 곱 = () => {
    let v = 낱개();
    for (;;) {
      틈();
      if (글[i] === '*') { i++; v *= 낱개(); } else if (글[i] === '/') { i++; v /= 낱개(); } else return v;
    }
  };
  const 인자 = () => {
    const 들 = [];
    for (;;) {
      const 범 = 낱(/([A-Z]{1,3}\d+):([A-Z]{1,3}\d+)/y);
      if (범) 들.push(...범위값(범[1], 범[2]));
      else 들.push(식하나());
      틈();
      if (글[i] === ',') { i++; continue; }
      if (글[i] === ')') { i++; return 들; }
      throw new Error('식');
    }
  };
  const 낱개 = () => {
    틈();
    if (글[i] === '-') { i++; return -낱개(); }
    if (글[i] === '+') { i++; return 낱개(); }
    if (글[i] === '(') {
      i++;
      const v = 식하나();
      틈();
      if (글[i++] !== ')') throw new Error('식');
      return v;
    }
    const 함수 = 낱(/([A-Z]+)\(/y);
    if (함수) {
      const 들 = 인자();
      if (함수[1] === 'SUM') return 들.reduce((a, c) => a + c, 0);
      if (함수[1] === 'SUBTOTAL' && [9, 109].includes(들[0])) return 들.slice(1).reduce((a, c) => a + c, 0);
      if (함수[1] === 'ROUND' && 들.length === 2) return Math.round(들[0] * 10 ** 들[1]) / 10 ** 들[1];
      throw new Error('식');
    }
    const 수 = 낱(/\d+(?:\.\d+)?%?/y);
    if (수) return 수[0].endsWith('%') ? parseFloat(수[0]) / 100 : parseFloat(수[0]);
    const 칸 = 낱(/[A-Z]{1,3}\d+/y);
    if (칸) {
      const v = 칸값(칸[0]);
      if (v === null || v === undefined) throw new Error('식');
      return v;
    }
    throw new Error('식');
  };
  try {
    const v = 식하나();
    틈();
    return i === 글.length && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

const 앞표 = (s) => /^[^\d-]*/.exec(String(s ?? '').trim())?.[0] ?? '';
const 자리수 = (s) => (/\.(\d+)/.exec(String(s ?? '').replace(/,/g, ''))?.[1].length ?? 0);
const 숫자글 = (n, 자리) => n.toLocaleString('en-US', { minimumFractionDigits: 자리, maximumFractionDigits: 자리 });

/** 품목표 밖 계산 칸의 값 — { 'r,c': 글 }. 양식의 식이 먼저, 식이 없는 합계 칸은 발주합계.
    글은 양식에 적힌 꼴(앞 기호·소수 자리)을 따릅니다. 합계 줄의 옛 숫자는 빈칸으로 비웁니다. */
export function 꼬리값(모양, 틀, 줄들) {
  const 결과 = {};
  const 칸표 = new Map();
  for (const 줄 of 모양.줄) for (const 칸 of 줄.칸) 칸표.set(`${줄.r},${칸.c}`, 칸);
  const 합계줄 = new Map((틀.합계 ?? []).map((x) => [x.r, x]));
  const 합 = 발주합계(틀, 줄들);
  const 있나 = (줄들 ?? []).length > 0;
  const 품목칸 = new Map(틀.칸.map((k) => [k.c, k]));
  const 열합 = (c) => {
    const k = 품목칸.get(c);
    return k ? 줄들.map((줄, i) => 대조숫자(줄값(k, 줄, i, 틀).값)).filter((n) => n !== null) : [];
  };
  const 자리꼴 = (주소) => {
    const m = /^([A-Z]{1,3})(\d+)$/.exec(주소);
    return { r: Number(m[2]) - 1, c: 칸번호(m[1]) };
  };
  const 보는중 = new Set();
  const 칸값 = (주소) => {
    const { r, c } = 자리꼴(주소);
    if (r >= 틀.시작 && r < 틀.끝) return null;          // 품목 한 줄을 집은 식 — 줄이 바뀌면 뜻이 없습니다
    const 칸 = 칸표.get(`${r},${c}`);
    if (!칸) return 0;
    if (칸.f) {
      if (보는중.has(주소)) return null;
      보는중.add(주소);
      const v = 식계산(칸.f, 칸값, 범위값);
      보는중.delete(주소);
      return v;
    }
    return 칸.t ? 대조숫자(칸.t) : 0;
  };
  const 범위값 = (가, 나) => {
    const s = 자리꼴(가), e = 자리꼴(나);
    if (s.r < 틀.끝 && e.r >= 틀.시작) {
      const 값 = [];
      for (let c = s.c; c <= e.c; c++) 값.push(...열합(c));
      return 값;
    }
    const 값 = [];
    for (let r = s.r; r <= e.r; r++) for (let c = s.c; c <= e.c; c++) {
      const 칸 = 칸표.get(`${r},${c}`);
      const v = 칸?.f ? 식계산(칸.f, 칸값, 범위값) : 칸?.t ? 대조숫자(칸.t) : null;
      if (v !== null && v !== undefined) 값.push(v);
    }
    return 값;
  };
  for (const 줄 of 모양.줄) {
    const 합줄 = 합계줄.get(줄.r);
    for (const 칸 of 줄.칸) {
      const 자리 = `${줄.r},${칸.c}`;
      const 키 = 품목칸.get(칸.c)?.키;
      let n = null;
      if (칸.f) n = 식계산(칸.f, 칸값, 범위값);
      if (n !== null) {
        결과[자리] = 있나 ? 앞표(칸.t) + 숫자글(n, 자리수(칸.t)) : '';
        continue;
      }
      if (!합줄) continue;
      if (칸.t && 대조숫자(칸.t) === null) continue;     // 합계 낱말
      if (!칸.f && !칸.t) continue;
      if (합줄.비율 != null) {
        결과[자리] = 합.비율줄.find((x) => x.라벨 === 합줄.라벨)?.값 ?? '';
        continue;
      }
      결과[자리] = 키 ? 합.칸[키] ?? '' : '';
    }
  }
  return 결과;
}
