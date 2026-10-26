/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VesselMaterial } from '../../domain/brewing/types.ts';
import { DataOriginType } from '../../domain/tea/types.ts';

/**
 * Единицы измерения физических величин тепловой модели:
 * - Температура: градусы Цельсия (°C)
 * - Время: секунды (s)
 * - Объём: миллилитры (мл, 1 мл = 1 см³ = 10⁻⁶ м³)
 * - Масса: граммы (г) и килограммы (кг, 1 кг = 1000 г)
 * - Удельная теплоёмкость: Дж / (кг · К) [J / (kg·K)]
 * - Тепловая ёмкость: Дж / К [J / K]
 * - Эффективная тепловая проводимость: Ватт / К [W / K = J / (s·K)]
 * - Энергия / теплота: Джоули (Дж, J)
 */

/**
 * Мгновенное термодинамическое состояние системы (жидкость + сосуд + окружающая среда).
 */
export interface ThermalState {
  /** Объём жидкости в сосуде в данный момент (мл). Если сосуд пуст, равен 0. */
  readonly liquidVolumeMl: number;
  /** Температура жидкости (°C). При объёме 0 равна температуре сосуда или окружающей среды. */
  readonly liquidTemperatureC: number;
  /** Средняя температура стенок заварочного сосуда (°C). */
  readonly vesselTemperatureC: number;
  /** Температура окружающей среды помещения (°C). */
  readonly ambientTemperatureC: number;
  /** Время от начала шага / экспозиции (с). */
  readonly elapsedSeconds: number;
}

/**
 * Термодинамический профиль заварочного сосуда.
 * Все оценочные параметры имеют статус происхождения 'model_profile'
 * и централизованно документированы до проведения лабораторной калибровки.
 */
export interface VesselThermalProfile {
  readonly id: string;
  readonly name: string;
  readonly material: VesselMaterial;
  /** Масса сухого пустого сосуда (г). */
  readonly vesselMassGrams: number;
  /** Удельная теплоёмкость материала сосуда (Дж/(кг·К)). */
  readonly materialSpecificHeatJPerKgK: number;
  /**
   * Эффективная тепловая проводимость между объёмом жидкости и стенками сосуда (Вт/К).
   * Отражает конвективный перенос тепла от настоя к внутренней поверхности.
   */
  readonly conductanceLiquidVesselWPerK: number;
  /**
   * Эффективная тепловая проводимость между наружными стенками сосуда и окружающим воздухом (Вт/К).
   * Отражает конвективное и радиационное охлаждение стенок.
   */
  readonly conductanceVesselAmbientWPerK: number;
  /**
   * Эффективная тепловая проводимость между свободной зеркальной поверхностью жидкости и воздухом (Вт/К).
   * Для открытых чашек/кружек существенно выше, чем для закрытых чайников с плотной крышкой.
   */
  readonly conductanceLiquidAmbientWPerK: number;
  /** Статус происхождения параметров. */
  readonly origin: DataOriginType;
  /** Обоснование и источники принятых ориентировочных значений. */
  readonly basisNotes: string;
}

/**
 * Точка на дискретной температурной кривой охлаждения.
 */
export interface ThermalSimulationPoint {
  readonly timeSeconds: number;
  readonly liquidTemperatureC: number;
  readonly vesselTemperatureC: number;
  readonly liquidVolumeMl: number;
}

/**
 * Результат моделирования теплового баланса для одного шага (пролива) или интервала событий.
 */
export interface ThermalStepResult {
  readonly stepOrEventId: string | number;
  /** Температура заливаемой/доливаемой воды на входе (°C). */
  readonly pourWaterTempC: number;
  /** Температура жидкости в начальный момент контакта (°C). */
  readonly initialLiquidTempC: number;
  /** Температура жидкости в конце экспозиции / перед сливом (°C). */
  readonly finalLiquidTempC: number;
  /** Минимальная зафиксированная температура жидкости за шаг (°C). */
  readonly minLiquidTempC: number;
  /** Максимальная зафиксированная температура жидкости за шаг (°C). */
  readonly maxLiquidTempC: number;
  /** Температура стенок сосуда в начале шага (°C). */
  readonly initialVesselTempC: number;
  /** Температура стенок сосуда в конце шага (°C). */
  readonly finalVesselTempC: number;
  /** Длительность этапа (с). */
  readonly durationSeconds: number;
  /** Дискретные точки кривой для визуализации (с шагом ~1-2 с). */
  readonly curveSamplePoints: ThermalSimulationPoint[];
  /** Предупреждения численного интегратора и валидации физических границ. */
  readonly warnings: string[];
  /** Модельные допущения, применённые в расчёте. */
  readonly assumptions: string[];
}

/**
 * Настройки теплового симулятора.
 */
export interface ThermalSimulationOptions {
  /**
   * Температура окружающего воздуха (°C).
   * По умолчанию: 22.0 °C (стандартное комнатное допущение).
   */
  readonly ambientTemperatureC?: number;
  /**
   * Предварительный прогрев посуды.
   * true: сосуд ополоснут кипятком и имеет температуру preheatedVesselTemperatureC;
   * false: сосуд холодный (равен ambientTemperatureC).
   */
  readonly isVesselPreheated?: boolean;
  /**
   * Температура стенок предварительно прогретого сосуда (°C).
   * По умолчанию: 75.0 °C (оценочное модельное допущение при ополаскивании горячей водой).
   */
  readonly preheatedVesselTemperatureC?: number;
  /**
   * Пауза между проливами в методе Гунфу Ча (с), во время которой пустой сосуд остывает на воздухе.
   * По умолчанию: 20.0 с.
   */
  readonly interInfusionPauseSeconds?: number;
  /**
   * Внутренний шаг времени численного интегратора (с).
   * По умолчанию: 0.1 с (обеспечивает высокую устойчивость и точность Рунге-Кутты).
   */
  readonly integratorTimeStepSeconds?: number;
}

/**
 * Итоговая тепловая сводка всей сессии заваривания.
 */
export interface SessionThermalSummary {
  readonly vesselProfile: VesselThermalProfile;
  readonly ambientTemperatureC: number;
  readonly isVesselPreheated: boolean;
  readonly initialVesselTemperatureC: number;
  readonly interInfusionPauseSeconds: number;
  readonly status: 'uncalibrated_model_profile';
  readonly generalAssumptions: string[];
  readonly warnings: string[];
}
