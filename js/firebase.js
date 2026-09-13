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
  ctx = { auth: authMod.getAuth(app), db: fsMod.getFirestore(app), a: authMod, f: fsMod };
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

export async function signOut() {
  const c = await init();
  return c.a.signOut(c.auth);
}

/** Firebase 오류 코드를 사람이 읽을 문장으로 바꿉니다. */
export function authMessage(code) {
  return (
    {
      'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
      'auth/user-not-found': '등록되지 않은 계정입니다.',
      'auth/wrong-password': '비밀번호가 맞지 않습니다.',
      'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.',
      'auth/too-many-requests': '시도가 너무 많았습니다. 잠시 뒤에 다시 해주세요.',
      'auth/network-request-failed': '네트워크에 연결하지 못했습니다.',
    }[code] ?? ('로그인하지 못했습니다. (' + (code || '까닭 모름') + ')')
  );
}

/* ── 파일 목록 ────────────────────────────────────────── */

/** 문서 ID로 쓸 수 있게 경로를 다듬습니다 (슬래시 금지). */
export const fileKey = (path) => path.replace(/\//g, '~').slice(0, 400);

export function watchFiles(cb) {
  return ctx.f.onSnapshot(col(FILES), (s) => cb(s.docs.map((d) => d.data())));
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
  return ctx.f.onSnapshot(col(RULES), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')))
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
