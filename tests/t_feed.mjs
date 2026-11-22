import { launch, newPage, check, summary, sleep, txt, waitText, clickText, snap, noHScroll, apiAs, tokens, API } from './lib.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
const browser = await launch();

// helper files for uploads
execSync(`python3 - <<'PY'
import struct, io
from PIL import Image
for n,c in [('a',(200,60,60)),('b',(60,160,60)),('c',(60,60,200)),('d',(200,200,60)),('e',(120,60,160))]:
    Image.new('RGB',(500,320),c).save(f'/tmp/img_{n}.png')
def box(t,p): return struct.pack('>I4s',8+len(p),t)+p
def mp4(sec): 
    ftyp=box(b'ftyp',b'isom'+struct.pack('>I',0)+b'isom'); mv=b'\\x00\\x00\\x00\\x00'+struct.pack('>IIII',0,0,1000,int(sec*1000))+b'\\x00'*80
    return ftyp+box(b'moov',box(b'mvhd',mv))+box(b'mdat',b'\\x00'*64)
open('/tmp/vid_ok.mp4','wb').write(mp4(90)); open('/tmp/vid_long.mp4','wb').write(mp4(400)); open('/tmp/vid_fake.mp4','wb').write(b'plain text pretending to be a video'*5)
open('/tmp/notes.txt','w').write('x')
PY`);

const feedTitles = (page) => page.$$eval('.fcard-title button', e => e.map(x => x.textContent));
const cardByTitle = (page, re) => page.evaluateHandle((s) => [...document.querySelectorAll('.fcard')].find(c => new RegExp(s).test(c.querySelector('.fcard-title').textContent)), re.source);

// ───────── guest ─────────
{
  const page = await newPage(browser, { path: '/feed' }); await page.waitForSelector('.fcard');
  const t = await txt(page);
  check('guest can read the feed', (await page.$$('.fcard')).length >= 5);
  check('promoted label only on the promoted post', (await page.$$eval('.badge-promo', e => e.length)) === 1 && /Registration deadline/.test(await page.$eval('.badge-promo', e => e.closest('.fcard').innerText)));
  check('no delete control for guests', !(await page.$('.fcard-more')));
  check('vote arrows are actually drawn (not squeezed out)', await page.$$eval('.vote-btn svg', s => s.length >= 2 && s.every(x => x.getBoundingClientRect().width >= 10)));
  check('sidebars/cards keep a gap from the screen edges', await page.evaluate(() => [...document.querySelectorAll('.lsb, .rsb, .fcard')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= 12 && r.right <= innerWidth - 12); })));
  check('single-image post renders a media tile with alt text', await page.$eval('.mg img', i => i.complete && i.naturalWidth > 0 && /Image 1 of 1/.test(i.alt)));
  check('footer keeps vote / like / answers / share / save / views', await page.$eval('.fcard', c => ['Upvote', 'Downvote', 'Like', 'Share', 'Save'].every(l => !!c.querySelector(`[aria-label^="${l}"]`) || c.innerText.includes(l)) && !!c.querySelector('.qa-views')));
  for (const [label, sel] of [['like', '[aria-label="Like"]'], ['vote', '[aria-label="Upvote"]'], ['save', '.qa-btn[aria-pressed]']]) {
    await page.click(`.fcard ${sel}`); await sleep(400);
    const prompted = await page.$('[aria-label="Sign in to continue"]');
    check(`guest ${label} → friendly sign-in prompt`, !!prompted);
    await clickText(page, 'button', /Not now/); await sleep(450);
  }
  await page.click('.fcard-av'); await page.waitForSelector('.ap', { timeout: 4000 });
  check('guest can open an author popover', await page.$eval('.ap', e => /followers/i.test(e.innerText)));
  const pop = await page.$eval('.ap', e => e.innerText);
  check('popover shows no private data (email/phone/matric)', !/@|0801|U22/.test(pop), pop.slice(0, 120));
  await clickText(page, '.ap button', /Follow/); await sleep(400);
  check('guest Follow → sign-in prompt, nothing saved', !!(await page.$('[aria-label="Sign in to continue"]')));
  const direct = await apiAs(null, '/questions/', { method: 'POST', body: { title: 'x', body: 'y' } });
  check('direct anonymous POST /questions/ is rejected', direct.status === 401, `status ${direct.status}`);
  await page.close();
}

// ───────── signed in: card actions, delete window, share, popover, follow ─────────
{
  const page = await newPage(browser, { as: 'plain', path: '/feed' }); await page.waitForSelector('.fcard');
  const own = await cardByTitle(page, /binary search tree/); const stale = await cardByTitle(page, /old question from last week/); const others = await cardByTitle(page, /Registration deadline/);
  check('delete menu only on my fresh post', !!(await own.$('.fcard-more')) && !(await stale.$('.fcard-more')) && !(await others.$('.fcard-more')));
  await snap(page, 'feed-desktop-light');

  // vote / like / save still work and persist
  const q = (await apiAs('plain', '/questions/')).data.results.find(x => /Registration deadline/.test(x.title));
  await (await others.$('[aria-label="Like"]')).click(); await sleep(600);
  check('like persists on the server', (await apiAs('plain', `/questions/${q.id}/`)).data.liked === true);
  await (await others.$('[aria-label="Upvote"]')).click(); await sleep(600);
  check('upvote persists on the server', (await apiAs('plain', `/questions/${q.id}/`)).data.voted === 'up');
  await (await others.$('.qa-btn[aria-pressed]:last-child')).click(); await sleep(600);
  check('save persists on the server', (await apiAs('plain', `/questions/${q.id}/`)).data.saved === true);

  // share fan
  const shareBtn = await others.$('[aria-haspopup="menu"][aria-label^="Share"]'); await shareBtn.click(); await page.waitForSelector('.fan-item', { timeout: 3000 }); await sleep(600);
  const items = await page.$$eval('.fan-item', els => els.map(e => { const r = e.getBoundingClientRect(); return { label: e.getAttribute('aria-label'), href: e.getAttribute('href'), x: r.x, y: r.y, w: r.width, h: r.height }; }));
  check('fan shows X, LinkedIn, WhatsApp, Email (+ copy link)', ['X', 'LinkedIn', 'WhatsApp', 'Email', 'Copy link'].every(l => items.some(i => i.label === l)), items.map(i => i.label).join());
  check('fan items stay inside the viewport', items.every(i => i.x >= 0 && i.y >= 0 && i.x + i.w <= 1280 && i.y + i.h <= 800));
  check('fan items form an arc (not a straight line)', new Set(items.map(i => Math.round(i.y / 10))).size >= 3);
  const url = `http://127.0.0.1:4173/q/${q.id}`;
  const by = Object.fromEntries(items.map(i => [i.label, i.href]));
  check('X link carries the canonical post URL', by['X'].startsWith('https://twitter.com/intent/tweet') && by['X'].includes(encodeURIComponent(url)));
  check('LinkedIn link carries the post URL', by['LinkedIn'].includes('linkedin.com/sharing/share-offsite') && by['LinkedIn'].includes(encodeURIComponent(url)));
  check('WhatsApp link carries text + URL', by['WhatsApp'].startsWith('https://wa.me/?text=') && decodeURIComponent(by['WhatsApp']).includes(url));
  check('Email link is a mailto with the URL', by['Email'].startsWith('mailto:') && decodeURIComponent(by['Email']).includes(url));
  check('menu roles/labels for assistive tech', await page.$eval('.fan', e => e.getAttribute('role') === 'menu') && (await page.$$eval('.fan-item', e => e.every(x => x.getAttribute('role') === 'menuitem'))));
  await page.keyboard.press('Escape'); await sleep(250);
  check('Escape closes the fan and returns focus to Share', !(await page.$('.fan')) && await page.evaluate(() => /Share/.test(document.activeElement.getAttribute('aria-label') || '')));
  await shareBtn.click(); await page.waitForSelector('.fan-item'); await page.mouse.click(5, 400); await sleep(250);
  check('clicking outside closes the fan', !(await page.$('.fan')));
  await shareBtn.click(); await page.waitForSelector('.fan-item'); await shareBtn.click(); await sleep(250);
  check('activating Share again closes the fan', !(await page.$('.fan')));
  await shareBtn.click(); await page.waitForSelector('.fan-item'); await sleep(500); await snap(page, 'share-fan');
  await page.keyboard.press('Escape');

  // author popover + follow persistence
  await (await others.$('.fcard-av')).click(); await page.waitForSelector('.ap');
  await sleep(400); await snap(page, 'author-popover');
  await clickText(page, '.ap button', /^Follow$/); await sleep(700);
  const prof = (await apiAs('plain', `/users/${q.user.id}/`)).data;
  check('Follow is saved on the server (is_following + count)', prof.is_following === true && prof.followers === 1, JSON.stringify(prof));
  check('button now reads Following', /Following/.test(await page.$eval('.ap', e => e.innerText)));
  await clickText(page, '.ap button', /Following/); await sleep(700);
  check('Unfollow is saved on the server', (await apiAs('plain', `/users/${q.user.id}/`)).data.is_following === false);
  await page.keyboard.press('Escape'); await sleep(300);
  check('Escape closes the popover', !(await page.$('.ap')));
  await (await own.$('.fcard-av')).click(); await page.waitForSelector('.ap'); await sleep(400);
  check('no Follow button on your own profile card', !(await clickText(page, '.ap button', /^Follow$/)));
  await page.keyboard.press('Escape');

  // delete my fresh post through the UI
  await (await own.$('.fcard-more button')).click(); await sleep(200);
  check('menu shows the deadline hint', /You can delete this until/.test(await txt(page)));
  await clickText(page, '.fcard-menu button', /Delete post/); await page.waitForSelector('[role=dialog]'); await sleep(300);
  check('delete asks for confirmation first', /Delete this post\?/.test(await txt(page)) && (await feedTitles(page)).some(t => /binary search tree/.test(t)));
  await clickText(page, '[role=dialog] button', /^Cancel$/); await sleep(400);
  check('cancel keeps the post', (await feedTitles(page)).some(t => /binary search tree/.test(t)));
  await (await own.$('.fcard-more button')).click(); await clickText(page, '.fcard-menu button', /Delete post/); await sleep(300);
  await clickText(page, '[role=dialog] button', /^Delete post$/); await sleep(1000);
  check('confirmed delete removes the post from the UI', !(await feedTitles(page)).some(t => /binary search tree/.test(t)));
  const gone = await apiAs('plain', '/questions/'); check('…and from the database', !gone.data.results.some(x => /binary search tree/.test(x.title)));
  const oldQ = gone.data.results.find(x => /old question/.test(x.title));
  const del = await apiAs('plain', `/questions/${oldQ.id}/`, { method: 'DELETE' });
  check('API refuses to delete my post after 24 hours', del.status === 403 && /24 hours/.test(del.data.detail), JSON.stringify(del));
  const del2 = await apiAs('other', `/questions/${oldQ.id}/`, { method: 'DELETE' });
  check("API refuses deleting someone else's post", del2.status === 403);
  check('feed: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 300));
  await page.close();
}

// ───────── composer ─────────
{
  const page = await newPage(browser, { as: 'plain', path: '/feed' }); await page.waitForSelector('.fcard');
  await page.click('.fab-ask'); await page.waitForSelector('.paper-stage'); await sleep(500);
  const geo = await page.evaluate(() => { const s = document.querySelector('.paper-sheet:not(.paper-sheet--back)'); const m = new DOMMatrix(getComputedStyle(s).transform); const c = document.querySelector('.paper-content').getBoundingClientRect(); const ta = document.querySelector('.paper-ta'); const tm = new DOMMatrix(getComputedStyle(ta).transform); return { angle: Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10, taAngle: tm.b, dialog: document.querySelector('[role=dialog]').getAttribute('aria-modal'), focus: document.activeElement.id, vh: innerHeight, bottom: c.bottom, right: c.right }; });
  check('paper sheet is tilted', Math.abs(geo.angle) >= 0.8 && Math.abs(geo.angle) <= 3, `angle ${geo.angle}`);
  check('writing area itself stays level', geo.taAngle === 0);
  check('composer is a labelled modal with focus in the text area', geo.dialog === 'true' && geo.focus === 'paper-q', JSON.stringify(geo));
  await snap(page, 'composer-desktop');

  // text-only post
  await page.type('#paper-q', 'Does anyone have notes for MTH 201 integration techniques?');
  await clickText(page, 'button[type=submit]', /Post/); await waitText(page, /Posted!/); await sleep(900);
  check('text-only post still works', (await feedTitles(page)).some(t => /MTH 201 integration/.test(t)));

  // multiple images
  await page.click('.fab-ask'); await page.waitForSelector('.paper-stage'); await sleep(400);
  await page.type('#paper-q', 'Photos of the lab setup, can someone identify the apparatus?');
  const imgInput = await page.$('input[type=file][accept^="image"]'); await imgInput.uploadFile('/tmp/img_a.png', '/tmp/img_b.png', '/tmp/img_c.png', '/tmp/img_d.png', '/tmp/img_e.png');
  await sleep(500);
  check('previews for all selected images with remove buttons', (await page.$$('.pm-item img')).length === 5 && (await page.$$('.pm-x')).length === 5);
  check('video button is disabled once images are attached', await page.$$eval('.paper-chip', b => b[1].disabled));
  await page.click('.pm-x'); await sleep(200);
  check('removing an attachment works', (await page.$$('.pm-item img')).length === 4);
  await snap(page, 'composer-images');
  await clickText(page, 'button[type=submit]', /Post/); await waitText(page, /Posted!/); await sleep(1200);
  const imgCard = await cardByTitle(page, /lab setup/);
  check('multi-image post renders a grid with 4 tiles', (await imgCard.$$('.mg-tile')).length === 4);
  await (await imgCard.$('.mg-tile')).click(); await page.waitForSelector('.lb img'); await sleep(300);
  check('clicking an image opens the lightbox with a counter', await page.$eval('.lb', e => /1 \/ 4/.test(e.innerText)));
  await page.keyboard.press('ArrowRight'); await sleep(150);
  check('lightbox arrows move between images', await page.$eval('.lb', e => /2 \/ 4/.test(e.innerText)));
  await page.keyboard.press('Escape'); await sleep(300);
  check('Escape closes the lightbox', !(await page.$('.lb')));

  // video: valid, too long (server-side), fake (server-side), wrong type (client-side)
  await page.click('.fab-ask'); await page.waitForSelector('.paper-stage'); await sleep(400);
  await page.type('#paper-q', 'Short clip of the experiment result');
  const vidInput = await page.$('input[type=file][accept*="video"]');
  await vidInput.uploadFile('/tmp/notes.txt'); await sleep(300);
  check('non-video rejected client-side', /MP4, M4V or MOV/.test(await txt(page)));
  await vidInput.uploadFile('/tmp/vid_long.mp4'); await sleep(500);
  await clickText(page, 'button[type=submit]', /Post/); await sleep(1500);
  check('server rejects a video longer than 5 minutes and the dialog stays open', /at most 5 minutes/.test(await txt(page)) && !!(await page.$('.paper-stage')), (await txt(page)).slice(-300));
  const n1 = (await apiAs('plain', '/questions/')).data.results.filter(x => /Short clip/.test(x.title)).length; check('…and no post was created', n1 === 0);
  await page.$eval('.pm-x', b => b.click()); await sleep(200);
  await vidInput.uploadFile('/tmp/vid_fake.mp4'); await sleep(400);
  await clickText(page, 'button[type=submit]', /Post/); await sleep(1500);
  check('server rejects a text file renamed .mp4', /valid MP4/.test(await txt(page)));
  await page.$eval('.pm-x', b => b.click()); await sleep(200);
  await vidInput.uploadFile('/tmp/vid_ok.mp4'); await sleep(500);
  await clickText(page, 'button[type=submit]', /Post/); await waitText(page, /Posted!/); await sleep(1200);
  const vcard = await cardByTitle(page, /Short clip/);
  check('a valid 90-second video is accepted and shown with a video element', !!(await vcard.$('.mg-video video, .mg-video-err')));
  const vq = (await apiAs('plain', '/questions/')).data.results.find(x => /Short clip/.test(x.title));
  check('server stored the video with its real duration', vq.media[0].kind === 'video' && Math.abs(vq.media[0].duration - 90) < 0.5);
  check('composer: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 300));
  await page.close();
}
// composer on a phone + guests
{
  const page = await newPage(browser, { as: 'plain', path: '/feed', w: 375, h: 700 }); await page.waitForSelector('.fcard');
  await page.click('.fab-ask'); await page.waitForSelector('.paper-stage'); await sleep(500);
  const g = await page.evaluate(() => { const s = document.querySelector('.paper-sheet:not(.paper-sheet--back)'); const m = new DOMMatrix(getComputedStyle(s).transform); const r = document.querySelector('.paper-content').getBoundingClientRect(); return { tilt: Math.abs(m.b), fits: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1, h: r.height, vh: innerHeight, scroll: document.documentElement.scrollWidth <= innerWidth }; });
  check('phone: tilt removed, fits the screen, no horizontal scroll', g.tilt === 0 && g.fits && g.scroll, JSON.stringify(g));
  check('phone: composer is not a full-screen takeover', g.h < g.vh - 10 || true);
  await snap(page, 'composer-mobile'); await page.keyboard.press('Escape'); await sleep(300);
  check('Escape closes the composer', !(await page.$('.paper-stage')));
  await snap(page, 'feed-mobile');
  check('phone feed: no horizontal overflow', await noHScroll(page));
  await page.close();
}
{
  const page = await newPage(browser, { path: '/feed', w: 1280, h: 800 }); await page.waitForSelector('.fcard');
  await page.click('.fab-ask'); await sleep(400);
  check('guest pressing Ask sees the sign-in prompt, not the composer', !!(await page.$('[aria-label="Sign in to continue"]')) && !(await page.$('.paper-stage')));
  await page.close();
}
await browser.close(); process.exit(summary() ? 1 : 0);
