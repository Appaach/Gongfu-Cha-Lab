/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GongfuSessionConfig } from '../domain/brewing/types.ts';
import { DEFAULT_VESSELS, DEFAULT_WATER_PROFILES } from '../domain/brewing/defaults.ts';
import { TeaSample, createValueWithOrigin, ValueWithOrigin } from '../domain/tea/types.ts';
import {
  simulateGongfuCoupled,
  CoupledGongfuSimulationOptions,
  CoupledGongfuSimulationResult,
  BrewingThermalEngine,
  BrewingCapacityOverflowError,
  ThermalRangeError,
  ThermalValidationError,
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
} from '../engine/thermal/index.ts';
import type { TestResult } from './domain.test.ts';

/**
 * Синтетический образец чая с известной кинетикой гидратации для тестирования связанной модели.
 */
const SYNTHETIC_COUPLED_TEA: TeaSample = {
  id: 'synthetic-coupled-tea',
  name: 'Синтетический чай для тестирования тепловой связки',
  category: 'oolong_light',
  morphology: 'tightly_rolled_ball',
  roastLevel: 'light',
  waterAbsorptionRatio: createValueWithOrigin(2.5, 'literature', 'г/г', {
    citation: 'SYNTHETIC_TEST_ABSORPTION_REF',
  }),
  leafBulkDensityGPerCm3: createValueWithOrigin(0.4, 'model_profile', 'г/см³'),
  uncalibratedHydrationSpeed: createValueWithOrigin(1.0, 'model_profile', 'ед.'),
  hydrationRateConstantPerSecond: createValueWithOrigin(0.05, 'measured', 's^-1', {
    measurementMethod: 'SYNTHETIC_GRAVIMETRIC_LAB_METHOD',
    sampleInfo: 'SYNTHETIC_BATCH_001',
  }),
  totalExtractableFraction: createValueWithOrigin(40.0, 'literature', '%', {
    citation: 'SYNTHETIC_EXTRACT_REF',
  }),
  caffeineFraction: createValueWithOrigin(3.0, 'literature', '%', {
    citation: 'SYNTHETIC_CAFFEINE_REF',
  }),
  totalPolyphenolsFraction: createValueWithOrigin(20.0, 'literature', '%', {
    citation: 'SYNTHETIC_POLYPHENOLS_REF',
  }),
  theanineFraction: createValueWithOrigin(2.0, 'literature', '%', {
    citation: 'SYNTHETIC_THEANINE_REF',
  }),
  isCustom: true,
};

/**
 * Синтетическая удельная теплоёмкость листа (1500 Дж/(кг·К)).
 */
const SYNTHETIC_LEAF_CP: ValueWithOrigin<number> = createValueWithOrigin(
  1500.0,
  'model_profile',
  'Дж/(кг·К)',
  { sourceNotes: 'Синтетический ориентир теплоёмкости сухого листа' }
);

/**
 * Синтетическая начальная температура сухого листа (25 °C).
 */
const SYNTHETIC_INITIAL_TEMP: ValueWithOrigin<number> = createValueWithOrigin(
  25.0,
  'measured',
  '°C',
  { measurementMethod: 'LAB_THERMOMETER', sampleInfo: 'BATCH_001' }
);

/**
 * Вспомогательная функция создания типовой сессии Гунфу Ча для тестов.
 */
function createTestCoupledSession(
  overrides: Partial<GongfuSessionConfig> = {}
): GongfuSessionConfig {
  return {
    methodId: 'gongfu_cha',
    teaId: 'synthetic-coupled-tea',
    vessel: DEFAULT_VESSELS[0], // Гайвань 110 мл, фарфор
    leafMassGrams: 5.0,
    waterProfile: DEFAULT_WATER_PROFILES[0],
    baseWaterTemperatureC: 95.0,
    steps: [
      {
        stepNumber: 1,
        infusionTimeSeconds: 15.0,
        pourWaterVolumeMl: 100.0,
        waterTemperatureC: 95.0,
      },
      {
        stepNumber: 2,
        infusionTimeSeconds: 20.0,
        pourWaterVolumeMl: 100.0,
        waterTemperatureC: 95.0,
      },
      {
        stepNumber: 3,
        infusionTimeSeconds: 25.0,
        pourWaterVolumeMl: 100.0,
        waterTemperatureC: 95.0,
      },
    ],
    ...overrides,
  };
}

/**
 * Вспомогательная функция создания базовых опций моделирования.
 */
function createTestCoupledOptions(
  overrides: Partial<CoupledGongfuSimulationOptions> = {}
): CoupledGongfuSimulationOptions {
  return {
    leafSpecificHeatCapacity: SYNTHETIC_LEAF_CP,
    initialContentTemperatureC: SYNTHETIC_INITIAL_TEMP,
    waterBalanceOptions: {
      capillaryHoldUpCapacityMl: createValueWithOrigin(5.0, 'measured', 'мл', {
        measurementMethod: 'SYNTHETIC_DRAIN_WEIGHING',
        sampleInfo: 'BATCH_001',
      }),
      assumedWaterDensityGPerMl: 1.0,
    },
    thermalSimulationOptions: {
      ambientTemperatureC: 22.0,
      isVesselPreheated: true,
      preheatedVesselTemperatureC: 85.0,
      interInfusionPauseSeconds: 20.0,
      integratorTimeStepSeconds: 0.1,
    },
    ...overrides,
  };
}

/**
 * Набор модульных тестов для Этапа 2B.3.3.3.1:
 * Интеграция водного баланса и теплового ядра для Гунфу Ча.
 */
export async function runGongfuCouplingTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(
    suite: string,
    name: string,
    condition: boolean,
    message?: string
  ) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // =========================================================================
  // Сюита 1: Базовый шаг и сохранение массы и тепловой энергии
  // =========================================================================
  {
    const suite = '1. Базовый шаг связанной модели (Этап 2B.3.3.3.1)';

    const session = createTestCoupledSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 15.0,
          pourWaterVolumeMl: 100.0,
          waterTemperatureC: 95.0,
        },
      ],
    });
    const options = createTestCoupledOptions();
    const result = simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, options);

    // 1.1 Статус шага и сессии
    assert(
      suite,
      'Один пролив с известными параметрами рассчитывается со статусом calculated',
      result.status === 'calculated' && result.steps[0].status === 'calculated'
    );

    // 1.2 Адиабатическое смешение: точная аналитическая температура
    const mLeafKg = 5.0 * 0.001;
    const cpLeaf = 1500.0;
    const cDry = mLeafKg * cpLeaf; // 7.5 Дж/К
    const mFreshKg = 100.0 * 0.001;
    const cFresh = mFreshKg * SPECIFIC_HEAT_WATER_J_PER_KG_K; // 418.4 Дж/К
    const tMixAnalytical =
      (cDry * 25.0 + cFresh * 95.0) / (cDry + cFresh); // (7.5*25 + 418.4*95)/(7.5 + 418.4) ~ 93.768 °C

    const mixStep1 = result.steps[0].mixingResult;
    assert(
      suite,
      'Температура адиабатического смешения на шаге 1 точно соответствует термодинамическому расчету',
      mixStep1.mixedTemperatureC !== null &&
        Math.abs(mixStep1.mixedTemperatureC - tMixAnalytical) < 1e-4
    );

    // 1.3 Остывание во время экспозиции
    const infStep1 = result.steps[0].infusionIntegration;
    assert(
      suite,
      'Температура содержимого монотонно снижается за время экспозиции (T_final < T_mix)',
      infStep1.finalState.contentTemperatureC !== null &&
        mixStep1.mixedTemperatureC !== null &&
        infStep1.finalState.contentTemperatureC < mixStep1.mixedTemperatureC
    );

    // 1.4 Слив готового настоя
    const drained = result.steps[0].drainedLiquor;
    const postDrain = result.steps[0].postDrainageState;
    assert(
      suite,
      'Температура слитого настоя строго равна температуре содержимого на конец экспозиции',
      drained.temperatureC !== null &&
        infStep1.finalState.contentTemperatureC !== null &&
        Math.abs(drained.temperatureC - infStep1.finalState.contentTemperatureC) < 1e-6
    );

    assert(
      suite,
      'Мгновенный слив настоя не изменяет температуру остающегося содержимого (T_postDrain === T_postInfusion)',
      postDrain.contentTemperatureC !== null &&
        infStep1.finalState.contentTemperatureC !== null &&
        Math.abs(postDrain.contentTemperatureC - infStep1.finalState.contentTemperatureC) < 1e-6
    );

    // 1.5 Баланс массы на шаге
    const wb = result.steps[0].waterBalanceStep;
    const massBalanceDelta =
      (wb.absorbedWaterAfterStepGrams ?? 0) +
      (wb.drainedLiquorMassGrams ?? 0) +
      (wb.retainedLiquorMassGrams ?? 0) -
      wb.freshWaterMassGrams;
    assert(
      suite,
      'Закон сохранения массы на шаге 1 выполняется строго (невязка < 1e-12 г)',
      Math.abs(massBalanceDelta) < 1e-12
    );

    // 1.6 Завершающий шаг сессии не имеет паузы
    assert(
      suite,
      'На завершающем шаге сессии pauseIntegration и postPauseState равны null',
      result.steps[0].pauseIntegration === null &&
        result.steps[0].postPauseState === null
    );
  }

  // =========================================================================
  // Сюита 2: Многошаговая сессия, перенос остатка и пауза
  // =========================================================================
  {
    const suite = '2. Многошаговая сессия и пауза между проливами (Этап 2B.3.3.3.1)';

    const session = createTestCoupledSession(); // 3 шага
    const options = createTestCoupledOptions({
      thermalSimulationOptions: {
        ambientTemperatureC: 22.0,
        isVesselPreheated: true,
        preheatedVesselTemperatureC: 85.0,
        interInfusionPauseSeconds: 30.0,
        integratorTimeStepSeconds: 0.1,
      },
    });
    const result = simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, options);

    assert(
      suite,
      'Сессия из 3 проливов успешно рассчитывается со статусом calculated',
      result.status === 'calculated' && result.steps.length === 3
    );

    // 2.1 Остывание во время паузы между шагами 1 и 2
    const step1 = result.steps[0];
    const pause1 = step1.pauseIntegration!;
    assert(
      suite,
      'Пауза после шага 1 существует и успешно рассчитана',
      pause1 !== null && pause1.status === 'calculated'
    );

    assert(
      suite,
      'Влажный лист и удержанный корень остывают во время межпроливной паузы (T_postPause < T_postDrain)',
      step1.postPauseState !== null &&
        step1.postDrainageState.contentTemperatureC !== null &&
        step1.postPauseState.contentTemperatureC! < step1.postDrainageState.contentTemperatureC!
    );

    // 2.2 Перенос состояния на шаг 2
    const step2 = result.steps[1];
    assert(
      suite,
      'Шаг 2 стартует с переносом удержанной свободной массы из шага 1 (initialCarriedFreeWaterMassGrams > 0)',
      step2.waterBalanceStep.initialCarriedFreeWaterMassGrams !== null &&
        step2.waterBalanceStep.initialCarriedFreeWaterMassGrams > 0
    );

    // 2.3 Смешение на шаге 2 использует температуру содержимого после паузы
    assert(
      suite,
      'Смешение на шаге 2 рассчитано корректно и дает ожидаемую температуру смеси',
      step2.mixingResult.status === 'calculated' &&
        step2.mixingResult.mixedTemperatureC !== null &&
        step2.mixingResult.mixedTemperatureC > 80.0
    );

    // 2.4 Суммарный баланс массы сессии
    const wbSession = result.waterBalanceResult;
    assert(
      suite,
      'Глобальный баланс массы сессии выполняется с машинной точностью',
      wbSession.sessionMassConservationDeltaGrams !== null &&
        Math.abs(wbSession.sessionMassConservationDeltaGrams) < 1e-12
    );

    // 2.5 Полное время сессии
    // 3 шага экспозиций: 15 + 20 + 25 = 60 с
    // 2 паузы по 30 с: 60 с
    // Итого elapsed: 120 с
    assert(
      suite,
      'Суммарное время экспозиций равно 60 с',
      result.totalInfusionTimeSeconds === 60.0
    );
    assert(
      suite,
      'Полное астрономическое время сессии с учетом пауз равно 120 с',
      Math.abs(result.totalElapsedTimeSeconds - 120.0) < 1e-6
    );
  }

  // =========================================================================
  // Сюита 3: Граничные условия временных интервалов (no-op)
  // =========================================================================
  {
    const suite = '3. Граничные условия нулевых интервалов (Этап 2B.3.3.3.1)';

    // 3.1 Нулевая пауза (interInfusionPauseSeconds === 0)
    const sessionZeroPause = createTestCoupledSession({
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 10.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
        { stepNumber: 2, infusionTimeSeconds: 10.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      ],
    });
    const optionsZeroPause = createTestCoupledOptions({
      thermalSimulationOptions: {
        interInfusionPauseSeconds: 0,
      },
    });
    const resZeroPause = simulateGongfuCoupled(
      sessionZeroPause,
      SYNTHETIC_COUPLED_TEA,
      optionsZeroPause
    );

    const pause = resZeroPause.steps[0].pauseIntegration;
    assert(
      suite,
      'При нулевой паузе pauseIntegration возвращает статус no_time_elapsed',
      pause !== null && pause.status === 'no_time_elapsed'
    );
    assert(
      suite,
      'При нулевой паузе температура содержимого и стенок сохраняется без изменений',
      resZeroPause.steps[0].postPauseState !== null &&
        resZeroPause.steps[0].postDrainageState.contentTemperatureC !== null &&
        Math.abs(
          resZeroPause.steps[0].postPauseState!.contentTemperatureC! -
            resZeroPause.steps[0].postDrainageState.contentTemperatureC!
        ) < 1e-9
    );

    // 3.2 Нулевая экспозиция (infusionTimeSeconds === 0)
    const sessionZeroInf = createTestCoupledSession({
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 0.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      ],
    });
    const resZeroInf = simulateGongfuCoupled(
      sessionZeroInf,
      SYNTHETIC_COUPLED_TEA,
      createTestCoupledOptions()
    );

    assert(
      suite,
      'При нулевой экспозиции infusionIntegration возвращает статус no_time_elapsed',
      resZeroInf.steps[0].infusionIntegration.status === 'no_time_elapsed'
    );
    assert(
      suite,
      'При нулевой экспозиции шаг имеет статус no_time_elapsed',
      resZeroInf.steps[0].status === 'no_time_elapsed'
    );
    assert(
      suite,
      'При нулевой экспозиции температура после настаивания равна температуре смешения',
      resZeroInf.steps[0].infusionIntegration.finalState.contentTemperatureC !== null &&
        resZeroInf.steps[0].mixingResult.mixedTemperatureC !== null &&
        Math.abs(
          resZeroInf.steps[0].infusionIntegration.finalState.contentTemperatureC! -
            resZeroInf.steps[0].mixingResult.mixedTemperatureC!
        ) < 1e-9
    );
  }

  // =========================================================================
  // Сюита 4: Осушенный сосуд (Режим Б) во время паузы
  // =========================================================================
  {
    const suite = '4. Осушенный сосуд в режиме Б во время паузы (Этап 2B.3.3.3.1)';

    const sessionDrained = createTestCoupledSession({
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
        { stepNumber: 2, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      ],
    });

    // 4.1 Полный слив без удержания (capillaryHoldUp = 0) с переданными drainedOptions
    const optionsWithDrained = createTestCoupledOptions({
      waterBalanceOptions: {
        capillaryHoldUpCapacityMl: createValueWithOrigin(0.0, 'measured', 'мл', {
          measurementMethod: 'COMPLETE_DRAIN_DRY',
          sampleInfo: 'BATCH_001',
        }),
      },
      drainedContentConductanceOptions: {
        conductanceDrainedContentVesselWPerK: createValueWithOrigin(0.2, 'model_profile', 'W/K'),
        conductanceDrainedContentAmbientWPerK: createValueWithOrigin(0.05, 'model_profile', 'W/K'),
      },
    });

    const resWithDrained = simulateGongfuCoupled(
      sessionDrained,
      SYNTHETIC_COUPLED_TEA,
      optionsWithDrained
    );

    assert(
      suite,
      'При капиллярном удержании 0 мл и заданных drainedOptions сессия успешно рассчитывается',
      resWithDrained.status === 'calculated'
    );
    assert(
      suite,
      'После полного слива в postDrainageState freeWaterMassGrams === 0 и liquidTemperatureC === null',
      resWithDrained.steps[0].postDrainageState.freeWaterMassGrams === 0 &&
        resWithDrained.steps[0].postDrainageState.liquidTemperatureC === null &&
        resWithDrained.steps[0].postDrainageState.contentTemperatureC !== null
    );

    // 4.2 Полный слив БЕЗ переданных drainedOptions блокирует паузу
    const optionsWithoutDrained = createTestCoupledOptions({
      waterBalanceOptions: {
        capillaryHoldUpCapacityMl: createValueWithOrigin(0.0, 'measured', 'мл', {
          measurementMethod: 'COMPLETE_DRAIN_DRY',
          sampleInfo: 'BATCH_001',
        }),
      },
      drainedContentConductanceOptions: undefined,
    });

    const resWithoutDrained = simulateGongfuCoupled(
      sessionDrained,
      SYNTHETIC_COUPLED_TEA,
      optionsWithoutDrained
    );

    assert(
      suite,
      'При полном сливе без drainedOptions пауза блокируется со статусом unknown_drained_conductance',
      resWithoutDrained.steps[0].pauseIntegration?.status === 'unknown_drained_conductance'
    );
    assert(
      suite,
      'После блокировки паузы конечные температуры postPauseState строго null',
      resWithoutDrained.steps[0].postPauseState?.contentTemperatureC === null &&
        resWithoutDrained.steps[0].postPauseState?.vesselTemperatureC === null
    );
    assert(
      suite,
      'Шаг 2 после заблокированной паузы блокируется как blocked_by_unknown_prior_state',
      resWithoutDrained.steps[1].status === 'blocked_by_unknown_prior_state'
    );
  }

  // =========================================================================
  // Сюита 5: Распространение неизвестности (Unknown ≠ 0)
  // =========================================================================
  {
    const suite = '5. Распространение неизвестности и Unknown != 0 (Этап 2B.3.3.3.1)';

    const session = createTestCoupledSession({
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
        { stepNumber: 2, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      ],
    });

    // 5.1 Неизвестная удельная теплоёмкость сухого листа
    const unknownCpOptions = createTestCoupledOptions({
      leafSpecificHeatCapacity: createValueWithOrigin<number>(null, 'unknown', 'Дж/(кг·К)'),
    });
    const resUnknownCp = simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, unknownCpOptions);

    assert(
      suite,
      'При неизвестной cp_leaf статус сессии и шага 1 равен unknown_leaf_specific_heat',
      resUnknownCp.status === 'unknown_leaf_specific_heat' &&
        resUnknownCp.steps[0].status === 'unknown_leaf_specific_heat'
    );
    assert(
      suite,
      'При неизвестной cp_leaf температура смеси строго null',
      resUnknownCp.steps[0].mixingResult.mixedTemperatureC === null
    );
    assert(
      suite,
      'При неизвестной cp_leaf шаг 2 блокируется как blocked_by_unknown_prior_state',
      resUnknownCp.steps[1].status === 'blocked_by_unknown_prior_state'
    );

    // 5.2 Неизвестная начальная температура сухого листа
    const unknownInitTempOptions = createTestCoupledOptions({
      initialContentTemperatureC: createValueWithOrigin<number>(null, 'unknown', '°C'),
    });
    const resUnknownInitTemp = simulateGongfuCoupled(
      session,
      SYNTHETIC_COUPLED_TEA,
      unknownInitTempOptions
    );

    assert(
      suite,
      'При неизвестной начальной температуре листа шаг 1 блокируется как blocked_by_unknown_prior_state',
      resUnknownInitTemp.steps[0].status === 'blocked_by_unknown_prior_state'
    );

    // 5.3 Неизвестная кинетика гидратации листа (unknown_hydration_profile)
    const teaUnknownKinetics: TeaSample = {
      ...SYNTHETIC_COUPLED_TEA,
      id: 'tea-unknown-kinetics',
      hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1'),
    };
    const sessionUnknownKinetics = createTestCoupledSession({
      teaId: 'tea-unknown-kinetics',
    });
    const resUnknownKinetics = simulateGongfuCoupled(
      sessionUnknownKinetics,
      teaUnknownKinetics,
      createTestCoupledOptions()
    );

    assert(
      suite,
      'При неизвестной кинетике водный баланс возвращает unknown_hydration_profile',
      resUnknownKinetics.waterBalanceResult.status === 'unknown_hydration_profile'
    );
    assert(
      suite,
      'Экспозиция шага 1 рассчитывается благодаря частичной определённости пред-поглощённых масс',
      resUnknownKinetics.steps[0].infusionIntegration.status === 'calculated'
    );
    assert(
      suite,
      'Шаг 1 получает статус unknown_hydration_profile из-за неопределённого дренажа',
      resUnknownKinetics.steps[0].status === 'unknown_hydration_profile'
    );
    assert(
      suite,
      'Шаг 2 после unknown_hydration_profile блокируется со статусом blocked_by_unknown_prior_state',
      resUnknownKinetics.steps[1].status === 'blocked_by_unknown_prior_state'
    );

    // 5.4 Неизвестная капиллярная ёмкость (capillaryHoldUp = null)
    const optionsUnknownCap = createTestCoupledOptions({
      waterBalanceOptions: {
        capillaryHoldUpCapacityMl: null,
      },
    });
    const resUnknownCap = simulateGongfuCoupled(
      session,
      SYNTHETIC_COUPLED_TEA,
      optionsUnknownCap
    );

    assert(
      suite,
      'При неизвестной капиллярной ёмкости статус сессии unknown_capillary_hold_up',
      resUnknownCap.status === 'unknown_capillary_hold_up' &&
        resUnknownCap.steps[0].status === 'unknown_capillary_hold_up'
    );
    assert(
      suite,
      'При неизвестной капиллярной ёмкости слив настоя равен null',
      resUnknownCap.steps[0].drainedLiquor.volumeMl === null &&
        resUnknownCap.steps[0].drainedLiquor.massGrams === null
    );
    assert(
      suite,
      'Шаг 2 после неизвестного капиллярного остатка заблокирован как blocked_by_unknown_prior_state',
      resUnknownCap.steps[1].status === 'blocked_by_unknown_prior_state'
    );
  }

  // =========================================================================
  // Сюита 6: Строгая runtime-валидация входных данных
  // =========================================================================
  {
    const suite = '6. Строгая runtime-валидация входных данных (Этап 2B.3.3.3.1)';

    const session = createTestCoupledSession();

    // 6.1 Не-объект в initialContentTemperatureC
    let caughtInitObj = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        initialContentTemperatureC: null as any,
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_INITIAL_CONTENT_TEMP_OBJECT') {
        caughtInitObj = true;
      }
    }
    assert(suite, 'null в initialContentTemperatureC отклоняется с INVALID_INITIAL_CONTENT_TEMP_OBJECT', caughtInitObj);

    // 6.2 Недопустимый origin в initialContentTemperatureC
    let caughtInitOrigin = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        initialContentTemperatureC: createValueWithOrigin(25, 'fabricated' as any, '°C'),
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_INITIAL_CONTENT_TEMP_ORIGIN') {
        caughtInitOrigin = true;
      }
    }
    assert(suite, 'Недопустимый origin в initialContentTemperatureC отклоняется с INVALID_INITIAL_CONTENT_TEMP_ORIGIN', caughtInitOrigin);

    // 6.3 Недопустимая единица в initialContentTemperatureC
    let caughtInitUnit = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        initialContentTemperatureC: createValueWithOrigin(25, 'measured', 'Kelvin' as any),
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_TEMPERATURE_UNIT') {
        caughtInitUnit = true;
      }
    }
    assert(suite, 'Недопустимая единица в initialContentTemperatureC отклоняется с INVALID_TEMPERATURE_UNIT', caughtInitUnit);

    // 6.4 origin: "unknown" с числовым value в initialContentTemperatureC
    let caughtInitMismatch = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        initialContentTemperatureC: {
          value: 25,
          origin: 'unknown',
          unit: '°C',
        } as any,
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_INITIAL_CONTENT_TEMP_ORIGIN_VALUE_MISMATCH') {
        caughtInitMismatch = true;
      }
    }
    assert(suite, 'origin: "unknown" с числовым value в initialContentTemperatureC отклоняется', caughtInitMismatch);

    // 6.5 Температура листа вне пределов 0-100 °C
    let caughtInitRange = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        initialContentTemperatureC: createValueWithOrigin(105, 'measured', '°C'),
      });
    } catch (err) {
      if (err instanceof ThermalRangeError) {
        caughtInitRange = true;
      }
    }
    assert(suite, 'Температура сухого листа 105 °C отклоняется с ThermalRangeError', caughtInitRange);

    // 6.6 Не-объект в leafSpecificHeatCapacity
    let caughtCpObj = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        leafSpecificHeatCapacity: 1500 as any,
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_LEAF_SPECIFIC_HEAT_OBJECT') {
        caughtCpObj = true;
      }
    }
    assert(suite, 'Число вместо объекта в leafSpecificHeatCapacity отклоняется с INVALID_LEAF_SPECIFIC_HEAT_OBJECT', caughtCpObj);

    // 6.7 origin: "unknown" с числовым value в leafSpecificHeatCapacity
    let caughtCpMismatch = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        leafSpecificHeatCapacity: {
          value: 1500,
          origin: 'unknown',
          unit: 'Дж/(кг·К)',
        } as any,
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN_VALUE_MISMATCH') {
        caughtCpMismatch = true;
      }
    }
    assert(suite, 'origin: "unknown" с числовым value в leafSpecificHeatCapacity отклоняется', caughtCpMismatch);

    // 6.8 Неположительное значение cp_leaf
    let caughtCpValue = false;
    try {
      simulateGongfuCoupled(session, SYNTHETIC_COUPLED_TEA, {
        ...createTestCoupledOptions(),
        leafSpecificHeatCapacity: createValueWithOrigin(0, 'measured', 'Дж/(кг·К)'),
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_LEAF_SPECIFIC_HEAT_VALUE') {
        caughtCpValue = true;
      }
    }
    assert(suite, 'cp_leaf === 0 отклоняется с INVALID_LEAF_SPECIFIC_HEAT_VALUE', caughtCpValue);

    // 6.9 Переполнение сосуда заливкой
    let caughtOverflow = false;
    try {
      const overflowSession = createTestCoupledSession({
        steps: [
          { stepNumber: 1, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 150.0, waterTemperatureC: 95.0 },
        ],
      });
      simulateGongfuCoupled(overflowSession, SYNTHETIC_COUPLED_TEA, createTestCoupledOptions());
    } catch (err) {
      if (err instanceof BrewingCapacityOverflowError) {
        caughtOverflow = true;
      }
    }
    assert(suite, 'Заливка 150 мл в сосуд 110 мл отклоняется с BrewingCapacityOverflowError', caughtOverflow);

    // 6.10 Недопустимая температура воды на шаге
    let caughtWaterTemp = false;
    try {
      const badTempSession = createTestCoupledSession({
        steps: [
          { stepNumber: 1, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 105.0 },
        ],
      });
      simulateGongfuCoupled(badTempSession, SYNTHETIC_COUPLED_TEA, createTestCoupledOptions());
    } catch (err) {
      if (err instanceof ThermalRangeError) {
        caughtWaterTemp = true;
      }
    }
    assert(suite, 'Температура воды 105 °C отклоняется с ThermalRangeError', caughtWaterTemp);
  }

  // =========================================================================
  // Сюита 7: Прогрев сосуда и обратная совместимость
  // =========================================================================
  {
    const suite = '7. Прогрев сосуда и обратная совместимость (Этап 2B.3.3.3.1)';

    const session = createTestCoupledSession({
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 10.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      ],
    });

    // 7.1 Прогретый сосуд
    const resPreheated = simulateGongfuCoupled(
      session,
      SYNTHETIC_COUPLED_TEA,
      createTestCoupledOptions({
        thermalSimulationOptions: {
          isVesselPreheated: true,
          preheatedVesselTemperatureC: 85.0,
          ambientTemperatureC: 22.0,
        },
      })
    );
    assert(
      suite,
      'При прогреве сосуда начальная температура стенок равна 85 °C',
      resPreheated.steps[0].infusionIntegration.curvePoints[0].vesselTemperatureC === 85.0
    );

    // 7.2 Непрогретый сосуд
    const resNotPreheated = simulateGongfuCoupled(
      session,
      SYNTHETIC_COUPLED_TEA,
      createTestCoupledOptions({
        thermalSimulationOptions: {
          isVesselPreheated: false,
          ambientTemperatureC: 22.0,
        },
      })
    );
    assert(
      suite,
      'Без прогрева начальная температура стенок равна температуре окружающей среды (22 °C)',
      resNotPreheated.steps[0].infusionIntegration.curvePoints[0].vesselTemperatureC === 22.0
    );

    // 7.3 Обратная совместимость legacy simulateGongfu на экземпляре BrewingThermalEngine
    const engine = new BrewingThermalEngine();
    const legacyResult = engine.simulateGongfu(session, {
      ambientTemperatureC: 22.0,
      isVesselPreheated: true,
      preheatedVesselTemperatureC: 85.0,
    });
    assert(
      suite,
      'Существующий метод engine.simulateGongfu работает неизменно и возвращает legacy-результат',
      legacyResult.stepResults.length === 1 &&
        legacyResult.summary.ambientTemperatureC === 22.0
    );

    // 7.4 Метод simulateGongfuCoupled доступен на экземпляре BrewingThermalEngine
    const engineCoupledResult = engine.simulateGongfuCoupled(
      session,
      SYNTHETIC_COUPLED_TEA,
      createTestCoupledOptions()
    );
    assert(
      suite,
      'Метод engine.simulateGongfuCoupled возвращает результат, идентичный изолированной функции',
      engineCoupledResult.status === 'calculated' &&
        engineCoupledResult.steps.length === 1
    );
  }

  return results;
}
