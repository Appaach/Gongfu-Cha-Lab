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

/**
 * Гидродинамический снимок шага Гунфу Ча (полный слив).
 */
export interface GongfuStepSnapshot {
  readonly stepNumber: number;
  readonly exposureTimeSeconds: number;
  readonly pourVolumeMl: number;
  readonly drainedVolumeMl: number;
  readonly capillaryHoldUpMl: number;
  readonly temperatureC: number;

  // Величины, ожидающие калибровки физического ядра (Этап 3)
  readonly extractedSolidsMg: number | null;
  readonly concentrationMgL: number | null;
  readonly yieldPercent: number | null;
}

/**
 * Гидродинамический снимок шага Лю Гэнь Пао (сохранение корней).
 */
export interface LiuGenPaoStepSnapshot {
  readonly stepNumber: number;
  readonly exposureTimeSeconds: number;
  readonly addedWaterVolumeMl: number;
  readonly previousRetainedLiquorMl: number;
  readonly totalLiquorBeforeDrainMl: number; // Полный объем жидкости в сосуде перед сливом
  readonly drainedVolumeMl: number;          // Слитая порция
  readonly retainedLiquorRemainingMl: number; // Оставшийся корень настоя
  readonly temperatureC: number;

  readonly extractedSolidsMg: number | null;
  readonly concentrationMgL: number | null;
  readonly yieldPercent: number | null;
}

/**
 * Гидродинамический снимок события в кружке (непрерывный контакт).
 */
export interface LazyMugEventSnapshot {
  readonly timestampSeconds: number;
  readonly eventType: string;
  readonly liquidVolumeInMugMl: number;
  readonly temperatureC: number;
  readonly description: string;

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
