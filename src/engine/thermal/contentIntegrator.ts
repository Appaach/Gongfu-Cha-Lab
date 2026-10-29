/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
  DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
  MIN_INTEGRATOR_TIME_STEP_SECONDS,
  MAX_INTEGRATOR_TIME_STEP_SECONDS,
} from './constants.ts';
import {
  ThermalValidationError,
  ThermalRangeError,
  ThermalInstabilityError,
} from './errors.ts';
import {
  ContentThermalStatus,
  ContentThermalState,
  DrainedContentConductanceOptions,
  ContentThermalSimulationPoint,
  ContentIntegrationStepResult,
  VesselThermalProfile,
} from './types.ts';
import { DataOriginType, ValueWithOrigin } from '../../domain/tea/types.ts';

import {
  VALID_DATA_ORIGINS,
  VALID_SPECIFIC_HEAT_UNITS,
} from './leafWaterMixing.ts';

/**
 * Допустимые единицы измерения эффективной тепловой проводимости.
 */
export const VALID_THERMAL_CONDUCTANCE_UNITS = new Set([
  'W/K',
  'Вт/К',
  'W/(K)',
  'Вт/(К)',
  'J/(s·K)',
  'Дж/(с·К)',
  'J/(s*K)',
  'Дж/(с*К)',
]);

/**
 * Численный интегратор теплового баланса узла содержимого (чайный лист + вода) и стенок сосуда.
 *
 * ФИЗИЧЕСКАЯ МОДЕЛЬ И ДОПУЩЕНИЯ:
 * 1. Модель сосредоточенной ёмкости содержимого (Lumped Content Capacitance):
 *    Содержимое заварочного сосуда (сухая матрица листа, поглощённая листом влага и свободная вода)
 *    рассматривается как термодинамически единый узел с общей температурой contentTemperatureC.
 *    C_contents = m_leaf * cp_leaf + (m_absorbed + m_free) * cp_water [Дж/К],
 *    где все массы выражаются в килограммах (г * 10^-3).
 *
 * 2. Разделение режимов теплоотдачи:
 *    - Режим А (свободная вода присутствует, freeWaterMassGrams > 0):
 *      Свободная вода доминирует по площади смачивания и зеркала. Эффективные проводимости
 *      содержимого принимаются равными проводимостям жидкой фазы профиля сосуда:
 *      G_cv = conductanceLiquidVesselWPerK, G_ca = conductanceLiquidAmbientWPerK.
 *      liquidTemperatureC === contentTemperatureC.
 *    - Режим Б (свободная вода отсутствует, freeWaterMassGrams === 0):
 *      Свободной жидкости нет, на дне сосуда остаётся влажный чайный лист.
 *      liquidTemperatureC strictly = null (Unknown ≠ 0: температура несуществующей свободной жидкости не существует).
 *      Проводимости жидкой фазы неприменимы! Требуются явные параметры conductanceDrainedContentVesselWPerK
 *      и conductanceDrainedContentAmbientWPerK. Если они не заданы или unknown, расчёт блокируется
 *      со статусом unknown_drained_conductance (подстановка скрытого нуля или адиабатической изоляции запрещена).
 *
 * 3. Численный метод:
 *    Явная двухстадийная схема Рунге-Кутты 2-го порядка (метод Хойна / RK2).
 *    Устойчивость проверяется динамически по максимальному собственному значению системы:
 *    dt < 2 / |lambda_max|.
 *
 * 4. Контракт заблокированного состояния (Blocked State Reliability, Этап 2B.3.3.2.1):
 *    При блокировке интервала положительной длительности (durationSeconds > 0) из-за неизвестного
 *    предшествующего состояния, удельной теплоёмкости, масс или проводимостей конечная температура
 *    стенок vesselTemperatureC строго возвращается как null, а minVesselTempC и maxVesselTempC
 *    равны null, исключая ложную видимость известной температуры стенок.
 */
export function integrateContentThermalStep(
  initialState: ContentThermalState,
  profile: VesselThermalProfile,
  drainedOptions?: DrainedContentConductanceOptions,
  durationSeconds = 0,
  timeStepSeconds: number = DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
  samplingIntervalSeconds = 1.0
): ContentIntegrationStepResult {
  const warnings: string[] = [];
  const diagnostics: string[] = [];

  // =========================================================================
  // 1. Строгая валидация независимых входных параметров
  // =========================================================================

  // 1.1. Длительность шага
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new ThermalValidationError(
      `Длительность шага интегрирования не может быть отрицательной или NaN: ${durationSeconds} с.`,
      'INVALID_DURATION',
      'durationSeconds',
      durationSeconds
    );
  }

  // 1.2. Временная метка состояния (Этап 2B.3.3.2.1)
  if (
    typeof initialState.elapsedSeconds !== 'number' ||
    !Number.isFinite(initialState.elapsedSeconds) ||
    initialState.elapsedSeconds < 0
  ) {
    throw new ThermalValidationError(
      `Время начального состояния elapsedSeconds должно быть конечным неотрицательным числом: ${initialState.elapsedSeconds}.`,
      'INVALID_ELAPSED_SECONDS',
      'elapsedSeconds',
      initialState.elapsedSeconds
    );
  }

  const projectedElapsedSeconds = initialState.elapsedSeconds + durationSeconds;
  if (
    !Number.isFinite(projectedElapsedSeconds) ||
    projectedElapsedSeconds > Number.MAX_SAFE_INTEGER
  ) {
    throw new ThermalValidationError(
      `Итоговое время после интегрирования (${projectedElapsedSeconds}) превышает Number.MAX_SAFE_INTEGER или теряет конечность.`,
      'ELAPSED_SECONDS_OVERFLOW',
      'elapsedSeconds',
      projectedElapsedSeconds
    );
  }

  // 1.3. Профиль сосуда
  if (!Number.isFinite(profile.vesselMassGrams) || profile.vesselMassGrams <= 0) {
    throw new ThermalValidationError(
      `Масса сосуда должна быть положительным числом: ${profile.vesselMassGrams} г.`,
      'INVALID_VESSEL_MASS',
      'profile.vesselMassGrams',
      profile.vesselMassGrams
    );
  }
  if (!Number.isFinite(profile.materialSpecificHeatJPerKgK) || profile.materialSpecificHeatJPerKgK <= 0) {
    throw new ThermalValidationError(
      `Удельная теплоёмкость материала посуды должна быть положительной: ${profile.materialSpecificHeatJPerKgK} Дж/(кг·К).`,
      'INVALID_SPECIFIC_HEAT',
      'profile.materialSpecificHeatJPerKgK',
      profile.materialSpecificHeatJPerKgK
    );
  }
  if (!Number.isFinite(profile.conductanceLiquidVesselWPerK) || profile.conductanceLiquidVesselWPerK < 0) {
    throw new ThermalValidationError(
      `Проводимость жидкость-сосуд должна быть конечным неотрицательным числом: ${profile.conductanceLiquidVesselWPerK} Вт/К.`,
      'INVALID_CONDUCTANCE',
      'conductanceLiquidVesselWPerK',
      profile.conductanceLiquidVesselWPerK
    );
  }
  if (!Number.isFinite(profile.conductanceVesselAmbientWPerK) || profile.conductanceVesselAmbientWPerK < 0) {
    throw new ThermalValidationError(
      `Проводимость сосуд-воздух должна быть конечным неотрицательным числом: ${profile.conductanceVesselAmbientWPerK} Вт/К.`,
      'INVALID_CONDUCTANCE',
      'conductanceVesselAmbientWPerK',
      profile.conductanceVesselAmbientWPerK
    );
  }
  if (!Number.isFinite(profile.conductanceLiquidAmbientWPerK) || profile.conductanceLiquidAmbientWPerK < 0) {
    throw new ThermalValidationError(
      `Проводимость жидкость-воздух должна быть конечным неотрицательным числом: ${profile.conductanceLiquidAmbientWPerK} Вт/К.`,
      'INVALID_CONDUCTANCE',
      'conductanceLiquidAmbientWPerK',
      profile.conductanceLiquidAmbientWPerK
    );
  }

  // 1.4. Температуры стенок и окружающей среды
  if (
    !Number.isFinite(initialState.ambientTemperatureC) ||
    initialState.ambientTemperatureC < -50 ||
    initialState.ambientTemperatureC > 80
  ) {
    throw new ThermalValidationError(
      `Температура окружающей среды (${initialState.ambientTemperatureC} °C) выходит за физически допустимые пределы помещения (-50..+80 °C).`,
      'INVALID_AMBIENT_TEMPERATURE',
      'ambientTemperatureC',
      initialState.ambientTemperatureC
    );
  }
  if (initialState.vesselTemperatureC !== null) {
    if (
      typeof initialState.vesselTemperatureC !== 'number' ||
      !Number.isFinite(initialState.vesselTemperatureC) ||
      initialState.vesselTemperatureC < -50 ||
      initialState.vesselTemperatureC > 200
    ) {
      throw new ThermalValidationError(
        `Температура стенок сосуда (${initialState.vesselTemperatureC} °C) выходит за физически допустимые пределы (-50..+200 °C).`,
        'INVALID_VESSEL_TEMPERATURE',
        'vesselTemperatureC',
        initialState.vesselTemperatureC
      );
    }
  }

  // 1.5. Масса листа
  if (
    typeof initialState.leafMassGrams !== 'number' ||
    !Number.isFinite(initialState.leafMassGrams) ||
    initialState.leafMassGrams <= 0
  ) {
    throw new ThermalValidationError(
      `Масса чайного листа должна быть конечным строго положительным числом (> 0 г): ${initialState.leafMassGrams} г.`,
      'INVALID_LEAF_MASS',
      'leafMassGrams',
      initialState.leafMassGrams
    );
  }

  // 1.6. Массы воды при наличии значений (не null)
  if (initialState.absorbedWaterGrams !== null) {
    if (
      typeof initialState.absorbedWaterGrams !== 'number' ||
      !Number.isFinite(initialState.absorbedWaterGrams) ||
      initialState.absorbedWaterGrams < 0
    ) {
      throw new ThermalValidationError(
        `Масса поглощённой листом воды должна быть конечным неотрицательным числом (>= 0 г): ${initialState.absorbedWaterGrams} г.`,
        'INVALID_ABSORBED_WATER_MASS',
        'absorbedWaterGrams',
        initialState.absorbedWaterGrams
      );
    }
  }

  if (initialState.freeWaterMassGrams !== null) {
    if (
      typeof initialState.freeWaterMassGrams !== 'number' ||
      !Number.isFinite(initialState.freeWaterMassGrams) ||
      initialState.freeWaterMassGrams < 0
    ) {
      throw new ThermalValidationError(
        `Масса свободной жидкости должна быть конечным неотрицательным числом (>= 0 г): ${initialState.freeWaterMassGrams} г.`,
        'INVALID_FREE_WATER_MASS',
        'freeWaterMassGrams',
        initialState.freeWaterMassGrams
      );
    }
  }

  // 1.7. Температура содержимого при наличии значения (не null)
  if (initialState.contentTemperatureC !== null) {
    if (
      typeof initialState.contentTemperatureC !== 'number' ||
      !Number.isFinite(initialState.contentTemperatureC) ||
      initialState.contentTemperatureC < 0 ||
      initialState.contentTemperatureC > 100
    ) {
      throw new ThermalRangeError(
        `Температура содержимого (${initialState.contentTemperatureC} °C) выходит за пределы жидкой воды при атмосферном давлении (0–100 °C).`,
        'contentTemperatureC',
        initialState.contentTemperatureC
      );
    }
  }

  // 1.8. Согласованность производной температуры жидкости (Этап 2B.3.3.2.1)
  if (initialState.freeWaterMassGrams === 0 && initialState.liquidTemperatureC !== null) {
    throw new ThermalValidationError(
      `Несогласованность температур: при отсутствии свободной жидкости (freeWaterMassGrams === 0) liquidTemperatureC обязана быть строго null (получено: ${initialState.liquidTemperatureC} °C).`,
      'LIQUID_TEMPERATURE_FREE_WATER_MISMATCH',
      'liquidTemperatureC',
      initialState.liquidTemperatureC
    );
  }
  if (initialState.freeWaterMassGrams === null && initialState.liquidTemperatureC !== null) {
    throw new ThermalValidationError(
      `Несогласованность температур: при неизвестной массе свободной воды (freeWaterMassGrams === null) liquidTemperatureC обязана быть строго null (получено: ${initialState.liquidTemperatureC} °C).`,
      'LIQUID_TEMPERATURE_FREE_WATER_MISMATCH',
      'liquidTemperatureC',
      initialState.liquidTemperatureC
    );
  }
  if (initialState.contentTemperatureC === null && initialState.liquidTemperatureC !== null) {
    throw new ThermalValidationError(
      `Несогласованность температур: при неизвестной температуре содержимого (contentTemperatureC === null) liquidTemperatureC обязана быть строго null (получено: ${initialState.liquidTemperatureC} °C).`,
      'LIQUID_TEMPERATURE_CONTENT_MISMATCH',
      'liquidTemperatureC',
      initialState.liquidTemperatureC
    );
  }
  if (
    initialState.freeWaterMassGrams !== null &&
    initialState.freeWaterMassGrams > 0 &&
    initialState.contentTemperatureC !== null
  ) {
    if (initialState.liquidTemperatureC === null) {
      throw new ThermalValidationError(
        'Несогласованность температур: при наличии свободной воды liquidTemperatureC не может быть null и обязана соответствовать температуре содержимого.',
        'LIQUID_TEMPERATURE_CONTENT_MISMATCH',
        'liquidTemperatureC',
        initialState.liquidTemperatureC
      );
    }
    if (
      typeof initialState.liquidTemperatureC !== 'number' ||
      !Number.isFinite(initialState.liquidTemperatureC) ||
      Math.abs(initialState.liquidTemperatureC - initialState.contentTemperatureC) > 1e-4
    ) {
      throw new ThermalValidationError(
        `Несогласованность температур: в модели единого узла liquidTemperatureC (${initialState.liquidTemperatureC} °C) обязана совпадать с contentTemperatureC (${initialState.contentTemperatureC} °C).`,
        'LIQUID_TEMPERATURE_CONTENT_MISMATCH',
        'liquidTemperatureC',
        initialState.liquidTemperatureC
      );
    }
  }

  // 1.9. Объект удельной теплоёмкости листа
  if (
    !initialState.leafSpecificHeatCapacity ||
    typeof initialState.leafSpecificHeatCapacity !== 'object'
  ) {
    throw new ThermalValidationError(
      'Параметр leafSpecificHeatCapacity обязателен и должен быть объектом ValueWithOrigin<number>.',
      'INVALID_LEAF_SPECIFIC_HEAT_OBJECT',
      'leafSpecificHeatCapacity',
      initialState.leafSpecificHeatCapacity
    );
  }

  const cpLeafObj = initialState.leafSpecificHeatCapacity;

  if (
    typeof cpLeafObj.origin !== 'string' ||
    !VALID_DATA_ORIGINS.has(cpLeafObj.origin as DataOriginType)
  ) {
    throw new ThermalValidationError(
      `Недопустимый статус происхождения удельной теплоёмкости листа: "${cpLeafObj.origin}".`,
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN',
      'leafSpecificHeatCapacity.origin',
      cpLeafObj.origin
    );
  }

  if (
    typeof cpLeafObj.unit !== 'string' ||
    !VALID_SPECIFIC_HEAT_UNITS.has(cpLeafObj.unit.trim())
  ) {
    throw new ThermalValidationError(
      `Недопустимая единица измерения удельной теплоёмкости листа: ${typeof cpLeafObj.unit === 'string' ? `"${cpLeafObj.unit}"` : cpLeafObj.unit}. Ожидается Дж/(кг·К) или J/(kg·K).`,
      'INVALID_SPECIFIC_HEAT_UNIT',
      'leafSpecificHeatCapacity.unit',
      cpLeafObj.unit
    );
  }

  // Инвариант согласованности origin и value (Этап 2B.3.3.1.2)
  if (cpLeafObj.origin === 'unknown' && cpLeafObj.value !== null) {
    throw new ThermalValidationError(
      `Несогласованность метаданных: при origin === 'unknown' значение value обязано быть строго null (получено: ${cpLeafObj.value}).`,
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN_VALUE_MISMATCH',
      'leafSpecificHeatCapacity.value',
      cpLeafObj.value
    );
  }

  if (cpLeafObj.origin !== 'unknown' && cpLeafObj.value !== null) {
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
  }

  // 1.10. Шаг интегрирования и интервал дискретизации
  if (
    !Number.isFinite(timeStepSeconds) ||
    timeStepSeconds < MIN_INTEGRATOR_TIME_STEP_SECONDS ||
    timeStepSeconds > MAX_INTEGRATOR_TIME_STEP_SECONDS
  ) {
    throw new ThermalValidationError(
      `Шаг численного интегрирования (${timeStepSeconds} с) выходит за допустимый диапазон [${MIN_INTEGRATOR_TIME_STEP_SECONDS}, ${MAX_INTEGRATOR_TIME_STEP_SECONDS}] с.`,
      'INVALID_TIME_STEP',
      'timeStepSeconds',
      timeStepSeconds
    );
  }

  if (!Number.isFinite(samplingIntervalSeconds) || samplingIntervalSeconds <= 0) {
    throw new ThermalValidationError(
      `Интервал дискретизации точек кривой должен быть конечным строго положительным числом (> 0 с): ${samplingIntervalSeconds} с.`,
      'INVALID_SAMPLING_INTERVAL',
      'samplingIntervalSeconds',
      samplingIntervalSeconds
    );
  }

  // Вспомогательная функция для формирования заблокированного результата (Этап 2B.3.3.2.1)
  const createBlockedResult = (
    status: ContentThermalStatus,
    reason: string,
    cContents: number | null = null,
    cDry: number | null = null,
    cWet: number | null = null,
    cFree: number | null = null
  ): ContentIntegrationStepResult => {
    diagnostics.push(reason);

    const isZeroDuration = durationSeconds === 0;
    // При durationSeconds === 0 физический интервал времени отсутствует:
    // если начальная температура стенок была известна, она не изменилась.
    // При durationSeconds > 0 перенос тепла не был рассчитан: конечная температура
    // стенок неизвестна и строго возвращается как null!
    const finalVesselTemp = isZeroDuration ? initialState.vesselTemperatureC : null;
    const minVessel = isZeroDuration ? initialState.vesselTemperatureC : null;
    const maxVessel = isZeroDuration ? initialState.vesselTemperatureC : null;

    const curvePoints: ContentThermalSimulationPoint[] = isZeroDuration
      ? [
          {
            timeSeconds: 0,
            contentTemperatureC: null,
            liquidTemperatureC: null,
            vesselTemperatureC: initialState.vesselTemperatureC,
            freeWaterMassGrams: initialState.freeWaterMassGrams,
          },
        ]
      : [];

    return {
      status,
      finalState: {
        ...initialState,
        contentTemperatureC: null,
        liquidTemperatureC: null,
        vesselTemperatureC: finalVesselTemp,
        elapsedSeconds: projectedElapsedSeconds,
      },
      curvePoints,
      contentHeatCapacityJPerK: cContents,
      dryLeafHeatCapacityJPerK: cDry,
      wetLeafHeatCapacityJPerK: cWet,
      freeWaterHeatCapacityJPerK: cFree,
      minContentTempC: null,
      maxContentTempC: null,
      minLiquidTempC: null,
      maxLiquidTempC: null,
      minVesselTempC: minVessel,
      maxVesselTempC: maxVessel,
      reason,
      warnings,
      diagnostics,
    };
  };

  // =========================================================================
  // 2. Проверка условий блокировки расчёта (Unknown ≠ 0)
  // =========================================================================

  // 2.1. Предшествующее состояние стенок сосуда не определено (Этап 2B.3.3.2.1)
  if (initialState.vesselTemperatureC === null) {
    return createBlockedResult(
      'blocked_by_unknown_prior_state',
      'Температура стенок сосуда в начальном состоянии не определена (null). Интегрирование заблокировано.'
    );
  }

  // 2.2. Предшествующее температурное состояние содержимого не определено
  if (initialState.contentTemperatureC === null) {
    return createBlockedResult(
      'blocked_by_unknown_prior_state',
      'Температура содержимого в начальном состоянии не определена (null). Интегрирование заблокировано.'
    );
  }

  // 2.3. Массы водного баланса не определены
  if (
    initialState.absorbedWaterGrams === null ||
    initialState.freeWaterMassGrams === null
  ) {
    return createBlockedResult(
      'unknown_water_masses',
      'Масса поглощённой или свободной воды неизвестна (null). Расчёт теплоёмкости и интегрирование заблокированы.'
    );
  }

  // 2.4. Удельная теплоёмкость листа не определена
  if (cpLeafObj.origin === 'unknown' || cpLeafObj.value === null) {
    return createBlockedResult(
      'unknown_leaf_specific_heat',
      'Удельная изобарная теплоёмкость сухого листа неизвестна (Unknown ≠ 0). Подстановка скрытых значений запрещена.'
    );
  }

  // =========================================================================
  // 3. Расчёт теплоёмкостей содержимого и сосуда
  // =========================================================================

  const mLeafKg = initialState.leafMassGrams * 0.001;
  const mAbsKg = initialState.absorbedWaterGrams * 0.001;
  const mFreeKg = initialState.freeWaterMassGrams * 0.001;

  const cpDry = cpLeafObj.value;
  const cpWater = SPECIFIC_HEAT_WATER_J_PER_KG_K;

  // C_dry = m_leaf * cp_leaf
  const dryLeafHeatCapacityJPerK = mLeafKg * cpDry;

  // C_leaf = C_dry + m_abs * cp_water
  const wetLeafHeatCapacityJPerK = dryLeafHeatCapacityJPerK + mAbsKg * cpWater;

  // C_free = m_free * cp_water
  const freeWaterHeatCapacityJPerK = mFreeKg * cpWater;

  // C_contents = C_leaf + C_free
  const contentHeatCapacityJPerK = wetLeafHeatCapacityJPerK + freeWaterHeatCapacityJPerK;

  // Теплоёмкость стенок сосуда
  const vesselMassKg = profile.vesselMassGrams * 0.001;
  const cVessel = vesselMassKg * profile.materialSpecificHeatJPerKgK;

  if (contentHeatCapacityJPerK <= 0) {
    throw new ThermalValidationError(
      `Суммарная теплоёмкость содержимого должна быть строго положительной: ${contentHeatCapacityJPerK} Дж/К.`,
      'INVALID_CONTENT_HEAT_CAPACITY',
      'contentHeatCapacityJPerK',
      contentHeatCapacityJPerK
    );
  }

  // =========================================================================
  // 4. Определение проводимостей теплообмена (Режимы А и Б)
  // =========================================================================

  let gCv = 0;
  let gCa = 0;
  const gVa = profile.conductanceVesselAmbientWPerK;

  if (initialState.freeWaterMassGrams > 0) {
    // РЕЖИМ А: Свободная вода присутствует
    gCv = profile.conductanceLiquidVesselWPerK;
    gCa = profile.conductanceLiquidAmbientWPerK;

    diagnostics.push(
      'Режим А (со свободной водой): узел содержимого рассматривается как квазиоднородная среда с проводимостями жидкой фазы профиля сосуда.'
    );
  } else {
    // РЕЖИМ Б: Свободная вода отсутствует (freeWaterMassGrams === 0)
    // Требуются явные параметры проводимостей осушенного содержимого
    if (drainedOptions === undefined) {
      return createBlockedResult(
        'unknown_drained_conductance',
        'В режиме без свободной воды (сосуд слит/осушен) коэффициенты теплоотдачи мокрого листа не заданы. Скрытое применение жидкостных проводимостей запрещено.',
        contentHeatCapacityJPerK,
        dryLeafHeatCapacityJPerK,
        wetLeafHeatCapacityJPerK,
        freeWaterHeatCapacityJPerK
      );
    }

    if (drainedOptions === null || typeof drainedOptions !== 'object') {
      throw new ThermalValidationError(
        'Параметр drainedOptions должен быть объектом DrainedContentConductanceOptions.',
        'INVALID_DRAINED_OPTIONS_OBJECT',
        'drainedOptions',
        drainedOptions
      );
    }

    // Валидация свойств проводимости осушенного содержимого (Этап 2B.3.3.2.1)
    const validateConductanceProp = (
      prop: unknown,
      fieldName: string
    ): void => {
      if (prop === undefined) {
        return; // Отсутствующее свойство трактуется как unknown conductance
      }
      if (prop === null || typeof prop !== 'object') {
        throw new ThermalValidationError(
          `Параметр ${fieldName} должен быть объектом ValueWithOrigin<number>.`,
          'INVALID_CONDUCTANCE_OBJECT',
          fieldName,
          prop
        );
      }
      const obj = prop as ValueWithOrigin<number>;
      if (
        typeof obj.origin !== 'string' ||
        !VALID_DATA_ORIGINS.has(obj.origin as DataOriginType)
      ) {
        throw new ThermalValidationError(
          `Недопустимый статус происхождения для ${fieldName}: "${obj.origin}".`,
          'INVALID_CONDUCTANCE_ORIGIN',
          `${fieldName}.origin`,
          obj.origin
        );
      }
      if (
        typeof obj.unit !== 'string' ||
        !VALID_THERMAL_CONDUCTANCE_UNITS.has(obj.unit.trim())
      ) {
        throw new ThermalValidationError(
          `Недопустимая единица измерения для ${fieldName}: "${obj.unit}". Ожидается Вт/К или W/K.`,
          'INVALID_CONDUCTANCE_UNIT',
          `${fieldName}.unit`,
          obj.unit
        );
      }
      if (obj.origin === 'unknown' && obj.value !== null) {
        throw new ThermalValidationError(
          `Несогласованность метаданных: при origin === 'unknown' значение value обязано быть строго null для ${fieldName}.`,
          'INVALID_CONDUCTANCE_ORIGIN_VALUE_MISMATCH',
          `${fieldName}.value`,
          obj.value
        );
      }
      if (obj.origin !== 'unknown' && obj.value !== null) {
        if (typeof obj.value !== 'number' || !Number.isFinite(obj.value) || obj.value < 0) {
          throw new ThermalValidationError(
            `Известный коэффициент проводимости ${fieldName} должен быть конечным неотрицательным числом (>= 0 Вт/К): ${obj.value}.`,
            'INVALID_CONDUCTANCE',
            `${fieldName}.value`,
            obj.value
          );
        }
      }
    };

    const gDrainedVesselProp = drainedOptions.conductanceDrainedContentVesselWPerK;
    const gDrainedAmbientProp = drainedOptions.conductanceDrainedContentAmbientWPerK;

    validateConductanceProp(gDrainedVesselProp, 'conductanceDrainedContentVesselWPerK');
    validateConductanceProp(gDrainedAmbientProp, 'conductanceDrainedContentAmbientWPerK');

    // Если хотя бы одна проводимость не задана (undefined) или неизвестна (origin: unknown / value: null)
    if (
      gDrainedVesselProp === undefined ||
      gDrainedAmbientProp === undefined ||
      gDrainedVesselProp.origin === 'unknown' ||
      gDrainedVesselProp.value === null ||
      gDrainedAmbientProp.origin === 'unknown' ||
      gDrainedAmbientProp.value === null
    ) {
      return createBlockedResult(
        'unknown_drained_conductance',
        'В режиме без свободной воды коэффициенты теплоотдачи мокрого листа объявлены как неизвестные или не переданы. Подстановка 0 Вт/К или жидкостных проводимостей запрещена.',
        contentHeatCapacityJPerK,
        dryLeafHeatCapacityJPerK,
        wetLeafHeatCapacityJPerK,
        freeWaterHeatCapacityJPerK
      );
    }

    gCv = gDrainedVesselProp.value;
    gCa = gDrainedAmbientProp.value;

    diagnostics.push(
      `Режим Б (без свободной воды): применены заданные проводимости влажного осадка листа (G_contents_vessel = ${gCv} ${gDrainedVesselProp.unit}, G_contents_ambient = ${gCa} ${gDrainedAmbientProp.unit}).`
    );
  }

  // =========================================================================
  // 5. Инициализация переменных интегрирования и краевые условия
  // =========================================================================

  let tContents = initialState.contentTemperatureC;
  let tVessel = initialState.vesselTemperatureC;
  const tAmbient = initialState.ambientTemperatureC;
  const isFreeWaterPresent = initialState.freeWaterMassGrams > 0;

  const curvePoints: ContentThermalSimulationPoint[] = [];

  // Начальная точка
  curvePoints.push({
    timeSeconds: 0,
    contentTemperatureC: Math.round(tContents * 100) / 100,
    liquidTemperatureC: isFreeWaterPresent ? Math.round(tContents * 100) / 100 : null,
    vesselTemperatureC: Math.round(tVessel * 100) / 100,
    freeWaterMassGrams: initialState.freeWaterMassGrams,
  });

  if (durationSeconds === 0) {
    return {
      status: 'calculated',
      finalState: {
        ...initialState,
        contentTemperatureC: tContents,
        liquidTemperatureC: isFreeWaterPresent ? tContents : null,
        vesselTemperatureC: tVessel,
        elapsedSeconds: projectedElapsedSeconds,
      },
      curvePoints,
      contentHeatCapacityJPerK,
      dryLeafHeatCapacityJPerK,
      wetLeafHeatCapacityJPerK,
      freeWaterHeatCapacityJPerK,
      minContentTempC: tContents,
      maxContentTempC: tContents,
      minLiquidTempC: isFreeWaterPresent ? tContents : null,
      maxLiquidTempC: isFreeWaterPresent ? tContents : null,
      minVesselTempC: tVessel,
      maxVesselTempC: tVessel,
      warnings,
      diagnostics,
    };
  }

  // =========================================================================
  // 6. Проверка численной устойчивости явной схемы Хойна (RK2)
  // =========================================================================

  let maxStableDtSeconds = Infinity;

  // Расчёт матрицы линейной системы ОДУ:
  // dTc/dt = - (gCv + gCa)/Cc * Tc + gCv/Cc * Tv + gCa/Cc * Ta
  // dTv/dt =   gCv/Cv * Tc - (gCv + gVa)/Cv * Tv + gVa/Cv * Ta
  const a11 = (gCv + gCa) / contentHeatCapacityJPerK;
  const a22 = (gCv + gVa) / cVessel;
  const a12a21 = (gCv * gCv) / (contentHeatCapacityJPerK * cVessel);

  const trace = a11 + a22;
  const discr = Math.max(0, (a11 - a22) * (a11 - a22) + 4 * a12a21);
  const lambdaMaxAbs = (trace + Math.sqrt(discr)) / 2;

  if (lambdaMaxAbs > 0) {
    maxStableDtSeconds = 2.0 / lambdaMaxAbs;
  }

  if (timeStepSeconds >= maxStableDtSeconds) {
    throw new ThermalInstabilityError(
      `Выбранный шаг численного интегрирования (${timeStepSeconds} с) достигает или превышает критический предел устойчивости схемы Хойна (${maxStableDtSeconds.toFixed(4)} с, tau_min = ${(maxStableDtSeconds / 2).toFixed(4)} с). Скрытое ограничение шага запрещено.`,
      timeStepSeconds,
      maxStableDtSeconds
    );
  }

  // =========================================================================
  // 7. Численное интегрирование по схеме Хойна (RK2)
  // =========================================================================

  const dt = timeStepSeconds;
  let currentTime = 0;
  let nextSampleTime = samplingIntervalSeconds;

  let minContent = tContents;
  let maxContent = tContents;
  let minVessel = tVessel;
  let maxVessel = tVessel;

  // Физические границы пассивной тепловой системы (второе начало термодинамики)
  const lowerBound = Math.min(tContents, tVessel, tAmbient);
  const upperBound = Math.max(tContents, tVessel, tAmbient);

  const computeDerivatives = (tc: number, tv: number): { dTc: number; dTv: number } => {
    const heatFluxToVessel = gCv * (tc - tv);
    const heatFluxToAmbient = gCa * (tc - tAmbient);
    const dTc = (-heatFluxToVessel - heatFluxToAmbient) / contentHeatCapacityJPerK;

    const heatFluxVesselToAmbient = gVa * (tv - tAmbient);
    const dTv = (heatFluxToVessel - heatFluxVesselToAmbient) / cVessel;

    return { dTc, dTv };
  };

  while (currentTime < durationSeconds) {
    const step = Math.min(dt, durationSeconds - currentTime);

    // Стадия 1: Предиктор (явный шаг Эйлера)
    const k1 = computeDerivatives(tContents, tVessel);

    const tcPredict = tContents + step * k1.dTc;
    const tvPredict = tVessel + step * k1.dTv;

    // Контроль прогнозного состояния (Predictor)
    if (
      !Number.isFinite(tcPredict) ||
      !Number.isFinite(tvPredict) ||
      tcPredict < lowerBound - 1e-4 ||
      tcPredict > upperBound + 1e-4 ||
      tvPredict < lowerBound - 1e-4 ||
      tvPredict > upperBound + 1e-4
    ) {
      throw new ThermalInstabilityError(
        `Численная нестабильность схемы при dt=${step} с: прогнозная температура содержимого tcPredict (${tcPredict} °C) или стенок tvPredict (${tvPredict} °C) вышла за физические границы [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] °C или потеряла конечность. Скрытая коррекция запрещена.`,
        step,
        maxStableDtSeconds
      );
    }

    // Стадия 2: Корректор (схема Хойна / метод трапеций)
    const k2 = computeDerivatives(tcPredict, tvPredict);

    tContents += (step / 2) * (k1.dTc + k2.dTc);
    tVessel += (step / 2) * (k1.dTv + k2.dTv);

    // Контроль итогового состояния после корректора (Corrector)
    if (
      !Number.isFinite(tContents) ||
      !Number.isFinite(tVessel) ||
      tContents < lowerBound - 1e-4 ||
      tContents > upperBound + 1e-4 ||
      tVessel < lowerBound - 1e-4 ||
      tVessel > upperBound + 1e-4
    ) {
      throw new ThermalInstabilityError(
        `Численная нестабильность схемы при dt=${step} с: скорректированная температура содержимого (${tContents} °C) или стенок (${tVessel} °C) вышла за физические границы [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] °C или потеряла конечность. Скрытая коррекция запрещена.`,
        step,
        maxStableDtSeconds
      );
    }

    currentTime += step;

    minContent = Math.min(minContent, tContents);
    maxContent = Math.max(maxContent, tContents);
    minVessel = Math.min(minVessel, tVessel);
    maxVessel = Math.max(maxVessel, tVessel);

    if (currentTime >= nextSampleTime || currentTime >= durationSeconds - 1e-6) {
      curvePoints.push({
        timeSeconds: Math.round(currentTime * 10) / 10,
        contentTemperatureC: Math.round(tContents * 100) / 100,
        liquidTemperatureC: isFreeWaterPresent ? Math.round(tContents * 100) / 100 : null,
        vesselTemperatureC: Math.round(tVessel * 100) / 100,
        freeWaterMassGrams: initialState.freeWaterMassGrams,
      });
      nextSampleTime += samplingIntervalSeconds;
    }
  }

  diagnostics.push(
    `Интегрирование выполнено успешно на интервале ${durationSeconds} с (шаг dt = ${dt} с, C_contents = ${contentHeatCapacityJPerK.toFixed(2)} Дж/К, C_vessel = ${cVessel.toFixed(2)} Дж/К).`
  );

  return {
    status: 'calculated',
    finalState: {
      ...initialState,
      contentTemperatureC: tContents,
      liquidTemperatureC: isFreeWaterPresent ? tContents : null,
      vesselTemperatureC: tVessel,
      elapsedSeconds: projectedElapsedSeconds,
    },
    curvePoints,
    contentHeatCapacityJPerK,
    dryLeafHeatCapacityJPerK,
    wetLeafHeatCapacityJPerK,
    freeWaterHeatCapacityJPerK,
    minContentTempC: minContent,
    maxContentTempC: maxContent,
    minLiquidTempC: isFreeWaterPresent ? minContent : null,
    maxLiquidTempC: isFreeWaterPresent ? maxContent : null,
    minVesselTempC: minVessel,
    maxVesselTempC: maxVessel,
    warnings,
    diagnostics,
  };
}
