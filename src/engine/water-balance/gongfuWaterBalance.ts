/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GongfuSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample, ValueWithOrigin } from '../../domain/tea/types.ts';
import {
  AbsorptionConstraintReason,
  DrainConstraintReason,
} from './types.ts';
import {
  DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  convertMassToVolume,
  convertVolumeToMass,
  solveLiquorDrain,
} from './balance.ts';
import { stepHydrationKinetics } from './hydrationKinetics.ts';
import { WaterBalanceValidationError } from './errors.ts';

/**
 * Статус расчёта водного баланса конкретного шага пролива Гунфу Ча:
 * - 'calculated': шаг полностью рассчитан (известны кинетика гидратации и капиллярное удержание);
 * - 'unknown_hydration_profile': шаг не может быть рассчитан из-за отсутствия размерных параметров гидратации;
 * - 'unknown_capillary_hold_up': гидратация рассчитана, но капиллярная ёмкость неизвестна (дренаж не определён);
 * - 'blocked_by_unknown_prior_state': шаг заблокирован, так как зависит от неизвестных масс предыдущего шага.
 */
export type GongfuStepWaterBalanceStatus =
  | 'calculated'
  | 'unknown_hydration_profile'
  | 'unknown_capillary_hold_up'
  | 'blocked_by_unknown_prior_state';

/**
 * Итоговый статус расчёта водного баланса всей сессии Гунфу Ча.
 */
export type GongfuSessionWaterBalanceStatus =
  | 'calculated'
  | 'unknown_hydration_profile'
  | 'unknown_capillary_hold_up'
  | 'partially_blocked';

/**
 * Опции расчёта водного баланса Гунфу Ча.
 */
export interface GongfuWaterBalanceOptions {
  /**
   * Капиллярная ёмкость удержания жидкости между листьями после слива (мл).
   * Должна передаваться явно с метаданными происхождения (ValueWithOrigin<number>) либо как null / undefined.
   *
   * ПРИНЦИП «UNKNOWN ≠ 0»:
   * Капиллярное удержание — независимая физическая величина. Модель НЕ вычисляет её из насыпной плотности
   * сухого листа, влагоёмкости или скорости смачивания и НЕ подставляет скрытый ноль по умолчанию.
   * Если параметр равен null / undefined / origin: 'unknown', слив остаётся неизвестным (unknown_capillary_hold_up).
   *
   * МОДЕЛЬНОЕ ДОПУЩЕНИЕ:
   * Постоянная вместимость капиллярного удержания на протяжении всех проливов сессии —
   * инженерное упрощение текущей версии модели, а не экспериментально подтверждённый закон
   * динамики набухающего слоя чайного листа.
   */
  readonly capillaryHoldUpCapacityMl?: ValueWithOrigin<number> | null;

  /**
   * Принятая плотность жидкой воды, г/мл (по умолчанию 1.0 г/мл).
   */
  readonly assumedWaterDensityGPerMl?: number;
}

/**
 * Детальный результат расчёта водного баланса отдельного пролива Гунфу Ча.
 */
export interface GongfuStepWaterBalanceResult {
  /** Номер пролива (1-based) */
  readonly stepNumber: number;
  /** Метрологический статус расчёта шага */
  readonly status: GongfuStepWaterBalanceStatus;

  // 1. Водные массы и объёмы до поглощения
  /** Объём свежей залитой воды на данном шаге, мл */
  readonly freshWaterVolumeMl: number;
  /** Масса свежей залитой воды на данном шаге, г */
  readonly freshWaterMassGrams: number;
  /** Свободный объём, перенесённый из капиллярного остатка предыдущего пролива, мл */
  readonly initialCarriedFreeWaterVolumeMl: number | null;
  /** Свободная масса, перенесённая из капиллярного остатка предыдущего пролива, г */
  readonly initialCarriedFreeWaterMassGrams: number | null;
  /** Суммарный объём свободной воды в сосуде до поглощения (перенос + свежая), мл */
  readonly freeWaterBeforeUptakeVolumeMl: number | null;
  /** Суммарная масса свободной воды в сосуде до поглощения (перенос + свежая), г */
  readonly freeWaterBeforeUptakeMassGrams: number | null;

  // 2. Гидратация (поглощение матрицей листа)
  /** Масса воды внутри листа к началу пролива, г */
  readonly absorbedWaterBeforeStepGrams: number | null;
  /** Запрошенное кинетикой насыщения поглощение, г */
  readonly requestedAbsorptionGrams: number | null;
  /** Фактически поглощённая листом вода с учётом ограничений сосуда, г */
  readonly actualAbsorbedGrams: number | null;
  /** Итоговая масса воды внутри листа после пролива, г */
  readonly absorbedWaterAfterStepGrams: number | null;
  /** Предельная термодинамическая влагоёмкость навески (m_dry * R_abs_max), г */
  readonly maxAbsorbedWaterGrams: number | null;
  /** Лимитирующий фактор поглощения воды */
  readonly absorptionLimitingFactor?: AbsorptionConstraintReason;

  // 3. Свободная фаза настоя после гидратации (перед сливом)
  /** Объём свободного настоя перед сливом, мл */
  readonly freeWaterAfterUptakeVolumeMl: number | null;
  /** Масса свободного настоя перед сливом, г */
  readonly freeWaterAfterUptakeMassGrams: number | null;

  // 4. Дренаж (слив настоя)
  /** Фактический объём слитого готового настоя, мл */
  readonly drainedLiquorVolumeMl: number | null;
  /** Фактическая масса слитого готового настоя, г */
  readonly drainedLiquorMassGrams: number | null;
  /** Фактический объём удержанного капиллярного остатка настоя, мл */
  readonly retainedLiquorVolumeMl: number | null;
  /** Фактическая масса удержанного капиллярного остатка настоя, г */
  readonly retainedLiquorMassGrams: number | null;
  /** Лимитирующий фактор дренажа */
  readonly drainLimitingFactor?: DrainConstraintReason;

  // 5. Контроль баланса массы на шаге
  /**
   * Невязка закона сохранения массы на шаге:
   * (absorbedAfter + drained + retained) - (absorbedBefore + freeBeforeUptake).
   * Должна быть строго ~0 в пределах машинной точности при status === 'calculated'.
   */
  readonly stepMassConservationDeltaGrams: number | null;

  /** Пояснение при невозможности расчёта */
  readonly reason?: string;
  /** Диагностические сообщения шага */
  readonly diagnostics: string[];
}

/**
 * Итоговый результат расчёта водного баланса всей сессии Гунфу Ча.
 */
export interface GongfuWaterBalanceResult {
  /** Итоговый статус сессии */
  readonly status: GongfuSessionWaterBalanceStatus;
  /** Пошаговые результаты водного баланса */
  readonly steps: GongfuStepWaterBalanceResult[];

  /** Суммарный объём всей залитой свежей воды за сессию, мл */
  readonly totalAddedWaterVolumeMl: number;
  /** Суммарная масса всей залитой свежей воды за сессию, г */
  readonly totalAddedWaterMassGrams: number;

  /** Суммарный объём всего слитого готового настоя за сессию, мл (null при неполном расчёте) */
  readonly totalDrainedLiquorVolumeMl: number | null;
  /** Суммарная масса всего слитого готового настоя за сессию, г (null при неполном расчёте) */
  readonly totalDrainedLiquorMassGrams: number | null;

  /** Финальная накопленная масса воды внутри матрицы листа, г (null при неполном расчёте) */
  readonly finalAbsorbedWaterGrams: number | null;
  /** Финальный объём капиллярного остатка в сосуде после последнего слива, мл (null при неполном расчёте) */
  readonly finalRetainedLiquorVolumeMl: number | null;
  /** Финальная масса капиллярного остатка в сосуде после последнего слива, г (null при неполном расчёте) */
  readonly finalRetainedLiquorMassGrams: number | null;

  /**
   * Глобальная невязка материального баланса всей сессии:
   * (finalAbsorbed + finalRetained + totalDrained) - totalAdded.
   * Должна быть строго равна 0 в пределах машинной точности при status === 'calculated'.
   */
  readonly sessionMassConservationDeltaGrams: number | null;

  /** Список диагностических замечаний и аудита происхождения */
  readonly diagnostics: string[];
}

/**
 * Допустимые единицы измерения объёма капиллярного удержания.
 */
const VALID_VOLUME_UNITS = new Set([
  'мл',
  'ml',
  'см³',
  'cm³',
  'cm3',
]);

/**
 * Проверка наличия и полноты метаданных капиллярного удержания.
 */
function auditCapillaryHoldUpProvenance(
  capillaryHoldUp: ValueWithOrigin<number>,
  diagnostics: string[]
): void {
  if (capillaryHoldUp.origin === 'literature') {
    if (!capillaryHoldUp.citation?.trim()) {
      diagnostics.push(
        "Параметр 'capillaryHoldUpCapacityMl' имеет статус 'literature', но библиографическая ссылка (citation) не заполнена."
      );
    }
  } else if (capillaryHoldUp.origin === 'measured') {
    const method = capillaryHoldUp.measurementMethod?.trim();
    const sample = capillaryHoldUp.sampleInfo?.trim();
    if (!method || !sample) {
      diagnostics.push(
        `Параметр 'capillaryHoldUpCapacityMl' имеет статус 'measured', но описание методики (${method ? 'OK' : 'отсутствует'}) или идентификатор образца (${sample ? 'OK' : 'отсутствует'}) не заполнены.`
      );
    }
  } else if (capillaryHoldUp.origin === 'model_profile') {
    diagnostics.push(
      "Параметр 'capillaryHoldUpCapacityMl' является демонстрационным ориентиром модели (model_profile) и требует лабораторной калибровки."
    );
  }
}

/**
 * Изолированный детерминированный расчёт водного баланса и переноса жидкости
 * для классического метода заваривания Гунфу Ча (工夫茶).
 *
 * ФИЗИЧЕСКИЕ ИНВАРИАНТЫ:
 * 1. Лист начинает сессию с условной нулевой накопленной поглощённой влагой (m_abs = 0).
 * 2. На каждом шаге свежая вода смешивается с капиллярным остатком предыдущего пролива.
 * 3. Водопоглощение рассчитывается через stepHydrationKinetics() и переносит массу в лист.
 * 4. Слив настоя (solveLiquorDrain) производится с целевой долей корня r = 0; в сосуде
 *    удерживается только капиллярная влага V_interstitial.
 * 5. Неизвестные параметры (кинетика гидратации или капиллярная ёмкость) приводят к явным
 *    статусам неизвестности без подстановки 0 (Unknown ≠ 0).
 * 6. Если шаг не может быть рассчитан, все последующие зависимые шаги помечаются как
 *    'blocked_by_unknown_prior_state' со значениями null без вымышленных начальных масс.
 */
export function simulateGongfuWaterBalance(
  session: GongfuSessionConfig,
  tea: TeaSample,
  options: GongfuWaterBalanceOptions = {}
): GongfuWaterBalanceResult {
  const density = options.assumedWaterDensityGPerMl ?? DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML;
  const sessionDiagnostics: string[] = [];

  // 1. Валидация соответствия паспорта чая и конфигурации сессии
  if (!session) {
    throw new WaterBalanceValidationError(
      'Конфигурация сессии Гунфу Ча не передана.',
      'INVALID_SESSION',
      'session',
      session
    );
  }
  if (!tea) {
    throw new WaterBalanceValidationError(
      'Паспорт чайного образца не передан.',
      'INVALID_TEA',
      'tea',
      tea
    );
  }
  if (session.methodId !== 'gongfu_cha') {
    throw new WaterBalanceValidationError(
      `Метод сессии должен быть 'gongfu_cha', получено: '${session.methodId}'.`,
      'INVALID_METHOD',
      'session.methodId',
      session.methodId
    );
  }
  if (session.teaId !== tea.id) {
    throw new WaterBalanceValidationError(
      `Идентификатор чая в сессии ('${session.teaId}') не совпадает с переданным образцом чая ('${tea.id}').`,
      'MISMATCHED_TEA_ID',
      'session.teaId',
      session.teaId
    );
  }
  if (!Number.isFinite(session.leafMassGrams) || session.leafMassGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса сухого листа должна быть строго положительным числом (> 0 г): ${session.leafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'session.leafMassGrams',
      session.leafMassGrams
    );
  }
  if (!session.steps || !Array.isArray(session.steps) || session.steps.length === 0) {
    throw new WaterBalanceValidationError(
      'Сессия Гунфу Ча должна содержать хотя бы один шаг заваривания.',
      'EMPTY_STEPS',
      'session.steps',
      session.steps
    );
  }
  if (!Number.isFinite(density) || density <= 0) {
    throw new WaterBalanceValidationError(
      `Принятая плотность воды должна быть строго положительным числом (> 0 г/мл): ${density} г/мл.`,
      'INVALID_DENSITY',
      'assumedWaterDensityGPerMl',
      density
    );
  }

  // 2. Валидация и аудит опции капиллярного удержания
  const capHolder = options.capillaryHoldUpCapacityMl;
  let isCapillaryKnown = false;
  let capillaryCapacityMl = 0;

  if (capHolder !== null && capHolder !== undefined) {
    auditCapillaryHoldUpProvenance(capHolder, sessionDiagnostics);

    if (capHolder.origin !== 'unknown' && capHolder.value !== null) {
      if (!Number.isFinite(capHolder.value) || capHolder.value < 0) {
        throw new WaterBalanceValidationError(
          `Капиллярная ёмкость удержания жидкости должна быть конечным неотрицательным числом: ${capHolder.value} мл.`,
          'INVALID_CAPILLARY_CAPACITY',
          'capillaryHoldUpCapacityMl.value',
          capHolder.value
        );
      }
      const unit = capHolder.unit?.trim().toLowerCase();
      if (!unit || !VALID_VOLUME_UNITS.has(unit)) {
        throw new WaterBalanceValidationError(
          `Недопустимая единица измерения капиллярной ёмкости: '${capHolder.unit}'. Ожидается 'мл' или 'ml'.`,
          'INVALID_UNIT',
          'capillaryHoldUpCapacityMl.unit',
          capHolder.unit
        );
      }
      isCapillaryKnown = true;
      capillaryCapacityMl = capHolder.value;
    }
  }

  // 3. Пошаговый расчёт сессии
  const stepResults: GongfuStepWaterBalanceResult[] = [];

  // Начальное состояние перед 1-м проливом:
  // absorbedWaterGrams = 0 — начальное условие моделируемой сессии (не утверждает абсолютную сухость листа)
  let accumulatedAbsorbedGrams = 0.0;
  let carriedFreeWaterGrams = 0.0;
  let carriedFreeWaterVolumeMl = 0.0;

  let isBlocked = false;
  let blockReason = '';
  let sessionStatus: GongfuSessionWaterBalanceStatus = 'calculated';

  for (let i = 0; i < session.steps.length; i++) {
    const step = session.steps[i];
    const stepDiagnostics: string[] = [];

    // Валидация параметров шага
    if (!Number.isFinite(step.pourWaterVolumeMl) || step.pourWaterVolumeMl <= 0) {
      throw new WaterBalanceValidationError(
        `Объём заливаемой воды на шаге ${step.stepNumber} должен быть строго положительным: ${step.pourWaterVolumeMl} мл.`,
        'INVALID_POUR_VOLUME',
        `session.steps[${i}].pourWaterVolumeMl`,
        step.pourWaterVolumeMl
      );
    }
    if (!Number.isFinite(step.infusionTimeSeconds) || step.infusionTimeSeconds < 0) {
      throw new WaterBalanceValidationError(
        `Время экспозиции на шаге ${step.stepNumber} должно быть неотрицательным: ${step.infusionTimeSeconds} с.`,
        'INVALID_INFUSION_TIME',
        `session.steps[${i}].infusionTimeSeconds`,
        step.infusionTimeSeconds
      );
    }

    const freshWaterVolumeMl = step.pourWaterVolumeMl;
    const freshWaterMassGrams = convertVolumeToMass(freshWaterVolumeMl, density);

    // Если предыдущий шаг не определил своё состояние, дальнейший расчёт численно блокируется
    if (isBlocked) {
      stepDiagnostics.push(blockReason);
      stepResults.push({
        stepNumber: step.stepNumber,
        status: 'blocked_by_unknown_prior_state',
        freshWaterVolumeMl,
        freshWaterMassGrams,
        initialCarriedFreeWaterVolumeMl: null,
        initialCarriedFreeWaterMassGrams: null,
        freeWaterBeforeUptakeVolumeMl: null,
        freeWaterBeforeUptakeMassGrams: null,
        absorbedWaterBeforeStepGrams: null,
        requestedAbsorptionGrams: null,
        actualAbsorbedGrams: null,
        absorbedWaterAfterStepGrams: null,
        maxAbsorbedWaterGrams: null,
        freeWaterAfterUptakeVolumeMl: null,
        freeWaterAfterUptakeMassGrams: null,
        drainedLiquorVolumeMl: null,
        drainedLiquorMassGrams: null,
        retainedLiquorVolumeMl: null,
        retainedLiquorMassGrams: null,
        stepMassConservationDeltaGrams: null,
        reason: blockReason,
        diagnostics: stepDiagnostics,
      });
      continue;
    }

    // Смешивание капиллярного остатка с добавленной свежей водой
    const initialCarriedFreeWaterVolumeMl = carriedFreeWaterVolumeMl;
    const initialCarriedFreeWaterMassGrams = carriedFreeWaterGrams;

    const freeWaterBeforeUptakeMassGrams = carriedFreeWaterGrams + freshWaterMassGrams;
    const freeWaterBeforeUptakeVolumeMl = convertMassToVolume(freeWaterBeforeUptakeMassGrams, density);
    const absorbedWaterBeforeStepGrams = accumulatedAbsorbedGrams;

    // Шаг 1: Расчёт кинетики гидратации
    const kineticsResult = stepHydrationKinetics({
      dryLeafMassGrams: session.leafMassGrams,
      currentAbsorbedWaterGrams: accumulatedAbsorbedGrams,
      availableFreeWaterGrams: freeWaterBeforeUptakeMassGrams,
      maxAbsorptionRatio: tea.waterAbsorptionRatio,
      hydrationRateConstant: tea.hydrationRateConstantPerSecond,
      durationSeconds: step.infusionTimeSeconds,
      assumedWaterDensityGPerMl: density,
    });

    stepDiagnostics.push(...kineticsResult.diagnostics);

    if (kineticsResult.status === 'unknown_hydration_profile') {
      const reason = kineticsResult.reason ??
        `На шаге ${step.stepNumber} профиль гидратации неизвестен. Модель не подставляет вымышленную кинетику (Unknown ≠ 0).`;

      if (sessionStatus === 'calculated') {
        sessionStatus = 'unknown_hydration_profile';
      }
      isBlocked = true;
      blockReason = `Шаг ${step.stepNumber + 1} заблокирован: шаг ${step.stepNumber} имеет статус 'unknown_hydration_profile'. Начальные массы последующих шагов неизвестны.`;

      stepResults.push({
        stepNumber: step.stepNumber,
        status: 'unknown_hydration_profile',
        freshWaterVolumeMl,
        freshWaterMassGrams,
        initialCarriedFreeWaterVolumeMl,
        initialCarriedFreeWaterMassGrams,
        freeWaterBeforeUptakeVolumeMl,
        freeWaterBeforeUptakeMassGrams,
        absorbedWaterBeforeStepGrams,
        requestedAbsorptionGrams: null,
        actualAbsorbedGrams: null,
        absorbedWaterAfterStepGrams: null,
        maxAbsorbedWaterGrams: null,
        freeWaterAfterUptakeVolumeMl: null,
        freeWaterAfterUptakeMassGrams: null,
        drainedLiquorVolumeMl: null,
        drainedLiquorMassGrams: null,
        retainedLiquorVolumeMl: null,
        retainedLiquorMassGrams: null,
        stepMassConservationDeltaGrams: null,
        reason,
        diagnostics: stepDiagnostics,
      });
      continue;
    }

    // Гидратация успешно рассчитана
    const requestedAbsorptionGrams = kineticsResult.requestedAbsorptionGrams!;
    const actualAbsorbedGrams = kineticsResult.actualAbsorbedGrams!;
    const absorbedWaterAfterStepGrams = kineticsResult.newAbsorbedWaterGrams!;
    const freeWaterAfterUptakeMassGrams = kineticsResult.newFreeWaterGrams!;
    const freeWaterAfterUptakeVolumeMl = kineticsResult.newFreeWaterVolumeMl!;
    const maxAbsorbedWaterGrams = kineticsResult.maxAbsorbedWaterGrams;
    const absorptionLimitingFactor = kineticsResult.limitingFactor;

    // Шаг 2: Расчёт дренажа (полный слив настоя, r = 0)
    if (!isCapillaryKnown) {
      const reason =
        `На шаге ${step.stepNumber} гидратация рассчитана, но капиллярная ёмкость удержания (capillaryHoldUpCapacityMl) неизвестна. ` +
        `Согласно правилу Unknown ≠ 0, модель не подставляет 0 мл, поэтому объём слитого и удержанного настоя не определён.`;
      stepDiagnostics.push(reason);

      if (sessionStatus === 'calculated') {
        sessionStatus = 'unknown_capillary_hold_up';
      }
      isBlocked = true;
      blockReason = `Шаг ${step.stepNumber + 1} заблокирован: на шаге ${step.stepNumber} не определена капиллярная ёмкость (unknown_capillary_hold_up). Остаточный свободный объём неизвестен.`;

      stepResults.push({
        stepNumber: step.stepNumber,
        status: 'unknown_capillary_hold_up',
        freshWaterVolumeMl,
        freshWaterMassGrams,
        initialCarriedFreeWaterVolumeMl,
        initialCarriedFreeWaterMassGrams,
        freeWaterBeforeUptakeVolumeMl,
        freeWaterBeforeUptakeMassGrams,
        absorbedWaterBeforeStepGrams,
        requestedAbsorptionGrams,
        actualAbsorbedGrams,
        absorbedWaterAfterStepGrams,
        maxAbsorbedWaterGrams,
        absorptionLimitingFactor,
        freeWaterAfterUptakeVolumeMl,
        freeWaterAfterUptakeMassGrams,
        drainedLiquorVolumeMl: null,
        drainedLiquorMassGrams: null,
        retainedLiquorVolumeMl: null,
        retainedLiquorMassGrams: null,
        stepMassConservationDeltaGrams: null,
        reason,
        diagnostics: stepDiagnostics,
      });
      continue;
    }

    // Капиллярная ёмкость известна — выполняем слив с r = 0
    const drainResult = solveLiquorDrain({
      freeWaterBeforeDrainMl: freeWaterAfterUptakeVolumeMl,
      retainedLiquorFraction: 0.0, // Гунфу Ча производит максимально полный слив настоя
      capillaryHoldUpCapacityMl: capillaryCapacityMl,
      assumedWaterDensityGPerMl: density,
    });

    const drainedLiquorVolumeMl = drainResult.drainedFreeWaterMl;
    const drainedLiquorMassGrams = drainResult.drainedFreeWaterMassGrams;
    const retainedLiquorVolumeMl = drainResult.actualRetainedFreeWaterMl;
    const retainedLiquorMassGrams = drainResult.actualRetainedFreeWaterMassGrams;
    const drainLimitingFactor = drainResult.limitingFactor;

    // Проверка закона сохранения массы на шаге:
    // (absorbedAfter + drained + retained) === (absorbedBefore + freeBeforeUptake)
    const massOut = absorbedWaterAfterStepGrams + drainedLiquorMassGrams + retainedLiquorMassGrams;
    const massIn = absorbedWaterBeforeStepGrams + freeWaterBeforeUptakeMassGrams;
    const stepMassConservationDeltaGrams = massOut - massIn;

    stepResults.push({
      stepNumber: step.stepNumber,
      status: 'calculated',
      freshWaterVolumeMl,
      freshWaterMassGrams,
      initialCarriedFreeWaterVolumeMl,
      initialCarriedFreeWaterMassGrams,
      freeWaterBeforeUptakeVolumeMl,
      freeWaterBeforeUptakeMassGrams,
      absorbedWaterBeforeStepGrams,
      requestedAbsorptionGrams,
      actualAbsorbedGrams,
      absorbedWaterAfterStepGrams,
      maxAbsorbedWaterGrams,
      absorptionLimitingFactor,
      freeWaterAfterUptakeVolumeMl,
      freeWaterAfterUptakeMassGrams,
      drainedLiquorVolumeMl,
      drainedLiquorMassGrams,
      retainedLiquorVolumeMl,
      retainedLiquorMassGrams,
      drainLimitingFactor,
      stepMassConservationDeltaGrams,
      diagnostics: stepDiagnostics,
    });

    // Обновление состояния для следующего шага
    accumulatedAbsorbedGrams = absorbedWaterAfterStepGrams;
    carriedFreeWaterGrams = retainedLiquorMassGrams;
    carriedFreeWaterVolumeMl = retainedLiquorVolumeMl;
  }

  // 4. Расчёт итоговых показателей сессии
  let totalAddedWaterVolumeMl = 0;
  let totalAddedWaterMassGrams = 0;
  for (const s of stepResults) {
    totalAddedWaterVolumeMl += s.freshWaterVolumeMl;
    totalAddedWaterMassGrams += s.freshWaterMassGrams;
  }

  const allCalculated = stepResults.every((s) => s.status === 'calculated');

  if (allCalculated) {
    let totalDrainedLiquorVolumeMl = 0;
    let totalDrainedLiquorMassGrams = 0;
    for (const s of stepResults) {
      totalDrainedLiquorVolumeMl += s.drainedLiquorVolumeMl ?? 0;
      totalDrainedLiquorMassGrams += s.drainedLiquorMassGrams ?? 0;
    }

    const finalAbsorbedWaterGrams = accumulatedAbsorbedGrams;
    const finalRetainedLiquorVolumeMl = carriedFreeWaterVolumeMl;
    const finalRetainedLiquorMassGrams = carriedFreeWaterGrams;

    // Глобальный баланс массы сессии:
    // totalAdded === finalAbsorbed + finalRetained + totalDrained
    const totalAccountedMass = finalAbsorbedWaterGrams + finalRetainedLiquorMassGrams + totalDrainedLiquorMassGrams;
    const sessionMassConservationDeltaGrams = totalAccountedMass - totalAddedWaterMassGrams;

    return {
      status: 'calculated',
      steps: stepResults,
      totalAddedWaterVolumeMl,
      totalAddedWaterMassGrams,
      totalDrainedLiquorVolumeMl,
      totalDrainedLiquorMassGrams,
      finalAbsorbedWaterGrams,
      finalRetainedLiquorVolumeMl,
      finalRetainedLiquorMassGrams,
      sessionMassConservationDeltaGrams,
      diagnostics: sessionDiagnostics,
    };
  }

  // Если сессия рассчитана не полностью:
  return {
    status: sessionStatus === 'calculated' ? 'partially_blocked' : sessionStatus,
    steps: stepResults,
    totalAddedWaterVolumeMl,
    totalAddedWaterMassGrams,
    totalDrainedLiquorVolumeMl: null,
    totalDrainedLiquorMassGrams: null,
    finalAbsorbedWaterGrams: null,
    finalRetainedLiquorVolumeMl: null,
    finalRetainedLiquorMassGrams: null,
    sessionMassConservationDeltaGrams: null,
    diagnostics: sessionDiagnostics,
  };
}
