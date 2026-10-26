/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrewingSessionConfig } from '../../domain/brewing/types.ts';
import { TeaSample } from '../../domain/tea/types.ts';
import { thermalEngineInstance } from '../thermal/engine.ts';
import { ThermalSimulationOptions } from '../thermal/types.ts';
import {
  IExtractionEngine,
  SimulationExecutionResult,
  GongfuStepSnapshot,
  LiuGenPaoStepSnapshot,
  LazyMugEventSnapshot,
} from './types.ts';

/**
 * Расчётное ядро Gongfu Cha Lab для Этапа 2A (Тепловая модель заваривания).
 *
 * Интегрирует:
 * 1. Гидродинамический каркас методов (полный слив Гунфу Ча, удержание корня Лю Гэнь Пао, событийная шкала кружки).
 * 2. Двухузловую термодинамическую модель баланса тепла (жидкость + стенки сосуда + окружающая среда).
 *
 * Честно соблюдает научный регламент:
 * - Все кинетические концентрации (TDS, кофеин, теанин, полифенолы) остаются null (status: pending_calibration);
 * - Псевдослучайные числа и фиксированные эмпирические поправки заблокированы;
 * - Все тепловые профили сосудов явно помечены статусом 'model_profile' до лабораторной калибровки.
 */
export class Stage1ExtractionEngine implements IExtractionEngine {
  readonly version = '0.2.0-thermal-2a';
  readonly readinessStatus = 'pending_calibration' as const;

  async simulate(
    config: BrewingSessionConfig,
    tea: TeaSample
  ): Promise<SimulationExecutionResult> {
    const assumptions: string[] = [
      'Расчёт диффузии и физико-химической экстракции веществ находится в разработке (Этап 3 плана реализации). Концентрации и TDS строго равны null.',
      'Тепловая модель (Этап 2A): двухузловой численный расчёт температур жидкости и стенок посуды по схеме Рунге-Кутты 2-го порядка.',
      'Гидродинамические объёмы жидкости рассчитаны на основе базового материального баланса без учёта микрокапиллярного испарения.',
    ];

    const thermalOptions: ThermalSimulationOptions = {
      isVesselPreheated: config.isVesselPreheated ?? true,
      ambientTemperatureC: config.ambientTemperatureC ?? 22.0,
      preheatedVesselTemperatureC: config.preheatedVesselTemperatureC,
      interInfusionPauseSeconds: config.interInfusionPauseSeconds,
    };

    let gongfuSteps: GongfuStepSnapshot[] | undefined;
    let liuGenPaoSteps: LiuGenPaoStepSnapshot[] | undefined;
    let lazyMugEvents: LazyMugEventSnapshot[] | undefined;
    let thermalSummary = undefined;

    if (config.methodId === 'gongfu_cha') {
      const thermalResult = thermalEngineInstance.simulateGongfu(config, thermalOptions);
      thermalSummary = thermalResult.summary;
      assumptions.push(...thermalResult.summary.generalAssumptions);

      gongfuSteps = config.steps.map((step, idx) => {
        const thermalStep = thermalResult.stepResults[idx];
        const holdUp = 0; // Капиллярное удержание будет подключено на Этапе 2B
        const drained = step.pourWaterVolumeMl - holdUp;

        return {
          stepNumber: step.stepNumber,
          exposureTimeSeconds: step.infusionTimeSeconds,
          pourVolumeMl: step.pourWaterVolumeMl,
          drainedVolumeMl: drained,
          capillaryHoldUpMl: holdUp,

          pourTemperatureC: thermalStep ? thermalStep.pourWaterTempC : step.waterTemperatureC,
          startLiquidTemperatureC: thermalStep ? thermalStep.initialLiquidTempC : step.waterTemperatureC,
          finalLiquidTemperatureC: thermalStep ? thermalStep.finalLiquidTempC : step.waterTemperatureC,
          minLiquidTemperatureC: thermalStep ? thermalStep.minLiquidTempC : step.waterTemperatureC,
          maxLiquidTemperatureC: thermalStep ? thermalStep.maxLiquidTempC : step.waterTemperatureC,
          startVesselTemperatureC: thermalStep ? thermalStep.initialVesselTempC : (thermalOptions.isVesselPreheated ? 75 : 22),
          finalVesselTemperatureC: thermalStep ? thermalStep.finalVesselTempC : (thermalOptions.isVesselPreheated ? 75 : 22),
          temperatureC: thermalStep && thermalStep.finalLiquidTempC !== null ? Math.round(thermalStep.finalLiquidTempC * 10) / 10 : step.waterTemperatureC,

          thermalCurveSamplePoints: thermalStep?.curveSamplePoints,
          thermalWarnings: thermalStep?.warnings,

          extractedSolidsMg: null,
          concentrationMgL: null,
          yieldPercent: null,
        };
      });
    } else if (config.methodId === 'liu_gen_pao') {
      const thermalResult = thermalEngineInstance.simulateLiuGenPao(config, thermalOptions);
      thermalSummary = thermalResult.summary;
      assumptions.push(...thermalResult.summary.generalAssumptions);

      let currentRetained = 0;
      liuGenPaoSteps = config.steps.map((step, idx) => {
        const thermalStep = thermalResult.stepResults[idx];
        const prevRetained = currentRetained;
        const totalBeforeDrain = prevRetained + step.addedWaterVolumeMl;
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

          pourTemperatureC: thermalStep ? thermalStep.pourWaterTempC : step.addedWaterTemperatureC,
          startLiquidTemperatureC: thermalStep ? thermalStep.initialLiquidTempC : step.addedWaterTemperatureC,
          finalLiquidTemperatureC: thermalStep ? thermalStep.finalLiquidTempC : step.addedWaterTemperatureC,
          minLiquidTemperatureC: thermalStep ? thermalStep.minLiquidTempC : step.addedWaterTemperatureC,
          maxLiquidTemperatureC: thermalStep ? thermalStep.maxLiquidTempC : step.addedWaterTemperatureC,
          startVesselTemperatureC: thermalStep ? thermalStep.initialVesselTempC : (thermalOptions.isVesselPreheated ? 75 : 22),
          finalVesselTemperatureC: thermalStep ? thermalStep.finalVesselTempC : (thermalOptions.isVesselPreheated ? 75 : 22),
          temperatureC: thermalStep && thermalStep.finalLiquidTempC !== null ? Math.round(thermalStep.finalLiquidTempC * 10) / 10 : step.addedWaterTemperatureC,

          thermalCurveSamplePoints: thermalStep?.curveSamplePoints,
          thermalWarnings: thermalStep?.warnings,

          extractedSolidsMg: null,
          concentrationMgL: null,
          yieldPercent: null,
        };
      });
      assumptions.push('В методе Лю Гэнь Пао процент удержания рассчитывается строго от полного объёма жидкости в сосуде перед сливом.');
    } else if (config.methodId === 'lazy_mug') {
      const thermalResult = thermalEngineInstance.simulateLazyMug(config, thermalOptions);
      thermalSummary = thermalResult.summary;
      assumptions.push(...thermalResult.summary.generalAssumptions);

      let currentVol = 0;

      lazyMugEvents = config.timelineEvents.map((evt, idx) => {
        const thermalStep = thermalResult.stepResults[idx];
        let desc = '';
        if (evt.type === 'initial_pour') {
          currentVol = evt.waterVolumeMl;
          desc = `Первоначальная заливка: ${evt.waterVolumeMl} мл воды при ${evt.waterTemperatureC}°C`;
        } else if (evt.type === 'sip_consumption') {
          currentVol = Math.max(0, currentVol - evt.consumedVolumeMl);
          desc = `Отпивание: выпито ${evt.consumedVolumeMl} мл (в кружке осталось ${currentVol} мл)`;
        } else if (evt.type === 'water_refill') {
          currentVol += evt.addedWaterVolumeMl;
          desc = `Долив: добавлено ${evt.addedWaterVolumeMl} мл при ${evt.addedWaterTemperatureC}°C (стало ${currentVol} мл)`;
        } else if (evt.type === 'session_end') {
          desc = `Завершение сессии: в кружке осталось ${currentVol} мл`;
        }

        const liquidTemp = thermalStep && thermalStep.finalLiquidTempC !== null
          ? Math.round(thermalStep.finalLiquidTempC * 10) / 10
          : (currentVol > 0 ? config.baseWaterTemperatureC : null);

        return {
          timestampSeconds: evt.timestampSeconds,
          eventType: evt.type,
          liquidVolumeInMugMl: currentVol,
          description: desc,

          pourTemperatureC: thermalStep ? thermalStep.pourWaterTempC : config.baseWaterTemperatureC,
          startLiquidTemperatureC: thermalStep ? thermalStep.initialLiquidTempC : liquidTemp,
          finalLiquidTemperatureC: thermalStep ? thermalStep.finalLiquidTempC : liquidTemp,
          minLiquidTemperatureC: thermalStep ? thermalStep.minLiquidTempC : liquidTemp,
          maxLiquidTemperatureC: thermalStep ? thermalStep.maxLiquidTempC : liquidTemp,
          startVesselTemperatureC: thermalStep ? thermalStep.initialVesselTempC : 22,
          finalVesselTemperatureC: thermalStep ? thermalStep.finalVesselTempC : 22,
          temperatureC: liquidTemp,

          thermalCurveSamplePoints: thermalStep?.curveSamplePoints,
          thermalWarnings: thermalStep?.warnings,

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
      disclaimer: 'Расчёт физико-химической экстракции веществ находится в разработке (Этап 3). Тепловой расчёт выполнен по двухузловой физической модели сосредоточенных теплоёмкостей (Этап 2A).',
      assumptionsNotes: assumptions,
      teaSummary: {
        id: tea.id,
        name: tea.name,
        category: tea.category,
        leafMassGrams: config.leafMassGrams,
      },
      thermalSummary,
      gongfuSteps,
      liuGenPaoSteps,
      lazyMugEvents,
    };
  }
}

export const stage1EngineInstance: IExtractionEngine = new Stage1ExtractionEngine();
