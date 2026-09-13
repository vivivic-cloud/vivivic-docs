import { STAGES, ASIDE, buildBatches, suggestKeyword, glossCJK, readCipl, parseBatch } from './parse.js';
import * as FS from './fsaccess.js';
import * as DB from './firebase.js';

const state = {
  user: null,
  demo: false,
  root: null,        // 저장된 폴더 핸들 (있으면 파일을 바로 열 수 있습니다)
  files: [],
  batches: [],
  unassigned: [],
  boxes: [],            // 거래처 안에 손으로 만든 박스
  overlay: {},
  rules: [],
  excluded: [],
  selected: new Set(),
  assignMode: 'assign',
  filter: { vendor: null, status: null, q: '' },
  openId: null,
  ciplBusy: new Set(),
  viewer: { list: [], idx: 0 },
  unsub: [],
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => (n == null ? '' : Number(n).toLocaleString('ko-KR'));
const fmtSize = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/* ── 부팅 ─────────────────────────────────────────────── */

async function boot() {
  $('#loginForm').onsubmit = doSignIn;
  // 지난번 이메일을 채워 둔다 (비밀번호는 저장하지 않는다 — 폰 암호 관리자가 채운다)
  try {
    const last = localStorage.getItem('docs.lastEmail');
    if (last) {
      $('#email').value = last;
      setTimeout(() => $('#password').focus(), 60);
    }
  } catch (e) {}
  $('#demoLink').onclick = loadDemo;
  $('#btnSignOut').onclick = () => DB.signOut();
  $('#btnSync').onclick = $('#btnSync2').onclick = syncFromFolder;
  $('#scrim').onclick = closeDrawer;
  $('#panelScrim').onclick = closePanel;
  $('#btnRules').onclick = () => openPanel('rules');
  $('#btnExcluded').onclick = () => openPanel('excluded');
  $('#btnAssign').onclick = () => openAssign('assign');
  $('#btnExclude').onclick = () => openAssign('exclude');
  $('#btnClearSel').onclick = clearSelection;
  $('#asCancel').onclick = closeAssign;
  $('#asSave').onclick = saveAssign;
  $('#asRule').onchange = (e) => ($('#asKeyword').hidden = !e.target.checked);
  $('#viewerClose').onclick = closeViewer;
  $('#viewerPrev').onclick = () => stepViewer(-1);
  $('#viewerNext').onclick = () => stepViewer(1);
  $('#btnConnect').onclick = () => connectFolder().then((ok) => ok && renderConnectState());
  $('#search').oninput = (e) => { state.filter.q = e.target.value.trim(); render(); };
  document.addEventListener('keydown', (e) => {
    if (!$('#viewerScrim').hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      return stepViewer(e.key === 'ArrowLeft' ? -1 : 1);
    }
    if (e.key !== 'Escape') return;
    if (!$('#viewerScrim').hidden) return closeViewer();
    if (!$('#assignScrim').hidden) return closeAssign();
    if (!$('#panelScrim').hidden) return closePanel();
    closeDrawer();
  });

  if (!FS.supported) {
    $('#unsupported').hidden = false;
    $('#btnSync2').disabled = true;
  }

  const forced = typeof SINGLE_FILE !== 'undefined' && SINGLE_FILE;
  if (forced || new URLSearchParams(location.search).has('demo')) return loadDemo();

  showLogin();
  try {
    await DB.watchAuth(async (user) => {
      state.user = user;
      if (!user) return showLogin();
      await enterApp(user);
    });
  } catch {
    const err = $('#loginError');
    err.textContent = '클라우드에 연결하지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.';
    err.hidden = false;
    $('#loginBtn').disabled = true;
  }
}

function showLogin() {
  for (const u of state.unsub) u();
  state.unsub = [];
  $('#login').hidden = false;
  $('#app').hidden = true;
}

async function enterApp(user) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#userEmail').textContent = user.email ?? '';
  $('#btnSignOut').hidden = false;
  $('#btnSync').hidden = !FS.supported;
  cloud('연결됨');

  // 이 기기에 폴더 권한이 남아 있으면 파일을 바로 열 수 있습니다
  if (FS.supported) {
    const h = await FS.loadHandle().catch(() => null);
    if (h && (await FS.ensurePermission(h))) state.root = h;
  }
  renderConnectState();
  checkForUpdate();
  askSync();

  state.unsub.push(
    DB.watchFiles((files) => { state.files = files; applyParse(); }),
    DB.watchOverlay((ov) => { state.overlay = ov; render(); }),
    DB.watchRules((rules) => { state.rules = rules; applyParse(); }),
    DB.watchBoxes((boxes) => { state.boxes = boxes; window.docsBoxesChanged?.(); })
  );
}

async function doSignIn(e) {
  e.preventDefault();
  const btn = $('#loginBtn');
  const err = $('#loginError');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = '들어가는 중…';
  try {
    const _email = $('#email').value.trim();
    await DB.signIn(_email, $('#password').value);
    try { localStorage.setItem('docs.lastEmail', _email); } catch (e) {}
  } catch (ex) {
    err.textContent = DB.authMessage(ex.code);
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '로그인';
  }
}

async function loadDemo() {
  const data = typeof DEMO !== 'undefined' ? DEMO : await fetch('./data/demo.json').then((r) => r.json());
  state.demo = true;
  state.files = data.files;
  state.overlay = data.overlay ?? {};
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#userEmail').textContent = '데모';
  cloud('데모 데이터');
  renderConnectState();
  applyParse();
}

function cloud(text) {
  $('#cloudState').textContent = text;
}

function applyParse() {
  const { batches, unassigned, excluded } = buildBatches(state.files, state.rules);
  state.batches = batches;
  state.unassigned = unassigned;
  state.excluded = excluded;
  const has = state.files.length > 0;
  $('#empty').hidden = has;
  $('#dash').hidden = !has;
  render();
  window.docsHomeRefresh?.();
}

/* ── 켤 때 드라이브 한 번 확인 ────────────────────────── */

/**
 * 앱을 켜거나 새로고침하면 Apps Script 에 "드라이브 좀 봐줘" 하고 부릅니다.
 * 바뀐 게 없으면 저쪽에서 지문만 비교하고 끝나므로 부담이 없습니다.
 * 답은 안 받습니다 — 결과는 어차피 Firestore 구독으로 흘러들어옵니다.
 *
 * 새로고침을 연달아 눌러도 1분에 한 번만 부릅니다.
 */
const SYNC_GAP = 60_000;

async function askSync() {
  if (state.demo) return;
  try {
    const last = Number(sessionStorage.getItem('lastAsk') ?? 0);
    if (Date.now() - last < SYNC_GAP) return;

    const url = await DB.syncUrl();
    if (!url) return; // 아직 웹앱을 배포하지 않았으면 조용히 넘어갑니다

    sessionStorage.setItem('lastAsk', String(Date.now()));
    cloud('드라이브 확인 중…');
    // 다른 출처라 응답은 못 읽습니다. 부르기만 하면 됩니다.
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    cloud('연결됨');
  } catch {
    cloud('연결됨');
  }
}

/* ── 드라이브 스캔 → 클라우드 업로드 ──────────────────── */

async function syncFromFolder() {
  if (state.demo) return toast('데모 모드에서는 올릴 수 없습니다.');
  try {
    const root = state.root ?? (await FS.pickFolder());
    if (!(await FS.ensurePermission(root, { prompt: true }))) return toast('폴더 권한이 필요합니다.');
    state.root = root;

    cloud('폴더 읽는 중…');
    const { files } = await FS.scan(root, { onProgress: (n) => cloud(`${n}개 읽는 중…`) });

    cloud('올리는 중…');
    await DB.replaceFiles(files, (done, total) => cloud(`올리는 중 ${done}/${total}`));
    cloud('연결됨');
    toast(`${files.length}개 파일을 올렸습니다.`);
  } catch (e) {
    cloud('연결됨');
    if (e?.name !== 'AbortError') toast(`실패: ${e.message}`);
  }
}

/* ── 렌더 ─────────────────────────────────────────────── */

function visible() {
  const { vendor, status, q } = state.filter;
  const needle = q.toLowerCase();
  return state.batches.filter((b) => {
    if (vendor && b.vendor !== vendor) return false;
    if (status === 'issue' && !b.issues.length) return false;
    if (status && status !== 'issue' && b.status !== status) return false;
    if (needle) {
      const hay = `${b.vendor} ${b.batch} ${b.docs.map((d) => d.display).join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * 파일 위에 마우스를 올렸을 때 뜨는 설명.
 * 중국어 파일명이면 대충이라도 무슨 서류인지 같이 보여줍니다.
 */
function fileTitle(d) {
  const gloss = glossCJK(d.name ?? d.display);
  return gloss ? `${d.path}\n\n${gloss}` : d.path;
}

/**
 * 이름에 차수가 없는데 묶음에 들어온 서류에 근거를 달아 줍니다.
 * 번호로 이은 건 확실하고, 선적일로 이은 건 추정입니다.
 */
function linkBadge(d) {
  if (d.joinedBy)
    return `<span class="text-[10px] font-bold text-info bg-chip rounded px-1.5 py-0.5 shrink-0"
                  title="${esc(`문서번호 ${d.joinedBy} 가 같아 이 묶음에 넣었습니다`)}">번호</span>`;
  if (d.guessed)
    return `<span class="text-[10px] font-bold text-warn bg-[#fdf3e3] rounded px-1.5 py-0.5 shrink-0"
                  title="${esc(`${d.guessed} — 추정입니다`)}">추정</span>`;
  return '';
}

/**
 * 같은 파일이 여러 벌이면 몇 벌인지 배지로 붙입니다.
 * 목록에는 한 건만 나오므로, 나머지가 어디 있는지는 툴팁으로 봅니다.
 */
function copyBadge(d) {
  if (!d.copies?.length) return '';
  const where = d.copies.join('\n');
  return `<span class="text-[10px] font-bold text-faint bg-chip rounded px-1.5 py-0.5 shrink-0"
                title="${esc(`같은 파일이 여기에도 있습니다:\n${where}`)}">${d.copies.length + 1}벌</span>`;
}

/** 단계 키 → 짧은 이름. 검색 결과에 배지로 붙입니다. */
const STAGE_LABEL = Object.fromEntries([...STAGES, ...ASIDE].map((s) => [s.key, s.short ?? s.label]));

/**
 * 검색어에 걸리는 파일을 전부 모읍니다.
 * 차수에 붙은 것뿐 아니라 미분류·제외된 것까지 — 스캔한 파일이면 다 나옵니다.
 */
function fileHits() {
  const { vendor, q } = state.filter;
  const needle = q.toLowerCase();
  if (!needle) return [];
  const all = [
    ...state.batches.flatMap((b) => b.docs.map((d) => ({ ...d, where: `${b.batch}차`, batchId: b.id }))),
    ...state.unassigned.map((d) => ({ ...d, where: '차수 없음' })),
    ...state.excluded.map((d) => ({ ...d, where: '제외됨', off: true })),
  ];
  return all.filter((d) => {
    if (vendor && d.vendor !== vendor) return false;
    return `${d.display} ${d.path}`.toLowerCase().includes(needle);
  });
}

function renderFileHits() {
  const box = $('#fileHits');
  box.hidden = !state.filter.q;
  if (box.hidden) return;

  const hits = fileHits();
  const shown = hits.slice(0, 200);
  const row = (d) => `
    <li class="py-2 flex items-center gap-3 ${d.off ? 'opacity-55' : ''}">
      <button data-file="${esc(d.path)}" title="${esc(fileTitle(d))}"
              class="text-left text-[13px] text-info hover:underline truncate min-w-0 flex-1">${esc(d.display)}</button>
      ${linkBadge(d)}${copyBadge(d)}
      <span class="text-[11px] font-semibold text-faint shrink-0">${esc(d.vendor)}</span>
      <span class="text-[11px] font-bold shrink-0 w-[64px] text-right ${d.off ? 'text-faint' : ''}">${esc(d.where)}</span>
      <span class="text-[11px] text-faint shrink-0 w-[80px] text-right">${esc(STAGE_LABEL[d.stageKey] ?? '')}</span>
      <span class="text-[11px] text-faint shrink-0 w-[74px] text-right">${esc(d.date ?? '')}</span>
    </li>`;

  box.innerHTML = `
    <div class="card p-5">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-[13px] font-bold text-faint tracking-wide">파일 검색</h2>
        <span class="text-[12px] text-faint font-semibold">${hits.length}건</span>
        ${hits.length > shown.length ? `<span class="text-[11px] text-faint">· 앞 ${shown.length}건만 보입니다</span>` : ''}
      </div>
      ${hits.length
        ? `<ul class="divide-y divide-line">${shown.map(row).join('')}</ul>`
        : '<p class="text-[13px] text-muted">이름에 걸리는 파일이 없습니다.</p>'}
    </div>`;

  for (const el of box.querySelectorAll('[data-file]')) {
    el.onclick = () => openDoc(hits.find((d) => d.path === el.dataset.file));
  }
}

function render() {
  if ($('#dash').hidden) return;
  renderKpis();
  renderChips();
  renderFileHits();
  renderGrid();
  renderDefine();
  window.docsHomeRefresh?.();
  if (state.openId) renderDrawer(state.openId);
}

function renderKpis() {
  const all = state.batches;
  const cards = [
    ['진행 중', all.filter((b) => b.status === 'active').length, 'text-info'],
  ];
  $('#kpis').innerHTML = cards
    .map(([label, value, cls]) => `
      <div class="card px-5 py-4">
        <div class="text-[11px] font-bold text-faint tracking-wide mb-1">${label}</div>
        <div class="text-[26px] font-bold leading-none ${cls}">${value}</div>
      </div>`)
    .join('');
}

function renderChips() {
  const vendors = [...new Set(state.batches.map((b) => b.vendor))].sort();
  const chip = (label, on, act) =>
    `<button class="chip ${on ? 'chip-on' : 'chip-off'}" data-act="${act}">${esc(label)}</button>`;

  $('#vendorChips').innerHTML =
    chip('전체 거래처', !state.filter.vendor, 'v:') + vendors.map((v) => chip(v, state.filter.vendor === v, `v:${v}`)).join('');

  $('#statusChips').innerHTML = [
    chip('전체', !state.filter.status, 's:'),
    chip('진행 중', state.filter.status === 'active', 's:active'),
    chip('완료', state.filter.status === 'done', 's:done'),
    chip('문제 있음', state.filter.status === 'issue', 's:issue'),
  ].join('');

  for (const el of document.querySelectorAll('[data-act]')) {
    el.onclick = () => {
      const [kind, val] = el.dataset.act.split(':');
      if (kind === 'v') state.filter.vendor = val || null;
      else state.filter.status = val || null;
      render();
    };
  }
}

/* 일곱 단계를 동그란 점 일곱 개로 — 끝난 것은 찬 점, 아직은 빈 점.
   에이엠티 공정관리의 그 점과 같은 크기(6px)로 맞췄습니다. 단계는 늘 일곱이라
   줄을 넘지 않습니다. 무엇이 끝났는지는 원래 쓰던 판정을 그대로 씁니다. */
function stageDots(b) {
  return STAGES.map((s) => {
    const filled = b.stages.find((x) => x.key === s.key).docs.length > 0;
    return `<span title="${s.id}. ${esc(s.label)}" class="w-1.5 h-1.5 rounded-full shrink-0 ${filled ? 'bg-ink' : 'bg-line'}"></span>`;
  }).join('');
}

function renderGrid() {
  const list = visible();
  $('#emptyState').hidden = list.length > 0;
  $('#grid').innerHTML = list
    .map((b) => {
      const warn = b.issues.filter((i) => i.level === 'warn').length;
      const info = b.issues.filter((i) => i.level === 'info').length;
      return `
      <button class="card p-3.5 text-left hover:border-ink/25 hover:shadow transition-all" data-open="${esc(b.id)}">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div>
            <div class="text-[11px] font-bold text-faint tracking-wide">${esc(b.vendor)}</div>
            <div class="text-[16px] font-bold leading-tight">${esc(b.batch)}차</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[15px] font-bold leading-tight">${b.done}<span class="text-faint text-[12px]">/7</span></div>
          </div>
        </div>
        <div class="flex items-center gap-[3px] mb-2">${stageDots(b)}</div>
        <div class="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
          ${b.lastDate ? `<span class="text-faint">최근 ${esc(b.lastDate)}</span>` : ''}
          <span class="text-faint">서류 ${b.docs.length}건</span>
          ${warn ? `<span class="text-warn">이상 ${warn}</span>` : ''}
          ${info ? `<span class="text-faint">중복 ${info}</span>` : ''}
        </div>
      </button>`;
    })
    .join('');

  for (const el of document.querySelectorAll('[data-open]')) el.onclick = () => openDrawer(el.dataset.open);
}

const LOOSE_LABEL = {
  ...Object.fromEntries(STAGES.map((x) => [x.key, `${x.label} · 차수 미상`])),
  dev: '제품개발 자료',
  fta: 'FTA · 원산지',
  etc: '분류하지 못한 파일',
};

function renderDefine() {
  const hasAny = state.unassigned.length || state.excluded.length || state.rules.length;
  $('#define').hidden = !hasAny;
  if (!hasAny) return;

  const shown = state.filter.vendor
    ? state.unassigned.filter((d) => d.vendor === state.filter.vendor || !d.vendor || d.vendor === '(루트)')
    : state.unassigned;
  $('#defineCount').textContent =
    shown.length === state.unassigned.length ? `${state.unassigned.length}건` : `${shown.length}건 / 전체 ${state.unassigned.length}건`;
  $('#ruleCount').textContent = state.rules.length ? String(state.rules.length) : '';
  $('#excludedCount').textContent = state.excluded.length ? String(state.excluded.length) : '';

  // 거래처별로 묶습니다. 차수를 못 읽었어도 어느 거래처 것인지는 아는 경우가 대부분이라,
  // 파일 종류로 쪼개는 것보다 거래처로 모아 보는 편이 손이 덜 갑니다.
  const UNKNOWN = '거래처를 모르는 파일';
  const vendorOf = (d) => (!d.vendor || d.vendor === '(루트)' ? UNKNOWN : d.vendor);

  const groups = new Map();
  for (const d of state.unassigned) {
    const key = vendorOf(d);
    // 거래처 칩을 골라 두면 그 거래처 것만 봅니다. 모르는 파일은 늘 남겨 둡니다.
    if (state.filter.vendor && key !== state.filter.vendor && key !== UNKNOWN) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  // 거래처를 모르는 묶음은 늘 맨 끝입니다.
  const order = [...groups.entries()].sort((a, b) => {
    if (a[0] === UNKNOWN) return 1;
    if (b[0] === UNKNOWN) return -1;
    return b[1].length - a[1].length;
  });

  $('#looseGroups').innerHTML = order
    .map(([key, docs]) => `
      <div class="card p-5 ${key === UNKNOWN ? 'border-warn/40' : ''}">
        <div class="flex items-center gap-2 mb-3">
          <button class="text-[11px] font-bold text-info hover:underline" data-pick="${esc(key)}">전체 선택</button>
          <span class="font-bold text-[14px] ml-1">${esc(key)}</span>
          <span class="ml-auto text-[12px] text-faint font-semibold">${docs.length}건</span>
        </div>
        ${key === UNKNOWN
          ? '<p class="text-[11px] text-muted mb-2 leading-relaxed">파일명·폴더·서류 안 어디에도 거래처를 가리키는 게 없습니다.</p>'
          : ''}
        <ul class="space-y-0.5 max-h-[280px] overflow-y-auto pr-1">
          ${docs.map((d) => row(d)).join('')}
        </ul>
      </div>`)
    .join('');

  for (const el of $('#looseGroups').querySelectorAll('[data-sel]')) {
    el.onclick = (e) => {
      if (e.target.tagName === 'A') return;
      // 체크박스를 누르면 선택, 파일명을 누르면 실제 내용을 봅니다.
      if (e.target.closest('[data-check]')) return toggleSelect(el.dataset.sel);
      const doc = state.unassigned.find((d) => d.path === el.dataset.sel);
      if (doc) openDoc(doc);
    };
  }
  for (const el of $('#looseGroups').querySelectorAll('[data-pick]')) {
    el.onclick = () => {
      const docs = groups.get(el.dataset.pick) ?? [];
      const allOn = docs.every((d) => state.selected.has(d.path));
      docs.forEach((d) => {
        allOn ? state.selected.delete(d.path) : state.selected.add(d.path);
        paintRow(d.path);
      });
      renderActionBar();
    };
  }
  renderActionBar();

  function row(d) {
    const on = state.selected.has(d.path);
    return `
      <li data-sel="${esc(d.path)}"
          class="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all
                 ${on ? 'bg-chip' : 'hover:bg-hover'}">
        <span data-check="${esc(d.path)}" class="w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[10px] font-bold
              ${on ? 'bg-ink border-ink text-white' : 'border-line bg-white'}">${on ? '✓' : ''}</span>
        <span class="text-[12px] truncate" title="${esc(fileTitle(d))}">${esc(d.display)}</span>
        <span class="ml-auto shrink-0 text-[10px] font-bold text-faint">${esc(STAGE_LABEL[d.stageKey] ?? d.stageKey)}</span>
      </li>`;
  }
}

function toggleSelect(path) {
  if (state.selected.has(path)) state.selected.delete(path);
  else state.selected.add(path);
  paintRow(path);
  renderActionBar();
}

/** 목록 전체를 다시 그리지 않고 해당 줄만 칠합니다 (스크롤 유지). */
function paintRow(path) {
  const li = $('#looseGroups').querySelector(`[data-sel="${CSS.escape(path)}"]`);
  if (!li) return;
  const on = state.selected.has(path);
  li.className = `flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all ${on ? 'bg-chip' : 'hover:bg-hover'}`;
  const box = li.firstElementChild;
  box.className = `w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[10px] font-bold ${on ? 'bg-ink border-ink text-white' : 'border-line bg-white'}`;
  box.textContent = on ? '\u2713' : '';
}

function renderActionBar() {
  const n = state.selected.size;
  $('#actionBar').hidden = n === 0;
  $('#selCount').textContent = `${n}건 선택`;
}

function clearSelection() {
  const paths = [...state.selected];
  state.selected.clear();
  paths.forEach(paintRow);
  renderActionBar();
}

/* ── 지정 모달 ────────────────────────────────────────── */

function openAssign(mode) {
  if (!state.selected.size) return;
  state.assignMode = mode;
  const paths = [...state.selected];
  const first = state.unassigned.find((d) => d.path === paths[0]);

  $('#assignScrim').querySelector('h3').textContent = mode === 'exclude' ? '선택한 파일 제외' : '선택한 파일 지정';
  $('#assignSummary').textContent =
    paths.length === 1 ? first?.display ?? paths[0] : `${paths.length}건 · ${first?.display ?? ''} 외`;

  const isAssign = mode === 'assign';
  $('#asVendor').closest('label').hidden = !isAssign;
  $('#asStage').closest('label').hidden = !isAssign;
  $('#asBatch').closest('label').hidden = !isAssign;
  $('#asVendorNew').hidden = true;
  $('#asBatchNew').hidden = true;
  $('#asBatchDocs').innerHTML = '';

  $('#asStage').innerHTML =
    '<option value="">그대로</option>' +
    STAGES.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join('') +
    '<option value="dev">제품개발</option><option value="fta">FTA · 원산지</option>';
  $('#asStage').value = '';

  const vendors = [...new Set(state.batches.map((b) => b.vendor))].sort();
  $('#asVendor').innerHTML =
    '<option value="">그대로</option>' +
    vendors.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('') +
    '<option value="__new__">+ 새 거래처</option>';
  $('#asVendor').value = first?.vendor && vendors.includes(first.vendor) ? first.vendor : '';

  const syncBatchOptions = () => {
    const vendorSel = $('#asVendor').value;
    const vendor = vendorSel === '__new__' ? '' : vendorSel || first?.vendor || '';
    const batches = [...new Set(state.batches.filter((b) => !vendor || b.vendor === vendor).map((b) => b.batch))]
      .sort()
      .reverse();
    $('#asBatch').innerHTML =
      '<option value="">그대로</option>' +
      batches.map((b) => `<option value="${esc(b)}">${esc(b)}차</option>`).join('') +
      '<option value="__new__">+ 새 차수</option>';
    $('#asBatch').value = '';
    $('#asBatchNew').hidden = true;
    $('#asBatchDocs').innerHTML = '';
  };
  syncBatchOptions();

  $('#asVendor').onchange = () => {
    $('#asVendorNew').hidden = $('#asVendor').value !== '__new__';
    syncBatchOptions();
  };

  $('#asBatch').onchange = () => {
    const val = $('#asBatch').value;
    $('#asBatchNew').hidden = val !== '__new__';
    if (!val || val === '__new__') return ($('#asBatchDocs').innerHTML = '');
    const vendorSel = $('#asVendor').value;
    const vendor = vendorSel === '__new__' ? '' : vendorSel || first?.vendor || '';
    const b = state.batches.find((x) => x.vendor === vendor && x.batch === val);
    const docs = b?.docs ?? [];
    $('#asBatchDocs').innerHTML = docs.length
      ? `<div class="text-[11px] font-bold text-faint tracking-wide mb-1.5">${esc(vendor)} ${esc(val)}차의 다른 파일 — 눌러서 실제 내용 확인</div>
         <ul class="space-y-0.5 max-h-[160px] overflow-y-auto border border-line rounded-lg p-2">
           ${docs.map((d) => `<li><button type="button" data-asdoc="${esc(d.path)}"
             class="text-left text-[12px] text-info hover:underline truncate w-full">${esc(d.display)}</button></li>`).join('')}
         </ul>`
      : `<p class="text-[11px] text-faint">이 차수에는 아직 다른 파일이 없습니다.</p>`;
    for (const el of $('#asBatchDocs').querySelectorAll('[data-asdoc]')) {
      el.onclick = () => openDoc(docs.find((d) => d.path === el.dataset.asdoc));
    }
  };

  $('#asRule').checked = paths.length > 1;
  $('#asKeyword').value = first ? suggestKeyword(first.name) : '';
  $('#asKeyword').hidden = !$('#asRule').checked;
  $('#assignScrim').hidden = false;
}

const closeAssign = () => ($('#assignScrim').hidden = true);

async function saveAssign() {
  const paths = [...state.selected];
  const mode = state.assignMode;
  const useRule = $('#asRule').checked;
  const keyword = $('#asKeyword').value.trim();

  const vendorSel = $('#asVendor').value;
  const vendor = vendorSel === '__new__' ? $('#asVendorNew').value.trim() : vendorSel;
  const batchSel = $('#asBatch').value;
  // 손으로 적어 넣은 차수도 파일명에서 읽을 때와 같은 잣대로 받습니다.
  // 여기가 헐거워서 '99-99' 같은 없는 차수가 규칙으로 굳어, 카드로 떠 있었습니다.
  const 적은차수 = batchSel === '__new__' ? $('#asBatchNew').value.trim() : '';
  const batch = batchSel === '__new__' ? (parseBatch(`${적은차수}차`)?.label ?? '') : batchSel;
  if (적은차수 && !batch) return toast(`'${적은차수}' 같은 차수는 없습니다. 26-18 처럼 적어 주세요.`);

  const body =
    mode === 'exclude'
      ? { action: 'exclude' }
      : {
          action: 'assign',
          ...(batch ? { batch } : {}),
          ...($('#asStage').value ? { stageKey: $('#asStage').value } : {}),
          ...(vendor ? { vendor } : {}),
        };

  if (mode === 'assign' && !body.batch && !body.stageKey && !body.vendor)
    return toast('지정할 값을 하나는 넣어주세요.');
  if (useRule && !keyword) return toast('규칙으로 쓸 키워드를 넣어주세요.');

  const rules = useRule
    ? [{ ...body, matchType: 'contains', match: keyword, note: `${paths.length}건에서 만듦` }]
    : paths.map((path) => ({ ...body, matchType: 'path', match: path }));

  if (state.demo) {
    closeAssign();
    return toast('데모 모드라 저장하지 않습니다.');
  }
  try {
    await DB.saveRules(rules, state.user?.email);
    closeAssign();
    clearSelection();
    toast(useRule ? `규칙 저장 — "${keyword}"` : `${rules.length}건 지정했습니다.`);
  } catch (e) {
    toast(`저장 실패: ${e.message}`);
  }
}


/* ── 드라이브 미리보기 ───────────────────────────────── */

const driveEmbed = (id) => `https://drive.google.com/file/d/${id}/preview`;
const driveOpen = (id) => `https://drive.google.com/file/d/${id}/view`;
const driveThumb = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const driveSearch = (name) => `https://drive.google.com/drive/search?q=${encodeURIComponent(name)}`;

/** 브라우저가 그대로 그려줄 수 있는 확장자 */
const INLINE_KIND = {
  pdf: 'pdf',
  jpg: 'img', jpeg: 'img', png: 'img', gif: 'img', webp: 'img', bmp: 'img', svg: 'img',
  txt: 'txt', csv: 'txt', json: 'txt', md: 'txt',
  // html은 살아있는 도구인 경우가 많습니다 — 눈으로만 보게 따로 다룹니다.
  html: 'tool',
  // 거래처 발주서·인보이스 대부분이 엑셀입니다 — 표로 직접 그려서 보여줍니다.
  xlsx: 'sheet', xls: 'sheet', xlsm: 'sheet',
};

/** 미리보기용 blob URL을 칸별로 하나씩만 들고 있다가 반납합니다. */
const blobUrls = new Map();
function keepBlob(ns, url) {
  const old = blobUrls.get(ns);
  if (old) URL.revokeObjectURL(old);
  if (url) blobUrls.set(ns, url);
  else blobUrls.delete(ns);
}

/**
 * 파일을 빠르게 몇 개씩 넘기면 이전 파일 읽기가 끝나기 전에 다음 파일 읽기가 시작됩니다.
 * 늦게 끝난 이전 요청이 지금 화면에 떠 있는 blob을 지워버리면 방금 전 파일이 갑자기
 * 안 보이게 됩니다 — 이 토큰으로 "지금 보여줘야 할 요청"이 맞는지 확인하고, 아니면 조용히 버립니다.
 */
const previewToken = new Map();

/** 파일 안을 직접 볼 수 있는 칸. 날짜·금액을 눈으로 확인하는 용도입니다. */
function previewPane(doc, ns = 'pv') {
  const link = doc.driveId ? driveOpen(doc.driveId) : driveSearch(doc.display);
  return `
    <div class="flex flex-col h-full">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-[11px] font-bold text-faint tracking-wide">파일 내용</span>
        <a href="${link}" target="_blank" rel="noopener"
           class="ml-auto text-[11px] font-bold text-info hover:underline">
          ${doc.driveId ? '드라이브에서 열기 ↗' : '드라이브에서 찾기 ↗'}</a>
      </div>
      <div id="${ns}Box"
           class="flex-1 min-h-[420px] rounded-lg border border-line bg-hover overflow-hidden
                  flex items-center justify-center text-[12px] text-faint">불러오는 중…</div>
      <p id="${ns}Note" class="text-[11px] text-faint mt-2"></p>
    </div>`;
}

/**
 * 미리보기 칸을 채웁니다.
 * 1) 이 기기에 폴더가 연결돼 있으면 원본을 직접 읽어 그립니다 — 가장 확실합니다
 * 2) 아니면 드라이브 미리보기를 끼웁니다 (브라우저가 구글 쿠키를 막으면 빈 화면이 됩니다)
 * 3) 둘 다 없으면 폴더를 연결하도록 안내합니다
 */
const shownPath = new Map();

async function fillPreview(doc, ns = 'pv', { force = false } = {}) {
  const box = document.getElementById(`${ns}Box`);
  const note = document.getElementById(`${ns}Note`);
  if (!box) return;
  // 같은 파일을 다시 그리면 PDF가 처음으로 되감깁니다. 그대로 둡니다.
  if (!force && shownPath.get(ns) === doc.path && box.dataset.filled === '1') return;
  shownPath.set(ns, doc.path);
  box.dataset.filled = '1';

  // 여러 파일을 빠르게 넘기면 이 호출들이 겹칩니다. 내 차례가 아직 유효한지 표시해 둡니다.
  const myToken = (previewToken.get(ns) ?? 0) + 1;
  previewToken.set(ns, myToken);
  const stale = () => previewToken.get(ns) !== myToken;

  // 이 기기 폴더가 가장 확실합니다. 구글 로그인·쿠키 상태를 타지 않습니다.
  let file = null;
  let readError = null;
  if (state.root) {
    try {
      // 아이클라우드 미다운로드 파일 등으로 하염없이 걸리는 경우 10초면 포기합니다.
      file = await Promise.race([
        FS.getFileByPath(state.root, doc.path),
        new Promise((_, rej) => setTimeout(() => rej(new Error('10초 넘게 응답이 없습니다')), 10_000)),
      ]);
    } catch (e) {
      readError = e;
    }
    // 기다리는 동안 다른 파일로 넘어갔으면, 지금 화면에 떠 있는 blob을 건드리지 않고 조용히 그만둡니다.
    if (stale()) return;
  }

  if (file) {
    const kind = INLINE_KIND[(doc.name.split('.').pop() ?? '').toLowerCase()];
    const url = URL.createObjectURL(file);
    keepBlob(ns, url);
    box.className = 'flex-1 min-h-[420px] rounded-lg border border-line bg-hover overflow-auto';
    if (kind === 'pdf' || kind === 'txt') {
      box.innerHTML = `<iframe src="${url}" title="${esc(doc.display)}" class="w-full h-full min-h-[420px]"></iframe>`;
    } else if (kind === 'tool') {
      // html은 그 자체로 동작하는 도구인 경우가 많습니다.
      // 화면은 그대로 그리되 클릭은 막아서, 실수로 버튼(초기화 등)을 누르는 사고를 막습니다.
      box.innerHTML = `<iframe src="${url}" title="${esc(doc.display)}" sandbox="allow-scripts"
                               class="w-full h-full min-h-[420px] pointer-events-none"></iframe>`;
      const ifr = box.querySelector('iframe');
      box.onwheel = (e) => {
        // sandbox 때문에 안(cross-origin)으로 스크롤을 못 넘겨줄 때도 있습니다 —
        // 그럴 때는 막지 말고 그대로 흘려보내서 바깥(모달) 스크롤이 되게 둡니다.
        try {
          ifr.contentWindow.scrollBy(0, e.deltaY);
          e.preventDefault();
        } catch {}
      };
    } else if (kind === 'img') {
      box.innerHTML = `<img src="${url}" alt="${esc(doc.display)}" class="w-full h-auto" />`;
    } else if (kind === 'sheet') {
      let sheetError = null;
      try {
        const buf = await file.arrayBuffer();
        if (stale()) return; // 읽는 동안 다른 파일로 넘어갔으면 그만둡니다.
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const names = wb.SheetNames;
        const renderSheet = (name) => {
          const html = XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false });
          const m = /<table[\s\S]*<\/table>/.exec(html);
          return (m ? m[0] : html).replace('<table', '<table class="vv-sheet"');
        };
        const tabsHtml =
          names.length > 1
            ? `<div class="flex flex-wrap gap-1 p-2 border-b border-line bg-white sticky top-0">
                 ${names
                   .map(
                     (n, i) => `<button type="button" data-sheet="${esc(n)}"
                       class="text-[11px] font-bold px-2 py-1 rounded ${i === 0 ? 'bg-ink text-white' : 'bg-chip text-faint hover:bg-hover'}">${esc(n)}</button>`
                   )
                   .join('')}
               </div>`
            : '';
        box.className = 'flex-1 min-h-[420px] rounded-lg border border-line bg-white overflow-auto';
        box.innerHTML = `<div class="w-full h-full flex flex-col">${tabsHtml}<div id="${ns}Sheet" class="flex-1 overflow-auto p-2">${renderSheet(names[0])}</div></div>`;
        for (const btn of box.querySelectorAll('[data-sheet]')) {
          btn.onclick = () => {
            for (const b of box.querySelectorAll('[data-sheet]'))
              b.className = b.className.replace('bg-ink text-white', 'bg-chip text-faint hover:bg-hover');
            btn.className = btn.className.replace('bg-chip text-faint hover:bg-hover', 'bg-ink text-white');
            box.querySelector(`#${ns}Sheet`).innerHTML = renderSheet(btn.dataset.sheet);
          };
        }
      } catch (e) {
        sheetError = e;
      }
      if (sheetError) {
        box.className += ' flex items-center justify-center p-6';
        box.innerHTML = `
          <div class="text-center">
            <p class="text-[13px] text-muted mb-3">이 표를 읽지 못했습니다: ${esc(sheetError.message)}</p>
            <a href="${url}" download="${esc(doc.display)}" class="btn btn-ghost inline-block">내려받아서 열기</a>
          </div>`;
      }
    } else {
      box.className += ' flex items-center justify-center p-6';
      box.innerHTML = `
        <div class="text-center">
          <p class="text-[13px] text-muted mb-3">도면(dxf/dwg)처럼 브라우저가 못 그리는 형식입니다.</p>
          <a href="${url}" download="${esc(doc.display)}"
             class="btn btn-ghost inline-block">내려받아서 열기</a>
        </div>`;
    }
    if (note)
      note.textContent =
        kind === 'tool'
          ? `이 기기의 폴더에서 직접 읽었습니다 · ${fmtSize(file.size)} · 보기 전용입니다 (안의 버튼은 눌리지 않습니다)`
          : kind === 'sheet'
            ? `이 기기의 폴더에서 직접 읽었습니다 · ${fmtSize(file.size)} · 엑셀 표를 그대로 그렸습니다`
            : `이 기기의 폴더에서 직접 읽었습니다 · ${fmtSize(file.size)}`;
    return;
  }
  if (readError && note) note.textContent = `폴더에서 찾지 못했습니다: ${readError.message}`;

  // 사진은 iframe 대신 그림으로 바로 그립니다. 훨씬 빠르고 확실합니다.
  if (doc.driveId && PHOTO_EXT.test(doc.name)) {
    box.className = 'flex-1 min-h-[420px] rounded-lg border border-line bg-hover overflow-auto flex items-center justify-center';
    box.innerHTML = `<img src="${driveThumb(doc.driveId, 1600)}" alt="${esc(doc.display)}" class="max-w-full h-auto" />`;
    if (note) note.textContent = '드라이브에서 가져온 그림입니다.';
    return;
  }

  if (doc.driveId) {
    box.className = 'flex-1 min-h-[420px] rounded-lg border border-line bg-hover overflow-hidden';
    box.innerHTML = `<iframe src="${driveEmbed(doc.driveId)}" title="${esc(doc.display)}"
                             class="w-full h-full min-h-[420px]"></iframe>`;
    if (note)
      note.innerHTML =
        '칸이 비어 있으면 브라우저가 구글 쿠키를 막고 있는 것입니다. ' +
        `위 <span class="font-bold">드라이브에서 열기 ↗</span> 를 누르거나, ` +
        `<button id="${ns}Connect" class="font-bold text-info hover:underline">이 기기 폴더를 연결</button>하면 바로 보입니다.`;
  } else {
    box.className =
      'flex-1 min-h-[420px] rounded-lg border border-line bg-hover overflow-hidden flex items-center justify-center p-6';
    box.innerHTML = `
      <div class="text-center">
        <p class="text-[13px] text-muted mb-3">이 파일은 아직 미리보기 링크가 없습니다.</p>
        <button id="${ns}Connect" class="btn btn-ghost">이 기기의 중국 폴더 연결</button>
        <p class="text-[11px] text-faint mt-3">한 번 연결해 두면 모든 파일을 여기서 바로 볼 수 있습니다.</p>
      </div>`;
    if (note) note.textContent = '';
  }
  const btn = document.getElementById(`${ns}Connect`);
  if (btn)
    btn.onclick = () =>
      connectFolder().then((ok) => {
        if (!ok) return;
        renderConnectState();
        fillPreview(doc, ns, { force: true });
      });
}

/** 폴더 권한을 새로 받습니다. 사용자가 누른 순간에만 불러야 창이 뜹니다. */
async function connectFolder() {
  if (!FS.supported) {
    toast('이 브라우저는 폴더 연결을 지원하지 않습니다. 크롬·엣지에서 열어주세요.');
    return false;
  }
  try {
    const root = await FS.pickFolder();
    if (!(await FS.ensurePermission(root, { prompt: true }))) {
      toast('폴더 권한이 필요합니다.');
      return false;
    }
    state.root = root;
    toast('폴더를 연결했습니다.');
    return true;
  } catch (e) {
    if (e?.name !== 'AbortError') toast(`연결하지 못했습니다: ${e.message}`);
    return false;
  }
}

/* ── 규칙 · 제외함 패널 ───────────────────────────────── */

function openPanel(tab) {
  renderPanel(tab);
  $('#panelScrim').hidden = false;
  requestAnimationFrame(() => $('#panel').classList.remove('translate-x-full'));
}

function closePanel() {
  $('#panel').classList.add('translate-x-full');
  $('#panelScrim').hidden = true;
}

function renderPanel(tab) {
  const isRules = tab === 'rules';
  const desc = (r) => {
    if (r.action === 'exclude') return '제외';
    return [r.batch && `${r.batch}차`, r.stageKey && (STAGES.find((x) => x.key === r.stageKey)?.label ?? r.stageKey), r.vendor]
      .filter(Boolean)
      .join(' · ');
  };

  $('#panelBody').innerHTML = `
    <div class="sticky top-0 bg-white border-b border-line px-6 h-[65px] flex items-center gap-3 z-10">
      <div class="text-[17px] font-bold">${isRules ? '규칙' : '제외함'}</div>
      <span class="text-[12px] text-faint font-semibold">${isRules ? state.rules.length : state.excluded.length}건</span>
      <button id="panelClose" class="btn btn-ghost ml-auto">닫기</button>
    </div>
    <div class="p-6">
      ${
        isRules
          ? state.rules.length
            ? `<ul class="space-y-2">${state.rules
                .map(
                  (r) => `
                <li class="flex items-start gap-3 p-3 rounded-lg border border-line">
                  <div class="min-w-0">
                    <div class="text-[13px] font-semibold truncate">${esc(r.matchType === 'path' ? r.match.split('/').pop() : r.match)}</div>
                    <div class="text-[11px] text-faint mt-0.5">
                      ${r.matchType === 'path' ? '이 파일만' : r.matchType === 'regex' ? '정규식' : '이름에 포함'}
                      · ${esc(desc(r))}
                    </div>
                  </div>
                  <button class="ml-auto text-[12px] text-danger hover:underline shrink-0" data-del="${esc(r.id)}">삭제</button>
                </li>`
                )
                .join('')}</ul>`
            : '<p class="text-muted text-[13px]">아직 규칙이 없습니다. 아래 목록에서 파일을 골라 지정하면 여기에 쌓입니다.</p>'
          : state.excluded.length
            ? `<ul class="space-y-1">${state.excluded
                .map(
                  (d) => `<li class="text-[12px] text-muted truncate px-2 py-1.5 rounded hover:bg-hover" title="${esc(d.path)}">${esc(d.display)}</li>`
                )
                .join('')}</ul>`
            : '<p class="text-muted text-[13px]">제외한 파일이 없습니다.</p>'
      }
    </div>`;

  $('#panelClose').onclick = closePanel;
  for (const el of $('#panelBody').querySelectorAll('[data-del]')) {
    el.onclick = async () => {
      try {
        await DB.deleteRule(el.dataset.del);
        toast('규칙을 지웠습니다.');
      } catch (e) {
        toast(`지우지 못했습니다: ${e.message}`);
      }
    };
  }
}

/* ── 잔액서류 요약 ────────────────────────────────────── */

const SHEET_EXT = /\.(xlsx?|xlsm)$/i;

/**
 * 잔액서류(CI&PL) 엑셀을 열어 총중량·박스수·CBM 을 읽어 둡니다.
 * 한 번 읽으면 클라우드에 남겨, 폴더가 없는 기기(폰)에서도 보입니다.
 */
async function loadCipl(b) {
  if (state.demo || !state.root || state.ciplBusy.has(b.id)) return;

  const docs = b.stages
    .find((s) => s.key === 'cipl')
    ?.docs.filter((d) => SHEET_EXT.test(d.name) && !d.cipl) ?? [];
  if (!docs.length) return; // 서버가 이미 읽어 뒀으면 할 일이 없습니다

  // 이미 같은 파일들을 읽어 뒀으면 다시 읽지 않습니다.
  const saved = state.overlay[b.id]?.ciplFiles ?? [];
  const same =
    saved.length === docs.length &&
    docs.every((d) => saved.some((x) => x.path === d.path && x.size === (d.size ?? null)));
  if (same) return;

  state.ciplBusy.add(b.id);
  try {
    const files = [];
    for (const doc of docs) {
      try {
        const file = await FS.getFileByPath(state.root, doc.path);
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        let best = null;
        for (const name of wb.SheetNames) {
          const got = readCipl(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }));
          // 중량은 보통 PL 시트에만 있습니다 — 중량이 있는 쪽을 씁니다.
          if (got && (!best || (got.gross && !best.gross))) best = got;
        }
        if (best) files.push({ ...best, path: doc.path, size: doc.size ?? null, from: doc.display });
      } catch (e) {
        console.warn('잔액서류를 읽지 못했습니다', doc.path, e);
      }
    }
    if (!files.length) return;

    const patch = { ciplFiles: files, cipl: files.find((f) => f.gross) ?? files[0] };
    state.overlay[b.id] = { ...(state.overlay[b.id] ?? {}), ...patch };
    await DB.saveCipl(b.id, patch);
    if (state.openId === b.id) renderDrawer(b.id);
  } finally {
    state.ciplBusy.delete(b.id);
  }
}

/* ── 사진 격자 ────────────────────────────────────────── */

const PHOTO_EXT = /\.(jpe?g|png|heic|webp|gif|bmp)$/i;

/**
 * 상차 이미지는 이름이 해시라 목록으로 보면 아무것도 안 보입니다.
 * 작은 그림으로 늘어놓고, 누르면 한 장씩 크게 넘겨 봅니다.
 */
function photoGrid(docs, key) {
  return `
    <div class="grid grid-cols-4 gap-2">
      ${docs.map((d, i) => `
        <button data-photo="${esc(key)}" data-idx="${i}" title="${esc(fileTitle(d))}"
                class="relative aspect-square rounded-lg overflow-hidden bg-hover border border-line
                       hover:border-ink/30 transition-all">
          ${d.driveId
            ? `<img src="${driveThumb(d.driveId, 400)}" alt="" loading="lazy"
                    class="w-full h-full object-cover" data-path="${esc(d.path)}" />`
            : `<span class="absolute inset-0 flex items-center justify-center text-[11px] text-faint">사진</span>`}
        </button>`).join('')}
    </div>`;
}

/**
 * 이 차수의 잔액서류에서 읽어낸 수치.
 * 드라이브 동기화가 서버에서 읽어 파일 정보에 붙여 주므로, 폴더 연결 없이도 있습니다.
 */
function ciplOfBatch(b) {
  const docs = b.stages.find((s) => s.key === 'cipl')?.docs ?? [];
  const got = docs.filter((d) => d.cipl).map((d) => ({ ...d.cipl, from: d.display, path: d.path }));
  // 중량은 보통 PL 시트에만 있습니다 — 중량이 있는 쪽을 대표로 씁니다.
  return got.find((x) => x.gross) ?? got[0] ?? null;
}

/**
 * 선적 요약 — 총중량·박스수·CBM.
 * 잔액서류에서 읽어낸 값을 쓰되, 사람이 넣은 값이 있으면 그게 이깁니다.
 * 스캔 PDF처럼 읽을 수 없는 서류도 있어서, 손으로 채울 자리를 늘 열어 둡니다.
 */
function shipSummary(b, ov) {
  const auto = ciplOfBatch(b) ?? ov.cipl ?? null;
  const pick = (manual, autoVal) => ({
    value: manual !== undefined && manual !== '' ? Number(manual) : autoVal,
    byHand: manual !== undefined && manual !== '',
  });
  const rows = [
    ['총중량', pick(ov.grossKg, auto?.gross), 'kg'],
    ['박스', pick(ov.cartons, auto?.cartons), '개'],
    ['부피', pick(ov.cbm, auto?.cbm), 'CBM'],
  ];
  if (!rows.some((r) => r[1].value)) {
    // 아직 아무것도 없습니다. 잔액서류가 왔는데 못 읽은 경우만 안내합니다.
    const has = b.stages.find((s) => s.key === 'cipl')?.docs.length;
    if (!has) return '';
    return `
      <section>
        <h3 class="text-[12px] font-bold text-faint tracking-wide mb-2">선적 요약</h3>
        <p class="text-[12px] text-muted leading-relaxed mb-2">
          잔액서류에서 아직 수치를 읽지 못했습니다.
          ${state.root
            ? '엑셀이 아니면(스캔 PDF 등) 자동으로 못 읽습니다 — 아래 직접 입력에 채워 주세요.'
            : '이 기기에 폴더가 연결돼 있지 않습니다. 크롬은 새로고침하면 폴더 권한을 놓아서, 한 번 눌러 다시 열어줘야 합니다.'}
        </p>
        ${state.root ? '' : '<button id="ciplConnect" class="btn btn-ghost">폴더 연결하고 읽기</button>'}
      </section>`;
  }

  return `
    <section>
      <h3 class="text-[12px] font-bold text-faint tracking-wide mb-3">선적 요약</h3>
      <div class="grid grid-cols-3 gap-3">
        ${rows.map(([label, got, unit]) => `
          <div class="card px-4 py-3">
            <div class="text-[11px] font-bold text-faint tracking-wide mb-1">${label}</div>
            <div class="text-[17px] font-bold leading-none">${got.value ? `${esc(fmtNum(got.value))} <span class="text-[12px] text-faint">${unit}</span>` : '<span class="text-faint">—</span>'}</div>
            ${got.byHand ? '<div class="text-[10px] font-bold text-faint mt-1">직접 입력</div>' : ''}
          </div>`).join('')}
      </div>
      ${auto ? `<p class="text-[11px] text-faint mt-2 leading-relaxed">
        ${esc(auto.from)} 의 패킹리스트 ${auto.lines}줄을 더했습니다${auto.pcs ? ` · ${fmtNum(auto.pcs)} pcs` : ''}${auto.net ? ` · 순중량 ${fmtNum(auto.net)} kg` : ''}
        ${auto.swapped ? '<br /><span class="text-warn font-semibold">서류에 G.W. 와 N.W. 가 뒤바뀌어 있어 큰 값을 총중량으로 봤습니다.</span>' : ''}
      </p>` : ''}
    </section>`;
}

/* ── 상세 서랍 ────────────────────────────────────────── */

function openDrawer(id) {
  state.openId = id;
  renderDrawer(id);
  const b = state.batches.find((x) => x.id === id);
  if (b) loadCipl(b);
  $('#scrim').hidden = false;
  requestAnimationFrame(() => $('#drawer').classList.remove('translate-x-full'));
}

function closeDrawer() {
  state.openId = null;
  $('#drawer').classList.add('translate-x-full');
  $('#scrim').hidden = true;
}

function renderDrawer(id) {
  const b = state.batches.find((x) => x.id === id);
  if (!b) return closeDrawer();
  const ov = state.overlay[id] ?? {};
  const auto = ciplOfBatch(b) ?? ov.cipl ?? null;

  const field = (key, label, opts = {}) => `
    <label class="block">
      <span class="text-[11px] font-bold text-faint tracking-wide">${label}</span>
      <input data-ov="${key}" type="${opts.type ?? 'text'}" value="${esc(ov[key] ?? '')}"
             ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''} class="field mt-1" />
    </label>`;

  // 이 파일에서 읽어낸 수치 — 잔액서류 줄 아래에 붙습니다.
  // 서버가 읽어 붙여준 값이 먼저입니다. 없으면 이 기기에서 읽은 값을 씁니다.
  const ciplOf = (d) => d.cipl ?? (ov.ciplFiles ?? []).find((x) => x.path === d.path);

  /**
   * 같은 칸의 서류들을 시간순으로 세우고, 각 장이 **앞 판과 무엇이 다른지**만 적습니다.
   * 값을 통째로 늘어놓으면 눈이 아프고, 정작 무엇이 바뀌었는지는 안 보입니다.
   */
  const DIFF_FIELDS = [
    ['qty', '수량', true],
    ['amount', '금액', true],
    ['cbm', 'CBM', true],
    ['deliveryDate', '납기', false],
    ['orderDate', '발주일', false],
    ['container', '컨테이너', false],
  ];

  /**
   * 두 서류의 품목을 코드로 맞춰 보고, 무엇이 새로 들어오고 빠지고 수량이 바뀌었는지 적습니다.
   * "수량 +51" 만으로는 어느 제품이 늘었는지 알 수 없습니다.
   */
  /**
   * 두 서류의 품목을 코드로 맞춰 보고, 무엇이 새로 들어오고 빠지고 수량이 바뀌었는지 줄로 만듭니다.
   * "수량 +51" 만으로는 어느 제품이 늘었는지 알 수 없습니다.
   */
  function itemRows(before, now) {
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

  const KIND_TONE = { 추가: 'text-warn', 빠짐: 'text-info', 수량: 'text-faint', 합계: 'text-faint' };

  /** 바뀐 것들을 표 한 장으로 만듭니다. 줄글로 이어 붙이면 뭐가 뭔지 안 보입니다. */
  function diffTable(rows) {
    if (!rows.length) return '';
    const MAX = 12;
    const shown = rows.slice(0, MAX);
    const num = (v) => (v === null || v === undefined ? '<span class="text-faint">—</span>' : fmtNum(v));
    const gap = (r) => {
      if (r.from === null || r.to === null || typeof r.to !== 'number' || typeof r.from !== 'number') return '';
      const d = Math.round((r.to - r.from) * 100) / 100;
      if (!d) return '';
      return `<span class="${d > 0 ? 'text-warn' : 'text-info'} font-bold">${d > 0 ? '+' : ''}${fmtNum(d)}</span>`;
    };

    return `
      <div class="mt-1.5 overflow-x-auto">
        <table class="w-full text-[11px] border border-line rounded-lg overflow-hidden tabular-nums">
          <thead>
            <tr class="bg-hover text-faint text-left">
              <th class="font-bold px-2 py-1 w-[42px]">구분</th>
              <th class="font-bold px-2 py-1">항목</th>
              <th class="font-bold px-2 py-1 text-right whitespace-nowrap">이전</th>
              <th class="font-bold px-2 py-1 text-right whitespace-nowrap">이후</th>
              <th class="font-bold px-2 py-1 text-right whitespace-nowrap">증감</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            ${shown.map((r, i) => `
              <tr>
                <td class="px-2 py-1 font-bold ${KIND_TONE[r.kind] ?? 'text-faint'} whitespace-nowrap">${
                  // 같은 구분이 이어지면 첫 줄에만 적습니다. 같은 말이 세로로 늘어서면 눈만 아픕니다.
                  i && shown[i - 1].kind === r.kind ? '' : esc(r.kind)}</td>
                <td class="px-2 py-1">${esc(r.name)}${r.code ? `<span class="text-faint"> ${esc(r.code)}</span>` : ''}</td>
                <td class="px-2 py-1 text-right whitespace-nowrap">${typeof r.from === 'number' ? num(r.from) : (r.from ? esc(String(r.from)) : num(null))}</td>
                <td class="px-2 py-1 text-right whitespace-nowrap font-bold">${typeof r.to === 'number' ? num(r.to) : (r.to ? esc(String(r.to)) : num(null))}</td>
                <td class="px-2 py-1 text-right whitespace-nowrap">${gap(r)}</td>
              </tr>`).join('')}
            ${rows.length > MAX ? `<tr><td colspan="5" class="px-2 py-1 text-faint">외 ${rows.length - MAX}건</td></tr>` : ''}
          </tbody>
        </table>
      </div>`;
  }

  function diffNotes(docs) {
    const notes = new Map();
    const has = docs.filter((d) => d.cipl?.brief);
    if (has.length < 2) return notes;

    // 발주일이 같은 수정본이 흔합니다. 그때는 파일이 올라온 시각으로 순서를 잡습니다.
    const when = (d) =>
      `${d.cipl.brief.orderDate ?? d.date ?? ''}|${String(d.mtime ?? 0).padStart(16, '0')}`;
    const line = [...has].sort((a, b) => when(a).localeCompare(when(b)));

    notes.set(line[0].path, '<span class="text-faint">처음 판</span>');
    const round = (n) => Math.round(Number(n) * 100) / 100;

    for (let i = 1; i < line.length; i++) {
      const before = line[i - 1].cipl.brief;
      const now = line[i].cipl.brief;
      // 무엇이 늘고 줄었는지가 먼저입니다. 합계는 그 아래에 붙입니다.
      const rows = itemRows(line[i - 1].cipl.items, line[i].cipl.items);

      for (const [key, label, isNum] of DIFF_FIELDS) {
        const x = before[key];
        const y = now[key];
        if (x === undefined || y === undefined || x === y) continue;
        rows.push(
          isNum
            ? { kind: '합계', name: label, code: '', from: round(x), to: round(y) }
            : { kind: '합계', name: label, code: '', from: String(x), to: String(y) }
        );
      }

      notes.set(
        line[i].path,
        rows.length ? diffTable(rows) : '<span class="text-faint">앞 판과 숫자가 같습니다</span>'
      );
    }
    return notes;
  }

  let diffs = new Map();

  /* 서류 한 장을 박스 하나로 — 박스 이름이 곧 그 서류의 이름입니다.
     모양은 작업대(viggle)의 박스 값을 그대로 씁니다(.dhh-dbox).
     이름은 자르지 않고 다 보여 줍니다. 누르는 자리는 전과 같습니다. */
  const docLink = (d) => `
    <li class="dhh-dbox">
      <div class="flex items-start gap-2">
        <button data-doc="${esc(d.path)}" class="dnm text-left text-info hover:underline break-words" title="${esc(fileTitle(d))}">
          ${esc(d.display)}
        </button>
        ${linkBadge(d)}${copyBadge(d)}
        ${d.driveId ? `<a href="${driveOpen(d.driveId)}" target="_blank" rel="noopener"
             class="text-[11px] text-faint hover:text-ink shrink-0 ml-auto">↗</a>` : ''}
      </div>
      <span class="dmt">${[d.date, fmtSize(d.size)].filter(Boolean).join(' · ')}</span>
      ${diffs.has(d.path) ? `<div class="mt-1 text-[11px] text-muted">${diffs.get(d.path)}</div>` : ''}
      ${(() => {
        const c = ciplOf(d);
        if (!c) return '';
        return `
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            ${[
              ['총중량', `${fmtNum(c.gross)} kg`],
              ['박스', `${fmtNum(c.cartons)} 개`],
              ['부피', `${fmtNum(c.cbm)} CBM`],
              ...(c.pcs ? [['수량', `${fmtNum(c.pcs)} pcs`]] : []),
            ].map(([k, v]) => `<span><span class="text-faint">${k}</span> <span class="font-bold">${esc(v)}</span></span>`).join('')}
            ${c.swapped ? '<span class="text-warn font-semibold" title="서류에 G.W. 와 N.W. 가 뒤바뀌어 있어 큰 값을 총중량으로 봤습니다">G.W./N.W. 뒤바뀜</span>' : ''}
          </div>`;
      })()}
    </li>`;

  $('#drawerBody').innerHTML = `
    <div class="sticky top-0 bg-white border-b border-line px-6 h-[65px] flex items-center gap-3 z-10">
      <div>
        <div class="text-[11px] font-bold text-faint tracking-wide">${esc(b.vendor)}</div>
        <div class="text-[17px] font-bold leading-tight">${esc(b.batch)}차</div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="text-[13px] font-bold">${b.done}<span class="text-faint">/7</span></span>
        <button id="drawerClose" class="btn btn-ghost">닫기</button>
      </div>
    </div>

    <div class="p-6 space-y-7">
      ${b.issues.length ? `<div class="space-y-2">
        ${b.issues.map((i) => `
          <div class="flex gap-2 text-[12px] leading-relaxed px-3 py-2.5 rounded-lg
                      ${i.level === 'warn' ? 'bg-[#fdf3e3] text-[#8a5a00]' : 'bg-chip text-muted'}">
            <span class="font-bold shrink-0">${i.level === 'warn' ? '확인' : '참고'}</span>
            <span>${esc(i.text)}</span>
          </div>`).join('')}
      </div>` : ''}

      <section>
        <h3 class="text-[12px] font-bold text-faint tracking-wide mb-3">7단계 진행</h3>
        <ol class="space-y-1">
          ${b.stages.map((s) => {
            const on = s.docs.length > 0;
            return `
            <li class="rounded-lg ${on ? '' : 'opacity-60'}">
              <div class="flex items-center gap-2.5 px-3 py-2">
                <span class="w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0
                      ${on ? 'bg-ink text-white' : 'bg-chip text-faint'}">${s.id}</span>
                <span class="text-[13px] font-semibold">${esc(s.label)}</span>
                <span class="ml-auto text-[11px] text-faint font-semibold">${on ? `${s.docs.length}건` : '없음'}</span>
              </div>
              ${!on ? '' : s.docs.length > 1 && s.docs.every((d) => PHOTO_EXT.test(d.name))
                ? `<div class="pl-[42px] pr-3 pb-2">${photoGrid(s.docs, s.key)}</div>`
                : `<ul class="pl-[42px] pr-3 pb-2 space-y-1.5">${((diffs = diffNotes(s.docs)), s.docs.map((d) => docLink(d)).join(''))}</ul>`}
            </li>`;
          }).join('')}
        </ol>
      </section>

      ${b.aside.some((a) => a.docs.length) ? `
        <section>
          <h3 class="text-[12px] font-bold text-faint tracking-wide mb-3">그 밖의 자료</h3>
          ${b.aside.filter((a) => a.docs.length).map((a) => `
            <div class="mb-3">
              <div class="text-[12px] font-semibold mb-1">${esc(a.label)}</div>
              <ul class="space-y-1.5">${((diffs = diffNotes(a.docs)), a.docs.map((d) => docLink(d)).join(''))}</ul>
            </div>`).join('')}
        </section>` : ''}

      ${shipSummary(b, ov)}

      <section>
        <h3 class="text-[12px] font-bold text-faint tracking-wide mb-3">직접 입력</h3>
        <div class="grid grid-cols-2 gap-3">
          ${field('piAmount', '계약 총액 (PI)', { placeholder: 'USD' })}
          ${field('ciAmount', '실출하 총액 (CI&PL)', { placeholder: 'USD' })}
          ${field('container', '컨테이너 번호')}
          ${field('grossKg', '총중량 (kg)', { placeholder: auto?.gross ? String(auto.gross) : '' })}
          ${field('cartons', '박스 수', { placeholder: auto?.cartons ? String(auto.cartons) : '' })}
          ${field('cbm', 'CBM', { placeholder: auto?.cbm ? String(auto.cbm) : '' })}
          ${field('due', '마감 예정일', { type: 'date' })}
          ${field('etd', '출항일', { type: 'date' })}
          ${field('eta', '도착 예정일', { type: 'date' })}
        </div>
        <label class="block mt-3">
          <span class="text-[11px] font-bold text-faint tracking-wide">메모</span>
          <textarea data-ov="memo" rows="4" class="field mt-1 resize-y">${esc(ov.memo ?? '')}</textarea>
        </label>
        <div class="flex items-center gap-2 mt-3">
          <button id="ovSave" class="btn btn-primary">저장</button>
          <span class="text-[11px] text-faint">
            ${state.demo ? '데모 모드에서는 저장되지 않습니다.'
              : ov.updatedBy ? `마지막 수정 ${esc(ov.updatedBy)} · ${esc((ov.updatedAt ?? '').slice(0, 10))}`
              : '팀 전체에 실시간으로 반영됩니다.'}
          </span>
        </div>
      </section>
    </div>`;

  $('#drawerClose').onclick = closeDrawer;
  $('#ovSave').onclick = () => saveOverlay(id);
  const connect = $('#ciplConnect');
  if (connect)
    connect.onclick = () =>
      connectFolder().then((ok) => {
        if (!ok) return;
        renderConnectState();
        loadCipl(b);
      });
  for (const el of $('#drawerBody').querySelectorAll('[data-doc]')) {
    el.onclick = () => openDoc(b.docs.find((d) => d.path === el.dataset.doc));
  }
  for (const el of $('#drawerBody').querySelectorAll('[data-photo]')) {
    el.onclick = () => {
      const list = b.stages.find((s) => s.key === el.dataset.photo).docs;
      openDoc(list[Number(el.dataset.idx)], list);
    };
  }
}

/* ── 새 버전 확인 ─────────────────────────────────────── */

/**
 * 브라우저가 옛 화면을 캐시에 붙들고 있으면 고쳐도 안 바뀐 것처럼 보입니다.
 * 서버 쪽 판번호를 직접 읽어 다르면 새로고침 버튼을 띄웁니다.
 */
async function checkForUpdate() {
  if (typeof SINGLE_FILE !== 'undefined' && SINGLE_FILE) return;
  const here = $('#app .tracking-wider')?.textContent?.trim();
  if (!here) return;
  try {
    const html = await fetch(location.pathname, { cache: 'no-store' }).then((r) => r.text());
    const m = /tracking-wider">\s*(v[\d.]+)\s*</.exec(html);
    if (!m || m[1] === here) return;
    const btn = $('#btnUpdate');
    btn.textContent = `새 버전 ${m[1]} · 새로고침`;
    btn.hidden = false;
    btn.onclick = () => location.replace(`${location.pathname}?r=${m[1]}`);
    toast(`새 버전 ${m[1]} 이 나와 있습니다. 오른쪽 위에서 새로고침해 주세요.`);
  } catch {
    /* 오프라인이면 그냥 넘어갑니다 */
  }
}

/* ── 파일 보기 ────────────────────────────────────────── */

/** 헤더의 폴더 연결 버튼 상태를 맞춥니다. */
function renderConnectState() {
  const btn = $('#btnConnect');
  if (!btn) return;
  btn.hidden = !FS.supported || state.demo;
  btn.textContent = state.root ? '폴더 연결됨' : '폴더 연결';
  btn.title = state.root
    ? '이 기기의 중국 폴더가 연결돼 있어 모든 파일을 바로 볼 수 있습니다.'
    : '중국 폴더를 연결하면 드라이브 링크가 없는 파일도 바로 볼 수 있습니다.';
}

/**
 * 파일 하나를 크게 봅니다.
 * list 를 같이 주면 그 안에서 ← → 로 넘겨 볼 수 있습니다 (상차 사진 묶음).
 */
function openDoc(doc, list = null) {
  if (!doc) return;
  state.viewer = list ? { list, idx: Math.max(0, list.indexOf(doc)) } : { list: [], idx: 0 };
  $('#viewerScrim').hidden = false;
  showViewer(doc);
}

function showViewer(doc) {
  const { list, idx } = state.viewer;
  $('#viewerTitle').textContent = doc.display;
  $('#viewerMeta').textContent = [doc.path, fmtSize(doc.size), doc.date, glossCJK(doc.name ?? doc.display)]
    .filter(Boolean)
    .join(' · ');
  $('#viewerCount').textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
  $('#viewerPrev').hidden = list.length < 2;
  $('#viewerNext').hidden = list.length < 2;
  $('#viewerBody').innerHTML = previewPane(doc, 'vw');
  fillPreview(doc, 'vw', { force: true });
}

/** 묶음 안에서 앞뒤로 넘깁니다. 끝에서는 반대편으로 돌아갑니다. */
function stepViewer(by) {
  const { list, idx } = state.viewer;
  if (list.length < 2) return;
  const next = (idx + by + list.length) % list.length;
  state.viewer.idx = next;
  showViewer(list[next]);
}

function closeViewer() {
  state.viewer = { list: [], idx: 0 };
  $('#viewerScrim').hidden = true;
  $('#viewerBody').innerHTML = '';
  keepBlob('vw', null);
}

async function saveOverlay(id) {
  // 자동으로 읽어둔 요약은 그대로 들고 갑니다 — 안 그러면 저장할 때 지워집니다.
  const prev = state.overlay[id] ?? {};
  const data = {};
  if (prev.cipl) data.cipl = prev.cipl;
  if (prev.ciplFiles) data.ciplFiles = prev.ciplFiles;
  for (const el of $('#drawerBody').querySelectorAll('[data-ov]')) {
    const v = el.value.trim();
    if (v) data[el.dataset.ov] = v;
  }
  if (state.demo) {
    state.overlay[id] = data;
    return toast('데모 모드라 저장하지 않습니다.');
  }
  try {
    await DB.saveOverlay(id, data, state.user?.email);
    toast('저장했습니다.');
  } catch (e) {
    toast(`저장 실패: ${e.message}`);
  }
}

/* ── 박스판에 건넬 셈 ─────────────────────────────────────
   첫 화면(박스판)은 index.html 에 있습니다. 여기서는 숫자만 내어 줍니다.
   화면 안쪽은 아무것도 건드리지 않습니다. */
/* 박스를 무엇으로 자를지 — 바꾸실 곳은 이 한 줄입니다.
   'vendor' 거래처별 · 'status' 진행 상태별. 지금은 "일단 거래처로". */
const BOX_CUT = 'vendor';

/** 박스 하나 = { name, note, warn, chips(눌러 줄 칩), chipIn(칩이 있는 줄) } */
const BOX_CUTS = {
  // 차수가 있는 거래처 + 차수는 없고 파일만 있는 곳까지 모두 박스를 줍니다.
  // 그래야 어느 박스에도 안 드는 파일이 생기지 않습니다.
  vendor: () =>
    [...new Set([
      ...state.batches.map((b) => b.vendor),
      ...state.unassigned.map((d) => d.vendor).filter((v) => v && v !== '(루트)'),
    ])]
      .map((name) => {
        const mine = state.batches.filter((b) => b.vendor === name);
        const loose = state.unassigned.filter((d) => d.vendor === name).length;
        const active = mine.filter((b) => b.status === 'active').length;
        return {
          name,
          note: mine.length ? `${mine.length}차 · 진행 중 ${active}` : `차수 없음 · 파일 ${loose}건`,
          warn: mine.filter((b) => b.issues.some((i) => i.level === 'warn')).length,
          chip: name,
          chipIn: '#vendorChips',
          active,
          count: mine.length,
          loose,
        };
      })
      // 차수가 있는 곳이 먼저, 그중에도 진행 중이 많은 곳이 앞입니다
      .sort((a, b) =>
        (b.count > 0) - (a.count > 0) || b.active - a.active || b.count - a.count ||
        b.loose - a.loose || a.name.localeCompare(b.name, 'ko')),

  status: () =>
    [
      ['진행 중', (b) => b.status === 'active'],
      ['완료', (b) => b.status === 'done'],
      ['문제 있음', (b) => b.issues.length > 0],
    ].map(([name, hit]) => {
      const mine = state.batches.filter(hit);
      return {
        name,
        note: `${mine.length}차`,
        warn: 0,
        chip: name,
        chipIn: '#statusChips',
        active: mine.length,
        count: mine.length,
      };
    }),
};

/* 거래처 하나에 딸린, 차수가 안 붙은 파일을 두 갈래로 가릅니다.
   개발·샘플 : 파서가 '제품개발'로 본 것(견적·도면·지시서·사양) + 이름에 샘플이 든 것.
               파서에는 아직 '샘플' 갈래가 없어 여기서만 같이 봅니다 — 판정 규칙은
               건드리지 않았습니다.
   미확인    : 그 거래처 것으로는 보이는데 위에 안 드는 나머지 전부. 흘리지 않습니다. */
const isDevDoc = (d) => d.stageKey === 'dev' || /샘플|sample/i.test(`${d.display ?? ''} ${d.name ?? ''}`);
const slimDoc = (d) => ({ path: d.path, name: d.display, date: d.date ?? '', why: d.reason ?? '' });

/* 손으로 만든 박스에 드는 파일인지 — 파일명이나 자리에 그 말이 들어 있으면. */
const inBox = (box, d) =>
  `${d.name ?? ''} ${d.path ?? ''}`.toLowerCase().includes(String(box.word ?? '').toLowerCase());

window.docsVendorBoxes = (vendor) => {
  const mine = state.unassigned.filter((d) => d.vendor === vendor);
  // 손으로 만든 박스가 먼저 가져갑니다. 가져간 것은 개발/샘플·미확인에서 빠집니다 —
  // 그래야 한 파일이 두 박스에 겹쳐 보이지 않습니다.
  const 손박스 = (state.boxes ?? []).filter((b) => b.vendor === vendor && b.word);
  const 담김 = new Set();
  const mine2 = 손박스.map((box) => {
    const docs = mine.filter((d) => !담김.has(d.path) && inBox(box, d));
    for (const d of docs) 담김.add(d.path);
    return { name: box.name, word: box.word, docs: docs.map(slimDoc) };
  });
  const 남은것 = mine.filter((d) => !담김.has(d.path));
  return {
    vendor,
    batches: state.batches.filter((b) => b.vendor === vendor).length,
    active: state.batches.filter((b) => b.vendor === vendor && b.status === 'active').length,
    dev: 남은것.filter(isDevDoc).map(slimDoc),
    unsure: 남은것.filter((d) => !isDevDoc(d)).map(slimDoc),
    mine: mine2,
  };
};

/* 거래처 안에 박스 하나를 더합니다. 드라이브에는 아무것도 만들지 않습니다 —
   화면에서만 묶어 봅니다. 판정 규칙과 따로 두어 단계 판정은 흔들리지 않습니다. */
window.docsAddVendorBox = async (vendor, name, word) => {
  vendor = String(vendor ?? '').trim();
  name = String(name ?? '').trim();
  word = String(word ?? '').trim();
  if (!vendor) return { ok: false, msg: '어느 거래처인지 모르겠습니다.' };
  if (!name) return { ok: false, msg: '박스 이름을 넣어주세요.' };
  if (!word) return { ok: false, msg: '어떤 파일을 넣을지 — 파일명에 든 말을 하나 넣어주세요.' };

  const 있는것 = new Set([
    '발주', '개발 / 샘플', '개발/샘플', '미확인',
    ...(state.boxes ?? []).filter((b) => b.vendor === vendor).map((b) => String(b.name).trim()),
  ]);
  if (있는것.has(name)) return { ok: false, msg: `'${name}' 박스는 이미 있습니다. 다른 이름으로 해주세요.` };

  const hit = state.unassigned.filter((d) => d.vendor === vendor && inBox({ word }, d));
  if (!hit.length) return { ok: false, msg: `${vendor} 파일 가운데 '${word}' 가 든 것이 없습니다.` };
  if (state.demo) return { ok: false, msg: '데모 모드라 저장하지 않습니다.' };

  try {
    await DB.saveBox({ vendor, name, word }, state.user?.email);
    return { ok: true, msg: `'${name}' 박스를 만들었습니다 — 파일 ${hit.length}건.` };
  } catch (e) {
    return { ok: false, msg: `저장 실패: ${e.message}` };
  }
};

/** 거래처 안에서 이 말이 든 파일이 몇 건인지 미리 세어 봅니다. */
window.docsCountInVendor = (vendor, word) => {
  const w = String(word ?? '').trim();
  if (!w) return 0;
  return state.unassigned.filter((d) => d.vendor === vendor && inBox({ word: w }, d)).length;
};

/* 새 박스 만들기.
   이 앱에서 박스는 파일이 있어야 생깁니다 — 빈 박스는 둘 자리가 없습니다.
   그래서 "이 말이 든 파일은 이 거래처 것" 이라는 규칙 한 줄을 세웁니다.
   원래 있던 '규칙' 장치를 그대로 쓰는 것이라, 나중에 규칙 서랍에서 지우면
   박스도 같이 사라집니다. 드라이브는 건드리지 않습니다 — 화면에서만 갈립니다. */
window.docsNewBox = async (name, keyword) => {
  name = String(name ?? '').trim();
  keyword = String(keyword ?? '').trim();
  if (!name) return { ok: false, msg: '거래처 이름을 넣어주세요.' };
  if (!keyword) return { ok: false, msg: '어떤 파일을 넣을지 — 파일명에 든 말을 하나 넣어주세요.' };

  // 이름이 겹치면 두 거래처 자료가 한 박스에 섞입니다. 겹치면 만들지 않습니다.
  const 있는것 = new Set([
    ...state.batches.map((b) => b.vendor),
    ...state.unassigned.map((d) => d.vendor),
  ].filter(Boolean).map((v) => v.trim()));
  if (있는것.has(name)) return { ok: false, msg: `'${name}' 박스는 이미 있습니다. 다른 이름으로 해주세요.` };

  const hit = state.files.filter((f) => `${f.name ?? ''} ${f.path ?? ''}`.toLowerCase().includes(keyword.toLowerCase()));
  if (!hit.length) return { ok: false, msg: `'${keyword}' 가 든 파일이 없습니다.` };
  if (state.demo) return { ok: false, msg: '데모 모드라 저장하지 않습니다.' };

  try {
    await DB.saveRule({ action: 'assign', vendor: name, matchType: 'contains', match: keyword, note: '새 박스에서 만듦' },
                      state.user?.email);
    return { ok: true, msg: `'${name}' 박스를 만들었습니다 — 파일 ${hit.length}건.` };
  } catch (e) {
    return { ok: false, msg: `저장 실패: ${e.message}` };
  }
};

/** 이 말이 든 파일이 몇 건인지 미리 세어 봅니다. 아무것도 바꾸지 않습니다. */
window.docsCountKeyword = (keyword) => {
  const k = String(keyword ?? '').trim().toLowerCase();
  if (!k) return 0;
  return state.files.filter((f) => `${f.name ?? ''} ${f.path ?? ''}`.toLowerCase().includes(k)).length;
};

/* 발주 박스 — 그 거래처 것만 걸러 둡니다.
   칩을 눌러 거르면 차수가 없는 거래처(삐에노·리나 같은 곳)는 칩이 없어
   아무것도 안 걸리고 남의 차수까지 그대로 나옵니다. 그래서 여기서 곧장 겁니다. */
window.docsFilterVendor = (vendor) => {
  state.filter.vendor = vendor ?? null;
  state.filter.status = null;   // 그 거래처 차수를 다 보여 줍니다
  render();
};

/** 박스 판에서 파일 한 장을 그대로 열어 봅니다 — 원래 쓰던 그 보기 창입니다. */
window.docsOpenFile = (path) => {
  const d = state.unassigned.find((x) => x.path === path);
  if (d) openDoc(d);
};

window.docsCounts = () => ({
  batches: state.batches.length,
  vendors: new Set(state.batches.map((b) => b.vendor)).size,
  boxes: (BOX_CUTS[BOX_CUT] ?? BOX_CUTS.vendor)(),
  active: state.batches.filter((b) => b.status === 'active').length,
  warn: state.batches.filter((b) => b.issues.some((i) => i.level === 'warn')).length,
  loose: state.unassigned.length,
  rules: state.rules.length,
  excluded: state.excluded.length,
  has: state.files.length > 0,
});

/* ── 토스트 ───────────────────────────────────────────── */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.opacity = '0'), 2600);
}

boot();
