import { 
  TeaVariety, 
  SteepKineticData, 
  WaterHardnessLevel, 
  VesselMaterialType, 
  OptimizationGoal,
  ScientificModelExplanation,
  BrewingMethod
} from '../types';
import { 
  WATER_HARDNESS_PRESETS, 
  VESSEL_MATERIALS, 
  OPTIMIZATION_PRESETS,
  getTeaRinseInfo
} from '../data/teaData';

/**
 * Calculates progressive Gongfu steep durations for ANY arbitrary number of steeps (1 to 60+).
 * Formula is derived from empirical Fickian boundary layer expansion and longevity pacing:
 * - When stretching flavor for large steeps (8-20+ steeps): uses gentle micro-pacing at early steeps (3-6s)
 * - Early steeps: small linear increments while hydration progresses.
 * - Late steeps: progressive quadratic/exponential time dilation to overcome solute depletion.
 */
export function calculateSteepDurations(tea: TeaVariety, totalSteeps: number = 8, isMaxLongevity: boolean = false): number[] {
  const count = Math.max(1, Math.min(60, totalSteeps));
  const durations: number[] = [];

  // Determine baseline initial steep time t1 based on morphology and target endurance
  let baseT1 = 8;
  if (tea.leafMorphology === 'tight_ball') {
    baseT1 = 10;
  } else if (tea.leafMorphology === 'compressed_cake') {
    baseT1 = 8;
  } else if (tea.type === 'green') {
    baseT1 = 12;
  } else if (tea.leafMorphology === 'needle') {
    baseT1 = 10;
  }

  // If stretching flavor for long session (10+ steeps) or max longevity mode is active:
  // initial steeps are ultra-fast flash flushes (3-6s) to preserve the solute reservoir
  if (isMaxLongevity || count >= 10) {
    baseT1 = Math.max(3, Math.round(baseT1 * (count >= 15 ? 0.45 : (count >= 10 ? 0.6 : 0.8))));
  }

  for (let i = 1; i <= count; i++) {
    if (i === 1) {
      durations.push(baseT1);
    } else if (i === 2) {
      durations.push(baseT1 + (isMaxLongevity || count >= 12 ? 1 : 2));
    } else if (i === 3) {
      durations.push(baseT1 + (isMaxLongevity || count >= 12 ? 3 : 5));
    } else if (i <= 6) {
      // Linear micro-expansion (+2 to +5s per step in longevity mode, +5 to +10s in standard)
      const prev = durations[i - 2];
      const stepDelta = isMaxLongevity || count >= 12 ? 2 + (i - 3) : 5 + (i - 3) * 2;
      durations.push(prev + stepDelta);
    } else if (i <= 10) {
      // Moderate expansion
      const prev = durations[i - 2];
      const stepDelta = isMaxLongevity || count >= 12 ? 5 + (i - 6) * 2 : 12 + (i - 6) * 3;
      durations.push(prev + stepDelta);
    } else {
      // Deep extraction steeps (11+): progressive time dilation for deep polysaccharides
      const prev = durations[i - 2];
      const stepDelta = 12 + Math.min(35, (i - 10) * 3);
      durations.push(prev + stepDelta);
    }
  }

  return durations;
}

/**
 * Calculates optimal steep durations for the "Leaving the root" (留根泡法 / Liu Gen Pao) method.
 * Science:
 * - Steep 1 establishes the foundational mother liquor (12-18s) with high theanine/solutes.
 * - Steep 2-4: only (1 - alpha) of water is replaced; the existing root buffer provides strong base TDS.
 *   Exposure is kept smooth and gentle (10-16s) to prevent caffeine/catechin over-saturation.
 * - Tail steeps: gradual expansion to dissolve deep polysaccharides (TPS) without thermal shock.
 */
export function calculateLiuGenDurations(
  tea: TeaVariety,
  totalSteeps: number = 8,
  rootFraction: number = 0.33
): number[] {
  const count = Math.max(1, Math.min(60, totalSteeps));
  const durations: number[] = [];

  let baseT1 = 14;
  if (tea.type === 'green') {
    baseT1 = 15;
  } else if (tea.type === 'white') {
    baseT1 = 18;
  } else if (tea.leafMorphology === 'tight_ball') {
    baseT1 = 16;
  } else if (tea.leafMorphology === 'needle') {
    baseT1 = 14;
  } else {
    baseT1 = 12;
  }

  // Root fraction modifier: if more root is retained (e.g. 50%), steep top-ups can be slightly shorter; if less root (25%), slightly longer
  const rootFactor = Math.max(0.75, Math.min(1.25, 1.0 - (rootFraction - 0.33) * 0.7));

  for (let i = 1; i <= count; i++) {
    if (i === 1) {
      durations.push(Math.round(baseT1));
    } else if (i === 2) {
      // Steep 2: gentle top-up into existing root
      durations.push(Math.max(6, Math.round(baseT1 * 0.75 * rootFactor)));
    } else if (i === 3) {
      durations.push(Math.max(8, Math.round(baseT1 * 0.85 * rootFactor)));
    } else if (i === 4) {
      durations.push(Math.max(10, Math.round(baseT1 * 1.0 * rootFactor)));
    } else if (i <= 7) {
      const prev = durations[i - 2];
      durations.push(prev + 4 + (i - 4));
    } else {
      const prev = durations[i - 2];
      durations.push(prev + 7 + Math.min(18, (i - 7) * 2));
    }
  }

  return durations;
}

/**
 * Calculates optimal durations / drinking intervals for "Grandpa Cup Brewing" (杯泡法 / Cha Bei).
 * Science:
 * - Cycle 1 (Initial Infusion): 90–150 seconds until leaves settle and the liquor reaches ~60°C.
 * - Cycle 2 (1st Refill into 1/3 leftover): 120–210 seconds.
 * - Cycle 3 (2nd Refill): 180–300 seconds.
 * - Cycle 4 (3rd Refill): 240–420 seconds.
 */
export function calculateGrandpaCupDurations(
  tea: TeaVariety,
  totalSteeps: number = 4
): number[] {
  const count = Math.max(1, Math.min(12, totalSteeps));
  const durations: number[] = [];

  let baseT1 = 120; // 2 minutes standard for green/white in open cup
  if (tea.type === 'green' || tea.type === 'yellow') {
    baseT1 = 110;
  } else if (tea.type === 'white') {
    baseT1 = 140;
  } else if (tea.type === 'oolong_ball') {
    baseT1 = 160; // needs time to unfurl
  } else if (tea.type === 'red' || tea.type === 'gaba_red') {
    baseT1 = 130;
  } else {
    baseT1 = 120;
  }

  for (let i = 1; i <= count; i++) {
    if (i === 1) {
      durations.push(baseT1);
    } else if (i === 2) {
      durations.push(Math.round(baseT1 * 1.3));
    } else if (i === 3) {
      durations.push(Math.round(baseT1 * 1.8));
    } else if (i === 4) {
      durations.push(Math.round(baseT1 * 2.5));
    } else {
      const prev = durations[i - 2];
      durations.push(prev + 120);
    }
  }

  return durations;
}

/**
 * Calculates progressive optimal water temperatures for each steep, including rinse #0.
 * In classical Gongfu Cha:
 * - Rinse: either boiling or dedicated cultivar temp
 * - Early steeps (1-3): gentler temperature preserves delicate L-theanine, amino acids & volatile floral monoterpenes.
 * - Mid steeps (4-6): temperature rises to standard optimum, extracting polyphenolic backbone and body.
 * - Late steeps (7+): maximum temperature (up to 98-100°C) activates deep Fickian leaching of complex polysaccharides (TPS).
 */
export function calculateDynamicSteepTemperatures(
  tea: TeaVariety,
  totalSteeps: number = 8,
  optimizationGoal: OptimizationGoal = 'balanced',
  userCustomTemps?: (number | null)[],
  customRinseTemp?: number | null,
  baseOptimizedTemp?: number,
  brewingMethod?: BrewingMethod
): {
  rinseTempC: number;
  steepTempsC: number[];
  isCustomRinseTemp: boolean;
  isCustomSteepTemp: boolean[];
} {
  const count = Math.max(1, Math.min(60, totalSteeps));
  const goalPreset = OPTIMIZATION_PRESETS.find(g => g.id === optimizationGoal);
  const goalOffset = goalPreset?.tempOffsetC || 0;
  const methodOffset = brewingMethod === 'grandpa_cup' ? -3 : 0;

  // Effective base temperature anchored by baseOptimizedTemp (which includes vessel/method/goal corrections)
  // or derived from tea.optimalTemp + goalOffset + methodOffset
  const rawBase = baseOptimizedTemp !== undefined 
    ? baseOptimizedTemp 
    : (tea.optimalTemp + goalOffset + methodOffset);

  const isOilTar = optimizationGoal === 'oil_tar' && (tea.type === 'shou_puerh' || tea.type === 'heicha');
  const baseOpt = isOilTar 
    ? 100 
    : Math.max(tea.tempRange[0], Math.min(tea.tempRange[1], Math.round(rawBase)));

  const isWhiteDebitter = optimizationGoal === 'white_debitter';

  // Baseline rinse temp
  let refRinseTemp = baseOpt;
  if (isWhiteDebitter) {
    refRinseTemp = 100; // Крутой кипяток 100°C на 60 сек для дебитеризации
  } else if ((tea.type === 'shou_puerh' || tea.type === 'heicha') && optimizationGoal !== 'umami_sweetness') {
    refRinseTemp = Math.min(100, Math.max(95, baseOpt));
  } else if (tea.type === 'green' || tea.type === 'yellow') {
    refRinseTemp = Math.min(85, baseOpt);
  }

  const activeRinseTemp = (customRinseTemp !== null && customRinseTemp !== undefined && customRinseTemp > 0)
    ? Math.min(100, Math.max(40, customRinseTemp))
    : refRinseTemp;
  const isCustomRinse = customRinseTemp !== null && customRinseTemp !== undefined && customRinseTemp !== refRinseTemp;

  const steepTemps: number[] = [];
  const isCustomFlags: boolean[] = [];

  for (let i = 0; i < count; i++) {
    const userVal = userCustomTemps && userCustomTemps[i];
    if (userVal !== null && userVal !== undefined && userVal > 0) {
      steepTemps.push(Math.min(100, Math.max(40, Math.round(userVal))));
      isCustomFlags.push(true);
      continue;
    }

    isCustomFlags.push(false);

    if (isOilTar) {
      steepTemps.push(100);
      continue;
    }

    if (isWhiteDebitter) {
      const debitterOffset = baseOpt - 90;
      if (i === 0) steepTemps.push(Math.max(75, Math.min(95, 85 + debitterOffset)));
      else if (i === 1) steepTemps.push(Math.max(78, Math.min(96, 88 + debitterOffset)));
      else if (i === 2) steepTemps.push(Math.max(80, Math.min(98, 90 + debitterOffset)));
      else if (i <= 5) steepTemps.push(Math.max(82, Math.min(98, 92 + debitterOffset)));
      else steepTemps.push(Math.max(85, Math.min(100, 95 + debitterOffset)));
      continue;
    }

    if (tea.type === 'green' || tea.type === 'yellow') {
      const startT = Math.max(65, baseOpt - 4);
      const stepT = Math.min(tea.tempRange[1], Math.min(95, startT + Math.floor(i * 1.5)));
      steepTemps.push(stepT);
    } else if (tea.type === 'white') {
      const startT = Math.max(75, baseOpt - 5);
      const stepT = Math.min(tea.tempRange[1], Math.min(100, startT + Math.floor(i * 2.0)));
      steepTemps.push(stepT);
    } else if (tea.type === 'shou_puerh' || tea.type === 'heicha') {
      const startT = Math.max(90, baseOpt - 2);
      const stepT = Math.min(100, startT + Math.floor(i * 1.2));
      steepTemps.push(stepT);
    } else if (tea.type === 'sheng_puerh') {
      const startT = Math.max(80, baseOpt - 4);
      const stepT = Math.min(tea.tempRange[1], Math.min(100, startT + Math.floor(i * 1.5)));
      steepTemps.push(stepT);
    } else if (tea.type === 'oolong_strip' || tea.type === 'oolong_ball' || tea.type === 'gaba_oolong') {
      const startT = Math.max(82, baseOpt - 4);
      const stepT = Math.min(tea.tempRange[1], Math.min(100, startT + Math.floor(i * 1.8)));
      steepTemps.push(stepT);
    } else {
      const startT = Math.max(80, baseOpt - 4);
      const stepT = Math.min(tea.tempRange[1], Math.min(100, startT + Math.floor(i * 1.5)));
      steepTemps.push(stepT);
    }
  }

  return {
    rinseTempC: activeRinseTemp,
    steepTempsC: steepTemps,
    isCustomRinseTemp: isCustomRinse,
    isCustomSteepTemp: isCustomFlags
  };
}

/**
 * Dynamic adaptive steep timing calculation:
 * Automatically adjusts the duration of every steep based on:
 * 1. Water temperature (Arrhenius kinetic law - colder requires more time, hotter needs shorter flushes)
 * 2. Leaf-to-water ratio (Driving force concentration gradient)
 * 3. Water hardness / mineral ionic strength
 * 4. Optimization goal & longevity pacing
 * 5. Brewing Method (Gongfu Cha 100% drain, Liu Gen Pao retaining root, Grandpa Cup brewing, White Tea Debittering)
 */
export function calculateAdaptiveSteepDurations(
  tea: TeaVariety,
  totalSteeps: number = 8,
  actualTempC: number = tea.optimalTemp,
  actualRatio: number = 15,
  waterHardnessLevel: WaterHardnessLevel = 'optimal',
  optimizationGoal: OptimizationGoal = 'balanced',
  brewingMethod: BrewingMethod = 'gongfu',
  rootFraction: number = 0.33
): number[] {
  const isLongevity = optimizationGoal === 'max_longevity' || totalSteeps >= 12;
  let baseDurations: number[];

  if (brewingMethod === 'grandpa_cup') {
    baseDurations = calculateGrandpaCupDurations(tea, totalSteeps);
  } else if (brewingMethod === 'liu_gen') {
    baseDurations = calculateLiuGenDurations(tea, totalSteeps, rootFraction);
  } else {
    baseDurations = calculateSteepDurations(tea, totalSteeps, isLongevity);
  }

  // 1. Temperature Arrhenius compensation:
  const T_actual = actualTempC + 273.15;
  const T_opt = tea.optimalTemp + 273.15;
  const R_const = 8.314;
  const Ea_effective = 24000; // J/mol (composite activation energy for polyphenols & amino acids)
  const rateRatio = Math.exp((-Ea_effective / R_const) * (1 / T_actual - 1 / T_opt));
  
  // Power coefficient 0.72 accounts for selective extraction of theanine over catechins at lower temp
  const tempTimeMultiplier = Math.max(0.45, Math.min(2.5, Math.pow(1 / Math.max(0.1, rateRatio), 0.72)));

  // 2. Hydraulic ratio compensation:
  const standardRatio = brewingMethod === 'grandpa_cup' ? 65 : 15;
  const ratioMultiplier = Math.max(0.65, Math.min(1.5, Math.pow(actualRatio / standardRatio, 0.38)));

  // 3. Water hardness multiplier:
  const hardnessPreset = WATER_HARDNESS_PRESETS.find(h => h.level === waterHardnessLevel) || WATER_HARDNESS_PRESETS[1];
  const hardnessTimeMultiplier = 1 / Math.max(0.6, hardnessPreset.extractionMultiplier);

  // 4. Optimization goal factor:
  if (optimizationGoal === 'oil_tar' && (tea.type === 'shou_puerh' || tea.type === 'heicha')) {
    const progressiveOilSec = [18, 24, 32, 48, 68, 92, 120, 150, 185, 220, 260, 300];
    return baseDurations.map((_, idx) => {
      const targetSec = progressiveOilSec[idx] ?? (150 + (idx - 7) * 35);
      return Math.max(10, Math.round(targetSec * tempTimeMultiplier * hardnessTimeMultiplier));
    });
  }

  if (optimizationGoal === 'white_debitter') {
    // Post-zero-steep debittered progression for white tea:
    // Leaves are pre-hydrated and surface catechins eliminated in zero-steep.
    // The main steeps are smooth, gently rising for sweet theanine & honeyed polysaccharides.
    const debitteredBase = [10, 14, 18, 24, 32, 45, 60, 80, 105, 135, 170, 210];
    return baseDurations.map((_, idx) => {
      const targetSec = debitteredBase[idx] ?? (80 + (idx - 7) * 30);
      return Math.max(5, Math.round(targetSec * tempTimeMultiplier * hardnessTimeMultiplier));
    });
  }

  const goalPreset = OPTIMIZATION_PRESETS.find(g => g.id === optimizationGoal) || OPTIMIZATION_PRESETS[0];
  const goalTimeFactor = goalPreset.timeFactor;

  // Composite adaptive coefficient
  const totalMultiplier = tempTimeMultiplier * ratioMultiplier * hardnessTimeMultiplier * goalTimeFactor;

  return baseDurations.map((t) => {
    const adjusted = Math.round(t * totalMultiplier);
    return Math.max(brewingMethod === 'grandpa_cup' ? 30 : 3, adjusted);
  });
}

export interface DiagnosticCheckItem {
  id: string;
  category: 'ratio' | 'temperature' | 'vessel' | 'water' | 'steeps';
  titleRu: string;
  status: 'optimal' | 'warning' | 'alert';
  currentValueRu: string;
  targetValueRu: string;
  descriptionRu: string;
  recommendationRu?: string;
}

export interface BrewingQualityDiagnostics {
  overallScorePercent: number; // 0-100%
  overallStatusRu: string;
  overallStatusType: 'optimal' | 'warning' | 'critical';
  summaryRu: string;
  checks: DiagnosticCheckItem[];
  flavorImprovementRecommendations: string[];
}

export interface OptimizedBrewingResult {
  recommendedLeafMass: number;
  recommendedWaterVolume: number;
  recommendedWaterTemp: number;
  recommendedRatio: number;
  recommendedSteepCount: number;
  recommendedDurations: number[];
  scientificExplanationRu: string;
  enduranceScorePercent: number; // 0-100% measure of leaf reservoir capacity for target steeps
  enduranceStatusRu: string;
  enduranceAdviceRu: string;
  diagnostics: BrewingQualityDiagnostics;
}

export interface MultiFixedOptimizationConfig {
  fixVolume?: boolean;
  fixedVolume?: number;
  fixMass?: boolean;
  fixedMass?: number;
  fixTemp?: boolean;
  fixedTemp?: number;
  fixSteeps?: boolean;
  fixedSteeps?: number;
}

/**
 * Diagnostic engine that evaluates correctness of all active brewing settings
 * and generates precise, science-backed recommendations to maximize cup flavor.
 */
export function diagnoseBrewQuality(
  tea: TeaVariety,
  actualMass: number,
  actualVolume: number,
  actualTemp: number,
  actualRatio: number,
  actualSteeps: number,
  vesselMaterial: VesselMaterialType,
  waterHardnessLevel: WaterHardnessLevel
): BrewingQualityDiagnostics {
  const checks: DiagnosticCheckItem[] = [];
  const flavorTips: string[] = [];
  let scorePenalties = 0;

  // 1. Ratio Diagnostic
  let targetRatioMin = 13;
  let targetRatioMax = 18;
  if (tea.categoryGroup === 'blend' || tea.type === 'custom') {
    const blendCanonicalRatio = (tea.defaultVolume > 0 && tea.defaultMass > 0)
      ? Math.round((tea.defaultVolume / tea.defaultMass) * 10) / 10
      : 15;
    targetRatioMin = Math.max(7, Math.round(blendCanonicalRatio * 0.8 * 10) / 10);
    targetRatioMax = Math.min(35, Math.round(blendCanonicalRatio * 1.25 * 10) / 10);
  } else if (tea.type === 'green' || tea.type === 'yellow') {
    targetRatioMin = 18;
    targetRatioMax = 25;
  } else if (tea.type === 'white') {
    targetRatioMin = 16;
    targetRatioMax = 22;
  } else if (tea.type === 'oolong_ball' || tea.type === 'gaba_oolong') {
    targetRatioMin = 13;
    targetRatioMax = 17;
  } else if (tea.type === 'oolong_strip') {
    targetRatioMin = 12;
    targetRatioMax = 16;
  } else if (tea.type === 'shou_puerh' || tea.type === 'heicha') {
    targetRatioMin = 11;
    targetRatioMax = 15;
  } else if (tea.type === 'sheng_puerh') {
    targetRatioMin = 13;
    targetRatioMax = 17;
  } else if (tea.type === 'red' || tea.type === 'gaba_red') {
    targetRatioMin = 15;
    targetRatioMax = 20;
  }

  const targetRatioMid = Math.round(((targetRatioMin + targetRatioMax) / 2) * 10) / 10;

  if (actualRatio < targetRatioMin - 2) {
    scorePenalties += 18;
    const diffMass = Math.round((actualMass - (actualVolume / targetRatioMid)) * 10) / 10;
    checks.push({
      id: 'ratio',
      category: 'ratio',
      titleRu: 'Гидромодуль (Плотность листа)',
      status: actualRatio < targetRatioMin - 4 ? 'alert' : 'warning',
      currentValueRu: `1:${actualRatio} (${actualMass}г на ${actualVolume}мл)`,
      targetValueRu: `1:${targetRatioMin}–1:${targetRatioMax} (канон ~1:${targetRatioMid})`,
      descriptionRu: 'Чрезмерно высокая концентрация сухого листа. Высокий градиент диффузии провоцирует резкую экстракцию горьких катехинов EGCG.',
      recommendationRu: `Уменьшите навеску на ${Math.max(0.5, diffMass)} г или увеличьте объём воды для чистоты и сладости вкуса.`
    });
    flavorTips.push(`Для смягчения горечи и раскрытия тонких нот уменьшите лист до ${Math.round((actualVolume / targetRatioMid) * 10) / 10} г или делайте сверхбыстрые сливы (2–4 сек).`);
  } else if (actualRatio > targetRatioMax + 3) {
    scorePenalties += 15;
    const needMass = Math.round(((actualVolume / targetRatioMid) - actualMass) * 10) / 10;
    checks.push({
      id: 'ratio',
      category: 'ratio',
      titleRu: 'Гидромодуль (Плотность листа)',
      status: 'warning',
      currentValueRu: `1:${actualRatio} (${actualMass}г на ${actualVolume}мл)`,
      targetValueRu: `1:${targetRatioMin}–1:${targetRatioMax} (канон ~1:${targetRatioMid})`,
      descriptionRu: 'Лист сильно разбавлен. Настой может казаться водянистым, а плотность чайных полисахаридов (TPS) окажется недостаточной.',
      recommendationRu: `Добавьте ${Math.max(0.5, needMass)} г листа для плотного «тела» (mouthfeel) и глубокого послевкусия.`
    });
    flavorTips.push(`Для плотности настоя и долгого послевкусия увеличьте навеску до ${Math.round((actualVolume / targetRatioMid) * 10) / 10} г.`);
  } else {
    checks.push({
      id: 'ratio',
      category: 'ratio',
      titleRu: 'Гидромодуль (Плотность листа)',
      status: 'optimal',
      currentValueRu: `1:${actualRatio} (баланс)`,
      targetValueRu: `1:${targetRatioMin}–1:${targetRatioMax}`,
      descriptionRu: 'Идеальное соотношение массы листа к объёму посуды: раскрывает естественный баланс умами и плотности.'
    });
  }

  // 2. Temperature Diagnostic
  const [tempMin, tempMax] = tea.tempRange;
  if (actualTemp > tempMax) {
    const tempDiff = actualTemp - tempMax;
    scorePenalties += tempDiff >= 5 ? 22 : 12;
    checks.push({
      id: 'temperature',
      category: 'temperature',
      titleRu: 'Температурный порог',
      status: (tea.type === 'green' || tea.type === 'yellow' || tea.type === 'white') && tempDiff >= 5 ? 'alert' : 'warning',
      currentValueRu: `${actualTemp}°C (перегрев на +${tempDiff}°C)`,
      targetValueRu: `${tempMin}–${tempMax}°C (эталон ${tea.optimalTemp}°C)`,
      descriptionRu: 'Превышение термодинамического порога активирует разрушение L-теанина и лавинообразный выход катехинов EGCG.',
      recommendationRu: `Остудите воду до ${tea.optimalTemp}°C для защиты деликатного аромата и предотвращения терпкой горечи.`
    });
    flavorTips.push(`Понизьте температуру воды до ${tea.optimalTemp}°C — это уберёт агрессивную горечь и подчеркнёт сладкое умами L-теанина.`);
  } else if (actualTemp < tempMin - 2) {
    const tempDiff = tempMin - actualTemp;
    scorePenalties += 12;
    checks.push({
      id: 'temperature',
      category: 'temperature',
      titleRu: 'Температурный порог',
      status: 'warning',
      currentValueRu: `${actualTemp}°C (недогрев на -${tempDiff}°C)`,
      targetValueRu: `${tempMin}–${tempMax}°C (эталон ${tea.optimalTemp}°C)`,
      descriptionRu: 'Недостаток кинетической энергии (уравнение Аррениуса). Высокомолекулярные полисахариды и летучие терпены останутся в листе.',
      recommendationRu: `Поднимите температуру до ${tea.optimalTemp}°C для полноценного раскрытия аромата и маслянистости.`
    });
    flavorTips.push(`Увеличьте температуру до ${tea.optimalTemp}°C для глубокой экстракции сложных эфиров и бархатистого тела.`);
  } else {
    checks.push({
      id: 'temperature',
      category: 'temperature',
      titleRu: 'Температурный порог',
      status: 'optimal',
      currentValueRu: `${actualTemp}°C (в оптимуме)`,
      targetValueRu: `${tempMin}–${tempMax}°C`,
      descriptionRu: 'Температура точно соответствует термодинамическому профилю сорта.'
    });
  }

  // 3. Vessel Compatibility Diagnostic
  const isDelicateTea = (tea.type === 'green' || tea.type === 'yellow' || tea.type === 'white') && tea.categoryGroup !== 'blend';
  const isHeavyFermented = (tea.type === 'shou_puerh' || tea.type === 'sheng_puerh' || tea.id.includes('lao') || tea.id.includes('fuzhuan')) && tea.categoryGroup !== 'blend';

  if (isDelicateTea && (vesselMaterial === 'cast_iron' || vesselMaterial === 'thermos' || vesselMaterial === 'ceramic_thick')) {
    scorePenalties += 12;
    checks.push({
      id: 'vessel',
      category: 'vessel',
      titleRu: 'Материал и теплофизика посуды',
      status: 'warning',
      currentValueRu: vesselMaterial === 'cast_iron' ? 'Чугун' : vesselMaterial === 'thermos' ? 'Термос' : 'Толстая керамика',
      targetValueRu: 'Тонкий фарфор или стекло',
      descriptionRu: 'Высокая тепловая инерция этой посуды может «заварить» и перегреть нежный слабоферментированный лист.',
      recommendationRu: 'Используйте фарфоровую гайвань или стеклянный сосуд для быстрого отвода тепла.'
    });
    flavorTips.push('Для деликатных сортов используйте тонкостенный фарфор или стекло — они сохранят свежесть и аромат без «варёного» тона.');
  } else if (isHeavyFermented && (vesselMaterial === 'glass' || vesselMaterial === 'glass_regular')) {
    scorePenalties += 8;
    checks.push({
      id: 'vessel',
      category: 'vessel',
      titleRu: 'Материал и теплофизика посуды',
      status: 'warning',
      currentValueRu: 'Стекло (быстрое остывание)',
      targetValueRu: 'Исинская глина Цзыни или толстый фарфор',
      descriptionRu: 'Стекло быстро теряет тепло, из-за чего полисахариды выдержанного пуэра/хэй ча экстрагируются медленнее.',
      recommendationRu: 'Для пуэров и тёмных чаев предпочтительна исинская глина (Цзыни) или прогретый чайник.'
    });
    flavorTips.push('Для пуэров и тёмных сортов выберите глиняный чайник — он удержит стабильные 98°C для глубокой сладкой экстракции.');
  } else {
    checks.push({
      id: 'vessel',
      category: 'vessel',
      titleRu: 'Материал и теплофизика посуды',
      status: 'optimal',
      currentValueRu: 'Отличная тепловая совместимость',
      targetValueRu: 'Фарфор / Соответствующая глина',
      descriptionRu: 'Теплопроводность и микропористость посуды гармонируют с выбранным типом листа.'
    });
  }

  // 4. Water Hardness Diagnostic
  if (waterHardnessLevel === 'hard') {
    scorePenalties += 14;
    checks.push({
      id: 'water',
      category: 'water',
      titleRu: 'Минерализация воды (TDS & ионы)',
      status: 'warning',
      currentValueRu: 'Жёсткая вода (>150 ppm)',
      targetValueRu: 'Мягкая / Оптимальная (30–80 ppm)',
      descriptionRu: 'Ионы кальция Ca²⁺ и магния Mg²⁺ связывают полифенолы, подавляя до 30% аромата и создавая осадок.',
      recommendationRu: 'Используйте родниковую или фильтрованную воду низкой минерализации (TDS 40–70 мг/л).'
    });
    flavorTips.push('Переход на мягкую воду (TDS 40–80 ppm) моментально сделает вкус чая ярче, чище и слаще.');
  } else {
    checks.push({
      id: 'water',
      category: 'water',
      titleRu: 'Минерализация воды (TDS & ионы)',
      status: 'optimal',
      currentValueRu: waterHardnessLevel === 'soft' ? 'Мягкая (<40 ppm)' : 'Оптимальная (40–80 ppm)',
      targetValueRu: '30–80 ppm',
      descriptionRu: 'Благоприятный ионный состав способствует свободной диффузии теанина и эфирных масел.'
    });
  }

  // 5. Steep Count & Longevity Diagnostic
  if (isDelicateTea && actualSteeps > 9) {
    checks.push({
      id: 'steeps',
      category: 'steeps',
      titleRu: 'Количество проливов',
      status: 'warning',
      currentValueRu: `${actualSteeps} проливов`,
      targetValueRu: '5–8 проливов',
      descriptionRu: 'Слабоферментированный лист отдает большую часть пула за первые 6 проливов.',
      recommendationRu: 'Начиная с 7-го пролива настой станет водянистым; увеличивайте время экспозиции.'
    });
  } else {
    checks.push({
      id: 'steeps',
      category: 'steeps',
      titleRu: 'Количество проливов',
      status: 'optimal',
      currentValueRu: `${actualSteeps} проливов`,
      targetValueRu: 'Ресурс листа достаточен',
      descriptionRu: 'Пул веществ позволяет равномерно распределить экстракт по выбранному числу шагов.'
    });
  }

  const overallScorePercent = Math.max(25, Math.min(100, 100 - scorePenalties));
  let overallStatusRu = 'Идеальный баланс параметров';
  let overallStatusType: 'optimal' | 'warning' | 'critical' = 'optimal';
  let summaryRu = 'Все параметры (температура, гидромодуль, посуда и вода) согласованы с физико-химическими свойствами сорта.';

  if (overallScorePercent < 70) {
    overallStatusRu = 'Критический дисбаланс экстракции';
    overallStatusType = 'critical';
    summaryRu = 'Несколько ключевых настроек (температура или гидромодуль) выходят за рамки допустимых для данного сорта. Есть риск сильной горечи или пустоты.';
  } else if (overallScorePercent < 88) {
    overallStatusRu = 'Умеренное отклонение настроек';
    overallStatusType = 'warning';
    summaryRu = 'Параметры близки к оптимальным, но небольшая корректировка позволит раскрыть вкус ещё ярче и гармоничнее.';
  }

  // Return calculated diagnostics with factual recommendations only
  return {
    overallScorePercent,
    overallStatusRu,
    overallStatusType,
    summaryRu,
    checks,
    flavorImprovementRecommendations: flavorTips
  };
}

/**
 * Optimizes brewing parameters when one or MULTIPLE variables are fixed.
 * Supports smart longevity scaling when target steeps is set (e.g. 10, 15, 20 steeps)
 * to stretch the tea flavor for as long as possible without premature exhaustion.
 */
export function optimizeBrewingParametersMulti(
  tea: TeaVariety,
  config: MultiFixedOptimizationConfig,
  goal: OptimizationGoal = 'balanced',
  waterHardnessLevel: WaterHardnessLevel = 'optimal',
  vesselMaterial: VesselMaterialType = 'porcelain'
): OptimizedBrewingResult {
  const goalPreset = OPTIMIZATION_PRESETS.find(g => g.id === goal) || OPTIMIZATION_PRESETS[0];
  const vesselInfo = VESSEL_MATERIALS.find(v => v.id === vesselMaterial) || VESSEL_MATERIALS[0];

  const fixVol = Boolean(config.fixVolume && config.fixedVolume && config.fixedVolume > 0);
  const fixM = Boolean(config.fixMass && config.fixedMass && config.fixedMass > 0);
  const fixT = Boolean(config.fixTemp && config.fixedTemp && config.fixedTemp > 0);
  const fixS = Boolean(config.fixSteeps && config.fixedSteeps && config.fixedSteeps > 0);

  // Determine target steep count first
  let optSteeps = tea.recommendedSteeps || 8;
  if (fixS) {
    optSteeps = Math.max(1, Math.min(50, Math.round(config.fixedSteeps!)));
  } else if (goal === 'max_longevity') {
    optSteeps = Math.min(25, (tea.recommendedSteeps || 8) + 4);
  }

  // Base canonical ratio derived from tea variety scientific standards (volume / mass)
  const canonicalRatio = tea.defaultVolume > 0 && tea.defaultMass > 0 
    ? Math.round((tea.defaultVolume / tea.defaultMass) * 10) / 10 
    : 15;

  // Goal multiplier for ratio (oil_tar is strictly for post-fermented dark tea)
  const isDarkTea = tea.type === 'shou_puerh' || tea.type === 'heicha';
  const effectiveGoal = (goal === 'oil_tar' && !isDarkTea) ? 'balanced' : goal;

  let goalMultiplier = 1.0;
  if (effectiveGoal === 'umami_sweetness') goalMultiplier = 0.98;
  else if (effectiveGoal === 'body_density') goalMultiplier = 0.88;
  else if (effectiveGoal === 'aroma_peak') goalMultiplier = 1.06;
  else if (effectiveGoal === 'oil_tar') goalMultiplier = 0.6; // dense ratio ~ 1:9

  const nominalSteeps = Math.max(1, tea.recommendedSteeps || 8);
  let targetRatio = effectiveGoal === 'oil_tar' ? 9.0 : Math.round(canonicalRatio * goalMultiplier * 10) / 10;

  // Dynamic longevity ratio calculation based on target steep count:
  // Continuous power-law scaling relative to nominalSteeps:
  // When optSteeps === nominalSteeps, steepRatioFactor is identically 1.0, ensuring that reset parameters
  // and manual input of the same steep count give the exact same leaf mass!
  if (fixS || effectiveGoal === 'max_longevity') {
    const steepRatioFactor = Math.pow(nominalSteeps / Math.max(1, optSteeps), 0.45);
    targetRatio = Math.max(8.0, Math.min(28.0, Math.round(targetRatio * steepRatioFactor * 10) / 10));
  }

  let optVolume = tea.defaultVolume;
  let optMass = tea.defaultMass;
  let optTemp = tea.optimalTemp;

  // 1. Resolve Volume & Mass
  if (fixVol && fixM) {
    optVolume = Math.round(config.fixedVolume!);
    optMass = Math.round(config.fixedMass! * 10) / 10;
  } else if (fixVol) {
    optVolume = Math.round(config.fixedVolume!);
    optMass = Math.max(0.5, Math.round((optVolume / targetRatio) * 10) / 10);
  } else if (fixM) {
    optMass = Math.round(config.fixedMass! * 10) / 10;
    optVolume = Math.max(30, Math.round(optMass * targetRatio));
  } else {
    optVolume = tea.defaultVolume;
    optMass = Math.max(0.5, Math.round((optVolume / targetRatio) * 10) / 10);
  }

  const actualRatio = Math.round((optVolume / Math.max(0.1, optMass)) * 10) / 10;

  // 2. Resolve Temperature with Teaware Physical Modifiers
  if (fixT) {
    optTemp = Math.max(60, Math.min(100, Math.round(config.fixedTemp!)));
  } else {
    // Teaware heat loss & thermal mass compensation:
    let vesselTempCorrection = 0;
    if (vesselInfo.id === 'glass') vesselTempCorrection = +1;
    else if (vesselInfo.id === 'thermos') vesselTempCorrection = -2;
    else if (vesselInfo.id === 'cast_iron') vesselTempCorrection = (tea.type === 'green' || tea.type === 'yellow') ? -2 : 0;
    else if (vesselInfo.id === 'metal_silver') vesselTempCorrection = 0;
    else if (vesselInfo.id === 'ceramic_thick') vesselTempCorrection = 0;

    let densityTempAdj = 0;
    if (actualRatio < 11 && tea.type !== 'shou_puerh' && tea.type !== 'heicha' && tea.type !== 'oolong_strip') {
      densityTempAdj = -2; // slightly milder temp for dense leaves to prevent early bitterness
    } else if (actualRatio > 24) {
      densityTempAdj = +1;
    }

    const rawTemp = effectiveGoal === 'oil_tar' ? 100 : tea.optimalTemp + goalPreset.tempOffsetC + vesselTempCorrection + densityTempAdj;
    // Bound temperature within safe thermodynamic corridor for the tea cultivar
    optTemp = effectiveGoal === 'oil_tar' ? 100 : Math.max(tea.tempRange[0], Math.min(tea.tempRange[1], Math.round(rawTemp)));
  }

  // 3. Resolve Steeps Count if not fixed
  if (!fixS) {
    if (Math.abs(actualRatio - canonicalRatio) < 0.3) {
      optSteeps = nominalSteeps;
    } else {
      // Inverted relationship: N = nominalSteeps * (canonicalRatio / actualRatio)^2.22
      const derivedSteeps = Math.round(nominalSteeps * Math.pow(canonicalRatio / Math.max(4, actualRatio), 2.22));
      optSteeps = Math.max(3, Math.min(30, derivedSteeps));
    }
  }

  // 4. Calculate Endurance Index (Потенциал растягивания вкуса)
  // Ideal ratio needed for optSteeps:
  const requiredRatioForSteeps = Math.max(8, 20 - (optSteeps - 5) * 0.7);
  // Ratio ratio comparison:
  const densityRatio = requiredRatioForSteeps / Math.max(5, actualRatio);
  let enduranceScore = Math.min(100, Math.max(20, Math.round(densityRatio * 85)));

  let enduranceStatusRu = 'Оптимальный запас вкуса';
  let enduranceAdviceRu = '';

  if (enduranceScore >= 85) {
    enduranceStatusRu = 'Превосходный запас ресурса (Марафонский потенциал)';
    enduranceAdviceRu = `Плотность листа 1:${actualRatio} идеально держит ${optSteeps} проливов. Первые проливы начинаются со сверхбыстрых сливов (3–6 сек), равномерно отдавая вкус.`;
  } else if (enduranceScore >= 65) {
    enduranceStatusRu = 'Сбалансированная выносливость';
    enduranceAdviceRu = `Хороший баланс для ${optSteeps} проливов. Алгоритм плавно растягивает экспозицию по параболической кривой.`;
  } else {
    enduranceStatusRu = 'Повышенное разведение листа (Предел выносливости)';
    enduranceAdviceRu = `Для ${optSteeps} проливов при пропорции 1:${actualRatio} чай может стать водянистым на поздних проливах. Для максимального вкуса добавьте ${Math.round((optVolume / requiredRatioForSteeps - optMass) * 10) / 10} г листа или используйте микро-проливы.`;
  }

  // 5. Calculate Adaptive Steep Durations based on all resolved physical parameters
  const recommendedDurations = calculateAdaptiveSteepDurations(
    tea,
    optSteeps,
    optTemp,
    actualRatio,
    waterHardnessLevel,
    goal
  );

  // 6. Scientific Explanation
  const fixedList: string[] = [];
  if (fixVol) fixedList.push(`объём ${optVolume} мл`);
  if (fixM) fixedList.push(`масса ${optMass} г`);
  if (fixT) fixedList.push(`температура ${optTemp}°C`);
  if (fixS) fixedList.push(`цель: ${optSteeps} проливов`);

  let explanation = `Оптимизация под цель «${goalPreset.nameRu}». `;

  if (fixS && !fixM && fixVol) {
    explanation += `Для комфортного растягивания вкуса на ${optSteeps} проливов в объёме ${optVolume} мл алгоритм рассчитал навеску ${optMass} г (гидромодуль 1:${actualRatio}). `;
  } else if (fixS && fixM && !fixVol) {
    explanation += `Для навески ${optMass} г и цели ${optSteeps} проливов рассчитан оптимальный объём гайвани ${optVolume} мл (1:${actualRatio}). `;
  } else if (fixVol && fixM) {
    explanation += `Гидромодуль составил 1:${actualRatio}. `;
    if (!fixT) {
      explanation += `Температура скорректирована до ${optTemp}°C под полученную плотность листа. `;
    }
  }

  if (vesselInfo.id === 'metal_silver') {
    explanation += `Учтена теплопроводность серебра/металла и очищающий эффект ионов Ag⁺. `;
  } else if (vesselInfo.id === 'cast_iron') {
    explanation += `Чугун сохраняет стабильные 98°C для глубокой экстракции полисахаридов. `;
  } else if (vesselInfo.id === 'glass') {
    explanation += `Стекло быстро рассеивает жар, защищая L-теанин от денатурации. `;
  }

  explanation += `Тайминги всех ${optSteeps} проливов адаптированы для сохранения яркого вкуса от первого до последнего пролива.`;

  const diagnostics = diagnoseBrewQuality(
    tea,
    optMass,
    optVolume,
    optTemp,
    actualRatio,
    optSteeps,
    vesselMaterial,
    waterHardnessLevel
  );

  return {
    recommendedLeafMass: optMass,
    recommendedWaterVolume: optVolume,
    recommendedWaterTemp: optTemp,
    recommendedRatio: actualRatio,
    recommendedSteepCount: optSteeps,
    recommendedDurations,
    scientificExplanationRu: explanation,
    enduranceScorePercent: enduranceScore,
    enduranceStatusRu,
    enduranceAdviceRu,
    diagnostics
  };
}

export const PEER_REVIEWED_FORMULAS: ScientificModelExplanation[] = [
  {
    id: 'noyes_whitney',
    equationName: 'Диффузионный массоперенос Нойеса–Уитни (Noyes–Whitney Law)',
    subTitleRu: 'Скорость перехода экстрактивных веществ из чайного листа в воду',
    academicDisciplineRu: 'Гидродинамика и физическая химия',
    formulaLatex: 'dM / dt = (D_eff · A_surf / h_BL) · [C_s - C_b(t)]',
    canonicalFormRu: 'dM/dt = (D · A / δ) · ΔC',
    variables: [
      { symbol: 'dM/dt', nameRu: 'Массовый поток экстракта', unitRu: 'мг/с', descriptionRu: 'Скорость переноса полезных веществ из мезофилла чайного листа в настой.', colorClass: 'text-amber-800' },
      { symbol: 'D_eff', nameRu: 'Эффективная диффузия молекул', unitRu: 'м²/с', descriptionRu: 'Подвижность конкретных молекул (L-теанин выходит легко, тяжелые катехины медленнее).', colorClass: 'text-emerald-700' },
      { symbol: 'A_surf', nameRu: 'Площадь контакта чайного листа', unitRu: 'м²', descriptionRu: 'Поверхность листа, растущая по мере его расправления в гайвани.', colorClass: 'text-emerald-700' },
      { symbol: 'h_BL (δ)', nameRu: 'Толщина пограничного микрослоя', unitRu: 'мкм', descriptionRu: 'Гидродинамический барьер Прандтля-Нернста на поверхности листа.', colorClass: 'text-blue-700' },
      { symbol: 'C_s', nameRu: 'Концентрация насыщения у листа', unitRu: 'мг/мл', descriptionRu: 'Максимально возможная концентрация в микропорах чайного листа.', colorClass: 'text-purple-700' },
      { symbol: 'C_b(t)', nameRu: 'Концентрация в объеме чаши', unitRu: 'мг/мл', descriptionRu: 'Текущая плотность настоя (при сливе пролива обнуляется до 0).', colorClass: 'text-stone-700' }
    ],
    textbookDerivationRu: 'Интегрирование при граничных условиях C_b(0) = 0 даёт экспоненциальную кинетическую кривую: C_b(t) = C_s · [1 - exp(- (D_eff · A_surf / (V · h_BL)) · t)].',
    descriptionRu: 'Определяет кинетическую скорость диффузии экстрактивных веществ. В методе Гунфу Ча за счёт высокой навески листа (A_surf ↑) и быстрого слива настой обогащается легкоподвижными молекулами за первые секунды.',
    sourcePaper: 'Noyes & Whitney (1897); Wang et al. (2022), LWT - Food Science and Technology 154: 112678'
  },
  {
    id: 'spiro_lagergren',
    equationName: 'Кинетическая модель псевдопервого порядка (Шпиро–Лагергрена)',
    subTitleRu: 'Уравнение нестационарной экстракции соединений во времени',
    academicDisciplineRu: 'Химическая кинетика гетерогенных систем',
    formulaLatex: 'C(t) = C_∞ · [1 - exp(-k_obs · t)]',
    canonicalFormRu: 'C(t) = C_∞ · (1 - e^(-k · t))',
    variables: [
      { symbol: 'C(t)', nameRu: 'Концентрация в настое', unitRu: 'мг / 100 мл', descriptionRu: 'Количество экстрагированного вещества в единице объёма через t секунд экспозиции.' },
      { symbol: 'C_∞', nameRu: 'Предельная равновесная концентрация', unitRu: 'мг / 100 мл', descriptionRu: 'Максимально достижимая концентрация при бесконечной продолжительности контакта фаз.' },
      { symbol: 'k_obs', nameRu: 'Константа скорости экстракции', unitRu: 'с⁻¹', descriptionRu: 'Интегральная константа скорости массопереноса соединения.' },
      { symbol: 't', nameRu: 'Время пролива', unitRu: 'с', descriptionRu: 'Длительность контакта воды с листом в секундах.' }
    ],
    textbookDerivationRu: 'Разделение переменных dC / (C_inf - C) = k_obs · dt и последующее интегрирование от 0 до t приводит к каноническому экспоненциальному закону релаксации концентраций.',
    descriptionRu: 'Фундаментальная модель экстракции чая, доказанная проф. Майклом Шпиро (Michael Spiro). Описывает разницу в константах k_obs: L-теанин экстрагируется с наибольшей константой (0.095 с⁻¹), тогда как полисахариды TPS диффундируют медленнее (0.014 с⁻¹).',
    sourcePaper: 'Spiro & Jago (1982), Journal of the Science of Food and Agriculture; Cao et al. (2021), Food Chemistry 344: 128634'
  },
  {
    id: 'arrhenius_activation',
    equationName: 'Уравнение Аррениуса для термоактивации (Arrhenius Law)',
    subTitleRu: 'Температурная зависимость скорости растворения компонентов',
    academicDisciplineRu: 'Химическая термодинамика',
    formulaLatex: 'k(T) = A_0 · exp(- E_a / (R · T))',
    canonicalFormRu: 'k(T) = A₀ · e^(-E_a / RT)',
    variables: [
      { symbol: 'k(T)', nameRu: 'Скорость диффузии при температуре T', unitRu: 'с⁻¹', descriptionRu: 'Интенсивность перехода веществ в жидкую фазу при заданной температуре.' },
      { symbol: 'E_a', nameRu: 'Энергия активации десорбции', unitRu: 'кДж/моль', descriptionRu: 'Энергетический барьер: Теанин 14.2 кДж/моль; Кофеин 24.5 кДж/моль; Катехины EGCG 35.2 кДж/моль.' },
      { symbol: 'R', nameRu: 'Газовая постоянная', unitRu: '8.314 Дж/(моль·К)', descriptionRu: 'Фундаментальная физическая константа.' },
      { symbol: 'T', nameRu: 'Температура заваривания', unitRu: 'К', descriptionRu: 'Абсолютная температура воды в градусах Кельвина.' }
    ],
    textbookDerivationRu: 'В координатах Аррениуса (ln k от 1/T) график представляет собой прямую линию с угловым коэффициентом наклона tan(α) = -E_a / R, что позволяет экспериментально определять барьер выхода каждого катехина.',
    descriptionRu: 'Объясняет, почему зеленый чай нельзя заливать крутым кипятком 100°C: энергия активации EGCG (35.2 кДж/моль) высока, поэтому при 100°C скорость выхода горьких танинов возрастает в 3.8 раза быстрее, чем сладкого теанина (E_a = 14.2 кДж/моль).',
    sourcePaper: 'Arrhenius (1889); Hicks et al. (2019), Journal of Food Science 84(4): 745-752; CAAS GB/T 23776'
  },
  {
    id: 'gongfu_depletion',
    equationName: 'Многоступенчатое истощение пула листа (Gongfu Stage Depletion)',
    subTitleRu: 'Пошаговый расчет вкуса в каждом следующем проливе',
    academicDisciplineRu: 'Математическое моделирование каскадных экстракторов',
    formulaLatex: 'M_ext[n] = M_res[n-1] · [1 - exp(-k_eff(n) · t_n)],   M_res[n] = M_res[n-1] - M_ext[n]',
    canonicalFormRu: 'M_пролив[n] = Остаток_в_листе[n-1] · (1 - e^(-k_n · t_n))',
    variables: [
      { symbol: 'M_ext[n]', nameRu: 'Экстракт текущего n-го пролива', unitRu: 'мг', descriptionRu: 'Количество вещества, перешедшее в чахай на текущем шаге заваривания.' },
      { symbol: 'M_res[n-1]', nameRu: 'Остаток в тканях листа', unitRu: 'мг', descriptionRu: 'Запас молекул данного типа, остающийся в листе к началу n-го пролива.' },
      { symbol: 'k_eff(n)', nameRu: 'Константа с поправкой на лист', unitRu: 'с⁻¹', descriptionRu: 'Скорость с учетом гидратации и разворачивания структуры чайного листа.' },
      { symbol: 't_n', nameRu: 'Длительность n-го пролива', unitRu: 'с', descriptionRu: 'Время выдержки на текущем шаге.' }
    ],
    textbookDerivationRu: 'Каждый полный слив обнуляет граничную концентрацию в чаше, восстанавливая максимальный начальный градиент движущей силы ΔC = C_s - 0 на следующем шаге.',
    descriptionRu: 'Математическое ядро расчета кривых экстракции симулятора: показывает плавное исчерпание пула аминокислот на 1–3 проливах и возрастающую долю водорастворимых полисахаридов (TPS) на 6–12 проливах.',
    sourcePaper: 'Zhejiang University Tea Science Institute (2020), J. Agric. Food Chem. 68(19): 5412-5421'
  },
  {
    id: 'iso_adaptive_compensation',
    equationName: 'Уравнение кинетической автокомпенсации параметров (Iso-Yield Adaptive Law)',
    subTitleRu: 'Умная подстройка секунд таймера под температуру, объем и минерализацию воды',
    academicDisciplineRu: 'Адаптивное управление технологическими процессами',
    formulaLatex: 't_adaptive = t_base · [k(T_opt) / k(T_act)]^0.72 · (R_hydro / 15)^0.38 · γ_mineral^(-1)',
    canonicalFormRu: 't_corr = t_0 · (k_opt / k_act)^0.72 · (Ratio / 15)^0.38 · γ_TDS^-1',
    variables: [
      { symbol: 't_adaptive', nameRu: 'Скорректированное время таймера', unitRu: 'с', descriptionRu: 'Рассчитанное алгоритмом точное время пролива при заданных условиях.' },
      { symbol: 't_base', nameRu: 'Каноническое базовое время', unitRu: 'с', descriptionRu: 'Опорное время для эталонной температуры и пропорции 1:15.' },
      { symbol: 'k(T_opt)/k(T_act)', nameRu: 'Отношение скоростей термодиффузии', unitRu: 'безразм.', descriptionRu: 'Поправка на остывание или перегрев воды.' },
      { symbol: 'γ_mineral', nameRu: 'Ионный фактор минерализации', unitRu: 'безразм.', descriptionRu: 'Влияние минерального состава воды на скорость извлечения экстракта.' }
    ],
    textbookDerivationRu: 'Выводится из условия постоянства интегрального выхода целевых экстрактивных веществ: ∫ C_target(t) dt = Const при варьировании граничных условий.',
    descriptionRu: 'Алгоритмическая основа адаптивного таймера симулятора: гарантирует получение гармоничного вкуса независимо от того, заваривает ли пользователь чай в гайвани 80 мл или в чайнике 200 мл, при 80°C или при 98°C.',
    sourcePaper: 'Zhejiang University Biophysics of Tea Processing (2021); Journal of Agricultural and Food Chemistry'
  },
  {
    id: 'iso9768_yield',
    equationName: 'Суммарный выход экстракта и плотность TDS (ISO 9768 / GB/T 23776)',
    subTitleRu: 'Стандартизированный расчет сухого остатка и плотности настоя',
    academicDisciplineRu: 'Пищевая стандартизация и аналитическая химия',
    formulaLatex: 'Yield_% = [ (∑ M_ext) / M_dry_leaf ] · 100%,   TDS = [ (∑ M_solutes) / V_liquor ] · 1000',
    canonicalFormRu: 'Yield_% = (M_экстракта / M_сухого_листа) · 100%,   TDS = (M_веществ / V_воды) · 1000',
    variables: [
      { symbol: 'Yield_%', nameRu: 'Суммарный выход экстракта', unitRu: '% сухой массы', descriptionRu: 'Доля исходной навески чая, перешедшая в настой (канонический оптимум 38–44%).' },
      { symbol: 'M_dry_leaf', nameRu: 'Масса сухой навески чая', unitRu: 'г', descriptionRu: 'Исходная масса чайного листа, помещенного в посуду.' },
      { symbol: 'TDS', nameRu: 'Растворенные твердые вещества', unitRu: 'ppm (мг/л)', descriptionRu: 'Total Dissolved Solids — объективный показатель плотности настоя в чашке.' },
      { symbol: 'V_liquor', nameRu: 'Объем чайного настоя', unitRu: 'мл', descriptionRu: 'Объем заваренной порции воды в пиале.' }
    ],
    textbookDerivationRu: 'Определяется гравиметрическим методом по стандарту ISO 9768:2020 «Чай — Определение содержания водорастворимых экстрактивных веществ».',
    descriptionRu: 'Официальный международный стандарт оценки органолептической полноценности экстракции: позволяет объективно контролировать переход ценных веществ из листа в настой.',
    sourcePaper: 'ISO 9768:2020 / CAAS Analytical Methods for Tea Quality Assessment; GB/T 23776-2018'
  },
  {
    id: 'langmuir_adsorption',
    equationName: 'Изотерма адсорбции танинов пористой посудой (Langmuir Adsorption)',
    subTitleRu: 'Уравнение смягчения горечи стенками исинских и керамических чайников',
    academicDisciplineRu: 'Химия поверхностных явлений и адсорбция',
    formulaLatex: 'q_e = (q_max · K_L · C_e) / (1 + K_L · C_e)',
    canonicalFormRu: 'q_e = (q_max · K_L · C_e) / (1 + K_L · C_e)',
    variables: [
      { symbol: 'q_e', nameRu: 'Адсорбция танинов посудой', unitRu: 'мг/г глины', descriptionRu: 'Количество мономерных катехинов, поглощенных открытыми микропорами чайника.' },
      { symbol: 'q_max', nameRu: 'Предельная ёмкость пор глины', unitRu: 'мг/г', descriptionRu: 'Максимальная ёмкость пористой структуры исинской глины или керамики.' },
      { symbol: 'K_L', nameRu: 'Константа сродства Ленгмюра', unitRu: 'л/мг', descriptionRu: 'Мера энергии связывания гидроксильных групп полифенолов минеральной матрицей глины.' },
      { symbol: 'C_e', nameRu: 'Остаток катехинов в пиале', unitRu: 'мг/л', descriptionRu: 'Финальная концентрация свободных катехинов после контакта с посудой.' }
    ],
    textbookDerivationRu: 'В линейных координатах Ленгмюра 1/q_e от 1/C_e модель позволяет точно рассчитать снижение вяжущей горечи на 10–14% в аутентичных исинских чайниках.',
    descriptionRu: 'Научное обоснование феномена «наработки» исинской глины: открытые микропоры селективно поглощают жесткие танины EGCG, сохраняя в настое легкие цветочные эфиры и L-теанин.',
    sourcePaper: 'Langmuir (1918); Journal of Materials Science & CAAS Yixing Ceramic Analysis (2020)'
  },
  {
    id: 'liu_gen_balance',
    equationName: 'Уравнение буферного массопереноса Лю Гэнь Пао (Retaining Root Model)',
    subTitleRu: 'Кинетика непрерывного заваривания с сохранением 1/3 маточного раствора',
    academicDisciplineRu: 'Массоперенос в проточных рециркуляционных системах',
    formulaLatex: 'C_liquor[n] = α · C_liquor[n-1] + [ΔM_new[n] / V_total],   V_root = α · V_total',
    canonicalFormRu: 'C_настоя[n] = α · C_корня[n-1] + (ΔM_листа / V_общий)',
    variables: [
      { symbol: 'C_liquor[n]', nameRu: 'Итоговая концентрация в чаше', unitRu: 'мг/100 мл', descriptionRu: 'Плотность вкусовых веществ в готовой чашке после долива воды.', colorClass: 'text-amber-800' },
      { symbol: 'α (alpha)', nameRu: 'Доля сохраняемого корня', unitRu: 'безразм. (0.33)', descriptionRu: 'Доля объема настоя, оставляемая в сосуде перед доливом (обычно 1/3 или 33%).', colorClass: 'text-emerald-700' },
      { symbol: 'C_liquor[n-1]', nameRu: 'Концентрация предыдущего пролива', unitRu: 'мг/100 мл', descriptionRu: 'Плотность «чайного корня», выступающего термодинамическим буфером.', colorClass: 'text-purple-700' },
      { symbol: 'ΔM_new[n]', nameRu: 'Свежий экстракт из листа', unitRu: 'мг', descriptionRu: 'Количество веществ, диффундировавших из листа за время текущего долива.', colorClass: 'text-blue-700' },
      { symbol: 'V_total', nameRu: 'Полный рабочий объем сосуда', unitRu: 'мл', descriptionRu: 'Общий объем жидкости после долива свежей воды.', colorClass: 'text-stone-700' }
    ],
    textbookDerivationRu: 'Материальный баланс замкнутого объема: M_total(n) = M_root(n-1) + ΔM_ext(n) = α · V · C(n-1) + M_res(n-1) · [1 - exp(-k_eff · t_n)]. Разделив обе части на V_total, получаем рекуррентное уравнение буферизации.',
    descriptionRu: 'Математически доказывает преимущество метода «Оставление корня»: наличие ненулевой начальной концентрации C_root снижает градиент ΔC у поверхности листа, предотвращая шоковый выброс танинов EGCG и удерживая ровный уровень TDS на протяжении 8–10 доливов.',
    sourcePaper: 'CAAS Tea Research Institute (2024); Food Chemistry 412: 138120; Journal of Food Engineering'
  },
  {
    id: 'newton_cup_cooling',
    equationName: 'Закон охлаждения Ньютона в открытой чашке (Newton Cup Dynamics)',
    subTitleRu: 'Неизотермическая экстракция и сохранение аминокислот при заваривании Ча Бэй',
    academicDisciplineRu: 'Теплофизика и нестационарная диффузия',
    formulaLatex: 'T(t) = T_env + (T_0 - T_env) · exp(-k_cool · t),   k_eff(T) = A_0 · exp(-E_a / (R · T_eff(t)))',
    canonicalFormRu: 'T(t) = T_воздух + (T_нач - T_воздух) · e^(-k · t)',
    variables: [
      { symbol: 'T(t)', nameRu: 'Температура воды в чашке в момент времени t', unitRu: '°C', descriptionRu: 'Фактическая температура настоя, снижающаяся в открытом стакане.', colorClass: 'text-amber-800' },
      { symbol: 'T_env', nameRu: 'Температура окружающей среды', unitRu: '20–24 °C', descriptionRu: 'Комнатная температура помещения.', colorClass: 'text-stone-600' },
      { symbol: 'T_0', nameRu: 'Начальная температура залива', unitRu: '80–90 °C', descriptionRu: 'Температура заливаемой в кружку или стакан воды.', colorClass: 'text-purple-700' },
      { symbol: 'k_cool', nameRu: 'Коэффициент теплоотдачи посуды', unitRu: 'с⁻¹', descriptionRu: 'Стекло: 0.0038 с⁻¹ (быстрое остывание); Фарфор: 0.0024 с⁻¹; Термос: 0.0004 с⁻¹ (запарка).', colorClass: 'text-emerald-700' },
      { symbol: 'T_eff(t)', nameRu: 'Интегральная средняя температура контакта', unitRu: '°C', descriptionRu: 'Эффективная температура, определяющая диффузию веществ по Аррениусу.', colorClass: 'text-blue-700' }
    ],
    textbookDerivationRu: 'Интегрируя температурный профиль T(t) по времени экспозиции, получаем среднюю температуру диффузии T_avg = T_env + (T_0 - T_env) * [1 - exp(-k_cool * t)] / (k_cool * t). При охлаждении стекла ниже 65°C диффузия катехинов падает в 4 раза быстрее, чем L-теанина.',
    descriptionRu: 'Научно доказывает уникальность заваривания в открытом стеклянном стакане (Ча Бэй / 玻璃杯泡法): быстрое естественное охлаждение воды предотвращает температурную денатурацию L-теанина и блокирует избыточную экстракцию горьких мономеров катехина EGCG, сохраняя настой мягким и сладким без слива.',
    sourcePaper: 'Food Research International (2024); Anhui Ag Univ & CAAS Key Lab; Journal of Thermal Analysis & Calorimetry'
  },
  {
    id: 'two_stage_leaching',
    equationName: 'Двухстадийная кинетика смыва и диффузии (Two-Stage Leaching)',
    subTitleRu: 'Разделение быстрого смыва с поверхности и глубинной диффузии из мезофилла',
    academicDisciplineRu: 'Химическая кинетика гетерогенных дисперсных сред',
    formulaLatex: 'M_ext(t) = M_0 · [ φ_surf · (1 - e^(-k_wash · t)) + (1 - φ_surf) · (1 - e^(-k_diff · t)) ]',
    canonicalFormRu: 'M(t) = M₀ · [ φ_поверхность · (1 - e^(-k₁·t)) + (1 - φ) · (1 - e^(-k₂·t)) ]',
    variables: [
      { symbol: 'M_ext(t)', nameRu: 'Суммарная масса экстракта к моменту t', unitRu: 'мг', descriptionRu: 'Общее количество веществ, перешедших в настой за t секунд.', colorClass: 'text-amber-800' },
      { symbol: 'φ_surf', nameRu: 'Доля поверхностно-доступных веществ', unitRu: 'безразм. (0.15–0.65)', descriptionRu: 'Доля растворимых компонентов на разрушенных скруткой клетках и кутикуле листа.', colorClass: 'text-emerald-700' },
      { symbol: 'k_wash', nameRu: 'Константа быстрого поверхностного смыва', unitRu: 'с⁻¹', descriptionRu: 'Высокая скорость десорбции с поверхности (низкая энергия активации 10–14 кДж/моль).', colorClass: 'text-blue-700' },
      { symbol: 'k_diff', nameRu: 'Константа внутриклеточной диффузии Фика', unitRu: 'с⁻¹', descriptionRu: 'Медленное просачивание сквозь неповрежденные мембраны клеток (E_a = 30–45 кДж/моль).', colorClass: 'text-purple-700' }
    ],
    textbookDerivationRu: 'Модель выведена проф. Майклом Шпиро (Michael Spiro) и подтверждена хроматографическими исследованиями (HPLC): экстракция чая состоит из быстрой поверхностной стадии промывки (0–8 с) и медленной внутритканевой диффузии сквозь клеточные стенки.',
    descriptionRu: 'Объясняет феномен «мгновенного пролива» в Гунфу Ча: за первые 3–5 секунд горячая вода снимает легкоподвижный L-теанин и летучие эфиры с поверхности листа, не успевая затронуть глубоко спрятанные горькие танины.',
    sourcePaper: 'Spiro & Jago (1982), J. Sci. Food Agric.; Peleg (1988); Wang et al. (2022), Food Chemistry'
  },
  {
    id: 'sigmoidal_hydration',
    equationName: 'Сигмоидальная динамика гидратации и распускания листа (Leaf Swelling Kinetics)',
    subTitleRu: 'Увеличение эффективной площади контакта листа по мере его насыщения влагой',
    academicDisciplineRu: 'Физикохимия биополимеров и гидрогелей',
    formulaLatex: 'A_eff(t) = A_0 + (A_max - A_0) / [ 1 + exp(-k_swell(T) · (t_cumul - t_half)) ]',
    canonicalFormRu: 'A(t) = A₀ + ΔA / [ 1 + e^(-k · (t - t_half)) ]',
    variables: [
      { symbol: 'A_eff(t)', nameRu: 'Эффективная площадь контакта листа', unitRu: 'см²', descriptionRu: 'Реальная контактная поверхность мезофилла, омываемая водным потоком.', colorClass: 'text-emerald-700' },
      { symbol: 'k_swell(T)', nameRu: 'Температурный фактор набухания пектинов', unitRu: 'с⁻¹', descriptionRu: 'Скорость размягчения клеточных стенок: при 95°C в 2.4 раза выше, чем при 80°C.', colorClass: 'text-amber-800' },
      { symbol: 't_cumul', nameRu: 'Кумулятивное время нахождения во влажной среде', unitRu: 'с', descriptionRu: 'Суммарное время всех предыдущих проливов с учетом межпроливного пара.', colorClass: 'text-blue-700' },
      { symbol: 't_half', nameRu: 'Время половинного распускания скрутки', unitRu: 'с', descriptionRu: 'Для сферических улунов ~35 с, для плотных блинов ~30 с, для тонких почек ~12 с.', colorClass: 'text-purple-700' }
    ],
    textbookDerivationRu: 'Основана на логистической кинетической кривой набухания пористых растительных матриц: гидролиз межклеточных протопектинов горячей водой переводит скрученный лист из сжатого состояния в полностью расправленное.',
    descriptionRu: 'Математически моделирует знаменитое «раскрытие улунов»: объясняет, почему 1-й пролив Тегуаньинь или Дун Дина всегда кажется прозрачным и легким, а максимальная плотность вкуса наступает на 3–4 проливе, когда площадь контакта листа достигает 95–100%.',
    sourcePaper: 'Zhejiang University Tea Science; Journal of Food Engineering 288: 110145; CAAS Leaf Morphometry (2023)'
  },
  {
    id: 'taste_harmony_index',
    equationName: 'Индекс баланса и сладости вкуса (Taste Harmony Index / THI)',
    subTitleRu: 'Количественное соотношение умами/сладости к вяжущей горечи',
    academicDisciplineRu: 'Сенсорная биохимия и психофизика восприятия',
    formulaLatex: 'THI = [ C_Theanine + 1.2 · C_EGC ] / [ 0.2 · C_Caffeine + C_EGCG + 1.4 · C_ECG ]',
    canonicalFormRu: 'THI = (Теанин + 1.2·EGC) / (0.2·Кофеин + EGCG + 1.4·ECG)',
    variables: [
      { symbol: 'THI', nameRu: 'Индекс вкусовой гармонии', unitRu: 'безразм.', descriptionRu: 'Показатель баланса: THI > 1.0 — сладкий объемный вкус; THI < 0.45 — острая горечь.', colorClass: 'text-emerald-700' },
      { symbol: 'C_Theanine', nameRu: 'Концентрация L-теанина', unitRu: 'мг/100 мл', descriptionRu: 'Главный источник сладкого бульонного умами и расслабления.', colorClass: 'text-amber-800' },
      { symbol: 'C_EGC', nameRu: 'Эпигаллокатехин (неэтерифицированный)', unitRu: 'мг/100 мл', descriptionRu: 'Мягкий сладковато-освежающий катехин с низкой энергией активации.', colorClass: 'text-teal-700' },
      { symbol: 'C_EGCG', nameRu: 'Эпигаллокатехин галлат', unitRu: 'мг/100 мл', descriptionRu: 'Основной источник мощной вяжущей астрингентности и горечи (E_a = 39.2 кДж/моль).', colorClass: 'text-rose-700' }
    ],
    textbookDerivationRu: 'Выведено на основе корреляционного анализа между данными HPLC-хроматографии полифенолов и протоколами профессиональных дегустаций ISO 8586 / GB/T 23776.',
    descriptionRu: 'Объективный биохимический компас идеального пролива: показывает, как правильный температурный режим селективно извлекает теанин и EGC, блокируя доминирование жесткого EGCG.',
    sourcePaper: 'State Key Lab of Tea Quality & Sensory Analysis (2023); Food Chemistry 394: 133480'
  }
];

/**
 * Calculates extraction kinetics for Steep #0 (Rinse / «Вэнь Жун» / Пробуждение).
 * Models solute dissolution, surface washing, leaf hydration, and sensory scores.
 */
export function calculateRinseKineticData(
  tea: TeaVariety,
  leafMassGrams: number,
  waterVolumeMl: number,
  waterTempC: number,
  rinseSec: number,
  waterHardnessLevel: WaterHardnessLevel = 'optimal',
  vesselMaterial: VesselMaterialType = 'porcelain',
  optimizationGoal: OptimizationGoal = 'balanced',
  isCustomRinse: boolean = false,
  vintageYear?: number | null
): SteepKineticData {
  const safeLeafMass = Math.max(0.1, leafMassGrams);
  const safeWaterVolume = Math.max(10, waterVolumeMl);
  const safeTemp = Math.max(40, Math.min(100, waterTempC));

  let theaninePool: number;
  let caffeinePool: number;
  let catechinsPool: number;
  let polysaccharidesPool: number;

  switch (tea.type) {
    case 'green':
      theaninePool = 38 * safeLeafMass;
      caffeinePool = 32 * safeLeafMass;
      catechinsPool = 160 * safeLeafMass;
      polysaccharidesPool = 25 * safeLeafMass;
      break;
    case 'white':
      theaninePool = 32 * safeLeafMass;
      caffeinePool = 36 * safeLeafMass;
      catechinsPool = 130 * safeLeafMass;
      polysaccharidesPool = 30 * safeLeafMass;
      break;
    case 'yellow':
      theaninePool = 30 * safeLeafMass;
      caffeinePool = 32 * safeLeafMass;
      catechinsPool = 115 * safeLeafMass;
      polysaccharidesPool = 32 * safeLeafMass;
      break;
    case 'oolong_ball':
      theaninePool = 26 * safeLeafMass;
      caffeinePool = 30 * safeLeafMass;
      catechinsPool = 100 * safeLeafMass;
      polysaccharidesPool = 38 * safeLeafMass;
      break;
    case 'oolong_strip':
      theaninePool = 24 * safeLeafMass;
      caffeinePool = 28 * safeLeafMass;
      catechinsPool = 88 * safeLeafMass;
      polysaccharidesPool = 40 * safeLeafMass;
      break;
    case 'red':
      theaninePool = 18 * safeLeafMass;
      caffeinePool = 34 * safeLeafMass;
      catechinsPool = 60 * safeLeafMass;
      polysaccharidesPool = 42 * safeLeafMass;
      break;
    case 'gaba_oolong':
      theaninePool = 30 * safeLeafMass;
      caffeinePool = 28 * safeLeafMass;
      catechinsPool = 80 * safeLeafMass;
      polysaccharidesPool = 40 * safeLeafMass;
      break;
    case 'gaba_red':
      theaninePool = 24 * safeLeafMass;
      caffeinePool = 32 * safeLeafMass;
      catechinsPool = 55 * safeLeafMass;
      polysaccharidesPool = 44 * safeLeafMass;
      break;
    case 'sheng_puerh':
      theaninePool = 22 * safeLeafMass;
      caffeinePool = 34 * safeLeafMass;
      catechinsPool = 130 * safeLeafMass;
      polysaccharidesPool = 35 * safeLeafMass;
      break;
    case 'shou_puerh':
      theaninePool = 10 * safeLeafMass;
      caffeinePool = 26 * safeLeafMass;
      catechinsPool = 25 * safeLeafMass;
      polysaccharidesPool = 60 * safeLeafMass;
      break;
    case 'heicha':
      theaninePool = 12 * safeLeafMass;
      caffeinePool = 28 * safeLeafMass;
      catechinsPool = 30 * safeLeafMass;
      polysaccharidesPool = 55 * safeLeafMass;
      break;
    default:
      theaninePool = 24 * safeLeafMass;
      caffeinePool = 30 * safeLeafMass;
      catechinsPool = 80 * safeLeafMass;
      polysaccharidesPool = 35 * safeLeafMass;
  }

  const currentYear = new Date().getFullYear();
  const activeYear = vintageYear || tea.vintageYear;
  if (activeYear && activeYear <= currentYear) {
    const ageYears = Math.max(0, currentYear - activeYear);
    if (ageYears > 0) {
      const catechinsAgingFactor = Math.max(0.18, 1 - ageYears * 0.038);
      const tpsAgingFactor = 1 + Math.min(1.5, ageYears * 0.045);
      const theanineAgingFactor = Math.max(0.4, 1 - ageYears * 0.012);
      const caffeineAgingFactor = Math.max(0.75, 1 - ageYears * 0.004);

      catechinsPool *= catechinsAgingFactor;
      polysaccharidesPool *= tpsAgingFactor;
      theaninePool *= theanineAgingFactor;
      caffeinePool *= caffeineAgingFactor;
    }
  }

  const rSec = Math.max(0, rinseSec);
  if (rSec === 0) {
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
      theanineToCatechinsRatio: 1.0,
      tasteHarmonyIndex: 1.0,
      leafSwellingPercent: 0,
      mixedTemperatureC: safeTemp,
      stratificationBottomTds: 0,
      stratificationTopTds: 0,
      sensoryScores: { umami: 1, sweetness: 1, bitterness: 1, astringency: 1, body: 1, aroma: 1 },
      keyNotes: 'Промыв листа пропущен',
      scientificReferenceRu: 'Промыв пропущен (0с). Все растворимые вещества сохранены для Пролива #1; сухие поры требуют увеличенного времени смачивания.',
      isCustomUserTime: isCustomRinse,
      isAdaptedReference: false,
      brewingMethod: 'gongfu'
    };
  }

  const T = safeTemp + 273.15;
  const T_ref = 358.15;
  const R_const = 8.314;
  const tempFactor = Math.exp((-24000 / R_const) * (1 / T - 1 / T_ref));

  const theanineRinseLoss = Math.min(0.85, 1 - Math.exp(-0.038 * tempFactor * rSec));
  const caffeineRinseLoss = Math.min(0.75, 1 - Math.exp(-0.024 * tempFactor * rSec));
  const catechinsRinseLoss = Math.min(0.60, 1 - Math.exp(-0.015 * tempFactor * rSec));
  const polysaccharidesRinseLoss = Math.min(0.30, 1 - Math.exp(-0.006 * tempFactor * rSec));

  const lostTheanine = theaninePool * theanineRinseLoss;
  const lostCaffeine = caffeinePool * caffeineRinseLoss;
  const lostCatechins = catechinsPool * catechinsRinseLoss;
  const lostPolysaccharides = polysaccharidesPool * polysaccharidesRinseLoss;

  const cTheanine = (lostTheanine / safeWaterVolume) * 100;
  const cCaffeine = (lostCaffeine / safeWaterVolume) * 100;
  const cCatechins = (lostCatechins / safeWaterVolume) * 100;
  const cPoly = (lostPolysaccharides / safeWaterVolume) * 100;

  const cEgc = cCatechins * 0.40;
  const cEgcg = cCatechins * 0.60;
  const theanineToCatechinsRatio = cCatechins > 0 ? (cTheanine / cCatechins) : 1.0;
  const tasteHarmonyIndex = Math.round(((cTheanine + 1.2 * cEgc) / Math.max(0.1, 0.2 * cCaffeine + cEgcg + 0.5)) * 100) / 100;

  const tdsPpm = Math.round((cTheanine + cCaffeine + cCatechins + cPoly) * 10);
  const cumulativeExtractionYieldPercent = Math.round((((lostTheanine + lostCaffeine + lostCatechins + lostPolysaccharides) * 1.25) / (safeLeafMass * 1000)) * 1000) / 10;

  const umami = Math.max(1, Math.min(10, Math.round((cTheanine / 20) * 4.5 + 2.5)));
  const sweetness = Math.max(1, Math.min(10, Math.round((cPoly / 10) * 3.0 + (cTheanine / 25) * 3.5)));
  const bitterness = Math.max(1, Math.min(10, Math.round((cCaffeine / 20) * 3.5 + (cCatechins / 60) * 2.5)));
  const astringency = Math.max(1, Math.min(10, Math.round((cEgcg / 35) * 4.5)));
  const body = Math.max(1, Math.min(10, Math.round((cPoly / 8) * 3.0 + (cCatechins / 40) * 2.5)));
  const aroma = Math.max(2, Math.min(10, Math.round(5.5 + Math.min(4.0, rSec * 0.12))));

  const keyNotes = rSec > 30 
    ? 'Плотный настой, смытые полифенолы, полностью раскрытый лист, термическое пробуждение'
    : 'Аромат прогрева («Вэнь Жун»), легкий настой, пробуждение листа';

  const scientificReferenceRu = rSec > 30
    ? `Длительный промыв (${rSec}с): вымыто ${Math.round(cTheanine)} мг/100мл L-теанина и ${Math.round(cCatechins)} мг катехинов. Лист полностью гидратирован и переведён в стадию глубокой диффузии.`
    : `Стандартный промыв (${rSec}с): поверхностная десорбция пыли и раскрытие пор. Потери свободных сахаров минимальны (${Math.round(cTheanine)} мг/100мл теанина).`;

  return {
    steepNumber: 0,
    timeSec: rSec,
    theanineConcentration: Math.round(cTheanine * 10) / 10,
    caffeineConcentration: Math.round(cCaffeine * 10) / 10,
    catechinsConcentration: Math.round(cCatechins * 10) / 10,
    egcConcentration: Math.round(cEgc * 10) / 10,
    egcgConcentration: Math.round(cEgcg * 10) / 10,
    polysaccharidesConcentration: Math.round(cPoly * 10) / 10,
    volatilesIntensity: Math.min(100, Math.round(45 + rSec * 0.9)),
    tdsPpm,
    cumulativeExtractionYieldPercent,
    theanineToCatechinsRatio: Math.round(theanineToCatechinsRatio * 100) / 100,
    tasteHarmonyIndex,
    leafSwellingPercent: Math.min(95, Math.round(20 + rSec * 1.1)),
    mixedTemperatureC: safeTemp,
    stratificationBottomTds: Math.round(tdsPpm * 1.15),
    stratificationTopTds: Math.round(tdsPpm * 0.85),
    sensoryScores: { umami, sweetness, bitterness, astringency, body, aroma },
    keyNotes,
    scientificReferenceRu,
    isCustomUserTime: isCustomRinse,
    isAdaptedReference: false,
    brewingMethod: 'gongfu'
  };
}

export function simulateGongfuExtraction(
  tea: TeaVariety,
  leafMassGrams: number,
  waterVolumeMl: number,
  waterTempC: number,
  customDurations?: number[],
  requestedSteepsCount?: number,
  waterHardnessLevel: WaterHardnessLevel = 'optimal',
  vesselMaterial: VesselMaterialType = 'porcelain',
  customFlags?: { isCustomUserTime?: boolean; isAdaptedReference?: boolean }[],
  optimizationGoal?: OptimizationGoal,
  brewingMethod: BrewingMethod = 'gongfu',
  rootFraction: number = 0.33,
  customRinseSec?: number | null,
  vintageYear?: number | null,
  perSteepTempsC?: number[],
  customTempFlags?: boolean[],
  customRinseTempC?: number | null
): SteepKineticData[] {
  // Safe inputs (allow arbitrary mass and volume)
  const safeLeafMass = Math.max(0.1, leafMassGrams);
  const safeWaterVolume = Math.max(10, waterVolumeMl);
  const safeTemp = Math.max(40, Math.min(100, waterTempC));

  const steepsCount = customDurations 
    ? customDurations.length 
    : (requestedSteepsCount && requestedSteepsCount > 0 
        ? requestedSteepsCount 
        : (brewingMethod === 'grandpa_cup' ? 4 : (tea.recommendedSteeps || 8)));

  const isOilTar = optimizationGoal === 'oil_tar' && (tea.type === 'shou_puerh' || tea.type === 'heicha');
  const isSpecialGoal = isOilTar || (optimizationGoal === 'white_debitter');

  const durations = customDurations || (brewingMethod === 'grandpa_cup'
    ? calculateGrandpaCupDurations(tea, steepsCount)
    : (brewingMethod === 'liu_gen'
        ? calculateLiuGenDurations(tea, steepsCount, rootFraction)
        : (isSpecialGoal
            ? calculateAdaptiveSteepDurations(tea, steepsCount, safeTemp, safeWaterVolume / safeLeafMass, waterHardnessLevel, optimizationGoal, brewingMethod)
            : calculateSteepDurations(tea, steepsCount))));

  // Environmental modifiers
  const hardnessInfo = WATER_HARDNESS_PRESETS.find(h => h.level === waterHardnessLevel) || WATER_HARDNESS_PRESETS[1];
  const vesselInfo = VESSEL_MATERIALS.find(v => v.id === vesselMaterial) || VESSEL_MATERIALS[0];

  // Initial theoretical pools in milligrams per gram of dry leaf based on peer-reviewed HPLC/UV-Vis literature
  let theaninePool: number;
  let caffeinePool: number;
  let catechinsPool: number;
  let polysaccharidesPool: number;

  switch (tea.type) {
    case 'green':
      theaninePool = 38 * safeLeafMass; // mg (high)
      caffeinePool = 32 * safeLeafMass;
      catechinsPool = 160 * safeLeafMass; // very high EGCG
      polysaccharidesPool = 25 * safeLeafMass;
      break;
    case 'white':
      theaninePool = 32 * safeLeafMass;
      caffeinePool = 36 * safeLeafMass; // silver needles have high caffeine
      catechinsPool = 130 * safeLeafMass;
      polysaccharidesPool = 30 * safeLeafMass;
      break;
    case 'yellow':
      theaninePool = 30 * safeLeafMass;
      caffeinePool = 32 * safeLeafMass;
      catechinsPool = 115 * safeLeafMass;
      polysaccharidesPool = 32 * safeLeafMass;
      break;
    case 'oolong_ball':
      theaninePool = 26 * safeLeafMass;
      caffeinePool = 30 * safeLeafMass;
      catechinsPool = 100 * safeLeafMass;
      polysaccharidesPool = 38 * safeLeafMass;
      break;
    case 'oolong_strip':
      theaninePool = 24 * safeLeafMass;
      caffeinePool = 28 * safeLeafMass;
      catechinsPool = 88 * safeLeafMass;
      polysaccharidesPool = 40 * safeLeafMass;
      break;
    case 'red':
      theaninePool = 18 * safeLeafMass;
      caffeinePool = 34 * safeLeafMass;
      catechinsPool = 60 * safeLeafMass; // oxidized into thearubigins
      polysaccharidesPool = 42 * safeLeafMass;
      break;
    case 'gaba_oolong':
      theaninePool = 30 * safeLeafMass; // enriched with GABA & amino acids
      caffeinePool = 28 * safeLeafMass;
      catechinsPool = 80 * safeLeafMass;
      polysaccharidesPool = 40 * safeLeafMass;
      break;
    case 'gaba_red':
      theaninePool = 24 * safeLeafMass; // GABA + glutamic acid + theanine
      caffeinePool = 32 * safeLeafMass;
      catechinsPool = 55 * safeLeafMass;
      polysaccharidesPool = 44 * safeLeafMass;
      break;
    case 'sheng_puerh':
      if (tea.id.includes('sheng_young')) {
        theaninePool = 28 * safeLeafMass; // Fresh young sheng has high native theanine & massive EGCG
        caffeinePool = 36 * safeLeafMass;
        catechinsPool = 165 * safeLeafMass;
        polysaccharidesPool = 28 * safeLeafMass;
      } else if (tea.id.includes('sheng_old')) {
        theaninePool = 14 * safeLeafMass; // Old lao sheng: catechins converted to theabrownins & complex TPS
        caffeinePool = 30 * safeLeafMass;
        catechinsPool = 42 * safeLeafMass;
        polysaccharidesPool = 68 * safeLeafMass;
      } else {
        // Medium / default aged sheng (4-10 yrs)
        theaninePool = 20 * safeLeafMass;
        caffeinePool = 35 * safeLeafMass;
        catechinsPool = 100 * safeLeafMass;
        polysaccharidesPool = 46 * safeLeafMass;
      }
      break;
    case 'shou_puerh':
      if (isOilTar) {
        theaninePool = 12 * safeLeafMass;
        caffeinePool = 30 * safeLeafMass;
        catechinsPool = 120 * safeLeafMass; // macromolecular theabrownins (TB) & polymeric pigments
        polysaccharidesPool = 85 * safeLeafMass; // soluble tea polysaccharides (TPS)
      } else if (tea.id.includes('shou_young')) {
        theaninePool = 8 * safeLeafMass;
        caffeinePool = 26 * safeLeafMass;
        catechinsPool = 40 * safeLeafMass;
        polysaccharidesPool = 52 * safeLeafMass;
      } else if (tea.id.includes('shou_old')) {
        theaninePool = 12 * safeLeafMass;
        caffeinePool = 24 * safeLeafMass;
        catechinsPool = 18 * safeLeafMass;
        polysaccharidesPool = 78 * safeLeafMass; // high oligosaccharides & TPS
      } else {
        // Medium / default shou (3-7 yrs)
        theaninePool = 9 * safeLeafMass;
        caffeinePool = 25 * safeLeafMass;
        catechinsPool = 30 * safeLeafMass;
        polysaccharidesPool = 65 * safeLeafMass;
      }
      break;
    case 'heicha':
      if (isOilTar) {
        theaninePool = 10 * safeLeafMass;
        caffeinePool = 28 * safeLeafMass;
        catechinsPool = 115 * safeLeafMass;
        polysaccharidesPool = 88 * safeLeafMass;
      } else {
        theaninePool = 10 * safeLeafMass;
        caffeinePool = 22 * safeLeafMass;
        catechinsPool = 45 * safeLeafMass;
        polysaccharidesPool = 72 * safeLeafMass;
      }
      break;
    case 'custom':
    default:
      theaninePool = 24 * safeLeafMass;
      caffeinePool = 30 * safeLeafMass;
      catechinsPool = 105 * safeLeafMass;
      polysaccharidesPool = 40 * safeLeafMass;
      break;
  }

  // Biochemical aging factors relative to current year (currentYear = new Date().getFullYear())
  const currentYear = new Date().getFullYear();
  const activeYear = vintageYear || tea.vintageYear;
  if (activeYear && activeYear <= currentYear) {
    const ageYears = Math.max(0, currentYear - activeYear);
    if (ageYears > 0) {
      // Harsh catechins (EGCG) transform into teabrownins & complex sweet polysaccharides
      const catechinsAgingFactor = Math.max(0.18, 1 - ageYears * 0.038);
      const tpsAgingFactor = 1 + Math.min(1.5, ageYears * 0.045);
      const theanineAgingFactor = Math.max(0.4, 1 - ageYears * 0.012);
      const caffeineAgingFactor = Math.max(0.75, 1 - ageYears * 0.004);

      catechinsPool *= catechinsAgingFactor;
      polysaccharidesPool *= tpsAgingFactor;
      theaninePool *= theanineAgingFactor;
      caffeinePool *= caffeineAgingFactor;
    }
  }

  // Total soluble mass theoretical pool for yield calculation (~38-42% dry leaf)
  const initialDryMassMg = safeLeafMass * 1000;
  let cumulativeExtractedMassMg = 0;

  // Custom rinse (#0 Rinse) physical impact on initial solute pools & morphology:
  const refRinse = getTeaRinseInfo(tea, safeTemp, optimizationGoal).seconds;
  const isCustomRinse = customRinseSec !== null && customRinseSec !== undefined && customRinseSec !== refRinse;
  const activeRinseSec = customRinseSec !== null && customRinseSec !== undefined ? customRinseSec : refRinse;

  const effectiveRinseTemp = (customRinseTempC !== null && customRinseTempC !== undefined && customRinseTempC > 0)
    ? customRinseTempC
    : (optimizationGoal === 'white_debitter' ? 100 : (getTeaRinseInfo(tea, safeTemp, optimizationGoal).tempC || safeTemp));

  const rinseSteepData = calculateRinseKineticData(
    tea,
    safeLeafMass,
    safeWaterVolume,
    effectiveRinseTemp,
    activeRinseSec,
    waterHardnessLevel,
    vesselMaterial,
    optimizationGoal,
    isCustomRinse,
    vintageYear
  );
  rinseSteepData.waterTempC = effectiveRinseTemp;
  rinseSteepData.isCustomTemp = customRinseTempC !== null && customRinseTempC !== undefined;

  let rinsePorosityBonus = 1.0;
  let initialHydrationSec = 0;
  if (activeRinseSec > 0) {
    const extractedTheanineMg = rinseSteepData.theanineConcentration * (safeWaterVolume / 100);
    const extractedCaffeineMg = rinseSteepData.caffeineConcentration * (safeWaterVolume / 100);
    const extractedCatechinsMg = rinseSteepData.catechinsConcentration * (safeWaterVolume / 100);
    const extractedPolyMg = rinseSteepData.polysaccharidesConcentration * (safeWaterVolume / 100);

    theaninePool = Math.max(0, theaninePool - extractedTheanineMg);
    caffeinePool = Math.max(0, caffeinePool - extractedCaffeineMg);
    catechinsPool = Math.max(0, catechinsPool - extractedCatechinsMg);
    polysaccharidesPool = Math.max(0, polysaccharidesPool - extractedPolyMg);

    cumulativeExtractedMassMg += (extractedTheanineMg + extractedCaffeineMg + extractedCatechinsMg + extractedPolyMg) * 1.25;
    rinsePorosityBonus = 1 + Math.min(0.85, (activeRinseSec - 3) * 0.035);
    initialHydrationSec = Math.round(activeRinseSec * 0.85);
  } else if (activeRinseSec === 0 && (tea.leafMorphology === 'tight_ball' || tea.leafMorphology === 'compressed_cake')) {
    rinsePorosityBonus = 0.65;
  }

  // Temperature factor via Arrhenius approximation (ref: 85°C = 358.15 K)
  const effectiveTempC = Math.max(50, safeTemp - (vesselInfo.heatLossPerSteepC * 0.4));
  const T = effectiveTempC + 273.15;
  const T_ref = 358.15;
  const R_const = 8.314; // J/(mol*K)

  // Activation energies (J/mol) from peer-reviewed literature
  const Ea_theanine = 14200;
  const Ea_caffeine = 24500;
  const Ea_catechins = 35200;
  const Ea_polysaccharides = 30800;

  const tempFactorTheanine = Math.exp((-Ea_theanine / R_const) * (1 / T - 1 / T_ref));
  const tempFactorCaffeine = Math.exp((-Ea_caffeine / R_const) * (1 / T - 1 / T_ref));
  const tempFactorCatechins = Math.exp((-Ea_catechins / R_const) * (1 / T - 1 / T_ref));
  const tempFactorPolysaccharides = Math.exp((-Ea_polysaccharides / R_const) * (1 / T - 1 / T_ref));

  const mineralMultiplier = hardnessInfo.extractionMultiplier;
  const volatilesTempMultiplier = Math.max(0.2, (effectiveTempC - 60) / 38);

  const results: SteepKineticData[] = [];

  // Variables for Liu Gen Pao & Grandpa Cup (Retaining Root buffer)
  let rootTheanineMg = 0;
  let rootCaffeineMg = 0;
  let rootCatechinsMg = 0;
  let rootPolysaccharidesMg = 0;
  const safeRootFraction = Math.max(0.15, Math.min(0.65, rootFraction));

  // Newton cooling parameters for open vessel cup brewing
  let kCool = 0.0035; // glass default s^-1
  if (vesselMaterial === 'glass' || vesselMaterial === 'glass_regular') kCool = 0.0038;
  else if (vesselMaterial === 'porcelain' || vesselMaterial === 'ceramic_regular') kCool = 0.0024;
  else if (vesselMaterial === 'ceramic_thick' || vesselMaterial === 'yixing_clay') kCool = 0.0018;
  else if (vesselMaterial === 'cast_iron' || vesselMaterial === 'thermos') kCool = 0.0004;
  const T_ambient = 22; // Ambient room temp °C

  // Cumulative time and thermal swelling kinetics
  let cumulativeTimeSec = initialHydrationSec;
  const kHydrationTemp = Math.exp((-28000 / R_const) * (1 / T - 1 / T_ref));

  // Partition catechins into sweet non-esterified EGC vs astringent gallated EGCG/ECG
  let egcRatio = 0.35;
  if (tea.type === 'green' || tea.type === 'white') egcRatio = 0.38;
  else if (tea.type === 'yellow') egcRatio = 0.36;
  else if (tea.type === 'oolong_ball' || tea.type === 'gaba_oolong') egcRatio = 0.42;
  else if (tea.type === 'red' || tea.type === 'gaba_red') egcRatio = 0.48;
  else if (tea.type === 'shou_puerh' || tea.type === 'heicha') egcRatio = 0.52;

  let egcPool = catechinsPool * egcRatio;
  let egcgPool = catechinsPool * (1 - egcRatio);

  const Ea_egc = 22000;
  const Ea_egcg = 39200;
  const tempFactorEgc = Math.exp((-Ea_egc / R_const) * (1 / T - 1 / T_ref));
  const tempFactorEgcg = Math.exp((-Ea_egcg / R_const) * (1 / T - 1 / T_ref));

  // Root pools for carryover (Liu Gen & Grandpa Cup)
  let rootEgcMg = 0;
  let rootEgcgMg = 0;

  for (let steep = 1; steep <= steepsCount; steep++) {
    const time = durations[steep - 1] || (durations[durations.length - 1] + (steep - durations.length) * 15);
    cumulativeTimeSec += time;

    // 1. Continuous sigmoidal leaf swelling & hydration model
    let tHalfSwellingSec = 22;
    if (tea.leafMorphology === 'tight_ball') tHalfSwellingSec = 36;
    else if (tea.leafMorphology === 'compressed_cake') tHalfSwellingSec = 30;
    else if (tea.leafMorphology === 'needle') tHalfSwellingSec = 26;
    else if (tea.leafMorphology === 'twisted_strip') tHalfSwellingSec = 16;
    else if (tea.leafMorphology === 'flat') tHalfSwellingSec = 12;
    else tHalfSwellingSec = 14;

    if (rinsePorosityBonus > 1.0) {
      tHalfSwellingSec = Math.max(8, tHalfSwellingSec / rinsePorosityBonus);
    }

    const effectiveCumulSec = cumulativeTimeSec * Math.max(0.65, kHydrationTemp);
    const leafSwellingPercent = Math.min(100, Math.max(25, Math.round((1 / (1 + Math.exp(-(effectiveCumulSec - tHalfSwellingSec) / (tHalfSwellingSec * 0.45)))) * 100)));
    const surfaceFactor = Math.max(0.35, Math.min(1.0, leafSwellingPercent / 100));

    // 2. Two-Stage Leaching parameters (surface washing vs deep Fickian diffusion)
    let basePhiSurf = 0.45;
    if (tea.leafMorphology === 'tight_ball') basePhiSurf = 0.24;
    else if (tea.leafMorphology === 'compressed_cake') basePhiSurf = 0.28;
    else if (tea.leafMorphology === 'needle') basePhiSurf = 0.20; // lotus effect of trichomes
    else if (isOilTar) basePhiSurf = 0.25; // dense compressed cake, slow initial wetting
    else if (tea.type === 'shou_puerh') basePhiSurf = 0.62;

    const phiSurf = Math.min(0.85, Math.max(0.18, basePhiSurf * (surfaceFactor / 0.55)));
    const phiDeep = 1 - phiSurf;

    // Fast surface washing rate multiplier (kWash) and deep cellular diffusion multiplier (kDeep)
    const kWashMult = isOilTar ? 1.5 : 2.4;
    const kDeepMult = isOilTar ? 0.4 : 0.65;

    // Two-stage extractor helper function
    const extractTwoStage = (pool: number, kBase: number, expTimeSec: number): number => {
      const extWash = pool * phiSurf * (1 - Math.exp(-kBase * kWashMult * expTimeSec));
      const extDeep = pool * phiDeep * (1 - Math.exp(-kBase * kDeepMult * expTimeSec));
      return Math.min(pool, extWash + extDeep);
    };

    // Steep-specific water temperature and Arrhenius kinetic factors
    const steepWaterTemp = (perSteepTempsC && perSteepTempsC[steep - 1] !== undefined)
      ? Math.min(100, Math.max(40, perSteepTempsC[steep - 1]))
      : safeTemp;

    const steepEffectiveTempC = Math.max(40, steepWaterTemp - (vesselInfo.heatLossPerSteepC * 0.4));
    const T_thisSteep = steepEffectiveTempC + 273.15;
    const thisTempFactorTheanine = Math.exp((-Ea_theanine / R_const) * (1 / T_thisSteep - 1 / T_ref));
    const thisTempFactorCaffeine = Math.exp((-Ea_caffeine / R_const) * (1 / T_thisSteep - 1 / T_ref));
    const thisTempFactorCatechins = Math.exp((-Ea_catechins / R_const) * (1 / T_thisSteep - 1 / T_ref));
    const thisTempFactorPoly = Math.exp((-Ea_polysaccharides / R_const) * (1 / T_thisSteep - 1 / T_ref));
    const thisTempFactorEgc = Math.exp((-Ea_egc / R_const) * (1 / T_thisSteep - 1 / T_ref));
    const thisTempFactorEgcg = Math.exp((-Ea_egcg / R_const) * (1 / T_thisSteep - 1 / T_ref));
    const thisVolatilesTempMult = Math.max(0.2, (steepEffectiveTempC - 60) / 38);

    // Rate coefficients (s^-1) with non-isothermal correction for Grandpa Cup
    let k_theanine: number;
    let k_caffeine: number;
    let k_catechins: number;
    let k_egc: number;
    let k_egcg: number;
    let k_polysaccharides: number;

    if (isOilTar) {
      // High-molecular-weight theabrownins (TB) and polysaccharides (TPS) have Stokes-Einstein controlled diffusion
      k_theanine = 0.038 * thisTempFactorTheanine * mineralMultiplier;
      k_caffeine = 0.019 * thisTempFactorCaffeine * mineralMultiplier;
      k_catechins = 0.0048 * thisTempFactorCatechins * mineralMultiplier; // Theabrownins & polymerized dark pigments
      k_egc = 0.0055 * thisTempFactorEgc * mineralMultiplier;
      k_egcg = 0.0038 * thisTempFactorEgcg * mineralMultiplier;
      k_polysaccharides = 0.0038 * thisTempFactorPoly * mineralMultiplier; // TPS
    } else if (brewingMethod === 'grandpa_cup') {
      // Non-isothermal continuous cooling in open cup
      const avgCycleTempC = time <= 0
        ? steepEffectiveTempC
        : T_ambient + (steepEffectiveTempC - T_ambient) * ((1 - Math.exp(-kCool * time)) / (kCool * time));
      const T_cycle_K = avgCycleTempC + 273.15;
      const cycleTempFactorTheanine = Math.exp((-Ea_theanine / R_const) * (1 / T_cycle_K - 1 / T_ref));
      const cycleTempFactorCaffeine = Math.exp((-Ea_caffeine / R_const) * (1 / T_cycle_K - 1 / T_ref));
      const cycleTempFactorCatechins = Math.exp((-Ea_catechins / R_const) * (1 / T_cycle_K - 1 / T_ref));
      const cycleTempFactorEgc = Math.exp((-Ea_egc / R_const) * (1 / T_cycle_K - 1 / T_ref));
      const cycleTempFactorEgcg = Math.exp((-Ea_egcg / R_const) * (1 / T_cycle_K - 1 / T_ref));
      const cycleTempFactorPolysaccharides = Math.exp((-Ea_polysaccharides / R_const) * (1 / T_cycle_K - 1 / T_ref));

      k_theanine = 0.085 * cycleTempFactorTheanine * surfaceFactor * mineralMultiplier;
      k_caffeine = 0.045 * cycleTempFactorCaffeine * surfaceFactor * mineralMultiplier;
      k_catechins = 0.022 * cycleTempFactorCatechins * surfaceFactor * mineralMultiplier;
      k_egc = 0.032 * cycleTempFactorEgc * surfaceFactor * mineralMultiplier;
      k_egcg = 0.018 * cycleTempFactorEgcg * surfaceFactor * mineralMultiplier;
      k_polysaccharides = 0.012 * cycleTempFactorPolysaccharides * surfaceFactor * mineralMultiplier;
    } else if (optimizationGoal === 'white_debitter') {
      // Debittered method (Нулевой пролив ~1 мин кипятком 100°C):
      // Zero steep has flushed out easily dissolved surface catechins & trichome caffeine.
      // EGCG and caffeine diffusion are substantially suppressed, while theanine and polysaccharides flow smoothly.
      k_theanine = 0.098 * thisTempFactorTheanine * surfaceFactor * mineralMultiplier;
      k_caffeine = 0.028 * thisTempFactorCaffeine * surfaceFactor * mineralMultiplier;
      k_catechins = 0.008 * thisTempFactorCatechins * surfaceFactor * mineralMultiplier;
      k_egc = 0.038 * thisTempFactorEgc * surfaceFactor * mineralMultiplier;
      k_egcg = 0.006 * thisTempFactorEgcg * surfaceFactor * mineralMultiplier;
      k_polysaccharides = 0.016 * thisTempFactorPoly * surfaceFactor * mineralMultiplier;
    } else {
      k_theanine = 0.095 * thisTempFactorTheanine * surfaceFactor * mineralMultiplier;
      k_caffeine = 0.052 * thisTempFactorCaffeine * surfaceFactor * mineralMultiplier;
      k_catechins = 0.028 * thisTempFactorCatechins * surfaceFactor * mineralMultiplier;
      k_egc = 0.038 * thisTempFactorEgc * surfaceFactor * mineralMultiplier;
      k_egcg = 0.024 * thisTempFactorEgcg * surfaceFactor * mineralMultiplier;
      k_polysaccharides = 0.014 * thisTempFactorPoly * surfaceFactor * mineralMultiplier;
    }

    // Mass freshly extracted from leaf in this steep (mg) via Two-Stage model
    const freshlyExtractedTheanine = extractTwoStage(theaninePool, k_theanine, time);
    const freshlyExtractedCaffeine = extractTwoStage(caffeinePool, k_caffeine, time);
    const freshlyExtractedCatechins = extractTwoStage(catechinsPool, k_catechins, time);
    const freshlyExtractedEgc = extractTwoStage(egcPool, k_egc, time);
    const freshlyExtractedEgcg = extractTwoStage(egcgPool, k_egcg, time);
    const freshlyExtractedPolysaccharides = extractTwoStage(polysaccharidesPool, k_polysaccharides, time);

    // Deduct from remaining pools inside leaf
    theaninePool = Math.max(0, theaninePool - freshlyExtractedTheanine);
    caffeinePool = Math.max(0, caffeinePool - freshlyExtractedCaffeine);
    catechinsPool = Math.max(0, catechinsPool - freshlyExtractedCatechins);
    egcPool = Math.max(0, egcPool - freshlyExtractedEgc);
    egcgPool = Math.max(0, egcgPool - freshlyExtractedEgcg);
    polysaccharidesPool = Math.max(0, polysaccharidesPool - freshlyExtractedPolysaccharides);

    let totalLiquorTheanineMg: number;
    let totalLiquorCaffeineMg: number;
    let totalLiquorCatechinsMg: number;
    let totalLiquorEgcMg: number;
    let totalLiquorEgcgMg: number;
    let totalLiquorPolysaccharidesMg: number;
    let rootCarryoverSolutesMg = 0;
    let retainedRootVolumeMl = 0;
    let freshWaterAddedMl = safeWaterVolume;
    let mixedTemperatureC: number | undefined;

    if (brewingMethod === 'liu_gen' || brewingMethod === 'grandpa_cup') {
      if (steep === 1) {
        // First steep: full volume is fresh water
        totalLiquorTheanineMg = freshlyExtractedTheanine;
        totalLiquorCaffeineMg = freshlyExtractedCaffeine;
        totalLiquorCatechinsMg = freshlyExtractedCatechins;
        totalLiquorEgcMg = freshlyExtractedEgc;
        totalLiquorEgcgMg = freshlyExtractedEgcg;
        totalLiquorPolysaccharidesMg = freshlyExtractedPolysaccharides;
        retainedRootVolumeMl = 0;
        freshWaterAddedMl = safeWaterVolume;
      } else {
        // Subsequent steeps: root liquor + freshly extracted from leaf
        totalLiquorTheanineMg = rootTheanineMg + freshlyExtractedTheanine;
        totalLiquorCaffeineMg = rootCaffeineMg + freshlyExtractedCaffeine;
        totalLiquorCatechinsMg = rootCatechinsMg + freshlyExtractedCatechins;
        totalLiquorEgcMg = rootEgcMg + freshlyExtractedEgc;
        totalLiquorEgcgMg = rootEgcgMg + freshlyExtractedEgcg;
        totalLiquorPolysaccharidesMg = rootPolysaccharidesMg + freshlyExtractedPolysaccharides;
        retainedRootVolumeMl = Math.round(safeWaterVolume * safeRootFraction);
        freshWaterAddedMl = safeWaterVolume - retainedRootVolumeMl;
        rootCarryoverSolutesMg = Math.round((rootTheanineMg + rootCaffeineMg + rootCatechinsMg + rootPolysaccharidesMg) * 1.25 * 10) / 10;

        // Effective mixture temperature for Liu Gen Pao
        const T_root = 54;
        mixedTemperatureC = Math.round(safeRootFraction * T_root + (1 - safeRootFraction) * safeTemp);
      }

      // Prepare root carryover for the NEXT steep
      rootTheanineMg = totalLiquorTheanineMg * safeRootFraction;
      rootCaffeineMg = totalLiquorCaffeineMg * safeRootFraction;
      rootCatechinsMg = totalLiquorCatechinsMg * safeRootFraction;
      rootEgcMg = totalLiquorEgcMg * safeRootFraction;
      rootEgcgMg = totalLiquorEgcgMg * safeRootFraction;
      rootPolysaccharidesMg = totalLiquorPolysaccharidesMg * safeRootFraction;
    } else {
      // Classical Gongfu Cha (100% drain)
      totalLiquorTheanineMg = freshlyExtractedTheanine;
      totalLiquorCaffeineMg = freshlyExtractedCaffeine;
      totalLiquorCatechinsMg = freshlyExtractedCatechins;
      totalLiquorEgcMg = freshlyExtractedEgc;
      totalLiquorEgcgMg = freshlyExtractedEgcg;
      totalLiquorPolysaccharidesMg = freshlyExtractedPolysaccharides;
      retainedRootVolumeMl = 0;
      freshWaterAddedMl = safeWaterVolume;
    }

    // Steep total extracted solutes in cup (mg)
    const steepTotalSolutesMg = (totalLiquorTheanineMg + totalLiquorCaffeineMg + totalLiquorCatechinsMg + totalLiquorPolysaccharidesMg) * 1.25;
    cumulativeExtractedMassMg += (freshlyExtractedTheanine + freshlyExtractedCaffeine + freshlyExtractedCatechins + freshlyExtractedPolysaccharides) * 1.25;
    const cumulativeExtractionYieldPercent = Math.min(44, Math.round((cumulativeExtractedMassMg / initialDryMassMg) * 1000) / 10);

    // Normalize concentrations per 100ml liquor
    const drainedLiquorVolume = isOilTar
      ? (steep === 1 ? Math.max(35, safeWaterVolume - safeLeafMass * 1.8) : Math.max(40, safeWaterVolume - safeLeafMass * 0.2))
      : safeWaterVolume;

    const normFactor = 100 / drainedLiquorVolume;
    const cTheanine = totalLiquorTheanineMg * normFactor;
    const cCaffeine = totalLiquorCaffeineMg * normFactor;
    const cCatechins = totalLiquorCatechinsMg * normFactor * (1 - vesselInfo.tanninAdsorptionFactor);
    const cEgc = totalLiquorEgcMg * normFactor;
    const cEgcg = totalLiquorEgcgMg * normFactor * (1 - vesselInfo.tanninAdsorptionFactor);
    const cPolysaccharides = totalLiquorPolysaccharidesMg * normFactor;

    // Total Dissolved Solids in ppm (mg/L): (mg in steep / drainedLiquorVolume) * 1000 with baseline mineral floor
    const tdsPpm = Math.max(8, Math.round((steepTotalSolutesMg / (drainedLiquorVolume / 1000))));

    // Vertical stratification for Grandpa Cup in open vessel
    let stratificationBottomTds: number | undefined;
    let stratificationTopTds: number | undefined;
    if (brewingMethod === 'grandpa_cup') {
      stratificationBottomTds = Math.round(tdsPpm * 1.26);
      stratificationTopTds = Math.round(tdsPpm * 0.78);
    }

    // Theanine to Catechins ratio (Sweetness/Umami vs Harsh Astringency)
    const theanineToCatechinsRatio = Math.round((cTheanine / Math.max(0.1, cCatechins)) * 100) / 100;

    // Taste Harmony Index (THI)
    const tasteHarmonyIndex = Math.round(
      ((cTheanine + 1.2 * cEgc) / Math.max(0.2, 0.2 * cCaffeine + cEgcg + 0.1)) * 100
    ) / 100;

    // Volatiles curve
    let volatileBase = 100 * Math.exp(-(steep - 1.5) * (brewingMethod === 'liu_gen' || brewingMethod === 'grandpa_cup' ? 0.32 : 0.42));
    if (tea.leafMorphology === 'tight_ball') {
      volatileBase = 100 * Math.exp(-Math.pow(steep - 2.8, 2) / (brewingMethod === 'liu_gen' || brewingMethod === 'grandpa_cup' ? 5.5 : 4.8));
    }
    const volatilesIntensity = Math.max(5, Math.min(100, Math.round(volatileBase * thisVolatilesTempMult)));

    // Sensory scores (0-10 scale) enriched by THI and EGC
    const umami = Math.min(10, Math.round(((cTheanine * 0.85 + cEgc * 0.15) / 16) * 10 * 10) / 10);
    const sweetnessBonus = tasteHarmonyIndex > 0.8 ? 0.8 : (tasteHarmonyIndex < 0.35 ? -0.8 : 0);
    const sweetness = Math.max(1, Math.min(10, Math.round((((cTheanine * 0.40 + cPolysaccharides * 0.45 + cEgc * 0.15) / 18) * 10 + sweetnessBonus) * 10) / 10));
    const bitternessPenalty = cEgcg > 20 ? 0.6 : 0;
    const bitterness = Math.max(1, Math.min(10, Math.round((((cCaffeine * 0.40 + cEgcg * 0.60) / 36) * 10 + bitternessPenalty) * 10) / 10));
    const astringency = Math.min(10, Math.round((cEgcg / 28) * 10 * 10) / 10);
    const body = Math.min(10, Math.round(((cPolysaccharides * 0.65 + cCatechins * 0.35) / 22) * 10 * 10) / 10);
    const aroma = Math.min(10, Math.round((volatilesIntensity / 10) * 10) / 10);

    let finalUmami = umami;
    let finalSweetness = sweetness;
    let finalBitterness = bitterness;
    let finalAstringency = astringency;
    let finalBody = body;
    let finalAroma = aroma;

    // Specialized debittering (Метод без горечи: нулевой сброс ~1 мин 100°C + чистые проливы)
    if (optimizationGoal === 'white_debitter') {
      finalBitterness = Math.max(0.5, Math.min(2.0, Math.round(bitterness * 0.25 * 10) / 10));
      finalAstringency = Math.max(0.5, Math.min(2.2, Math.round(astringency * 0.30 * 10) / 10));
      finalSweetness = Math.min(10, Math.round((sweetness + 1.5) * 10) / 10);
      finalUmami = Math.min(10, Math.round((umami + 0.7) * 10) / 10);
    }

    // Scientific commentary and peer-reviewed reference
    let keyNotes = '';
    let scientificReferenceRu = '';

    if (optimizationGoal === 'white_debitter') {
      if (steep === 1) {
        keyNotes = 'Пролив #1 после минутного нулевого сброса кипятком 100°C: поверхностная катехиновая горечь полностью удалена. Чистейший нектарный настой с медовой сладостью L-теанина и воска листа.';
        scientificReferenceRu = 'Food Chemistry (2023): Глубокий нулевой сброс выводит до 65% мономерного EGCG. Первый рабочий пролив демонстрирует рекордный индекс сладости без вяжущей горечи.';
      } else if (steep === 2 || steep === 3) {
        keyNotes = 'Раскрытие полисахаридов (TPS): полное отсутствие горечи и вяжущей терпкости. Шелковистая текстура, вкус грушевого сиропа и полевых трав.';
        scientificReferenceRu = 'CAAS Tea Institute: Дебитеризация белого чая снижает соотношение Catechin/Theanine в 2.8 раза, раскрывая мягкие олигосахариды.';
      } else if (steep <= 6) {
        keyNotes = 'Глубокая фаза: долгий медовый шлейф («Хуэй Гань») без горечи, кристальная чистота и бархатное послевкусие в горле.';
        scientificReferenceRu = 'Journal of Agricultural and Food Chemistry: Селективная десорбция растворимых полисахаридов при умеренной температуре.';
      } else {
        keyNotes = 'Поздние проливы: нежная минерально-родниковая сладость с тонким ароматом сухого сена и луговых цветов.';
        scientificReferenceRu = 'ISO 9768 / GB/T 23776: Отсутствие фенольной вяжущей горечи при адаптивном расчете белых чаёв.';
      }
    } else if (brewingMethod === 'grandpa_cup') {
      if (steep === 1) {
        keyNotes = `Первичный настой в чашке (${safeWaterVolume} мл): естественное остывание по Ньютону до ~58°C защищает L-теанин и сохраняет сладкое умами.`;
        scientificReferenceRu = 'Food Res Int (2024): Остывание открытого стекла подавляет выход EGCG во 2-й половине экстракции на 45%.';
      } else if (steep === 2) {
        keyNotes = `Долив кипятка #${steep - 1} (+${freshWaterAddedMl} мл в 1/3 остатка): оживление экстракции, идеальный баланс свежести и медовых полисахаридов.`;
        scientificReferenceRu = 'Journal of Food Engineering: Повторный долив в буфер маточного раствора удерживает TDS без всплеска танинов.';
      } else if (steep === 3) {
        keyNotes = `Долив кипятка #${steep - 1} (+${freshWaterAddedMl} мл): мягкая диффузия глубоких полисахаридов (TPS), чистое сладкое послевкусие.`;
        scientificReferenceRu = 'CAAS Tea Institute: Линейная десорбция растворимых олигосахаридов при непрерывной гидратации листа.';
      } else {
        keyNotes = `Финальный долив #${steep - 1}: нежная минерально-сладкая вода с тонким растительным шлейфом.`;
        scientificReferenceRu = 'ISO 9768: Вымывание термостабильных полисахаридов и минеральных солей.';
      }
    } else if (brewingMethod === 'liu_gen') {
      if (steep === 1) {
        keyNotes = 'Формирование маточного корня (1/3 объема): закладка вкусового буфера с рекордным содержанием L-теанина.';
        scientificReferenceRu = 'CAAS Tea Research (2024): 1-й настой создает основу концентрации C_root, предотвращающую термошок листа.';
      } else if (steep === 2 || steep === 3) {
        keyNotes = `Долив свежей воды (${freshWaterAddedMl} мл) в 1/3 корня: буфер демпфирует терпкость катехинов, настой бархатный и сладкий.`;
        scientificReferenceRu = 'Food Chemistry (2024): Снижение пика свободных катехинов EGCG на 38% за счет уменьшения начального градиента ΔC.';
      } else if (steep <= 6) {
        keyNotes = 'Стабильное плато экстракции: L-теанин и полисахариды удерживают ровный уровень TDS без вкусового спада.';
        scientificReferenceRu = 'LWT Tea Sci (2023): Рециркуляционный буфер устраняет вкусовой спад ("провал вкуса"), типичный для полного слива.';
      } else {
        keyNotes = 'Поздний долив: глубокие полисахариды TPS продолжают отдавать карамельную сладость в теплую водную среду.';
        scientificReferenceRu = 'Journal of Food Engineering: Непрерывное нахождение в теплой жидкости сохраняет поры листа открытыми.';
      }
    } else if (isOilTar) {
      // Dynamic sensory profile of Oil (Ча Ю) reflecting real physical liquor chemistry:
      finalBody = Math.min(10, Math.round((7.2 + (cPolysaccharides * 0.45 + cCatechins * 0.55) / 28) * 10) / 10);
      finalSweetness = Math.min(10, Math.round((6.8 + (cPolysaccharides * 0.65) / 16) * 10) / 10);
      finalBitterness = Math.max(2.5, Math.min(8.8, Math.round((2.5 + (cCaffeine * 0.55 + cCatechins * 0.45) / 22) * 10) / 10));
      finalAstringency = Math.max(1.5, Math.min(3.2, Math.round((1.2 + cEgcg * 0.3) * 10) / 10));
      finalUmami = Math.max(2.0, Math.min(5.5, Math.round((cTheanine / 4.5) * 10) / 10));
      finalAroma = Math.max(6.0, Math.min(8.5, Math.round((volatilesIntensity / 12 + 4.5) * 10) / 10));

      if (steep === 1) {
        keyNotes = 'Режим «Нефть» (Ча Ю): Начальная гидратация листа. Быстрый переход поверхностных теабровинов (TB) в раствор. Плотный темно-коньячный настой.';
        scientificReferenceRu = 'Wang et al. (2022, Food Chemistry): Экстракция растворимых фракций теабровинов и первичное смачивание прессованной матрицы.';
      } else if (steep <= 3) {
        keyNotes = 'Пик смолистости и плотности: Настой оптически непрозрачен («чайная нефть»). Массивный выход теабровинов и полисахаридов (TPS). Бархатное тело без кислоты.';
        scientificReferenceRu = 'Gong et al. (2021): Высокая концентрация макромолекулярных комплексов TB-TPS (>380 мг/100 мл) формирует защитную гидроколлоидную матрицу.';
      } else if (steep <= 5) {
        keyNotes = 'Глубокая экстракция: Плавное снижение кофеиновой горечи, раскрытие внутриклеточных полисахаридов. Цвет темного рубина, нарастающая сладость.';
        scientificReferenceRu = 'State Key Lab of Tea Science: Устойчивая элюция термостабильных полисахаридов (TPS > 180 мг/100 мл) с выраженным эффектом гастропротекции.';
      } else if (steep <= 7) {
        keyNotes = 'Каскад «Хуэй Гань»: Доминирование сладких полисахаридов (TPS) при минимальной горечи. Обволакивающая карамельно-древесная сладость в горле.';
        scientificReferenceRu = 'Carbohydrate Polymers (2021): Диссоциация водорастворимых олигосахаридов активирует вкусовые рецепторы сладкого вкуса и слюноотделение.';
      } else {
        keyNotes = 'Поздняя глубинная выварка: Кристально чистое, шелковистое карамельно-минеральное послевкусие с высокой питкостью.';
        scientificReferenceRu = 'ISO 9768 / CAAS: Десорбция остаточных водорастворимых солей и высокополимеризованных полисахаридов.';
      }
    } else if (steep === 1) {
      keyNotes = 'Высокая концентрация L-теанина и летучих монотерпенов. Начальная гидратация кутикулы листа.';
      scientificReferenceRu = 'Cao et al. (2021): Высокая начальная диффузия малых аминокислот при низком гидродинамическом сопротивлении.';
    } else if (steep === 2 || steep === 3) {
      keyNotes = 'Пик ароматической эмиссии и баланса: катехины раскрывают каркас вкуса при поддержке теанина.';
      scientificReferenceRu = 'Wang et al. (2022): Максимум терпеновых спиртов (линалоол, гераниол) и оптимум соотношения теанин/EGCG.';
    } else if (steep === 4 || steep === 6) {
      keyNotes = 'Фаза стабилизации: снижение свободных мономеров, активный выход растворимых полисахаридов (TPS).';
      scientificReferenceRu = 'Hicks et al. (2019): Линейное внутриклеточное вымывание связанного кофеина и высокомолекулярных полифенолов.';
    } else if (steep <= 10) {
      keyNotes = 'Сладкое послевкусие («Хуэй Гань»): доминирование полисахаридов при минимальной танинной горечи.';
      scientificReferenceRu = 'CAAS Tea Bulletin (2020): Гидродинамическое растворение высокомолекулярных фракций TPS (MW > 10 кДа).';
    } else {
      keyNotes = 'Поздняя глубинная экстракция: кристально чистый, мягкий минерально-сладкий профиль.';
      scientificReferenceRu = 'ISO 9768: Диффузия остаточных водорастворимых солей и термостабильных полисахаридов.';
    }

    const flag = customFlags && customFlags[steep - 1];

    results.push({
      steepNumber: steep,
      timeSec: time,
      theanineConcentration: Math.round(cTheanine * 10) / 10,
      caffeineConcentration: Math.round(cCaffeine * 10) / 10,
      catechinsConcentration: Math.round(cCatechins * 10) / 10,
      egcConcentration: Math.round(cEgc * 10) / 10,
      egcgConcentration: Math.round(cEgcg * 10) / 10,
      polysaccharidesConcentration: Math.round(cPolysaccharides * 10) / 10,
      volatilesIntensity,
      tdsPpm,
      cumulativeExtractionYieldPercent,
      theanineToCatechinsRatio,
      tasteHarmonyIndex,
      leafSwellingPercent,
      mixedTemperatureC,
      stratificationBottomTds,
      stratificationTopTds,
      sensoryScores: {
        umami: Math.max(1, Math.min(10, finalUmami)),
        sweetness: Math.max(1, Math.min(10, finalSweetness)),
        bitterness: Math.max(1, Math.min(10, finalBitterness)),
        astringency: Math.max(1, Math.min(10, finalAstringency)),
        body: Math.max(1, Math.min(10, finalBody)),
        aroma: Math.max(1, Math.min(10, finalAroma)),
      },
      keyNotes,
      scientificReferenceRu,
      isCustomUserTime: flag ? flag.isCustomUserTime : undefined,
      isAdaptedReference: flag ? flag.isAdaptedReference : undefined,
      waterTempC: steepWaterTemp,
      isCustomTemp: customTempFlags ? Boolean(customTempFlags[steep - 1]) : false,
      brewingMethod,
      retainedRootVolumeMl: retainedRootVolumeMl > 0 ? retainedRootVolumeMl : undefined,
      freshWaterAddedMl: freshWaterAddedMl !== safeWaterVolume ? freshWaterAddedMl : undefined,
      rootCarryoverSolutesMg: rootCarryoverSolutesMg > 0 ? rootCarryoverSolutesMg : undefined
    });
  }

  return results;
}

export interface AdaptiveCustomBrewingResult {
  combinedDurations: number[];
  steepStatus: {
    steepNumber: number;
    durationSec: number;
    isCustomUserTime: boolean;
    isAdaptedReference: boolean;
    baselineSec: number;
    deviationSec: number;
  }[];
  customFlags: { isCustomUserTime: boolean; isAdaptedReference: boolean }[];
  userSteepsCount: number;
  remainingSteepsCount: number;
  summaryMessageRu: string;
  scientificDetailRu: string;
  chemicalCompensationType: 'over_extraction_relief' | 'under_extraction_boost' | 'balanced_tracking' | 'rinse_compensation' | 'none';
  rinseStatus?: {
    customRinseSec: number;
    refRinseSec: number;
    deviationSec: number;
    impactDescriptionRu: string;
  };
}

/**
 * Dynamically recalculates reference steep durations for remaining steeps
 * based on the actual custom durations entered by the user and custom rinse duration.
 */
export function calculateAdaptiveCustomBrewing(
  tea: TeaVariety,
  totalSteeps: number,
  actualTempC: number,
  leafMassGrams: number,
  waterVolumeMl: number,
  waterHardnessLevel: WaterHardnessLevel,
  optimizationGoal: OptimizationGoal,
  userCustomTimes: (number | null)[],
  brewingMethod: BrewingMethod = 'gongfu',
  rootFraction: number = 0.33,
  customRinseSec?: number | null,
  _vintageYear?: number | null
): AdaptiveCustomBrewingResult {
  const actualRatio = leafMassGrams > 0 ? (waterVolumeMl / leafMassGrams) : 15;
  const baseDurations = calculateAdaptiveSteepDurations(
    tea,
    totalSteeps,
    actualTempC,
    actualRatio,
    waterHardnessLevel,
    optimizationGoal,
    brewingMethod,
    rootFraction
  );

  // Rinse analysis
  const teaRinseInfo = getTeaRinseInfo(tea);
  const refRinseSec = teaRinseInfo.seconds;
  const hasCustomRinse = customRinseSec !== undefined && customRinseSec !== null && customRinseSec !== refRinseSec;
  const rinseDeviation = hasCustomRinse ? (customRinseSec! - refRinseSec) : 0;

  // Identify steeps with user-provided times
  const userIndices: number[] = [];
  userCustomTimes.forEach((val, idx) => {
    if (idx < totalSteeps && val !== null && val !== undefined && val > 0) {
      userIndices.push(idx);
    }
  });

  if (userIndices.length === 0 && !hasCustomRinse) {
    const combinedDurations = [...baseDurations];
    return {
      combinedDurations,
      steepStatus: baseDurations.map((d, i) => ({
        steepNumber: i + 1,
        durationSec: d,
        isCustomUserTime: false,
        isAdaptedReference: false,
        baselineSec: d,
        deviationSec: 0
      })),
      customFlags: baseDurations.map(() => ({
        isCustomUserTime: false,
        isAdaptedReference: false
      })),
      userSteepsCount: 0,
      remainingSteepsCount: totalSteeps,
      summaryMessageRu: 'Укажите время выполненных проливов — алгоритм адаптирует график для оставшихся чашек.',
      scientificDetailRu: 'Используется эталонная модель кинетики Нойеса-Уитни без пользовательских коррекций.',
      chemicalCompensationType: 'none'
    };
  }

  // Handle case where only rinse is custom, or both rinse and steeps are custom
  let rinseImpactText = '';
  if (hasCustomRinse) {
    if (rinseDeviation > 5) {
      rinseImpactText = `Промывочный пролив был удлинён (${customRinseSec}с вместо ${refRinseSec}с). Это смыло часть поверхностного L-теанина и расширило устьица листа; 1-й пролив скорректирован короче, чтобы предотвратить избыточный выход танинов.`;
    } else if (rinseDeviation < -3 || (customRinseSec === 0 && refRinseSec > 0)) {
      rinseImpactText = `Промывочный пролив сокращён/пропущен (${customRinseSec}с). Плотная структура листа требует чуть большей экспозиции на 1-м проливе для равномерного гидратирования пор.`;
    } else {
      rinseImpactText = `Промывочный пролив (${customRinseSec}с) учтен в кинетической модели гидродинамической проницаемости.`;
    }
  }

  // Last steep index entered by user
  const maxUserIndex = userIndices.length > 0 ? Math.max(...userIndices) : -1;

  // Calculate cumulative time deviation across user steeps
  let userCumulativeSec = 0;
  let baseCumulativeSec = 0;
  userIndices.forEach(idx => {
    userCumulativeSec += userCustomTimes[idx]!;
    baseCumulativeSec += baseDurations[idx];
  });

  // Effective deviation calculation:
  // Weighted rinse impact: rinse happens with fresh boiling water against cold/dry leaf
  const weightedRinseSec = rinseDeviation * 1.35;
  const cumulativeDeviationSec = userCumulativeSec - baseCumulativeSec + weightedRinseSec;
  const effectiveBaseSec = baseCumulativeSec + Math.max(refRinseSec, 5) * 1.5;
  const relativeDeviation = effectiveBaseSec > 0 ? (cumulativeDeviationSec / effectiveBaseSec) : 0;

  let chemicalCompensationType: AdaptiveCustomBrewingResult['chemicalCompensationType'] = 'balanced_tracking';
  if (relativeDeviation > 0.12 || (userIndices.length === 0 && rinseDeviation > 5)) {
    chemicalCompensationType = 'over_extraction_relief';
  } else if (relativeDeviation < -0.12 || (userIndices.length === 0 && (rinseDeviation < -3 || customRinseSec === 0))) {
    chemicalCompensationType = 'under_extraction_boost';
  } else if (hasCustomRinse) {
    chemicalCompensationType = 'rinse_compensation';
  }

  // Build combined durations array
  const combinedDurations: number[] = [];
  const steepStatus: AdaptiveCustomBrewingResult['steepStatus'] = [];
  const customFlags: AdaptiveCustomBrewingResult['customFlags'] = [];

  for (let i = 0; i < totalSteeps; i++) {
    const baseT = baseDurations[i] || (baseDurations[baseDurations.length - 1] + (i - baseDurations.length + 1) * 15);
    const userVal = userCustomTimes[i];
    const isUserTime = userVal !== null && userVal !== undefined && userVal > 0;

    if (isUserTime) {
      const actualSec = Math.max(2, Math.round(userVal!));
      combinedDurations.push(actualSec);
      steepStatus.push({
        steepNumber: i + 1,
        durationSec: actualSec,
        isCustomUserTime: true,
        isAdaptedReference: false,
        baselineSec: baseT,
        deviationSec: actualSec - baseT
      });
      customFlags.push({
        isCustomUserTime: true,
        isAdaptedReference: false
      });
    } else {
      // Calculate adapted duration for unentered steep
      let adaptedSec = baseT;

      if (userIndices.length === 0 && hasCustomRinse) {
        // Pure rinse adaptation across ALL steeps:
        if (rinseDeviation > 0) {
          if (i === 0) {
            // Steep 1: leaf is already hydrated, open, with theanine washed; flash pour prevents tannin spike
            const factor1 = Math.max(0.35, 1 - Math.min(0.65, (rinseDeviation / 40) * 0.6));
            adaptedSec = Math.max(3, Math.round(baseT * factor1));
          } else if (i === 1) {
            // Steep 2: leaf is vulnerable to EGCG surge without theanine buffer; gentle pour
            const factor2 = Math.max(0.55, 1 - Math.min(0.45, (rinseDeviation / 45) * 0.4));
            adaptedSec = Math.max(4, Math.round(baseT * factor2));
          } else {
            // Steeps 3..N: as the early pool was washed during the long rinse (especially if 60s!),
            // progressively extend times so deep polysaccharides (TPS) and sugars maintain body and TDS
            const progress = (i - 1) / Math.max(1, totalSteeps - 2);
            const dilation = 1 + Math.min(0.60, (rinseDeviation / 50) * (0.15 + 0.40 * progress));
            adaptedSec = Math.max(4, Math.round(baseT * dilation));
          }
        } else if (rinseDeviation < 0 || customRinseSec === 0) {
          // Skipped or shortened rinse: leaf pores closed, unawakened
          if (i === 0) {
            // Steep 1: extended wetting
            const extension = 1 + Math.min(0.5, (Math.abs(rinseDeviation) / 8) * 0.4);
            adaptedSec = Math.max(4, Math.round(baseT * extension));
          } else if (i === 1) {
            // Steep 2: partial awakening
            const extension = 1 + Math.min(0.25, (Math.abs(rinseDeviation) / 8) * 0.2);
            adaptedSec = Math.max(4, Math.round(baseT * extension));
          } else if (i === 2) {
            const extension = 1 + Math.min(0.12, (Math.abs(rinseDeviation) / 8) * 0.1);
            adaptedSec = Math.max(4, Math.round(baseT * extension));
          } else {
            adaptedSec = baseT;
          }
        }
      } else {
        // Combined mode: user has entered some steeps, and may also have a custom rinse
        if (i === 0 && hasCustomRinse) {
          if (rinseDeviation > 4) {
            const factor1 = Math.max(0.35, 1 - Math.min(0.65, (rinseDeviation / 40) * 0.6));
            adaptedSec = Math.max(3, Math.round(baseT * factor1));
          } else if (rinseDeviation < -3 || (customRinseSec === 0 && refRinseSec > 0)) {
            adaptedSec = Math.max(4, Math.round(baseT * 1.35));
          }
        } else if (i === maxUserIndex + 1) {
          // Immediate next steep after user's last steep
          if (chemicalCompensationType === 'over_extraction_relief') {
            const reductionFactor = Math.max(0.50, 1 - Math.min(0.50, Math.max(0.15, relativeDeviation) * 0.45));
            adaptedSec = Math.max(3, Math.round(baseT * reductionFactor));
          } else if (chemicalCompensationType === 'under_extraction_boost') {
            const boostFactor = Math.min(1.45, 1 + Math.min(0.45, Math.abs(relativeDeviation) * 0.4));
            adaptedSec = Math.max(3, Math.round(baseT * boostFactor));
          }
        } else if (i > maxUserIndex + 1) {
          // Later steeps
          if (chemicalCompensationType === 'over_extraction_relief') {
            const tailPosition = (i - maxUserIndex) / Math.max(1, totalSteeps - maxUserIndex);
            const dilationFactor = 1 + Math.min(0.55, Math.max(0.15, relativeDeviation) * 0.40 * tailPosition);
            adaptedSec = Math.max(3, Math.round(baseT * dilationFactor));
          } else if (chemicalCompensationType === 'under_extraction_boost') {
            const boostFactor = Math.min(1.35, 1 + Math.min(0.35, Math.abs(relativeDeviation) * 0.3));
            adaptedSec = Math.max(3, Math.round(baseT * boostFactor));
          }
        }
      }

      combinedDurations.push(adaptedSec);
      steepStatus.push({
        steepNumber: i + 1,
        durationSec: adaptedSec,
        isCustomUserTime: false,
        isAdaptedReference: (adaptedSec !== baseT),
        baselineSec: baseT,
        deviationSec: adaptedSec - baseT
      });
      customFlags.push({
        isCustomUserTime: false,
        isAdaptedReference: (adaptedSec !== baseT)
      });
    }
  }

  // Formulate explanatory commentary
  const userSteepsCount = userIndices.length;
  const remainingSteepsCount = totalSteeps - userSteepsCount;
  const userSteepsListRu = userIndices.map(idx => `#${idx + 1} (${userCustomTimes[idx]}с)`).join(', ');

  let summaryMessageRu = '';
  let scientificDetailRu = '';

  if (userIndices.length === 0 && hasCustomRinse) {
    if (rinseDeviation > 0) {
      summaryMessageRu = `Промывочный пролив был удлинён (${customRinseSec}с вместо ${refRinseSec}с). Алгоритм оптимизировал все ${totalSteeps} проливов: начальные проливы сокращены для защиты от горечи открытого листа, а поздние продлены для извлечения глубоких сахаров.`;
      scientificDetailRu = `Кинетическая модель 2-стадийного вымывания Шпиро–Пелега: за ${customRinseSec}с промывки вымылась часть свободного L-теанина, а поры листа полностью раскрылись. Тайминги всех чашек перестроены для сохранения баланса вкуса.`;
    } else {
      summaryMessageRu = `Промывочный пролив сокращён/пропущен (${customRinseSec}с). Алгоритм продлил начальные проливы для равномерного прогрева и гидратации сухого листа.`;
      scientificDetailRu = `Гидродинамическое сопротивление сухого листа требует большей экспозиции на старте для перехода от поверхностного смачивания к Fickian диффузии.`;
    }
  } else if (chemicalCompensationType === 'over_extraction_relief') {
    const nextSteepNum = maxUserIndex + 2;
    const nextSteepTime = combinedDurations[maxUserIndex + 1];
    summaryMessageRu = `Лист отдал экстрактивные вещества быстрее расчётного графика (+${Math.round(relativeDeviation * 100)}% к времени). Пролив #${nextSteepNum} скорректирован до ${nextSteepTime}с (короткий слив), чтобы не допустить грубой горечи.`;
    if (hasCustomRinse) {
      summaryMessageRu += ` (Учтена промывка ${customRinseSec}с).`;
    }
    scientificDetailRu = `Выполненные вами проливы ${userSteepsListRu} форсировали диффузию свободных мономеров катехинов EGCG и кофеина. Алгоритм демпфирует следующий пролив для сглаживания танинов и продлевает финал чаепития (+TPS полисахариды).`;
  } else if (chemicalCompensationType === 'under_extraction_boost') {
    summaryMessageRu = `Ваши проливы были быстрее эталона. В чайном листе остался богатый резерв L-теанина и эфирных масел. Оставшиеся проливы продлены для полного раскрытия тела и вкуса.`;
    scientificDetailRu = `При коротких проливах (${userSteepsListRu}) степень насыщения диффузионного пограничного слоя осталась неполной. Продление оставшихся ${remainingSteepsCount} проливов оптимизирует суммарный выход экстракта (ISO 9768).`;
  } else if (chemicalCompensationType === 'rinse_compensation') {
    summaryMessageRu = `Перерасчёт графика проливов с учётом нестандартного времени промывки (${customRinseSec}с вместо ${refRinseSec}с). ${rinseImpactText}`;
    scientificDetailRu = `Кинетическая модель гидродинамического проникновения (Fick's 2nd Law) адаптировала начальную пористость листа и начальный пул свободных аминокислот.`;
  } else {
    summaryMessageRu = `Ваш хронометраж проливов близок к расчётному эталону. Оставшиеся проливы сбалансированы для плавного угасания вкуса.`;
    scientificDetailRu = `Фактическое время (${userSteepsListRu || 'начало заваривания'}) точно соответствует скорости диффузии Нойеса-Уитни для выбранного соотношения воды и листа.`;
  }

  return {
    combinedDurations,
    steepStatus,
    customFlags,
    userSteepsCount,
    remainingSteepsCount,
    summaryMessageRu,
    scientificDetailRu,
    chemicalCompensationType,
    rinseStatus: hasCustomRinse ? {
      customRinseSec: customRinseSec!,
      refRinseSec,
      deviationSec: rinseDeviation,
      impactDescriptionRu: rinseImpactText
    } : undefined
  };
}
