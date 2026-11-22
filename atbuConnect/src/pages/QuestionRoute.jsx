import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QuestionPage from './QuestionPage';
import { getQuestion } from '../api/questions';
import { Skel } from '../components/ui/shared';
import { useI18n } from '../i18n';

/** Canonical, shareable URL for a post: /q/<id>. Public - guests can read it. */
export default function QuestionRoute({ user, onLogin, toast }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [q, setQ] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    getQuestion(id).then((d) => { if (live) { setQ(d); setState("ok"); } })
      .catch((e) => live && setState(e.status === 404 ? "missing" : "error"));
    return () => { live = false; };
  }, [id]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {state === "loading" && <div className="fcard"><Skel h={22} w="70%" mb={14} /><Skel h={12} mb={8} /><Skel h={12} w="85%" /></div>}
      {state === "missing" && <div className="fcard" style={{ textAlign: "center", padding: 40 }}><h3>{t("feed.postGone")}</h3><button className="btn btn-pri" style={{ marginTop: 16 }} onClick={() => navigate("/feed")}>{t("feed.backToFeed")}</button></div>}
      {state === "error" && <div className="fcard" style={{ textAlign: "center", padding: 40 }} role="alert"><h3>{t("feed.err.load")}</h3><button className="btn btn-pri" style={{ marginTop: 16 }} onClick={() => navigate(0)}>{t("common.retry")}</button></div>}
      {state === "ok" && <QuestionPage q={q} onBack={() => navigate("/feed")} user={user} onLogin={onLogin} toast={toast} />}
    </div>
  );
}
