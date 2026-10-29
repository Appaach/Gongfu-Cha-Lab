/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VesselMaterial } from '../../domain/brewing/types.ts';
import { DataOriginType, ValueWithOrigin } from '../../domain/tea/types.ts';

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
  /**
   * Температура жидкости (°C).
   * Принцип Unknown ≠ 0: если объём жидкости равен 0 (сосуд пуст во время паузы или до налива),
   * температура несуществующей жидкости физически неопределена и строго равна null.
   */
  readonly liquidTemperatureC: number | null;
  /** Средняя температура стенок заварочного сосуда (°C). Физически определена всегда. */
  readonly vesselTemperatureC: number;
  /** Температура окружающей среды помещения (°C). */
  readonly ambientTemperatureC: number;
  /** Время от начала шага / экспозиции (с). */
  readonly elapsedSeconds: number;
}

/**
 * Термодинамический профиль заварочного сосуда.
 *
 * Все параметры проводимости являются интегральными (lumped) инженерными величинами,
 * учитывающими совокупность механизмов (конвекция, теплопроводность стенок, излучение,
 * испарительное охлаждение с поверхности), а не фундаментальными табличными константами.
 * Имеют статус происхождения 'model_profile'.
 */
export interface VesselThermalProfile {
  readonly id: string;
  readonly name: string;
  readonly material: VesselMaterial;
  /** Масса сухого пустого сосуда с крышкой (г). */
  readonly vesselMassGrams: number;
  /** Удельная теплоёмкость сухого материала сосуда (Дж/(кг·К)). */
  readonly materialSpecificHeatJPerKgK: number;
  /**
   * Эффективная тепловая проводимость между объёмом жидкости и стенками сосуда (Вт/К).
   * Интегральная инженерная оценка теплопередачи через смоченную внутреннюю поверхность.
   */
  readonly conductanceLiquidVesselWPerK: number;
  /**
   * Эффективная тепловая проводимость между наружными стенками сосуда и окружающим воздухом (Вт/К).
   * Отражает совокупное конвективное и радиационное охлаждение наружной поверхности.
   */
  readonly conductanceVesselAmbientWPerK: number;
  /**
   * Эффективная тепловая проводимость между зеркальной поверхностью жидкости и воздухом (Вт/К).
   * Включает конвекцию над поверхностью и испарительный унос тепла (существенно выше для открытых кружек).
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
  /** Температура жидкости (°C). Если жидкость отсутствует, равна null. */
  readonly liquidTemperatureC: number | null;
  /** Температура стенок сосуда (°C). */
  readonly vesselTemperatureC: number;
  /** Объём жидкости в сосуде в данный момент (мл). */
  readonly liquidVolumeMl: number;
}

/**
 * Результат выполнения одного вызова численного интегратора.
 */
export interface IntegrationStepResult {
  readonly finalState: ThermalState;
  readonly curvePoints: ThermalSimulationPoint[];
  readonly minLiquidTempC: number | null;
  readonly maxLiquidTempC: number | null;
  readonly minVesselTempC: number;
  readonly maxVesselTempC: number;
  readonly warnings: string[];
}

/**
 * Результат моделирования теплового баланса для одного шага (пролива) или интервала событий.
 */
export interface ThermalStepResult {
  readonly stepOrEventId: string | number;
  /** Температура заливаемой/доливаемой воды на входе (°C). */
  readonly pourWaterTempC: number;
  /** Температура жидкости в начальный момент контакта (°C). null, если сосуд пуст. */
  readonly initialLiquidTempC: number | null;
  /** Температура жидкости в конце экспозиции / перед сливом (°C). null, если сосуд пуст. */
  readonly finalLiquidTempC: number | null;
  /** Минимальная зафиксированная температура жидкости за шаг (°C). null, если жидкость отсутствует. */
  readonly minLiquidTempC: number | null;
  /** Максимальная зафиксированная температура жидкости за шаг (°C). null, если жидкость отсутствует. */
  readonly maxLiquidTempC: number | null;
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
   * По умолчанию: 22.0 °C (инженерное комнатное допущение).
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
   * По умолчанию: 75.0 °C.
   */
  readonly preheatedVesselTemperatureC?: number;
  /**
   * Пауза между проливами в методе Гунфу Ча (с), во время которой пустой сосуд остывает на воздухе.
   * По умолчанию: 20.0 с.
   */
  readonly interInfusionPauseSeconds?: number;
  /**
   * Внутренний шаг времени численного интегратора (с).
   * По умолчанию: 0.1 с (обеспечивает точность схемы Хойна O(dt²) при dt << 2τ).
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

/**
 * Отчёт о проверке численной сходимости интегратора при разных шагах dt.
 */
export interface ThermalConvergenceReport {
  readonly profileId: string;
  readonly durationSeconds: number;
  readonly stepsTested: number[];
  readonly results: Array<{
    timeStepSeconds: number;
    finalLiquidTempC: number | null;
    finalVesselTempC: number;
    deltaFromFinerC: number;
  }>;
  readonly maxDeltaC: number;
  readonly isConverged: boolean;
}

/**
 * Метрологический статус результата интегрирования теплового узла содержимого.
 *
 * - 'calculated': успешный расчёт динамики температур;
 * - 'unknown_leaf_specific_heat': удельная теплоёмкость листа неизвестна (Unknown ≠ 0);
 * - 'unknown_water_masses': масса поглощённой или свободной воды неизвестна;
 * - 'unknown_drained_conductance': в режиме без свободной воды не заданы проводимости мокрого листа;
 * - 'blocked_by_unknown_prior_state': предшествующая температура содержимого неизвестна (null).
 */
export type ContentThermalStatus =
  | 'calculated'
  | 'unknown_leaf_specific_heat'
  | 'unknown_water_masses'
  | 'unknown_drained_conductance'
  | 'blocked_by_unknown_prior_state';

/**
 * Термодинамическое состояние узла содержимого заварочного сосуда (чайный лист + поглощённая влага + свободная вода).
 */
export interface ContentThermalState {
  /** Масса навески сухого чайного листа (г, строго > 0) */
  readonly leafMassGrams: number;
  /** Масса воды, поглощённой матрицей чайного листа (г, >= 0 или null при неизвестном значении) */
  readonly absorbedWaterGrams: number | null;
  /** Фактическая масса свободной жидкости в сосуде (г, >= 0 или null при неизвестном значении) */
  readonly freeWaterMassGrams: number | null;
  /**
   * Температура всего содержимого (°C).
   * Может быть известна и при отсутствии свободной жидкости (температура мокрого листа на дне).
   * null при неизвестном состоянии.
   */
  readonly contentTemperatureC: number | null;
  /**
   * Производное представление температуры свободной фазы (°C).
   * Принцип Unknown ≠ 0: если freeWaterMassGrams === 0, freeWaterMassGrams === null
   * или contentTemperatureC === null, значение строго равно null.
   */
  readonly liquidTemperatureC: number | null;
  /** Средняя температура стенок заварочного сосуда (°C) */
  readonly vesselTemperatureC: number;
  /** Температура окружающего воздуха (°C) */
  readonly ambientTemperatureC: number;
  /** Удельная изобарная теплоёмкость листа с метаданными происхождения */
  readonly leafSpecificHeatCapacity: ValueWithOrigin<number>;
  /** Время от начала шага / интервала экспозиции (с) */
  readonly elapsedSeconds: number;
}

/**
 * Параметры эффективных тепловых проводимостей для режима без свободной жидкости (осушенный/слитый сосуд).
 */
export interface DrainedContentConductanceOptions {
  /**
   * Эффективная тепловая проводимость между влажным чайным листом и стенками сосуда (Вт/К, W/K).
   * Должна передаваться явно как ValueWithOrigin<number>.
   */
  readonly conductanceDrainedContentVesselWPerK?: ValueWithOrigin<number>;
  /**
   * Эффективная тепловая проводимость между влажным чайным листом и окружающим воздухом (Вт/К, W/K).
   * Должна передаваться явно как ValueWithOrigin<number>.
   */
  readonly conductanceDrainedContentAmbientWPerK?: ValueWithOrigin<number>;
}

/**
 * Точка на дискретной температурной кривой охлаждения содержимого.
 */
export interface ContentThermalSimulationPoint {
  readonly timeSeconds: number;
  /** Температура содержимого (°C). null при неизвестном состоянии. */
  readonly contentTemperatureC: number | null;
  /** Температура свободной жидкости (°C). null, если свободная вода отсутствует (freeWaterMassGrams === 0). */
  readonly liquidTemperatureC: number | null;
  /** Температура стенок сосуда (°C). */
  readonly vesselTemperatureC: number;
  /** Масса свободной воды в сосуде в данный момент (г). */
  readonly freeWaterMassGrams: number | null;
}

/**
 * Результат выполнения численного интегрирования теплового узла содержимого.
 */
export interface ContentIntegrationStepResult {
  readonly status: ContentThermalStatus;
  readonly finalState: ContentThermalState;
  readonly curvePoints: ContentThermalSimulationPoint[];
  /** Полная теплоёмкость содержимого C_contents = C_dry + (m_abs + m_free) * cp_water (Дж/К) */
  readonly contentHeatCapacityJPerK: number | null;
  /** Теплоёмкость сухой матрицы листа C_dry = m_leaf * cp_leaf (Дж/К) */
  readonly dryLeafHeatCapacityJPerK: number | null;
  /** Теплоёмкость влажного листа C_leaf = C_dry + m_abs * cp_water (Дж/К) */
  readonly wetLeafHeatCapacityJPerK: number | null;
  /** Теплоёмкость свободной воды C_free = m_free * cp_water (Дж/К) */
  readonly freeWaterHeatCapacityJPerK: number | null;
  /** Минимальная зафиксированная температура содержимого (°C) */
  readonly minContentTempC: number | null;
  /** Максимальная зафиксированная температура содержимого (°C) */
  readonly maxContentTempC: number | null;
  /** Минимальная зафиксированная температура свободной жидкости (°C) */
  readonly minLiquidTempC: number | null;
  /** Максимальная зафиксированная температура свободной жидкости (°C) */
  readonly maxLiquidTempC: number | null;
  /** Минимальная зафиксированная температура стенок сосуда (°C) */
  readonly minVesselTempC: number;
  /** Максимальная зафиксированная температура стенок сосуда (°C) */
  readonly maxVesselTempC: number;
  /** Пояснение причины блокировки при status !== 'calculated' */
  readonly reason?: string;
  /** Предупреждения численного интегратора */
  readonly warnings: string[];
  /** Диагностические сообщения и применённые модельные допущения */
  readonly diagnostics: string[];
}

