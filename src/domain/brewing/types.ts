/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Идентификаторы трёх фундаментальных методов заваривания:
 * 1. gongfu_cha: классический метод Гунфу Ча с практически полным сливом настоя после каждого пролива.
 * 2. liu_gen_pao: метод «сохранения корней настоя» (Лю Гэнь Пао), когда часть настоя (20-50%) остаётся в сосуде с листом при каждом доливе.
 * 3. lazy_mug: открытое ленивое заваривание в кружке (Grandpa style), когда лист находится в воде непрерывно, а вода доливается по мере питья.
 */
export type BrewingMethodId = 'gongfu_cha' | 'liu_gen_pao' | 'lazy_mug';

export interface BrewingMethodDescriptor {
  readonly id: BrewingMethodId;
  readonly name: string;
  readonly nativeName: string;
  readonly summary: string;
  readonly physicalMechanism: string;
  readonly typicalRatioRange: { min: number; max: number }; // г листа : 100 мл воды
  readonly defaultStepsCount: number;
}

/**
 * Материал заварочного сосуда и его термодинамические свойства.
 */
export type VesselMaterial = 'porcelain' | 'yixing_clay' | 'glass' | 'stoneware';

export interface BrewingVessel {
  readonly id: string;
  readonly name: string;
  readonly material: VesselMaterial;
  readonly volumeMl: number; // Номинальный полезный объём сосуда (мл)
  readonly thermalInertiaFactor: number; // 0.2 (быстро остывает, стекло) – 0.9 (высокая теплоёмкость, толстая глина)
  readonly wallThicknessMm: number; // Толщина стенок (мм)
  readonly notes?: string;
}

/**
 * Параметры единичного шага / пролива.
 */
export interface BrewingStepConfig {
  readonly stepNumber: number;
  readonly infusionTimeSeconds: number; // Время экспозиции листа в воде (с)
  readonly waterVolumeMl: number;       // Объём доливаемой воды на данном шаге (мл)
  readonly waterTemperatureC: number;   // Температура заливаемой воды (°C)
  readonly retainedLiquorPercent?: number; // Для Лю Гэнь Пао: процент настоя, остающийся в сосуде (например, 35%)
}

/**
 * Параметры химического состава воды (будущая гидрохимия).
 */
export interface WaterProfile {
  readonly id: string;
  readonly name: string;
  readonly mineralizationTdsMgL: number; // Минерализация воды / TDS (мг/л, оптимально 30-100 мг/л)
  readonly ph: number;                  // pH воды (оптимально 6.5 - 7.2)
}

/**
 * Конфигурация сессии моделирования заваривания.
 * Полностью описывает эксперимент перед запуском расчёта.
 */
export interface BrewingSessionConfig {
  readonly methodId: BrewingMethodId;
  readonly teaId: string;
  readonly vessel: BrewingVessel;
  readonly leafMassGrams: number;       // Масса сухого чая (г)
  readonly baseWaterTemperatureC: number; // Базовая температура воды (°C)
  readonly waterProfile: WaterProfile;
  readonly steps: BrewingStepConfig[];
}
