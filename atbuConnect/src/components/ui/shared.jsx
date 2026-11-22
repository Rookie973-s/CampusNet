import { useState, useEffect } from 'react';
import Ic from '../Ic.jsx';
import useDialog from '../../hooks/useDialog';

// ── ToastContainer ──
const ToastContainer = ({toasts}) => (
  <div role="status" aria-live="polite" style={{position:"fixed",top:"calc(env(safe-area-inset-top, 0px) + 18px)",left:"50%",transform:"translateX(-50%)",zIndex:3000,display:"flex",flexDirection:"column",gap:10,alignItems:"center",pointerEvents:"none",maxWidth:"calc(100vw - 24px)"}}>
    {toasts.map(t=>(
      <div key={t.id} className="toast" style={{background:"#000B18",color:"#fff",border:"1px solid rgba(147,180,255,.22)",boxShadow:"0 12px 30px rgba(2,8,23,.55)",animation:"slideDown .24s var(--ease-liquid) both"}}>
        {t.type==="success"?<Ic n="check" s={16} c="#34D399"/>:t.type==="error"?<Ic n="x" s={16} c="#F87171"/>:<Ic n="bell" s={16} c="#60A5FA"/>}
        <span>{t.msg}</span>
      </div>
    ))}
  </div>
);

// ── Modal ──
/* Accessible dialog: role/aria-modal, Escape, focus trap + restore, exit animation,
   and an optional themed close button (showClose) for modals that don't draw their own. */
const Modal = ({onClose,children,maxW=500,label="Dialog",dismissible=true,showClose=false}) => {
  const { ref, closing, requestClose } = useDialog(onClose,{dismissible});
  return (
    <div className={`overlay${closing?" closing":""}`} onClick={e=>{if(dismissible&&e.target===e.currentTarget)requestClose()}}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref} style={{maxWidth:maxW}}>
        {dismissible && showClose && (
          <button type="button" className="modal-x" aria-label="Close dialog" onClick={requestClose}>
            <Ic n="x" s={16}/>
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

// ── Skeleton ──
/* ── SKELETON ── */
const Skel = ({h=14,w="100%",r=6,mb=10})=>(
  <div className="skel" style={{height:h,width:w,borderRadius:r,marginBottom:mb}}/>
);

// ── Stars ──
/* ── STAR RATING ── */
const Stars = ({r=5})=>(
  <span>{[1,2,3,4,5].map(i=>(
    <span key={i} style={{color:i<=Math.round(r)?"#3B82F6":"#CBD5E1",fontSize:14}}>★</span>
  ))}</span>
);

// ── VoteButtons ──
/* ── VOTE BUTTONS (Reddit-style) ── */
function VoteButtons({votes,voted,onVote,vertical=false}) {
  const score = votes + (voted==="up"?0:voted==="down"?0:0);
  return (
    <div style={{display:"flex",flexDirection:vertical?"column":"row",alignItems:"center",gap:vertical?2:4}}>
      <button className={`vote-btn up${voted==="up"?" active":""}`}
        onClick={e=>{e.stopPropagation();onVote("up");}}
        title="Upvote" aria-label="Upvote" aria-pressed={voted==="up"}
        style={{color:voted==="up"?"#F97316":"var(--mut)"}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <span className="vote-score" style={{color:voted==="up"?"#F97316":voted==="down"?"#6366F1":"var(--mut)"}}>
        {votes}
      </span>
      <button className={`vote-btn down${voted==="down"?" active":""}`}
        onClick={e=>{e.stopPropagation();onVote("down");}}
        title="Downvote" aria-label="Downvote" aria-pressed={voted==="down"}
        style={{color:voted==="down"?"#6366F1":"var(--mut)"}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
  );
}

// ── ReadingTime ──
/* ── READING TIME ── */
const ReadingTime = ({text}) => {
  const mins = Math.max(1, Math.ceil(text.split(" ").length / 200));
  return <span className="rt-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{mins} min read</span>;
};

// ── BackToTop ──
/* ── BACK TO TOP ── */
function BackToTop({onAsk, askLabel="Ask", topLabel="Back to top"}) {
  const [show,setShow] = useState(false);
  useEffect(()=>{
    const fn=()=>setShow(window.scrollY>300);
    window.addEventListener("scroll",fn,{passive:true});
    return ()=>window.removeEventListener("scroll",fn);
  },[]);
  return (
    <div style={{
      position:"fixed",bottom:"calc(env(safe-area-inset-bottom, 0px) + var(--fab-bottom, 28px))",right:18,zIndex:998,
      display:"flex",flexDirection:"column",alignItems:"center",gap:8,
    }}>
      {/* Ask FAB — always visible */}
      {onAsk && (
        <button type="button" onClick={onAsk} className="fab-ask" aria-label={askLabel} title={askLabel}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000B18" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span className="fab-ask-label">{askLabel}</span>
        </button>
      )}
      {/* Back to top — only when scrolled */}
      {show && (
        <button type="button" className="b2t" style={{position:"static",animation:"b2tIn .3s ease"}} aria-label={topLabel}
          onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} title={topLabel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
      )}
    </div>
  );
}

export { ToastContainer, Modal, Skel, Stars, VoteButtons, ReadingTime, BackToTop };
