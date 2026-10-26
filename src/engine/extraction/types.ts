/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';

/**
 * Статус готовности математического ядра.
 * На этапе 1.1 ядро строго имеет статус `pending_calibration`.
 */
export type EngineReadinessStatus = 'ready' | 'pending_calibration' | 'uncalibrated';

import { ThermalSimulationPoint, SessionThermalSummary } from '../thermal/types.ts';

/**
 * Гидродинамический и тепловой снимок шага Гунфу Ча (полный слив).
 */
export interface GongfuStepSnapshot {
  readonly stepNumber: number;
  readonly exposureTimeSeconds: number;
  readonly pourVolumeMl: number;
  readonly drainedVolumeMl: number;
  readonly capillaryHoldUpMl: number;

  /** Температура заливаемой воды на входе (°C) */
  readonly pourTemperatureC: number;
  /** Температура жидкости в начале контакта (°C) */
  readonly startLiquidTemperatureC: number;
  /** Температура жидкости в конце экспозиции / при сливе (°C) */
  readonly finalLiquidTemperatureC: number;
  /** Минимальная температура жидкости за шаг (°C) */
  readonly minLiquidTemperatureC: number;
  /** Максимальная температура жидкости за шаг (°C) */
  readonly maxLiquidTemperatureC: number;
  /** Температура стенок сосуда в начале шага (°C) */
  readonly startVesselTemperatureC: number;
  /** Температура стенок сосуда в конце шага (°C) */
  readonly finalVesselTemperatureC: number;
  /** Обратная совместимость: текущая температура жидкости при сливе (°C) */
  readonly temperatureC: number;

  /** Дискретные точки температурной кривой охлаждения */
  readonly thermalCurveSamplePoints?: ThermalSimulationPoint[];
  readonly thermalWarnings?: string[];

  // Величины, ожидающие калибровки физического ядра (Этап 3)
  readonly extractedSolidsMg: number | null;
  readonly concentrationMgL: number | null;
  readonly yieldPercent: number | null;
}

/**
 * Гидродинамический и тепловой снимок шага Лю Гэнь Пао (сохранение корней).
 */
export interface LiuGenPaoStepSnapshot {
  readonly stepNumber: number;
  readonly exposureTimeSeconds: number;
  readonly addedWaterVolumeMl: number;
  readonly previousRetainedLiquorMl: number;
  readonly totalLiquorBeforeDrainMl: number; // Полный объем жидкости в сосуде перед сливом
  readonly drainedVolumeMl: number;          // Слитая порция
  readonly retainedLiquorRemainingMl: number; // Оставшийся корень настоя

  /** Температура доливаемой воды на входе (°C) */
  readonly pourTemperatureC: number;
  /** Температура смеси после добавления свежей воды (°C) */
  readonly startLiquidTemperatureC: number;
  /** Температура жидкости перед сливом (°C) */
  readonly finalLiquidTemperatureC: number;
  /** Минимальная температура жидкости за шаг (°C) */
  readonly minLiquidTemperatureC: number;
  /** Максимальная температура жидкости за шаг (°C) */
  readonly maxLiquidTemperatureC: number;
  /** Температура стенок сосуда в начале шага (°C) */
  readonly startVesselTemperatureC: number;
  /** Температура стенок сосуда в конце шага (°C) */
  readonly finalVesselTemperatureC: number;
  /** Обратная совместимость: температура жидкости перед сливом (°C) */
  readonly temperatureC: number;

  /** Дискретные точки температурной кривой охлаждения */
  readonly thermalCurveSamplePoints?: ThermalSimulationPoint[];
  readonly thermalWarnings?: string[];

  readonly extractedSolidsMg: number | null;
  readonly concentrationMgL: number | null;
  readonly yieldPercent: number | null;
}

/**
 * Гидродинамический и тепловой снимок события в кружке (непрерывный контакт).
 */
export interface LazyMugEventSnapshot {
  readonly timestampSeconds: number;
  readonly eventType: string;
  readonly liquidVolumeInMugMl: number;
  readonly description: string;

  /** Температура заливки/долива или текущего настоя (°C) */
  readonly pourTemperatureC: number;
  /** Температура жидкости в момент события (°C) */
  readonly startLiquidTemperatureC: number;
  /** Температура жидкости в конце интервала до следующего события (°C) */
  readonly finalLiquidTemperatureC: number;
  readonly minLiquidTemperatureC: number;
  readonly maxLiquidTemperatureC: number;
  readonly startVesselTemperatureC: number;
  readonly finalVesselTemperatureC: number;
  /** Обратная совместимость (°C) */
  readonly temperatureC: number;

  /** Дискретные точки температурной кривой охлаждения интервала */
  readonly thermalCurveSamplePoints?: ThermalSimulationPoint[];
  readonly thermalWarnings?: string[];

  readonly extractedSolidsMg: number | null;
  readonly concentrationMgL: number | null;
  readonly yieldPercent: number | null;
}

/**
 * Унифицированный результат выполнения симуляции.
 */
export interface SimulationExecutionResult {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly engineVersion: string;
  readonly status: EngineReadinessStatus;
  readonly methodId: 'gongfu_cha' | 'liu_gen_pao' | 'lazy_mug';
  readonly disclaimer: string;
  readonly assumptionsNotes: string[];
  readonly teaSummary: {
    readonly id: string;
    readonly name: string;
    readonly category?: string;
    readonly leafMassGrams: number;
  };
  readonly thermalSummary?: SessionThermalSummary;
  readonly gongfuSteps?: GongfuStepSnapshot[];
  readonly liuGenPaoSteps?: LiuGenPaoStepSnapshot[];
  readonly lazyMugEvents?: LazyMugEventSnapshot[];
}

/**
 * Контракт математического ядра экстракции.
 */
export interface IExtractionEngine {
  readonly version: string;
  readonly readinessStatus: EngineReadinessStatus;

  simulate(
    config: BrewingSessionConfig,
    tea: TeaSample
  ): Promise<SimulationExecutionResult>;
}
