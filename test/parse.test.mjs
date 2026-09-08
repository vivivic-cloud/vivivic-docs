import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBatch, classify, parseDate, parseDocNo, buildBatches, parseVendor, glossCJK, readCipl, batchFromPath, readBrief, readItems, readPdfItems } from '../js/parse.js';

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
  assert.ok(batches[0].issues.some((i) => i.text.includes('베이지아 폴더에 있습니다')));
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
  assert.ok(!b.issues.some((i) => i.text.includes('PI 원본이 없습니다')), '合同 이 계약금서류라 PI 누락이 아니다');
});

test('findDuplicates — md5가 없으면 이름·크기로 갈음한다', () => {
  const name = 'TalkFile_AMT(ZH)26-18 Ordersheet_1차 수정 20260813.pdf';
  const files = [1, 2, 3].map((i) => ({ name, path: `제헤우드/dup${i}/${name}`, size: 95586, vendor: '제헤우드' }));
  const { batches } = buildBatches(files);
  assert.ok(batches[0].issues.some((i) => i.text.includes('3벌 있습니다')));
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
  assert.ok(batches[0].issues.some((i) => i.text.includes('내용이 같은 파일')));
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
