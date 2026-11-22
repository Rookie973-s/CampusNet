// Run with: node scripts/check-i18n.mjs
// Fails if (1) the UI uses a key missing from English, (2) Hausa lacks a key English has,
// or (3) a Hausa string uses different {placeholders} than the English one.
import fs from "node:fs"; import path from "node:path";
import en from "../src/i18n/en.js"; import ha from "../src/i18n/ha.js";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk("src").filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.includes("src/i18n/"));
const used = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']/g)) used.add(m[1]);
  for (const m of s.matchAll(/(?:labelKey|key)\s*:\s*["']((?:nav)\.[A-Za-z0-9_.]+)["']/g)) used.add(m[1]);
  for (const m of s.matchAll(/\[\s*["'][A-Za-z ]+["']\s*,\s*["'](feed\.f\.[a-z]+)["']\s*\]/g)) used.add(m[1]);
}
// keys built dynamically in code
for (const a of ["ask", "verified", "library", "community"]) for (const b of ["title", "desc", "cta"]) used.add(`home.f.${a}.${b}`);
["like", "vote", "save"].forEach((k) => used.add(`guest.actions.${k}`));

const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const missingEn = [...used].filter((k) => !(k in en));
const missingHa = Object.keys(en).filter((k) => !(k in ha));
const extraHa = Object.keys(ha).filter((k) => !(k in en));
const badPh = Object.keys(ha).filter((k) => k in en && ph(ha[k]) !== ph(en[k]));
const unused = Object.keys(en).filter((k) => !used.has(k));
console.log(`English keys: ${Object.keys(en).length} · Hausa: ${Object.keys(ha).length - extraHa.length} (${Math.round(100 * (Object.keys(en).length - missingHa.length) / Object.keys(en).length)}%) · used in UI: ${used.size}`);
let bad = 0;
for (const [label, list] of [["used but missing from English", missingEn], ["missing from Hausa", missingHa], ["in Hausa but not English", extraHa], ["placeholder mismatch", badPh], ["defined but unused", unused]]) {
  if (list.length) { console.log(`✗ ${label}: ${list.join(", ")}`); if (label !== "defined but unused") bad++; }
}
if (!bad) console.log("✓ i18n dictionaries are consistent");
process.exit(bad ? 1 : 0);
