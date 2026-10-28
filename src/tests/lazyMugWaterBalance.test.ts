/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LazyMugSessionConfig,
  LazyMugTimelineEvent,
} from '../domain/brewing/types.ts';
import {
  DEFAULT_VESSELS,
  DEFAULT_WATER_PROFILES,
} from '../domain/brewing/defaults.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import { TeaSample, createValueWithOrigin } from '../domain/tea/types.ts';
import {
  WaterBalanceValidationError,
  simulateLazyMugWaterBalance,
  LazyMugWaterBalanceOptions,
} from '../engine/water-balance/index.ts';

interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  error?: string;
}

/**
 * Синтетический чай с полностью откалиброванными и известными физическими параметрами
 * для воспроизводимого численного тестирования водного баланса Lazy Mug.
 */
const SYNTHETIC_LAZY_MUG_TEST_TEA: TeaSample = {
  id: 'synthetic-lazy-mug-test-tea',
  name: 'Синтетический чай для тестирования Lazy Mug',
  category: 'green',
  morphology: 'bud_and_leaves',
  roastLevel: 'none',
  waterAbsorptionRatio: createValueWithOrigin(2.5, 'literature', 'г/г', {
    citation: 'SYNTHETIC_LAB_WATER_ABSORPTION_2_5',
  }),
  leafBulkDensityGPerCm3: createValueWithOrigin(0.3, 'model_profile', 'г/см³'),
  uncalibratedHydrationSpeed: createValueWithOrigin(1.0, 'model_profile', 'ед.'),
  hydrationRateConstantPerSecond: createValueWithOrigin(0.02, 'measured', 's^-1', {
    measurementMethod: 'SYNTHETIC_LAB_GRAVIMETRY',
    sampleInfo: 'SYNTHETIC_BATCH_LAZY_001',
  }),
  totalExtractableFraction: createValueWithOrigin(38.0, 'literature', '%', {
    citation: 'SYNTHETIC_LITERATURE_EXTRACT',
  }),
  caffeineFraction: createValueWithOrigin(3.2, 'literature', '%', {
    citation: 'SYNTHETIC_LITERATURE_CAFFEINE',
  }),
  totalPolyphenolsFraction: createValueWithOrigin(22.0, 'literature', '%', {
    citation: 'SYNTHETIC_LITERATURE_POLYPHENOLS',
  }),
  theanineFraction: createValueWithOrigin(2.5, 'literature', '%', {
    citation: 'SYNTHETIC_LITERATURE_THEANINE',
  }),
  isCustom: true,
};

function createTestLazyMugSession(
  overrides: Partial<LazyMugSessionConfig> = {}
): LazyMugSessionConfig {
  let initialWaterVolumeMl: number = overrides.initialWaterVolumeMl ?? 250.0;
  if (
    overrides.initialWaterVolumeMl === undefined &&
    overrides.timelineEvents &&
    overrides.timelineEvents.length > 0 &&
    overrides.timelineEvents[0].type === 'initial_pour' &&
    typeof (overrides.timelineEvents[0] as any).waterVolumeMl === 'number'
  ) {
    initialWaterVolumeMl = (overrides.timelineEvents[0] as any).waterVolumeMl;
  }

  const events: LazyMugTimelineEvent[] = overrides.timelineEvents ?? [
    {
      type: 'initial_pour',
      timestampSeconds: 0,
      waterVolumeMl: initialWaterVolumeMl,
      waterTemperatureC: 85.0,
    },
    {
      type: 'sip_consumption',
      timestampSeconds: 60,
      consumedVolumeMl: 80.0,
    },
    {
      type: 'water_refill',
      timestampSeconds: 120,
      addedWaterVolumeMl: 70.0,
      addedWaterTemperatureC: 85.0,
    },
    {
      type: 'session_end',
      timestampSeconds: 180,
    },
  ];

  return {
    methodId: 'lazy_mug',
    teaId: 'synthetic-lazy-mug-test-tea',
    vessel: DEFAULT_VESSELS[2], // Боросиликатная кружка 350 мл
    leafMassGrams: 3.0,
    waterProfile: DEFAULT_WATER_PROFILES[0],
    baseWaterTemperatureC: 85.0,
    initialWaterVolumeMl,
    timelineEvents: events,
    scenarioType: 'preset_assumption',
    ...overrides,
  };
}

const DEFAULT_OPTIONS: LazyMugWaterBalanceOptions = {
  assumedWaterDensityGPerMl: 1.0,
};

/**
 * Тестовый набор для верификации водного баланса метода Lazy Mug (Этап 2B.3.2.2).
 */
export async function runLazyMugWaterBalanceTestSuite(): Promise<TestResult[]> {
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
  // 1. Корректная минимальная сессия: первоначальная заливка и session_end
  // =========================================================================
  {
    const suite = '1. Минимальная сессия Lazy Mug (initial_pour и session_end)';
    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 200.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 200.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 120,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);

    assert(suite, 'Сессия успешно рассчитана со статусом calculated', res.status === 'calculated');
    assert(suite, 'Шкала содержит ровно 2 события', res.events.length === 2);
    assert(suite, 'Событие 0 initial_pour имеет нулевое поглощение', res.events[0].absorbedWaterGrams === 0);
    assert(suite, 'Событие 0 свободная вода равна 200 г', res.events[0].freeWaterMassGrams === 200.0);
    assert(suite, 'Событие 1 session_end фиксирует поглощение > 0', (res.events[1].absorbedWaterGrams ?? 0) > 0);
    assert(
      suite,
      'Сумма поглощённой и свободной воды на session_end равна 200 г',
      Math.abs((res.events[1].absorbedWaterGrams ?? 0) + (res.events[1].freeWaterMassGrams ?? 0) - 200.0) < 1e-12
    );
    assert(suite, 'Выпитый объём в минимальной сессии равен 0', res.totalConsumedWaterVolumeMl === 0);
    assert(
      suite,
      'Невязка материального баланса всей сессии строго ~0',
      (res.sessionMassConservationDeltaGrams ?? 1) < 1e-12
    );
  }

  // =========================================================================
  // 2. Кинетика гидратации листа за временной интервал и свободная вода
  // =========================================================================
  {
    const suite = '2. Аналитическая точность гидратации листа за интервал времени';
    const leafMass = 3.0; // г
    const maxRatio = 2.5; // г/г -> m_max = 7.5 г
    const k = 0.02; // s^-1
    const dt = 60; // с -> m_abs = 7.5 * (1 - exp(-0.02 * 60)) = 7.5 * (1 - exp(-1.2))
    const expectedAbs = leafMass * maxRatio * (1 - Math.exp(-k * dt));

    const session = createTestLazyMugSession({
      leafMassGrams: leafMass,
      initialWaterVolumeMl: 250.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 250.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'session_end',
          timestampSeconds: dt,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    const endEvt = res.events[1];

    assert(
      suite,
      'Поглощённая масса листа точно совпадает с аналитическим уравнением первого порядка',
      Math.abs((endEvt.absorbedWaterGrams ?? 0) - expectedAbs) < 1e-6
    );
    assert(
      suite,
      'Свободная вода уменьшается в точности на величину поглощения',
      Math.abs((endEvt.freeWaterMassGrams ?? 0) - (250.0 - expectedAbs)) < 1e-6
    );
  }

  // =========================================================================
  // 3. Отпивание уменьшает свободную воду, но не уменьшает влагу листа
  // =========================================================================
  {
    const suite = '3. Инвариант отпивания (sip_consumption)';
    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 250.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 250.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 60,
          consumedVolumeMl: 100.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 120,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    const sipEvt = res.events[1];
    const endEvt = res.events[2];

    assert(suite, 'Отпивание регистрирует выпитый объём 100 мл', sipEvt.consumedWaterVolumeMl === 100.0);
    assert(suite, 'Поглощённая листом масса на момент отпивания положительна', (sipEvt.absorbedWaterGrams ?? 0) > 0);
    assert(
      suite,
      'Влага в листе не уменьшается после отпивания, а продолжает монотонно расти',
      (endEvt.absorbedWaterGrams ?? 0) > (sipEvt.absorbedWaterGrams ?? 0)
    );
    assert(
      suite,
      'Свободная вода после отпивания уменьшена на 100 г плюс поглощение листа',
      Math.abs((sipEvt.freeWaterMassGrams ?? 0) - (250.0 - (sipEvt.absorbedWaterGrams ?? 0) - 100.0)) < 1e-12
    );
  }

  // =========================================================================
  // 4. Долив увеличивает свободную воду, гидратация продолжается на следующем шаге
  // =========================================================================
  {
    const suite = '4. Инвариант долива свежей воды (water_refill)';
    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 200.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 200.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'water_refill',
          timestampSeconds: 60,
          addedWaterVolumeMl: 100.0,
          addedWaterTemperatureC: 90.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 120,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    const refillEvt = res.events[1];
    const endEvt = res.events[2];

    assert(suite, 'Долив регистрирует добавление 100 мл', refillEvt.addedWaterVolumeMl === 100.0);
    assert(
      suite,
      'Свободная вода после долива увеличивается на 100 г',
      Math.abs(
        (refillEvt.freeWaterMassGrams ?? 0) -
          (200.0 - (refillEvt.absorbedWaterGrams ?? 0) + 100.0)
      ) < 1e-12
    );
    assert(
      suite,
      'Лист продолжает поглощать воду на интервале после долива',
      (endEvt.absorbedWaterGrams ?? 0) > (refillEvt.absorbedWaterGrams ?? 0)
    );
    assert(suite, 'Общий объём добавленной воды равен 300 мл', res.totalAddedWaterVolumeMl === 300.0);
  }

  // =========================================================================
  // 5. Несколько циклов «гидратация → отпивание → долив»
  // =========================================================================
  {
    const suite = '5. Циклический процесс Lazy Mug (гидратация - отпивание - долив)';
    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 250.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 250.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 60,
          consumedVolumeMl: 80.0,
        },
        {
          type: 'water_refill',
          timestampSeconds: 120,
          addedWaterVolumeMl: 70.0,
          addedWaterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 180,
          consumedVolumeMl: 100.0,
        },
        {
          type: 'water_refill',
          timestampSeconds: 240,
          addedWaterVolumeMl: 60.0,
          addedWaterTemperatureC: 85.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 300,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);

    assert(suite, 'Сессия успешно рассчитана со статусом calculated', res.status === 'calculated');
    assert(suite, 'Всего добавлено 380 мл воды (250 + 70 + 60)', res.totalAddedWaterVolumeMl === 380.0);
    assert(suite, 'Всего выпито 180 мл воды (80 + 100)', res.totalConsumedWaterVolumeMl === 180.0);

    // Монотонность поглощения листа
    let monotonic = true;
    for (let i = 1; i < res.events.length; i++) {
      const prevAbs = res.events[i - 1].absorbedWaterGrams ?? 0;
      const currAbs = res.events[i].absorbedWaterGrams ?? 0;
      if (currAbs < prevAbs) {
        monotonic = false;
        break;
      }
    }
    assert(suite, 'Поглощённая листом влага строго монотонно возрастает по ходу сессии', monotonic);
  }

  // =========================================================================
  // 6. Баланс массы на каждом рассчитанном событии и на всей сессии
  // =========================================================================
  {
    const suite = '6. Закон сохранения массы в Lazy Mug';
    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 250.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 250.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 60,
          consumedVolumeMl: 80.0,
        },
        {
          type: 'water_refill',
          timestampSeconds: 120,
          addedWaterVolumeMl: 70.0,
          addedWaterTemperatureC: 85.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 180,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);

    let allEventsPreserved = true;
    for (const evt of res.events) {
      if ((evt.massConservationDeltaGrams ?? 1) > 1e-12) {
        allEventsPreserved = false;
        break;
      }
    }
    assert(suite, 'Баланс массы сохраняется на каждом событии с точностью < 1e-12 г', allEventsPreserved);
    assert(
      suite,
      'Глобальная невязка баланса массы сессии строго ~0 (< 1e-12 г)',
      (res.sessionMassConservationDeltaGrams ?? 1) < 1e-12
    );
    assert(
      suite,
      'm_added = m_abs_final + m_free_final + m_consumed',
      Math.abs(
        res.totalAddedWaterMassGrams -
          ((res.finalAbsorbedWaterGrams ?? 0) +
            (res.finalFreeWaterMassGrams ?? 0) +
            (res.totalConsumedWaterMassGrams ?? 0))
      ) < 1e-12
    );
  }

  // =========================================================================
  // 7. Отпивание, превышающее фактически доступную свободную воду
  // =========================================================================
  {
    const suite = '7. Контроль превышения доступной свободной воды при отпивании';

    // 7.1 Отпивание больше номинального залива
    let caughtHugeSip = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 200.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 250.0, // больше, чем налито
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'SIP_EXCEEDS_AVAILABLE_FREE_WATER') {
        caughtHugeSip = true;
      }
    }
    assert(suite, 'Отпивание 250 мл при заливе 200 мл отклоняется с SIP_EXCEEDS_AVAILABLE_FREE_WATER', caughtHugeSip);

    // 7.2 Отпивание в точности 200 мл при заливе 200 мл, когда часть воды уже поглощена листом
    let caughtBorderSip = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 200.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 200.0, // формально равно начальной заливке, но лист поглотил ~5 мл!
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'SIP_EXCEEDS_AVAILABLE_FREE_WATER') {
        caughtBorderSip = true;
      }
    }
    assert(
      suite,
      'Попытка выпить 200 мл при поглощении части воды листом отклоняется с SIP_EXCEEDS_AVAILABLE_FREE_WATER',
      caughtBorderSip
    );
  }

  // =========================================================================
  // 8. Контроль вместимости кружки (первоначальная заливка и доливы)
  // =========================================================================
  {
    const suite = '8. Контроль вместимости сосуда в Lazy Mug (VESSEL_CAPACITY_EXCEEDED)';

    // 8.1 Первоначальная заливка больше вместимости кружки (360 > 350 мл)
    let caughtInitialOverflow = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 360.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 360.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtInitialOverflow = true;
      }
    }
    assert(suite, 'Начальная заливка 360 мл в кружку 350 мл отклоняется с VESSEL_CAPACITY_EXCEEDED', caughtInitialOverflow);

    // 8.2 Долив сам по себе больше вместимости (360 > 350 мл)
    let caughtDirectRefillOverflow = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 100.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 100.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: 360.0, // одиночный долив больше сосуда
            addedWaterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtDirectRefillOverflow = true;
      }
    }
    assert(suite, 'Одиночный долив 360 мл в кружку 350 мл отклоняется с VESSEL_CAPACITY_EXCEEDED', caughtDirectRefillOverflow);

    // 8.3 Суммарное переполнение при доливе (250 - ~5 + 150 = 395 > 350 мл)
    let caughtSumOverflow = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 250.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 250.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: 150.0, // 245 + 150 = 395 > 350 мл
            addedWaterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtSumOverflow = true;
      }
    }
    assert(suite, 'Суммарное переполнение при доливе (395 > 350 мл) отклоняется с VESSEL_CAPACITY_EXCEEDED', caughtSumOverflow);
  }

  // =========================================================================
  // 9. Строгая валидация типов, недопустимых объёмов и температур
  // =========================================================================
  {
    const suite = '9. Строгая валидация параметров и физических границ';

    // 9.1 Недопустимая температура заливки (< 0 или > 100)
    let caughtNegTemp = false;
    let caughtOverTemp = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 250.0,
            waterTemperatureC: -5.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtNegTemp = true;
      }
    }
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 250.0,
            waterTemperatureC: 105.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtOverTemp = true;
      }
    }
    assert(suite, 'Температуры заливки < 0 и > 100 отклоняются с INVALID_WATER_TEMPERATURE', caughtNegTemp && caughtOverTemp);

    // 9.2 undefined, null, NaN, Infinity для температуры долива
    let caughtUndefinedTemp = false;
    let caughtNullTemp = false;
    let caughtNaNTemp = false;
    let caughtInfTemp = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: 50.0,
            addedWaterTemperatureC: undefined as any,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtUndefinedTemp = true;
      }
    }
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: 50.0,
            addedWaterTemperatureC: null as any,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtNullTemp = true;
      }
    }
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: 50.0,
            addedWaterTemperatureC: NaN,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtNaNTemp = true;
      }
    }
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: 50.0,
            addedWaterTemperatureC: Infinity,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtInfTemp = true;
      }
    }
    assert(
      suite,
      'undefined, null, NaN, Infinity для температуры долива отклоняются с INVALID_WATER_TEMPERATURE',
      caughtUndefinedTemp && caughtNullTemp && caughtNaNTemp && caughtInfTemp
    );

    // 9.3 Отрицательный или нулевой объём отпивания
    let caughtZeroSip = false;
    let caughtNegSip = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 0,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_SIP_VOLUME') {
        caughtZeroSip = true;
      }
    }
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: -10,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_SIP_VOLUME') {
        caughtNegSip = true;
      }
    }
    assert(suite, 'Нулевой и отрицательный объём отпивания отклоняются с INVALID_SIP_VOLUME', caughtZeroSip && caughtNegSip);

    // 9.4 Отрицательный объём долива
    let caughtNegRefill = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 60,
            addedWaterVolumeMl: -50.0,
            addedWaterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_REFILL_VOLUME') {
        caughtNegRefill = true;
      }
    }
    assert(suite, 'Отрицательный объём долива отклоняется с INVALID_REFILL_VOLUME', caughtNegRefill);
  }

  // =========================================================================
  // 10. Граничные температуры 0 °C и 100 °C принимаются
  // =========================================================================
  {
    const suite = '10. Допустимость граничных температур 0 °C и 100 °C';

    const session0 = createTestLazyMugSession({
      initialWaterVolumeMl: 200.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 200.0,
          waterTemperatureC: 0.0,
        },
        {
          type: 'water_refill',
          timestampSeconds: 60,
          addedWaterVolumeMl: 50.0,
          addedWaterTemperatureC: 100.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 120,
        },
      ],
    });

    const res0 = simulateLazyMugWaterBalance(session0, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    assert(suite, 'Температуры 0 °C и 100 °C успешно принимаются и рассчитываются', res0.status === 'calculated');
  }

  // =========================================================================
  // 11. Нарушения структуры временной шкалы
  // =========================================================================
  {
    const suite = '11. Структурная валидация временной шкалы Lazy Mug';

    // 11.1 Отсутствует initial_pour на первом месте
    let caughtMissingInitial = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'sip_consumption',
            timestampSeconds: 0,
            consumedVolumeMl: 50.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
        ] as any,
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_INITIAL_EVENT') {
        caughtMissingInitial = true;
      }
    }
    assert(suite, 'Первое событие без initial_pour отклоняется с INVALID_INITIAL_EVENT', caughtMissingInitial);

    // 11.2 Временная метка первого события != 0
    let caughtNonZeroInitialTime = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 10,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_INITIAL_TIMESTAMP') {
        caughtNonZeroInitialTime = true;
      }
    }
    assert(suite, 'initial_pour с timestamp != 0 отклоняется с INVALID_INITIAL_TIMESTAMP', caughtNonZeroInitialTime);

    // 11.3 Повторный initial_pour
    let caughtDuplicateInitial = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'initial_pour',
            timestampSeconds: 60,
            waterVolumeMl: 100.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 120,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'DUPLICATE_INITIAL_POUR') {
        caughtDuplicateInitial = true;
      }
    }
    assert(suite, 'Повторный initial_pour отклоняется с DUPLICATE_INITIAL_POUR', caughtDuplicateInitial);

    // 11.4 Завершающее событие не session_end
    let caughtMissingSessionEnd = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 50.0,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_FINAL_EVENT') {
        caughtMissingSessionEnd = true;
      }
    }
    assert(suite, 'Шкала без session_end в конце отклоняется с INVALID_FINAL_EVENT', caughtMissingSessionEnd);

    // 11.5 Событие после session_end
    let caughtEventAfterEnd = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 120,
            consumedVolumeMl: 50.0,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'EVENT_AFTER_SESSION_END') {
        caughtEventAfterEnd = true;
      }
    }
    assert(suite, 'Событие после session_end отклоняется с EVENT_AFTER_SESSION_END', caughtEventAfterEnd);

    // 11.6 Нарушение монотонности времени (t_i <= t_i-1)
    let caughtNonMonotonic = false;
    try {
      const session = createTestLazyMugSession({
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 50.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 50, // время пошло назад
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'TIMELINE_CHRONOLOGY_ERROR') {
        caughtNonMonotonic = true;
      }
    }
    assert(suite, 'Убывающие временные метки отклоняются с TIMELINE_CHRONOLOGY_ERROR', caughtNonMonotonic);
  }

  // =========================================================================
  // 12. Несогласованность session.initialWaterVolumeMl и timelineEvents[0]
  // =========================================================================
  {
    const suite = '12. Согласованность начального объёма воды';
    let caughtInconsistency = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 200.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 250.0, // не совпадает с initialWaterVolumeMl
            waterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 60,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INCONSISTENT_INITIAL_VOLUME') {
        caughtInconsistency = true;
      }
    }
    assert(
      suite,
      'Несовпадение session.initialWaterVolumeMl и timelineEvents[0].waterVolumeMl отклоняется с INCONSISTENT_INITIAL_VOLUME',
      caughtInconsistency
    );
  }

  // =========================================================================
  // 13. Неизвестная кинетика: unknown_hydration_profile и блокировка
  // =========================================================================
  {
    const suite = '13. Неизвестная кинетика гидратации (Unknown ≠ 0)';
    const teaWithUnknownRate: TeaSample = {
      ...SYNTHETIC_LAZY_MUG_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1'),
    };

    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 200.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 200.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 60,
          consumedVolumeMl: 50.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 120,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, teaWithUnknownRate, DEFAULT_OPTIONS);

    assert(suite, 'Сессия имеет статус unknown_hydration_profile', res.status === 'unknown_hydration_profile');
    assert(suite, 'Событие 0 initial_pour рассчитано (status calculated)', res.events[0].status === 'calculated');
    assert(
      suite,
      'Событие 1 (t = 60 с) получило статус unknown_hydration_profile',
      res.events[1].status === 'unknown_hydration_profile'
    );
    assert(
      suite,
      'Событие 2 (t = 120 с) получило статус blocked_by_unknown_prior_state',
      res.events[2].status === 'blocked_by_unknown_prior_state'
    );
    assert(suite, 'Зависимые финальные величины равны null', res.finalAbsorbedWaterGrams === null);
    assert(suite, 'Финальная свободная вода равна null', res.finalFreeWaterVolumeMl === null);
    assert(suite, 'Суммарный выпитый объём равен null', res.totalConsumedWaterVolumeMl === null);
    assert(suite, 'Глобальная невязка равна null', res.sessionMassConservationDeltaGrams === null);
  }

  // =========================================================================
  // 14. Независимая проверка поздних событий при неизвестном состоянии
  // =========================================================================
  {
    const suite = '14. Валидация независимых полей до ветки блокировки';
    const teaWithUnknownRate: TeaSample = {
      ...SYNTHETIC_LAZY_MUG_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1'),
    };

    // Переполнение одиночным доливом на шаге 2 должно быть выявлено до блокировки
    let caughtRefillOverflowOnUnknown = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 200.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 50.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 120,
            addedWaterVolumeMl: 400.0, // больше вместимости сосуда 350 мл!
            addedWaterTemperatureC: 85.0,
          },
          {
            type: 'session_end',
            timestampSeconds: 180,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, teaWithUnknownRate, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'VESSEL_CAPACITY_EXCEEDED') {
        caughtRefillOverflowOnUnknown = true;
      }
    }
    assert(
      suite,
      'Переполнение доливом на шаге 2 отклоняется с VESSEL_CAPACITY_EXCEEDED даже при неизвестной кинетике на шаге 1',
      caughtRefillOverflowOnUnknown
    );

    // Невалидная температура долива (-10 °C) должна быть выявлена до блокировки
    let caughtInvalidTempOnUnknown = false;
    try {
      const session = createTestLazyMugSession({
        initialWaterVolumeMl: 200.0,
        timelineEvents: [
          {
            type: 'initial_pour',
            timestampSeconds: 0,
            waterVolumeMl: 200.0,
            waterTemperatureC: 85.0,
          },
          {
            type: 'sip_consumption',
            timestampSeconds: 60,
            consumedVolumeMl: 50.0,
          },
          {
            type: 'water_refill',
            timestampSeconds: 120,
            addedWaterVolumeMl: 50.0,
            addedWaterTemperatureC: -10.0, // невалидная температура
          },
          {
            type: 'session_end',
            timestampSeconds: 180,
          },
        ],
      });
      simulateLazyMugWaterBalance(session, teaWithUnknownRate, DEFAULT_OPTIONS);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_WATER_TEMPERATURE') {
        caughtInvalidTempOnUnknown = true;
      }
    }
    assert(
      suite,
      'Невалидная температура долива на шаге 2 отклоняется с INVALID_WATER_TEMPERATURE до ветки блокировки',
      caughtInvalidTempOnUnknown
    );
  }

  // =========================================================================
  // 15. Явная нулевая константа скорости гидратации (k = 0)
  // =========================================================================
  {
    const suite = '15. Явная нулевая константа скорости (k = 0)';
    const teaWithZeroRate: TeaSample = {
      ...SYNTHETIC_LAZY_MUG_TEST_TEA,
      hydrationRateConstantPerSecond: createValueWithOrigin(0.0, 'measured', 's^-1', {
        measurementMethod: 'SYNTHETIC_ZERO_RATE_TEST',
      }),
    };

    const session = createTestLazyMugSession({
      initialWaterVolumeMl: 200.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 200.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 60,
          consumedVolumeMl: 50.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 120,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(session, teaWithZeroRate, DEFAULT_OPTIONS);

    assert(suite, 'Сессия с k = 0 имеет статус calculated (а не unknown)', res.status === 'calculated');
    assert(suite, 'Поглощённая листом влага строго равна 0 г', res.finalAbsorbedWaterGrams === 0.0);
    assert(suite, 'Оставшаяся свободная вода в точности равна 150 мл (200 - 50)', res.finalFreeWaterVolumeMl === 150.0);
    assert(
      suite,
      'Невязка материального баланса сессии строго ~0',
      (res.sessionMassConservationDeltaGrams ?? 1) < 1e-12
    );
  }

  // =========================================================================
  // 16. Все 6 эталонных чаёв каталога дают unknown_hydration_profile
  // =========================================================================
  {
    const suite = '16. Совместимость с каталогом REFERENCE_TEAS в Lazy Mug';

    let allReferenceTeasBlocked = true;
    for (const tea of REFERENCE_TEAS) {
      const session = createTestLazyMugSession({ teaId: tea.id });
      const res = simulateLazyMugWaterBalance(session, tea, DEFAULT_OPTIONS);

      if (
        res.status !== 'unknown_hydration_profile' ||
        res.events[0].status !== 'calculated' ||
        res.events[1].status !== 'unknown_hydration_profile' ||
        res.finalAbsorbedWaterGrams !== null ||
        res.sessionMassConservationDeltaGrams !== null
      ) {
        allReferenceTeasBlocked = false;
        break;
      }
    }

    assert(
      suite,
      'Все 6 эталонных чаёв каталога честно возвращают unknown_hydration_profile и блокируют зависимые шаги',
      allReferenceTeasBlocked
    );
  }

  // =========================================================================
  // 17. Пустое состояние свободной жидкости (исчерпание свободной воды)
  // =========================================================================
  {
    const suite = '17. Исчерпание свободной жидкости и последующий долив';

    // Подбираем сценарий:
    // Лист поглощает воду за 60 с.
    // В момент 60 с пользователь выпивает ВСЮ оставшуюся свободную воду.
    // Свободная вода становится 0 мл.
    // За интервал 60-120 с гидратация должна дать 0 поглощения (нет свободной воды).
    // В момент 120 с пользователь доливает 150 мл.
    // Свободная вода становится 150 мл.
    // На интервале 120-180 с гидратация возобновляется!
    // В момент 180 с сессия завершается.

    // Сначала смотрим, сколько лист поглотит за 60 с при начальной заливке 50 мл
    const preCheckSession = createTestLazyMugSession({
      initialWaterVolumeMl: 50.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 50.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 60,
        },
      ],
    });
    const preRes = simulateLazyMugWaterBalance(preCheckSession, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);
    const freeAt60 = preRes.finalFreeWaterVolumeMl!;

    // Теперь пользователь выпивает ровно этот объём freeAt60
    const emptySession = createTestLazyMugSession({
      initialWaterVolumeMl: 50.0,
      timelineEvents: [
        {
          type: 'initial_pour',
          timestampSeconds: 0,
          waterVolumeMl: 50.0,
          waterTemperatureC: 85.0,
        },
        {
          type: 'sip_consumption',
          timestampSeconds: 60,
          consumedVolumeMl: freeAt60,
        },
        {
          type: 'water_refill',
          timestampSeconds: 120,
          addedWaterVolumeMl: 150.0,
          addedWaterTemperatureC: 85.0,
        },
        {
          type: 'session_end',
          timestampSeconds: 180,
        },
      ],
    });

    const res = simulateLazyMugWaterBalance(emptySession, SYNTHETIC_LAZY_MUG_TEST_TEA, DEFAULT_OPTIONS);

    const sipEvt = res.events[1];
    const refillEvt = res.events[2];
    const endEvt = res.events[3];

    assert(suite, 'После полного отпивания свободная вода равна 0 мл', (sipEvt.freeWaterVolumeMl ?? 1) === 0);
    assert(
      suite,
      'На интервале с нулевой свободной водой влага листа не меняется',
      (refillEvt.hydrationStepResult?.actualAbsorbedGrams ?? 1) === 0
    );
    assert(
      suite,
      'После долива 150 мл свободная вода становится 150 мл',
      (refillEvt.freeWaterVolumeMl ?? 0) === 150.0
    );
    assert(
      suite,
      'После долива гидратация успешно возобновляется на интервале 120-180 с',
      (endEvt.absorbedWaterGrams ?? 0) > (refillEvt.absorbedWaterGrams ?? 0)
    );
    assert(
      suite,
      'Баланс массы сохраняется строго на протяжении всего сценария исчерпания и долива (< 1e-12 г)',
      (res.sessionMassConservationDeltaGrams ?? 1) < 1e-12
    );
  }

  return results;
}
