import { TeaVariety } from '../types';
import { ALL_TEA_MAP } from '../data/teaData';

/**
 * Base RGB and alpha values for each tea type liquor color.
 */
export function getBaseTypeRgb(type: string): [number, number, number, number] {
  switch (type) {
    case 'green':
      return [175, 205, 100, 0.88];
    case 'white':
      return [220, 205, 130, 0.85];
    case 'yellow':
      return [235, 190, 80, 0.88];
    case 'oolong_ball':
      return [225, 170, 65, 0.90];
    case 'oolong_strip':
      return [215, 145, 50, 0.92];
    case 'red':
    case 'gaba_red':
      return [185, 65, 25, 0.95];
    case 'gaba_oolong':
      return [210, 130, 45, 0.92];
    case 'sheng_puerh':
      return [195, 140, 40, 0.90];
    case 'shou_puerh':
      return [105, 32, 12, 0.98];
    case 'heicha':
      return [90, 38, 16, 0.98];
    default:
      return [217, 119, 6, 0.90];
  }
}

/**
 * Calculates visual liquor color CSS string based on tea type, blend components,
 * and steep progression / TDS.
 */
export function getLiquorColor(tea: TeaVariety, steepNum: number, steepTds?: number): string {
  const steepFactor = steepNum <= 0 
    ? 0.35 
    : steepNum <= 4 
    ? 0.5 + (steepNum * 0.1) 
    : Math.max(0.45, 0.9 - ((steepNum - 4) * 0.05));
  const factor = Math.min(1, Math.max(0.3, steepTds ? Math.min(1, steepTds / 280) : steepFactor));

  if (tea.categoryGroup === 'blend' && tea.blendComponents && tea.blendComponents.length > 0) {
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
    tea.blendComponents.forEach((comp) => {
      const compTea = ALL_TEA_MAP.get(comp.teaId);
      const compType = compTea ? compTea.type : 'custom';
      const frac = comp.ratioFraction || (1 / tea.blendComponents!.length);
      const [r, g, b, baseA] = getBaseTypeRgb(compType);
      rSum += r * frac;
      gSum += g * frac;
      bSum += b * frac;
      aSum += baseA * frac;
    });
    return `rgba(${Math.round(rSum)}, ${Math.round(gSum)}, ${Math.round(bSum)}, ${(factor * aSum).toFixed(2)})`;
  }

  const [r, g, b, baseA] = getBaseTypeRgb(tea.type);
  return `rgba(${r}, ${g}, ${b}, ${(factor * baseA).toFixed(2)})`;
}
