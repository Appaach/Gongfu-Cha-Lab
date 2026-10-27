/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Базовый класс ошибок валидации параметров тепловой модели и гидродинамики.
 */
export class ThermalValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly invalidValue?: unknown;

  constructor(message: string, code = 'THERMAL_VALIDATION_ERROR', field?: string, invalidValue?: unknown) {
    super(message);
    this.name = 'ThermalValidationError';
    this.code = code;
    this.field = field;
    this.invalidValue = invalidValue;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Ошибка выхода температурных параметров за пределы физической фазы воды (0–100 °C при 1 атм).
 */
export class ThermalRangeError extends ThermalValidationError {
  constructor(message: string, field?: string, invalidValue?: unknown) {
    super(message, 'THERMAL_RANGE_ERROR', field, invalidValue);
    this.name = 'ThermalRangeError';
  }
}

/**
 * Ошибка физического переполнения вместимости заварочного сосуда.
 */
export class BrewingCapacityOverflowError extends ThermalValidationError {
  readonly vesselCapacityMl: number;
  readonly attemptedVolumeMl: number;
  readonly stepOrEventId?: string | number;

  constructor(
    message: string,
    vesselCapacityMl: number,
    attemptedVolumeMl: number,
    stepOrEventId?: string | number
  ) {
    super(message, 'VESSEL_CAPACITY_OVERFLOW', 'volumeMl', attemptedVolumeMl);
    this.name = 'BrewingCapacityOverflowError';
    this.vesselCapacityMl = vesselCapacityMl;
    this.attemptedVolumeMl = attemptedVolumeMl;
    this.stepOrEventId = stepOrEventId;
  }
}

/**
 * Ошибка хронологии событий или объёмов временной шкалы (метод Lazy Mug).
 */
export class TimelineChronologyError extends ThermalValidationError {
  readonly eventIndex?: number;

  constructor(message: string, eventIndex?: number, invalidValue?: unknown) {
    super(message, 'TIMELINE_CHRONOLOGY_ERROR', 'timestampSeconds', invalidValue);
    this.name = 'TimelineChronologyError';
    this.eventIndex = eventIndex;
  }
}

/**
 * Ошибка численной нестабильности схемы интегрирования тепловой системы.
 * Возникает при нарушении условия устойчивости схемы (dt > dt_max_stable = 2 * tau_min)
 * либо при выходе расчётных температур за физические термодинамические границы.
 */
export class ThermalInstabilityError extends ThermalValidationError {
  readonly timeStepSeconds: number;
  readonly maxStableTimeStepSeconds?: number;

  constructor(
    message: string,
    timeStepSeconds: number,
    maxStableTimeStepSeconds?: number
  ) {
    super(message, 'THERMAL_INSTABILITY_ERROR', 'timeStepSeconds', timeStepSeconds);
    this.name = 'ThermalInstabilityError';
    this.timeStepSeconds = timeStepSeconds;
    this.maxStableTimeStepSeconds = maxStableTimeStepSeconds;
  }
}
