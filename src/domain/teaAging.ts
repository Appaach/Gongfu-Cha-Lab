import { TeaVariety } from '../types';

/**
 * Determines whether a tea variety can be aged (подлежит выдержке).
 * Sheng Puerh, Shou Puerh, Hei Cha, White tea, and specific Lao Oolongs mature with age.
 * Green, Yellow, Red, GABA, fresh oolongs, and blends cannot be aged.
 */
export function canTeaAge(tea?: TeaVariety | null): boolean {
  if (!tea) return false;
  if (tea.categoryGroup === 'blend') return false;
  if (tea.canAge !== undefined) return tea.canAge;

  if (tea.categoryGroup === 'generic') {
    return (
      tea.type === 'sheng_puerh' ||
      tea.type === 'shou_puerh' ||
      tea.type === 'heicha' ||
      (tea.type === 'white' && tea.id.includes('aged'))
    );
  }

  if (
    tea.type === 'sheng_puerh' ||
    tea.type === 'shou_puerh' ||
    tea.type === 'heicha' ||
    tea.type === 'white'
  ) {
    return true;
  }

  const lowerId = tea.id.toLowerCase();
  const lowerName = tea.nameRu.toLowerCase();
  if (
    lowerId.includes('lao') ||
    lowerId.includes('aged') ||
    lowerId.includes('vintage') ||
    lowerName.includes('лао ча') ||
    lowerName.includes('лао улун')
  ) {
    return true;
  }

  return false;
}

/**
 * Removes words and markers indicating age or aging degree from tea titles for teas where vintage year is configurable.
 */
export function cleanTeaTitleForDisplay(name: string, canAge: boolean = true): string {
  if (!name) return '';
  if (!canAge) return name;

  let cleaned = name;

  // Remove parentheses with years of age: "(X лет)", "(X года)", "(X год)"
  cleaned = cleaned.replace(/\s*\(\s*\d+\s*(лет|года|год)\s*\)/gi, '');

  // Remove standalone fixed years in brackets or at end, e.g. "(Мэнхай 2018)" -> "(Мэнхай)", or " 2003", "(2018)"
  cleaned = cleaned.replace(/\s*\b(19\d\d|20\d\d)\b/g, '');

  // Remove "выдержанный", "выдержанная", "выдержанное", "выдержанные"
  cleaned = cleaned.replace(/\bвыдержанн[а-я]+\b/gi, '');

  // Clean empty brackets or dangling slashes / dashes
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  cleaned = cleaned.replace(/\/\s*\)/g, ')');
  cleaned = cleaned.replace(/\(\s*\//g, '(');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned.trim();
}
