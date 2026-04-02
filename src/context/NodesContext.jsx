import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { NODES as SEED_NODES } from "../data/inventory/index.js";

const LS_NODES = "bnoc-nodes";
const LS_TEMPLATES = "bnoc-node-templates";

const NodesCtx = createContext(null);

// ─── Role → vendor/model defaults for auto-discovery ────────────────────────
const ROLE_DEFAULTS = {
  cr:  { vendor:"Cisco",    hwModel:"ASR 9922",      osVersion:"IOS-XR 7.5.2" },
  pe:  { vendor:"Juniper",  hwModel:"MX204",         osVersion:"Junos 22.4R1" },
  igw: { vendor:"Juniper",  hwModel:"MX960",         osVersion:"Junos 22.4R1" },
  fw:  { vendor:"Palo Alto",hwModel:"PA-5430",       osVersion:"PAN-OS 11.1" },
  lb:  { vendor:"F5",       hwModel:"BIG-IP i5800",  osVersion:"TMOS 17.1" },
  "5gc":{ vendor:"Nokia",   hwModel:"AirFrame Open Edge",osVersion:"CBIS 22.8" },
  "distr-sw":{ vendor:"Arista",hwModel:"7050X3-48YC8",osVersion:"EOS 4.30.1F" },
  "acc-sw":{ vendor:"Cisco", hwModel:"C9300-48T",    osVersion:"IOS-XE 17.9.4a" },
  "dc-fabric":{ vendor:"Arista",hwModel:"7050X3-48YC8",osVersion:"EOS 4.30.1F" },
  dns: { vendor:"Infoblox", hwModel:"NIOS 4030",     osVersion:"NIOS 8.6.4" },
  nms: { vendor:"Dell",     hwModel:"PowerEdge R750", osVersion:"Ubuntu 22.04" },
  bss: { vendor:"Dell",     hwModel:"PowerEdge R750", osVersion:"RHEL 9.2" },
  "voip-gw":{ vendor:"Cisco",hwModel:"CUBE ISR 4461",osVersion:"IOS-XE 17.9.4a" },
  bpop:{ vendor:"Nokia",    hwModel:"7750 SR-7s",    osVersion:"SR OS 23.3.R1" },
};

// Parse hostname convention: {country}-{city}-{role}-{nn}
function parseHostname(h) {
  const m = h.match(/^(fj|hw|ib)-([a-z0-9]+)-(.+)-(\d+)$/i);
  if (!m) return null;
  return { country:m[1].toUpperCase(), city:m[2], role:m[3], num:m[4] };
}

// Merge seed-only fields (like patches) into localStorage-cached nodes
function mergeWithSeed(cached) {
  const seedMap = Object.fromEntries(SEED_NODES.map(n => [n.id, n]));
  return cached.map(n => {
    const seed = seedMap[n.id];
    if (!seed) return n;
    const merged = { ...n };
    if (seed.patches && !n.patches) merged.patches = seed.patches;
    return merged;
  });
}

export function NodesProvider({ children }) {
  const [nodes, setNodes] = useState(() => {
    try {
      const s = localStorage.getItem(LS_NODES);
      return s ? mergeWithSeed(JSON.parse(s)) : [...SEED_NODES];
    }
    catch { return [...SEED_NODES]; }
  });
  const [nodeTemplates, setNodeTemplates] = useState(() => {
    try { const s = localStorage.getItem(LS_TEMPLATES); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });

  useEffect(() => { localStorage.setItem(LS_NODES, JSON.stringify(nodes)); }, [nodes]);
  useEffect(() => { localStorage.setItem(LS_TEMPLATES, JSON.stringify(nodeTemplates)); }, [nodeTemplates]);

  const addNode = useCallback(node => {
    setNodes(prev => {
      if (prev.some(n => n.id === node.id)) return prev; // duplicate guard
      return [...prev, node];
    });
  }, []);

  const addNodes = useCallback(newNodes => {
    setNodes(prev => {
      const ids = new Set(prev.map(n => n.id));
      const unique = newNodes.filter(n => !ids.has(n.id));
      return unique.length ? [...prev, ...unique] : prev;
    });
  }, []);

  const updateNode = useCallback((id, updater) => {
    setNodes(prev => prev.map(n => n.id === id ? (typeof updater === "function" ? updater(n) : { ...n, ...updater }) : n));
  }, []);

  const deleteNode = useCallback(id => {
    // Also clean peer refs in other nodes' interfaces
    setNodes(prev => prev.filter(n => n.id !== id).map(n => ({
      ...n,
      interfaces: (n.interfaces || []).map(ifc => ifc.peer === id ? { ...ifc, peer: null } : ifc),
    })));
  }, []);

  const addNodeTemplate = useCallback(tmpl => {
    setNodeTemplates(prev => [...prev, tmpl]);
  }, []);

  const deleteNodeTemplate = useCallback(id => {
    setNodeTemplates(prev => prev.filter(t => t.templateId !== id));
  }, []);

  const resetNodes = useCallback(() => {
    setNodes([...SEED_NODES]);
    setNodeTemplates([]);
  }, []);

  // SNMP-style auto-discovery from hostname
  const autoDiscover = useCallback((hostname, mgmtIp) => {
    const parsed = parseHostname(hostname);
    const role = parsed?.role || "cr";
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.cr;
    const country = parsed?.country || "FJ";
    return {
      id: hostname,
      siteId: "",
      country,
      hostname: hostname + ".vodafone." + { FJ:"fj", HW:"hw", IB:"ib" }[country],
      vendor: defaults.vendor,
      hwModel: defaults.hwModel,
      layer: guessLayer(role),
      role,
      mgmtIp: mgmtIp || "",
      status: "UP",
      osVersion: defaults.osVersion,
      serialNumber: "",
      procurementDate: new Date().toISOString().slice(0, 10),
      eolDate: "",
      supportExpiry: "",
      rackUnit: "",
      powerConsumptionW: null,
      lastCommit: null,
      lineCards: [],
      powerSupplies: [],
      interfaces: [
        { name:"Loopback0", ip:"", description:"Router ID", peer:null, operStatus:"UP", speed:"—", mtu:65535, lastFlap:null, vlan:null },
        { name:"MgmtEth0/RSP0/CPU0/0", ip:mgmtIp || "", description:"Management", peer:null, operStatus:"UP", speed:"1G", mtu:1500, lastFlap:null, vlan:null },
      ],
      bgpNeighbors: [],
      services: [],
      goldenConfig: "",
    };
  }, []);

  return <NodesCtx.Provider value={{ nodes, nodeTemplates, addNode, addNodes, updateNode, deleteNode, addNodeTemplate, deleteNodeTemplate, resetNodes, autoDiscover }}>
    {children}
  </NodesCtx.Provider>;
}

export function useNodes() {
  const ctx = useContext(NodesCtx);
  if (!ctx) throw new Error("useNodes must be used inside NodesProvider");
  return ctx;
}

function guessLayer(role) {
  const map = {
    cr:"IP Core", pe:"IP Core", igw:"Internet GW", fw:"Security", lb:"Load Balancer",
    "5gc":"5G Core", "distr-sw":"IP LAN", "acc-sw":"IP LAN", "dc-fabric":"DC Fabric",
    dns:"IT Infrastructure", nms:"NMS Platform", bss:"BSS Platform", "voip-gw":"Voice Core",
    bpop:"BPoP", apop:"APoP",
  };
  return map[role] || "IP Core";
}
