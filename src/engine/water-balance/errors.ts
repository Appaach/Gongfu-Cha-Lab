/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Базовый класс ошибок модуля водного баланса.
 */
export class WaterBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaterBalanceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Ошибка валидации физических параметров водного баланса
 * (отрицательные значения, NaN, Infinity, выход за допустимый диапазон).
 */
export class WaterBalanceValidationError extends WaterBalanceError {
  readonly code: string;
  readonly field: string;
  readonly value: unknown;

  constructor(message: string, code: string, field: string, value: unknown) {
    super(message);
    this.name = 'WaterBalanceValidationError';
    this.code = code;
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Ошибка отсутствия обязательного физического параметра (Unknown ≠ 0).
 * Выбрасывается, когда алгоритм требует параметр (например, капиллярную ёмкость),
 * но он равен null / unknown, предотвращая скрытую замену на 0.
 */
export class UnknownCapillaryHoldUpError extends WaterBalanceError {
  readonly field: string;

  constructor(
    message: string = 'Капиллярная ёмкость удержания жидкости неизвестна (null/unknown). Скрытая замена неизвестного параметра на 0 запрещена (Unknown ≠ 0).',
    field: string = 'capillaryHoldUpCapacityMl'
  ) {
    super(message);
    this.name = 'UnknownCapillaryHoldUpError';
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Ошибка попытки изъятия большего объёма/массы свободной воды, чем физически доступно.
 */
export class InsufficientFreeWaterError extends WaterBalanceError {
  readonly requestedGrams: number;
  readonly availableGrams: number;

  constructor(requestedGrams: number, availableGrams: number) {
    super(
      `Попытка изъятия свободной воды (${requestedGrams.toFixed(2)} г) превышает доступный объём (${availableGrams.toFixed(2)} г).`
    );
    this.name = 'InsufficientFreeWaterError';
    this.requestedGrams = requestedGrams;
    this.availableGrams = availableGrams;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
