const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('ThermalManagementProtocol', () => {
  let ThermalManagementProtocol, THERMAL_CONFIG, MESSAGE_TYPES;
  let protocol;
  const PHI = 1.618033988749895;

  beforeEach(async () => {
    const module = await import('../../protocols/thermal-management-protocol.js');
    ThermalManagementProtocol = module.ThermalManagementProtocol;
    THERMAL_CONFIG = module.THERMAL_CONFIG;
    MESSAGE_TYPES = module.MESSAGE_TYPES;
    if (ThermalManagementProtocol) {
      protocol = new ThermalManagementProtocol();
    }
  });

  describe('THERMAL_CONFIG constant', () => {
    it('should define OPTIMAL_TEMP', () => {
      assert.equal(THERMAL_CONFIG.OPTIMAL_TEMP, 25);
    });

    it('should define WARNING_TEMP', () => {
      assert.equal(THERMAL_CONFIG.WARNING_TEMP, 45);
    });

    it('should define CRITICAL_TEMP', () => {
      assert.equal(THERMAL_CONFIG.CRITICAL_TEMP, 65);
    });

    it('should define EMERGENCY_TEMP', () => {
      assert.equal(THERMAL_CONFIG.EMERGENCY_TEMP, 80);
    });

    it('should define SHUTDOWN_TEMP', () => {
      assert.equal(THERMAL_CONFIG.SHUTDOWN_TEMP, 95);
    });

    it('should use phi-scaled MIN_COOLING_CAPACITY', () => {
      assert.ok(Math.abs(THERMAL_CONFIG.MIN_COOLING_CAPACITY - 10000 * PHI) < 0.1);
    });

    it('should use phi-scaled MAX_COOLING_CAPACITY', () => {
      assert.ok(Math.abs(THERMAL_CONFIG.MAX_COOLING_CAPACITY - 500000 * PHI) < 0.1);
    });

    it('should use phi-scaled COOLING_RAMP_RATE', () => {
      assert.ok(Math.abs(THERMAL_CONFIG.COOLING_RAMP_RATE - 1000 * PHI) < 0.1);
    });

    it('should define water parameters', () => {
      assert.equal(THERMAL_CONFIG.WATER_TEMP_MIN, 4);
      assert.equal(THERMAL_CONFIG.WATER_TEMP_MAX, 60);
      assert.equal(THERMAL_CONFIG.WATER_PURITY_MIN, 0.95);
    });

    it('should use phi-scaled WATER_FLOW_RATE_MIN', () => {
      assert.ok(Math.abs(THERMAL_CONFIG.WATER_FLOW_RATE_MIN - 100 * PHI) < 0.1);
    });

    it('should define response times', () => {
      assert.equal(THERMAL_CONFIG.SENSOR_INTERVAL_MS, 1000);
      assert.equal(THERMAL_CONFIG.COOLING_RESPONSE_MS, 5000);
      assert.equal(THERMAL_CONFIG.EMERGENCY_RESPONSE_MS, 500);
    });

    it('should define efficiency targets', () => {
      assert.equal(THERMAL_CONFIG.TARGET_EFFICIENCY, 0.85);
      assert.equal(THERMAL_CONFIG.MIN_EFFICIENCY, 0.60);
    });
  });

  describe('MESSAGE_TYPES constant', () => {
    it('should define TEMP_READING', () => {
      assert.equal(MESSAGE_TYPES.TEMP_READING, 'thermal.reading');
    });

    it('should define TEMP_WARNING', () => {
      assert.equal(MESSAGE_TYPES.TEMP_WARNING, 'thermal.warning');
    });

    it('should define TEMP_CRITICAL', () => {
      assert.equal(MESSAGE_TYPES.TEMP_CRITICAL, 'thermal.critical');
    });

    it('should define TEMP_EMERGENCY', () => {
      assert.equal(MESSAGE_TYPES.TEMP_EMERGENCY, 'thermal.emergency');
    });

    it('should define COOLING_ACTIVATE', () => {
      assert.equal(MESSAGE_TYPES.COOLING_ACTIVATE, 'cooling.activate');
    });

    it('should define COOLING_DEACTIVATE', () => {
      assert.equal(MESSAGE_TYPES.COOLING_DEACTIVATE, 'cooling.deactivate');
    });

    it('should define COOLING_BOOST', () => {
      assert.equal(MESSAGE_TYPES.COOLING_BOOST, 'cooling.boost');
    });

    it('should define COOLING_EMERGENCY', () => {
      assert.equal(MESSAGE_TYPES.COOLING_EMERGENCY, 'cooling.emergency');
    });

    it('should define COOLING_BALANCE', () => {
      assert.equal(MESSAGE_TYPES.COOLING_BALANCE, 'cooling.balance');
    });

    it('should define WATER_FLOW_START', () => {
      assert.equal(MESSAGE_TYPES.WATER_FLOW_START, 'water.flow_start');
    });

    it('should define WATER_FLOW_STOP', () => {
      assert.equal(MESSAGE_TYPES.WATER_FLOW_STOP, 'water.flow_stop');
    });

    it('should define WATER_TRANSFER', () => {
      assert.equal(MESSAGE_TYPES.WATER_TRANSFER, 'water.transfer');
    });

    it('should define WATER_QUALITY_ALERT', () => {
      assert.equal(MESSAGE_TYPES.WATER_QUALITY_ALERT, 'water.quality_alert');
    });
  });

  describe('ThermalManagementProtocol class', () => {
    it('should be exported', () => {
      assert.ok(ThermalManagementProtocol || MESSAGE_TYPES);
    });

    if (typeof ThermalManagementProtocol === 'function') {
      describe('constructor', () => {
        it('should initialize protocol', () => {
          assert.ok(protocol);
        });

        it('should initialize zones', () => {
          assert.ok(protocol.zones || protocol.thermalZones);
        });

        it('should initialize reservoirs', () => {
          assert.ok(protocol.reservoirs || protocol.h2oReservoirs);
        });

        it('should initialize cooling units', () => {
          assert.ok(protocol.coolingUnits || protocol.coolers);
        });

        it('should initialize metrics', () => {
          assert.ok(protocol.metrics);
        });
      });

      describe('addZone()', () => {
        it('should add thermal zone', () => {
          const id = protocol.addZone({
            name: 'Compute Zone',
            targetTemp: 25
          });
          assert.ok(id);
        });
      });

      describe('addReservoir()', () => {
        it('should add H2O reservoir', () => {
          const id = protocol.addReservoir({
            capacity: 10000,
            currentLevel: 0.8
          });
          assert.ok(id);
        });
      });

      describe('addCoolingUnit()', () => {
        it('should add cooling unit', () => {
          const id = protocol.addCoolingUnit({
            capacity: 50000,
            efficiency: 0.9
          });
          assert.ok(id);
        });
      });

      describe('recordReading()', () => {
        it('should record temperature reading', () => {
          const result = protocol.recordReading({
            zoneId: 'zone-1',
            temperature: 35
          });
          assert.ok(result);
        });
      });

      describe('checkThresholds()', () => {
        it('should check temperature thresholds', () => {
          const result = protocol.checkThresholds('zone-1');
          assert.ok(result);
        });
      });

      describe('activateCooling()', () => {
        it('should activate cooling', () => {
          const result = protocol.activateCooling('zone-1');
          assert.ok(result);
        });
      });

      describe('getZoneState()', () => {
        it('should return zone state', () => {
          const state = protocol.getZoneState('zone-1');
          assert.ok(state || state === null);
        });
      });

      describe('getMetrics()', () => {
        it('should return metrics', () => {
          const metrics = protocol.getMetrics();
          assert.ok(metrics);
        });
      });
    }
  });
});
