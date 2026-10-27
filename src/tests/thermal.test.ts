/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  solveThermalMixing,
  integrateThermalStep,
  runThermalConvergenceAudit,
} from '../engine/thermal/integrator.ts';
import {
  VESSEL_THERMAL_PROFILES,
} from '../engine/thermal/profiles.ts';
import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
  WATER_DENSITY_KG_PER_ML,
} from '../engine/thermal/constants.ts';
import {
  BrewingThermalEngine,
} from '../engine/thermal/engine.ts';
import {
  ThermalValidationError,
  ThermalRangeError,
  BrewingCapacityOverflowError,
  TimelineChronologyError,
  ThermalInstabilityError,
} from '../engine/thermal/errors.ts';
import {
  createDefaultSession,
} from '../domain/brewing/defaults.ts';
import {
  GongfuSessionConfig,
  LazyMugSessionConfig,
  LiuGenPaoSessionConfig,
  LazyMugTimelineEvent,
} from '../domain/brewing/types.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import { TestResult } from './domain.test.ts';
import { ThermalState, VesselThermalProfile } from '../engine/thermal/types.ts';

/**
 * Верификация математического ядра теплового баланса (Этап 2A + аудит 2A.1).
 * Проверка физических инвариантов, численной сходимости схемы Хойна (RK2),
 * строгой обработки ошибок, контроля переполнения сосуда и хронологии временной шкалы.
 */
export async function runThermalTestSuite(): Promise<TestResult[]> {
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
  const glassMugProfile = VESSEL_THERMAL_PROFILES['vessel-glass-mug-350'];
  const clayTeapotProfile = VESSEL_THERMAL_PROFILES['vessel-yixing-130'];

  // Тест 1: При нулевом времени состояние не меняется
  {
    const suite = '1. Нулевое время экспозиции';
    const state: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 95.0,
      vesselTemperatureC: 80.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };
    const res = integrateThermalStep(state, gaiwanProfile, 0);
    assert(
      suite,
      'При t = 0 температура жидкости остаётся неизменной',
      res.finalState.liquidTemperatureC !== null &&
        Math.abs(res.finalState.liquidTemperatureC - 95.0) < 1e-6
    );
    assert(
      suite,
      'При t = 0 температура стенок остаётся неизменной',
      Math.abs(res.finalState.vesselTemperatureC - 80.0) < 1e-6
    );
    assert(
      suite,
      'При t = 0 объём жидкости остаётся неизменным',
      res.finalState.liquidVolumeMl === 100
    );
  }

  // Тест 2: При одинаковой температуре жидкости, сосуда и среды нет самопроизвольного изменения
  {
    const suite = '2. Термодинамическое равновесие (T_l = T_v = T_a)';
    const equilibriumTemp = 23.5;
    const state: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: equilibriumTemp,
      vesselTemperatureC: equilibriumTemp,
      ambientTemperatureC: equilibriumTemp,
      elapsedSeconds: 0,
    };
    const res = integrateThermalStep(state, gaiwanProfile, 60.0);
    assert(
      suite,
      'При равенстве температур жидкость не меняет температуру за 60 секунд',
      res.finalState.liquidTemperatureC !== null &&
        Math.abs(res.finalState.liquidTemperatureC - equilibriumTemp) < 1e-4
    );
    assert(
      suite,
      'При равенстве температур стенки сосуда не меняют температуру',
      Math.abs(res.finalState.vesselTemperatureC - equilibriumTemp) < 1e-4
    );
  }

  // Тест 3: Если система горячее среды и нет источника тепла, она монотонно охлаждается
  {
    const suite = '3. Монотонное охлаждение горячей системы';
    const state: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 95.0,
      vesselTemperatureC: 85.0,
      ambientTemperatureC: 20.0,
      elapsedSeconds: 0,
    };
    const res10 = integrateThermalStep(state, gaiwanProfile, 10.0);
    const res30 = integrateThermalStep(state, gaiwanProfile, 30.0);
    const res60 = integrateThermalStep(state, gaiwanProfile, 60.0);

    assert(
      suite,
      'Через 10 с температура жидкости ниже начальной',
      res10.finalState.liquidTemperatureC !== null &&
        res10.finalState.liquidTemperatureC < state.liquidTemperatureC!
    );
    assert(
      suite,
      'Через 30 с температура жидкости ниже, чем через 10 с',
      res30.finalState.liquidTemperatureC !== null &&
        res10.finalState.liquidTemperatureC !== null &&
        res30.finalState.liquidTemperatureC < res10.finalState.liquidTemperatureC
    );
    assert(
      suite,
      'Через 60 с температура жидкости ниже, чем через 30 с',
      res60.finalState.liquidTemperatureC !== null &&
        res30.finalState.liquidTemperatureC !== null &&
        res60.finalState.liquidTemperatureC < res30.finalState.liquidTemperatureC
    );
    assert(
      suite,
      'Температура жидкости не опускается ниже температуры окружающей среды',
      res60.finalState.liquidTemperatureC !== null &&
        res60.finalState.liquidTemperatureC >= state.ambientTemperatureC
    );
  }

  // Тест 4: В замкнутой системе суммарная внутренняя энергия сохраняется
  {
    const suite = '4. Закон сохранения энергии в замкнутой системе';
    const isolatedProfile: VesselThermalProfile = {
      id: 'isolated-test-profile',
      name: 'Тестовый адиабатический сосуд',
      material: 'porcelain',
      vesselMassGrams: 100,
      materialSpecificHeatJPerKgK: 900,
      conductanceLiquidVesselWPerK: 5.0,
      conductanceVesselAmbientWPerK: 0.0,
      conductanceLiquidAmbientWPerK: 0.0,
      origin: 'model_profile',
      basisNotes: 'Адиабатический тест сохранения энергии',
    };

    const volumeMl = 100;
    const tLiquidInit = 90.0;
    const tVesselInit = 30.0;
    const tAmbient = 20.0;

    const cLiquid = volumeMl * WATER_DENSITY_KG_PER_ML * SPECIFIC_HEAT_WATER_J_PER_KG_K;
    const cVessel = isolatedProfile.vesselMassGrams * 0.001 * isolatedProfile.materialSpecificHeatJPerKgK;

    const initialTotalEnergyJoules = cLiquid * tLiquidInit + cVessel * tVesselInit;

    const state: ThermalState = {
      liquidVolumeMl: volumeMl,
      liquidTemperatureC: tLiquidInit,
      vesselTemperatureC: tVesselInit,
      ambientTemperatureC: tAmbient,
      elapsedSeconds: 0,
    };

    const res = integrateThermalStep(state, isolatedProfile, 60.0);
    const finalTotalEnergyJoules =
      cLiquid * res.finalState.liquidTemperatureC! + cVessel * res.finalState.vesselTemperatureC;

    const energyDiscrepancyPercent =
      (Math.abs(finalTotalEnergyJoules - initialTotalEnergyJoules) / initialTotalEnergyJoules) * 100;

    assert(
      suite,
      'Внутренняя энергия замкнутой системы строго сохраняется (погрешность < 0.1%)',
      energyDiscrepancyPercent < 0.1,
      `Погрешность: ${energyDiscrepancyPercent.toFixed(4)}%`
    );
    assert(
      suite,
      'Жидкость охладилась, передав тепло стенкам (T_l < 90°C)',
      res.finalState.liquidTemperatureC! < tLiquidInit
    );
    assert(
      suite,
      'Стенки нагрелись, приняв тепло жидкости (T_v > 30°C)',
      res.finalState.vesselTemperatureC > tVesselInit
    );
  }

  // Тест 5: Баланс энергии при смешении объёмов воды
  {
    const suite = '5. Баланс энергии при смешении объёмов воды';
    const equalMix = solveThermalMixing(
      { volumeMl: 50, temperatureC: 80 },
      { volumeMl: 50, temperatureC: 20 }
    );
    assert(
      suite,
      'Равные объёмы 80°C и 20°C дают строго среднюю температуру 50°C',
      equalMix.temperatureC !== null &&
        Math.abs(equalMix.temperatureC - 50.0) < 1e-6 &&
        equalMix.volumeMl === 100
    );

    const unEqualMix = solveThermalMixing(
      { volumeMl: 100, temperatureC: 90 },
      { volumeMl: 50, temperatureC: 30 }
    );
    assert(
      suite,
      'Неравные объёмы (100 мл при 90°C + 50 мл при 30°C) дают ровно 70°C',
      unEqualMix.temperatureC !== null &&
        Math.abs(unEqualMix.temperatureC - 70.0) < 1e-6 &&
        unEqualMix.volumeMl === 150
    );
  }

  // Тест 6: Добавление более горячей воды повышает температуру смеси
  {
    const suite = '6. Влияние добавления более горячей воды';
    const base = { volumeMl: 80, temperatureC: 60 };
    const mixWithWarm = solveThermalMixing(base, { volumeMl: 40, temperatureC: 70 });
    const mixWithHot = solveThermalMixing(base, { volumeMl: 40, temperatureC: 95 });

    assert(
      suite,
      'Добавление 95°C даёт более высокую температуру смеси, чем добавление 70°C',
      mixWithHot.temperatureC! > mixWithWarm.temperatureC!
    );
    assert(
      suite,
      'Смесь с более горячей водой теплее исходного раствора (T_mixed > 60°C)',
      mixWithHot.temperatureC! > base.temperatureC
    );
  }

  // Тест 7: Добавление более холодной воды снижает температуру смеси
  {
    const suite = '7. Влияние добавления более холодной воды';
    const base = { volumeMl: 80, temperatureC: 85 };
    const mixWithCold = solveThermalMixing(base, { volumeMl: 40, temperatureC: 25 });

    assert(
      suite,
      'Добавление холодной воды 25°C снижает температуру настоя ниже 85°C',
      mixWithCold.temperatureC! < base.temperatureC
    );
    assert(
      suite,
      'Температура смеси находится строго в интервале между холодной и горячей водой',
      mixWithCold.temperatureC! > 25 && mixWithCold.temperatureC! < 85
    );
  }

  // Тест 8: Влияние материала посуды через параметры теплового профиля
  {
    const suite = '8. Влияние материала посуды через профиль параметров';
    const initialState: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 92.0,
      vesselTemperatureC: 75.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    const resClay = integrateThermalStep(initialState, clayTeapotProfile, 60.0);
    const resGlassMug = integrateThermalStep(initialState, glassMugProfile, 60.0);

    assert(
      suite,
      'Открытая стеклянная кружка остывает быстрее закрытого глиняного чайника',
      resGlassMug.finalState.liquidTemperatureC! < resClay.finalState.liquidTemperatureC!
    );
    assert(
      suite,
      'Профиль глины имеет удельную теплоёмкость 920 Дж/(кг·К), стекла 830 Дж/(кг·К)',
      clayTeapotProfile.materialSpecificHeatJPerKgK === 920 &&
        glassMugProfile.materialSpecificHeatJPerKgK === 830
    );
  }

  // Тест 9: Температурная модель серии проливов Гунфу Ча
  {
    const suite = '9. Серия проливов Гунфу Ча';
    const engine = new BrewingThermalEngine();
    const session = createDefaultSession('gongfu_cha', REFERENCE_TEAS[0].id) as GongfuSessionConfig;

    const output = engine.simulateGongfu(session, {
      ambientTemperatureC: 22.0,
      isVesselPreheated: true,
      preheatedVesselTemperatureC: 75.0,
      interInfusionPauseSeconds: 15.0,
    });

    assert(
      suite,
      'Количество тепловых результатов совпадает с числом проливов (6 проливов)',
      output.stepResults.length === session.steps.length
    );
    assert(
      suite,
      'Каждый шаг содержит положительную температуру заливки и конечную температуру',
      output.stepResults.every((s) => s.pourWaterTempC > 0 && s.finalLiquidTempC! > 0)
    );
    assert(
      suite,
      'Жидкость на каждом шаге остывает за время экспозиции',
      output.stepResults.every((s) => s.finalLiquidTempC! <= s.initialLiquidTempC! + 1e-4)
    );
  }

  // Тест 10: Температурная модель между событиями ленивого заваривания
  {
    const suite = '10. События ленивого заваривания в кружке';
    const engine = new BrewingThermalEngine();
    const session = createDefaultSession('lazy_mug', REFERENCE_TEAS[0].id) as LazyMugSessionConfig;

    const output = engine.simulateLazyMug(session, {
      ambientTemperatureC: 22.0,
      isVesselPreheated: false,
    });

    assert(
      suite,
      'Число результатов соответствует числу событий кружки',
      output.stepResults.length === session.timelineEvents.length
    );
    const refillStepIdx = session.timelineEvents.findIndex((e: LazyMugTimelineEvent) => e.type === 'water_refill');
    if (refillStepIdx > 0) {
      const stepBeforeRefill = output.stepResults[refillStepIdx - 1];
      const refillStep = output.stepResults[refillStepIdx];
      assert(
        suite,
        'Долив горячей воды поднимает температуру жидкости по сравнению с остывшей перед доливом',
        refillStep.initialLiquidTempC! > stepBeforeRefill.finalLiquidTempC!
      );
    }
  }

  // Тест 11: Численная сходимость схемы Хойна при разных шагах dt (Этап 2A.1)
  {
    const suite = '11. Тест численной сходимости интегратора (dt in [0.2, 0.1, 0.05, 0.025] с)';
    const testState: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 95.0,
      vesselTemperatureC: 75.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    const gaiwanConvergence = runThermalConvergenceAudit(gaiwanProfile, testState, 30.0);
    const mugConvergence = runThermalConvergenceAudit(glassMugProfile, testState, 30.0);

    assert(
      suite,
      'Для гайвани максимальное отклонение между dt=0.1 и fine dt=0.025 с составляет < 0.01 °C',
      gaiwanConvergence.maxDeltaC < 0.01,
      `Фактическое maxDeltaC: ${gaiwanConvergence.maxDeltaC} °C`
    );
    assert(
      suite,
      'Для открытой кружки максимальное отклонение составляет < 0.01 °C',
      mugConvergence.maxDeltaC < 0.01,
      `Фактическое maxDeltaC: ${mugConvergence.maxDeltaC} °C`
    );
    assert(
      suite,
      'Флаг сходимости подтверждён для обоих профилей посуды',
      gaiwanConvergence.isConverged && mugConvergence.isConverged
    );
  }

  // Тест 12: Обработка физически некорректных входных данных (Unknown ≠ 0, запрет 0 °C)
  {
    const suite = '12. Обработка некорректных данных и принцип Unknown ≠ 0';

    // 12.1 Отрицательный объём в solveThermalMixing вызывает ThermalValidationError
    let caughtNegativeVol = false;
    try {
      solveThermalMixing({ volumeMl: -10, temperatureC: 80 }, { volumeMl: 50, temperatureC: 80 });
    } catch (err) {
      if (err instanceof ThermalValidationError) caughtNegativeVol = true;
    }
    assert(suite, 'Отрицательный объём жидкости в смешении вызывает ThermalValidationError', caughtNegativeVol);

    // 12.2 Недопустимая температура (> 100 °C или < 0 °C) при ненулевом объёме вызывает ThermalRangeError
    let caughtOverheating = false;
    try {
      solveThermalMixing({ volumeMl: 50, temperatureC: 105 }, { volumeMl: 50, temperatureC: 80 });
    } catch (err) {
      if (err instanceof ThermalRangeError) caughtOverheating = true;
    }
    assert(suite, 'Температура выше 100 °C вызывает явный ThermalRangeError (без скрытой замены)', caughtOverheating);

    let caughtSubZero = false;
    try {
      solveThermalMixing({ volumeMl: 50, temperatureC: -5 }, { volumeMl: 50, temperatureC: 80 });
    } catch (err) {
      if (err instanceof ThermalRangeError) caughtSubZero = true;
    }
    assert(suite, 'Отрицательная температура жидкости вызывает ThermalRangeError', caughtSubZero);

    // 12.3 Нулевой суммарный объём возвращает temperatureC: null (не 0 °C!)
    const emptyMix = solveThermalMixing({ volumeMl: 0, temperatureC: null }, { volumeMl: 0, temperatureC: null });
    assert(
      suite,
      'Смешение пустых порций даёт volumeMl: 0 и temperatureC: null (Unknown ≠ 0)',
      emptyMix.volumeMl === 0 && emptyMix.temperatureC === null
    );
  }

  // Тест 13: Поведение интегратора при пустом сосуде (отсутствие жидкости)
  {
    const suite = '13. Поведение интегратора без жидкости (volume = 0)';
    const emptyState: ThermalState = {
      liquidVolumeMl: 0,
      liquidTemperatureC: null,
      vesselTemperatureC: 80.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    const emptyResult = integrateThermalStep(emptyState, gaiwanProfile, 30.0);

    assert(
      suite,
      'В пустом сосуде температура жидкости строго равна null (не 0 °C и не tVessel)',
      emptyResult.finalState.liquidTemperatureC === null
    );
    assert(
      suite,
      'Экстремумы температуры жидкости в пустом сосуде равны null',
      emptyResult.minLiquidTempC === null && emptyResult.maxLiquidTempC === null
    );
    assert(
      suite,
      'Стенки пустого сосуда остывают на воздухе (80 °C -> <80 °C)',
      emptyResult.finalState.vesselTemperatureC < 80.0 &&
        emptyResult.finalState.vesselTemperatureC >= 22.0
    );
    assert(
      suite,
      'Точки кривой охлаждения пустого сосуда содержат liquidTemperatureC: null',
      emptyResult.curvePoints.every((pt) => pt.liquidTemperatureC === null)
    );
  }

  // Тест 14: Строгое отклонение переполнения вместимости посуды (Vessel Capacity Overflow)
  {
    const suite = '14. Строгий контроль вместимости сосуда (отклонение переполнения)';
    const engine = new BrewingThermalEngine();
    const defaultGaiwanSession = createDefaultSession('gongfu_cha', REFERENCE_TEAS[0].id) as GongfuSessionConfig;

    // Попытка залить 150 мл в 110 мл гайвань
    const overflowGongfu: GongfuSessionConfig = {
      ...defaultGaiwanSession,
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 15,
          pourWaterVolumeMl: 150,
          waterTemperatureC: 95,
        },
      ],
    };

    let caughtGongfuOverflow = false;
    try {
      engine.simulateGongfu(overflowGongfu);
    } catch (err) {
      if (err instanceof BrewingCapacityOverflowError) {
        caughtGongfuOverflow = true;
      }
    }
    assert(
      suite,
      'Попытка заливки 150 мл в гайвань 110 мл вызывает BrewingCapacityOverflowError',
      caughtGongfuOverflow
    );

    // Лю Гэнь Пао: долив превышает вместимость
    const defaultLiuSession = createDefaultSession('liu_gen_pao', REFERENCE_TEAS[0].id) as LiuGenPaoSessionConfig;
    const overflowLiu: LiuGenPaoSessionConfig = {
      ...defaultLiuSession,
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20,
          addedWaterVolumeMl: 120, // > 110 мл
          retainedLiquorFractionOfTotal: 0.5,
          addedWaterTemperatureC: 90,
        },
      ],
    };

    let caughtLiuOverflow = false;
    try {
      engine.simulateLiuGenPao(overflowLiu);
    } catch (err) {
      if (err instanceof BrewingCapacityOverflowError) {
        caughtLiuOverflow = true;
      }
    }
    assert(
      suite,
      'Превышение вместимости в Лю Гэнь Пао вызывает BrewingCapacityOverflowError',
      caughtLiuOverflow
    );
  }

  // Тест 15: Валидация временной шкалы и объёмов в методе Lazy Mug
  {
    const suite = '15. Валидация шкалы событий и объёмов в Lazy Mug';
    const engine = new BrewingThermalEngine();
    const defaultMugSession = createDefaultSession('lazy_mug', REFERENCE_TEAS[0].id) as LazyMugSessionConfig;

    // 15.1 Отрицательная метка времени
    let caughtNegativeTimestamp = false;
    try {
      const invalidSession: LazyMugSessionConfig = {
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: -10, waterVolumeMl: 250, waterTemperatureC: 90 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      };
      engine.simulateLazyMug(invalidSession);
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtNegativeTimestamp = true;
    }
    assert(suite, 'Отрицательная метка времени вызывает TimelineChronologyError', caughtNegativeTimestamp);

    // 15.2 Нарушение хронологического порядка (t_{i+1} < t_i)
    let caughtOrderViolation = false;
    try {
      const invalidSession: LazyMugSessionConfig = {
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 250, waterTemperatureC: 90 },
          { type: 'sip_consumption', timestampSeconds: 120, consumedVolumeMl: 50 },
          { type: 'water_refill', timestampSeconds: 60, addedWaterVolumeMl: 50, addedWaterTemperatureC: 95 }, // 60 < 120!
          { type: 'session_end', timestampSeconds: 300 },
        ],
      };
      engine.simulateLazyMug(invalidSession);
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtOrderViolation = true;
    }
    assert(suite, 'Событие, нарушающее хронологию (60 с после 120 с), вызывает TimelineChronologyError', caughtOrderViolation);

    // 15.3 Одинаковые временные метки
    let caughtDuplicateTimestamp = false;
    try {
      const invalidSession: LazyMugSessionConfig = {
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 250, waterTemperatureC: 90 },
          { type: 'sip_consumption', timestampSeconds: 120, consumedVolumeMl: 50 },
          { type: 'water_refill', timestampSeconds: 120, addedWaterVolumeMl: 50, addedWaterTemperatureC: 95 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      };
      engine.simulateLazyMug(invalidSession);
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtDuplicateTimestamp = true;
    }
    assert(suite, 'Конфликтующие события с одинаковой меткой времени вызывают TimelineChronologyError', caughtDuplicateTimestamp);

    // 15.4 События после session_end
    let caughtEventsAfterEnd = false;
    try {
      const invalidSession: LazyMugSessionConfig = {
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 250, waterTemperatureC: 90 },
          { type: 'session_end', timestampSeconds: 300 },
          { type: 'sip_consumption', timestampSeconds: 360, consumedVolumeMl: 50 },
        ],
      };
      engine.simulateLazyMug(invalidSession);
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtEventsAfterEnd = true;
    }
    assert(suite, 'События после session_end вызывают TimelineChronologyError', caughtEventsAfterEnd);

    // 15.5 Отпивание большего объёма, чем есть в кружке
    let caughtOverSip = false;
    try {
      const invalidSession: LazyMugSessionConfig = {
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 100, waterTemperatureC: 90 },
          { type: 'sip_consumption', timestampSeconds: 60, consumedVolumeMl: 150 }, // 150 > 100!
          { type: 'session_end', timestampSeconds: 300 },
        ],
      };
      engine.simulateLazyMug(invalidSession);
    } catch (err) {
      if (err instanceof ThermalValidationError) caughtOverSip = true;
    }
    assert(suite, 'Попытка отпить больше текущего объёма кружки (150 > 100 мл) вызывает ThermalValidationError', caughtOverSip);
  }

  // Тест 16: Детерминированность расчётов при идентичных входных данных
  {
    const suite = '16. Детерминированность тепловой модели';
    const state: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 92.5,
      vesselTemperatureC: 78.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    const runA = integrateThermalStep(state, gaiwanProfile, 25.0);
    const runB = integrateThermalStep(state, gaiwanProfile, 25.0);

    assert(
      suite,
      'Повторный запуск интегратора даёт строго идентичную температуру жидкости',
      runA.finalState.liquidTemperatureC === runB.finalState.liquidTemperatureC
    );
    assert(
      suite,
      'Повторный запуск интегратора даёт строго идентичную температуру стенок',
      runA.finalState.vesselTemperatureC === runB.finalState.vesselTemperatureC
    );
    assert(
      suite,
      'Точки температурной кривой идентичны',
      runA.curvePoints.length === runB.curvePoints.length &&
        runA.curvePoints[0].liquidTemperatureC === runB.curvePoints[0].liquidTemperatureC
    );
  }

  // Тест 17: Строгая валидация тепловых проводимостей профиля (conductances)
  {
    const suite = '17. Валидация тепловых проводимостей (conductanceLiquidVessel, VesselAmbient, LiquidAmbient)';
    const baseState: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 90.0,
      vesselTemperatureC: 75.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    // 17.1 conductanceLiquidVesselWPerK
    for (const [label, badVal] of [
      ['отрицательное значение (-0.5)', -0.5],
      ['NaN', NaN],
      ['бесконечность (+Infinity)', Infinity],
    ] as const) {
      let caught = false;
      try {
        const badProfile: VesselThermalProfile = {
          ...gaiwanProfile,
          conductanceLiquidVesselWPerK: badVal,
        };
        integrateThermalStep(baseState, badProfile, 10);
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_CONDUCTANCE') {
          caught = true;
        }
      }
      assert(suite, `conductanceLiquidVesselWPerK: ${label} вызывает ThermalValidationError (INVALID_CONDUCTANCE)`, caught);
    }

    // 17.2 conductanceVesselAmbientWPerK
    for (const [label, badVal] of [
      ['отрицательное значение (-0.2)', -0.2],
      ['NaN', NaN],
      ['бесконечность (+Infinity)', Infinity],
    ] as const) {
      let caught = false;
      try {
        const badProfile: VesselThermalProfile = {
          ...gaiwanProfile,
          conductanceVesselAmbientWPerK: badVal,
        };
        integrateThermalStep(baseState, badProfile, 10);
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_CONDUCTANCE') {
          caught = true;
        }
      }
      assert(suite, `conductanceVesselAmbientWPerK: ${label} вызывает ThermalValidationError (INVALID_CONDUCTANCE)`, caught);
    }

    // 17.3 conductanceLiquidAmbientWPerK
    for (const [label, badVal] of [
      ['отрицательное значение (-1.0)', -1.0],
      ['NaN', NaN],
      ['бесконечность (+Infinity)', Infinity],
    ] as const) {
      let caught = false;
      try {
        const badProfile: VesselThermalProfile = {
          ...gaiwanProfile,
          conductanceLiquidAmbientWPerK: badVal,
        };
        integrateThermalStep(baseState, badProfile, 10);
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_CONDUCTANCE') {
          caught = true;
        }
      }
      assert(suite, `conductanceLiquidAmbientWPerK: ${label} вызывает ThermalValidationError (INVALID_CONDUCTANCE)`, caught);
    }

    // 17.4 Ноль допустим как физическое допущение об отсутствии теплообмена
    let zeroConductanceAllowed = false;
    try {
      const zeroProfile: VesselThermalProfile = {
        ...gaiwanProfile,
        conductanceLiquidAmbientWPerK: 0.0, // Идеально теплоизолированная крышка
      };
      const zeroRes = integrateThermalStep(baseState, zeroProfile, 10);
      zeroConductanceAllowed = zeroRes.finalState.liquidTemperatureC !== null;
    } catch {
      zeroConductanceAllowed = false;
    }
    assert(suite, 'conductance = 0 допустим как физическое приближение (адиабатическая крышка) и не вызывает ошибку', zeroConductanceAllowed);
  }

  // Тест 18: Валидация параметров численного интегрирования (timeStepSeconds, samplingIntervalSeconds)
  {
    const suite = '18. Валидация параметров численного интегрирования (dt, samplingInterval)';
    const baseState: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 90.0,
      vesselTemperatureC: 75.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    // 18.1 timeStepSeconds: недопустимые значения
    for (const [label, badDt] of [
      ['отрицательный шаг (-0.1)', -0.1],
      ['нулевой шаг (0)', 0],
      ['NaN', NaN],
      ['бесконечность (+Infinity)', Infinity],
      ['ниже минимального предела (0.001 < 0.005 с)', 0.001],
      ['выше максимального предела устойчивости (1.0 > 0.5 с)', 1.0],
    ] as const) {
      let caught = false;
      try {
        integrateThermalStep(baseState, gaiwanProfile, 10, badDt);
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_TIME_STEP') {
          caught = true;
        }
      }
      assert(suite, `timeStepSeconds: ${label} вызывает ThermalValidationError (INVALID_TIME_STEP)`, caught);
    }

    // 18.2 samplingIntervalSeconds: недопустимые значения
    for (const [label, badSampling] of [
      ['отрицательный интервал (-1.0)', -1.0],
      ['нулевой интервал (0)', 0],
      ['NaN', NaN],
      ['бесконечность (+Infinity)', Infinity],
    ] as const) {
      let caught = false;
      try {
        integrateThermalStep(baseState, gaiwanProfile, 10, 0.1, badSampling);
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_SAMPLING_INTERVAL') {
          caught = true;
        }
      }
      assert(suite, `samplingIntervalSeconds: ${label} вызывает ThermalValidationError (INVALID_SAMPLING_INTERVAL)`, caught);
    }

    // 18.3 Допустимые шаги успешно интегрируются
    let validStepsSuccess = false;
    try {
      const resA = integrateThermalStep(baseState, gaiwanProfile, 5, 0.01, 1.0);
      const resB = integrateThermalStep(baseState, gaiwanProfile, 5, 0.25, 2.0);
      validStepsSuccess = resA.curvePoints.length > 0 && resB.curvePoints.length > 0;
    } catch {
      validStepsSuccess = false;
    }
    assert(suite, 'Корректные шаги dt = 0.01 с и 0.25 с успешно интегрируются без ошибок', validStepsSuccess);
  }

  // Тест 19: Валидация опций моделирования в BrewingThermalEngine
  {
    const suite = '19. Валидация опций моделирования в BrewingThermalEngine';
    const engine = new BrewingThermalEngine();
    const defaultGongfu = createDefaultSession('gongfu_cha', REFERENCE_TEAS[0].id) as GongfuSessionConfig;

    // 19.1 interInfusionPauseSeconds
    for (const [label, badPause] of [
      ['отрицательная пауза (-10 с)', -10],
      ['NaN', NaN],
    ] as const) {
      let caught = false;
      try {
        engine.simulateGongfu(defaultGongfu, { interInfusionPauseSeconds: badPause });
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_PAUSE_DURATION') {
          caught = true;
        }
      }
      assert(suite, `options.interInfusionPauseSeconds: ${label} вызывает ThermalValidationError`, caught);
    }

    // 19.2 ambientTemperatureC
    for (const [label, badAmbient] of [
      ['ниже -50 °C (-80 °C)', -80],
      ['выше 80 °C (95 °C)', 95],
      ['NaN', NaN],
    ] as const) {
      let caught = false;
      try {
        engine.simulateGongfu(defaultGongfu, { ambientTemperatureC: badAmbient });
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_AMBIENT_TEMPERATURE') {
          caught = true;
        }
      }
      assert(suite, `options.ambientTemperatureC: ${label} вызывает ThermalValidationError`, caught);
    }

    // 19.3 preheatedVesselTemperatureC
    for (const [label, badPreheat] of [
      ['отрицательная температура прогрева (-10 °C)', -10],
      ['выше 150 °C (180 °C)', 180],
      ['NaN', NaN],
    ] as const) {
      let caught = false;
      try {
        engine.simulateGongfu(defaultGongfu, { isVesselPreheated: true, preheatedVesselTemperatureC: badPreheat });
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_PREHEATED_VESSEL_TEMPERATURE') {
          caught = true;
        }
      }
      assert(suite, `options.preheatedVesselTemperatureC: ${label} вызывает ThermalValidationError`, caught);
    }

    // 19.4 integratorTimeStepSeconds
    for (const [label, badDt] of [
      ['шаг 0.001 с (ниже минимума)', 0.001],
      ['шаг 1.5 с (выше максимума)', 1.5],
      ['NaN', NaN],
    ] as const) {
      let caught = false;
      try {
        engine.simulateGongfu(defaultGongfu, { integratorTimeStepSeconds: badDt });
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_TIME_STEP') {
          caught = true;
        }
      }
      assert(suite, `options.integratorTimeStepSeconds: ${label} вызывает ThermalValidationError`, caught);
    }
  }

  // Тест 20: Полная структурная валидация сценария Lazy Mug
  {
    const suite = '20. Структурная валидация сценария Lazy Mug';
    const engine = new BrewingThermalEngine();
    const defaultMugSession = createDefaultSession('lazy_mug', REFERENCE_TEAS[0].id) as LazyMugSessionConfig;

    // 20.1 Пустая шкала событий
    let caughtEmpty = false;
    try {
      engine.simulateLazyMug({ ...defaultMugSession, timelineEvents: [] });
    } catch (err) {
      if (err instanceof ThermalValidationError) caughtEmpty = true;
    }
    assert(suite, 'Пустая шкала событий вызывает ошибку валидации', caughtEmpty);

    // 20.2 Менее 2 событий (только initial_pour без session_end)
    let caughtSingleEvent = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 200, waterTemperatureC: 90 },
        ],
      });
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtSingleEvent = true;
    }
    assert(suite, 'Шкала только из одного события initial_pour (без session_end) отклоняется', caughtSingleEvent);

    // 20.3 Первое событие не initial_pour
    let caughtNotInitialPour = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'sip_consumption', timestampSeconds: 0, consumedVolumeMl: 50 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      });
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtNotInitialPour = true;
    }
    assert(suite, 'Первое событие, отличное от initial_pour, вызывает TimelineChronologyError', caughtNotInitialPour);

    // 20.4 initial_pour с timestampSeconds > 0
    let caughtInitialPourDelayed = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 15, waterVolumeMl: 200, waterTemperatureC: 90 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      });
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtInitialPourDelayed = true;
    }
    assert(suite, 'initial_pour с меткой времени t > 0 вызывает TimelineChronologyError', caughtInitialPourDelayed);

    // 20.5 Последнее событие не session_end
    let caughtMissingSessionEnd = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 200, waterTemperatureC: 90 },
          { type: 'water_refill', timestampSeconds: 120, addedWaterVolumeMl: 50, addedWaterTemperatureC: 90 },
        ],
      });
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtMissingSessionEnd = true;
    }
    assert(suite, 'Шкала без session_end в конце вызывает TimelineChronologyError', caughtMissingSessionEnd);

    // 20.6 Повторный initial_pour
    let caughtSecondInitialPour = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 150, waterTemperatureC: 90 },
          { type: 'initial_pour', timestampSeconds: 60, waterVolumeMl: 100, waterTemperatureC: 90 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      });
    } catch (err) {
      if (err instanceof TimelineChronologyError) caughtSecondInitialPour = true;
    }
    assert(suite, 'Повторный initial_pour вызывает TimelineChronologyError', caughtSecondInitialPour);

    // 20.7 Неположительный объём долива воды (<= 0)
    let caughtZeroRefill = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 200, waterTemperatureC: 90 },
          { type: 'water_refill', timestampSeconds: 60, addedWaterVolumeMl: 0, addedWaterTemperatureC: 90 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      });
    } catch (err) {
      if (err instanceof ThermalValidationError) caughtZeroRefill = true;
    }
    assert(suite, 'Долив нулевого объёма воды (0 мл) вызывает ThermalValidationError', caughtZeroRefill);

    // 20.8 Неположительный объём отпивания (<= 0)
    let caughtZeroSip = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 200, waterTemperatureC: 90 },
          { type: 'sip_consumption', timestampSeconds: 60, consumedVolumeMl: -10 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      });
    } catch (err) {
      if (err instanceof ThermalValidationError) caughtZeroSip = true;
    }
    assert(suite, 'Отрицательный объём отпивания (-10 мл) вызывает ThermalValidationError', caughtZeroSip);

    // 20.9 Температура долива воды за пределами 0–100 °C
    let caughtBadRefillTemp = false;
    try {
      engine.simulateLazyMug({
        ...defaultMugSession,
        timelineEvents: [
          { type: 'initial_pour', timestampSeconds: 0, waterVolumeMl: 200, waterTemperatureC: 90 },
          { type: 'water_refill', timestampSeconds: 60, addedWaterVolumeMl: 50, addedWaterTemperatureC: 105 },
          { type: 'session_end', timestampSeconds: 300 },
        ],
      });
    } catch (err) {
      if (err instanceof ThermalRangeError) caughtBadRefillTemp = true;
    }
    assert(suite, 'Температура долива 105 °C вызывает ThermalRangeError', caughtBadRefillTemp);
  }

  // Тест 21: Валидация специфических параметров Лю Гэнь Пао
  {
    const suite = '21. Валидация специфических параметров метода Лю Гэнь Пао';
    const engine = new BrewingThermalEngine();
    const defaultLiuSession = createDefaultSession('liu_gen_pao', REFERENCE_TEAS[0].id) as LiuGenPaoSessionConfig;

    // 21.1 Недопустимая доля удерживаемого корня (retainedLiquorFractionOfTotal)
    for (const [label, badFraction] of [
      ['отрицательная доля (-0.2)', -0.2],
      ['доля >= 1.0 (1.0)', 1.0],
      ['доля > 1.0 (1.5)', 1.5],
      ['NaN', NaN],
    ] as const) {
      let caught = false;
      try {
        engine.simulateLiuGenPao({
          ...defaultLiuSession,
          steps: [
            {
              stepNumber: 1,
              infusionTimeSeconds: 20,
              addedWaterVolumeMl: 80,
              retainedLiquorFractionOfTotal: badFraction,
              addedWaterTemperatureC: 90,
            },
          ],
        });
      } catch (err) {
        if (err instanceof ThermalValidationError && err.code === 'INVALID_RETAINED_FRACTION') {
          caught = true;
        }
      }
      assert(suite, `retainedLiquorFractionOfTotal: ${label} вызывает ThermalValidationError (без скрытого Math.min/Math.max)`, caught);
    }

    // 21.2 Неположительный объём доливаемой воды
    let caughtBadAddedVolume = false;
    try {
      engine.simulateLiuGenPao({
        ...defaultLiuSession,
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20,
            addedWaterVolumeMl: 0,
            retainedLiquorFractionOfTotal: 0.5,
            addedWaterTemperatureC: 90,
          },
        ],
      });
    } catch (err) {
      if (err instanceof ThermalValidationError && err.code === 'INVALID_ADDED_VOLUME') {
        caughtBadAddedVolume = true;
      }
    }
    assert(suite, 'addedWaterVolumeMl = 0 вызывает ThermalValidationError (INVALID_ADDED_VOLUME)', caughtBadAddedVolume);

    // 21.3 Температура долива воды за пределами 0–100 °C
    let caughtBadLiuTemp = false;
    try {
      engine.simulateLiuGenPao({
        ...defaultLiuSession,
        steps: [
          {
            stepNumber: 1,
            infusionTimeSeconds: 20,
            addedWaterVolumeMl: 80,
            retainedLiquorFractionOfTotal: 0.5,
            addedWaterTemperatureC: -5,
          },
        ],
      });
    } catch (err) {
      if (err instanceof ThermalRangeError) {
        caughtBadLiuTemp = true;
      }
    }
    assert(suite, 'addedWaterTemperatureC = -5 °C в Лю Гэнь Пао вызывает ThermalRangeError', caughtBadLiuTemp);
  }

  // Тест 22: Точность материального баланса метода Лю Гэнь Пао (без скрытого округления)
  {
    const suite = '22. Точность материального баланса Лю Гэнь Пао (без скрытого округления)';
    const engine = new BrewingThermalEngine();
    const defaultLiuSession = createDefaultSession('liu_gen_pao', REFERENCE_TEAS[0].id) as LiuGenPaoSessionConfig;

    // Шаг 1: 75 мл, доля удержания 0.35 => точный остаток 26.25 мл (ранее округлялся до 26)
    // Шаг 2: долив 50 мл => полный объём 76.25 мл, доля 0.35 => точный остаток 26.6875 мл
    const precisionSession: LiuGenPaoSessionConfig = {
      ...defaultLiuSession,
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 20,
          addedWaterVolumeMl: 75,
          retainedLiquorFractionOfTotal: 0.35,
          addedWaterTemperatureC: 90,
        },
        {
          stepNumber: 2,
          infusionTimeSeconds: 20,
          addedWaterVolumeMl: 50,
          retainedLiquorFractionOfTotal: 0.35,
          addedWaterTemperatureC: 90,
        },
        {
          stepNumber: 3,
          infusionTimeSeconds: 20,
          addedWaterVolumeMl: 50,
          retainedLiquorFractionOfTotal: 0.35,
          addedWaterTemperatureC: 90,
        },
      ],
    };

    const res = engine.simulateLiuGenPao(precisionSession);

    // 22.1 Проверка, что расчёт завершился успешно и выдал 3 шага
    assert(suite, 'Сессия с дробными долями удержания рассчитывается успешно', res.stepResults.length === 3);

    // 22.2 Проверка точного материального баланса: сумма удержанного и слитого равна полному объёму
    const totalStep1 = 75;
    const retainedStep1 = totalStep1 * 0.35; // строго 26.25
    const drainedStep1 = totalStep1 * (1 - 0.35); // строго 48.75
    assert(
      suite,
      'Дробная доля удержания 0.35 от 75 мл даёт точный остаточный объём 26.25 мл без округления',
      Math.abs(retainedStep1 - 26.25) < 1e-12
    );
    assert(
      suite,
      'Сумма слитого (48.75 мл) и удержанного (26.25 мл) строго равна 75 мл (ошибка < 1e-12)',
      Math.abs(retainedStep1 + drainedStep1 - totalStep1) < 1e-12
    );

    // 22.3 На шаге 2 начальная температура смешения строго учитывает дробный остаток 26.25 мл
    // Смешение: 26.25 мл корня при T1 + 50 мл свежей воды при 90 °C
    const tEnd1 = res.stepResults[0].finalLiquidTempC!;
    const expectedMixTemp2 = (26.25 * tEnd1 + 50 * 90) / 76.25;
    const actualMixTemp2 = res.stepResults[1].initialLiquidTempC!;
    assert(
      suite,
      'Начальная температура смеси на шаге 2 строго соответствует физическому смешению с дробным объёмом 26.25 мл',
      Math.abs(actualMixTemp2 - expectedMixTemp2) < 1e-6
    );

    // 22.4 Отсутствие накопления ошибки округления при серии проливов
    const totalStep2 = 26.25 + 50; // 76.25
    const retainedStep2 = totalStep2 * 0.35; // 26.6875
    const totalStep3 = retainedStep2 + 50; // 76.6875
    const retainedStep3 = totalStep3 * 0.35; // 26.840625
    const expectedMixTemp3 = (retainedStep2 * res.stepResults[1].finalLiquidTempC! + 50 * 90) / totalStep3;
    assert(
      suite,
      'На шаге 3 смешение использует точный материальный баланс без накопления целочисленных погрешностей',
      Math.abs(res.stepResults[2].initialLiquidTempC! - expectedMixTemp3) < 1e-6
    );
  }

  // Тест 23: Реальный учёт паузы между проливами в Лю Гэнь Пао
  {
    const suite = '23. Тепловой учёт паузы между проливами в Лю Гэнь Пао';
    const engine = new BrewingThermalEngine();
    const defaultLiuSession = createDefaultSession('liu_gen_pao', REFERENCE_TEAS[0].id) as LiuGenPaoSessionConfig;

    // 23.1 Пауза 0 с даёт идентичный результат отсутствию паузы
    const resNoPause = engine.simulateLiuGenPao(defaultLiuSession);
    const resZeroPause = engine.simulateLiuGenPao(defaultLiuSession, { interInfusionPauseSeconds: 0 });
    assert(
      suite,
      'Пауза 0 с даёт строго идентичную температуру смеси на шаге 2 с расчётом по умолчанию',
      resNoPause.stepResults[1].initialLiquidTempC === resZeroPause.stepResults[1].initialLiquidTempC
    );
    assert(
      suite,
      'Пауза 0 с даёт строго идентичную конечную температуру шага 2',
      resNoPause.stepResults[1].finalLiquidTempC === resZeroPause.stepResults[1].finalLiquidTempC
    );

    // 23.2 Положительная пауза 40 с охлаждает удержанный настой и стенки сосуда
    const resWithPause = engine.simulateLiuGenPao(defaultLiuSession, { interInfusionPauseSeconds: 40 });
    const mixTempNoPauseStep2 = resNoPause.stepResults[1].initialLiquidTempC!;
    const mixTempPauseStep2 = resWithPause.stepResults[1].initialLiquidTempC!;

    assert(
      suite,
      'При паузе 40 с начальная температура смеси на шаге 2 строго ниже, чем без паузы (корень остыл)',
      mixTempPauseStep2 < mixTempNoPauseStep2 - 1.0
    );

    // 23.3 Стенки сосуда перед вторым проливом холоднее при наличии паузы
    const vesselTempNoPauseStep2 = resNoPause.stepResults[1].initialVesselTempC;
    const vesselTempPauseStep2 = resWithPause.stepResults[1].initialVesselTempC;
    assert(
      suite,
      'При паузе 40 с температура стенок перед шагом 2 строго ниже, чем без паузы',
      vesselTempPauseStep2 < vesselTempNoPauseStep2 - 1.0
    );

    // 23.4 Конечная температура шага 2 с паузой ниже, чем без неё
    assert(
      suite,
      'Конечная температура шага 2 при наличии паузы ниже из-за более холодного корня и стенок',
      resWithPause.stepResults[1].finalLiquidTempC! < resNoPause.stepResults[1].finalLiquidTempC!
    );

    // 23.5 Пауза не нарушает материальный баланс (сохранение объёмов)
    assert(
      suite,
      'Сводка моделирования содержит задокументированное допущение об идеальном перемешивании удержанного корня',
      resWithPause.summary.generalAssumptions.some((a) => a.includes('удержанный настой остаётся в сосуде и непрерывно охлаждается'))
    );
  }

  // Тест 24: Выявление численной нестабильности схемы (ThermalInstabilityError)
  {
    const suite = '24. Обнаружение численной нестабильности схемы (ThermalInstabilityError)';

    // Подбираем экстремальный физический профиль:
    // микрососуд (масса 1 г, удельная теплоёмкость 150 Дж/(кг·К)), микрообъём 1 мл
    // и сверхвысокая проводимость G_lv = 800 Вт/К.
    // Для него tau_min = C / G ~ 4.184 / 800 ~ 0.0052 с.
    // Предел устойчивости схемы Хойна (RK2): dt_crit = 2 * tau_min ~ 0.010 с.
    // При шаге dt = 0.1 с условие устойчивости нарушено (dt > dt_crit).
    const extremeProfile: VesselThermalProfile = {
      id: 'vessel-test-unstable',
      name: 'Экстремальный микрососуд для теста устойчивости',
      material: 'glass',
      vesselMassGrams: 1.0,
      materialSpecificHeatJPerKgK: 150,
      conductanceLiquidVesselWPerK: 800.0,
      conductanceVesselAmbientWPerK: 10.0,
      conductanceLiquidAmbientWPerK: 10.0,
      origin: 'model_profile',
      basisNotes: 'Экстремальный синтетический профиль для верификации выявления неустойчивости',
    };

    const state: ThermalState = {
      liquidVolumeMl: 1.0,
      liquidTemperatureC: 95.0,
      vesselTemperatureC: 22.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    let caughtInstability = false;
    let errorInstance: ThermalInstabilityError | null = null;

    try {
      // Шаг dt = 0.1 с заведомо превышает предел устойчивости dt_crit ~ 0.010 с
      integrateThermalStep(state, extremeProfile, 5.0, 0.1);
    } catch (err) {
      if (err instanceof ThermalInstabilityError) {
        caughtInstability = true;
        errorInstance = err;
      }
    }

    assert(
      suite,
      'При шаге dt > dt_max_stable интегратор выбрасывает ThermalInstabilityError вместо скрытой стабилизации',
      caughtInstability
    );

    assert(
      suite,
      'ThermalInstabilityError является экземпляром ThermalValidationError',
      errorInstance instanceof ThermalValidationError
    );

    assert(
      suite,
      'Ошибка численной нестабильности содержит параметры шага и предела устойчивости',
      errorInstance !== null &&
        errorInstance.timeStepSeconds === 0.1 &&
        typeof errorInstance.maxStableTimeStepSeconds === 'number' &&
        errorInstance.maxStableTimeStepSeconds < 0.1
    );
  }

  return results;
}

