import type { CompoundPhysicsParameter, TeaType, TrackedTeaCompound } from '../types';

/**
 * Published reference means used for the first archetype-level calibration pass.
 * All observations below are reported as mg per 200 mL infusion. They are population
 * means from commercial products, not guaranteed values for an individual tea lot.
 */
export interface TeaInfusionReferencePoint {
  temperatureC: 80 | 100;
  durationSec: 120 | 300 | 600;
  meanMgPer200Ml: number;
}

export interface TeaArchetypeReferenceData {
  sampleCountCaffeine: number;
  sampleCountTheanine: number;
  caffeine: TeaInfusionReferencePoint[];
  theanine: TeaInfusionReferencePoint[];
}

export type MeasuredCompound = Extract<TrackedTeaCompound, 'caffeine' | 'theanine'>;
export type CalibrationArchetype = 'green' | 'white' | 'yellow' | 'oolong' | 'black' | 'puerh';

export const TEA_EXTRACTION_REFERENCE_SOURCE = {
  citation: 'Foods. 2025;14(13):2313',
  doi: '10.3390/foods14132313',
  url: 'https://doi.org/10.3390/foods14132313',
  methodRu: 'HPLC, 2 г сухого чая на 200 мл ультрачистой воды; 80 и 100 °C; 2, 5 и 10 минут',
  limitationRu: 'Средние значения коммерческих образцов. Соотношение 2 г/200 мл и минуты экстракции отличаются от коротких проливов гунфу; параметры используются как начальные архетипические априоры, а не как индивидуальное лабораторное измерение.',
} as const;

const pointSet = (
  means80: [number, number, number],
  means100: [number, number, number],
): TeaInfusionReferencePoint[] => [
  { temperatureC: 80, durationSec: 120, meanMgPer200Ml: means80[0] },
  { temperatureC: 80, durationSec: 300, meanMgPer200Ml: means80[1] },
  { temperatureC: 80, durationSec: 600, meanMgPer200Ml: means80[2] },
  { temperatureC: 100, durationSec: 120, meanMgPer200Ml: means100[0] },
  { temperatureC: 100, durationSec: 300, meanMgPer200Ml: means100[1] },
  { temperatureC: 100, durationSec: 600, meanMgPer200Ml: means100[2] },
];

export const TEA_EXTRACTION_REFERENCE_DATA: Record<CalibrationArchetype, TeaArchetypeReferenceData> = {
  green: {
    sampleCountCaffeine: 12,
    sampleCountTheanine: 4,
    caffeine: pointSet([11, 23, 28], [15, 25, 27]),
    theanine: pointSet([13, 17, 17], [12, 16, 17]),
  },
  white: {
    sampleCountCaffeine: 5,
    sampleCountTheanine: 3,
    caffeine: pointSet([5.8, 26, 24], [16, 22, 31]),
    theanine: pointSet([1.8, 3.3, 4.3], [2, 4, 4]),
  },
  yellow: {
    sampleCountCaffeine: 2,
    sampleCountTheanine: 2,
    caffeine: pointSet([13.8, 37, 42], [26, 42, 53]),
    theanine: pointSet([4, 7.6, 9], [4.5, 6.8, 8]),
  },
  oolong: {
    sampleCountCaffeine: 4,
    sampleCountTheanine: 3,
    caffeine: pointSet([4, 11, 19], [14, 25, 29]),
    theanine: pointSet([2.1, 1.9, 2.8], [2.2, 2.5, 4]),
  },
  black: {
    sampleCountCaffeine: 41,
    sampleCountTheanine: 6,
    caffeine: pointSet([14, 23, 28], [17, 23, 27]),
    theanine: pointSet([12, 21, 22], [13, 21, 23]),
  },
  puerh: {
    sampleCountCaffeine: 2,
    sampleCountTheanine: 2,
    caffeine: pointSet([13, 25, 38], [19, 28, 40]),
    theanine: pointSet([3.1, 4.2, 4.6], [3.2, 4, 4.6]),
  },
};

/**
 * Least-squares effective first-order priors fitted to the six published mean
 * conditions per group using the app's two-pool equation:
 * f(1-exp(-1.8*k*t)) + (1-f)(1-exp(-0.45*k*t)), with an Arrhenius temperature
 * multiplier referenced to 85 °C. These are rounded fit coefficients, not direct
 * measurements of the intact dry leaf's full chemical composition.
 *
 * k85 is expressed in s^-1; effectiveInitialMgPerG represents the extractable pool
 * on the calibration time horizon. The current Gongfu seconds-range is an extrapolation.
 */
const note = 'Аппроксимация средних HPLC-данных Foods 2025;14(13):2313 при 2 г/200 мл, 80/100 °C и 2/5/10 мин. Перенос на проливы гунфу требует отдельной проверки.';
const parameter = (initialMgPerG: number, rateAt85CPerSec: number, activationEnergyKJMol: number): CompoundPhysicsParameter => ({
  initialMgPerG,
  extractableFraction: 1,
  rateAt85CPerSec,
  activationEnergyKJMol,
  sourceStatus: 'calibrated',
  sourceCitation: TEA_EXTRACTION_REFERENCE_SOURCE.doi,
  calibrationNoteRu: note,
});

const sourceFit = {
  green: {
    caffeine: parameter(16.379, 0.00513, 12.21),
    theanine: parameter(8.668, 0.015567, 5),
  },
  white: {
    caffeine: parameter(17.713, 0.003779, 23.17),
    theanine: parameter(2.554, 0.004705, 10.36),
  },
  yellow: {
    caffeine: parameter(30.704, 0.003522, 31.05),
    theanine: parameter(4.902, 0.005736, 5),
  },
  oolong: {
    caffeine: parameter(17.654, 0.002009, 69.02),
    theanine: parameter(1.857, 0.005201, 34.77),
  },
  black: {
    caffeine: parameter(14.893, 0.007263, 7.59),
    theanine: parameter(12.559, 0.007504, 5.78),
  },
  puerh: {
    caffeine: parameter(26.691, 0.002841, 13.79),
    theanine: parameter(2.364, 0.011496, 5),
  },
} satisfies Record<CalibrationArchetype, Partial<Record<MeasuredCompound, CompoundPhysicsParameter>>>;

const typeToArchetype: Partial<Record<TeaType, CalibrationArchetype>> = {
  green: 'green',
  white: 'white',
  yellow: 'yellow',
  oolong_ball: 'oolong',
  oolong_strip: 'oolong',
  gaba_oolong: 'oolong',
  red: 'black',
  gaba_red: 'black',
  sheng_puerh: 'puerh',
  shou_puerh: 'puerh',
  heicha: 'puerh',
};

export const TEA_ARCHETYPE_EXTRACTION_PRIORS: Partial<Record<TeaType, Partial<Record<MeasuredCompound, CompoundPhysicsParameter>>>> =
  Object.fromEntries(
    Object.entries(typeToArchetype).map(([teaType, archetype]) => [teaType, sourceFit[archetype as CalibrationArchetype]]),
  ) as Partial<Record<TeaType, Partial<Record<MeasuredCompound, CompoundPhysicsParameter>>>>;

/** Metadata for UI notes and future re-fitting scripts. */
export const TEA_CALIBRATION_NOTES_RU = [
  'Кофеин и L-теанин имеют архетипические параметры, аппроксимированные по опубликованным данным HPLC.',
  'Катехины и полисахариды остаются оценочными: сопоставимый набор точек для всех архетипов в этот проход не включён.',
  'Параметры гунфу в диапазоне секунд экстраполируются из лабораторных настоев длительностью 2–10 минут и требуют отдельной экспериментальной валидации.',
] as const;
