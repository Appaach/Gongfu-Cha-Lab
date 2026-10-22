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
  retainedRootFraction?: number;
  coolingTimeConstantSec?: number;
  ambientTempC?: number;
}

/**
 * Cup-timeline presentation derived from the shared physical simulation.
 * Concentration between simulated stage endpoints is linearly interpolated for display;
 * this function does not run a separate extraction-kinetics model.
 */
export function calculateContinuousInfusionTimeline({
  simulationResults,
  waterTemp,
  waterVolume,
  steepsCount,
  cycleDurationSec,
  retainedRootFraction = 0.33,
  coolingTimeConstantSec = 280,
  ambientTempC = 22,
}: ContinuousInfusionParams): ContinuousInfusionPoint[] {
  const points: ContinuousInfusionPoint[] = [];
  const fallbackDuration = Math.max(30, cycleDurationSec || 180);
  const cycleDurations = simulationResults.length > 0
    ? simulationResults.slice(0, Math.max(1, steepsCount)).map((row) => Math.max(1, row.timeSec || fallbackDuration))
    : [fallbackDuration];
  const cycleStarts: number[] = [];
  let totalDurationSec = 0;
  for (const duration of cycleDurations) {
    cycleStarts.push(totalDurationSec);
    totalDurationSec += duration;
  }
  const safeTotalDurationSec = Math.min(900, Math.max(1, totalDurationSec));
  const base0: SteepKineticData | undefined = simulationResults[0];

  let startTh = 0;
  let startCaf = 0;
  let startCat = 0;
  let startPoly = 0;
  let startTds = 0;
  let prevCycleIndex = -1;
  let curTh = 0;
  let curCaf = 0;
  let curCat = 0;
  let curPoly = 0;
  let curTds = 0;

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  for (let sec = 0; sec <= safeTotalDurationSec; sec += 15) {
    let currentCycle = 0;
    for (let i = 1; i < cycleStarts.length; i += 1) {
      if (sec >= cycleStarts[i]) currentCycle = i;
      else break;
    }
    currentCycle = Math.min(currentCycle, Math.max(0, cycleDurations.length - 1));
    const cycleStartSec = cycleStarts[currentCycle] ?? 0;
    const cycleLengthSec = cycleDurations[currentCycle] ?? fallbackDuration;
    const timeInCycle = Math.max(0, Math.min(cycleLengthSec, sec - cycleStartSec));
    const cycleData = simulationResults[currentCycle] ?? base0;
    if (!cycleData) continue;

    const targetTh = cycleData.theanineConcentration;
    const targetCaf = cycleData.caffeineConcentration;
    const targetCat = cycleData.catechinsConcentration;
    const targetPoly = cycleData.polysaccharidesConcentration;
    const targetTds = cycleData.tdsPpm;
    const isRefill = sec > 0 && currentCycle > prevCycleIndex;

    if (currentCycle !== prevCycleIndex) {
      if (prevCycleIndex >= 0) {
        const previous = simulationResults[prevCycleIndex] ?? base0;
        const retainedMl = previous?.retainedLiquidVolumeMl;
        const retainedRatio = retainedMl !== undefined
          ? clamp01(retainedMl / Math.max(1, waterVolume))
          : clamp01(retainedRootFraction);
        startTh = curTh * retainedRatio;
        startCaf = curCaf * retainedRatio;
        startCat = curCat * retainedRatio;
        startPoly = curPoly * retainedRatio;
        startTds = curTds * retainedRatio;
      } else {
        startTh = 0;
        startCaf = 0;
        startCat = 0;
        startPoly = 0;
        startTds = 0;
      }
      prevCycleIndex = currentCycle;
    }

    const progress = clamp01(timeInCycle / Math.max(1, cycleLengthSec));
    // Interpolate the concentration toward the model-calculated endpoint for this stage.
    curTh = startTh + (targetTh - startTh) * progress;
    curCaf = startCaf + (targetCaf - startCaf) * progress;
    curCat = startCat + (targetCat - startCat) * progress;
    curPoly = startPoly + (targetPoly - startPoly) * progress;
    curTds = startTds + (targetTds - startTds) * progress;

    const mixedTemp = cycleData.mixedTemperatureC ?? cycleData.waterTempC ?? waterTemp;
    const tau = Math.max(15, coolingTimeConstantSec * Math.pow(Math.max(0.25, waterVolume / 100), 0.35));
    const curTemp = ambientTempC + (mixedTemp - ambientTempC) * Math.exp(-timeInCycle / tau);

    let label: string | undefined;
    if (sec === 0) label = 'Заливка';
    else if (sec >= 120 && sec < 135) label = 'Первый глоток';
    else if (isRefill && timeInCycle === 0) label = 'Долив #' + (currentCycle + 1);

    points.push({
      minute: Math.round((sec / 60) * 100) / 100,
      sec,
      tempC: Math.round(curTemp * 10) / 10,
      theanine: Math.round(curTh * 10) / 10,
      caffeine: Math.round(curCaf * 10) / 10,
      catechins: Math.round(curCat * 10) / 10,
      polysaccharides: Math.round(curPoly * 10) / 10,
      tdsPpm: Math.round(curTds),
      isRefill,
      label,
    });
  }

  return points;
}
