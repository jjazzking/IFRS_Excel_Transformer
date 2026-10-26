/**
 * 주석 찾기 작업대 점검 — DART 응답을 가짜로 꾸며 화면을 끝까지 눌러 본다.
 * 실행: `npm run dev` 를 켜 둔 채 `node scripts/check_dart.cjs`
 */
const { chromium } = require('playwright'); const XLSX = require('xlsx'); const assert = require('assert');

// DART 사이트 보고서 화면(main.do) — 실제 반기보고서 화면 원본에서 첨부 목록과 목차 부분만 옮겨 왔다.
const node = (d, id, text, eleId) => `
\t\tvar node${d} = {};
\t\tnode${d}['text'] = "${text}";
\t\tnode${d}['id'] = "${id}";
\t\tnode${d}['rcpNo'] = "20260814001968";
\t\tnode${d}['dcmNo'] = "11531626";
\t\tnode${d}['eleId'] = "${eleId}";
\t\tnode${d}['offset'] = "1342";
\t\tnode${d}['length'] = "1659";
\t\tnode${d}['dtd'] = "dart4.xsd";
\t\tnode${d}['tocNo'] =  "${id}";  //eleId 가 toc 순번하고 동일 하지 않은 문서가 존재함.`;
const MAIN_DO = `<html><script>function makeToc() {
\tcnt = 0;\n\tvar treeData = [];
${node(1, 1, '검   토   보   고   서', 1)}\n\t\ttreeData.push(node1);
${node(1, 3, '(첨부)반 기 재 무 제 표', 3)}\n\t\t\tnode1['children'] = [];
${node(2, 4, '주석', 4)}\n\t\t\tnode1['children'].push(node2);\n\t\ttreeData.push(node1);
\tvar jsTree = $j('#listTree').jstree({});
}</script>
<select id="att" class="w01" onchange="changeAtt(this.value)">
\t<option value="null">+첨부선택+</option>
\t<option value="rcpNo=20260814001968&amp;dcmNo=11531626" selected>
\t\t2026.08.14&nbsp;
\t\t반기검토보고서
\t</option>
\t<option value="rcpNo=20260814001968&amp;dcmNo=11531628" >
\t\t2026.08.14&nbsp;
\t\t반기연결검토보고서
\t</option>
</select></html>`;
// 본문 조각(viewer.do) — 감싸개 안에 주석 문단들이 있고, 스크립트는 화면에 나오면 안 된다.
const VIEWER_DO = '<html><head><title>x</title><script>var leak = 1;</script></head><body><div class="xforms">' +
  '<p>1. 일반사항</p><p>회사는 설립되었습니다.</p><p>2. 회계정책</p><table border="1"><tr><td>현금</td><td>100</td></tr></table></div></body></html>';
const HALF = '<?xml version="1.0" encoding="utf-8"?><DOCUMENT><DOCUMENT-NAME>반기보고서</DOCUMENT-NAME><BODY><SECTION-1><TITLE>I. 회사의 개요</TITLE><P>본문</P></SECTION-1></BODY></DOCUMENT>';

const zip = files => {
  const c = XLSX.CFB.utils.cfb_new();
  for (const [name, buf] of Object.entries(files)) XLSX.CFB.utils.cfb_add(c, name, buf);
  return XLSX.CFB.write(c, { type: 'buffer', fileType: 'zip' });
};
const CORP = zip({ 'CORPCODE.xml': Buffer.from('<?xml version="1.0" encoding="UTF-8"?><result>' +
  [['00126380','삼성전자','005930'],['00999999','삼성전자서비스',' '],['00111111','한국&amp;전자',' ']]
    .map(([c,n,s]) => `<list><corp_code>${c}</corp_code><corp_name>${n}</corp_name><corp_eng_name>X</corp_eng_name><stock_code>${s}</stock_code></list>`).join('') + '</result>') });
const MAIN = `<?xml version="1.0" encoding="utf-8"?>
<DOCUMENT><DOCUMENT-NAME ACODE="11011">사업보고서</DOCUMENT-NAME><COMPANY-NAME>삼성전자</COMPANY-NAME>
<BODY><COVER><COVER-TITLE>사 업 보 고 서</COVER-TITLE></COVER>
<SECTION-1><TITLE ATOCID="3">I. 회사의 개요</TITLE><P>R&D 투자 &cr;둘째 줄</P><PGBRK/></SECTION-1>
<SECTION-1><TITLE ATOCID="9">III. 재무에 관한 사항</TITLE>
<SECTION-2><TITLE ATOCID="10">3. 연결재무제표 주석</TITLE>
<P>1. 일반적 사항</P><P>회사는 1969년 설립되었습니다.</P>
<P>2. 중요한 회계정책</P><P>(1) 측정기준</P>
<TABLE-GROUP><TABLE BORDER="1"><COLGROUP><COL WIDTH="100"/><COL WIDTH="80"/></COLGROUP>
<THEAD><TR><TH ROWSPAN="2">구분</TH><TH>당기</TH></TR><TR><TH>금액</TH></TR></THEAD>
<TBODY><TR><TE>현금</TE><TE ALIGN="RIGHT">1,234</TE></TR><TR><TU COLSPAN="2">합계 <SPAN>(5)</SPAN></TU></TR></TBODY></TABLE></TABLE-GROUP>
<P>5. 건너뛴 번호</P><P>3. 현금및현금성자산</P><P>내용<IMAGE><IMG>a.jpg</IMG></IMAGE></P>
</SECTION-2></SECTION-1></BODY></DOCUMENT>`;
// 첨부는 옛 공시처럼 EUC-KR 로 담되, 선언은 utf-8 이라고 잘못 적어 둔다 (실제 옛 공시에서 글자가 깨졌던 경우).
const ATT_TEXT = '<?xml version="1.0" encoding="utf-8"?><DOCUMENT><DOCUMENT-NAME>감사보고서</DOCUMENT-NAME><BODY><SECTION-1><TITLE>독립된 감사인의 감사보고서</TITLE><P>적정</P><P><script>alert(1)</script>x</P></SECTION-1></BODY></DOCUMENT>';
(async () => {
  const b = await chromium.launch();
  const HALF_DOC = zip({ '20260814001968.xml': Buffer.from(HALF) });
  const DOC = zip({ '20260310000001.xml': Buffer.from(MAIN), '20260310000001_00760.xml': require('child_process').execFileSync('iconv', ['-f', 'utf-8', '-t', 'euc-kr'], { input: ATT_TEXT }) }); const ctx = await b.newContext({ permissions: ['clipboard-read','clipboard-write'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => { errs.push('dialog!'); d.dismiss(); });
  const calls = {};
  await p.route('https://dart-proxy.neojw990223.workers.dev/**', r => {
    const u = new URL(r.request().url()); const h = { 'access-control-allow-origin': '*' };
    const api = u.pathname.split('/').pop(); calls[api] = (calls[api] ?? 0) + 1;
    if (u.pathname.endsWith('corpCode.xml')) return r.fulfill({ body: CORP, headers: h });
    if (u.pathname.endsWith('list.json')) return r.fulfill({ headers: h, contentType: 'application/json', body: JSON.stringify(u.searchParams.get('pblntf_ty')==='A'
      ? { status:'000', list:[{rcept_no:'20260310000001',report_nm:'사업보고서 (2025.12)  ',rcept_dt:'20260310',flr_nm:'삼성전자'},
          {rcept_no:'20260814001968',report_nm:'반기보고서 (2026.06)',rcept_dt:'20260814',flr_nm:'삼성전자'}]} : {status:'013',message:'조회된 데이타가 없습니다.'}) });
    if (u.pathname.endsWith('document.xml')) return r.fulfill({ body: u.searchParams.get('rcept_no') === '20260814001968' ? HALF_DOC : DOC, headers: h });
    if (u.pathname === '/web/main.do') return r.fulfill({ body: MAIN_DO, headers: h, contentType: 'text/html; charset=utf-8' });
    if (u.pathname === '/web/viewer.do') return r.fulfill({ body: VIEWER_DO, headers: h, contentType: 'text/html; charset=utf-8' });
  });
  await p.goto('http://localhost:3000/#/dart');
  await p.fill('#dart-corp-search', '삼성 전자');
  const items = await p.locator('ul li button').allInnerTexts(); console.log('hits', items);
  assert(items[0].startsWith('삼성전자'));
  await p.locator('ul li button').first().click();
  await p.getByText('사업보고서 (2025.12)').click();
  // 감사보고서가 들어 있으면 그것부터 연다 — 본문으로 돌려서 본다.
  await p.getByRole('button', { name: '독립된 감사인의 감사보고서' }).waitFor();
  await p.selectOption('select', '0');
  await p.getByRole('button', { name: '3. 연결재무제표 주석' }).waitFor();
  const toc = await p.locator('nav button').allInnerTexts(); console.log('toc', toc);
  assert.deepStrictEqual(toc, ['표지','I. 회사의 개요','III. 재무에 관한 사항','3. 연결재무제표 주석','1. 일반적 사항','2. 중요한 회계정책','3. 현금및현금성자산']);
  await p.getByRole('button', { name: 'I. 회사의 개요' }).click();
  console.log('sec1', await p.locator('main div.overflow-auto.px-6').innerHTML());
  await p.getByRole('button', { name: '2. 중요한 회계정책' }).click();
  const body = await p.locator('main div.overflow-auto.px-6').innerHTML(); console.log('note2', body);
  assert(body.includes('rowspan="2"') && body.includes('colspan="2"') && body.includes('1,234') && body.includes('5. 건너뛴') && !body.includes('일반적'));
  await p.click('#btn-dart-copy'); await p.getByText('복사됨').waitFor();
  const clip = await p.evaluate(async () => { const it = (await navigator.clipboard.read())[0]; return [it.types, it.types.includes('text/html') ? await (await it.getType('text/html')).text() : 'NOHTML']; });
  console.log('clip types', clip[0]); console.log(clip[1].slice(0,80)); assert(clip[1].includes('<table'));
  await p.selectOption('select', '1');
  const att = await p.locator('main div.overflow-auto.px-6').innerHTML(); console.log('att', att);
  assert(att.includes('적정') && !att.includes('<script'));
  // 반기보고서 — 원문 ZIP 에 검토보고서가 없어 DART 사이트에서 첨부 목록·목차·본문을 읽는다.
  await p.getByText('반기보고서 (2026.06)').click();
  await p.getByRole('button', { name: '검 토 보 고 서' }).waitFor();
  const opts = await p.locator('select option').allInnerTexts(); console.log('half opts', opts);
  assert.deepStrictEqual(opts, ['본문 — 반기보고서', '첨부 — 반기검토보고서', '첨부 — 반기연결검토보고서']);
  assert.strictEqual(await p.locator('select').inputValue(), '1');
  await p.getByRole('button', { name: '주석', exact: true }).click();
  await p.getByRole('button', { name: '2. 회계정책' }).waitFor();
  await p.getByRole('button', { name: '2. 회계정책' }).click();
  const half = await p.locator('main div.overflow-auto.px-6').innerHTML(); console.log('half note2', half);
  assert(half.includes('현금') && !half.includes('일반사항') && !half.includes('leak'));
  assert.strictEqual(calls['viewer.do'], 2); // 첫 화면(검토보고서) + 주석 — 나눈 주석을 누를 때는 다시 받지 않는다

  // 다시 열면 회사 목록·원문은 브라우저 캐시에서 — DART 를 다시 부르지 않는다.
  await p.reload();
  await p.fill('#dart-corp-search', '삼성전자');
  await p.locator('ul li button').first().click();
  await p.getByText('사업보고서 (2025.12)').click();
  // 감사보고서가 들어 있으면 그것부터 연다 — 본문으로 돌려서 본다.
  await p.getByRole('button', { name: '독립된 감사인의 감사보고서' }).waitFor();
  await p.selectOption('select', '0');
  await p.getByRole('button', { name: '3. 연결재무제표 주석' }).waitFor();
  console.log('calls', calls);
  assert.strictEqual(calls['corpCode.xml'], 1); assert.strictEqual(calls['document.xml'], 2); // 사업·반기 한 번씩, 다시 열 때는 캐시
  console.log('errors', errs); assert(errs.length === 0);
  await b.close(); console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
