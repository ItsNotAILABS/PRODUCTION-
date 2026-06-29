/**
 * PROTO-O007: Resource Allocation Protocol (RAP)
 * Derives from: SwarmIntelligenceProtocol, RewardSignalProtocol
 * Intelligent compute resource scheduling, bin-packing, and priority-based allocation.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const ALLOCATION_STATUS = Object.freeze({
  PENDING:   'pending',
  ALLOCATED: 'allocated',
  RUNNING:   'running',
  RELEASED:  'released',
  FAILED:    'failed',
});

export class ResourceAllocationProtocol {
  constructor(config = {}) {
    this.version       = '1.0.0';
    this.domain        = 'operations';
    this.overcommit    = config.overcommit ?? PHI_INV;  // ≈ 62% overcommit factor for memory
    this.metrics       = { allocations: 0, releases: 0, rejections: 0, utilization: 0 };
    this.#nodes        = new Map();   // nodeId → { cpu, memory, allocated: { cpu, memory } }
    this.#allocations  = new Map();   // allocationId → state
  }

  #nodes;
  #allocations;

  /**
   * Register a compute node.
   * @param {{ nodeId: string, cpuCores: number, memoryGb: number, tags?: string[], zone?: string }} node
   */
  registerNode(node) {
    this.#nodes.set(node.nodeId, {
      ...node,
      allocated: { cpu: 0, memory: 0 },
      allocations: [],
    });
  }

  deregisterNode(nodeId) {
    this.#nodes.delete(nodeId);
  }

  /**
   * Request resource allocation using phi-weighted bin-packing.
   * @param {{ id: string, cpuCores: number, memoryGb: number, priority?: number, tags?: string[], affinityZone?: string }} request
   * @returns {{ allocationId: string, nodeId: string|null, status: string, reason?: string }}
   */
  allocate(request) {
    const { id, cpuCores, memoryGb, priority = 1, tags = [], affinityZone } = request;
    this.metrics.allocations++;

    const candidates = [...this.#nodes.values()].filter((n) => {
      const freeCpu = n.cpuCores - n.allocated.cpu;
      const freeMem = n.memoryGb * (1 + this.overcommit) - n.allocated.memory;
      const tagMatch = tags.length === 0 || tags.every((t) => n.tags?.includes(t));
      const zoneMatch = !affinityZone || n.zone === affinityZone;
      return freeCpu >= cpuCores && freeMem >= memoryGb && tagMatch && zoneMatch;
    });

    if (candidates.length === 0) {
      this.metrics.rejections++;
      return { allocationId: id, nodeId: null, status: ALLOCATION_STATUS.FAILED, reason: 'no eligible node with sufficient resources' };
    }

    // Phi-weighted node scoring: prefer balanced utilization
    const best = candidates.reduce((acc, n) => {
      const cpuUtil = n.allocated.cpu / n.cpuCores;
      const memUtil = n.allocated.memory / n.memoryGb;
      // Favor nodes already partially used (bin-packing) but not over-loaded
      const score   = (cpuUtil * PHI + memUtil) / (PHI + 1) * (1 - Math.max(cpuUtil, memUtil) * PHI_INV);
      return score > acc.score ? { node: n, score } : acc;
    }, { node: candidates[0], score: -Infinity }).node;

    best.allocated.cpu    += cpuCores;
    best.allocated.memory += memoryGb;
    best.allocations.push(id);

    const alloc = {
      id, nodeId: best.nodeId, cpuCores, memoryGb, priority,
      status: ALLOCATION_STATUS.ALLOCATED,
      allocatedAt: new Date().toISOString(),
    };
    this.#allocations.set(id, alloc);

    return { allocationId: id, nodeId: best.nodeId, status: ALLOCATION_STATUS.ALLOCATED };
  }

  /**
   * Release an allocation, returning resources to the node.
   * @param {string} allocationId
   */
  release(allocationId) {
    const alloc = this.#allocations.get(allocationId);
    if (!alloc) throw new Error(`Allocation not found: ${allocationId}`);

    const node = this.#nodes.get(alloc.nodeId);
    if (node) {
      node.allocated.cpu    = Math.max(0, node.allocated.cpu    - alloc.cpuCores);
      node.allocated.memory = Math.max(0, node.allocated.memory - alloc.memoryGb);
      node.allocations      = node.allocations.filter((a) => a !== allocationId);
    }

    alloc.status     = ALLOCATION_STATUS.RELEASED;
    alloc.releasedAt = new Date().toISOString();
    this.metrics.releases++;
  }

  /**
   * Snapshot of cluster utilization.
   * @returns {{ nodes: number, totalCpu: number, allocatedCpu: number, totalMemGb: number, allocatedMemGb: number, cpuUtilPct: number, memUtilPct: number }}
   */
  clusterUtilization() {
    let totalCpu = 0, allocCpu = 0, totalMem = 0, allocMem = 0;
    for (const n of this.#nodes.values()) {
      totalCpu += n.cpuCores;
      allocCpu += n.allocated.cpu;
      totalMem += n.memoryGb;
      allocMem += n.allocated.memory;
    }
    const cpuPct = totalCpu > 0 ? Math.round((allocCpu / totalCpu) * 1000) / 10 : 0;
    const memPct = totalMem > 0 ? Math.round((allocMem / totalMem) * 1000) / 10 : 0;
    this.metrics.utilization = Math.round((cpuPct + memPct) / 2 * 10) / 10;
    return { nodes: this.#nodes.size, totalCpu, allocatedCpu: allocCpu, totalMemGb: totalMem, allocatedMemGb: allocMem, cpuUtilPct: cpuPct, memUtilPct: memPct };
  }

  /**
   * Suggest rebalancing moves to improve cluster balance.
   * @returns {{ from: string, to: string, allocationId: string, reason: string }[]}
   */
  suggestRebalance() {
    const utils = [...this.#nodes.values()].map((n) => ({
      nodeId: n.nodeId,
      cpuUtil: n.allocated.cpu / (n.cpuCores || 1),
      allocations: [...n.allocations],
    }));
    const overloaded  = utils.filter((n) => n.cpuUtil > 0.8);
    const underloaded = utils.filter((n) => n.cpuUtil < 0.4);
    const moves = [];

    for (const heavy of overloaded) {
      const target = underloaded[0];
      if (!target || heavy.allocations.length === 0) continue;
      moves.push({ from: heavy.nodeId, to: target.nodeId, allocationId: heavy.allocations[0], reason: `Rebalance from ${(heavy.cpuUtil * 100).toFixed(0)}% to ${(target.cpuUtil * 100).toFixed(0)}%` });
    }

    return moves;
  }

  get(allocationId) { return this.#allocations.get(allocationId); }

  listAllocations(nodeId) {
    const all = [...this.#allocations.values()];
    return nodeId ? all.filter((a) => a.nodeId === nodeId) : all;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default ResourceAllocationProtocol;
