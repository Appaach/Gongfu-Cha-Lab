/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  solveLeafWaterThermalMixing,
  LeafWaterThermalMixingParams,
} from '../engine/thermal/leafWaterMixing.ts';
import {
  ThermalRangeError,
  ThermalValidationError,
} from '../engine/thermal/errors.ts';
import { SPECIFIC_HEAT_WATER_J_PER_KG_K } from '../engine/thermal/constants.ts';
import { createValueWithOrigin } from '../domain/tea/types.ts';
import { TestResult } from './domain.test.ts';

/**
 * Синтетический модельный профиль удельной теплоёмкости чайного листа для тестирования.
 * НЕ является лабораторно подтверждённым свойством реального чая (помечен как 'model_profile').
 */
const SYNTHETIC_LEAF_SPECIFIC_HEAT = createValueWithOrigin(
  1500.0,
  'model_profile',
  'Дж/(кг·К)',
  {
    sourceNotes:
      'Синтетический тестовый ориентир изобарной теплоёмкости сухой растительной матрицы (1500 Дж/(кг·К))',
  }
);

/**
 * Синтетический неизвестный профиль удельной теплоёмкости для проверки принципа «Unknown ≠ 0».
 */
const UNKNOWN_LEAF_SPECIFIC_HEAT = createValueWithOrigin<number>(
  null,
  'unknown',
  'Дж/(кг·К)',
  {
    sourceNotes: 'Теплоёмкость листа не определена для данного образца',
  }
);

export async function runLeafWaterMixingTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // =========================================================================
  // 1. Первоначальное смешение горячей воды с сухим листом при комнатной температуре
  // =========================================================================
  {
    const suite = '1. Первоначальное смешение воды с сухим листом';
    const params: LeafWaterThermalMixingParams = {
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 22.0, // комнатная температура
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 95.0,
    };

    const res = solveLeafWaterThermalMixing(params);

    assert(suite, 'Статус расчёта calculated', res.status === 'calculated');

    // Аналитический расчёт:
    // C_dry = 5 * 10^-3 * 1500 = 7.5 Дж/К
    // C_added = 100 * 10^-3 * 4184 = 418.4 Дж/К
    // C_after = 7.5 + 418.4 = 425.9 Дж/К
    // T_mix = (7.5 * 22 + 418.4 * 95) / 425.9 = (165 + 39748) / 425.9 = 39913 / 425.9 ≈ 93.7144869... °C
    const expectedCdry = 7.5;
    const expectedCadded = 418.4;
    const expectedCafter = 425.9;
    const expectedTmix = (7.5 * 22.0 + 418.4 * 95.0) / 425.9;

    assert(
      suite,
      'Теплоёмкость сухого листа C_dry равна 7.5 Дж/К',
      Math.abs((res.dryLeafHeatCapacityJPerK ?? 0) - expectedCdry) < 1e-9
    );
    assert(
      suite,
      'Теплоёмкость содержимого до смешения C_before равна 7.5 Дж/К',
      Math.abs((res.contentHeatCapacityBeforeMixingJPerK ?? 0) - expectedCdry) < 1e-9
    );
    assert(
      suite,
      'Теплоёмкость добавляемой воды C_added равна 418.4 Дж/К',
      Math.abs(res.addedWaterHeatCapacityJPerK - expectedCadded) < 1e-9
    );
    assert(
      suite,
      'Полная теплоёмкость после добавления C_after равна 425.9 Дж/К',
      Math.abs((res.contentHeatCapacityAfterMixingJPerK ?? 0) - expectedCafter) < 1e-9
    );
    assert(
      suite,
      'Температура смеси совпадает с аналитическим решением (~93.71 °C)',
      Math.abs((res.mixedTemperatureC ?? 0) - expectedTmix) < 1e-9
    );
    assert(
      suite,
      'Холодный сухой лист снизил температуру горячей воды на > 1 °C',
      (res.mixedTemperatureC ?? 0) < 94.0 && (res.mixedTemperatureC ?? 0) > 93.0
    );
  }

  // =========================================================================
  // 2. Добавление свежей воды к влажному листу и свободной жидкости (Лю Гэнь Пао / Lazy Mug)
  // =========================================================================
  {
    const suite = '2. Смешение с влажным листом и свободной жидкостью';
    const params: LeafWaterThermalMixingParams = {
      leafMassGrams: 6.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 12.0, // влажный лист поглотил 12 г воды
      existingFreeWaterGrams: 30.0, // 30 г свободного корня настоя
      contentTemperatureBeforeMixingC: 75.0, // остаток остыл до 75 °C
      addedWaterMassGrams: 70.0, // доливаем 70 г воды
      addedWaterTemperatureC: 98.0, // доливаемая вода 98 °C
    };

    const res = solveLeafWaterThermalMixing(params);

    // Аналитический расчёт:
    // C_dry = 6 * 10^-3 * 1500 = 9.0 Дж/К
    // C_leaf = 9.0 + 12 * 10^-3 * 4184 = 9.0 + 50.208 = 59.208 Дж/К
    // C_free = 30 * 10^-3 * 4184 = 125.52 Дж/К
    // C_before = 59.208 + 125.52 = 184.728 Дж/К
    // C_added = 70 * 10^-3 * 4184 = 292.88 Дж/К
    // C_after = 184.728 + 292.88 = 477.608 Дж/К
    // T_mix = (184.728 * 75 + 292.88 * 98) / 477.608 = (13854.6 + 28702.24) / 477.608 ≈ 89.104... °C
    const expectedCdry = 9.0;
    const expectedCwet = 59.208;
    const expectedCbefore = 184.728;
    const expectedCadded = 292.88;
    const expectedCafter = 477.608;
    const expectedTmix = (expectedCbefore * 75.0 + expectedCadded * 98.0) / expectedCafter;

    assert(suite, 'Статус calculated', res.status === 'calculated');
    assert(
      suite,
      'C_dry равен 9.0 Дж/К',
      Math.abs((res.dryLeafHeatCapacityJPerK ?? 0) - expectedCdry) < 1e-9
    );
    assert(
      suite,
      'Теплоёмкость влажного листа C_wet равна 59.208 Дж/К',
      Math.abs((res.wetLeafHeatCapacityJPerK ?? 0) - expectedCwet) < 1e-9
    );
    assert(
      suite,
      'C_before равен 184.728 Дж/К',
      Math.abs((res.contentHeatCapacityBeforeMixingJPerK ?? 0) - expectedCbefore) < 1e-9
    );
    assert(
      suite,
      'C_added равен 292.88 Дж/К',
      Math.abs(res.addedWaterHeatCapacityJPerK - expectedCadded) < 1e-9
    );
    assert(
      suite,
      'C_after равен 477.608 Дж/К',
      Math.abs((res.contentHeatCapacityAfterMixingJPerK ?? 0) - expectedCafter) < 1e-9
    );
    assert(
      suite,
      'T_mix равен ожидаемому значению (~89.10 °C)',
      Math.abs((res.mixedTemperatureC ?? 0) - expectedTmix) < 1e-9
    );
  }

  // =========================================================================
  // 3. Смешение при разных соотношениях температур компонентов
  // =========================================================================
  {
    const suite = '3. Разные температурные градиенты компонентов';

    // Случай А: Холодная вода доливается в горячий влажный лист (T_added < T_before)
    const resCold = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 10.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 85.0,
      addedWaterMassGrams: 50.0,
      addedWaterTemperatureC: 20.0,
    });

    assert(
      suite,
      'Холодный долив: T_mix строго между 20 °C и 85 °C',
      (resCold.mixedTemperatureC ?? 0) > 20.0 && (resCold.mixedTemperatureC ?? 0) < 85.0
    );

    // Случай Б: Одинаковые температуры T_before === T_added
    const resEqual = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 8.0,
      existingFreeWaterGrams: 20.0,
      contentTemperatureBeforeMixingC: 60.0,
      addedWaterMassGrams: 80.0,
      addedWaterTemperatureC: 60.0,
    });

    assert(
      suite,
      'Равные температуры компонентов дают T_mix === 60.0 °C без численного смещения',
      Math.abs((resEqual.mixedTemperatureC ?? 0) - 60.0) < 1e-12
    );
  }

  // =========================================================================
  // 4. Сохранение энергии при адиабатическом смешении
  // =========================================================================
  {
    const suite = '4. Сохранение тепловой энергии (баланс энтальпии)';
    const params: LeafWaterThermalMixingParams = {
      leafMassGrams: 7.5,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 15.3,
      existingFreeWaterGrams: 24.7,
      contentTemperatureBeforeMixingC: 68.4,
      addedWaterMassGrams: 110.2,
      addedWaterTemperatureC: 96.8,
    };

    const res = solveLeafWaterThermalMixing(params);

    const cBefore = res.contentHeatCapacityBeforeMixingJPerK!;
    const cAdded = res.addedWaterHeatCapacityJPerK;
    const cAfter = res.contentHeatCapacityAfterMixingJPerK!;
    const tMix = res.mixedTemperatureC!;

    // Энтальпия до смешения:
    const eInitialJoules =
      cBefore * params.contentTemperatureBeforeMixingC +
      cAdded * params.addedWaterTemperatureC;

    // Энтальпия после смешения:
    const eFinalJoules = cAfter * tMix;

    const deltaEJoules = Math.abs(eFinalJoules - eInitialJoules);

    assert(
      suite,
      'Невязка тепловой энергии строго равна 0 с машинной точностью (< 10^-12 Дж)',
      deltaEJoules < 1e-12,
      `deltaE = ${deltaEJoules} Дж`
    );
  }

  // =========================================================================
  // 5. Температура смеси строго между температурами компонентов
  // =========================================================================
  {
    const suite = '5. Строгие термодинамические границы температуры смеси';

    for (const [tBefore, tAdded] of [
      [22.0, 95.0],
      [95.0, 22.0],
      [5.0, 80.0],
      [80.0, 5.0],
      [40.0, 40.1],
    ]) {
      const res = solveLeafWaterThermalMixing({
        leafMassGrams: 4.0,
        leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
        absorbedWaterGrams: 5.0,
        existingFreeWaterGrams: 10.0,
        contentTemperatureBeforeMixingC: tBefore,
        addedWaterMassGrams: 50.0,
        addedWaterTemperatureC: tAdded,
      });

      const tMin = Math.min(tBefore, tAdded);
      const tMax = Math.max(tBefore, tAdded);
      const tMix = res.mixedTemperatureC!;

      assert(
        suite,
        `T_mix (${tMix.toFixed(3)} °C) строго в (${tMin}, ${tMax}) °C при [${tBefore}, ${tAdded}]`,
        tMix > tMin && tMix < tMax
      );
    }
  }

  // =========================================================================
  // 6. Размерная когерентность СИ и перевод масс г -> кг
  // =========================================================================
  {
    const suite = '6. Проверка размерностей и перевода масс г в кг';
    // Навеска 1000 г = 1 кг сухого листа с c_p = 1500 Дж/(кг·К)
    // C_dry должна быть ровно 1500 Дж/К (не 1.5 и не 1500000)
    const res = solveLeafWaterThermalMixing({
      leafMassGrams: 1000.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 25.0,
      addedWaterMassGrams: 1000.0, // 1 кг воды
      addedWaterTemperatureC: 75.0,
    });

    assert(
      suite,
      'C_dry для 1000 г листа равна ровно 1500 Дж/К (m_kg = 1.0 кг)',
      Math.abs((res.dryLeafHeatCapacityJPerK ?? 0) - 1500.0) < 1e-9
    );
    assert(
      suite,
      'C_added для 1000 г воды равна ровно 4184.0 Дж/К (m_kg = 1.0 кг)',
      Math.abs(res.addedWaterHeatCapacityJPerK - SPECIFIC_HEAT_WATER_J_PER_KG_K) < 1e-9
    );
    assert(
      suite,
      'C_after равна ровно 5684.0 Дж/К (1500 + 4184)',
      Math.abs((res.contentHeatCapacityAfterMixingJPerK ?? 0) - 5684.0) < 1e-9
    );
  }

  // =========================================================================
  // 7. Влияние поглощённой воды на теплоёмкость влажного листа
  // =========================================================================
  {
    const suite = '7. Влияние массы поглощённой влаги на теплоёмкость листа';
    const leafMass = 5.0;

    const resDry = solveLeafWaterThermalMixing({
      leafMassGrams: leafMass,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 25.0,
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 95.0,
    });

    const resWet = solveLeafWaterThermalMixing({
      leafMassGrams: leafMass,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 10.0, // 10 г поглощённой воды
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 25.0,
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 95.0,
    });

    // Дельта теплоёмкости листа должна в точности равняться 10 г воды:
    // deltaC = 10 * 10^-3 * 4184 = 41.84 Дж/К
    const deltaCwet =
      (resWet.wetLeafHeatCapacityJPerK ?? 0) - (resDry.wetLeafHeatCapacityJPerK ?? 0);
    const expectedDeltaC = 10.0 * 0.001 * SPECIFIC_HEAT_WATER_J_PER_KG_K;

    assert(
      suite,
      'Теплоёмкость листа возрастает строго на m_abs * c_p,water (41.84 Дж/К)',
      Math.abs(deltaCwet - expectedDeltaC) < 1e-9
    );
    assert(
      suite,
      'C_dry листа остаётся неизменной при поглощении воды',
      Math.abs((resWet.dryLeafHeatCapacityJPerK ?? 0) - (resDry.dryLeafHeatCapacityJPerK ?? 0)) < 1e-12
    );
  }

  // =========================================================================
  // 8. Неизвестная теплоёмкость листа (Unknown ≠ 0)
  // =========================================================================
  {
    const suite = '8. Неизвестная теплоёмкость листа (Unknown ≠ 0)';

    // Сценарий 8.1: origin === 'unknown'
    const resUnknown = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: UNKNOWN_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 5.0,
      existingFreeWaterGrams: 20.0,
      contentTemperatureBeforeMixingC: 80.0,
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 95.0,
    });

    assert(
      suite,
      'Статус равен unknown_leaf_specific_heat',
      resUnknown.status === 'unknown_leaf_specific_heat'
    );
    assert(
      suite,
      'mixedTemperatureC равен null (не подменяется нулём или температурой воды)',
      resUnknown.mixedTemperatureC === null
    );
    assert(
      suite,
      'contentHeatCapacityBeforeMixingJPerK равен null',
      resUnknown.contentHeatCapacityBeforeMixingJPerK === null
    );
    assert(
      suite,
      'dryLeafHeatCapacityJPerK равен null',
      resUnknown.dryLeafHeatCapacityJPerK === null
    );
    assert(
      suite,
      'wetLeafHeatCapacityJPerK равен null',
      resUnknown.wetLeafHeatCapacityJPerK === null
    );
    assert(
      suite,
      'contentHeatCapacityAfterMixingJPerK равен null',
      resUnknown.contentHeatCapacityAfterMixingJPerK === null
    );
    assert(
      suite,
      'addedWaterHeatCapacityJPerK рассчитан и не равен null (не зависит от листа)',
      resUnknown.addedWaterHeatCapacityJPerK > 0
    );
    assert(
      suite,
      'reason содержит ясное объяснение блокировки',
      typeof resUnknown.reason === 'string' && resUnknown.reason.length > 0
    );

    // Сценарий 8.2: value === null при origin !== 'unknown'
    const resNullVal = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: {
        origin: 'literature',
        value: null,
        unit: 'Дж/(кг·К)',
      },
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 20.0,
      addedWaterMassGrams: 50.0,
      addedWaterTemperatureC: 90.0,
    });

    assert(
      suite,
      'При value === null возвращается статус unknown_leaf_specific_heat',
      resNullVal.status === 'unknown_leaf_specific_heat' && resNullVal.mixedTemperatureC === null
    );
  }

  // =========================================================================
  // 9. Строгая валидация недопустимых типов и физических границ
  // =========================================================================
  {
    const suite = '9. Строгая валидация типов и диапазонов входных данных';

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

    const validBase: LeafWaterThermalMixingParams = {
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 22.0,
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 95.0,
    };

    // Ошибки массы листа
    expectThermalError('Отрицательная масса листа', () =>
      solveLeafWaterThermalMixing({ ...validBase, leafMassGrams: -1 }), 'INVALID_LEAF_MASS'
    );
    expectThermalError('Нулевая масса листа', () =>
      solveLeafWaterThermalMixing({ ...validBase, leafMassGrams: 0 }), 'INVALID_LEAF_MASS'
    );
    expectThermalError('NaN масса листа', () =>
      solveLeafWaterThermalMixing({ ...validBase, leafMassGrams: NaN }), 'INVALID_LEAF_MASS'
    );
    expectThermalError('Строковая масса листа', () =>
      solveLeafWaterThermalMixing({ ...validBase, leafMassGrams: '5' as any }), 'INVALID_LEAF_MASS'
    );

    // Ошибки массы поглощённой воды
    expectThermalError('Отрицательная масса поглощённой воды', () =>
      solveLeafWaterThermalMixing({ ...validBase, absorbedWaterGrams: -0.1 }), 'INVALID_ABSORBED_WATER_MASS'
    );
    expectThermalError('Infinity масса поглощённой воды', () =>
      solveLeafWaterThermalMixing({ ...validBase, absorbedWaterGrams: Infinity }), 'INVALID_ABSORBED_WATER_MASS'
    );

    // Ошибки массы свободной воды
    expectThermalError('Отрицательная масса свободной воды', () =>
      solveLeafWaterThermalMixing({ ...validBase, existingFreeWaterGrams: -5 }), 'INVALID_FREE_WATER_MASS'
    );

    // Ошибки массы добавляемой воды
    expectThermalError('Нулевая масса добавляемой воды', () =>
      solveLeafWaterThermalMixing({ ...validBase, addedWaterMassGrams: 0 }), 'INVALID_ADDED_WATER_MASS'
    );
    expectThermalError('Отрицательная масса добавляемой воды', () =>
      solveLeafWaterThermalMixing({ ...validBase, addedWaterMassGrams: -10 }), 'INVALID_ADDED_WATER_MASS'
    );

    // Ошибки температур вне [0, 100] °C (должны быть ThermalRangeError)
    expectThermalError('Температура содержимого < 0 °C (-1 °C)', () =>
      solveLeafWaterThermalMixing({ ...validBase, contentTemperatureBeforeMixingC: -1 }), 'THERMAL_RANGE_ERROR'
    );
    expectThermalError('Температура содержимого > 100 °C (101 °C)', () =>
      solveLeafWaterThermalMixing({ ...validBase, contentTemperatureBeforeMixingC: 101 }), 'THERMAL_RANGE_ERROR'
    );
    expectThermalError('Температура добавляемой воды < 0 °C', () =>
      solveLeafWaterThermalMixing({ ...validBase, addedWaterTemperatureC: -0.01 }), 'THERMAL_RANGE_ERROR'
    );
    expectThermalError('Температура добавляемой воды > 100 °C', () =>
      solveLeafWaterThermalMixing({ ...validBase, addedWaterTemperatureC: 100.1 }), 'THERMAL_RANGE_ERROR'
    );

    // Ошибки объекта теплоёмкости листа
    expectThermalError('Отсутствующий объект leafSpecificHeatCapacity (undefined)', () =>
      solveLeafWaterThermalMixing({ ...validBase, leafSpecificHeatCapacity: undefined as any }), 'INVALID_LEAF_SPECIFIC_HEAT_OBJECT'
    );
    expectThermalError('Некорректный тип leafSpecificHeatCapacity (число вместо объекта)', () =>
      solveLeafWaterThermalMixing({ ...validBase, leafSpecificHeatCapacity: 1500 as any }), 'INVALID_LEAF_SPECIFIC_HEAT_OBJECT'
    );

    // Ошибки известного значения теплоёмкости листа
    expectThermalError('Отрицательное известное значение c_p сухого листа', () =>
      solveLeafWaterThermalMixing({
        ...validBase,
        leafSpecificHeatCapacity: { origin: 'literature', value: -1500, unit: 'Дж/(кг·К)' },
      }),
      'INVALID_LEAF_SPECIFIC_HEAT_VALUE'
    );
    expectThermalError('Нулевое известное значение c_p сухого листа', () =>
      solveLeafWaterThermalMixing({
        ...validBase,
        leafSpecificHeatCapacity: { origin: 'literature', value: 0, unit: 'Дж/(кг·К)' },
      }),
      'INVALID_LEAF_SPECIFIC_HEAT_VALUE'
    );
    expectThermalError('NaN известное значение c_p сухого листа', () =>
      solveLeafWaterThermalMixing({
        ...validBase,
        leafSpecificHeatCapacity: { origin: 'literature', value: NaN, unit: 'Дж/(кг·К)' },
      }),
      'INVALID_LEAF_SPECIFIC_HEAT_VALUE'
    );

    // Ошибка единиц измерения
    expectThermalError('Недопустимая единица измерения (например, кал/г)', () =>
      solveLeafWaterThermalMixing({
        ...validBase,
        leafSpecificHeatCapacity: { origin: 'literature', value: 1500, unit: 'кал/(г·К)' },
      }),
      'INVALID_SPECIFIC_HEAT_UNIT'
    );
  }

  // =========================================================================
  // 10. Граничные температуры 0 °C и 100 °C
  // =========================================================================
  {
    const suite = '10. Граничные температуры жидкой фазы воды (0 °C и 100 °C)';

    // Случай 10.1: T_before = 0 °C, T_added = 100 °C
    const resBoundary1 = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 0.0,
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 100.0,
    });

    assert(
      suite,
      'Граничные температуры 0 °C и 100 °C успешно принимаются',
      resBoundary1.status === 'calculated' && resBoundary1.mixedTemperatureC !== null
    );
    assert(
      suite,
      'T_mix при 0 °C и 100 °C строго в интервале (0, 100) °C',
      (resBoundary1.mixedTemperatureC ?? 0) > 0.0 && (resBoundary1.mixedTemperatureC ?? 0) < 100.0
    );

    // Случай 10.2: Обе температуры ровно 0 °C
    const resZero = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 5.0,
      existingFreeWaterGrams: 10.0,
      contentTemperatureBeforeMixingC: 0.0,
      addedWaterMassGrams: 50.0,
      addedWaterTemperatureC: 0.0,
    });

    assert(
      suite,
      'Обе температуры ровно 0.0 °C дают T_mix === 0.0 °C',
      Math.abs((resZero.mixedTemperatureC ?? -1) - 0.0) < 1e-12
    );

    // Случай 10.3: Обе температуры ровно 100 °C
    const resBoiling = solveLeafWaterThermalMixing({
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 10.0,
      existingFreeWaterGrams: 20.0,
      contentTemperatureBeforeMixingC: 100.0,
      addedWaterMassGrams: 80.0,
      addedWaterTemperatureC: 100.0,
    });

    assert(
      suite,
      'Обе температуры ровно 100.0 °C дают T_mix === 100.0 °C',
      Math.abs((resBoiling.mixedTemperatureC ?? -1) - 100.0) < 1e-12
    );

    // Случай 10.4: Допустимость различных стандартных написаний единиц Дж/(кг·К)
    for (const unit of ['Дж/(кг·К)', 'Дж/(кг*К)', 'J/(kg·K)', 'J/(kg*K)', 'J/kg/K']) {
      const resUnit = solveLeafWaterThermalMixing({
        leafMassGrams: 5.0,
        leafSpecificHeatCapacity: createValueWithOrigin(1500.0, 'model_profile', unit),
        absorbedWaterGrams: 0.0,
        existingFreeWaterGrams: 0.0,
        contentTemperatureBeforeMixingC: 20.0,
        addedWaterMassGrams: 50.0,
        addedWaterTemperatureC: 90.0,
      });

      assert(
        suite,
        `Единица измерения "${unit}" успешно валидируется`,
        resUnit.status === 'calculated'
      );
    }
  }

  // =========================================================================
  // 11. Усиленная runtime-валидация leafSpecificHeatCapacity (Этап 2B.3.3.1.1)
  // =========================================================================
  {
    const suite = '11. Усиленная валидация leafSpecificHeatCapacity (Этап 2B.3.3.1.1)';

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

    const validBase: LeafWaterThermalMixingParams = {
      leafMassGrams: 5.0,
      leafSpecificHeatCapacity: SYNTHETIC_LEAF_SPECIFIC_HEAT,
      absorbedWaterGrams: 0.0,
      existingFreeWaterGrams: 0.0,
      contentTemperatureBeforeMixingC: 22.0,
      addedWaterMassGrams: 100.0,
      addedWaterTemperatureC: 95.0,
    };

    // 1. unit числового типа вызывает ThermalValidationError (INVALID_SPECIFIC_HEAT_UNIT), а не TypeError
    expectThermalError(
      'unit числового типа вызывает INVALID_SPECIFIC_HEAT_UNIT без падения на trim()',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'literature', value: 1500, unit: 42 as any },
        }),
      'INVALID_SPECIFIC_HEAT_UNIT'
    );

    // 2. unit отсутствует (undefined/null) или имеет недопустимое строковое значение
    expectThermalError(
      'unit undefined вызывает INVALID_SPECIFIC_HEAT_UNIT',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'literature', value: 1500, unit: undefined as any },
        }),
      'INVALID_SPECIFIC_HEAT_UNIT'
    );
    expectThermalError(
      'unit null вызывает INVALID_SPECIFIC_HEAT_UNIT',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'literature', value: 1500, unit: null as any },
        }),
      'INVALID_SPECIFIC_HEAT_UNIT'
    );
    expectThermalError(
      'unit недопустимая строка (BTU/lb) вызывает INVALID_SPECIFIC_HEAT_UNIT',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'literature', value: 1500, unit: 'BTU/(lb*F)' },
        }),
      'INVALID_SPECIFIC_HEAT_UNIT'
    );

    // 3. Недопустимый origin вызывает INVALID_LEAF_SPECIFIC_HEAT_ORIGIN
    expectThermalError(
      'origin недопустимая строка вызывает INVALID_LEAF_SPECIFIC_HEAT_ORIGIN',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'fabricated_data' as any, value: 1500, unit: 'Дж/(кг·К)' },
        }),
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN'
    );
    expectThermalError(
      'origin числового типа вызывает INVALID_LEAF_SPECIFIC_HEAT_ORIGIN',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 100 as any, value: 1500, unit: 'Дж/(кг·К)' },
        }),
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN'
    );

    // 4. Некорректный origin не маскируется веткой обработки value === null
    expectThermalError(
      'Некорректный origin при value === null вызывает INVALID_LEAF_SPECIFIC_HEAT_ORIGIN',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'unknown_fake' as any, value: null, unit: 'Дж/(кг·К)' },
        }),
      'INVALID_LEAF_SPECIFIC_HEAT_ORIGIN'
    );
    expectThermalError(
      'Числовой unit при origin: "unknown" и value: null вызывает INVALID_SPECIFIC_HEAT_UNIT',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: { origin: 'unknown', value: null, unit: 12345 as any },
        }),
      'INVALID_SPECIFIC_HEAT_UNIT'
    );

    // 5. Весь объект теплоёмкости null вызывает INVALID_LEAF_SPECIFIC_HEAT_OBJECT
    expectThermalError(
      'leafSpecificHeatCapacity === null вызывает INVALID_LEAF_SPECIFIC_HEAT_OBJECT',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: null as any,
        }),
      'INVALID_LEAF_SPECIFIC_HEAT_OBJECT'
    );

    // 6. Весь объект теплоёмкости undefined вызывает INVALID_LEAF_SPECIFIC_HEAT_OBJECT
    expectThermalError(
      'leafSpecificHeatCapacity === undefined вызывает INVALID_LEAF_SPECIFIC_HEAT_OBJECT',
      () =>
        solveLeafWaterThermalMixing({
          ...validBase,
          leafSpecificHeatCapacity: undefined as any,
        }),
      'INVALID_LEAF_SPECIFIC_HEAT_OBJECT'
    );

    // 7. Корректный объект с origin: 'unknown' и value: null возвращает unknown_leaf_specific_heat
    const resUnknownValid = solveLeafWaterThermalMixing({
      ...validBase,
      leafSpecificHeatCapacity: { origin: 'unknown', value: null, unit: 'Дж/(кг·К)' },
    });
    assert(
      suite,
      'Корректный объект с origin: "unknown" и value: null штатно возвращает unknown_leaf_specific_heat',
      resUnknownValid.status === 'unknown_leaf_specific_heat' &&
        resUnknownValid.mixedTemperatureC === null &&
        resUnknownValid.contentHeatCapacityBeforeMixingJPerK === null &&
        resUnknownValid.contentHeatCapacityAfterMixingJPerK === null
    );

    // 8. Все допустимые известные происхождения (measured, literature, model_profile, user_defined) рассчитываются штатно
    for (const validOrigin of ['measured', 'literature', 'model_profile', 'user_defined'] as const) {
      const resOrigin = solveLeafWaterThermalMixing({
        ...validBase,
        leafSpecificHeatCapacity: { origin: validOrigin, value: 1600.0, unit: 'Дж/(кг·К)' },
      });
      assert(
        suite,
        `Происхождение "${validOrigin}" рассчитывается со статусом calculated`,
        resOrigin.status === 'calculated' &&
          typeof resOrigin.mixedTemperatureC === 'number' &&
          Number.isFinite(resOrigin.mixedTemperatureC)
      );
    }
  }

  return results;
}
