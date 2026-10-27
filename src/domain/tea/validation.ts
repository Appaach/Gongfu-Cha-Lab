/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeaSample, isKnownValue, createValueWithOrigin, DataOriginType } from './types.ts';

export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

/**
 * Валидация физических границ характеристик чайного листа.
 * Гарантирует, что введенные пользователем параметры не нарушают законы физики.
 */
export function validateTeaSample(tea: TeaSample): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!tea.name || tea.name.trim().length === 0) {
    issues.push({ field: 'name', message: 'Название чая обязательно для заполнения', severity: 'error' });
  }

  // Проверка физического водопоглощения (типично от 1.5 до 4.5 г воды на г сухого листа)
  if (isKnownValue(tea.waterAbsorptionRatio)) {
    const val = tea.waterAbsorptionRatio.value;
    if (val <= 0) {
      issues.push({ field: 'waterAbsorptionRatio', message: 'Коэффициент водопоглощения должен быть положительным', severity: 'error' });
    } else if (val < 1.0 || val > 5.0) {
      issues.push({ field: 'waterAbsorptionRatio', message: 'Водопоглощение вне типичного физического диапазона (1.0 – 5.0 г/г)', severity: 'warning' });
    }
  }

  // Проверка насыпной плотности сухой навески (обычно 0.1 – 1.0 г/см³)
  if (isKnownValue(tea.leafBulkDensityGPerCm3)) {
    const val = tea.leafBulkDensityGPerCm3.value;
    if (val <= 0) {
      issues.push({ field: 'leafBulkDensityGPerCm3', message: 'Насыпная плотность должна быть положительной', severity: 'error' });
    } else if (val < 0.1 || val > 1.2) {
      issues.push({ field: 'leafBulkDensityGPerCm3', message: 'Насыпная плотность вне типичного диапазона для сушеного листа (0.1 – 1.2 г/см³)', severity: 'warning' });
    }
  }

  // Проверка размерной константы скорости гидратации (с⁻¹)
  if (tea.hydrationRateConstantPerSecond && isKnownValue(tea.hydrationRateConstantPerSecond)) {
    const val = tea.hydrationRateConstantPerSecond.value;
    if (val < 0) {
      issues.push({ field: 'hydrationRateConstantPerSecond', message: 'Константа скорости гидратации не может быть отрицательной', severity: 'error' });
    }
  }

  // Проверка суммарной доли экстрактивных веществ (% от массы сухого листа, типично 25% – 50%)
  if (isKnownValue(tea.totalExtractableFraction)) {
    const val = tea.totalExtractableFraction.value;
    if (val <= 0 || val > 100) {
      issues.push({ field: 'totalExtractableFraction', message: 'Доля растворимого сухого остатка должна быть от 0% до 100%', severity: 'error' });
    } else if (val < 20 || val > 55) {
      issues.push({ field: 'totalExtractableFraction', message: 'Доля экстрактивных веществ вне типичного диапазона Camellia sinensis (20% – 55%)', severity: 'warning' });
    }
  }

  // Проверка содержания кофеина (% от массы сухого листа, обычно 1.5% – 5.5%)
  if (isKnownValue(tea.caffeineFraction)) {
    const val = tea.caffeineFraction.value;
    if (val < 0 || val > 10) {
      issues.push({ field: 'caffeineFraction', message: 'Содержание кофеина вне биологического диапазона (0% – 10%)', severity: 'warning' });
    }
  }

  // Проверка на двойной подсчет: сумма известных компонентов не должна превышать суммарную долю экстракта
  if (isKnownValue(tea.totalExtractableFraction)) {
    const total = tea.totalExtractableFraction.value;
    let sumComponents = 0;
    if (isKnownValue(tea.caffeineFraction)) sumComponents += tea.caffeineFraction.value;
    if (isKnownValue(tea.theanineFraction)) sumComponents += tea.theanineFraction.value;
    if (isKnownValue(tea.totalPolyphenolsFraction)) sumComponents += tea.totalPolyphenolsFraction.value;

    if (sumComponents > total) {
      issues.push({
        field: 'totalExtractableFraction',
        message: `Сумма известных фракций (${sumComponents.toFixed(1)}%) превышает общий сухой экстракт (${total.toFixed(1)}%). Компоненты не могут существовать вне общей массы экстракта.`,
        severity: 'error',
      });
    }
  }

  return issues;
}

/**
 * Безопасная миграция пользовательских чаев из localStorage старых версий схемы.
 */
export function migrateLegacyCustomTea(raw: any): TeaSample {
  function mapOrigin(origin: any): DataOriginType {
    if (origin === 'measured') return 'measured';
    if (origin === 'literature') return 'literature';
    if (origin === 'model_profile' || origin === 'estimated') return 'model_profile';
    if (origin === 'user_defined') return 'user_defined';
    return 'unknown';
  }

  function readVal(oldObj: any, defaultUnit: string) {
    if (!oldObj || oldObj.origin === 'unknown' || oldObj.value === null || oldObj.value === undefined) {
      return createValueWithOrigin<number>(null, 'unknown', defaultUnit);
    }
    const origin = mapOrigin(oldObj.origin);
    const num = typeof oldObj.value === 'number' ? oldObj.value : parseFloat(oldObj.value);
    if (isNaN(num)) {
      return createValueWithOrigin<number>(null, 'unknown', defaultUnit);
    }
    return createValueWithOrigin<number>(num, origin, defaultUnit, {
      sourceNotes: oldObj.sourceNotes,
    });
  }

  return {
    id: raw.id || `custom-tea-${Date.now()}`,
    name: String(raw.name || 'Безымянный чай').trim(),
    nativeName: raw.nativeName ? String(raw.nativeName).trim() : undefined,
    category: raw.category || undefined,
    morphology: raw.morphology || undefined,
    originRegion: raw.originRegion ? String(raw.originRegion).trim() : undefined,
    cultivar: raw.cultivar ? String(raw.cultivar).trim() : undefined,
    producer: raw.producer ? String(raw.producer).trim() : undefined,
    harvestYear: typeof raw.harvestYear === 'number' && !isNaN(raw.harvestYear) ? raw.harvestYear : undefined,
    productionYear: typeof raw.productionYear === 'number' && !isNaN(raw.productionYear) ? raw.productionYear : undefined,
    roastLevel: raw.roastLevel || undefined,
    processingNotes: raw.processingNotes || undefined,

    // Физические параметры
    waterAbsorptionRatio: readVal(raw.waterAbsorptionRatio, 'г/г'),
    leafBulkDensityGPerCm3: readVal(raw.leafBulkDensityGPerCm3 || raw.leafDensityGPerCm3, 'г/см³'),
    uncalibratedHydrationSpeed: readVal(raw.uncalibratedHydrationSpeed || raw.hydrationSpeedFactor, 'ед.'),
    hydrationRateConstantPerSecond: readVal(raw.hydrationRateConstantPerSecond, 's^-1'),

    // Химические фракции (% от массы сухого листа)
    totalExtractableFraction: readVal(raw.totalExtractableFraction || raw.totalSolubleFraction, '%'),
    caffeineFraction: readVal(raw.caffeineFraction || raw.caffeineEstimate, '%'),
    totalPolyphenolsFraction: readVal(raw.totalPolyphenolsFraction || raw.polyphenolsEstimate, '%'),
    theanineFraction: readVal(raw.theanineFraction || raw.theanineEstimate, '%'),

    isCustom: true,
    // Личные дегустационные заметки удаляются из модели
  };
}
