import { useState, useEffect, useRef, useCallback } from "react";

// Poller WebSocket URL — configurable via build-time env var.
// In local dev, falls back to ws://localhost:4000 (the launcher default).
// In production (GitHub Pages), set VITE_POLLER_WS=wss://api.yourdomain.com
// in .env.production before running `npm run build`.
const WS_URL = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
const RECONNECT_DELAY = 3000;

/**
 * Hook that connects to the Bodaphone Poller via WebSocket.
 *
 * Returns:
 *   - connected: boolean — true when WebSocket is open
 *   - liveAlarms: array — currently active alarms from the poller
 *   - liveEvents: array — recent events from the poller (newest first)
 *   - nodeSnapshots: object — { nodeId: { reachable, cpu, mem, temp, interfaces, bgpPeers } }
 *
 * If the poller is not running, everything stays empty and the app works
 * exactly as before (graceful fallback).
 */
export default function usePollerSocket() {
  const [connected, setConnected] = useState(false);
  const [liveAlarms, setLiveAlarms] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [nodeSnapshots, setNodeSnapshots] = useState({});

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    // Don't connect if already connected
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "init") {
            // Initial state dump when we first connect
            setLiveAlarms(msg.alarms || []);
            setLiveEvents(msg.events || []);
          }

          if (msg.type === "poll-result") {
            // Update node snapshots
            setNodeSnapshots(prev => ({ ...prev, ...msg.nodes }));

            // Merge new alarms
            if (msg.newAlarms?.length > 0) {
              setLiveAlarms(prev => [...msg.newAlarms, ...prev]);
            }

            // Remove resolved alarms from active list
            if (msg.resolvedAlarms?.length > 0) {
              const resolvedKeys = new Set(msg.resolvedAlarms.map(a => a.key));
              setLiveAlarms(prev => prev.filter(a => !resolvedKeys.has(a.key)));
            }

            // Prepend new events
            if (msg.newEvents?.length > 0) {
              setLiveEvents(prev => {
                const merged = [...msg.newEvents, ...prev];
                return merged.slice(0, 200); // keep last 200
              });
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Auto-reconnect after delay
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        // onclose will fire after this, which handles reconnect
        ws.close();
      };
    } catch {
      // WebSocket constructor can throw if URL is invalid
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected, liveAlarms, liveEvents, nodeSnapshots };
}
