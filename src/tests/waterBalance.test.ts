/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  calculateMaxAbsorbedWater,
  applyWaterAbsorption,
  solveLiquorDrain,
  addWater,
  consumeFreeWater,
  convertVolumeToMass,
  convertMassToVolume,
  DEFAULT_ASSUMED_WATER_DENSITY_G_PER_ML,
  WaterBalanceValidationError,
  UnknownCapillaryHoldUpError,
  InsufficientFreeWaterError,
} from '../engine/water-balance/index.ts';
import type { TestResult } from './domain.test.ts';

/**
 * Верификация физических инвариантов водного баланса чайного листа (Этап 2B.1).
 */
export async function runWaterBalanceTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(suite: string, name: string, condition: boolean, message?: string) {
    results.push({
      suite,
      testName: name,
      passed: condition,
      error: condition ? undefined : (message ?? 'Assertion failed'),
    });
  }

  // Набор 1: Предельная влагоёмкость листа
  {
    const suite = '1. Предельная влагоёмкость чайного листа (calculateMaxAbsorbedWater)';

    // 1.1 Корректный расчёт с размерностью
    const maxWater = calculateMaxAbsorbedWater(5.0, 2.6);
    assert(
      suite,
      'Предельная масса поглощённой воды вычисляется с корректными единицами: 5 г * 2.6 г/г = 13 г',
      Math.abs(maxWater - 13.0) < 1e-12
    );

    // 1.2 Неположительная сухая масса отклоняется
    let caughtZeroMass = false;
    try {
      calculateMaxAbsorbedWater(0, 2.6);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_DRY_MASS') {
        caughtZeroMass = true;
      }
    }
    assert(suite, 'Нулевая масса сухой навески отклоняется с ошибкой валидации', caughtZeroMass);

    let caughtNegativeMass = false;
    try {
      calculateMaxAbsorbedWater(-5.0, 2.6);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_DRY_MASS') {
        caughtNegativeMass = true;
      }
    }
    assert(suite, 'Отрицательная масса сухой навески отклоняется', caughtNegativeMass);

    // 1.3 Отрицательная или нечисловая влагоёмкость
    let caughtNegativeRatio = false;
    try {
      calculateMaxAbsorbedWater(5.0, -1.0);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_ABSORPTION_RATIO') {
        caughtNegativeRatio = true;
      }
    }
    assert(suite, 'Отрицательная влагоёмкость (-1.0 г/г) отклоняется', caughtNegativeRatio);

    let caughtNanRatio = false;
    try {
      calculateMaxAbsorbedWater(5.0, NaN);
    } catch (err) {
      if (err instanceof WaterBalanceValidationError) {
        caughtNanRatio = true;
      }
    }
    assert(suite, 'NaN в качестве влагоёмкости вызывает ошибку валидации', caughtNanRatio);
  }

  // Набор 2: Поглощение воды матрицей листа и сохранение массы
  {
    const suite = '2. Перенос массы при поглощении воды (applyWaterAbsorption)';

    // 2.1 Поглощение переносит массу воды из свободного компартмента в компартмент листа, не меняя суммарную массу
    const res1 = applyWaterAbsorption({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 2.0,
      availableFreeWaterGrams: 50.0,
      maxAbsorptionRatioGramsPerGram: 2.5, // max = 12.5 g, remaining = 10.5 g
      requestedAbsorptionGrams: 4.0,
    });

    assert(
      suite,
      'Поглощение переносит массу воды из свободного компартмента в компартмент листа, не меняя суммарную массу',
      Math.abs(res1.previousAbsorbedWaterGrams + res1.previousFreeWaterGrams - (res1.newAbsorbedWaterGrams + res1.newFreeWaterGrams)) < 1e-12 &&
        Math.abs(res1.massConservationDeltaGrams) < 1e-12
    );
    assert(
      suite,
      'Фактически поглощённая масса равна запрошенной при отсутствии ограничений (4 г)',
      Math.abs(res1.actualAbsorbedGrams - 4.0) < 1e-12 &&
        Math.abs(res1.newAbsorbedWaterGrams - 6.0) < 1e-12 &&
        Math.abs(res1.newFreeWaterGrams - 46.0) < 1e-12 &&
        res1.limitingFactor === 'unconstrained'
    );

    // 2.2 Поглощение не превышает предельную влагоёмкость
    // dry = 5 g, ratio = 2.0 -> max = 10.0 g. Current = 8.0 g, remaining capacity = 2.0 g. Requested = 5.0 g. Free = 50.0 g.
    const resCapacityLimited = applyWaterAbsorption({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 8.0,
      availableFreeWaterGrams: 50.0,
      maxAbsorptionRatioGramsPerGram: 2.0,
      requestedAbsorptionGrams: 5.0,
    });
    assert(
      suite,
      'Поглощение не превышает предельную влагоёмкость: поглощается только остаточная ёмкость 2 г вместо 5 г',
      Math.abs(resCapacityLimited.actualAbsorbedGrams - 2.0) < 1e-12 &&
        Math.abs(resCapacityLimited.newAbsorbedWaterGrams - 10.0) < 1e-12 &&
        Math.abs(resCapacityLimited.newFreeWaterGrams - 48.0) < 1e-12 &&
        resCapacityLimited.limitingFactor === 'limited_by_leaf_capacity'
    );

    // 2.3 Поглощение не превышает доступный объём свободной воды
    // dry = 5 g, ratio = 3.0 -> max = 15.0 g. Current = 2.0 g, remaining capacity = 13.0 g. Requested = 10.0 g. Free = 4.0 g.
    const resWaterLimited = applyWaterAbsorption({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 2.0,
      availableFreeWaterGrams: 4.0,
      maxAbsorptionRatioGramsPerGram: 3.0,
      requestedAbsorptionGrams: 10.0,
    });
    assert(
      suite,
      'Поглощение не превышает доступный объём свободной воды: впитывается 4 г, свободная вода становится 0 г',
      Math.abs(resWaterLimited.actualAbsorbedGrams - 4.0) < 1e-12 &&
        Math.abs(resWaterLimited.newAbsorbedWaterGrams - 6.0) < 1e-12 &&
        Math.abs(resWaterLimited.newFreeWaterGrams - 0.0) < 1e-12 &&
        resWaterLimited.limitingFactor === 'limited_by_available_free_water'
    );

    // 2.4 Запрос нулевого поглощения
    const resZeroReq = applyWaterAbsorption({
      dryLeafMassGrams: 5.0,
      currentAbsorbedWaterGrams: 2.0,
      availableFreeWaterGrams: 50.0,
      maxAbsorptionRatioGramsPerGram: 2.5,
      requestedAbsorptionGrams: 0.0,
    });
    assert(
      suite,
      'Запрос нулевого поглощения корректно оставляет массы без изменений со статусом zero_requested',
      resZeroReq.actualAbsorbedGrams === 0 &&
        resZeroReq.newAbsorbedWaterGrams === 2.0 &&
        resZeroReq.newFreeWaterGrams === 50.0 &&
        resZeroReq.limitingFactor === 'zero_requested'
    );

    // 2.5 Ошибка: текущая поглощённая масса превышает предел листа
    let caughtExceededCapacity = false;
    try {
      applyWaterAbsorption({
        dryLeafMassGrams: 5.0,
        currentAbsorbedWaterGrams: 15.0, // max is 5 * 2.0 = 10.0 g!
        availableFreeWaterGrams: 50.0,
        maxAbsorptionRatioGramsPerGram: 2.0,
        requestedAbsorptionGrams: 1.0,
      });
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'ABSORBED_EXCEEDS_CAPACITY') {
        caughtExceededCapacity = true;
      }
    }
    assert(suite, 'Текущая поглощённая масса выше предела листа вызывает ошибку валидации', caughtExceededCapacity);
  }

  // Набор 3: Слив свободного настоя и капиллярное удержание
  {
    const suite = '3. Слив свободного настоя (solveLiquorDrain)';

    // 3.1 Гунфу Ча оставляет капиллярный остаток, если он известен и вода доступна
    const resGongfu = solveLiquorDrain({
      freeWaterBeforeDrainMl: 100.0,
      retainedLiquorFraction: 0.0, // Полный слив
      capillaryHoldUpCapacityMl: 12.0,
    });
    assert(
      suite,
      'Гунфу Ча оставляет капиллярный остаток (12 мл), сливая остальную воду (88 мл)',
      Math.abs(resGongfu.targetRootVolumeMl - 0.0) < 1e-12 &&
        Math.abs(resGongfu.actualRetainedFreeWaterMl - 12.0) < 1e-12 &&
        Math.abs(resGongfu.drainedFreeWaterMl - 88.0) < 1e-12 &&
        resGongfu.limitingFactor === 'governed_by_capillary_hold_up'
    );

    // 3.2 Лю Гэнь Пао не складывает капиллярный остаток и целевой корень
    // 100 мл, целевая доля 0.4 -> корень 40 мл. Капиллярная ёмкость = 12 мл.
    // Фактический остаток строго 40 мл, а НЕ 40 + 12 = 52 мл!
    const resLiuGen = solveLiquorDrain({
      freeWaterBeforeDrainMl: 100.0,
      retainedLiquorFraction: 0.4,
      capillaryHoldUpCapacityMl: 12.0,
    });
    assert(
      suite,
      'Лю Гэнь Пао не складывает капиллярный остаток и целевой корень: остаток 40 мл (НЕ 52 мл)',
      Math.abs(resLiuGen.targetRootVolumeMl - 40.0) < 1e-12 &&
        Math.abs(resLiuGen.actualRetainedFreeWaterMl - 40.0) < 1e-12 &&
        Math.abs(resLiuGen.drainedFreeWaterMl - 60.0) < 1e-12 &&
        resLiuGen.limitingFactor === 'exact_target'
    );

    // 3.3 Фактический остаток не превышает доступный объём свободной воды
    // В сосуде 8 мл, капиллярная ёмкость 15 мл. Сливается 0 мл, остаётся 8 мл.
    const resLowWater = solveLiquorDrain({
      freeWaterBeforeDrainMl: 8.0,
      retainedLiquorFraction: 0.5,
      capillaryHoldUpCapacityMl: 15.0,
    });
    assert(
      suite,
      'Фактический остаток не превышает доступный объём: при 8 мл доступной воды остаётся 8 мл (не создаются фиктивные 15 мл)',
      Math.abs(resLowWater.actualRetainedFreeWaterMl - 8.0) < 1e-12 &&
        Math.abs(resLowWater.drainedFreeWaterMl - 0.0) < 1e-12 &&
        resLowWater.limitingFactor === 'insufficient_water_for_capillary_hold_up'
    );

    // 3.4 Сливаемый плюс удержанный объём равен доступному объёму до слива в пределах машинного эпсилон
    assert(
      suite,
      'Сливаемый плюс удержанный объём равен доступному объёму до слива в пределах машинного допуска (< 1e-12 мл)',
      Math.abs(resGongfu.volumeConservationDeltaMl) < 1e-12 &&
        Math.abs(resLiuGen.volumeConservationDeltaMl) < 1e-12 &&
        Math.abs(resLowWater.volumeConservationDeltaMl) < 1e-12
    );

    // 3.5 Неизвестная капиллярная ёмкость (null / undefined) выбрасывает UnknownCapillaryHoldUpError (Unknown ≠ 0)
    let caughtNullCapillary = false;
    try {
      solveLiquorDrain({
        freeWaterBeforeDrainMl: 100.0,
        retainedLiquorFraction: 0.0,
        capillaryHoldUpCapacityMl: null,
      });
    } catch (err) {
      if (err instanceof UnknownCapillaryHoldUpError) {
        caughtNullCapillary = true;
      }
    }
    assert(
      suite,
      'Неизвестная капиллярная ёмкость (null) выбрасывает UnknownCapillaryHoldUpError вместо скрытой подмены нулём',
      caughtNullCapillary
    );

    // 3.6 Недопустимая доля удержания корня (>= 1.0 или < 0)
    let caughtBadFraction = false;
    try {
      solveLiquorDrain({
        freeWaterBeforeDrainMl: 100.0,
        retainedLiquorFraction: 1.0,
        capillaryHoldUpCapacityMl: 10.0,
      });
    } catch (err) {
      if (err instanceof WaterBalanceValidationError && err.code === 'INVALID_RETAINED_FRACTION') {
        caughtBadFraction = true;
      }
    }
    assert(suite, 'Доля удержания >= 1.0 (1.0) вызывает ошибку валидации', caughtBadFraction);

    // 3.7 Нулевой свободный объём до слива
    const resZeroDrain = solveLiquorDrain({
      freeWaterBeforeDrainMl: 0.0,
      retainedLiquorFraction: 0.3,
      capillaryHoldUpCapacityMl: 10.0,
    });
    assert(
      suite,
      'Граничные случаи с нулевым свободным объёмом обрабатываются корректно (слив 0, остаток 0, zero_water)',
      resZeroDrain.drainedFreeWaterMl === 0 &&
        resZeroDrain.actualRetainedFreeWaterMl === 0 &&
        resZeroDrain.limitingFactor === 'zero_water' &&
        Math.abs(resZeroDrain.volumeConservationDeltaMl) < 1e-12
    );
  }

  // Набор 4: Добавление воды, отпивание и пересчёт плотности
  {
    const suite = '4. Долив и потребление свободной воды (addWater, consumeFreeWater)';

    // 4.1 Долив увеличивает свободную массу воды на рассчитанную массу добавленной воды
    const addRes = addWater(50.0, 75.0);
    assert(
      suite,
      'Долив увеличивает свободную массу воды на рассчитанную массу добавленной воды (50 г + 75 г = 125 г)',
      Math.abs(addRes.newFreeWaterGrams - 125.0) < 1e-12 &&
        Math.abs(addRes.newFreeWaterVolumeMl - 125.0) < 1e-12
    );

    // 4.2 Отпивание уменьшает свободную воду, но не поглощённую воду в листе
    // Свободная вода 50 г, поглощённая вода 8 г. Отпиваем 20 г.
    const leafAbsorbedBefore = 8.0;
    const sipRes = consumeFreeWater(50.0, 20.0);
    const leafAbsorbedAfter = leafAbsorbedBefore; // Поглощённая вода не изменяется!

    assert(
      suite,
      'Отпивание уменьшает свободную воду (50 г -> 30 г), но не поглощённую воду в листе (8 г -> 8 г)',
      Math.abs(sipRes.newFreeWaterGrams - 30.0) < 1e-12 &&
        Math.abs(sipRes.actualConsumedGrams - 20.0) < 1e-12 &&
        leafAbsorbedAfter === leafAbsorbedBefore
    );

    // 4.3 Попытка отпить больше свободной воды, чем есть, вызывает InsufficientFreeWaterError
    let caughtExcessiveSip = false;
    try {
      consumeFreeWater(25.0, 40.0);
    } catch (err) {
      if (err instanceof InsufficientFreeWaterError) {
        caughtExcessiveSip = true;
      }
    }
    assert(
      suite,
      'Попытка отпить 40 г при доступных 25 г свободной воды вызывает InsufficientFreeWaterError',
      caughtExcessiveSip
    );

    // 4.4 Конверсия объёма в массу с явным указанием плотности
    const massAt1 = convertVolumeToMass(100.0, 1.0);
    const massAtCustom = convertVolumeToMass(100.0, 0.98);
    const volAtCustom = convertMassToVolume(98.0, 0.98);
    assert(
      suite,
      'Пересчёт объёма в массу и обратно корректно учитывает явно заданную плотность',
      Math.abs(massAt1 - 100.0) < 1e-12 &&
        Math.abs(massAtCustom - 98.0) < 1e-12 &&
        Math.abs(volAtCustom - 100.0) < 1e-12
    );
  }

  // Набор 5: Глобальный закон сохранения массы по многошаговой сессии
  {
    const suite = '5. Глобальное сохранение массы в многошаговой сессии';

    // Смоделируем 3 пролива Гунфу Ча с сухой навеской 6 г и капиллярным удержанием 8 мл
    const dryMass = 6.0; // г
    const maxRatio = 2.5; // г/г -> maxAbsorbed = 15.0 г
    const capillaryCapacity = 8.0; // мл

    let totalAddedWaterGrams = 0;
    let totalDrainedWaterGrams = 0;
    let currentAbsorbedGrams = 0;
    let currentFreeGrams = 0;

    // Шаг 1: залив 100 г, поглощение 6.0 г, слив с капиллярным удержанием 8 мл
    const add1 = 100.0;
    totalAddedWaterGrams += add1;
    currentFreeGrams += add1;

    const absStep1 = applyWaterAbsorption({
      dryLeafMassGrams: dryMass,
      currentAbsorbedWaterGrams: currentAbsorbedGrams,
      availableFreeWaterGrams: currentFreeGrams,
      maxAbsorptionRatioGramsPerGram: maxRatio,
      requestedAbsorptionGrams: 6.0,
    });
    currentAbsorbedGrams = absStep1.newAbsorbedWaterGrams;
    currentFreeGrams = absStep1.newFreeWaterGrams;

    const drainStep1 = solveLiquorDrain({
      freeWaterBeforeDrainMl: currentFreeGrams, // при плотности 1.0 г/мл
      retainedLiquorFraction: 0.0,
      capillaryHoldUpCapacityMl: capillaryCapacity,
    });
    totalDrainedWaterGrams += drainStep1.drainedFreeWaterMassGrams;
    currentFreeGrams = drainStep1.actualRetainedFreeWaterMassGrams;

    // Шаг 2: долив 92 г (до 100 мл в сосуде), поглощение 5.0 г, слив
    const add2 = 92.0;
    totalAddedWaterGrams += add2;
    currentFreeGrams += add2;

    const absStep2 = applyWaterAbsorption({
      dryLeafMassGrams: dryMass,
      currentAbsorbedWaterGrams: currentAbsorbedGrams,
      availableFreeWaterGrams: currentFreeGrams,
      maxAbsorptionRatioGramsPerGram: maxRatio,
      requestedAbsorptionGrams: 5.0,
    });
    currentAbsorbedGrams = absStep2.newAbsorbedWaterGrams;
    currentFreeGrams = absStep2.newFreeWaterGrams;

    const drainStep2 = solveLiquorDrain({
      freeWaterBeforeDrainMl: currentFreeGrams,
      retainedLiquorFraction: 0.0,
      capillaryHoldUpCapacityMl: capillaryCapacity,
    });
    totalDrainedWaterGrams += drainStep2.drainedFreeWaterMassGrams;
    currentFreeGrams = drainStep2.actualRetainedFreeWaterMassGrams;

    // Шаг 3: долив 92 г, поглощение 4.0 г (лист насыщается до предела 15 г), слив
    const add3 = 92.0;
    totalAddedWaterGrams += add3;
    currentFreeGrams += add3;

    const absStep3 = applyWaterAbsorption({
      dryLeafMassGrams: dryMass,
      currentAbsorbedWaterGrams: currentAbsorbedGrams,
      availableFreeWaterGrams: currentFreeGrams,
      maxAbsorptionRatioGramsPerGram: maxRatio,
      requestedAbsorptionGrams: 4.0,
    });
    currentAbsorbedGrams = absStep3.newAbsorbedWaterGrams;
    currentFreeGrams = absStep3.newFreeWaterGrams;

    const drainStep3 = solveLiquorDrain({
      freeWaterBeforeDrainMl: currentFreeGrams,
      retainedLiquorFraction: 0.0,
      capillaryHoldUpCapacityMl: capillaryCapacity,
    });
    totalDrainedWaterGrams += drainStep3.drainedFreeWaterMassGrams;
    currentFreeGrams = drainStep3.actualRetainedFreeWaterMassGrams;

    // Проверка фундаментального инварианта:
    // Total Added == Absorbed In Leaf + Retained In Vessel + Total Drained
    const totalWaterAccounted = currentAbsorbedGrams + currentFreeGrams + totalDrainedWaterGrams;
    const globalDelta = Math.abs(totalAddedWaterGrams - totalWaterAccounted);

    assert(
      suite,
      'Несколько последовательных операций сохраняют глобальный баланс воды (ошибка < 1e-11 г)',
      globalDelta < 1e-11
    );
    assert(
      suite,
      'Лист достиг предельного насыщения 15 г (6 г * 2.5 г/г)',
      Math.abs(currentAbsorbedGrams - 15.0) < 1e-12
    );
    assert(
      suite,
      'Остаточная свободная вода в сосуде строго равна капиллярному удержанию 8 г',
      Math.abs(currentFreeGrams - 8.0) < 1e-12
    );
  }

  // Набор 6: Детерминизм вычислений (идемпотентность при одинаковых данных)
  {
    const suite = '6. Детерминизм чистых функций водного баланса';

    const pAbs = {
      dryLeafMassGrams: 7.0,
      currentAbsorbedWaterGrams: 3.5,
      availableFreeWaterGrams: 80.0,
      maxAbsorptionRatioGramsPerGram: 2.8,
      requestedAbsorptionGrams: 4.2,
    };
    const r1 = applyWaterAbsorption(pAbs);
    const r2 = applyWaterAbsorption(pAbs);

    assert(
      suite,
      'Повторный запуск applyWaterAbsorption с одинаковыми данными даёт строго идентичные результаты',
      r1.actualAbsorbedGrams === r2.actualAbsorbedGrams &&
        r1.newAbsorbedWaterGrams === r2.newAbsorbedWaterGrams &&
        r1.newFreeWaterGrams === r2.newFreeWaterGrams &&
        r1.limitingFactor === r2.limitingFactor
    );

    const pDrain = {
      freeWaterBeforeDrainMl: 95.0,
      retainedLiquorFraction: 0.35,
      capillaryHoldUpCapacityMl: 14.0,
    };
    const d1 = solveLiquorDrain(pDrain);
    const d2 = solveLiquorDrain(pDrain);

    assert(
      suite,
      'Повторный запуск solveLiquorDrain с одинаковыми данными даёт строго идентичные результаты',
      d1.actualRetainedFreeWaterMl === d2.actualRetainedFreeWaterMl &&
        d1.drainedFreeWaterMl === d2.drainedFreeWaterMl &&
        d1.targetRootVolumeMl === d2.targetRootVolumeMl &&
        d1.limitingFactor === d2.limitingFactor
    );
  }

  return results;
}
