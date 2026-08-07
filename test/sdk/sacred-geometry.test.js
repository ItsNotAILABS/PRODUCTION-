const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('Sacred Geometry Timers', () => {
  let sacredGeometry;

  beforeEach(async () => {
    sacredGeometry = await import('../../sdk/medina-timers/src/sacred-geometry.js');
  });

  describe('createFibonacciTimer()', () => {
    it('should create timer with stop function', () => {
      const timer = sacredGeometry.createFibonacciTimer(() => {}, { baseMs: 100000 });
      assert.ok(typeof timer.stop === 'function');
      timer.stop();
    });

    it('should create timer with getId function', () => {
      const timer = sacredGeometry.createFibonacciTimer(() => {}, { baseMs: 100000 });
      assert.ok(typeof timer.getId === 'function');
      timer.stop();
    });

    it('should accept baseMs option', () => {
      const timer = sacredGeometry.createFibonacciTimer(() => {}, { baseMs: 500 });
      assert.ok(timer);
      timer.stop();
    });

    it('should accept maxFib option', () => {
      const timer = sacredGeometry.createFibonacciTimer(() => {}, { baseMs: 100000, maxFib: 10 });
      assert.ok(timer);
      timer.stop();
    });
  });

  describe('createFibonacciSpiralTimer()', () => {
    it('should return interval id', () => {
      const timer = sacredGeometry.createFibonacciSpiralTimer(() => {}, { baseMs: 100000 });
      assert.ok(timer);
      clearInterval(timer);
    });

    it('should accept baseMs option', () => {
      const timer = sacredGeometry.createFibonacciSpiralTimer(() => {}, { baseMs: 500 });
      assert.ok(timer);
      clearInterval(timer);
    });
  });

  describe('createPhiOscillator()', () => {
    it('should return interval id', () => {
      const timer = sacredGeometry.createPhiOscillator(() => {}, { baseMs: 100000 });
      assert.ok(timer);
      clearInterval(timer);
    });

    it('should accept baseMs option', () => {
      const timer = sacredGeometry.createPhiOscillator(() => {}, { baseMs: 500 });
      assert.ok(timer);
      clearInterval(timer);
    });
  });

  describe('createDualPhiOscillator()', () => {
    it('should return interval id', () => {
      const timer = sacredGeometry.createDualPhiOscillator(() => {}, { baseMs: 100000 });
      assert.ok(timer);
      clearInterval(timer);
    });
  });

  describe('createGoldenAngleRotator()', () => {
    it('should return interval id', () => {
      const timer = sacredGeometry.createGoldenAngleRotator(() => {}, { baseMs: 100000 });
      assert.ok(timer);
      clearInterval(timer);
    });
  });

  describe('createPhyllotaxisTimer()', () => {
    it('should return interval id', () => {
      const timer = sacredGeometry.createPhyllotaxisTimer(() => {}, { baseMs: 100000 });
      assert.ok(timer);
      clearInterval(timer);
    });
  });

  describe('createMetatronRouter()', () => {
    it('should return interval id', () => {
      const timer = sacredGeometry.createMetatronRouter(() => {}, { baseMs: 100000 });
      assert.ok(timer);
      clearInterval(timer);
    });
  });

  describe('createMultiHeartGenerator()', () => {
    // heartCount is the FIRST argument. Passing the callback there made
    // `i < heartCount` compare a number against a function, which is always
    // false — the loop never ran, no hearts were built, and the test asserted
    // nothing while appearing to pass.
    it('should create the requested number of hearts', () => {
      const generator = sacredGeometry.createMultiHeartGenerator(3, () => {}, { baseMs: 100000 });
      assert.ok(generator);
      assert.equal(generator.hearts.length, 3);
      generator.stop();
    });
  });

  describe('createSacredGeometrySuite()', () => {
    it('should create suite with all timers', () => {
      const suite = sacredGeometry.createSacredGeometrySuite(() => {}, { baseMs: 100000 });
      assert.ok(suite);
      assert.ok('fibonacci' in suite);

      // The suite mixes two shapes: some entries are raw interval ids and some
      // are objects that own their own timers (`fibonacci`, `multiHeart`).
      // Calling clearInterval on one of the objects is a silent no-op, so
      // multiHeart's three intervals stayed pending and `node --test` never
      // exited — the whole suite hung after the last assertion passed.
      for (const timer of Object.values(suite)) {
        if (timer && typeof timer.stop === 'function') timer.stop();
        else clearInterval(timer);
      }
    });
  });
});
