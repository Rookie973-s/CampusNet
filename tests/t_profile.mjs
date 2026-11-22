import { fill, launch, newPage, check, summary, sleep, txt, waitText, clickText, snap, noHScroll, apiAs } from './lib.mjs';
const browser = await launch();
const me = async (u) => (await apiAs(u, '/auth/me/')).data;

// ── profile (plain student) ──
{
  const page = await newPage(browser, { as: 'plain', path: '/profile' }); await waitText(page, /Hello, Plain/);
  const m = await me('plain');
  const t = await txt(page);
  check('personalised greeting uses the real first name', /Hello, Plain!/.test(t));
  const stats = await page.$$eval('.pf-stat', e => e.map(x => [x.querySelector('strong').textContent, x.querySelector('span').textContent]));
  check('Answers Given + Questions Posted come from the database', stats[0][0] == m.answers && stats[0][1] === 'Answers Given' && stats[1][0] == m.questions && stats[1][1] === 'Questions Posted', JSON.stringify(stats) + JSON.stringify([m.answers, m.questions]));
  await page.waitForSelector('.act-svg', { timeout: 5000 });
  const act = (await apiAs('plain', '/auth/me/activity/?days=84')).data;
  const total = act.series.reduce((s, d) => s + d.total, 0);
  const label = await page.$eval('.act-svg', e => e.getAttribute('aria-label'));
  check('activity chart total equals the real activity (no invented data)', total > 0 && label.includes(`${total} posts`), `${label} vs ${total}`);
  check('contribution grid has one cell per day', (await page.$$('.act-cells .ac')).length === 84);
  const cellSum = await page.$$eval('.act-cells .ac', e => e.map(x => x.title).filter(x => !/: 0 posts/.test(x)).length);
  check('only days with real activity are highlighted', cellSum === act.series.filter(d => d.total > 0).length, `${cellSum}`);
  check('chart has an accessible table fallback', (await page.$$('table.sr-only tbody tr')).length === 12);
  await snap(page, 'profile-light');
  check('settings: matric number is locked and email is read-only', await (async () => { await clickText(page, '[role=tab]', /Settings/); await sleep(200); return page.$eval('#pf-mt', e => e.disabled) && await page.$eval('#pf-em', e => e.disabled); })());
  await fill(page, '#pf-bio', 'Updated from the profile page');
  await clickText(page, 'button', /Save changes/); await waitText(page, /Settings saved/);
  check('saving settings persists on the server', (await me('plain')).bio === 'Updated from the profile page');
  const hack = await apiAs('plain', '/auth/me/', { method: 'PATCH', body: { matric_number: 'U99ZZ9999', role: 'admin', is_verified_staff: true, staff_id: 'X', title: 'Prof' } });
  const after = await me('plain');
  check('server refuses a changed matric number', hack.status === 400);
  check('role / verification / staff fields cannot be self-assigned', after.role === 'student' && after.is_verified_staff === false && after.matric_number === 'U22CS0003');
  await clickText(page, '[role=tab]', /Questions/); await sleep(600);
  const rows = await page.$$eval('.pf-row-main strong', e => e.map(x => x.textContent));
  check('Questions tab lists my questions', rows.some(r => /binary search tree/.test(r)) && rows.some(r => /old question/.test(r)));
  const delBtns = await page.$$eval('.pf-row', e => e.map(r => ({ t: r.querySelector('strong').textContent, del: !!r.querySelector('[aria-label^="Delete"]') })));
  check('delete shown only for the post inside its 24-hour window', delBtns.find(r => /binary/.test(r.t)).del && !delBtns.find(r => /old question/.test(r.t)).del, JSON.stringify(delBtns));
  await page.click('.pf-row [aria-label^="Delete"]'); await page.waitForSelector('[role=dialog]'); await sleep(250);
  await clickText(page, '[role=dialog] button', /^Delete post$/); await sleep(1000);
  const left = await page.$$eval('.pf-row-main strong', e => e.map(x => x.textContent));
  check('deleting from the profile removes it and updates the count', !left.some(r => /binary/.test(r)) && (await page.$$eval('.pf-stat strong', e => e.map(x => x.textContent)))[1] == m.questions - 1);
  await apiAs('plain', `/questions/${(await apiAs('plain', '/questions/')).data.results.find(x => /Registration/.test(x.title)).id}/bookmark/`, { method: 'POST' });
  await clickText(page, '[role=tab]', /Saved/); await sleep(700);
  check('Saved tab shows saved posts', /Registration deadline/.test(await txt(page)));
  await clickText(page, '[role=tab]', /Uploads/); await sleep(500);
  check('Uploads tab explains who can upload', /limited to class representatives/.test(await txt(page)));
  check('profile: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 200));
  await page.close();
}
{ // dark + phone
  const page = await newPage(browser, { as: 'plain', path: '/profile', theme: 'dark', w: 375, h: 800 }); await waitText(page, /Hello, Plain/); await sleep(500);
  check('profile phone: no horizontal overflow', await noHScroll(page));
  await snap(page, 'profile-dark-mobile'); await page.close();
}
{ const page = await newPage(browser, { as: 'rep', path: '/profile' }); await waitText(page, /Hello, Rita/);
  check('empty activity shows an honest empty state', /No activity yet/.test(await txt(page)) && !(await page.$('.act-svg')));
  check('class rep badge shown from the real grant', /Class representative/.test(await txt(page)));
  await clickText(page, '[role=tab]', /Uploads/); await sleep(600);
  check("rep's Uploads tab lists their documents", /BIO 111/.test(await txt(page)));
  await page.close(); }
{ const page = await newPage(browser, { path: '/profile' });
  check('guest on /profile is asked to sign in (no private data)', /Sign in to see your profile/.test(await txt(page)));
  await page.close(); }

// ── language: English / Hausa ──
{
  const page = await newPage(browser, { as: 'plain', path: '/profile' }); await waitText(page, /Hello, Plain/);
  check('English is selected by default', await page.$eval('.pf-lang button[aria-checked="true"]', e => /English/.test(e.textContent)));
  await clickText(page, '.pf-lang button', /Hausa/); await sleep(500);
  const t = await txt(page);
  check('interface switches to Hausa (not just the label)', /Sannu, Plain!/.test(t) && /Harshe/.test(t) && /Amsoshin da Ka Bayar/.test(t));
  check('nav labels are translated', (await page.$$eval('.tn-link', e => e.map(x => x.textContent))).join('|') === 'Gida|Tambayoyi|Ɗakin Karatu|SUG|Ni');
  check('html lang attribute follows the language', await page.evaluate(() => document.documentElement.lang) === 'ha');
  check('language saved on the account', (await me('plain')).language === 'ha');
  await page.reload({ waitUntil: 'networkidle0' }); await waitText(page, /Sannu, Plain/);
  check('Hausa preference survives a reload', /Sannu, Plain/.test(await txt(page)));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle0' });
  check('homepage hero is in Hausa', /Cibiyar Sadarwa ta Hukuma/.test(await txt(page)));
  await page.goto('http://127.0.0.1:4173/library', { waitUntil: 'networkidle0' }); await sleep(500);
  check('library is in Hausa', /Ɗakin Karatun PDF/.test(await txt(page)));
  await page.goto('http://127.0.0.1:4173/profile', { waitUntil: 'networkidle0' }); await waitText(page, /Sannu/);
  await clickText(page, '.pf-lang button', /English/); await sleep(400);
  check('switching back to English works and is saved', /Hello, Plain/.test(await txt(page)) && (await me('plain')).language === 'en');
  await page.close();
}
{ // a guest can choose Hausa too (stored locally), and it is applied to the sign-in dialog
  const page = await newPage(browser, { path: '/', lang: 'ha' }); await sleep(500);
  check('guest preference (Hausa) applies on the homepage', /Duba Tambayoyi/.test(await txt(page)));
  await clickText(page, '.tn-btn--ghost', /Shiga/); await page.waitForSelector('.auth-outer'); await sleep(500);
  check('sign-in dialog is translated', /Barka da Dawowa/.test(await txt(page)));
  await page.close();
}
await browser.close(); process.exit(summary() ? 1 : 0);
