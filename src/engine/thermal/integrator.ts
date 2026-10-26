/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SPECIFIC_HEAT_WATER_J_PER_KG_K,
  WATER_DENSITY_KG_PER_ML,
  DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
} from './constants.ts';
import {
  ThermalSimulationPoint,
  ThermalState,
  VesselThermalProfile,
} from './types.ts';

/**
 * Расчёт смешения двух объёмов воды по фундаментальному балансу тепловой энергии:
 * E_total = m1 * c_p * T1 + m2 * c_p * T2
 * Принятое модельное допущение: изобарная удельная теплоёмкость воды (c_p = 4184 Дж/(кг·К))
 * постоянна в диапазоне температур смешения, что даёт:
 * T_mixed = (V1 * T1 + V2 * T2) / (V1 + V2)
 */
export function solveThermalMixing(
  liquid1: { volumeMl: number; temperatureC: number },
  liquid2: { volumeMl: number; temperatureC: number }
): { volumeMl: number; temperatureC: number } {
  const v1 = Math.max(0, Number.isFinite(liquid1.volumeMl) ? liquid1.volumeMl : 0);
  const v2 = Math.max(0, Number.isFinite(liquid2.volumeMl) ? liquid2.volumeMl : 0);
  const t1 = Number.isFinite(liquid1.temperatureC) ? liquid1.temperatureC : 0;
  const t2 = Number.isFinite(liquid2.temperatureC) ? liquid2.temperatureC : 0;

  const totalVolume = v1 + v2;
  if (totalVolume <= 0) {
    return { volumeMl: 0, temperatureC: 0 };
  }

  if (v1 <= 0) {
    return { volumeMl: v2, temperatureC: t2 };
  }
  if (v2 <= 0) {
    return { volumeMl: v1, temperatureC: t1 };
  }

  const mixedTemp = (v1 * t1 + v2 * t2) / totalVolume;
  return {
    volumeMl: totalVolume,
    temperatureC: mixedTemp,
  };
}

export interface IntegrationStepResult {
  readonly finalState: ThermalState;
  readonly curvePoints: ThermalSimulationPoint[];
  readonly minLiquidTempC: number;
  readonly maxLiquidTempC: number;
  readonly minVesselTempC: number;
  readonly maxVesselTempC: number;
  readonly warnings: string[];
}

/**
 * Численный интегратор теплового баланса (схема Рунге-Кутты 2-го порядка / метод Хойна).
 * Решает систему обыкновенных дифференциальных уравнений (ОДУ):
 *
 * C_liquid * dT_liquid / dt = -G_lv * (T_liquid - T_vessel) - G_la * (T_liquid - T_ambient)
 * C_vessel * dT_vessel / dt =  G_lv * (T_liquid - T_vessel) - G_va * (T_vessel - T_ambient)
 *
 * Где:
 * - C_liquid = V_liquid_ml * 10^-3 kg * 4184 J/(kg·K)
 * - C_vessel = vesselMass_g * 10^-3 kg * materialSpecificHeat J/(kg·K)
 * - G_lv: проводимость жидкость–сосуд (Вт/К)
 * - G_va: проводимость сосуд–воздух (Вт/К)
 * - G_la: проводимость поверхность жидкости–воздух (Вт/К)
 */
export function integrateThermalStep(
  initialState: ThermalState,
  profile: VesselThermalProfile,
  durationSeconds: number,
  timeStepSeconds: number = DEFAULT_INTEGRATOR_TIME_STEP_SECONDS,
  samplingIntervalSeconds = 1.0
): IntegrationStepResult {
  const warnings: string[] = [];

  // Валидация входных физических величин
  const duration = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 0);
  const volumeMl = Math.max(0, Number.isFinite(initialState.liquidVolumeMl) ? initialState.liquidVolumeMl : 0);
  let tLiquid = Number.isFinite(initialState.liquidTemperatureC) ? initialState.liquidTemperatureC : initialState.ambientTemperatureC;
  let tVessel = Number.isFinite(initialState.vesselTemperatureC) ? initialState.vesselTemperatureC : initialState.ambientTemperatureC;
  const tAmbient = Number.isFinite(initialState.ambientTemperatureC) ? initialState.ambientTemperatureC : 22.0;

  // Теплоёмкость стенок сосуда: C_vessel = m_kg * c_p [Дж/К]
  const vesselMassKg = Math.max(0.01, profile.vesselMassGrams * 0.001);
  const cVessel = vesselMassKg * Math.max(100, profile.materialSpecificHeatJPerKgK);

  // Теплоёмкость жидкости: C_liquid = V_ml * 10^-3 kg * 4184 [Дж/К]
  const liquidMassKg = volumeMl * WATER_DENSITY_KG_PER_ML;
  const cLiquid = liquidMassKg * SPECIFIC_HEAT_WATER_J_PER_KG_K;

  const gLv = Math.max(0, profile.conductanceLiquidVesselWPerK);
  const gVa = Math.max(0, profile.conductanceVesselAmbientWPerK);
  const gLa = Math.max(0, profile.conductanceLiquidAmbientWPerK);

  // Физические границы допустимых температур (2-й закон термодинамики: без внешнего источника
  // температура не может превысить максимум системы или упасть ниже окружающей среды / исходного минимума)
  const lowerBound = Math.min(tLiquid, tVessel, tAmbient);
  const upperBound = Math.max(tLiquid, tVessel, tAmbient);

  const curvePoints: ThermalSimulationPoint[] = [];

  // Фиксируем начальную точку
  curvePoints.push({
    timeSeconds: 0,
    liquidTemperatureC: Math.round(tLiquid * 100) / 100,
    vesselTemperatureC: Math.round(tVessel * 100) / 100,
    liquidVolumeMl: volumeMl,
  });

  if (duration === 0) {
    return {
      finalState: { ...initialState, elapsedSeconds: 0 },
      curvePoints,
      minLiquidTempC: tLiquid,
      maxLiquidTempC: tLiquid,
      minVesselTempC: tVessel,
      maxVesselTempC: tVessel,
      warnings,
    };
  }

  let minLiquid = tLiquid;
  let maxLiquid = tLiquid;
  let minVessel = tVessel;
  let maxVessel = tVessel;

  // Функция производных dT/dt
  const computeDerivatives = (tl: number, tv: number): { dTl: number; dTv: number } => {
    let dTl = 0;
    if (cLiquid > 0 && volumeMl > 0) {
      // Поток от жидкости к сосуду и в воздух
      const heatFluxToVessel = gLv * (tl - tv);
      const heatFluxToAmbient = gLa * (tl - tAmbient);
      dTl = (-heatFluxToVessel - heatFluxToAmbient) / cLiquid;
    }

    let dTv = 0;
    if (cVessel > 0) {
      // Приток от жидкости (если жидкость есть) минус потери в окружающую среду
      const heatFluxFromLiquid = volumeMl > 0 ? gLv * (tl - tv) : 0;
      const heatFluxToAmbient = gVa * (tv - tAmbient);
      dTv = (heatFluxFromLiquid - heatFluxToAmbient) / cVessel;
    }

    return { dTl, dTv };
  };

  const dt = Math.min(0.2, Math.max(0.01, timeStepSeconds));
  let currentTime = 0;
  let nextSampleTime = samplingIntervalSeconds;

  while (currentTime < duration) {
    const step = Math.min(dt, duration - currentTime);

    // Метод Рунге-Кутты 2-го порядка (метод Хойна)
    const k1 = computeDerivatives(tLiquid, tVessel);

    const tlPredict = tLiquid + step * k1.dTl;
    const tvPredict = tVessel + step * k1.dTv;

    const k2 = computeDerivatives(tlPredict, tvPredict);

    tLiquid += (step / 2) * (k1.dTl + k2.dTl);
    tVessel += (step / 2) * (k1.dTv + k2.dTv);

    // Защита от численных артефактов и контроль границ
    if (!Number.isFinite(tLiquid) || !Number.isFinite(tVessel)) {
      warnings.push('Численная неустойчивость интегратора предотвращена; использована стабилизация границ.');
      tLiquid = Math.min(upperBound, Math.max(lowerBound, tLiquid || tAmbient));
      tVessel = Math.min(upperBound, Math.max(lowerBound, tVessel || tAmbient));
    } else {
      tLiquid = Math.min(upperBound, Math.max(lowerBound, tLiquid));
      tVessel = Math.min(upperBound, Math.max(lowerBound, tVessel));
    }

    currentTime += step;

    if (volumeMl > 0) {
      minLiquid = Math.min(minLiquid, tLiquid);
      maxLiquid = Math.max(maxLiquid, tLiquid);
    }
    minVessel = Math.min(minVessel, tVessel);
    maxVessel = Math.max(maxVessel, tVessel);

    // Сэмплирование точек для графика
    if (currentTime >= nextSampleTime || currentTime >= duration - 1e-6) {
      curvePoints.push({
        timeSeconds: Math.round(currentTime * 10) / 10,
        liquidTemperatureC: Math.round(tLiquid * 100) / 100,
        vesselTemperatureC: Math.round(tVessel * 100) / 100,
        liquidVolumeMl: volumeMl,
      });
      nextSampleTime += samplingIntervalSeconds;
    }
  }

  // Если сосуд был пуст, фиксируем температуру жидкости равной температуре стенок
  if (volumeMl <= 0) {
    tLiquid = tVessel;
    minLiquid = tVessel;
    maxLiquid = tVessel;
  }

  return {
    finalState: {
      liquidVolumeMl: volumeMl,
      liquidTemperatureC: tLiquid,
      vesselTemperatureC: tVessel,
      ambientTemperatureC: tAmbient,
      elapsedSeconds: duration,
    },
    curvePoints,
    minLiquidTempC: minLiquid,
    maxLiquidTempC: maxLiquid,
    minVesselTempC: minVessel,
    maxVesselTempC: maxVessel,
    warnings,
  };
}
