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

  return results;
}
