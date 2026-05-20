const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('ThermalManagementProtocol', () => {
  let ThermalManagementProtocol;
  let THERMAL_CONFIG;
  let MESSAGE_TYPES;
  let THERMAL_STATES;
  let COOLING_MODES;
  let calculateCoolingRequirement;
  let calculateH2OCapacity;
  let getThermalState;
  let protocol;

  beforeEach(async () => {
    const module = await import('../../protocols/thermal-management-protocol.js');
    ThermalManagementProtocol = module.ThermalManagementProtocol;
    THERMAL_CONFIG = module.THERMAL_CONFIG;
    MESSAGE_TYPES = module.MESSAGE_TYPES;
    THERMAL_STATES = module.THERMAL_STATES;
    COOLING_MODES = module.COOLING_MODES;
    calculateCoolingRequirement = module.calculateCoolingRequirement;
    calculateH2OCapacity = module.calculateH2OCapacity;
    getThermalState = module.getThermalState;
    protocol = new ThermalManagementProtocol();
  });

  describe('THERMAL_CONFIG exports', () => {
    it('should export phi constant', () => {
      assert.ok(THERMAL_CONFIG.PHI_CONSTANT > 1.6);
      assert.ok(THERMAL_CONFIG.PHI_CONSTANT < 1.7);
    });

    it('should export temperature thresholds', () => {
      assert.ok(THERMAL_CONFIG.TEMP_OPTIMAL > 0);
      assert.ok(THERMAL_CONFIG.TEMP_WARNING > THERMAL_CONFIG.TEMP_OPTIMAL);
      assert.ok(THERMAL_CONFIG.TEMP_CRITICAL > THERMAL_CONFIG.TEMP_WARNING);
    });

    it('should export reservoir limits', () => {
      assert.ok(THERMAL_CONFIG.MIN_RESERVOIR_LEVEL >= 0);
      assert.ok(THERMAL_CONFIG.MAX_RESERVOIR_LEVEL <= 1);
    });

    it('should export cooling efficiency', () => {
      assert.ok(THERMAL_CONFIG.COOLING_EFFICIENCY > 0);
      assert.ok(THERMAL_CONFIG.COOLING_EFFICIENCY <= 1);
    });

    it('should export water specific heat', () => {
      assert.ok(THERMAL_CONFIG.WATER_SPECIFIC_HEAT > 4000);
    });
  });

  describe('THERMAL_STATES exports', () => {
    it('should export all thermal states', () => {
      assert.equal(THERMAL_STATES.OPTIMAL, 'optimal');
      assert.equal(THERMAL_STATES.NORMAL, 'normal');
      assert.equal(THERMAL_STATES.ELEVATED, 'elevated');
      assert.equal(THERMAL_STATES.WARNING, 'warning');
      assert.equal(THERMAL_STATES.CRITICAL, 'critical');
      assert.equal(THERMAL_STATES.EMERGENCY, 'emergency');
    });
  });

  describe('COOLING_MODES exports', () => {
    it('should export passive mode', () => {
      assert.ok(COOLING_MODES.PASSIVE);
      assert.ok(COOLING_MODES.PASSIVE.energyFactor < 1);
    });

    it('should export active mode', () => {
      assert.ok(COOLING_MODES.ACTIVE);
      assert.ok(COOLING_MODES.ACTIVE.coolingPower > COOLING_MODES.PASSIVE.coolingPower);
    });

    it('should export emergency mode', () => {
      assert.ok(COOLING_MODES.EMERGENCY);
      assert.ok(COOLING_MODES.EMERGENCY.coolingPower >= COOLING_MODES.ACTIVE.coolingPower);
    });
  });

  describe('MESSAGE_TYPES exports', () => {
    it('should export reservoir messages', () => {
      assert.equal(MESSAGE_TYPES.RESERVOIR_REGISTER, 'reservoir.register');
      assert.equal(MESSAGE_TYPES.RESERVOIR_FILL, 'reservoir.fill');
      assert.equal(MESSAGE_TYPES.RESERVOIR_DRAIN, 'reservoir.drain');
      assert.equal(MESSAGE_TYPES.RESERVOIR_STATUS, 'reservoir.status');
    });

    it('should export cooling messages', () => {
      assert.equal(MESSAGE_TYPES.COOLING_START, 'cooling.start');
      assert.equal(MESSAGE_TYPES.COOLING_STOP, 'cooling.stop');
      assert.equal(MESSAGE_TYPES.COOLING_ADJUST, 'cooling.adjust');
      assert.equal(MESSAGE_TYPES.COOLING_MODE_CHANGE, 'cooling.mode_change');
    });

    it('should export thermal messages', () => {
      assert.equal(MESSAGE_TYPES.THERMAL_UPDATE, 'thermal.update');
      assert.equal(MESSAGE_TYPES.THERMAL_ALERT, 'thermal.alert');
      assert.equal(MESSAGE_TYPES.THERMAL_EMERGENCY, 'thermal.emergency');
    });
  });

  describe('calculateCoolingRequirement()', () => {
    it('should return cooling calculation object', () => {
      const result = calculateCoolingRequirement(45, 25, 1000);
      assert.ok('heatLoad' in result);
      assert.ok('coolingRequired' in result);
      assert.ok('recommendedMode' in result);
      assert.ok('efficiency' in result);
    });

    it('should calculate heat load based on temperature delta', () => {
      const result = calculateCoolingRequirement(50, 25, 1000);
      assert.ok(result.heatLoad > 0);
    });

    it('should recommend passive cooling for low delta', () => {
      const result = calculateCoolingRequirement(30, 25, 1000);
      assert.equal(result.recommendedMode, 'passive');
    });

    it('should recommend active cooling for medium delta', () => {
      const result = calculateCoolingRequirement(50, 25, 1000);
      assert.equal(result.recommendedMode, 'active');
    });

    it('should recommend emergency cooling for high delta', () => {
      const result = calculateCoolingRequirement(80, 25, 1000);
      assert.equal(result.recommendedMode, 'emergency');
    });

    it('should increase cooling with larger thermal mass', () => {
      const small = calculateCoolingRequirement(50, 25, 100);
      const large = calculateCoolingRequirement(50, 25, 10000);
      assert.ok(large.coolingRequired > small.coolingRequired);
    });
  });

  describe('calculateH2OCapacity()', () => {
    it('should return capacity calculation object', () => {
      const result = calculateH2OCapacity(5000, 10);
      assert.ok('liters' in result);
      assert.ok('thermalCapacity' in result);
      assert.ok('coolingPotential' in result);
      assert.ok('duration' in result);
    });

    it('should calculate liters correctly', () => {
      const result = calculateH2OCapacity(5000, 10);
      assert.ok(result.liters > 0);
    });

    it('should calculate thermal capacity using water specific heat', () => {
      const result = calculateH2OCapacity(5000, 10);
      assert.ok(result.thermalCapacity > 0);
    });

    it('should calculate cooling duration', () => {
      const result = calculateH2OCapacity(5000, 10);
      assert.ok(result.duration > 0);
    });

    it('should increase capacity with larger volume', () => {
      const small = calculateH2OCapacity(1000, 10);
      const large = calculateH2OCapacity(10000, 10);
      assert.ok(large.thermalCapacity > small.thermalCapacity);
    });
  });

  describe('getThermalState()', () => {
    it('should return OPTIMAL for low temperature', () => {
      assert.equal(getThermalState(22), THERMAL_STATES.OPTIMAL);
    });

    it('should return NORMAL for moderate temperature', () => {
      assert.equal(getThermalState(30), THERMAL_STATES.NORMAL);
    });

    it('should return ELEVATED for slightly high temperature', () => {
      assert.equal(getThermalState(40), THERMAL_STATES.ELEVATED);
    });

    it('should return WARNING for high temperature', () => {
      assert.equal(getThermalState(55), THERMAL_STATES.WARNING);
    });

    it('should return CRITICAL for very high temperature', () => {
      assert.equal(getThermalState(70), THERMAL_STATES.CRITICAL);
    });

    it('should return EMERGENCY for extreme temperature', () => {
      assert.equal(getThermalState(85), THERMAL_STATES.EMERGENCY);
    });
  });

  describe('ThermalManagementProtocol constructor', () => {
    it('should initialize protocol ID', () => {
      assert.equal(protocol.protocolId, 'PROTO-233');
    });

    it('should initialize protocol name', () => {
      assert.ok(protocol.protocolName.includes('Thermal'));
    });

    it('should initialize version', () => {
      assert.equal(protocol.version, '1.0.0');
    });

    it('should initialize empty reservoirs map', () => {
      assert.equal(protocol.reservoirs.size, 0);
    });

    it('should initialize empty cooling units map', () => {
      assert.equal(protocol.coolingUnits.size, 0);
    });

    it('should initialize empty thermal zones map', () => {
      assert.equal(protocol.thermalZones.size, 0);
    });

    it('should initialize empty message log', () => {
      assert.deepEqual(protocol.messageLog, []);
    });

    it('should initialize empty thermal history', () => {
      assert.deepEqual(protocol.thermalHistory, []);
    });
  });

  describe('getInfo()', () => {
    it('should return protocol metadata', () => {
      const info = protocol.getInfo();
      assert.equal(info.id, 'PROTO-233');
      assert.ok(info.name.includes('Thermal'));
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
      assert.ok(info.thermalStates > 0);
      assert.ok(info.coolingModes > 0);
    });
  });

  describe('registerReservoir()', () => {
    it('should register a new reservoir', () => {
      const result = protocol.registerReservoir('reservoir-1');
      assert.equal(result.success, true);
      assert.equal(result.reservoirId, 'reservoir-1');
    });

    it('should add reservoir to reservoirs map', () => {
      protocol.registerReservoir('reservoir-1');
      assert.equal(protocol.reservoirs.size, 1);
      assert.ok(protocol.reservoirs.has('reservoir-1'));
    });

    it('should accept custom config', () => {
      protocol.registerReservoir('reservoir-1', { 
        capacity: 10000,
        currentLevel: 0.8 
      });
      const reservoir = protocol.reservoirs.get('reservoir-1');
      assert.equal(reservoir.capacity, 10000);
      assert.equal(reservoir.currentLevel, 0.8);
    });

    it('should reject duplicate reservoir', () => {
      protocol.registerReservoir('reservoir-1');
      const result = protocol.registerReservoir('reservoir-1');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('already registered'));
    });

    it('should log message on registration', () => {
      protocol.registerReservoir('reservoir-1');
      assert.ok(protocol.messageLog.length > 0);
      assert.equal(protocol.messageLog[0].type, MESSAGE_TYPES.RESERVOIR_REGISTER);
    });
  });

  describe('registerCoolingUnit()', () => {
    it('should register a new cooling unit', () => {
      const result = protocol.registerCoolingUnit('cooling-1');
      assert.equal(result.success, true);
      assert.equal(result.coolingUnitId, 'cooling-1');
    });

    it('should add cooling unit to coolingUnits map', () => {
      protocol.registerCoolingUnit('cooling-1');
      assert.equal(protocol.coolingUnits.size, 1);
      assert.ok(protocol.coolingUnits.has('cooling-1'));
    });

    it('should accept custom config', () => {
      protocol.registerCoolingUnit('cooling-1', { 
        maxPower: 5000,
        mode: 'active' 
      });
      const unit = protocol.coolingUnits.get('cooling-1');
      assert.equal(unit.maxPower, 5000);
      assert.equal(unit.mode, 'active');
    });

    it('should reject duplicate cooling unit', () => {
      protocol.registerCoolingUnit('cooling-1');
      const result = protocol.registerCoolingUnit('cooling-1');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('already registered'));
    });
  });

  describe('registerThermalZone()', () => {
    it('should register a new thermal zone', () => {
      const result = protocol.registerThermalZone('zone-1');
      assert.equal(result.success, true);
      assert.equal(result.zoneId, 'zone-1');
    });

    it('should add zone to thermalZones map', () => {
      protocol.registerThermalZone('zone-1');
      assert.equal(protocol.thermalZones.size, 1);
      assert.ok(protocol.thermalZones.has('zone-1'));
    });

    it('should accept custom config', () => {
      protocol.registerThermalZone('zone-1', { 
        targetTemp: 25,
        thermalMass: 5000 
      });
      const zone = protocol.thermalZones.get('zone-1');
      assert.equal(zone.targetTemp, 25);
      assert.equal(zone.thermalMass, 5000);
    });

    it('should reject duplicate zone', () => {
      protocol.registerThermalZone('zone-1');
      const result = protocol.registerThermalZone('zone-1');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('already registered'));
    });
  });

  describe('updateTemperature()', () => {
    beforeEach(() => {
      protocol.registerThermalZone('zone-1');
    });

    it('should update zone temperature', () => {
      const result = protocol.updateTemperature('zone-1', 35);
      assert.equal(result.success, true);
      assert.equal(result.temperature, 35);
    });

    it('should return thermal state', () => {
      const result = protocol.updateTemperature('zone-1', 35);
      assert.ok(result.state);
    });

    it('should return error for unknown zone', () => {
      const result = protocol.updateTemperature('unknown', 35);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should log temperature update', () => {
      const initialLogLength = protocol.messageLog.length;
      protocol.updateTemperature('zone-1', 35);
      assert.ok(protocol.messageLog.length > initialLogLength);
    });
  });

  describe('startCooling()', () => {
    beforeEach(() => {
      protocol.registerCoolingUnit('cooling-1');
      protocol.registerThermalZone('zone-1');
    });

    it('should start cooling for a zone', () => {
      const result = protocol.startCooling('cooling-1', 'zone-1');
      assert.equal(result.success, true);
    });

    it('should return error for unknown cooling unit', () => {
      const result = protocol.startCooling('unknown', 'zone-1');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should return error for unknown zone', () => {
      const result = protocol.startCooling('cooling-1', 'unknown');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should log cooling start', () => {
      protocol.startCooling('cooling-1', 'zone-1');
      assert.ok(protocol.messageLog.some(m => m.type === MESSAGE_TYPES.COOLING_START));
    });

    it('should update cooling unit state', () => {
      protocol.startCooling('cooling-1', 'zone-1');
      const unit = protocol.coolingUnits.get('cooling-1');
      assert.equal(unit.active, true);
      assert.equal(unit.targetZone, 'zone-1');
    });
  });

  describe('stopCooling()', () => {
    beforeEach(() => {
      protocol.registerCoolingUnit('cooling-1');
      protocol.registerThermalZone('zone-1');
      protocol.startCooling('cooling-1', 'zone-1');
    });

    it('should stop cooling', () => {
      const result = protocol.stopCooling('cooling-1');
      assert.equal(result.success, true);
    });

    it('should update cooling unit state', () => {
      protocol.stopCooling('cooling-1');
      const unit = protocol.coolingUnits.get('cooling-1');
      assert.equal(unit.active, false);
    });

    it('should return error for unknown cooling unit', () => {
      const result = protocol.stopCooling('unknown');
      assert.equal(result.success, false);
    });

    it('should log cooling stop', () => {
      protocol.stopCooling('cooling-1');
      assert.ok(protocol.messageLog.some(m => m.type === MESSAGE_TYPES.COOLING_STOP));
    });
  });

  describe('setCoolingMode()', () => {
    beforeEach(() => {
      protocol.registerCoolingUnit('cooling-1');
    });

    it('should set cooling mode', () => {
      const result = protocol.setCoolingMode('cooling-1', 'active');
      assert.equal(result.success, true);
      assert.equal(result.mode, 'active');
    });

    it('should return error for unknown cooling unit', () => {
      const result = protocol.setCoolingMode('unknown', 'active');
      assert.equal(result.success, false);
    });

    it('should return error for invalid mode', () => {
      const result = protocol.setCoolingMode('cooling-1', 'invalid');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('Invalid mode'));
    });

    it('should log mode change', () => {
      protocol.setCoolingMode('cooling-1', 'emergency');
      assert.ok(protocol.messageLog.some(m => m.type === MESSAGE_TYPES.COOLING_MODE_CHANGE));
    });
  });

  describe('fillReservoir()', () => {
    beforeEach(() => {
      protocol.registerReservoir('reservoir-1', { capacity: 10000, currentLevel: 0.5 });
    });

    it('should fill reservoir', () => {
      const result = protocol.fillReservoir('reservoir-1', 2000);
      assert.equal(result.success, true);
    });

    it('should update reservoir level', () => {
      protocol.fillReservoir('reservoir-1', 2000);
      const reservoir = protocol.reservoirs.get('reservoir-1');
      assert.ok(reservoir.currentLevel > 0.5);
    });

    it('should not exceed max level', () => {
      protocol.fillReservoir('reservoir-1', 100000);
      const reservoir = protocol.reservoirs.get('reservoir-1');
      assert.ok(reservoir.currentLevel <= THERMAL_CONFIG.MAX_RESERVOIR_LEVEL);
    });

    it('should return error for unknown reservoir', () => {
      const result = protocol.fillReservoir('unknown', 1000);
      assert.equal(result.success, false);
    });

    it('should log fill message', () => {
      protocol.fillReservoir('reservoir-1', 1000);
      assert.ok(protocol.messageLog.some(m => m.type === MESSAGE_TYPES.RESERVOIR_FILL));
    });
  });

  describe('drainReservoir()', () => {
    beforeEach(() => {
      protocol.registerReservoir('reservoir-1', { capacity: 10000, currentLevel: 0.5 });
    });

    it('should drain reservoir', () => {
      const result = protocol.drainReservoir('reservoir-1', 1000);
      assert.equal(result.success, true);
    });

    it('should update reservoir level', () => {
      protocol.drainReservoir('reservoir-1', 1000);
      const reservoir = protocol.reservoirs.get('reservoir-1');
      assert.ok(reservoir.currentLevel < 0.5);
    });

    it('should not go below min level', () => {
      protocol.drainReservoir('reservoir-1', 100000);
      const reservoir = protocol.reservoirs.get('reservoir-1');
      assert.ok(reservoir.currentLevel >= THERMAL_CONFIG.MIN_RESERVOIR_LEVEL);
    });

    it('should return error for unknown reservoir', () => {
      const result = protocol.drainReservoir('unknown', 1000);
      assert.equal(result.success, false);
    });

    it('should log drain message', () => {
      protocol.drainReservoir('reservoir-1', 1000);
      assert.ok(protocol.messageLog.some(m => m.type === MESSAGE_TYPES.RESERVOIR_DRAIN));
    });
  });

  describe('getMetrics()', () => {
    it('should return protocol metrics', () => {
      const metrics = protocol.getMetrics();
      assert.ok('totalReservoirs' in metrics);
      assert.ok('totalCoolingUnits' in metrics);
      assert.ok('activeCoolingUnits' in metrics);
      assert.ok('totalThermalZones' in metrics);
      assert.ok('averageTemperature' in metrics);
      assert.ok('totalCoolingPower' in metrics);
    });

    it('should count reservoirs correctly', () => {
      protocol.registerReservoir('reservoir-1');
      protocol.registerReservoir('reservoir-2');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.totalReservoirs, 2);
    });

    it('should count cooling units correctly', () => {
      protocol.registerCoolingUnit('cooling-1');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.totalCoolingUnits, 1);
    });

    it('should count thermal zones correctly', () => {
      protocol.registerThermalZone('zone-1');
      protocol.registerThermalZone('zone-2');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.totalThermalZones, 2);
    });

    it('should count active cooling units', () => {
      protocol.registerCoolingUnit('cooling-1');
      protocol.registerThermalZone('zone-1');
      protocol.startCooling('cooling-1', 'zone-1');
      const metrics = protocol.getMetrics();
      assert.equal(metrics.activeCoolingUnits, 1);
    });
  });
});
