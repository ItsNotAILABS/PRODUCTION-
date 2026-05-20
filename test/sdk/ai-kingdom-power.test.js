const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('AI Kingdom Power Infrastructure', () => {
  let PowerGrid;
  let PowerGenerator;
  let BatteryCluster;
  let PowerSector;
  let POWER_CONFIG;
  let grid;
  let generator;
  let battery;
  let sector;

  beforeEach(async () => {
    const module = await import('../../sdk/ai-kingdom/src/power-grid.js');
    PowerGrid = module.PowerGrid;
    PowerGenerator = module.PowerGenerator;
    BatteryCluster = module.BatteryCluster;
    PowerSector = module.PowerSector;
    POWER_CONFIG = module.POWER_CONFIG;
    
    grid = new PowerGrid('grid-1');
    generator = new PowerGenerator('gen-1');
    battery = new BatteryCluster('batt-1');
    sector = new PowerSector('sector-1');
  });

  describe('POWER_CONFIG exports', () => {
    it('should export phi constant', () => {
      assert.ok(POWER_CONFIG.PHI_CONSTANT > 1.6);
      assert.ok(POWER_CONFIG.PHI_CONSTANT < 1.7);
    });

    it('should export voltage settings', () => {
      assert.ok(POWER_CONFIG.DEFAULT_VOLTAGE > 0);
      assert.ok(POWER_CONFIG.TRANSMISSION_VOLTAGE > POWER_CONFIG.DEFAULT_VOLTAGE);
    });

    it('should export efficiency settings', () => {
      assert.ok(POWER_CONFIG.TRANSMISSION_EFFICIENCY > 0.9);
      assert.ok(POWER_CONFIG.CONVERSION_EFFICIENCY > 0.9);
    });

    it('should export load thresholds', () => {
      assert.ok(POWER_CONFIG.OVERLOAD_THRESHOLD > 0);
      assert.ok(POWER_CONFIG.UNDERLOAD_THRESHOLD >= 0);
    });
  });

  describe('PowerGrid', () => {
    describe('constructor', () => {
      it('should initialize grid ID', () => {
        assert.equal(grid.gridId, 'grid-1');
      });

      it('should initialize empty generators map', () => {
        assert.equal(grid.generators.size, 0);
      });

      it('should initialize empty batteries map', () => {
        assert.equal(grid.batteries.size, 0);
      });

      it('should initialize empty sectors map', () => {
        assert.equal(grid.sectors.size, 0);
      });

      it('should initialize grid status', () => {
        assert.equal(grid.status, 'active');
      });

      it('should initialize empty event log', () => {
        assert.deepEqual(grid.eventLog, []);
      });
    });

    describe('getInfo()', () => {
      it('should return grid metadata', () => {
        const info = grid.getInfo();
        assert.equal(info.gridId, 'grid-1');
        assert.ok(info.version);
      });

      it('should include generator count', () => {
        const info = grid.getInfo();
        assert.ok('generatorCount' in info);
      });

      it('should include battery count', () => {
        const info = grid.getInfo();
        assert.ok('batteryCount' in info);
      });

      it('should include sector count', () => {
        const info = grid.getInfo();
        assert.ok('sectorCount' in info);
      });
    });

    describe('addGenerator()', () => {
      it('should add generator to grid', () => {
        const result = grid.addGenerator(generator);
        assert.equal(result.success, true);
        assert.equal(result.generatorId, 'gen-1');
      });

      it('should increase generator count', () => {
        grid.addGenerator(generator);
        assert.equal(grid.generators.size, 1);
      });

      it('should reject duplicate generator', () => {
        grid.addGenerator(generator);
        const result = grid.addGenerator(generator);
        assert.equal(result.success, false);
        assert.ok(result.error.includes('already'));
      });

      it('should log add event', () => {
        grid.addGenerator(generator);
        assert.ok(grid.eventLog.length > 0);
      });
    });

    describe('addBattery()', () => {
      it('should add battery to grid', () => {
        const result = grid.addBattery(battery);
        assert.equal(result.success, true);
        assert.equal(result.batteryId, 'batt-1');
      });

      it('should increase battery count', () => {
        grid.addBattery(battery);
        assert.equal(grid.batteries.size, 1);
      });

      it('should reject duplicate battery', () => {
        grid.addBattery(battery);
        const result = grid.addBattery(battery);
        assert.equal(result.success, false);
      });
    });

    describe('addSector()', () => {
      it('should add sector to grid', () => {
        const result = grid.addSector(sector);
        assert.equal(result.success, true);
        assert.equal(result.sectorId, 'sector-1');
      });

      it('should increase sector count', () => {
        grid.addSector(sector);
        assert.equal(grid.sectors.size, 1);
      });

      it('should reject duplicate sector', () => {
        grid.addSector(sector);
        const result = grid.addSector(sector);
        assert.equal(result.success, false);
      });
    });

    describe('removeGenerator()', () => {
      beforeEach(() => {
        grid.addGenerator(generator);
      });

      it('should remove generator from grid', () => {
        const result = grid.removeGenerator('gen-1');
        assert.equal(result.success, true);
      });

      it('should decrease generator count', () => {
        grid.removeGenerator('gen-1');
        assert.equal(grid.generators.size, 0);
      });

      it('should return error for unknown generator', () => {
        const result = grid.removeGenerator('unknown');
        assert.equal(result.success, false);
      });
    });

    describe('calculateTotalGeneration()', () => {
      beforeEach(() => {
        grid.addGenerator(new PowerGenerator('gen-1'));
        grid.addGenerator(new PowerGenerator('gen-2'));
      });

      it('should return total generation', () => {
        const total = grid.calculateTotalGeneration();
        assert.ok(total >= 0);
      });

      it('should sum all generator outputs', () => {
        grid.generators.get('gen-1').setOutput(1000);
        grid.generators.get('gen-2').setOutput(2000);
        const total = grid.calculateTotalGeneration();
        assert.equal(total, 3000);
      });
    });

    describe('calculateTotalDemand()', () => {
      beforeEach(() => {
        grid.addSector(new PowerSector('sector-1'));
        grid.addSector(new PowerSector('sector-2'));
      });

      it('should return total demand', () => {
        const total = grid.calculateTotalDemand();
        assert.ok(total >= 0);
      });

      it('should sum all sector demands', () => {
        grid.sectors.get('sector-1').setDemand(500);
        grid.sectors.get('sector-2').setDemand(750);
        const total = grid.calculateTotalDemand();
        assert.equal(total, 1250);
      });
    });

    describe('calculateLoadFactor()', () => {
      it('should return load factor between 0 and reasonable max', () => {
        grid.addGenerator(generator);
        generator.setOutput(1000);
        grid.addSector(sector);
        sector.setDemand(500);
        
        const loadFactor = grid.calculateLoadFactor();
        assert.ok(loadFactor >= 0);
      });

      it('should return 0 when no generation', () => {
        const loadFactor = grid.calculateLoadFactor();
        assert.equal(loadFactor, 0);
      });
    });

    describe('distributeLoad()', () => {
      beforeEach(() => {
        grid.addGenerator(generator);
        generator.setOutput(10000);
        grid.addSector(sector);
        sector.setDemand(5000);
      });

      it('should return distribution result', () => {
        const result = grid.distributeLoad();
        assert.equal(result.success, true);
      });

      it('should include allocation details', () => {
        const result = grid.distributeLoad();
        assert.ok('totalGeneration' in result);
        assert.ok('totalDemand' in result);
        assert.ok('distribution' in result);
      });

      it('should satisfy demand when supply exceeds demand', () => {
        const result = grid.distributeLoad();
        assert.ok(result.distribution.every(d => d.satisfied));
      });
    });

    describe('getMetrics()', () => {
      it('should return grid metrics', () => {
        const metrics = grid.getMetrics();
        assert.ok('generatorCount' in metrics);
        assert.ok('batteryCount' in metrics);
        assert.ok('sectorCount' in metrics);
        assert.ok('totalGeneration' in metrics);
        assert.ok('totalDemand' in metrics);
        assert.ok('loadFactor' in metrics);
        assert.ok('status' in metrics);
      });

      it('should include accurate counts', () => {
        grid.addGenerator(generator);
        grid.addBattery(battery);
        grid.addSector(sector);
        
        const metrics = grid.getMetrics();
        assert.equal(metrics.generatorCount, 1);
        assert.equal(metrics.batteryCount, 1);
        assert.equal(metrics.sectorCount, 1);
      });
    });
  });

  describe('PowerGenerator', () => {
    describe('constructor', () => {
      it('should initialize generator ID', () => {
        assert.equal(generator.generatorId, 'gen-1');
      });

      it('should initialize output to 0', () => {
        assert.equal(generator.currentOutput, 0);
      });

      it('should initialize max output', () => {
        assert.ok(generator.maxOutput > 0);
      });

      it('should initialize status to offline', () => {
        assert.equal(generator.status, 'offline');
      });
    });

    describe('getInfo()', () => {
      it('should return generator metadata', () => {
        const info = generator.getInfo();
        assert.equal(info.generatorId, 'gen-1');
      });

      it('should include output info', () => {
        const info = generator.getInfo();
        assert.ok('currentOutput' in info);
        assert.ok('maxOutput' in info);
      });

      it('should include status', () => {
        const info = generator.getInfo();
        assert.ok('status' in info);
      });
    });

    describe('start()', () => {
      it('should start generator', () => {
        const result = generator.start();
        assert.equal(result.success, true);
      });

      it('should set status to online', () => {
        generator.start();
        assert.equal(generator.status, 'online');
      });

      it('should return error if already running', () => {
        generator.start();
        const result = generator.start();
        assert.equal(result.success, false);
      });
    });

    describe('stop()', () => {
      beforeEach(() => {
        generator.start();
      });

      it('should stop generator', () => {
        const result = generator.stop();
        assert.equal(result.success, true);
      });

      it('should set status to offline', () => {
        generator.stop();
        assert.equal(generator.status, 'offline');
      });

      it('should reset output to 0', () => {
        generator.setOutput(1000);
        generator.stop();
        assert.equal(generator.currentOutput, 0);
      });
    });

    describe('setOutput()', () => {
      beforeEach(() => {
        generator.start();
      });

      it('should set output', () => {
        const result = generator.setOutput(5000);
        assert.equal(result.success, true);
        assert.equal(result.output, 5000);
      });

      it('should cap output at max', () => {
        const result = generator.setOutput(1000000);
        assert.equal(result.output, generator.maxOutput);
      });

      it('should not allow negative output', () => {
        const result = generator.setOutput(-100);
        assert.ok(generator.currentOutput >= 0);
      });

      it('should return error if offline', () => {
        generator.stop();
        const result = generator.setOutput(5000);
        assert.equal(result.success, false);
      });
    });

    describe('getMetrics()', () => {
      it('should return generator metrics', () => {
        const metrics = generator.getMetrics();
        assert.ok('currentOutput' in metrics);
        assert.ok('maxOutput' in metrics);
        assert.ok('utilization' in metrics);
        assert.ok('status' in metrics);
      });

      it('should calculate utilization correctly', () => {
        generator.start();
        generator.setOutput(generator.maxOutput / 2);
        const metrics = generator.getMetrics();
        assert.ok(metrics.utilization >= 0.45 && metrics.utilization <= 0.55);
      });
    });
  });

  describe('BatteryCluster', () => {
    describe('constructor', () => {
      it('should initialize battery ID', () => {
        assert.equal(battery.batteryId, 'batt-1');
      });

      it('should initialize capacity', () => {
        assert.ok(battery.capacity > 0);
      });

      it('should initialize current charge', () => {
        assert.ok(battery.currentCharge >= 0);
        assert.ok(battery.currentCharge <= 1);
      });

      it('should initialize status', () => {
        assert.equal(battery.status, 'idle');
      });
    });

    describe('getInfo()', () => {
      it('should return battery metadata', () => {
        const info = battery.getInfo();
        assert.equal(info.batteryId, 'batt-1');
      });

      it('should include charge info', () => {
        const info = battery.getInfo();
        assert.ok('capacity' in info);
        assert.ok('currentCharge' in info);
        assert.ok('chargePercentage' in info);
      });

      it('should include status', () => {
        const info = battery.getInfo();
        assert.ok('status' in info);
      });
    });

    describe('charge()', () => {
      it('should charge battery', () => {
        battery.currentCharge = 0.5;
        const result = battery.charge(1000);
        assert.equal(result.success, true);
      });

      it('should increase charge level', () => {
        const initial = battery.currentCharge;
        battery.charge(10000);
        assert.ok(battery.currentCharge >= initial);
      });

      it('should not exceed max charge', () => {
        battery.charge(1000000);
        assert.ok(battery.currentCharge <= 1);
      });

      it('should set status to charging', () => {
        battery.charge(1000);
        assert.equal(battery.status, 'charging');
      });

      it('should return amount charged', () => {
        const result = battery.charge(1000);
        assert.ok('amountCharged' in result);
      });
    });

    describe('discharge()', () => {
      beforeEach(() => {
        battery.currentCharge = 0.8;
      });

      it('should discharge battery', () => {
        const result = battery.discharge(1000);
        assert.equal(result.success, true);
      });

      it('should decrease charge level', () => {
        const initial = battery.currentCharge;
        battery.discharge(10000);
        assert.ok(battery.currentCharge <= initial);
      });

      it('should not go below min charge', () => {
        battery.discharge(1000000);
        assert.ok(battery.currentCharge >= 0);
      });

      it('should set status to discharging', () => {
        battery.discharge(1000);
        assert.equal(battery.status, 'discharging');
      });

      it('should return amount discharged', () => {
        const result = battery.discharge(1000);
        assert.ok('amountDischarged' in result);
      });
    });

    describe('setIdle()', () => {
      it('should set status to idle', () => {
        battery.status = 'charging';
        battery.setIdle();
        assert.equal(battery.status, 'idle');
      });

      it('should return success', () => {
        const result = battery.setIdle();
        assert.equal(result.success, true);
      });
    });

    describe('getMetrics()', () => {
      it('should return battery metrics', () => {
        const metrics = battery.getMetrics();
        assert.ok('capacity' in metrics);
        assert.ok('currentCharge' in metrics);
        assert.ok('chargePercentage' in metrics);
        assert.ok('status' in metrics);
        assert.ok('availableEnergy' in metrics);
      });

      it('should calculate available energy correctly', () => {
        battery.currentCharge = 0.5;
        const metrics = battery.getMetrics();
        assert.equal(metrics.availableEnergy, battery.capacity * 0.5);
      });
    });
  });

  describe('PowerSector', () => {
    describe('constructor', () => {
      it('should initialize sector ID', () => {
        assert.equal(sector.sectorId, 'sector-1');
      });

      it('should initialize demand to 0', () => {
        assert.equal(sector.currentDemand, 0);
      });

      it('should initialize priority', () => {
        assert.ok(sector.priority >= 1);
      });

      it('should initialize status to active', () => {
        assert.equal(sector.status, 'active');
      });

      it('should initialize allocated to 0', () => {
        assert.equal(sector.allocated, 0);
      });
    });

    describe('getInfo()', () => {
      it('should return sector metadata', () => {
        const info = sector.getInfo();
        assert.equal(info.sectorId, 'sector-1');
      });

      it('should include demand info', () => {
        const info = sector.getInfo();
        assert.ok('currentDemand' in info);
        assert.ok('priority' in info);
      });

      it('should include allocation info', () => {
        const info = sector.getInfo();
        assert.ok('allocated' in info);
      });
    });

    describe('setDemand()', () => {
      it('should set demand', () => {
        const result = sector.setDemand(5000);
        assert.equal(result.success, true);
        assert.equal(result.demand, 5000);
      });

      it('should update currentDemand', () => {
        sector.setDemand(7500);
        assert.equal(sector.currentDemand, 7500);
      });

      it('should not allow negative demand', () => {
        sector.setDemand(-100);
        assert.ok(sector.currentDemand >= 0);
      });

      it('should return error if isolated', () => {
        sector.isolate();
        const result = sector.setDemand(5000);
        assert.equal(result.success, false);
      });
    });

    describe('setPriority()', () => {
      it('should set priority', () => {
        const result = sector.setPriority(2);
        assert.equal(result.success, true);
        assert.equal(result.priority, 2);
      });

      it('should update priority property', () => {
        sector.setPriority(1);
        assert.equal(sector.priority, 1);
      });

      it('should clamp priority to valid range', () => {
        sector.setPriority(10);
        assert.ok(sector.priority <= 4);
        
        sector.setPriority(0);
        assert.ok(sector.priority >= 1);
      });
    });

    describe('allocate()', () => {
      it('should allocate power', () => {
        const result = sector.allocate(5000);
        assert.equal(result.success, true);
        assert.equal(result.allocated, 5000);
      });

      it('should update allocated property', () => {
        sector.allocate(3000);
        assert.equal(sector.allocated, 3000);
      });

      it('should return satisfied status', () => {
        sector.setDemand(5000);
        const result = sector.allocate(5000);
        assert.equal(result.satisfied, true);
      });

      it('should return unsatisfied when allocation < demand', () => {
        sector.setDemand(5000);
        const result = sector.allocate(3000);
        assert.equal(result.satisfied, false);
        assert.equal(result.shortfall, 2000);
      });
    });

    describe('isolate()', () => {
      it('should isolate sector', () => {
        const result = sector.isolate();
        assert.equal(result.success, true);
      });

      it('should set status to isolated', () => {
        sector.isolate();
        assert.equal(sector.status, 'isolated');
      });

      it('should reset allocated to 0', () => {
        sector.allocate(5000);
        sector.isolate();
        assert.equal(sector.allocated, 0);
      });
    });

    describe('restore()', () => {
      beforeEach(() => {
        sector.isolate();
      });

      it('should restore sector', () => {
        const result = sector.restore();
        assert.equal(result.success, true);
      });

      it('should set status to active', () => {
        sector.restore();
        assert.equal(sector.status, 'active');
      });
    });

    describe('getMetrics()', () => {
      it('should return sector metrics', () => {
        const metrics = sector.getMetrics();
        assert.ok('currentDemand' in metrics);
        assert.ok('allocated' in metrics);
        assert.ok('priority' in metrics);
        assert.ok('status' in metrics);
        assert.ok('satisfactionRatio' in metrics);
      });

      it('should calculate satisfaction ratio correctly', () => {
        sector.setDemand(1000);
        sector.allocate(500);
        const metrics = sector.getMetrics();
        assert.equal(metrics.satisfactionRatio, 0.5);
      });
    });
  });
});
