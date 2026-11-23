import { useState, useEffect, useRef } from 'react';
import T from '../tokens';

/* ────────────────────────────────────────────────────────
   CATEGORY PICKER — vertical dropdown for dept/topic filter
──────────────────────────────────────────────────────── */
function CategoryPicker({items, value, onChange, placeholder="All Categories"}) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(()=>{
    const fn = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[]);

  const getKey = (it) => (it.key !== undefined ? it.key : (it.value !== undefined ? it.value : it.name));
  const getColor = (it) => it?.color || it?.dot || "var(--brdS)";

  const current = items.find((it) => getKey(it) === value);
  const label = current ? (current.label || current.name) : placeholder;
  const dot = getColor(current);

  return (
    <div ref={ref} style={{position:"relative",zIndex:9999,flexShrink:0}}>
      <button type="button" className={`cat-trigger${open?" open":""}`} onClick={()=>setOpen(p=>!p)}>
        <span style={{width:10,height:10,borderRadius:"50%",background:dot,flexShrink:0,
          boxShadow:current?`0 0 0 3px ${dot}33`:undefined}}/>
        <span style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
        {current?.count !== undefined && current?.count !== null && <span style={{fontSize:11,background:"var(--surfA)",padding:"2px 7px",borderRadius:8,color:"var(--faint)",fontWeight:500}}>{current.count}</span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s",flexShrink:0,marginLeft:2}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="cat-drop" onClick={e=>e.stopPropagation()}>
          <div style={{padding:"10px 14px 6px",borderBottom:"1px solid var(--brd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.6,color:"var(--faint)"}}>Browse Categories</span>
            {value!=="All"&&<button type="button" onClick={()=>{onChange("All");setOpen(false);}} style={{fontSize:11,color:T.gold,fontWeight:700,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Clear</button>}
          </div>
          <div className="cat-drop-inner">
            {items.map((it, idx)=>{
              const key = getKey(it);
              const col = getColor(it);
              const isOn = value===key;
              return (
                <button type="button" key={`${key}-${idx}`} className={`cat-item${isOn?" on":""}`}
                  onClick={()=>{onChange(key);setOpen(false);}}>
                  <span style={{width:9,height:9,borderRadius:"50%",background:col,flexShrink:0,
                    boxShadow:isOn?`0 0 0 3px ${(col||"#888")}33`:undefined}}/>
                  <span style={{flex:1}}>{it.label||it.name}</span>
                  {it.count !== undefined && it.count !== null && <span style={{fontSize:11,background:isOn?"rgba(59,130,246,.18)":"var(--surfA)",padding:"2px 8px",borderRadius:8,color:isOn?T.gold:"var(--faint)",fontWeight:500}}>{it.count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoryPicker;
