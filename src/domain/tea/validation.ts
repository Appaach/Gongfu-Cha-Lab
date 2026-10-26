/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeaSample, isKnownValue } from './types.ts';

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

  // Проверка водопоглощения (типично от 1.5 до 4.0 г воды на г листа)
  if (isKnownValue(tea.waterAbsorptionRatio)) {
    const val = tea.waterAbsorptionRatio.value;
    if (val <= 0) {
      issues.push({ field: 'waterAbsorptionRatio', message: 'Коэффициент водопоглощения должен быть положительным', severity: 'error' });
    } else if (val < 1.5 || val > 4.5) {
      issues.push({ field: 'waterAbsorptionRatio', message: 'Водопоглощение вне типичного диапазона (1.5 – 4.5 г/г)', severity: 'warning' });
    }
  }

  // Проверка суммарной доли экстрактивных веществ (типично 25% – 55%)
  if (isKnownValue(tea.totalSolubleFraction)) {
    const val = tea.totalSolubleFraction.value;
    if (val <= 0 || val > 100) {
      issues.push({ field: 'totalSolubleFraction', message: 'Доля растворимого остатка должна быть от 0% до 100%', severity: 'error' });
    } else if (val < 20 || val > 60) {
      issues.push({ field: 'totalSolubleFraction', message: 'Доля экстрактивных веществ вне типичного диапазона для чая (20% – 60%)', severity: 'warning' });
    }
  }

  // Проверка содержания кофеина (обычно 1% – 6%)
  if (isKnownValue(tea.caffeineEstimate)) {
    const val = tea.caffeineEstimate.value;
    if (val < 0 || val > 10) {
      issues.push({ field: 'caffeineEstimate', message: 'Содержание кофеина вне физиологического диапазона Camellia sinensis (0% – 10%)', severity: 'warning' });
    }
  }

  return issues;
}
