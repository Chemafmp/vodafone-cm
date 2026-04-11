// ─── Correlation engine ───────────────────────────────────────────────────────
// Combines all signal layers into a 0-100 health score per market.
// Also generates a human-readable insight for the NOC engineer.
//
// Score semantics:
//   90-100  All signals nominal
//   70-89   Minor degradation — one signal in warning
//   40-69   Degraded — multiple signals or one critical
//   0-39    Incident — correlated signals suggest active outage
//
// Correlation bonus: if multiple independent sources agree on a problem,
// confidence is higher — extra penalty applied to reflect that.

// ─── Score computation ────────────────────────────────────────────────────────
export function computeCorrelation({ atlas, bgp, ioda, radar, ris }) {
  let score = 100;
  const alerts = [];  // active signal names, used for insight + cross-penalty

  // ── Atlas (RIPE Atlas ICMP latency + loss) ────────────────────────────────
  const atlasStatus = atlas?.status || "unknown";
  if (atlasStatus === "warning") {
    score -= 15;
    alerts.push("atlas");
  } else if (atlasStatus === "outage") {
    score -= 35;
    alerts.push("atlas");
  }

  // ── BGP visibility (RIPE Stat routing-status) ─────────────────────────────
  const bgpStatus = bgp?.status || "unknown";
  if (bgpStatus === "warning") {
    score -= 10;
    alerts.push("bgp");
  } else if (bgpStatus === "outage") {
    score -= 25;
    alerts.push("bgp");
  }

  // ── CAIDA IODA ────────────────────────────────────────────────────────────
  const iodaStatus = ioda?.status || "unknown";
  if (iodaStatus === "alert") {
    score -= 20;
    alerts.push("ioda");
  }

  // ── Cloudflare Radar ──────────────────────────────────────────────────────
  const radarStatus = radar?.status || "unknown";
  if (radarStatus === "alert") {
    score -= 10;
    alerts.push("radar");
  }

  // ── RIS Live (BGP events / withdrawals) ───────────────────────────────────
  const risStatus = ris?.status || "unknown";
  if (risStatus === "warn") {
    score -= 10;
    alerts.push("ris");
  } else if (risStatus === "alert") {
    score -= 20;
    alerts.push("ris");
  }

  // ── Correlation bonus penalty (signals confirming each other) ─────────────
  // Atlas + BGP both degraded: data plane + control plane → routing incident
  if (alerts.includes("atlas") && alerts.includes("bgp")) score -= 10;
  // Atlas + IODA: latency spike confirmed by outage detection system
  if (alerts.includes("atlas") && alerts.includes("ioda")) score -= 10;
  // BGP + RIS: visibility loss confirmed by real-time BGP stream
  if (alerts.includes("bgp")   && alerts.includes("ris"))  score -= 5;
  // Three or more signals: high-confidence incident
  if (alerts.length >= 3) score -= 10;

  score = Math.max(0, Math.min(100, score));

  // ── Status label ──────────────────────────────────────────────────────────
  const status = score >= 90 ? "ok"
    : score >= 70 ? "degraded"
    : score >= 40 ? "warning"
    : "incident";

  // ── Insight text ──────────────────────────────────────────────────────────
  const insight = buildInsight(alerts, { atlas, bgp, ioda, radar, ris, score, status });

  return {
    score,
    status,
    insight,
    alerts,   // signal names currently in alert — for dot coloring
  };
}

// ─── Insight text builder ─────────────────────────────────────────────────────
function buildInsight(alerts, { atlas, bgp, ioda, ris, score, status }) {
  if (alerts.length === 0) {
    return "All signals nominal — no correlation detected.";
  }

  const parts = [];

  if (alerts.includes("atlas")) {
    const ratio = atlas?.ratio ?? "?";
    parts.push(`RTT ${ratio}× above baseline`);
  }
  if (alerts.includes("bgp")) {
    const vis = bgp?.current?.visibility_pct;
    parts.push(`BGP visibility ${vis != null ? `${vis}%` : "degraded"}`);
  }
  if (alerts.includes("ioda")) {
    const n = ioda?.activeCount ?? ioda?.events?.filter(e => e.active).length ?? 1;
    parts.push(`IODA outage signal (${n} active event${n !== 1 ? "s" : ""})`);
  }
  if (alerts.includes("ris")) {
    const wd = ris?.withdrawals1h ?? "?";
    parts.push(`${wd} unique BGP withdrawal${wd !== 1 ? "s" : ""} in last 1h`);
  }

  const summary = parts.join(" · ");

  // Interpretation
  let interpretation = "";
  const hasDataPlane    = alerts.includes("atlas");
  const hasControlPlane = alerts.includes("bgp") || alerts.includes("ris");
  const hasExternal     = alerts.includes("ioda") || alerts.includes("radar");

  if (hasDataPlane && hasControlPlane) {
    interpretation = "→ routing incident affecting reachability, not application layer";
  } else if (hasControlPlane && !hasDataPlane) {
    interpretation = "→ BGP instability detected, may not yet impact end users";
  } else if (hasDataPlane && !hasControlPlane) {
    interpretation = "→ performance degradation without routing changes — check PoP/peering";
  } else if (hasExternal) {
    interpretation = "→ external outage signal detected, monitor for escalation";
  }

  if (alerts.length >= 3) {
    interpretation = "⚡ multi-layer correlation — high confidence incident";
  }

  return `${summary}${interpretation ? ". " + interpretation : ""}`;
}
