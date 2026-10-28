/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LiuGenPaoSessionConfig } from '../../domain/brewing/types.ts';
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
 * Статус расчёта водного баланса конкретного шага Лю Гэнь Пао (留根泡):
 * - 'calculated': шаг полностью рассчитан (известны кинетика гидратации и капиллярное удержание);
 * - 'unknown_hydration_profile': шаг не может быть рассчитан из-за отсутствия размерных параметров гидратации;
 * - 'unknown_capillary_hold_up': гидратация рассчитана, но капиллярная ёмкость неизвестна (дренаж не определён);
 * - 'blocked_by_unknown_prior_state': шаг заблокирован, так как зависит от неизвестных масс предыдущего шага.
 */
export type LiuGenPaoStepWaterBalanceStatus =
  | 'calculated'
  | 'unknown_hydration_profile'
  | 'unknown_capillary_hold_up'
  | 'blocked_by_unknown_prior_state';

/**
 * Итоговый статус расчёта водного баланса всей сессии Лю Гэнь Пао.
 */
export type LiuGenPaoSessionWaterBalanceStatus =
  | 'calculated'
  | 'unknown_hydration_profile'
  | 'unknown_capillary_hold_up'
  | 'partially_blocked';

/**
 * Опции расчёта водного баланса Лю Гэнь Пао.
 */
export interface LiuGenPaoWaterBalanceOptions {
  /**
   * Капиллярная ёмкость удержания жидкости между листьями после слива (мл).
   * Должна передаваться явно с метаданными происхождения (ValueWithOrigin<number>) либо как null / undefined.
   *
   * ПРИНЦИП «UNKNOWN ≠ 0»:
   * Капиллярное удержание — независимая физическая величина. Даже если доля корня r известна,
   * фактический остаток не может быть меньше капиллярного предела V_interstitial.
   * Если капиллярная ёмкость неизвестна (null / undefined / origin: 'unknown'), фактический слив
   * остаётся неопределённым (unknown_capillary_hold_up), так как модель не подставляет 0 мл.
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
 * Детальный результат расчёта водного баланса отдельного шага Лю Гэнь Пао.
 */
export interface LiuGenPaoStepWaterBalanceResult {
  /** Номер шага (1-based) */
  readonly stepNumber: number;
  /** Метрологический статус расчёта шага */
  readonly status: LiuGenPaoStepWaterBalanceStatus;

  // 1. Водные массы и объёмы до поглощения
  /** Объём свежей долитой воды на данном шаге, мл */
  readonly addedWaterVolumeMl: number;
  /** Масса свежей долитой воды на данном шаге, г */
  readonly addedWaterMassGrams: number;
  /** Целевая доля удержания корня от полного свободного объёма перед сливом (0 <= r < 1) */
  readonly targetRetainedFractionOfTotal: number;
  /** Свободный объём корня настоя, перенесённый из предыдущего шага, мл (0 на первом шаге) */
  readonly initialCarriedRootVolumeMl: number | null;
  /** Свободная масса корня настоя, перенесённая из предыдущего шага, г (0 на первом шаге) */
  readonly initialCarriedRootMassGrams: number | null;
  /** Суммарный объём свободной воды в сосуде до поглощения (корень + долив), мл */
  readonly freeWaterBeforeUptakeVolumeMl: number | null;
  /** Суммарная масса свободной воды в сосуде до поглощения (корень + долив), г */
  readonly freeWaterBeforeUptakeMassGrams: number | null;

  // 2. Гидратация (поглощение матрицей листа)
  /** Масса воды внутри листа к началу шага, г */
  readonly absorbedWaterBeforeStepGrams: number | null;
  /** Запрошенное кинетикой насыщения поглощение, г */
  readonly requestedAbsorptionGrams: number | null;
  /** Фактически поглощённая листом вода с учётом ограничений сосуда, г */
  readonly actualAbsorbedGrams: number | null;
  /** Итоговая масса воды внутри листа после шага, г */
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

  // 4. Дренаж и сохранение корня настоя
  /** Целевой рецептурный объём сохраняемого корня настоя (r * V_free_post), мл */
  readonly targetRootVolumeMl: number | null;
  /** Фактический объём слитого настоя, мл */
  readonly drainedLiquorVolumeMl: number | null;
  /** Фактическая масса слитого настоя, г */
  readonly drainedLiquorMassGrams: number | null;
  /** Фактический объём удержанного корня настоя (с учётом капиллярного порога), мл */
  readonly retainedLiquorVolumeMl: number | null;
  /** Фактическая масса удержанного корня настоя (с учётом капиллярного порога), г */
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
 * Итоговый результат расчёта водного баланса всей сессии Лю Гэнь Пао.
 */
export interface LiuGenPaoWaterBalanceResult {
  /** Итоговый статус сессии */
  readonly status: LiuGenPaoSessionWaterBalanceStatus;
  /** Пошаговые результаты водного баланса */
  readonly steps: LiuGenPaoStepWaterBalanceResult[];

  /** Суммарный объём всей долитой свежей воды за сессию, мл */
  readonly totalAddedWaterVolumeMl: number;
  /** Суммарная масса всей долитой свежей воды за сессию, г */
  readonly totalAddedWaterMassGrams: number;

  /** Суммарный объём всего слитого готового настоя за сессию, мл (null при неполном расчёте) */
  readonly totalDrainedLiquorVolumeMl: number | null;
  /** Суммарная масса всего слитого готового настоя за сессию, г (null при неполном расчёте) */
  readonly totalDrainedLiquorMassGrams: number | null;

  /** Финальная накопленная масса воды внутри матрицы листа, г (null при неполном расчёте) */
  readonly finalAbsorbedWaterGrams: number | null;
  /** Финальный объём оставшегося корня настоя в сосуде после последнего слива, мл (null при неполном расчёте) */
  readonly finalRetainedLiquorVolumeMl: number | null;
  /** Финальная масса оставшегося корня настоя в сосуде после последнего слива, г (null при неполном расчёте) */
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
 * для метода ступенчатого заваривания с сохранением корня настоя — Лю Гэнь Пао (留根泡).
 *
 * ФИЗИЧЕСКИЕ ИНВАРИАНТЫ:
 * 1. Лист начинает сессию с условной нулевой поглощённой влагой (m_abs = 0).
 * 2. Перед первым шагом свободный корень равен нулю (carriedRetainedLiquor = 0).
 * 3. На каждом шаге свежая вода доливается к сохранённому корню предыдущего слива.
 * 4. Независимые параметры шага (addedWaterVolumeMl > 0, infusionTimeSeconds >= 0,
 *    addedWaterVolumeMl <= vessel.volumeMl) валидируются до ветки блокировки (Этап 2B.3.1.2).
 * 5. Водопоглощение рассчитывается через stepHydrationKinetics() и переносит массу в лист.
 * 6. Слив настоя производится через solveLiquorDrain() с рецептурной долей корня r = retainedLiquorFractionOfTotal
 *    и ограничением снизу капиллярной ёмкостью V_interstitial.
 * 7. Капиллярный остаток и сохранённый корень НЕ складываются: листья погружены в остаточный раствор.
 * 8. Неизвестные параметры (кинетика гидратации или капиллярная ёмкость) приводят к явным
 *    статусам неизвестности без скрытой подстановки 0 (Unknown ≠ 0).
 * 9. Если шаг не может быть рассчитан, все последующие зависимые шаги помечаются как
 *    'blocked_by_unknown_prior_state' со значениями null без вымышленных начальных масс.
 */
export function simulateLiuGenPaoWaterBalance(
  session: LiuGenPaoSessionConfig,
  tea: TeaSample,
  options: LiuGenPaoWaterBalanceOptions = {}
): LiuGenPaoWaterBalanceResult {
  const density = options.assumedWaterDensityGPerMl ?? DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML;
  const sessionDiagnostics: string[] = [];

  // 1. Валидация соответствия паспорта чая и конфигурации сессии
  if (!session) {
    throw new WaterBalanceValidationError(
      'Конфигурация сессии Лю Гэнь Пао не передана.',
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
  if (session.methodId !== 'liu_gen_pao') {
    throw new WaterBalanceValidationError(
      `Метод сессии должен быть 'liu_gen_pao', получено: '${session.methodId}'.`,
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
  if (!session.vessel || !Number.isFinite(session.vessel.volumeMl) || session.vessel.volumeMl <= 0) {
    throw new WaterBalanceValidationError(
      `Вместимость заварочного сосуда должна быть строго положительным числом (> 0 мл): ${session.vessel?.volumeMl} мл.`,
      'INVALID_VESSEL_VOLUME',
      'session.vessel.volumeMl',
      session.vessel?.volumeMl
    );
  }
  if (!session.steps || !Array.isArray(session.steps) || session.steps.length === 0) {
    throw new WaterBalanceValidationError(
      'Сессия Лю Гэнь Пао должна содержать хотя бы один шаг заваривания.',
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

  // 3. Пошаговый расчёт сессии Лю Гэнь Пао
  const stepResults: LiuGenPaoStepWaterBalanceResult[] = [];

  // Начальное состояние перед 1-м шагом:
  let accumulatedAbsorbedGrams = 0.0;
  let carriedRetainedLiquorGrams = 0.0;
  let carriedRetainedLiquorVolumeMl = 0.0;

  let isBlocked = false;
  let blockReason = '';
  let sessionStatus: LiuGenPaoSessionWaterBalanceStatus = 'calculated';

  const vesselCapacityMl = session.vessel.volumeMl;

  for (let i = 0; i < session.steps.length; i++) {
    const step = session.steps[i];
    const stepDiagnostics: string[] = [];

    // C1: Валидация независимых параметров шага
    if (!Number.isFinite(step.addedWaterVolumeMl) || step.addedWaterVolumeMl <= 0) {
      throw new WaterBalanceValidationError(
        `Объём доливаемой воды на шаге ${step.stepNumber} должен быть строго положительным: ${step.addedWaterVolumeMl} мл.`,
        'INVALID_ADDED_VOLUME',
        `session.steps[${i}].addedWaterVolumeMl`,
        step.addedWaterVolumeMl
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
    if (
      !Number.isFinite(step.retainedLiquorFractionOfTotal) ||
      step.retainedLiquorFractionOfTotal < 0 ||
      step.retainedLiquorFractionOfTotal >= 1.0
    ) {
      throw new WaterBalanceValidationError(
        `Доля сохраняемого корня настоя на шаге ${step.stepNumber} должна находиться в диапазоне [0, 1): ${step.retainedLiquorFractionOfTotal}.`,
        'INVALID_RETAINED_FRACTION',
        `session.steps[${i}].retainedLiquorFractionOfTotal`,
        step.retainedLiquorFractionOfTotal
      );
    }
    if (
      typeof step.addedWaterTemperatureC !== 'number' ||
      !Number.isFinite(step.addedWaterTemperatureC) ||
      step.addedWaterTemperatureC < 0 ||
      step.addedWaterTemperatureC > 100
    ) {
      throw new WaterBalanceValidationError(
        `Температура доливаемой воды на шаге ${step.stepNumber} должна быть конечным числом в диапазоне жидкой фазы [0, 100] °C: ${step.addedWaterTemperatureC} °C.`,
        'INVALID_WATER_TEMPERATURE',
        `session.steps[${i}].addedWaterTemperatureC`,
        step.addedWaterTemperatureC
      );
    }

    const addedWaterVolumeMl = step.addedWaterVolumeMl;
    const addedWaterMassGrams = convertVolumeToMass(addedWaterVolumeMl, density);
    const targetRetainedFractionOfTotal = step.retainedLiquorFractionOfTotal;

    // Независимая проверка свежей заливки на непревышение номинальной вместимости сосуда
    // Выполняется строго до ветки blocked_by_unknown_prior_state (Этап 2B.3.1.2)
    if (addedWaterVolumeMl > vesselCapacityMl + 1e-9) {
      throw new WaterBalanceValidationError(
        `Объём свежего долива на шаге ${step.stepNumber} (${addedWaterVolumeMl} мл) превышает номинальную вместимость сосуда (${vesselCapacityMl} мл).`,
        'VESSEL_CAPACITY_EXCEEDED',
        `session.steps[${i}].addedWaterVolumeMl`,
        addedWaterVolumeMl
      );
    }

    // Если предыдущий шаг не определил своё состояние, дальнейший расчёт численно блокируется
    // При этом неизвестный корень не подменяется нулём, а суммарный объём не вычисляется (Unknown ≠ 0)
    if (isBlocked) {
      stepDiagnostics.push(blockReason);
      stepResults.push({
        stepNumber: step.stepNumber,
        status: 'blocked_by_unknown_prior_state',
        addedWaterVolumeMl,
        addedWaterMassGrams,
        targetRetainedFractionOfTotal,
        initialCarriedRootVolumeMl: null,
        initialCarriedRootMassGrams: null,
        freeWaterBeforeUptakeVolumeMl: null,
        freeWaterBeforeUptakeMassGrams: null,
        absorbedWaterBeforeStepGrams: null,
        requestedAbsorptionGrams: null,
        actualAbsorbedGrams: null,
        absorbedWaterAfterStepGrams: null,
        maxAbsorbedWaterGrams: null,
        freeWaterAfterUptakeVolumeMl: null,
        freeWaterAfterUptakeMassGrams: null,
        targetRootVolumeMl: null,
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

    // C2: Свободная вода перед настаиванием (перенос корня + свежий долив)
    const initialCarriedRootVolumeMl = carriedRetainedLiquorVolumeMl;
    const initialCarriedRootMassGrams = carriedRetainedLiquorGrams;

    const freeWaterBeforeUptakeMassGrams = carriedRetainedLiquorGrams + addedWaterMassGrams;
    const freeWaterBeforeUptakeVolumeMl = convertMassToVolume(freeWaterBeforeUptakeMassGrams, density);
    const absorbedWaterBeforeStepGrams = accumulatedAbsorbedGrams;

    // Контроль суммарного объёма свободной воды перед поглощением
    if (freeWaterBeforeUptakeVolumeMl > vesselCapacityMl + 1e-9) {
      throw new WaterBalanceValidationError(
        `Суммарный объём свободной воды перед поглощением на шаге ${step.stepNumber} (${freeWaterBeforeUptakeVolumeMl} мл: свежий долив ${addedWaterVolumeMl} мл + перенесённый корень ${initialCarriedRootVolumeMl} мл) превышает вместимость сосуда (${vesselCapacityMl} мл).`,
        'VESSEL_CAPACITY_EXCEEDED',
        'freeWaterBeforeUptakeVolumeMl',
        freeWaterBeforeUptakeVolumeMl
      );
    }

    // C3: Расчёт кинетики гидратации листа
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
      const reason =
        kineticsResult.reason ??
        `На шаге ${step.stepNumber} профиль гидратации неизвестен. Модель не подставляет вымышленную кинетику (Unknown ≠ 0).`;

      if (sessionStatus === 'calculated') {
        sessionStatus = 'unknown_hydration_profile';
      }
      isBlocked = true;
      blockReason = `Шаг ${step.stepNumber + 1} заблокирован: шаг ${step.stepNumber} имеет статус 'unknown_hydration_profile'. Начальные массы последующих шагов неизвестны.`;

      stepResults.push({
        stepNumber: step.stepNumber,
        status: 'unknown_hydration_profile',
        addedWaterVolumeMl,
        addedWaterMassGrams,
        targetRetainedFractionOfTotal,
        initialCarriedRootVolumeMl,
        initialCarriedRootMassGrams,
        freeWaterBeforeUptakeVolumeMl,
        freeWaterBeforeUptakeMassGrams,
        absorbedWaterBeforeStepGrams,
        requestedAbsorptionGrams: null,
        actualAbsorbedGrams: null,
        absorbedWaterAfterStepGrams: null,
        maxAbsorbedWaterGrams: null,
        freeWaterAfterUptakeVolumeMl: null,
        freeWaterAfterUptakeMassGrams: null,
        targetRootVolumeMl: null,
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

    // C4: Слив с сохранением корня настоя (solveLiquorDrain)
    if (!isCapillaryKnown) {
      const reason =
        `На шаге ${step.stepNumber} гидратация рассчитана, но капиллярная ёмкость удержания (capillaryHoldUpCapacityMl) неизвестна. ` +
        `Согласно правилу Unknown ≠ 0, модель не подставляет 0 мл. Даже при известной рецептурной доле r = ${targetRetainedFractionOfTotal}, ` +
        `фактический остаток не может быть определён, поскольку капиллярный предел может превысить целевой корень.`;
      stepDiagnostics.push(reason);

      if (sessionStatus === 'calculated') {
        sessionStatus = 'unknown_capillary_hold_up';
      }
      isBlocked = true;
      blockReason = `Шаг ${step.stepNumber + 1} заблокирован: на шаге ${step.stepNumber} не определена капиллярная ёмкость (unknown_capillary_hold_up). Остаточный свободный корень неизвестен.`;

      stepResults.push({
        stepNumber: step.stepNumber,
        status: 'unknown_capillary_hold_up',
        addedWaterVolumeMl,
        addedWaterMassGrams,
        targetRetainedFractionOfTotal,
        initialCarriedRootVolumeMl,
        initialCarriedRootMassGrams,
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
        targetRootVolumeMl: freeWaterAfterUptakeVolumeMl * targetRetainedFractionOfTotal,
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

    // Капиллярная ёмкость известна — выполняем слив с r = targetRetainedFractionOfTotal
    const targetRootVolumeMl = freeWaterAfterUptakeVolumeMl * targetRetainedFractionOfTotal;

    const drainResult = solveLiquorDrain({
      freeWaterBeforeDrainMl: freeWaterAfterUptakeVolumeMl,
      retainedLiquorFraction: targetRetainedFractionOfTotal,
      capillaryHoldUpCapacityMl: capillaryCapacityMl,
      assumedWaterDensityGPerMl: density,
    });

    const drainedLiquorVolumeMl = drainResult.drainedFreeWaterMl;
    const drainedLiquorMassGrams = drainResult.drainedFreeWaterMassGrams;
    const retainedLiquorVolumeMl = drainResult.actualRetainedFreeWaterMl;
    const retainedLiquorMassGrams = drainResult.actualRetainedFreeWaterMassGrams;
    const drainLimitingFactor = drainResult.limitingFactor;

    // C5: Проверка закона сохранения массы на шаге
    const massOut = absorbedWaterAfterStepGrams + drainedLiquorMassGrams + retainedLiquorMassGrams;
    const massIn = absorbedWaterBeforeStepGrams + freeWaterBeforeUptakeMassGrams;
    const stepMassConservationDeltaGrams = massOut - massIn;

    stepResults.push({
      stepNumber: step.stepNumber,
      status: 'calculated',
      addedWaterVolumeMl,
      addedWaterMassGrams,
      targetRetainedFractionOfTotal,
      initialCarriedRootVolumeMl,
      initialCarriedRootMassGrams,
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
      targetRootVolumeMl,
      drainedLiquorVolumeMl,
      drainedLiquorMassGrams,
      retainedLiquorVolumeMl,
      retainedLiquorMassGrams,
      drainLimitingFactor,
      stepMassConservationDeltaGrams,
      diagnostics: stepDiagnostics,
    });

    // Сохранение состояния для следующего шага:
    // Поглощённая вода остаётся внутри листа, удержанный корень переходит в свободную фазу следующего шага
    accumulatedAbsorbedGrams = absorbedWaterAfterStepGrams;
    carriedRetainedLiquorGrams = retainedLiquorMassGrams;
    carriedRetainedLiquorVolumeMl = retainedLiquorVolumeMl;
  }

  // 4. Формирование итогового баланса сессии
  let totalAddedWaterVolumeMl = 0.0;
  let totalAddedWaterMassGrams = 0.0;
  for (const step of stepResults) {
    totalAddedWaterVolumeMl += step.addedWaterVolumeMl;
    totalAddedWaterMassGrams += step.addedWaterMassGrams;
  }

  let totalDrainedLiquorVolumeMl: number | null = null;
  let totalDrainedLiquorMassGrams: number | null = null;
  let finalAbsorbedWaterGrams: number | null = null;
  let finalRetainedLiquorVolumeMl: number | null = null;
  let finalRetainedLiquorMassGrams: number | null = null;
  let sessionMassConservationDeltaGrams: number | null = null;

  if (sessionStatus === 'calculated') {
    let sumDrainedVolume = 0.0;
    let sumDrainedMass = 0.0;
    for (const step of stepResults) {
      sumDrainedVolume += step.drainedLiquorVolumeMl!;
      sumDrainedMass += step.drainedLiquorMassGrams!;
    }
    totalDrainedLiquorVolumeMl = sumDrainedVolume;
    totalDrainedLiquorMassGrams = sumDrainedMass;
    finalAbsorbedWaterGrams = accumulatedAbsorbedGrams;
    finalRetainedLiquorVolumeMl = carriedRetainedLiquorVolumeMl;
    finalRetainedLiquorMassGrams = carriedRetainedLiquorGrams;

    // Глобальный материальный баланс сессии:
    // totalAdded === finalAbsorbed + finalRetained + totalDrained
    const totalOut = finalAbsorbedWaterGrams + finalRetainedLiquorMassGrams + totalDrainedLiquorMassGrams;
    sessionMassConservationDeltaGrams = totalOut - totalAddedWaterMassGrams;
  }

  return {
    status: sessionStatus,
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
