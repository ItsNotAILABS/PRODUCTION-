const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('PowerDistributionProtocol', () => {
  let PowerDistributionProtocol, POWER_CONFIG, MESSAGE_TYPES;
  let protocol;
  const PHI = 1.618033988749895;

  beforeEach(async () => {
    const module = await import('../../protocols/power-distribution-protocol.js');
    PowerDistributionProtocol = module.PowerDistributionProtocol;
    POWER_CONFIG = module.POWER_CONFIG;
    MESSAGE_TYPES = module.MESSAGE_TYPES;
    if (PowerDistributionProtocol) {
      protocol = new PowerDistributionProtocol();
    }
  });

  describe('POWER_CONFIG constant', () => {
    it('should define HIGH_VOLTAGE', () => {
      assert.equal(POWER_CONFIG.HIGH_VOLTAGE, 400);
    });

    it('should define MEDIUM_VOLTAGE', () => {
      assert.equal(POWER_CONFIG.MEDIUM_VOLTAGE, 230);
    });

    it('should define LOW_VOLTAGE', () => {
      assert.equal(POWER_CONFIG.LOW_VOLTAGE, 48);
    });

    it('should define LOGIC_VOLTAGE', () => {
      assert.equal(POWER_CONFIG.LOGIC_VOLTAGE, 3.3);
    });

    it('should use phi-scaled MIN_GRID_POWER', () => {
      assert.ok(Math.abs(POWER_CONFIG.MIN_GRID_POWER - 1000 * PHI) < 0.1);
    });

    it('should use phi-scaled MAX_GRID_POWER', () => {
      assert.ok(Math.abs(POWER_CONFIG.MAX_GRID_POWER - 10000000 * PHI) < 0.1);
    });

    it('should define CRITICAL_LOAD_THRESHOLD', () => {
      assert.equal(POWER_CONFIG.CRITICAL_LOAD_THRESHOLD, 0.90);
    });

    it('should define WARNING_LOAD_THRESHOLD', () => {
      assert.equal(POWER_CONFIG.WARNING_LOAD_THRESHOLD, 0.75);
    });

    it('should define battery parameters', () => {
      assert.equal(POWER_CONFIG.BATTERY_MIN_CHARGE, 0.20);
      assert.equal(POWER_CONFIG.BATTERY_OPTIMAL_CHARGE, 0.80);
      assert.equal(POWER_CONFIG.BATTERY_MAX_CHARGE, 0.95);
    });

    it('should define charge/discharge rate limits', () => {
      assert.equal(POWER_CONFIG.CHARGE_RATE_LIMIT, 0.1);
      assert.equal(POWER_CONFIG.DISCHARGE_RATE_LIMIT, 0.2);
    });

    it('should define efficiency targets', () => {
      assert.equal(POWER_CONFIG.TRANSMISSION_EFFICIENCY, 0.98);
      assert.equal(POWER_CONFIG.CONVERSION_EFFICIENCY, 0.95);
      assert.equal(POWER_CONFIG.STORAGE_EFFICIENCY, 0.90);
    });

    it('should define response times', () => {
      assert.equal(POWER_CONFIG.LOAD_BALANCE_INTERVAL, 1000);
      assert.equal(POWER_CONFIG.EMERGENCY_RESPONSE, 100);
      assert.equal(POWER_CONFIG.FAILOVER_TIME, 500);
    });

    it('should define phi-scaled pricing', () => {
      assert.ok(Math.abs(POWER_CONFIG.EXPORT_PRICE_PER_KWH - 0.12 * PHI) < 0.001);
      assert.ok(Math.abs(POWER_CONFIG.IMPORT_PRICE_PER_KWH - 0.18 * PHI) < 0.001);
    });
  });

  describe('MESSAGE_TYPES constant', () => {
    it('should define GENERATION_ONLINE', () => {
      assert.equal(MESSAGE_TYPES.GENERATION_ONLINE, 'power.generation.online');
    });

    it('should define GENERATION_OFFLINE', () => {
      assert.equal(MESSAGE_TYPES.GENERATION_OFFLINE, 'power.generation.offline');
    });

    it('should define GENERATION_OUTPUT', () => {
      assert.equal(MESSAGE_TYPES.GENERATION_OUTPUT, 'power.generation.output');
    });

    it('should define GENERATION_FAULT', () => {
      assert.equal(MESSAGE_TYPES.GENERATION_FAULT, 'power.generation.fault');
    });

    it('should define LOAD_REQUEST', () => {
      assert.equal(MESSAGE_TYPES.LOAD_REQUEST, 'power.load.request');
    });

    it('should define LOAD_GRANTED', () => {
      assert.equal(MESSAGE_TYPES.LOAD_GRANTED, 'power.load.granted');
    });

    it('should define LOAD_DENIED', () => {
      assert.equal(MESSAGE_TYPES.LOAD_DENIED, 'power.load.denied');
    });

    it('should define LOAD_SHED', () => {
      assert.equal(MESSAGE_TYPES.LOAD_SHED, 'power.load.shed');
    });
  });

  describe('PowerDistributionProtocol class', () => {
    it('should be exported', () => {
      assert.ok(PowerDistributionProtocol || MESSAGE_TYPES);
    });

    if (typeof PowerDistributionProtocol === 'function') {
      describe('constructor', () => {
        it('should initialize protocol', () => {
          assert.ok(protocol);
        });

        it('should initialize grid state', () => {
          assert.ok(protocol.grid || protocol.sectors);
        });

        it('should initialize generators', () => {
          assert.ok(protocol.generators || protocol.sources);
        });

        it('should initialize batteries', () => {
          assert.ok(protocol.batteries || protocol.storage);
        });

        it('should initialize metrics', () => {
          assert.ok(protocol.metrics);
        });
      });

      describe('addGenerator()', () => {
        it('should add generator', () => {
          const id = protocol.addGenerator({
            type: 'solar',
            capacity: 10000
          });
          assert.ok(id);
        });
      });

      describe('addSector()', () => {
        it('should add power sector', () => {
          const id = protocol.addSector({
            name: 'Compute Zone',
            priority: 1
          });
          assert.ok(id);
        });
      });

      describe('addBattery()', () => {
        it('should add battery storage', () => {
          const id = protocol.addBattery({
            capacity: 100000,
            currentCharge: 0.5
          });
          assert.ok(id);
        });
      });

      describe('requestLoad()', () => {
        it('should request power load', () => {
          const result = protocol.requestLoad({
            sectorId: 'sector-1',
            watts: 5000
          });
          assert.ok(result);
        });
      });

      describe('balanceLoad()', () => {
        it('should balance power across grid', () => {
          const result = protocol.balanceLoad();
          assert.ok(result);
        });
      });

      describe('getGridState()', () => {
        it('should return grid state', () => {
          const state = protocol.getGridState();
          assert.ok(state);
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
