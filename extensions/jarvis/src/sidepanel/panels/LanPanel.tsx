import React, { useCallback, useEffect, useMemo, useState } from 'react';

type Lifecycle = 'new' | 'known' | 'verified' | 'unreachable' | 'quarantined';

type Device = {
  id: string;
  ip: string;
  ports: number[];
  inferredType: string;
  lifecycle: Lifecycle;
  health: 'online' | 'degraded' | 'offline';
  riskLevel: 'low' | 'medium' | 'high';
  lastSeen: number;
  firstSeen: number;
  fingerprint: {
    server?: string;
    title?: string;
    protocolHints?: string[];
    obdBanner?: string;
  };
  capabilities: {
    http: boolean;
    https: boolean;
    obd: boolean;
    ssh: boolean;
  };
};

type Cycle = {
  cycle: number;
  events: number;
  lastHash: string;
  timestamp: number;
  frozen: boolean;
  types: string[];
};

type EventRow = {
  id: string;
  cycle: number;
  type: string;
  target?: string;
  timestamp: number;
  hash: string;
  prevHash: string;
};

type Scope = {
  runtime: string;
  boundaries: Record<string, string>;
  adapters: {
    http: { status: string; mode: string; ports: number[] };
    obd: { status: string; mode: string; ports: number[]; notes: string };
    ssh: { status: string; mode: string; ports: number[]; reason: string };
  };
};

type PublicAgent = {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'planned' | 'blocked';
  readOnly: boolean;
  adapter: 'http' | 'obd' | 'ssh' | 'multi';
};

const riskColor: Record<string, string> = {
  low: 'text-green-300 border-green-700/40 bg-green-900/20',
  medium: 'text-amber-300 border-amber-700/40 bg-amber-900/20',
  high: 'text-red-300 border-red-700/40 bg-red-900/20',
};

const lifeOpts: Lifecycle[] = ['new', 'known', 'verified', 'unreachable', 'quarantined'];

export default function LanPanel() {
  const [target, setTarget] = useState('192.168.1.0/24');
  const [scope, setScope] = useState<Scope | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [publicAgents, setPublicAgents] = useState<PublicAgent[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'lanGetScope' }, (r) => {
      if (!chrome.runtime.lastError && r?.success) setScope(r.scope as Scope);
    });
    chrome.runtime.sendMessage({ action: 'lanListDevices' }, (r) => {
      if (!chrome.runtime.lastError && r?.success) setDevices((r.devices || []) as Device[]);
    });
    chrome.runtime.sendMessage({ action: 'lanListEvents', limit: 25 }, (r) => {
      if (!chrome.runtime.lastError && r?.success) setEvents((r.events || []) as EventRow[]);
    });
    chrome.runtime.sendMessage({ action: 'lanGetCycles', limit: 12 }, (r) => {
      if (!chrome.runtime.lastError && r?.success) setCycles((r.cycles || []) as Cycle[]);
    });
    chrome.runtime.sendMessage({ action: 'lanListPublicAgents' }, (r) => {
      if (!chrome.runtime.lastError && r?.success) setPublicAgents((r.agents || []) as PublicAgent[]);
    });
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [refresh]);

  const scan = () => {
    setBusy(true);
    setMsg('Scanning…');
    chrome.runtime.sendMessage({ action: 'lanScan', target }, (r) => {
      setBusy(false);
      if (chrome.runtime.lastError) {
        setMsg(chrome.runtime.lastError.message);
        return;
      }
      setMsg(r?.message || (r?.success ? 'Scan complete.' : 'Scan failed.'));
      refresh();
    });
  };

  const probe = (deviceId: string) => {
    setBusy(true);
    chrome.runtime.sendMessage({ action: 'lanProbeDevice', deviceId }, (r) => {
      setBusy(false);
      setMsg(r?.message || (r?.success ? 'Probe complete.' : 'Probe failed.'));
      refresh();
    });
  };

  const setLifecycle = (deviceId: string, lifecycle: Lifecycle) => {
    chrome.runtime.sendMessage({ action: 'lanSetLifecycle', deviceId, lifecycle }, (r) => {
      setMsg(r?.message || (r?.success ? 'Lifecycle updated.' : 'Update failed.'));
      refresh();
    });
  };

  const counts = useMemo(() => ({
    online: devices.filter(d => d.health === 'online').length,
    risky: devices.filter(d => d.riskLevel === 'high').length,
    obd: devices.filter(d => d.capabilities?.obd).length,
  }), [devices]);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#0c0a07] text-gray-200">
      <div className="border border-[#2d2010] rounded p-2 bg-[#13100a]">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-amber-300">🌐 Nova LAN Runtime</div>
          <button onClick={refresh} className="text-xs text-amber-400 hover:text-amber-300">↻</button>
        </div>
        <div className="mt-1 text-[11px] text-gray-400">{scope?.runtime || 'Loading runtime scope…'}</div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <div className="rounded border border-[#2d2010] px-1.5 py-1">🟢 {counts.online} online</div>
          <div className="rounded border border-[#2d2010] px-1.5 py-1">🚨 {counts.risky} high risk</div>
          <div className="rounded border border-[#2d2010] px-1.5 py-1">🚗 {counts.obd} OBD</div>
        </div>
        <div className="mt-2 flex gap-1">
          <input
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="192.168.1.0/24"
            className="flex-1 bg-[#0d0b08] border border-[#2d2010] rounded px-2 py-1 text-xs outline-none focus:border-amber-700"
          />
          <button
            onClick={scan}
            disabled={busy}
            className="px-2 py-1 text-xs rounded border border-amber-700/40 bg-amber-900/30 text-amber-300 disabled:opacity-50"
          >
            {busy ? '…' : 'Scan'}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-amber-200/90 min-h-4">{msg}</div>
      </div>

      <div className="border border-[#2d2010] rounded bg-[#13100a]">
        <div className="px-2 py-1 border-b border-[#2d2010] text-xs text-amber-300">Inventory</div>
        {devices.length === 0 ? (
          <div className="px-2 py-3 text-xs text-gray-500">No devices discovered yet.</div>
        ) : (
          <div className="divide-y divide-[#2d2010]">
            {devices.map(d => (
              <div key={d.id} className="px-2 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-gray-100">{d.ip}</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${riskColor[d.riskLevel] || riskColor.low}`}>{d.riskLevel}</span>
                </div>
                <div className="text-[11px] text-gray-400">
                  {d.inferredType} · ports [{d.ports.join(', ') || 'none'}] · {d.health}
                </div>
                <div className="text-[10px] text-gray-500 truncate">
                  {d.fingerprint?.server || d.fingerprint?.title || (d.fingerprint?.protocolHints || []).join(' · ') || 'No fingerprint'}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => probe(d.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-700/40 bg-cyan-900/20 text-cyan-300"
                  >
                    Probe
                  </button>
                  <select
                    value={d.lifecycle}
                    onChange={e => setLifecycle(d.id, e.target.value as Lifecycle)}
                    className="text-[10px] bg-[#0d0b08] border border-[#2d2010] rounded px-1 py-0.5"
                  >
                    {lifeOpts.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <span className="text-[10px] text-gray-600 ml-auto">seen {new Date(d.lastSeen).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-[#2d2010] rounded bg-[#13100a]">
        <div className="px-2 py-1 border-b border-[#2d2010] text-xs text-amber-300">MEDINA Cycles</div>
        <div className="max-h-32 overflow-y-auto divide-y divide-[#2d2010]">
          {cycles.map(c => (
            <div key={c.cycle} className="px-2 py-1 text-[10px] text-gray-300">
              C{c.cycle} · {c.events} ev · {c.types.join(', ')} · {c.frozen ? 'frozen' : 'open'} · {c.lastHash.substring(0, 10)}…
            </div>
          ))}
          {cycles.length === 0 && <div className="px-2 py-2 text-xs text-gray-500">No cycles yet.</div>}
        </div>
      </div>

      <div className="border border-[#2d2010] rounded bg-[#13100a]">
        <div className="px-2 py-1 border-b border-[#2d2010] text-xs text-amber-300">Audit Events</div>
        <div className="max-h-36 overflow-y-auto divide-y divide-[#2d2010]">
          {events.map(e => (
            <div key={e.id} className="px-2 py-1 text-[10px] text-gray-300">
              <div>{e.type} · C{e.cycle} · {e.target || 'n/a'}</div>
              <div className="text-gray-600">{e.hash.substring(0, 14)}… ← {e.prevHash.substring(0, 14)}…</div>
            </div>
          ))}
          {events.length === 0 && <div className="px-2 py-2 text-xs text-gray-500">No events yet.</div>}
        </div>
      </div>

      {scope && (
        <div className="border border-[#2d2010] rounded p-2 bg-[#13100a] text-[10px] text-gray-400 space-y-1">
          <div className="text-amber-300">Adapter status</div>
          <div>HTTP: {scope.adapters.http.status} ({scope.adapters.http.mode})</div>
          <div>OBD: {scope.adapters.obd.status} ({scope.adapters.obd.mode})</div>
          <div>SSH: {scope.adapters.ssh.status} — {scope.adapters.ssh.reason}</div>
        </div>
      )}

      <div className="border border-[#2d2010] rounded bg-[#13100a]">
        <div className="px-2 py-1 border-b border-[#2d2010] text-xs text-amber-300">Public-facing agents</div>
        <div className="max-h-40 overflow-y-auto divide-y divide-[#2d2010]">
          {publicAgents.map(a => (
            <div key={a.id} className="px-2 py-1.5 text-[10px] text-gray-300">
              <div className="font-semibold text-gray-100">{a.name} <span className="text-gray-500">({a.id})</span></div>
              <div>{a.status} · {a.readOnly ? 'read-only' : 'rw'} · adapter {a.adapter}</div>
              <div className="text-gray-500">{a.role}</div>
            </div>
          ))}
          {publicAgents.length === 0 && <div className="px-2 py-2 text-xs text-gray-500">No public-facing agents defined.</div>}
        </div>
      </div>
    </div>
  );
}
