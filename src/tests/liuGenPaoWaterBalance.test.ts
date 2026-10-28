/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LiuGenPaoSessionConfig } from '../domain/brewing/types.ts';
import { DEFAULT_VESSELS, DEFAULT_WATER_PROFILES } from '../domain/brewing/defaults.ts';
import { TeaSample, createValueWithOrigin } from '../domain/tea/types.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import {
  simulateLiuGenPaoWaterBalance,
  LiuGenPaoWaterBalanceOptions,
  WaterBalanceValidationError,
} from '../engine/water-balance/index.ts';
import type { TestResult } from './domain.test.ts';

/**
 * Синтетический тестовый образец чая с явно маркированными тестовыми метаданными.
 * НЕ выдаётся за данные реальной партии или стандарта.
 */
const SYNTHETIC_LIU_GEN_PAO_TEST_TEA: TeaSample = {
  id: 'synthetic-liu-gen-pao-test-tea',
  name: 'Синтетический чай для тестирования Лю Гэнь Пао',
  category: 'oolong_dark',
  morphology: 'strip_rolled',
  roastLevel: 'medium',
  waterAbsorptionRatio: createValueWithOrigin(2.5, 'literature', 'г/г', {
    citation: 'SYNTHETIC_TEST_LITERATURE_REF_WATER_ABSORPTION: синтетический тест влагоёмкости',
  }),
  leafBulkDensityGPerCm3: createValueWithOrigin(0.35, 'model_profile', 'г/см³'),
  uncalibratedHydrationSpeed: createValueWithOrigin(1.0, 'model_profile', 'ед.'),
  hydrationRateConstantPerSecond: createValueWithOrigin(0.04, 'measured', 's^-1', {
    measurementMethod: 'SYNTHETIC_GRAVIMETRIC_LAB_METHOD',
    sampleInfo: 'SYNTHETIC_BATCH_LIU_001',
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

function createTestLiuGenPaoSession(
  overrides: Partial<LiuGenPaoSessionConfig> = {}
): LiuGenPaoSessionConfig {
  return {
    methodId: 'liu_gen_pao',
    teaId: 'synthetic-liu-gen-pao-test-tea',
    vessel: DEFAULT_VESSELS[0], // 110 мл гайвань
    leafMassGrams: 5.0,
    waterProfile: DEFAULT_WATER_PROFILES[0],
    baseWaterTemperatureC: 95.0,
    steps: [
      {
        stepNumber: 1,
        infusionTimeSeconds: 25.0,
        addedWaterVolumeMl: 100.0,
        addedWaterTemperatureC: 95.0,
        retainedLiquorFractionOfTotal: 0.4, // сохраняем 40%
      },
      {
        stepNumber: 2,
        infusionTimeSeconds: 30.0,
        addedWaterVolumeMl: 60.0,
        addedWaterTemperatureC: 95.0,
        retainedLiquorFractionOfTotal: 0.4,
      },
      {
        stepNumber: 3,
        infusionTimeSeconds: 45.0,
        addedWaterVolumeMl: 60.0,
        addedWaterTemperatureC: 95.0,
        retainedLiquorFractionOfTotal: 0.4,
      },
    ],
    ...overrides,
  };
}

const DEFAULT_TEST_OPTIONS: LiuGenPaoWaterBalanceOptions = {
  capillaryHoldUpCapacityMl: createValueWithOrigin(6.0, 'measured', 'мл', {
    measurementMethod: 'SYNTHETIC_DRAIN_WEIGHING',
    sampleInfo: 'SYNTHETIC_VESSEL_GAIWAN_110',
  }),
  assumedWaterDensityGPerMl: 1.0,
};

/**
 * Тестовый набор для верификации водного баланса метода Лю Гэнь Пао (Этап 2B.3.2.1).
 */
export async function runLiuGenPaoWaterBalanceTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // 1. Расчёт одного шага с известной гидратацией и известной ёмкостью удержания
  {
    const suite = '1. Базовый расчёт шага Лю Гэнь Пао';
    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20.0,
          addedWaterVolumeMl: 100.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.4,
        },
      ],
    });
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);

    assert(suite, 'Сессия успешно рассчитана со статусом "calculated"', balance.status === 'calculated');
    assert(suite, 'Шаг 1 имеет статус "calculated"', balance.steps[0].status === 'calculated');
    assert(suite, 'Перенесённый корень перед шагом 1 строго равен 0 мл', balance.steps[0].initialCarriedRootVolumeMl === 0);

    const s1 = balance.steps[0];
    assert(suite, 'Поглощённая вода рассчитана (> 0 г)', (s1.actualAbsorbedGrams ?? 0) > 0);
    assert(suite, 'Свободный настой после поглощения уменьшился на величину поглощения',
      Math.abs((s1.freeWaterAfterUptakeVolumeMl ?? 0) - (100.0 - (s1.actualAbsorbedGrams ?? 0))) < 1e-9);
    assert(suite, 'Слитый настой и удержанный корень рассчитаны (> 0 мл)',
      (s1.drainedLiquorVolumeMl ?? 0) > 0 && (s1.retainedLiquorVolumeMl ?? 0) > 0);
  }

  // 2. Перенос удержанного корня в следующий шаг
  {
    const suite = '2. Перенос сохранённого корня между шагами';
    const session = createTestLiuGenPaoSession();
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);

    const s1 = balance.steps[0];
    const s2 = balance.steps[1];
    const s3 = balance.steps[2];

    assert(
      suite,
      'Удержанный корень шага 1 в точности перенесён как начальный свободный корень шага 2',
      s2.initialCarriedRootVolumeMl !== null &&
      Math.abs(s2.initialCarriedRootVolumeMl - s1.retainedLiquorVolumeMl!) < 1e-9
    );
    assert(
      suite,
      'Суммарный объём свободной воды перед поглощением на шаге 2 равен сумме долива и перенесённого корня',
      s2.freeWaterBeforeUptakeVolumeMl !== null &&
      Math.abs(s2.freeWaterBeforeUptakeVolumeMl - (s2.addedWaterVolumeMl + s1.retainedLiquorVolumeMl!)) < 1e-9
    );
    assert(
      suite,
      'Удержанный корень шага 2 в точности перенесён как начальный свободный корень шага 3',
      s3.initialCarriedRootVolumeMl !== null &&
      Math.abs(s3.initialCarriedRootVolumeMl - s2.retainedLiquorVolumeMl!) < 1e-9
    );
  }

  // 3. Доля корня применяется к свободному объёму после поглощения, а не только к доливу
  {
    const suite = '3. Применение доли корня к свободному объёму после поглощения';
    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 25.0,
          addedWaterVolumeMl: 100.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.35,
        },
      ],
    });
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    const s1 = balance.steps[0];

    const freeAfterUptake = s1.freeWaterAfterUptakeVolumeMl!;
    const expectedTargetRoot = freeAfterUptake * 0.35;
    assert(
      suite,
      'targetRootVolumeMl строго равен r * freeWaterAfterUptakeVolumeMl',
      Math.abs(s1.targetRootVolumeMl! - expectedTargetRoot) < 1e-9
    );
    assert(
      suite,
      'targetRootVolumeMl НЕ равен r * addedWaterVolumeMl (учитывает поглощение листа)',
      Math.abs(s1.targetRootVolumeMl! - (100.0 * 0.35)) > 0.01
    );
  }

  // 4. Капиллярная ёмкость выше целевого корня — фактический остаток определяется капиллярным ограничением
  {
    const suite = '4. Капиллярное ограничение при малом целевом корне (governed_by_capillary_hold_up)';
    // Заливаем 30 мл, лист поглощает ~5 мл -> свободный настой 25 мл.
    // При доле r = 0.1 целевой корень равен 2.5 мл.
    // Капиллярная ёмкость 8.0 мл > 2.5 мл.
    // Фактический остаток должен быть 8.0 мл с limitingFactor: governed_by_capillary_hold_up!
    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 10.0,
          addedWaterVolumeMl: 30.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.1,
        },
      ],
    });
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, {
      capillaryHoldUpCapacityMl: createValueWithOrigin(8.0, 'measured', 'мл', {
        measurementMethod: 'Test',
        sampleInfo: 'Test',
      }),
    });
    const s1 = balance.steps[0];

    assert(
      suite,
      'Фактический удержанный объём ограничен капиллярной ёмкостью (8.0 мл)',
      Math.abs(s1.retainedLiquorVolumeMl! - 8.0) < 1e-9
    );
    assert(
      suite,
      'Лимитирующий фактор дренажа установлен в "governed_by_capillary_hold_up"',
      s1.drainLimitingFactor === 'governed_by_capillary_hold_up'
    );
    assert(
      suite,
      'Слитый объём равен разности свободного объёма и капиллярной ёмкости',
      Math.abs(s1.drainedLiquorVolumeMl! - (s1.freeWaterAfterUptakeVolumeMl! - 8.0)) < 1e-9
    );
  }

  // 5. Целевой корень выше капиллярной ёмкости — фактический остаток определяется рецептурной долей
  {
    const suite = '5. Рецептурное удержание корня (exact_target)';
    const session = createTestLiuGenPaoSession({
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 15.0,
          addedWaterVolumeMl: 100.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.5, // 50%
        },
      ],
    });
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    const s1 = balance.steps[0];

    assert(
      suite,
      'Лимитирующий фактор дренажа установлен в "exact_target"',
      s1.drainLimitingFactor === 'exact_target'
    );
    assert(
      suite,
      'Фактический удержанный корень равен 50% от свободного настоя после поглощения',
      Math.abs(s1.retainedLiquorVolumeMl! - (s1.freeWaterAfterUptakeVolumeMl! * 0.5)) < 1e-9
    );
  }

  // 6. Капиллярная ёмкость больше всего доступного свободного настоя — слив равен нулю
  {
    const suite = '6. Полное капиллярное удержание при малом объёме жидкости';
    // Навеска 10 г поглотит часть из 20 мл. Капиллярная ёмкость 50 мл (заведомо больше всего остатка).
    const session = createTestLiuGenPaoSession({
      leafMassGrams: 10.0,
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 30.0,
          addedWaterVolumeMl: 20.0,
          addedWaterTemperatureC: 95.0,
          retainedLiquorFractionOfTotal: 0.2,
        },
      ],
    });
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, {
      capillaryHoldUpCapacityMl: createValueWithOrigin(50.0, 'measured', 'мл', {
        measurementMethod: 'Test',
        sampleInfo: 'Test',
      }),
    });
    const s1 = balance.steps[0];

    assert(
      suite,
      'Слитый объём равен 0 мл при капиллярной ёмкости, превышающей свободную жидкость',
      s1.drainedLiquorVolumeMl === 0
    );
    assert(
      suite,
      'Лимитирующий фактор дренажа "insufficient_water_for_capillary_hold_up"',
      s1.drainLimitingFactor === 'insufficient_water_for_capillary_hold_up'
    );
    assert(
      suite,
      'Вся оставшаяся свободная жидкость удержана в сосуде',
      Math.abs(s1.retainedLiquorVolumeMl! - s1.freeWaterAfterUptakeVolumeMl!) < 1e-9
    );
  }

  // 7. Масса поглощённой воды сохраняется между проливами
  {
    const suite = '7. Накопление влаги в листе между шагами Лю Гэнь Пао';
    const session = createTestLiuGenPaoSession();
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);

    const s1 = balance.steps[0];
    const s2 = balance.steps[1];
    const s3 = balance.steps[2];

    assert(
      suite,
      'Влагопоглощение листа монотонно возрастает от шага к шагу (s1 < s2 < s3)',
      s1.absorbedWaterAfterStepGrams! < s2.absorbedWaterAfterStepGrams! &&
      s2.absorbedWaterAfterStepGrams! < s3.absorbedWaterAfterStepGrams!
    );
    assert(
      suite,
      'absorbedWaterBeforeStepGrams на шаге 2 строго равен absorbedWaterAfterStepGrams шага 1',
      Math.abs(s2.absorbedWaterBeforeStepGrams! - s1.absorbedWaterAfterStepGrams!) < 1e-12
    );
    assert(
      suite,
      'absorbedWaterBeforeStepGrams на шаге 3 строго равен absorbedWaterAfterStepGrams шага 2',
      Math.abs(s3.absorbedWaterBeforeStepGrams! - s2.absorbedWaterAfterStepGrams!) < 1e-12
    );
  }

  // 8. Сохранение массы на каждом шаге и на всей сессии
  {
    const suite = '8. Закон сохранения массы в Лю Гэнь Пао';
    const session = createTestLiuGenPaoSession();
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);

    for (const step of balance.steps) {
      assert(
        suite,
        `Невязка баланса массы на шаге ${step.stepNumber} строго ~0 (в пределах 1e-12 г)`,
        step.stepMassConservationDeltaGrams !== null &&
        Math.abs(step.stepMassConservationDeltaGrams) < 1e-12
      );
    }

    assert(
      suite,
      'Глобальная невязка материального баланса сессии строго ~0 (в пределах 1e-12 г)',
      balance.sessionMassConservationDeltaGrams !== null &&
      Math.abs(balance.sessionMassConservationDeltaGrams) < 1e-12
    );

    const totalAdded = balance.totalAddedWaterMassGrams;
    const finalAbs = balance.finalAbsorbedWaterGrams!;
    const finalRet = balance.finalRetainedLiquorMassGrams!;
    const totalDrained = balance.totalDrainedLiquorMassGrams!;
    assert(
      suite,
      'Сумма добавленной воды строго равна сумме поглощённой, удержанной и слитой',
      Math.abs(totalAdded - (finalAbs + finalRet + totalDrained)) < 1e-12
    );
  }

  // 9. Неизвестная константа гидратации блокирует зависимые шаги
  {
    const suite = '9. Неизвестная кинетика гидратации (Unknown ≠ 0)';
    const unknownTea: TeaSample = {
      ...SYNTHETIC_LIU_GEN_PAO_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1'),
    };
    const session = createTestLiuGenPaoSession();
    const balance = simulateLiuGenPaoWaterBalance(session, unknownTea, DEFAULT_TEST_OPTIONS);

    assert(suite, 'Сессия имеет статус "unknown_hydration_profile"', balance.status === 'unknown_hydration_profile');
    assert(suite, 'Шаг 1 имеет статус "unknown_hydration_profile"', balance.steps[0].status === 'unknown_hydration_profile');
    assert(suite, 'Шаг 2 заблокирован: статус "blocked_by_unknown_prior_state"', balance.steps[1].status === 'blocked_by_unknown_prior_state');
    assert(suite, 'Шаг 3 заблокирован: статус "blocked_by_unknown_prior_state"', balance.steps[2].status === 'blocked_by_unknown_prior_state');
    assert(suite, 'Итоговый слив и остаток равны null', balance.totalDrainedLiquorVolumeMl === null && balance.finalRetainedLiquorVolumeMl === null);
  }

  // 10. Неизвестная капиллярная ёмкость оставляет фактический слив и остаток null и блокирует следующие шаги
  {
    const suite = '10. Неизвестная капиллярная ёмкость (Unknown ≠ 0)';
    const session = createTestLiuGenPaoSession();
    const balance = simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, {
      capillaryHoldUpCapacityMl: null,
    });

    assert(suite, 'Сессия имеет статус "unknown_capillary_hold_up"', balance.status === 'unknown_capillary_hold_up');
    assert(suite, 'Шаг 1: гидратация рассчитана, но дренаж unknown_capillary_hold_up', balance.steps[0].status === 'unknown_capillary_hold_up');
    assert(suite, 'Шаг 1: drainedLiquorVolumeMl и retainedLiquorVolumeMl равны null',
      balance.steps[0].drainedLiquorVolumeMl === null && balance.steps[0].retainedLiquorVolumeMl === null);
    assert(suite, 'Шаг 2 заблокирован (blocked_by_unknown_prior_state)', balance.steps[1].status === 'blocked_by_unknown_prior_state');
  }

  // 11. Явный нулевой k = 0 отличается от неизвестного параметра
  {
    const suite = '11. Явная нулевая константа скорости (k = 0)';
    const zeroKTea: TeaSample = {
      ...SYNTHETIC_LIU_GEN_PAO_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin(0.0, 'measured', 's^-1', {
        measurementMethod: 'ZeroKCalibration',
        sampleInfo: 'HydrophobicTestLeaf',
      }),
    };
    const session = createTestLiuGenPaoSession();
    const balance = simulateLiuGenPaoWaterBalance(session, zeroKTea, DEFAULT_TEST_OPTIONS);

    assert(suite, 'Сессия со статусом "calculated" (нулевой перенос, а не unknown)', balance.status === 'calculated');
    assert(suite, 'Поглощённая вода на всех шагах строго равна 0 г', balance.finalAbsorbedWaterGrams === 0.0);
    assert(suite, 'Невязка баланса массы строго ~0', Math.abs(balance.sessionMassConservationDeltaGrams ?? 1) < 1e-12);
  }

  // 12. Некорректная доля корня, отрицательная длительность, неверная единица и другие недопустимые входы
  {
    const suite = '12. Валидация входных данных Лю Гэнь Пао';
    const session = createTestLiuGenPaoSession();

    // 12.1 Доля корня >= 1.0
    let caughtFractionGte1 = false;
    try {
      const badSession = createTestLiuGenPaoSession({
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 100.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 1.0, // недопустимо [0, 1)
          },
        ],
      });
      simulateLiuGenPaoWaterBalance(badSession, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_RETAINED_FRACTION') {
        caughtFractionGte1 = true;
      }
    }
    assert(suite, 'Доля корня >= 1.0 отклоняется с INVALID_RETAINED_FRACTION', caughtFractionGte1);

    // 12.2 Отрицательная доля корня
    let caughtNegativeFraction = false;
    try {
      const badSession = createTestLiuGenPaoSession({
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 100.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: -0.2,
          },
        ],
      });
      simulateLiuGenPaoWaterBalance(badSession, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_RETAINED_FRACTION') {
        caughtNegativeFraction = true;
      }
    }
    assert(suite, 'Отрицательная доля корня отклоняется с INVALID_RETAINED_FRACTION', caughtNegativeFraction);

    // 12.3 Несовпадение teaId
    let caughtMismatchedTea = false;
    try {
      const badTea = { ...SYNTHETIC_LIU_GEN_PAO_TEST_TEA, id: 'another-tea-id' };
      simulateLiuGenPaoWaterBalance(session, badTea, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'MISMATCHED_TEA_ID') {
        caughtMismatchedTea = true;
      }
    }
    assert(suite, 'Несовпадение session.teaId и tea.id отклоняется с MISMATCHED_TEA_ID', caughtMismatchedTea);

    // 12.4 Неверный methodId
    let caughtInvalidMethod = false;
    try {
      const badSession = { ...session, methodId: 'gongfu_cha' as const };
      simulateLiuGenPaoWaterBalance(badSession as any, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_METHOD') {
        caughtInvalidMethod = true;
      }
    }
    assert(suite, 'Несовпадающий methodId отклоняется с INVALID_METHOD', caughtInvalidMethod);

    // 12.5 Несовместимая единица капиллярной ёмкости (кг)
    let caughtInvalidCapUnit = false;
    try {
      simulateLiuGenPaoWaterBalance(session, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, {
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

    // 12.6 Отрицательная температура воды
    let caughtNegativeTemp = false;
    try {
      const badTempSession = createTestLiuGenPaoSession({
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 100.0,
            addedWaterTemperatureC: -5.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
        ],
      });
      simulateLiuGenPaoWaterBalance(badTempSession, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtNegativeTemp = true;
      }
    }
    assert(suite, 'Отрицательная температура воды отклоняется с INVALID_WATER_TEMPERATURE', caughtNegativeTemp);
  }

  // 13. Переполнение свежей заливкой и переполнение суммой свежей воды и известного корня
  {
    const suite = '13. Контроль вместимости сосуда в Лю Гэнь Пао';

    // 13.1 Свежий долив сам по себе превышает вместимость сосуда
    let caughtFreshOverflow = false;
    try {
      const overflowSession = createTestLiuGenPaoSession({
        vessel: { ...DEFAULT_VESSELS[0], volumeMl: 110.0 },
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 125.0, // > 110 мл
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
        ],
      });
      simulateLiuGenPaoWaterBalance(overflowSession, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtFreshOverflow = true;
      }
    }
    assert(suite, 'Свежий долив больше вместимости сосуда (125 > 110 мл) отклоняется с VESSEL_CAPACITY_EXCEEDED', caughtFreshOverflow);

    // 13.2 Сумма свежего долива и перенесённого корня превышает вместимость сосуда
    let caughtSumOverflow = false;
    try {
      // Шаг 1: 100 мл, сохраняем корень 40% (около 36-38 мл)
      // Шаг 2: доливаем 80 мл. Сумма: 80 + ~37 = 117 мл > 110 мл!
      const sumOverflowSession = createTestLiuGenPaoSession({
        vessel: { ...DEFAULT_VESSELS[0], volumeMl: 110.0 },
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 100.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
          {
            stepNumber: 2,
            infusionTimeSeconds: 25.0,
            addedWaterVolumeMl: 80.0, // 80 + ~37 = 117 > 110 мл
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
        ],
      });
      simulateLiuGenPaoWaterBalance(sumOverflowSession, SYNTHETIC_LIU_GEN_PAO_TEST_TEA, DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtSumOverflow = true;
      }
    }
    assert(suite, 'Сумма свежего долива и перенесённого корня (80 + 37 > 110 мл) отклоняется с VESSEL_CAPACITY_EXCEEDED', caughtSumOverflow);
  }

  // 14. Если предыдущий шаг неизвестен, независимая проверка свежей заливки по-прежнему работает
  {
    const suite = '14. Независимая проверка свежей заливки при неизвестном состоянии в Лю Гэнь Пао';

    // 14.1 Шаг 1 unknown_hydration_profile, шаг 2 свежий долив 150 мл > 110 мл
    let caughtOverflowOnBlocked = false;
    try {
      const sessionWithUnknown = createTestLiuGenPaoSession({
        teaId: REFERENCE_TEAS[0].id,
        vessel: { ...DEFAULT_VESSELS[0], volumeMl: 110.0 },
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 100.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
          {
            stepNumber: 2,
            infusionTimeSeconds: 25.0,
            addedWaterVolumeMl: 150.0, // > 110 мл
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
        ],
      });
      simulateLiuGenPaoWaterBalance(sessionWithUnknown, REFERENCE_TEAS[0], DEFAULT_TEST_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtOverflowOnBlocked = true;
      }
    }
    assert(
      suite,
      'При unknown на шаге 1, переполнение долива на шаге 2 (150 > 110 мл) строго отклоняется с VESSEL_CAPACITY_EXCEEDED',
      caughtOverflowOnBlocked
    );

    // 14.2 Шаг 1 unknown, шаг 2 долив допустим (60 <= 110 мл) -> сохраняет blocked_by_unknown_prior_state и null
    let validBlockedChain = false;
    {
      const validBlockedSession = createTestLiuGenPaoSession({
        teaId: REFERENCE_TEAS[0].id,
        vessel: { ...DEFAULT_VESSELS[0], volumeMl: 110.0 },
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20.0,
            addedWaterVolumeMl: 100.0,
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
          {
            stepNumber: 2,
            infusionTimeSeconds: 25.0,
            addedWaterVolumeMl: 60.0, // допустимо
            addedWaterTemperatureC: 95.0,
            retainedLiquorFractionOfTotal: 0.4,
          },
        ],
      });
      const balance = simulateLiuGenPaoWaterBalance(validBlockedSession, REFERENCE_TEAS[0], DEFAULT_TEST_OPTIONS);
      const s2 = balance.steps[1];
      if (
        balance.status === 'unknown_hydration_profile' &&
        balance.steps[0].status === 'unknown_hydration_profile' &&
        s2.status === 'blocked_by_unknown_prior_state' &&
        s2.addedWaterVolumeMl === 60.0 &&
        s2.initialCarriedRootVolumeMl === null &&
        s2.freeWaterBeforeUptakeVolumeMl === null &&
        s2.drainedLiquorVolumeMl === null &&
        s2.retainedLiquorVolumeMl === null
      ) {
        validBlockedChain = true;
      }
    }
    assert(
      suite,
      'При допустимом доливе (60 <= 110 мл) шаг 2 сохраняет blocked_by_unknown_prior_state и null для зависимых масс',
      validBlockedChain
    );
  }

  // 15. Все 6 эталонных чаёв каталога дают unknown_hydration_profile без фиктивных расчётов
  {
    const suite = '15. Совместимость с каталогом REFERENCE_TEAS в Лю Гэнь Пао';

    let allReferenceTeasBlocked = true;
    for (const tea of REFERENCE_TEAS) {
      const session = createTestLiuGenPaoSession({ teaId: tea.id });
      const balance = simulateLiuGenPaoWaterBalance(session, tea, DEFAULT_TEST_OPTIONS);

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
      'Все 6 эталонных чаёв каталога возвращают unknown_hydration_profile и блокируют зависимые шаги',
      allReferenceTeasBlocked
    );
  }

  return results;
}
