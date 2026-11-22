import Ic from '../Ic';
import { useI18n } from '../../i18n';

/** A course folder: a few real document sheets peek out from behind a raised front panel. */
export default function FolderCard({ f, onOpen }) {
  const { t } = useI18n();
  const sheets = f.previews.slice(0, 3);
  return (
    <button type="button" className="folder" onClick={() => onOpen(f)} aria-label={t("library.openFolder", { code: f.code, n: f.count })}>
      <span className="folder-sheets" aria-hidden="true">
        {sheets.map((p, i) => (
          <span key={p.id} className={`folder-sheet s${i}`}><span>{p.title}</span><i /><i /><i /></span>
        ))}
        {sheets.length === 0 && <span className="folder-sheet s0"><i /><i /><i /></span>}
      </span>
      <span className="folder-front">
        <span className="folder-text">
          <strong>{f.code}</strong>
          <span className="folder-title">{f.title || `${f.level} ${t("library.levelWord")}`}</span>
          <span className="folder-meta">{t("library.filesN", { n: f.count })} · {f.departmentName}</span>
        </span>
        <span className="folder-go"><Ic n="arrow" s={16} /></span>
      </span>
    </button>
  );
}
