/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  integrateContentThermalStep,
} from '../engine/thermal/contentIntegrator.ts';
import {
  integrateThermalStep,
} from '../engine/thermal/integrator.ts';
import {
  ThermalRangeError,
  ThermalValidationError,
  ThermalInstabilityError,
} from '../engine/thermal/errors.ts';
import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
} from '../engine/thermal/constants.ts';
import {
  VESSEL_THERMAL_PROFILES,
} from '../engine/thermal/profiles.ts';
import {
  ContentThermalState,
  VesselThermalProfile,
} from '../engine/thermal/types.ts';
import { createValueWithOrigin } from '../domain/tea/types.ts';
import { TestResult } from './domain.test.ts';

/**
 * Синтетический модельный профиль удельной теплоёмкости чайного листа.
 * Примечание: 1500 Дж/(кг·К) — тестовый синтетический ориентир, а не измеренное свойство чая.
 */
const SYNTHETIC_LEAF_SPECIFIC_HEAT = createValueWithOrigin(
  1500.0,
  'model_profile',
  'Дж/(кг·К)',
  { sourceNotes: 'Синтетический тестовый ориентир теплоёмкости сухого листа' }
);

/**
 * Синтетический неизвестный профиль удельной теплоёмкости чайного листа (Unknown ≠ 0).
 */
const UNKNOWN_LEAF_SPECIFIC_HEAT = createValueWithOrigin<number>(
  null,
  'unknown',
  'Дж/(кг·К)',
  { sourceNotes: 'Теплоёмкость листа не определена' }
);

/**
 * Синтетические тестовые проводимости для режима без свободной воды.
 */
const SYNTHETIC_DRAINED_G_VESSEL = createValueWithOrigin(
  0.8,
  'model_profile',
  'W/K',
  { sourceNotes: 'Синтетическая модельная проводимость осадок-стенка' }
);

const SYNTHETIC_DRAINED_G_AMBIENT = createValueWithOrigin(
  0.2,
  'model_profile',
  'W/K',
  { sourceNotes: 'Синтетическая модельная проводимость осадок-воздух' }
);

const UNKNOWN_DRAINED_G = createValueWithOrigin<number>(
  null,
  'unknown',
  'W/K',
  { sourceNotes: 'Проводимость не определена' }
);

const ZERO_DRAINED_G = createValueWithOrigin(
  0.0,
  'model_profile',
  'W/K',
  { sourceNotes: 'Адиабатическая изоляция осадка' }
);

export async function runContentIntegratorTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  const gaiwanProfile = VESSEL_THERMAL_PROFILES['vessel-gaiwan-110'];

  // Базовое корректное состояние со свободной водой
  const validWetBaseState: ContentThermalState = {
    leafMassGrams: 5.0,
    absorbedWaterGrams: 8.0,
    freeWaterMassGrams: 100.0,
    contentTemperatureC: 92.0,
    liquidTemperatureC: 92.0,
    vesselTemperatureC: 80.0,
    ambientTemperatureC: 22.0,
    leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
    elapsedSeconds: 0,
  };

  // Базовое корректное состояние без свободной воды (осушенный сосуд)
  const validDrainedBaseState: ContentThermalState = {
    leafMassGrams: 5.0,
    absorbedWaterGrams: 10.0,
    freeWaterMassGrams: 0.0,
    contentTemperatureC: 85.0,
    liquidTemperatureC: null, // strictly null: Unknown ≠ 0
    vesselTemperatureC: 80.0,
    ambientTemperatureC: 22.0,
    leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
    elapsedSeconds: 0,
  };

  // =========================================================================
  // 1. Расчёт теплоёмкости содержимого с листом и свободной водой
  // =========================================================================
  {
    const suite = '1. Расчёт теплоёмкости содержимого (лист + свободная вода)';

    const res = integrateContentThermalStep(
      validWetBaseState,
      gaiwanProfile,
      undefined,
      0 // мгновенная точка t=0
    );

    assert(suite, 'Статус расчёта равен calculated', res.status === 'calculated');

    // C_dry = 0.005 * 1500 = 7.5 Дж/К
    const expectedCdry = 0.005 * 1500.0;
    assert(
      suite,
      'C_dry рассчитана верно (7.5 Дж/К)',
      Math.abs((res.dryLeafHeatCapacityJPerK ?? 0) - expectedCdry) < 1e-12
    );

    // C_wet = 7.5 + 0.008 * 4184 = 7.5 + 33.472 = 40.972 Дж/К
    const expectedCwet = expectedCdry + 0.008 * SPECIFIC_HEAT_WATER_J_PER_KG_K;
    assert(
      suite,
      'C_wet рассчитана верно (40.972 Дж/К)',
      Math.abs((res.wetLeafHeatCapacityJPerK ?? 0) - expectedCwet) < 1e-12
    );

    // C_free = 0.100 * 4184 = 418.4 Дж/К
    const expectedCfree = 0.1 * SPECIFIC_HEAT_WATER_J_PER_KG_K;
    assert(
      suite,
      'C_free рассчитана верно (418.4 Дж/К)',
      Math.abs((res.freeWaterHeatCapacityJPerK ?? 0) - expectedCfree) < 1e-12
    );

    // C_contents = 40.972 + 418.4 = 459.372 Дж/К
    const expectedCcontents = expectedCwet + expectedCfree;
    assert(
      suite,
      'C_contents рассчитана верно (459.372 Дж/К)',
      Math.abs((res.contentHeatCapacityJPerK ?? 0) - expectedCcontents) < 1e-12
    );
  }

  // =========================================================================
  // 2. Расчёт теплоёмкости листа без свободной воды
  // =========================================================================
  {
    const suite = '2. Расчёт теплоёмкости листа без свободной воды';

    const res = integrateContentThermalStep(
      validDrainedBaseState,
      gaiwanProfile,
      {
        conductanceDrainedContentVesselWPerK: SYNTHETIC_DRAINED_G_VESSEL,
        conductanceDrainedContentAmbientWPerK: SYNTHETIC_DRAINED_G_AMBIENT,
      },
      0
    );

    assert(suite, 'Статус расчёта равен calculated', res.status === 'calculated');

    // C_free strictly 0
    assert(
      suite,
      'C_free строго равна 0 при freeWaterMassGrams === 0',
      res.freeWaterHeatCapacityJPerK === 0
    );

    // C_contents === C_wet = 0.005*1500 + 0.010*4184 = 7.5 + 41.84 = 49.34 Дж/К
    const expectedCwet = 0.005 * 1500.0 + 0.01 * SPECIFIC_HEAT_WATER_J_PER_KG_K;
    assert(
      suite,
      'C_contents равна C_wet листа без свободной воды (49.34 Дж/К)',
      Math.abs((res.contentHeatCapacityJPerK ?? 0) - expectedCwet) < 1e-12
    );
  }

  // =========================================================================
  // 3. Инвариант freeWaterMassGrams === 0: liquidTemperatureC строго null
  // =========================================================================
  {
    const suite = '3. Инвариант отсутствия свободной жидкости (liquidTemperatureC === null)';

    const res = integrateContentThermalStep(
      validDrainedBaseState,
      gaiwanProfile,
      {
        conductanceDrainedContentVesselWPerK: SYNTHETIC_DRAINED_G_VESSEL,
        conductanceDrainedContentAmbientWPerK: SYNTHETIC_DRAINED_G_AMBIENT,
      },
      10.0,
      0.1,
      1.0
    );

    assert(suite, 'Статус расчёта равен calculated', res.status === 'calculated');

    assert(
      suite,
      'liquidTemperatureC в finalState строго null (свободной жидкости нет)',
      res.finalState.liquidTemperatureC === null
    );

    assert(
      suite,
      'contentTemperatureC в finalState является числом (остывающий влажный лист)',
      typeof res.finalState.contentTemperatureC === 'number' &&
        res.finalState.contentTemperatureC < 85.0 &&
        res.finalState.contentTemperatureC > 22.0
    );

    assert(
      suite,
      'Во всех точках кривой curvePoints liquidTemperatureC строго null',
      res.curvePoints.every((pt) => pt.liquidTemperatureC === null)
    );

    assert(
      suite,
      'Во всех точках кривой curvePoints contentTemperatureC является числом',
      res.curvePoints.every(
        (pt) => typeof pt.contentTemperatureC === 'number' && Number.isFinite(pt.contentTemperatureC)
      )
    );
  }

  // =========================================================================
  // 4. Неизвестная теплоёмкость листа блокирует зависимый расчёт
  // =========================================================================
  {
    const suite = '4. Неизвестная теплоёмкость листа (Unknown ≠ 0)';

    const res = integrateContentThermalStep(
      {
        ...validWetBaseState,
        leafSpecificHeatCapacity: UNKNOWN_LEAF_SPECIFIC_HEAT,
      },
      gaiwanProfile,
      undefined,
      10.0
    );

    assert(
      suite,
      'Статус равен unknown_leaf_specific_heat',
      res.status === 'unknown_leaf_specific_heat'
    );
    assert(
      suite,
      'contentHeatCapacityJPerK равен null (нет скрытого значения)',
      res.contentHeatCapacityJPerK === null
    );
    assert(
      suite,
      'finalState.contentTemperatureC равен null',
      res.finalState.contentTemperatureC === null
    );
    assert(
      suite,
      'finalState.liquidTemperatureC равен null',
      res.finalState.liquidTemperatureC === null
    );
    assert(
      suite,
      'Причина reason содержит описание блокировки',
      typeof res.reason === 'string' && res.reason.length > 0
    );
  }

  // =========================================================================
  // 5. Неизвестные массы поглощённой или свободной воды
  // =========================================================================
  {
    const suite = '5. Неизвестные массы водного баланса (unknown_water_masses)';

    const resAbsNull = integrateContentThermalStep(
      {
        ...validWetBaseState,
        absorbedWaterGrams: null,
      },
      gaiwanProfile,
      undefined,
      10.0
    );

    assert(
      suite,
      'При absorbedWaterGrams === null статус равен unknown_water_masses',
      resAbsNull.status === 'unknown_water_masses' &&
        resAbsNull.finalState.contentTemperatureC === null &&
        resAbsNull.contentHeatCapacityJPerK === null
    );

    const resFreeNull = integrateContentThermalStep(
      {
        ...validWetBaseState,
        freeWaterMassGrams: null,
      },
      gaiwanProfile,
      undefined,
      10.0
    );

    assert(
      suite,
      'При freeWaterMassGrams === null статус равен unknown_water_masses',
      resFreeNull.status === 'unknown_water_masses' &&
        resFreeNull.finalState.contentTemperatureC === null &&
        resFreeNull.contentHeatCapacityJPerK === null
    );
  }

  // =========================================================================
  // 6. Неизвестные проводимости режима без свободной воды
  // =========================================================================
  {
    const suite = '6. Неизвестные проводимости осушенного содержимого (unknown_drained_conductance)';

    // 6.1. Опции вообще не переданы
    const resNoOptions = integrateContentThermalStep(
      validDrainedBaseState,
      gaiwanProfile,
      undefined,
      15.0
    );

    assert(
      suite,
      'При отсутствии drainedOptions статус равен unknown_drained_conductance',
      resNoOptions.status === 'unknown_drained_conductance' &&
        resNoOptions.finalState.contentTemperatureC === null
    );

    // 6.2. Проводимость передана как unknown
    const resUnknownG = integrateContentThermalStep(
      validDrainedBaseState,
      gaiwanProfile,
      {
        conductanceDrainedContentVesselWPerK: UNKNOWN_DRAINED_G,
        conductanceDrainedContentAmbientWPerK: SYNTHETIC_DRAINED_G_AMBIENT,
      },
      15.0
    );

    assert(
      suite,
      'При origin: unknown проводимости статус равен unknown_drained_conductance',
      resUnknownG.status === 'unknown_drained_conductance' &&
        resUnknownG.finalState.contentTemperatureC === null
    );
  }

  // =========================================================================
  // 7. Явные нулевые проводимости как адиабатическое допущение
  // =========================================================================
  {
    const suite = '7. Явные нулевые проводимости (адиабатическое допущение)';

    const resZeroG = integrateContentThermalStep(
      validDrainedBaseState,
      gaiwanProfile,
      {
        conductanceDrainedContentVesselWPerK: ZERO_DRAINED_G,
        conductanceDrainedContentAmbientWPerK: ZERO_DRAINED_G,
      },
      20.0,
      0.1
    );

    assert(
      suite,
      'Статус расчёта равен calculated при явном нуле',
      resZeroG.status === 'calculated'
    );

    assert(
      suite,
      'Температура содержимого строго постоянна при G=0 (85.0 °C)',
      Math.abs((resZeroG.finalState.contentTemperatureC ?? 0) - 85.0) < 1e-12
    );
  }

  // =========================================================================
  // 8. Энергетический баланс при отсутствии внешней теплоотдачи
  // =========================================================================
  {
    const suite = '8. Энергетический баланс замкнутой адиабатической системы';

    // Создаём адиабатический профиль без теплоотдачи в окружающую среду
    const adiabaticProfile: VesselThermalProfile = {
      ...gaiwanProfile,
      conductanceVesselAmbientWPerK: 0.0,
      conductanceLiquidAmbientWPerK: 0.0,
      conductanceLiquidVesselWPerK: 5.0, // теплообмен только между содержимым и стенками
    };

    const resEnergy = integrateContentThermalStep(
      validWetBaseState,
      adiabaticProfile,
      undefined,
      30.0,
      0.05
    );

    assert(suite, 'Статус расчёта равен calculated', resEnergy.status === 'calculated');

    const cContents = resEnergy.contentHeatCapacityJPerK!;
    const cVessel =
      adiabaticProfile.vesselMassGrams * 0.001 * adiabaticProfile.materialSpecificHeatJPerKgK;

    const eInitial =
      cContents * validWetBaseState.contentTemperatureC! +
      cVessel * validWetBaseState.vesselTemperatureC;

    const eFinal =
      cContents * resEnergy.finalState.contentTemperatureC! +
      cVessel * resEnergy.finalState.vesselTemperatureC;

    const energyResidualJoules = Math.abs(eFinal - eInitial);

    assert(
      suite,
      'Суммарная тепловая энергия системы строго сохраняется (невязка < 1e-10 Дж)',
      energyResidualJoules < 1e-10,
      `Невязка энергии: ${energyResidualJoules} Дж`
    );
  }

  // =========================================================================
  // 9. Нулевые проводимости всех путей
  // =========================================================================
  {
    const suite = '9. Изолированная система со всеми нулевыми проводимостями';

    const fullyIsolatedProfile: VesselThermalProfile = {
      ...gaiwanProfile,
      conductanceLiquidVesselWPerK: 0.0,
      conductanceVesselAmbientWPerK: 0.0,
      conductanceLiquidAmbientWPerK: 0.0,
    };

    const resIsolated = integrateContentThermalStep(
      validWetBaseState,
      fullyIsolatedProfile,
      undefined,
      25.0,
      0.1
    );

    assert(suite, 'Статус равен calculated', resIsolated.status === 'calculated');
    assert(
      suite,
      'Температура содержимого остаётся неизменной (92.0 °C)',
      Math.abs((resIsolated.finalState.contentTemperatureC ?? 0) - 92.0) < 1e-12
    );
    assert(
      suite,
      'Температура стенок остаётся неизменной (80.0 °C)',
      Math.abs(resIsolated.finalState.vesselTemperatureC - 80.0) < 1e-12
    );
  }

  // =========================================================================
  // 10. Термодинамические границы температур пассивной системы
  // =========================================================================
  {
    const suite = '10. Соблюдение термодинамических границ пассивной системы';

    const resBounds = integrateContentThermalStep(
      validWetBaseState,
      gaiwanProfile,
      undefined,
      60.0,
      0.1,
      2.0
    );

    const minAllowed = Math.min(
      validWetBaseState.contentTemperatureC!,
      validWetBaseState.vesselTemperatureC,
      validWetBaseState.ambientTemperatureC
    );
    const maxAllowed = Math.max(
      validWetBaseState.contentTemperatureC!,
      validWetBaseState.vesselTemperatureC,
      validWetBaseState.ambientTemperatureC
    );

    const allPointsBounded = resBounds.curvePoints.every((pt) => {
      if (pt.contentTemperatureC === null) return false;
      return (
        pt.contentTemperatureC >= minAllowed - 1e-4 &&
        pt.contentTemperatureC <= maxAllowed + 1e-4 &&
        pt.vesselTemperatureC >= minAllowed - 1e-4 &&
        pt.vesselTemperatureC <= maxAllowed + 1e-4
      );
    });

    assert(
      suite,
      'Все температуры на кривой строго лежат в границах [T_ambient, max(T_init)]',
      allPointsBounded
    );
  }

  // =========================================================================
  // 11. Устойчивость численного интегрирования (ThermalInstabilityError)
  // =========================================================================
  {
    const suite = '11. Устойчивость схемы и контроль критического шага dt';

    // Создаём состояние с малой ёмкостью содержимого и высокой проводимостью
    const lowCapState: ContentThermalState = {
      leafMassGrams: 1.0,
      absorbedWaterGrams: 0.0,
      freeWaterMassGrams: 0.0,
      contentTemperatureC: 90.0,
      liquidTemperatureC: null,
      vesselTemperatureC: 80.0,
      ambientTemperatureC: 22.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT, // C_dry = 0.001 * 1500 = 1.5 Дж/К!
      elapsedSeconds: 0,
    };

    // При G = 15 Вт/К, C_c = 1.5 Дж/К: a11 ~ 15 / 1.5 = 10 с^-1 -> dt_max ~ 2/10 = 0.2 с!
    const highGOptions = {
      conductanceDrainedContentVesselWPerK: createValueWithOrigin(15.0, 'model_profile', 'W/K'),
      conductanceDrainedContentAmbientWPerK: createValueWithOrigin(0.5, 'model_profile', 'W/K'),
    };

    // При dt = 0.35 с (> dt_max) должна быть выброшена ThermalInstabilityError
    let instabilityCaught = false;
    try {
      integrateContentThermalStep(
        lowCapState,
        gaiwanProfile,
        highGOptions,
        10.0,
        0.35 // слишком большой шаг для малой ёмкости
      );
    } catch (err) {
      if (err instanceof ThermalInstabilityError) {
        instabilityCaught = true;
      }
    }

    assert(
      suite,
      'При dt >= maxStableDt выбрасывается ThermalInstabilityError без скрытого сглаживания',
      instabilityCaught
    );

    // При безопасном малом шаге dt = 0.02 с расчёт проходит успешно
    const resStable = integrateContentThermalStep(
      lowCapState,
      gaiwanProfile,
      highGOptions,
      1.0,
      0.02
    );

    assert(
      suite,
      'При безопасном малом шаге расчёт успешен со статусом calculated',
      resStable.status === 'calculated'
    );
  }

  // =========================================================================
  // 12. Строгая валидация типов, отрицательных значений и границ
  // =========================================================================
  {
    const suite = '12. Строгая валидация некорректных параметров';

    function expectThermalError(name: string, fn: () => void, code?: string) {
      try {
        fn();
        assert(suite, `${name} (ожидалось исключение)`, false, 'Исключение не выброшено');
      } catch (err) {
        const isExpected = err instanceof ThermalValidationError;
        const codeMatches = code ? (err as ThermalValidationError).code === code : true;
        assert(
          suite,
          name,
          isExpected && codeMatches,
          `Ожидалась ThermalValidationError с кодом ${code}, получено: ${err}`
        );
      }
    }

    // 12.1. Отрицательная масса листа
    expectThermalError('Отрицательная масса листа', () =>
      integrateContentThermalStep({ ...validWetBaseState, leafMassGrams: -5 }, gaiwanProfile),
      'INVALID_LEAF_MASS'
    );

    // 12.2. Нулевая масса листа
    expectThermalError('Нулевая масса листа', () =>
      integrateContentThermalStep({ ...validWetBaseState, leafMassGrams: 0 }, gaiwanProfile),
      'INVALID_LEAF_MASS'
    );

    // 12.3. Отрицательная масса поглощённой воды
    expectThermalError('Отрицательная масса поглощённой воды', () =>
      integrateContentThermalStep({ ...validWetBaseState, absorbedWaterGrams: -1 }, gaiwanProfile),
      'INVALID_ABSORBED_WATER_MASS'
    );

    // 12.4. Отрицательная масса свободной воды
    expectThermalError('Отрицательная масса свободной воды', () =>
      integrateContentThermalStep({ ...validWetBaseState, freeWaterMassGrams: -10 }, gaiwanProfile),
      'INVALID_FREE_WATER_MASS'
    );

    // 12.5. Температура содержимого вне [0, 100] °C
    expectThermalError('Температура содержимого > 100 °C (105 °C)', () =>
      integrateContentThermalStep({ ...validWetBaseState, contentTemperatureC: 105 }, gaiwanProfile),
      'THERMAL_RANGE_ERROR'
    );

    // 12.6. Несогласованность origin === 'unknown' и value !== null (Инвариант 2B.3.3.1.2)
    expectThermalError('origin: "unknown" с числовым значением', () =>
      integrateContentThermalStep(
        {
          ...validWetBaseState,
          leafSpecificHeatCapacity: { origin: 'unknown', value: 1500 as any, unit: 'Дж/(кг·К)' },
        },
        gaiwanProfile
      ),
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN_VALUE_MISMATCH'
    );

    // 12.7. Отрицательная проводимость в drainedOptions
    expectThermalError('Отрицательная проводимость drainedContentVessel', () =>
      integrateContentThermalStep(
        validDrainedBaseState,
        gaiwanProfile,
        {
          conductanceDrainedContentVesselWPerK: createValueWithOrigin(-1.0, 'model_profile', 'W/K'),
          conductanceDrainedContentAmbientWPerK: SYNTHETIC_DRAINED_G_AMBIENT,
        }
      ),
      'INVALID_CONDUCTANCE'
    );

    // 12.8. Несогласованность origin === 'unknown' и value !== null в drainedOptions
    expectThermalError('origin: "unknown" с числом в drainedOptions', () =>
      integrateContentThermalStep(
        validDrainedBaseState,
        gaiwanProfile,
        {
          conductanceDrainedContentVesselWPerK: { origin: 'unknown', value: 2.0 as any, unit: 'W/K' },
          conductanceDrainedContentAmbientWPerK: SYNTHETIC_DRAINED_G_AMBIENT,
        }
      ),
      'INVALID_CONDUCTANCE_ORIGIN_VALUE_MISMATCH'
    );

    // 12.9. Неизвестное предшествующее состояние (contentTemperatureC === null)
    const resBlockedPrior = integrateContentThermalStep(
      {
        ...validWetBaseState,
        contentTemperatureC: null,
      },
      gaiwanProfile,
      undefined,
      10.0
    );

    assert(
      suite,
      'При contentTemperatureC === null статус равен blocked_by_unknown_prior_state',
      resBlockedPrior.status === 'blocked_by_unknown_prior_state' &&
        resBlockedPrior.finalState.contentTemperatureC === null
    );
  }

  // =========================================================================
  // 13. Регрессионная совместимость старого интегратора integrateThermalStep
  // =========================================================================
  {
    const suite = '13. Регрессионная совместимость legacy integrateThermalStep';

    // Проверяем, что существующий чисто жидкостный интегратор из integrator.ts
    // функционирует со 100% сохранением прежнего контракта
    const legacyState = {
      liquidVolumeMl: 100.0,
      liquidTemperatureC: 95.0,
      vesselTemperatureC: 75.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    const legacyRes = integrateThermalStep(legacyState, gaiwanProfile, 20.0, 0.1);

    assert(
      suite,
      'Legacy integrateThermalStep возвращает объект IntegrationStepResult',
      legacyRes && typeof legacyRes.finalState.vesselTemperatureC === 'number'
    );
    assert(
      suite,
      'Legacy integrateThermalStep охлаждает воду штатно',
      legacyRes.finalState.liquidTemperatureC !== null &&
        legacyRes.finalState.liquidTemperatureC < 95.0 &&
        legacyRes.finalState.liquidTemperatureC > 22.0
    );
  }

  return results;
}
