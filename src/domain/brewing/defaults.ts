/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BrewingMethodDescriptor,
  BrewingMethodId,
  BrewingSessionConfig,
  BrewingStepConfig,
  BrewingVessel,
  WaterProfile,
} from './types.ts';

export const BREWING_METHODS: Record<BrewingMethodId, BrewingMethodDescriptor> = {
  gongfu_cha: {
    id: 'gongfu_cha',
    name: 'Гунфу Ча (Полный слив)',
    nativeName: '工夫茶',
    summary: 'Серия коротких проливов с максимальным опорожнением сосуда после каждого шага.',
    physicalMechanism: 'Импульсная нестационарная экстракция. На каждом шаге свежая порция воды взаимодействует со смачиваемым листом, минимизируя концентрационную поляризацию в пограничном слое.',
    typicalRatioRange: { min: 4.0, max: 8.0 }, // 4-8 г на 100 мл (1:12 – 1:25)
    defaultStepsCount: 6,
  },
  liu_gen_pao: {
    id: 'liu_gen_pao',
    name: 'Лю Гэнь Пао (Сохранение корней)',
    nativeName: '留根泡',
    summary: 'Слив 50–70% настоя с сохранением концентрированного «корня» (20–50%) в сосуде перед каждым доливом.',
    physicalMechanism: 'Ступенчатое разбавление с непрерывным буферным раствором. Снижает амплитуду скачков горечи и обеспечивает устойчивый вкусовой градиент на протяжении чаепития.',
    typicalRatioRange: { min: 3.0, max: 6.0 }, // 3-6 г на 100 мл
    defaultStepsCount: 5,
  },
  lazy_mug: {
    id: 'lazy_mug',
    name: 'Открытое настаивание (В кружке)',
    nativeName: '杯泡法 / 爷爷泡茶',
    summary: 'Листья остаются на дне кружки без фильтрации. Вода доливается по мере отпивания части напитка.',
    physicalMechanism: 'Непрерывная диффузия в остывающем объёме при высоком разбавлении. Экстракция лимитируется естественной конвекцией и постепенным падением температуры теплоотдачей стенок.',
    typicalRatioRange: { min: 1.0, max: 2.5 }, // 1-2.5 г на 100 мл (1:40 – 1:100)
    defaultStepsCount: 3,
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
    notes: 'Тонкостенный высокотемпературный фарфор, нейтрален к аромату, быстро рассеивает избыточное тепло.',
  },
  {
    id: 'vessel-yixing-130',
    name: 'Исинский чайник (Цзы Ни) 130 мл',
    material: 'yixing_clay',
    volumeMl: 130,
    thermalInertiaFactor: 0.82,
    wallThicknessMm: 3.5,
    notes: 'Пористая фиолетовая глина, высокая теплоемкость, сохраняет тепло для тёмных улунов и пуэров.',
  },
  {
    id: 'vessel-glass-mug-350',
    name: 'Боросиликатная кружка 350 мл',
    material: 'glass',
    volumeMl: 350,
    thermalInertiaFactor: 0.35,
    wallThicknessMm: 1.8,
    notes: 'Прозрачное стекло, открытый верх, подходит для ленивого заваривания и визуального контроля листа.',
  },
];

export const DEFAULT_WATER_PROFILE: WaterProfile = {
  id: 'water-soft-lab',
  name: 'Мягкая родниковая / Осмос с минерализацией',
  mineralizationTdsMgL: 45,
  ph: 6.8,
};

export function createDefaultSteps(methodId: BrewingMethodId, vesselVolume: number, baseTempC: number): BrewingStepConfig[] {
  switch (methodId) {
    case 'gongfu_cha':
      return [
        { stepNumber: 1, infusionTimeSeconds: 10, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
        { stepNumber: 2, infusionTimeSeconds: 12, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
        { stepNumber: 3, infusionTimeSeconds: 15, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
        { stepNumber: 4, infusionTimeSeconds: 20, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
        { stepNumber: 5, infusionTimeSeconds: 30, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
        { stepNumber: 6, infusionTimeSeconds: 45, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
      ];
    case 'liu_gen_pao':
      return [
        { stepNumber: 1, infusionTimeSeconds: 25, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC, retainedLiquorPercent: 40 },
        { stepNumber: 2, infusionTimeSeconds: 30, waterVolumeMl: Math.round(vesselVolume * 0.6), waterTemperatureC: baseTempC, retainedLiquorPercent: 40 },
        { stepNumber: 3, infusionTimeSeconds: 40, waterVolumeMl: Math.round(vesselVolume * 0.6), waterTemperatureC: baseTempC, retainedLiquorPercent: 40 },
        { stepNumber: 4, infusionTimeSeconds: 60, waterVolumeMl: Math.round(vesselVolume * 0.6), waterTemperatureC: baseTempC, retainedLiquorPercent: 40 },
      ];
    case 'lazy_mug':
      return [
        { stepNumber: 1, infusionTimeSeconds: 180, waterVolumeMl: vesselVolume, waterTemperatureC: baseTempC },
        { stepNumber: 2, infusionTimeSeconds: 240, waterVolumeMl: Math.round(vesselVolume * 0.5), waterTemperatureC: baseTempC },
        { stepNumber: 3, infusionTimeSeconds: 360, waterVolumeMl: Math.round(vesselVolume * 0.5), waterTemperatureC: baseTempC },
      ];
  }
}

export function createDefaultSession(
  methodId: BrewingMethodId = 'gongfu_cha',
  teaId = 'tea-longjing'
): BrewingSessionConfig {
  const vessel = methodId === 'lazy_mug' ? DEFAULT_VESSELS[2] : DEFAULT_VESSELS[0];
  const leafMassGrams = methodId === 'lazy_mug' ? 3.5 : 6.0;
  const baseWaterTemperatureC = 90;
  const steps = createDefaultSteps(methodId, vessel.volumeMl, baseWaterTemperatureC);

  return {
    methodId,
    teaId,
    vessel,
    leafMassGrams,
    baseWaterTemperatureC,
    waterProfile: DEFAULT_WATER_PROFILE,
    steps,
  };
}
