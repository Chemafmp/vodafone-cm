// ─── PinScreen ────────────────────────────────────────────────────────────────
// Global access gate shown before the user login selector.
// PIN is set via VITE_ACCESS_PIN env var.
// On success, stores bnocPinOk in localStorage so PWA/TWA users
// don't have to re-enter it every time they open the app.

import { useState } from "react";
import { T } from "../data/constants.js";

const CORRECT_PIN = import.meta.env.VITE_ACCESS_PIN || "bnoc2025";

export default function PinScreen({ onUnlock }) {
  const [value, setValue]   = useState("");
  const [error, setError]   = useState(false);
  const [shake, setShake]   = useState(false);

  function handleSubmit(e) {
    e?.preventDefault();
    if (value.trim() === CORRECT_PIN) {
      localStorage.setItem("bnocPinOk", "1");
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setValue("");
      setTimeout(() => setShake(false), 600);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, padding: 24,
    }}>
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
        .pin-shake { animation: shake 0.5s ease; }
        .pin-input {
          width: 100%;
          background: ${T.surface};
          border: 1.5px solid ${T.border};
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 18px;
          font-family: "SF Mono", "Fira Code", monospace;
          letter-spacing: 0.25em;
          color: ${T.text};
          text-align: center;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .pin-input:focus {
          border-color: #e40000;
          box-shadow: 0 0 0 3px rgba(228,0,0,0.15);
        }
        .pin-input::placeholder { color: ${T.muted}; letter-spacing: 0.1em; font-size: 14px; }
        .pin-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #e40000, #9b0000);
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 12px;
          letter-spacing: 0.03em;
          transition: opacity 0.15s, transform 0.1s;
          box-shadow: 0 4px 16px rgba(228,0,0,0.35);
        }
        .pin-btn:hover  { opacity: 0.9; transform: translateY(-1px); }
        .pin-btn:active { opacity: 1;   transform: translateY(0); }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 360,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 64, height: 64, borderRadius: 20, marginBottom: 20,
          background: "linear-gradient(135deg,#e40000,#9b0000)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, color: "#fff", fontWeight: 900,
          boxShadow: "0 6px 24px rgba(228,0,0,0.45)",
        }}>B</div>

        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.5px", marginBottom: 4 }}>
          Bodaphone NOC
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 36 }}>
          Enter access code to continue
        </div>

        {/* PIN form */}
        <div className={shake ? "pin-shake" : ""} style={{ width: "100%" }}>
          <input
            className="pin-input"
            type="password"
            placeholder="Access code"
            value={value}
            onChange={e => { setValue(e.target.value); setError(false); }}
            onKeyDown={handleKey}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />

          {error && (
            <div style={{
              marginTop: 10, textAlign: "center",
              fontSize: 13, color: "#ef4444", fontWeight: 600,
            }}>
              Incorrect access code — try again
            </div>
          )}

          <button className="pin-btn" onClick={handleSubmit}>
            Enter
          </button>
        </div>

        <div style={{ marginTop: 32, fontSize: 11, color: T.muted, textAlign: "center", lineHeight: 1.6 }}>
          Restricted access · Bodaphone Internal
        </div>
      </div>
    </div>
  );
}
