/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GongfuSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample, ValueWithOrigin, DataOriginType } from '../../domain/tea/types.ts';
import {
  CoupledGongfuSimulationOptions,
  CoupledGongfuSimulationResult,
  CoupledGongfuStepResult,
  CoupledGongfuStepStatus,
  CoupledGongfuSessionStatus,
  ContentThermalState,
  DrainedContentConductanceOptions,
  ContentIntegrationStepResult,
} from './types.ts';
import {
  BrewingCapacityOverflowError,
  ThermalRangeError,
  ThermalValidationError,
} from './errors.ts';
import { SPECIFIC_HEAT_WATER_J_PER_KG_K } from './constants.ts';
import { resolveThermalSimulationOptions } from './engine.ts';
import { simulateGongfuWaterBalance } from '../water-balance/gongfuWaterBalance.ts';
import {
  solveLeafWaterThermalMixing,
  LeafWaterThermalMixingResult,
  VALID_DATA_ORIGINS,
  VALID_SPECIFIC_HEAT_UNITS,
} from './leafWaterMixing.ts';
import {
  integrateContentThermalStep,
  VALID_THERMAL_CONDUCTANCE_UNITS,
} from './contentIntegrator.ts';

/**
 * Допустимые единицы измерения начальной температуры сухого чайного листа.
 */
export const VALID_TEMPERATURE_UNITS = new Set<string>([
  '°C',
  '°c',
  'C',
  'c',
  '℃',
  'degC',
  'deg_c',
  'deg C',
  '° C',
  'град C',
  'град. C',
  'град Цельсия',
]);

/**
 * Валидация объекта начальной температуры сухого листа.
 */
export function validateInitialContentTemperature(
  initialContentTemperatureC: unknown
): ValueWithOrigin<number> {
  if (
    !initialContentTemperatureC ||
    typeof initialContentTemperatureC !== 'object'
  ) {
    throw new ThermalValidationError(
      'Параметр initialContentTemperatureC обязателен и должен быть объектом ValueWithOrigin<number>.',
      'INVALID_INITIAL_CONTENT_TEMP_OBJECT',
      'initialContentTemperatureC',
      initialContentTemperatureC
    );
  }

  const obj = initialContentTemperatureC as ValueWithOrigin<number>;

  if (
    typeof obj.origin !== 'string' ||
    !VALID_DATA_ORIGINS.has(obj.origin as DataOriginType)
  ) {
    throw new ThermalValidationError(
      `Недопустимый статус происхождения initialContentTemperatureC: "${obj.origin}".`,
      'INVALID_INITIAL_CONTENT_TEMP_ORIGIN',
      'initialContentTemperatureC.origin',
      obj.origin
    );
  }

  if (
    typeof obj.unit !== 'string' ||
    !VALID_TEMPERATURE_UNITS.has(obj.unit.trim())
  ) {
    throw new ThermalValidationError(
      `Недопустимая единица измерения initialContentTemperatureC: ${typeof obj.unit === 'string' ? `"${obj.unit}"` : obj.unit}. Ожидается °C или C.`,
      'INVALID_TEMPERATURE_UNIT',
      'initialContentTemperatureC.unit',
      obj.unit
    );
  }

  if (obj.origin === 'unknown' && obj.value !== null) {
    throw new ThermalValidationError(
      `Несогласованность метаданных: при origin === 'unknown' значение value обязано быть строго null (получено: ${obj.value}).`,
      'INVALID_INITIAL_CONTENT_TEMP_ORIGIN_VALUE_MISMATCH',
      'initialContentTemperatureC.value',
      obj.value
    );
  }

  if (obj.origin !== 'unknown') {
    if (
      obj.value === null ||
      typeof obj.value !== 'number' ||
      !Number.isFinite(obj.value)
    ) {
      throw new ThermalValidationError(
        `Известная начальная температура листа должна быть конечным числом: ${obj.value}.`,
        'INVALID_INITIAL_CONTENT_TEMP_VALUE',
        'initialContentTemperatureC.value',
        obj.value
      );
    }
    if (obj.value < 0 || obj.value > 100) {
      throw new ThermalRangeError(
        `Начальная температура сухого листа (${obj.value} °C) выходит за физические пределы (0–100 °C).`,
        'initialContentTemperatureC',
        obj.value
      );
    }
  }

  return obj;
}

/**
 * Валидация объекта удельной теплоёмкости сухого листа.
 */
export function validateLeafSpecificHeatCapacity(
  leafSpecificHeatCapacity: unknown
): ValueWithOrigin<number> {
  if (
    !leafSpecificHeatCapacity ||
    typeof leafSpecificHeatCapacity !== 'object'
  ) {
    throw new ThermalValidationError(
      'Параметр leafSpecificHeatCapacity обязателен и должен быть объектом ValueWithOrigin<number>.',
      'INVALID_LEAF_SPECIFIC_HEAT_OBJECT',
      'leafSpecificHeatCapacity',
      leafSpecificHeatCapacity
    );
  }

  const obj = leafSpecificHeatCapacity as ValueWithOrigin<number>;

  if (
    typeof obj.origin !== 'string' ||
    !VALID_DATA_ORIGINS.has(obj.origin as DataOriginType)
  ) {
    throw new ThermalValidationError(
      `Недопустимый статус происхождения удельной теплоёмкости листа: "${obj.origin}".`,
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN',
      'leafSpecificHeatCapacity.origin',
      obj.origin
    );
  }

  if (
    typeof obj.unit !== 'string' ||
    !VALID_SPECIFIC_HEAT_UNITS.has(obj.unit.trim())
  ) {
    throw new ThermalValidationError(
      `Недопустимая единица измерения удельной теплоёмкости листа: ${typeof obj.unit === 'string' ? `"${obj.unit}"` : obj.unit}. Ожидается Дж/(кг·К) или J/(kg·K).`,
      'INVALID_SPECIFIC_HEAT_UNIT',
      'leafSpecificHeatCapacity.unit',
      obj.unit
    );
  }

  if (obj.origin === 'unknown' && obj.value !== null) {
    throw new ThermalValidationError(
      `Несогласованность метаданных: при origin === 'unknown' значение value обязано быть строго null (получено: ${obj.value}).`,
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN_VALUE_MISMATCH',
      'leafSpecificHeatCapacity.value',
      obj.value
    );
  }

  if (obj.origin !== 'unknown' && obj.value !== null) {
    if (
      typeof obj.value !== 'number' ||
      !Number.isFinite(obj.value) ||
      obj.value <= 0
    ) {
      throw new ThermalValidationError(
        `Известная удельная теплоёмкость листа должна быть конечным строго положительным числом (> 0 Дж/(кг·К)): ${obj.value}.`,
        'INVALID_LEAF_SPECIFIC_HEAT_VALUE',
        'leafSpecificHeatCapacity.value',
        obj.value
      );
    }
  }

  return obj;
}

/**
 * Валидация проводимостей осушенного содержимого.
 */
function validateDrainedConductanceOptions(
  drainedOptions?: DrainedContentConductanceOptions
): void {
  if (drainedOptions === undefined) {
    return;
  }
  if (drainedOptions === null || typeof drainedOptions !== 'object') {
    throw new ThermalValidationError(
      'Параметр drainedOptions должен быть объектом DrainedContentConductanceOptions.',
      'INVALID_DRAINED_OPTIONS_OBJECT',
      'drainedOptions',
      drainedOptions
    );
  }

  const validateProp = (
    prop: unknown,
    fieldName: string
  ): void => {
    if (prop === undefined) {
      return;
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
      if (
        typeof obj.value !== 'number' ||
        !Number.isFinite(obj.value) ||
        obj.value < 0
      ) {
        throw new ThermalValidationError(
          `Известный коэффициент проводимости ${fieldName} должен быть конечным неотрицательным числом (>= 0 Вт/К): ${obj.value}.`,
          'INVALID_CONDUCTANCE',
          `${fieldName}.value`,
          obj.value
        );
      }
    }
  };

  validateProp(
    drainedOptions.conductanceDrainedContentVesselWPerK,
    'conductanceDrainedContentVesselWPerK'
  );
  validateProp(
    drainedOptions.conductanceDrainedContentAmbientWPerK,
    'conductanceDrainedContentAmbientWPerK'
  );
}

/**
 * Связанное детерминированное моделирование водного баланса и теплового ядра
 * для классического импульсного метода заваривания Гунфу Ча (Этап 2B.3.3.3.1).
 *
 * ОРКЕСТРАЦИЯ ФИЗИЧЕСКИХ ПРОЦЕССОВ НА ШАГЕ:
 * 1. Водный баланс шага (simulateGongfuWaterBalance):
 *    - Расчёт переноса капиллярного остатка из предыдущего шага;
 *    - Кинетика гидратации листа (m_absorbed);
 *    - Дренаж с полным сливом и удержанием капиллярной влаги (solveLiquorDrain, r = 0).
 * 2. Адиабатическое смешение (solveLeafWaterThermalMixing):
 *    - Заливка свежей воды (m_fresh, T_fresh) смешивается с сухим/влажным листом
 *      и остаточной свободной жидкостью в сосуде, определяя стартовую температуру T_mix.
 * 3. Экспозиция (integrateContentThermalStep, Режим А):
 *    - Содержимое (лист + поглощённая влага + свободная вода) и стенки сосуда
 *      совместно охлаждаются в течение infusionTimeSeconds.
 * 4. Мгновенный слив настоя:
 *    - Слитый настой уносит тепловую энергию при текущей температуре T_contents;
 *    - Температура остающегося в сосуде влажного листа и удержанного корня не изменяется.
 * 5. Межпроливная пауза (integrateContentThermalStep):
 *    - Если retainedLiquor > 0: Режим А (охлаждение с проводимостями жидкой фазы);
 *    - Если retainedLiquor === 0: Режим Б (охлаждение влажного листа по drainedOptions);
 *    - При interInfusionPauseSeconds === 0: чистый no-op со статусом no_time_elapsed.
 * 6. Переход к следующему проливу с обновлёнными температурами содержимого и стенок.
 */
export function simulateGongfuCoupled(
  session: GongfuSessionConfig,
  tea: TeaSample,
  options: CoupledGongfuSimulationOptions
): CoupledGongfuSimulationResult {
  // 1. Валидация входных объектов
  if (!session) {
    throw new ThermalValidationError(
      'Конфигурация сессии Гунфу Ча не передана.',
      'INVALID_SESSION'
    );
  }
  if (!tea) {
    throw new ThermalValidationError(
      'Паспорт чайного образца не передан.',
      'INVALID_TEA'
    );
  }
  if (!options || typeof options !== 'object') {
    throw new ThermalValidationError(
      'Опции связанного моделирования не переданы или имеют неверный тип.',
      'INVALID_OPTIONS'
    );
  }
  if (session.methodId !== 'gongfu_cha') {
    throw new ThermalValidationError(
      `Метод сессии должен быть 'gongfu_cha', получено: '${session.methodId}'.`,
      'INVALID_METHOD',
      'session.methodId',
      session.methodId
    );
  }
  if (session.teaId !== tea.id) {
    throw new ThermalValidationError(
      `Идентификатор чая в сессии ('${session.teaId}') не совпадает с переданным образцом чая ('${tea.id}').`,
      'MISMATCHED_TEA_ID',
      'session.teaId',
      session.teaId
    );
  }
  if (!Number.isFinite(session.leafMassGrams) || session.leafMassGrams <= 0) {
    throw new ThermalValidationError(
      `Масса сухого листа должна быть строго положительным числом (> 0 г): ${session.leafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'session.leafMassGrams',
      session.leafMassGrams
    );
  }
  if (
    !session.vessel ||
    !Number.isFinite(session.vessel.volumeMl) ||
    session.vessel.volumeMl <= 0
  ) {
    throw new ThermalValidationError(
      `Вместимость заварочного сосуда должна быть строго положительным числом (> 0 мл): ${session.vessel?.volumeMl} мл.`,
      'INVALID_VESSEL_VOLUME',
      'session.vessel.volumeMl',
      session.vessel?.volumeMl
    );
  }
  if (
    !session.steps ||
    !Array.isArray(session.steps) ||
    session.steps.length === 0
  ) {
    throw new ThermalValidationError(
      'Сессия Гунфу Ча должна содержать как минимум один шаг заваривания.',
      'EMPTY_STEPS',
      'session.steps',
      session.steps
    );
  }

  // 2. Валидация параметров теплового листа и начальной температуры
  const initialContentTempObj = validateInitialContentTemperature(
    options.initialContentTemperatureC
  );
  const cpLeafObj = validateLeafSpecificHeatCapacity(
    options.leafSpecificHeatCapacity
  );
  validateDrainedConductanceOptions(options.drainedContentConductanceOptions);

  // 3. Предварительная валидация шагов сессии (температуры, объёмы, вместимость сосуда)
  for (let i = 0; i < session.steps.length; i++) {
    const step = session.steps[i];
    if (
      !Number.isFinite(step.waterTemperatureC) ||
      step.waterTemperatureC < 0 ||
      step.waterTemperatureC > 100
    ) {
      throw new ThermalRangeError(
        `Температура заливаемой воды (${step.waterTemperatureC} °C) на шаге #${step.stepNumber} выходит за пределы жидкой фазы (0–100 °C).`,
        'waterTemperatureC',
        step.waterTemperatureC
      );
    }
    if (!Number.isFinite(step.pourWaterVolumeMl) || step.pourWaterVolumeMl <= 0) {
      throw new ThermalValidationError(
        `Объём заливки на шаге #${step.stepNumber} должен быть строго положительным числом (${step.pourWaterVolumeMl} мл).`,
        'INVALID_POUR_VOLUME',
        'pourWaterVolumeMl',
        step.pourWaterVolumeMl
      );
    }
    if (
      !Number.isFinite(step.infusionTimeSeconds) ||
      step.infusionTimeSeconds < 0
    ) {
      throw new ThermalValidationError(
        `Время экспозиции на шаге #${step.stepNumber} не может быть отрицательным: ${step.infusionTimeSeconds} с.`,
        'INVALID_INFUSION_TIME',
        'infusionTimeSeconds',
        step.infusionTimeSeconds
      );
    }
    if (step.pourWaterVolumeMl > session.vessel.volumeMl) {
      throw new BrewingCapacityOverflowError(
        `Объём заливки (${step.pourWaterVolumeMl} мл) превышает номинальную вместимость сосуда (${session.vessel.volumeMl} мл) на шаге #${step.stepNumber}. Физическое переполнение заварочного сосуда невозможно.`,
        session.vessel.volumeMl,
        step.pourWaterVolumeMl,
        step.stepNumber
      );
    }
  }

  // 4. Расчёт водного баланса сессии
  const waterBalanceResult = simulateGongfuWaterBalance(
    session,
    tea,
    options.waterBalanceOptions
  );

  // 5. Разрешение тепловых параметров сосуда и окружения
  const { profile, ambientTemp, initialVesselTemp, interPause, dt } =
    resolveThermalSimulationOptions(
      session.vessel.id,
      session.vessel.volumeMl,
      session.vessel.material,
      options.thermalSimulationOptions
    );

  // 6. Инициализация состояния перед первым проливом
  let currentContentTempC: number | null =
    initialContentTempObj.origin === 'unknown' ||
    initialContentTempObj.value === null
      ? null
      : initialContentTempObj.value;

  let currentVesselTempC: number | null = initialVesselTemp;
  let currentElapsedSeconds = 0;

  const stepResults: CoupledGongfuStepResult[] = [];
  const sessionDiagnostics: string[] = [...waterBalanceResult.diagnostics];
  const sessionWarnings: string[] = [];

  let totalInfusionTimeSeconds = 0;

  // 7. Пошаговая связанная симуляция сессии
  for (let i = 0; i < session.steps.length; i++) {
    const step = session.steps[i];
    const stepWb = waterBalanceResult.steps[i];
    const stepDiagnostics: string[] = [...stepWb.diagnostics];
    const stepWarnings: string[] = [];

    totalInfusionTimeSeconds += step.infusionTimeSeconds;

    // 7.1. Адиабатическое смешение при заливке свежей воды
    let mixingResult: LeafWaterThermalMixingResult;

    if (
      currentContentTempC === null ||
      stepWb.status === 'blocked_by_unknown_prior_state' ||
      stepWb.freshWaterMassGrams === null ||
      stepWb.absorbedWaterBeforeStepGrams === null
    ) {
      const mFreshKg = (stepWb.freshWaterMassGrams ?? 0) * 0.001;
      const addedWaterCp = mFreshKg * SPECIFIC_HEAT_WATER_J_PER_KG_K;
      mixingResult = {
        status:
          i === 0 && (cpLeafObj.origin === 'unknown' || cpLeafObj.value === null)
            ? 'unknown_leaf_specific_heat'
            : ('blocked_by_unknown_prior_state' as any),
        mixedTemperatureC: null,
        contentHeatCapacityBeforeMixingJPerK: null,
        dryLeafHeatCapacityJPerK:
          cpLeafObj.origin !== 'unknown' && cpLeafObj.value !== null
            ? session.leafMassGrams * 0.001 * cpLeafObj.value
            : null,
        wetLeafHeatCapacityJPerK: null,
        addedWaterHeatCapacityJPerK: addedWaterCp,
        contentHeatCapacityAfterMixingJPerK: null,
        reason:
          cpLeafObj.origin === 'unknown' || cpLeafObj.value === null
            ? 'Удельная теплоёмкость листа неизвестна.'
            : `Шаг ${step.stepNumber}: смешение заблокировано из-за неизвестного предшествующего состояния или водных масс.`,
        diagnostics: [
          `Шаг ${step.stepNumber}: смешение заблокировано из-за неизвестного предшествующего состояния или водных масс.`,
        ],
      };
      stepDiagnostics.push(
        `Шаг ${step.stepNumber}: смешение заблокировано из-за неизвестного предшествующего состояния или водных масс.`
      );
    } else {
      mixingResult = solveLeafWaterThermalMixing({
        leafMassGrams: session.leafMassGrams,
        leafSpecificHeatCapacity: cpLeafObj,
        absorbedWaterGrams: stepWb.absorbedWaterBeforeStepGrams,
        existingFreeWaterGrams: stepWb.initialCarriedFreeWaterMassGrams ?? 0,
        contentTemperatureBeforeMixingC: currentContentTempC,
        addedWaterMassGrams: stepWb.freshWaterMassGrams,
        addedWaterTemperatureC: step.waterTemperatureC,
      });
    }

    // 7.2. Экспозиция (интегрирование теплообмена во время настаивания)
    // Сохранение частичной определённости: если массы до поглощения известны,
    // экспозиция рассчитывается даже при неизвестности кинетики или последующего дренажа
    const exposureAbsorbed =
      stepWb.absorbedWaterAfterStepGrams ?? stepWb.absorbedWaterBeforeStepGrams;
    const exposureFree =
      stepWb.freeWaterAfterUptakeMassGrams ?? stepWb.freeWaterBeforeUptakeMassGrams;

    const exposureState: ContentThermalState = {
      leafMassGrams: session.leafMassGrams,
      absorbedWaterGrams: exposureAbsorbed,
      freeWaterMassGrams: exposureFree,
      contentTemperatureC: mixingResult.mixedTemperatureC,
      liquidTemperatureC:
        exposureFree !== null &&
        exposureFree > 0 &&
        mixingResult.mixedTemperatureC !== null
          ? mixingResult.mixedTemperatureC
          : null,
      vesselTemperatureC: currentVesselTempC,
      ambientTemperatureC: ambientTemp,
      leafSpecificHeatCapacity: cpLeafObj,
      elapsedSeconds: currentElapsedSeconds,
    };

    const infusionIntegration: ContentIntegrationStepResult =
      integrateContentThermalStep(
        exposureState,
        profile,
        options.drainedContentConductanceOptions,
        step.infusionTimeSeconds,
        dt
      );

    const postInfusionState = infusionIntegration.finalState;
    stepWarnings.push(...infusionIntegration.warnings);
    stepDiagnostics.push(...infusionIntegration.diagnostics);

    // 7.3. Мгновенный слив готового настоя
    const drainedLiquor = {
      volumeMl: stepWb.drainedLiquorVolumeMl,
      massGrams: stepWb.drainedLiquorMassGrams,
      temperatureC: postInfusionState.contentTemperatureC,
    };

    const postDrainageFreeWater = stepWb.retainedLiquorMassGrams;
    const postDrainageAbsorbedWater = stepWb.absorbedWaterAfterStepGrams;

    const postDrainageState: ContentThermalState = {
      leafMassGrams: session.leafMassGrams,
      absorbedWaterGrams: postDrainageAbsorbedWater,
      freeWaterMassGrams: postDrainageFreeWater,
      contentTemperatureC: postInfusionState.contentTemperatureC,
      liquidTemperatureC:
        postDrainageFreeWater !== null &&
        postDrainageFreeWater > 0 &&
        postInfusionState.contentTemperatureC !== null
          ? postInfusionState.contentTemperatureC
          : null,
      vesselTemperatureC: postInfusionState.vesselTemperatureC,
      ambientTemperatureC: ambientTemp,
      leafSpecificHeatCapacity: cpLeafObj,
      elapsedSeconds: postInfusionState.elapsedSeconds,
    };

    // 7.4. Межпроливная пауза (только между проливами, т.е. для i < N - 1)
    let pauseIntegration: ContentIntegrationStepResult | null = null;
    let postPauseState: ContentThermalState | null = null;

    if (i < session.steps.length - 1) {
      pauseIntegration = integrateContentThermalStep(
        postDrainageState,
        profile,
        options.drainedContentConductanceOptions,
        interPause,
        dt
      );
      postPauseState = pauseIntegration.finalState;
      stepWarnings.push(...pauseIntegration.warnings);
      stepDiagnostics.push(...pauseIntegration.diagnostics);

      // Обновляем рабочее состояние для следующего шага
      currentContentTempC = postPauseState.contentTemperatureC;
      currentVesselTempC = postPauseState.vesselTemperatureC;
      currentElapsedSeconds = postPauseState.elapsedSeconds;
    } else {
      // Завершающий шаг сессии: пауза отсутствует
      currentContentTempC = postDrainageState.contentTemperatureC;
      currentVesselTempC = postDrainageState.vesselTemperatureC;
      currentElapsedSeconds = postDrainageState.elapsedSeconds;
    }

    // 7.5. Определение метрологического статуса шага
    let stepStatus: CoupledGongfuStepStatus;
    let stepReason: string | undefined;

    if (
      i > 0 &&
      (currentContentTempC === null ||
        currentVesselTempC === null ||
        stepWb.status === 'blocked_by_unknown_prior_state')
    ) {
      stepStatus = 'blocked_by_unknown_prior_state';
      stepReason = `Шаг ${step.stepNumber} заблокирован из-за неизвестного состояния предшествующего шага.`;
    } else if (mixingResult.status === 'unknown_leaf_specific_heat') {
      stepStatus = 'unknown_leaf_specific_heat';
      stepReason = 'Удельная теплоёмкость листа неизвестна (Unknown ≠ 0).';
    } else if (
      initialContentTempObj.origin === 'unknown' &&
      i === 0 &&
      currentContentTempC === null
    ) {
      stepStatus = 'blocked_by_unknown_prior_state';
      stepReason = 'Начальная температура чайного листа неизвестна.';
    } else if (
      infusionIntegration.status !== 'calculated' &&
      infusionIntegration.status !== 'no_time_elapsed'
    ) {
      stepStatus = infusionIntegration.status as CoupledGongfuStepStatus;
      stepReason = infusionIntegration.reason;
    } else if (stepWb.status !== 'calculated') {
      stepStatus = stepWb.status as CoupledGongfuStepStatus;
      stepReason = stepWb.reason;
    } else if (
      pauseIntegration &&
      pauseIntegration.status !== 'calculated' &&
      pauseIntegration.status !== 'no_time_elapsed'
    ) {
      stepStatus = pauseIntegration.status as CoupledGongfuStepStatus;
      stepReason = pauseIntegration.reason;
    } else if (infusionIntegration.status === 'no_time_elapsed') {
      stepStatus = 'no_time_elapsed';
    } else {
      stepStatus = 'calculated';
    }

    stepResults.push({
      stepNumber: step.stepNumber,
      status: stepStatus,
      waterBalanceStep: stepWb,
      mixingResult,
      infusionIntegration,
      postDrainageState,
      drainedLiquor,
      pauseIntegration,
      postPauseState,
      reason: stepReason,
      warnings: stepWarnings,
      diagnostics: stepDiagnostics,
    });
  }

  // 8. Определение итогового статуса всей сессии
  let sessionStatus: CoupledGongfuSessionStatus = 'calculated';
  const hasUnknowns = stepResults.some(
    (s) => s.status !== 'calculated' && s.status !== 'no_time_elapsed'
  );

  if (hasUnknowns) {
    const firstUnknown = stepResults.find(
      (s) => s.status !== 'calculated' && s.status !== 'no_time_elapsed'
    )!;
    const firstIdx = stepResults.indexOf(firstUnknown);

    if (
      firstIdx > 0 &&
      (stepResults[0].status === 'calculated' ||
        stepResults[0].status === 'no_time_elapsed')
    ) {
      sessionStatus = 'partially_blocked';
    } else {
      sessionStatus = firstUnknown.status as CoupledGongfuSessionStatus;
    }
  }

  for (const s of stepResults) {
    sessionWarnings.push(...s.warnings);
  }

  return {
    status: sessionStatus,
    waterBalanceResult,
    steps: stepResults,
    totalInfusionTimeSeconds,
    totalElapsedTimeSeconds: currentElapsedSeconds,
    profile,
    diagnostics: sessionDiagnostics,
    warnings: sessionWarnings,
  };
}
