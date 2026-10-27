/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  calculateSaturationHydrationRequested,
  stepHydrationKinetics,
  HydrationKineticsStepParams,
  WaterBalanceValidationError,
} from '../engine/water-balance/index.ts';
import { createValueWithOrigin, ValueWithOrigin } from '../domain/tea/types.ts';
import { REFERENCE_TEAS } from '../data/referenceTeas.ts';
import type { TestResult } from './domain.test.ts';

/**
 * Тестовый набор для кинетической модели гидратации чайного листа (Этап 2B.2).
 */
export async function runHydrationKineticsTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // Набор 1: Аналитическая формула насыщения первого порядка
  {
    const suite = '1. Аналитическая кинетическая формула (calculateSaturationHydrationRequested)';

    // 1.1 Точное совпадение с теоретическим значением
    // m_dry = 5.0 г, R_max = 2.5 г/г -> m_max = 12.5 г
    // m_abs = 0.0 г, k_hyd = 0.05 с^-1, dt = 20 с
    // dM = 12.5 * (1 - exp(-0.05 * 20)) = 12.5 * (1 - exp(-1)) = 12.5 * (1 - 1/e) ~= 7.901507 г
    const req1 = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.05, 20.0);
    const expected1 = 12.5 * (1 - Math.exp(-1.0));
    assert(
      suite,
      'Аналитическая формула даёт точное значение поглощения при m_abs=0: 7.9015... г',
      Math.abs(req1 - expected1) < 1e-9
    );

    // 1.2 Расчёт при ненулевом исходном содержании воды
    // m_abs = 5.0 г, дефицит = 7.5 г
    // k = 0.1 с^-1, dt = 10 с -> factor = (1 - exp(-1))
    const req2 = calculateSaturationHydrationRequested(5.0, 5.0, 2.5, 0.1, 10.0);
    const expected2 = 7.5 * (1 - Math.exp(-1.0));
    assert(
      suite,
      'Поглощение пропорционально текущему дефициту влагоёмкости (m_max - m_abs)',
      Math.abs(req2 - expected2) < 1e-9
    );

    // 1.3 Нулевая длительность dt = 0
    const reqZeroDt = calculateSaturationHydrationRequested(5.0, 2.0, 2.5, 0.05, 0.0);
    assert(suite, 'При нулевой длительности контакта запрошенное поглощение строго 0 г', reqZeroDt === 0);

    // 1.4 Нулевая константа скорости k = 0
    const reqZeroK = calculateSaturationHydrationRequested(5.0, 2.0, 2.5, 0.0, 30.0);
    assert(suite, 'При константе скорости k=0 запрошенное поглощение строго 0 г', reqZeroK === 0);

    // 1.5 Уже насыщенный лист
    const reqSaturated = calculateSaturationHydrationRequested(5.0, 12.5, 2.5, 0.05, 30.0);
    assert(suite, 'Для полностью насыщенного листа (m_abs = m_max) поглощение строго 0 г', reqSaturated === 0);
  }

  // Набор 2: Физические свойства (монотонность, асимптотика, свойство полугруппы)
  {
    const suite = '2. Физические свойства кинетики гидратации';

    // 2.1 Строгая монотонность по времени контакта (dt1 < dt2 < dt3)
    const m10 = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.03, 10.0);
    const m20 = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.03, 20.0);
    const m40 = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.03, 40.0);
    assert(
      suite,
      'Поглощение строго монотонно возрастает по времени контакта (m(10) < m(20) < m(40))',
      m10 < m20 && m20 < m40
    );

    // 2.2 Строгая монотонность по константе скорости (k1 < k2 < k3)
    const mkSlow = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.01, 20.0);
    const mkMed = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.04, 20.0);
    const mkFast = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.10, 20.0);
    assert(
      suite,
      'Поглощение строго монотонно возрастает по константе скорости при фиксированном времени',
      mkSlow < mkMed && mkMed < mkFast
    );

    // 2.3 Асимптотическая сходимость к m_max при t -> infinity
    const mAsymptotic = calculateSaturationHydrationRequested(5.0, 0.0, 2.5, 0.05, 10000.0);
    assert(
      suite,
      'При t -> бесконечности поглощение асимптотически приближается к предельной влагоёмкости 12.5 г',
      Math.abs(mAsymptotic - 12.5) < 1e-6 && mAsymptotic <= 12.5
    );

    // 2.4 Свойство полугруппы (два последовательных шага дают точно такой же результат, как один суммарный)
    const dtA = 12.0;
    const dtB = 18.0;
    const dtSum = dtA + dtB;
    const k = 0.04;
    // Один суммарный шаг
    const singleStepAbs = calculateSaturationHydrationRequested(4.0, 0.0, 2.8, k, dtSum);
    // Два последовательных шага
    const step1Abs = calculateSaturationHydrationRequested(4.0, 0.0, 2.8, k, dtA);
    const step2Abs = calculateSaturationHydrationRequested(4.0, step1Abs, 2.8, k, dtB);
    const twoStepTotal = step1Abs + step2Abs;
    assert(
      suite,
      'Полугрупповое свойство: 2 последовательных шага (12с + 18с) аналитически равны одному шагу (30с)',
      Math.abs(singleStepAbs - twoStepTotal) < 1e-9
    );
  }

  // Набор 3: Интеграция с материальным балансом сосуда через stepHydrationKinetics
  {
    const suite = '3. Интеграция шага кинетики с материальным балансом (stepHydrationKinetics)';

    const validRateConstant: ValueWithOrigin<number> = createValueWithOrigin(
      0.05,
      'literature',
      's^-1',
      {
        citation: 'Zhang et al., 2021. Moisture sorption kinetics of tea leaves. J Food Sci.',
      }
    );

    const validCapacity: ValueWithOrigin<number> = createValueWithOrigin(
      2.5,
      'literature',
      'г/г',
      {
        citation: 'ISO 1572: Tea — Determination of moisture content and absorption.',
      }
    );

    // 3.1 Штатный расчёт без ограничений
    const resNormal = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: validCapacity,
      hydrationRateConstant: validRateConstant,
      durationSeconds: 20.0,
    });

    assert(suite, 'Статус расчёта равен "calculated"', resNormal.status === 'calculated');
    assert(
      suite,
      'Запрошенная масса поглощения совпадает с аналитической формулой (~7.9015 г)',
      resNormal.requestedAbsorptionGrams !== null &&
        Math.abs(resNormal.requestedAbsorptionGrams - 12.5 * (1 - Math.exp(-1.0))) < 1e-9
    );
    assert(
      suite,
      'Фактически поглощённая масса равна запрошенной при избытке свободной воды',
      resNormal.actualAbsorbedGrams === resNormal.requestedAbsorptionGrams
    );
    assert(
      suite,
      'Количество свободной воды уменьшилось строго на величину поглощения: 100 - actual',
      resNormal.newFreeWaterGrams !== null &&
        Math.abs(resNormal.newFreeWaterGrams - (100.0 - (resNormal.actualAbsorbedGrams ?? 0))) < 1e-12
    );
    assert(
      suite,
      'Закон сохранения массы строго выполняется (невязка = 0)',
      Math.abs(resNormal.massConservationDeltaGrams ?? 1) < 1e-12
    );
    assert(
      suite,
      'Ограничивающий фактор "unconstrained"',
      resNormal.limitingFactor === 'unconstrained'
    );

    // 3.2 Ограничение доступной свободной водой в сосуде
    const resLimitedByWater = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 3.0, // Доступно только 3 г воды, а кинетика запросит 7.9 г
      maxAbsorptionRatio: validCapacity,
      hydrationRateConstant: validRateConstant,
      durationSeconds: 20.0,
    });

    assert(
      suite,
      'Поглощение ограничено доступной водой (3 г вместо 7.9 г)',
      resLimitedByWater.actualAbsorbedGrams === 3.0
    );
    assert(
      suite,
      'Свободная вода полностью исчерпана до 0 г',
      resLimitedByWater.newFreeWaterGrams === 0.0
    );
    assert(
      suite,
      'Фактор ограничения "limited_by_available_free_water"',
      resLimitedByWater.limitingFactor === 'limited_by_available_free_water'
    );
    assert(
      suite,
      'Закон сохранения массы соблюдён при ограничении водой',
      Math.abs(resLimitedByWater.massConservationDeltaGrams ?? 1) < 1e-12
    );

    // 3.3 Ограничение остаточной влагоёмкостью листа
    const resLimitedByCapacity = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 12.0, // До m_max (12.5) остался лишь 0.5 г
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: validCapacity,
      hydrationRateConstant: validRateConstant,
      durationSeconds: 20.0, // Кинетика от дефицита 0.5 запросит 0.5 * (1 - 1/e) ~= 0.316 г
    });
    assert(
      suite,
      'При дефиците 0.5 г запрошено ~0.316 г и успешно поглощено',
      resLimitedByCapacity.actualAbsorbedGrams !== null &&
        Math.abs(resLimitedByCapacity.actualAbsorbedGrams - 0.5 * (1 - Math.exp(-1.0))) < 1e-9
    );

    // 3.4 Случай явного нулевого k = 0
    const zeroRateConst: ValueWithOrigin<number> = createValueWithOrigin(0.0, 'measured', 's^-1', {
      measurementMethod: 'Static vapor test at T_0',
      sampleInfo: 'Batch-X',
    });
    const resZeroK = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 2.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: validCapacity,
      hydrationRateConstant: zeroRateConst,
      durationSeconds: 30.0,
    });
    assert(
      suite,
      'Явное нулевое k=0 возвращает calculated статус, requested=0, actual=0, limitingFactor=zero_requested',
      resZeroK.status === 'calculated' &&
        resZeroK.requestedAbsorptionGrams === 0 &&
        resZeroK.actualAbsorbedGrams === 0 &&
        resZeroK.limitingFactor === 'zero_requested'
    );
  }

  // Набор 4: Неизвестные параметры (Unknown ≠ 0)
  {
    const suite = '4. Обработка неизвестных параметров (Unknown ≠ 0)';

    const validCapacity: ValueWithOrigin<number> = createValueWithOrigin(
      2.5,
      'literature',
      'г/г',
      { citation: 'ISO 1572' }
    );

    // 4.1 Неизвестная константа скорости гидратации
    const unknownRateConst: ValueWithOrigin<number> = createValueWithOrigin<number>(
      null,
      'unknown',
      's^-1',
      { sourceNotes: 'Не измерено' }
    );
    const resUnknownK = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: validCapacity,
      hydrationRateConstant: unknownRateConst,
      durationSeconds: 20.0,
    });

    assert(
      suite,
      'Неизвестное k возвращает статус unknown_hydration_profile',
      resUnknownK.status === 'unknown_hydration_profile'
    );
    assert(
      suite,
      'Запрошенная и фактическая масса строго null (не подменяются нулём)',
      resUnknownK.requestedAbsorptionGrams === null &&
        resUnknownK.actualAbsorbedGrams === null &&
        resUnknownK.newAbsorbedWaterGrams === null
    );
    assert(
      suite,
      'Возвращается информативное пояснение на русском языке с отсылкой к Unknown ≠ 0',
      typeof resUnknownK.reason === 'string' && resUnknownK.reason.includes('Unknown ≠ 0')
    );

    // 4.2 Неизвестная предельная влагоёмкость
    const unknownCapacity: ValueWithOrigin<number> = createValueWithOrigin<number>(
      null,
      'unknown',
      'г/г',
      { sourceNotes: 'Не определено' }
    );
    const validRateConstant: ValueWithOrigin<number> = createValueWithOrigin(0.05, 'model_profile', 's^-1');
    const resUnknownCap = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: unknownCapacity,
      hydrationRateConstant: validRateConstant,
      durationSeconds: 20.0,
    });
    assert(
      suite,
      'Неизвестная влагоёмкость возвращает статус unknown_hydration_profile',
      resUnknownCap.status === 'unknown_hydration_profile' && resUnknownCap.requestedAbsorptionGrams === null
    );

    // 4.3 Проверка всех 6 эталонных чаёв из REFERENCE_TEAS
    // Для всех эталонных чаёв hydrationRateConstantPerSecond должно быть unknown (Unknown ≠ 0)!
    let allReferenceTeasUnknown = true;
    for (const tea of REFERENCE_TEAS) {
      if (
        !tea.hydrationRateConstantPerSecond ||
        tea.hydrationRateConstantPerSecond.origin !== 'unknown' ||
        tea.hydrationRateConstantPerSecond.value !== null
      ) {
        allReferenceTeasUnknown = false;
        break;
      }
      const resTea = stepHydrationKinetics({
        dryLeafMassGrams: 5.0,
        currentAbsorbedWaterGrams: 0.0,
        availableFreeWaterGrams: 100.0,
        maxAbsorptionRatio: tea.waterAbsorptionRatio,
        hydrationRateConstant: tea.hydrationRateConstantPerSecond,
        durationSeconds: 15.0,
      });
      if (resTea.status !== 'unknown_hydration_profile' || resTea.requestedAbsorptionGrams !== null) {
        allReferenceTeasUnknown = false;
        break;
      }
    }
    assert(
      suite,
      'Все 6 эталонных чаёв в REFERENCE_TEAS имеют статус unknown и возвращают unknown_hydration_profile',
      allReferenceTeasUnknown
    );
  }

  // Набор 5: Валидация входных данных и единиц измерения
  {
    const suite = '5. Валидация входных данных и размерностей (строгие ошибки)';

    const validCapacity: ValueWithOrigin<number> = createValueWithOrigin(2.5, 'literature', 'г/г', {
      citation: 'Test',
    });

    // 5.1 Отрицательное k
    let caughtNegativeK = false;
    try {
      const negativeRate = createValueWithOrigin(-0.05, 'literature', 's^-1', { citation: 'Test' });
      stepHydrationKinetics({
        dryLeafMassGrams: 5.0,
        currentAbsorbedWaterGrams: 0.0,
        availableFreeWaterGrams: 100.0,
        maxAbsorptionRatio: validCapacity,
        hydrationRateConstant: negativeRate,
        durationSeconds: 10.0,
      });
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_RATE_CONSTANT') {
        caughtNegativeK = true;
      }
    }
    assert(suite, 'Отрицательная константа скорости k_hyd отклоняется с INVALID_RATE_CONSTANT', caughtNegativeK);

    // 5.2 Отрицательное время контакта dt
    let caughtNegativeDt = false;
    try {
      const validRate = createValueWithOrigin(0.05, 'literature', 's^-1', { citation: 'Test' });
      stepHydrationKinetics({
        dryLeafMassGrams: 5.0,
        currentAbsorbedWaterGrams: 0.0,
        availableFreeWaterGrams: 100.0,
        maxAbsorptionRatio: validCapacity,
        hydrationRateConstant: validRate,
        durationSeconds: -5.0,
      });
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_DURATION') {
        caughtNegativeDt = true;
      }
    }
    assert(suite, 'Отрицательное время dt отклоняется с INVALID_DURATION', caughtNegativeDt);

    // 5.3 Недопустимая единица измерения скорости (например, мл или мин)
    let caughtInvalidUnit = false;
    try {
      const invalidUnitRate = createValueWithOrigin(0.05, 'literature', 'мл', { citation: 'Test' });
      stepHydrationKinetics({
        dryLeafMassGrams: 5.0,
        currentAbsorbedWaterGrams: 0.0,
        availableFreeWaterGrams: 100.0,
        maxAbsorptionRatio: validCapacity,
        hydrationRateConstant: invalidUnitRate,
        durationSeconds: 10.0,
      });
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_UNIT') {
        caughtInvalidUnit = true;
      }
    }
    assert(suite, 'Несовместимая единица измерения k (мл) отклоняется с INVALID_UNIT', caughtInvalidUnit);

    // 5.4 Допустимые альтернативные единицы скорости: с^-1 (кириллица), 1/s, 1/с
    const cyrillicRate = createValueWithOrigin(0.05, 'literature', 'с^-1', { citation: 'Test' });
    const resCyrillic = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: validCapacity,
      hydrationRateConstant: cyrillicRate,
      durationSeconds: 10.0,
    });
    assert(suite, 'Кириллическая единица "с^-1" успешно принимается', resCyrillic.status === 'calculated');
  }

  // Набор 6: Аудит происхождения данных и диагностика
  {
    const suite = '6. Аудит метрологического происхождения (diagnostics)';

    // 6.1 Литература без цитаты
    const litNoCitation = createValueWithOrigin(0.05, 'literature', 's^-1');
    const capWithCitation = createValueWithOrigin(2.5, 'literature', 'г/г', { citation: 'ISO 1572' });
    const resLitNoCite = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: capWithCitation,
      hydrationRateConstant: litNoCitation,
      durationSeconds: 10.0,
    });
    const hasCiteWarning = resLitNoCite.diagnostics.some((d) => d.includes('citation') || d.includes('библиографическая'));
    assert(suite, 'Литература без цитаты формирует предупреждение в diagnostics', hasCiteWarning);

    // 6.2 Измерение без методики / образца
    const measuredIncomplete = createValueWithOrigin(0.05, 'measured', 's^-1');
    const resMeasuredInc = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: capWithCitation,
      hydrationRateConstant: measuredIncomplete,
      durationSeconds: 10.0,
    });
    const hasMeasuredWarning = resMeasuredInc.diagnostics.some((d) => d.includes('методики') || d.includes('образца'));
    assert(suite, 'Измерение без методики формирует предупреждение в diagnostics', hasMeasuredWarning);

    // 6.3 Модельный ориентир model_profile
    const modelProfileRate = createValueWithOrigin(0.05, 'model_profile', 's^-1');
    const resModelProfile = stepHydrationKinetics({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 0.0,
      availableFreeWaterGrams: 100.0,
      maxAbsorptionRatio: capWithCitation,
      hydrationRateConstant: modelProfileRate,
      durationSeconds: 10.0,
    });
    const hasModelWarning = resModelProfile.diagnostics.some((d) => d.includes('model_profile'));
    assert(suite, 'model_profile формирует замечание о калибровке в diagnostics', hasModelWarning);
  }

  return results;
}
