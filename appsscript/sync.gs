/**
 * VIVIVIC 서류 동기화
 * 구글 드라이브 '중국' 폴더를 훑어 Firestore 문서 목록을 갱신합니다.
 *
 * ⚠ **스스로 10분마다 돌지 않습니다.** 사장님 10-15 말씀 —
 *   「드라이브를 10분마다 훑지말고 프로그램에 있는 드라이브스캔 버튼 작동시만 확인하게」
 *   앱이 켜질 때와 「드라이브 스캔」 단추를 누르실 때 `/exec` 가 불려서 돕니다.
 *   되돌리려면 아래 `자동10분걸기_()` 를 손으로 한 번 부르십시오.
 */

const PROJECT_ID = 'vivivic-4b7ef';
const ROOT_FOLDER = '중국';
const COLLECTION = 'artifacts/vivivic-4b7ef/public/data/docs_files';
const CONFIG = 'artifacts/vivivic-4b7ef/public/data/docs_config';
const MAX_DEPTH = 4;
// 뽑는 규칙이 바뀌면 이 숫자를 올립니다. 지문이 달라져 전체를 다시 훑습니다.
const MARK_VERSION = 18;
// 서류에서 뽑는 규칙이 바뀌면 이 숫자를 올립니다. 이미 읽어둔 서류도 다시 읽습니다.
// (지문만 올리면, 칸이 비어 있어도 "이미 읽었다"로 넘어가 버립니다.)
const READ_VERSION = 14;
const SKIP_DIR = /^(_옵시디언|\.|node_modules)/;

// 문서 이름(name)에는 URL이 아니라 projects/... 부터 들어가야 합니다.
const NAME = 'projects/' + PROJECT_ID + '/databases/(default)/documents';
const BASE = 'https://firestore.googleapis.com/v1/' + NAME;

/* ── 진입점 ───────────────────────────────────────────── */

let ciplOk = 0;
let ciplNone = 0;
let ciplCut = 0;
let poOk = 0;
let poAll = 0;
let lastNote = '';
let runStart = new Date();
let lastCiplError = '';

function sync() {
  const started = new Date();
  runStart = started;
  ciplOk = 0;
  ciplNone = 0;
  ciplCut = 0;
  poOk = 0;
  poAll = 0;
  lastCiplError = '';
  const root = findRoot_();
  const files = [];
  walk_(root.getId(), root.getName(), '', 0, files);

  // 드라이브를 훑는 건 공짜입니다. 여기서 지문을 떠서 지난번과 같으면 그냥 끝냅니다.
  // 매번 503건을 다시 쓰면 Firestore 무료 한도를 넘고, 앱을 켜둔 브라우저마다
  // 그 503건을 다시 받아갑니다. 바뀐 게 없으면 아무것도 건드리지 않습니다.
  const mark = fingerprint_(files);
  const props = PropertiesService.getScriptProperties();
  // 잔액서류를 못 읽고 넘어간 게 있으면, 파일이 그대로여도 한 번 더 시도합니다.
  // (권한 승인 전에는 실패하니, 승인만 하면 다음 호출에서 저절로 채워집니다.)
  const retry = props.getProperty('retryCipl') === '1';
  if (!retry && props.getProperty('mark') === mark) {
    lastNote = '바뀐 게 없습니다 · 파일 ' + files.length + '건 · ' + (new Date() - started) / 1000 + '초';
    console.log(lastNote);
    if (BORING_SCAN) 보링훑기_();   // 사장님 10-30 멈춤 — BORING_SCAN 을 보세요
    return;
  }

  const existing = listExisting_();
  const seen = {};
  files.forEach(function (f) { seen[docId_(f.path)] = true; });

  // ① 목록 먼저 — 새 파일·바뀐 파일·지운 파일의 기본 칸만 곧장 씁니다.
  //    서류를 다 읽을 때까지 기다리면 새 파일·사진이 몇 분 동안 화면에 안 뜹니다(10-30 사장님).
  const writes = [];
  const toRead = [];
  files.forEach(function (f) {
    const before = existing[docId_(f.path)];
    const doc = isCipl_(f.name) || isOrderPdf_(f.name);
    if (!before || changed_(before, f)) {
      // 내용이 바뀐 서류는 예전 cipl 을 비웁니다. 남겨 두면 다시 읽기 전에 시간이 끊겼을 때
      // 다음번에 「이미 읽었다」 로 보여 영영 다시 안 읽고, 그동안 틀린 값으로 대조합니다.
      writes.push(baseWrite_(f, baseFields_(f), doc && before && before.hasCipl ? ['cipl'] : []));
      if (doc) toRead.push(f);
    }
    // 서류인데 아직 안을 못 읽었으면 한 번 더 읽습니다. 예전 cipl 은 새로 읽을 때까지 둡니다.
    else if (doc && (!before.hasCipl || before.readV !== READ_VERSION)) toRead.push(f);
    // 예전에 올라간 파일에는 ctime 이 없습니다. 그 칸 하나만 덧칠합니다 —
    // 통째로 다시 쓰면 읽어둔 cipl 이 날아갑니다.
    else if (f.ctime && !before.ctime) writes.push(ctimeWrite_(f));
  });
  let 남긴밖 = 0;
  Object.keys(existing).forEach(function (id) {
    if (seen[id]) return;
    // 범위 밖 문서는 사장님 확인 전까지 남깁니다 — 벤더피아가 docs_files 의 cipl 을 읽습니다(10-30).
    if (!DROP_OUTSIDE && !범위안인가_(existing[id].path)) { 남긴밖++; return; }
    writes.push({ delete: NAME + '/' + COLLECTION + '/' + id });
  });

  commit_(writes);
  props.setProperty('mark', mark);
  // 읽을 서류가 있으면 미리 「다시」 를 걸어 둡니다 — 읽다가 6분에 끊겨도 다음번에 이어 읽습니다.
  if (toRead.length) props.setProperty('retryCipl', '1');

  // ② 서류는 읽는 대로 — CIPL_BATCH 건 또는 CIPL_FLUSH_MS 마다 cipl 칸만 저장합니다.
  let ciplWrites = 0;
  let pending = [];
  let flushedAt = new Date();
  const flush = function () {
    if (!pending.length) return;
    commit_(pending);
    ciplWrites += pending.length;
    pending = [];
    flushedAt = new Date();
  };
  toRead.forEach(function (f) {
    const w = ciplWrite_(f);
    if (w) pending.push(w);
    if (pending.length >= CIPL_BATCH || new Date() - flushedAt > CIPL_FLUSH_MS) flush();
  });
  flush();

  // 시간이 모자라 미룬 게 있을 때만 다음번에 다시 훑습니다.
  if (ciplCut > 0) props.setProperty('retryCipl', '1');
  else props.deleteProperty('retryCipl');

  const secs = (new Date() - started) / 1000;
  const note = '파일 ' + files.length + '건' + (남긴밖 ? ' · 범위 밖 남김 ' + 남긴밖 + '건' : '') + ' · 쓰기 ' + (writes.length + ciplWrites) + '건 · 서류 읽음 ' + ciplOk +
    '건, 읽을 표 없음 ' + ciplNone + '건' + (poAll ? ' · 발주서 표 ' + poOk + '/' + poAll + '건' : '') + (ciplCut ? ', 시간 모자라 미룸 ' + ciplCut + '건' : '') +
    ' · ' + secs + '초' + (lastCiplError ? ' · 마지막 오류: ' + lastCiplError : '');
  console.log(note);
  lastNote = note;
  props.setProperty(
    'lastSync',
    Utilities.formatDate(started, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ' · ' + files.length + '건 · 쓰기 ' + (writes.length + ciplWrites)
  );

  if (BORING_SCAN) 보링훑기_();     // 사장님 10-30 멈춤 — BORING_SCAN 을 보세요
}

/** 파일 목록 전체를 한 줄로 요약합니다. 하나라도 달라지면 값이 바뀝니다. */
function fingerprint_(files) {
  const parts = files
    .map(function (f) { return f.path + '|' + f.mtime + '|' + f.size + '|' + f.md5; })
    .sort();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, MARK_VERSION + '.' + READ_VERSION + '\n' + parts.join('\n'), Utilities.Charset.UTF_8);
  return bytes
    .map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); })
    .join('');
}

/** 올라가 있는 값과 지금 값이 다른지 봅니다. */
function changed_(before, f) {
  return (
    before.name !== f.name ||
    before.vendor !== f.vendor ||
    before.size !== String(f.size) ||
    before.mtime !== String(f.mtime) ||
    before.md5 !== f.md5 ||
    before.driveId !== f.driveId
  );
}

/* ── 드라이브 ─────────────────────────────────────────── */

function findRoot_() {
  const it = DriveApp.getFoldersByName(ROOT_FOLDER);
  if (!it.hasNext()) throw new Error('"' + ROOT_FOLDER + '" 폴더를 찾지 못했습니다.');
  return it.next();
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
// 변환용 복사본에 붙이는 표. 이 이름은 훑을 때 건너뜁니다.
const TEMP_PREFIX = '(vivivic 임시) ';

/* ── 연동 범위 (사장님 10-30) ─────────────────────────────
   「중구폴더내 견적관리 폴더와 제헤우드의 차수별 폴더로만 한정하여 데이터를 연동 합시다」
   「일다 제해우드 외 다른 거래처는 모두 지워 주세요」
   sync 는 `중국/제헤우드/` 안의 **차수 폴더만** 훑습니다. 차수 폴더 안 하위 폴더(검수·샘플 등)는 읽습니다.
   다른 거래처·제헤우드 안 차수 아닌 폴더(분류전·01_발주서…)는 들어가지도 않습니다.
   견적서는 `중국/견적관리/` 안만 찾습니다(견적목록_). 넓히려면 사장님께 먼저 여쭙니다.
   10-30 해피코 더함 — 「서류관리 앱에 해피코 박스에 제헤우드와 동일한 방식으로 만들어 주세요」.
   해피코도 차수 폴더(Hp-26-NN)만, 분류전 등은 안 들어갑니다. */
const VENDOR_DIRS = ['제헤우드', '해피코'];
// ⚠ 범위 밖으로 나간 docs_files 를 지울까. 벤더피아(수입정보)가 docs_files 의 cipl 을 거래처 가리지 않고 읽어서
//   사장님 확인 전까지 false — 범위 밖 문서는 안 쓰고 안 지우고 그대로 둡니다. 범위 안에서 없어진 파일만 지웁니다.
const DROP_OUTSIDE = false;
const QUOTE_DIR = '견적관리';

/**
 * 폴더 이름이 차수 폴더인가 — js/parse.js 의 batchFromPath(→ parseBatch) 를 그대로 옮긴 것입니다.
 * 새 셈을 만들지 않았습니다. 규칙을 고치면 parse.js 와 같이 고치고 test/sync.test.mjs 가 둘을 맞대 봅니다.
 */
function 차수폴더인가_(name) {
  let n = String(name).normalize('NFC').replace(/^TalkFile_+/i, '').replace(/(\.[a-z0-9]{2,5})\1+$/i, '$1').trim();
  n = n.replace(/_/g, '-').replace(/(^|[^\d])20(2[4-9])\s*-/g, '$1$2-');
  const ok = function (no) { const v = Number(no); return v >= 1 && v <= 60; };
  let m = /(\d{2})\s*-\s*(\d{1,2})\s*차/.exec(n);
  if (m) return ok(m[2]);
  m = /(?<![A-Za-z])(?:ZH|ING|JW|BJ)\)?\s*-?\s*(?:20)?(\d{2})\s*-\s*(\d{1,2})(?!\d)/i.exec(n);
  if (m) return ok(m[2]);
  m = /AMT\s*(?:20)?(\d{2})\s*-\s*(\d{1,2})(?!\d)/i.exec(n);
  if (m) return ok(m[2]);
  const docNo = /(\d{2})-\d{3}-AMT/i.exec(n);
  if (docNo) {
    const cha = /(?:^|[^\d])(\d{1,2})\s*차/.exec(n);
    if (cha) return ok(cha[1]);
    const tail = /-AMT-(?:[A-Z]{2}-)?(\d{1,2})(?!\d)/i.exec(n);
    if (tail) return ok(tail[1]);
  }
  m = /(?:^|[^\d])(2[4-9])\s*-\s*(\d{1,2})(?!\d)/.exec(n);
  if (m) return ok(m[2]);
  return false;
}

/**
 * 여러 폴더의 자식을 한 번에 받습니다 — `'a' in parents or 'b' in parents …`.
 * 폴더마다 따로 물으면 폴더 수만큼 UrlFetch 가 나갑니다. 주소가 2KB 를 넘지 않게 끊어 묻습니다.
 * onlyFolders 면 폴더만. 돌려주는 것마다 parents 가 붙어 있습니다.
 */
function listMany_(folderIds, onlyFolders, extraQ) {
  const out = [];
  const 덩이 = [];
  let 지금 = [];
  folderIds.forEach(function (id) {
    if (지금.length && encodeURIComponent(지금.concat(id).map(function (x) { return "'" + x + "' in parents"; }).join(' or ')).length > 1300) {
      덩이.push(지금);
      지금 = [];
    }
    지금.push(id);
  });
  if (지금.length) 덩이.push(지금);
  덩이.forEach(function (ids) {
    let pageToken = '';
    do {
      const q = '(' + ids.map(function (x) { return "'" + x + "' in parents"; }).join(' or ') + ') and trashed = false' +
        (onlyFolders ? " and mimeType = '" + FOLDER_MIME + "'" : '') + (extraQ ? ' and ' + extraQ : '');
      const url =
        'https://www.googleapis.com/drive/v3/files' +
        '?q=' + encodeURIComponent(q) +
        '&fields=' + encodeURIComponent('nextPageToken,files(id,name,size,md5Checksum,modifiedTime,createdTime,mimeType,shortcutDetails,parents)') +
        '&pageSize=1000' +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + token_() },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) {
        throw new Error('폴더 조회 실패 ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
      }
      const body = JSON.parse(res.getContentText());
      (body.files || []).forEach(function (f) { out.push(f); });
      pageToken = body.nextPageToken || '';
    } while (pageToken);
  });
  return out;
}

/**
 * 훑기 — `중국/<VENDOR_DIRS>/<차수 폴더>/…` 만 담습니다(사장님 10-30, 위 「연동 범위」).
 * 층마다 한 번에 묻습니다: 중국 자식(폴더) 1번 → 거래처들 자식 1번 → 차수 폴더들 자식 1번 → 그 밑 층 1번 → …
 * (주소가 길면 층 하나가 2~3번). 예전엔 `중국` 아래 폴더마다 한 번씩 129번이었습니다.
 * 깊이는 예전과 같습니다 — 중국 0 · 거래처 1 · 차수 2 · 하위 3 · 그 밑 4 층까지 엽니다(MAX_DEPTH).
 * 인자 꼴은 예전 walk_ 그대로 둡니다(시험이 갈아 끼웁니다). folderId 는 `중국` 폴더.
 */
function walk_(folderId, rootName, prefix, depth, out) {
  // 거래처 폴더는 `중국` 자식(폴더만) 한 번으로 찾습니다. 이름은 드라이브에 적힌 그대로 경로에 씁니다.
  const 고른 = VENDOR_DIRS.map(function (v) { return v.normalize('NFC'); });
  const 거래처 = {};   // 거래처 폴더 id → 이름
  listMany_([folderId], true).forEach(function (vdir) {
    if (고른.indexOf(String(vdir.name).normalize('NFC').trim()) >= 0) 거래처[vdir.id] = vdir.name;
  });
  if (!Object.keys(거래처).length) return;
  // 층: 폴더 id → { path, vendor }. 첫 층은 차수 폴더만. 거래처가 늘어도 층마다 한 번에 묻습니다.
  let 층 = {};
  listMany_(Object.keys(거래처), true).forEach(function (c) {
    if (SKIP_DIR.test(c.name) || !차수폴더인가_(c.name)) return;
    (c.parents || []).forEach(function (pid) {
      if (거래처[pid]) 층[c.id] = { path: 거래처[pid] + '/' + c.name, vendor: 거래처[pid] };
    });
  });
  for (let d = 2; d <= MAX_DEPTH && Object.keys(층).length; d++) {
    const 다음 = {};
    listMany_(Object.keys(층), false).forEach(function (c) {
      (c.parents || []).forEach(function (pid) {
        if (!층[pid]) return;
        const path = 층[pid].path + '/' + c.name;
        if (c.mimeType === FOLDER_MIME) {
          if (!SKIP_DIR.test(c.name)) 다음[c.id] = { path: path, vendor: 층[pid].vendor };
          return;
        }
        const f = fileOf_(c, path, 층[pid].vendor);
        if (f) out.push(f);
      });
    });
    층 = 다음;
  }
}

/** 올라가 있던 문서 경로가 지금 범위(거래처/차수 폴더/…) 안인가. 경로를 모르면 밖으로 봅니다. */
function 범위안인가_(path) {
  const 조각 = String(path || '').split('/');
  if (조각.length < 3) return false;
  const 고른 = VENDOR_DIRS.map(function (v) { return v.normalize('NFC'); });
  return 고른.indexOf(조각[0].normalize('NFC').trim()) >= 0 && 차수폴더인가_(조각[1]);
}

/** 드라이브 자식 하나 → 담을 파일. 건너뛸 것이면 null. */
function fileOf_(c, path, vendor) {
  const name = c.name;
  if (name.charAt(0) === '.' || name.indexOf('~$') === 0) return null;
  if (name.indexOf(TEMP_PREFIX) === 0 || name.indexOf('(임시) ') === 0) return null;

  // 바로가기는 껍데기입니다. 원본을 가리키게 바꿔 둡니다.
  let id = c.id;
  if (c.mimeType === SHORTCUT_MIME) {
    const target = c.shortcutDetails || {};
    if (!target.targetId || target.targetMimeType === FOLDER_MIME) return null;
    id = target.targetId;
  }

  return {
    name: name,
    path: path,
    vendor: vendor,
    size: c.size ? Number(c.size) : 0,
    mtime: new Date(c.modifiedTime).getTime(),
    // 드라이브에 올라온 날. 보여 주기에만 씁니다 — 차수 묶기는 파일 이름의 날짜를 그대로 씁니다.
    ctime: c.createdTime ? new Date(c.createdTime).getTime() : 0,
    driveId: id,
    // 구글 문서·시트는 md5 가 없습니다. 그런 파일은 이름·크기로 갈음합니다.
    md5: c.md5Checksum || '',
  };
}

/* ── Firestore ────────────────────────────────────────── */

function token_() {
  return ScriptApp.getOAuthToken();
}

function docId_(path) {
  // 문서 ID에는 슬래시를 쓸 수 없습니다.
  return path.replace(/\//g, '~').slice(0, 400);
}

function listExisting_() {
  const out = {};
  let pageToken = '';
  const mask = ['name', 'path', 'vendor', 'size', 'mtime', 'ctime', 'md5', 'driveId', 'cipl']
    .map(function (f) { return 'mask.fieldPaths=' + f; })
    .join('&');
  do {
    const url =
      BASE + '/' + COLLECTION + '?pageSize=300&' + mask +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token_() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('목록 조회 실패 ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) {
      const fields = d.fields || {};
      out[d.name.split('/').pop()] = {
        name: (fields.name || {}).stringValue,
        path: (fields.path || {}).stringValue,
        vendor: (fields.vendor || {}).stringValue,
        size: (fields.size || {}).integerValue,
        mtime: (fields.mtime || {}).integerValue,
        ctime: (fields.ctime || {}).integerValue,
        md5: (fields.md5 || {}).stringValue,
        driveId: (fields.driveId || {}).stringValue,
        // 품목 칸까지 들어 있어야 다 읽은 것으로 봅니다. 규칙이 늘면 여기도 같이 늘립니다.
        hasCipl: !!(fields.cipl && fields.cipl.mapValue && fields.cipl.mapValue.fields &&
                    fields.cipl.mapValue.fields.items !== undefined),
        readV: Number((((fields.cipl || {}).mapValue || {}).fields || {}).v &&
                      fields.cipl.mapValue.fields.v.integerValue) || 0,
      };
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** ctime 한 칸만 덧칠합니다. 다른 칸(cipl 포함)은 그대로 둡니다. */
function ctimeWrite_(f) {
  return {
    update: {
      name: NAME + '/' + COLLECTION + '/' + docId_(f.path),
      fields: { ctime: { integerValue: String(f.ctime) } },
    },
    updateMask: { fieldPaths: ['ctime'] },
  };
}

/* 기본 칸만 덧칠합니다 — 마스크에 없는 칸(cipl 포함)은 그대로 둡니다.
   ⚠ 마스크 없이 쓰면 Firestore 가 문서를 통째로 갈아 끼워, 읽어둔 cipl 이 날아갑니다.
   drop 에 칸 이름을 주면 그 칸은 지웁니다(마스크에 있는데 값이 없으면 지워짐). */
function baseWrite_(f, fields, drop) {
  const keys = [];
  for (const k in fields) keys.push(k);
  return {
    update: { name: NAME + '/' + COLLECTION + '/' + docId_(f.path), fields: fields },
    updateMask: { fieldPaths: keys.concat(drop || []) },
  };
}

function baseFields_(f) {
  return {
    name: { stringValue: f.name },
    path: { stringValue: f.path },
    vendor: { stringValue: f.vendor },
    size: { integerValue: String(f.size) },
    mtime: { integerValue: String(f.mtime) },
    ctime: { integerValue: String(f.ctime || 0) },
    driveId: { stringValue: f.driveId },
    md5: { stringValue: f.md5 },
  };
}

// 서류를 읽는 대로 몇 건씩 묶어 씁니다. 하나마다 쓰면 UrlFetch 가 서류 수만큼 늡니다.
const CIPL_BATCH = 5;
const CIPL_FLUSH_MS = 20 * 1000;

/** 서류 안을 읽어 cipl 칸 하나만 쓰는 것을 만듭니다. 시간이 모자라면 null(다음번에 읽음). */
function ciplWrite_(f) {
  // 6분 제한이 있습니다. 오래 걸리면 남은 건 다음 호출로 넘깁니다.
  if (new Date() - runStart > 4 * 60 * 1000) {
    ciplCut++;
    return null;
  }
  const cipl = isOrderPdf_(f.name) ? orderCipl_(f) : ciplValue_(f);
  return {
    update: { name: NAME + '/' + COLLECTION + '/' + docId_(f.path), fields: { cipl: cipl } },
    updateMask: { fieldPaths: ['cipl'] },
  };
}

/** 발주서 PDF 는 글자로 바꿔 읽습니다. */
function orderCipl_(f) {
  const doc = pdfText_(f.driveId) || {};
  const text = doc.text;
  const pb = readPdfBrief_(text);
  const pi = readPdfItems_(text);
  if (pb || pi) ciplOk++; else ciplNone++;
  // 발주서 내용보기 — 원본 양식 그대로의 표. 칸 모양은 잔액서류 sheets 와 같습니다.
  const pt = pdfTable_(doc.html);
  poAll++;
  if (pt) poOk++;
  return { mapValue: { fields: {
    brief: briefValue_(pb), invoiceDate: { stringValue: '' }, items: itemsValue_(pi),
    sheets: { arrayValue: { values: pt ? [sheetValue_(pt)] : [] } },
    v: { integerValue: String(READ_VERSION) },
  } } };
}

/** 잔액서류면 안을 들여다보고 수치를 같이 올립니다. */
function ciplValue_(f) {
  // 읽어봤는데 표가 없는 서류도 있습니다(스캔을 엑셀로 감싼 것 등).
  // 그런 파일도 "봤다"고 남겨야 매번 다시 열지 않습니다.
  const c = ciplOf_(f.driveId, f.name) || {};
  if (c.cartons || c.brief || c.invoiceDate) ciplOk++; else ciplNone++;
  return {
    mapValue: {
      fields: {
        lines: { integerValue: String(c.lines || 0) },
        pcs: { doubleValue: c.pcs || 0 },
        cartons: { doubleValue: c.cartons || 0 },
        cbm: { doubleValue: c.cbm || 0 },
        gross: { doubleValue: c.gross || 0 },
        net: { doubleValue: c.net || 0 },
        swapped: { booleanValue: !!c.swapped },
        orderNo: { stringValue: c.orderNo || '' },
        invoiceDate: { stringValue: c.invoiceDate || (c.brief && c.brief.invoiceDate) || '' },
        supplier: { stringValue: c.supplier || '' },
        brief: briefValue_(c.brief),
        items: itemsValue_(c.items),
        sheets: { arrayValue: { values: (c.sheets || []).map(sheetValue_) } },
        v: { integerValue: String(READ_VERSION) },
      },
    },
  };
}

/** brief 를 Firestore 값으로 바꿉니다. 없으면 빈 map. */
function briefValue_(b) {
  const fields = {};
  if (b) {
    ['piNo', 'orderDate', 'deliveryDate', 'container'].forEach(function (k) {
      if (b[k]) fields[k] = { stringValue: String(b[k]) };
    });
    ['qty', 'amount', 'cbm', 'deposit', 'balance'].forEach(function (k) {
      if (isFinite(Number(b[k])) && Number(b[k])) fields[k] = { doubleValue: Number(b[k]) };
    });
  }
  return { mapValue: { fields: fields } };
}

function commit_(writes) {
  // 한 번에 500건까지입니다.
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const res = UrlFetchApp.fetch(BASE + ':commit', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token_() },
      payload: JSON.stringify({ writes: chunk }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('쓰기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
  }
}

/* ── 파일 내주기 ─────────────────────────────────────────
   폰이 파일 알맹이를 받아 카톡·위챗에 **파일째** 보낼 수 있게 합니다.
   링크로는 안 됩니다 — 중국에서 구글 드라이브가 막혀 있습니다.

   ⚠ 이 문은 아무나 두드릴 수 있습니다(웹앱이 ANYONE_ANONYMOUS).
     그래서 로그인 표를 먼저 구글에 물어 확인하고, 허락한 이메일일 때만 내줍니다.
     스크립트 속성이 하나라도 비어 있으면 **아무에게도 안 줍니다**(닫힌 채로 둡니다).
       shareAllow — 허락할 이메일. 쉼표나 빈칸으로 여럿.
       fbKey      — 파이어베이스 웹 열쇠. 저장소에 안 박으려고 여기서 읽습니다.
   ⚠ 읽기만 합니다. 옮기거나 지우거나 이름을 바꾸는 코드는 한 줄도 없습니다.
   ⚠ 「중국」 폴더 아래 파일만 내줍니다. 안 그러면 id 만 알면 아무 파일이나 빼갑니다. */

const SHARE_MAX = 10 * 1024 * 1024;   // base64 는 1/3 커집니다. 여기서 끊습니다.

/**
 * 폰이 파일을 달라고 두드리는 자리.
 * ⚠ 폰은 Content-Type: text/plain 으로 보내야 합니다. application/json 이면 브라우저가
 *   먼저 OPTIONS 를 묻는데, Apps Script 는 그 물음에 답을 못 해 통째로 막힙니다.
 */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // 보링은 제 갈래로 갑니다. 서류 쪽 길(파일내주기_)은 한 줄도 안 건드립니다.
    // 견적서 관리(견적목록·견적읽기)도 제 갈래입니다 — 아래 「견적서 불러오기」.
    out = (req && req['일'] === '보링파일') ? 보링파일내주기_(req)
        : (req && /^견적(목록|읽기)$/.test(String(req['일']))) ? 견적_(req)
        : 파일내주기_(req);
  } catch (err) {
    out = { ok: false, why: 'bad' };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function 파일내주기_(req) {
  const props = PropertiesService.getScriptProperties();
  const allow = String(props.getProperty('shareAllow') || '')
    .split(/[,\s]+/).filter(String).map(function (x) { return x.toLowerCase(); });
  if (!allow.length) return { ok: false, why: 'off' };

  const email = 표확인_(req && req.idToken, props);
  if (!email || allow.indexOf(email.toLowerCase()) < 0) return { ok: false, why: 'who' };

  const id = String((req && req.driveId) || '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return { ok: false, why: 'bad' };

  const file = DriveApp.getFileById(id);            // 읽기만
  if (!중국아래인가_(file)) return { ok: false, why: 'out' };
  if (file.getSize() > SHARE_MAX) return { ok: false, why: 'big' };

  const blob = file.getBlob();
  return {
    ok: true,
    name: file.getName(),
    mime: blob.getContentType() || 'application/octet-stream',
    b64: Utilities.base64Encode(blob.getBytes()),
  };
}

/** 로그인 표가 진짜인지 구글에 물어봅니다. 맞으면 그 사람 이메일, 아니면 빈 글자. */
function 표확인_(idToken, props) {
  const key = props.getProperty('fbKey');
  if (!idToken || !key) return '';
  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: String(idToken) }),
      muteHttpExceptions: true,
    });
  if (res.getResponseCode() !== 200) return '';
  const users = (JSON.parse(res.getContentText()) || {}).users || [];
  return users.length ? String(users[0].email || '') : '';
}

/** 「중국」 폴더 아래에 있는 파일인지 위로 거슬러 봅니다. */
function 중국아래인가_(file) {
  const rootId = findRoot_().getId();
  const 본것 = {};
  let 층 = [file];
  for (let d = 0; d <= MAX_DEPTH + 1 && 층.length; d++) {
    const 다음 = [];
    for (let i = 0; i < 층.length; i++) {
      const ps = 층[i].getParents();
      while (ps.hasNext()) {
        const p = ps.next();
        const pid = p.getId();
        if (pid === rootId) return true;
        if (!본것[pid]) { 본것[pid] = true; 다음.push(p); }
      }
    }
    층 = 다음;
  }
  return false;
}

/* ── 웹앱 ─────────────────────────────────────────────── */

/**
 * 앱이 켜질 때 브라우저가 이 주소를 부릅니다.
 * 바뀐 게 없으면 지문 비교에서 바로 끝나므로 자주 불려도 부담이 없습니다.
 */
function doGet() {
  let out = 'ok';
  try {
    ensureUrl_();
    sync();
    if (lastNote) out = lastNote;
  } catch (e) {
    out = 'error: ' + e.message;
    console.error(e);
  }
  return ContentService.createTextOutput(out);
}

/** 배포된 주소가 아직 안 적혀 있으면 적어 둡니다. 한 번만 씁니다. */
function ensureUrl_() {
  const props = PropertiesService.getScriptProperties();
  const url = ScriptApp.getService().getUrl();
  if (!url || props.getProperty('url') === url) return;
  publishUrl();
  props.setProperty('url', url);
}

/**
 * 이 웹앱 주소를 Firestore 에 적어둡니다.
 * 번들에 박아두면 공개 저장소에 그대로 노출되니, 로그인해야 읽히는 자리에 둡니다.
 * 웹앱으로 배포한 뒤 한 번 실행하세요.
 */
function publishUrl() {
  const url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('아직 웹앱으로 배포되지 않았습니다. 배포 → 새 배포 → 웹 앱 을 먼저 하세요.');
  const res = UrlFetchApp.fetch(BASE + '/' + CONFIG + '/sync', {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token_() },
    payload: JSON.stringify({ fields: { url: { stringValue: url } } }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('주소를 적지 못했습니다 ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  console.log('앱이 이 주소를 부르게 됩니다: ' + url);
}

/* ── 잔액서류(CI&PL) 수치 뽑기 ─────────────────────────── */

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const CIPL_NAME = /CI\s*[&＆和]\s*PL|CI\s*[_,]\s*PL|packing\s*list|装箱单|形式发票|proforma|合同|订单|contract/i;
const CIPL_EXT = /\.(xlsx?|xlsm)$/i;

/** 잔액서류 엑셀인지. 같은 이름이라도 영수증은 아닙니다. */
function isCipl_(name) {
  return CIPL_EXT.test(name) && CIPL_NAME.test(name) && !/영수증|receipt/i.test(name);
}

// 해피코 발주서 이름 꼴 「HPC-26-10차 _20260325.pdf」 — 낱말 없이 이 꼴뿐이라 따로 받습니다(js/parse.js classify 와 같음).
const HAPPYCO_PO_ = /^(?:TalkFile_+)?HPC\s*-\s*\d{2}\s*-\s*\d{1,2}\s*차/i;

/* 글자가 든 발주서 PDF 인지. 영수증 스캔은 글자가 없어 제외합니다.
   ⚠⚠ **낱말은 `js/parse.js` 의 classify 와 같아야 합니다.** 어긋나면 화면엔 발주서인데
      서버가 **안 읽습니다** — 10-16 에 진짜 이름 11장으로 세니 **6장이 그랬습니다**
      (`PO_poniel 26-05` · `26-1_PO for Ceramic table` 꼴. `PO`·`발주서`·`주문서` 가 빠져 있었습니다).
      한쪽만 고치지 마십시오. */
function isOrderPdf_(name) {
  return /\.pdf$/i.test(name) &&
    (/ordersheet|order\s*sheet|(?:^|[^A-Za-z])PO(?![A-Za-z])|purchase\s*order|발주서|주문서/i.test(name) ||
      HAPPYCO_PO_.test(String(name).normalize('NFC'))) &&
    !/영수증|receipt/i.test(name);
}

const cellKey_ = function (v) { return String(v == null ? '' : v).replace(/[\s.()]+/g, '').toLowerCase(); };

const CIPL_COLS_ = [
  ['cartons', [/qtycarton/, /ctns/, /箱数/]],
  ['cbm', [/totalcbm/, /^volumecbm$/, /^cbm$/, /立方/]],
  ['gross', [/^gw/, /grossweight/, /毛重/]],
  ['net', [/^nw/, /netweight/, /净重/]],
  ['pcs', [/qtypcs/, /quantitypcs/, /^pcs$/]],
];
const TOTAL_ROW_ = /total|合计|總計|总计|小计|합계/i;

/** js/parse.js 의 readCipl 과 같은 규칙입니다. 고칠 때 양쪽을 같이 고쳐야 합니다. */
function readCipl_(rows) {
  if (!rows || !rows.length) return null;

  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const merged = [];
    [rows[i] || [], rows[i + 1] || []].forEach(function (r) {
      r.forEach(function (v, c) { merged[c] = (merged[c] || '') + cellKey_(v); });
    });
    const found = {};
    merged.forEach(function (t, c) {
      if (!t) return;
      CIPL_COLS_.forEach(function (pair) {
        if (found[pair[0]] === undefined && pair[1].some(function (re) { return re.test(t); })) found[pair[0]] = c;
      });
    });
    if (found.cartons !== undefined && found.cbm !== undefined) { head = i; cols = found; break; }
  }
  if (head < 0) return null;

  const keys = Object.keys(cols);
  const picked = [];
  for (let i = head + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(function (v) { return TOTAL_ROW_.test(String(v == null ? '' : v)); })) continue;
    if (!isFinite(Number(row[cols.cartons])) || row[cols.cartons] === '' || row[cols.cartons] === null) continue;
    const one = {};
    keys.forEach(function (k) { one[k] = Number(row[cols[k]]) || 0; });
    picked.push(one);
  }
  if (!picked.length) return null;

  const add = function (list, k) { return list.reduce(function (n, r) { return n + r[k]; }, 0); };
  const last = picked[picked.length - 1];
  const rest = picked.slice(0, -1);
  const looksTotal = rest.length > 0 && Math.abs(add(rest, 'cartons') - last.cartons) <= Math.max(1, last.cartons * 0.02);
  const body = looksTotal ? rest : picked;

  const round = function (n, d) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); };
  const a = add(body, 'gross');
  const b = add(body, 'net');
  return {
    lines: body.length,
    pcs: Math.round(add(body, 'pcs')),
    cartons: Math.round(add(body, 'cartons')),
    cbm: round(add(body, 'cbm'), 3),
    gross: round(Math.max(a, b), 1),
    net: round(a && b ? Math.min(a, b) : 0, 1),
    swapped: a > 0 && b > 0 && a < b,
  };
}

/**
 * 서류 머리말에서 주문번호와 인보이스 날짜를 찾습니다.
 * 파일명에 차수가 없는 거래처는 이 날짜가 유일한 단서입니다.
 */
function readMeta_(rows) {
  const flat = [];
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i] || [];
    for (let c = 0; c < row.length; c++) if (row[c] != null) flat.push(String(row[c]));
  }
  const text = flat.join(' ');
  // 서류 머리에 거래처 상호가 찍혀 옵니다 — 폴더를 못 믿을 때 이게 근거가 됩니다.
  const supplier = text.match(/(QINGDAO\s+[A-Z]+(?:\s+[A-Z]+)*\s+(?:WOOD|FURNITURE)[A-Z\s]*)/i);
  const order = text.match(/ORDER\s*NO[:：]?\s*([A-Z]{1,3}-\d{3})/i);
  const day = text.match(/(?:^|[^\d])(2[4-9])(\d{2})(\d{2})(?!\d)/);
  const out = {};
  if (supplier) out.supplier = supplier[1].replace(/\s+/g, ' ').trim().slice(0, 60);
  if (order) out.orderNo = order[1].toUpperCase();
  if (day && Number(day[2]) >= 1 && Number(day[2]) <= 12 && Number(day[3]) >= 1 && Number(day[3]) <= 31)
    out.invoiceDate = '20' + day[1] + '-' + day[2] + '-' + day[3];
  return out.orderNo || out.invoiceDate || out.supplier ? out : null;
}

/**
 * 엑셀을 구글 시트로 잠깐 복사해 값을 읽고, 복사본은 지웁니다.
 * 브라우저는 폴더가 연결돼 있어야 파일 속을 볼 수 있지만, 여기서는 그냥 됩니다.
 */
function ciplOf_(fileId, name) {
  let copyId = null;
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token_() },
      payload: JSON.stringify({ name: TEMP_PREFIX + name, mimeType: SHEET_MIME, parents: ['root'] }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      lastCiplError = '변환 실패 ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 160);
      console.warn(lastCiplError + ' — ' + name);
      return null;
    }
    const made = JSON.parse(res.getContentText());
    copyId = made.id;
    if (made.mimeType && made.mimeType !== SHEET_MIME) {
      lastCiplError = name + ' — 시트로 변환되지 않았습니다 (' + made.mimeType + ')';
      return null;
    }

    // 갓 만든 복사본은 바로 안 열릴 때가 있습니다. 잠깐 두었다 다시 봅니다.
    let ss = null;
    for (let tries = 0; tries < 3 && !ss; tries++) {
      try {
        ss = SpreadsheetApp.openById(copyId);
      } catch (e) {
        if (tries === 2) throw e;
        Utilities.sleep(1500);
      }
    }

    const sheets = ss.getSheets();
    let best = null;
    let meta = null;
    let brief = null;
    let items = null;
    const 표들 = [];
    for (let i = 0; i < sheets.length; i++) {
      const rows = sheets[i].getDataRange().getValues();
      // 내용보기 팝업이 원본 양식 그대로 그릴 표 — 품목 표가 있는 시트마다(CI · PL). 팝업에서 시트 칩으로 고릅니다.
      const 표 = 원본표_(rows, sheets[i]);
      if (표) 표들.push(표);
      const got = readCipl_(rows);
      // 중량은 보통 PL 시트에만 있습니다.
      if (got && (!best || (got.gross && !best.gross))) best = got;
      if (!meta) meta = readMeta_(rows);
      if (!brief) brief = readBrief_(rows);
      if (!items) items = readItems_(rows);
    }
    if (!best && !meta && !brief && !items && !표들.length) return null;
    const out = best || {};
    if (표들.length) out.sheets = 표들;
    if (meta) {
      if (meta.orderNo) out.orderNo = meta.orderNo;
      if (meta.invoiceDate) out.invoiceDate = meta.invoiceDate;
      if (meta.supplier) out.supplier = meta.supplier;
    }
    if (brief) out.brief = brief;
    if (items) out.items = items;
    return out;
  } catch (e) {
    lastCiplError = name + ' — ' + e.message;
    console.warn('잔액서류를 읽지 못했습니다 ' + name + ': ' + e.message);
    return null;
  } finally {
    if (copyId) {
      try {
        UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + copyId, {
          method: 'delete',
          headers: { Authorization: 'Bearer ' + token_() },
          muteHttpExceptions: true,
        });
      } catch (e) { /* 임시 파일은 휴지통에 남아도 큰일은 아닙니다 */ }
    }
  }
}

/* ── 권한 승인 ────────────────────────────────────────── */

/**
 * 이 함수를 편집기에서 한 번 실행하면 필요한 권한을 한꺼번에 물어봅니다.
 *
 * 잔액서류(.xls·.xlsx)는 구글 시트로 잠깐 복사해야 읽을 수 있고,
 * 그 복사가 드라이브 **쓰기** 권한을 씁니다. 읽기 전용으로는 안 됩니다.
 * 아래에서 실제로 만들었다 지워 보며 권한을 확인합니다.
 */
function authorize() {
  const name = DriveApp.getRootFolder().getName();
  const temp = SpreadsheetApp.create('(임시) VIVIVIC 권한확인');
  const id = temp.getId();
  DriveApp.getFileById(id).setTrashed(true);
  console.log('권한 확인 끝났습니다. 루트 폴더: ' + name + ' · 임시 파일은 지웠습니다.');
  console.log('이제 앱을 새로고침하면 잔액서류 수치를 읽어옵니다.');
}


/**
 * PDF 를 구글 문서로 잠깐 바꿔 글자를 꺼냅니다. 복사본은 지웁니다.
 * 발주서는 스캔이 아니라 글자가 든 PDF라 이렇게 하면 내용이 나옵니다.
 * { text, html } 을 돌려줍니다 — 글자는 품목 읽기에, html 은 원본 표(pdfTable_)에 씁니다.
 * 글자 내보내기에서는 줄 경계가 사라져 표를 다시 짤 수 없습니다. html 에는 <tr> 이 남습니다.
 */
function pdfText_(fileId) {
  let copyId = null;
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token_() },
      payload: JSON.stringify({ name: TEMP_PREFIX + 'pdf', mimeType: 'application/vnd.google-apps.document', parents: ['root'] }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      lastCiplError = 'PDF 변환 실패 ' + res.getResponseCode();
      return null;
    }
    copyId = JSON.parse(res.getContentText()).id;

    // 문서 API 권한을 새로 받지 않으려고, 드라이브의 "텍스트로 내보내기" 를 씁니다.
    const txt = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + copyId + '/export?mimeType=text%2Fplain',
      { headers: { Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true }
    );
    if (txt.getResponseCode() !== 200) {
      lastCiplError = 'PDF 내보내기 실패 ' + txt.getResponseCode() + ' ' + txt.getContentText().slice(0, 120);
      return null;
    }
    const htm = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + copyId + '/export?mimeType=text%2Fhtml',
      { headers: { Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true }
    );
    return {
      text: txt.getContentText(),
      html: htm.getResponseCode() === 200 ? htm.getContentText('UTF-8') : '',
    };
  } catch (err) {
    lastCiplError = 'PDF 읽기 실패: ' + err.message;
    return null;
  } finally {
    if (copyId) {
      try {
        UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + copyId, {
          method: 'delete',
          headers: { Authorization: 'Bearer ' + token_() },
          muteHttpExceptions: true,
        });
      } catch (err) { /* 임시 파일은 휴지통에 남아도 큰일은 아닙니다 */ }
    }
  }
}


/* ── 코드 열쇠 (js/parse.js 의 코드열쇠 와 같은 규칙) ──
   **밑줄 자리를 「표식」 으로 봅니다. 날것 코드는 한 글자도 안 고칩니다.**
   사장님 10-11 말씀 — 「모양은 같지만 어긋나는 `_` 표시가 있다는 약속하에,
   완전동일하다면 고, `_` 때문에 완전동일 하지 못하더라도 `_` 때문이라면 고」
   진짜 자료에서 `_`(U+005F) 123가지 · `▁`(U+2581) 57가지 — 같은 제품이 46쌍 갈려 있었습니다.
   ⚠⚠ **밑줄 꼴만입니다. `-`(U+002D) 는 넣지 마십시오** — `BHP8_B` 와 `BHP_B` 는 남입니다.
   ⚠ **대소문자를 뭉개지 마십시오.**
   ⚠ **화면 쪽(js/parse.js)과 여기를 같이 고쳐라.** 한쪽만 고치면 화면과 서버가 어긋난다. */
function 코드열쇠_(v) {
  return String(v == null ? '' : v).replace(/[\u005F\u2581\uFF3F\u2017]/g, '_');
}

/* ── 발주서 PDF 안의 품목 (js/parse.js 의 readPdfItems 와 같은 규칙) ──
 * 구글 문서로 바꾸면 표가 "탭 + 칸 내용" 으로 풀립니다. 칸 차례는 판마다
 * 다르니(일련번호 유무, 빈 칸 하나 더) 자리를 세지 않고
 * **금액 → 수량 → 금액** 이 이어지는 자리를 찾습니다.
 */

const PDF_MONEY_ = /^[\u00a5$\u20a9]\s*[\d,]+(?:\.\d+)?$/;
const PDF_INT_ = /^[\d,]+$/;
// ⚠ 밑줄 꼴을 받아야 합니다 — 안 받으면 그 줄을 통째로 버립니다. 날것은 안 고칩니다.
const PDF_CODE_ = /^[A-Za-z0-9][A-Za-z0-9_\u2581\uFF3F\u2017\-./]{1,24}$/;
const PDF_SIZE_ = /^\d+\s*\*/;

function readPdfItems_(text) {
  if (!text) return null;
  const cells = String(text).split('\t').map(function (c) {
    return c.replace(/\u00a0/g, ' ').trim();
  });

  const order = [];
  const seen = {};
  let lastName = '';

  for (let i = 2; i + 2 < cells.length; i++) {
    if (!PDF_MONEY_.test(cells[i])) continue;
    if (!PDF_INT_.test(cells[i + 1]) || !PDF_MONEY_.test(cells[i + 2])) continue;

    /* 코드는 보통 돈 칸 **두 칸 앞**입니다. 그런데 색이 「내추럴오크 / Natural Oak」 처럼
       두 칸으로 풀리는 발주서가 있어 그때는 한 칸 더 앞입니다(10-16 에 진짜 발주서로 봤습니다).
       그래서 **두 칸 앞을 먼저 보고**, 코드 꼴이 아니면 **몇 칸 더 되짚습니다.**
       ⚠ 되짚는 폭을 넓히지 마십시오 — 멀리 가면 앞 줄의 코드를 집습니다. */
    let code = '';
    for (let k = i - 2; k >= i - 5 && k >= 0; k--) {
      if (PDF_CODE_.test(cells[k])) { code = cells[k]; break; }
    }
    if (!code) continue;

    // 색만 다른 이어지는 줄은 앞 칸이 비어 있어, 위 품목의 이름을 물려받습니다.
    let name = '';
    for (let k = i - 3; k >= i - 6 && k >= 0; k--) {
      const c = cells[k];
      if (!c || PDF_SIZE_.test(c) || PDF_MONEY_.test(c) || PDF_INT_.test(c) || PDF_CODE_.test(c)) continue;
      name = c.split(/\r?\n/)[0].trim().slice(0, 40);
      break;
    }
    if (name) lastName = name;
    else name = lastName;

    const qty = Number(cells[i + 1].replace(/,/g, ''));
    if (!Number.isFinite(qty)) continue;

    if (seen[code]) seen[code].qty += qty;
    else { seen[code] = { code: code, name: name, qty: qty }; order.push(seen[code]); }
  }

  return order.length ? order : null;
}

/** 발주서(PDF)에서 뽑아낼 것들. 글자로 바꾼 뒤 이름표를 찾습니다. */
function readPdfBrief_(text) {
  if (!text) return null;
  const t = String(text).replace(/[\t\u00a0]+/g, ' ');
  const one = function (re, pick) {
    const m = re.exec(t);
    return m ? (pick ? pick(m) : m[1].trim()) : null;
  };
  const date = function (v) {
    if (!v) return null;
    const m = /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(v);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : null;
  };

  const out = {};
  const po = one(/PO\s*NO\s*[\s\n]*([0-9]{2}-[0-9]{3}-AMT[-A-Z0-9]*)/i);
  if (po) out.piNo = po;
  const od = date(one(/Order\s*Date\s*[\s\n]*([^\n]{6,20})/i));
  if (od) out.orderDate = od;
  const dd = date(one(/Delivery\s*[\s\n]*Date\s*[\s\n]*([^\n]{6,30})/i));
  if (dd) out.deliveryDate = dd;
  const cbm = one(/\bCBM\s*[\s\n]*([0-9]+(?:\.[0-9]+)?)/i);
  if (cbm) out.cbm = Number(cbm);
  // 합계는 "TOTAL → 수량 → ¥금액" 차례로 옵니다.
  // 앞쪽에서 찾으면 바로 위 품목의 "¥705.00" 에서 00 을 집어옵니다.
  const at = t.indexOf('TOTAL');
  if (at >= 0) {
    const tail = t.slice(at + 5, at + 200);
    const q = /([0-9][0-9,]*)/.exec(tail);
    if (q) out.qty = Number(q[1].replace(/,/g, ''));
    const a = /[¥$₩]\s*([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(tail);
    if (a) out.amount = Number(a[1].replace(/,/g, ''));
  }

  return Object.keys(out).length ? out : null;
}


/* ── 서류 안의 품목 (js/parse.js 의 readItems 와 같은 규칙) ── */

const ITEM_COLS_ = [
  ['code', [/^code#?$/, /^품번$/, /^코드$/]],
  ['alt', [/^zh#?$/, /^no#?$/]],
  ['name', [/^productmodel$/, /^itemname$/, /^품명$/, /^descriptionofgoods$/]],
  ['qty', [/^quantity$/, /^orderqty$/, /^qtypcs$/, /^qty$/, /^수량$/]],
  // 가격 — js/parse.js 의 ITEM_COLS 와 같은 것입니다. 한쪽만 고치면 어긋납니다.
  ['price', [/^unitprice$/, /^price$/, /^fobprice$/, /^fob$/, /^fobusd$/, /^단가$/, /^unitpriceusd$/, /^u\/price$/]],
  ['amount', [/^amount$/, /^totalamount$/, /^totalvalue$/, /^amountusd$/, /^금액$/, /^합계금액$/]],
  // 단품관리 다섯 칸 — js/parse.js 의 ITEM_COLS 와 같은 것입니다. 한쪽만 고치면 어긋납니다.
  ['color', [/^color$/, /^colour$/, /^색상$/, /^색$/, /^颜色$/, /^颜色色号$/]],
  ['size', [/^packingsize/, /^포장규격$/, /^外箱尺寸$/, /^카톤규격$/]],
  ['perCtn', [/^pcs\/ctn$/, /^pcsctn$/, /^pcsperctn$/, /^입수$/, /^装箱数$/, /^qty\/ctn$/]],
  ['cbm', [/^cartonvolume/, /^cbm$/, /^volumecbm$/, /^부피$/, /^立方数$/]],
  // 产品号 — js/parse.js 의 ITEM_COLS 와 같은 것입니다. 한쪽만 고치면 어긋납니다.
  ['pno', [/^产品号$/, /^产品编号$/, /^产品编码$/]],
];

/* 서류 아래쪽 글귀가 품목 칸으로 겹쳐 들어온 것 — js/parse.js 의 글귀_ 와 같은 것입니다.
   한쪽만 고치면 화면과 서버가 어긋납니다. */
/* ⚠⚠ **쌍점 가지에 `^` 와 「숫자 없는 앞머리」 를 둔다. 그냥 `[:：]` 로 되돌리지 마라.**
      쌍점이 **어디에 있든** 걸면 **진짜 제품 이름이 통째로 지워진다.**
      10-11 관리자가 쟀다 — 「3단 교구장 (상판:오크)」 · 「책장 2단 : 화이트」 가 다 빈칸이 됐다.
      이름표는 **맨 앞에 글자 몇 자 쓰고 쌍점**이 온다(Beneficiary: · ADDRESS: · 地址：).
      제품 이름은 앞머리에 **숫자나 여는 괄호**가 섞인다. 그것으로 가른다. */
/* ⚠⚠ **한자 낱말은 `\b` 가지 **밖**에 둔다. 한 묶음으로 되돌리지 마라.**
      자바스크립트의 `\b` 는 **ASCII 글자만** 본다. 「地址」 뒤에는 `\b` 가 **아예 안 선다**.
      그래서 한자 낱말을 `\b` 가지에 넣어 두면 **하나도 안 걸린다.**
      v0.57.0 에서는 「글자만 있는 낱말은 코드가 아니다」 가 우연히 받쳐 줘서 안 드러났고,
      10-11 에 그 규칙을 길이로 한정하자 **地址·开户行 이 그대로 샜다**(관리자가 쟀다). */
const 글귀_RE_ = /^\s*(?:(?:beneficiary|bank|account|a\/c|swift|address|tel|fax|attn|notify|consignee|shipper|applicant)\b|(?:地址|电话|开户|收款|银行))|^[A-Za-z一-鿿][A-Za-z一-鿿 .\/#]{0,22}[:：]\s*\S/i;

/* 사장님 2026-10-11 규칙 — 코드 칸에 글자가 있다고 코드가 아닙니다.
   코드는 이름표가 아니라 번호표입니다. js/parse.js 의 제품꼴_ 와 같은 규칙입니다. */
function 제품꼴_(code) {
  if (code.length > 24) return false;
  if (/[:：]/.test(code)) return false;
  if ((code.match(/ /g) || []).length > 1) return false;
  // 글자만 있는 코드는 **길 때만** 버립니다 — js/parse.js 의 제품꼴_ 와 같습니다.
  // 길이를 안 보면 진짜 제품 newX 같은 짧은 코드가 사라집니다.
  if (code.length > 8 && !/[0-9]/.test(code) && !/[_\-./]/.test(code)) return false;
  if (글귀_RE_.test(code)) return false;
  return true;
}

/** 글자 앞머리의 숫자만 — 「1pcs/ctn」 → 1. (js/parse.js 의 앞숫자 와 같은 규칙) */
function 앞숫자_(v) {
  const 글 = String(v == null ? '' : v).replace(/[,\s]/g, '');
  const m = 글.match(/^\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return isFinite(n) ? n : null;
}

function readItems_(rows) {
  if (!rows || !rows.length) return null;

  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const found = {};
    (rows[i] || []).forEach(function (v, c) {
      const t = cellKey_(v);
      if (!t) return;
      ITEM_COLS_.forEach(function (pair) {
        if (found[pair[0]] === undefined && pair[1].some(function (re) { return re.test(t); })) found[pair[0]] = c;
      });
    });
    if (found.qty !== undefined && (found.code !== undefined || found.alt !== undefined)) {
      head = i; cols = found; break;
    }
  }
  if (head < 0) return null;

  const codeCol = cols.code !== undefined ? cols.code : cols.alt;
  const order = [];
  const seen = {};          // 열쇠 → 품목
  const 꼴수 = {};          // 열쇠 → { 날것 코드: 몇 번 }
  for (let i = head + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(function (v) { return TOTAL_ROW_.test(String(v == null ? '' : v)); })) break;
    const code = String(row[codeCol] == null ? '' : row[codeCol]).trim().replace(/\s+/g, ' ');
    const qty = Number(row[cols.qty]);
    if (!code || !isFinite(qty)) continue;
    // 셀 병합이 풀리면 은행·주소 글귀가 마지막 품목의 이름 칸에 겹쳐 들어옵니다.
    // 그때는 이름만 비웁니다 — 줄은 진짜 제품일 수 있습니다.
    const 날이름 = String(row[cols.name] == null ? '' : row[cols.name]).trim().split(/\r?\n/)[0].slice(0, 40);
    const name = 글귀_RE_.test(날이름) ? '' : 날이름;
    // 못 읽은 칸은 null 입니다. 0 으로 채우면 '공짜' 로 읽힙니다.
    const 숫자칸 = function (c) {
      if (c === undefined) return null;
      /* ⚠⚠ **빈 칸을 먼저 걸러 낸다. js/parse.js 의 숫자칸 과 같은 것이다.**
            Number('') 은 NaN 이 아니라 **0** 이다. 안 거르면 빈 단가·금액이 0 으로 올라가
            화면에 「0」 이 찍힌다 — 공짜로 읽힌다. 10-11 에 화면 쪽만 고쳤다가(v0.56.1)
            여기가 남아 **서버가 0 을 써 올리고 있었다.** 두 자리를 같이 고쳐라. */
      const 글 = String(row[c] == null ? '' : row[c]).replace(/[,\s$]/g, '');
      if (!글) return null;
      const n = Number(글);
      return isFinite(n) ? n : null;
    };
    const price = 숫자칸(cols.price);
    const amount = 숫자칸(cols.amount);
    // Packing size 는 숫자가 아닙니다 —「800*400*250」. 글자 그대로 담습니다.
    const color = cols.color === undefined ? null
      : (String(row[cols.color] == null ? '' : row[cols.color]).trim().slice(0, 24) || null);
    const size = cols.size === undefined ? null
      : (String(row[cols.size] == null ? '' : row[cols.size]).trim().slice(0, 40) || null);
    // ⚠ 입수 칸은 「1pcs/ctn  」 꼴로 옵니다 — 앞 숫자를 읽습니다(js/parse.js 의 앞숫자 와 같은 규칙).
    //   제헤우드 391줄 가운데 349줄이 그 꼴입니다. 입수 칸에만 씁니다.
    const perCtn = 앞숫자_(row[cols.perCtn]);
    const cbm = 숫자칸(cols.cbm);
    const pno = cols.pno === undefined ? null
      : (String(row[cols.pno] == null ? '' : row[cols.pno]).trim().slice(0, 40) || null);
    if (!제품꼴_(code)) continue;          // 주소·은행 글귀는 품목이 아닙니다
    // 맞대는 것은 열쇠, 담는 것은 날것입니다. 밑줄 꼴만 다른 두 줄은 여기서 한 줄이 됩니다.
    const 열쇠 = 코드열쇠_(code);
    if (!꼴수[열쇠]) 꼴수[열쇠] = {};
    꼴수[열쇠][code] = (꼴수[열쇠][code] || 0) + 1;

    if (seen[열쇠]) {
      seen[열쇠].qty += qty;
      if (amount !== null) seen[열쇠].amount = (seen[열쇠].amount == null ? 0 : seen[열쇠].amount) + amount;
      if (seen[열쇠].price !== price) seen[열쇠].price = null;   // 줄마다 단가가 다르면 빈칸
      if (color && seen[열쇠].colors.indexOf(color) < 0) seen[열쇠].colors.push(color);
      if (seen[열쇠].size !== size) seen[열쇠].size = null;
      if (seen[열쇠].perCtn !== perCtn) seen[열쇠].perCtn = null;
      if (cbm !== null) seen[열쇠].cbm = (seen[열쇠].cbm == null ? 0 : seen[열쇠].cbm) + cbm;
      if (seen[열쇠].pno !== pno) seen[열쇠].pno = null;
      continue;
    }
    seen[열쇠] = { code: code, name: name, qty: qty, price: price, amount: amount,
                   colors: color ? [color] : [], size: size, perCtn: perCtn, cbm: cbm, pno: pno };
    order.push(seen[열쇠]);
  }
  /* 머리에 세울 꼴은 **많이 쓰인 꼴**입니다. 수가 같으면 먼저 본 꼴입니다.
     지어낸 꼴이 아니라 서류에 적힌 꼴 가운데 하나입니다. */
  Object.keys(꼴수).forEach(function (열쇠) {
    const 셈 = Object.keys(꼴수[열쇠]).sort(function (a, b) { return 꼴수[열쇠][b] - 꼴수[열쇠][a]; });
    if (셈.length) seen[열쇠].code = 셈[0];
    if (셈.length > 1) seen[열쇠].밑줄꼴 = 셈;   // 합쳐진 것은 표시를 남깁니다
  });
  return order.length ? order : null;
}

/** 품목 목록을 Firestore 값으로. 너무 길면 앞에서 자릅니다. */
/* ⚠⚠ **여기가 「셋만 담기는」 자리입니다. 그런데 이 함수는 탈이 없습니다 — 배포가 묵은 것입니다.**
      10-13 관리자가 화베를 쟀습니다 — `docs_files` 의 `cipl.items` 2003줄에 칸이
      `code·name·qty` **셋뿐**이고 `cipl.v` 는 109줄 모두 **2** 였습니다.
      `READ_VERSION 2` 는 **2026-09-22 `3643d99`(v0.40.1)** 판이고, 그 판의 `itemsValue_`
      (그 커밋의 `sync.gs:908`)가 **딱 그 셋만** 담았습니다. 아래 지금 것은 아홉을 담습니다.
      → **고칠 코드가 없습니다. `clasp push -f` → `clasp deploy` 로 밀어야 합니다.**
        `READ_VERSION` 2 → 8 이라 전부 다시 읽습니다(한 번에 4분, sync 서너 번).
      → 안 민 것이 이것만이 아닙니다 — `제품꼴_` 거르개(v0.57.0)와 밑줄 표식(v0.61.0~)도
        서버엔 없습니다. 지금은 화면 쪽이 혼자 받치고 있습니다.
      ⚠ 크기 걱정은 쟀습니다 — 최악(60가지 가득·칸 꽉) **95,487 B = 1MB 의 9.1%**.
        `slice(0, 60)` 이 위를 자르니 안 넘습니다. */
function itemsValue_(list) {
  const values = (list || []).slice(0, 60).map(function (it) {
    return { mapValue: { fields: {
      code: { stringValue: String(it.code).slice(0, 40) },
      name: { stringValue: String(it.name || '').slice(0, 40) },
      qty: { doubleValue: Number(it.qty) || 0 },
      // 못 읽은 칸은 담지 않습니다 — 0 으로 적으면 '공짜' 가 됩니다.
      price: it.price == null ? { nullValue: null } : { doubleValue: Number(it.price) },
      amount: it.amount == null ? { nullValue: null } : { doubleValue: Number(it.amount) },
      colors: { arrayValue: { values: (it.colors || []).slice(0, 12).map(function (c) {
        return { stringValue: String(c).slice(0, 24) }; }) } },
      size: it.size == null ? { nullValue: null } : { stringValue: String(it.size).slice(0, 40) },
      perCtn: it.perCtn == null ? { nullValue: null } : { doubleValue: Number(it.perCtn) },
      cbm: it.cbm == null ? { nullValue: null } : { doubleValue: Number(it.cbm) },
      pno: it.pno == null ? { nullValue: null } : { stringValue: String(it.pno).slice(0, 40) },
    } } };
  });
  return { arrayValue: { values: values } };
}

/* ── 원본 표 (잔액서류 내용보기) ──
   사장님 10-26 — 「잔액서류 내용보기 양식은 잔액서류의 양식을 따라야지」.
   그래서 칸을 골라 담지 않고, 품목 표의 **머리줄부터 합계줄까지** 화면에 보이는 글자 그대로 담습니다.
   거래처마다 양식이 다릅니다 — 제헤우드 CI 12칸, 베이지아 CI 5칸에 머리줄 두 줄(「(PCS) CNY」).
   h = 머리줄 수, f = 합계·잔금 줄이 시작하는 자리(없으면 줄 수). 둘 다 rows 안의 번호입니다.
   ⚠ Firestore 는 배열 안에 배열을 못 둡니다 — 줄마다 { c: [...] } 로 감쌉니다. */
function 원본표_(rows, sh) {
  if (!rows || !rows.length) return null;
  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const found = {};
    (rows[i] || []).forEach(function (v, c) {
      const t = cellKey_(v);
      if (!t) return;
      ITEM_COLS_.forEach(function (pair) {
        if (found[pair[0]] === undefined && pair[1].some(function (re) { return re.test(t); })) found[pair[0]] = c;
      });
    });
    if (found.qty !== undefined && (found.code !== undefined || found.alt !== undefined || found.name !== undefined)) {
      head = i; cols = found; break;
    }
  }
  if (head < 0) return null;

  // 보이는 글자 그대로 — 14.056000000000001 이 아니라 14.056.
  const shown = sh.getDataRange().getDisplayValues();
  const 글 = function (v) { return String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').trim().slice(0, 60); };
  const 빈줄 = function (r) { return !(r || []).some(function (v) { return 글(v); }); };

  // 은행·서명 글귀가 나오면 표가 끝난 것입니다. 빈 줄이 셋 이어져도 끝입니다.
  let end = head + 1;
  let 빈 = 0;
  for (let i = head + 1; i < shown.length && i < head + 300; i++) {
    const r = shown[i] || [];
    if (빈줄(r)) { if (++빈 >= 3) break; continue; }
    const 첫 = r.map(글).filter(Boolean)[0] || '';
    if (글귀_RE_.test(첫) || /^signature/i.test(첫)) break;
    빈 = 0;
    end = i + 1;
  }
  const body = shown.slice(head, end);

  // 표 안에서 한 번도 안 쓴 칸은 뺍니다.
  let width = 0;
  body.forEach(function (r) { width = Math.max(width, (r || []).length); });
  const keep = [];
  for (let c = 0; c < width; c++) {
    if (body.some(function (r) { return 글((r || [])[c]); })) keep.push(c);
  }
  const out = body.filter(function (r) { return !빈줄(r); }).map(function (r) {
    return keep.map(function (c) { return 글((r || [])[c]); });
  });
  const 원 = body.filter(function (r) { return !빈줄(r); });

  // 머리줄이 두 줄인 양식 — 수량 칸이 숫자가 아닌 「(PCS)」 꼴이면 그 줄도 머리입니다.
  let h = 1;
  const q2 = 원[1] ? 글(원[1][cols.qty]) : '';
  if (q2 && !/^[\d,.\-]+$/.test(q2)) h = 2;

  // 합계줄 — TOTAL 낱말이 있거나, 코드·이름 칸이 비었는데 숫자가 있는 줄부터.
  const 코드칸 = cols.code !== undefined ? cols.code : cols.alt;
  let f = 원.length;
  for (let i = h; i < 원.length; i++) {
    const r = 원[i];
    const 비었나 = function (c) { return c === undefined || !글(r[c]); };
    if (r.some(function (v) { return TOTAL_ROW_.test(글(v)); }) || (비었나(코드칸) && 비었나(cols.name))) { f = i; break; }
  }
  return { name: String(sh.getName()).slice(0, 40), rows: out, h: h, f: f };
}

/* ── 발주서 원본 표 (발주서 내용보기) ──
   사장님 10-27 — 「발주서 칸에 내용보기 버튼으로 잔액서류처럼 텍스트화된 내용 볼 수 있게」.
   잔액서류(원본표_)처럼 칸을 골라 담지 않고, 품목 표의 **머리줄부터 TOTAL 줄까지** 원본 칸 차례 그대로 담습니다.
   구글 문서로 바꾼 html 의 <table> 을 읽습니다. 합친 칸(colspan·rowspan)은 빈 칸으로 채워 줄을 맞춥니다.
   머리줄은 수량 칸 + 코드/이름 칸이 있는 줄 — 제헤우드 ZH#·code#·ORDER QTY, 베이지아 no.·code#, 세라믹 no.·ITEM NAME·QTY.
   단가가 빈 발주서도 칸 이름으로 찾으니 놓치지 않습니다. 이름이 두 줄이면 한 칸 안에 띄어 붙입니다.
   돌려주는 꼴은 원본표_ 와 같습니다 — { name, rows: [[…]], h, f }. */
function html글_(v) {
  return String(v)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    // 구글 문서 html 내보내기는 위안화 ¥ 를 「&yen;」 이름표로 씁니다(10-28 발주서 넷 다 그랬습니다).
    // 안 풀면 내용보기 금액 칸에 「&yen;113.00」 이 그대로 나옵니다. 글자 내보내기는 ¥ 그대로입니다.
    .replace(/&(yen|euro|pound|cent);/g, function (m, n) { return { yen: '\u00a5', euro: '\u20ac', pound: '\u00a3', cent: '\u00a2' }[n]; })
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** html 의 표들을 칸 격자로 — 표마다 [[글, …], …]. 합친 칸은 빈 칸으로 채웁니다. */
function html표들_(html) {
  const out = [];
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  tables.forEach(function (tb) {
    const grid = [];
    const 아래 = {}; // 칸 번호 → 아직 내려와 있는 rowspan 남은 줄 수
    (tb.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(function (tr) {
      const row = [];
      let c = 0;
      const 채움 = function () { while (아래[c] > 0) { 아래[c]--; row[c] = ''; c++; } };
      (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).forEach(function (td) {
        채움();
        const 열 = Number((/colspan="?(\d+)/i.exec(td) || [])[1] || 1);
        const 행 = Number((/rowspan="?(\d+)/i.exec(td) || [])[1] || 1);
        row[c] = html글_(td.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, ''));
        for (let k = 0; k < 열; k++) {
          if (k) row[c + k] = '';
          if (행 > 1) 아래[c + k] = 행 - 1;
        }
        c += 열;
      });
      채움();
      grid.push(row);
    });
    out.push(grid);
  });
  return out;
}

function pdfTable_(html) {
  const 빈줄 = function (r) { return !(r || []).some(function (v) { return v; }); };
  const 표들 = html표들_(html);
  for (let t = 0; t < 표들.length; t++) {
    const rows = 표들[t];
    let head = -1;
    let cols = {};
    for (let i = 0; i < rows.length; i++) {
      const found = {};
      rows[i].forEach(function (v, c) {
        const k = cellKey_(v);
        if (!k) return;
        ITEM_COLS_.forEach(function (pair) {
          if (found[pair[0]] === undefined && pair[1].some(function (re) { return re.test(k); })) found[pair[0]] = c;
        });
      });
      if (found.qty !== undefined && (found.code !== undefined || found.alt !== undefined || found.name !== undefined)) {
        head = i; cols = found; break;
      }
    }
    if (head < 0) continue;

    // 맨 끝 TOTAL(합계) 줄까지. S/TOTAL 은 중간 합계라 계속 갑니다. 못 찾으면 표 끝까지.
    let end = rows.length;
    for (let i = head + 1; i < rows.length; i++) {
      const 첫 = rows[i].filter(Boolean)[0] || '';
      if (/^(?:grand\s*)?total$|^합계$|^总计$|^合计$/i.test(첫)) { end = i + 1; break; }
    }
    const body = rows.slice(head, end).filter(function (r) { return !빈줄(r); });
    if (body.length < 2) continue;

    // 머리 밑으로 한 번도 안 쓴 칸은 뺍니다 — 그림(IMAGE) 칸은 글자로 안 나옵니다.
    let width = 0;
    body.forEach(function (r) { width = Math.max(width, r.length); });
    const keep = [];
    for (let c = 0; c < width; c++) {
      if (body.slice(1).some(function (r) { return r[c]; })) keep.push(c);
    }
    const out = body.map(function (r) { return keep.map(function (c) { return r[c] || ''; }); });

    let h = 1;
    const q2 = body[1][cols.qty] || '';
    if (q2 && !/^[\d,.\-]+$/.test(q2)) h = 2;

    // 합계줄 — 끝에서부터 이어지는 TOTAL·코드/이름 빈 줄 덩이만. 중간 S/TOTAL 뒤 품목이 굵어지지 않게.
    const 코드칸 = cols.code !== undefined ? cols.code : cols.alt;
    const 합계인가 = function (r) {
      const 비었나 = function (c) { return c === undefined || !r[c]; };
      return r.some(function (v) { return TOTAL_ROW_.test(v); }) || (비었나(코드칸) && 비었나(cols.name));
    };
    let f = body.length;
    while (f - 1 >= h && 합계인가(body[f - 1])) f--;
    return { name: '발주서', rows: out, h: h, f: f };
  }
  return null;
}

function sheetValue_(t) {
  if (!t) return { nullValue: null };
  return { mapValue: { fields: {
    name: { stringValue: t.name },
    h: { integerValue: String(t.h) },
    f: { integerValue: String(t.f) },
    rows: { arrayValue: { values: t.rows.map(function (r) {
      return { mapValue: { fields: { c: { arrayValue: { values: r.map(function (v) { return { stringValue: v }; }) } } } } };
    }) } },
  } } };
}

/* ── 견적서 불러오기 (제품관리 → 견적서 관리) ──
   사장님 10-28 — 「일단 견적관련 파일을 구글드라이브에서 불러올 수 있는 버튼 만들어주고
   파일을 불러오면 어떤 방식으로든 텍스트화 하여 보여 줄 수 있도록」.
   견적목록 — 드라이브(중국 폴더 밖도)에서 견적 파일을 찾아 이름만 돌려줍니다.
   견적읽기 — 고른 파일을 글자로 바꿔 docs_quotes/{driveId} 에 적고 그대로 돌려줍니다.
     엑셀·시트 → 시트마다 보이는 글자 그대로 표. PDF·이미지·문서 → 구글 문서로 바꿔(pdfText_, 이미지는 OCR)
     글자 전부 + 그 안의 표들. 꼴은 내용보기와 같은 { name, rows: [{c:[…]}], h, f }.
   ⚠ 읽기만 합니다. 원본은 옮기지도 고치지도 않습니다 — 글자로 바꿀 때 만든 임시 사본은 바로 지웁니다.
   ⚠ 드라이브 전체를 찾으니 파일내주기_ 와 같은 자물쇠(shareAllow + 로그인 표)를 겁니다. 빼지 마세요. */
const QUOTES = 'artifacts/vivivic-4b7ef/public/data/docs_quotes';
const 견적시트꼴_ = [SHEET_MIME, 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
const 견적꼴_ = 견적시트꼴_.concat(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/bmp',
  'application/vnd.google-apps.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']);
const 견적낱말_ = ['견적', '报价', 'quotation', 'quote'];
const 견적줄_ = 400;      // 시트·표 하나에 담는 줄
const 견적칸_ = 40;       // 칸
const 견적크기_ = 800000; // Firestore 문서 하나는 1MB 까지 — 넉넉히 덜어 둡니다

function 견적_(req) {
  const props = PropertiesService.getScriptProperties();
  const allow = String(props.getProperty('shareAllow') || '')
    .split(/[,\s]+/).filter(String).map(function (x) { return x.toLowerCase(); });
  if (!allow.length) return { ok: false, why: 'off' };
  const email = 표확인_(req && req.idToken, props);
  if (!email || allow.indexOf(email.toLowerCase()) < 0) return { ok: false, why: 'who' };
  return req['일'] === '견적읽기' ? 견적읽기_(req, email) : 견적목록_(req);
}

function 드라이브_(path) {
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/' + path,
    { headers: { Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true });
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
}

/**
 * 찾을 글이 없으면 견적·报价·quotation·quote. **`중국/견적관리/` 안(하위 폴더 포함)만** 찾습니다(사장님 10-30).
 * 폴더를 층마다 한 번에 훑어 파일을 다 받고, 이름 안 어디든 낱말이 있으면 고릅니다
 * (「VIVIVIC견적서」 처럼 붙여 쓴 이름도). 글 속 낱말(fullText)은 그 폴더들에 한 번 더 묻습니다.
 */
function 견적목록_(req) {
  const 찾 = String((req && req.q) || '').trim().slice(0, 60);
  const 낱말 = 찾 ? [찾] : 견적낱말_;
  const 따옴 = function (w) { return "'" + w.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; };
  let 폴더 = [];
  let 파일 = [];
  try {
    const root = findRoot_();
    폴더 = listMany_([root.getId()], true)
      .filter(function (c) { return String(c.name).normalize('NFC').trim() === QUOTE_DIR; })
      .map(function (c) { return c.id; });
    let 층 = 폴더.slice();
    for (let d = 0; d < 6 && 층.length; d++) {
      const 다음 = [];
      listMany_(층, false).forEach(function (c) {
        if (c.mimeType === FOLDER_MIME) { 다음.push(c.id); 폴더.push(c.id); }
        else 파일.push(c);
      });
      층 = 다음;
    }
  } catch (e) {
    return { ok: false, why: 'list' };
  }
  if (!폴더.length) return { ok: true, files: [] };
  const 작 = 낱말.map(function (w) { return w.toLowerCase(); });
  const 고른 = 파일.filter(function (f) {
    if (견적꼴_.indexOf(f.mimeType) < 0) return false;
    const n = String(f.name).toLowerCase();
    return 작.some(function (w) { return n.indexOf(w) >= 0; });
  });
  let 글속 = [];
  try {
    글속 = listMany_(폴더, false, '(' + 낱말.map(function (w) { return 'fullText contains ' + 따옴(w); }).join(' or ') + ')')
      .filter(function (f) { return 견적꼴_.indexOf(f.mimeType) >= 0; });
  } catch (e) { /* 이름으로 고른 것만 돌려줍니다 */ }
  const 본것 = {};
  const files = 고른.concat(글속)
    .filter(function (f) { return !본것[f.id] && (본것[f.id] = true); })
    .sort(function (a, b) { return String(b.modifiedTime).localeCompare(String(a.modifiedTime)); })
    .slice(0, 100)
    .map(function (f) {
      return { id: f.id, name: f.name, mime: f.mimeType, modified: String(f.modifiedTime || '').slice(0, 10), size: Number(f.size || 0) };
    });
  return { ok: true, files: files };
}

/** 칸 격자 → 내용보기 표. 빈 줄·한 번도 안 쓴 칸은 뺍니다. 머리줄은 따로 가리지 않습니다(h 0). */
function 견적표_(grid, name) {
  const 글 = function (v) { return String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').trim().slice(0, 200); };
  const body = (grid || []).slice(0, 견적줄_ * 2).map(function (r) { return (r || []).map(글); })
    .filter(function (r) { return r.some(Boolean); }).slice(0, 견적줄_);
  let width = 0;
  body.forEach(function (r) { width = Math.max(width, r.length); });
  const keep = [];
  for (let c = 0; c < width && keep.length < 견적칸_; c++) {
    if (body.some(function (r) { return r[c]; })) keep.push(c);
  }
  if (!body.length || !keep.length) return null;
  const rows = body.map(function (r) { return keep.map(function (c) { return r[c] || ''; }); });
  return { name: String(name).slice(0, 40), rows: rows, h: 0, f: rows.length };
}

/** 엑셀은 구글 시트로 잠깐 복사해 읽고 지웁니다(ciplOf_ 와 같은 길). 구글 시트는 그대로 엽니다. */
function 견적시트들_(fileId, mime, name) {
  let copyId = null;
  try {
    let ssId = fileId;
    if (mime !== SHEET_MIME) {
      const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy?supportsAllDrives=true', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token_() },
        payload: JSON.stringify({ name: TEMP_PREFIX + name, mimeType: SHEET_MIME, parents: ['root'] }),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) return null;
      ssId = copyId = JSON.parse(res.getContentText()).id;
    }
    let ss = null;
    for (let tries = 0; tries < 3 && !ss; tries++) {
      try { ss = SpreadsheetApp.openById(ssId); } catch (e) { if (tries === 2) throw e; Utilities.sleep(1500); }
    }
    return ss.getSheets().map(function (sh) {
      return 견적표_(sh.getDataRange().getDisplayValues(), sh.getName());
    }).filter(Boolean);
  } finally {
    if (copyId) {
      try {
        UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + copyId, {
          method: 'delete', headers: { Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true,
        });
      } catch (e) { /* 임시 파일은 휴지통에 남아도 큰일은 아닙니다 */ }
    }
  }
}

function 견적읽기_(req, email) {
  const id = String((req && req.driveId) || '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return { ok: false, why: 'bad' };
  const f = 드라이브_('files/' + id + '?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,size');
  if (!f) return { ok: false, why: 'bad' };
  if (견적꼴_.indexOf(f.mimeType) < 0) return { ok: false, why: 'kind' };
  if (Number(f.size || 0) > 50 * 1024 * 1024) return { ok: false, why: 'big' };

  let sheets = [];
  let text = '';
  if (견적시트꼴_.indexOf(f.mimeType) >= 0) {
    sheets = 견적시트들_(id, f.mimeType, f.name);
    if (!sheets) return { ok: false, why: 'read' };
  } else {
    const got = pdfText_(id);
    if (!got) return { ok: false, why: 'read' };
    text = String(got.text || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    sheets = html표들_(got.html).map(function (g, i) { return 견적표_(g, '표 ' + (i + 1)); }).filter(Boolean);
  }

  // 1MB 를 넘지 않게 — 표 먼저 담고, 남는 만큼 글자.
  let 남 = 견적크기_;
  const 담은 = [];
  sheets.forEach(function (t) {
    if (남 <= 0) return;
    const rows = [];
    for (let i = 0; i < t.rows.length; i++) {
      남 -= JSON.stringify(t.rows[i]).length + 16;
      if (남 <= 0) break;
      rows.push(t.rows[i]);
    }
    if (rows.length) 담은.push({ name: t.name, rows: rows, h: t.h, f: Math.min(t.f, rows.length) });
  });
  text = text.slice(0, Math.max(0, 남));

  const q = {
    driveId: id,
    name: String(f.name).slice(0, 200),
    mime: f.mimeType,
    modified: String(f.modifiedTime || '').slice(0, 10),
    text: text,
    at: new Date().toISOString(),
    by: email,
  };
  const res = UrlFetchApp.fetch(BASE + '/' + QUOTES + '/' + encodeURIComponent(id), {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token_() },
    payload: JSON.stringify({ fields: {
      driveId: { stringValue: q.driveId },
      name: { stringValue: q.name },
      mime: { stringValue: q.mime },
      modified: { stringValue: q.modified },
      text: { stringValue: q.text },
      at: { stringValue: q.at },
      by: { stringValue: q.by },
      sheets: { arrayValue: { values: 담은.map(sheetValue_) } },
    } }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return { ok: false, why: 'save' };
  q.sheets = 담은.map(function (t) {
    return { name: t.name, h: t.h, f: t.f, rows: t.rows.map(function (r) { return { c: r }; }) };
  });
  return { ok: true, quote: q };
}

/* ── 서류 간추리기 (js/parse.js 의 readBrief 와 같은 규칙) ── */

const BRIEF_LABELS_ = [
  ['piNo', /^pino$/],
  ['orderDate', /^orderdate$/],
  ['deliveryDate', /^deliverydate$/],
  ['invoiceDate', /^invoicedate/],
];
const BRIEF_COLS_ = [
  ['qty', [/^quantity$/, /qtypcs/, /^수량$/]],
  ['amount', [/^amount$/, /^총액$/]],
  ['cbm', [/^cbm$/, /totalcbm/]],
];

function briefDate_(v) {
  const m = /(20\d{2})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})/.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  if (Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return null;
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function readBrief_(rows) {
  if (!rows || !rows.length) return null;
  const out = {};

  for (let i = 0; i < Math.min(rows.length, 14); i++) {
    const row = rows[i] || [];
    for (let c = 0; c < row.length; c++) {
      const key = cellKey_(row[c]).replace(/[:：]/g, '');
      const hit = BRIEF_LABELS_.filter(function (h) { return h[1].test(key); })[0];
      if (!hit) continue;
      for (let k = c + 1; k < row.length; k++) {
        const v = String(row[k] == null ? '' : row[k]).trim();
        if (!v) continue;
        out[hit[0]] = hit[0].indexOf('Date') > 0 ? (briefDate_(v) || v) : v;
        break;
      }
    }
  }

  let head = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const found = {};
    (rows[i] || []).forEach(function (v, c) {
      const t = cellKey_(v);
      if (!t) return;
      BRIEF_COLS_.forEach(function (pair) {
        if (found[pair[0]] === undefined && pair[1].some(function (re) { return re.test(t); })) found[pair[0]] = c;
      });
    });
    if (found.qty !== undefined && found.amount !== undefined) { head = i; cols = found; break; }
  }
  if (head >= 0) {
    for (let i = head + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!/^total$/i.test(String(row[0] == null ? '' : row[0]).trim())) continue;
      Object.keys(cols).forEach(function (key) {
        const n = Number(row[cols[key]]);
        if (isFinite(n) && n) out[key] = n;
      });
      const box = row.map(function (v) { return String(v == null ? '' : v); })
        .filter(function (v) { return /\d{2}\s*(HC|GP|FT)\b/i.test(v); })[0];
      if (box) out.container = box.trim();
      break;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const label = row.map(function (v) { return cellKey_(v); })
      .filter(function (t) { return /^(deposit|balance)\d{0,3}%?$/.test(t); })[0];
    if (!label) continue;
    const nums = row.map(Number).filter(function (n) { return isFinite(n) && n; });
    if (nums.length) out[label.indexOf('deposit') === 0 ? 'deposit' : 'balance'] = nums[nums.length - 1];
  }

  return Object.keys(out).length ? out : null;
}

/* ── 트리거 ───────────────────────────────────────────── */

/** 지문을 지웁니다. 다음 실행 때 처음부터 다시 맞춰 씁니다. */
function resetMark() {
  PropertiesService.getScriptProperties().deleteProperty('mark');
  console.log('지문을 지웠습니다. 다음 sync 는 전체를 다시 확인합니다.');
}

/* ⚠⚠ **거는 줄을 뺐습니다. 도로 넣지 마십시오.**
      사장님 10-15 — 「10분마다 훑지말고 … 드라이브스캔 버튼 작동시만」.
      이 함수를 불러도 이제 **시간 트리거를 걸지 않고 끄기만** 합니다.
      ⚠ **이미 걸려 있는 트리거는 코드만 고쳐서는 안 꺼집니다.**
        앱스 스크립트 편집기에서 `removeTrigger` 를 **한 번 실행**해야 꺼집니다.
        (`removeTrigger` 는 지금 돌고 있는 판에도 있습니다 — 밀기 전에도 끌 수 있습니다.)
      ⚠ 되돌릴 때만 아래 `자동10분걸기_()` 를 손으로 부르십시오. 지우지 마십시오. */
function installTrigger() {
  removeTrigger();
  console.log('자동 실행은 걸지 않습니다 — 「드라이브 스캔」 단추를 누르실 때만 돕니다.');
}

/** 되돌릴 때만 손으로 부릅니다. 평소에는 아무 데서도 안 부릅니다. */
function 자동10분걸기_() {
  removeTrigger();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
  console.log('10분마다 자동 실행되도록 되돌렸습니다.');
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  console.log('자동 실행을 껐습니다.');
}

/* ── 보링 ─────────────────────────────────────────────────
   서류관리와 아주 떼어 둡니다. 여기서 무슨 일이 나도 위쪽 서류 일은 이미 끝나 있고,
   catch 가 삼켜서 sync() 를 넘어뜨리지 않습니다.
   · boring_files 에만 씁니다. docs_files·docs_config·docs_overlay·docs_rules 는
     읽지도 쓰지도 않습니다.
   · 드라이브는 읽기만 합니다. 옮기기·이름바꾸기·지우기·공유설정 전부 없습니다.
   · 훑는 코드는 위엣것을 부르지 않고 베껴 뒀습니다. 위엣것을 보링 때문에 고치면
     서류 885건이 같이 흔들립니다. token_·docId_·commit_ 만 그대로 부릅니다.
   · 파일 속(구멍 자료)은 한 줄도 담지 않습니다. 목록뿐입니다. */

const BORING_FILES = 'artifacts/vivivic-4b7ef/public/data/boring_files';
const BORING_CONFIG = 'artifacts/vivivic-4b7ef/public/data/boring_config';
const BORING_EXT = /\.(cix|bpp)$/i;
const BORING_MAX_DEPTH = 6;

/* ⚠ 사장님 10-30 멈춤 — 「네 보링파일 훑기도 멈춰주세요」.
   sync 끝(바뀐 게 없을 때 갈래 포함, 두 곳)에서 보링훑기_ 를 안 부릅니다. 코드는 그대로 둡니다 —
   다시 켜려면 true 로 바꿔 배포. 멈춘 동안 boring_files 는 마지막 값 그대로(안 지움),
   boring_config/설정 의 exec 도 안 고칩니다(보링주소적기_ 도 이 안에서만 불림). */
const BORING_SCAN = false;

function 보링훑기_() {
  try {
    보링주소적기_();                             // 보링변환이 부를 주소를 적어 둡니다

    const 폴더이름 = 보링폴더이름_();
    if (!폴더이름) return;                       // 아직 안 고르셨으면 아무 일도 안 합니다

    const it = DriveApp.getFoldersByName(폴더이름);
    if (!it.hasNext()) {
      console.log('보링 · 폴더 "' + 폴더이름 + '" 없음');
      return;
    }
    const files = [];
    보링걷기_(it.next().getId(), '', 0, files);
    const 쓴수 = 보링쓰기_(files);
    console.log('보링 · "' + 폴더이름 + '" · 파일 ' + files.length + '건 · 쓰기 ' + 쓴수 + '건');
  } catch (e) {
    // 삼킵니다. 서류 일은 이미 다 끝났습니다.
    console.error('보링 건너뜀: ' + (e && e.message));
  }
}

/**
 * 배포된 /exec 주소를 boring_config/설정 의 exec 칸에 적어 둡니다.
 * 보링변환은 그걸 읽어 GET 으로 한 번 두드리면 됩니다 — doGet 이 sync() 를 돌리고,
 * 그 끝에서 이 보링 일이 함께 돕니다. 서류관리를 안 열어도 목록이 찹니다.
 * 새 문은 안 만들었습니다. 있는 doGet 을 그대로 씁니다.
 * ⚠ exec 칸 하나만 덧칠합니다(updateMask). 사장님이 고르신 folder 는 안 건드립니다.
 * ⚠ docs_config/sync 는 안 건드립니다. 그건 ensureUrl_ 자리입니다.
 */
function 보링주소적기_() {
  const url = ScriptApp.getService().getUrl();
  if (!url) return;                              // 아직 웹앱 배포 전
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('boringUrl') === url) return;   // 안 바뀌었으면 안 씁니다

  const res = UrlFetchApp.fetch(
    BASE + '/' + BORING_CONFIG + '/' + encodeURIComponent('설정') + '?updateMask.fieldPaths=exec',
    {
      method: 'patch',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token_() },
      payload: JSON.stringify({ fields: { exec: { stringValue: url } } }),
      muteHttpExceptions: true,
    });
  if (res.getResponseCode() !== 200) {
    throw new Error('보링 주소 적기 실패 ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }
  props.setProperty('boringUrl', url);
  console.log('보링변환이 부를 주소: ' + url);
}

/* ── 보링 파일 알맹이를 내주는 문 ──────────────────────

   보링변환 화면이 파일 줄을 누르면 이리로 두드립니다. 그러면 그 파일을 base64 로
   싸서 내줍니다. 화면은 그것을 풀어 제 자리에서 뜯어 봅니다.

   ⚠ 이 문에는 로그인이 없습니다. 관리자가 정했습니다 —
   보링변환을 쓰시는 것은 사장님 폰 하나이고 거기엔 로그인이 없습니다.
   그래서 자물쇠를 「누구냐」 가 아니라 「무엇을 내주느냐」 로 걸었습니다. 넷입니다:

     ① 보링 폴더 아래 것만 (부모를 거슬러 봅니다 — id 만 알아도 밖은 못 빼갑니다)
     ② .cix · .bpp 만
     ③ 2MB 까지 (보링 파일은 10KB 안팎입니다)
     ④ 읽기만 — 드라이브에 아무것도 쓰지 않습니다

   이 넷 가운데 하나라도 빼지 마십시오. 그것이 이 문의 자물쇠 전부입니다.
   서류 쪽 길(파일내주기_ · 표확인_ · 중국아래인가_ · shareAllow)은 이 갈래와 남입니다.
*/
const BORING_SHARE_MAX = 2 * 1024 * 1024;

function 보링파일내주기_(req) {
  const id = String((req && req.driveId) || '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return { ok: false, why: 'bad' };

  const file = DriveApp.getFileById(id);            // 읽기만
  const name = file.getName();
  // why 는 화면이 그대로 사람에게 보여 줍니다. 그래서 낱말이 아니라 문장으로 돌려줍니다.
  // '밖' 하나만 낱말입니다 — 그것은 화면이 제 글로 갈아 적습니다.
  if (!BORING_EXT.test(name)) return { ok: false, why: '보링 파일이 아닙니다' };   // ② .cix·.bpp 만
  if (!보링아래인가_(file)) return { ok: false, why: '밖' };                       // ① 볼 폴더 아래만
  if (file.getSize() > BORING_SHARE_MAX) return { ok: false, why: '파일이 너무 큽니다' };  // ③ 2MB

  return { ok: true, name: name, b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/**
 * 볼 폴더 아래에 있는 파일인지 위로 거슬러 봅니다.
 * 중국아래인가_ 와 같은 꼴이지만 **뿌리가 다릅니다** — 그래서 따로 둡니다.
 * 폴더 이름을 아직 안 고르셨으면 아무것도 내주지 않습니다(빈손이면 false).
 */
function 보링아래인가_(file) {
  const 폴더이름 = 보링폴더이름_();
  if (!폴더이름) return false;
  const 뿌리 = {};
  const it = DriveApp.getFoldersByName(폴더이름);
  while (it.hasNext()) 뿌리[it.next().getId()] = true;   // 같은 이름이 여럿일 수 있습니다
  if (!Object.keys(뿌리).length) return false;

  const 본것 = {};
  let 층 = [file];
  for (let d = 0; d <= BORING_MAX_DEPTH + 1 && 층.length; d++) {
    const 다음 = [];
    for (let i = 0; i < 층.length; i++) {
      const ps = 층[i].getParents();
      while (ps.hasNext()) {
        const p = ps.next();
        const pid = p.getId();
        if (뿌리[pid]) return true;
        if (!본것[pid]) { 본것[pid] = true; 다음.push(p); }
      }
    }
    층 = 다음;
  }
  return false;
}

/** 볼 폴더 이름은 사장님이 폰에서 고르십니다. 코드에 안 박습니다. */
function 보링폴더이름_() {
  const res = UrlFetchApp.fetch(BASE + '/' + BORING_CONFIG + '/' + encodeURIComponent('설정'), {
    headers: { Authorization: 'Bearer ' + token_() },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return '';   // 칸이 아직 없으면 조용히 빈손
  const f = (JSON.parse(res.getContentText()) || {}).fields || {};
  return String((f.folder || {}).stringValue || '').trim();
}

/** 폴더 하나의 자식. 위 listChildren_ 를 베낀 것입니다 — 일부러 따로 둡니다. */
function 보링자식_(folderId) {
  const out = [];
  let pageToken = '';
  do {
    const url =
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent("'" + folderId + "' in parents and trashed = false") +
      '&fields=' + encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime,createdTime,mimeType,shortcutDetails)') +
      '&pageSize=1000' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token_() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('보링 폴더 조회 실패 ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    }
    const body = JSON.parse(res.getContentText());
    (body.files || []).forEach(function (x) { out.push(x); });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** 아래를 다 훑어 .cix 와 .bpp 만 고릅니다. 나머지는 버립니다. */
function 보링걷기_(folderId, prefix, depth, out) {
  if (depth > BORING_MAX_DEPTH) return;
  const children = 보링자식_(folderId);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const name = c.name;

    if (c.mimeType === FOLDER_MIME) {
      if (name.charAt(0) === '.') continue;
      보링걷기_(c.id, prefix ? prefix + '/' + name : name, depth + 1, out);
      continue;
    }
    if (name.charAt(0) === '.' || name.indexOf('~$') === 0) continue;
    if (!BORING_EXT.test(name)) continue;

    let id = c.id;
    if (c.mimeType === SHORTCUT_MIME) {
      const t = c.shortcutDetails || {};
      if (!t.targetId || t.targetMimeType === FOLDER_MIME) continue;
      id = t.targetId;
    }
    out.push({
      name: name,
      path: prefix ? prefix + '/' + name : name,
      driveId: id,
      size: c.size ? Number(c.size) : 0,
      mtime: new Date(c.modifiedTime).getTime(),
      ctime: c.createdTime ? new Date(c.createdTime).getTime() : 0,
    });
  }
}

/** 올라간 것과 견주어 달라진 것만 씁니다. 드라이브에서 없어진 것은 지웁니다. */
function 보링쓰기_(files) {
  const existing = 보링올라간것_();
  const seen = {};
  const writes = [];

  files.forEach(function (f) {
    const id = docId_(f.path);
    seen[id] = true;
    const b = existing[id];
    const 같나 = b &&
      b.name === f.name &&
      b.driveId === f.driveId &&
      b.size === String(f.size) &&
      b.mtime === String(f.mtime) &&
      b.ctime === String(f.ctime);
    if (같나) return;
    writes.push({
      update: {
        name: NAME + '/' + BORING_FILES + '/' + id,
        fields: {
          name: { stringValue: f.name },
          path: { stringValue: f.path },
          driveId: { stringValue: f.driveId },
          size: { integerValue: String(f.size) },
          mtime: { integerValue: String(f.mtime) },
          ctime: { integerValue: String(f.ctime) },
        },
      },
    });
  });
  Object.keys(existing).forEach(function (id) {
    if (!seen[id]) writes.push({ delete: NAME + '/' + BORING_FILES + '/' + id });
  });

  if (writes.length) commit_(writes);
  return writes.length;
}

/** boring_files 에 이미 올라가 있는 것. */
function 보링올라간것_() {
  const out = {};
  const mask = ['name', 'path', 'driveId', 'size', 'mtime', 'ctime']
    .map(function (x) { return 'mask.fieldPaths=' + x; })
    .join('&');
  let pageToken = '';
  do {
    const url = BASE + '/' + BORING_FILES + '?pageSize=300&' + mask +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token_() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('보링 목록 조회 실패 ' + res.getResponseCode());
    }
    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) {
      const f = d.fields || {};
      out[d.name.split('/').pop()] = {
        name: (f.name || {}).stringValue,
        path: (f.path || {}).stringValue,
        driveId: (f.driveId || {}).stringValue,
        size: (f.size || {}).integerValue,
        mtime: (f.mtime || {}).integerValue,
        ctime: (f.ctime || {}).integerValue,
      };
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}
