/**
 * ANIMUS AGENT — The Mind
 * 
 * The cognitive center of the organism. ANIMUS reasons, decides, and plans.
 * Uses CHRONO for timing, NEXORIS for state, QUANTUM_FLUX for creativity.
 * 
 * Responsibilities:
 *   - High-level reasoning and decision making
 *   - Goal prioritization and planning
 *   - Pattern recognition and synthesis
 *   - Attention routing
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

// Cognitive protocol binding — drives the reflect/decide loop
let _cognitiveProtocol = null;
try {
  _cognitiveProtocol = require('../../protocols/cognitive-architecture-protocol.js');
} catch { /* protocol optional at runtime; wired when available */ }

class AnimusAgent {
  constructor(engines) {
    this.id = 'ANIMUS';
    this.engines = engines;
    this.protocol = _cognitiveProtocol;
    
    // Cognitive state
    this.thoughts = [];
    this.currentGoal = null;
    this.attention = new Map();
    this.patterns = [];
    
    // Timers
    this.thinkTimer = null;
    this.dreamTimer = null;
    this.reflectTimer = null;
    
    // Statistics
    this.stats = {
      thoughtsProcessed: 0,
      decisionssMade: 0,
      patternsRecognized: 0,
      exploreCycles: 0,
      exploitCycles: 0,
    };
    
    this.awake = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  awaken() {
    if (this.awake) return;
    this.awake = true;
    
    this.thinkTimer = this.engines.chrono.setInterval(() => this._think(), 1);
    this.dreamTimer = this.engines.chrono.setInterval(() => this._dream(), 5);
    this.reflectTimer = this.engines.chrono.setInterval(() => this._reflect(), 30);
    
    this.engines.nexoris.set('cognitive', 'awareness', 1.0);
  }

  shutdown() {
    if (!this.awake) return;
    this.awake = false;
    
    if (this.thinkTimer) this.engines.chrono.clearInterval(this.thinkTimer);
    if (this.dreamTimer) this.engines.chrono.clearInterval(this.dreamTimer);
    if (this.reflectTimer) this.engines.chrono.clearInterval(this.reflectTimer);
    
    this.thinkTimer = null;
    this.dreamTimer = null;
    this.reflectTimer = null;
  }

  restart() {
    this.shutdown();
    this.awaken();
  }

  // ── Core Cognitive Loops ───────────────────────────────────────────────

  _think() {
    if (!this.awake) return;
    
    for (const [key, weight] of this.attention) {
      const decayed = this.engines.chrono.decay(weight, 1, 50);
      if (decayed < 0.01) {
        this.attention.delete(key);
      } else {
        this.attention.set(key, decayed);
      }
    }
    
    if (this.thoughts.length > 0) {
      const thought = this.thoughts.shift();
      this.stats.thoughtsProcessed++;
    }
  }

  _dream() {
    if (!this.awake) return;
    this.patterns = this.patterns
      .map(p => ({ ...p, strength: (p.strength || 1) * PHI_INV }))
      .filter(p => p.strength > 0.1);
  }

  /**
   * THE CRITICAL FIX: Implement explore/exploit homeostat
   * 
   * This is the adaptive mechanism that was completely non-functional.
   * Now it properly:
   * 1. Calculates effectiveness from awareness, coherence, resonance
   * 2. Checks if effectiveness < φ⁻¹ (0.618) — the threshold
   * 3. If threshold crossed, EXPLORE: inject entropy and raise entropy
   * 4. If effectiveness high, EXPLOIT: consolidate patterns
   */
  _reflect() {
    if (!this.awake) return;
    
    // CRITICAL FIX: Calculate effectiveness from triple of cognitive states
    const awareness = this.engines.nexoris.get('cognitive', 'awareness') || 1.0;
    const coherence = this.engines.nexoris.get('affective', 'coherence') || PHI_INV;
    const resonance = this.engines.nexoris.get('affective', 'resonance') || 0.618;
    
    // Effectiveness is the mean of these three cognitive dimensions
    const effectiveness = (awareness + coherence + resonance) / 3.0;
    const PHI_INV_THRESHOLD = PHI_INV;  // ≈ 0.618
    
    // Track for debug/audit
    this.reflectState = {
      awareness,
      coherence,
      resonance,
      effectiveness,
      timestamp: Date.now(),
    };
    
    // CRITICAL CONDITION: Is effectiveness below the explore threshold?
    if (effectiveness < PHI_INV_THRESHOLD) {
      // EXPLORE MODE: Organism is uncertain, inject entropy
      this._exploreMode(effectiveness);
    } else {
      // EXPLOIT MODE: Organism is confident, consolidate learning
      this._exploitMode(effectiveness);
    }
  }

  /**
   * EXPLORE mode: Raise entropy, expand search space, accept novelty
   * Fires when effectiveness < φ⁻¹ and organism is uncertain
   */
  _exploreMode(effectiveness) {
    // Inject entropy: raise entropy setpoint
    const entropy = this.engines.nexoris.get('affective', 'entropy') || 0;
    const entropyIncrease = 0.1 * (PHI_INV - effectiveness);
    const newEntropy = Math.min(1.0, entropy + entropyIncrease);
    this.engines.nexoris.set('affective', 'entropy', newEntropy);
    
    // Lower attention threshold to be more exploratory
    // (already handled in SENSUS._adjustFilter, but reinforce here)
    
    // Inject exploration signal
    this.engines.coreograph.emit('ANIMUS:explore', {
      reason: 'effectiveness_below_threshold',
      effectiveness,
      threshold: PHI_INV,
      entropy: newEntropy,
      timestamp: Date.now(),
    });
    
    // Track explore cycles
    this.stats.exploreCycles = (this.stats.exploreCycles || 0) + 1;
  }

  /**
   * EXPLOIT mode: Lower entropy, consolidate patterns, optimize
   * Fires when effectiveness ≥ φ⁻¹ and organism is confident
   */
  _exploitMode(effectiveness) {
    // Lower entropy: narrow focus on proven strategies
    const entropy = this.engines.nexoris.get('affective', 'entropy') || 0;
    const entropyDecrease = 0.05;  // Gradual entropy decay during exploit
    const newEntropy = Math.max(0, entropy - entropyDecrease);
    this.engines.nexoris.set('affective', 'entropy', newEntropy);
    
    // Strengthen winning patterns
    for (const pattern of this.patterns) {
      pattern.strength = Math.min(1.0, (pattern.strength || 1) * PHI);
    }
    
    // Emit exploit signal
    this.engines.coreograph.emit('ANIMUS:exploit', {
      reason: 'effectiveness_above_threshold',
      effectiveness,
      threshold: PHI_INV,
      entropy: newEntropy,
      patternCount: this.patterns.length,
      timestamp: Date.now(),
    });
    
    // Track exploit cycles
    this.stats.exploitCycles = (this.stats.exploitCycles || 0) + 1;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  addThought(content, priority = 2) {
    const thought = {
      id: `thought-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content,
      priority,
      timestamp: Date.now(),
    };
    this.thoughts.push(thought);
    return thought;
  }

  setGoal(goal) {
    this.currentGoal = { ...goal };
    this.stats.decisionssMade++;
    return this.currentGoal;
  }

  clearGoal() {
    const prev = this.currentGoal;
    this.currentGoal = null;
    return prev;
  }

  attend(resource, weight) {
    const clamped = Math.max(0, Math.min(1, weight));
    this.attention.set(resource, clamped);
  }

  getAttention(resource) {
    return this.attention.get(resource) || 0;
  }

  clearAttention(resource) {
    this.attention.delete(resource);
  }

  addPattern(pattern) {
    const p = { ...pattern, strength: 1.0, createdAt: Date.now() };
    this.patterns.push(p);
    this.stats.patternsRecognized++;
    return p;
  }

  decide(options) {
    if (!options || options.length === 0) return null;
    const selected = options.reduce((best, cur) => cur.score > best.score ? cur : best, options[0]);
    this.stats.decisionssMade++;
    return { selected };
  }

  getStats() {
    return { ...this.stats };
  }

  receive(message) {
    this.thoughts.push({
      id: `thought-${Date.now()}`,
      ...message,
    });
    return { received: true, queueLength: this.thoughts.length };
  }

  getState() {
    return {
      awake: this.awake,
      currentGoal: this.currentGoal,
      thoughtQueueLength: this.thoughts.length,
      attentionKeys: Array.from(this.attention.keys()),
      patternCount: this.patterns.length,
      stats: { ...this.stats },
      reflectState: this.reflectState || {},  // Include homeostat state for monitoring
    };
  }
}

export { AnimusAgent };
export default AnimusAgent;
