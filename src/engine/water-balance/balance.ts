/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AbsorptionConstraintReason,
  ApplyAbsorptionResult,
  DrainConstraintReason,
  DrainParams,
  DrainResult,
  WaterAbsorptionParams,
} from './types.ts';
import {
  InsufficientFreeWaterError,
  UnknownCapillaryHoldUpError,
  WaterBalanceValidationError,
} from './errors.ts';

/**
 * Принятая в модели плотность чистой жидкой воды (г/мл) по умолчанию.
 *
 * МОДЕЛЬНОЕ ДОПУЩЕНИЕ:
 * В интервале температур 20–100 °C термическое расширение воды составляет ~4% (от 0.998 до 0.958 г/мл).
 * В текущей версии материального баланса плотность воды принимается постоянной (1.000 г/мл)
 * для обеспечения строгого аналитического равенства массы и объёма воды при переносе между компартментами.
 * Это приближение не выдаётся за термодинамически точную плотность воды при произвольной температуре.
 */
export const DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML = 1.0;

/**
 * Пересчёт объёма жидкой воды (мл) в массу (г) по заданной плотности.
 */
export function convertVolumeToMass(
  volumeMl: number,
  densityGPerMl: number = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML
): number {
  if (!Number.isFinite(volumeMl) || volumeMl < 0) {
    throw new WaterBalanceValidationError(
      `Объём воды должен быть конечным неотрицательным числом: ${volumeMl} мл.`,
      'INVALID_VOLUME',
      'volumeMl',
      volumeMl
    );
  }
  if (!Number.isFinite(densityGPerMl) || densityGPerMl <= 0) {
    throw new WaterBalanceValidationError(
      `Плотность воды должна быть строго положительным конечным числом: ${densityGPerMl} г/мл.`,
      'INVALID_DENSITY',
      'densityGPerMl',
      densityGPerMl
    );
  }
  return volumeMl * densityGPerMl;
}

/**
 * Пересчёт массы жидкой воды (г) в объём (мл) по заданной плотности.
 */
export function convertMassToVolume(
  massGrams: number,
  densityGPerMl: number = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML
): number {
  if (!Number.isFinite(massGrams) || massGrams < 0) {
    throw new WaterBalanceValidationError(
      `Масса воды должна быть конечным неотрицательным числом: ${massGrams} г.`,
      'INVALID_MASS',
      'massGrams',
      massGrams
    );
  }
  if (!Number.isFinite(densityGPerMl) || densityGPerMl <= 0) {
    throw new WaterBalanceValidationError(
      `Плотность воды должна быть строго положительным конечным числом: ${densityGPerMl} г/мл.`,
      'INVALID_DENSITY',
      'densityGPerMl',
      densityGPerMl
    );
  }
  return massGrams / densityGPerMl;
}

/**
 * Расчёт предельной термодинамической влагоёмкости сухого листа (максимальной массы поглощённой воды).
 *
 * ФИЗИЧЕСКИЙ СМЫСЛ:
 * m_abs_max = m_dry * R_abs_max
 *
 * Задаёт только теоретическую границу поглощения. НЕ определяет скорость гидратации
 * и не рассчитывает, сколько воды впитается за конкретное время контакта.
 */
export function calculateMaxAbsorbedWater(
  dryLeafMassGrams: number,
  maxAbsorptionRatioGramsPerGram: number
): number {
  if (!Number.isFinite(dryLeafMassGrams) || dryLeafMassGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса сухой навески листа должна быть строго положительным конечным числом: ${dryLeafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'dryLeafMassGrams',
      dryLeafMassGrams
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

  return dryLeafMassGrams * maxAbsorptionRatioGramsPerGram;
}

/**
 * Применение заданного количества поглощения воды матрицей листа (перенос из свободной фазы в лист).
 *
 * Принцип:
 * - Вода переносится из компартмента свободной воды (B) в компартмент поглощённой влаги (A).
 * - Суммарная масса воды в системе строго сохраняется (massConservationDeltaGrams = 0).
 * - Поглощение ограничивается:
 *   1) остаточной влагоёмкостью листа (m_abs_max - m_abs_current);
 *   2) доступной массой свободной воды в сосуде.
 * - Причина ограничения явно возвращается в limitingFactor.
 */
export function applyWaterAbsorption(params: WaterAbsorptionParams): ApplyAbsorptionResult {
  const {
    dryLeafMassGrams,
    currentAbsorbedWaterGrams,
    availableFreeWaterGrams,
    maxAbsorptionRatioGramsPerGram,
    requestedAbsorptionGrams,
    assumedWaterDensityGPerMl = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  } = params;

  // 1. Валидация входных величин
  if (!Number.isFinite(dryLeafMassGrams) || dryLeafMassGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса сухой навески листа должна быть строго положительным числом (> 0 г): ${dryLeafMassGrams} г.`,
      'INVALID_DRY_MASS',
      'dryLeafMassGrams',
      dryLeafMassGrams
    );
  }
  if (!Number.isFinite(currentAbsorbedWaterGrams) || currentAbsorbedWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Текущая масса поглощённой воды не может быть отрицательной или нечисловой: ${currentAbsorbedWaterGrams} г.`,
      'INVALID_CURRENT_ABSORBED',
      'currentAbsorbedWaterGrams',
      currentAbsorbedWaterGrams
    );
  }
  if (!Number.isFinite(availableFreeWaterGrams) || availableFreeWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Доступная масса свободной воды не может быть отрицательной или нечисловой: ${availableFreeWaterGrams} г.`,
      'INVALID_FREE_WATER',
      'availableFreeWaterGrams',
      availableFreeWaterGrams
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
  if (!Number.isFinite(requestedAbsorptionGrams) || requestedAbsorptionGrams < 0) {
    throw new WaterBalanceValidationError(
      `Запрошенное поглощение воды не может быть отрицательным или нечисловым: ${requestedAbsorptionGrams} г.`,
      'INVALID_REQUESTED_ABSORPTION',
      'requestedAbsorptionGrams',
      requestedAbsorptionGrams
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

  const maxAbsorbedWaterGrams = dryLeafMassGrams * maxAbsorptionRatioGramsPerGram;

  if (currentAbsorbedWaterGrams > maxAbsorbedWaterGrams + 1e-9) {
    throw new WaterBalanceValidationError(
      `Текущая поглощённая вода (${currentAbsorbedWaterGrams.toFixed(4)} г) превышает предельную влагоёмкость листа (${maxAbsorbedWaterGrams.toFixed(4)} г).`,
      'ABSORBED_EXCEEDS_CAPACITY',
      'currentAbsorbedWaterGrams',
      currentAbsorbedWaterGrams
    );
  }

  const remainingCapacity = Math.max(0, maxAbsorbedWaterGrams - currentAbsorbedWaterGrams);

  // 2. Расчёт фактического поглощения и определение лимитирующего фактора
  let actualAbsorbedGrams = requestedAbsorptionGrams;
  let limitingFactor: AbsorptionConstraintReason = 'unconstrained';

  if (requestedAbsorptionGrams === 0) {
    limitingFactor = 'zero_requested';
    actualAbsorbedGrams = 0;
  } else {
    const isCapacityLimited = requestedAbsorptionGrams > remainingCapacity;
    const isWaterLimited = requestedAbsorptionGrams > availableFreeWaterGrams;

    if (isCapacityLimited && isWaterLimited) {
      actualAbsorbedGrams = Math.min(remainingCapacity, availableFreeWaterGrams);
      if (Math.abs(remainingCapacity - availableFreeWaterGrams) < 1e-9) {
        limitingFactor = 'limited_by_both';
      } else if (remainingCapacity < availableFreeWaterGrams) {
        limitingFactor = 'limited_by_leaf_capacity';
      } else {
        limitingFactor = 'limited_by_available_free_water';
      }
    } else if (isCapacityLimited) {
      actualAbsorbedGrams = remainingCapacity;
      limitingFactor = 'limited_by_leaf_capacity';
    } else if (isWaterLimited) {
      actualAbsorbedGrams = availableFreeWaterGrams;
      limitingFactor = 'limited_by_available_free_water';
    } else {
      actualAbsorbedGrams = requestedAbsorptionGrams;
      limitingFactor = 'unconstrained';
    }
  }

  const newAbsorbedWaterGrams = currentAbsorbedWaterGrams + actualAbsorbedGrams;
  const newFreeWaterGrams = availableFreeWaterGrams - actualAbsorbedGrams;
  const newFreeWaterVolumeMl = newFreeWaterGrams / assumedWaterDensityGPerMl;

  // Контроль инварианта сохранения массы
  const massConservationDeltaGrams =
    newAbsorbedWaterGrams + newFreeWaterGrams - (currentAbsorbedWaterGrams + availableFreeWaterGrams);

  return {
    dryLeafMassGrams,
    maxAbsorbedWaterGrams,
    previousAbsorbedWaterGrams: currentAbsorbedWaterGrams,
    newAbsorbedWaterGrams,
    actualAbsorbedGrams,
    previousFreeWaterGrams: availableFreeWaterGrams,
    newFreeWaterGrams,
    newFreeWaterVolumeMl,
    limitingFactor,
    massConservationDeltaGrams,
    assumedWaterDensityGPerMl,
  };
}

/**
 * Расчёт слива свободного настоя из заварочного сосуда.
 *
 * ФОРМУЛЫ:
 * - targetRootVolumeMl = retainedLiquorFraction * freeWaterBeforeDrainMl
 * - actualRetainedFreeWaterMl = min(freeWaterBeforeDrainMl, max(targetRootVolumeMl, capillaryHoldUpCapacityMl))
 * - drainedFreeWaterMl = freeWaterBeforeDrainMl - actualRetainedFreeWaterMl
 *
 * ПРАВИЛО ИСКЛЮЧЕНИЯ ДВОЙНОГО УЧЁТА:
 * Капиллярная ёмкость удержания и технологический корень НЕ складываются!
 * Если целевой корень превышает капиллярную ёмкость, в сосуде остаётся ровно корень,
 * а капиллярная влага является частью этого же остатка на дне сосуда.
 * Если доступный объём меньше капиллярной ёмкости, слив невозможен, и вся свободная вода остаётся в сосуде.
 */
export function solveLiquorDrain(params: DrainParams): DrainResult {
  const {
    freeWaterBeforeDrainMl,
    retainedLiquorFraction,
    capillaryHoldUpCapacityMl,
    assumedWaterDensityGPerMl = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  } = params;

  // 1. Валидация входных величин
  if (!Number.isFinite(freeWaterBeforeDrainMl) || freeWaterBeforeDrainMl < 0) {
    throw new WaterBalanceValidationError(
      `Свободный объём воды до слива должен быть конечным неотрицательным числом: ${freeWaterBeforeDrainMl} мл.`,
      'INVALID_DRAIN_VOLUME',
      'freeWaterBeforeDrainMl',
      freeWaterBeforeDrainMl
    );
  }
  if (
    !Number.isFinite(retainedLiquorFraction) ||
    retainedLiquorFraction < 0 ||
    retainedLiquorFraction >= 1.0
  ) {
    throw new WaterBalanceValidationError(
      `Доля сохраняемого корня настоя должна быть в диапазоне [0.0, 1.0): ${retainedLiquorFraction}.`,
      'INVALID_RETAINED_FRACTION',
      'retainedLiquorFraction',
      retainedLiquorFraction
    );
  }

  // Принцип Unknown ≠ 0: если капиллярная ёмкость неизвестна, запрещено негласно подставлять 0 мл!
  if (capillaryHoldUpCapacityMl === null || capillaryHoldUpCapacityMl === undefined) {
    throw new UnknownCapillaryHoldUpError();
  }

  if (!Number.isFinite(capillaryHoldUpCapacityMl) || capillaryHoldUpCapacityMl < 0) {
    throw new WaterBalanceValidationError(
      `Капиллярная ёмкость удержания должна быть конечным неотрицательным числом: ${capillaryHoldUpCapacityMl} мл. Недопустимо скрывать неизвестный параметр или передавать отрицательное значение.`,
      'INVALID_CAPILLARY_CAPACITY',
      'capillaryHoldUpCapacityMl',
      capillaryHoldUpCapacityMl
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

  // 2. Расчёт целевого и фактического остатка
  const targetRootVolumeMl = retainedLiquorFraction * freeWaterBeforeDrainMl;

  // Фактический остаток: максимум из цели рецепта и капиллярной ёмкости, но не более доступного объёма
  const actualRetainedFreeWaterMl = Math.min(
    freeWaterBeforeDrainMl,
    Math.max(targetRootVolumeMl, capillaryHoldUpCapacityMl)
  );

  const drainedFreeWaterMl = freeWaterBeforeDrainMl - actualRetainedFreeWaterMl;

  // 3. Определение лимитирующего фактора
  let limitingFactor: DrainConstraintReason = 'exact_target';

  if (freeWaterBeforeDrainMl === 0) {
    limitingFactor = 'zero_water';
  } else if (
    actualRetainedFreeWaterMl === freeWaterBeforeDrainMl &&
    capillaryHoldUpCapacityMl >= freeWaterBeforeDrainMl
  ) {
    limitingFactor = 'insufficient_water_for_capillary_hold_up';
  } else if (capillaryHoldUpCapacityMl > targetRootVolumeMl) {
    limitingFactor = 'governed_by_capillary_hold_up';
  } else {
    limitingFactor = 'exact_target';
  }

  const volumeConservationDeltaMl = drainedFreeWaterMl + actualRetainedFreeWaterMl - freeWaterBeforeDrainMl;

  const drainedFreeWaterMassGrams = drainedFreeWaterMl * assumedWaterDensityGPerMl;
  const actualRetainedFreeWaterMassGrams = actualRetainedFreeWaterMl * assumedWaterDensityGPerMl;

  return {
    freeWaterBeforeDrainMl,
    targetRootVolumeMl,
    capillaryHoldUpCapacityMl,
    actualRetainedFreeWaterMl,
    drainedFreeWaterMl,
    drainedFreeWaterMassGrams,
    actualRetainedFreeWaterMassGrams,
    limitingFactor,
    volumeConservationDeltaMl,
    assumedWaterDensityGPerMl,
  };
}

/**
 * Добавление порции свежей воды в свободный компартмент сосуда.
 */
export function addWater(
  currentFreeWaterGrams: number,
  addedWaterGrams: number,
  assumedWaterDensityGPerMl: number = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML
): {
  newFreeWaterGrams: number;
  newFreeWaterVolumeMl: number;
} {
  if (!Number.isFinite(currentFreeWaterGrams) || currentFreeWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Текущая масса свободной воды должна быть конечным неотрицательным числом: ${currentFreeWaterGrams} г.`,
      'INVALID_FREE_WATER',
      'currentFreeWaterGrams',
      currentFreeWaterGrams
    );
  }
  if (!Number.isFinite(addedWaterGrams) || addedWaterGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса добавляемой воды должна быть строго положительным числом (> 0 г): ${addedWaterGrams} г.`,
      'INVALID_ADDED_WATER',
      'addedWaterGrams',
      addedWaterGrams
    );
  }
  if (!Number.isFinite(assumedWaterDensityGPerMl) || assumedWaterDensityGPerMl <= 0) {
    throw new WaterBalanceValidationError(
      `Принятая плотность воды должна быть строго положительной: ${assumedWaterDensityGPerMl} г/мл.`,
      'INVALID_DENSITY',
      'assumedWaterDensityGPerMl',
      assumedWaterDensityGPerMl
    );
  }

  const newFreeWaterGrams = currentFreeWaterGrams + addedWaterGrams;
  const newFreeWaterVolumeMl = newFreeWaterGrams / assumedWaterDensityGPerMl;

  return {
    newFreeWaterGrams,
    newFreeWaterVolumeMl,
  };
}

/**
 * Отпивание порции свободной воды (модель кружки / открытого настаивания).
 *
 * ФИЗИЧЕСКИЙ ПРИНЦИП:
 * Отпивание уменьшает исключительно объём свободной воды (B).
 * Вода, поглощённая матрицей листа (A), не может быть изъята отпиванием!
 * Нельзя отпить больше свободной воды, чем фактически доступно в кружке.
 */
export function consumeFreeWater(
  currentFreeWaterGrams: number,
  consumedWaterGrams: number,
  assumedWaterDensityGPerMl: number = DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML
): {
  newFreeWaterGrams: number;
  newFreeWaterVolumeMl: number;
  actualConsumedGrams: number;
} {
  if (!Number.isFinite(currentFreeWaterGrams) || currentFreeWaterGrams < 0) {
    throw new WaterBalanceValidationError(
      `Текущая масса свободной воды должна быть конечным неотрицательным числом: ${currentFreeWaterGrams} г.`,
      'INVALID_FREE_WATER',
      'currentFreeWaterGrams',
      currentFreeWaterGrams
    );
  }
  if (!Number.isFinite(consumedWaterGrams) || consumedWaterGrams <= 0) {
    throw new WaterBalanceValidationError(
      `Масса отпиваемой воды должна быть строго положительным числом (> 0 г): ${consumedWaterGrams} г.`,
      'INVALID_CONSUMED_WATER',
      'consumedWaterGrams',
      consumedWaterGrams
    );
  }
  if (!Number.isFinite(assumedWaterDensityGPerMl) || assumedWaterDensityGPerMl <= 0) {
    throw new WaterBalanceValidationError(
      `Принятая плотность воды должна быть строго положительной: ${assumedWaterDensityGPerMl} г/мл.`,
      'INVALID_DENSITY',
      'assumedWaterDensityGPerMl',
      assumedWaterDensityGPerMl
    );
  }

  if (consumedWaterGrams > currentFreeWaterGrams + 1e-9) {
    throw new InsufficientFreeWaterError(consumedWaterGrams, currentFreeWaterGrams);
  }

  const actualConsumedGrams = Math.min(consumedWaterGrams, currentFreeWaterGrams);
  const newFreeWaterGrams = currentFreeWaterGrams - actualConsumedGrams;
  const newFreeWaterVolumeMl = newFreeWaterGrams / assumedWaterDensityGPerMl;

  return {
    newFreeWaterGrams,
    newFreeWaterVolumeMl,
    actualConsumedGrams,
  };
}
