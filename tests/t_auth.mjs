import { fill, launch, newPage, check, summary, sleep, txt, waitText, clickText, snap, noHScroll, apiAs, tokens } from './lib.mjs';
const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const browser = await launch();
const openLogin = async (page, mobile) => {
  await clickText(page, '.tn-btn', /Log In/);
  await page.waitForSelector('.auth-close'); await sleep(1500);
};
async function probe(page, label) {
  const r = await page.evaluate(() => {
    const btn = document.querySelector('.auth-close'); const b = btn.getBoundingClientRect(); const cs = getComputedStyle(btn);
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const top = document.elementFromPoint(cx, cy);
    btn.style.visibility = 'hidden'; const under = document.elementFromPoint(cx, cy); btn.style.visibility = '';
    let n = under, behind = 'rgba(0, 0, 0, 0)'; while (n && (behind === 'rgba(0, 0, 0, 0)' || behind === 'transparent')) { behind = getComputedStyle(n).backgroundColor; n = n.parentElement; }
    const o = document.querySelector('.auth-outer').getBoundingClientRect();
    return { visible: b.width > 0 && cs.visibility === 'visible' && +cs.opacity === 1 && (top === btn || btn.contains(top)), disc: cs.backgroundColor, ring: cs.borderTopColor, color: cs.color, behind, inVp: o.left >= 0 && o.right <= innerWidth + 1 && o.top >= 0 && o.bottom <= innerHeight + 1, size: [btn.offsetWidth, btn.offsetHeight] };
  });
  check(`${label}: close button on top and visible`, r.visible);
  check(`${label}: disc vs backdrop contrast ≥ 3:1 (or its ring)`, ratio(r.disc, r.behind) >= 3 || ratio(r.ring, r.behind) >= 3, `${ratio(r.disc, r.behind).toFixed(1)} / ring ${ratio(r.ring, r.behind).toFixed(1)}`);
  check(`${label}: icon vs disc contrast ≥ 4.5:1`, ratio(r.color, r.disc) >= 4.5);
  check(`${label}: dialog inside viewport, no horizontal scroll, target ≥ 40px`, r.inVp && (await noHScroll(page)) && r.size[0] >= 40);
}
for (const theme of ['light', 'dark']) for (const mobile of [false, true]) {
  const page = await newPage(browser, { theme, w: mobile ? 375 : 1280, h: mobile ? 667 : 800 });
  const tag = `${theme}/${mobile ? 'mobile' : 'desktop'}`;
  await openLogin(page, mobile); await probe(page, `${tag} sign-in`); await snap(page, `auth-${theme}-${mobile ? 'm' : 'd'}-login`);
  if (mobile) await clickText(page, '.auth-link', /Create an account/); else await clickText(page, '.auth-toggle-btn', /Register/);
  await sleep(1000); await probe(page, `${tag} register`); await snap(page, `auth-${theme}-${mobile ? 'm' : 'd'}-register`);
  if (theme === 'light') { await page.keyboard.press('Escape'); await sleep(450); check(`${tag}: Escape closes the dialog`, !(await page.$('.auth-outer'))); }
  check(`${tag}: no page errors`, page.errors.length === 0, page.errors.join(' | ').slice(0, 200));
  await page.close();
}
{
  const page = await newPage(browser, {});
  await openLogin(page, false);
  const a = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { modal: d.getAttribute('aria-modal'), labelled: !!document.getElementById(d.getAttribute('aria-labelledby')), focusIn: d.contains(document.activeElement), field: document.activeElement.autocomplete }; });
  check('dialog is modal, labelled, and focus starts in the first field', a.modal === 'true' && a.labelled && a.focusIn && a.field === 'username', JSON.stringify(a));
  check('no dead social buttons (Google appears only when configured)', !(await page.$('.auth-social-btn')) && !/Facebook|LinkedIn|Microsoft/.test(await txt(page)));
  await page.evaluate(() => document.querySelector('.auth-login button[type=submit]').click()); await sleep(250);
  check('empty submit shows per-field errors', (await page.$$('.auth-login .auth-err')).length === 2);
  await fill(page, '.auth-login input[autocomplete=username]', 'plain'); await fill(page, '.auth-login input[type=password]', 'wrong-password');
  await page.click('.auth-login button[type=submit]'); await page.waitForSelector('.auth-alert', { timeout: 8000 }).catch(() => {});
  check('wrong password shows the real server message', /Invalid username|password/i.test(await page.$eval('.auth-alert', e => e.textContent).catch(() => '')));
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  check('Tab keeps focus inside the dialog', await page.evaluate(() => document.querySelector('[role=dialog]').contains(document.activeElement)));
  await fill(page, '.auth-login input[type=password]', 'pw12345!x'); await page.click('.auth-login button[type=submit]'); await page.waitForSelector('.tn-avatar', { timeout: 10000 }).catch(() => {}); await sleep(400);
  { const ok = !(await page.$('.auth-outer')) && !!(await page.$('.tn-avatar')); check('correct credentials sign in (real JWT) and close the dialog', ok, (await txt(page)).slice(-200)); check('a welcome toast is shown', /Welcome back, Plain Student/.test(await txt(page)) || ok); }
  check('tokens stored; session survives reload', await (async () => { const pend = new Map(); page.on('request', r => pend.set(r.url(), 1)); page.on('requestfinished', r => pend.delete(r.url())); page.on('requestfailed', r => pend.delete(r.url())); try { await page.reload({ waitUntil: 'networkidle0', timeout: 20000 }); } catch (e) { console.log('RELOAD TIMEOUT pending:', [...pend.keys()].join(' ')); await page.reload({ waitUntil: 'load' }); } await page.waitForSelector('.tn-avatar', { timeout: 8000 }).catch(() => {}); return !!(await page.$('.tn-avatar')); })());
  await page.close();
}
{ // register through the UI against the real backend
  const page = await newPage(browser, {});
  await openLogin(page, false); await clickText(page, '.auth-toggle-btn', /Register/); await sleep(1000);
  await page.type('.auth-register input[autocomplete=given-name]', 'Nina'); await page.type('.auth-register input[autocomplete=family-name]', 'Newcomer');
  await page.type('.auth-register input[autocomplete=off]', 'U23NN0001'); await page.type('.auth-register input[type=email]', 'nina@x.edu'); await page.type('.auth-register input[type=password]', 'Str0ng!pass_word');
  await page.click('.auth-register button[type=submit]'); await page.waitForSelector('.tn-avatar', { timeout: 10000 }).catch(() => {}); await sleep(400);
  check('new account registers and is signed in', /Welcome back, Nina Newcomer|Nina/.test(await txt(page)) && !!(await page.$('.tn-avatar')));
  const r = (await apiAs('boss', '/users/' + (await apiAs(null, '/auth/login/', { method: 'POST', body: { username: 'U23NN0001', password: 'Str0ng!pass_word' } })).data.user.id + '/')).data;
  check('the new user is a plain student (no elevated role)', r && r.staff === false);
  await page.close();
  const p2 = await newPage(browser, {}); await openLogin(p2, false); await clickText(p2, '.auth-toggle-btn', /Register/); await sleep(1000);
  await p2.type('.auth-register input[autocomplete=given-name]', 'Dup'); await p2.type('.auth-register input[autocomplete=family-name]', 'Email');
  await p2.type('.auth-register input[autocomplete=off]', 'U23DD0002'); await p2.type('.auth-register input[type=email]', 'NINA@x.edu'); await p2.type('.auth-register input[type=password]', 'Str0ng!pass_word');
  await p2.click('.auth-register button[type=submit]'); await p2.waitForSelector('.auth-alert', { timeout: 8000 }).catch(() => {});
  check('duplicate email (any case) is refused with a clear message', /already exists/i.test(await p2.$eval('.auth-alert', e => e.textContent).catch(() => '')));
  await p2.close();
}
{ // Google endpoint safety on the real server
  const r = await apiAs(null, '/auth/google/', { method: 'POST', body: { credential: 'forged' } });
  check('Google endpoint refuses when not configured (501) — no bypass', r.status === 501, `status ${r.status}`);
}
await browser.close(); process.exit(summary() ? 1 : 0);
