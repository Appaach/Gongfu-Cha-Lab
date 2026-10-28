/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueWithOrigin } from '../../domain/tea/types.ts';
import {
  AbsorptionConstraintReason,
  ApplyAbsorptionResult,
} from './types.ts';
import {
  DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  applyWaterAbsorption,
} from './balance.ts';
import { WaterBalanceValidationError } from './errors.ts';

/**
 * Статус выполнения кинетического шага гидратации чайного листа.
 *
 * - 'calculated': размерные физические параметры известны и шаг корректно рассчитан.
 * - 'unknown_hydration_profile': отсутствуют необходимые размерные параметры (k_hyd или R_abs_max).
 *   Модель честно фиксирует отсутствие данных, не подменяя неизвестное нулём или фиктивным числом.
 */
export type HydrationKineticsStatus = 'calculated' | 'unknown_hydration_profile';

/**
 * Входные параметры шага кинетики гидратации чайного листа.
 */
export interface HydrationKineticsStepParams {
  /** Масса сухой навески чайного листа, г (> 0) */
  readonly dryLeafMassGrams: number;
  /** Текущая масса поглощённой листом влаги к началу шага, г (>= 0) */
  readonly currentAbsorbedWaterGrams: number;
  /** Доступная масса свободной воды в сосуде, г (>= 0) */
  readonly availableFreeWaterGrams: number;
  /** Предельная гравиметрическая влагоёмкость листа с метаданными происхождения (г/г) */
  readonly maxAbsorptionRatio: ValueWithOrigin<number> | null | undefined;
  /** Размерная константа скорости гидратации с метаданными происхождения (с^-1, s^-1) */
  readonly hydrationRateConstant: ValueWithOrigin<number> | null | undefined;
  /** Длительность шага контакта листа с водой, секунды (>= 0) */
  readonly durationSeconds: number;
  /** Принятая плотность воды для пересчёта массы в объём, г/мл (по умолчанию 1.0) */
  readonly assumedWaterDensityGPerMl?: number;
}

/**
 * Результат выполнения шага кинетики гидратации чайного листа.
 */
export interface HydrationKineticsStepResult {
  /** Метрологический статус кинетического расчёта */
  readonly status: HydrationKineticsStatus;
  /** Запрошенная кинетическим уравнением масса воды, г (null при неизвестном профиле) */
  readonly requestedAbsorptionGrams: number | null;
  /** Фактически поглощённая масса с учётом материального баланса сосуда, г (null при неизвестном профиле) */
  readonly actualAbsorbedGrams: number | null;
  /** Итоговая масса поглощённой листом воды, г (null при неизвестном профиле) */
  readonly newAbsorbedWaterGrams: number | null;
  /** Итоговая масса свободной воды в сосуде, г (null при неизвестном профиле) */
  readonly newFreeWaterGrams: number | null;
  /** Итоговый эквивалентный объём свободной воды в сосуде, мл (null при неизвестном профиле) */
  readonly newFreeWaterVolumeMl: number | null;
  /** Предельная масса воды при полном насыщении навески (m_dry * R_abs_max), г (null при неизвестном профиле) */
  readonly maxAbsorbedWaterGrams: number | null;
  /** Ограничивающий фактор при переносе воды (при status = 'calculated') */
  readonly limitingFactor?: AbsorptionConstraintReason;
  /** Контрольная невязка сохранения массы воды (new - prev), г (при status = 'calculated') */
  readonly massConservationDeltaGrams?: number;
  /** Текстовое пояснение статуса или причин невозможности вычисления */
  readonly reason?: string;
  /** Список диагностических замечаний (аудит источников, полнота библиографии) */
  readonly diagnostics: string[];
}

/**
 * Допустимые размерности константы скорости гидратации листа.
 */
const VALID_RATE_CONSTANT_UNITS = new Set([
  's^-1',
  'с^-1', // кириллица
  '1/s',
  '1/с',
  's⁻¹',
  'с⁻¹',
]);

/**
 * Допустимые размерности предельной влагоёмкости листа.
 */
const VALID_ABSORPTION_RATIO_UNITS = new Set([
  'г/г',
  'g/g',
]);

/**
 * Аналитический расчёт запрошенного поглощения воды за интервал времени Δt
 * по эмпирическому кинетическому уравнению насыщения первого порядка:
 *
 * m_abs(t + Δt) = m_max - (m_max - m_abs(t)) * exp(-k_hyd * Δt)
 * Δm_req = (m_max - m_abs(t)) * (1 - exp(-k_hyd * Δt))
 *
 * где m_max = dryLeafMassGrams * maxAbsorptionRatio.
 */
export function calculateSaturationHydrationRequested(
  dryLeafMassGrams: number,
  currentAbsorbedWaterGrams: number,
  maxAbsorptionRatioGramsPerGram: number,
  hydrationRateConstantPerSecond: number,
  durationSeconds: number
): number {
  if (!Number.isFinite(dryLeafMassGrams) || dryLeafMassGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса сухого листа должна быть строго положительным числом (> 0 г): ${dryLeafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'dryLeafMassGrams',
      dryLeafMassGrams
    );
  }
  if (!Number.isFinite(currentAbsorbedWaterGrams) || currentAbsorbedWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Текущая масса поглощённой воды не может быть отрицательной или NaN: ${currentAbsorbedWaterGrams} г.`,
      'INVALID_CURRENT_ABSORBED',
      'currentAbsorbedWaterGrams',
      currentAbsorbedWaterGrams
    );
  }
  if (!Number.isFinite(maxAbsorptionRatioGramsPerGram) || maxAbsorptionRatioGramsPerGram < 0) {
    throw new WaterBalanceValidationError(
      `Предельная влагоёмкость листа должна быть конечным неотрицательным числом: ${maxAbsorptionRatioGramsPerGram} г/г.`,
      'INVALID_ABSORPTION_RATIO',
      'maxAbsorptionRatioGramsPerGram',
      maxAbsorptionRatioGramsPerGram
    );
  }
  if (!Number.isFinite(hydrationRateConstantPerSecond) || hydrationRateConstantPerSecond < 0) {
    throw new WaterBalanceValidationError(
      `Константа скорости гидратации k_hyd должна быть конечным неотрицательным числом (>= 0 с^-1): ${hydrationRateConstantPerSecond}.`,
      'INVALID_RATE_CONSTANT',
      'hydrationRateConstantPerSecond',
      hydrationRateConstantPerSecond
    );
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new WaterBalanceValidationError(
      `Длительность шага контакта Δt должна быть конечным неотрицательным числом (>= 0 с): ${durationSeconds} с.`,
      'INVALID_DURATION',
      'durationSeconds',
      durationSeconds
    );
  }

  const maxAbsorbed = dryLeafMassGrams * maxAbsorptionRatioGramsPerGram;

  // Если лист уже полностью насыщен (или в пределах погрешности)
  if (currentAbsorbedWaterGrams >= maxAbsorbed) {
    return 0;
  }

  // При нулевой длительности или нулевой скорости гидратации
  if (durationSeconds === 0 || hydrationRateConstantPerSecond === 0) {
    return 0;
  }

  const capacityDeficit = maxAbsorbed - currentAbsorbedWaterGrams;
  // Численно устойчивое вычисление (1 - exp(-k * dt)) через -Math.expm1(-k * dt)
  // предотвращает потерю значимости при малых положительных значениях (k * dt)
  const saturationFactor = -Math.expm1(-hydrationRateConstantPerSecond * durationSeconds);

  return capacityDeficit * saturationFactor;
}

/**
 * Проверка наличия и полноты метаданных метрологического происхождения параметра.
 * Примечание: функция проверяет наличие обязательных полей происхождения,
 * но не подтверждает подлинность самих библиографических источников.
 */
function auditParamProvenance(
  param: ValueWithOrigin<number>,
  paramName: string,
  diagnostics: string[]
): void {
  if (param.origin === 'literature') {
    const citation = param.citation?.trim();
    if (!citation) {
      diagnostics.push(
        `Параметр '${paramName}' имеет статус 'literature', но библиографическая ссылка (citation) не заполнена.`
      );
    }
  } else if (param.origin === 'measured') {
    const method = param.measurementMethod?.trim();
    const sample = param.sampleInfo?.trim();
    if (!method || !sample) {
      diagnostics.push(
        `Параметр '${paramName}' имеет статус 'measured', но описание методики (${method ? 'OK' : 'отсутствует'}) или идентификатор образца (${sample ? 'OK' : 'отсутствует'}) не заполнены.`
      );
    }
  } else if (param.origin === 'model_profile') {
    diagnostics.push(
      `Параметр '${paramName}' является демонстрационным ориентиром модели (model_profile) и требует лабораторной калибровки.`
    );
  }
}

/**
 * Выполнение изолированного шага кинетики гидратации чайного листа с валидацией
 * входных данных, аудитом происхождения и проверкой закона сохранения массы.
 *
 * Если константа скорости гидратации или предельная влагоёмкость не заданы (null или unknown),
 * функция возвращает статус 'unknown_hydration_profile' с подробным диагностическим описанием,
 * НЕ подставляя 0 и НЕ выполняя фиктивный расчёт баланса (Unknown ≠ 0).
 */
export function stepHydrationKinetics(
  params: HydrationKineticsStepParams
): HydrationKineticsStepResult {
  const {
    dryLeafMassGrams,
    currentAbsorbedWaterGrams,
    availableFreeWaterGrams,
    maxAbsorptionRatio,
    hydrationRateConstant,
    durationSeconds,
    assumedWaterDensityGPerMl = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  } = params;

  const diagnostics: string[] = [];

  // 1. Базовая валидация числовых полей общего контекста
  if (!Number.isFinite(dryLeafMassGrams) || dryLeafMassGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса сухого листа должна быть строго положительным числом (> 0 г): ${dryLeafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'dryLeafMassGrams',
      dryLeafMassGrams
    );
  }
  if (!Number.isFinite(currentAbsorbedWaterGrams) || currentAbsorbedWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Текущая масса поглощённой воды не может быть отрицательной или NaN: ${currentAbsorbedWaterGrams} г.`,
      'INVALID_CURRENT_ABSORBED',
      'currentAbsorbedWaterGrams',
      currentAbsorbedWaterGrams
    );
  }
  if (!Number.isFinite(availableFreeWaterGrams) || availableFreeWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Доступная масса свободной воды не может быть отрицательной или NaN: ${availableFreeWaterGrams} г.`,
      'INVALID_FREE_WATER',
      'availableFreeWaterGrams',
      availableFreeWaterGrams
    );
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new WaterBalanceValidationError(
      `Длительность шага контакта должна быть конечным неотрицательным числом (>= 0 с): ${durationSeconds} с.`,
      'INVALID_DURATION',
      'durationSeconds',
      durationSeconds
    );
  }
  if (!Number.isFinite(assumedWaterDensityGPerMl) || assumedWaterDensityGPerMl <= 0) {
    throw new WaterBalanceValidationError(
      `Принятая плотность воды должна быть строго положительным числом (> 0 г/мл): ${assumedWaterDensityGPerMl} г/мл.`,
      'INVALID_DENSITY',
      'assumedWaterDensityGPerMl',
      assumedWaterDensityGPerMl
    );
  }

  // 2. Аудит происхождения всех переданных параметров ДО проверки их полноты
  // Позволяет зафиксировать замечания к известным метаданным, даже если другой параметр неизвестен
  if (hydrationRateConstant) {
    auditParamProvenance(hydrationRateConstant, 'hydrationRateConstant', diagnostics);
  }
  if (maxAbsorptionRatio) {
    auditParamProvenance(maxAbsorptionRatio, 'maxAbsorptionRatio', diagnostics);
  }

  // 3. Проверка наличия и определённости размерных кинетических параметров
  const hasRateConstant =
    hydrationRateConstant !== null &&
    hydrationRateConstant !== undefined &&
    hydrationRateConstant.value !== null &&
    hydrationRateConstant.origin !== 'unknown';

  const hasMaxCapacity =
    maxAbsorptionRatio !== null &&
    maxAbsorptionRatio !== undefined &&
    maxAbsorptionRatio.value !== null &&
    maxAbsorptionRatio.origin !== 'unknown';

  if (!hasRateConstant || !hasMaxCapacity) {
    const missing: string[] = [];
    if (!hasRateConstant) {
      missing.push('размерная константа скорости гидратации hydrationRateConstantPerSecond (с^-1)');
    }
    if (!hasMaxCapacity) {
      missing.push('предельная гравиметрическая влагоёмкость waterAbsorptionRatio (г/г)');
    }

    const reason =
      `Профиль кинетики гидратации не определён: отсутствуют надёжные данные для [${missing.join(', ')}]. ` +
      `Согласно правилу Unknown ≠ 0, модель не подменяет неизвестную кинетику нулевой или вымышленной скоростью.`;

    diagnostics.push(reason);

    return {
      status: 'unknown_hydration_profile',
      requestedAbsorptionGrams: null,
      actualAbsorbedGrams: null,
      newAbsorbedWaterGrams: null,
      newFreeWaterGrams: null,
      newFreeWaterVolumeMl: null,
      maxAbsorbedWaterGrams: null,
      reason,
      diagnostics,
    };
  }

  // 3. Строгая валидация единиц измерения параметров
  const rateUnit = hydrationRateConstant.unit.trim().toLowerCase();
  if (!VALID_RATE_CONSTANT_UNITS.has(rateUnit)) {
    throw new WaterBalanceValidationError(
      `Недопустимая единица измерения константы скорости гидратации: '${hydrationRateConstant.unit}'. Ожидается 's^-1' или 'с^-1'.`,
      'INVALID_UNIT',
      'hydrationRateConstant.unit',
      hydrationRateConstant.unit
    );
  }

  const capacityUnit = maxAbsorptionRatio.unit.trim().toLowerCase();
  if (!VALID_ABSORPTION_RATIO_UNITS.has(capacityUnit)) {
    throw new WaterBalanceValidationError(
      `Недопустимая единица измерения предельной влагоёмкости: '${maxAbsorptionRatio.unit}'. Ожидается 'г/г' или 'g/g'.`,
      'INVALID_UNIT',
      'maxAbsorptionRatio.unit',
      maxAbsorptionRatio.unit
    );
  }

  const kHyd = hydrationRateConstant.value as number;
  const rMax = maxAbsorptionRatio.value as number;

  if (!Number.isFinite(kHyd) || kHyd < 0) {
    throw new WaterBalanceValidationError(
      `Константа скорости гидратации k_hyd должна быть конечным неотрицательным числом: ${kHyd}.`,
      'INVALID_RATE_CONSTANT',
      'hydrationRateConstant.value',
      kHyd
    );
  }

  if (!Number.isFinite(rMax) || rMax < 0) {
    throw new WaterBalanceValidationError(
      `Предельная влагоёмкость листа должна быть конечным неотрицательным числом: ${rMax} г/г.`,
      'INVALID_ABSORPTION_RATIO',
      'maxAbsorptionRatio.value',
      rMax
    );
  }

  // 4. Аналитический расчёт запрошенного кинетикой поглощения
  const requestedAbsorptionGrams = calculateSaturationHydrationRequested(
    dryLeafMassGrams,
    currentAbsorbedWaterGrams,
    rMax,
    kHyd,
    durationSeconds
  );

  // 6. Применение чистого материального баланса сосуда
  const absorptionResult: ApplyAbsorptionResult = applyWaterAbsorption({
    dryLeafMassGrams,
    currentAbsorbedWaterGrams,
    availableFreeWaterGrams,
    maxAbsorptionRatioGramsPerGram: rMax,
    requestedAbsorptionGrams,
    assumedWaterDensityGPerMl,
  });

  return {
    status: 'calculated',
    requestedAbsorptionGrams,
    actualAbsorbedGrams: absorptionResult.actualAbsorbedGrams,
    newAbsorbedWaterGrams: absorptionResult.newAbsorbedWaterGrams,
    newFreeWaterGrams: absorptionResult.newFreeWaterGrams,
    newFreeWaterVolumeMl: absorptionResult.newFreeWaterVolumeMl,
    maxAbsorbedWaterGrams: absorptionResult.maxAbsorbedWaterGrams,
    limitingFactor: absorptionResult.limitingFactor,
    massConservationDeltaGrams: absorptionResult.massConservationDeltaGrams,
    diagnostics,
  };
}
