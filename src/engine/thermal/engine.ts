/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GongfuSessionConfig,
  LiuGenPaoSessionConfig,
  LazyMugSessionConfig,
  LazyMugTimelineEvent,
} from '../../domain/brewing/types.ts';
import {
  DEFAULT_AMBIENT_TEMPERATURE_C,
  DEFAULT_PREHEATED_VESSEL_TEMPERATURE_C,
  DEFAULT_INTER_INFUSION_PAUSE_SECONDS,
  DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
} from './constants.ts';
import { getVesselThermalProfile } from './profiles.ts';
import {
  solveThermalMixing,
  integrateThermalStep,
} from './integrator.ts';
import {
  ThermalSimulationOptions,
  ThermalStepResult,
  SessionThermalSummary,
  VesselThermalProfile,
} from './types.ts';

export interface ThermalSimulationOutput {
  readonly summary: SessionThermalSummary;
  readonly stepResults: ThermalStepResult[];
}

/**
 * Независимое математическое ядро теплового баланса (Этап 2A).
 * Не зависит от компонентов React и рассчитывает динамику температур жидкости и стенок посуды.
 */
export class BrewingThermalEngine {
  /**
   * Разрешение параметров моделирования и начального состояния сосуда.
   */
  private resolveOptions(
    vesselId: string,
    vesselVolumeMl: number,
    vesselMaterialFallback: any,
    options?: ThermalSimulationOptions
  ): {
    profile: VesselThermalProfile;
    ambientTemp: number;
    initialVesselTemp: number;
    isPreheated: boolean;
    interPause: number;
    dt: number;
  } {
    const profile = getVesselThermalProfile(vesselId, vesselMaterialFallback, vesselVolumeMl);
    const ambientTemp = options?.ambientTemperatureC ?? DEFAULT_AMBIENT_TEMPERATURE_C;
    const isPreheated = options?.isVesselPreheated ?? true;
    const initialVesselTemp = isPreheated
      ? (options?.preheatedVesselTemperatureC ?? DEFAULT_PREHEATED_VESSEL_TEMPERATURE_C)
      : ambientTemp;
    const interPause = options?.interInfusionPauseSeconds ?? DEFAULT_INTER_INFUSION_PAUSE_SECONDS;
    const dt = options?.integratorTimeStepSeconds ?? DEFAULT_INTEGRATOR_TIME_STEP_SECONDS;

    return {
      profile,
      ambientTemp,
      initialVesselTemp,
      isPreheated,
      interPause,
      dt,
    };
  }

  /**
   * Моделирование теплового баланса для метода Гунфу Ча (последовательные импульсные проливы).
   */
  simulateGongfu(
    session: GongfuSessionConfig,
    options?: ThermalSimulationOptions
  ): ThermalSimulationOutput {
    const { profile, ambientTemp, initialVesselTemp, isPreheated, interPause, dt } =
      this.resolveOptions(session.vessel.id, session.vessel.volumeMl, session.vessel.material, options);

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      // Проверка на вместимость сосуда
      if (step.pourWaterVolumeMl > session.vessel.volumeMl) {
        stepWarnings.push(
          `Объём заливки (${step.pourWaterVolumeMl} мл) превышает номинальную вместимость сосуда (${session.vessel.volumeMl} мл).`
        );
      }

      // При заливке свежей воды:
      // Температура воды на входе: step.waterTemperatureC
      // Температура стенок: currentVesselTemp
      const initialState = {
        liquidVolumeMl: step.pourWaterVolumeMl,
        liquidTemperatureC: step.waterTemperatureC,
        vesselTemperatureC: currentVesselTemp,
        ambientTemperatureC: ambientTemp,
        elapsedSeconds: 0,
      };

      const integration = integrateThermalStep(
        initialState,
        profile,
        step.infusionTimeSeconds,
        dt,
        Math.max(1, Math.round(step.infusionTimeSeconds / 30))
      );

      stepWarnings.push(...integration.warnings);

      stepResults.push({
        stepOrEventId: step.stepNumber,
        pourWaterTempC: step.waterTemperatureC,
        initialLiquidTempC: step.waterTemperatureC,
        finalLiquidTempC: integration.finalState.liquidTemperatureC,
        minLiquidTempC: integration.minLiquidTempC,
        maxLiquidTempC: integration.maxLiquidTempC,
        initialVesselTempC: currentVesselTemp,
        finalVesselTempC: integration.finalState.vesselTemperatureC,
        durationSeconds: step.infusionTimeSeconds,
        curveSamplePoints: integration.curvePoints,
        warnings: stepWarnings,
        assumptions: stepAssumptions,
      });

      // После слива настоя: пустой сосуд остывает на воздухе в течение паузы до следующего пролива
      if (i < session.steps.length - 1 && interPause > 0) {
        const pauseState = {
          liquidVolumeMl: 0,
          liquidTemperatureC: integration.finalState.vesselTemperatureC,
          vesselTemperatureC: integration.finalState.vesselTemperatureC,
          ambientTemperatureC: ambientTemp,
          elapsedSeconds: 0,
        };
        const pauseIntegration = integrateThermalStep(pauseState, profile, interPause, dt, interPause);
        currentVesselTemp = pauseIntegration.finalState.vesselTemperatureC;
      } else {
        currentVesselTemp = integration.finalState.vesselTemperatureC;
      }
    }

    const summary: SessionThermalSummary = {
      vesselProfile: profile,
      ambientTemperatureC: ambientTemp,
      isVesselPreheated: isPreheated,
      initialVesselTemperatureC: initialVesselTemp,
      interInfusionPauseSeconds: interPause,
      status: 'uncalibrated_model_profile',
      generalAssumptions: [
        `Двухузловая модель сосредоточенных теплоёмкостей (жидкость + стенки посуды).`,
        `Теплоёмкость воды принята c_p = 4184 Дж/(кг·К), плотность ρ = 1.0 г/мл (модельное приближение).`,
        `Профиль сосуда "${profile.name}": масса ${profile.vesselMassGrams} г, c_p = ${profile.materialSpecificHeatJPerKgK} Дж/(кг·К).`,
        isPreheated
          ? `Сосуд предварительно прогрет (принята модельная температура ${initialVesselTemp} °C).`
          : `Сосуд не прогрет (начальная температура равна температуре воздуха ${ambientTemp} °C).`,
        `Пауза между проливами принята ${interPause} с (модельное допущение охлаждения пустого сосуда на воздухе).`,
        `Капиллярное влагоудержание листом в текущей версии не рассчитывается (оставлено на этап 2B).`,
      ],
      warnings: generalWarnings,
    };

    return { summary, stepResults };
  }

  /**
   * Моделирование теплового баланса для метода Лю Гэнь Пао (сохранение корней настоя).
   */
  simulateLiuGenPao(
    session: LiuGenPaoSessionConfig,
    options?: ThermalSimulationOptions
  ): ThermalSimulationOutput {
    const { profile, ambientTemp, initialVesselTemp, isPreheated, dt } =
      this.resolveOptions(session.vessel.id, session.vessel.volumeMl, session.vessel.material, options);

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    let currentRetainedVolumeMl = 0;
    let currentRetainedTempC = 0;
    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      // 1. Смешение свежей воды с сохранённым остатком настоя по балансу тепловой энергии
      let mixedVolume: number;
      let mixedTemp: number;

      if (i === 0 || currentRetainedVolumeMl <= 0) {
        mixedVolume = step.addedWaterVolumeMl;
        mixedTemp = step.addedWaterTemperatureC;
      } else {
        const mix = solveThermalMixing(
          { volumeMl: currentRetainedVolumeMl, temperatureC: currentRetainedTempC },
          { volumeMl: step.addedWaterVolumeMl, temperatureC: step.addedWaterTemperatureC }
        );
        mixedVolume = mix.volumeMl;
        mixedTemp = mix.temperatureC;
      }

      if (mixedVolume > session.vessel.volumeMl) {
        stepWarnings.push(
          `Полный объём жидкости (${mixedVolume} мл) превышает номинальную вместимость сосуда (${session.vessel.volumeMl} мл).`
        );
      }

      // 2. Теплообмен смеси со стенками и воздухом во время экспозиции
      const initialState = {
        liquidVolumeMl: mixedVolume,
        liquidTemperatureC: mixedTemp,
        vesselTemperatureC: currentVesselTemp,
        ambientTemperatureC: ambientTemp,
        elapsedSeconds: 0,
      };

      const integration = integrateThermalStep(
        initialState,
        profile,
        step.infusionTimeSeconds,
        dt,
        Math.max(1, Math.round(step.infusionTimeSeconds / 30))
      );

      stepWarnings.push(...integration.warnings);

      stepResults.push({
        stepOrEventId: step.stepNumber,
        pourWaterTempC: step.addedWaterTemperatureC,
        initialLiquidTempC: mixedTemp,
        finalLiquidTempC: integration.finalState.liquidTemperatureC,
        minLiquidTempC: integration.minLiquidTempC,
        maxLiquidTempC: integration.maxLiquidTempC,
        initialVesselTempC: currentVesselTemp,
        finalVesselTempC: integration.finalState.vesselTemperatureC,
        durationSeconds: step.infusionTimeSeconds,
        curveSamplePoints: integration.curvePoints,
        warnings: stepWarnings,
        assumptions: stepAssumptions,
      });

      // 3. Разделение: слитая часть vs удержанный корень настоя
      const retainedFraction = Math.min(0.9, Math.max(0.1, step.retainedLiquorFractionOfTotal));
      currentRetainedVolumeMl = Math.round(mixedVolume * retainedFraction);
      currentRetainedTempC = integration.finalState.liquidTemperatureC;
      currentVesselTemp = integration.finalState.vesselTemperatureC;
    }

    const summary: SessionThermalSummary = {
      vesselProfile: profile,
      ambientTemperatureC: ambientTemp,
      isVesselPreheated: isPreheated,
      initialVesselTemperatureC: initialVesselTemp,
      interInfusionPauseSeconds: 0,
      status: 'uncalibrated_model_profile',
      generalAssumptions: [
        `Двухузловая модель сосредоточенных теплоёмкостей Лю Гэнь Пао.`,
        `Температура смеси на каждом шаге рассчитывается по балансу энергии смешения доливаемой воды и сохранённого корня настоя.`,
        `Стенки сосуда сохраняют текущую температуру в момент долива.`,
        `Профиль сосуда: ${profile.name} (c_p = ${profile.materialSpecificHeatJPerKgK} Дж/(кг·К)).`,
      ],
      warnings: generalWarnings,
    };

    return { summary, stepResults };
  }

  /**
   * Моделирование теплового баланса для ленивого заваривания в кружке (непрерывный контакт по шкале событий).
   */
  simulateLazyMug(
    session: LazyMugSessionConfig,
    options?: ThermalSimulationOptions
  ): ThermalSimulationOutput {
    const { profile, ambientTemp, initialVesselTemp, isPreheated, dt } =
      this.resolveOptions(session.vessel.id, session.vessel.volumeMl, session.vessel.material, options);

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    // Сортировка событий по временной шкале
    const sortedEvents = [...session.timelineEvents].sort((a, b) => a.timestampSeconds - b.timestampSeconds);

    let currentVolume = 0;
    let currentLiquidTemp = ambientTemp;
    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < sortedEvents.length; i++) {
      const evt = sortedEvents[i];
      const nextEvt: LazyMugTimelineEvent | undefined = sortedEvents[i + 1];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      let pourTemp = currentLiquidTemp;

      // Обработка дискретного мгновенного события
      if (evt.type === 'initial_pour') {
        currentVolume = evt.waterVolumeMl;
        currentLiquidTemp = evt.waterTemperatureC;
        pourTemp = evt.waterTemperatureC;

        if (currentVolume > session.vessel.volumeMl) {
          stepWarnings.push(
            `Начальный объём заливки (${currentVolume} мл) превышает вместимость кружки (${session.vessel.volumeMl} мл).`
          );
        }
      } else if (evt.type === 'sip_consumption') {
        // Отпивание уменьшает объём, температура жидкости в момент отпивания не меняется
        const prevVol = currentVolume;
        currentVolume = Math.max(0, currentVolume - evt.consumedVolumeMl);
        stepAssumptions.push(
          `Отпивание ${evt.consumedVolumeMl} мл: объём уменьшен с ${prevVol} до ${currentVolume} мл без мгновенного изменения температуры.`
        );
      } else if (evt.type === 'water_refill') {
        // Долив горячей воды: расчёт температуры смешения по балансу энергии
        pourTemp = evt.addedWaterTemperatureC;
        const mix = solveThermalMixing(
          { volumeMl: currentVolume, temperatureC: currentLiquidTemp },
          { volumeMl: evt.addedWaterVolumeMl, temperatureC: evt.addedWaterTemperatureC }
        );
        currentVolume = mix.volumeMl;
        currentLiquidTemp = mix.temperatureC;

        if (currentVolume > session.vessel.volumeMl) {
          stepWarnings.push(
            `После долива объём (${currentVolume} мл) превышает вместимость кружки (${session.vessel.volumeMl} мл).`
          );
        }
      } else if (evt.type === 'session_end') {
        stepAssumptions.push('Завершение сессии настаивания.');
      }

      // Непрерывное остывание между текущим событием и следующим
      const intervalDuration = nextEvt ? Math.max(0, nextEvt.timestampSeconds - evt.timestampSeconds) : 0;

      const initialState = {
        liquidVolumeMl: currentVolume,
        liquidTemperatureC: currentLiquidTemp,
        vesselTemperatureC: currentVesselTemp,
        ambientTemperatureC: ambientTemp,
        elapsedSeconds: 0,
      };

      const integration = integrateThermalStep(
        initialState,
        profile,
        intervalDuration,
        dt,
        Math.max(1, Math.round(intervalDuration / 20))
      );

      stepWarnings.push(...integration.warnings);

      stepResults.push({
        stepOrEventId: `event-${i}-${evt.type}`,
        pourWaterTempC: pourTemp,
        initialLiquidTempC: currentLiquidTemp,
        finalLiquidTempC: integration.finalState.liquidTemperatureC,
        minLiquidTempC: integration.minLiquidTempC,
        maxLiquidTempC: integration.maxLiquidTempC,
        initialVesselTempC: currentVesselTemp,
        finalVesselTempC: integration.finalState.vesselTemperatureC,
        durationSeconds: intervalDuration,
        curveSamplePoints: integration.curvePoints,
        warnings: stepWarnings,
        assumptions: stepAssumptions,
      });

      // Обновляем состояние на конец интервала
      currentLiquidTemp = integration.finalState.liquidTemperatureC;
      currentVesselTemp = integration.finalState.vesselTemperatureC;
    }

    const summary: SessionThermalSummary = {
      vesselProfile: profile,
      ambientTemperatureC: ambientTemp,
      isVesselPreheated: isPreheated,
      initialVesselTemperatureC: initialVesselTemp,
      interInfusionPauseSeconds: 0,
      status: 'uncalibrated_model_profile',
      generalAssumptions: [
        `Непрерывная тепловая модель открытого настаивания в кружке.`,
        `Между событиями отпивания и долива настой и стенки кружки непрерывно охлаждаются в окружающий воздух.`,
        `Отсутствие крышки учтено повышенным коэффициентом проводимости открытого зеркала жидкости (G_la = ${profile.conductanceLiquidAmbientWPerK} Вт/К).`,
        `Температура при доливе рассчитывается по балансу энергии смешения.`,
      ],
      warnings: generalWarnings,
    };

    return { summary, stepResults };
  }
}

export const thermalEngineInstance = new BrewingThermalEngine();
