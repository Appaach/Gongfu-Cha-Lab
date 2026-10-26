/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import {
  IExtractionEngine,
  SimulationExecutionResult,
  GongfuStepSnapshot,
  LiuGenPaoStepSnapshot,
  LazyMugEventSnapshot,
} from './types.ts';

/**
 * Базовая реализация ядра для Этапа 1.1.
 * Строго соблюдает контракт: формирует материальный каркас шагов/событий,
 * но честно оставляет кинетические и концентрационные показатели в значении null (pending_calibration).
 * Все гидродинамические балансы объемов являются упрощенными предварительными оценками.
 */
export class Stage1ExtractionEngine implements IExtractionEngine {
  readonly version = '0.1.1-audit';
  readonly readinessStatus = 'pending_calibration' as const;

  async simulate(
    config: BrewingSessionConfig,
    tea: TeaSample
  ): Promise<SimulationExecutionResult> {
    const assumptions: string[] = [
      'Расчёт диффузии и физико-химической экстракции веществ находится в разработке (Этап 3 плана реализации).',
      'Гидродинамические объёмы жидкости рассчитаны на основе базового материального баланса без учёта микрокапиллярного испарения.',
    ];

    let gongfuSteps: GongfuStepSnapshot[] | undefined;
    let liuGenPaoSteps: LiuGenPaoStepSnapshot[] | undefined;
    let lazyMugEvents: LazyMugEventSnapshot[] | undefined;

    if (config.methodId === 'gongfu_cha') {
      gongfuSteps = config.steps.map((step) => {
        // Упрощенная оценка: в методе Гунфу Ча настой сливается практически полностью
        const holdUp = 0; // капиллярное удержание будет подключено на Этапе 2
        const drained = step.pourWaterVolumeMl - holdUp;

        return {
          stepNumber: step.stepNumber,
          exposureTimeSeconds: step.infusionTimeSeconds,
          pourVolumeMl: step.pourWaterVolumeMl,
          drainedVolumeMl: drained,
          capillaryHoldUpMl: holdUp,
          temperatureC: step.waterTemperatureC,
          extractedSolidsMg: null,
          concentrationMgL: null,
          yieldPercent: null,
        };
      });
    } else if (config.methodId === 'liu_gen_pao') {
      let currentRetained = 0;
      liuGenPaoSteps = config.steps.map((step) => {
        const prevRetained = currentRetained;
        // Полный объём жидкости в сосуде перед сливом = остаток от прошлого шага + долитая свежая вода
        const totalBeforeDrain = prevRetained + step.addedWaterVolumeMl;
        // Доля удержания строго рассчитывается от ПОЛНОГО объёма в сосуде
        const retained = Math.round(totalBeforeDrain * step.retainedLiquorFractionOfTotal);
        const drained = totalBeforeDrain - retained;
        currentRetained = retained;

        return {
          stepNumber: step.stepNumber,
          exposureTimeSeconds: step.infusionTimeSeconds,
          addedWaterVolumeMl: step.addedWaterVolumeMl,
          previousRetainedLiquorMl: prevRetained,
          totalLiquorBeforeDrainMl: totalBeforeDrain,
          drainedVolumeMl: drained,
          retainedLiquorRemainingMl: retained,
          temperatureC: step.addedWaterTemperatureC,
          extractedSolidsMg: null,
          concentrationMgL: null,
          yieldPercent: null,
        };
      });
      assumptions.push('В методе Лю Гэнь Пао процент удержания рассчитывается строго от полного объёма жидкости в сосуде перед сливом.');
    } else if (config.methodId === 'lazy_mug') {
      let currentVol = 0;
      let currentTemp = config.baseWaterTemperatureC;

      lazyMugEvents = config.timelineEvents.map((evt) => {
        let desc = '';
        if (evt.type === 'initial_pour') {
          currentVol = evt.waterVolumeMl;
          currentTemp = evt.waterTemperatureC;
          desc = `Первоначальная заливка: ${evt.waterVolumeMl} мл воды при ${evt.waterTemperatureC}°C`;
        } else if (evt.type === 'sip_consumption') {
          currentVol = Math.max(0, currentVol - evt.consumedVolumeMl);
          desc = `Отпивание: выпито ${evt.consumedVolumeMl} мл (в кружке осталось ${currentVol} мл)`;
        } else if (evt.type === 'water_refill') {
          currentVol += evt.addedWaterVolumeMl;
          currentTemp = evt.addedWaterTemperatureC;
          desc = `Долив: добавлено ${evt.addedWaterVolumeMl} мл при ${evt.addedWaterTemperatureC}°C (стало ${currentVol} мл)`;
        } else if (evt.type === 'session_end') {
          desc = `Завершение сессии: в кружке осталось ${currentVol} мл`;
        }

        return {
          timestampSeconds: evt.timestampSeconds,
          eventType: evt.type,
          liquidVolumeInMugMl: currentVol,
          temperatureC: currentTemp,
          description: desc,
          extractedSolidsMg: null,
          concentrationMgL: null,
          yieldPercent: null,
        };
      });
      assumptions.push('Для ленивого заваривания представлен дискретный сценарий событий (модельное допущение, а не запись действий реального пользователя).');
    }

    return {
      sessionId: `sim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      engineVersion: this.version,
      status: this.readinessStatus,
      methodId: config.methodId,
      disclaimer: 'Расчёт физико-химической экстракции веществ находится в разработке (Этап 3). Псевдослучайные значения заблокированы архитектурным регламентом.',
      assumptionsNotes: assumptions,
      teaSummary: {
        id: tea.id,
        name: tea.name,
        category: tea.category,
        leafMassGrams: config.leafMassGrams,
      },
      gongfuSteps,
      liuGenPaoSteps,
      lazyMugEvents,
    };
  }
}

export const stage1EngineInstance: IExtractionEngine = new Stage1ExtractionEngine();
