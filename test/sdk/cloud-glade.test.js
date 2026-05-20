const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('CloudGlade SDK', () => {
  let CloudGladeBiomeEngine;
  let PhantomIntegration;
  let BIOME_CONFIG;
  let SEASONS;
  let PHANTOM_PRIMITIVES;
  let THREAT_PLAYBOOKS;
  let biome;
  let phantom;

  beforeEach(async () => {
    const engineModule = await import('../../sdk/cloud-glade/src/biome-engine.js');
    CloudGladeBiomeEngine = engineModule.CloudGladeBiomeEngine;
    BIOME_CONFIG = engineModule.BIOME_CONFIG;
    SEASONS = engineModule.SEASONS;
    
    const phantomModule = await import('../../sdk/cloud-glade/src/phantom-integration.js');
    PhantomIntegration = phantomModule.PhantomIntegration;
    PHANTOM_PRIMITIVES = phantomModule.PHANTOM_PRIMITIVES;
    THREAT_PLAYBOOKS = phantomModule.THREAT_PLAYBOOKS;
    
    biome = new CloudGladeBiomeEngine();
    phantom = new PhantomIntegration();
  });

  describe('CloudGladeBiomeEngine', () => {
    describe('BIOME_CONFIG exports', () => {
      it('should export phi constant', () => {
        assert.ok(BIOME_CONFIG.PHI_CONSTANT > 1.6);
        assert.ok(BIOME_CONFIG.PHI_CONSTANT < 1.7);
      });

      it('should export seasonal cycle duration', () => {
        assert.ok(BIOME_CONFIG.SEASONAL_CYCLE_MS > 0);
      });

      it('should export ecosystem parameters', () => {
        assert.ok(BIOME_CONFIG.ECOSYSTEM_DIVERSITY > 0);
        assert.ok(BIOME_CONFIG.NUTRIENT_CYCLE_RATE > 0);
      });

      it('should export growth and decay rates', () => {
        assert.ok(BIOME_CONFIG.GROWTH_RATE > 0);
        assert.ok(BIOME_CONFIG.DECAY_RATE > 0);
      });
    });

    describe('SEASONS exports', () => {
      it('should export all seasons', () => {
        assert.ok(SEASONS.SPRING);
        assert.ok(SEASONS.SUMMER);
        assert.ok(SEASONS.AUTUMN);
        assert.ok(SEASONS.WINTER);
      });

      it('should have unique growth factors', () => {
        assert.ok(SEASONS.SPRING.growthFactor !== SEASONS.WINTER.growthFactor);
      });

      it('should include season duration', () => {
        assert.ok(SEASONS.SPRING.duration > 0);
      });
    });

    describe('constructor', () => {
      it('should initialize biome name', () => {
        assert.ok(biome.biomeName.includes('Cloud'));
      });

      it('should initialize version', () => {
        assert.equal(biome.version, '1.0.0');
      });

      it('should initialize empty organisms map', () => {
        assert.equal(biome.organisms.size, 0);
      });

      it('should initialize empty habitats map', () => {
        assert.equal(biome.habitats.size, 0);
      });

      it('should initialize current season', () => {
        assert.ok(biome.currentSeason);
      });

      it('should initialize ecosystem health', () => {
        assert.ok(biome.ecosystemHealth > 0);
      });

      it('should initialize empty event log', () => {
        assert.deepEqual(biome.eventLog, []);
      });
    });

    describe('getInfo()', () => {
      it('should return biome metadata', () => {
        const info = biome.getInfo();
        assert.ok(info.name.includes('Cloud'));
        assert.equal(info.version, '1.0.0');
      });

      it('should include description', () => {
        const info = biome.getInfo();
        assert.ok(info.description.length > 0);
      });

      it('should include config', () => {
        const info = biome.getInfo();
        assert.ok(info.config);
      });

      it('should include season info', () => {
        const info = biome.getInfo();
        assert.ok(info.currentSeason);
        assert.ok(info.ecosystemHealth > 0);
      });
    });

    describe('registerOrganism()', () => {
      it('should register a new organism', () => {
        const result = biome.registerOrganism('org-1');
        assert.equal(result.success, true);
        assert.equal(result.organismId, 'org-1');
      });

      it('should add organism to organisms map', () => {
        biome.registerOrganism('org-1');
        assert.equal(biome.organisms.size, 1);
        assert.ok(biome.organisms.has('org-1'));
      });

      it('should accept custom config', () => {
        biome.registerOrganism('org-1', { 
          species: 'guardian',
          health: 100 
        });
        const organism = biome.organisms.get('org-1');
        assert.equal(organism.species, 'guardian');
        assert.equal(organism.health, 100);
      });

      it('should reject duplicate organism', () => {
        biome.registerOrganism('org-1');
        const result = biome.registerOrganism('org-1');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('already registered'));
      });

      it('should log registration event', () => {
        biome.registerOrganism('org-1');
        assert.ok(biome.eventLog.length > 0);
      });
    });

    describe('registerHabitat()', () => {
      it('should register a new habitat', () => {
        const result = biome.registerHabitat('habitat-1');
        assert.equal(result.success, true);
        assert.equal(result.habitatId, 'habitat-1');
      });

      it('should add habitat to habitats map', () => {
        biome.registerHabitat('habitat-1');
        assert.equal(biome.habitats.size, 1);
        assert.ok(biome.habitats.has('habitat-1'));
      });

      it('should accept custom config', () => {
        biome.registerHabitat('habitat-1', { 
          type: 'forest',
          capacity: 100 
        });
        const habitat = biome.habitats.get('habitat-1');
        assert.equal(habitat.type, 'forest');
        assert.equal(habitat.capacity, 100);
      });

      it('should reject duplicate habitat', () => {
        biome.registerHabitat('habitat-1');
        const result = biome.registerHabitat('habitat-1');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('already registered'));
      });
    });

    describe('assignOrganismToHabitat()', () => {
      beforeEach(() => {
        biome.registerOrganism('org-1');
        biome.registerHabitat('habitat-1');
      });

      it('should assign organism to habitat', () => {
        const result = biome.assignOrganismToHabitat('org-1', 'habitat-1');
        assert.equal(result.success, true);
      });

      it('should update organism location', () => {
        biome.assignOrganismToHabitat('org-1', 'habitat-1');
        const organism = biome.organisms.get('org-1');
        assert.equal(organism.habitat, 'habitat-1');
      });

      it('should return error for unknown organism', () => {
        const result = biome.assignOrganismToHabitat('unknown', 'habitat-1');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('not found'));
      });

      it('should return error for unknown habitat', () => {
        const result = biome.assignOrganismToHabitat('org-1', 'unknown');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('not found'));
      });
    });

    describe('setSeason()', () => {
      it('should set current season', () => {
        const result = biome.setSeason('summer');
        assert.equal(result.success, true);
        assert.equal(result.season, 'summer');
      });

      it('should update currentSeason property', () => {
        biome.setSeason('winter');
        assert.equal(biome.currentSeason, 'winter');
      });

      it('should return error for invalid season', () => {
        const result = biome.setSeason('invalid');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('Invalid season'));
      });

      it('should log season change', () => {
        const initialLogLength = biome.eventLog.length;
        biome.setSeason('autumn');
        assert.ok(biome.eventLog.length > initialLogLength);
      });
    });

    describe('updateEcosystemHealth()', () => {
      it('should update ecosystem health', () => {
        const result = biome.updateEcosystemHealth(85);
        assert.equal(result.success, true);
        assert.equal(result.health, 85);
      });

      it('should clamp health to valid range', () => {
        biome.updateEcosystemHealth(150);
        assert.ok(biome.ecosystemHealth <= 100);
        
        biome.updateEcosystemHealth(-10);
        assert.ok(biome.ecosystemHealth >= 0);
      });

      it('should include previous health', () => {
        biome.ecosystemHealth = 75;
        const result = biome.updateEcosystemHealth(80);
        assert.equal(result.previousHealth, 75);
      });
    });

    describe('getMetrics()', () => {
      it('should return biome metrics', () => {
        const metrics = biome.getMetrics();
        assert.ok('totalOrganisms' in metrics);
        assert.ok('totalHabitats' in metrics);
        assert.ok('ecosystemHealth' in metrics);
        assert.ok('currentSeason' in metrics);
        assert.ok('seasonGrowthFactor' in metrics);
      });

      it('should count organisms correctly', () => {
        biome.registerOrganism('org-1');
        biome.registerOrganism('org-2');
        const metrics = biome.getMetrics();
        assert.equal(metrics.totalOrganisms, 2);
      });

      it('should count habitats correctly', () => {
        biome.registerHabitat('habitat-1');
        const metrics = biome.getMetrics();
        assert.equal(metrics.totalHabitats, 1);
      });
    });
  });

  describe('PhantomIntegration', () => {
    describe('PHANTOM_PRIMITIVES exports', () => {
      it('should export cloak primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.CLOAK);
        assert.equal(PHANTOM_PRIMITIVES.CLOAK.id, 'cloak');
      });

      it('should export shield primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.SHIELD);
        assert.equal(PHANTOM_PRIMITIVES.SHIELD.id, 'shield');
      });

      it('should export mirror primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.MIRROR);
        assert.equal(PHANTOM_PRIMITIVES.MIRROR.id, 'mirror');
      });

      it('should export trap primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.TRAP);
        assert.equal(PHANTOM_PRIMITIVES.TRAP.id, 'trap');
      });

      it('should export decoy primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.DECOY);
        assert.equal(PHANTOM_PRIMITIVES.DECOY.id, 'decoy');
      });

      it('should export phase primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.PHASE);
        assert.equal(PHANTOM_PRIMITIVES.PHASE.id, 'phase');
      });

      it('should export echo primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.ECHO);
        assert.equal(PHANTOM_PRIMITIVES.ECHO.id, 'echo');
      });

      it('should export void primitive', () => {
        assert.ok(PHANTOM_PRIMITIVES.VOID);
        assert.equal(PHANTOM_PRIMITIVES.VOID.id, 'void');
      });
    });

    describe('THREAT_PLAYBOOKS exports', () => {
      it('should export intrusion playbook', () => {
        assert.ok(THREAT_PLAYBOOKS.INTRUSION);
        assert.ok(THREAT_PLAYBOOKS.INTRUSION.steps);
      });

      it('should export ddos playbook', () => {
        assert.ok(THREAT_PLAYBOOKS.DDOS);
        assert.ok(THREAT_PLAYBOOKS.DDOS.steps);
      });

      it('should export data_exfil playbook', () => {
        assert.ok(THREAT_PLAYBOOKS.DATA_EXFIL);
        assert.ok(THREAT_PLAYBOOKS.DATA_EXFIL.steps);
      });

      it('should export malware playbook', () => {
        assert.ok(THREAT_PLAYBOOKS.MALWARE);
        assert.ok(THREAT_PLAYBOOKS.MALWARE.steps);
      });
    });

    describe('constructor', () => {
      it('should initialize integration name', () => {
        assert.ok(phantom.integrationName.includes('Phantom'));
      });

      it('should initialize version', () => {
        assert.equal(phantom.version, '1.0.0');
      });

      it('should initialize empty active primitives map', () => {
        assert.equal(phantom.activePrimitives.size, 0);
      });

      it('should initialize empty threat sessions map', () => {
        assert.equal(phantom.threatSessions.size, 0);
      });

      it('should initialize empty event log', () => {
        assert.deepEqual(phantom.eventLog, []);
      });
    });

    describe('getInfo()', () => {
      it('should return integration metadata', () => {
        const info = phantom.getInfo();
        assert.ok(info.name.includes('Phantom'));
        assert.equal(info.version, '1.0.0');
      });

      it('should include primitive count', () => {
        const info = phantom.getInfo();
        assert.ok(info.primitiveCount >= 8);
      });

      it('should include playbook count', () => {
        const info = phantom.getInfo();
        assert.ok(info.playbookCount >= 4);
      });
    });

    describe('activatePrimitive()', () => {
      it('should activate a primitive', () => {
        const result = phantom.activatePrimitive('cloak', 'target-1');
        assert.equal(result.success, true);
        assert.equal(result.primitive, 'cloak');
      });

      it('should add to active primitives', () => {
        phantom.activatePrimitive('shield', 'target-1');
        assert.ok(phantom.activePrimitives.size > 0);
      });

      it('should accept custom config', () => {
        const result = phantom.activatePrimitive('cloak', 'target-1', { 
          duration: 3600,
          strength: 0.9 
        });
        assert.equal(result.success, true);
      });

      it('should return error for invalid primitive', () => {
        const result = phantom.activatePrimitive('invalid', 'target-1');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('Invalid primitive'));
      });

      it('should log activation event', () => {
        phantom.activatePrimitive('mirror', 'target-1');
        assert.ok(phantom.eventLog.length > 0);
      });
    });

    describe('deactivatePrimitive()', () => {
      beforeEach(() => {
        phantom.activatePrimitive('cloak', 'target-1');
      });

      it('should deactivate a primitive', () => {
        const result = phantom.deactivatePrimitive('target-1', 'cloak');
        assert.equal(result.success, true);
      });

      it('should remove from active primitives', () => {
        const initialSize = phantom.activePrimitives.size;
        phantom.deactivatePrimitive('target-1', 'cloak');
        assert.ok(phantom.activePrimitives.size < initialSize || phantom.activePrimitives.size === 0);
      });

      it('should return success even for non-active primitive', () => {
        const result = phantom.deactivatePrimitive('target-1', 'void');
        assert.equal(result.success, true);
      });
    });

    describe('startPlaybook()', () => {
      it('should start a threat playbook', () => {
        const result = phantom.startPlaybook('intrusion', 'threat-123');
        assert.equal(result.success, true);
        assert.equal(result.playbook, 'intrusion');
      });

      it('should create threat session', () => {
        phantom.startPlaybook('ddos', 'threat-456');
        assert.ok(phantom.threatSessions.size > 0);
      });

      it('should return error for invalid playbook', () => {
        const result = phantom.startPlaybook('invalid', 'threat-123');
        assert.equal(result.success, false);
        assert.ok(result.error.includes('Invalid playbook'));
      });

      it('should include session ID', () => {
        const result = phantom.startPlaybook('malware', 'threat-789');
        assert.ok(result.sessionId);
      });

      it('should log playbook start', () => {
        phantom.startPlaybook('data_exfil', 'threat-000');
        assert.ok(phantom.eventLog.some(e => e.type === 'playbook.start'));
      });
    });

    describe('executePlaybookStep()', () => {
      let sessionId;

      beforeEach(() => {
        const result = phantom.startPlaybook('intrusion', 'threat-123');
        sessionId = result.sessionId;
      });

      it('should execute playbook step', () => {
        const result = phantom.executePlaybookStep(sessionId, 0);
        assert.equal(result.success, true);
      });

      it('should return error for invalid session', () => {
        const result = phantom.executePlaybookStep('invalid', 0);
        assert.equal(result.success, false);
        assert.ok(result.error.includes('Session not found'));
      });

      it('should include step details', () => {
        const result = phantom.executePlaybookStep(sessionId, 0);
        assert.ok('step' in result);
      });
    });

    describe('endPlaybook()', () => {
      let sessionId;

      beforeEach(() => {
        const result = phantom.startPlaybook('intrusion', 'threat-123');
        sessionId = result.sessionId;
      });

      it('should end playbook session', () => {
        const result = phantom.endPlaybook(sessionId);
        assert.equal(result.success, true);
      });

      it('should remove threat session', () => {
        phantom.endPlaybook(sessionId);
        assert.ok(!phantom.threatSessions.has(sessionId));
      });

      it('should return success for non-existent session', () => {
        const result = phantom.endPlaybook('non-existent');
        assert.equal(result.success, true);
      });

      it('should log playbook end', () => {
        phantom.endPlaybook(sessionId);
        assert.ok(phantom.eventLog.some(e => e.type === 'playbook.end'));
      });
    });

    describe('getMetrics()', () => {
      it('should return integration metrics', () => {
        const metrics = phantom.getMetrics();
        assert.ok('activePrimitiveCount' in metrics);
        assert.ok('activeThreatSessions' in metrics);
        assert.ok('totalEventsLogged' in metrics);
      });

      it('should count active primitives correctly', () => {
        phantom.activatePrimitive('cloak', 'target-1');
        phantom.activatePrimitive('shield', 'target-2');
        const metrics = phantom.getMetrics();
        assert.ok(metrics.activePrimitiveCount >= 2);
      });

      it('should count threat sessions correctly', () => {
        phantom.startPlaybook('intrusion', 'threat-1');
        phantom.startPlaybook('ddos', 'threat-2');
        const metrics = phantom.getMetrics();
        assert.equal(metrics.activeThreatSessions, 2);
      });
    });
  });
});
