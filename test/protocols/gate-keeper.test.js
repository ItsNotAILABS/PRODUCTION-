const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('GateKeeperProtocol', () => {
  let GateKeeperProtocol;
  let GATEKEEPER_CONFIG;
  let MESSAGE_TYPES;
  let GATE_STATES;
  let THREAT_LEVELS;
  let ACCESS_POLICIES;
  let calculateThreatScore;
  let calculateTollAmount;
  let assessTrafficLoad;
  let getGateState;
  let protocol;

  beforeEach(async () => {
    const module = await import('../../protocols/gate-keeper-protocol.js');
    GateKeeperProtocol = module.GateKeeperProtocol;
    GATEKEEPER_CONFIG = module.GATEKEEPER_CONFIG;
    MESSAGE_TYPES = module.MESSAGE_TYPES;
    GATE_STATES = module.GATE_STATES;
    THREAT_LEVELS = module.THREAT_LEVELS;
    ACCESS_POLICIES = module.ACCESS_POLICIES;
    calculateThreatScore = module.calculateThreatScore;
    calculateTollAmount = module.calculateTollAmount;
    assessTrafficLoad = module.assessTrafficLoad;
    getGateState = module.getGateState;
    protocol = new GateKeeperProtocol();
  });

  describe('GATEKEEPER_CONFIG exports', () => {
    it('should export phi constant', () => {
      assert.ok(GATEKEEPER_CONFIG.PHI_CONSTANT > 1.6);
      assert.ok(GATEKEEPER_CONFIG.PHI_CONSTANT < 1.7);
    });

    it('should export threat thresholds', () => {
      assert.ok(GATEKEEPER_CONFIG.THREAT_LOW_THRESHOLD > 0);
      assert.ok(GATEKEEPER_CONFIG.THREAT_MEDIUM_THRESHOLD > GATEKEEPER_CONFIG.THREAT_LOW_THRESHOLD);
      assert.ok(GATEKEEPER_CONFIG.THREAT_HIGH_THRESHOLD > GATEKEEPER_CONFIG.THREAT_MEDIUM_THRESHOLD);
    });

    it('should export traffic limits', () => {
      assert.ok(GATEKEEPER_CONFIG.MAX_CONCURRENT_REQUESTS > 0);
      assert.ok(GATEKEEPER_CONFIG.RATE_LIMIT_PER_SECOND > 0);
    });

    it('should export toll rates', () => {
      assert.ok(GATEKEEPER_CONFIG.BASE_TOLL_RATE >= 0);
      assert.ok(GATEKEEPER_CONFIG.PREMIUM_TOLL_MULTIPLIER > 1);
    });

    it('should export timeout settings', () => {
      assert.ok(GATEKEEPER_CONFIG.REQUEST_TIMEOUT_MS > 0);
      assert.ok(GATEKEEPER_CONFIG.CONNECTION_TIMEOUT_MS > 0);
    });
  });

  describe('GATE_STATES exports', () => {
    it('should export all gate states', () => {
      assert.equal(GATE_STATES.OPEN, 'open');
      assert.equal(GATE_STATES.RESTRICTED, 'restricted');
      assert.equal(GATE_STATES.THROTTLED, 'throttled');
      assert.equal(GATE_STATES.CLOSED, 'closed');
      assert.equal(GATE_STATES.LOCKDOWN, 'lockdown');
    });
  });

  describe('THREAT_LEVELS exports', () => {
    it('should export all threat levels', () => {
      assert.equal(THREAT_LEVELS.NONE, 'none');
      assert.equal(THREAT_LEVELS.LOW, 'low');
      assert.equal(THREAT_LEVELS.MEDIUM, 'medium');
      assert.equal(THREAT_LEVELS.HIGH, 'high');
      assert.equal(THREAT_LEVELS.CRITICAL, 'critical');
    });
  });

  describe('ACCESS_POLICIES exports', () => {
    it('should export public policy', () => {
      assert.ok(ACCESS_POLICIES.PUBLIC);
      assert.equal(ACCESS_POLICIES.PUBLIC.restricted, false);
    });

    it('should export authenticated policy', () => {
      assert.ok(ACCESS_POLICIES.AUTHENTICATED);
      assert.equal(ACCESS_POLICIES.AUTHENTICATED.requiresAuth, true);
    });

    it('should export premium policy', () => {
      assert.ok(ACCESS_POLICIES.PREMIUM);
      assert.ok(ACCESS_POLICIES.PREMIUM.tollRequired);
    });

    it('should export internal policy', () => {
      assert.ok(ACCESS_POLICIES.INTERNAL);
      assert.equal(ACCESS_POLICIES.INTERNAL.restricted, true);
    });
  });

  describe('MESSAGE_TYPES exports', () => {
    it('should export gate messages', () => {
      assert.equal(MESSAGE_TYPES.GATE_OPEN, 'gate.open');
      assert.equal(MESSAGE_TYPES.GATE_CLOSE, 'gate.close');
      assert.equal(MESSAGE_TYPES.GATE_THROTTLE, 'gate.throttle');
      assert.equal(MESSAGE_TYPES.GATE_LOCKDOWN, 'gate.lockdown');
    });

    it('should export request messages', () => {
      assert.equal(MESSAGE_TYPES.REQUEST_ALLOW, 'request.allow');
      assert.equal(MESSAGE_TYPES.REQUEST_DENY, 'request.deny');
      assert.equal(MESSAGE_TYPES.REQUEST_QUEUE, 'request.queue');
      assert.equal(MESSAGE_TYPES.REQUEST_TIMEOUT, 'request.timeout');
    });

    it('should export threat messages', () => {
      assert.equal(MESSAGE_TYPES.THREAT_DETECTED, 'threat.detected');
      assert.equal(MESSAGE_TYPES.THREAT_CLEARED, 'threat.cleared');
      assert.equal(MESSAGE_TYPES.THREAT_ESCALATED, 'threat.escalated');
    });

    it('should export toll messages', () => {
      assert.equal(MESSAGE_TYPES.TOLL_COLLECTED, 'toll.collected');
      assert.equal(MESSAGE_TYPES.TOLL_WAIVED, 'toll.waived');
    });
  });

  describe('calculateThreatScore()', () => {
    it('should return threat score object', () => {
      const request = { ip: '192.168.1.1', userAgent: 'Mozilla', path: '/api/test' };
      const result = calculateThreatScore(request);
      assert.ok('score' in result);
      assert.ok('level' in result);
      assert.ok('factors' in result);
    });

    it('should return low threat for normal requests', () => {
      const request = { 
        ip: '192.168.1.1', 
        userAgent: 'Mozilla/5.0', 
        path: '/api/data',
        authenticated: true 
      };
      const result = calculateThreatScore(request);
      assert.ok(result.score < GATEKEEPER_CONFIG.THREAT_MEDIUM_THRESHOLD);
    });

    it('should increase score for suspicious paths', () => {
      const normal = calculateThreatScore({ ip: '1.1.1.1', path: '/api/data' });
      const suspicious = calculateThreatScore({ ip: '1.1.1.1', path: '/admin/config' });
      assert.ok(suspicious.score >= normal.score);
    });

    it('should increase score for missing user agent', () => {
      const withAgent = calculateThreatScore({ ip: '1.1.1.1', userAgent: 'Mozilla' });
      const withoutAgent = calculateThreatScore({ ip: '1.1.1.1', userAgent: '' });
      assert.ok(withoutAgent.score >= withAgent.score);
    });

    it('should include threat factors', () => {
      const result = calculateThreatScore({ ip: '1.1.1.1', path: '/api' });
      assert.ok(Array.isArray(result.factors));
    });
  });

  describe('calculateTollAmount()', () => {
    it('should return toll calculation object', () => {
      const result = calculateTollAmount('standard', 1024);
      assert.ok('baseToll' in result);
      assert.ok('multiplier' in result);
      assert.ok('totalToll' in result);
    });

    it('should return higher toll for premium tier', () => {
      const standard = calculateTollAmount('standard', 1024);
      const premium = calculateTollAmount('premium', 1024);
      assert.ok(premium.totalToll > standard.totalToll);
    });

    it('should scale toll with request size', () => {
      const small = calculateTollAmount('standard', 100);
      const large = calculateTollAmount('standard', 10000);
      assert.ok(large.totalToll > small.totalToll);
    });

    it('should waive toll for internal tier', () => {
      const result = calculateTollAmount('internal', 1024);
      assert.equal(result.totalToll, 0);
      assert.equal(result.waived, true);
    });

    it('should include traffic factor during peak', () => {
      const result = calculateTollAmount('standard', 1024, { peakHours: true });
      assert.ok(result.trafficFactor >= 1);
    });
  });

  describe('assessTrafficLoad()', () => {
    it('should return traffic assessment object', () => {
      const result = assessTrafficLoad(100, 1000);
      assert.ok('currentLoad' in result);
      assert.ok('capacity' in result);
      assert.ok('loadFactor' in result);
      assert.ok('recommendation' in result);
    });

    it('should recommend allow for low load', () => {
      const result = assessTrafficLoad(100, 1000);
      assert.equal(result.recommendation, 'allow');
    });

    it('should recommend throttle for high load', () => {
      const result = assessTrafficLoad(850, 1000);
      assert.equal(result.recommendation, 'throttle');
    });

    it('should recommend deny for overload', () => {
      const result = assessTrafficLoad(980, 1000);
      assert.equal(result.recommendation, 'deny');
    });

    it('should calculate load factor correctly', () => {
      const result = assessTrafficLoad(500, 1000);
      assert.equal(result.loadFactor, 0.5);
    });

    it('should include queue size', () => {
      const result = assessTrafficLoad(800, 1000);
      assert.ok('queueSize' in result);
    });
  });

  describe('getGateState()', () => {
    it('should return OPEN for low traffic and no threats', () => {
      assert.equal(getGateState(0.3, 'none'), GATE_STATES.OPEN);
    });

    it('should return RESTRICTED for elevated threats', () => {
      assert.equal(getGateState(0.3, 'medium'), GATE_STATES.RESTRICTED);
    });

    it('should return THROTTLED for high traffic', () => {
      assert.equal(getGateState(0.85, 'none'), GATE_STATES.THROTTLED);
    });

    it('should return CLOSED for critical conditions', () => {
      assert.equal(getGateState(0.95, 'high'), GATE_STATES.CLOSED);
    });

    it('should return LOCKDOWN for critical threats', () => {
      assert.equal(getGateState(0.5, 'critical'), GATE_STATES.LOCKDOWN);
    });
  });

  describe('GateKeeperProtocol constructor', () => {
    it('should initialize protocol ID', () => {
      assert.equal(protocol.protocolId, 'PROTO-232');
    });

    it('should initialize protocol name', () => {
      assert.ok(protocol.protocolName.includes('Gate'));
    });

    it('should initialize version', () => {
      assert.equal(protocol.version, '1.0.0');
    });

    it('should initialize empty gates map', () => {
      assert.equal(protocol.gates.size, 0);
    });

    it('should initialize empty routes map', () => {
      assert.equal(protocol.routes.size, 0);
    });

    it('should initialize empty blocked IPs set', () => {
      assert.equal(protocol.blockedIPs.size, 0);
    });

    it('should initialize empty message log', () => {
      assert.deepEqual(protocol.messageLog, []);
    });

    it('should initialize empty traffic history', () => {
      assert.deepEqual(protocol.trafficHistory, []);
    });

    it('should initialize empty threat log', () => {
      assert.deepEqual(protocol.threatLog, []);
    });
  });

  describe('getInfo()', () => {
    it('should return protocol metadata', () => {
      const info = protocol.getInfo();
      assert.equal(info.id, 'PROTO-232');
      assert.ok(info.name.includes('Gate'));
      assert.equal(info.version, '1.0.0');
    });

    it('should include description', () => {
      const info = protocol.getInfo();
      assert.ok(info.description.length > 0);
    });

    it('should include config', () => {
      const info = protocol.getInfo();
      assert.ok(info.config);
    });

    it('should include counts', () => {
      const info = protocol.getInfo();
      assert.ok(info.messageTypes > 0);
      assert.ok(info.gateStates > 0);
      assert.ok(info.threatLevels > 0);
      assert.ok(info.accessPolicies > 0);
    });
  });

  describe('registerGate()', () => {
    it('should register a new gate', () => {
      const result = protocol.registerGate('gate-1');
      assert.equal(result.success, true);
      assert.equal(result.gateId, 'gate-1');
    });

    it('should add gate to gates map', () => {
      protocol.registerGate('gate-1');
      assert.equal(protocol.gates.size, 1);
      assert.ok(protocol.gates.has('gate-1'));
    });

    it('should accept custom config', () => {
      protocol.registerGate('gate-1', { 
        maxConcurrent: 500,
        rateLimit: 100 
      });
      const gate = protocol.gates.get('gate-1');
      assert.equal(gate.maxConcurrent, 500);
      assert.equal(gate.rateLimit, 100);
    });

    it('should reject duplicate gate', () => {
      protocol.registerGate('gate-1');
      const result = protocol.registerGate('gate-1');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('already registered'));
    });

    it('should initialize gate in OPEN state', () => {
      protocol.registerGate('gate-1');
      const gate = protocol.gates.get('gate-1');
      assert.equal(gate.state, GATE_STATES.OPEN);
    });

    it('should log message on registration', () => {
      protocol.registerGate('gate-1');
      assert.ok(protocol.messageLog.length > 0);
      assert.equal(protocol.messageLog[0].type, MESSAGE_TYPES.GATE_OPEN);
    });
  });

  describe('registerRoute()', () => {
    beforeEach(() => {
      protocol.registerGate('gate-1');
    });

    it('should register a new route', () => {
      const result = protocol.registerRoute('/api/users', 'gate-1');
      assert.equal(result.success, true);
      assert.equal(result.path, '/api/users');
    });

    it('should add route to routes map', () => {
      protocol.registerRoute('/api/users', 'gate-1');
      assert.equal(protocol.routes.size, 1);
      assert.ok(protocol.routes.has('/api/users'));
    });

    it('should accept custom policy', () => {
      protocol.registerRoute('/api/users', 'gate-1', { 
        policy: ACCESS_POLICIES.AUTHENTICATED 
      });
      const route = protocol.routes.get('/api/users');
      assert.equal(route.policy.requiresAuth, true);
    });

    it('should reject duplicate route', () => {
      protocol.registerRoute('/api/users', 'gate-1');
      const result = protocol.registerRoute('/api/users', 'gate-1');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('already registered'));
    });

    it('should return error for unknown gate', () => {
      const result = protocol.registerRoute('/api/users', 'unknown');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('Gate not found'));
    });
  });

  describe('processRequest()', () => {
    beforeEach(() => {
      protocol.registerGate('gate-1');
      protocol.registerRoute('/api/data', 'gate-1');
    });

    it('should process allowed request', () => {
      const request = { ip: '192.168.1.1', path: '/api/data', userAgent: 'Mozilla' };
      const result = protocol.processRequest(request);
      assert.equal(result.success, true);
      assert.ok(result.allowed !== undefined);
    });

    it('should include threat assessment', () => {
      const request = { ip: '192.168.1.1', path: '/api/data' };
      const result = protocol.processRequest(request);
      assert.ok('threatLevel' in result);
      assert.ok('threatScore' in result);
    });

    it('should deny blocked IPs', () => {
      protocol.blockIP('10.0.0.1');
      const request = { ip: '10.0.0.1', path: '/api/data' };
      const result = protocol.processRequest(request);
      assert.equal(result.allowed, false);
      assert.ok(result.reason.includes('blocked'));
    });

    it('should include toll calculation when applicable', () => {
      protocol.registerRoute('/api/premium', 'gate-1', { policy: ACCESS_POLICIES.PREMIUM });
      const request = { ip: '192.168.1.1', path: '/api/premium', size: 1024 };
      const result = protocol.processRequest(request);
      assert.ok('toll' in result);
    });
  });

  describe('setGateState()', () => {
    beforeEach(() => {
      protocol.registerGate('gate-1');
    });

    it('should set gate state', () => {
      const result = protocol.setGateState('gate-1', GATE_STATES.THROTTLED);
      assert.equal(result.success, true);
      assert.equal(result.state, GATE_STATES.THROTTLED);
    });

    it('should return error for unknown gate', () => {
      const result = protocol.setGateState('unknown', GATE_STATES.OPEN);
      assert.equal(result.success, false);
    });

    it('should return error for invalid state', () => {
      const result = protocol.setGateState('gate-1', 'invalid');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('Invalid state'));
    });

    it('should log state change', () => {
      const initialLogLength = protocol.messageLog.length;
      protocol.setGateState('gate-1', GATE_STATES.CLOSED);
      assert.ok(protocol.messageLog.length > initialLogLength);
    });
  });

  describe('blockIP()', () => {
    it('should block an IP address', () => {
      const result = protocol.blockIP('10.0.0.1');
      assert.equal(result.success, true);
      assert.equal(result.ip, '10.0.0.1');
    });

    it('should add IP to blocked set', () => {
      protocol.blockIP('10.0.0.1');
      assert.ok(protocol.blockedIPs.has('10.0.0.1'));
    });

    it('should include reason when provided', () => {
      const result = protocol.blockIP('10.0.0.1', 'Suspicious activity');
      assert.equal(result.reason, 'Suspicious activity');
    });

    it('should log threat', () => {
      protocol.blockIP('10.0.0.1');
      assert.ok(protocol.threatLog.length > 0);
    });
  });

  describe('unblockIP()', () => {
    beforeEach(() => {
      protocol.blockIP('10.0.0.1');
    });

    it('should unblock an IP address', () => {
      const result = protocol.unblockIP('10.0.0.1');
      assert.equal(result.success, true);
    });

    it('should remove IP from blocked set', () => {
      protocol.unblockIP('10.0.0.1');
      assert.ok(!protocol.blockedIPs.has('10.0.0.1'));
    });

    it('should return success even for non-blocked IP', () => {
      const result = protocol.unblockIP('192.168.1.1');
      assert.equal(result.success, true);
    });
  });

  describe('collectToll()', () => {
    beforeEach(() => {
      protocol.registerGate('gate-1');
      protocol.registerRoute('/api/premium', 'gate-1', { policy: ACCESS_POLICIES.PREMIUM });
    });

    it('should collect toll for premium route', () => {
      const request = { path: '/api/premium', size: 1024, tier: 'premium' };
      const result = protocol.collectToll(request);
      assert.equal(result.success, true);
      assert.ok(result.amount > 0);
    });

    it('should return toll details', () => {
      const request = { path: '/api/premium', size: 1024, tier: 'standard' };
      const result = protocol.collectToll(request);
      assert.ok('amount' in result);
      assert.ok('tier' in result);
    });

    it('should log toll collection', () => {
      const request = { path: '/api/premium', size: 1024, tier: 'premium' };
      protocol.collectToll(request);
      assert.ok(protocol.messageLog.some(m => m.type === MESSAGE_TYPES.TOLL_COLLECTED));
    });
  });

  describe('getMetrics()', () => {
    it('should return protocol metrics', () => {
      const metrics = protocol.getMetrics();
      assert.ok('totalGates' in metrics);
      assert.ok('openGates' in metrics);
      assert.ok('totalRoutes' in metrics);
      assert.ok('blockedIPs' in metrics);
      assert.ok('totalRequests' in metrics);
      assert.ok('allowedRequests' in metrics);
      assert.ok('deniedRequests' in metrics);
      assert.ok('totalTollCollected' in metrics);
    });

    it('should count gates correctly', () => {
      protocol.registerGate('gate-1');
      protocol.registerGate('gate-2');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.totalGates, 2);
    });

    it('should count routes correctly', () => {
      protocol.registerGate('gate-1');
      protocol.registerRoute('/api/a', 'gate-1');
      protocol.registerRoute('/api/b', 'gate-1');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.totalRoutes, 2);
    });

    it('should count blocked IPs correctly', () => {
      protocol.blockIP('10.0.0.1');
      protocol.blockIP('10.0.0.2');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.blockedIPs, 2);
    });

    it('should count open gates', () => {
      protocol.registerGate('gate-1');
      protocol.registerGate('gate-2');
      protocol.setGateState('gate-2', GATE_STATES.CLOSED);
      const metrics = protocol.getMetrics();
      assert.equal(metrics.openGates, 1);
    });
  });
});
