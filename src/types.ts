export type TeaType = 
  | 'green' 
  | 'white' 
  | 'yellow' 
  | 'oolong_ball' 
  | 'oolong_strip' 
  | 'red' 
  | 'sheng_puerh' 
  | 'shou_puerh'
  | 'heicha'
  | 'gaba_oolong'
  | 'gaba_red'
  | 'custom';

export type TeaCategoryGroup = 'generic' | 'specific' | 'favorites' | 'blend' | 'my_teas';

export interface BlendComponentItem {
  teaId: string;
  weightG: number;
  vintageYear?: number;
}

export interface TeaBlendComponentDetail {
  teaId: string;
  teaNameRu: string;
  baseWeightG: number;
  ratioFraction: number;
  vintageYear?: number;
}

export interface BlendPresetRecipe {
  id: string;
  titleRu: string;
  subtitleRu?: string;
  descriptionRu: string;
  targetEffectRu?: string;
  components: { teaId: string; ratioPercent: number }[];
}

export type MasterBlendPreset = BlendPresetRecipe;

export interface TeaBlendCalculationResult {
  totalMassG: number;
  recommendedWaterVolumeMl: number;
  recommendedRatio: number;
  optimalTempC: number;
  tempRationaleRu: string;
  recommendedVesselRu: string;
  recommendedSteeps: number;
  steepScheduleSec: number[];
  
  // Composite chemical concentrations (mg/g)
  theanineMgPerG: number;
  caffeineMgPerG: number;
  catechinsMgPerG: number;
  polysaccharidesMgPerG: number;
  
  // Synergy and Sensory indices
  theanineToCaffeineRatio: number;
  theanineToCatechinsRatio: number;
  tanninBufferingScorePercent: number;
  aromaHarmonyScorePercent: number;
  energyRelaxScorePercent: number; // 0 = deeply relaxing/sedative, 100 = intense stimulating energy
  dominantFlavorNotes: string[];
  secondaryFlavorNotes: string[];
  finishNotes: string[];
  
  synergySummaryRu: string;
  brewingAdviceRu: string;
  compositeTeaVariety: TeaVariety;
}

export type TeaEffectCategory = 
  | 'focus_zen' 
  | 'energy_power' 
  | 'calm_gaba' 
  | 'warmth_comfort' 
  | 'digest_detox';

export interface TeaVariety {
  id: string;
  nameRu: string;
  transcriptionRu?: string; // Chinese pinyin transcription in Cyrillic for shop searching (e.g. "Да Хун Пао", "Лунцзин")
  nameZh: string;
  namePinyin: string;
  type: TeaType;
  typeNameRu: string;
  origin: string;
  cultivar: string;
  oxidationLevel: string; // e.g. "0%", "15-20%", "40-60%", "100%", "Постферментация"
  leafMorphology: 'flat' | 'needle' | 'twisted_strip' | 'tight_ball' | 'compressed_cake';
  optimalTemp: number; // in Celsius
  tempRange: [number, number];
  defaultMass: number; // in grams
  defaultVolume: number; // in ml
  recommendedVesselRu: string;
  keySensoryNotes: string[];
  scientificDescription: string;
  recommendedSteeps: number;
  categoryGroup?: TeaCategoryGroup;
  isArchetype?: boolean;
  generalExamplesRu?: string[]; // Examples of teas matching this general archetype
  effectCategory?: TeaEffectCategory;
  effectNameRu?: string;
  effectDescriptionRu?: string;
  rinseRecommended?: boolean;
  rinseSeconds?: number;
  rinseNoteRu?: string;
  vintageYear?: number;
  canAge?: boolean;
  isCustom?: boolean;
  blendComponents?: TeaBlendComponentDetail[];
}

export { canTeaAge, cleanTeaTitleForDisplay } from './domain/teaAging';

export interface ChemicalCompoundInfo {
  id: string;
  nameRu: string;
  nameEn: string;
  chemicalFormula: string;
  molecularWeight: string;
  solubilityTempThreshold: string;
  sensoryRoleRu: string;
  extractionBehaviorRu: string;
  primaryTeas: string[];
}

export interface SteepKineticData {
  steepNumber: number;
  timeSec: number;
  theanineConcentration: number; // mg/100ml
  caffeineConcentration: number; // mg/100ml
  catechinsConcentration: number; // mg/100ml
  polysaccharidesConcentration: number; // mg/100ml
  volatilesIntensity: number; // score 0-100
  tdsPpm: number; // Total Dissolved Solids in mg/L (ppm)
  cumulativeExtractionYieldPercent: number; // % of total dry leaf mass extracted so far
  theanineToCatechinsRatio: number; // Umami-to-astringency balance index
  egcConcentration?: number; // mg/100ml non-esterified sweet catechin (EGC)
  egcgConcentration?: number; // mg/100ml gallated astringent catechin (EGCG/ECG)
  tasteHarmonyIndex?: number; // Taste Harmony Index (THI)
  mixedTemperatureC?: number; // Temperature after mixing fresh water into root liquor (Liu Gen Pao)
  stratificationBottomTds?: number; // Dense bottom stratum TDS (Grandpa Cup)
  stratificationTopTds?: number; // Top sipping stratum TDS (Grandpa Cup)
  leafSwellingPercent?: number; // Physical leaf opening percentage (%)
  sensoryScores: {
    umami: number; // 0-10
    sweetness: number; // 0-10
    bitterness: number; // 0-10
    astringency: number; // 0-10
    body: number; // 0-10
    aroma: number; // 0-10
  };
  keyNotes: string;
  scientificReferenceRu: string;
  isCustomUserTime?: boolean; // Duration was entered manually by the user
  isAdaptedReference?: boolean; // Duration was dynamically adapted by algorithm based on user's actual past steeps
  waterTempC?: number; // Actual water temperature used for this steep (°C)
  isCustomTemp?: boolean; // Temperature was manually set by the user for this steep
  brewingMethod?: BrewingMethod;
  retainedRootVolumeMl?: number; // Volume of root liquor left from previous steep
  freshWaterAddedMl?: number; // Volume of fresh water poured
  rootCarryoverSolutesMg?: number; // Solutes carried over from previous steep root
}

export type BrewingMethod = 'gongfu' | 'liu_gen' | 'grandpa_cup';

export interface BrewingMethodInfo {
  id: BrewingMethod;
  nameRu: string;
  nameZh: string;
  namePinyin: string;
  shortDescRu: string;
  fullDescRu: string;
  drainModeRu: string;
  idealForRu: string;
}

export interface ResearchPaper {
  id: string;
  titleRu: string;
  titleEn: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  keyFindingRu: string;
  methodologyRu: string;
  practicalApplicationRu: string;
  category: 'temperature' | 'kinetics' | 'caffeine' | 'aroma' | 'ratio';
}

export type WaterHardnessLevel = 'soft' | 'optimal' | 'hard';

export interface WaterHardnessInfo {
  level: WaterHardnessLevel;
  nameRu: string;
  tdsPpmRange: string;
  extractionMultiplier: number;
  scientificImpactRu: string;
}

export type VesselMaterialType = 
  | 'ceramic_regular'
  | 'glass_regular'
  | 'porcelain' 
  | 'ceramic_thick' 
  | 'yixing_clay' 
  | 'glass' 
  | 'metal_silver' 
  | 'cast_iron' 
  | 'thermos';

export interface VesselMaterialInfo {
  id: VesselMaterialType;
  nameRu: string;
  heatLossPerSteepC: number;
  tanninAdsorptionFactor: number;
  bestForRu: string;
  scientificImpactRu: string;
}

export type OptimizationGoal = 'balanced' | 'umami_sweetness' | 'body_density' | 'aroma_peak' | 'max_longevity' | 'oil_tar' | 'white_debitter';

export interface OptimizationPreset {
  id: OptimizationGoal;
  nameRu: string;
  targetRatio: number; // e.g. 15 for 1:15, or 9 for 1:9 in oil_tar
  tempOffsetC: number; // e.g. -3 for cooler (theanine) or +2 for hotter (body)
  timeFactor: number; // multiplier on base durations
  descriptionRu: string;
  allowedTeaTypes?: TeaType[]; // When specified, only available for these types (e.g. puerh, heicha)
}

export interface FormulaVariable {
  symbol: string;
  nameRu: string;
  unitRu: string;
  descriptionRu: string;
  colorClass?: string;
}

export interface ScientificModelExplanation {
  id: string;
  equationName: string;
  subTitleRu: string;
  academicDisciplineRu: string;
  formulaLatex: string;
  canonicalFormRu?: string;
  variables: FormulaVariable[];
  textbookDerivationRu: string;
  descriptionRu: string;
  sourcePaper: string;
}

export interface ChemicalKineticProperty {
  id: string;
  nameRu: string;
  nameEn: string;
  formula: string;
  molecularWeight: number; // g/mol
  activationEnergy: number; // kJ/mol
  k_rate: number; // s^-1 base rate at 85°C
  diffusionSpeedRatio: string;
  tasteRoleRu: string;
  temperatureSensitivityRu: string;
  colorClass: string;
}

export interface TastingJournalEntry {
  id: string;
  teaId: string;
  teaNameRu: string;
  teaNameZh?: string;
  teaTypeNameRu: string;
  dateIso: string;
  rating: number; // 1 to 5
  vesselUsed: string; // Гайвань, Исинский чайник, Типод, etc.
  vesselMaterial?: VesselMaterialType;
  vintageYear?: number;
  brewingMethod?: BrewingMethod;
  optimizationGoal?: OptimizationGoal;
  waterHardness?: WaterHardnessLevel;
  customRinseTime?: number | null;
  waterTempC: number;
  teaMassG: number;
  waterVolumeMl?: number;
  steepsCount?: number;
  steepScheduleSec?: number[]; // Актуальные секунды каждого пролива из симулятора
  useDynamicTemperatures?: boolean;
  steepTemperaturesC?: number[]; // Температуры каждого пролива при динамическом режиме
  isBlend?: boolean;
  blendComponents?: string[];
  sensoryNotes: string[];
  sweetnessScore: number; // 1 to 10
  astringencyScore: number; // 1 to 10
  bodyScore: number; // 1 to 10
  huiGanScore: number; // 1 to 10 (сладость в горле / послевкусие)
  effectNote: string; // Ноотропный, Согревающий, Релакс, Тонус, etc.
  userNotes: string; // Личные впечатления мастера
  tags: string[];
  rootFraction?: number;
}

export interface InitialBrewParams {
  tea: TeaVariety;
  vintageYear?: number;
  vesselMaterial?: VesselMaterialType;
  brewingMethod?: BrewingMethod;
  optimizationGoal?: OptimizationGoal;
  waterHardness?: WaterHardnessLevel;
  customRinseTime?: number | null;
  waterTempC?: number;
  teaMassG?: number;
  waterVolumeMl?: number;
  steepsCount?: number;
  steepScheduleSec?: number[];
  useDynamicTemperatures?: boolean;
  steepTemperaturesC?: number[];
  vesselUsed?: string;
  rootFraction?: number;
}

export interface InitialTastingSessionData extends InitialBrewParams {
  effectNote?: string;
  userNotes?: string;
  tags?: string[];
}


export interface AppSettings {
  advancedMode: boolean;              // Master переключатель «Детализация параметров» (гидромодуль, ppm, ISO 9768, теплофизика)
  showBrewingMethod: boolean;         // 1. "Выбор метода заваривания" (default false)
  showGoalAndMethod: boolean;         // 2. "Метод пролива" (default false)
  useDynamicTemperatures: boolean;    // 3. "Динамическая температура воды" (default false)
  showChemicalComposition: boolean;   // 4. "Фракционный состав пиалы" (default false)
  showExtractionChart: boolean;       // 5. "График динамики экстракции" (default false)
  hideBrewingMethodSelector?: boolean; // legacy alias
  customTeasExportFilename?: string;  // Настройка имени файла по умолчанию при экспорте коллекции сортов
}


