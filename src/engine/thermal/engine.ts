/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GongfuSessionConfig,
  LiuGenPaoSessionConfig,
  LazyMugSessionConfig,
  LazyMugTimelineEvent,
  VesselMaterial,
} from '../../domain/brewing/types.ts';
import {
  DEFAULT_AMBIENT_TEMPERATURE_C,
  DEFAULT_PREHEATED_VESSEL_TEMPERATURE_C,
  DEFAULT_INTER_INFUSION_PAUSE_SECONDS,
  DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS,
  DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
} from './constants.ts';
import {
  BrewingCapacityOverflowError,
  TimelineChronologyError,
  ThermalValidationError,
} from './errors.ts';
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
    vesselMaterialFallback: VesselMaterial,
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
   * Моделирование теплового баланса для метода Гунфу Ча (последовательные импульсные проливы с полным сливом).
   */
  simulateGongfu(
    session: GongfuSessionConfig,
    options?: ThermalSimulationOptions
  ): ThermalSimulationOutput {
    if (!session.steps || session.steps.length === 0) {
      throw new ThermalValidationError(
        'Сессия Гунфу Ча должна содержать как минимум один шаг заваривания.',
        'EMPTY_STEPS'
      );
    }

    const { profile, ambientTemp, initialVesselTemp, isPreheated, interPause, dt } =
      this.resolveOptions(session.vessel.id, session.vessel.volumeMl, session.vessel.material, options);

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      // Строгая валидация вместимости сосуда: физическое переполнение недопустимо
      if (step.pourWaterVolumeMl > session.vessel.volumeMl) {
        throw new BrewingCapacityOverflowError(
          `Объём заливки (${step.pourWaterVolumeMl} мл) превышает номинальную вместимость сосуда (${session.vessel.volumeMl} мл) на шаге #${step.stepNumber}. Физическое переполнение заварочного сосуда невозможно.`,
          session.vessel.volumeMl,
          step.pourWaterVolumeMl,
          step.stepNumber
        );
      }

      if (step.pourWaterVolumeMl <= 0) {
        throw new ThermalValidationError(
          `Объём заливки на шаге #${step.stepNumber} должен быть строго положительным (${step.pourWaterVolumeMl} мл).`,
          'INVALID_POUR_VOLUME',
          'pourWaterVolumeMl',
          step.pourWaterVolumeMl
        );
      }

      // Начальное состояние перед проливом:
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

      // После слива настоя: пустой сосуд (liquidVolumeMl = 0, liquidTemperatureC = null)
      // остывает на воздухе в течение паузы до следующего пролива
      if (i < session.steps.length - 1 && interPause > 0) {
        const pauseState = {
          liquidVolumeMl: 0,
          liquidTemperatureC: null, // Пустой сосуд: Unknown ≠ 0
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
        `Теплоёмкость воды принята c_p = 4184.0 Дж/(кг·К) (IAPWS-IF97), плотность ρ = 1.0 г/мл.`,
        `Профиль сосуда "${profile.name}": масса ${profile.vesselMassGrams} г, c_p = ${profile.materialSpecificHeatJPerKgK} Дж/(кг·К).`,
        isPreheated
          ? `Сосуд предварительно прогрет (модельная температура стенок ${initialVesselTemp} °C).`
          : `Сосуд не прогрет (начальная температура равна температуре воздуха ${ambientTemp} °C).`,
        `Пауза между проливами принята ${interPause} с (охлаждение сухого пустого сосуда на воздухе).`,
        `Капиллярное влагоудержание листом в текущей версии не рассчитывается (Этап 2B).`,
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
    if (!session.steps || session.steps.length === 0) {
      throw new ThermalValidationError(
        'Сессия Лю Гэнь Пао должна содержать как минимум один шаг заваривания.',
        'EMPTY_STEPS'
      );
    }

    const { profile, ambientTemp, initialVesselTemp, isPreheated, dt } =
      this.resolveOptions(session.vessel.id, session.vessel.volumeMl, session.vessel.material, options);

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    let currentRetainedVolumeMl = 0;
    let currentRetainedTempC: number | null = null;
    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      // 1. Смешение свежей воды с сохранённым остатком («корнем») настоя
      let mixedVolume: number;
      let mixedTemp: number | null;

      if (i === 0 || currentRetainedVolumeMl <= 0 || currentRetainedTempC === null) {
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

      // Строгая валидация вместимости: объём жидкости не может превышать объём сосуда
      if (mixedVolume > session.vessel.volumeMl) {
        throw new BrewingCapacityOverflowError(
          `Суммарный объём жидкости (${mixedVolume} мл: остаток корня ${currentRetainedVolumeMl} мл + долив ${step.addedWaterVolumeMl} мл) превышает вместимость сосуда (${session.vessel.volumeMl} мл) на шаге #${step.stepNumber}. Физическое переполнение невозможно.`,
          session.vessel.volumeMl,
          mixedVolume,
          step.stepNumber
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
      interInfusionPauseSeconds: DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS,
      status: 'uncalibrated_model_profile',
      generalAssumptions: [
        `Двухузловая модель сосредоточенных теплоёмкостей Лю Гэнь Пао.`,
        `Температура смеси на каждом шаге рассчитывается по балансу энергии смешения доливаемой воды и сохранённого корня настоя.`,
        `Пауза между проливами Лю Гэнь Пао принята равной ${DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS} с (непрерывная серия доливов).`,
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
    if (!session.timelineEvents || session.timelineEvents.length === 0) {
      throw new ThermalValidationError(
        'Сессия заваривания в кружке должна содержать как минимум одно событие на временной шкале.',
        'EMPTY_TIMELINE'
      );
    }

    // 1. Строгая валидация хронологии временной шкалы событий
    const events = session.timelineEvents;
    let foundSessionEnd = false;

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];

      // Запрет отрицательных меток времени
      if (!Number.isFinite(evt.timestampSeconds) || evt.timestampSeconds < 0) {
        throw new TimelineChronologyError(
          `Метка времени события #${i} (${evt.type}) не может быть отрицательной или NaN: ${evt.timestampSeconds} с.`,
          i,
          evt.timestampSeconds
        );
      }

      // Запрет событий после завершения сессии
      if (foundSessionEnd) {
        throw new TimelineChronologyError(
          `Обнаружено событие #${i} (${evt.type}) после окончания сессии (session_end). Завершающее событие должно быть строго последним на шкале.`,
          i,
          evt.timestampSeconds
        );
      }

      if (evt.type === 'session_end') {
        foundSessionEnd = true;
      }

      // Проверка хронологического порядка и отсутствия конфликтующих одинаковых меток
      if (i > 0) {
        const prev = events[i - 1];
        if (evt.timestampSeconds < prev.timestampSeconds) {
          throw new TimelineChronologyError(
            `Нарушение хронологического порядка: событие #${i} (${evt.type}, ${evt.timestampSeconds} с) следует раньше события #${i - 1} (${prev.type}, ${prev.timestampSeconds} с).`,
            i,
            evt.timestampSeconds
          );
        }
        if (evt.timestampSeconds === prev.timestampSeconds) {
          throw new TimelineChronologyError(
            `Конфликт событий #${i - 1} и #${i}: обнаружены одинаковые временные метки (${evt.timestampSeconds} с). Время должно монотонно возрастать.`,
            i,
            evt.timestampSeconds
          );
        }
      }
    }

    const { profile, ambientTemp, initialVesselTemp, isPreheated, dt } =
      this.resolveOptions(session.vessel.id, session.vessel.volumeMl, session.vessel.material, options);

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    let currentVolume = 0;
    let currentLiquidTemp: number | null = null;
    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      const nextEvt: LazyMugTimelineEvent | undefined = events[i + 1];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      let pourTemp = currentLiquidTemp ?? ambientTemp;

      // Обработка дискретного мгновенного события
      if (evt.type === 'initial_pour') {
        if (evt.waterVolumeMl > session.vessel.volumeMl) {
          throw new BrewingCapacityOverflowError(
            `Начальный объём заливки (${evt.waterVolumeMl} мл) превышает вместимость кружки (${session.vessel.volumeMl} мл). Физическое переполнение невозможно.`,
            session.vessel.volumeMl,
            evt.waterVolumeMl,
            'initial_pour'
          );
        }
        if (evt.waterVolumeMl <= 0) {
          throw new ThermalValidationError(
            `Начальный объём заливки воды должен быть положительным (${evt.waterVolumeMl} мл).`,
            'INVALID_POUR_VOLUME',
            'waterVolumeMl',
            evt.waterVolumeMl
          );
        }

        currentVolume = evt.waterVolumeMl;
        currentLiquidTemp = evt.waterTemperatureC;
        pourTemp = evt.waterTemperatureC;
      } else if (evt.type === 'sip_consumption') {
        // Валидация объёма отпивания
        if (evt.consumedVolumeMl <= 0) {
          throw new ThermalValidationError(
            `Объём отпивания должен быть строго больше нуля (${evt.consumedVolumeMl} мл).`,
            'INVALID_SIP_VOLUME',
            'consumedVolumeMl',
            evt.consumedVolumeMl
          );
        }
        if (evt.consumedVolumeMl > currentVolume) {
          throw new ThermalValidationError(
            `Объём отпивания (${evt.consumedVolumeMl} мл) превышает текущий объём жидкости в кружке (${currentVolume} мл). Невозможно отпить больше содержимого.`,
            'SIP_EXCEEDS_VOLUME',
            'consumedVolumeMl',
            evt.consumedVolumeMl
          );
        }

        const prevVol = currentVolume;
        currentVolume = currentVolume - evt.consumedVolumeMl;
        stepAssumptions.push(
          `Отпивание ${evt.consumedVolumeMl} мл: объём уменьшен с ${prevVol} до ${currentVolume} мл.`
        );

        if (currentVolume === 0) {
          currentLiquidTemp = null; // Кружка полностью осушена
        }
      } else if (evt.type === 'water_refill') {
        if (evt.addedWaterVolumeMl <= 0) {
          throw new ThermalValidationError(
            `Объём долива воды должен быть положительным (${evt.addedWaterVolumeMl} мл).`,
            'INVALID_REFILL_VOLUME',
            'addedWaterVolumeMl',
            evt.addedWaterVolumeMl
          );
        }

        const projectedVolume = currentVolume + evt.addedWaterVolumeMl;
        if (projectedVolume > session.vessel.volumeMl) {
          throw new BrewingCapacityOverflowError(
            `После долива суммарный объём (${projectedVolume} мл: остаток ${currentVolume} мл + долив ${evt.addedWaterVolumeMl} мл) превышает вместимость кружки (${session.vessel.volumeMl} мл).`,
            session.vessel.volumeMl,
            projectedVolume,
            'water_refill'
          );
        }

        pourTemp = evt.addedWaterTemperatureC;
        const mix = solveThermalMixing(
          { volumeMl: currentVolume, temperatureC: currentLiquidTemp },
          { volumeMl: evt.addedWaterVolumeMl, temperatureC: evt.addedWaterTemperatureC }
        );
        currentVolume = mix.volumeMl;
        currentLiquidTemp = mix.temperatureC;
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
