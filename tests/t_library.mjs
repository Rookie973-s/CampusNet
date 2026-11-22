import { fill, launch, newPage, check, summary, sleep, txt, waitText, clickText, snap, noHScroll, apiAs, tokens, API } from './lib.mjs';
import { execSync } from 'child_process'; import { existsSync, readdirSync } from 'fs';
execSync(`python3 -c "open('/tmp/fake.pdf','wb').write(b'MZ this is an executable pretending to be a pdf'*4); open('/tmp/n.txt','w').write('x')"`);
const browser = await launch();
const folders = (page) => page.$$eval('.folder strong', e => e.map(x => x.textContent));
const sel = (page, id, text) => page.$$eval(`${id} option`, (o, t) => o.find(x => x.textContent.includes(t))?.value, text).then(v => page.select(id, v));
const lib = async (o) => { const p = await newPage(browser, o); await p.waitForSelector('.folder, .lib-empty', { timeout: 8000 }); await sleep(300); return p; };

{ // ── guest ──
  const page = await lib({ path: '/library' });
  check('default view: real course folders from the database', (await folders(page)).sort().join('|') === 'BIO 111|BIO 112|BIO 211|CSC 201|MEE 101|PHY 101');
  const first = await page.$eval('.folder', e => e.innerText);
  check('folder shows code, title, file count and department', /BIO 111/.test(first) && /General Biology/.test(first) && /2 files/.test(first) && /Biochemistry/.test(first), first);
  check('folder shows real document names behind the front panel', /BIO 111 Lecture 1|BIO 111 Past Questions/.test(await page.$eval('.folder-sheets', e => e.innerText)));
  check('guest sees no Upload button', !/Upload PDF/.test(await txt(page)));
  await snap(page, 'library-folders-light'); await snap(page, 'library-folders-full', true);
  check('level selector is visible', !!(await page.$('#f-level')) && await page.$eval('#f-level', e => e.offsetParent !== null));
  await sel(page, '#f-level', '100'); await sleep(700);
  check('level 100 → 4 folders (BIO 111/112, PHY 101, MEE 101)', (await folders(page)).sort().join('|') === 'BIO 111|BIO 112|MEE 101|PHY 101');
  await sel(page, '#f-fac', 'Sciences'); await sleep(700);
  check('level 100 + Sciences → BIO 111, BIO 112, PHY 101', (await folders(page)).sort().join('|') === 'BIO 111|BIO 112|PHY 101');
  check('department list only has the chosen faculty’s departments', (await page.$$eval('#f-dep option', o => o.map(x => x.textContent))).join('|') === 'All departments|Biochemistry|Physics');
  await sel(page, '#f-dep', 'Biochemistry'); await sleep(700);
  check('+ Biochemistry → BIO 111, BIO 112', (await folders(page)).sort().join('|') === 'BIO 111|BIO 112');
  check('active filter chips are shown', (await page.$$('.lib-chips .chip')).length === 3);
  await sel(page, '#f-fac', 'Engineering'); await sleep(700);
  check('changing the faculty resets the department', (await page.$eval('#f-dep', e => e.value)) === '' && !/department=/.test(page.url()));
  check('Engineering + level 100 → MEE 101 only', (await folders(page)).join('|') === 'MEE 101');
  await clickText(page, 'button', /Clear All Filters/); await sleep(700);
  check('Clear All Filters restores everything', (await folders(page)).length === 6 && !/level=/.test(page.url()));
  await page.type('#lib-q', 'genetics'); await sleep(900);
  check('search matches course title', (await folders(page)).join('|') === 'BIO 211');
  await fill(page, '#lib-q', 'past questions'); await sleep(900);
  check('search also matches document titles', (await folders(page)).join('|') === 'BIO 111');
  await fill(page, '#lib-q', 'zzzzzz'); await sleep(900);
  check('empty state when nothing matches', /Nothing matches these filters/.test(await txt(page)));
  await clickText(page, 'button', /Clear All Filters/); await sleep(600);
  await sel(page, '#f-level', '500'); await sleep(600);
  check('level with no material shows the empty state', /Nothing matches/.test(await txt(page)));
  await clickText(page, 'button', /Clear All Filters/); await sleep(600);
  await page.click('.folder'); await sleep(900);
  check('opening a folder lists its documents with a breadcrumb', (await page.$$('.lib-card')).length === 2 && /All folders/.test(await txt(page)));
  const card = await page.$eval('.lib-card', e => e.innerText);
  check('document card shows course, level, faculty, department, uploader, date, size', /BIO 111/.test(card) && /100 Level/.test(card) && /Sciences/.test(card) && /Biochemistry/.test(card) && /Rita Rep/.test(card) && /PDF · \d/.test(card), card);
  await clickText(page, '.lib-card button', /View/); await sleep(500);
  check('guest "View" asks to sign in (documents need an account)', !!(await page.$('[aria-label="Sign in to continue"]')));
  await clickText(page, 'button', /Not now/); await sleep(400);
  const anon = await apiAs(null, '/library/documents/'); const id = anon.data.results[0].id;
  check('API: guests can list metadata', anon.status === 200);
  check('API: guests cannot open the PDF itself', (await apiAs(null, `/library/documents/${id}/file/`)).status === 401);
  check('API: guests cannot upload', (await apiAs(null, '/library/documents/', { method: 'POST', body: new FormData() })).status === 401);
  check('library guest: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 300));
  await page.close();
}
{ // ── signed-in student ──
  const page = await lib({ as: 'plain', path: '/library' });
  check('ordinary student sees no Upload button', !/Upload PDF/.test(await txt(page)));
  await page.click('.folder'); await sleep(800);
  await clickText(page, '.lib-card button', /View/); await page.waitForSelector('.lib-viewer iframe', { timeout: 8000 });
  const src = await page.$eval('.lib-viewer iframe', e => e.src);
  const mime = await page.evaluate(async (s) => { const b = await (await fetch(s)).blob(); return [b.type, b.size]; }, src);
  check('View PDF opens an authenticated blob that really is a PDF', src.startsWith('blob:') && mime[0] === 'application/pdf' && mime[1] > 100, JSON.stringify(mime));
  await snap(page, 'library-viewer');
  await page.keyboard.press('Escape'); await sleep(400);
  check('Escape closes the viewer', !(await page.$('.lib-viewer')));
  const docs = (await apiAs('plain', '/library/documents/')).data.results; const d = docs[0];
  const dl = await fetch(`${API}/library/documents/${d.id}/file/?download=1`, { headers: { Authorization: `Bearer ${(await tokens('plain')).access}` } });
  const bytes = Buffer.from(await dl.arrayBuffer());
  check('download returns the exact PDF as an attachment', dl.status === 200 && /attachment/.test(dl.headers.get('content-disposition')) && bytes.slice(0, 5).toString() === '%PDF-' && dl.headers.get('x-content-type-options') === 'nosniff');
  check('student cannot upload via the API (403) and nothing is created', (await (async () => { const f = new FormData(); f.append('title', 'Sneaky doc'); f.append('course', String(d.course)); f.append('file', new Blob([bytes], { type: 'application/pdf' }), 's.pdf'); return apiAs('plain', '/library/documents/', { method: 'POST', body: f }); })()).status === 403 && (await apiAs('plain', '/library/documents/?q=Sneaky')).data.count === 0);
  check('student cannot delete or edit others’ documents', (await apiAs('plain', `/library/documents/${d.id}/`, { method: 'DELETE' })).status === 403 && (await apiAs('plain', `/library/documents/${d.id}/`, { method: 'PATCH', body: { title: 'hax' } })).status === 403);
  await page.close();
}
{ // ── class representative ──
  const page = await lib({ as: 'rep', path: '/library' });
  check('class representative sees the Upload button', /Upload PDF/.test(await txt(page)));
  await clickText(page, '.lib-head button', /Upload PDF/); await page.waitForSelector('.upl'); await sleep(500);
  const chips = await page.$$eval('.up-scope .chip', e => e.map(x => x.textContent).join('|'));
  check('upload dialog shows the rep’s own class (from the server grant)', /100 Level\|Sciences\|Biochemistry/.test(chips), chips);
  const opts = await page.$$eval('#up-course option', o => o.map(x => x.textContent));
  check('only courses of the rep’s class are offered', opts.some(o => /BIO 111/.test(o)) && opts.some(o => /BIO 112/.test(o)) && !opts.some(o => /BIO 211|PHY 101|MEE|CSC/.test(o)), opts.join('|'));
  await snap(page, 'upload-panel');
  const input = await page.$('input[type=file]');
  await input.uploadFile('/tmp/n.txt'); await sleep(300);
  check('non-PDF rejected client-side', /Only PDF files/.test(await txt(page)));
  await clickText(page, '.up-actions button', /Upload PDF/); await sleep(300);
  check('submit without course/file shows field errors', /Choose a course/.test(await txt(page)));
  await input.uploadFile('/tmp/fake.pdf'); await sleep(300);
  await page.select('#up-course', await page.$$eval('#up-course option', o => o.find(x => /BIO 111/.test(x.textContent)).value));
  await clickText(page, '.up-actions button', /Upload PDF/); await sleep(1500);
  check('an executable renamed .pdf is refused by the server; dialog stays; Retry offered', /not a valid pdf/i.test(await txt(page)) && !!(await page.$('.upl')) && /Try again/.test(await page.$eval('.up-actions button[type=submit]', e => e.textContent)));
  await input.uploadFile('/tmp/ok.pdf'); await sleep(300); await fill(page, '#up-title', 'BIO 111 Mid-semester Test 2026');
  const before = (await apiAs('rep', '/library/documents/')).data.count;
  await page.evaluate(() => { const b = document.querySelector('.up-actions button[type=submit]'); b.click(); b.click(); });
  await sleep(2500);
  check('valid PDF uploads; dialog closes', !(await page.$('.upl')));
  const after = (await apiAs('rep', '/library/documents/')).data.count;
  check('double-click created exactly one document', after === before + 1, `${before} → ${after}`);
  check('the BIO 111 folder now shows 3 files', await waitText(page, /BIO 111/) && /3 files/.test(await page.$$eval('.folder', f => f.find(x => /BIO 111/.test(x.innerText)).innerText)));
  const stored = readdirSync('/tmp/cc_private_e2e/library/pdfs');
  const doc = (await apiAs('rep', '/library/documents/?q=Mid-semester')).data.results[0];
  check('the file is persisted in private storage under a random name', stored.some(f => /^[0-9a-f]{32}\.pdf$/.test(f)) && !JSON.stringify(doc).includes('library/pdfs'), stored.join());
  check('can_manage is true for the rep’s own class documents and false for students', (await apiAs('rep', '/library/documents/?mine=1&level=100')).data.results.every(x => x.can_manage) && (await apiAs('plain', '/library/documents/?level=100')).data.results.every(x => !x.can_manage));
  // scope enforcement through the API
  const f = (course) => { const x = new FormData(); x.append('title', 'Out of scope'); x.append('course', String(course)); x.append('file', new Blob([Buffer.from(require_pdf())], { type: 'application/pdf' }), 'a.pdf'); return x; };
  function require_pdf() { return execSync("python3 -c \"import sys;sys.stdout.buffer.write(open('/tmp/ok.pdf','rb').read())\""); }
  const courses = (await apiAs('rep', '/library/courses/')).data; const other = courses.find(c => c.code === 'BIO 211'); const phy = courses.find(c => c.code === 'PHY 101');
  const r1 = await apiAs('rep', '/library/documents/', { method: 'POST', body: f(other.id) }); const r2 = await apiAs('rep', '/library/documents/', { method: 'POST', body: f(phy.id) });
  check('rep cannot upload to another level (400)', r1.status === 400); check('rep cannot upload to another department (400)', r2.status === 400);
  await clickText(page, '.lib-head button', /Upload PDF/); await page.waitForSelector('.upl'); await sleep(300);
  await clickText(page, '.upl .auth-link', /Add a course/); await page.type('.up-newcourse input:nth-child(1)', 'BIO 113'); await page.type('.up-newcourse input:nth-child(2)', 'Lab Techniques');
  await clickText(page, '.up-newcourse button', /^Save$/); await sleep(1000);
  check('rep can add a course for their own class and it is selected', /BIO 113/.test(await page.$eval('#up-course', e => e.selectedOptions[0].textContent)));
  await page.keyboard.press('Escape'); await sleep(400);
  check('Escape closes the upload dialog', !(await page.$('.upl')));
  check('rep: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 300));
  await page.close();
}
for (const [theme, w, h] of [['light', 375, 800], ['dark', 375, 800], ['light', 768, 1000], ['dark', 1280, 800]]) {
  const page = await lib({ as: 'rep', path: '/library', theme, w, h });
  check(`library ${theme} ${w}px: no horizontal overflow`, await noHScroll(page));
  const small = await page.$$eval('.folder, .lib-filterbox select, .lib-filterbox input, .lib-filterbox button, .lib-head button', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).length);
  check(`library ${theme} ${w}px: controls ≥ 40px`, small === 0, `${small}`);
  await snap(page, `library-${theme}-${w}`);
  if (w === 375 && theme === 'light') {
    await clickText(page, '.lib-head button', /Upload PDF/); await page.waitForSelector('.upl'); await sleep(500);
    const fits = await page.evaluate(() => { const m = document.querySelector('.modal').getBoundingClientRect(); return m.left >= 0 && m.right <= innerWidth && m.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth; });
    check('upload panel fits a phone', fits); await snap(page, 'upload-mobile');
  }
  await page.close();
}
await browser.close(); process.exit(summary() ? 1 : 0);
