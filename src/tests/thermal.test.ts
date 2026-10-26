/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  solveThermalMixing,
  integrateThermalStep,
} from '../engine/thermal/integrator.ts';
import {
  getVesselThermalProfile,
  VESSEL_THERMAL_PROFILES,
} from '../engine/thermal/profiles.ts';
import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
  WATER_DENSITY_KG_PER_ML,
} from '../engine/thermal/constants.ts';
import { BrewingThermalEngine } from '../engine/thermal/engine.ts';
import {
  createDefaultSession,
  createDefaultLazyMugEvents,
} from '../domain/brewing/defaults.ts';
import { GongfuSessionConfig, LazyMugSessionConfig, LazyMugTimelineEvent } from '../domain/brewing/types.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import { TestResult } from './domain.test.ts';
import { ThermalState, VesselThermalProfile } from '../engine/thermal/types.ts';

/**
 * Верификация математического ядра теплового баланса (Этап 2A).
 * 12 обязательных физических и численных инвариантов.
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
      Math.abs(res.finalState.liquidTemperatureC - equilibriumTemp) < 1e-4
    );
    assert(
      suite,
      'При равенстве температур стенки сосуда не меняют температуру',
      Math.abs(res.finalState.vesselTemperatureC - equilibriumTemp) < 1e-4
    );
  }

  // Тест 3: Если система горячее среды и нет источника тепла, она постепенно охлаждается
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
      res10.finalState.liquidTemperatureC < state.liquidTemperatureC
    );
    assert(
      suite,
      'Через 30 с температура жидкости ниже, чем через 10 с',
      res30.finalState.liquidTemperatureC < res10.finalState.liquidTemperatureC
    );
    assert(
      suite,
      'Через 60 с температура жидкости ниже, чем через 30 с',
      res60.finalState.liquidTemperatureC < res30.finalState.liquidTemperatureC
    );
    assert(
      suite,
      'Температура жидкости не опускается ниже температуры окружающей среды',
      res60.finalState.liquidTemperatureC >= state.ambientTemperatureC
    );
  }

  // Тест 4: Внутренний теплообмен между жидкостью и сосудом не создаёт энергию
  {
    const suite = '4. Закон сохранения энергии в замкнутой системе';
    // Создаём изолированный тестовый профиль с нулевой теплоотдачей в воздух (G_va = 0, G_la = 0)
    const isolatedProfile: VesselThermalProfile = {
      id: 'isolated-test-profile',
      name: 'Тестовый адиабатический сосуд',
      material: 'porcelain',
      vesselMassGrams: 100,
      materialSpecificHeatJPerKgK: 900,
      conductanceLiquidVesselWPerK: 5.0,
      conductanceVesselAmbientWPerK: 0.0, // Нет потерь в окружающую среду
      conductanceLiquidAmbientWPerK: 0.0, // Нет потерь с зеркала
      origin: 'model_profile',
      basisNotes: 'Адиабатический тест сохранения энергии',
    };

    const volumeMl = 100;
    const tLiquidInit = 90.0;
    const tVesselInit = 30.0;
    const tAmbient = 20.0;

    const cLiquid = volumeMl * WATER_DENSITY_KG_PER_ML * SPECIFIC_HEAT_WATER_J_PER_KG_K; // 0.1 * 4184 = 418.4 Дж/К
    const cVessel = isolatedProfile.vesselMassGrams * 0.001 * isolatedProfile.materialSpecificHeatJPerKgK; // 0.1 * 900 = 90.0 Дж/К

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
      cLiquid * res.finalState.liquidTemperatureC + cVessel * res.finalState.vesselTemperatureC;

    // В изолированной системе суммарная внутренняя энергия должна сохраняться с высокой численной точностью
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
      res.finalState.liquidTemperatureC < tLiquidInit
    );
    assert(
      suite,
      'Стенки нагрелись, приняв тепло жидкости (T_v > 30°C)',
      res.finalState.vesselTemperatureC > tVesselInit
    );
  }

  // Тест 5: При смешении двух порций воды температура соответствует балансу энергии
  {
    const suite = '5. Баланс энергии при смешении объёмов воды';
    // 50 мл при 80°C + 50 мл при 20°C = 100 мл при ровно 50°C
    const equalMix = solveThermalMixing(
      { volumeMl: 50, temperatureC: 80 },
      { volumeMl: 50, temperatureC: 20 }
    );
    assert(
      suite,
      'Равные объёмы 80°C и 20°C дают строго среднюю температуру 50°C',
      Math.abs(equalMix.temperatureC - 50.0) < 1e-6 && equalMix.volumeMl === 100
    );

    // 100 мл при 90°C + 50 мл при 30°C -> (100*90 + 50*30)/150 = 10500 / 150 = 70°C
    const unEqualMix = solveThermalMixing(
      { volumeMl: 100, temperatureC: 90 },
      { volumeMl: 50, temperatureC: 30 }
    );
    assert(
      suite,
      'Неравные объёмы (100 мл при 90°C + 50 мл при 30°C) дают ровно 70°C',
      Math.abs(unEqualMix.temperatureC - 70.0) < 1e-6 && unEqualMix.volumeMl === 150
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
      mixWithHot.temperatureC > mixWithWarm.temperatureC
    );
    assert(
      suite,
      'Смесь с более горячей водой теплее исходного раствора (T_mixed > 60°C)',
      mixWithHot.temperatureC > base.temperatureC
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
      mixWithCold.temperatureC < base.temperatureC
    );
    assert(
      suite,
      'Температура смеси находится строго в интервале между холодной и горячей водой',
      mixWithCold.temperatureC > 25 && mixWithCold.temperatureC < 85
    );
  }

  // Тест 8: Влияние материала сосуда только через параметры его теплового профиля
  {
    const suite = '8. Влияние материала сосуда через профиль параметров';
    // Сравним остывание в глиняном чайнике с толстыми стенками и крышкой (yixing) vs открытой стеклянной кружке (glass mug)
    const initialState: ThermalState = {
      liquidVolumeMl: 100,
      liquidTemperatureC: 92.0,
      vesselTemperatureC: 75.0,
      ambientTemperatureC: 22.0,
      elapsedSeconds: 0,
    };

    const resClay = integrateThermalStep(initialState, clayTeapotProfile, 60.0);
    const resGlassMug = integrateThermalStep(initialState, glassMugProfile, 60.0);

    // Из-за открытой поверхности кружки (G_la = 0.85 vs 0.12) кружка остывает заметно быстрее чайника с крышкой
    assert(
      suite,
      'Открытая стеклянная кружка остывает быстрее закрытого глиняного чайника',
      resGlassMug.finalState.liquidTemperatureC < resClay.finalState.liquidTemperatureC
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
      output.stepResults.every((s) => s.pourWaterTempC > 0 && s.finalLiquidTempC > 0)
    );
    assert(
      suite,
      'Жидкость на каждом шаге немного остывает за время экспозиции',
      output.stepResults.every((s) => s.finalLiquidTempC <= s.initialLiquidTempC + 1e-4)
    );
    assert(
      suite,
      'Каждый шаг содержит непустые точки кривой охлаждения',
      output.stepResults.every((s) => s.curveSamplePoints.length >= 2)
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
    // Проверим, что событие долива восстанавливает температуру остывающей жидкости
    const refillStepIdx = session.timelineEvents.findIndex((e: LazyMugTimelineEvent) => e.type === 'water_refill');
    if (refillStepIdx > 0) {
      const stepBeforeRefill = output.stepResults[refillStepIdx - 1];
      const refillStep = output.stepResults[refillStepIdx];
      assert(
        suite,
        'Долив горячей воды поднимает температуру жидкости по сравнению с остывшей перед доливом',
        refillStep.initialLiquidTempC > stepBeforeRefill.finalLiquidTempC
      );
    }
  }

  // Тест 11: Объём жидкости неотрицателен и диагностика превышения вместимости
  {
    const suite = '11. Безопасность объёмов и контроль границ вместимости';
    const engine = new BrewingThermalEngine();
    const gaiwanSession = createDefaultSession('gongfu_cha', REFERENCE_TEAS[0].id);

    // Подготовим сессию с объёмом, превышающим вместимость (150 мл в 110 мл гайвань)
    const overflowSession = {
      ...gaiwanSession,
      steps: [
        {
          stepNumber: 1,
          infusionTimeSeconds: 15,
          pourWaterVolumeMl: 150, // > 110 мл вместимости
          waterTemperatureC: 90,
        },
      ],
    };

    const overflowOutput = engine.simulateGongfu(overflowSession as any);
    const hasCapacityWarning = overflowOutput.stepResults[0].warnings.some((w) =>
      w.includes('превышает номинальную вместимость')
    );

    assert(
      suite,
      'Превышение вместимости сосуда генерирует явное предупреждение валидации',
      hasCapacityWarning
    );

    // Проверка на отрицательный объём
    const negMix = solveThermalMixing({ volumeMl: -50, temperatureC: 80 }, { volumeMl: 20, temperatureC: 30 });
    assert(
      suite,
      'Отрицательный объём защищён и приводится к 0',
      negMix.volumeMl === 20 && negMix.temperatureC === 30
    );
  }

  // Тест 12: Детерминированность расчётов при одинаковых входных данных
  {
    const suite = '12. Детерминированность тепловой модели';
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
