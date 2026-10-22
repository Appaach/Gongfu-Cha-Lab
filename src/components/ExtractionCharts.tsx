import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { BrewingMethod, SteepKineticData } from '../types';
import { generateSmoothBezierPath, ContinuousInfusionPoint } from '../domain/extractionChartCalculations';

export interface ExtractionChartsProps {
  brewingMethod: BrewingMethod;
  steepsCount: number;
  chartSteepsData: SteepKineticData[];
  selectedSteepIndex: number;
  onSelectSteepIndex: (index: number) => void;
  lazyCupTimeline: ContinuousInfusionPoint[];
  adaptiveCustomBrewing?: { userSteepsCount: number } | null;
  showChartTheanine: boolean;
  setShowChartTheanine: (val: boolean) => void;
  showChartCaffeine: boolean;
  setShowChartCaffeine: (val: boolean) => void;
  showChartCatechins: boolean;
  setShowChartCatechins: (val: boolean) => void;
  showChartPolysaccharides: boolean;
  setShowChartPolysaccharides: (val: boolean) => void;
  showChartTemperature: boolean;
  setShowChartTemperature: (val: boolean) => void;
}

export const ExtractionCharts: React.FC<ExtractionChartsProps> = ({
  brewingMethod,
  steepsCount,
  chartSteepsData,
  selectedSteepIndex,
  onSelectSteepIndex,
  lazyCupTimeline,
  adaptiveCustomBrewing,
  showChartTheanine,
  setShowChartTheanine,
  showChartCaffeine,
  setShowChartCaffeine,
  showChartCatechins,
  setShowChartCatechins,
  showChartPolysaccharides,
  setShowChartPolysaccharides,
  showChartTemperature,
  setShowChartTemperature,
}) => {
  // Grandpa Cup Chart Paths
  const lazyCupPaths = useMemo(() => {
    if (lazyCupTimeline.length === 0) return null;
    const svgW = 650;
    const svgH = 200;
    const pLeft = 45;
    const pRight = 35;
    const pTop = 20;
    const pBottom = 35;
    const cW = svgW - pLeft - pRight;
    const cH = svgH - pTop - pBottom;

    const activeValues: number[] = [];
    if (showChartTheanine) activeValues.push(...lazyCupTimeline.map((pt) => pt.theanine));
    if (showChartCaffeine) activeValues.push(...lazyCupTimeline.map((pt) => pt.caffeine));
    if (showChartCatechins) activeValues.push(...lazyCupTimeline.map((pt) => pt.catechins));
    if (showChartPolysaccharides) activeValues.push(...lazyCupTimeline.map((pt) => pt.polysaccharides));

    const maxVal = Math.max(15, activeValues.length > 0 ? Math.max(...activeValues) : 15) * 1.15;
    const totalMins = lazyCupTimeline[lazyCupTimeline.length - 1]?.minute || 12;

    const getLx = (m: number) => pLeft + (m / totalMins) * cW;
    const getLy = (v: number) => pTop + cH - (v / maxVal) * cH;
    const getTempY = (tC: number) => pTop + cH - ((tC - 20) / 80) * cH;

    const thPts = lazyCupTimeline.map((pt) => ({ x: getLx(pt.minute), y: getLy(pt.theanine) }));
    const cafPts = lazyCupTimeline.map((pt) => ({ x: getLx(pt.minute), y: getLy(pt.caffeine) }));
    const catPts = lazyCupTimeline.map((pt) => ({ x: getLx(pt.minute), y: getLy(pt.catechins) }));
    const polyPts = lazyCupTimeline.map((pt) => ({ x: getLx(pt.minute), y: getLy(pt.polysaccharides) }));
    const tempPts = lazyCupTimeline.map((pt) => ({ x: getLx(pt.minute), y: getTempY(pt.tempC) }));

    return {
      svgW,
      svgH,
      pLeft,
      pRight,
      pTop,
      pBottom,
      cW,
      cH,
      maxVal,
      totalMins,
      getLx,
      getLy,
      getTempY,
      thPath: generateSmoothBezierPath(thPts),
      cafPath: generateSmoothBezierPath(cafPts),
      catPath: generateSmoothBezierPath(catPts),
      polyPath: generateSmoothBezierPath(polyPts),
      tempPath: generateSmoothBezierPath(tempPts),
    };
  }, [
    lazyCupTimeline,
    showChartTheanine,
    showChartCaffeine,
    showChartCatechins,
    showChartPolysaccharides,
  ]);

  // Gongfu Chart Dimensions and Scales
  const svgWidth = Math.max(650, chartSteepsData.length * 60 + 80);
  const svgHeight = 230;
  const padding = { top: 25, right: 35, bottom: 46, left: 45 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  const maxConcentration = useMemo(() => {
    let max = 1;
    chartSteepsData.forEach((d) => {
      if (showChartTheanine) max = Math.max(max, d.theanineConcentration);
      if (showChartCaffeine) max = Math.max(max, d.caffeineConcentration);
      if (showChartCatechins) max = Math.max(max, d.catechinsConcentration);
      if (showChartPolysaccharides) max = Math.max(max, d.polysaccharidesConcentration);
    });
    return Math.max(1, Math.ceil(max * 1.15));
  }, [
    chartSteepsData,
    showChartTheanine,
    showChartCaffeine,
    showChartCatechins,
    showChartPolysaccharides,
  ]);

  const getX = (index: number) => {
    if (chartSteepsData.length <= 1) return padding.left + chartW / 2;
    return padding.left + (index / (chartSteepsData.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    return padding.top + chartH - (val / maxConcentration) * chartH;
  };

  const { theaninePath, caffeinePath, catechinsPath, polysaccharidesPath } = useMemo(() => {
    const theanineCoords = chartSteepsData.map((d, i) => ({ x: getX(i), y: getY(d.theanineConcentration) }));
    const caffeineCoords = chartSteepsData.map((d, i) => ({ x: getX(i), y: getY(d.caffeineConcentration) }));
    const catechinsCoords = chartSteepsData.map((d, i) => ({ x: getX(i), y: getY(d.catechinsConcentration) }));
    const polysaccharidesCoords = chartSteepsData.map((d, i) => ({ x: getX(i), y: getY(d.polysaccharidesConcentration) }));

    return {
      theaninePath: generateSmoothBezierPath(theanineCoords),
      caffeinePath: generateSmoothBezierPath(caffeineCoords),
      catechinsPath: generateSmoothBezierPath(catechinsCoords),
      polysaccharidesPath: generateSmoothBezierPath(polysaccharidesCoords),
    };
  }, [chartSteepsData, maxConcentration, chartW, chartH]);

  if (brewingMethod === 'grandpa_cup' && lazyCupPaths) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h4 className="font-bold text-stone-900 text-base flex items-center space-x-2 font-serif">
              <TrendingUp className="w-4 h-4 text-amber-700" />
              <span>«Ленивый» метод (Бэй Пао Фа): График экстракции и остывания во времени</span>
            </h4>
            <p className="text-xs text-stone-500">
              Динамика L-теанина, кофеина, катехинов и остывания T(t) по закону Ньютона с доливами кипятка (0–12+ мин)
            </p>
          </div>

          {/* Interactive Legend & Compound Line Visibility Toggles */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setShowChartTheanine(!showChartTheanine)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                showChartTheanine
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                  : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
              }`}
              title="Скрыть/показать кривую L-Теанина"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span>L-Теанин</span>
            </button>

            <button
              type="button"
              onClick={() => setShowChartCaffeine(!showChartCaffeine)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                showChartCaffeine
                  ? 'bg-blue-50 border-blue-300 text-blue-950 font-bold'
                  : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
              }`}
              title="Скрыть/показать кривую Кофеина"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span>Кофеин</span>
            </button>

            <button
              type="button"
              onClick={() => setShowChartCatechins(!showChartCatechins)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                showChartCatechins
                  ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                  : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
              }`}
              title="Скрыть/показать кривую Катехинов"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
              <span>Катехины</span>
            </button>

            <button
              type="button"
              onClick={() => setShowChartPolysaccharides(!showChartPolysaccharides)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                showChartPolysaccharides
                  ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold'
                  : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
              }`}
              title="Скрыть/показать кривую Полисахаридов"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
              <span>Полисахариды</span>
            </button>

            <button
              type="button"
              onClick={() => setShowChartTemperature(!showChartTemperature)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                showChartTemperature
                  ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                  : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
              }`}
              title="Скрыть/показать кривую Температуры остывания"
            >
              <span className="w-2.5 h-0.5 bg-amber-600 font-bold"></span>
              <span>Температура °C</span>
            </button>
          </div>
        </div>

        {/* Continuous Timeline SVG Chart */}
        <div className="w-full overflow-x-auto pb-2 border border-stone-100 rounded-xl p-2 bg-stone-50/50">
          <svg
            viewBox={`0 0 ${lazyCupPaths.svgW} ${lazyCupPaths.svgH}`}
            style={{ width: `${lazyCupPaths.svgW}px`, minWidth: '100%', height: `${lazyCupPaths.svgH}px` }}
            className="select-none"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratioVal, i) => {
              const y = lazyCupPaths.pTop + lazyCupPaths.cH * (1 - ratioVal);
              const valLabel = Math.round(lazyCupPaths.maxVal * ratioVal);
              return (
                <g key={i}>
                  <line
                    x1={lazyCupPaths.pLeft}
                    y1={y}
                    x2={lazyCupPaths.svgW - lazyCupPaths.pRight}
                    y2={y}
                    stroke="#e7e5e4"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={lazyCupPaths.pLeft - 6}
                    y={y + 3}
                    fontSize="9"
                    fill="#78716c"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    {valLabel}
                  </text>
                </g>
              );
            })}

            {/* Minute Markers */}
            {Array.from({ length: Math.floor(lazyCupPaths.totalMins) + 1 }).map((_, m) => {
              const x = lazyCupPaths.getLx(m);
              return (
                <g key={m}>
                  <line
                    x1={x}
                    y1={lazyCupPaths.pTop}
                    x2={x}
                    y2={lazyCupPaths.pTop + lazyCupPaths.cH}
                    stroke="var(--color-chart-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={lazyCupPaths.pTop + lazyCupPaths.cH + 16}
                    fontSize="9.5"
                    fill="var(--color-chart-text)"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {m} мин
                  </text>
                </g>
              );
            })}

            {/* Refill event vertical lines */}
            {lazyCupTimeline
              .filter((pt) => pt.isRefill || pt.minute === 2.0)
              .map((pt, i) => {
                const x = lazyCupPaths.getLx(pt.minute);
                const isSip = pt.minute === 2.0;
                return (
                  <g key={i}>
                    <line
                      x1={x}
                      y1={lazyCupPaths.pTop}
                      x2={x}
                      y2={lazyCupPaths.pTop + lazyCupPaths.cH}
                      stroke={isSip ? '#10b981' : '#d97706'}
                      strokeWidth={isSip ? 1.5 : 2}
                      strokeDasharray={isSip ? '2 2' : '4 3'}
                    />
                    {pt.label && (
                      <text
                        x={x}
                        y={lazyCupPaths.pTop - 4}
                        fontSize="8.5"
                        fontWeight="bold"
                        fill={isSip ? '#047857' : '#92400e'}
                        textAnchor="middle"
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                );
              })}

            {/* Compound Curves */}
            {showChartTheanine && (
              <path d={lazyCupPaths.thPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            )}
            {showChartCaffeine && (
              <path d={lazyCupPaths.cafPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
            )}
            {showChartCatechins && (
              <path d={lazyCupPaths.catPath} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" />
            )}
            {showChartPolysaccharides && (
              <path d={lazyCupPaths.polyPath} fill="none" stroke="#9333ea" strokeWidth="2.5" strokeLinecap="round" />
            )}
            {showChartTemperature && (
              <path d={lazyCupPaths.tempPath} fill="none" stroke="#d97706" strokeWidth="2" strokeDasharray="4 3" />
            )}
          </svg>
        </div>
      </div>
    );
  }

  // Gongfu Multi-curve Chart
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h4 className="font-bold text-stone-900 text-base flex flex-wrap items-center gap-2 font-serif">
            <span className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-amber-700" />
              <span>
                Кинетические кривые экстракции ({steepsCount}{' '}
                {steepsCount === 1 ? 'пролив' : steepsCount < 5 ? 'пролива' : 'проливов'})
              </span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-100/80 text-amber-900 border border-amber-200/80 rounded-full font-semibold">
              Двухфракционная кинетика + Аррениус (оценка)
            </span>
          </h4>
          <p className="text-xs text-stone-500">
            Динамика концентрации соединений в каждом отдельном проливе (мг / 100 мл) с учетом непрерывной гидратации листа
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setShowChartTheanine(!showChartTheanine)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
              showChartTheanine
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
            }`}
            title="Скрыть/показать кривую L-Теанина"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            <span>L-Теанин</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChartCaffeine(!showChartCaffeine)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
              showChartCaffeine
                ? 'bg-blue-50 border-blue-300 text-blue-950 font-bold'
                : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
            }`}
            title="Скрыть/показать кривую Кофеина"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span>Кофеин</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChartCatechins(!showChartCatechins)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
              showChartCatechins
                ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
            }`}
            title="Скрыть/показать кривую Катехинов"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
            <span>Катехины</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChartPolysaccharides(!showChartPolysaccharides)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
              showChartPolysaccharides
                ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold'
                : 'bg-stone-100 border-stone-200 text-stone-400 line-through'
            }`}
            title="Скрыть/показать кривую Полисахаридов"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
            <span>Полисахариды</span>
          </button>

          {adaptiveCustomBrewing && adaptiveCustomBrewing.userSteepsCount > 0 && (
            <>
              <div className="w-px h-3.5 bg-stone-300 mx-0.5"></div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-amber-800"></span>
                <span className="text-amber-950 font-bold">Ваш факт</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-amber-800 font-bold">Адаптировано</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SVG Multi-curve Chart */}
      <div className="w-full overflow-x-auto pb-2 border border-stone-100 rounded-xl p-1 bg-stone-50/50">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: `${svgWidth}px`, minWidth: '100%', height: `${svgHeight}px` }}
          className="select-none"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratioVal, i) => {
            const y = padding.top + chartH * (1 - ratioVal);
            const valLabel = Math.round(maxConcentration * ratioVal);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="var(--color-chart-grid)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  fontSize="9"
                  fill="var(--color-chart-text)"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {valLabel}
                </text>
              </g>
            );
          })}

          {/* X Axis Steeps & Vertical Grid Lines */}
          {chartSteepsData.map((d, i) => {
            const x = getX(i);
            const isRinsePoint = d.steepNumber === 0;
            const isSelected = isRinsePoint
              ? selectedSteepIndex === -1
              : d.steepNumber - 1 === selectedSteepIndex;
            const stripeWidth = Math.min(
              9,
              Math.max(5, Math.round((chartW / Math.max(1, chartSteepsData.length - 1)) * 0.125))
            );
            return (
              <g
                key={i}
                className="cursor-pointer"
                onClick={() => onSelectSteepIndex(isRinsePoint ? -1 : d.steepNumber - 1)}
              >
                {/* Vertical highlight stripe for the selected steep */}
                {isSelected && (
                  <rect
                    x={x - stripeWidth / 2}
                    y={padding.top}
                    width={stripeWidth}
                    height={chartH}
                    fill="rgba(148, 163, 184, 0.2)"
                    stroke="rgba(100, 116, 139, 0.35)"
                    strokeWidth={1}
                    rx={2}
                  />
                )}
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartH}
                  stroke={isSelected ? 'var(--color-accent-solid)' : 'var(--color-chart-grid)'}
                  strokeWidth={isSelected ? 1.5 : 1}
                  strokeDasharray={isSelected ? '3 3' : undefined}
                />
                <text
                  x={x}
                  y={padding.top + chartH + 16}
                  fontSize="10"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  fill={isSelected ? 'var(--color-text-primary)' : 'var(--color-chart-text)'}
                  textAnchor="middle"
                >
                  {isRinsePoint ? `#0 (${d.timeSec}с)` : `#${d.steepNumber} (${d.timeSec}с)`}
                </text>
                {d.isCustomUserTime && (
                  <text
                    x={x}
                    y={padding.top + chartH + 27}
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="var(--color-accent-text)"
                    textAnchor="middle"
                  >
                    факт
                  </text>
                )}
                {d.isAdaptedReference && (
                  <text
                    x={x}
                    y={padding.top + chartH + 27}
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="var(--color-accent-text)"
                    textAnchor="middle"
                  >
                    адапт
                  </text>
                )}
              </g>
            );
          })}

          {/* Smooth Continuous Spline Data curves */}
          {showChartTheanine && (
            <path
              d={theaninePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showChartCaffeine && (
            <path
              d={caffeinePath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showChartCatechins && (
            <path
              d={catechinsPath}
              fill="none"
              stroke="#e11d48"
              strokeWidth="3.0"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showChartPolysaccharides && (
            <path
              d={polysaccharidesPath}
              fill="none"
              stroke="#9333ea"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points for current steeps */}
          {chartSteepsData.map((d, i) => {
            const x = getX(i);
            const isRinsePoint = d.steepNumber === 0;
            const isSelected = isRinsePoint
              ? selectedSteepIndex === -1
              : d.steepNumber - 1 === selectedSteepIndex;
            return (
              <g
                key={i}
                className="cursor-pointer"
                onClick={() => onSelectSteepIndex(isRinsePoint ? -1 : d.steepNumber - 1)}
              >
                <rect x={x - 18} y={padding.top} width="36" height={chartH} fill="transparent" />
                {showChartTheanine && (
                  <circle
                    cx={x}
                    cy={getY(d.theanineConcentration)}
                    r={isSelected ? 5.5 : 3.5}
                    fill="#10b981"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                )}
                {showChartCaffeine && (
                  <circle
                    cx={x}
                    cy={getY(d.caffeineConcentration)}
                    r={isSelected ? 5.5 : 3.5}
                    fill="#2563eb"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                )}
                {showChartCatechins && (
                  <circle
                    cx={x}
                    cy={getY(d.catechinsConcentration)}
                    r={isSelected ? 6 : 4}
                    fill="#e11d48"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                )}
                {showChartPolysaccharides && (
                  <circle
                    cx={x}
                    cy={getY(d.polysaccharidesConcentration)}
                    r={isSelected ? 5.5 : 3.5}
                    fill="#9333ea"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] text-stone-500 italic">
        * Кликните по точке любого пролива на графике или по кнопке пролива выше, чтобы увидеть детальный профиль чашки.
      </p>
    </div>
  );
};
