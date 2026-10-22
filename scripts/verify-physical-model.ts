import assert from 'node:assert/strict';
import { GENERIC_TEA_ARCHETYPES } from '../src/data/teaData';
import { optimizePhysicalSchedule, simulatePhysicalBrewing } from '../src/domain/physicalBrewingModel';

const tea = GENERIC_TEA_ARCHETYPES.find((item) => item.type === 'green');
assert.ok(tea, 'A generic green tea archetype must exist');

function simulate(overrides: Partial<Parameters<typeof simulatePhysicalBrewing>[0]> = {}) {
  return simulatePhysicalBrewing({
    tea,
    leafMassGrams: 5,
    waterVolumeMl: 100,
    waterTempC: 85,
    durations: [8, 10, 14],
    requestedSteepsCount: 3,
    waterHardnessLevel: 'optimal',
    vesselMaterial: 'porcelain',
    brewingMethod: 'gongfu',
    zeroInfusion: {
      enabled: false,
      durationSec: 0,
      temperatureC: 85,
      waterVolumeMl: 100,
      disposition: 'discard',
    },
    ...overrides,
  });
}

function assertMassBalance(result: ReturnType<typeof simulatePhysicalBrewing>) {
  assert.ok(Math.abs(result.massBalance.balanceErrorMg) < 1e-6,
    'Mass balance error should be near zero: ' + result.massBalance.balanceErrorMg);
  assert.ok(result.massBalance.remainingInLeafMg >= 0);
  assert.ok(result.massBalance.remainingInLiquidMg >= 0);
  assert.ok(result.massBalance.removedFromSystemMg >= 0);
}

const base = simulate();
assert.equal(base.steeps.length, 3);
assert.equal(base.zeroInfusionData, null);
assertMassBalance(base);

const rinsed = simulate({
  zeroInfusion: {
    enabled: true,
    durationSec: 5,
    temperatureC: 95,
    waterVolumeMl: 100,
    disposition: 'discard',
  },
});
assert.ok(rinsed.zeroInfusionData, 'Enabled zero infusion should be returned as stage #0');
assert.equal(rinsed.zeroInfusionData?.steepNumber, 0);
assert.ok((rinsed.zeroInfusionData?.trackedCompoundsExtractedMg ?? 0) > 0,
  'A non-zero zero-infusion duration should extract measurable modeled material');
assert.equal(rinsed.zeroInfusionData?.drinkableVolumeMl ?? -1, 0,
  'Discarded zero infusion must not count as drinkable output');
assert.ok(rinsed.massBalance.discardedFromSystemMg > 0,
  'Compounds removed in the discarded zero infusion should be tracked separately');
assertMassBalance(rinsed);

const cooler = simulate({ waterTempC: 65 });
const hotter = simulate({ waterTempC: 95 });
assert.ok(
  (hotter.steeps[0].trackedCompoundsExtractedMg ?? 0) >
  (cooler.steeps[0].trackedCompoundsExtractedMg ?? 0),
  'Higher temperature should increase first-stage extraction under the positive-activation-energy model',
);
assertMassBalance(cooler);
assertMassBalance(hotter);

const liuGen = simulate({ brewingMethod: 'liu_gen', rootFraction: 0.33 });
assert.ok((liuGen.steeps[1].retainedRootVolumeMl ?? 0) > 0,
  'Liu Gen should retain free root liquor between stages');
assertMassBalance(liuGen);

const cup = simulate({ brewingMethod: 'grandpa_cup', rootFraction: 0.33 });
assert.ok((cup.steeps[1].retainedRootVolumeMl ?? 0) > 0,
  'Grandpa cup should retain free root liquor while the leaves remain in the cup');
assert.ok((cup.steeps[1].retainedLiquidVolumeMl ?? 0) > 0,
  'Grandpa cup should expose the full retained liquid volume, including leaf-held liquid');
assertMassBalance(cup);

const optimized = optimizePhysicalSchedule({
  simulation: {
    tea,
    leafMassGrams: 5,
    waterVolumeMl: 100,
    waterTempC: 85,
    requestedSteepsCount: 3,
    waterHardnessLevel: 'optimal',
    vesselMaterial: 'porcelain',
    brewingMethod: 'gongfu',
    optimizationGoal: 'balanced',
    zeroInfusion: { enabled: false, durationSec: 0, temperatureC: 85, waterVolumeMl: 100 },
  },
  userDurations: [11, null, 19],
  userTemperaturesC: [null, 78, null],
  optimizeTemperatures: true,
});
assert.equal(optimized.durations.length, 3);
assert.equal(optimized.durations[0], 11, 'Explicit user durations must stay fixed');
assert.equal(optimized.durations[2], 19, 'Explicit user durations must stay fixed');
assert.equal(optimized.temperaturesC[1], 78, 'Explicit user temperatures must stay fixed');
assert.ok(optimized.durations.every((seconds) => seconds > 0 && seconds <= 300));

const lockedBaseTemp = optimizePhysicalSchedule({
  simulation: {
    tea,
    leafMassGrams: 5,
    waterVolumeMl: 100,
    waterTempC: 95,
    perSteepTempsC: [95, 95, 95],
    requestedSteepsCount: 3,
    waterHardnessLevel: 'optimal',
    vesselMaterial: 'porcelain',
    brewingMethod: 'gongfu',
    optimizationGoal: 'balanced',
    zeroInfusion: { enabled: false, durationSec: 0, temperatureC: 95, waterVolumeMl: 100 },
  },
  optimizeTemperatures: false,
});
assert.ok(lockedBaseTemp.temperaturesC.every((temperature) => temperature === 95),
  'With dynamic temperature mode off, the user-selected base temperature must remain unchanged');

console.log('Physical brewing model checks passed.');
