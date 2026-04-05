import { createContext, useContext, useState, useMemo, useEffect, useRef } from "react";
import { SEED_CHANGES, DEMO_CHANGES, PEAK_PERIODS } from "../data/seed.js";
import { getActivePeak, initChangeCounter, initTemplateCounter } from "../utils/helpers.js";
import { fetchChanges, upsertChange, fetchPeaks, syncPeaks, resetToSeedDB, loadDemoDB, getCachedChanges, getCachedPeaks } from "../utils/db.js";

const ChangesCtx = createContext(null);

export function ChangesProvider({ children }) {
  const [changes, setChanges] = useState([]);
  const [peaks, setPeaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState(null);

  // ── Counter init ──
  const _countersReady = useRef(false);
  function _initCounters(c) {
    if (_countersReady.current) return;
    const maxC = c.filter(x => !x.isTemplate)
      .reduce((m, x) => { const n = parseInt(x.id?.match(/^BNOC-(\d+)-A$/)?.[1] || "0"); return Math.max(m, n); }, 0);
    const maxT = c.filter(x => x.isTemplate)
      .reduce((m, x) => { const n = parseInt(x.id?.match(/^BNOC-TEM-(\d+)-A$/)?.[1] || "0"); return Math.max(m, n); }, 0);
    initChangeCounter(maxC);
    initTemplateCounter(maxT);
    _countersReady.current = true;
  }

  // ── Load from Supabase on mount ──
  useEffect(() => {
    Promise.all([fetchChanges(), fetchPeaks()])
      .then(([c, p]) => {
        _initCounters(c);
        setChanges(c);
        setPeaks(p);
        setOffline(false);
      })
      .catch(e => {
        console.warn("[bnoc] Supabase unreachable, loading from local cache:", e);
        const c = getCachedChanges();
        const p = getCachedPeaks();
        _initCounters(c);
        setChanges(c);
        setPeaks(p);
        setOffline(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Sync peaks to Supabase ──
  const _peaksReady = useRef(false);
  useEffect(() => {
    if (!_peaksReady.current) { _peaksReady.current = true; return; }
    syncPeaks(peaks).catch(e => console.error("[bnoc] peaks sync failed:", e));
  }, [peaks]);

  // ── Hash-based change linking ──
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && hash.startsWith("BNOC-")) {
      const c = changes.find(x => x.id === hash);
      if (c) setSelected(c);
    }
  }, []);

  function selectChange(c) {
    setSelected(c);
    window.location.hash = c ? c.id : "";
  }
  function closeChange() {
    setSelected(null);
    window.location.hash = "";
  }

  function updateChange(id, updater) {
    setChanges(cs => {
      const next = cs.map(c => c.id === id ? (typeof updater === "function" ? updater(c) : { ...c, ...updater }) : c);
      const changed = next.find(c => c.id === id);
      if (changed) upsertChange(changed).catch(e => console.error("[bnoc] upsert failed:", e));
      return next;
    });
    setSelected(p => p?.id === id ? (typeof updater === "function" ? updater(p) : { ...p, ...updater }) : p);
  }

  function addChange(newC) {
    setChanges(cs => [newC, ...cs]);
    upsertChange(newC).catch(e => console.error("[bnoc] upsert new change failed:", e));
  }

  function deleteChange(id) {
    setChanges(cs => cs.filter(c => c.id !== id));
    closeChange();
  }

  function handleDemoData() {
    if (window.confirm("Load demo data? This will replace all current changes."))
      loadDemoDB(SEED_CHANGES, DEMO_CHANGES, PEAK_PERIODS)
        .then(() => { setChanges([...SEED_CHANGES, ...DEMO_CHANGES]); setPeaks(PEAK_PERIODS); })
        .catch(console.error);
  }

  function handleResetSeed() {
    if (window.confirm("Reset to seed data? Demo changes will be lost."))
      resetToSeedDB(SEED_CHANGES, PEAK_PERIODS)
        .then(() => { setChanges(SEED_CHANGES); setPeaks(PEAK_PERIODS); })
        .catch(console.error);
  }

  // ── Derived ──
  const templates = useMemo(() => changes.filter(c => c.isTemplate), [changes]);
  const crs = useMemo(() => changes.filter(c => !c.isTemplate), [changes]);
  const activePeak = useMemo(() => getActivePeak(peaks), [peaks]);

  const tmplStats = useMemo(() => {
    const m = {};
    crs.forEach(c => {
      if (!c.sourceTemplateId) return;
      if (!m[c.sourceTemplateId]) m[c.sourceTemplateId] = { total: 0, ok: 0, fail: 0, running: 0 };
      m[c.sourceTemplateId].total++;
      if (["Completed"].includes(c.status) || c.execResult === "Successful") m[c.sourceTemplateId].ok++;
      else if (["Failed", "Aborted", "Rolled Back", "Off-Script"].includes(c.status)) m[c.sourceTemplateId].fail++;
      else if (c.status === "In Execution") m[c.sourceTemplateId].running++;
    });
    return m;
  }, [crs]);

  const value = {
    changes, setChanges, peaks, setPeaks, loading, offline,
    selected, selectChange, closeChange,
    updateChange, addChange, deleteChange,
    templates, crs, activePeak, tmplStats,
    handleDemoData, handleResetSeed,
  };

  return <ChangesCtx.Provider value={value}>{children}</ChangesCtx.Provider>;
}

export function useChanges() {
  const ctx = useContext(ChangesCtx);
  if (!ctx) throw new Error("useChanges must be used inside ChangesProvider");
  return ctx;
}
