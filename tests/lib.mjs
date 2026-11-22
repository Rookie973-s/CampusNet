import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
export const BASE = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:8000/api', PW = 'pw12345!x';
export const shots = '/home/claude/shots2';
import fs from 'fs'; fs.mkdirSync(shots, { recursive: true });
const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`); };
export const summary = () => { const f = results.filter(r => !r.ok); console.log(`\n${results.length - f.length}/${results.length} passed`); return f.length; };
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const launch = async () => puppeteer.launch({ args: [...chromium.args, '--no-sandbox'], executablePath: await chromium.executablePath(), headless: 'shell' });

export async function tokens(username) {
  const r = await fetch(`${API}/auth/login/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PW }) });
  if (!r.ok) throw new Error('login failed for ' + username + ' ' + r.status);
  return r.json();
}
export const apiAs = async (username, path, opts = {}) => {
  const t = username ? (await tokens(username)).access : null;
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
};

export async function newPage(browser, { as = null, theme = 'light', w = 1280, h = 800, reducedMotion = false, path = '/', seen = true, lang = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|status of (400|401|403|404|409)/.test(m.text())) page.errors.push(m.text()); });
  const tk = as ? await tokens(as) : null;
  await page.evaluateOnNewDocument((tk, theme, seen, lang) => {
    if (!sessionStorage.getItem('__init')) {
      sessionStorage.setItem('__init', '1'); localStorage.clear();
      if (tk) { localStorage.setItem('atbu_access', tk.access); localStorage.setItem('atbu_refresh', tk.refresh); }
      localStorage.setItem('cc_theme', theme); if (seen) localStorage.setItem('cc_seen', '1'); if (lang) localStorage.setItem('cc_lang', lang);
    }
  }, tk, theme, seen, lang);
  await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  return page;
}
export const txt = (page) => page.evaluate(() => document.body.innerText);
export const waitText = (page, re, ms = 8000) => page.waitForFunction((s) => new RegExp(s).test(document.body.innerText), { timeout: ms }, re.source).then(() => true).catch(() => false);
export const clickText = (page, sel, re) => page.evaluate((sel, s) => { const el = [...document.querySelectorAll(sel)].find(e => new RegExp(s).test(e.textContent)); if (!el) return false; el.click(); return true; }, sel, re.source);
export const snap = (page, name, full = false) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: full });
export const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

export const fill = async (page, sel, text) => { await page.focus(sel); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type(sel, text); };
