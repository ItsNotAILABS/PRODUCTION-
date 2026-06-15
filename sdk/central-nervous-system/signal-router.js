/**
 * SIGNAL ROUTER — Intelligent Signal Routing with φ-Enhanced Pathways
 * 
 * The signal router provides intelligent routing of signals between components
 * with golden ratio weighted pathways, automatic path optimization, and
 * failover support.
 * 
 * @module sdk/central-nervous-system/signal-router
 * @version 2.0.0
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

/**
 * Routing strategies
 */
export const ROUTING_STRATEGIES = {
  DIRECT: 'direct', // Direct point-to-point
  BROADCAST: 'broadcast', // Send to all subscribers
  MULTICAST: 'multicast', // Send to specific group
  PHI_WEIGHTED: 'phi_weighted', // Route based on φ weights
  LOAD_BALANCED: 'load_balanced', // Balance across targets
  PRIORITY_QUEUE: 'priority_queue', // Priority-based routing
};

/**
 * Route selection algorithms
 */
export const ROUTE_SELECTION = {
  SHORTEST_PATH: 'shortest_path',
  LEAST_LOADED: 'least_loaded',
  HIGHEST_AFFINITY: 'highest_affinity',
  PHI_OPTIMAL: 'phi_optimal', // φ-enhanced optimal path
  ROUND_ROBIN: 'round_robin',
};

/**
 * Signal Router for intelligent signal distribution
 */
export class SignalRouter {
  constructor(options = {}) {
    this.defaultStrategy = options.defaultStrategy || ROUTING_STRATEGIES.BROADCAST;
    this.defaultSelection = options.defaultSelection || ROUTE_SELECTION.PHI_OPTIMAL;
    
    // Route definitions
    this.routes = new Map(); // signalType → route config
    this.pathways = new Map(); // routeId → pathway metadata
    
    // Component metadata
    this.components = new Map(); // componentId → metadata
    this.affinities = new Map(); // (source, target) → affinity score
    
    // Load tracking
    this.load = new Map(); // componentId → current load
    this.throughput = new Map(); // componentId → messages/sec
    
    // Round-robin state
    this.roundRobinIndex = new Map(); // signalType → current index
    
    // Statistics
    this.stats = {
      routesCreated: 0,
      signalsRouted: 0,
      pathwaysOptimized: 0,
      failovers: 0,
      broadcasts: 0,
    };
  }

  /**
   * Register a component with the router
   * 
   * @param {string} componentId - Component identifier
   * @param {Object} metadata - Component metadata
   */
  registerComponent(componentId, metadata = {}) {
    this.components.set(componentId, {
      id: componentId,
      type: metadata.type || 'unknown',
      capacity: metadata.capacity || 100,
      priority: metadata.priority || 0,
      ...metadata,
    });
    
    this.load.set(componentId, 0);
    this.throughput.set(componentId, 0);
  }

  /**
   * Unregister a component
   * 
   * @param {string} componentId - Component identifier
   */
  unregisterComponent(componentId) {
    this.components.delete(componentId);
    this.load.delete(componentId);
    this.throughput.delete(componentId);
    
    // Remove from routes
    for (const [signalType, route] of this.routes) {
      if (route.targets) {
        route.targets = route.targets.filter(t => t !== componentId);
      }
    }
  }

  /**
   * Define a route for a signal type
   * 
   * @param {string} signalType - Type of signal
   * @param {Object} routeConfig - Route configuration
   */
  defineRoute(signalType, routeConfig) {
    this.routes.set(signalType, {
      signalType,
      strategy: routeConfig.strategy || this.defaultStrategy,
      selection: routeConfig.selection || this.defaultSelection,
      targets: routeConfig.targets || [],
      filters: routeConfig.filters || [],
      transformers: routeConfig.transformers || [],
      priority: routeConfig.priority || 0,
      ...routeConfig,
    });
    
    this.stats.routesCreated++;
  }

  /**
   * Route a signal to appropriate targets
   * 
   * @param {Object} signal - Signal to route
   * @returns {Promise<Array>} Array of routing results
   */
  async route(signal) {
    this.stats.signalsRouted++;
    
    // Get route config for this signal type
    const route = this.routes.get(signal.type);
    if (!route) {
      // No specific route, use default broadcast
      return this.broadcast(signal);
    }
    
    // Apply filters
    if (!this.passesFilters(signal, route.filters)) {
      return [];
    }
    
    // Transform signal if needed
    const transformedSignal = this.applyTransformers(signal, route.transformers);
    
    // Select routing strategy
    switch (route.strategy) {
      case ROUTING_STRATEGIES.DIRECT:
        return this.routeDirect(transformedSignal, route);
      
      case ROUTING_STRATEGIES.BROADCAST:
        return this.routeBroadcast(transformedSignal, route);
      
      case ROUTING_STRATEGIES.MULTICAST:
        return this.routeMulticast(transformedSignal, route);
      
      case ROUTING_STRATEGIES.PHI_WEIGHTED:
        return this.routePhiWeighted(transformedSignal, route);
      
      case ROUTING_STRATEGIES.LOAD_BALANCED:
        return this.routeLoadBalanced(transformedSignal, route);
      
      case ROUTING_STRATEGIES.PRIORITY_QUEUE:
        return this.routePriorityQueue(transformedSignal, route);
      
      default:
        return this.routeBroadcast(transformedSignal, route);
    }
  }

  /**
   * Direct routing to specific target
   */
  async routeDirect(signal, route) {
    if (!signal.targetId) {
      return [];
    }
    
    const component = this.components.get(signal.targetId);
    if (!component) {
      return [{ targetId: signal.targetId, success: false, error: 'Component not found' }];
    }
    
    return [{
      targetId: signal.targetId,
      success: true,
      pathway: this.createPathway(signal.source, signal.targetId),
    }];
  }

  /**
   * Broadcast to all registered targets
   */
  async routeBroadcast(signal, route) {
    this.stats.broadcasts++;
    
    const targets = route.targets.length > 0 ? route.targets : Array.from(this.components.keys());
    const results = [];
    
    for (const targetId of targets) {
      const component = this.components.get(targetId);
      if (component && targetId !== signal.source) {
        this.incrementLoad(targetId);
        results.push({
          targetId,
          success: true,
          pathway: this.createPathway(signal.source, targetId),
        });
      }
    }
    
    return results;
  }

  /**
   * Multicast to specific group
   */
  async routeMulticast(signal, route) {
    const results = [];
    
    for (const targetId of route.targets) {
      const component = this.components.get(targetId);
      if (component && targetId !== signal.source) {
        this.incrementLoad(targetId);
        results.push({
          targetId,
          success: true,
          pathway: this.createPathway(signal.source, targetId),
        });
      }
    }
    
    return results;
  }

  /**
   * Route based on φ-weighted scores
   */
  async routePhiWeighted(signal, route) {
    const targets = route.targets.length > 0 ? route.targets : Array.from(this.components.keys());
    
    // Calculate φ-weighted scores for each target
    const scored = targets
      .filter(targetId => targetId !== signal.source)
      .map(targetId => {
        const component = this.components.get(targetId);
        if (!component) return null;
        
        const affinity = this.getAffinity(signal.source, targetId);
        const load = this.load.get(targetId) || 0;
        const capacity = component.capacity || 100;
        const priority = component.priority || 0;
        
        // φ-enhanced score calculation
        const score = 
          Math.pow(PHI, priority) *        // Priority weight
          affinity *                        // Component affinity
          (1 - (load / capacity)) *         // Inverse load
          PHI_INV;                          // Golden ratio normalization
        
        return { targetId, score, component };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    
    // Select top targets based on selection algorithm
    const selected = this.selectTargets(scored, route);
    
    const results = [];
    for (const { targetId } of selected) {
      this.incrementLoad(targetId);
      results.push({
        targetId,
        success: true,
        pathway: this.createPathway(signal.source, targetId),
      });
    }
    
    return results;
  }

  /**
   * Route with load balancing
   */
  async routeLoadBalanced(signal, route) {
    const targets = route.targets.length > 0 ? route.targets : Array.from(this.components.keys());
    
    // Find least loaded target
    let minLoad = Infinity;
    let selectedTarget = null;
    
    for (const targetId of targets) {
      if (targetId === signal.source) continue;
      
      const component = this.components.get(targetId);
      if (!component) continue;
      
      const load = this.load.get(targetId) || 0;
      const capacity = component.capacity || 100;
      const loadRatio = load / capacity;
      
      if (loadRatio < minLoad) {
        minLoad = loadRatio;
        selectedTarget = targetId;
      }
    }
    
    if (!selectedTarget) return [];
    
    this.incrementLoad(selectedTarget);
    return [{
      targetId: selectedTarget,
      success: true,
      pathway: this.createPathway(signal.source, selectedTarget),
    }];
  }

  /**
   * Route through priority queue
   */
  async routePriorityQueue(signal, route) {
    const targets = route.targets.length > 0 ? route.targets : Array.from(this.components.keys());
    
    // Sort by priority
    const prioritized = targets
      .filter(targetId => targetId !== signal.source)
      .map(targetId => ({
        targetId,
        priority: this.components.get(targetId)?.priority || 0,
      }))
      .sort((a, b) => b.priority - a.priority);
    
    if (prioritized.length === 0) return [];
    
    const targetId = prioritized[0].targetId;
    this.incrementLoad(targetId);
    
    return [{
      targetId,
      success: true,
      pathway: this.createPathway(signal.source, targetId),
    }];
  }

  /**
   * Broadcast to all components (no route config needed)
   */
  async broadcast(signal) {
    this.stats.broadcasts++;
    
    const results = [];
    for (const [targetId, component] of this.components) {
      if (targetId !== signal.source) {
        this.incrementLoad(targetId);
        results.push({
          targetId,
          success: true,
          pathway: this.createPathway(signal.source, targetId),
        });
      }
    }
    
    return results;
  }

  /**
   * Set affinity score between two components
   * 
   * @param {string} sourceId - Source component
   * @param {string} targetId - Target component
   * @param {number} affinity - Affinity score (0-1)
   */
  setAffinity(sourceId, targetId, affinity) {
    const key = `${sourceId}→${targetId}`;
    this.affinities.set(key, Math.max(0, Math.min(1, affinity)));
  }

  /**
   * Get affinity score between two components
   */
  getAffinity(sourceId, targetId) {
    const key = `${sourceId}→${targetId}`;
    return this.affinities.get(key) || PHI_INV; // Default to φ⁻¹
  }

  /**
   * Optimize pathways based on usage patterns
   */
  optimizePathways() {
    this.stats.pathwaysOptimized++;
    
    // Analyze throughput and adjust affinities
    for (const [componentId, throughput] of this.throughput) {
      const component = this.components.get(componentId);
      if (!component) continue;
      
      const capacity = component.capacity || 100;
      const utilization = throughput / capacity;
      
      // Adjust affinities based on utilization
      // High utilization = lower affinity (avoid overload)
      if (utilization > 0.8) {
        for (const [otherComponentId] of this.components) {
          if (otherComponentId !== componentId) {
            const currentAffinity = this.getAffinity(otherComponentId, componentId);
            this.setAffinity(otherComponentId, componentId, currentAffinity * PHI_INV);
          }
        }
      }
    }
    
    // Reset throughput counters
    for (const componentId of this.throughput.keys()) {
      this.throughput.set(componentId, 0);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      routesCount: this.routes.size,
      componentsCount: this.components.size,
      pathwaysCount: this.pathways.size,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERNAL METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Check if signal passes filters
   */
  passesFilters(signal, filters) {
    if (!filters || filters.length === 0) return true;
    
    for (const filter of filters) {
      if (typeof filter === 'function') {
        if (!filter(signal)) return false;
      }
    }
    
    return true;
  }

  /**
   * Apply transformers to signal
   */
  applyTransformers(signal, transformers) {
    if (!transformers || transformers.length === 0) return signal;
    
    let transformed = { ...signal };
    
    for (const transformer of transformers) {
      if (typeof transformer === 'function') {
        transformed = transformer(transformed);
      }
    }
    
    return transformed;
  }

  /**
   * Select targets from scored list
   */
  selectTargets(scoredTargets, route) {
    const selection = route.selection || this.defaultSelection;
    const count = route.targetCount || 1;
    
    switch (selection) {
      case ROUTE_SELECTION.SHORTEST_PATH:
      case ROUTE_SELECTION.PHI_OPTIMAL:
      case ROUTE_SELECTION.HIGHEST_AFFINITY:
        return scoredTargets.slice(0, count);
      
      case ROUTE_SELECTION.LEAST_LOADED:
        return scoredTargets
          .sort((a, b) => {
            const loadA = this.load.get(a.targetId) || 0;
            const loadB = this.load.get(b.targetId) || 0;
            return loadA - loadB;
          })
          .slice(0, count);
      
      case ROUTE_SELECTION.ROUND_ROBIN: {
        const index = this.roundRobinIndex.get(route.signalType) || 0;
        const selected = scoredTargets[index % scoredTargets.length];
        this.roundRobinIndex.set(route.signalType, index + 1);
        return selected ? [selected] : [];
      }
      
      default:
        return scoredTargets.slice(0, count);
    }
  }

  /**
   * Create pathway metadata
   */
  createPathway(sourceId, targetId) {
    const pathwayId = `${sourceId}→${targetId}`;
    
    if (!this.pathways.has(pathwayId)) {
      this.pathways.set(pathwayId, {
        id: pathwayId,
        source: sourceId,
        target: targetId,
        usageCount: 0,
        createdAt: Date.now(),
      });
    }
    
    const pathway = this.pathways.get(pathwayId);
    pathway.usageCount++;
    pathway.lastUsed = Date.now();
    
    return pathway;
  }

  /**
   * Increment load for a component
   */
  incrementLoad(componentId) {
    const current = this.load.get(componentId) || 0;
    this.load.set(componentId, current + 1);
    
    const throughput = this.throughput.get(componentId) || 0;
    this.throughput.set(componentId, throughput + 1);
  }

  /**
   * Decrement load for a component
   */
  decrementLoad(componentId) {
    const current = this.load.get(componentId) || 0;
    this.load.set(componentId, Math.max(0, current - 1));
  }
}

export default SignalRouter;
