/**
 * Firebase — 에이엠티 앱과 같은 프로젝트(vivivic-4b7ef)를 씁니다.
 * 컬렉션 경로도 기존 앱과 같은 artifacts/{appId}/public/data/{name} 규칙을 따릅니다.
 *
 * SDK는 필요한 순간에만 내려받습니다(동적 import).
 * 데모 모드나 오프라인에서는 네트워크를 전혀 건드리지 않습니다.
 */

export const APP_ID = 'vivivic-4b7ef';
const SDK = 'https://www.gstatic.com/firebasejs/11.2.0';

const firebaseConfig = {
  apiKey: 'AIzaSyB9X_hzd2D3goQ7oenK53Pz805P1c7oSqs',
  authDomain: 'vivivic-4b7ef.firebaseapp.com',
  projectId: 'vivivic-4b7ef',
  storageBucket: 'vivivic-4b7ef.firebasestorage.app',
  messagingSenderId: '830175660542',
  appId: '1:830175660542:web:9054030480c8280af8d8af',
};

export const FILES = 'docs_files';
export const OVERLAY = 'docs_overlay';

let ctx = null;

/** SDK를 내려받고 app/auth/db를 준비합니다. 여러 번 불러도 한 번만 돕니다. */
export async function init() {
  if (ctx) return ctx;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  ctx = { auth: authMod.getAuth(app), db: 창고열기(fsMod, app), a: authMod, f: fsMod };
  // 로그인 유지 — 브라우저를 닫아도 남게 한다. (지정하지 않으면 가끔 조용히 풀린다)
  // 반드시 기다린다. 아이폰처럼 IndexedDB 가 막히는 곳에서는 이것이 끝나기 전에
  // 로그인을 시작하면 저장 자리가 정해지지 않은 채로 실패한다.
  try {
    await authMod.setPersistence(ctx.auth, authMod.indexedDBLocalPersistence);
  } catch (e1) {
    try {
      await authMod.setPersistence(ctx.auth, authMod.browserLocalPersistence);
    } catch (e2) {
      try {
        await authMod.setPersistence(ctx.auth, authMod.inMemoryPersistence);
      } catch (e3) {
        console.warn('로그인 유지 설정 실패:', e3);
      }
    }
  }
  return ctx;
}

/* 받은 것을 브라우저에 담아 둡니다(탭 여럿이 함께 씀). 다시 열면 바뀐 것만 받습니다 —
   안 담으면 열 때마다 docs_files 900건을 통째로 다시 읽어 무료 한도(하루 5만)가 닳습니다.
   못 담는 브라우저(사파리 사생활 창 등)면 SDK 가 알아서 예전처럼 메모리로 돕니다. */
function 창고열기(f, app) {
  try {
    return f.initializeFirestore(app, {
      localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('캐시 못 켬:', e?.message);
    return f.getFirestore(app);
  }
}

const col = (name) => ctx.f.collection(ctx.db, 'artifacts', APP_ID, 'public', 'data', name);

/* ── 인증 ─────────────────────────────────────────────── */

export async function watchAuth(cb) {
  const c = await init();
  return c.a.onAuthStateChanged(c.auth, cb);
}

export async function signIn(email, password) {
  const c = await init();
  return c.a.signInWithEmailAndPassword(c.auth, email, password);
}

/** 지금 로그인한 사람의 표. 웹앱이 이걸 구글에 물어 누구인지 가립니다. */
export async function idToken() {
  const c = await init();
  return c.auth.currentUser ? c.auth.currentUser.getIdToken() : '';
}

export async function signOut() {
  const c = await init();
  return c.a.signOut(c.auth);
}

/** Firebase 오류 코드를 사람이 읽을 문장으로 바꿉니다. */
export function authMessage(code) {
  return (
    {
      'auth/invalid-email': '이메일 형식 오류',
      'auth/user-not-found': '없는 계정',
      'auth/wrong-password': '비밀번호 틀림',
      'auth/invalid-credential': '이메일·비밀번호 틀림',
      'auth/too-many-requests': '너무 잦음 · 잠시 뒤에',
      'auth/network-request-failed': '네트워크 끊김',
    }[code] ?? ('로그인 실패 (' + (code || '이유 모름') + ')')
  );
}

/* ── 파일 목록 ────────────────────────────────────────── */

/** 문서 ID로 쓸 수 있게 경로를 다듬습니다 (슬래시 금지). */
export const fileKey = (path) => path.replace(/\//g, '~').slice(0, 400);

/* 캐시에서 먼저 뜬 값인지(두 번째 인자 true)를 같이 건넵니다. 쓰기는 서버 값을 본 뒤에만 합니다 —
   오래된 캐시로 쓰면 남이 방금 고친 것을 덮습니다.
   캐시가 서버와 같으면 SDK 가 다시 안 부르니 메타 변화까지 듣되, 문서가 바뀌었거나
   캐시 → 서버로 넘어갈 때만 부릅니다. */
function 듣기(ref, cb) {
  let 전 = null;
  return ctx.f.onSnapshot(ref, { includeMetadataChanges: true }, (s) => {
    const 캐시 = s.metadata.fromCache;
    if (캐시 === 전 && s.docChanges && !s.docChanges().length) return;
    전 = 캐시;
    cb(s, 캐시);
  });
}

export function watchFiles(cb) {
  return 듣기(col(FILES), (s, 캐시) => cb(s.docs.map((d) => d.data()), 캐시));
}

/**
 * 스캔 결과로 목록을 갱신합니다. 사라진 파일은 지웁니다.
 *
 * 브라우저 스캔은 driveId·md5 를 알 수 없습니다. 통째로 덮어쓰면
 * 드라이브 동기화가 넣어둔 그 값들이 날아가, 폴더 권한 없는 기기에서
 * 미리보기가 끊기고 내용 기준 중복 판정도 무너집니다. 그래서 덮어쓰지 않고
 * 아는 값만 겹쳐 씁니다(merge).
 */
export async function replaceFiles(files, onProgress) {
  const existing = await ctx.f.getDocs(col(FILES));
  const keep = new Set(files.map((f) => fileKey(f.path)));
  const ops = [];

  for (const d of existing.docs) if (!keep.has(d.id)) ops.push({ del: true, id: d.id });
  for (const f of files)
    ops.push({
      id: fileKey(f.path),
      data: {
        name: f.name,
        path: f.path,
        vendor: f.vendor,
        size: f.size ?? null,
        mtime: f.mtime ?? null,
        // 모르는 값은 아예 안 씁니다 — 기존 값이 그대로 남습니다.
        ...(f.driveId ? { driveId: f.driveId } : {}),
        ...(f.md5 ? { md5: f.md5 } : {}),
      },
    });

  // Firestore 배치는 한 번에 500건까지입니다.
  for (let i = 0; i < ops.length; i += 450) {
    const chunk = ops.slice(i, i + 450);
    const batch = ctx.f.writeBatch(ctx.db);
    for (const op of chunk) {
      const ref = ctx.f.doc(col(FILES), op.id);
      if (op.del) batch.delete(ref);
      else batch.set(ref, op.data, { merge: true });
    }
    await batch.commit();
    onProgress?.(Math.min(i + chunk.length, ops.length), ops.length);
  }
  return ops.length;
}

/* ── 입력값(금액·일정·메모) ───────────────────────────── */

export const overlayKey = (batchId) => batchId.replace(/\//g, '~');

export function watchOverlay(cb) {
  return ctx.f.onSnapshot(col(OVERLAY), (s) =>
    cb(Object.fromEntries(s.docs.map((d) => [d.data().batchId ?? d.id, d.data()])))
  );
}

export async function saveOverlay(batchId, data, email) {
  await ctx.f.setDoc(ctx.f.doc(col(OVERLAY), overlayKey(batchId)), {
    ...data,
    batchId,
    updatedBy: email ?? null,
    updatedAt: new Date().toISOString(),
  }, { merge: true });   // merge 없이 쓰면 다른 사람이 방금 넣은 값이 지워진다
}

/* ── 동기화 호출 주소 ─────────────────────────────────── */

export const CONFIG = 'docs_config';

/** Apps Script 웹앱 주소. 스크립트가 publishUrl() 로 적어둡니다. */
export async function syncUrl() {
  const snap = await ctx.f.getDoc(ctx.f.doc(col(CONFIG), 'sync'));
  return snap.exists() ? (snap.data().url ?? null) : null;
}

/** CI&PL 에서 읽어낸 요약. 사람이 넣은 값은 건드리지 않고 겹쳐 씁니다. */
export async function saveCipl(batchId, patch) {
  await ctx.f.setDoc(ctx.f.doc(col(OVERLAY), overlayKey(batchId)), { batchId, ...patch }, { merge: true });
}

/* ── 작업대에 오간 지시와 답 ───────────────────────────────
   작업대(viggle)가 쓰는 그 자리를 그대로 읽습니다. 읽기만 합니다 —
   여기서는 아무것도 쓰지 않습니다. */

export const WT = 'wt_dev';

export function watchOrders(cb) {
  return ctx.f.onSnapshot(ctx.f.doc(col(WT), 'box~3Adocs'), (s) =>
    cb(s.exists() ? (s.data().msgs ?? []) : [])
  );
}

/* ── 상차일(차수별) ───────────────────────────────────────
   있던 문서(발주·차수별 입력값)는 건드리지 않고 이 칸에만 적습니다.
   고른 날(pick)과 확정한 날(fixed)을 따로 둡니다 — 고르기와 확정은 두 걸음입니다. */

export function watchLoading(cb) {
  return ctx.f.onSnapshot(ctx.f.doc(col(CONFIG), 'loading'), (s) => {
    const list = s.exists() ? (s.data().list ?? []) : [];
    cb(Object.fromEntries(list.map((x) => [x.b, x])));
  });
}

/** 한 차수의 상차일을 적습니다. 다른 차수 것은 그대로 둡니다. */
export async function saveLoading(batchId, patch, email) {
  const ref = ctx.f.doc(col(CONFIG), 'loading');
  const snap = await ctx.f.getDoc(ref);
  const list = snap.exists() ? (snap.data().list ?? []) : [];
  const i = list.findIndex((x) => x.b === batchId);
  const 하나 = { ...(i >= 0 ? list[i] : { b: batchId }), ...patch, by: email ?? null, at: new Date().toISOString() };
  if (i >= 0) list[i] = 하나; else list.push(하나);
  await ctx.f.setDoc(ref, { list }, { merge: true });
}

/* ── 파일 갈래(cad·spread·ppt·pdf·기타) 구분저장 ──────────
   어느 갈래에 넣었는지를 적어 둡니다. 다시 들어와도 그대로입니다.
   드라이브는 건드리지 않습니다 — 우리 쪽 기록일 뿐입니다. */

export function watchKinds(cb) {
  return 듣기(ctx.f.doc(col(CONFIG), 'kinds'), (s, 캐시) => {
    const list = s.exists() ? (s.data().list ?? []) : [];
    cb(Object.fromEntries(list.map((x) => [x.p, x.k])), 캐시);
  });
}

/** 갈래 표를 통째로 적습니다. 달라진 것이 없으면 부르지 않습니다(비용). */
export async function saveKinds(map, email) {
  const list = Object.entries(map).map(([p, k]) => ({ p, k }));
  await ctx.f.setDoc(ctx.f.doc(col(CONFIG), 'kinds'), {
    list, updatedBy: email ?? null, updatedAt: new Date().toISOString(),
  });
}

/* ── 거래처 안에 손으로 만든 박스 ─────────────────────────
   판정 규칙(docs_rules)과 따로 둡니다. 규칙에 넣으면 파일이 어느 단계인지
   가리는 셈까지 흔들립니다 — 이건 화면에서 묶어 보는 것일 뿐입니다. */

export function watchBoxes(cb) {
  return ctx.f.onSnapshot(ctx.f.doc(col(CONFIG), 'boxes'), (s) =>
    cb(s.exists() ? (s.data().list ?? []) : [])
  );
}

/** 박스 하나를 더합니다. 목록 전체를 다시 씁니다 — 많아야 몇십 개입니다. */
export async function saveBox(box, email) {
  const snap = await ctx.f.getDoc(ctx.f.doc(col(CONFIG), 'boxes'));
  const list = snap.exists() ? (snap.data().list ?? []) : [];
  list.push({ ...box, createdBy: email ?? null, createdAt: new Date().toISOString() });
  await ctx.f.setDoc(ctx.f.doc(col(CONFIG), 'boxes'), { list }, { merge: true });
}

/* ── 사용자 정의 규칙 ─────────────────────────────────── */

export const RULES = 'docs_rules';

export function watchRules(cb) {
  return 듣기(col(RULES), (s, 캐시) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')), 캐시)
  );
}

export async function saveRule(rule, email) {
  const id = rule.id ?? `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const { id: _drop, ...body } = rule;
  await ctx.f.setDoc(ctx.f.doc(col(RULES), id), {
    ...body,
    createdBy: email ?? null,
    createdAt: rule.createdAt ?? new Date().toISOString(),
  });
  return id;
}

export async function saveRules(rules, email) {
  // 한 번에 500건까지만 보낼 수 있다. 넘으면 통째로 실패하므로 450씩 쪼갠다.
  const stamp = new Date().toISOString();
  for (let s = 0; s < rules.length; s += 450) {
    const batch = ctx.f.writeBatch(ctx.db);
    for (const rule of rules.slice(s, s + 450)) {
      const id = rule.id ?? `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${s.toString(36)}`;
      const { id: _drop, ...body } = rule;
      batch.set(ctx.f.doc(col(RULES), id), { ...body, createdBy: email ?? null, createdAt: rule.createdAt ?? stamp });
    }
    await batch.commit();
  }
}

export const deleteRule = (id) => ctx.f.deleteDoc(ctx.f.doc(col(RULES), id));

/* ── 차수별 단품 수량 — 벤더피아가 읽어 갈 칸 ───────────
   사장님 10-16 — 「수입내역보기 … 관련된 단품의 발주 또는 상차 수량이 표기 되어야 합니다」

   ⚠⚠ **창고를 거쳐야 닿습니다.** 벤더피아는 `vendorpia.com`, 서류관리는 `github.io` —
      집이 달라 저쪽에서 우리 `window` 를 못 봅니다. 그래서 여기에 적어 둡니다.
   ⚠ 칸 이름이 **`docs_` 로 시작해야** 합니다. `vp_` 앞가지는 사장님 아이디로 잠겨 있습니다.
   ⚠⚠ **수량만 적습니다. 금액·규격은 칸 자체를 두지 마십시오.**
      FOB·단가는 벤더피아 쪽에서 가립니다 — 여기로 흘리면 그 가림이 뚫립니다.
   ⚠ 사람 이름·전화·주소는 담지 않습니다. 원본 PDF·xlsx 도 안 올립니다. */
export const 수량칸 = 'docs_단품수량';
export const 수량열쇠 = (vendor, 열쇠) => `${vendor}~${열쇠}`.replace(/\//g, '~').slice(0, 400);

/**
 * 바뀐 줄만 적습니다 — 열 때마다 128줄을 다시 쓰면 무료 한도가 닳습니다.
 * 한 번 읽어 견주고, 달라진 것만 씁니다. 사라진 줄은 **안 지웁니다** — 늘리기만 합니다.
 *
 * `표` 를 주면(전체 거래처 줄의 지문) 먼저 `docs_config/수량` **한 건**만 봅니다.
 * 지난번 다 적은 지문과 같으면 창고(128건)를 읽지도 않습니다. 다 적은 뒤에 지문을 남깁니다.
 */
export async function 수량올리기(rows, 표) {
  if (!Array.isArray(rows) || !rows.length) return { ok: true, 적은줄: 0, 그대로: 0 };
  try {
    const 표자리 = ctx.f.doc(col(CONFIG), '수량');
    if (표) {
      const t = await ctx.f.getDoc(표자리);
      if (t.exists() && t.data().h === 표 && t.data().n === rows.length)
        return { ok: true, 적은줄: 0, 그대로: rows.length };
    }
    const snap = await ctx.f.getDocs(col(수량칸));
    const 있던것 = new Map();
    snap.forEach((d) => 있던것.set(d.id, JSON.stringify(d.data()?.차수들 ?? null)));

    const 쓸것 = rows.filter((r) => 있던것.get(수량열쇠(r.vendor, r.열쇠)) !== JSON.stringify(r.차수들));
    for (let i = 0; i < 쓸것.length; i += 450) {
      const batch = ctx.f.writeBatch(ctx.db);
      for (const r of 쓸것.slice(i, i + 450)) {
        // 적는 칸은 **다섯**뿐입니다. 늘리지 마십시오.
        batch.set(ctx.f.doc(col(수량칸), 수량열쇠(r.vendor, r.열쇠)),
          { vendor: r.vendor, code: r.code, 차수들: r.차수들, updatedAt: Date.now() }, { merge: true });
      }
      await batch.commit();
    }
    // 지문을 못 남겨도 적은 것은 적은 것입니다 — 다음에 창고를 한 번 더 읽을 뿐입니다.
    if (표) await ctx.f.setDoc(표자리, { h: 표, n: rows.length, at: Date.now() }).catch(() => {});
    return { ok: true, 적은줄: 쓸것.length, 그대로: rows.length - 쓸것.length };
  } catch (e) {
    return { ok: false, why: e?.code || e?.message || '못 적음' };
  }
}

/* ── 벤더피아 상품 ─────────────────────────────────────
   벤더피아상품정리 앱이 적어 둔 자리를 **읽기만** 합니다. 한 글자도 안 씁니다.
   ⚠ 그 자리의 화베 규칙은 사장님 계정만 들여보냅니다. 다른 계정이면 못 읽습니다 —
     그때는 터뜨리지 않고 왜 못 읽었는지만 돌려줍니다. 화면이 그 한 줄을 적습니다.
   ⚠ 열 때 한 번만 부릅니다. 코드마다 부르면 문서마다 돈이 듭니다. */
export const VP_상품 = 'vp_상품목록';

/** 벤더피아 문서 한 벌에서 **엑셀 한 줄**만 꺼냅니다. `fields` 가 없으면 그대로 돌려줍니다. */
export function 벤더피아줄벗기기(v) {
  return (v && typeof v.fields === 'object' && v.fields) ? v.fields : v;
}

export async function 벤더피아상품() {
  try {
    const snap = await ctx.f.getDocs(col(VP_상품));
    const rows = [];
    /* ⚠⚠ **엑셀 한 줄은 `fields` 밑에 들어 있다. 벗겨서 내보내라.**
          벤더피아상품정리가 담는 꼴이다(그 쪽 index.html 371줄) —
            { fields: { 매출처명, 상품코드, 단품코드, 단품명, … },
              source: '벤더피아 상품목록', fileName, updatedAt }
          벗기지 않으면 `r.단품코드` 가 undefined 라 **사전이 통째로 빈다.**
          화면은 「읽혔다」 고 하면서 「맞음 0 / 전체 N」 이 뜬다 — 읽기가 된 것처럼
          보여서 더 나쁘다. 10-11 관리자가 진짜 문서 꼴로 재서 잡았다(단품 0가지).
          ⚠ `fields` 가 없는 문서가 섞여 있어도 터지지 않게 그 줄은 그대로 쓴다. */
    snap.forEach((d) => rows.push(벤더피아줄벗기기(d.data())));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, why: e?.code || e?.message || '못 읽음' };
  }
}

/* ── 견적서 (제품관리 → 견적서 관리) ─────────────────────
   서버(sync.gs 견적읽기_)가 드라이브 견적 파일을 글자로 바꿔 driveId 마다 한 문서로 적습니다.
   여기서는 읽기만 합니다. */
export const QUOTES = 'docs_quotes';

/* 견적서 판(과 그 건수를 보이는 제품관리)에 있을 때만 듣습니다 — 나가면 끕니다. */
export function watchQuotes(cb) {
  return ctx.f.onSnapshot(col(QUOTES), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}
