/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';

/**
 * Статус математического расчётного ядра.
 * На текущем этапе (Этап 1) ядро честно декларирует статус `pending_calibration`
 * и не производит вычислений на вымышленных коэффициентах.
 */
export type EngineReadinessStatus = 'ready' | 'pending_calibration' | 'uncalibrated';

/**
 * Структура снимка шага экстракции (подготовленный интерфейс для будущих данных Этапа 3).
 */
export interface StepExtractionSnapshot {
  readonly stepNumber: number;
  readonly exposureTimeSeconds: number;
  readonly infusedVolumeMl: number;
  readonly drainedVolumeMl: number;
  readonly retainedVolumeMl: number;
  readonly averageTemperatureC: number;
  
  // Расчётные величины (на этапе 1 равны null со статусом pending_calibration)
  readonly extractedSolidsMg: number | null; // Масса экстрагированных веществ за шаг (мг)
  readonly concentrationMgL: number | null;  // Концентрация настоя / TDS (мг/л)
  readonly leafExhaustionFraction: number | null; // Накопленная доля исчерпания водорастворимого резервуара (0.0 – 1.0)
  readonly yieldPercent: number | null; // % экстракции от массы сухого листа
}

/**
 * Итоговый результат выполнения симуляции.
 */
export interface SimulationExecutionResult {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly engineVersion: string;
  readonly status: EngineReadinessStatus;
  readonly disclaimer: string;
  readonly teaSummary: {
    readonly id: string;
    readonly name: string;
    readonly category: string;
    readonly leafMassGrams: number;
  };
  readonly steps: StepExtractionSnapshot[];
}

/**
 * Контракт математического ядра экстракции.
 * Интерфейс спроектирован так, чтобы алгоритм можно было заменить или обновить
 * без модификации компонентов интерфейса.
 */
export interface IExtractionEngine {
  readonly version: string;
  readonly readinessStatus: EngineReadinessStatus;

  /**
   * Запуск моделирования сессии заваривания.
   */
  simulate(
    config: BrewingSessionConfig,
    tea: TeaSample
  ): Promise<SimulationExecutionResult>;
}
