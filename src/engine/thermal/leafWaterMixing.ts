/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueWithOrigin } from '../../domain/tea/types.ts';
import { SPECIFIC_HEAT_WATER_J_PER_KG_K } from './constants.ts';
import {
  ThermalRangeError,
  ThermalValidationError,
} from './errors.ts';

/**
 * Допустимые единицы измерения удельной теплоёмкости сухого чайного листа.
 * Согласно системе СИ: Дж / (кг · К).
 */
export const VALID_SPECIFIC_HEAT_UNITS = new Set<string>([
  'Дж/(кг·К)',
  'Дж/(кг*К)',
  'Дж/(кг К)',
  'Дж/кг/К',
  'J/(kg·K)',
  'J/(kg*K)',
  'J/(kg K)',
  'J/kg/K',
  'J/(kg.K)',
  'J/(kg·k)',
]);

/**
 * Метрологический статус расчёта адиабатического смешения чайного листа и воды:
 * - 'calculated': удельная теплоёмкость листа известна, смешение полностью рассчитано.
 * - 'unknown_leaf_specific_heat': удельная теплоёмкость листа неизвестна (origin: 'unknown' или значение null/undefined).
 *   В соответствии с принципом «Unknown ≠ 0» зависимые теплоёмкости и температура смеси строго равны null.
 */
export type LeafWaterMixingStatus =
  | 'calculated'
  | 'unknown_leaf_specific_heat';

/**
 * Входные параметры для расчёта температуры адиабатического смешения чайного листа и воды.
 */
export interface LeafWaterThermalMixingParams {
  /**
   * Масса чайного листа в навеске, г (> 0).
   * Принимается существующая входная навеска dry leaf mass модели без переинтерпретации.
   */
  readonly leafMassGrams: number;

  /**
   * Удельная изобарная теплоёмкость сухого листа с метаданными происхождения, Дж/(кг·К).
   * Должна строго соответствовать принятой массовой базе leafMassGrams.
   */
  readonly leafSpecificHeatCapacity: ValueWithOrigin<number> | null | undefined;

  /**
   * Масса воды, поглощённой клеточной матрицей листа к моменту смешения, г (>= 0).
   */
  readonly absorbedWaterGrams: number;

  /**
   * Масса свободной жидкости, уже находящейся в сосуде к моменту смешения, г (>= 0).
   */
  readonly existingFreeWaterGrams: number;

  /**
   * Общая температура содержимого сосуда (лист + поглощённая влага + свободная вода) перед смешением, °C [0, 100].
   */
  readonly contentTemperatureBeforeMixingC: number;

  /**
   * Масса добавляемой порции свежей воды, г (> 0).
   */
  readonly addedWaterMassGrams: number;

  /**
   * Температура добавляемой порции воды, °C [0, 100].
   */
  readonly addedWaterTemperatureC: number;
}

/**
 * Результат расчёта адиабатического смешения чайного листа и воды.
 */
export interface LeafWaterThermalMixingResult {
  /** Метрологический статус расчёта смешения */
  readonly status: LeafWaterMixingStatus;

  /**
   * Температура смеси после мгновенного адиабатического теплообмена, °C.
   * Равна null при status === 'unknown_leaf_specific_heat'.
   */
  readonly mixedTemperatureC: number | null;

  /**
   * Теплоёмкость содержимого сосуда (сухой лист + поглощённая влага + свободная вода) до смешения, Дж/К.
   * Равна null при status === 'unknown_leaf_specific_heat'.
   */
  readonly contentHeatCapacityBeforeMixingJPerK: number | null;

  /**
   * Теплоёмкость сухой матрицы чайного листа, Дж/К:
   * C_dry = m_leaf_kg * c_p,dry
   * Равна null при status === 'unknown_leaf_specific_heat'.
   */
  readonly dryLeafHeatCapacityJPerK: number | null;

  /**
   * Теплоёмкость влажной матрицы чайного листа (сухая матрица + поглощённая влага), Дж/К:
   * C_leaf = C_dry + m_abs_kg * c_p,water
   * Равна null при status === 'unknown_leaf_specific_heat'.
   */
  readonly wetLeafHeatCapacityJPerK: number | null;

  /**
   * Теплоёмкость добавляемой порции воды, Дж/К:
   * C_added = m_added_kg * c_p,water
   * Вычисляется всегда, так как зависит исключительно от массы воды и табличной константы c_p,water.
   */
  readonly addedWaterHeatCapacityJPerK: number;

  /**
   * Полная теплоёмкость содержимого сосуда после добавления воды, Дж/К:
   * C_after = C_before + C_added
   * Равна null при status === 'unknown_leaf_specific_heat'.
   */
  readonly contentHeatCapacityAfterMixingJPerK: number | null;

  /** Текстовое пояснение причины неопределённости при status !== 'calculated' */
  readonly reason?: string;

  /** Диагностические сообщения и применённые модельные допущения */
  readonly diagnostics: string[];
}

/**
 * Расчёт температуры мгновенного адиабатического смешения чайного листа и воды.
 *
 * ФИЗИЧЕСКАЯ МОДЕЛЬ И ДОПУЩЕНИЯ:
 * 1. Модель единой температуры содержимого:
 *    Перед добавлением новой порции воды чайный лист (с поглощённой им влагой) и уже находящаяся
 *    в сосуде свободная жидкость находятся в локальном термическом равновесии и имеют общую температуру
 *    contentTemperatureBeforeMixingC.
 * 2. Границы применимости:
 *    Формула взвешенного среднего применима в предположении постоянства удельных теплоёмкостей
 *    в интервале температур 0–100 °C и пренебрежимо малой энтальпии смачивания/сорбции по сравнению
 *    с макроскопической энтальпией горячей воды.
 * 3. Теплоёмкость влажного листа:
 *    C_leaf = m_leaf * c_p,dry + m_abs * c_p,water
 *    где массы выражаются в килограммах (1 г = 10^-3 кг).
 * 4. Теплоёмкость содержимого до смешения:
 *    C_before = C_leaf + m_free * c_p,water
 * 5. Теплоёмкость содержимого после добавления воды:
 *    C_after = C_before + m_added * c_p,water
 * 6. Температура после адиабатического смешения:
 *    T_mix = (C_before * T_before + C_added * T_added) / C_after
 *
 * ПРИНЦИП «UNKNOWN ≠ 0»:
 * При неизвестной удельной теплоёмкости сухого листа (origin: 'unknown' или null) расчёт
 * фиксирует status = 'unknown_leaf_specific_heat', а mixedTemperatureC, C_before и C_after
 * строго возвращаются как null без подстановки фиктивных или неявных значений.
 */
export function solveLeafWaterThermalMixing(
  params: LeafWaterThermalMixingParams
): LeafWaterThermalMixingResult {
  const diagnostics: string[] = [];

  // 1. Строгая валидация массы чайного листа
  if (
    typeof params.leafMassGrams !== 'number' ||
    !Number.isFinite(params.leafMassGrams) ||
    params.leafMassGrams <= 0
  ) {
    throw new ThermalValidationError(
      `Масса чайного листа должна быть конечным строго положительным числом (> 0 г): ${params.leafMassGrams} г.`,
      'INVALID_LEAF_MASS',
      'leafMassGrams',
      params.leafMassGrams
    );
  }

  // 2. Строгая валидация массы поглощённой воды
  if (
    typeof params.absorbedWaterGrams !== 'number' ||
    !Number.isFinite(params.absorbedWaterGrams) ||
    params.absorbedWaterGrams < 0
  ) {
    throw new ThermalValidationError(
      `Масса поглощённой листом воды должна быть конечным неотрицательным числом (>= 0 г): ${params.absorbedWaterGrams} г.`,
      'INVALID_ABSORBED_WATER_MASS',
      'absorbedWaterGrams',
      params.absorbedWaterGrams
    );
  }

  // 3. Строгая валидация массы уже находящейся в сосуде свободной воды
  if (
    typeof params.existingFreeWaterGrams !== 'number' ||
    !Number.isFinite(params.existingFreeWaterGrams) ||
    params.existingFreeWaterGrams < 0
  ) {
    throw new ThermalValidationError(
      `Масса свободной воды в сосуде должна быть конечным неотрицательным числом (>= 0 г): ${params.existingFreeWaterGrams} г.`,
      'INVALID_FREE_WATER_MASS',
      'existingFreeWaterGrams',
      params.existingFreeWaterGrams
    );
  }

  // 4. Строгая валидация массы добавляемой воды
  if (
    typeof params.addedWaterMassGrams !== 'number' ||
    !Number.isFinite(params.addedWaterMassGrams) ||
    params.addedWaterMassGrams <= 0
  ) {
    throw new ThermalValidationError(
      `Масса добавляемой воды должна быть конечным строго положительным числом (> 0 г): ${params.addedWaterMassGrams} г.`,
      'INVALID_ADDED_WATER_MASS',
      'addedWaterMassGrams',
      params.addedWaterMassGrams
    );
  }

  // 5. Строгая валидация температуры исходного содержимого
  if (
    typeof params.contentTemperatureBeforeMixingC !== 'number' ||
    !Number.isFinite(params.contentTemperatureBeforeMixingC) ||
    params.contentTemperatureBeforeMixingC < 0 ||
    params.contentTemperatureBeforeMixingC > 100
  ) {
    throw new ThermalRangeError(
      `Температура содержимого сосуда перед смешением (${params.contentTemperatureBeforeMixingC} °C) выходит за физические пределы жидкой фазы воды (0–100 °C).`,
      'contentTemperatureBeforeMixingC',
      params.contentTemperatureBeforeMixingC
    );
  }

  // 6. Строгая валидация температуры добавляемой воды
  if (
    typeof params.addedWaterTemperatureC !== 'number' ||
    !Number.isFinite(params.addedWaterTemperatureC) ||
    params.addedWaterTemperatureC < 0 ||
    params.addedWaterTemperatureC > 100
  ) {
    throw new ThermalRangeError(
      `Температура добавляемой воды (${params.addedWaterTemperatureC} °C) выходит за физические пределы жидкой фазы воды (0–100 °C).`,
      'addedWaterTemperatureC',
      params.addedWaterTemperatureC
    );
  }

  // 7. Строгая валидация объекта leafSpecificHeatCapacity
  if (
    !params.leafSpecificHeatCapacity ||
    typeof params.leafSpecificHeatCapacity !== 'object'
  ) {
    throw new ThermalValidationError(
      'Параметр leafSpecificHeatCapacity обязателен и должен быть объектом ValueWithOrigin<number>.',
      'INVALID_LEAF_SPECIFIC_HEAT_OBJECT',
      'leafSpecificHeatCapacity',
      params.leafSpecificHeatCapacity
    );
  }

  // Перевод масс воды в килограммы
  const mAddedKg = params.addedWaterMassGrams * 0.001;
  const addedWaterHeatCapacityJPerK = mAddedKg * SPECIFIC_HEAT_WATER_J_PER_KG_K;

  // 8. Проверка происхождения и определённости удельной теплоёмкости листа
  const cpLeafObj = params.leafSpecificHeatCapacity;

  if (
    cpLeafObj.origin === 'unknown' ||
    cpLeafObj.value === null ||
    cpLeafObj.value === undefined
  ) {
    diagnostics.push(
      'Удельная теплоёмкость чайного листа неизвестна (origin: unknown, Unknown ≠ 0).'
    );
    diagnostics.push(
      'Расчёт адиабатического смешения заблокирован: зависимые теплоёмкости и температура возвращены как null.'
    );

    return {
      status: 'unknown_leaf_specific_heat',
      mixedTemperatureC: null,
      contentHeatCapacityBeforeMixingJPerK: null,
      dryLeafHeatCapacityJPerK: null,
      wetLeafHeatCapacityJPerK: null,
      addedWaterHeatCapacityJPerK,
      contentHeatCapacityAfterMixingJPerK: null,
      reason:
        'Удельная изобарная теплоёмкость сухого листа неизвестна (Unknown ≠ 0). Подстановка скрытых значений по умолчанию запрещена.',
      diagnostics,
    };
  }

  // Если происхождение известно, значение обязано быть валидным числом > 0
  if (
    typeof cpLeafObj.value !== 'number' ||
    !Number.isFinite(cpLeafObj.value) ||
    cpLeafObj.value <= 0
  ) {
    throw new ThermalValidationError(
      `Известная удельная теплоёмкость листа должна быть конечным строго положительным числом (> 0 Дж/(кг·К)): ${cpLeafObj.value}.`,
      'INVALID_LEAF_SPECIFIC_HEAT_VALUE',
      'leafSpecificHeatCapacity.value',
      cpLeafObj.value
    );
  }

  // Проверка единиц измерения
  if (!cpLeafObj.unit || !VALID_SPECIFIC_HEAT_UNITS.has(cpLeafObj.unit.trim())) {
    throw new ThermalValidationError(
      `Недопустимая единица измерения удельной теплоёмкости листа: "${cpLeafObj.unit}". Ожидается Дж/(кг·К) или J/(kg·K).`,
      'INVALID_SPECIFIC_HEAT_UNIT',
      'leafSpecificHeatCapacity.unit',
      cpLeafObj.unit
    );
  }

  // 9. Перевод масс в килограммы и вычисление теплоёмкостей
  const mLeafKg = params.leafMassGrams * 0.001;
  const mAbsKg = params.absorbedWaterGrams * 0.001;
  const mFreeKg = params.existingFreeWaterGrams * 0.001;

  const cpDry = cpLeafObj.value;
  const cpWater = SPECIFIC_HEAT_WATER_J_PER_KG_K;

  // C_dry = m_leaf * cp_dry
  const dryLeafHeatCapacityJPerK = mLeafKg * cpDry;

  // C_leaf = C_dry + m_abs * cp_water
  const wetLeafHeatCapacityJPerK = dryLeafHeatCapacityJPerK + mAbsKg * cpWater;

  // C_free = m_free * cp_water
  const freeWaterHeatCapacityJPerK = mFreeKg * cpWater;

  // C_before = C_leaf + C_free
  const contentHeatCapacityBeforeMixingJPerK =
    wetLeafHeatCapacityJPerK + freeWaterHeatCapacityJPerK;

  // C_after = C_before + C_added
  const contentHeatCapacityAfterMixingJPerK =
    contentHeatCapacityBeforeMixingJPerK + addedWaterHeatCapacityJPerK;

  // 10. Расчёт температуры смеси по закону сохранения энтальпии
  // E_total = C_before * T_before + C_added * T_added
  // T_mix = E_total / C_after
  const energyBeforeJoules =
    contentHeatCapacityBeforeMixingJPerK * params.contentTemperatureBeforeMixingC;
  const energyAddedJoules =
    addedWaterHeatCapacityJPerK * params.addedWaterTemperatureC;
  const totalEnergyJoules = energyBeforeJoules + energyAddedJoules;

  const mixedTemperatureC = totalEnergyJoules / contentHeatCapacityAfterMixingJPerK;

  diagnostics.push(
    `Модельное допущение: перед смешением лист и свободная жидкость имеют общую температуру ${params.contentTemperatureBeforeMixingC} °C.`
  );
  diagnostics.push(
    `Массовая база: удельная теплоёмкость листа принята ${cpDry} ${cpLeafObj.unit} (origin: ${cpLeafObj.origin}) на массу навески ${params.leafMassGrams} г.`
  );
  diagnostics.push(
    `Теплоёмкость содержимого: до смешения ${contentHeatCapacityBeforeMixingJPerK.toFixed(4)} Дж/К, после добавления воды ${contentHeatCapacityAfterMixingJPerK.toFixed(4)} Дж/К.`
  );

  return {
    status: 'calculated',
    mixedTemperatureC,
    contentHeatCapacityBeforeMixingJPerK,
    dryLeafHeatCapacityJPerK,
    wetLeafHeatCapacityJPerK,
    addedWaterHeatCapacityJPerK,
    contentHeatCapacityAfterMixingJPerK,
    diagnostics,
  };
}
