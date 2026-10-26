/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import {
  IExtractionEngine,
  SimulationExecutionResult,
  StepExtractionSnapshot,
} from './types.ts';

/**
 * Базовая реализация ядра для Этапа 1.
 * Строго соблюдает контракт: формирует материальный каркас шагов, но честно
 * оставляет термодинамические и диффузионные показатели в значении null,
 * так как физико-химические формулы запланированы к интеграции на Этапе 3.
 */
export class Stage1ExtractionEngine implements IExtractionEngine {
  readonly version = '0.1.0-alpha';
  readonly readinessStatus = 'pending_calibration' as const;

  async simulate(
    config: BrewingSessionConfig,
    tea: TeaSample
  ): Promise<SimulationExecutionResult> {
    // Формируем гидродинамический каркас каждого шага
    const steps: StepExtractionSnapshot[] = config.steps.map((step) => {
      let drained = step.waterVolumeMl;
      let retained = 0;

      if (config.methodId === 'liu_gen_pao') {
        const retainedPct = step.retainedLiquorPercent ?? 40;
        retained = Math.round(step.waterVolumeMl * (retainedPct / 100));
        drained = step.waterVolumeMl - retained;
      } else if (config.methodId === 'lazy_mug') {
        // В кружке настой отпивается частями
        drained = Math.round(step.waterVolumeMl * 0.6);
        retained = step.waterVolumeMl - drained;
      }

      return {
        stepNumber: step.stepNumber,
        exposureTimeSeconds: step.infusionTimeSeconds,
        infusedVolumeMl: step.waterVolumeMl,
        drainedVolumeMl: drained,
        retainedVolumeMl: retained,
        averageTemperatureC: step.waterTemperatureC,
        extractedSolidsMg: null,
        concentrationMgL: null,
        leafExhaustionFraction: null,
        yieldPercent: null,
      };
    });

    return {
      sessionId: `sim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      engineVersion: this.version,
      status: this.readinessStatus,
      disclaimer: 'Расчёт физико-химической экстракции веществ находится в разработке (Этап 3 плана реализации). Псевдослучайные значения заблокированы архитектурным регламентом.',
      teaSummary: {
        id: tea.id,
        name: tea.name,
        category: tea.category,
        leafMassGrams: config.leafMassGrams,
      },
      steps,
    };
  }
}

export const stage1EngineInstance: IExtractionEngine = new Stage1ExtractionEngine();
