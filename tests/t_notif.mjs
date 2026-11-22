import { launch, newPage, check, summary, sleep, txt, clickText, snap, apiAs } from './lib.mjs';
const browser = await launch();
const plainId = (await apiAs('plain', '/auth/me/')).data.id;
await apiAs('other', `/users/${plainId}/follow/`, { method: 'POST' });         // creates a real notification for "plain"
await apiAs('lecturer', `/users/${plainId}/follow/`, { method: 'POST' });
{
  const page = await newPage(browser, { as: 'plain', path: '/feed' }); await page.waitForSelector('.tn-badge', { timeout: 6000 }).catch(() => {});
  const server = (await apiAs('plain', '/notifications/unread_count/')).data.unread;
  const badge = await page.$eval('.tn-badge', e => e.textContent).catch(() => null);
  check('badge shows the real unread count from the server', server === 2 && badge === '2', `server ${server} badge ${badge}`);
  check('badge is a compact pill (not a bare red dot) with an accessible label', await page.$eval('button[aria-label^="Notifications"]', e => /2 unread/.test(e.getAttribute('aria-label'))));
  await snap(page, 'notif-badge');
  await page.click('button[aria-label^="Notifications"]'); await sleep(400);
  check('bell opens the notification list with the real items', /started following you/.test(await txt(page)));
  await clickText(page, 'button', /Mark all read/); await sleep(800);
  check('mark all read clears the badge and the server count', !(await page.$('.tn-badge')) && (await apiAs('plain', '/notifications/unread_count/')).data.unread === 0);
  check('notifications: no page errors', page.errors.length === 0, page.errors.join(' | ').slice(0, 200));
  await page.close();
}
{
  const page = await newPage(browser, { path: '/feed' });
  check('guests get no bell, no badge', !(await page.$('button[aria-label^="Notifications"]')) && !(await page.$('.tn-badge')));
  check('notification API is closed to guests', (await apiAs(null, '/notifications/')).status === 401 && (await apiAs(null, '/notifications/unread_count/')).status === 401);
  await page.close();
}
await browser.close(); process.exit(summary() ? 1 : 0);
