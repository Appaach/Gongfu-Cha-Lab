/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VesselMaterial } from '../../domain/brewing/types.ts';
import { VesselThermalProfile } from './types.ts';

/**
 * Централизованный реестр предварительных модельных тепловых профилей стандартных сосудов.
 *
 * ВАЖНО:
 * Все параметры имеют статус происхождения 'model_profile'.
 * Они представляют собой физически обоснованные инженерные оценки (а не измерения конкретных предметов пользователя),
 * полученные из справочных данных по материаловедению (удельная теплоёмкость фарфора, глины и стекла)
 * и базовых коэффициентов конвективного теплообмена.
 * В будущем эти профили подлежат уточняющей лабораторной калибровке на термопарных стендах.
 */
export const VESSEL_THERMAL_PROFILES: Record<string, VesselThermalProfile> = {
  'vessel-gaiwan-110': {
    id: 'vessel-gaiwan-110',
    name: 'Фарфоровая гайвань 110 мл',
    material: 'porcelain',
    vesselMassGrams: 120, // Чаша ~75 г + крышка ~45 г
    materialSpecificHeatJPerKgK: 880, // Справочная теплоёмкость технического фарфора: 840–920 Дж/(кг·К)
    conductanceLiquidVesselWPerK: 4.2, // Конвективно-кондуктивная связь жидкость–стенки (Вт/К)
    conductanceVesselAmbientWPerK: 0.75, // Внешняя теплоотдача стенок в воздух (Вт/К)
    conductanceLiquidAmbientWPerK: 0.35, // Теплоотдача через щели накрытой крышки (Вт/К)
    origin: 'model_profile',
    basisNotes:
      'Оценочный модельный профиль: фарфор высокой плотности 120 г, c_p = 880 Дж/(кг·К). Эффективные проводимости ориентированы на типичные условия свободной конвекции при наличии крышки.',
  },

  'vessel-yixing-130': {
    id: 'vessel-yixing-130',
    name: 'Исинский чайник (Цзы Ни) 130 мл',
    material: 'yixing_clay',
    vesselMassGrams: 140, // Корпус чайника + крышка
    materialSpecificHeatJPerKgK: 920, // Справочная теплоёмкость пористой терракоты / цзыни: 880–960 Дж/(кг·К)
    conductanceLiquidVesselWPerK: 3.6, // Теплопередача через пористую структуру (Вт/К)
    conductanceVesselAmbientWPerK: 0.6, // Теплоотдача толстых глиняных стенок (Вт/К)
    conductanceLiquidAmbientWPerK: 0.12, // Плотная притёртая крышка и узкий носик минимизируют открытую поверхность (Вт/К)
    origin: 'model_profile',
    basisNotes:
      'Оценочный модельный профиль: пористая глина 140 г, c_p = 920 Дж/(кг·К). Уменьшенная теплоотдача с поверхности за счёт плотной геометрии крышки.',
  },

  'vessel-glass-mug-350': {
    id: 'vessel-glass-mug-350',
    name: 'Боросиликатная кружка 350 мл',
    material: 'glass',
    vesselMassGrams: 160,
    materialSpecificHeatJPerKgK: 830, // Справочная теплоёмкость боросиликатного стекла: 800–850 Дж/(кг·К)
    conductanceLiquidVesselWPerK: 3.2,
    conductanceVesselAmbientWPerK: 0.95, // Высокая наружная площадь цилиндрической кружки
    conductanceLiquidAmbientWPerK: 0.85, // Полностью открытое широкое зеркало жидкости без крышки
    origin: 'model_profile',
    basisNotes:
      'Оценочный модельный профиль: боросиликатное стекло 160 г, c_p = 830 Дж/(кг·К). Повышенная теплоотдача в окружающую среду из-за отсутствия крышки.',
  },
};

/**
 * Получить термодинамический профиль сосуда по идентификатору или синтезировать ориентировочный профиль по материалу.
 */
export function getVesselThermalProfile(
  vesselId: string,
  materialFallback: VesselMaterial = 'porcelain',
  volumeMlFallback = 120
): VesselThermalProfile {
  if (VESSEL_THERMAL_PROFILES[vesselId]) {
    return VESSEL_THERMAL_PROFILES[vesselId];
  }

  // Синтез типового профиля по материалу для пользовательских сосудов
  let specificHeat = 880;
  let estimatedMass = Math.round(volumeMlFallback * 1.1);
  let gLv = 4.0;
  let gVa = 0.8;
  let gLa = 0.4;

  if (materialFallback === 'yixing_clay') {
    specificHeat = 920;
    estimatedMass = Math.round(volumeMlFallback * 1.15);
    gLv = 3.6;
    gVa = 0.65;
    gLa = 0.15;
  } else if (materialFallback === 'glass') {
    specificHeat = 830;
    estimatedMass = Math.round(volumeMlFallback * 0.6);
    gLv = 3.2;
    gVa = 0.95;
    gLa = 0.8;
  } else if (materialFallback === 'stoneware') {
    specificHeat = 900;
    estimatedMass = Math.round(volumeMlFallback * 1.3);
    gLv = 3.8;
    gVa = 0.7;
    gLa = 0.3;
  }

  return {
    id: `profile-fallback-${vesselId}`,
    name: `Профиль сосуда (${materialFallback})`,
    material: materialFallback,
    vesselMassGrams: estimatedMass,
    materialSpecificHeatJPerKgK: specificHeat,
    conductanceLiquidVesselWPerK: gLv,
    conductanceVesselAmbientWPerK: gVa,
    conductanceLiquidAmbientWPerK: gLa,
    origin: 'model_profile',
    basisNotes: `Синтезированный оценочный профиль на основе материала (${materialFallback}) и объёма (${volumeMlFallback} мл).`,
  };
}
