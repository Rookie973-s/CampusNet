import { useMemo } from 'react';
import { useI18n } from '../../i18n';

const W = 520, H = 190, PAD = { l: 30, r: 24, t: 14, b: 26 };

/** Weekly area chart + day-by-day grid, both computed from the real activity series the API returns. */
export default function ActivityChart({ series }) {
  const { t } = useI18n();

  const { weeks, max, total } = useMemo(() => {
    const out = [];
    for (let i = 0; i < series.length; i += 7) {
      const chunk = series.slice(i, i + 7);
      out.push({ start: chunk[0].date, n: chunk.reduce((s, d) => s + d.total, 0) });
    }
    return { weeks: out, max: Math.max(1, ...out.map((w) => w.n)), total: series.reduce((s, d) => s + d.total, 0) };
  }, [series]);

  if (total === 0) {
    return <div className="act-empty"><strong>{t("profile.noActivity")}</strong><span>{t("profile.noActivityHint")}</span></div>;
  }

  const ymax = max <= 4 ? 4 : Math.ceil(max / 2) * 2;
  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, weeks.length - 1);
  const y = (v) => PAD.t + (1 - v / ymax) * (H - PAD.t - PAD.b);
  const pts = weeks.map((w, i) => [x(i), y(w.n)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(weeks.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`;
  const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
  const gridCols = Math.ceil(series.length / 7);

  return (
    <div className="act">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("profile.chartLabel", { total, weeks: weeks.length })} className="act-svg">
        <defs><linearGradient id="actg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B82F6" stopOpacity=".35" /><stop offset="1" stopColor="#3B82F6" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map((f) => {
          const v = Math.round(ymax * f);
          return <g key={f}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="act-grid" /><text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="act-t">{v}</text></g>;
        })}
        <path d={area} fill="url(#actg)" />
        <path d={line} fill="none" stroke="#3B82F6" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.4" className="act-dot"><title>{`${fmt(weeks[i].start)}: ${weeks[i].n}`}</title></circle>)}
        {weeks.map((w, i) => (i % 3 === 0 || i === weeks.length - 1) && <text key={w.start} x={x(i)} y={H - 8} textAnchor="middle" className="act-t">{fmt(w.start)}</text>)}
      </svg>

      <div className="act-grid-wrap">
        <div className="act-cells" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }} role="img" aria-label={t("profile.gridLabel")}>
          {Array.from({ length: gridCols }).flatMap((_, c) => Array.from({ length: 7 }).map((__, r) => {
            const d = series[c * 7 + r];
            return d ? <i key={d.date} className={`ac l${level(d.total)}`} style={{ gridColumn: c + 1, gridRow: r + 1 }} title={`${fmt(d.date)}: ${t("profile.nPosts", { n: d.total })}`} /> : null;
          }))}
        </div>
        <div className="act-legend" aria-hidden="true">{t("profile.less")}{[0, 1, 2, 3, 4].map((l) => <i key={l} className={`ac l${l}`} />)}{t("profile.more")}</div>
      </div>

      <table className="sr-only">
        <caption>{t("profile.chartLabel", { total, weeks: weeks.length })}</caption>
        <thead><tr><th>{t("profile.week")}</th><th>{t("profile.activity")}</th></tr></thead>
        <tbody>{weeks.map((w) => <tr key={w.start}><td>{fmt(w.start)}</td><td>{w.n}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
