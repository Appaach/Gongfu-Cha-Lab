import type {
  BrewingMethod,
  OptimizationGoal,
  SteepKineticData,
  TeaVariety,
  TrackedTeaCompound,
  VesselMaterialType,
  WaterHardnessLevel,
} from '../types';
import {
  getTeaRinseInfo,
  VESSEL_MATERIALS,
} from '../data/teaData';

type PoolKey = 'theanine' | 'caffeine' | 'egc' | 'egcg' | 'polysaccharides';
type PoolPair = { fast: number; slow: number };
type LeafPools = Record<PoolKey, PoolPair>;
type MassVector = Record<PoolKey, number>;

const GAS_CONSTANT_J_MOL_K = 8.314462618;
const WATER_HEAT_CAPACITY_J_G_K = 4.186;
const REFERENCE_TEMP_K = 358.15; // 85 °C
const AMBIENT_TEMP_C = 22;

interface CompoundKinetics {
  rateAt85CPerSec: number;
  activationEnergyKJMol: number;
}

export interface ZeroInfusionOptions {
  enabled: boolean;
  durationSec: number;
  temperatureC: number;
  waterVolumeMl: number;
  disposition?: 'discard' | 'retain' | 'partial';
  retainedVolumeMl?: number;
  isCustomTime?: boolean;
  isCustomTemperature?: boolean;
}

export interface PhysicalBrewingInput {
  tea: TeaVariety;
  leafMassGrams: number;
  waterVolumeMl: number;
  waterTempC: number;
  durations?: number[];
  requestedSteepsCount?: number;
  waterHardnessLevel?: WaterHardnessLevel;
  vesselMaterial?: VesselMaterialType;
  customFlags?: { isCustomUserTime?: boolean; isAdaptedReference?: boolean }[];
  optimizationGoal?: OptimizationGoal;
  brewingMethod?: BrewingMethod;
  rootFraction?: number;
  perSteepTempsC?: number[];
  customTempFlags?: boolean[];
  zeroInfusion?: ZeroInfusionOptions;
  ambientTempC?: number;
  preheatedVessel?: boolean;
}

export interface PhysicalMassBalance {
  initialAvailableMg: number;
  remainingInLeafMg: number;
  remainingInLiquidMg: number;
  removedFromSystemMg: number;
  discardedFromSystemMg: number;
  consumedFromSystemMg: number;
  extractedFromLeafMg: number;
  balanceErrorMg: number;
}

export interface PhysicalBrewingResult {
  steeps: SteepKineticData[];
  zeroInfusionData: SteepKineticData | null;
  massBalance: PhysicalMassBalance;
  modelConfidence: 'low' | 'medium' | 'high';
  modelNotesRu: string[];
}

interface InitialPools {
  pools: LeafPools;
  totalAvailableMg: number;
  initialGroupPoolsMg: Record<'theanine' | 'caffeine' | 'catechins' | 'polysaccharides', number>;
  compoundKinetics: Record<PoolKey, CompoundKinetics>;
  fastFraction: number;
  confidence: 'low' | 'medium' | 'high';
}

interface StageState {
  liquidVolumeMl: number;
  liquidMassMg: MassVector;
  liquidTempC: number;
  vesselTempC: number;
  wetTimeSec: number;
  extractedFromLeafMg: number;
  removedFromSystemMg: number;
  discardedFromSystemMg: number;
  consumedFromSystemMg: number;
}

const KEYS: PoolKey[] = ['theanine', 'caffeine', 'egc', 'egcg', 'polysaccharides'];

function emptyMassVector(): MassVector {
  return { theanine: 0, caffeine: 0, egc: 0, egcg: 0, polysaccharides: 0 };
}

function emptyLeafPools(): LeafPools {
  return {
    theanine: { fast: 0, slow: 0 },
    caffeine: { fast: 0, slow: 0 },
    egc: { fast: 0, slow: 0 },
    egcg: { fast: 0, slow: 0 },
    polysaccharides: { fast: 0, slow: 0 },
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 2): number {
  const p = 10 ** places;
  return Math.round(value * p) / p;
}

function sumVector(vector: MassVector): number {
  return KEYS.reduce((sum, key) => sum + vector[key], 0);
}

function sumPools(pools: LeafPools): number {
  return KEYS.reduce((sum, key) => sum + pools[key].fast + pools[key].slow, 0);
}

function defaultPoolsPerGram(tea: TeaVariety): {
  theanine: number;
  caffeine: number;
  catechins: number;
  polysaccharides: number;
} {
  // Transitional priors carried forward from the legacy app. They are estimates,
  // not measured composition values for an individual tea or batch.
  switch (tea.type) {
    case 'green': return { theanine: 38, caffeine: 32, catechins: 160, polysaccharides: 25 };
    case 'white': return { theanine: 32, caffeine: 36, catechins: 130, polysaccharides: 30 };
    case 'yellow': return { theanine: 30, caffeine: 32, catechins: 115, polysaccharides: 32 };
    case 'oolong_ball': return { theanine: 26, caffeine: 30, catechins: 100, polysaccharides: 38 };
    case 'oolong_strip': return { theanine: 24, caffeine: 28, catechins: 88, polysaccharides: 40 };
    case 'red': return { theanine: 18, caffeine: 34, catechins: 60, polysaccharides: 42 };
    case 'gaba_oolong': return { theanine: 30, caffeine: 28, catechins: 80, polysaccharides: 40 };
    case 'gaba_red': return { theanine: 24, caffeine: 32, catechins: 55, polysaccharides: 44 };
    case 'sheng_puerh':
      if (tea.id.includes('sheng_young')) return { theanine: 28, caffeine: 36, catechins: 165, polysaccharides: 28 };
      if (tea.id.includes('sheng_old')) return { theanine: 14, caffeine: 30, catechins: 42, polysaccharides: 68 };
      return { theanine: 20, caffeine: 35, catechins: 100, polysaccharides: 46 };
    case 'shou_puerh':
      if (tea.id.includes('shou_young')) return { theanine: 8, caffeine: 26, catechins: 40, polysaccharides: 52 };
      if (tea.id.includes('shou_old')) return { theanine: 12, caffeine: 24, catechins: 18, polysaccharides: 78 };
      return { theanine: 9, caffeine: 25, catechins: 30, polysaccharides: 65 };
    case 'heicha': return { theanine: 10, caffeine: 22, catechins: 45, polysaccharides: 72 };
    case 'custom':
    default: return { theanine: 24, caffeine: 30, catechins: 105, polysaccharides: 40 };
  }
}

function catechinSplitRatio(tea: TeaVariety): number {
  switch (tea.type) {
    case 'green':
    case 'white': return 0.38;
    case 'yellow': return 0.36;
    case 'oolong_ball':
    case 'gaba_oolong': return 0.42;
    case 'red':
    case 'gaba_red': return 0.48;
    case 'shou_puerh':
    case 'heicha': return 0.52;
    default: return 0.35;
  }
}

function defaultFastFraction(tea: TeaVariety): number {
  if (tea.physicsProfile?.fastExtractionFraction !== undefined) {
    return clamp(tea.physicsProfile.fastExtractionFraction, 0.05, 0.95);
  }
  switch (tea.leafMorphology) {
    case 'tight_ball': return 0.24;
    case 'compressed_cake': return 0.28;
    case 'needle': return 0.2;
    case 'twisted_strip': return 0.4;
    case 'flat': return 0.5;
    default: return 0.45;
  }
}

function createInitialPools(tea: TeaVariety, leafMassGrams: number): InitialPools {
  const defaults = defaultPoolsPerGram(tea);
  const profile = tea.physicsProfile?.compounds;
  const pool = emptyLeafPools();
  const mass = Math.max(0.1, leafMassGrams);

  const initialMg = (key: TrackedTeaCompound, fallbackMgPerG: number): number => {
    const total = profile?.[key]?.initialMgPerG ?? fallbackMgPerG;
    // Return total compound mass here; extractableFraction is applied exactly once in addPool.
    return Math.max(0, total) * mass;
  };

  const addPool = (key: PoolKey, totalMg: number, sourceKey: TrackedTeaCompound): void => {
    const parameter = profile?.[sourceKey];
    const aggregateCatechinFraction = key === 'egc' || key === 'egcg'
      ? profile?.catechins?.extractableFraction
      : undefined;
    const availableFraction = clamp(parameter?.extractableFraction ?? aggregateCatechinFraction ?? 1, 0, 1);
    const availableMg = Math.max(0, totalMg) * availableFraction;
    const fastFraction = defaultFastFraction(tea);
    pool[key] = {
      fast: availableMg * fastFraction,
      slow: availableMg * (1 - fastFraction),
    };
  };

  addPool('theanine', initialMg('theanine', defaults.theanine), 'theanine');
  addPool('caffeine', initialMg('caffeine', defaults.caffeine), 'caffeine');
  addPool('polysaccharides', initialMg('polysaccharides', defaults.polysaccharides), 'polysaccharides');

  const catechinTotalMg = initialMg('catechins', defaults.catechins);
  const egcParam = profile?.egc;
  const egcgParam = profile?.egcg;
  let egcMg: number;
  let egcgMg: number;
  if (egcParam?.initialMgPerG !== undefined && egcgParam?.initialMgPerG !== undefined) {
    egcMg = Math.max(0, egcParam.initialMgPerG) * mass;
    egcgMg = Math.max(0, egcgParam.initialMgPerG) * mass;
  } else if (egcParam?.initialMgPerG !== undefined) {
    egcMg = Math.max(0, egcParam.initialMgPerG) * mass;
    egcgMg = Math.max(0, catechinTotalMg - egcMg);
  } else if (egcgParam?.initialMgPerG !== undefined) {
    egcgMg = Math.min(catechinTotalMg, Math.max(0, egcgParam.initialMgPerG) * mass);
    egcMg = Math.max(0, catechinTotalMg - egcgMg);
  } else {
    egcMg = catechinTotalMg * catechinSplitRatio(tea);
    egcgMg = catechinTotalMg - egcMg;
  }
  addPool('egc', egcMg, egcParam ? 'egc' : 'catechins');
  addPool('egcg', egcgMg, egcgParam ? 'egcg' : 'catechins');

  // If the overall catechin pool is supplied, it is already represented by EGC + EGCG;
  // never count the aggregate pool a second time.
  const initialAvailableMg = sumPools(pool);
  const initialGroupPoolsMg = {
    theanine: pool.theanine.fast + pool.theanine.slow,
    caffeine: pool.caffeine.fast + pool.caffeine.slow,
    catechins: pool.egc.fast + pool.egc.slow + pool.egcg.fast + pool.egcg.slow,
    polysaccharides: pool.polysaccharides.fast + pool.polysaccharides.slow,
  };

  const fallbackKinetics: Record<PoolKey, CompoundKinetics> = {
    theanine: { rateAt85CPerSec: 0.035, activationEnergyKJMol: 14.2 },
    caffeine: { rateAt85CPerSec: 0.02, activationEnergyKJMol: 24.5 },
    egc: { rateAt85CPerSec: 0.018, activationEnergyKJMol: 22 },
    egcg: { rateAt85CPerSec: 0.008, activationEnergyKJMol: 39.2 },
    polysaccharides: { rateAt85CPerSec: 0.004, activationEnergyKJMol: 30.8 },
  };

  const compoundKinetics = {} as Record<PoolKey, CompoundKinetics>;
  for (const key of KEYS) {
    const profileKey: TrackedTeaCompound = key === 'egc' || key === 'egcg' ? key : key;
    const specific = profile?.[profileKey];
    const aggregate = key === 'egc' || key === 'egcg' ? profile?.catechins : undefined;
    const fallback = fallbackKinetics[key];
    let rate = specific?.rateAt85CPerSec ?? aggregate?.rateAt85CPerSec ?? fallback.rateAt85CPerSec;
    let ea = specific?.activationEnergyKJMol ?? aggregate?.activationEnergyKJMol ?? fallback.activationEnergyKJMol;
    if ((key === 'egc' || key === 'egcg') && specific?.rateAt85CPerSec === undefined && aggregate?.rateAt85CPerSec !== undefined) {
      rate *= key === 'egc' ? 1.15 : 0.65;
    }
    compoundKinetics[key] = {
      rateAt85CPerSec: clamp(rate, 0.000001, 2),
      activationEnergyKJMol: clamp(ea, 0, 200),
    };
  }

  const measuredSourceParameters = KEYS.map((key) => {
    const parameter = profile?.[key]
      ?? (key === 'egc' || key === 'egcg' ? profile?.catechins : undefined);
    const hasRequiredValues = parameter?.initialMgPerG !== undefined
      && parameter?.rateAt85CPerSec !== undefined
      && parameter?.activationEnergyKJMol !== undefined;
    return {
      status: parameter?.sourceStatus ?? 'estimated',
      hasRequiredValues,
    };
  });
  const fullyMeasured = measuredSourceParameters.every((item) =>
    item.status === 'measured' && item.hasRequiredValues,
  );
  const fullyCalibrated = measuredSourceParameters.every((item) =>
    (item.status === 'measured' || item.status === 'calibrated') && item.hasRequiredValues,
  );
  const profileStatus = tea.physicsProfile?.validationStatus;
  const confidence: 'low' | 'medium' | 'high' =
    profileStatus === 'validated' && fullyMeasured
      ? 'high'
      : (profileStatus === 'calibrated' || profileStatus === 'validated') && fullyCalibrated
        ? 'medium'
        : 'low';


  return {
    pools: pool,
    totalAvailableMg: initialAvailableMg,
    initialGroupPoolsMg,
    compoundKinetics,
    fastFraction: defaultFastFraction(tea),
    confidence,
  };
}

function getThermalProfile(material?: VesselMaterialType) {
  const vessel = VESSEL_MATERIALS.find((item) => item.id === (material ?? 'porcelain')) ?? VESSEL_MATERIALS[0];
  const profile = vessel.thermalProfile;
  // Until measured vessel profiles are available, preserve only the relative cooling
  // ordering in the legacy heat-loss field; this is an estimated prior, not calibration.
  const legacyHeatLoss = Math.max(0.1, vessel.heatLossPerSteepC || 4.5);
  return {
    effectiveHeatCapacityJPerK: profile?.effectiveHeatCapacityJPerK ?? 90,
    timeConstantSecAt100Ml: profile?.timeConstantSecAt100Ml
      ?? clamp(280 * (4.5 / legacyHeatLoss), 30, 3600),
    sourceStatus: profile?.sourceStatus ?? 'estimated',
  };
}

function calculateMixTemperature(
  addedWaterMl: number,
  addedWaterTempC: number,
  existingVolumeMl: number,
  existingTempC: number,
  vesselTempC: number,
  vesselHeatCapacityJPerK: number,
): number {
  const addMassG = Math.max(0, addedWaterMl);
  const existingMassG = Math.max(0, existingVolumeMl);
  const numerator = addMassG * WATER_HEAT_CAPACITY_J_G_K * addedWaterTempC
    + existingMassG * WATER_HEAT_CAPACITY_J_G_K * existingTempC
    + vesselHeatCapacityJPerK * vesselTempC;
  const denominator = (addMassG + existingMassG) * WATER_HEAT_CAPACITY_J_G_K + vesselHeatCapacityJPerK;
  if (denominator <= 0) return addedWaterTempC;
  return clamp(numerator / denominator, 0, 100);
}

function effectiveTau(baseTau: number, volumeMl: number): number {
  return clamp(baseTau * Math.pow(Math.max(0.25, volumeMl / 100), 0.35), 15, 7200);
}

function temperatureAtSeconds(startTempC: number, seconds: number, ambientTempC: number, tau: number): number {
  return ambientTempC + (startTempC - ambientTempC) * Math.exp(-Math.max(0, seconds) / Math.max(1, tau));
}

function integrateRate(
  kinetics: CompoundKinetics,
  startTempC: number,
  durationSec: number,
  ambientTempC: number,
  tau: number,
  hydrationFactor: number,
  hardnessMultiplier: number,
): number {
  let exposure = 0;
  const duration = clamp(durationSec, 0, 3600);
  for (let elapsed = 0; elapsed < duration; elapsed += 1) {
    const dt = Math.min(1, duration - elapsed);
    const tempK = temperatureAtSeconds(startTempC, elapsed + dt / 2, ambientTempC, tau) + 273.15;
    const exponent = -(kinetics.activationEnergyKJMol * 1000 / GAS_CONSTANT_J_MOL_K)
      * (1 / tempK - 1 / REFERENCE_TEMP_K);
    const kAtTemperature = kinetics.rateAt85CPerSec * Math.exp(clamp(exponent, -40, 40));
    exposure += kAtTemperature * dt * hydrationFactor * hardnessMultiplier;
  }
  return Math.max(0, exposure);
}

function extractFromLeaf(
  pools: LeafPools,
  liquidMass: MassVector,
  initial: InitialPools,
  temperatureAtStartC: number,
  durationSec: number,
  ambientTempC: number,
  tau: number,
  hydrationFactor: number,
  hardnessMultipliers: Record<PoolKey, number>,
): MassVector {
  const extracted = emptyMassVector();
  for (const key of KEYS) {
    const totalK = integrateRate(
      initial.compoundKinetics[key],
      temperatureAtStartC,
      durationSec,
      ambientTempC,
      tau,
      hydrationFactor,
      hardnessMultipliers[key],
    );
    const fastK = totalK * 1.8;
    const slowK = totalK * 0.45;
    const fastExtracted = pools[key].fast * (1 - Math.exp(-fastK));
    const slowExtracted = pools[key].slow * (1 - Math.exp(-slowK));
    const amount = clamp(fastExtracted + slowExtracted, 0, pools[key].fast + pools[key].slow);
    pools[key].fast = Math.max(0, pools[key].fast - fastExtracted);
    pools[key].slow = Math.max(0, pools[key].slow - slowExtracted);
    liquidMass[key] += amount;
    extracted[key] = amount;
  }
  return extracted;
}

function totalExtracted(mass: MassVector): number {
  return sumVector(mass);
}

function concentrationPer100Ml(amountMg: number, volumeMl: number): number {
  return volumeMl > 0 ? (amountMg / volumeMl) * 100 : 0;
}

function createSteepRow(args: {
  tea: TeaVariety;
  steepNumber: number;
  durationSec: number;
  pourTempC: number;
  mixedTempC: number;
  liquidVolumeMl: number;
  liquidMass: MassVector;
  freshWaterAddedMl: number;
  drinkableVolumeMl: number;
  retainedRootVolumeMl: number;
  retainedLiquidVolumeMl: number;
  carryoverMassMg: number;
  extractedThisStage: MassVector;
  cumulativeExtractedMg: number;
  leafMassG: number;
  wetTimeSec: number;
  brewingMethod: BrewingMethod;
  isCustomTime?: boolean;
  isAdaptedReference?: boolean;
  isCustomTemp?: boolean;
  zeroDiscardedMg?: number;
  modelConfidence: 'low' | 'medium' | 'high';
  isZero?: boolean;
}): SteepKineticData {
  const volume = Math.max(0, args.liquidVolumeMl);
  const mass = args.liquidMass;
  const theanine = concentrationPer100Ml(mass.theanine, volume);
  const caffeine = concentrationPer100Ml(mass.caffeine, volume);
  const egc = concentrationPer100Ml(mass.egc, volume);
  const egcg = concentrationPer100Ml(mass.egcg, volume);
  const catechins = egc + egcg;
  const polysaccharides = concentrationPer100Ml(mass.polysaccharides, volume);
  const trackedLiquidMg = sumVector(mass);
  const tdsPpm = volume > 0 ? (trackedLiquidMg / volume) * 1000 : 0;
  const totalLeafMassMg = Math.max(0.1, args.leafMassG) * 1000;
  const yieldPercent = totalLeafMassMg > 0 ? (args.cumulativeExtractedMg / totalLeafMassMg) * 100 : 0;
  const ratio = catechins > 0 ? theanine / catechins : 0;
  const harmony = (theanine + 1.2 * egc) / Math.max(0.1, 0.2 * caffeine + egcg);
  const scores = {
    umami: clamp((theanine / 20) * 5, 0, 10),
    sweetness: clamp(((theanine * 0.45 + polysaccharides * 0.55) / 16) * 5, 0, 10),
    bitterness: clamp(((caffeine * 0.4 + egcg * 0.6) / 30) * 5, 0, 10),
    astringency: clamp((egcg / 25) * 5, 0, 10),
    body: clamp(((polysaccharides * 0.65 + catechins * 0.35) / 30) * 5, 0, 10),
    // MVP deliberately does not infer dynamic aroma from concentration kinetics.
    aroma: 5,
  };
  const typicalNotes = args.tea.keySensoryNotes?.slice(0, 3).join('、') || 'типовой профиль выбранной категории';
  const keyNotes = args.isZero
    ? 'Нулевой пролив: экстракция учтена отдельно. ' + (args.zeroDiscardedMg !== undefined
      ? 'Удалено со слитой жидкостью около ' + round(args.zeroDiscardedMg, 1) + ' мг отслеживаемых веществ.'
      : 'Часть извлечённых веществ остаётся в жидкости, удерживаемой листьями.')
    : 'Типовые ноты чая: ' + typicalNotes + '. Аромат по этапам в MVP отдельно не моделируется.';
  const sourceText = args.modelConfidence === 'low'
    ? 'Физическая модель v2; параметры категории являются оценочными. Результат не является лабораторным измерением.'
    : 'Физическая модель v2; используются параметры профиля с заявленной калибровкой. Результат зависит от условий эксперимента.';

  return {
    steepNumber: args.steepNumber,
    timeSec: round(Math.max(0, args.durationSec), 1),
    theanineConcentration: round(theanine, 3),
    caffeineConcentration: round(caffeine, 3),
    catechinsConcentration: round(catechins, 3),
    egcConcentration: round(egc, 3),
    egcgConcentration: round(egcg, 3),
    polysaccharidesConcentration: round(polysaccharides, 3),
    volatilesIntensity: 50,
    tdsPpm: round(tdsPpm, 1),
    cumulativeExtractionYieldPercent: round(yieldPercent, 3),
    theanineToCatechinsRatio: round(ratio, 3),
    tasteHarmonyIndex: round(harmony, 3),
    leafSwellingPercent: round(100 * (1 - Math.exp(-Math.max(0, args.wetTimeSec) / 35)), 1),
    mixedTemperatureC: round(args.mixedTempC, 2),
    sensoryScores: {
      umami: round(scores.umami, 1),
      sweetness: round(scores.sweetness, 1),
      bitterness: round(scores.bitterness, 1),
      astringency: round(scores.astringency, 1),
      body: round(scores.body, 1),
      aroma: scores.aroma,
    },
    keyNotes,
    scientificReferenceRu: sourceText,
    isCustomUserTime: args.isCustomTime,
    isAdaptedReference: args.isAdaptedReference,
    waterTempC: round(args.pourTempC, 1),
    isCustomTemp: args.isCustomTemp,
    brewingMethod: args.brewingMethod,
    retainedRootVolumeMl: args.retainedRootVolumeMl > 0 ? round(args.retainedRootVolumeMl, 2) : undefined,
    retainedLiquidVolumeMl: round(args.retainedLiquidVolumeMl, 2),
    freshWaterAddedMl: round(args.freshWaterAddedMl, 2),
    rootCarryoverSolutesMg: args.carryoverMassMg > 0 ? round(args.carryoverMassMg, 2) : undefined,
    modelConfidence: args.modelConfidence,
    aromaBasis: 'archetype',
    extractionYieldBasis: 'tracked-compounds',
    drinkableVolumeMl: round(args.drinkableVolumeMl, 2),
    trackedCompoundsExtractedMg: round(totalExtracted(args.extractedThisStage), 3),
    zeroInfusionDiscardedSolutesMg: args.zeroDiscardedMg !== undefined ? round(args.zeroDiscardedMg, 3) : undefined,
    modelNotesRu: [
      'Концентрации рассчитаны для четырёх групп: теанин, кофеин, катехины и полисахариды.',
      'Выход относится только к отслеживаемым веществам, а не ко всему сухому экстракту.',
      'TDS здесь является прокси по четырём отслеживаемым группам, а не измерением общего содержания растворённых веществ.',
      'Сенсорные баллы предварительные и не откалиброваны на дегустационной панели.',
      'Аромат представлен типовым профилем чая, а не динамическим химическим прогнозом.',
    ],
  };
}

function zeroRowWithoutExtraction(
  tea: TeaVariety,
  waterTempC: number,
  brewingMethod: BrewingMethod,
  isCustomTime: boolean,
  isCustomTemperature: boolean,
): SteepKineticData {
  return {
    steepNumber: 0,
    timeSec: 0,
    theanineConcentration: 0,
    caffeineConcentration: 0,
    catechinsConcentration: 0,
    egcConcentration: 0,
    egcgConcentration: 0,
    polysaccharidesConcentration: 0,
    volatilesIntensity: 0,
    tdsPpm: 0,
    cumulativeExtractionYieldPercent: 0,
    theanineToCatechinsRatio: 0,
    tasteHarmonyIndex: 0,
    leafSwellingPercent: 0,
    mixedTemperatureC: waterTempC,
    sensoryScores: { umami: 0, sweetness: 0, bitterness: 0, astringency: 0, body: 0, aroma: 0 },
    keyNotes: 'Нулевой пролив пропущен: экстракция не рассчитывается.',
    scientificReferenceRu: 'Этап с нулевой длительностью не изменяет состояние чайного листа.',
    isCustomUserTime: isCustomTime,
    isCustomTemp: isCustomTemperature,
    brewingMethod,
    modelConfidence: 'low',
    aromaBasis: 'not-modeled',
    extractionYieldBasis: 'tracked-compounds',
    modelNotesRu: ['Нулевой пролив отключён или имеет нулевую длительность.'],
  };
}

function hardnessMultipliersFor(
  tea: TeaVariety,
  level: WaterHardnessLevel | undefined,
): Record<PoolKey, number> {
  const selectedLevel = level ?? 'optimal';
  const response = tea.physicsProfile?.waterResponseByHardness;
  const forCompound = (key: PoolKey): number => {
    const direct = response?.[key]?.[selectedLevel];
    const aggregate = (key === 'egc' || key === 'egcg')
      ? response?.catechins?.[selectedLevel]
      : undefined;
    // No universal hardness coefficient is applied. A response is used only when
    // an explicit compound-specific empirical profile exists.
    return clamp(direct ?? aggregate ?? 1, 0.5, 1.5);
  };
  return {
    theanine: forCompound('theanine'),
    caffeine: forCompound('caffeine'),
    egc: forCompound('egc'),
    egcg: forCompound('egcg'),
    polysaccharides: forCompound('polysaccharides'),
  };
}

function runPhysicalSimulation(input: PhysicalBrewingInput): PhysicalBrewingResult {
  const tea = input.tea;
  const leafMassG = clamp(input.leafMassGrams, 0.1, 100);
  const targetVolumeMl = clamp(input.waterVolumeMl, 10, 5000);
  const defaultTempC = clamp(input.waterTempC, 40, 100);
  const ambientTempC = clamp(input.ambientTempC ?? AMBIENT_TEMP_C, 0, 40);
  const method = input.brewingMethod ?? 'gongfu';
  const rootFraction = clamp(input.rootFraction ?? 0.33, 0.05, 0.8);
  const thermal = getThermalProfile(input.vesselMaterial);
  const initial = createInitialPools(tea, leafMassG);
  const leafPools = initial.pools;
  const liquidMass = emptyMassVector();
  const extractedThisStage = emptyMassVector();
  const state: StageState = {
    liquidVolumeMl: 0,
    liquidMassMg: emptyMassVector(),
    liquidTempC: ambientTempC,
    vesselTempC: input.preheatedVessel ? defaultTempC : ambientTempC,
    wetTimeSec: 0,
    extractedFromLeafMg: 0,
    removedFromSystemMg: 0,
    discardedFromSystemMg: 0,
    consumedFromSystemMg: 0,
  };
  const notes: string[] = [
    'Начальные запасы и кинетические параметры не измерены для индивидуальной партии; используются типовые оценочные значения.',
    'Поправка на жёсткость применяется только при наличии профиля waterResponseByHardness для конкретного соединения; иначе прямой химический эффект воды не откалиброван.',
    'Профили охлаждения посуды оценочные: относительный порядок унаследован из legacy heatLossPerSteepC и требует экспериментальной калибровки.',
  ];
  if (thermal.sourceStatus !== 'measured') notes.push('Тепловые параметры посуды имеют статус ' + thermal.sourceStatus + '.');

  const modelConfidence = initial.confidence;
  const hardnessMultipliers = hardnessMultipliersFor(tea, input.waterHardnessLevel);
  const fastFraction = initial.fastFraction;
  const leafRetentionMl = clamp(
    tea.physicsProfile?.leafLiquidRetentionMlPerG ?? 1.5,
    0,
    10,
  ) * leafMassG;

  let zeroInfusionData: SteepKineticData | null = null;
  const zero = input.zeroInfusion;
  let cumulativeExtractedMg = 0;

  const runStage = (args: {
    number: number;
    durationSec: number;
    waterTempC: number;
    targetVolumeMl: number;
    isZero: boolean;
    disposition?: 'discard' | 'retain' | 'partial';
    retainedVolumeMl?: number;
    isCustomTime?: boolean;
    isCustomTemperature?: boolean;
    isAdaptedReference?: boolean;
  }): SteepKineticData => {
    const duration = clamp(args.durationSec, 0, 3600);
    const addedWaterMl = args.isZero || method === 'gongfu'
      // For gongfu, waterVolumeMl is the fresh pour volume. Liquid absorbed by wet leaves
      // carries forward but must not silently reduce the user's next pour.
      ? Math.max(0, args.targetVolumeMl)
      // Liu Gen and the cup method treat waterVolumeMl as the target vessel fill volume:
      // fresh water tops up the free/root liquid that remains after the previous drink/drain.
      : Math.max(0, args.targetVolumeMl - state.liquidVolumeMl);
    const pourTemp = clamp(args.waterTempC, 40, 100);
    const carriedMassMg = sumVector(state.liquidMassMg);
    const mixedTemp = calculateMixTemperature(
      addedWaterMl,
      pourTemp,
      state.liquidVolumeMl,
      state.liquidTempC,
      state.vesselTempC,
      thermal.effectiveHeatCapacityJPerK,
    );
    const totalVolumeBeforeDrain = state.liquidVolumeMl + addedWaterMl;
    state.liquidVolumeMl = totalVolumeBeforeDrain;
    state.liquidTempC = mixedTemp;
    const tau = effectiveTau(thermal.timeConstantSecAt100Ml, totalVolumeBeforeDrain);
    const hydrationFactor = clamp(0.55 + 0.45 * (1 - Math.exp(-state.wetTimeSec / 35)), 0.35, 1);
    const freshExtracted = extractFromLeaf(
      leafPools,
      state.liquidMassMg,
      initial,
      mixedTemp,
      duration,
      ambientTempC,
      tau,
      hydrationFactor,
      hardnessMultipliers,
    );
    const stageExtractedMg = sumVector(freshExtracted);
    state.extractedFromLeafMg += stageExtractedMg;
    cumulativeExtractedMg += stageExtractedMg;
    state.wetTimeSec += duration;
    const endTemp = temperatureAtSeconds(mixedTemp, duration, ambientTempC, tau);
    state.liquidTempC = endTemp;
    state.vesselTempC = clamp(state.vesselTempC * 0.55 + endTemp * 0.45, ambientTempC, 100);

    const preDrainVolume = state.liquidVolumeMl;
    const preDrainMass = { ...state.liquidMassMg };
    const leafHeld = Math.min(preDrainVolume, leafRetentionMl);
    let targetRetainedVolume: number;
    if (args.isZero) {
      const disposition = args.disposition ?? 'discard';
      if (disposition === 'retain') {
        targetRetainedVolume = preDrainVolume;
      } else if (disposition === 'partial') {
        targetRetainedVolume = Math.max(leafHeld, args.retainedVolumeMl ?? leafHeld);
      } else {
        targetRetainedVolume = leafHeld;
      }
    } else if (method === 'gongfu') {
      targetRetainedVolume = leafHeld;
    } else if (method === 'liu_gen') {
      targetRetainedVolume = Math.max(leafHeld, targetVolumeMl * rootFraction);
    } else {
      // Grandpa cup: the tea leaves remain in the cup; each modeled sip/refill cycle
      // leaves a root fraction in the vessel and tops the system back up to target volume.
      targetRetainedVolume = Math.max(leafHeld, preDrainVolume * rootFraction);
    }
    targetRetainedVolume = clamp(targetRetainedVolume, 0, preDrainVolume);
    const removedVolume = Math.max(0, preDrainVolume - targetRetainedVolume);
    const retainedRatio = preDrainVolume > 0 ? targetRetainedVolume / preDrainVolume : 0;
    const removedMass: MassVector = emptyMassVector();
    for (const key of KEYS) {
      removedMass[key] = preDrainMass[key] * (1 - retainedRatio);
      state.liquidMassMg[key] = preDrainMass[key] * retainedRatio;
    }
    const removedMassTotal = sumVector(removedMass);
    state.removedFromSystemMg += removedMassTotal;
    if (args.isZero) {
      state.discardedFromSystemMg += removedMassTotal;
    } else {
      state.consumedFromSystemMg += removedMassTotal;
    }
    state.liquidVolumeMl = targetRetainedVolume;

    const rootFreeVolume = Math.max(0, targetRetainedVolume - leafHeld);
    const row = createSteepRow({
      tea,
      steepNumber: args.number,
      durationSec: duration,
      pourTempC: pourTemp,
      mixedTempC: mixedTemp,
      liquidVolumeMl: preDrainVolume,
      liquidMass: preDrainMass,
      freshWaterAddedMl: addedWaterMl,
      // The zero-infusion liquid is not a drinking serving, even when only part of it is drained.
      drinkableVolumeMl: args.isZero ? 0 : removedVolume,
      retainedRootVolumeMl: method === 'gongfu' ? 0 : rootFreeVolume,
      retainedLiquidVolumeMl: targetRetainedVolume,
      carryoverMassMg: carriedMassMg,
      extractedThisStage: freshExtracted,
      cumulativeExtractedMg,
      leafMassG,
      wetTimeSec: state.wetTimeSec,
      brewingMethod: method,
      isCustomTime: args.isCustomTime,
      isAdaptedReference: args.isAdaptedReference,
      isCustomTemp: args.isCustomTemperature,
      zeroDiscardedMg: args.isZero && (args.disposition ?? 'discard') !== 'retain'
        ? sumVector(removedMass)
        : undefined,
      modelConfidence,
      isZero: args.isZero,
    });
    return row;
  };

  if (zero?.enabled && zero.durationSec > 0) {
    zeroInfusionData = runStage({
      number: 0,
      durationSec: zero.durationSec,
      waterTempC: zero.temperatureC,
      targetVolumeMl: zero.waterVolumeMl,
      isZero: true,
      disposition: zero.disposition ?? 'discard',
      retainedVolumeMl: zero.retainedVolumeMl,
      isCustomTime: zero.isCustomTime,
      isCustomTemperature: zero.isCustomTemperature,
    });
  }

  const count = input.durations
    ? input.durations.length
    : Math.max(1, Math.min(60, Math.round(input.requestedSteepsCount ?? tea.recommendedSteeps ?? 8)));
  const steeps: SteepKineticData[] = [];
  for (let i = 0; i < count; i += 1) {
    const duration = input.durations?.[i] ?? input.durations?.[input.durations.length - 1] ?? 30;
    const pourTemp = input.perSteepTempsC?.[i] ?? defaultTempC;
    const customFlag = input.customFlags?.[i];
    const row = runStage({
      number: i + 1,
      durationSec: duration,
      waterTempC: pourTemp,
      targetVolumeMl: targetVolumeMl,
      isZero: false,
      isCustomTime: customFlag?.isCustomUserTime,
      isAdaptedReference: customFlag?.isAdaptedReference,
      isCustomTemperature: input.customTempFlags?.[i] ?? false,
    });
    if (method === 'grandpa_cup') {
      row.keyNotes += ' Листья остаются в кружке; следующий долив разбавляет остаток, а экстракция продолжается.';
    } else if (method === 'liu_gen') {
      row.keyNotes += ' Часть свободного настоя сохраняется и переносит растворённые вещества в следующий пролив.';
    }
    steeps.push(row);
  }

  const remainingInLeafMg = sumPools(leafPools);
  const remainingInLiquidMg = sumVector(state.liquidMassMg);
  const removedFromSystemMg = state.removedFromSystemMg;
  const balanceErrorMg = initial.totalAvailableMg
    - remainingInLeafMg
    - remainingInLiquidMg
    - removedFromSystemMg;
  const massBalance: PhysicalMassBalance = {
    initialAvailableMg: initial.totalAvailableMg,
    remainingInLeafMg,
    remainingInLiquidMg,
    removedFromSystemMg,
    discardedFromSystemMg: state.discardedFromSystemMg,
    consumedFromSystemMg: state.consumedFromSystemMg,
    extractedFromLeafMg: state.extractedFromLeafMg,
    balanceErrorMg,
  };

  return {
    steeps,
    zeroInfusionData,
    massBalance,
    modelConfidence,
    modelNotesRu: notes,
  };
}


export interface PhysicalScheduleOptimizationInput {
  simulation: PhysicalBrewingInput;
  /** Non-null entries are explicit user times and must remain fixed. */
  userDurations?: (number | null)[];
  /** Non-null entries are explicit user temperatures and must remain fixed. */
  userTemperaturesC?: (number | null)[];
  /** Only optimize temperatures when the user chose the dynamic-temperature mode. */
  optimizeTemperatures?: boolean;
  /** Index of the target steep for the bright-peak goal. */
  targetSteepIndex?: number;
}

export interface PhysicalScheduleOptimizationResult {
  durations: number[];
  baselineDurations: number[];
  temperaturesC: number[];
  objectiveScore: number;
  optimizedDurationIndexes: number[];
  optimizedTemperatureIndexes: number[];
  objectiveDescriptionRu: string;
}

function defaultDurationForStage(tea: TeaVariety, method: BrewingMethod, index: number): number {
  if (method === 'grandpa_cup') {
    return index === 0 ? 120 : Math.min(240, 75 + index * 20);
  }
  let initial: number;
  let increment: number;
  if (tea.type === 'green' || tea.type === 'yellow') {
    initial = 7;
    increment = 4;
  } else if (tea.type === 'white') {
    initial = tea.leafMorphology === 'compressed_cake' ? 10 : 8;
    increment = 5;
  } else if (tea.type === 'shou_puerh' || tea.type === 'heicha') {
    initial = 8;
    increment = 7;
  } else if (tea.leafMorphology === 'tight_ball' || tea.leafMorphology === 'compressed_cake') {
    initial = 9;
    increment = 5;
  } else {
    initial = 6;
    increment = 5;
  }
  const methodFactor = method === 'liu_gen' ? 1.2 : 1;
  return Math.round(clamp((initial + index * increment) * methodFactor, 2, 300));
}

function scheduleUtility(result: PhysicalBrewingResult, goal: OptimizationGoal | undefined, targetIndex: number): number {
  const rows = result.steeps;
  if (rows.length === 0) return -Infinity;
  const rowQuality = (row: SteepKineticData): number => {
    const s = row.sensoryScores;
    return s.umami + s.sweetness + 0.65 * s.body - 0.8 * s.bitterness - 0.9 * s.astringency;
  };
  const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const quality = rows.map(rowQuality);
  const gentleTimePenalty = rows.reduce((sum, row) => sum + row.timeSec, 0) * 0.0005;

  switch (goal) {
    case 'max_longevity': {
      const viableStages = quality.filter((value) => value >= 4.5).length;
      const balance = average(quality.map((value) => -Math.abs(value - 7)));
      return viableStages * 4 + balance - gentleTimePenalty;
    }
    case 'oil_tar':
    case 'body_density':
      return average(rows.map((row) =>
        1.25 * row.sensoryScores.body
        + 0.55 * row.sensoryScores.astringency
        + 0.25 * row.sensoryScores.bitterness
        + 0.25 * row.sensoryScores.sweetness
      )) - gentleTimePenalty;
    case 'white_debitter':
      return average(rows.map((row) =>
        0.65 * row.sensoryScores.umami
        + 0.9 * row.sensoryScores.sweetness
        + 0.45 * row.sensoryScores.body
        - 1.15 * row.sensoryScores.bitterness
        - 1.35 * row.sensoryScores.astringency
      )) - gentleTimePenalty;
    case 'aroma_peak': {
      const target = rows[Math.min(rows.length - 1, Math.max(0, targetIndex))] ?? rows[0];
      return 2 * rowQuality(target) + 0.2 * average(quality) - gentleTimePenalty;
    }
    case 'umami_sweetness':
      return average(rows.map((row) =>
        row.sensoryScores.umami
        + row.sensoryScores.sweetness
        + 0.25 * row.sensoryScores.body
        - 0.45 * row.sensoryScores.bitterness
        - 0.55 * row.sensoryScores.astringency
      )) - gentleTimePenalty;
    case 'balanced':
    default:
      return average(quality) - gentleTimePenalty;
  }
}

/**
 * Coordinate-search scheduler using the shared physical simulation as its objective.
 * The search is intentionally small and deterministic for responsive UI updates.
 * Taste scores are currently uncalibrated proxies, so this is a heuristic optimizer,
 * not a validated model of human preference.
 */
export function optimizePhysicalSchedule(
  input: PhysicalScheduleOptimizationInput,
): PhysicalScheduleOptimizationResult {
  const simulation = input.simulation;
  const method = simulation.brewingMethod ?? 'gongfu';
  const tea = simulation.tea;
  const count = Math.max(1, Math.min(20, Math.round(
    simulation.requestedSteepsCount ?? simulation.durations?.length ?? tea.recommendedSteeps ?? 8,
  )));
  const durationMin = method === 'grandpa_cup' ? 30 : 2;
  const durationMax = method === 'grandpa_cup' ? 600 : 300;
  const baseTemp = clamp(simulation.waterTempC, 40, 100);
  const durations = Array.from({ length: count }, (_, index) => {
    const userValue = input.userDurations?.[index];
    if (userValue !== null && userValue !== undefined && userValue > 0) {
      // Preserve valid explicit user values; candidate-search bounds apply only to auto values.
      return clamp(Math.round(userValue), 1, 3600);
    }
    return defaultDurationForStage(tea, method, index);
  });
  const baselineDurations = Array.from({ length: count }, (_, index) =>
    defaultDurationForStage(tea, method, index),
  );
  const temperatures = Array.from({ length: count }, (_, index) => {
    const userValue = input.userTemperaturesC?.[index];
    const simulatedValue = simulation.perSteepTempsC?.[index] ?? baseTemp;
    if (userValue !== null && userValue !== undefined && userValue > 0) {
      return clamp(Math.round(userValue), 40, 100);
    }
    return input.optimizeTemperatures
      ? clamp(Math.round(simulatedValue), tea.tempRange[0], tea.tempRange[1])
      : clamp(Math.round(simulatedValue), 40, 100);
  });

  const fixedDuration = durations.map((_, index) =>
    input.userDurations?.[index] !== null
    && input.userDurations?.[index] !== undefined
    && (input.userDurations?.[index] ?? 0) > 0,
  );
  const fixedTemperature = temperatures.map((_, index) =>
    input.userTemperaturesC?.[index] !== null
    && input.userTemperaturesC?.[index] !== undefined
    && (input.userTemperaturesC?.[index] ?? 0) > 0,
  );
  const optimizedDurationIndexes: number[] = [];
  const optimizedTemperatureIndexes: number[] = [];
  const allowTemperatureOptimization = Boolean(input.optimizeTemperatures);

  const evaluate = (candidateDurations: number[], candidateTemps: number[]) => {
    const result = runPhysicalSimulation({
      ...simulation,
      durations: candidateDurations,
      requestedSteepsCount: candidateDurations.length,
      perSteepTempsC: candidateTemps,
    });
    return scheduleUtility(result, simulation.optimizationGoal, input.targetSteepIndex ?? 1);
  };

  let bestScore = evaluate(durations, temperatures);
  const durationMultipliers = [0.6, 0.85, 1, 1.25, 1.6];
  const passes = count <= 12 ? 2 : 1;

  for (let pass = 0; pass < passes; pass += 1) {
    for (let index = 0; index < count; index += 1) {
      const timeCandidates = fixedDuration[index]
        ? [durations[index]]
        : [...new Set(durationMultipliers.map((multiplier) =>
          clamp(Math.round(durations[index] * multiplier), durationMin, durationMax),
        ))];

      let tempCandidates = [temperatures[index]];
      if (allowTemperatureOptimization && !fixedTemperature[index]) {
        const [minTemp, maxTemp] = tea.tempRange;
        tempCandidates = [...new Set([
          clamp(temperatures[index] - 4, minTemp, maxTemp),
          clamp(temperatures[index], minTemp, maxTemp),
          clamp(temperatures[index] + 4, minTemp, maxTemp),
        ])];
      }

      let localBestScore = bestScore;
      let localBestTime = durations[index];
      let localBestTemp = temperatures[index];
      for (const candidateTime of timeCandidates) {
        for (const candidateTemp of tempCandidates) {
          const testDurations = [...durations];
          const testTemps = [...temperatures];
          testDurations[index] = candidateTime;
          testTemps[index] = candidateTemp;
          const score = evaluate(testDurations, testTemps);
          if (score > localBestScore) {
            localBestScore = score;
            localBestTime = candidateTime;
            localBestTemp = candidateTemp;
          }
        }
      }
      if (localBestTime !== durations[index] && !fixedDuration[index]) {
        durations[index] = localBestTime;
        if (!optimizedDurationIndexes.includes(index)) optimizedDurationIndexes.push(index);
      }
      if (localBestTemp !== temperatures[index] && allowTemperatureOptimization && !fixedTemperature[index]) {
        temperatures[index] = localBestTemp;
        if (!optimizedTemperatureIndexes.includes(index)) optimizedTemperatureIndexes.push(index);
      }
      bestScore = evaluate(durations, temperatures);
    }
  }

  const goalLabels: Record<OptimizationGoal, string> = {
    balanced: 'сбалансированный профиль',
    umami_sweetness: 'умами и сладость',
    body_density: 'плотность и тело настоя',
    aroma_peak: 'яркая вкусовая кульминация (аромат отдельно не моделируется)',
    max_longevity: 'продолжительность качественных проливов',
    oil_tar: 'плотный, терпкий настой',
    white_debitter: 'снижение прогнозируемой горечи и терпкости',
  };

  return {
    durations,
    baselineDurations,
    temperaturesC: temperatures,
    objectiveScore: round(bestScore, 3),
    optimizedDurationIndexes,
    optimizedTemperatureIndexes,
    objectiveDescriptionRu: 'Подбор расписания под цель: ' + goalLabels[simulation.optimizationGoal ?? 'balanced']
      + '. Физические ограничения сохранены; сенсорная функция цели пока не калибрована на дегустационных данных.',
  };
}

export function simulatePhysicalBrewing(input: PhysicalBrewingInput): PhysicalBrewingResult {
  return runPhysicalSimulation(input);
}

export function resolveZeroInfusionOptions(args: {
  tea: TeaVariety;
  waterTempC: number;
  waterVolumeMl: number;
  optimizationGoal?: OptimizationGoal;
  customDurationSec?: number | null;
  customTemperatureC?: number | null;
  isCustomTime?: boolean;
  isCustomTemperature?: boolean;
}): ZeroInfusionOptions {
  const effectiveTemp = args.customTemperatureC ?? args.waterTempC;
  const rinse = getTeaRinseInfo(args.tea, effectiveTemp, args.optimizationGoal);
  const profile = args.tea.zeroInfusionProfile;
  const durationSec = args.customDurationSec ?? profile?.durationSec ?? rinse.seconds;
  const hasExplicitDuration = args.customDurationSec !== null && args.customDurationSec !== undefined;
  const policy = profile?.policy;
  const enabledByPolicy = hasExplicitDuration
    ? (args.customDurationSec ?? 0) > 0
    : policy === 'disabled'
      ? false
      : policy === 'enabled'
        ? true
        : profile?.enabled !== undefined
          ? profile.enabled
          : policy === 'recommended'
            ? true
            : policy === 'optional'
              ? true
              : rinse.required;
  return {
    enabled: enabledByPolicy && durationSec > 0,
    durationSec: clamp(durationSec, 0, 3600),
    temperatureC: clamp(args.customTemperatureC ?? profile?.temperatureC ?? rinse.tempC ?? args.waterTempC, 40, 100),
    waterVolumeMl: clamp(profile?.waterVolumeMl ?? args.waterVolumeMl, 10, 5000),
    disposition: profile?.disposition ?? 'discard',
    retainedVolumeMl: profile?.retainedVolumeMl,
    isCustomTime: args.isCustomTime ?? (args.customDurationSec !== null && args.customDurationSec !== undefined),
    isCustomTemperature: args.isCustomTemperature ?? (args.customTemperatureC !== null && args.customTemperatureC !== undefined),
  };
}

export function createZeroInfusionPreview(args: {
  tea: TeaVariety;
  leafMassGrams: number;
  waterVolumeMl: number;
  waterTempC: number;
  rinseSec: number;
  waterHardnessLevel?: WaterHardnessLevel;
  vesselMaterial?: VesselMaterialType;
  optimizationGoal?: OptimizationGoal;
  isCustomRinse?: boolean;
  vintageYear?: number | null;
  customRinseTempC?: number | null;
  brewingMethod?: BrewingMethod;
}): SteepKineticData {
  if (args.rinseSec <= 0) {
    return zeroRowWithoutExtraction(
      args.tea,
      args.customRinseTempC ?? args.waterTempC,
      args.brewingMethod ?? 'gongfu',
      Boolean(args.isCustomRinse),
      args.customRinseTempC !== null && args.customRinseTempC !== undefined,
    );
  }
  const zeroInfusion = resolveZeroInfusionOptions({
    tea: args.tea,
    waterTempC: args.waterTempC,
    waterVolumeMl: args.waterVolumeMl,
    optimizationGoal: args.optimizationGoal,
    customDurationSec: args.rinseSec,
    customTemperatureC: args.customRinseTempC,
    isCustomTime: args.isCustomRinse,
  });
  // The zero-preview and the full simulation use the same model and pool initialization.
  return runPhysicalSimulation({
    tea: args.tea,
    leafMassGrams: args.leafMassGrams,
    waterVolumeMl: args.waterVolumeMl,
    waterTempC: args.waterTempC,
    durations: [],
    requestedSteepsCount: 0,
    waterHardnessLevel: args.waterHardnessLevel,
    vesselMaterial: args.vesselMaterial,
    optimizationGoal: args.optimizationGoal,
    brewingMethod: args.brewingMethod ?? 'gongfu',
    zeroInfusion,
  }).zeroInfusionData ?? zeroRowWithoutExtraction(
    args.tea,
    zeroInfusion.temperatureC,
    args.brewingMethod ?? 'gongfu',
    Boolean(args.isCustomRinse),
    args.customRinseTempC !== null && args.customRinseTempC !== undefined,
  );
}
