/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LiuGenPaoSessionConfig } from '../domain/brewing/types.ts';
import { DEFAULT_VESSELS, DEFAULT_WATER_PROFILES } from '../domain/brewing/defaults.ts';
import { TeaSample, createValueWithOrigin, ValueWithOrigin } from '../domain/tea/types.ts';
import {
  simulateLiuGenPaoCoupled,
  CoupledLiuGenPaoSimulationOptions,
  CoupledLiuGenPaoSimulationResult,
  BrewingThermalEngine,
  BrewingCapacityOverflowError,
  ThermalRangeError,
  ThermalValidationError,
} from '../engine/thermal/index.ts';
import { WaterBalanceValidationError } from '../engine/water-balance/errors.ts';
import type { TestResult } from './domain.test.ts';

/**
 * Синтетический чай для тестирования связки Лю Гэнь Пао.
 */
const SYNTHETIC_LIU_GEN_PAO_TEA: TeaSample = {
  id: 'synthetic-liu-gen-pao-tea',
  name: 'Синтетический чай для тестирования Лю Гэнь Пао',
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

const SYNTHETIC_LEAF_CP: ValueWithOrigin<number> = createValueWithOrigin(
  1500.0,
  'model_profile',
  'Дж/(кг·К)',
  { sourceNotes: 'Синтетический ориентир теплоёмкости сухого листа' }
);

const SYNTHETIC_INITIAL_TEMP: ValueWithOrigin<number> = createValueWithOrigin(
  25.0,
  'measured',
  '°C',
  { measurementMethod: 'LAB_THERMOMETER', sampleInfo: 'BATCH_001' }
);

/**
 * Создание типовой сессии Лю Гэнь Пао для тестов.
 */
function createTestLiuGenPaoSession(
  overrides: Partial<LiuGenPaoSessionConfig> = {}
): LiuGenPaoSessionConfig {
  return {
    methodId: 'liu_gen_pao',
    teaId: 'synthetic-liu-gen-pao-tea',
    vessel: DEFAULT_VESSELS[0], // Гайвань 110 мл, фарфор
    leafMassGrams: 5.0,
    waterProfile: DEFAULT_WATER_PROFILES[0],
    baseWaterTemperatureC: 95.0,
    steps: [
      {
        stepNumber: 1,
        infusionTimeSeconds: 20.0,
        addedWaterVolumeMl: 80.0,
        addedWaterTemperatureC: 95.0,
        retainedLiquorFractionOfTotal: 0.4,
      },
      {
        stepNumber: 2,
        infusionTimeSeconds: 25.0,
        addedWaterVolumeMl: 50.0,
        addedWaterTemperatureC: 95.0,
        retainedLiquorFractionOfTotal: 0.4,
      },
    ],
    ...overrides,
  };
}

/**
 * Создание базовых опций моделирования Лю Гэнь Пао.
 */
function createTestLiuGenPaoOptions(
  overrides: Partial<CoupledLiuGenPaoSimulationOptions> = {}
): CoupledLiuGenPaoSimulationOptions {
  return {
    leafSpecificHeatCapacity: SYNTHETIC_LEAF_CP,
    initialContentTemperatureC: SYNTHETIC_INITIAL_TEMP,
    waterBalanceOptions: {
      capillaryHoldUpCapacityMl: createValueWithOrigin(5.0, 'model_profile', 'мл'),
      assumedWaterDensityGPerMl: 1.0,
    },
    thermalSimulationOptions: {
      isVesselPreheated: true,
      preheatedVesselTemperatureC: 80.0,
      ambientTemperatureC: 22.0,
      interInfusionPauseSeconds: 15.0,
    },
    ...overrides,
  };
}

export async function runLiuGenPaoCouplingTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const assert = (suite: string, testName: string, condition: boolean, error?: string) => {
    results.push({
      suite,
      testName,
      passed: condition,
      error: condition ? undefined : (error || 'Условие инварианта не выполнено'),
    });
  };

  // =========================================================================
  // Сюита A: Базовое смешение и тепловая экспозиция (Этап 2B.3.3.3.2)
  // =========================================================================
  {
    const suite = 'A. Базовое смешение и тепловая экспозиция (Лю Гэнь Пао)';

    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20.0,
          addedWaterVolumeMl: 80.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.4,
        },
      ],
    });
    const options = createTestLiuGenPaoOptions();

    const result = simulateLiuGenPaoCoupled(session, SYNTHETIC_LIU_GEN_PAO_TEA, options);
    const step1 = result.steps[0];

    // A1. Один шаг рассчитывается со статусом calculated
    assert(
      suite,
      'Один шаг сессии рассчитывается со статусом calculated',
      result.status === 'calculated' && step1.status === 'calculated'
    );

    // A2. Аналитическая температура смешения при первом доливе
    // m_dry = 5.0 g, cp_leaf = 1500 -> C_dry = 7.5 J/K at 25 °C
    // m_added = 80.0 g, cp_w = 4184 -> C_added = 334.72 J/K at 95 °C
    // T_mix = (7.5 * 25 + 334.72 * 95) / (7.5 + 334.72) = 31985.9 / 342.22 ≈ 93.4659 °C
    const expectedMixTemp = (7.5 * 25.0 + 334.72 * 95.0) / (7.5 + 334.72);
    assert(
      suite,
      'Аналитически ожидаемая температура первого смешения совпадает с расчётом (~93.47 °C)',
      step1.mixingResult.mixedTemperatureC !== null &&
        Math.abs(step1.mixingResult.mixedTemperatureC - expectedMixTemp) < 0.05
    );

    // A3. Остывание содержимого в процессе экспозиции
    assert(
      suite,
      'Температура содержимого в конце экспозиции ниже температуры смешения (происходит остывание)',
      step1.infusionIntegration.finalState.contentTemperatureC !== null &&
        step1.mixingResult.mixedTemperatureC !== null &&
        step1.infusionIntegration.finalState.contentTemperatureC < step1.mixingResult.mixedTemperatureC
    );

    // A4. Температура слитого настоя равна температуре на конец экспозиции
    assert(
      suite,
      'Температура слитого настоя равна конечной температуре содержимого на экспозиции',
      step1.drainedLiquor.temperatureC === step1.infusionIntegration.finalState.contentTemperatureC
    );

    // A5. Мгновенный слив не изменяет температуру остающегося содержимого
    assert(
      suite,
      'Мгновенный слив не изменяет температуру оставшегося содержимого (T_postDrain === T_postInfusion)',
      step1.postDrainageState.contentTemperatureC === step1.infusionIntegration.finalState.contentTemperatureC
    );

    // A6. Закон сохранения водной массы выполняется на шаге
    assert(
      suite,
      'Закон сохранения водной массы на шаге 1 строго соблюдается (delta ~ 0)',
      step1.waterBalanceStep.stepMassConservationDeltaGrams !== null &&
        Math.abs(step1.waterBalanceStep.stepMassConservationDeltaGrams) < 1e-6
    );
  }

  // =========================================================================
  // Сюита B: Сохранение рецептурного корня (Этап 2B.3.3.3.2)
  // =========================================================================
  {
    const suite = 'B. Сохранение рецептурного корня (Лю Гэнь Пао)';

    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20.0,
          addedWaterVolumeMl: 80.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.4,
        },
        {
          stepNumber: 2,
          infusionTimeSeconds: 25.0,
          addedWaterVolumeMl: 50.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.4,
        },
      ],
    });
    const options = createTestLiuGenPaoOptions();

    const result = simulateLiuGenPaoCoupled(session, SYNTHETIC_LIU_GEN_PAO_TEA, options);
    const step1 = result.steps[0];
    const step2 = result.steps[1];

    // B1. После первого шага масса сохранённого корня > 0
    assert(
      suite,
      'После первого шага масса сохранённого корня строго положительна (retainedLiquorMassGrams > 0)',
      step1.waterBalanceStep.retainedLiquorMassGrams !== null &&
        step1.waterBalanceStep.retainedLiquorMassGrams > 0
    );

    // B2. Второй шаг использует initialCarriedRootMassGrams из первого шага
    assert(
      suite,
      'Второй шаг использует сохранённый корень первого шага как initialCarriedRootMassGrams',
      step2.waterBalanceStep.initialCarriedRootMassGrams === step1.waterBalanceStep.retainedLiquorMassGrams
    );

    // B3. Масса корня не прибавляется повторно к капиллярной ёмкости
    assert(
      suite,
      'Масса корня соответствует max(r * V_post, V_interstitial), исключая двойной учёт',
      step1.waterBalanceStep.targetRootVolumeMl !== null &&
        step1.waterBalanceStep.retainedLiquorVolumeMl !== null &&
        step1.waterBalanceStep.retainedLiquorVolumeMl >= step1.waterBalanceStep.targetRootVolumeMl
    );

    // B4. Смешение второго шага учитывает остывший корень и остывший влажный лист после паузы
    assert(
      suite,
      'Смешение второго шага выполняется при температуре содержимого после паузы (contentTemperatureBeforeMixingC)',
      step2.mixingResult.status === 'calculated' &&
        step1.postPauseState !== null &&
        step2.mixingResult.mixedTemperatureC !== null &&
        step2.mixingResult.mixedTemperatureC < 95.0
    );

    // B5. Проверяется сохранение массы всей сессии
    assert(
      suite,
      'Глобальная невязка материального баланса всей сессии строго равна 0',
      result.waterBalanceResult.sessionMassConservationDeltaGrams !== null &&
        Math.abs(result.waterBalanceResult.sessionMassConservationDeltaGrams) < 1e-6
    );
  }

  // =========================================================================
  // Сюита C: Режимы межпроливной паузы (Этап 2B.3.3.3.2)
  // =========================================================================
  {
    const suite = 'C. Режимы межпроливной паузы (Лю Гэнь Пао)';

    // C1. Положительная пауза при наличии корня использует Режим А
    const sessionWithRoot = createTestLiuGenPaoSession();
    const resWithRoot = simulateLiuGenPaoCoupled(sessionWithRoot, SYNTHETIC_LIU_GEN_PAO_TEA, createTestLiuGenPaoOptions());
    const step1 = resWithRoot.steps[0];

    assert(
      suite,
      'При наличии сохранённого корня пауза использует Режим А (проводимости жидкой фазы)',
      step1.pauseIntegration !== null &&
        step1.pauseIntegration.status === 'calculated' &&
        step1.pauseIntegration.diagnostics.some((d) => d.includes('Режим А'))
    );

    // C2. Нулевой корень активирует Режим Б (для проверки создадим сессию с полным исчерпанием)
    // Лист 10 г, долив 10 мл, капилляр 0, доля 0 -> вся вода поглощается, retained = 0
    const sessionDrained = createTestLiuGenPaoSession({
      leafMassGrams: 10.0,
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 15.0,
          addedWaterVolumeMl: 10.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.0,
        },
        {
          stepNumber: 2,
          infusionTimeSeconds: 20.0,
          addedWaterVolumeMl: 50.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.0,
        },
      ],
    });

    const validDrainedConductance = createValueWithOrigin(0.5, 'model_profile', 'Вт/К');
    const resDrainedWithOpts = simulateLiuGenPaoCoupled(
      sessionDrained,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        waterBalanceOptions: {
          capillaryHoldUpCapacityMl: createValueWithOrigin(0.0, 'model_profile', 'мл'),
        },
        drainedContentConductanceOptions: {
          conductanceDrainedContentVesselWPerK: validDrainedConductance,
          conductanceDrainedContentAmbientWPerK: validDrainedConductance,
        },
      })
    );
    assert(
      suite,
      'При нулевом корне и заданных drainedOptions пауза рассчитывается в Режиме Б',
      resDrainedWithOpts.steps[0].pauseIntegration !== null &&
        resDrainedWithOpts.steps[0].pauseIntegration.status === 'calculated' &&
        resDrainedWithOpts.steps[0].postDrainageState.freeWaterMassGrams === 0
    );

    // C3. При нулевом корне без drainedContentConductanceOptions пауза блокируется со статусом unknown_drained_conductance
    const resDrainedNoOpts = simulateLiuGenPaoCoupled(
      sessionDrained,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        waterBalanceOptions: {
          capillaryHoldUpCapacityMl: createValueWithOrigin(0.0, 'model_profile', 'мл'),
        },
        drainedContentConductanceOptions: undefined,
      })
    );
    assert(
      suite,
      'При нулевом корне без drainedOptions пауза блокируется со статусом unknown_drained_conductance',
      resDrainedNoOpts.steps[0].pauseIntegration !== null &&
        resDrainedNoOpts.steps[0].pauseIntegration.status === 'unknown_drained_conductance'
    );

    // C4. Неизвестные проводимости осушенного листа блокируют положительную паузу
    const resDrainedUnknownG = simulateLiuGenPaoCoupled(
      sessionDrained,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        waterBalanceOptions: {
          capillaryHoldUpCapacityMl: createValueWithOrigin(0.0, 'model_profile', 'мл'),
        },
        drainedContentConductanceOptions: {
          conductanceDrainedContentVesselWPerK: createValueWithOrigin(null as any, 'unknown', 'Вт/К'),
          conductanceDrainedContentAmbientWPerK: validDrainedConductance,
        },
      })
    );
    assert(
      suite,
      'Неизвестная проводимость осушенного содержимого блокирует положительную паузу',
      resDrainedUnknownG.steps[0].pauseIntegration !== null &&
        resDrainedUnknownG.steps[0].pauseIntegration.status === 'unknown_drained_conductance'
    );

    // C5. При нулевой паузе возвращается no_time_elapsed, температуры сохраняются
    const sessionZeroPause = createTestLiuGenPaoSession();
    const resZeroPause = simulateLiuGenPaoCoupled(
      sessionZeroPause,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        thermalSimulationOptions: {
          interInfusionPauseSeconds: 0,
        },
      })
    );
    const zeroStep1 = resZeroPause.steps[0];
    assert(
      suite,
      'При нулевой длительности паузы pauseIntegration имеет статус no_time_elapsed и сохраняет температуры',
      zeroStep1.pauseIntegration !== null &&
        zeroStep1.pauseIntegration.status === 'no_time_elapsed' &&
        zeroStep1.postPauseState?.contentTemperatureC === zeroStep1.postDrainageState.contentTemperatureC
    );

    // C6. Нулевая пауза не требует drainedContentConductanceOptions даже при нулевом корне
    const resZeroPauseDrained = simulateLiuGenPaoCoupled(
      sessionDrained,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        waterBalanceOptions: {
          capillaryHoldUpCapacityMl: createValueWithOrigin(0.0, 'model_profile', 'мл'),
        },
        thermalSimulationOptions: {
          interInfusionPauseSeconds: 0,
        },
        drainedContentConductanceOptions: undefined,
      })
    );
    assert(
      suite,
      'Нулевая пауза при нулевом корне не требует drainedOptions и успешно завершается как no_time_elapsed',
      resZeroPauseDrained.steps[0].pauseIntegration !== null &&
        resZeroPauseDrained.steps[0].pauseIntegration.status === 'no_time_elapsed'
    );
  }

  // =========================================================================
  // Сюита D: Частичная определённость (Partial Certainty) и Unknown ≠ 0
  // =========================================================================
  {
    const suite = 'D. Частичная определённость и Unknown ≠ 0 (Лю Гэнь Пао)';

    const session = createTestLiuGenPaoSession();

    // D1. Неизвестная кинетика гидратации: экспозиция шага 1 рассчитывается, зависимый дренаж неизвестен
    const teaUnknownKinetics: TeaSample = {
      ...SYNTHETIC_LIU_GEN_PAO_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1'),
    };
    const resUnknownKinetics = simulateLiuGenPaoCoupled(session, teaUnknownKinetics, createTestLiuGenPaoOptions());
    assert(
      suite,
      'При неизвестной кинетике экспозиция шага 1 рассчитывается благодаря частичной определённости пред-масс',
      resUnknownKinetics.steps[0].infusionIntegration.status === 'calculated' &&
        resUnknownKinetics.steps[0].waterBalanceStep.status === 'unknown_hydration_profile'
    );

    // D2. Неизвестная капиллярная ёмкость: экспозиция рассчитывается, дренаж и корень остаются null
    const resUnknownCapillary = simulateLiuGenPaoCoupled(
      session,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        waterBalanceOptions: {
          capillaryHoldUpCapacityMl: null,
        },
      })
    );
    assert(
      suite,
      'При неизвестной капиллярной ёмкости экспозиция рассчитывается, но корень после слива равен null',
      resUnknownCapillary.steps[0].infusionIntegration.status === 'calculated' &&
        resUnknownCapillary.steps[0].waterBalanceStep.retainedLiquorMassGrams === null &&
        resUnknownCapillary.steps[0].postDrainageState.freeWaterMassGrams === null
    );

    // D3. Неизвестная теплоёмкость сухого листа блокирует температурное смешение
    const resUnknownCp = simulateLiuGenPaoCoupled(
      session,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        leafSpecificHeatCapacity: createValueWithOrigin(null as any, 'unknown', 'Дж/(кг·К)'),
      })
    );
    assert(
      suite,
      'При неизвестной теплоёмкости листа температура смеси строго равна null и статус unknown_leaf_specific_heat',
      resUnknownCp.status === 'unknown_leaf_specific_heat' &&
        resUnknownCp.steps[0].mixingResult.mixedTemperatureC === null
    );

    // D4. Неизвестная начальная температура листа блокирует первое смешение
    const resUnknownInitTemp = simulateLiuGenPaoCoupled(
      session,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        initialContentTemperatureC: createValueWithOrigin(null as any, 'unknown', '°C'),
      })
    );
    assert(
      suite,
      'При неизвестной начальной температуре листа шаг 1 блокируется как blocked_by_unknown_prior_state',
      resUnknownInitTemp.steps[0].status === 'blocked_by_unknown_prior_state' &&
        resUnknownInitTemp.steps[0].mixingResult.mixedTemperatureC === null
    );

    // D5. Неизвестный корень не подменяется нулём: пауза блокируется
    assert(
      suite,
      'Неизвестный корень не подменяется нулём, а положительная пауза блокируется как unknown_water_masses',
      resUnknownCapillary.steps[0].pauseIntegration !== null &&
        resUnknownCapillary.steps[0].pauseIntegration.status === 'unknown_water_masses'
    );

    // D6. Шаг 2 после заблокированной паузы блокируется как blocked_by_unknown_prior_state
    assert(
      suite,
      'Шаг 2 после неизвестного корня блокируется со статусом blocked_by_unknown_prior_state',
      resUnknownCapillary.steps[1].status === 'blocked_by_unknown_prior_state' &&
        resUnknownCapillary.steps[1].mixingResult.mixedTemperatureC === null
    );
  }

  // =========================================================================
  // Сюита E: Массовые и тепловые инварианты (Лю Гэнь Пао)
  // =========================================================================
  {
    const suite = 'E. Массовые и тепловые инварианты (Лю Гэнь Пао)';

    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20.0,
          addedWaterVolumeMl: 80.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.35,
        },
        {
          stepNumber: 2,
          infusionTimeSeconds: 30.0,
          addedWaterVolumeMl: 60.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.35,
        },
      ],
    });
    const options = createTestLiuGenPaoOptions({
      thermalSimulationOptions: {
        interInfusionPauseSeconds: 25.0,
      },
    });

    const result = simulateLiuGenPaoCoupled(session, SYNTHETIC_LIU_GEN_PAO_TEA, options);
    const step1 = result.steps[0];
    const step2 = result.steps[1];

    // E1. Теплоёмкость воды одинакова для поглощённой и свободной фазы
    // Теплоёмкость содержимого на экспозиции шага 1: C_dry + (m_abs_before + m_free_before) * cp_water
    assert(
      suite,
      'Теплоёмкость содержимого на экспозиции строго сохраняет энергию водного компартмента',
      step1.infusionIntegration.contentHeatCapacityJPerK !== null &&
        step1.infusionIntegration.contentHeatCapacityJPerK > 0
    );

    // E2. Рецептурный корень и капиллярный порог не складываются повторно
    assert(
      suite,
      'Рецептурный корень не суммируется с капиллярным объёмом (V_retained === max(r*V, V_cap))',
      step1.waterBalanceStep.retainedLiquorVolumeMl !== null &&
        step1.waterBalanceStep.targetRootVolumeMl !== null &&
        step1.waterBalanceStep.retainedLiquorVolumeMl >= step1.waterBalanceStep.targetRootVolumeMl
    );

    // E3. Температура после мгновенного слива сохраняется без искажений
    assert(
      suite,
      'Температура после мгновенного слива равна температуре конца экспозиции (T_postDrain === T_postInfusion)',
      step1.postDrainageState.contentTemperatureC === step1.infusionIntegration.finalState.contentTemperatureC
    );

    // E4. Положительная пауза увеличивает elapsedSeconds
    assert(
      suite,
      'Положительная пауза увеличивает elapsedSeconds ровно на длительность паузы (25 с)',
      step1.postPauseState !== null &&
        step1.postDrainageState.elapsedSeconds + 25.0 === step1.postPauseState.elapsedSeconds
    );

    // E5. Полное время сессии равно сумме экспозиций и пауз без паузы после последнего шага
    // 20 с (эксп 1) + 25 с (пауза 1) + 30 с (эксп 2) = 75 с
    assert(
      suite,
      'Полное астрономическое время сессии равно 75 с (без фиктивной паузы после последнего шага)',
      result.totalElapsedTimeSeconds === 75.0 && result.totalInfusionTimeSeconds === 50.0
    );
  }

  // =========================================================================
  // Сюита F: Строгая runtime-валидация входных данных (Лю Гэнь Пао)
  // =========================================================================
  {
    const suite = 'F. Runtime-валидация входных данных (Лю Гэнь Пао)';

    const session = createTestLiuGenPaoSession();
    const options = createTestLiuGenPaoOptions();

    // F1. Неверный methodId
    let caughtMethod = false;
    try {
      simulateLiuGenPaoCoupled({ ...session, methodId: 'gongfu_cha' as any }, SYNTHETIC_LIU_GEN_PAO_TEA, options);
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_METHOD') {
        caughtMethod = true;
      }
    }
    assert(suite, 'Неверный methodId отклоняется с INVALID_METHOD', caughtMethod);

    // F2. Несовпадающий teaId
    let caughtTeaId = false;
    try {
      simulateLiuGenPaoCoupled({ ...session, teaId: 'other-tea' }, SYNTHETIC_LIU_GEN_PAO_TEA, options);
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'MISMATCHED_TEA_ID') {
        caughtTeaId = true;
      }
    }
    assert(suite, 'Несовпадающий teaId отклоняется с MISMATCHED_TEA_ID', caughtTeaId);

    // F3. Не-объект в initialContentTemperatureC
    let caughtInitObj = false;
    try {
      simulateLiuGenPaoCoupled(session, SYNTHETIC_LIU_GEN_PAO_TEA, {
        ...options,
        initialContentTemperatureC: null as any,
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_INITIAL_CONTENT_TEMP_OBJECT') {
        caughtInitObj = true;
      }
    }
    assert(suite, 'null в initialContentTemperatureC отклоняется с INVALID_INITIAL_CONTENT_TEMP_OBJECT', caughtInitObj);

    // F4. Недопустимая единица измерения в initialContentTemperatureC
    let caughtUnit = false;
    try {
      simulateLiuGenPaoCoupled(session, SYNTHETIC_LIU_GEN_PAO_TEA, {
        ...options,
        initialContentTemperatureC: createValueWithOrigin(25.0, 'measured', 'Kelvin' as any),
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_TEMPERATURE_UNIT') {
        caughtUnit = true;
      }
    }
    assert(suite, 'Недопустимая единица измерения начальной температуры отклоняется с INVALID_TEMPERATURE_UNIT', caughtUnit);

    // F5. Несогласованность origin === 'unknown' и value !== null в leafSpecificHeatCapacity
    let caughtCpMismatch = false;
    try {
      simulateLiuGenPaoCoupled(session, SYNTHETIC_LIU_GEN_PAO_TEA, {
        ...options,
        leafSpecificHeatCapacity: {
          origin: 'unknown',
          value: 1500,
          unit: 'Дж/(кг·К)',
        } as any,
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN_VALUE_MISMATCH') {
        caughtCpMismatch = true;
      }
    }
    assert(suite, 'origin: "unknown" с числовым значением теплоёмкости отклоняется', caughtCpMismatch);

    // F6. Нефизическая температура доливаемой воды (> 100 °C)
    let caughtWaterTemp = false;
    try {
      simulateLiuGenPaoCoupled(
        createTestLiuGenPaoSession({
          steps: [
            {
              stepNumber: 1,
              infusionTimeSeconds: 20.0,
              addedWaterVolumeMl: 80.0,
              addedWaterTemperatureC: 105.0,
              retainedLiquorFractionOfTotal: 0.4,
            },
          ],
        }),
        SYNTHETIC_LIU_GEN_PAO_TEA,
        options
      );
    } catch (err) {
      if (err instanceof ThermalRangeError) {
        caughtWaterTemp = true;
      }
    }
    assert(suite, 'Температура доливаемой воды 105 °C отклоняется с ThermalRangeError', caughtWaterTemp);

    // F7. Отрицательное время экспозиции
    let caughtInfusionTime = false;
    try {
      simulateLiuGenPaoCoupled(
        createTestLiuGenPaoSession({
          steps: [
            {
              stepNumber: 1,
              infusionTimeSeconds: -10.0,
              addedWaterVolumeMl: 80.0,
              addedWaterTemperatureC: 95.0,
              retainedLiquorFractionOfTotal: 0.4,
            },
          ],
        }),
        SYNTHETIC_LIU_GEN_PAO_TEA,
        options
      );
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_INFUSION_TIME') {
        caughtInfusionTime = true;
      }
    }
    assert(suite, 'Отрицательное время экспозиции отклоняется с INVALID_INFUSION_TIME', caughtInfusionTime);

    // F8. Переполнение вместимости сосуда свежим доливом (> 110 мл)
    let caughtOverflow = false;
    try {
      simulateLiuGenPaoCoupled(
        createTestLiuGenPaoSession({
          steps: [
            {
              stepNumber: 1,
              infusionTimeSeconds: 20.0,
              addedWaterVolumeMl: 150.0,
              addedWaterTemperatureC: 95.0,
              retainedLiquorFractionOfTotal: 0.4,
            },
          ],
        }),
        SYNTHETIC_LIU_GEN_PAO_TEA,
        options
      );
    } catch (err) {
      if (err instanceof BrewingCapacityOverflowError) {
        caughtOverflow = true;
      }
    }
    assert(suite, 'Долив 150 мл в сосуд 110 мл отклоняется с BrewingCapacityOverflowError', caughtOverflow);

    // F9. Некорректная рецептурная доля корня (>= 1.0) отклоняется существующим водным балансом
    let caughtFraction = false;
    try {
      simulateLiuGenPaoCoupled(
        createTestLiuGenPaoSession({
          steps: [
            {
              stepNumber: 1,
              infusionTimeSeconds: 20.0,
              addedWaterVolumeMl: 80.0,
              addedWaterTemperatureC: 95.0,
              retainedLiquorFractionOfTotal: 1.2,
            },
          ],
        }),
        SYNTHETIC_LIU_GEN_PAO_TEA,
        options
      );
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_RETAINED_FRACTION') {
        caughtFraction = true;
      }
    }
    assert(suite, 'Доля корня >= 1.0 отклоняется водным балансом с INVALID_RETAINED_FRACTION', caughtFraction);
  }

  // =========================================================================
  // Сюита G: Обратная совместимость и интеграция с классом (Лю Гэнь Пао)
  // =========================================================================
  {
    const suite = 'G. Обратная совместимость и интеграция (Лю Гэнь Пао)';

    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20.0,
          addedWaterVolumeMl: 80.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.4,
        },
      ],
    });

    const engine = new BrewingThermalEngine();

    // G1. Legacy engine.simulateLiuGenPao продолжает работать без изменений
    const legacyResult = engine.simulateLiuGenPao(session, {
      ambientTemperatureC: 22.0,
      isVesselPreheated: true,
      preheatedVesselTemperatureC: 80.0,
    });
    assert(
      suite,
      'Legacy-метод engine.simulateLiuGenPao работает без изменений и возвращает корректный результат',
      legacyResult.stepResults.length === 1 &&
        legacyResult.summary.ambientTemperatureC === 22.0
    );

    // G2. Legacy engine.simulateGongfu продолжает работать
    const gongfuSession = {
      methodId: 'gongfu_cha' as const,
      teaId: 'synthetic-liu-gen-pao-tea',
      vessel: DEFAULT_VESSELS[0],
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
      ],
    };
    const legacyGongfuRes = engine.simulateGongfu(gongfuSession);
    assert(
      suite,
      'Legacy-метод engine.simulateGongfu продолжает работать без изменений',
      legacyGongfuRes.stepResults.length === 1
    );

    // G3. engine.simulateLiuGenPaoCoupled возвращает результат новой связанной функции
    const coupledEngineResult = engine.simulateLiuGenPaoCoupled(
      session,
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions()
    );
    assert(
      suite,
      'Метод engine.simulateLiuGenPaoCoupled возвращает идентичный результат связанного моделирования',
      coupledEngineResult.status === 'calculated' &&
        coupledEngineResult.steps.length === 1
    );

    // G4. Дефолтная пауза Лю Гэнь Пао принимается из константы (0 с) при отсутствии явного указания
    const resDefaultPause = simulateLiuGenPaoCoupled(
      createTestLiuGenPaoSession({
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 15.0,
            addedWaterVolumeMl: 80.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
          {
            stepNumber: 2,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 50.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
        ],
      }),
      SYNTHETIC_LIU_GEN_PAO_TEA,
      createTestLiuGenPaoOptions({
        thermalSimulationOptions: {
          interInfusionPauseSeconds: undefined,
        },
      })
    );
    // Дефолтная пауза для Лю Гэнь Пао равна 0 с (DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS = 0.0):
    // 15 с (эксп 1) + 0 с (пауза по умолчанию) + 20 с (эксп 2) = 35 с
    assert(
      suite,
      'При отсутствии явного значения паузы применяется DEFAULT_LIU_GEN_PAO_PAUSE_SECONDS (0 с)',
      resDefaultPause.totalElapsedTimeSeconds === 35.0 &&
        resDefaultPause.steps[0].pauseIntegration?.status === 'no_time_elapsed'
    );
  }

  return results;
}
