/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createValueWithOrigin } from '../tea/types.ts';
import {
  BrewingMethodDescriptor,
  BrewingMethodId,
  BrewingSessionConfig,
  BrewingVessel,
  GongfuStepConfig,
  LiuGenPaoStepConfig,
  LazyMugTimelineEvent,
  WaterProfile,
} from './types.ts';

export const BREWING_METHODS: Record<BrewingMethodId, BrewingMethodDescriptor> = {
  gongfu_cha: {
    id: 'gongfu_cha',
    name: 'Гунфу Ча (Полный слив)',
    nativeName: '工夫茶',
    summary: 'Последовательные короткие проливы с практически полным сливом настоя после каждого шага.',
    physicalMechanism: 'Импульсная нестационарная экстракция. На каждом шаге свежая порция воды взаимодействует со смачиваемым листом; после слива между листьями остаётся лишь капиллярно удерживаемая влага.',
    typicalRatioRangeDescription: '4.0 – 8.0 г сухого листа на 100 мл фактической заливки (гидромодуль от 1:12 до 1:25 г:мл)',
    defaultStepsOrEventsCount: 6,
  },
  liu_gen_pao: {
    id: 'liu_gen_pao',
    name: 'Лю Гэнь Пао (Сохранение корней)',
    nativeName: '留根泡',
    summary: 'Слив части настоя с сохранением буферного «корня» (30–50% от полного объёма в сосуде) перед каждым доливом.',
    physicalMechanism: 'Ступенчатое разбавление с непрерывным буферным раствором. Доля удержания рассчитывается строго от ПОЛНОГО объёма жидкости перед сливом, а не от объёма долитой воды.',
    typicalRatioRangeDescription: '3.0 – 6.0 г сухого листа на 100 мл номинального объёма (гидромодуль от 1:16 до 1:33 г:мл)',
    defaultStepsOrEventsCount: 4,
  },
  lazy_mug: {
    id: 'lazy_mug',
    name: 'Открытое настаивание (В кружке)',
    nativeName: '杯泡法 / 爷爷泡茶',
    summary: 'Листья непрерывно контактируют с водой на дне сосуда. Настой отпивается и разбавляется доливами во времени.',
    physicalMechanism: 'Непрерывная диффузия в остывающем объёме при высоком разбавлении. Экстракция не прерывается между событиями питья и долива.',
    typicalRatioRangeDescription: '1.0 – 2.5 г сухого листа на 100 мл воды (гидромодуль от 1:40 до 1:100 г:мл)',
    defaultStepsOrEventsCount: 4,
  },
};

export const DEFAULT_VESSELS: BrewingVessel[] = [
  {
    id: 'vessel-gaiwan-110',
    name: 'Фарфоровая гайвань 110 мл',
    material: 'porcelain',
    volumeMl: 110,
    thermalInertiaFactor: 0.45,
    wallThicknessMm: 2.2,
    notes: 'Тонкостенный высокотемпературный фарфор. Номинальная вместимость 110 мл (фактический рабочий объём заливки обычно 90–100 мл).',
  },
  {
    id: 'vessel-yixing-130',
    name: 'Исинский чайник (Цзы Ни) 130 мл',
    material: 'yixing_clay',
    volumeMl: 130,
    thermalInertiaFactor: 0.82,
    wallThicknessMm: 3.5,
    notes: 'Пористая глина высокой теплоемкости. Номинальная вместимость 130 мл.',
  },
  {
    id: 'vessel-glass-mug-350',
    name: 'Боросиликатная кружка 350 мл',
    material: 'glass',
    volumeMl: 350,
    thermalInertiaFactor: 0.35,
    wallThicknessMm: 1.8,
    notes: 'Прозрачное стекло, открытая форма. Вместимость 350 мл для открытого настаивания.',
  },
];

/**
 * Типовые профили воды с явным обозначением статуса допущения (isModelPreset: true).
 */
export const DEFAULT_WATER_PROFILES: WaterProfile[] = [
  {
    id: 'water-soft-preset',
    name: 'Мягкая фильтрованная вода (модельное допущение)',
    isModelPreset: true,
    presetDescription: 'Оценочный типовой профиль для демонстрации: мягкая вода обратного осмоса с умеренной реминерализацией. Не является лабораторным анализом вашей воды.',
    mineralizationTdsMgL: createValueWithOrigin(45, 'model_profile', 'мг/л', {
      sourceNotes: 'Условный модельный ориентир',
    }),
    generalHardnessDgh: createValueWithOrigin(1.8, 'model_profile', '°dGH', {
      sourceNotes: 'Оценочный ориентир общей жесткости',
    }),
    carbonateHardnessDkh: createValueWithOrigin(1.2, 'model_profile', '°dKH', {
      sourceNotes: 'Оценочный ориентир карбонатной жесткости',
    }),
    ph: createValueWithOrigin(6.8, 'model_profile', 'ед.', {
      sourceNotes: 'Оценочный модельный уровень pH',
    }),
  },
  {
    id: 'water-spring-preset',
    name: 'Родниковая вода умеренной минерализации (модельное допущение)',
    isModelPreset: true,
    presetDescription: 'Оценочный типовой профиль родниковой воды средней минерализации.',
    mineralizationTdsMgL: createValueWithOrigin(115, 'model_profile', 'мг/л', {
      sourceNotes: 'Условный модельный ориентир',
    }),
    generalHardnessDgh: createValueWithOrigin(4.2, 'model_profile', '°dGH', {
      sourceNotes: 'Оценочный ориентир',
    }),
    carbonateHardnessDkh: createValueWithOrigin(3.1, 'model_profile', '°dKH', {
      sourceNotes: 'Оценочный ориентир',
    }),
    ph: createValueWithOrigin(7.3, 'model_profile', 'ед.', {
      sourceNotes: 'Оценочный ориентир',
    }),
  },
  {
    id: 'water-user-custom',
    name: 'Пользовательская вода (без допущений)',
    isModelPreset: false,
    presetDescription: 'Профиль с неизвестными по умолчанию характеристиками. Значения не подменяются скрытыми числами.',
    mineralizationTdsMgL: createValueWithOrigin<number>(null, 'unknown', 'мг/л'),
    generalHardnessDgh: createValueWithOrigin<number>(null, 'unknown', '°dGH'),
    carbonateHardnessDkh: createValueWithOrigin<number>(null, 'unknown', '°dKH'),
    ph: createValueWithOrigin<number>(null, 'unknown', 'ед.'),
  },
];

export function createDefaultGongfuSteps(
  pourVolumeMl: number,
  baseTempC: number
): GongfuStepConfig[] {
  return [
    { stepNumber: 1, infusionTimeSeconds: 10, pourWaterVolumeMl: pourVolumeMl, waterTemperatureC: baseTempC },
    { stepNumber: 2, infusionTimeSeconds: 12, pourWaterVolumeMl: pourVolumeMl, waterTemperatureC: baseTempC },
    { stepNumber: 3, infusionTimeSeconds: 15, pourWaterVolumeMl: pourVolumeMl, waterTemperatureC: baseTempC },
    { stepNumber: 4, infusionTimeSeconds: 20, pourWaterVolumeMl: pourVolumeMl, waterTemperatureC: baseTempC },
    { stepNumber: 5, infusionTimeSeconds: 30, pourWaterVolumeMl: pourVolumeMl, waterTemperatureC: baseTempC },
    { stepNumber: 6, infusionTimeSeconds: 45, pourWaterVolumeMl: pourVolumeMl, waterTemperatureC: baseTempC },
  ];
}

export function createDefaultLiuGenPaoSteps(
  initialWaterVolumeMl: number,
  baseTempC: number
): LiuGenPaoStepConfig[] {
  // На шаге 1 заливается initialWaterVolumeMl, сохраняется 40% от полного объема перед сливом.
  // На шагах 2+ доливается объем, компенсирующий слитую порцию: ~60% от вместимости.
  const refillVolume = Math.round(initialWaterVolumeMl * 0.6);
  return [
    { stepNumber: 1, infusionTimeSeconds: 25, addedWaterVolumeMl: initialWaterVolumeMl, addedWaterTemperatureC: baseTempC, retainedLiquorFractionOfTotal: 0.4 },
    { stepNumber: 2, infusionTimeSeconds: 30, addedWaterVolumeMl: refillVolume, addedWaterTemperatureC: baseTempC, retainedLiquorFractionOfTotal: 0.4 },
    { stepNumber: 3, infusionTimeSeconds: 45, addedWaterVolumeMl: refillVolume, addedWaterTemperatureC: baseTempC, retainedLiquorFractionOfTotal: 0.4 },
    { stepNumber: 4, infusionTimeSeconds: 60, addedWaterVolumeMl: refillVolume, addedWaterTemperatureC: baseTempC, retainedLiquorFractionOfTotal: 0.4 },
  ];
}

/**
 * Типовой демонстрационный сценарий для кружки.
 * ВНИМАНИЕ: Это модельное допущение, а не фактическое поведение конкретного пользователя.
 */
export function createDefaultLazyMugEvents(
  initialVolumeMl: number,
  baseTempC: number
): LazyMugTimelineEvent[] {
  return [
    {
      type: 'initial_pour',
      timestampSeconds: 0,
      waterVolumeMl: initialVolumeMl,
      waterTemperatureC: baseTempC,
    },
    {
      type: 'sip_consumption',
      timestampSeconds: 240, // 4 мин: отпито 120 мл настоя
      consumedVolumeMl: Math.round(initialVolumeMl * 0.4),
    },
    {
      type: 'water_refill',
      timestampSeconds: 360, // 6 мин: долив горячей воды
      addedWaterVolumeMl: Math.round(initialVolumeMl * 0.4),
      addedWaterTemperatureC: baseTempC,
    },
    {
      type: 'session_end',
      timestampSeconds: 900, // 15 мин: завершение сессии
    },
  ];
}

export function createDefaultSession(
  methodId: BrewingMethodId = 'gongfu_cha',
  teaId = 'tea-longjing'
): BrewingSessionConfig {
  const waterProfile = DEFAULT_WATER_PROFILES[0];

  if (methodId === 'gongfu_cha') {
    const vessel = DEFAULT_VESSELS[0]; // Гайвань 110 мл
    const actualPourVolume = 100;      // Рабочая заливка в 110 мл гайвань
    const leafMass = 6.0;              // 6 г на 100 мл заливки
    const tempC = 90;
    return {
      methodId: 'gongfu_cha',
      teaId,
      vessel,
      leafMassGrams: leafMass,
      baseWaterTemperatureC: tempC,
      waterProfile,
      steps: createDefaultGongfuSteps(actualPourVolume, tempC),
    };
  }

  if (methodId === 'liu_gen_pao') {
    const vessel = DEFAULT_VESSELS[0]; // Гайвань 110 мл
    const initialPour = 100;
    const leafMass = 5.0;
    const tempC = 90;
    return {
      methodId: 'liu_gen_pao',
      teaId,
      vessel,
      leafMassGrams: leafMass,
      baseWaterTemperatureC: tempC,
      waterProfile,
      steps: createDefaultLiuGenPaoSteps(initialPour, tempC),
    };
  }

  // lazy_mug
  const vessel = DEFAULT_VESSELS[2]; // Кружка 350 мл
  const initialPour = 300;
  const leafMass = 3.5;
  const tempC = 88;
  return {
    methodId: 'lazy_mug',
    teaId,
    vessel,
    leafMassGrams: leafMass,
    baseWaterTemperatureC: tempC,
    initialWaterVolumeMl: initialPour,
    waterProfile,
    timelineEvents: createDefaultLazyMugEvents(initialPour, tempC),
    scenarioType: 'preset_assumption',
  };
}
