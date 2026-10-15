import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBatch, classify, parseDate, parseDocNo, buildBatches, parseVendor, glossCJK, readCipl, batchFromPath, readBrief, readItems, readPdfItems, 코드열쇠, 제품줄인가, orderIds } from '../js/parse.js';

/** 실제 드라이브 `중국/제헤우드/` 폴더에서 가져온 파일명입니다. */
const REAL = [
  ['TalkFile_AMT(ZH)26-18 Ordersheet_20260730.pdf', '26-18', 'order'],
  ['TalkFile_AMT(ZH)26-18 Ordersheet_1차 수정 20260813.pdf', '26-18', 'order'],
  ['AMT2026-18书架加床订单合同8.03.xlsx', '26-18', 'pi'],
  ['AMT2026-19书架订单合同8.19.xlsx', '26-19', 'pi'],
  ['TalkFile_AMT(ZH)26-19 Ordersheet_20260813.pdf', '26-19', 'order'],
  ['TalkFile__26-094-AMT-ZH-18(제헤우드 26-18차)_계약금 인보이스영수증.pdf.pdf', '26-18', 'piReceipt'],
  ['TalkFile_26-080-AMT-ZH-14(제헤우드 26-14차)_잔금 인보이스영수증.pdf.pdf', '26-14', 'balReceipt'],
  ['TalkFile_26-083-AMT-ZH-15(제헤우드 26-15차)_잔금 인보이스영수증.pdf.pdf', '26-15', 'balReceipt'],
  ['TalkFile_26-079-AMT-ZH-13(제헤우드 26-13차)_잔금인보이스영수증.pdf', '26-13', 'balReceipt'],
  ['ZEHE-ING26 -15   2026.08.06- CI&PL...xls', '26-15', 'cipl'],
  ['ZEHE-ING26 -14 2026.07.30- CI&PL...xls', '26-14', 'cipl'],
  ['SHBL-SOFLYHQB0783102.pdf', null, 'bl'],
  // 빼기표 뒤에 빈칸이 더 붙은 꼴. 사장님이 2026-10-02 에 짚으셨습니다.
  ['SHBL- SITTAGPT2635144.pdf', null, 'bl'],
  ['FTA ING26-14.pdf', '26-14', 'fta'],
  ['FTA-ING 26-13.pdf', '26-13', 'fta'],
  ['어린이 침대 견적서_2026.06.18.xlsx', null, 'dev'],
  ['TalkFile_그로브침대_신규깔판2종_도면_260708.dxf', null, 'dev'],
  ['그로브침대(신규)_2종_작업지지서 피드백_260707 (1).pdf', null, 'dev'],
  ['TalkFile_ING_ZH_다이꼬 테이블_협탁 2차 견적서 및 샘플요청 _2026.08.14.xlsx', null, 'dev'],
];

test('parseBatch — 실제 파일명에서 차수를 뽑는다', () => {
  for (const [name, expected] of REAL) {
    const got = parseBatch(name);
    assert.equal(got?.label ?? null, expected, `실패: ${name}`);
  }
});

test('classify — 실제 파일명을 7단계로 분류한다', () => {
  for (const [name, , expected] of REAL) {
    const got = classify(name);
    assert.equal(got.key, expected, `실패: ${name} → ${got.key} (${got.why})`);
  }
});

test('classify — 영수증은 30%/70%로 갈린다', () => {
  assert.equal(classify('TalkFile_30%-PI-080-AMT-ZH-14_제헤우드 26-14차영수증.pdf').key, 'piReceipt');
  assert.equal(classify('70% 잔금 영수증 26-12차.pdf').key, 'balReceipt');
});

test('classify — PI 원본은 계약금서류', () => {
  assert.equal(classify('SS)PI-080-AMT-ZH-14_제헤우드 26-14차.pdf').key, 'pi');
});

test('parseBatch — 문서번호를 차수로 오독하지 않는다', () => {
  // 26-085 는 문서번호입니다. 차수는 뒤의 (제헤우드 26-16) 쪽입니다.
  assert.equal(parseBatch('TalkFile_26-085-AMT-ZH-16 (제헤우드 26-16)_잔금 인보이스영수증.pdf.pdf')?.label, '26-16');
  // "차" 가 붙어 있으면 그대로 읽습니다.
  assert.equal(parseBatch('TalkFile_30%-SS)PI-26-086-AMT-ZH-17_제헤우드 26-17차영수증.pdf.pdf')?.label, '26-17');
});

test('parseBatch — 없는 차수는 받지 않는다 (1~60차)', () => {
  // '관리프로그램 99-99차' 유령 카드가 여기서 났습니다. 파일명에서는 원래 막혔는데,
  // 손으로 적는 "새 차수" 칸에 잣대가 없어 규칙으로 굳었습니다.
  // 이제 그 칸도 parseBatch 를 거치므로, 이 잣대가 곧 그 칸의 잣대입니다.
  assert.equal(parseBatch('99-99차'), null);
  assert.equal(parseBatch('26-99차'), null);
  assert.equal(parseBatch('26-0차'), null);
  assert.equal(parseBatch('26-61차'), null);
  // 멀쩡한 것은 그대로 통과하고, 한 자리는 두 자리로 다듬습니다.
  assert.equal(parseBatch('26-18차')?.label, '26-18');
  assert.equal(parseBatch('25-7차')?.label, '25-07');
});

test('parseBatch — 문서번호가 해를 알려주면 N차 표기와 맞춘다', () => {
  // 문서번호 25-182 의 앞 두 자리가 해, 차수는 "포니엘 6차" 쪽입니다.
  assert.equal(parseBatch('70%-SS)CI,PL-25-182-AMT-13-B-포니엘 6차_F-022영수증.pdf')?.label, '25-06');
  assert.equal(parseBatch('TalkFile_30%-SS)-PI-26-030-AMT-ZH-04-제헤우드04차26.03.23영수증.pdf')?.label, '26-04');
  assert.equal(parseBatch('TalkFile_SS)PI-25-196-AMT-JW-04-제헤우드 4차.pdf.pdf')?.label, '25-04');
});

test('parseVendor — 폴더가 아니라 파일명을 믿는다', () => {
  const vendors = ['제헤우드', '베이지아'];
  // 이름이 그대로 적혀 있으면 그걸 씁니다.
  assert.equal(parseVendor('TalkFile_30%-SS)PI-26-085-AMT-ZH-16_제헤우드 26-16차영수증.pdf', vendors), '제헤우드');
  // 문서번호의 거래처 코드도 읽습니다.
  assert.equal(parseVendor('TalkFile_26-085-AMT-ZH-16 (ㅇㅇ 26-16)_잔금영수증.pdf', vendors), '제헤우드');
  // 근거가 없으면 폴더에 맡깁니다.
  assert.equal(parseVendor('TalkFile_PO_poniel 26-05_2600825.pdf', vendors), null);
});

test('buildBatches — 엉뚱한 폴더에 있어도 파일명 거래처로 넣고 짚어준다', () => {
  const files = [
    { name: 'TalkFile_30%-SS)PI-26-085-AMT-ZH-16_제헤우드 26-16차영수증.pdf', path: '베이지아/x.pdf', size: 1, vendor: '베이지아' },
    { name: 'AMT(ZH)26-16 Ordersheet_20260710.pdf', path: '제헤우드/y.pdf', size: 2, vendor: '제헤우드' },
  ];
  const { batches } = buildBatches(files);
  assert.equal(batches.length, 1, '두 파일이 같은 차수로 모인다');
  assert.equal(batches[0].vendor, '제헤우드');
  assert.ok(batches[0].issues.some((i) => i.text.includes('베이지아 폴더 →')));
});

test('classify — 중국어 파일명은 발주서가 될 수 없다', () => {
  // 발주서는 AMT이 내보내는 Ordersheet·PO 쪽입니다.
  assert.equal(classify('26-16.17订单，报价，立方数26.07.30.xlsx').key, 'dev');
  assert.equal(classify('AMT(ZH)26-11 Ordersheet_2차수정 20260608.pdf').key, 'order');
});

test('glossCJK — 중국어 파일명을 대충 풀어준다', () => {
  assert.equal(glossCJK('AMT2026-18书架加床订单合同8.03.xlsx'), '책장 추가 침대 주문 계약서');
  assert.equal(glossCJK('F-023形式发票和装箱单发给客户.xlsx'), 'PI·패킹리스트 거래처 발송');
  // 중국어가 없으면 아무것도 내놓지 않습니다.
  assert.equal(glossCJK('AMT(ZH)26-11 Ordersheet.pdf'), null);
});

test('buildBatches — 문서번호가 같으면 차수 표기가 없어도 같은 묶음', () => {
  const files = [
    { name: 'TalkFile_70%-CI,PL-25-181-AMT-12-B포니엘 5차 F-021영수증.pdf', path: 'a/1.pdf', size: 1, vendor: '베이지아' },
    { name: 'F-021形式发票和装箱单发给客户.pdf', path: 'a/2.pdf', size: 2, vendor: '베이지아' },
  ];
  const { batches } = buildBatches(files);
  assert.equal(batches.length, 1, '한 묶음으로 모인다');
  assert.equal(batches[0].docs.length, 2);
  assert.ok(batches[0].docs.some((d) => d.joinedBy === 'F-021'), '무엇으로 이었는지 남는다');
});

test('buildBatches — 선하증권은 CI&PL 선적일로만 이어붙인다', () => {
  const mtime = new Date('2026-04-30').getTime();
  const files = [
    { name: 'ZEHE-ING26 -6 2026.04.29-CI&PL...xls', path: 'a/1.xls', size: 1, vendor: '제헤우드', mtime },
    { name: 'HBL-SOFRNQB2615115-ING-4.29.pdf', path: 'a/2.pdf', size: 2, vendor: '제헤우드', mtime },
    // 견적서는 날짜가 가까워도 붙이지 않습니다 — 발주 소속이라는 근거가 아닙니다.
    { name: '그로브침대 견적서 20260429.pdf', path: 'a/3.pdf', size: 3, vendor: '제헤우드', mtime },
  ];
  const { batches, unassigned } = buildBatches(files);
  assert.equal(batches.length, 1);
  assert.ok(batches[0].docs.some((d) => d.stageKey === 'bl' && d.guessed), '선하증권은 추정으로 붙는다');
  assert.ok(unassigned.some((d) => d.stageKey === 'dev'), '견적서는 안 붙는다');
});

test('readCipl — 합계 줄이 숫자만 있어도 두 번 더하지 않는다', () => {
  const rows = [
    ['CODE#', 'Product model', 'Qty pcs', 'Packing size(mm)', 'pcs\n/ctn', 'Qty Carton', 'Total CBM', 'G.W. \n(KGS)', 'N.W. \n(KGS)'],
    ['A-1', '책장', 30, '826*260*800', '1pcs/ctn', 30, 1.14, 452.6, 429.2],
    ['A-2', '침대', 10, '826*260*550', '1pcs/ctn', 10, 0.5, 200, 180],
    ['', '', 40, '', '', 40, 1.64, 652.6, 609.2], // 합계 줄 — "TOTAL" 이라고 안 써 있음
  ];
  const r = readCipl(rows);
  assert.equal(r.cartons, 40);
  assert.equal(r.cbm, 1.64);
  assert.equal(r.gross, 652.6);
});

test('readCipl — 머리글이 두 줄인 양식도 읽는다', () => {
  const rows = [
    ['Marks&Numbers', 'Description of Goods', 'Quantity', 'PACKING', 'N.W', 'G.W', 'Volume'],
    ['', 'BED', '(PCS)', '(CTNS)', '(KGS)', '(KGS)', '(CBM)'],
    ['', 'AMT-S03-01', 50, 395, 6000, 6200, 67],
    ['', 'TOTAL VALUE', '', 395, 6000, 6200, 67],
  ];
  const r = readCipl(rows);
  assert.equal(r.cartons, 395);
  assert.equal(r.cbm, 67);
  assert.equal(r.gross, 6200);
  assert.equal(r.net, 6000);
});

test('readCipl — G.W. 와 N.W. 가 뒤바뀌어 있으면 큰 쪽을 총중량으로', () => {
  const rows = [
    ['CODE#', 'Qty pcs', 'Qty Carton', 'Total CBM', 'G.W. (KGS)', 'N.W. (KGS)'],
    ['A-1', 10, 10, 1, 12983, 14125],
  ];
  const r = readCipl(rows);
  assert.equal(r.gross, 14125);
  assert.equal(r.net, 12983);
  assert.ok(r.swapped);
});

test('buildBatches — 파일명에 차수가 없으면 서류 안의 날짜로 잇는다', () => {
  const day = (iso) => new Date(iso).getTime();
  const files = [
    { name: 'TalkFile_PO_poniel 26-05_260825.pdf', path: 'a/1.pdf', size: 1, vendor: '베이지아', mtime: day('2026-08-25') },
    // 파일명엔 차수가 없고, 서류 안에 적힌 인보이스 날짜만 있습니다.
    { name: 'F-028形式发票.xlsx', path: 'a/2.xlsx', size: 2, vendor: '베이지아', mtime: day('2026-08-30'),
      cipl: { invoiceDate: '2026-08-27' } },
  ];
  const { batches } = buildBatches(files);
  assert.equal(batches.length, 1);
  const pi = batches[0].stages.find((s) => s.key === 'pi').docs;
  assert.equal(pi.length, 1, '계약금서류로 붙는다');
  assert.ok(pi[0].guessed.includes('서류에 적힌 날짜'));
});

test('buildBatches — 잔액서류가 이미 있으면 추정으로 얹지 않는다', () => {
  const day = (iso) => new Date(iso).getTime();
  const files = [
    { name: 'ZEHE-ING26 -2 2026.03.03- CI&PL...xls', path: 'a/1.xls', size: 1, vendor: '제헤우드', mtime: day('2026-03-03') },
    // 남의 거래처 서류가 굴러들어온 경우 — 날짜가 가까워도 얹지 않습니다.
    { name: 'F-023形式发票和装箱单.xlsx', path: 'a/2.xlsx', size: 2, vendor: '제헤우드', mtime: day('2026-03-04'),
      cipl: { invoiceDate: '2026-03-04' } },
  ];
  const { batches, unassigned } = buildBatches(files);
  assert.equal(batches[0].stages.find((s) => s.key === 'cipl').docs.length, 1);
  assert.ok(unassigned.some((d) => d.display.startsWith('F-023')), '미분류로 남는다');
});

test('buildBatches — 차수 폴더에 올린 사진은 상차로 본다', () => {
  const files = [
    { name: 'AMT(ZH)26-18 Ordersheet_20260730.pdf', path: '제헤우드/AMT(ZH)26-18 Ordersheet_20260730.pdf', size: 1, vendor: '제헤우드' },
    // 파일명이 해시라 아무 단서가 없습니다. 폴더 이름이 유일한 근거입니다.
    { name: '0131b84db3cfa55a263a780b0426f68e.JPG', path: '제헤우드/Zh-26-18차/0131b84db3cfa55a263a780b0426f68e.JPG', size: 2, vendor: '제헤우드' },
  ];
  const { batches } = buildBatches(files);
  assert.equal(batches.length, 1, '같은 차수로 모인다');
  const loading = batches[0].stages.find((s) => s.key === 'loading').docs;
  assert.equal(loading.length, 1);
  assert.equal(loading[0].batchBy, 'folder');
});

test('batchFromPath — 폴더 이름에서 차수를 읽는다', () => {
  assert.equal(batchFromPath('제헤우드/Zh-26-18차/사진.jpg')?.label, '26-18');
  assert.equal(batchFromPath('제헤우드/26-19차/x.pdf')?.label, '26-19');
  // 폴더 이름은 사람이 짓는 자리라 조금 풀어 줍니다.
  assert.equal(batchFromPath('제헤우드/2026-18/x.jpg')?.label, '26-18');
  assert.equal(batchFromPath('제헤우드/26_18차/x.jpg')?.label, '26-18');
  assert.equal(batchFromPath('제헤우드/zh-26-16/x.pdf')?.label, '26-16');
  // 파일명 자리는 보지 않습니다.
  assert.equal(batchFromPath('제헤우드/AMT(ZH)26-18 Ordersheet.pdf'), null);
  // 해가 없으면 어느 해인지 알 수 없어 안 읽습니다.
  assert.equal(batchFromPath('제헤우드/18차/x.jpg'), null);
});

test('readBrief — 계약서 한 장을 한 줄로 간추린다', () => {
  const rows = [
    ['QINGDAO ZEHE WOOD INDUSTRY CO.,LTD'],
    ['TO:', '', 'ING FURNITURE', '', '', '', '', '', '', 'PI No.:', 'ZH260803'],
    ['', '', '', '', '', '', '', '', '', 'Order Date:', '2026.08.03'],
    ['', '', 'AMT(ZH)26-18', '', '', '', '', '', '', 'Delivery Date:', '2026.08.20'],
    ['NO.', 'ZH#', 'CODE#', 'Product model', 'IMAGE', 'Specifcation', 'Color', 'Material', 'Quantity', 'PRICE', 'Amount', 'CBM'],
    [1, 'ZH-03', 'myT', 'Tori', '', '826*260*550', 'Cream', 'PB18T', 300, 111, 33300, 9.9],
    ['TOTAL', '', '', '', '40HC*1', '', '', '', 460, '', 108100, 64.75],
    ['', 'DEPOSIT 30%', '', '', '', '', '', '', '', '', 32430],
    ['', 'BALANCE 70%', '', '', '', '', '', '', '', '', 75670],
  ];
  const b = readBrief(rows);
  assert.equal(b.piNo, 'ZH260803');
  assert.equal(b.orderDate, '2026-08-03');
  assert.equal(b.deliveryDate, '2026-08-20');
  assert.equal(b.qty, 460);
  assert.equal(b.amount, 108100);
  assert.equal(b.cbm, 64.75);
  assert.equal(b.container, '40HC*1');
  assert.equal(b.deposit, 32430);
  assert.equal(b.balance, 75670);
});

test('readItems — 품목과 수량을 뽑고 같은 코드는 합친다', () => {
  const rows = [
    ['NO.', 'ZH#', 'CODE#', 'Product model', 'SIZE', 'COLOR', 'Quantity', 'Amount'],
    [1, 'ZH-31', 'ZGR_SSN', 'Grove Bed w/o Head SS', '1110*2010', 'Natural', 30, 13410],
    [2, 'ZH-31', 'ZGR_SSB', 'Grove Bed w/o Head SS', '1110*2010', 'Black', 10, 4670],
    // 같은 코드가 색깔별로 나뉘어 오는 양식이 있어 합쳐 셉니다.
    [3, 'ZH-31', 'ZGR_SSB', '', '1110*2010', 'Black', 5, 2335],
    ['TOTAL', '', '', '', '', '', 45, 20415],
    ['', 'DEPOSIT 30%', '', '', '', '', '', 6124],
  ];
  const items = readItems(rows);
  assert.equal(items.length, 2, '코드 기준 2품목');
  assert.equal(items[0].code, 'ZGR_SSN');
  assert.equal(items[0].qty, 30);
  assert.equal(items[1].qty, 15, '10 + 5');
  assert.equal(items[0].name, 'Grove Bed w/o Head SS');
});

test('parseDate — 여러 표기를 읽는다', () => {
  assert.equal(parseDate('TalkFile_AMT(ZH)26-18 Ordersheet_20260730.pdf'), '2026-07-30');
  assert.equal(parseDate('AMT2026-18书架加床订单合同8.03.xlsx'), null);
  assert.equal(parseDate('그로브침대_도면_260708.dxf'), '2026-07-08');
});

test('parseDocNo — PI 문서번호', () => {
  assert.equal(parseDocNo('TalkFile__26-094-AMT-ZH-18(제헤우드 26-18차)_계약금 인보이스영수증.pdf.pdf'), '26-094');
  assert.equal(parseDocNo('SHBL-SOFLYHQB0783102.pdf'), null);
});

test('buildBatches — 26-18차가 3/7 단계로 잡힌다', () => {
  const files = [
    'TalkFile_AMT(ZH)26-18 Ordersheet_20260730.pdf',
    'TalkFile_AMT(ZH)26-18 Ordersheet_1차 수정 20260813.pdf',
    'AMT2026-18书架加床订单合同8.03.xlsx',
    'TalkFile__26-094-AMT-ZH-18(제헤우드 26-18차)_계약금 인보이스영수증.pdf.pdf',
  ].map((name, i) => ({ name, path: `제헤우드/${name}`, size: 1000 + i, vendor: '제헤우드' }));

  const { batches } = buildBatches(files);
  assert.equal(batches.length, 1);
  const b = batches[0];
  assert.equal(b.batch, '26-18');
  assert.equal(b.done, 3, '발주서 + 계약금서류(合同) + 계약금영수증 = 3단계');
  assert.equal(b.percent, 43);
  assert.ok(!b.issues.some((i) => i.text.includes('PI 원본 없음')), '合同 이 계약금서류라 PI 누락이 아니다');
});

test('findDuplicates — md5가 없으면 이름·크기로 갈음한다', () => {
  const name = 'TalkFile_AMT(ZH)26-18 Ordersheet_1차 수정 20260813.pdf';
  const files = [1, 2, 3].map((i) => ({ name, path: `제헤우드/dup${i}/${name}`, size: 95586, vendor: '제헤우드' }));
  const { batches } = buildBatches(files);
  assert.ok(batches[0].issues.some((i) => i.text.includes('3벌')));
  assert.equal(batches[0].stages[0].docs.length, 1, '목록에는 한 건만 남는다');
  assert.equal(batches[0].stages[0].docs[0].copies.length, 2, '나머지 2벌은 경로로 남는다');
});

test('findDuplicates — md5가 같으면 이름이 달라도 한 파일로 본다', () => {
  // 실제로 흔한 모양입니다: 카톡 저장본과 이름만 다른 같은 파일.
  const files = [
    { name: 'AMT(ZH)26-2nd Ordersheet_20260223.pdf', path: '제헤우드/a.pdf', size: 90000, vendor: '제헤우드', md5: 'aaa' },
    { name: 'TalkFile_AMT_ZH_26-2nd_Ordersheet_20260223_pdf.pdf', path: '제헤우드/b.pdf', size: 90000, vendor: '제헤우드', md5: 'aaa' },
  ];
  const { batches } = buildBatches(files);
  const order = batches[0].stages[0].docs;
  assert.equal(order.length, 1, '한 건으로 접힌다');
  assert.equal(order[0].copies.length, 1);
  assert.ok(batches[0].issues.some((i) => i.text.includes('내용 같음')));
});

test('findDuplicates — md5가 다르면 이름이 같아도 따로 둔다', () => {
  const name = 'AMT(ZH)26-18 Ordersheet_20260730.pdf';
  const files = [
    { name, path: '제헤우드/v1/' + name, size: 90000, vendor: '제헤우드', md5: 'aaa' },
    { name, path: '제헤우드/v2/' + name, size: 90000, vendor: '제헤우드', md5: 'bbb' },
  ];
  const { batches } = buildBatches(files);
  assert.equal(batches[0].stages[0].docs.length, 2, '내용이 다르니 둘 다 남는다');
});

test('normalize — TalkFile 접두사와 중복 확장자를 지운다', () => {
  const { batches } = buildBatches([
    { name: 'TalkFile_26-079-AMT-ZH-13(제헤우드 26-13차)_잔금인보이스영수증.pdf.pdf', path: 'a', size: 1, vendor: '제헤우드' },
  ]);
  assert.equal(batches[0].docs[0].display, '26-079-AMT-ZH-13(제헤우드 26-13차)_잔금인보이스영수증.pdf');
});

test('classify — PO도 발주서로 본다', () => {
  assert.equal(classify('TalkFile_26-1_PO for Ceramic table _ 2nd revised 260317.pdf').key, 'order');
});

test('classify — 선수금 PI는 계약금서류', () => {
  assert.equal(classify('ING- 선수금 2026031711 PI.xls').key, 'pi');
});

test('classify — 合同(계약서)은 계약금서류, Ordersheet는 발주서', () => {
  // 거래처가 보내오는 订单合同 을 받고 계약금 30%를 넣습니다.
  assert.equal(classify('AMT2026-15书架订单(19)合同7.14.xlsx').key, 'pi');
  assert.equal(classify('AMT2026-11床订单(15)合同5.30.xlsx').key, 'pi');
  assert.equal(classify('AMT2025 书架订单(4)合同12.30.xlsx').key, 'pi');
  // AMT이 내보내는 Ordersheet·PO 는 그대로 발주서입니다.
  assert.equal(classify('AMT(ZH)26-11 Ordersheet_2차수정 20260608(그로브).pdf').key, 'order');
  assert.equal(classify('TalkFile_PO_poniel 26-01_260304.pdf.pdf').key, 'order');
});

test('맥에서 읽은 이름(NFD)도 그대로 판정한다', () => {
  // 맥 파일시스템은 한글을 자모로 쪼개 돌려줍니다. 눈에는 같아 보여도 글자가 다릅니다.
  const nfd = '30% SS)PI-26-004-AMT-ZH-01_ 제헤우드 26-01차영수증.pdf'.normalize('NFD');
  assert.notEqual(nfd, nfd.normalize('NFC'), '정말 NFD 인지 확인');
  assert.equal(classify(nfd).key, 'piReceipt');
  assert.equal(parseBatch(nfd)?.label, '26-01');
});

/* ── 사용자 정의 규칙 ─────────────────────────────────── */

import { applyRules, ruleMatches, suggestKeyword } from '../js/parse.js';

const mk = (name, vendor = '제헤우드') => ({ name, path: `${vendor}/${name}`, size: 1, vendor });

test('규칙 — 키워드로 단계를 지정한다', () => {
  const rules = [{ id: 'r1', matchType: 'contains', match: '形式发票和装箱单', action: 'assign', stageKey: 'cipl' }];
  const { unassigned } = buildBatches([mk('F-022形式发票和装箱单发给客户.pdf')], rules);
  assert.equal(unassigned[0].stageKey, 'cipl');
  assert.equal(unassigned[0].why, '직접 지정');
});

test('규칙 — 키워드로 차수를 붙이면 차수 카드로 들어간다', () => {
  const rules = [{ id: 'r2', matchType: 'contains', match: 'F-022', action: 'assign', batch: '26-05' }];
  const { batches, unassigned } = buildBatches([mk('F-022形式发票和装箱单发给客户.pdf')], rules);
  assert.equal(unassigned.length, 0);
  assert.equal(batches[0].batch, '26-05');
});

test('규칙 — 제외하면 excluded 로 빠진다', () => {
  const rules = [{ id: 'r3', matchType: 'contains', match: '.html', action: 'exclude' }];
  const { excluded, unassigned } = buildBatches([mk('배송관리폼.html', '(루트)')], rules);
  assert.equal(excluded.length, 1);
  assert.equal(unassigned.length, 0);
});

test('규칙 — 개별 파일 지정이 패턴 규칙을 이긴다', () => {
  const f = mk('F-022形式发票和装箱单发给客户.pdf');
  const rules = [
    { id: 'p', matchType: 'contains', match: 'F-022', action: 'exclude' },
    { id: 'f', matchType: 'path', match: f.path, action: 'assign', batch: '26-07', stageKey: 'cipl' },
  ];
  const { batches, excluded } = buildBatches([f], rules);
  assert.equal(excluded.length, 0, '개별 지정이 제외를 덮어야 한다');
  assert.equal(batches[0].batch, '26-07');
});

test('규칙 — 잘못된 정규식은 무시된다', () => {
  assert.equal(ruleMatches({ matchType: 'regex', match: '([' }, mk('a.pdf')), false);
});

test('suggestKeyword — 날짜·연번을 걷어낸 토막을 제안한다', () => {
  assert.equal(suggestKeyword('F-022形式发票和装箱单发给客户.pdf'), '形式发票和装箱单发给客户');
  assert.ok(suggestKeyword('HBL-SOFEDQB2601106-ING-1.2(1).pdf').includes('SOFEDQB'));
});

test('applyRules — 규칙이 없으면 원본 그대로', () => {
  const d = { path: 'a/b.pdf', name: 'b.pdf' };
  assert.equal(applyRules(d, []), d);
});

// 발주서 PDF 를 구글 문서로 바꾸면 표가 "탭 + 칸" 으로 풀립니다.
// 칸 차례는 판마다 다릅니다 — 아래는 실제 두 판을 그대로 줄인 것입니다.
const PO_A = [
  '\t ZH# ', '\tITEM NAME ', '\tSIZE ', '\tcode# ', '\tCOLOR', '\tPRICE ', '\tORDER QTY', '\tAMOUNT', '\tRemark',
  '\tZH-31', '\t 비요크 무헤드 침대 SS \nBjork Bed w/o Head SS ', '\t  \n', '\t1110*2010*200 ',
  '\tZBY_SSN ', '\t내추럴오크 \nNatural Oak ', '\t¥560.0 ', '\t30 ', '\t¥16,800.00', '\t',
  '\tZH-31', '\t 비요크 무헤드 침대 SS \nBjork Bed w/o Head SS ', '\t1110*2010*200 ',
  '\tZBY_SSB ', '\t블랙 \nBlack ', '\t¥560.0 ', '\t15 ', '\t¥8,400.00', '\t',
  '\tTOTAL', '\t45 ', '\t¥25,200.00',
].join('');

// 일련번호 칸이 하나 더 있고, 색만 다른 줄은 앞 칸이 죄다 비어 있습니다.
const PO_B = [
  '\t1 ', '\tZH_01', '\t토리 마이토이 3단 교구장 \nTori mytoy 3s bookshelf', '\t826*260*800',
  '\tmyT_3C ', '\t크림버치 Cream ', '\t¥113.00 ', '\t30 ', '\t¥3,390.00', '\t\n', '\t\n',
  '\t\n', '\t\n', '\tmyT_3B ', '\t블랙 \nBlack ', '\t¥113.00 ', '\t20 ', '\t¥2,260.00', '\t\n', '\t\n',
  '\tTOTAL', '\t50 ', '\t¥ 5,650.00',
].join('');

test('readPdfItems — 발주서 PDF 에서 코드·이름·수량을 뽑는다', () => {
  const items = readPdfItems(PO_A);
  assert.deepEqual(items, [
    { code: 'ZBY_SSN', name: '비요크 무헤드 침대 SS', qty: 30 },
    { code: 'ZBY_SSB', name: '비요크 무헤드 침대 SS', qty: 15 },
  ]);
  // TOTAL 줄은 품목이 아닙니다
  assert.equal(items.reduce((a, b) => a + b.qty, 0), 45);
});

test('readPdfItems — 색만 다른 줄은 위 품목의 이름을 물려받는다', () => {
  const items = readPdfItems(PO_B);
  assert.equal(items.length, 2);
  assert.equal(items[1].code, 'myT_3B');
  assert.equal(items[1].name, '토리 마이토이 3단 교구장');
  assert.equal(items[1].qty, 20);
});

test('readPdfItems — 글자가 없으면 null', () => {
  assert.equal(readPdfItems(''), null);
  assert.equal(readPdfItems('그냥 줄글입니다. 표가 없습니다.'), null);
});

/* ── 파일 종류 갈래 — cad · spread · ppt · pdf · 기타 ───────────── */
import { kindOf, KINDS } from '../js/parse.js';

test('kindOf — 다섯 갈래로만 간다', () => {
  assert.equal(KINDS.length, 5);
  const keys = new Set(KINDS.map((k) => k.key));
  for (const n of ['a.dwg', 'b.xlsx', 'c.pptx', 'd.pdf', 'e.zip', '확장자없음'])
    assert.ok(keys.has(kindOf(n)), `${n} 이 다섯 갈래 밖으로 샜다`);
});

test('kindOf — 확장자로 가른다', () => {
  assert.equal(kindOf('그로브침대-0713.dwg'), 'cad');
  assert.equal(kindOf('의자.dxf'), 'cad');
  assert.equal(kindOf('견적.xlsx'), 'spread');
  assert.equal(kindOf('단가표.xls'), 'spread');
  assert.equal(kindOf('목록.csv'), 'spread');
  assert.equal(kindOf('제안서.pptx'), 'ppt');
  assert.equal(kindOf('발주서.pdf'), 'pdf');
});

test('kindOf — 카카오톡이 붙인 겹친 확장자도 읽는다', () => {
  assert.equal(kindOf('TalkFile_그로브침대-0713.dwg.dwg'), 'cad');
  assert.equal(kindOf('TalkFile_bed-0713.xlsx.xlsx'), 'spread');
});

test('kindOf — 애매한 것은 억지로 끼우지 않고 기타로', () => {
  for (const n of ['상차사진.jpg', '메모.txt', '계약서.docx', '설명.hwp',
                   '자료.zip', 'TalkMedia_i_46729f9035b8.png', '이름만있는파일'])
    assert.equal(kindOf(n), 'etc', `${n} 이 기타가 아니다`);
});

test('readItems — 단가·금액 칸을 읽는다. 없으면 빈칸이다', () => {
  const rows = [
    ['CODE#', '품명', '수량', 'UNIT PRICE', 'AMOUNT'],
    ['A1', '교구장', 10, 12.5, 125],
    ['A1', '교구장 빨강', 5, 12.5, 62.5],   // 같은 코드 — 합쳐 셉니다
    ['B2', '책장', 3, 9.8, 29.4],
  ];
  const got = readItems(rows);
  assert.deepEqual(got.map((x) => [x.code, x.qty, x.price, x.amount]),
    [['A1', 15, 12.5, 187.5], ['B2', 3, 9.8, 29.4]]);

  // 가격 칸이 아예 없는 양식 — 0 이 아니라 빈칸입니다
  const 없음 = readItems([['CODE#', '품명', '수량'], ['A1', '교구장', 10]]);
  assert.equal(없음[0].price, null);
  assert.equal(없음[0].amount, null);

  // 같은 코드인데 단가가 다르면 단가는 빈칸, 금액은 더합니다
  const 다름 = readItems([['CODE#', '품명', '수량', '단가', '금액'],
    ['A1', '교구장', 10, 12.5, 125], ['A1', '교구장', 10, 13.0, 130]]);
  assert.equal(다름[0].price, null);
  assert.equal(다름[0].amount, 255);
});

test('readItems — 글귀는 빠지고 진짜 코드는 짧아도 남는다', () => {
  // 10-11 관리자가 쟀다. 「글자만 있으면 코드가 아니다」 를 길이 없이 걸었더니
  // 진짜 제품 newX(신규 깔판 2종) 가 단품관리에서 사라졌다 — 코드 5개가 4개가 됐다.
  // 그리고 길이로 한정하자 이번에는 한자 글귀가 샜다 — JS 의 \b 는 한자 뒤에 안 선다.
  const 있나 = (c) => !!readItems([
    ['Code#', 'Item Name', 'Quantity', 'Unit Price', 'Amount'],
    [c, '무엇', 10, 5, 50],
  ]);

  // 진짜 코드 — 숫자도 가름표도 없고 짧아도 남아야 한다
  for (const c of ['newX', 'bkS_2', 'myT_3C', 'tbl_L', 'wdB_5', '床-21', 'A1', 'CHAIR', '床订单'])
    assert.equal(있나(c), true, c + ' 는 진짜 코드다');

  // 서류 아래 글귀 — 한자까지 다 빠져야 한다
  for (const c of ['Beneficiary', 'ADDRESS(地址)青岛市胶州市郑州东路39号', 'A/C NO', 'TEL',
                   '地址', '开户行', 'ADDRESS: 39 Zhengzhou Rd'])
    assert.equal(있나(c), false, c + ' 는 글귀다');

  // 문장과 너무 긴 것 — 코드가 아니다
  assert.equal(있나('AB CD EF'), false);
  assert.equal(있나('ABC-1234567890123456789012'), false);
});

test('readItems — 이름 가운데 쌍점이 있어도 진짜 제품 이름은 안 지운다', () => {
  // 10-11 관리자가 쟀다. 글귀 그물의 쌍점 가지가 `^` 없이 **어디에 있든** 걸려서
  // 「3단 교구장 (상판:오크)」 같은 진짜 이름이 통째로 빈칸이 됐다.
  const 이름 = (n) => readItems([
    ['Code#', 'Item Name', 'Quantity', 'Unit Price', 'Amount'],
    ['tbl_L', n, 10, 5, 50],
  ])[0].name;

  // 제품 이름 — 그대로 남아야 한다
  assert.equal(이름('3단 교구장 (상판:오크)'), '3단 교구장 (상판:오크)');
  assert.equal(이름('책장 2단 : 화이트'), '책장 2단 : 화이트');
  assert.equal(이름('테이블 라지'), '테이블 라지');

  // 서류 아래 글귀가 이름 칸에 겹친 것 — 이름만 비운다
  assert.equal(이름('Beneficiary: QINGDAO ZEHE WOOD'), '');
  assert.equal(이름('ADDRESS: 39 Zhengzhou Rd'), '');

  // 이름을 비워도 **줄은 살아 있다** — 그 줄은 진짜 제품이다
  const 산줄 = readItems([
    ['Code#', 'Item Name', 'Quantity', 'Unit Price', 'Amount'],
    ['bjA_1', 'Beneficiary: QINGDAO ZEHE WOOD', 40, '', ''],
  ]);
  assert.equal(산줄.length, 1);
  assert.equal(산줄[0].code, 'bjA_1');
  assert.equal(산줄[0].qty, 40);
});

test('readItems — 가격 칸이 **비어 있으면** 0 이 아니라 빈칸이다', () => {
  // Number('') 은 0 이다. 이것을 안 거르면 빈 단가가 「공짜」 로 찍힌다.
  // 10-11 관리자가 진짜 CI&PL 꼴로 쟀다 — 마지막 품목의 단가·금액이 비어 있었다.
  const 빈칸 = readItems([
    ['Code#', 'Item Name', 'Quantity', 'Unit Price', 'Amount'],
    ['myT_3C', '토리 마이토이 3단 교구장', 100, 12.5, 1250],
    ['wdB_5', '', 40, '', ''],
  ]);
  assert.equal(빈칸[1].qty, 40);
  assert.equal(빈칸[1].price, null, '빈 단가는 null 이어야 한다');
  assert.equal(빈칸[1].amount, null, '빈 금액은 null 이어야 한다');

  // 빈칸과 진짜 0 은 다르다 — 공짜로 준 것은 0 으로 남는다
  const 공짜 = readItems([
    ['Code#', 'Item Name', 'Quantity', 'Unit Price', 'Amount'],
    ['free1', '샘플', 2, 0, 0],
  ]);
  assert.equal(공짜[0].price, 0);
  assert.equal(공짜[0].amount, 0);
});

test('readItems — 코드 옆이 제품 꼴일 때만 제품이다 (사장님 10-11 규칙)', () => {
  const rows = [
    ['CODE#', '품명', '수량', 'UNIT PRICE', 'AMOUNT'],
    ['myT_3C', '토리 마이토이 3단 교구장', 100, 12.5, 1250],   // 이름·가격 다 있음
    ['wdB_5', '우드 벤치', 40, '', ''],                        // 가격 없어도 이름 있으면 제품
    ['tbl_L', '', 100, 21, 2100],                              // 이름 없어도 가격 있으면 제품
    ['ADDRESS(地址)青岛市胶州市郑州东路39号', '', 39, '', ''],   // 수량만 — 제품 아님
    ['Beneficiary', '', 1, '', ''],                            // 수량만 — 제품 아님
  ];
  const got = readItems(rows);
  assert.deepEqual(got.map((x) => x.code), ['myT_3C', 'wdB_5', 'tbl_L'],
    '주소·은행 글귀는 빠지고 진짜 제품 셋은 남습니다');
});

test('readItems — 이름 칸에 겹쳐 들어온 글귀는 이름만 비우고 줄은 살린다', () => {
  const rows = [
    ['CODE#', '품명', '수량', 'UNIT PRICE'],
    ['wdB_5', 'Beneficiary: QINGDAO ZEHE WOOD INDUSTRY', 40, 12.5],
  ];
  const got = readItems(rows);
  assert.equal(got.length, 1, '진짜 제품을 떨어뜨리지 않습니다');
  assert.equal(got[0].code, 'wdB_5');
  assert.equal(got[0].name, '', '겹친 글귀는 이름 자리에서 빠집니다');
  assert.equal(got[0].qty, 40);
});

test('readItems — 단품관리 다섯 칸을 읽는다. Packing size 는 글자 그대로', () => {
  const rows = [
    ['Code#', 'Item Name', 'Qty pcs', 'FOB', 'Packing size(mm)', 'pcs/ctn', 'carton Volume (CBM)'],
    ['myT_3C', '토리 마이토이 3단 교구장', 100, 12.5, '800*400*250', 2, 0.08],
    ['wdB_5', '우드 벤치', 40, '', '', '', ''],
  ];
  const got = readItems(rows);
  assert.deepEqual([got[0].qty, got[0].price, got[0].size, got[0].perCtn, got[0].cbm],
    [100, 12.5, '800*400*250', 2, 0.08]);
  // 못 읽은 칸은 0 이 아니라 빈칸입니다
  assert.deepEqual([got[1].price, got[1].size, got[1].perCtn, got[1].cbm],
    [null, null, null, null]);
});

test('readItems — 같은 코드가 여러 줄이면 포장 꼴이 다를 때 빈칸이다', () => {
  const got = readItems([
    ['Code#', '품명', '수량', '단가', 'Packing size(mm)', 'pcs/ctn', 'CBM'],
    ['A1', '교구장', 10, 12.5, '800*400*250', 2, 0.08],
    ['A1', '교구장 빨강', 5, 12.5, '900*400*250', 2, 0.09],
  ]);
  assert.equal(got.length, 1);
  assert.equal(got[0].qty, 15);
  assert.equal(got[0].size, null, '포장 꼴이 다르면 빈칸입니다');
  assert.equal(got[0].perCtn, 2, '같으면 그대로 둡니다');
  assert.equal(Math.round(got[0].cbm * 100) / 100, 0.17, '부피는 더합니다');
});

test('readItems — Color 를 읽고, 같은 코드가 색깔별이면 색을 모은다', () => {
  const got = readItems([
    ['Code#', 'Product model', 'Color', 'Qty pcs', 'FOB', 'Packing size(mm)', 'pcs/ctn', 'carton Volume (CBM)'],
    ['myT_3C', '토리 마이토이 3단 교구장', '화이트', 50, 12.5, '800*400*250', 2, 0.08],
    ['myT_3C', '토리 마이토이 3단 교구장', '오크', 50, 12.5, '800*400*250', 2, 0.08],
    ['bkS_2', '책장 2단', '', 60, 9.8, '900*350*220', 4, 0.07],
  ]);
  assert.deepEqual(got[0].colors, ['화이트', '오크'], '색은 합치지 않고 모읍니다');
  assert.equal(got[0].qty, 100, '수량은 더합니다');
  assert.deepEqual(got[1].colors, [], '색 칸이 비면 빈 목록입니다');
  assert.equal(got[0].name, '토리 마이토이 3단 교구장');
});

/* ⚠ 이 본보기에는 **`▁`(U+2581) 가 꼭 섞여 있어야** 합니다.
     진짜 자료의 코드 213가지 가운데 57가지가 이 글자를 쓰고 있었습니다.
     본보기에 그 글자가 없으면 이 집에서 두 번 그랬듯 또 못 잡습니다. */
test('코드열쇠 — 밑줄 꼴만 한 자리로 본다. 가름표와 대소문자는 안 뭉갠다', () => {
  // 좌·우 토막이 같으면 같은 것입니다 — myT | 3C
  assert.equal(코드열쇠('myT\u25813C'), 코드열쇠('myT_3C'));
  assert.equal(코드열쇠('myT\uff3f3C'), 코드열쇠('myT_3C'), '＿(U+FF3F) 도 밑줄 꼴입니다');
  assert.equal(코드열쇠('myT\u20173C'), 코드열쇠('myT_3C'), '‗(U+2017) 도 밑줄 꼴입니다');
  // ⚠ 가름표를 뭉개면 남의 제품이 한 줄로 합쳐집니다 — BHP8_B 와 BHP_B 는 다른 제품입니다
  assert.notEqual(코드열쇠('BHP8_B'), 코드열쇠('BHP_B'), '하이픈·숫자는 안 뭉갭니다');
  assert.notEqual(코드열쇠('bd-whsqa'), 코드열쇠('bd_whsqa'), '하이픈은 밑줄이 아닙니다');
  // ⚠ 대소문자는 시킨 적 없습니다
  assert.notEqual(코드열쇠('myT_3C'), 코드열쇠('MYT_3C'), '대소문자는 안 뭉갭니다');
  assert.equal(코드열쇠(null), '');
});

test('readItems — 밑줄 꼴만 다른 두 줄은 한 줄로 합치고, 날것 코드는 안 고친다', () => {
  const got = readItems([
    ['Code#', 'Product model', 'Color', 'Qty pcs', 'FOB', 'Packing size(mm)', 'pcs/ctn', 'carton Volume (CBM)'],
    ['myT\u25813C', '토리 마이토이 3단 교구장', '화이트', 60, 12.5, '800*400*250', 2, 0.08],
    ['myT_3C', '토리 마이토이 3단 교구장', '오크', 40, 12.5, '800*400*250', 2, 0.08],
    ['myT\u25813C', '토리 마이토이 3단 교구장', '네이비', 10, 12.5, '800*400*250', 2, 0.08],
    ['BHP8_B', '보링 받침 8', '', 10, 3.1, '', '', ''],
    ['BHP_B', '보링 받침', '', 20, 2.9, '', '', ''],
  ]);
  assert.equal(got.length, 3, '밑줄 꼴 둘은 한 줄로, 가름표가 다른 코드는 따로입니다');
  assert.equal(got[0].code, 'myT\u25813C', '머리에 서는 것은 **많이 쓰인 날것 꼴**입니다 (2회 대 1회)');
  assert.equal(got[0].qty, 110, '수량은 두 꼴을 다 더합니다');
  assert.deepEqual(got[0].colors, ['화이트', '오크', '네이비']);
  assert.deepEqual(got[0].밑줄꼴, ['myT\u25813C', 'myT_3C'], '합쳐진 것은 표시를 남깁니다');
  assert.deepEqual([got[1].code, got[2].code], ['BHP8_B', 'BHP_B'], '가름표가 다른 코드는 안 합칩니다');
  assert.equal(got[1].밑줄꼴, undefined, '안 합쳐진 것에는 표시가 없습니다');
});

test('readPdfItems — 밑줄 꼴이 든 코드를 안 버리고, 날것 그대로 둔다', () => {
  const 줄 = ['', '', '토리 마이토이 3단 교구장', 'myT\u25813C', '화이트', '¥100', '60', '¥6,000'].join('\t');
  const got = readPdfItems(줄);
  assert.equal(got[0].code, 'myT\u25813C', '서류에 적힌 그대로 둡니다 — 맞대기는 코드열쇠가 합니다');
  assert.equal(got[0].qty, 60);
});

test('readItems — 입수 칸의 「1pcs/ctn」 에서 앞 숫자를 읽는다', () => {
  // 10-15 에 제헤우드 20장(품목 391줄)을 세니 349줄이 「1pcs/ctn  」 꼴이었습니다.
  const got = readItems([
    ['Code#', 'Product model', 'Qty pcs', 'FOB', 'Packing size(mm)', 'pcs/ctn', 'carton Volume (CBM)'],
    ['BH_LKB', 'Bjork Head LK', 10, 273.5, '1810*55*800', '1pcs/ctn  ', 0.096],
    ['ZBY_LKB', 'Bjork Bed LK', 20, 311.0, '2100*60*900', 3, 0.12],
    ['NO_NUM', '숫자 없는 칸', 5, 1.5, '', 'pcs/ctn', 0.01],
  ]);
  assert.equal(got[0].perCtn, 1, '글자가 붙어 있어도 앞 숫자를 읽습니다');
  assert.equal(got[1].perCtn, 3, '숫자는 그대로입니다');
  assert.equal(got[2].perCtn, null, '숫자로 시작하지 않으면 빈칸입니다 — 0 이 아닙니다');
  // ⚠ 입수 칸에만 쓰는 자입니다. 단가·금액·부피는 글자가 섞이면 빈칸이 맞습니다.
  const 섞임 = readItems([
    ['Code#', '품명', '수량', '단가', 'CBM'],
    ['A1', '교구장', 10, '12.5USD', '0.08cbm'],
  ]);
  assert.equal(섞임[0].price, null, '단가는 앞숫자로 읽지 않습니다');
  assert.equal(섞임[0].cbm, null, '부피도 앞숫자로 읽지 않습니다');
});

/* 10-15 에 제헤우드 잔액서류 20장을 날것으로 읽어 보니 코드 138가지 가운데 **10가지**가
   이 글귀였습니다. 배포된 v2 판에는 거르개가 없어 화베에 그대로 담겨 있습니다.
   ⚠ 이 목록은 **진짜 서류에서 그대로 베낀 것**입니다. 그물을 손보면 여기가 빨개집니다. */
test('제품줄인가 — 진짜 서류에 섞여 있던 주소·은행 글귀 열 가지를 다 버린다', () => {
  const 글귀들 = [
    'Beneficiary: QINGDAO ZEHE WOOD INDUSTRY CO.,LTD',
    'Beneficiary Address : DATUN 1 VILLAGE,LIREZHUANG,JIAOZHOU,QINGDAO,SHANDONG,CHINA',
    'SWIFTCODE:ABOCCNBJ380',
    'BANKNAMEAGRICULTURAL BANK OF CHINA.',
    'QINGDAO BRANCH',
    'BANKADD:19 SHANDONGROAD OINGDAO CHINA',
    'BENESACNO(账号):38140801040007140',
    'BENESNAME:中国农业银行胶州支行',
    'ADDRESS(地址)青岛市胶州市郑州东路39号',
    'TEL(电话):0532-87222370',
  ];
  for (const g of 글귀들) assert.equal(제품줄인가(g), false, `글귀가 품목으로 샜습니다: ${g}`);

  // ⚠ 같은 그물이 **진짜 제품**은 그대로 두어야 합니다 — 10-11 에 newX 가 사라진 적이 있습니다.
  for (const c of ['newX', 'BH_LKB', 'ZBY_SSN', 'myT_3C', 'wdB_5', 'BHP8_B', 'CHAIR', '床订单'])
    assert.equal(제품줄인가(c), true, `진짜 제품이 사라졌습니다: ${c}`);
});

/* 10-15 에 진짜 드라이브의 비엘 파일 **20장**을 세어 짠 그물입니다.
   ⚠⚠ **선사 이름(SOF·SITT·DJSC…)을 늘어놓지 마십시오.** 선사마다 다릅니다 —
      머리글(HBL/SHBL/MBL)에 걸어 **바로 뒤 토막**을 집습니다. */
test('orderIds — 비엘번호를 머리글로 집는다. 선사를 몰라도 잡힌다', () => {
  const bl = (n) => orderIds(n).find((x) => /^[A-Z]{3,}[A-Z0-9]{5,}$/.test(x)) ?? null;
  // 진짜 이름 그대로입니다
  assert.equal(bl('HBL-SOFRNQB2615115-ING-4.29.pdf'), 'SOFRNQB2615115');
  assert.equal(bl('SHBL-SOFLYHQB0782100-ING(1).pdf'), 'SOFLYHQB0782100');
  assert.equal(bl('SHBL- SITTAGPT2635144.pdf'), 'SITTAGPT2635144', '선사가 달라도 잡힙니다');
  assert.equal(bl('SHBL-DJSCTAO260008515(1).pdf'), 'DJSCTAO260008515', '선사가 달라도 잡힙니다');

  // ⚠ 헛잡음 0 — 비엘이 아닌 진짜 이름에서는 아무것도 안 집습니다
  for (const n of [
    'ZEHE-ING26 -17 2026.08.28- CI&PL...xls',
    'TalkFile_AMT(ZH)26-17 Ordersheet_1차 수정 20260713(비요크).pdf',
    'SS)PI-26-086-AMT-ZH-17_제헤우드 26-17차.pdf',
    'FTA-ING 26-13.pdf',
    'SNKO024260502736 SUR H.pdf',
    '선하증권 ZH-26-22.pdf',          // 머리글이 없으면 없는 것입니다 — 지어내지 않습니다
  ]) assert.equal(bl(n), null, `헛잡음: ${n}`);

  // 머리글이 붙은 날짜·컨테이너는 번호가 아닙니다
  assert.equal(bl('HBL-2026.08.15.pdf'), null, '날짜를 비엘로 읽으면 안 됩니다');
});
