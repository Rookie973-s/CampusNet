import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from '../Ic';
import SearchDropdown from '../SearchDropdown';
import { useI18n } from '../../i18n';

/** Search in the top bar. Full input on desktop; an icon that opens a row on phones. */
export default function HeaderSearch({ onPick, onPickUser }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [open, setOpen] = useState(false);
  const input = useRef(null);

  const closeAll = () => {
    setQ("");
    setFocus(false);
    setOpen(false);
    input.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && q.trim()) {
      e.preventDefault();
      navigate(`/feed?discovery=${encodeURIComponent(q.trim())}`);
      closeAll();
    } else if (e.key === "Escape") {
      setFocus(false);
      setOpen(false);
    }
  };

  return (
    <div className="hs">
      <button type="button" className="tn-ib hs-toggle" aria-label={t("nav.search")} aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setTimeout(() => input.current?.focus(), 30); }}>
        <Ic n="search" s={17} />
      </button>
      <div className={`hs-box${open ? " open" : ""}`}>
        <span className="hs-ic" aria-hidden="true"><Ic n="search" s={15} /></span>
        <input
          ref={input}
          className="hs-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 180)}
          placeholder="Search posts, @users, communities…"
          aria-label={t("nav.search")}
        />
        {focus && q.trim().length >= 2 && (
          <SearchDropdown
            query={q.trim()}
            onNavigate={(x) => { onPick(x); closeAll(); }}
            onPickUser={(u) => { if (onPickUser) onPickUser(u); closeAll(); }}
            onClose={closeAll}
          />
        )}
      </div>
    </div>
  );
}
