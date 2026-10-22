import assert from 'node:assert/strict';
import { GENERIC_TEA_ARCHETYPES } from '../src/data/teaData';
import {
  optimizePhysicalBrewingParameters,
  optimizePhysicalSchedule,
  resolveZeroInfusionOptions,
  simulatePhysicalBrewing,
} from '../src/domain/physicalBrewingModel';
import {
  TEA_ARCHETYPE_CALIBRATION_DIAGNOSTICS,
  TEA_ARCHETYPE_EXTRACTION_PRIORS,
  TEA_EXTRACTION_REFERENCE_DATA,
  TEA_EXTRACTION_REFERENCE_SOURCE,
} from '../src/data/teaExtractionCalibration';

const teaCandidate = GENERIC_TEA_ARCHETYPES.find((item) => item.type === 'green');
if (!teaCandidate) {
  throw new Error('A generic green tea archetype must exist for model verification');
}
const tea = teaCandidate as NonNullable<typeof teaCandidate>;

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

const greenRinsePolicy = resolveZeroInfusionOptions({
  tea,
  waterTempC: 80,
  waterVolumeMl: 100,
  optimizationGoal: 'white_debitter',
});
assert.equal(greenRinsePolicy.enabled, false,
  'A flavor goal must not add a zero infusion to a tea whose profile does not require it');
assert.equal(greenRinsePolicy.durationSec, 0,
  'Non-rinse teas should have no stage #0 by default');

const rinseTeaCandidate = GENERIC_TEA_ARCHETYPES.find((item) => item.type === 'shou_puerh' || item.type === 'heicha');
if (!rinseTeaCandidate) {
  throw new Error('A generic dark-fermented tea archetype must exist for rinse verification');
}
const rinseTea = rinseTeaCandidate as NonNullable<typeof rinseTeaCandidate>;
const mandatoryRinse = resolveZeroInfusionOptions({
  tea: rinseTea,
  waterTempC: 100,
  waterVolumeMl: 100,
});
assert.equal(mandatoryRinse.enabled, true,
  'Teas with a required zero-infusion profile should always include stage #0');
assert.ok(mandatoryRinse.durationSec > 0,
  'A mandatory zero infusion must have a positive default duration');
const mandatoryRinseEvenWithZeroUserTime = resolveZeroInfusionOptions({
  tea: rinseTea,
  waterTempC: 100,
  waterVolumeMl: 100,
  customDurationSec: 0,
});
assert.equal(mandatoryRinseEvenWithZeroUserTime.enabled, true,
  'A non-positive custom duration must not suppress a mandatory zero infusion');

const forcedProfileRinse = resolveZeroInfusionOptions({
  tea: { ...tea, zeroInfusionProfile: { policy: 'enabled' } },
  waterTempC: 85,
  waterVolumeMl: 100,
});
assert.equal(forcedProfileRinse.enabled, true,
  'An explicit enabled profile should force a zero infusion even for a delicate tea archetype');
assert.equal(forcedProfileRinse.durationSec, 5,
  'A required profile with no duration should receive an explicitly estimated safe starting value');

const disabledProfileRinse = resolveZeroInfusionOptions({
  tea: { ...rinseTea, zeroInfusionProfile: { policy: 'disabled' } },
  waterTempC: 100,
  waterVolumeMl: 100,
});
assert.equal(disabledProfileRinse.enabled, true,
  'A profile setting must not suppress a zero infusion required by the tea itself');

const greenPrior = TEA_ARCHETYPE_EXTRACTION_PRIORS.green;
assert.ok(greenPrior?.caffeine?.sourceCitation?.includes(TEA_EXTRACTION_REFERENCE_SOURCE.doi),
  'The fitted caffeine prior should keep its published source citation');
assert.ok(greenPrior?.theanine?.sourceCitation?.includes(TEA_EXTRACTION_REFERENCE_SOURCE.doi),
  'The fitted theanine prior should keep its published source citation');
assert.equal(TEA_EXTRACTION_REFERENCE_DATA.green.caffeine.length, 6,
  'The calibration data should preserve all six temperature/time conditions');
assert.equal(TEA_EXTRACTION_REFERENCE_DATA.puerh.theanine.length, 6,
  'The calibration data should preserve the low-sample puerh group, too');
assert.ok(
  TEA_ARCHETYPE_CALIBRATION_DIAGNOSTICS.green.rmseCaffeineMgPer200Ml >= 0
  && TEA_ARCHETYPE_CALIBRATION_DIAGNOSTICS.green.rmseTheanineMgPer200Ml >= 0,
  'Calibration diagnostics should report finite non-negative errors',
);
assert.ok(
  TEA_ARCHETYPE_CALIBRATION_DIAGNOSTICS.white.rmseCaffeineMgPer200Ml < 5,
  'White-tea caffeine fit should stay within its documented calibration tolerance',
);
assert.equal(TEA_ARCHETYPE_CALIBRATION_DIAGNOSTICS.puerh.conditionsCountPerCompound, 6,
  'Fit diagnostics should report the six source conditions, independently of the small sample count');

const base = simulate();
assert.equal(base.steeps.length, 3);
assert.ok(
  base.steeps[0].modelNotesRu?.some((note) => note.includes(TEA_EXTRACTION_REFERENCE_SOURCE.doi)),
  'Results should expose the caffeine/theanine calibration source and scope',
);
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

// Without a calibrated per-compound response profile, the new physical model does not
// apply the old universal hardness multiplier to every compound.
const hardWaterWithoutProfile = simulate({ waterHardnessLevel: 'hard' });
assert.equal(
  hardWaterWithoutProfile.steeps[0].caffeineConcentration,
  base.steeps[0].caffeineConcentration,
  'Hardness should not silently act as a universal chemistry multiplier without calibration',
);

const waterCalibratedTea = {
  ...tea,
  physicsProfile: {
    sourceStatus: 'calibrated' as const,
    validationStatus: 'calibrated' as const,
    compounds: {
      caffeine: {
        initialMgPerG: 30,
        extractableFraction: 0.8,
        rateAt85CPerSec: 0.02,
        activationEnergyKJMol: 24.5,
        sourceStatus: 'calibrated' as const,
      },
    },
    waterResponseByHardness: {
      caffeine: { soft: 0.8, optimal: 1, hard: 1.2 },
    },
  },
};
const calibratedSoftWater = simulate({ tea: waterCalibratedTea, waterHardnessLevel: 'soft' });
const calibratedHardWater = simulate({ tea: waterCalibratedTea, waterHardnessLevel: 'hard' });
assert.ok(
  calibratedHardWater.steeps[0].caffeineConcentration > calibratedSoftWater.steeps[0].caffeineConcentration,
  'A configured, compound-specific water-response profile should affect that compound',
);

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

const jointParameters = optimizePhysicalBrewingParameters({
  tea,
  seed: { waterVolumeMl: 100, leafMassGrams: 5, waterTempC: 85, steepsCount: 3 },
  fixed: { waterVolumeMl: 100, leafMassGrams: 5, waterTempC: null, steepsCount: null },
  brewingMethod: 'gongfu',
  optimizationGoal: 'balanced',
  waterHardnessLevel: 'optimal',
  vesselMaterial: 'porcelain',
  zeroInfusion: { enabled: false, durationSec: 0, temperatureC: 85, waterVolumeMl: 100 },
  userDurations: [8, 10, 14],
  optimizeBaseTemperature: true,
  targetSteepIndex: 1,
});
assert.equal(jointParameters.waterVolumeMl, 100,
  'The joint physical optimizer must not change a fixed water volume');
assert.equal(jointParameters.leafMassGrams, 5,
  'The joint physical optimizer must not change a fixed leaf mass');
assert.ok(jointParameters.waterTempC >= 40 && jointParameters.waterTempC <= 100,
  'The joint physical optimizer should keep water temperature within physical UI limits');
assert.ok(jointParameters.steepsCount >= 3 && jointParameters.steepsCount <= 20,
  'The joint physical optimizer should preserve explicit steep indexes and stay within limits');
assert.equal(jointParameters.ratio, 20,
  'The final recommended water-to-tea ratio should match the fixed physical inputs');
assert.ok(Number.isFinite(jointParameters.objectiveScore));

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
