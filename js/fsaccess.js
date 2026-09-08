/**
 * File System Access API 래퍼.
 * 폴더 핸들을 IndexedDB에 넣어두고 다음 방문 때 다시 씁니다.
 */

const DB = 'vivivic-docs';
const STORE = 'handles';
const KEY = 'root';

export const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idb(mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const saveHandle = (h) => idb('readwrite', (s) => s.put(h, KEY));
export const loadHandle = () => idb('readonly', (s) => s.get(KEY));
export const clearHandle = () => idb('readwrite', (s) => s.delete(KEY));

export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ id: 'vivivic-china', mode: 'readwrite' });
  await saveHandle(handle);
  return handle;
}

/** 저장된 핸들의 권한을 확인합니다. 사용자 제스처 안에서 불러야 프롬프트가 뜹니다. */
export async function ensurePermission(handle, { prompt = false } = {}) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!prompt) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}

const SKIP_DIR = /^(\.|_옵시디언$|node_modules$)/;
const SKIP_FILE = /^(\.|~\$)/;

/**
 * 루트(=중국 폴더) 아래를 훑습니다.
 * 최상위 폴더 이름을 거래처로 봅니다.
 * → [{ name, path, size, mtime, vendor, handle }]
 */
export async function scan(root, { maxDepth = 4, onProgress } = {}) {
  const files = [];
  const vendors = [];

  for await (const [name, entry] of root.entries()) {
    if (entry.kind !== 'directory') continue;
    if (SKIP_DIR.test(name)) continue;
    vendors.push(name);
    await walk(entry, name, name, 1);
  }

  // 루트에 바로 놓인 파일도 담습니다 (HTML 도구 등)
  for await (const [name, entry] of root.entries()) {
    if (entry.kind !== 'file' || SKIP_FILE.test(name)) continue;
    files.push(await toRecord(entry, name, name, '(루트)'));
  }

  return { files, vendors };

  async function walk(dir, vendor, prefix, depth) {
    if (depth > maxDepth) return;
    for await (const [name, entry] of dir.entries()) {
      const path = `${prefix}/${name}`;
      if (entry.kind === 'directory') {
        if (SKIP_DIR.test(name)) continue;
        await walk(entry, vendor, path, depth + 1);
      } else {
        if (SKIP_FILE.test(name)) continue;
        files.push(await toRecord(entry, name, path, vendor));
        if (onProgress && files.length % 20 === 0) onProgress(files.length);
      }
    }
  }

  async function toRecord(entry, name, path, vendor) {
    let size = null;
    let mtime = null;
    try {
      const f = await entry.getFile();
      size = f.size;
      mtime = f.lastModified;
    } catch {
      /* 동기화 중이거나 아직 안 내려온 파일은 건너뜁니다 */
    }
    // 맥은 한글을 자모로 쪼개 줍니다(NFD). 드라이브는 NFC 로 줍니다.
    // 경로가 곧 문서 ID라, 맞춰두지 않으면 같은 파일이 두 벌로 올라갑니다.
    return {
      name: name.normalize('NFC'),
      path: path.normalize('NFC'),
      size,
      mtime,
      vendor: vendor.normalize('NFC'),
      handle: entry,
    };
  }
}

/** 파일을 새 탭에서 엽니다. */
export async function openFile(handle) {
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 루트 폴더에 JSON을 씁니다 (입력값 저장용). */
export async function writeJSON(root, filename, data) {
  const fh = await root.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  await w.close();
}

export async function readJSON(root, filename) {
  try {
    const fh = await root.getFileHandle(filename);
    const f = await fh.getFile();
    return JSON.parse(await f.text());
  } catch {
    return null;
  }
}

/** 저장된 루트 핸들에서 상대 경로를 따라가 File 을 꺼냅니다. */
export async function getFileByPath(root, path) {
  const parts = path.split('/').filter(Boolean);
  let dir = root;
  for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
  const fh = await dir.getFileHandle(parts[parts.length - 1]);
  return fh.getFile();
}

/** 저장된 루트 핸들에서 상대 경로를 따라가 파일을 엽니다. */
export async function openByPath(root, path) {
  const parts = path.split('/').filter(Boolean);
  let dir = root;
  for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
  const fh = await dir.getFileHandle(parts[parts.length - 1]);
  return openFile(fh);
}
