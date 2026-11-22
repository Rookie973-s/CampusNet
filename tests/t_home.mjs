import { launch, newPage, check, summary, sleep, txt, waitText, clickText, snap, noHScroll, apiAs } from './lib.mjs';
const browser = await launch();

// ── first visit → landing page ──
{
  const page = await newPage(browser, { seen: false, path: '/' });
  check('first-time guest is sent to /welcome', page.url().endsWith('/welcome'), page.url());
  const t = await txt(page);
  check('landing shows heading, supporting text and 3 entry options', /Your Campus\. Your Community\. Your Connection\./.test(t) && /Discover campus conversations/.test(t) && /Log In/.test(t) && /Sign Up/.test(t) && /Continue as Guest/.test(t));
  await snap(page, 'landing-desktop');
  await clickText(page, 'button', /Continue as Guest/); await sleep(500);
  check('Continue as Guest goes home and remembers', page.url() === 'http://127.0.0.1:4173/' || page.url().endsWith(':4173/'), page.url());
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle0' });
  check('guest is not sent to /welcome again', !page.url().endsWith('/welcome'));
  await page.close();
}
{
  const page = await newPage(browser, { seen: false, path: '/', w: 375, h: 800 });
  check('landing mobile: fits viewport without horizontal scroll', await noHScroll(page));
  await snap(page, 'landing-mobile');
  await clickText(page, 'button', /Log In/); await page.waitForSelector('.auth-outer', { timeout: 4000 }).catch(() => {});
  check('landing Log In opens the sign-in dialog', !!(await page.$('.auth-outer')));
  await page.close();
}
{
  const page = await newPage(browser, { as: 'plain', seen: false, path: '/welcome' }); await sleep(600);
  check('signed-in user is not kept on /welcome', !page.url().endsWith('/welcome'), page.url());
  await page.close();
}

// ── homepage (guest) ──
for (const [theme, w, h] of [['light', 1280, 860], ['dark', 1280, 860], ['light', 768, 1000], ['light', 375, 800], ['dark', 375, 800]]) {
  const page = await newPage(browser, { theme, w, h });
  const tag = `home ${theme} ${w}px`;
  await sleep(800);
  const t = await txt(page);
  check(`${tag}: hero heading + supporting copy`, /The Official Network Hub for ATBU Students/.test(t) && /Ask questions, get verified answers from lecturers and SUG officials, and connect with the ATBU community\./.test(t));
  check(`${tag}: both hero actions present`, /Browse Questions/.test(t) && /Meet the SUG/.test(t));
  check(`${tag}: old sections removed`, !/Browse by Faculty|Are you ATBU Staff|Why ATBU Connect|\bDiscover\b/.test(t) && !(await page.$('.fab-ask')));
  check(`${tag}: no horizontal overflow`, await noHScroll(page));
  const inside = await page.evaluate(() => { const vw = innerWidth; return ['.hero-copy', '.hero h1', '.hero-actions', '.fc', '.fc-viewport', '.tn'].every(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1; }); });
  check(`${tag}: hero text, buttons and carousel all sit inside the screen (not just clipped)`, inside);
  check(`${tag}: Log In and Sign Up both reachable in the nav`, await page.evaluate(() => [...document.querySelectorAll('.tn-btn')].filter(b => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().right <= innerWidth).map(b => b.textContent).join('|') === 'Log In|Sign Up'));
  check(`${tag}: no notification bell for guests`, !(await page.$('button[aria-label^="Notifications"]')));
  await snap(page, `home-${theme}-${w}`); if (w === 1280 && theme === 'light') await snap(page, 'home-light-full', true);
  if (w >= 900) {
    const links = await page.$$eval('.tn-link', e => e.map(x => x.textContent));
    check(`${tag}: nav uses the real destinations`, links.join('|') === 'Home|Feed|Library|SUG|Me', links.join('|'));
    check(`${tag}: Log In and Sign Up in the nav`, (await page.$$eval('.tn-btn', e => e.map(x => x.textContent))).join('|') === 'Log In|Sign Up');
    check(`${tag}: single nav system (no bar header beside hero nav)`, (await page.$$('header.tn')).length === 1);
  } else check(`${tag}: bottom navigation visible on small screens`, !!(await page.$eval('.bnav', e => getComputedStyle(e).display !== 'none').catch(() => false)));
  check(`${tag}: no page errors`, page.errors.length === 0, page.errors.join(' | ').slice(0, 200));
  await page.close();
}

// ── carousel + faculty strip ──
{
  const page = await newPage(browser, { w: 1280, h: 860 });
  const slides = await page.$$eval('.fc-card', e => e.length);
  check('feature carousel has the 4 real feature cards', slides === 4);
  const active = () => page.$$eval('.fc-card', els => els.findIndex(e => e.classList.contains('on')));
  check('carousel starts on slide 1', (await active()) === 0);
  await page.click('.fc-arrow[aria-label="Next"]'); await sleep(300);
  check('Next arrow advances', (await active()) === 1);
  await page.click('.fc-dots button:nth-child(4)'); await sleep(300);
  check('dots jump to a slide', (await active()) === 3);
  await page.focus('.fc'); await page.keyboard.press('ArrowLeft'); await sleep(200);
  check('keyboard arrows work', (await active()) === 2);
  const aria = await page.$eval('.fc', e => [e.getAttribute('role'), e.getAttribute('aria-roledescription')]);
  check('carousel is exposed as a labelled carousel region', aria[0] === 'region' && aria[1] === 'carousel');
  const hiddenInactive = await page.$$eval('.fc-card:not(.on)', e => e.every(x => x.getAttribute('aria-hidden') === 'true'));
  check('inactive slides are hidden from assistive tech', hiddenInactive);
  // autoplay pauses while hovered
  await page.click('.fc-dots button:nth-child(1)'); await sleep(900); await page.hover('.fc-ctrl'); const before = await active(); await sleep(6800);
  const after = await active();
  check('autoplay stays paused while hovering', before === after, `before ${before} after ${after}`);
  await page.mouse.move(5, 5); await page.evaluate(() => document.activeElement.blur()); await sleep(6800);
  check('autoplay resumes after the pointer leaves', (await active()) !== before);
  await page.close();
}
{
  const page = await newPage(browser, { reducedMotion: true, w: 1280, h: 860 });
  await sleep(6800);
  check('reduced motion: carousel does not autoplay', (await page.$$eval('.fc-card', els => els.findIndex(e => e.classList.contains('on')))) === 0);
  check('reduced motion: faculty strip is a static scroller, not an animation', !(await page.$('.fs-view.anim')));
  await page.close();
}
{
  const page = await newPage(browser, { w: 1280, h: 860 });
  await page.waitForSelector('.fs-card', { timeout: 6000 });
  const shown = await page.$$eval('.fs-set:first-child .fs-card .fs-name', e => e.map(x => x.textContent));
  const real = (await apiAs(null, '/departments/')).data; const names = (real.results || real).map(d => d.name);
  check('faculty strip shows exactly the real faculties from the API', shown.slice(0, names.length).join('|') === names.join('|') && shown.length % names.length === 0, `${shown} vs ${names}`);
  const exposed = await page.$$eval('.fs-card:not([aria-hidden="true"])', e => e.map(x => x.textContent.replace(/\d+$/, '')));
  check('only one copy of each faculty is exposed to assistive tech', exposed.join('|') === names.join('|'), exposed.join('|'));
  check('faculty strip animates (marquee) and has a pause button', !!(await page.$('.fs-view.anim')) && !!(await page.$('.fs-pause')));
  await page.click('.fs-pause'); await sleep(200);
  check('pause button pauses the marquee', await page.$eval('.fs-view', e => e.classList.contains('paused') && getComputedStyle(e.querySelector('.fs-track')).animationPlayState === 'paused'));
  const dup = await page.$$eval('.fs-card[aria-hidden="true"]', e => e.every(x => x.tabIndex === -1));
  check('duplicate marquee cards are hidden from keyboard/AT', dup);
  await clickText(page, '.fs-set:first-child .fs-card', /Engineering/); await sleep(700);
  check('faculty card opens that faculty in the feed', /\/feed\?topic=Engineering/.test(page.url()), page.url());
  await page.close();
}
{ // nav + hero actions
  const page = await newPage(browser, { w: 1280, h: 860 });
  await clickText(page, '.hb--sec', /Meet the SUG/); await sleep(600);
  check('Meet the SUG goes to the SUG page', page.url().endsWith('/sug') && /Meet the SUG/.test(await txt(page)));
  await page.goBack(); await sleep(300);
  await clickText(page, '.hb--pri', /Browse Questions/); await sleep(500);
  check('Browse Questions goes to the feed', page.url().endsWith('/feed'));
  await page.close();
}
{ // signed-in nav
  const page = await newPage(browser, { as: 'plain', w: 1280, h: 860 });
  check('signed-in: bell and account menu replace Log In/Sign Up', !!(await page.$('button[aria-label^="Notifications"]')) && !!(await page.$('.tn-avatar')) && !(await page.$('.tn-btn')));
  await page.close();
}
await browser.close(); process.exit(summary() ? 1 : 0);
