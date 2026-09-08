/**
 * VIVIVIC 서류 동기화
 * 구글 드라이브 '중국' 폴더를 훑어 Firestore 문서 목록을 갱신합니다.
 * 트리거로 10분마다 자동 실행됩니다. 맥이 꺼져 있어도 돕니다.
 */

const PROJECT_ID = 'vivivic-4b7ef';
const ROOT_FOLDER = '중국';
const COLLECTION = 'artifacts/vivivic-4b7ef/public/data/docs_files';
const CONFIG = 'artifacts/vivivic-4b7ef/public/data/docs_config';
const MAX_DEPTH = 4;
// 뽑는 규칙이 바뀌면 이 숫자를 올립니다. 지문이 달라져 전체를 다시 훑습니다.
const MARK_VERSION = 16;
// 서류에서 뽑는 규칙이 바뀌면 이 숫자를 올립니다. 이미 읽어둔 서류도 다시 읽습니다.
// (지문만 올리면, 칸이 비어 있어도 "이미 읽었다"로 넘어가 버립니다.)
const READ_VERSION = 2;
const SKIP_DIR = /^(_옵시디언|\.|node_modules)/;

// 문서 이름(name)에는 URL이 아니라 projects/... 부터 들어가야 합니다.
const NAME = 'projects/' + PROJECT_ID + '/databases/(default)/documents';
const BASE = 'https://firestore.googleapis.com/v1/' + NAME;

/* ── 진입점 ───────────────────────────────────────────── */

let ciplOk = 0;
let ciplNone = 0;
let ciplCut = 0;
let lastNote = '';
let runStart = new Date();
let lastCiplError = '';

function sync() {
  const started = new Date();
  runStart = started;
  ciplOk = 0;
  ciplNone = 0;
  ciplCut = 0;
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
    return;
  }

  const existing = listExisting_();
  const seen = {};
  files.forEach(function (f) { seen[docId_(f.path)] = true; });

  // 실제로 달라진 것만 씁니다.
  const writes = [];
  files.forEach(function (f) {
    const before = existing[docId_(f.path)];
    // 서류인데 아직 안을 못 읽었으면 한 번 더 읽습니다.
    const needCipl = (isCipl_(f.name) || isOrderPdf_(f.name)) && before &&
      (!before.hasCipl || before.readV !== READ_VERSION);
    if (!before || changed_(before, f) || needCipl) writes.push(updateWrite_(f));
  });
  Object.keys(existing).forEach(function (id) {
    if (!seen[id]) writes.push({ delete: NAME + '/' + COLLECTION + '/' + id });
  });

  commit_(writes);
  props.setProperty('mark', mark);
  // 시간이 모자라 미룬 게 있을 때만 다음번에 다시 훑습니다.
  if (ciplCut > 0) props.setProperty('retryCipl', '1');
  else props.deleteProperty('retryCipl');

  const secs = (new Date() - started) / 1000;
  const note = '파일 ' + files.length + '건 · 쓰기 ' + writes.length + '건 · 서류 읽음 ' + ciplOk +
    '건, 읽을 표 없음 ' + ciplNone + '건' + (ciplCut ? ', 시간 모자라 미룸 ' + ciplCut + '건' : '') +
    ' · ' + secs + '초' + (lastCiplError ? ' · 마지막 오류: ' + lastCiplError : '');
  console.log(note);
  lastNote = note;
  props.setProperty(
    'lastSync',
    Utilities.formatDate(started, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ' · ' + files.length + '건 · 쓰기 ' + writes.length
  );
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

/**
 * 폴더 하나의 자식을 한 번에 받아옵니다.
 * DriveApp 으로 파일마다 크기·시각을 물으면 호출이 파일 수만큼 나가는데,
 * 이렇게 하면 폴더당 한 번이면 되고 **md5 까지 같이** 옵니다.
 */
function listChildren_(folderId) {
  const out = [];
  let pageToken = '';
  do {
    const url =
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent("'" + folderId + "' in parents and trashed = false") +
      '&fields=' + encodeURIComponent('nextPageToken,files(id,name,size,md5Checksum,modifiedTime,mimeType,shortcutDetails)') +
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
  return out;
}

/**
 * 최상위 하위폴더 이름을 거래처로 봅니다.
 * prefix 가 빈 문자열이면 아직 거래처 층에 도달하지 않은 것입니다.
 */
function walk_(folderId, vendor, prefix, depth, out) {
  if (depth > MAX_DEPTH) return;

  const children = listChildren_(folderId);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const name = c.name;

    if (c.mimeType === FOLDER_MIME) {
      if (SKIP_DIR.test(name)) continue;
      walk_(c.id, depth === 0 ? name : vendor, prefix ? prefix + '/' + name : name, depth + 1, out);
      continue;
    }

    if (name.charAt(0) === '.' || name.indexOf('~$') === 0) continue;
    if (name.indexOf(TEMP_PREFIX) === 0 || name.indexOf('(임시) ') === 0) continue;

    // 바로가기는 껍데기입니다. 원본을 가리키게 바꿔 둡니다.
    let id = c.id;
    if (c.mimeType === SHORTCUT_MIME) {
      const target = c.shortcutDetails || {};
      if (!target.targetId || target.targetMimeType === FOLDER_MIME) continue;
      id = target.targetId;
    }

    out.push({
      name: name,
      path: prefix ? prefix + '/' + name : name,
      vendor: prefix ? vendor : '(루트)',
      size: c.size ? Number(c.size) : 0,
      mtime: new Date(c.modifiedTime).getTime(),
      driveId: id,
      // 구글 문서·시트는 md5 가 없습니다. 그런 파일은 이름·크기로 갈음합니다.
      md5: c.md5Checksum || '',
    });
  }
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
  const mask = ['name', 'path', 'vendor', 'size', 'mtime', 'md5', 'driveId', 'cipl']
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

function updateWrite_(f) {
  const fields = {
    name: { stringValue: f.name },
    path: { stringValue: f.path },
    vendor: { stringValue: f.vendor },
    size: { integerValue: String(f.size) },
    mtime: { integerValue: String(f.mtime) },
    driveId: { stringValue: f.driveId },
    md5: { stringValue: f.md5 },
  };

  // 발주서 PDF 는 글자로 바꿔 읽습니다.
  if (isOrderPdf_(f.name)) {
    if (new Date() - runStart > 4 * 60 * 1000) {
      ciplCut++;
      return { update: { name: NAME + '/' + COLLECTION + '/' + docId_(f.path), fields: fields } };
    }
    const text = pdfText_(f.driveId);
    const pb = readPdfBrief_(text);
    const pi = readPdfItems_(text);
    if (pb || pi) ciplOk++; else ciplNone++;
    fields.cipl = { mapValue: { fields: {
      brief: briefValue_(pb), invoiceDate: { stringValue: '' }, items: itemsValue_(pi),
      v: { integerValue: String(READ_VERSION) },
    } } };
    return { update: { name: NAME + '/' + COLLECTION + '/' + docId_(f.path), fields: fields } };
  }

  // 잔액서류면 안을 들여다보고 수치를 같이 올립니다.
  if (isCipl_(f.name)) {
    // 6분 제한이 있습니다. 오래 걸리면 남은 건 다음 호출로 넘깁니다.
    // 이때만 cipl 을 안 붙입니다 — 그래야 다음번에 다시 시도합니다.
    if (new Date() - runStart > 4 * 60 * 1000) {
      ciplCut++;
      return { update: { name: NAME + '/' + COLLECTION + '/' + docId_(f.path), fields: fields } };
    }

    // 읽어봤는데 표가 없는 서류도 있습니다(스캔을 엑셀로 감싼 것 등).
    // 그런 파일도 "봤다"고 남겨야 매번 다시 열지 않습니다.
    const c = ciplOf_(f.driveId, f.name) || {};
    if (c.cartons || c.brief || c.invoiceDate) ciplOk++; else ciplNone++;
    {
      fields.cipl = {
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
            v: { integerValue: String(READ_VERSION) },
          },
        },
      };
    }
  }

  return { update: { name: NAME + '/' + COLLECTION + '/' + docId_(f.path), fields: fields } };
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

/** 글자가 든 발주서 PDF 인지. 영수증 스캔은 글자가 없어 제외합니다. */
function isOrderPdf_(name) {
  return /\.pdf$/i.test(name) && /ordersheet|order\s*sheet|purchase\s*order/i.test(name) &&
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
    for (let i = 0; i < sheets.length; i++) {
      const rows = sheets[i].getDataRange().getValues();
      const got = readCipl_(rows);
      // 중량은 보통 PL 시트에만 있습니다.
      if (got && (!best || (got.gross && !best.gross))) best = got;
      if (!meta) meta = readMeta_(rows);
      if (!brief) brief = readBrief_(rows);
      if (!items) items = readItems_(rows);
    }
    if (!best && !meta && !brief && !items) return null;
    const out = best || {};
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
    return txt.getContentText();
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


/* ── 발주서 PDF 안의 품목 (js/parse.js 의 readPdfItems 와 같은 규칙) ──
 * 구글 문서로 바꾸면 표가 "탭 + 칸 내용" 으로 풀립니다. 칸 차례는 판마다
 * 다르니(일련번호 유무, 빈 칸 하나 더) 자리를 세지 않고
 * **금액 → 수량 → 금액** 이 이어지는 자리를 찾습니다.
 */

const PDF_MONEY_ = /^[\u00a5$\u20a9]\s*[\d,]+(?:\.\d+)?$/;
const PDF_INT_ = /^[\d,]+$/;
const PDF_CODE_ = /^[A-Za-z0-9][A-Za-z0-9_\-./]{1,24}$/;
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

    const code = cells[i - 2];
    if (!PDF_CODE_.test(code)) continue;

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
];

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
  const seen = {};
  for (let i = head + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.some(function (v) { return TOTAL_ROW_.test(String(v == null ? '' : v)); })) break;
    const code = String(row[codeCol] == null ? '' : row[codeCol]).trim().replace(/\s+/g, ' ');
    const qty = Number(row[cols.qty]);
    if (!code || !isFinite(qty)) continue;
    const name = String(row[cols.name] == null ? '' : row[cols.name]).trim().split(/\r?\n/)[0].slice(0, 40);
    if (seen[code]) { seen[code].qty += qty; continue; }
    seen[code] = { code: code, name: name, qty: qty };
    order.push(seen[code]);
  }
  return order.length ? order : null;
}

/** 품목 목록을 Firestore 값으로. 너무 길면 앞에서 자릅니다. */
function itemsValue_(list) {
  const values = (list || []).slice(0, 60).map(function (it) {
    return { mapValue: { fields: {
      code: { stringValue: String(it.code).slice(0, 40) },
      name: { stringValue: String(it.name || '').slice(0, 40) },
      qty: { doubleValue: Number(it.qty) || 0 },
    } } };
  });
  return { arrayValue: { values: values } };
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

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
  console.log('10분마다 자동 실행되도록 설정했습니다.');
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  console.log('자동 실행을 껐습니다.');
}
