import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from '../Ic';
import { Skel } from '../ui/shared';
import { listDepartments } from '../../api/departments';
import { useI18n } from '../../i18n';

/**
 * Slow horizontal marquee of the REAL faculties (departments API). Pauses on hover/focus
 * and via an explicit button (WCAG 2.2.2); for reduced-motion users it is a plain
 * horizontally scrollable row instead of an animation.
 */
export default function FacultyStrip() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [depts, setDepts] = useState([]);
  const [state, setState] = useState("loading");
  const [paused, setPaused] = useState(false);
  const reduce = useRef(typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    let live = true;
    listDepartments().then((d) => { if (live) { setDepts(d); setState("ok"); } }).catch(() => live && setState("error"));
    return () => { live = false; };
  }, []);

  const open = (name) => navigate(`/feed?topic=${encodeURIComponent(name)}`);
  const animate = !reduce.current && depts.length >= 4;
  // Short lists would leave gaps, so repeat the set enough times to fill ~2 screen widths.
  const reps = depts.length ? Math.max(2, Math.ceil(10 / depts.length)) : 0;
  // Both marquee sets are identical so translateX(-50%) loops seamlessly. Only the very first
  // copy is exposed to assistive tech and the tab order; every repeat is decorative.
  const makeSet = (primary) => Array.from({ length: animate ? reps : 1 }).flatMap((_, r) =>
    depts.map((d) => {
      const hidden = !(primary && r === 0);
      return (
        <button key={`${primary ? "a" : "b"}-${r}-${d.id}`} type="button" className="fs-card" onClick={() => open(d.name)}
          tabIndex={hidden ? -1 : 0} aria-hidden={hidden ? "true" : undefined}>
          <span className="fs-dot" style={{ background: d.color }} aria-hidden="true" />
          <span className="fs-name">{d.name}</span>
          <span className="fs-count">{d.count}</span>
        </button>
      );
    }));

  return (
    <section className="fs" aria-labelledby="fs-title">
      <div className="fs-head">
        <h2 id="fs-title">{t("home.faculties")}</h2>
        {animate && (
          <button type="button" className="fs-pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
            aria-label={paused ? t("home.play") : t("home.pause")}>
            <Ic n={paused ? "arrow" : "x"} s={13} />{paused ? t("home.play") : t("home.pause")}
          </button>
        )}
      </div>

      {state === "loading" && <div className="fs-skel">{[1, 2, 3, 4].map((n) => <Skel key={n} h={54} w={190} mb={0} />)}</div>}
      {state === "error" && <p className="fs-msg">{t("home.facultiesError")}</p>}
      {state === "ok" && depts.length === 0 && <p className="fs-msg">{t("home.facultiesEmpty")}</p>}
      {state === "ok" && depts.length > 0 && (
        <div className={`fs-view${animate ? " anim" : ""}${paused ? " paused" : ""}`}>
          <div className="fs-track">
            <div className="fs-set">{makeSet(true)}</div>
            {animate && <div className="fs-set" aria-hidden="true">{makeSet(false)}</div>}
          </div>
        </div>
      )}
    </section>
  );
}
