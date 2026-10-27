/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
  WATER_DENSITY_KG_PER_ML,
  DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
  MIN_INTEGRATOR_TIME_STEP_SECONDS,
  MAX_INTEGRATOR_TIME_STEP_SECONDS,
} from './constants.ts';
import {
  ThermalRangeError,
  ThermalValidationError,
  ThermalInstabilityError,
} from './errors.ts';
import type {
  IntegrationStepResult,
  ThermalConvergenceReport,
  ThermalSimulationPoint,
  ThermalState,
  VesselThermalProfile,
} from './types.ts';

export type { IntegrationStepResult };

/**
 * Расчёт смешения двух объёмов воды по фундаментальному балансу тепловой энергии:
 * E_total = m1 * c_p * T1 + m2 * c_p * T2
 *
 * Принимает модельное допущение о постоянстве удельной изобарной теплоёмкости чистой воды
 * (c_p = 4184.0 Дж/(кг·К)) в интервале температур смешения 20–100 °C:
 * T_mixed = (V1 * T1 + V2 * T2) / (V1 + V2)
 *
 * Обработка краевых случаев и физическая валидация:
 * - Отрицательный или NaN объём вызывает явное исключение ThermalValidationError.
 * - При положительном объёме температура обязана быть конечным числом в диапазоне 0–100 °C,
 *   иначе выбрасывается ThermalRangeError (недопустимо молча подменять некорректную температуру на 0 °C).
 * - Если суммарный объём равен 0, температура несуществующей жидкости равна null (Unknown ≠ 0).
 */
export function solveThermalMixing(
  liquid1: { volumeMl: number; temperatureC: number | null },
  liquid2: { volumeMl: number; temperatureC: number | null }
): { volumeMl: number; temperatureC: number | null } {
  // Валидация объёмов
  if (!Number.isFinite(liquid1.volumeMl) || liquid1.volumeMl < 0) {
    throw new ThermalValidationError(
      `Недопустимый объём первой порции жидкости: ${liquid1.volumeMl} мл. Объём должен быть конечным неотрицательным числом.`,
      'INVALID_VOLUME',
      'liquid1.volumeMl',
      liquid1.volumeMl
    );
  }
  if (!Number.isFinite(liquid2.volumeMl) || liquid2.volumeMl < 0) {
    throw new ThermalValidationError(
      `Недопустимый объём второй порции жидкости: ${liquid2.volumeMl} мл. Объём должен быть конечным неотрицательным числом.`,
      'INVALID_VOLUME',
      'liquid2.volumeMl',
      liquid2.volumeMl
    );
  }

  const v1 = liquid1.volumeMl;
  const v2 = liquid2.volumeMl;
  const totalVolume = v1 + v2;

  // Случай нулевого суммарного объёма
  if (totalVolume === 0) {
    return { volumeMl: 0, temperatureC: null };
  }

  // Валидация температур для непустых порций
  if (v1 > 0) {
    if (
      liquid1.temperatureC === null ||
      !Number.isFinite(liquid1.temperatureC) ||
      liquid1.temperatureC < 0 ||
      liquid1.temperatureC > 100
    ) {
      throw new ThermalRangeError(
        `Некорректная температура первой порции жидкости (${liquid1.temperatureC} °C) при объёме ${v1} мл. Допустимый интервал жидкой воды: 0–100 °C.`,
        'liquid1.temperatureC',
        liquid1.temperatureC
      );
    }
  }

  if (v2 > 0) {
    if (
      liquid2.temperatureC === null ||
      !Number.isFinite(liquid2.temperatureC) ||
      liquid2.temperatureC < 0 ||
      liquid2.temperatureC > 100
    ) {
      throw new ThermalRangeError(
        `Некорректная температура второй порции жидкости (${liquid2.temperatureC} °C) при объёме ${v2} мл. Допустимый интервал жидкой воды: 0–100 °C.`,
        'liquid2.temperatureC',
        liquid2.temperatureC
      );
    }
  }

  if (v1 === 0) {
    return { volumeMl: v2, temperatureC: liquid2.temperatureC };
  }
  if (v2 === 0) {
    return { volumeMl: v1, temperatureC: liquid1.temperatureC };
  }

  const t1 = liquid1.temperatureC!;
  const t2 = liquid2.temperatureC!;
  const mixedTemp = (v1 * t1 + v2 * t2) / totalVolume;

  return {
    volumeMl: totalVolume,
    temperatureC: mixedTemp,
  };
}

/**
 * Численный интегратор теплового баланса (схема Рунге-Кутты 2-го порядка / метод Хойна).
 * Решает систему связанных ОДУ:
 *
 * C_liquid * dT_liquid / dt = -G_lv * (T_liquid - T_vessel) - G_la * (T_liquid - T_ambient)
 * C_vessel * dT_vessel / dt =  G_lv * (T_liquid - T_vessel) - G_va * (T_vessel - T_ambient)
 *
 * При отсутствии жидкости (liquidVolumeMl = 0):
 * - Узел жидкости отключён;
 * - liquidTemperatureC strictly = null (не заменяется фиктивными 0 °C или температурой стенок);
 * - Стенки сосуда остывают на воздухе по закону Ньютона–Рихмана:
 *   C_vessel * dT_vessel / dt = -G_va * (T_vessel - T_ambient).
 */
export function integrateThermalStep(
  initialState: ThermalState,
  profile: VesselThermalProfile,
  durationSeconds: number,
  timeStepSeconds: number = DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
  samplingIntervalSeconds = 1.0
): IntegrationStepResult {
  const warnings: string[] = [];

  // 1. Строгая валидация длительности
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new ThermalValidationError(
      `Длительность шага интегрирования не может быть отрицательной или NaN: ${durationSeconds} с.`,
      'INVALID_DURATION',
      'durationSeconds',
      durationSeconds
    );
  }

  // 2. Строгая валидация профиля посуды
  if (!Number.isFinite(profile.vesselMassGrams) || profile.vesselMassGrams <= 0) {
    throw new ThermalValidationError(
      `Масса сосуда должна быть положительным числом: ${profile.vesselMassGrams} г.`,
      'INVALID_VESSEL_MASS',
      'profile.vesselMassGrams',
      profile.vesselMassGrams
    );
  }
  if (!Number.isFinite(profile.materialSpecificHeatJPerKgK) || profile.materialSpecificHeatJPerKgK <= 0) {
    throw new ThermalValidationError(
      `Удельная теплоёмкость материала посуды должна быть положительной: ${profile.materialSpecificHeatJPerKgK} Дж/(кг·К).`,
      'INVALID_SPECIFIC_HEAT',
      'profile.materialSpecificHeatJPerKgK',
      profile.materialSpecificHeatJPerKgK
    );
  }

  // 3. Валидация температур окружающей среды и стенок
  if (!Number.isFinite(initialState.ambientTemperatureC) || initialState.ambientTemperatureC < -50 || initialState.ambientTemperatureC > 80) {
    throw new ThermalValidationError(
      `Температура окружающей среды (${initialState.ambientTemperatureC} °C) выходит за физически допустимые пределы помещения (-50..+80 °C).`,
      'INVALID_AMBIENT_TEMPERATURE',
      'ambientTemperatureC',
      initialState.ambientTemperatureC
    );
  }
  if (!Number.isFinite(initialState.vesselTemperatureC) || initialState.vesselTemperatureC < -50 || initialState.vesselTemperatureC > 200) {
    throw new ThermalValidationError(
      `Температура стенок сосуда (${initialState.vesselTemperatureC} °C) выходит за физически допустимые пределы (-50..+200 °C).`,
      'INVALID_VESSEL_TEMPERATURE',
      'vesselTemperatureC',
      initialState.vesselTemperatureC
    );
  }

  // 4. Валидация объёма и температуры жидкости
  if (!Number.isFinite(initialState.liquidVolumeMl) || initialState.liquidVolumeMl < 0) {
    throw new ThermalValidationError(
      `Объём жидкости в начальном состоянии не может быть отрицательным или NaN: ${initialState.liquidVolumeMl} мл.`,
      'INVALID_LIQUID_VOLUME',
      'liquidVolumeMl',
      initialState.liquidVolumeMl
    );
  }

  const volumeMl = initialState.liquidVolumeMl;
  const tAmbient = initialState.ambientTemperatureC;
  let tVessel = initialState.vesselTemperatureC;

  let tLiquid: number | null = null;
  if (volumeMl > 0) {
    if (
      initialState.liquidTemperatureC === null ||
      !Number.isFinite(initialState.liquidTemperatureC) ||
      initialState.liquidTemperatureC < 0 ||
      initialState.liquidTemperatureC > 100
    ) {
      throw new ThermalRangeError(
        `Начальная температура жидкости (${initialState.liquidTemperatureC} °C) при объёме ${volumeMl} мл выходит за пределы жидкой воды при атмосферном давлении (0–100 °C). Недопустимо молча подменять её на 0 °C.`,
        'liquidTemperatureC',
        initialState.liquidTemperatureC
      );
    }
    tLiquid = initialState.liquidTemperatureC;
  }

  // 5. Строгая валидация тепловых проводимостей профиля
  // Ноль допустим как физическое допущение об отсутствии теплообмена (например, адиабатическая изоляция).
  // Отрицательные, NaN и бесконечные значения строго запрещены и вызывают типизированную ошибку.
  if (!Number.isFinite(profile.conductanceLiquidVesselWPerK) || profile.conductanceLiquidVesselWPerK < 0) {
    throw new ThermalValidationError(
      `Коэффициент теплопроводности жидкость–сосуд должен быть конечным неотрицательным числом: ${profile.conductanceLiquidVesselWPerK} Вт/К. Недопустимо скрыто заменять его нулём.`,
      'INVALID_CONDUCTANCE',
      'conductanceLiquidVesselWPerK',
      profile.conductanceLiquidVesselWPerK
    );
  }
  if (!Number.isFinite(profile.conductanceVesselAmbientWPerK) || profile.conductanceVesselAmbientWPerK < 0) {
    throw new ThermalValidationError(
      `Коэффициент теплопроводности сосуд–среда должен быть конечным неотрицательным числом: ${profile.conductanceVesselAmbientWPerK} Вт/К. Недопустимо скрыто заменять его нулём.`,
      'INVALID_CONDUCTANCE',
      'conductanceVesselAmbientWPerK',
      profile.conductanceVesselAmbientWPerK
    );
  }
  if (!Number.isFinite(profile.conductanceLiquidAmbientWPerK) || profile.conductanceLiquidAmbientWPerK < 0) {
    throw new ThermalValidationError(
      `Коэффициент теплопроводности жидкость–среда должен быть конечным неотрицательным числом: ${profile.conductanceLiquidAmbientWPerK} Вт/К. Недопустимо скрыто заменять его нулём.`,
      'INVALID_CONDUCTANCE',
      'conductanceLiquidAmbientWPerK',
      profile.conductanceLiquidAmbientWPerK
    );
  }

  // 6. Строгая валидация параметров численного интегрирования (запрет скрытого ограничения через Math.min/Math.max)
  if (
    !Number.isFinite(timeStepSeconds) ||
    timeStepSeconds < MIN_INTEGRATOR_TIME_STEP_SECONDS ||
    timeStepSeconds > MAX_INTEGRATOR_TIME_STEP_SECONDS
  ) {
    throw new ThermalValidationError(
      `Шаг численного интегрирования (${timeStepSeconds} с) выходит за допустимый диапазон [${MIN_INTEGRATOR_TIME_STEP_SECONDS}, ${MAX_INTEGRATOR_TIME_STEP_SECONDS}] с.`,
      'INVALID_TIME_STEP',
      'timeStepSeconds',
      timeStepSeconds
    );
  }

  if (!Number.isFinite(samplingIntervalSeconds) || samplingIntervalSeconds <= 0) {
    throw new ThermalValidationError(
      `Интервал дискретизации точек кривой должен быть конечным строго положительным числом (> 0 с): ${samplingIntervalSeconds} с.`,
      'INVALID_SAMPLING_INTERVAL',
      'samplingIntervalSeconds',
      samplingIntervalSeconds
    );
  }

  // Теплоёмкость стенок: C_vessel = m_kg * c_p [Дж/К]
  const vesselMassKg = profile.vesselMassGrams * 0.001;
  const cVessel = vesselMassKg * profile.materialSpecificHeatJPerKgK;

  // Теплоёмкость жидкости: C_liquid = V_ml * 10^-3 kg * 4184 [Дж/К]
  const liquidMassKg = volumeMl * WATER_DENSITY_KG_PER_ML;
  const cLiquid = liquidMassKg * SPECIFIC_HEAT_WATER_J_PER_KG_K;

  // Проводимости используются напрямую без негласного подавления через Math.max(0, ...)
  const gLv = profile.conductanceLiquidVesselWPerK;
  const gVa = profile.conductanceVesselAmbientWPerK;
  const gLa = profile.conductanceLiquidAmbientWPerK;

  const curvePoints: ThermalSimulationPoint[] = [];

  // Начальная точка
  curvePoints.push({
    timeSeconds: 0,
    liquidTemperatureC: tLiquid !== null ? Math.round(tLiquid * 100) / 100 : null,
    vesselTemperatureC: Math.round(tVessel * 100) / 100,
    liquidVolumeMl: volumeMl,
  });

  // Если длительность равна 0, мгновенный возврат
  if (durationSeconds === 0) {
    return {
      finalState: {
        liquidVolumeMl: volumeMl,
        liquidTemperatureC: tLiquid,
        vesselTemperatureC: tVessel,
        ambientTemperatureC: tAmbient,
        elapsedSeconds: 0,
      },
      curvePoints,
      minLiquidTempC: tLiquid,
      maxLiquidTempC: tLiquid,
      minVesselTempC: tVessel,
      maxVesselTempC: tVessel,
      warnings,
    };
  }

  // 7. Расчёт критерия численной устойчивости явной схемы Хойна (RK2)
  // Для линейной системы ОДУ устойчивость требует |lambda_max| * dt <= 2, то есть dt <= 2 * tau_min.
  let maxStableDtSeconds = Infinity;
  if (volumeMl === 0 || tLiquid === null) {
    if (gVa > 0 && cVessel > 0) {
      const lambdaAbs = gVa / cVessel;
      maxStableDtSeconds = 2.0 / lambdaAbs;
    }
  } else {
    if (cLiquid > 0 && cVessel > 0) {
      const a11 = (gLv + gLa) / cLiquid;
      const a22 = (gLv + gVa) / cVessel;
      const a12a21 = (gLv * gLv) / (cLiquid * cVessel);
      const trace = a11 + a22;
      const discr = Math.max(0, (a11 - a22) * (a11 - a22) + 4 * a12a21);
      const lambdaMaxAbs = (trace + Math.sqrt(discr)) / 2;
      if (lambdaMaxAbs > 0) {
        maxStableDtSeconds = 2.0 / lambdaMaxAbs;
      }
    }
  }

  if (timeStepSeconds > maxStableDtSeconds) {
    throw new ThermalInstabilityError(
      `Выбранный шаг численного интегрирования (${timeStepSeconds} с) превышает предел устойчивости схемы Хойна (${maxStableDtSeconds.toFixed(4)} с, tau_min = ${(maxStableDtSeconds / 2).toFixed(4)} с). Схема приведёт к осцилляциям или расходимости. Скрытая коррекция запрещена.`,
      timeStepSeconds,
      maxStableDtSeconds
    );
  }

  // Шаг интегрирования dt используется напрямую согласно проверенному значению
  const dt = timeStepSeconds;
  let currentTime = 0;
  let nextSampleTime = samplingIntervalSeconds;

  let minLiquid = tLiquid;
  let maxLiquid = tLiquid;
  let minVessel = tVessel;
  let maxVessel = tVessel;

  // Случай А: Сосуд пуст (volumeMl === 0) — только остывание стенок на воздухе
  if (volumeMl === 0 || tLiquid === null) {
    const lowerBoundVessel = Math.min(tVessel, tAmbient);
    const upperBoundVessel = Math.max(tVessel, tAmbient);

    while (currentTime < durationSeconds) {
      const step = Math.min(dt, durationSeconds - currentTime);

      // Производная для стенок: dTv/dt = -gVa * (Tv - Ta) / cVessel
      const dTv1 = -gVa * (tVessel - tAmbient) / cVessel;
      const tvPredict = tVessel + step * dTv1;
      const dTv2 = -gVa * (tvPredict - tAmbient) / cVessel;

      tVessel += (step / 2) * (dTv1 + dTv2);

      // Контроль численной устойчивости: выход за пределы или потеря конечности строго запрещены
      if (
        !Number.isFinite(tVessel) ||
        tVessel < lowerBoundVessel - 1e-4 ||
        tVessel > upperBoundVessel + 1e-4
      ) {
        throw new ThermalInstabilityError(
          `Численная нестабильность схемы при dt=${step} с: температура стенок (${tVessel} °C) вышла за физические границы [${lowerBoundVessel.toFixed(1)}, ${upperBoundVessel.toFixed(1)}] °C или потеряла конечность. Скрытая коррекция запрещена.`,
          step,
          maxStableDtSeconds
        );
      }

      currentTime += step;
      minVessel = Math.min(minVessel, tVessel);
      maxVessel = Math.max(maxVessel, tVessel);

      if (currentTime >= nextSampleTime || currentTime >= durationSeconds - 1e-6) {
        curvePoints.push({
          timeSeconds: Math.round(currentTime * 10) / 10,
          liquidTemperatureC: null, // Нет жидкости
          vesselTemperatureC: Math.round(tVessel * 100) / 100,
          liquidVolumeMl: 0,
        });
        nextSampleTime += samplingIntervalSeconds;
      }
    }

    return {
      finalState: {
        liquidVolumeMl: 0,
        liquidTemperatureC: null,
        vesselTemperatureC: tVessel,
        ambientTemperatureC: tAmbient,
        elapsedSeconds: durationSeconds,
      },
      curvePoints,
      minLiquidTempC: null,
      maxLiquidTempC: null,
      minVesselTempC: minVessel,
      maxVesselTempC: maxVessel,
      warnings,
    };
  }

  // Случай Б: В сосуде есть жидкость (volumeMl > 0)
  const lowerBound = Math.min(tLiquid, tVessel, tAmbient);
  const upperBound = Math.max(tLiquid, tVessel, tAmbient);

  const computeDerivatives = (tl: number, tv: number): { dTl: number; dTv: number } => {
    const heatFluxToVessel = gLv * (tl - tv);
    const heatFluxToAmbient = gLa * (tl - tAmbient);
    const dTl = (-heatFluxToVessel - heatFluxToAmbient) / cLiquid;

    const heatFluxFromLiquid = heatFluxToVessel;
    const heatFluxVesselToAmbient = gVa * (tv - tAmbient);
    const dTv = (heatFluxFromLiquid - heatFluxVesselToAmbient) / cVessel;

    return { dTl, dTv };
  };

  while (currentTime < durationSeconds) {
    const step = Math.min(dt, durationSeconds - currentTime);

    // Схема Хойна (RK2)
    const k1 = computeDerivatives(tLiquid, tVessel);

    const tlPredict = tLiquid + step * k1.dTl;
    const tvPredict = tVessel + step * k1.dTv;

    const k2 = computeDerivatives(tlPredict, tvPredict);

    tLiquid += (step / 2) * (k1.dTl + k2.dTl);
    tVessel += (step / 2) * (k1.dTv + k2.dTv);

    // Контроль физических границ 2-го начала термодинамики
    if (
      !Number.isFinite(tLiquid) ||
      !Number.isFinite(tVessel) ||
      tLiquid < lowerBound - 1e-4 ||
      tLiquid > upperBound + 1e-4 ||
      tVessel < lowerBound - 1e-4 ||
      tVessel > upperBound + 1e-4
    ) {
      throw new ThermalInstabilityError(
        `Численная нестабильность схемы при dt=${step} с: температура жидкости (${tLiquid} °C) или стенок (${tVessel} °C) вышла за термодинамические границы [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] °C или потеряла конечность. Скрытая коррекция запрещена.`,
        step,
        maxStableDtSeconds
      );
    }

    currentTime += step;

    minLiquid = minLiquid !== null ? Math.min(minLiquid, tLiquid) : tLiquid;
    maxLiquid = maxLiquid !== null ? Math.max(maxLiquid, tLiquid) : tLiquid;
    minVessel = Math.min(minVessel, tVessel);
    maxVessel = Math.max(maxVessel, tVessel);

    if (currentTime >= nextSampleTime || currentTime >= durationSeconds - 1e-6) {
      curvePoints.push({
        timeSeconds: Math.round(currentTime * 10) / 10,
        liquidTemperatureC: Math.round(tLiquid * 100) / 100,
        vesselTemperatureC: Math.round(tVessel * 100) / 100,
        liquidVolumeMl: volumeMl,
      });
      nextSampleTime += samplingIntervalSeconds;
    }
  }

  return {
    finalState: {
      liquidVolumeMl: volumeMl,
      liquidTemperatureC: tLiquid,
      vesselTemperatureC: tVessel,
      ambientTemperatureC: tAmbient,
      elapsedSeconds: durationSeconds,
    },
    curvePoints,
    minLiquidTempC: minLiquid,
    maxLiquidTempC: maxLiquid,
    minVesselTempC: minVessel,
    maxVesselTempC: maxVessel,
    warnings,
  };
}

/**
 * Численный тест сходимости схемы интегрирования при разных шагах времени dt.
 * Сравнивает решения для dt in [0.2, 0.1, 0.05, 0.025] с на заданном профиле сосуда.
 */
export function runThermalConvergenceAudit(
  profile: VesselThermalProfile,
  initialState: ThermalState,
  durationSeconds = 30.0,
  stepsTested: number[] = [0.2, 0.1, 0.05, 0.025]
): ThermalConvergenceReport {
  const sortedSteps = [...stepsTested].sort((a, b) => b - a);
  const stepResults: Array<{
    timeStepSeconds: number;
    finalLiquidTempC: number | null;
    finalVesselTempC: number;
    deltaFromFinerC: number;
  }> = [];

  // Интегрируем для каждого шага
  const runs = sortedSteps.map((dt) => {
    const res = integrateThermalStep(initialState, profile, durationSeconds, dt, durationSeconds);
    return {
      dt,
      finalLiquid: res.finalState.liquidTemperatureC,
      finalVessel: res.finalState.vesselTemperatureC,
    };
  });

  const finestRun = runs[runs.length - 1];
  let maxDelta = 0;

  for (let i = 0; i < runs.length; i++) {
    const cur = runs[i];
    const finer = i < runs.length - 1 ? runs[i + 1] : runs[i];
    const deltaLiquid =
      cur.finalLiquid !== null && finer.finalLiquid !== null
        ? Math.abs(cur.finalLiquid - finer.finalLiquid)
        : Math.abs(cur.finalVessel - finer.finalVessel);

    const deltaFromFinest =
      cur.finalLiquid !== null && finestRun.finalLiquid !== null
        ? Math.abs(cur.finalLiquid - finestRun.finalLiquid)
        : Math.abs(cur.finalVessel - finestRun.finalVessel);

    if (deltaFromFinest > maxDelta) {
      maxDelta = deltaFromFinest;
    }

    stepResults.push({
      timeStepSeconds: cur.dt,
      finalLiquidTempC: cur.finalLiquid !== null ? Math.round(cur.finalLiquid * 1000) / 1000 : null,
      finalVesselTempC: Math.round(cur.finalVessel * 1000) / 1000,
      deltaFromFinerC: Math.round(deltaLiquid * 1000) / 1000,
    });
  }

  // Для схемы 2-го порядка при типичном шаге 0.1 с погрешность относительно 0.025 с должна быть < 0.01 °C
  const isConverged = maxDelta < 0.05;

  return {
    profileId: profile.id,
    durationSeconds,
    stepsTested: sortedSteps,
    results: stepResults,
    maxDeltaC: Math.round(maxDelta * 1000) / 1000,
    isConverged,
  };
}
