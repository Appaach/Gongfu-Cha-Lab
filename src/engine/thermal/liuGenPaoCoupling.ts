/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LiuGenPaoSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import {
  CoupledLiuGenPaoSimulationOptions,
  CoupledLiuGenPaoSimulationResult,
  CoupledLiuGenPaoStepResult,
  CoupledLiuGenPaoStepStatus,
  CoupledLiuGenPaoSessionStatus,
  ContentThermalState,
  ContentIntegrationStepResult,
} from './types.ts';
import {
  BrewingCapacityOverflowError,
  ThermalRangeError,
  ThermalValidationError,
} from './errors.ts';
import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
  DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS,
} from './constants.ts';
import { resolveThermalSimulationOptions } from './engine.ts';
import { simulateLiuGenPaoWaterBalance } from '../water-balance/liuGenPaoWaterBalance.ts';
import {
  solveLeafWaterThermalMixing,
  LeafWaterThermalMixingResult,
} from './leafWaterMixing.ts';
import { integrateContentThermalStep } from './contentIntegrator.ts';
import {
  validateInitialContentTemperature,
  validateLeafSpecificHeatCapacity,
  validateDrainedConductanceOptions,
} from './gongfuCoupling.ts';

/**
 * Изолированное детерминированное связанное моделирование водного баланса и теплового ядра
 * для метода ступенчатого заваривания с сохранением корня настоя — Лю Гэнь Пао (留根泡).
 *
 * ФИЗИЧЕСКИЕ ИНВАРИАНТЫ И ОРКЕСТРАЦИЯ:
 * 1. Водный баланс рассчитывается через `simulateLiuGenPaoWaterBalance(session, tea, options.waterBalanceOptions)`
 *    и является ЕДИНСТВЕННЫМ источником массовых величин (Unknown ≠ 0).
 * 2. До первого долива: сухое состояние листа (m_abs = 0, m_free = 0), начальная температура сухого листа
 *    задаётся обязательным параметром `initialContentTemperatureC`.
 * 3. На каждом шаге:
 *    - Адиабатическое смешение доливаемой свежей воды с влажным листом и сохранённым корнем (`solveLeafWaterThermalMixing`).
 *    - Тепловая экспозиция (`integrateContentThermalStep`): узел содержимого и стенки охлаждаются в течение шага.
 *      Состояние экспозиции строится строго из масс ДО гидратации текущего шага (pre-uptake masses).
 *    - Мгновенный слив готового настоя: настой удаляется при температуре конца экспозиции, остаточный влажный лист
 *      и удержанный корень сохраняют температуру (T_postDrain = T_postInfusion).
 *    - Межпроливная пауза: остывание содержимого и стенок между проливами (i < N - 1).
 *      Если удержанный корень > 0, действует Режим А (проводимости жидкой фазы).
 *      Если удержанный корень === 0, действует Режим Б (требуются `drainedContentConductanceOptions`).
 *      При нулевой паузе — чистый no-op со статусом `no_time_elapsed`.
 * 4. Сохранение частичной определённости (Partial Certainty Preservation): экспозиция шага 1 рассчитывается
 *    при известных pre-uptake массах даже при `unknown_hydration_profile` или `unknown_capillary_hold_up`.
 * 5. Каскадная блокировка последующих шагов (`blocked_by_unknown_prior_state`) со значениями `null`
 *    при неизвестности предшествующего состояния.
 */
export function simulateLiuGenPaoCoupled(
  session: LiuGenPaoSessionConfig,
  tea: TeaSample,
  options: CoupledLiuGenPaoSimulationOptions
): CoupledLiuGenPaoSimulationResult {
  // 1. Валидация входных объектов
  if (!session) {
    throw new ThermalValidationError(
      'Конфигурация сессии Лю Гэнь Пао не передана.',
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
  if (session.methodId !== 'liu_gen_pao') {
    throw new ThermalValidationError(
      `Метод сессии должен быть 'liu_gen_pao', получено: '${session.methodId}'.`,
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
      'Сессия Лю Гэнь Пао должна содержать как минимум один шаг заваривания.',
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
      !Number.isFinite(step.addedWaterTemperatureC) ||
      step.addedWaterTemperatureC < 0 ||
      step.addedWaterTemperatureC > 100
    ) {
      throw new ThermalRangeError(
        `Температура доливаемой воды (${step.addedWaterTemperatureC} °C) на шаге #${step.stepNumber} выходит за пределы жидкой фазы (0–100 °C).`,
        'addedWaterTemperatureC',
        step.addedWaterTemperatureC
      );
    }
    if (!Number.isFinite(step.addedWaterVolumeMl) || step.addedWaterVolumeMl <= 0) {
      throw new ThermalValidationError(
        `Объём доливаемой воды на шаге #${step.stepNumber} должен быть строго положительным числом (${step.addedWaterVolumeMl} мл).`,
        'INVALID_ADDED_VOLUME',
        'addedWaterVolumeMl',
        step.addedWaterVolumeMl
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
    if (step.addedWaterVolumeMl > session.vessel.volumeMl) {
      throw new BrewingCapacityOverflowError(
        `Объём долива (${step.addedWaterVolumeMl} мл) превышает номинальную вместимость сосуда (${session.vessel.volumeMl} мл) на шаге #${step.stepNumber}. Физическое переполнение заварочного сосуда невозможно.`,
        session.vessel.volumeMl,
        step.addedWaterVolumeMl,
        step.stepNumber
      );
    }
  }

  // 4. Расчёт водного баланса сессии Лю Гэнь Пао
  const waterBalanceResult = simulateLiuGenPaoWaterBalance(
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
      options.thermalSimulationOptions,
      DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS
    );

  // 6. Инициализация состояния перед первым доливом
  let currentContentTempC: number | null =
    initialContentTempObj.origin === 'unknown' ||
    initialContentTempObj.value === null
      ? null
      : initialContentTempObj.value;

  let currentVesselTempC: number | null = initialVesselTemp;
  let currentElapsedSeconds = 0;

  const stepResults: CoupledLiuGenPaoStepResult[] = [];
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

    // 7.1. Адиабатическое смешение при доливе свежей воды к листу и сохранённому корню
    let mixingResult: LeafWaterThermalMixingResult;

    if (
      currentContentTempC === null ||
      stepWb.status === 'blocked_by_unknown_prior_state' ||
      stepWb.addedWaterMassGrams === null ||
      stepWb.absorbedWaterBeforeStepGrams === null ||
      stepWb.initialCarriedRootMassGrams === null
    ) {
      const mAddedKg = (stepWb.addedWaterMassGrams ?? 0) * 0.001;
      const addedWaterCp = mAddedKg * SPECIFIC_HEAT_WATER_J_PER_KG_K;
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
        existingFreeWaterGrams: stepWb.initialCarriedRootMassGrams,
        contentTemperatureBeforeMixingC: currentContentTempC,
        addedWaterMassGrams: stepWb.addedWaterMassGrams,
        addedWaterTemperatureC: step.addedWaterTemperatureC,
      });
    }

    // 7.2. Экспозиция (интегрирование теплообмена во время настаивания)
    // Состояние экспозиции строится строго на основе начальных масс до гидратации шага
    const exposureAbsorbed = stepWb.absorbedWaterBeforeStepGrams;
    const exposureFree = stepWb.freeWaterBeforeUptakeMassGrams;

    if (
      stepWb.freeWaterBeforeUptakeMassGrams !== null &&
      stepWb.freeWaterBeforeUptakeMassGrams > 0 &&
      stepWb.freeWaterAfterUptakeMassGrams === 0 &&
      step.infusionTimeSeconds > 0
    ) {
      stepDiagnostics.push(
        `Шаг ${step.stepNumber}: в начале экспозиции свободная вода присутствовала (${stepWb.freeWaterBeforeUptakeMassGrams} г), поэтому для всего интервала применяется Режим А. К концу гидратации вся свободная вода поглощена листом (freeWaterAfterUptakeMassGrams === 0). Точное время исчерпания свободной фазы внутри интервала не рассчитывается; переход Режим А -> Режим Б внутри одного интервала не моделируется.`
      );
    }

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

    // 7.3. Частичный слив готового настоя с сохранением рецептурного корня
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
    let stepStatus: CoupledLiuGenPaoStepStatus;
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
      stepStatus = infusionIntegration.status as CoupledLiuGenPaoStepStatus;
      stepReason = infusionIntegration.reason;
    } else if (stepWb.status !== 'calculated') {
      stepStatus = stepWb.status as CoupledLiuGenPaoStepStatus;
      stepReason = stepWb.reason;
    } else if (
      pauseIntegration &&
      pauseIntegration.status !== 'calculated' &&
      pauseIntegration.status !== 'no_time_elapsed'
    ) {
      stepStatus = pauseIntegration.status as CoupledLiuGenPaoStepStatus;
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
  let sessionStatus: CoupledLiuGenPaoSessionStatus = 'calculated';
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
      sessionStatus = firstUnknown.status as CoupledLiuGenPaoSessionStatus;
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
