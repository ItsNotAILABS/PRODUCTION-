export type DeviceLifecycle = 'new' | 'known' | 'verified' | 'unreachable' | 'quarantined';
export type DeviceHealth = 'online' | 'degraded' | 'offline';

export interface LanDeviceRecord {
  id: string;
  ip: string;
  hostname?: string;
  ports: number[];
  fingerprint: {
    server?: string;
    title?: string;
    obdBanner?: string;
    protocolHints: string[];
  };
  inferredType: 'router' | 'nas' | 'workstation' | 'phone' | 'tv' | 'obd' | 'iot' | 'unknown';
  capabilities: {
    http: boolean;
    https: boolean;
    obd: boolean;
    ssh: boolean;
  };
  lifecycle: DeviceLifecycle;
  health: DeviceHealth;
  riskLevel: 'low' | 'medium' | 'high';
  lastSeen: number;
  firstSeen: number;
  cycleLinked: number;
  notes?: string;
}

export interface MedinaCycleEvent {
  id: string;
  cycle: number;
  type: 'scan' | 'probe' | 'registry_update' | 'policy_denied';
  timestamp: number;
  actor: 'nova-lan-runtime';
  target?: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  doctrineHash: string;
  frozen: boolean;
}

interface ChainState {
  doctrineHash: string;
  lastHash: string;
  nextCycle: number;
  frozenCycles: number;
}

interface ScopeSummary {
  runtime: string;
  boundaries: {
    discovery: string;
    identity: string;
    transportAdapters: string;
    credentials: string;
    execution: string;
    audit: string;
  };
  adapters: {
    http: { status: 'active'; mode: 'read-only'; ports: number[] };
    obd: { status: 'active'; mode: 'read-only'; ports: number[]; notes: string };
    ssh: { status: 'blocked'; mode: 'disabled'; ports: number[]; reason: string };
  };
  policy: {
    privateNetworkOnly: true;
    destructiveCommandsDenied: true;
    sshRequiresVault: true;
  };
}

export interface PublicFacingAgentDef {
  id: string;
  name: string;
  role: string;
  visibility: 'public-facing';
  status: 'active' | 'planned' | 'blocked';
  readOnly: boolean;
  adapter: 'http' | 'obd' | 'ssh' | 'multi';
}

const STORAGE = {
  registry: 'nova_lan_registry_v1',
  events: 'nova_medina_events_v1',
  chain: 'nova_medina_chain_v1',
} as const;

const DEFAULT_SCAN_HOST_LIMIT = 64;
const MAX_EVENTS = 600;
const MAX_DEVICES = 500;

function getStorage<T>(key: string, fallback: T): Promise<T> {
  return new Promise(resolve => {
    chrome.storage.local.get({ [key]: fallback }, data => resolve((data[key] as T) ?? fallback));
  });
}

function setStorage(values: Record<string, unknown>): Promise<void> {
  return new Promise(resolve => chrome.storage.local.set(values, () => resolve()));
}

function now() { return Date.now(); }

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function parseScanTarget(targetRaw: string, maxHosts = DEFAULT_SCAN_HOST_LIMIT): { base: string; ips: string[]; normalized: string } | { error: string } {
  const target = (targetRaw || '').trim();
  if (!target) return { error: 'Scan target required (example: 192.168.1.0/24).' };

  let base = '';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.0\/24$/.test(target)) {
    base = target.replace(/\.0\/24$/, '');
  } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
    base = target;
  } else {
    return { error: 'Only /24 private ranges are supported in Milestone 1 (example: 192.168.1.0/24).' };
  }

  const probe = `${base}.1`;
  if (!isPrivateIPv4(probe)) return { error: 'Network scope denied: only private IPv4 ranges are allowed.' };

  const ips: string[] = [];
  const end = Math.min(254, maxHosts);
  for (let i = 1; i <= end; i++) ips.push(`${base}.${i}`);
  return { base, ips, normalized: `${base}.0/24` };
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function inferType(ports: number[], server?: string, title?: string): LanDeviceRecord['inferredType'] {
  const s = (server || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (ports.includes(35000)) return 'obd';
  if (/router|openwrt|mikrotik|ubiquiti|netgear|tplink/.test(s + ' ' + t)) return 'router';
  if (/synology|qnap|truenas|nas/.test(s + ' ' + t)) return 'nas';
  if (/smart\s*tv|roku|chromecast|webos|tizen/.test(s + ' ' + t)) return 'tv';
  if (/android|iphone|ios|pixel|samsung/.test(s + ' ' + t)) return 'phone';
  if (ports.includes(22)) return 'workstation';
  if (ports.some(p => p === 80 || p === 443)) return 'iot';
  return 'unknown';
}

function riskFromDevice(d: Pick<LanDeviceRecord, 'ports' | 'inferredType'>): LanDeviceRecord['riskLevel'] {
  if (d.ports.includes(22)) return 'high';
  if (d.inferredType === 'router') return 'high';
  if (d.ports.includes(35000)) return 'medium';
  return 'low';
}

async function fetchProbe(url: string, timeoutMs = 1600): Promise<{ ok: boolean; status: number; server?: string; title?: string; bodySample?: string; reason?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
    const text = await res.text();
    clearTimeout(timer);
    const title = text.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim();
    return {
      ok: true,
      status: res.status,
      server: res.headers.get('server') || undefined,
      title,
      bodySample: text.substring(0, 180),
    };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

class NovaLanRuntime {
  private _scope: ScopeSummary = {
    runtime: 'Nova LAN Runtime v1 (Milestone 1)',
    boundaries: {
      discovery: 'Subnet-level read-only discovery and protocol fingerprinting',
      identity: 'Persistent LAN Device Registry (IP, ports, fingerprint, lifecycle, health, cycle linkage)',
      transportAdapters: 'HTTP active, OBD read-only over HTTP probe, SSH blocked until vault',
      credentials: 'VAUL boundary defined; storage/execution disabled in Milestone 1',
      execution: 'Read-only probe execution only; no destructive commands',
      audit: 'MEDINA-style immutable cycle events with hash chaining and frozen cycles',
    },
    adapters: {
      http: { status: 'active', mode: 'read-only', ports: [80, 443] },
      obd: { status: 'active', mode: 'read-only', ports: [35000], notes: 'Connectivity and banner probe only in Milestone 1' },
      ssh: { status: 'blocked', mode: 'disabled', ports: [22], reason: 'Requires VAUL credential vault + explicit consent gate' },
    },
    policy: {
      privateNetworkOnly: true,
      destructiveCommandsDenied: true,
      sshRequiresVault: true,
    },
  };

  async getScope(): Promise<ScopeSummary> {
    const chain = await this._getChain();
    return {
      ...this._scope,
      boundaries: {
        ...this._scope.boundaries,
        audit: `${this._scope.boundaries.audit} · doctrine ${chain.doctrineHash.substring(0, 12)}… · frozen cycles ${chain.frozenCycles}`,
      },
    };
  }

  getPublicFacingAgents(): PublicFacingAgentDef[] {
    return [
      {
        id: 'public-net-scout',
        name: 'Net Scout',
        role: 'Discovers private-network devices and classifies reachable services',
        visibility: 'public-facing',
        status: 'active',
        readOnly: true,
        adapter: 'multi',
      },
      {
        id: 'public-endpoint-mapper',
        name: 'Endpoint Mapper',
        role: 'Probes HTTP/HTTPS endpoints and extracts API/service fingerprints',
        visibility: 'public-facing',
        status: 'active',
        readOnly: true,
        adapter: 'http',
      },
      {
        id: 'public-obd-scout',
        name: 'OBD Scout',
        role: 'Identifies OBD over Wi-Fi surfaces and runs read-only diagnostics connectivity checks',
        visibility: 'public-facing',
        status: 'active',
        readOnly: true,
        adapter: 'obd',
      },
      {
        id: 'public-secure-shell',
        name: 'Secure Shell Operator',
        role: 'SSH automation agent gated behind VAUL credentials and explicit consent',
        visibility: 'public-facing',
        status: 'blocked',
        readOnly: false,
        adapter: 'ssh',
      },
    ];
  }

  async listDevices(): Promise<LanDeviceRecord[]> {
    const reg = await this._getRegistry();
    return reg.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  async listEvents(limit = 60): Promise<MedinaCycleEvent[]> {
    const all = await this._getEvents();
    return all.slice(0, Math.max(1, Math.min(250, limit)));
  }

  async getCycles(limit = 20): Promise<Array<{ cycle: number; events: number; lastHash: string; timestamp: number; frozen: boolean; types: string[] }>> {
    const events = await this._getEvents();
    const grouped = new Map<number, MedinaCycleEvent[]>();
    for (const e of events) {
      const g = grouped.get(e.cycle) || [];
      g.push(e);
      grouped.set(e.cycle, g);
    }
    return [...grouped.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, Math.max(1, Math.min(200, limit)))
      .map(([cycle, evs]) => ({
        cycle,
        events: evs.length,
        lastHash: evs[0]?.hash || '',
        timestamp: Math.max(...evs.map(e => e.timestamp)),
        frozen: evs.every(e => e.frozen),
        types: [...new Set(evs.map(e => e.type))],
      }));
  }

  async setLifecycle(deviceId: string, lifecycle: DeviceLifecycle): Promise<{ updated: boolean; device?: LanDeviceRecord }> {
    const reg = await this._getRegistry();
    const idx = reg.findIndex(d => d.id === deviceId);
    if (idx < 0) return { updated: false };
    reg[idx] = { ...reg[idx], lifecycle };
    await this._saveRegistry(reg);
    await this._emit('registry_update', reg[idx].ip, { deviceId, lifecycle, reason: 'operator_action' });
    return { updated: true, device: reg[idx] };
  }

  async scanSubnet(target: string): Promise<{ success: boolean; message: string; target?: string; discovered?: number; live?: number; devices?: LanDeviceRecord[] }> {
    const parsed = parseScanTarget(target);
    if ('error' in parsed) {
      await this._emit('policy_denied', target, { reason: parsed.error, action: 'scan' });
      return { success: false, message: parsed.error };
    }

    const probed = await mapLimit(parsed.ips, 24, ip => this._probeIp(ip));
    const live = probed.filter(p => p.live);
    const updates: LanDeviceRecord[] = [];
    for (const hit of live) {
      const d = await this._upsertDiscovered(hit);
      updates.push(d);
    }

    await this._emit('scan', parsed.normalized, {
      hostsProbed: parsed.ips.length,
      liveHosts: live.length,
      discoveredDeviceIds: updates.map(d => d.id),
      mode: 'read-only',
    });

    return {
      success: true,
      message: `Scan complete: ${live.length}/${parsed.ips.length} hosts responded in ${parsed.normalized}.`,
      target: parsed.normalized,
      discovered: parsed.ips.length,
      live: live.length,
      devices: updates,
    };
  }

  async probeDevice(deviceId: string): Promise<{ success: boolean; message: string; device?: LanDeviceRecord }> {
    const reg = await this._getRegistry();
    const existing = reg.find(d => d.id === deviceId);
    if (!existing) return { success: false, message: 'Device not found.' };
    if (!isPrivateIPv4(existing.ip)) {
      await this._emit('policy_denied', existing.ip, { reason: 'private-range-only', action: 'probe' });
      return { success: false, message: 'Probe blocked by policy: target is outside private network scope.' };
    }

    const hit = await this._probeIp(existing.ip);
    const next = await this._upsertDiscovered(hit, existing.id);
    await this._emit('probe', existing.ip, {
      ports: next.ports,
      capabilities: next.capabilities,
      lifecycle: next.lifecycle,
      health: next.health,
    });

    return { success: true, message: `Probe complete for ${existing.ip}.`, device: next };
  }

  private async _probeIp(ip: string): Promise<{
    ip: string;
    live: boolean;
    ports: number[];
    server?: string;
    title?: string;
    obdBanner?: string;
    hints: string[];
  }> {
    if (!isPrivateIPv4(ip)) {
      return { ip, live: false, ports: [], hints: ['policy:private-range-only'] };
    }

    const [http80, https443, obd35000] = await Promise.all([
      fetchProbe(`http://${ip}`, 1500),
      fetchProbe(`https://${ip}`, 1800),
      fetchProbe(`http://${ip}:35000`, 1300),
    ]);

    const ports: number[] = [];
    const hints: string[] = [];
    let server = '';
    let title = '';
    let obdBanner = '';

    if (http80.ok) {
      ports.push(80);
      server = http80.server || server;
      title = http80.title || title;
      hints.push('http:open');
    }
    if (https443.ok) {
      ports.push(443);
      server = https443.server || server;
      title = https443.title || title;
      hints.push('https:open');
    }
    if (obd35000.ok) {
      ports.push(35000);
      obdBanner = obd35000.bodySample || '';
      hints.push('obd-candidate');
    }

    // SSH raw probing is intentionally blocked in milestone 1 without sockets+vault
    hints.push('ssh:blocked-until-vault');

    return {
      ip,
      live: ports.length > 0,
      ports,
      server: server || undefined,
      title: title || undefined,
      obdBanner: obdBanner || undefined,
      hints,
    };
  }

  private async _upsertDiscovered(hit: Awaited<ReturnType<NovaLanRuntime['_probeIp']>>, preferredId?: string): Promise<LanDeviceRecord> {
    const reg = await this._getRegistry();
    const existingIndex = reg.findIndex(d => (preferredId ? d.id === preferredId : d.ip === hit.ip));
    const ts = now();
    const base: LanDeviceRecord = existingIndex >= 0
      ? reg[existingIndex]
      : {
          id: preferredId || `dev-${hit.ip.replace(/\./g, '-')}`,
          ip: hit.ip,
          ports: [],
          fingerprint: { protocolHints: [] },
          inferredType: 'unknown',
          capabilities: { http: false, https: false, obd: false, ssh: false },
          lifecycle: 'new',
          health: 'offline',
          riskLevel: 'low',
          firstSeen: ts,
          lastSeen: ts,
          cycleLinked: 0,
        };

    const next: LanDeviceRecord = {
      ...base,
      ports: [...hit.ports].sort((a, b) => a - b),
      fingerprint: {
        server: hit.server || base.fingerprint.server,
        title: hit.title || base.fingerprint.title,
        obdBanner: hit.obdBanner || base.fingerprint.obdBanner,
        protocolHints: [...new Set([...(base.fingerprint.protocolHints || []), ...hit.hints])],
      },
      inferredType: inferType(hit.ports, hit.server || base.fingerprint.server, hit.title || base.fingerprint.title),
      capabilities: {
        http: hit.ports.includes(80),
        https: hit.ports.includes(443),
        obd: hit.ports.includes(35000),
        ssh: false,
      },
      health: hit.live ? (hit.ports.length > 1 ? 'online' : 'degraded') : 'offline',
      lifecycle: hit.live ? (base.lifecycle === 'new' ? 'known' : base.lifecycle) : 'unreachable',
      riskLevel: riskFromDevice({ ports: hit.ports, inferredType: inferType(hit.ports, hit.server, hit.title) }),
      lastSeen: ts,
    };

    if (existingIndex >= 0) reg[existingIndex] = next;
    else reg.unshift(next);

    await this._saveRegistry(reg.slice(0, MAX_DEVICES));
    return next;
  }

  private async _getRegistry(): Promise<LanDeviceRecord[]> {
    return getStorage<LanDeviceRecord[]>(STORAGE.registry, []);
  }

  private async _saveRegistry(reg: LanDeviceRecord[]): Promise<void> {
    await setStorage({ [STORAGE.registry]: reg });
  }

  private async _getEvents(): Promise<MedinaCycleEvent[]> {
    return getStorage<MedinaCycleEvent[]>(STORAGE.events, []);
  }

  private async _saveEvents(events: MedinaCycleEvent[]): Promise<void> {
    await setStorage({ [STORAGE.events]: events });
  }

  private async _getChain(): Promise<ChainState> {
    const existing = await getStorage<ChainState | null>(STORAGE.chain, null);
    if (existing) return existing;
    const doctrineHash = await sha256('MEDINA::Nova Organism Runtime Spec v9::Doctrine Anchor');
    const seed: ChainState = {
      doctrineHash,
      lastHash: await sha256('GENESIS::NOVA::LAN::M1'),
      nextCycle: 1,
      frozenCycles: 0,
    };
    await setStorage({ [STORAGE.chain]: seed });
    return seed;
  }

  private async _emit(type: MedinaCycleEvent['type'], target: string, payload: Record<string, unknown>): Promise<MedinaCycleEvent> {
    const chain = await this._getChain();
    const timestamp = now();
    const cycle = chain.nextCycle;
    const eventInput = JSON.stringify({ cycle, type, target, timestamp, payload, prevHash: chain.lastHash, doctrineHash: chain.doctrineHash });
    const hash = await sha256(eventInput);

    const event: MedinaCycleEvent = {
      id: `evt-${cycle}-${timestamp}`,
      cycle,
      type,
      timestamp,
      actor: 'nova-lan-runtime',
      target,
      payload,
      prevHash: chain.lastHash,
      hash,
      doctrineHash: chain.doctrineHash,
      frozen: true,
    };

    const all = await this._getEvents();
    all.unshift(event);
    await this._saveEvents(all.slice(0, MAX_EVENTS));

    await setStorage({
      [STORAGE.chain]: {
        ...chain,
        lastHash: hash,
        nextCycle: cycle + 1,
        frozenCycles: chain.frozenCycles + 1,
      } satisfies ChainState,
    });

    return event;
  }
}

export const novaLanRuntime = new NovaLanRuntime();
