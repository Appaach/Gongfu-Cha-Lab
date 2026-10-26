/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueWithOrigin } from '../tea/types.ts';

/**
 * Идентификаторы трёх фундаментальных методов заваривания:
 * 1. gongfu_cha: классический метод Гунфу Ча с практически полным сливом настоя после каждого пролива.
 * 2. liu_gen_pao: метод «сохранения корней настоя» (Лю Гэнь Пао), когда часть готового настоя остаётся в сосуде с листом при каждом доливе.
 * 3. lazy_mug: открытое ленивое заваривание в кружке (Grandpa style), когда лист находится в воде непрерывно, а вода доливается по мере питья.
 */
export type BrewingMethodId = 'gongfu_cha' | 'liu_gen_pao' | 'lazy_mug';

export interface BrewingMethodDescriptor {
  readonly id: BrewingMethodId;
  readonly name: string;
  readonly nativeName: string;
  readonly summary: string;
  readonly physicalMechanism: string;
  readonly typicalRatioRangeDescription: string; // Описание диапазона соотношений с однозначным указанием единиц
  readonly defaultStepsOrEventsCount: number;
}

/**
 * Материал заварочного сосуда и его термодинамические свойства.
 */
export type VesselMaterial = 'porcelain' | 'yixing_clay' | 'glass' | 'stoneware';

export interface BrewingVessel {
  readonly id: string;
  readonly name: string;
  readonly material: VesselMaterial;
  readonly volumeMl: number;             // Номинальная вместимость сосуда (мл). НЕ подменяет фактический объём заливки!
  readonly thermalInertiaFactor: number; // Относительный коэффициент теплоемкости (0.2 – 0.9)
  readonly wallThicknessMm: number;      // Толщина стенок (мм)
  readonly notes?: string;
}

/**
 * Шаг пролива для метода Гунфу Ча (полный слив).
 */
export interface GongfuStepConfig {
  readonly stepNumber: number;
  readonly infusionTimeSeconds: number; // Время экспозиции листа в воде (с)
  readonly pourWaterVolumeMl: number;   // Фактический объём заливаемой воды (мл)
  readonly waterTemperatureC: number;   // Температура заливаемой воды (°C)
}

/**
 * Шаг пролива для метода Лю Гэнь Пао (сохранение корней настоя).
 * Процент удержания строго определён относительно ПОЛНОГО объёма жидкости в сосуде после настаивания!
 */
export interface LiuGenPaoStepConfig {
  readonly stepNumber: number;
  readonly infusionTimeSeconds: number;            // Время экспозиции шага (с)
  readonly addedWaterVolumeMl: number;             // Объём доливаемой свежей воды на данном шаге (мл)
  readonly addedWaterTemperatureC: number;         // Температура доливаемой воды (°C)
  readonly retainedLiquorFractionOfTotal: number;  // Доля удержания от полного объёма жидкости перед сливом (0.1 – 0.8, типично 0.3–0.5)
}

/**
 * Типы событий для ленивого заваривания в кружке (непрерывный контакт):
 * Экстракция продолжается непрерывно во времени, пока лист в воде.
 */
export type LazyMugEventType =
  | 'initial_pour'      // Первоначальное заливание листьев
  | 'sip_consumption'   // Отпивание / уменьшение объёма жидкости пользователем
  | 'water_refill'      // Долив свежей горячей воды
  | 'session_end';      // Завершение чаепития / извлечение листа

export interface LazyMugInitialPourEvent {
  readonly type: 'initial_pour';
  readonly timestampSeconds: number; // = 0
  readonly waterVolumeMl: number;
  readonly waterTemperatureC: number;
}

export interface LazyMugSipEvent {
  readonly type: 'sip_consumption';
  readonly timestampSeconds: number; // Момент отпивания от начала сессии (с)
  readonly consumedVolumeMl: number; // Объём выпитого (мл)
}

export interface LazyMugRefillEvent {
  readonly type: 'water_refill';
  readonly timestampSeconds: number;   // Момент долива от начала сессии (с)
  readonly addedWaterVolumeMl: number; // Объём долитой свежей воды (мл)
  readonly addedWaterTemperatureC: number; // Температура долитой воды (°C)
}

export interface LazyMugSessionEndEvent {
  readonly type: 'session_end';
  readonly timestampSeconds: number; // Финал сессии (с)
}

export type LazyMugTimelineEvent =
  | LazyMugInitialPourEvent
  | LazyMugSipEvent
  | LazyMugRefillEvent
  | LazyMugSessionEndEvent;

/**
 * Профиль химического состава воды с явным происхождением данных.
 * TDS, жесткость (dGH), щелочность (dKH), pH и отдельные катионы/анионы — независимые параметры.
 */
export interface WaterProfile {
  readonly id: string;
  readonly name: string;
  readonly isModelPreset: boolean;        // Флаг: является ли это оценочным модельным сценарием
  readonly presetDescription?: string;    // Описание допущения
  readonly mineralizationTdsMgL: ValueWithOrigin<number>; // TDS / сухой остаток (мг/л)
  readonly generalHardnessDgh?: ValueWithOrigin<number>;   // Общая жесткость (dGH / градусы немецкой жесткости)
  readonly carbonateHardnessDkh?: ValueWithOrigin<number>; // Карбонатная жесткость / щелочность (dKH)
  readonly ph?: ValueWithOrigin<number>;                   // Водородный показатель (pH)
  readonly calciumMgL?: ValueWithOrigin<number>;           // Ca2+ (мг/л)
  readonly magnesiumMgL?: ValueWithOrigin<number>;         // Mg2+ (мг/л)
  readonly bicarbonateMgL?: ValueWithOrigin<number>;       // HCO3- (мг/л)
}

/**
 * Базовая конфигурация сессии заваривания.
 */
export interface BaseBrewingSessionConfig {
  readonly teaId: string;
  readonly vessel: BrewingVessel;
  readonly leafMassGrams: number;       // Масса сухого чая (г)
  readonly waterProfile: WaterProfile;  // Профиль воды
}

/**
 * Конфигурация сессии Гунфу Ча (импульсные проливы).
 */
export interface GongfuSessionConfig extends BaseBrewingSessionConfig {
  readonly methodId: 'gongfu_cha';
  readonly baseWaterTemperatureC: number;
  readonly steps: GongfuStepConfig[];
}

/**
 * Конфигурация сессии Лю Гэнь Пао (сохранение корней настоя).
 */
export interface LiuGenPaoSessionConfig extends BaseBrewingSessionConfig {
  readonly methodId: 'liu_gen_pao';
  readonly baseWaterTemperatureC: number;
  readonly steps: LiuGenPaoStepConfig[];
}

/**
 * Конфигурация сессии Открытого настаивания в кружке (непрерывный контакт).
 */
export interface LazyMugSessionConfig extends BaseBrewingSessionConfig {
  readonly methodId: 'lazy_mug';
  readonly baseWaterTemperatureC: number;
  readonly initialWaterVolumeMl: number;
  readonly timelineEvents: LazyMugTimelineEvent[];
  readonly scenarioType: 'preset_assumption' | 'custom_events'; // Явное обозначение допущения
}

/**
 * Единый тип конфигурации сессии заваривания (дискриминированное объединение по methodId).
 */
export type BrewingSessionConfig =
  | GongfuSessionConfig
  | LiuGenPaoSessionConfig
  | LazyMugSessionConfig;
