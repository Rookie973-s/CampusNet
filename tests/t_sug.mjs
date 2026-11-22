import { fill, launch, newPage, check, summary, sleep, txt, waitText, clickText, snap, noHScroll, apiAs } from './lib.mjs';
const browser = await launch();
const nextBtn = (page) => clickText(page, '.sug-actions button', /Continue/);
{
  const page = await newPage(browser, { path: '/apply' }); await page.waitForSelector('.sug-card');
  const t = await txt(page);
  check('page is titled "Apply for SUG Access"; no SUD / staff-access wording', /Apply for SUG Access/.test(t) && !/SUD/.test(t) && !/Staff Access/i.test(t));
  check('no Microsoft sign-in and no forgot-password link', !/Microsoft|Forgot|password/i.test(t) && !(await page.$('.sug-card [aria-label*="Microsoft" i]')));
  check('email label is "Your Email" (not University Email)', /Your Email/.test(t) && !/University Email/i.test(t));
  check('4 steps are shown: Personal, Academic, Statement, Review', (await page.$$eval('.sug-steps em', e => e.map(x => x.textContent))).join('|') === 'Personal|Academic|Statement|Review');
  await snap(page, 'sug-step1-desktop');
  await nextBtn(page); await sleep(200);
  check('step 1 validates required fields and email', (await page.$$('.field-err')).length >= 3 && /Enter your email/.test(await txt(page)));
  await page.type('#sug-fname', 'Plain'); await page.type('#sug-lname', 'Student'); await page.type('#sug-email', 'not-an-email'); await nextBtn(page); await sleep(200);
  check('invalid email is rejected client-side', /doesn't look right/.test(await txt(page)));
  await fill(page, '#sug-email', 'plain@x.edu'); await page.type('#sug-phone', 'abc'); await nextBtn(page); await sleep(200);
  check('invalid phone is rejected', /valid phone/.test(await txt(page)));
  await fill(page, '#sug-phone', '08031234567'); await nextBtn(page); await sleep(400);
  check('moves to Academic step', /ID number/.test(await txt(page)));
  await nextBtn(page); await sleep(200);
  check('step 2 validates', (await page.$$('.field-err')).length === 3);
  await page.type('#sug-staffId', 'U22CS0003'); await page.select('#sug-dept', 'Computing'); await page.type('#sug-role', 'Public Relations Officer'); await nextBtn(page); await sleep(400);
  await page.type('#sug-bio', 'short'); await nextBtn(page); await sleep(200);
  check('statement needs real sentences (length guidance shown)', (await page.$$('.field-err')).length === 2 && /at least 20/.test(await txt(page)));
  await snap(page, 'sug-step3-desktop');
  await fill(page, '#sug-bio', 'I have served as class representative for two years.');
  await page.type('#sug-why', 'I want students to get verified answers quickly.'); await nextBtn(page); await sleep(400);
  const review = await txt(page);
  check('review step summarises everything entered', /Plain Student/.test(review) && /plain@x\.edu/.test(review) && /Public Relations Officer/.test(review) && /Submitting does not grant access/.test(review));
  await snap(page, 'sug-review-desktop');
  await clickText(page, '.sug-actions button', /Submit application/); await waitText(page, /Application received/);
  check('submission shows a confirmation', /Application received/.test(await txt(page)));
  const list = await apiAs('boss', '/applications/?status=pending');
  const rows = list.data.results || list.data;
  check('application is stored as pending in the database', rows.length === 1 && rows[0].email === 'plain@x.edu' && rows[0].status === 'pending', JSON.stringify(rows).slice(0, 200));
  const pm = (await apiAs('plain', '/auth/me/')).data;
  check('submitting did NOT grant any access', pm.role === 'student' && pm.is_verified_staff === false);
  check('students cannot read or approve applications', (await apiAs('plain', '/applications/')).status === 403 && (await apiAs('plain', `/applications/${rows[0].id}/approve/`, { method: 'POST' })).status === 403 && (await apiAs(null, `/applications/${rows[0].id}/approve/`, { method: 'POST' })).status === 401);
  const ok = await apiAs('boss', `/applications/${rows[0].id}/approve/`, { method: 'POST', body: { note: 'Welcome' } });
  check('administrator approves → status approved, account found', ok.status === 200 && ok.data.status === 'approved' && ok.data.account_found === true);
  const pm2 = (await apiAs('plain', '/auth/me/')).data;
  check('approval grants the verified role only after the decision', pm2.role === 'staff' && pm2.is_verified_staff === true && pm2.title === 'Public Relations Officer');
  const notes = (await apiAs('plain', '/notifications/')).data; const arr = notes.results || notes;
  check('applicant is notified in-app', arr.some(n => /SUG access application approved/.test(n.text)));
  check('a decided application cannot be decided twice', (await apiAs('boss', `/applications/${rows[0].id}/reject/`, { method: 'POST' })).status === 409);
  check('SUG form: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 300));
  await page.close();
}
{ // server-side validation surfaces next to the field
  const page = await newPage(browser, { path: '/apply' }); await page.waitForSelector('.sug-card');
  await page.type('#sug-fname', 'A'); await page.type('#sug-lname', 'B'); await page.type('#sug-email', 'dup@x.edu'); await nextBtn(page); await sleep(300);
  await page.type('#sug-staffId', 'ID1'); await page.select('#sug-dept', 'Law'); await page.type('#sug-role', 'Officer'); await nextBtn(page); await sleep(300);
  await page.type('#sug-bio', 'A sufficiently long biography text here.'); await page.type('#sug-why', 'A sufficiently long reason text here.'); await nextBtn(page); await sleep(300);
  await clickText(page, '.sug-actions button', /Submit application/); await waitText(page, /Application received/);
  const page2 = await newPage(browser, { path: '/apply' }); await page2.waitForSelector('.sug-card');
  await page2.type('#sug-fname', 'A'); await page2.type('#sug-lname', 'B'); await page2.type('#sug-email', 'DUP@x.edu'); await nextBtn(page2); await sleep(300);
  await page2.type('#sug-staffId', 'ID1'); await page2.select('#sug-dept', 'Law'); await page2.type('#sug-role', 'Officer'); await nextBtn(page2); await sleep(300);
  await page2.type('#sug-bio', 'A sufficiently long biography text here.'); await page2.type('#sug-why', 'A sufficiently long reason text here.'); await nextBtn(page2); await sleep(300);
  await clickText(page2, '.sug-actions button', /Submit application/); await sleep(1200);
  check('duplicate pending application: server error appears on the Email field (jumps back to step 1)', /already awaiting review/.test(await txt(page2)) && /Your Email/.test(await txt(page2)));
  await page.close(); await page2.close();
}
for (const [theme, w, h] of [['light', 375, 800], ['dark', 375, 800], ['light', 768, 1000], ['dark', 1280, 800]]) {
  const page = await newPage(browser, { path: '/apply', theme, w, h }); await page.waitForSelector('.sug-card'); await sleep(400);
  check(`SUG form ${theme} ${w}px: no horizontal overflow`, await noHScroll(page));
  const small = await page.$$eval('.sug-card input, .sug-card button, .sug-card select', els => els.filter(e => e.getBoundingClientRect().height < 40 && e.getBoundingClientRect().height > 0).length);
  check(`SUG form ${theme} ${w}px: touch targets ≥ 40px`, small === 0, `${small} small`);
  await snap(page, `sug-${theme}-${w}`); await page.close();
}
{ // SUG directory is public but doesn't leak contact details to guests
  const page = await newPage(browser, { path: '/sug' }); await page.waitForSelector('.sc, .staff-wrap', { timeout: 6000 }).catch(() => {}); await sleep(600);
  check('SUG page is titled and public', /Meet the SUG/.test(await txt(page)));
  const g = await apiAs(null, '/staff/'); const rows = g.data.results || g.data;
  check('guest staff API response has no email or phone', rows.length > 0 && rows.every(r => !('email' in r) && !('phone' in r)));
  const s = await apiAs('plain', '/staff/'); const sr = s.data.results || s.data;
  check('signed-in users still get contact details', sr.every(r => 'email' in r));
  await snap(page, 'sug-page'); await page.close();
}
await browser.close(); process.exit(summary() ? 1 : 0);
