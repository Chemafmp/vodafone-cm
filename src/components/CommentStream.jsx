import { useState } from "react";
import { T } from "../data/constants.js";
import { genId, now, fmt } from "../utils/helpers.js";
import { Btn } from "./ui/index.jsx";

// ─── COMMENT STREAM ───────────────────────────────────────────────────────────
export default function CommentStream({change, currentUser, onUpdate}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const comments = change.comments || [];

  function addComment() {
    if (!text.trim()) return;
    const c = { id: genId(), by: currentUser.name, role: currentUser.role, at: now(), text: text.trim(), edited: false };
    onUpdate(ch => ({ ...ch, comments: [...(ch.comments||[]), c] }));
    setText("");
  }

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:12 }}>
        Comment Stream ({comments.length})
      </div>

      {/* existing comments */}
      <div style={{ marginBottom:16 }}>
        {comments.length === 0 && <div style={{ color:T.light, fontSize:13, fontStyle:"italic", padding:"12px 0" }}>No comments yet.</div>}
        {[...comments].reverse().map(c => (
          <div key={c.id} style={{ display:"flex", gap:11, padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:T.primaryBg, color:T.primary,
              display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 }}>
              {c.by.split(" ").map(w=>w[0]).join("").slice(0,2)}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", gap:8, alignItems:"baseline", marginBottom:4 }}>
                <span style={{ fontWeight:700, fontSize:13, color:T.text }}>{c.by}</span>
                <span style={{ fontSize:11, color:T.light, background:T.bg, border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 6px" }}>{c.role}</span>
                <span style={{ fontSize:11, color:T.light, marginLeft:"auto" }}>{fmt(c.at)}</span>
              </div>
              <div style={{ fontSize:13, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{c.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* input */}
      <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:9, overflow:"hidden" }}>
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}` }}>
          {["Write","Preview"].map(m => (
            <button key={m} onClick={()=>setPreview(m==="Preview")}
              style={{ padding:"7px 14px", border:"none", background:((m==="Preview")===preview)?T.primaryBg:"transparent",
                color:((m==="Preview")===preview)?T.primary:T.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              {m}
            </button>
          ))}
          <span style={{ marginLeft:"auto", fontSize:11, color:T.light, padding:"7px 12px" }}>Markdown supported</span>
        </div>
        {preview
          ? <div style={{ padding:"10px 14px", minHeight:80, fontSize:13, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{text||<span style={{color:T.light}}>Nothing to preview.</span>}</div>
          : <textarea value={text} onChange={e=>setText(e.target.value)} rows={3}
              placeholder="Leave a comment — supports Markdown…"
              style={{ width:"100%", padding:"10px 14px", border:"none", background:"transparent", fontFamily:"inherit",
                fontSize:13, color:T.text, resize:"vertical", outline:"none", lineHeight:1.6 }}/>
        }
        <div style={{ display:"flex", justifyContent:"flex-end", padding:"8px 12px", borderTop:`1px solid ${T.border}` }}>
          <Btn small disabled={!text.trim()} onClick={addComment}>Add Comment</Btn>
        </div>
      </div>
    </div>
  );
}
