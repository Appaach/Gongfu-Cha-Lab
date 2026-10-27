/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Причины физического ограничения запрашиваемого поглощения воды листом.
 */
export type AbsorptionConstraintReason =
  | 'unconstrained'
  | 'limited_by_leaf_capacity'
  | 'limited_by_available_free_water'
  | 'limited_by_both'
  | 'zero_requested';

/**
 * Причины определения фактического объёма остаточного настоя при сливе.
 */
export type DrainConstraintReason =
  | 'exact_target'
  | 'governed_by_capillary_hold_up'
  | 'insufficient_water_for_capillary_hold_up'
  | 'zero_water';

/**
 * Опции модели плотности воды для пересчёта массы в объём.
 */
export interface WaterDensityOptions {
  /**
   * Принятая плотность жидкой воды (г/мл). По умолчанию 1.0 г/мл.
   * Является инженерным допущением, а не табличной плотностью при произвольной температуре.
   */
  readonly assumedWaterDensityGPerMl?: number;
  /**
   * Описание контекста допущения плотности.
   */
  readonly densityModelNotes?: string;
}

/**
 * Входные параметры для расчёта переноса воды в компартмент листа (поглощение).
 */
export interface WaterAbsorptionParams {
  /** Масса сухого чайного листа, г (> 0) */
  readonly dryLeafMassGrams: number;
  /** Текущая масса уже поглощённой листом воды, г (>= 0) */
  readonly currentAbsorbedWaterGrams: number;
  /** Текущая масса доступной свободной воды в сосуде, г (>= 0) */
  readonly availableFreeWaterGrams: number;
  /** Предельная гравиметрическая влагоёмкость листа, г/г (> 0) */
  readonly maxAbsorptionRatioGramsPerGram: number;
  /** Запрошенное количество поглощения от кинетической модели, г (>= 0) */
  readonly requestedAbsorptionGrams: number;
  /** Принятая плотность воды для расчёта объёмов, г/мл (по умолчанию 1.0) */
  readonly assumedWaterDensityGPerMl?: number;
}

/**
 * Результат операции поглощения воды матрицей листа.
 */
export interface ApplyAbsorptionResult {
  /** Масса сухого листа, г */
  readonly dryLeafMassGrams: number;
  /** Предельная масса воды, которую лист способен поглотить термодинамически, г */
  readonly maxAbsorbedWaterGrams: number;
  /** Предыдущая масса поглощённой воды, г */
  readonly previousAbsorbedWaterGrams: number;
  /** Новая итоговая масса поглощённой воды, г */
  readonly newAbsorbedWaterGrams: number;
  /** Фактически поглощённая за операцию масса воды, г */
  readonly actualAbsorbedGrams: number;
  /** Предыдущая масса свободной воды, г */
  readonly previousFreeWaterGrams: number;
  /** Новая итоговая масса свободной воды, г */
  readonly newFreeWaterGrams: number;
  /** Новый эквивалентный объём свободной воды, мл */
  readonly newFreeWaterVolumeMl: number;
  /** Фактор, ограничивший поглощение (если применимо) */
  readonly limitingFactor: AbsorptionConstraintReason;
  /**
   * Контрольная невязка баланса массы: (newAbsorbed + newFree) - (prevAbsorbed + prevFree).
   * Должна быть строго равна 0 в пределах машинной точности.
   */
  readonly massConservationDeltaGrams: number;
  /** Принятая плотность воды, г/мл */
  readonly assumedWaterDensityGPerMl: number;
}

/**
 * Входные параметры для расчёта слива свободного настоя.
 */
export interface DrainParams {
  /** Полный объём свободного настоя до слива, мл (>= 0) */
  readonly freeWaterBeforeDrainMl: number;
  /** Целевая доля сохраняемого корня настоя [0.0, 1.0) */
  readonly retainedLiquorFraction: number;
  /**
   * Оценочная капиллярная ёмкость удержания жидкости между листьями, мл (>= 0).
   * При значении null или undefined параметр считается неизвестным (Unknown ≠ 0),
   * что исключает скрытую подстановку 0 мл.
   */
  readonly capillaryHoldUpCapacityMl: number | null | undefined;
  /** Принятая плотность воды, г/мл (по умолчанию 1.0) */
  readonly assumedWaterDensityGPerMl?: number;
}

/**
 * Результат расчёта слива свободного настоя.
 */
export interface DrainResult {
  /** Свободный объём до слива, мл */
  readonly freeWaterBeforeDrainMl: number;
  /** Целевой объём корня по рецепту, мл: retainedLiquorFraction * freeWaterBeforeDrainMl */
  readonly targetRootVolumeMl: number;
  /** Фактическая капиллярная ёмкость удержания, мл */
  readonly capillaryHoldUpCapacityMl: number;
  /** Фактический объём удержанного в сосуде свободного настоя, мл */
  readonly actualRetainedFreeWaterMl: number;
  /** Фактический объём слитого настоя, мл */
  readonly drainedFreeWaterMl: number;
  /** Фактическая масса слитого настоя, г */
  readonly drainedFreeWaterMassGrams: number;
  /** Фактическая масса удержанного настоя, г */
  readonly actualRetainedFreeWaterMassGrams: number;
  /** Причина формирования фактического остатка */
  readonly limitingFactor: DrainConstraintReason;
  /**
   * Контрольная невязка баланса объёма: (drained + retained) - beforeDrain.
   * Должна быть равна 0 в пределах машинной точности.
   */
  readonly volumeConservationDeltaMl: number;
  /** Принятая плотность воды, г/мл */
  readonly assumedWaterDensityGPerMl: number;
}

/**
 * Состояние свободной и поглощённой фазы воды в сосуде.
 */
export interface WaterCompartmentsState {
  /** Масса сухого листа, г */
  readonly dryLeafMassGrams: number;
  /** Масса поглощённой матрицей листа воды, г */
  readonly absorbedWaterGrams: number;
  /** Объём свободного настоя в сосуде, мл */
  readonly freeWaterVolumeMl: number;
  /** Масса свободного настоя в сосуде, г */
  readonly freeWaterMassGrams: number;
  /** Принятая плотность воды, г/мл */
  readonly assumedWaterDensityGPerMl: number;
}
