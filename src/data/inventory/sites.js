// ─── SITES + META ─────────────────────────────────────────────────────────────
export const SITES = [
  // ── FIJI ────────────────────────────────────────────────────────────────────
  { id:"fj-suva-dc1",       country:"FJ", name:"Suva DC1",              type:"DC",        city:"Suva"     },
  { id:"fj-lautoka-dc1",    country:"FJ", name:"Lautoka DC",            type:"DC",        city:"Lautoka"  },
  { id:"fj-suva-core1",     country:"FJ", name:"Suva Core PoP",         type:"Core PoP",  city:"Suva"     },
  { id:"fj-suva-ixp1",      country:"FJ", name:"Suva IXP1 — Telstra",   type:"IXP",       city:"Suva"     },
  { id:"fj-suva-ixp2",      country:"FJ", name:"Suva IXP2 — PCCW",      type:"IXP",       city:"Suva"     },

  // ── HAWAII ──────────────────────────────────────────────────────────────────
  { id:"hw-hnl1-dc1",       country:"HW", name:"Honolulu DC1",          type:"DC",        city:"Honolulu" },
  { id:"hw-hnl2-dc2",       country:"HW", name:"Honolulu DC2",          type:"DC",        city:"Honolulu" },
  { id:"hw-maui-dc1",       country:"HW", name:"Maui DC",               type:"DC",        city:"Kahului"  },
  { id:"hw-hnl-core1",      country:"HW", name:"Honolulu Core PoP",     type:"Core PoP",  city:"Honolulu" },
  { id:"hw-maui-core1",     country:"HW", name:"Maui APoP",             type:"APoP",      city:"Kahului"  },
  { id:"hw-hnl-ixp1",       country:"HW", name:"Honolulu IXP1 — AT&T",  type:"IXP",       city:"Honolulu" },
  { id:"hw-hnl-ixp2",       country:"HW", name:"Honolulu IXP2 — Cogent",type:"IXP",       city:"Honolulu" },
  { id:"hw-hnl-ixp3",       country:"HW", name:"Honolulu IXP3 — HE",    type:"IXP",       city:"Honolulu" },

  // ── IBIZA ───────────────────────────────────────────────────────────────────
  { id:"ib-town-dc1",        country:"IB", name:"Ibiza Town DC1",        type:"DC",        city:"Ibiza Town"    },
  { id:"ib-santantoni-dc1",  country:"IB", name:"Sant Antoni DC",        type:"DC",        city:"Sant Antoni"   },
  { id:"ib-santaeulalia-dc1",country:"IB", name:"Santa Eulalia DC",      type:"DC",        city:"Santa Eulalia" },
  { id:"ib-escanar-dc1",     country:"IB", name:"Es Canar DC",           type:"DC",        city:"Es Canar"      },
  { id:"ib-portinatx-dc1",   country:"IB", name:"Portinatx DC",          type:"DC",        city:"Portinatx"     },
  { id:"ib-town-core1",      country:"IB", name:"Ibiza Town Core PoP",   type:"Core PoP",  city:"Ibiza Town"    },
  { id:"ib-town-ixp1",       country:"IB", name:"IXP1 — Lumen",          type:"IXP",       city:"Ibiza Town"    },
  { id:"ib-town-ixp2",       country:"IB", name:"IXP2 — Telia",          type:"IXP",       city:"Ibiza Town"    },
  { id:"ib-town-ixp3",       country:"IB", name:"IXP3 — GTT",            type:"IXP",       city:"Ibiza Town"    },
  { id:"ib-town-ixp4",       country:"IB", name:"IXP4 — Zayo",           type:"IXP",       city:"Ibiza Town"    },
];

export const COUNTRY_META = {
  FJ:{ name:"Fiji",   flag:"🇫🇯", asn:"AS 65001", mgmt:"10.10.0.0/16", loopback:"172.16.1.0/24", p2p:"10.1.0.0/16" },
  HW:{ name:"Hawaii", flag:"🌺",  asn:"AS 65002", mgmt:"10.20.0.0/16", loopback:"172.16.2.0/24", p2p:"10.2.0.0/16" },
  IB:{ name:"Ibiza",  flag:"🏝",  asn:"AS 65003", mgmt:"10.30.0.0/16", loopback:"172.16.3.0/24", p2p:"10.3.0.0/16" },
};

export const LAYERS = [
  "IP Core","Internet GW","5G Core","Voice Core","DC Fabric","IP LAN",
  "BPoP","APoP","Transport","Security","Load Balancer","IT Infrastructure",
  "NMS Platform","BSS Platform",
];

export const LAYER_COLORS = {
  "IP Core":          "#1d4ed8",
  "Internet GW":      "#065f46",
  "5G Core":          "#6d28d9",
  "Voice Core":       "#be185d",
  "DC Fabric":        "#0e7490",
  "IP LAN":           "#374151",
  "BPoP":             "#92400e",
  "APoP":             "#9a3412",
  "Transport":        "#1e3a5f",
  "Security":         "#991b1b",
  "Load Balancer":    "#0f766e",
  "IT Infrastructure":"#4338ca",
  "NMS Platform":     "#1d4ed8",
  "BSS Platform":     "#7c3aed",
};
