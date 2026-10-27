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
  MIN_INTEGRATOR_TIME_STEP_SECONDS,
  MAX_INTEGRATOR_TIME_STEP_SECONDS,
} from './constants.ts';
import {
  BrewingCapacityOverflowError,
  TimelineChronologyError,
  ThermalValidationError,
  ThermalRangeError,
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
   * Разрешение параметров моделирования и начального состояния сосуда со строгой валидацией входных настроек.
   */
  private resolveOptions(
    vesselId: string,
    vesselVolumeMl: number,
    vesselMaterialFallback: VesselMaterial,
    options?: ThermalSimulationOptions,
    defaultPauseSeconds: number = DEFAULT_INTER_INFUSION_PAUSE_SECONDS
  ): {
    profile: VesselThermalProfile;
    ambientTemp: number;
    initialVesselTemp: number;
    isPreheated: boolean;
    interPause: number;
    dt: number;
  } {
    const profile = getVesselThermalProfile(vesselId, vesselMaterialFallback, vesselVolumeMl);

    // Валидация температуры окружающей среды
    let ambientTemp = DEFAULT_AMBIENT_TEMPERATURE_C;
    if (options?.ambientTemperatureC !== undefined) {
      if (!Number.isFinite(options.ambientTemperatureC) || options.ambientTemperatureC < -50 || options.ambientTemperatureC > 80) {
        throw new ThermalValidationError(
          `Температура окружающей среды (${options.ambientTemperatureC} °C) выходит за физически допустимые пределы помещения (-50..+80 °C).`,
          'INVALID_AMBIENT_TEMPERATURE',
          'ambientTemperatureC',
          options.ambientTemperatureC
        );
      }
      ambientTemp = options.ambientTemperatureC;
    }

    const isPreheated = options?.isVesselPreheated ?? true;

    // Валидация температуры прогрева сосуда
    let initialVesselTemp = ambientTemp;
    if (isPreheated) {
      if (options?.preheatedVesselTemperatureC !== undefined) {
        if (!Number.isFinite(options.preheatedVesselTemperatureC) || options.preheatedVesselTemperatureC < 0 || options.preheatedVesselTemperatureC > 150) {
          throw new ThermalValidationError(
            `Температура предварительно прогретого сосуда (${options.preheatedVesselTemperatureC} °C) выходит за допустимые пределы (0..+150 °C).`,
            'INVALID_PREHEATED_VESSEL_TEMPERATURE',
            'preheatedVesselTemperatureC',
            options.preheatedVesselTemperatureC
          );
        }
        initialVesselTemp = options.preheatedVesselTemperatureC;
      } else {
        initialVesselTemp = DEFAULT_PREHEATED_VESSEL_TEMPERATURE_C;
      }
    }

    // Валидация паузы между проливами
    let interPause = defaultPauseSeconds;
    if (options?.interInfusionPauseSeconds !== undefined) {
      if (!Number.isFinite(options.interInfusionPauseSeconds) || options.interInfusionPauseSeconds < 0) {
        throw new ThermalValidationError(
          `Пауза между проливами не может быть отрицательной или NaN: ${options.interInfusionPauseSeconds} с.`,
          'INVALID_PAUSE_DURATION',
          'interInfusionPauseSeconds',
          options.interInfusionPauseSeconds
        );
      }
      interPause = options.interInfusionPauseSeconds;
    }

    // Валидация шага численного интегратора
    let dt = DEFAULT_INTEGRATOR_TIME_STEP_SECONDS;
    if (options?.integratorTimeStepSeconds !== undefined) {
      if (
        !Number.isFinite(options.integratorTimeStepSeconds) ||
        options.integratorTimeStepSeconds < MIN_INTEGRATOR_TIME_STEP_SECONDS ||
        options.integratorTimeStepSeconds > MAX_INTEGRATOR_TIME_STEP_SECONDS
      ) {
        throw new ThermalValidationError(
          `Шаг численного интегрирования (${options.integratorTimeStepSeconds} с) выходит за допустимый диапазон [${MIN_INTEGRATOR_TIME_STEP_SECONDS}, ${MAX_INTEGRATOR_TIME_STEP_SECONDS}] с.`,
          'INVALID_TIME_STEP',
          'integratorTimeStepSeconds',
          options.integratorTimeStepSeconds
        );
      }
      dt = options.integratorTimeStepSeconds;
    }

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

      // Строгая валидация параметров шага
      if (!Number.isFinite(step.waterTemperatureC) || step.waterTemperatureC < 0 || step.waterTemperatureC > 100) {
        throw new ThermalRangeError(
          `Температура заливаемой воды (${step.waterTemperatureC} °C) на шаге #${step.stepNumber} выходит за пределы жидкой фазы (0–100 °C).`,
          'waterTemperatureC',
          step.waterTemperatureC
        );
      }

      if (!Number.isFinite(step.pourWaterVolumeMl) || step.pourWaterVolumeMl <= 0) {
        throw new ThermalValidationError(
          `Объём заливки на шаге #${step.stepNumber} должен быть строго положительным числом (${step.pourWaterVolumeMl} мл).`,
          'INVALID_POUR_VOLUME',
          'pourWaterVolumeMl',
          step.pourWaterVolumeMl
        );
      }

      // Строгая валидация вместимости сосуда: физическое переполнение недопустимо
      if (step.pourWaterVolumeMl > session.vessel.volumeMl) {
        throw new BrewingCapacityOverflowError(
          `Объём заливки (${step.pourWaterVolumeMl} мл) превышает номинальную вместимость сосуда (${session.vessel.volumeMl} мл) на шаге #${step.stepNumber}. Физическое переполнение заварочного сосуда невозможно.`,
          session.vessel.volumeMl,
          step.pourWaterVolumeMl,
          step.stepNumber
        );
      }

      if (!Number.isFinite(step.infusionTimeSeconds) || step.infusionTimeSeconds < 0) {
        throw new ThermalValidationError(
          `Время экстракции на шаге #${step.stepNumber} не может быть отрицательным: ${step.infusionTimeSeconds} с.`,
          'INVALID_INFUSION_TIME',
          'infusionTimeSeconds',
          step.infusionTimeSeconds
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

    const { profile, ambientTemp, initialVesselTemp, isPreheated, interPause, dt } =
      this.resolveOptions(
        session.vessel.id,
        session.vessel.volumeMl,
        session.vessel.material,
        options,
        DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS
      );

    const stepResults: ThermalStepResult[] = [];
    const generalWarnings: string[] = [];

    let currentRetainedVolumeMl = 0;
    let currentRetainedTempC: number | null = null;
    let currentVesselTemp = initialVesselTemp;

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];
      const stepWarnings: string[] = [];
      const stepAssumptions: string[] = [];

      // Валидация входных параметров шага
      if (!Number.isFinite(step.addedWaterVolumeMl) || step.addedWaterVolumeMl <= 0) {
        throw new ThermalValidationError(
          `Объём доливаемой воды на шаге #${step.stepNumber} должен быть строго положительным числом (${step.addedWaterVolumeMl} мл).`,
          'INVALID_ADDED_VOLUME',
          'addedWaterVolumeMl',
          step.addedWaterVolumeMl
        );
      }

      if (!Number.isFinite(step.addedWaterTemperatureC) || step.addedWaterTemperatureC < 0 || step.addedWaterTemperatureC > 100) {
        throw new ThermalRangeError(
          `Температура доливаемой воды (${step.addedWaterTemperatureC} °C) на шаге #${step.stepNumber} выходит за пределы жидкой фазы (0–100 °C).`,
          'addedWaterTemperatureC',
          step.addedWaterTemperatureC
        );
      }

      if (!Number.isFinite(step.infusionTimeSeconds) || step.infusionTimeSeconds < 0) {
        throw new ThermalValidationError(
          `Время настаивания на шаге #${step.stepNumber} не может быть отрицательным: ${step.infusionTimeSeconds} с.`,
          'INVALID_INFUSION_TIME',
          'infusionTimeSeconds',
          step.infusionTimeSeconds
        );
      }

      if (
        !Number.isFinite(step.retainedLiquorFractionOfTotal) ||
        step.retainedLiquorFractionOfTotal < 0 ||
        step.retainedLiquorFractionOfTotal >= 1.0
      ) {
        throw new ThermalValidationError(
          `Доля удерживаемого корня настоя на шаге #${step.stepNumber} должна быть конечным числом в диапазоне [0, 1.0) (получено: ${step.retainedLiquorFractionOfTotal}). Недопустимо молча подменять её через Math.min/Math.max.`,
          'INVALID_RETAINED_FRACTION',
          'retainedLiquorFractionOfTotal',
          step.retainedLiquorFractionOfTotal
        );
      }

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
      const retainedFraction = step.retainedLiquorFractionOfTotal;
      currentRetainedVolumeMl = Math.round(mixedVolume * retainedFraction);
      currentRetainedTempC = integration.finalState.liquidTemperatureC;
      currentVesselTemp = integration.finalState.vesselTemperatureC;
    }

    const summary: SessionThermalSummary = {
      vesselProfile: profile,
      ambientTemperatureC: ambientTemp,
      isVesselPreheated: isPreheated,
      initialVesselTemperatureC: initialVesselTemp,
      interInfusionPauseSeconds: interPause,
      status: 'uncalibrated_model_profile',
      generalAssumptions: [
        `Двухузловая модель сосредоточенных теплоёмкостей Лю Гэнь Пао.`,
        `Температура смеси на каждом шаге рассчитывается по балансу энергии смешения доливаемой воды и сохранённого корня настоя.`,
        `Пауза между проливами Лю Гэнь Пао принята равной ${interPause} с.`,
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
    const events = session.timelineEvents;

    // 1. Валидация наличия событий и минимальной структуры
    if (!events || events.length === 0) {
      throw new ThermalValidationError(
        'Сессия заваривания в кружке должна содержать как минимум события initial_pour и session_end.',
        'EMPTY_TIMELINE'
      );
    }

    if (events.length < 2) {
      throw new TimelineChronologyError(
        'Сессия заваривания в кружке должна содержать как минимум 2 события: начальный пролив (initial_pour) и окончание сессии (session_end).',
        0
      );
    }

    // Первым событием обязательно должен быть initial_pour с timestampSeconds === 0
    if (events[0].type !== 'initial_pour') {
      throw new TimelineChronologyError(
        `Первым событием шкалы заваривания в кружке обязательно должен быть initial_pour (получено: ${events[0].type}).`,
        0,
        events[0].type
      );
    }
    if (events[0].timestampSeconds !== 0) {
      throw new TimelineChronologyError(
        `Первое событие initial_pour должно иметь метку времени строго t = 0 с (получено: ${events[0].timestampSeconds} с).`,
        0,
        events[0].timestampSeconds
      );
    }

    // Завершающим событием шкалы обязательно должно быть session_end
    if (events[events.length - 1].type !== 'session_end') {
      throw new TimelineChronologyError(
        `Завершающим событием шкалы обязательно должно быть session_end (получено: ${events[events.length - 1].type}).`,
        events.length - 1,
        events[events.length - 1].type
      );
    }

    // 2. Строгая проверка уникальности событий и хронологической монотонности t_{i+1} > t_i
    let initialPourCount = 0;
    let sessionEndCount = 0;

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];

      // Запрет отрицательных или нечисловых меток времени
      if (!Number.isFinite(evt.timestampSeconds) || evt.timestampSeconds < 0) {
        throw new TimelineChronologyError(
          `Метка времени события #${i} (${evt.type}) не может быть отрицательной или NaN: ${evt.timestampSeconds} с.`,
          i,
          evt.timestampSeconds
        );
      }

      // Не может быть второго или повторного initial_pour
      if (evt.type === 'initial_pour') {
        initialPourCount++;
        if (initialPourCount > 1 || i > 0) {
          throw new TimelineChronologyError(
            `Обнаружен повторный initial_pour на позиции #${i}. В сценарии кружки допустим только один начальный пролив при t = 0 с; для последующих добавлений воды используйте water_refill.`,
            i,
            evt.timestampSeconds
          );
        }
      }

      // В сценарии должно быть ровно одно завершение: session_end, строго последнее
      if (evt.type === 'session_end') {
        sessionEndCount++;
        if (sessionEndCount > 1 || i !== events.length - 1) {
          throw new TimelineChronologyError(
            `Обнаружено событие session_end на позиции #${i}. Завершение сессии должно быть строго единственным и последним событием. Никакие события не могут следовать после session_end.`,
            i,
            evt.timestampSeconds
          );
        }
      }

      // Строго монотонное возрастание меток времени: t_{i+1} > t_i
      if (i > 0) {
        const prev = events[i - 1];
        if (evt.timestampSeconds <= prev.timestampSeconds) {
          throw new TimelineChronologyError(
            `Нарушение хронологического порядка: событие #${i} (${evt.type}, ${evt.timestampSeconds} с) должно следовать строго позже предыдущего события #${i - 1} (${prev.type}, ${prev.timestampSeconds} с). Метки времени должны строго возрастать (t_i+1 > t_i).`,
            i,
            evt.timestampSeconds
          );
        }
      }
    }

    const { profile, ambientTemp, initialVesselTemp, isPreheated, dt } =
      this.resolveOptions(
        session.vessel.id,
        session.vessel.volumeMl,
        session.vessel.material,
        options,
        0
      );

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
        if (!Number.isFinite(evt.waterVolumeMl) || evt.waterVolumeMl <= 0) {
          throw new ThermalValidationError(
            `Начальный объём заливки воды должен быть строго положительным числом (${evt.waterVolumeMl} мл).`,
            'INVALID_POUR_VOLUME',
            'waterVolumeMl',
            evt.waterVolumeMl
          );
        }

        if (evt.waterVolumeMl > session.vessel.volumeMl) {
          throw new BrewingCapacityOverflowError(
            `Начальный объём заливки (${evt.waterVolumeMl} мл) превышает вместимость кружки (${session.vessel.volumeMl} мл). Физическое переполнение невозможно.`,
            session.vessel.volumeMl,
            evt.waterVolumeMl,
            'initial_pour'
          );
        }

        if (!Number.isFinite(evt.waterTemperatureC) || evt.waterTemperatureC < 0 || evt.waterTemperatureC > 100) {
          throw new ThermalRangeError(
            `Температура заливаемой воды (${evt.waterTemperatureC} °C) выходит за пределы жидкой фазы (0–100 °C).`,
            'waterTemperatureC',
            evt.waterTemperatureC
          );
        }

        currentVolume = evt.waterVolumeMl;
        currentLiquidTemp = evt.waterTemperatureC;
        pourTemp = evt.waterTemperatureC;
      } else if (evt.type === 'sip_consumption') {
        // Валидация объёма отпивания
        if (!Number.isFinite(evt.consumedVolumeMl) || evt.consumedVolumeMl <= 0) {
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
        if (!Number.isFinite(evt.addedWaterVolumeMl) || evt.addedWaterVolumeMl <= 0) {
          throw new ThermalValidationError(
            `Объём долива воды должен быть строго положительным числом (${evt.addedWaterVolumeMl} мл).`,
            'INVALID_REFILL_VOLUME',
            'addedWaterVolumeMl',
            evt.addedWaterVolumeMl
          );
        }

        if (!Number.isFinite(evt.addedWaterTemperatureC) || evt.addedWaterTemperatureC < 0 || evt.addedWaterTemperatureC > 100) {
          throw new ThermalRangeError(
            `Температура доливаемой воды (${evt.addedWaterTemperatureC} °C) выходит за пределы жидкой фазы (0–100 °C).`,
            'addedWaterTemperatureC',
            evt.addedWaterTemperatureC
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
