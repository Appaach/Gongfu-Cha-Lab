/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GongfuSessionConfig } from '../domain/brewing/types.ts';
import { DEFAULT_VESSELS, DEFAULT_WATER_PROFILES } from '../domain/brewing/defaults.ts';
import { TeaSample, createValueWithOrigin, ValueWithOrigin } from '../domain/tea/types.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import {
  simulateGongfuWaterBalance,
  GongfuWaterBalanceOptions,
  WaterBalanceValidationError,
} from '../engine/water-balance/index.ts';
import type { TestResult } from './domain.test.ts';

/**
 * Синтетический тестовый образец чая с явно маркированными тестовыми метаданными.
 * НЕ выдаётся за данные реальной партии или стандарта.
 */
const SYNTHETIC_TEST_TEA: TeaSample = {
  id: 'synthetic-gongfu-test-tea',
  name: 'Синтетический чай для тестирования баланса',
  category: 'oolong_light',
  morphology: 'tightly_rolled_ball',
  roastLevel: 'light',
  waterAbsorptionRatio: createValueWithOrigin(2.5, 'literature', 'г/г', {
    citation: 'SYNTHETIC_TEST_LITERATURE_REF_WATER_ABSORPTION: синтетический тест влагоёмкости',
  }),
  leafBulkDensityGPerCm3: createValueWithOrigin(0.4, 'model_profile', 'г/см³'),
  uncalibratedHydrationSpeed: createValueWithOrigin(1.0, 'model_profile', 'ед.'),
  hydrationRateConstantPerSecond: createValueWithOrigin(0.04, 'measured', 's^-1', {
    measurementMethod: 'SYNTHETIC_GRAVIMETRIC_LAB_METHOD',
    sampleInfo: 'SYNTHETIC_BATCH_GONG_001',
  }),
  totalExtractableFraction: createValueWithOrigin(40.0, 'literature', '%', {
    citation: 'SYNTHETIC_TEST_LITERATURE_EXTRACT',
  }),
  caffeineFraction: createValueWithOrigin(3.0, 'literature', '%', {
    citation: 'SYNTHETIC_TEST_LITERATURE_CAFFEINE',
  }),
  totalPolyphenolsFraction: createValueWithOrigin(20.0, 'literature', '%', {
    citation: 'SYNTHETIC_TEST_LITERATURE_POLYPHENOLS',
  }),
  theanineFraction: createValueWithOrigin(2.0, 'literature', '%', {
    citation: 'SYNTHETIC_TEST_LITERATURE_THEANINE',
  }),
  isCustom: true,
};

function createTestGongfuSession(overrides: Partial<GongfuSessionConfig> = {}): GongfuSessionConfig {
  return {
    methodId: 'gongfu_cha',
    teaId: 'synthetic-gongfu-test-tea',
    vessel: DEFAULT_VESSELS[0],
    leafMassGrams: 5.0,
    waterProfile: DEFAULT_WATER_PROFILES[0],
    baseWaterTemperatureC: 95.0,
    steps: [
      { stepNumber: 1, infusionTimeSeconds: 15.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      { stepNumber: 2, infusionTimeSeconds: 20.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      { stepNumber: 3, infusionTimeSeconds: 25.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
    ],
    ...overrides,
  };
}

const DEFAULT_TEST_OPTIONS: GongfuWaterBalanceOptions = {
  capillaryHoldUpCapacityMl: createValueWithOrigin(6.0, 'measured', 'мл', {
    measurementMethod: 'SYNTHETIC_DRAIN_WEIGHING',
    sampleInfo: 'SYNTHETIC_VESSEL_GAIWAN_110',
  }),
  assumedWaterDensityGPerMl: 1.0,
};

/**
 * Тестовый набор для верификации водного баланса метода Гунфу Ча (Этап 2B.3.1).
 */
export async function runGongfuWaterBalanceTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // Набор 1: Базовое пошаговое накопление и перенос капиллярного остатка
  {
    const suite = '1. Баланс проливов Гунфу Ча (накопление влаги и перенос остатка)';
    const session = createTestGongfuSession();
    const balance = simulateGongfuWaterBalance(session, SYNTHETIC_TEST_TEA, DEFAULT_TEST_OPTIONS);

    assert(suite, 'Сессия успешно рассчитана (статус "calculated")', balance.status === 'calculated');
    assert(suite, 'Количество рассчитанных шагов совпадает с конфигурацией (3)', balance.steps.length === 3);

    const s1 = balance.steps[0];
    const s2 = balance.steps[1];
    const s3 = balance.steps[2];

    // 1.1 Накопление влаги внутри листа: m_abs строго монотонно возрастает
    assert(
      suite,
      'Влагопоглощение листа монотонно накапливается от пролива к проливу (s1 < s2 < s3)',
      s1.absorbedWaterAfterStepGrams !== null &&
        s2.absorbedWaterAfterStepGrams !== null &&
        s3.absorbedWaterAfterStepGrams !== null &&
        s1.absorbedWaterAfterStepGrams < s2.absorbedWaterAfterStepGrams &&
        s2.absorbedWaterAfterStepGrams < s3.absorbedWaterAfterStepGrams
    );

    // 1.2 На шаге 1 начальный капиллярный перенос равен 0
    assert(
      suite,
      'На первом проливе перенесённая капиллярная влага строго 0 мл',
      s1.initialCarriedFreeWaterVolumeMl === 0.0 && s1.initialCarriedFreeWaterMassGrams === 0.0
    );

    // 1.3 Перенос капиллярного остатка из шага 1 в шаг 2
    assert(
      suite,
      'Капиллярный остаток шага 1 (6 мл) корректно перенесён в свободную фазу шага 2',
      s1.retainedLiquorVolumeMl === 6.0 &&
        s2.initialCarriedFreeWaterVolumeMl === 6.0 &&
        s2.freeWaterBeforeUptakeVolumeMl === 106.0
    );

    // 1.4 Перенос капиллярного остатка из шага 2 в шаг 3
    assert(
      suite,
      'Капиллярный остаток шага 2 (6 мл) корректно перенесён в свободную фазу шага 3 (106 мл)',
      s2.retainedLiquorVolumeMl === 6.0 &&
        s3.initialCarriedFreeWaterVolumeMl === 6.0 &&
        s3.freeWaterBeforeUptakeVolumeMl === 106.0
    );
  }

  // Набор 2: Закон сохранения массы на каждом шаге и по всей сессии
  {
    const suite = '2. Закон сохранения массы водного баланса Гунфу Ча';
    const session = createTestGongfuSession();
    const balance = simulateGongfuWaterBalance(session, SYNTHETIC_TEST_TEA, DEFAULT_TEST_OPTIONS);

    for (const step of balance.steps) {
      assert(
        suite,
        `Невязка баланса массы на шаге ${step.stepNumber} строго равна 0 (в пределах 1e-12 г)`,
        step.stepMassConservationDeltaGrams !== null &&
          Math.abs(step.stepMassConservationDeltaGrams) < 1e-12
      );
    }

    // Глобальный баланс сессии: sum(V_fresh) = finalAbsorbed + finalRetained + sum(V_drained)
    assert(
      suite,
      'Суммарный объём налитой воды строго равен сумме поглощённой, удержанной и слитой (300 мл)',
      balance.totalAddedWaterVolumeMl === 300.0 &&
        balance.sessionMassConservationDeltaGrams !== null &&
        Math.abs(balance.sessionMassConservationDeltaGrams) < 1e-12
    );
  }

  // Набор 3: Ограничение доступной свободной водой
  {
    const suite = '3. Ограничение поглощения доступной водой в сосуде';
    // Навеска 50 г (влагоёмкость 125 г), а воды налито всего 10 мл
    const sessionLowWater = createTestGongfuSession({
      leafMassGrams: 50.0,
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 60.0, pourWaterVolumeMl: 10.0, waterTemperatureC: 95.0 },
      ],
    });

    const balanceLow = simulateGongfuWaterBalance(sessionLowWater, SYNTHETIC_TEST_TEA, DEFAULT_TEST_OPTIONS);
    const step = balanceLow.steps[0];

    assert(
      suite,
      'Поглощение ограничено доступной водой (ровно 10 г поглощено)',
      step.actualAbsorbedGrams === 10.0 &&
        step.absorptionLimitingFactor === 'limited_by_available_free_water'
    );
    assert(
      suite,
      'Вся свободная вода исчерпана листом: слив равен 0 мл, остаток равен 0 мл',
      step.drainedLiquorVolumeMl === 0.0 &&
        step.retainedLiquorVolumeMl === 0.0 &&
        step.drainLimitingFactor === 'zero_water'
    );
    assert(
      suite,
      'Закон сохранения массы соблюдён при полном поглощении воды навеской',
      Math.abs(step.stepMassConservationDeltaGrams ?? 1) < 1e-12
    );
  }

  // Набор 4: Ограничение остаточной термодинамической влагоёмкостью
  {
    const suite = '4. Ограничение предельной влагоёмкостью листа (m_max)';
    // 5 проливов по 100 с: лист полностью насыщается (m_max = 5 г * 2.5 г/г = 12.5 г)
    const sessionLong = createTestGongfuSession({
      leafMassGrams: 5.0,
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 100.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
        { stepNumber: 2, infusionTimeSeconds: 100.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
        { stepNumber: 3, infusionTimeSeconds: 100.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
        { stepNumber: 4, infusionTimeSeconds: 100.0, pourWaterVolumeMl: 100.0, waterTemperatureC: 95.0 },
      ],
    });

    const balanceLong = simulateGongfuWaterBalance(sessionLong, SYNTHETIC_TEST_TEA, DEFAULT_TEST_OPTIONS);
    const lastStep = balanceLong.steps[3];

    assert(
      suite,
      'К 4-му проливу поглощённая вода достигает предельной влагоёмкости 12.5 г',
      lastStep.absorbedWaterAfterStepGrams !== null &&
        Math.abs(lastStep.absorbedWaterAfterStepGrams - 12.5) < 1e-3
    );
    assert(
      suite,
      'При насыщении листа фактическое поглощение на шаге стремится к 0 г',
      lastStep.actualAbsorbedGrams !== null && lastStep.actualAbsorbedGrams < 0.01
    );
  }

  // Набор 5: Неизвестная кинетика гидратации и распространение неопределённости
  {
    const suite = '5. Неизвестная кинетика гидратации (блокировка зависимых шагов)';
    const teaUnknownK: TeaSample = {
      ...SYNTHETIC_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
        sourceNotes: 'Константа неизвестна',
      }),
    };

    const session = createTestGongfuSession();
    const balance = simulateGongfuWaterBalance(session, teaUnknownK, DEFAULT_TEST_OPTIONS);

    assert(
      suite,
      'Статус всей сессии равен "unknown_hydration_profile"',
      balance.status === 'unknown_hydration_profile'
    );
    assert(
      suite,
      'Шаг 1 имеет статус unknown_hydration_profile и null для зависимых масс',
      balance.steps[0].status === 'unknown_hydration_profile' &&
        balance.steps[0].actualAbsorbedGrams === null &&
        balance.steps[0].drainedLiquorVolumeMl === null
    );
    assert(
      suite,
      'Шаг 2 заблокирован: статус blocked_by_unknown_prior_state и null для масс',
      balance.steps[1].status === 'blocked_by_unknown_prior_state' &&
        balance.steps[1].actualAbsorbedGrams === null &&
        balance.steps[1].drainedLiquorVolumeMl === null
    );
    assert(
      suite,
      'Шаг 3 заблокирован: статус blocked_by_unknown_prior_state и null для масс',
      balance.steps[2].status === 'blocked_by_unknown_prior_state' &&
        balance.steps[2].actualAbsorbedGrams === null
    );
    assert(
      suite,
      'Итоговые количественные показатели сессии строго null (Unknown ≠ 0)',
      balance.finalAbsorbedWaterGrams === null &&
        balance.totalDrainedLiquorVolumeMl === null &&
        balance.sessionMassConservationDeltaGrams === null
    );
  }

  // Набор 6: Неизвестная капиллярная ёмкость удержания
  {
    const suite = '6. Неизвестное капиллярное удержание (дренаж не определён)';
    const session = createTestGongfuSession();
    // Не передаём капиллярную ёмкость
    const balanceNoCap = simulateGongfuWaterBalance(session, SYNTHETIC_TEST_TEA, {
      capillaryHoldUpCapacityMl: null,
    });

    assert(
      suite,
      'Статус сессии равен "unknown_capillary_hold_up"',
      balanceNoCap.status === 'unknown_capillary_hold_up'
    );
    assert(
      suite,
      'Шаг 1: гидратация рассчитана, но дренаж unknown_capillary_hold_up (слив равен null)',
      balanceNoCap.steps[0].status === 'unknown_capillary_hold_up' &&
        balanceNoCap.steps[0].actualAbsorbedGrams !== null &&
        balanceNoCap.steps[0].drainedLiquorVolumeMl === null &&
        balanceNoCap.steps[0].retainedLiquorVolumeMl === null
    );
    assert(
      suite,
      'Шаг 2 заблокирован, так как переносимый остаток неизвестен (blocked_by_unknown_prior_state)',
      balanceNoCap.steps[1].status === 'blocked_by_unknown_prior_state' &&
        balanceNoCap.steps[1].initialCarriedFreeWaterVolumeMl === null
    );
  }

  // Набор 7: Капиллярная ёмкость превышает свободный объём
  {
    const suite = '7. Капиллярная ёмкость превышает свободный объём жидкости';
    // Налито 5 мл воды, капиллярная ёмкость 10 мл
    const sessionTinyWater = createTestGongfuSession({
      steps: [
        { stepNumber: 1, infusionTimeSeconds: 10.0, pourWaterVolumeMl: 5.0, waterTemperatureC: 95.0 },
      ],
    });

    const balanceTiny = simulateGongfuWaterBalance(sessionTinyWater, SYNTHETIC_TEST_TEA, {
      capillaryHoldUpCapacityMl: createValueWithOrigin(10.0, 'measured', 'мл', {
        measurementMethod: 'SYNTHETIC_DRAIN_WEIGHING',
        sampleInfo: 'SYNTHETIC_VESSEL',
      }),
    });

    const s1 = balanceTiny.steps[0];
    assert(
      suite,
      'Фактический остаток ограничен всей доступной свободной водой, а слив равен 0 мл',
      s1.freeWaterAfterUptakeVolumeMl !== null &&
        s1.retainedLiquorVolumeMl === s1.freeWaterAfterUptakeVolumeMl &&
        s1.drainedLiquorVolumeMl === 0.0 &&
        s1.drainLimitingFactor === 'insufficient_water_for_capillary_hold_up'
    );
    assert(
      suite,
      'Закон сохранения массы сохраняется при превышении капиллярной ёмкости',
      Math.abs(s1.stepMassConservationDeltaGrams ?? 1) < 1e-12
    );
  }

  // Набор 8: Явный нулевой k_hyd = 0 (расчётный ноль, не unknown)
  {
    const suite = '8. Явная нулевая константа скорости k=0';
    const teaZeroK: TeaSample = {
      ...SYNTHETIC_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin(0.0, 'measured', 's^-1', {
        measurementMethod: 'SYNTHETIC_ZERO_METHOD',
        sampleInfo: 'SYNTHETIC_ZERO_SAMPLE',
      }),
    };

    const session = createTestGongfuSession();
    const balanceZeroK = simulateGongfuWaterBalance(session, teaZeroK, DEFAULT_TEST_OPTIONS);

    assert(
      suite,
      'При явном k=0 статус сессии "calculated" (рассчитанный нулевой перенос, а не unknown)',
      balanceZeroK.status === 'calculated'
    );
    assert(
      suite,
      'Фактическое поглощение на всех проливах строго 0 г',
      balanceZeroK.steps.every((s) => s.actualAbsorbedGrams === 0.0)
    );
    assert(
      suite,
      'Финальная поглощённая масса листа равна 0 г',
      balanceZeroK.finalAbsorbedWaterGrams === 0.0
    );
  }

  // Набор 9: Валидация несоответствия входных данных
  {
    const suite = '9. Валидация входных данных (ошибки валидации)';
    const session = createTestGongfuSession();

    // 9.1 Несовпадение teaId
    let caughtMismatchedTea = false;
    try {
      const foreignTea = { ...SYNTHETIC_TEST_TEA, id: 'completely-different-tea-id' };
      simulateGongfuWaterBalance(session, foreignTea, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'MISMATCHED_TEA_ID') {
        caughtMismatchedTea = true;
      }
    }
    assert(suite, 'Несовпадение session.teaId и tea.id отклоняется с MISMATCHED_TEA_ID', caughtMismatchedTea);

    // 9.2 Отрицательная масса листа
    let caughtNegativeMass = false;
    try {
      const badSession = createTestGongfuSession({ leafMassGrams: -5.0 });
      simulateGongfuWaterBalance(badSession, SYNTHETIC_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_DRY_MASS') {
        caughtNegativeMass = true;
      }
    }
    assert(suite, 'Отрицательная масса листа отклоняется с INVALID_DRY_MASS', caughtNegativeMass);

    // 9.3 Пустой список шагов
    let caughtEmptySteps = false;
    try {
      const emptyStepsSession = createTestGongfuSession({ steps: [] });
      simulateGongfuWaterBalance(emptyStepsSession, SYNTHETIC_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'EMPTY_STEPS') {
        caughtEmptySteps = true;
      }
    }
    assert(suite, 'Пустой список шагов отклоняется с EMPTY_STEPS', caughtEmptySteps);

    // 9.4 Недопустимая единица капиллярной ёмкости (например, кг)
    let caughtInvalidCapUnit = false;
    try {
      simulateGongfuWaterBalance(session, SYNTHETIC_TEST_TEA, {
        capillaryHoldUpCapacityMl: createValueWithOrigin(6.0, 'measured', 'кг', {
          measurementMethod: 'Test',
          sampleInfo: 'Test',
        }),
      });
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_UNIT') {
        caughtInvalidCapUnit = true;
      }
    }
    assert(suite, 'Несовместимая единица капиллярной ёмкости (кг) отклоняется с INVALID_UNIT', caughtInvalidCapUnit);
  }

  // Набор 10: Совместимость с эталонным каталогом REFERENCE_TEAS (все 6 чаёв unknown)
  {
    const suite = '10. Совместимость с каталогом REFERENCE_TEAS (все эталоны unknown)';

    let allReferenceTeasBlocked = true;
    for (const tea of REFERENCE_TEAS) {
      const session = createTestGongfuSession({ teaId: tea.id });
      const balance = simulateGongfuWaterBalance(session, tea, DEFAULT_TEST_OPTIONS);

      if (
        balance.status !== 'unknown_hydration_profile' ||
        balance.steps[0].status !== 'unknown_hydration_profile' ||
        balance.steps[1].status !== 'blocked_by_unknown_prior_state' ||
        balance.finalAbsorbedWaterGrams !== null ||
        balance.totalDrainedLiquorVolumeMl !== null
      ) {
        allReferenceTeasBlocked = false;
        break;
      }
    }

    assert(
      suite,
      'Все 6 эталонных чаёв каталога дают unknown_hydration_profile без скрытой генерации констант',
      allReferenceTeasBlocked
    );
  }

  return results;
}
