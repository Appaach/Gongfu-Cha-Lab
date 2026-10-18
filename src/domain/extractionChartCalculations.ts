import { SteepKineticData } from '../types';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Generates an ultra-smooth cubic Bezier spline SVG path string from a sequence of 2D points.
 */
export function generateSmoothBezierPath(pts: Point2D[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export interface ContinuousInfusionPoint {
  minute: number;
  sec: number;
  tempC: number;
  theanine: number;
  caffeine: number;
  catechins: number;
  polysaccharides: number;
  tdsPpm: number;
  isRefill: boolean;
  label?: string;
}

export interface ContinuousInfusionParams {
  simulationResults: SteepKineticData[];
  waterTemp: number;
  waterVolume: number;
  steepsCount: number;
  cycleDurationSec: number;
}

/**
 * Continuous minute-by-minute timeline extraction dynamics simulation for «Ленивый» метод (Бэй Пао Фа / Grandpa Cup).
 */
export function calculateContinuousInfusionTimeline({
  simulationResults,
  waterTemp,
  waterVolume,
  steepsCount,
  cycleDurationSec,
}: ContinuousInfusionParams): ContinuousInfusionPoint[] {
  const points: ContinuousInfusionPoint[] = [];

  const safeCycleDuration = Math.max(30, cycleDurationSec || 180);
  const totalMinutes = Math.min(15, Math.max(8, (steepsCount * safeCycleDuration) / 60));

  const base0 = simulationResults[0] || {
    theanineConcentration: 12,
    caffeineConcentration: 14,
    catechinsConcentration: 18,
    polysaccharidesConcentration: 10,
    tdsPpm: 350,
  };

  let startTh = 0;
  let startCaf = 0;
  let startCat = 0;
  let startPoly = 0;

  let prevCycleIndex = -1;
  let curTh = 0;
  let curCaf = 0;
  let curCat = 0;
  let curPoly = 0;

  for (let m = 0; m <= totalMinutes; m += 0.25) {
    const sec = Math.round(m * 60);
    const currentCycle = Math.floor(sec / Math.max(1, safeCycleDuration));
    const timeInCycle = sec % Math.max(1, safeCycleDuration);

    const cycleData = simulationResults[Math.min(currentCycle, simulationResults.length - 1)] || base0;
    const targetTh = cycleData.theanineConcentration;
    const targetCaf = cycleData.caffeineConcentration;
    const targetCat = cycleData.catechinsConcentration;
    const targetPoly = cycleData.polysaccharidesConcentration;

    const isRefill = sec > 0 && timeInCycle === 0;

    // Handle cycle transition (refill event)
    if (currentCycle !== prevCycleIndex) {
      if (prevCycleIndex >= 0) {
        // At refill moment: root liquor (1/3) remains diluted with fresh hot water (2/3)
        startTh = curTh * 0.33;
        startCaf = curCaf * 0.33;
        startCat = curCat * 0.33;
        startPoly = curPoly * 0.33;
      } else {
        startTh = 0;
        startCaf = 0;
        startCat = 0;
        startPoly = 0;
      }
      prevCycleIndex = currentCycle;
    }

    const curTemp = Math.round(22 + (waterTemp - 22) * Math.exp(-0.0028 * timeInCycle));

    // Continuous extraction progress: carryover concentration decays while fresh extraction from leaf pool develops
    const kExt = 0.016;
    const progress = 1 - Math.exp(-kExt * timeInCycle);
    const decay = Math.exp(-kExt * timeInCycle);

    curTh = startTh * decay + targetTh * progress;
    curCaf = startCaf * decay + targetCaf * progress;
    curCat = startCat * decay + targetCat * progress;
    curPoly = startPoly * decay + targetPoly * progress;

    const tds = Math.round((curTh + curCaf + curCat + curPoly) * 12.5);

    let label: string | undefined;
    if (m === 0) label = 'Заливка';
    else if (m === 2.0) label = '✨ Первый глоток!';
    else if (isRefill) label = `🫖 Долив #${currentCycle} (+${Math.round(waterVolume * 0.67)}мл)`;

    points.push({
      minute: m,
      sec,
      tempC: curTemp,
      theanine: Math.round(curTh * 10) / 10,
      caffeine: Math.round(curCaf * 10) / 10,
      catechins: Math.round(curCat * 10) / 10,
      polysaccharides: Math.round(curPoly * 10) / 10,
      tdsPpm: tds,
      isRefill,
      label,
    });
  }

  return points;
}
