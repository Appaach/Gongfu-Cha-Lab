import React, { useMemo } from 'react';
import { Activity, Clock3, FlaskConical, Thermometer, TrendingUp, Waves } from 'lucide-react';
import { BrewingMethod, SteepKineticData } from '../types';
import { ContinuousInfusionPoint, generateSmoothBezierPath } from '../domain/extractionChartCalculations';

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

type CompoundSeries = {
  id: 'theanine' | 'caffeine' | 'catechins' | 'polysaccharides';
  label: string;
  color: string;
  visible: boolean;
  toggle: (visible: boolean) => void;
  values: number[];
};

const CHART = { width: 920, height: 312, left: 62, right: 28, top: 22, bottom: 48 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fmt = (value: number, digits = 1) => Number(value.toFixed(digits)).toLocaleString('ru-RU', { maximumFractionDigits: digits });
const makePath = (values: { x: number; y: number }[]) => generateSmoothBezierPath(values);
const stageIndex = (row: SteepKineticData) => row.steepNumber === 0 ? -1 : row.steepNumber - 1;

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
  const isCup = brewingMethod === 'grandpa_cup';
  const series: CompoundSeries[] = [
    { id: 'theanine', label: 'L-теанин', color: '#0f9276', visible: showChartTheanine, toggle: setShowChartTheanine, values: chartSteepsData.map((row) => row.theanineConcentration) },
    { id: 'caffeine', label: 'Кофеин', color: '#4778d8', visible: showChartCaffeine, toggle: setShowChartCaffeine, values: chartSteepsData.map((row) => row.caffeineConcentration) },
    { id: 'catechins', label: 'Катехины', color: '#d45370', visible: showChartCatechins, toggle: setShowChartCatechins, values: chartSteepsData.map((row) => row.catechinsConcentration) },
    { id: 'polysaccharides', label: 'Полисахариды', color: '#8a63bf', visible: showChartPolysaccharides, toggle: setShowChartPolysaccharides, values: chartSteepsData.map((row) => row.polysaccharidesConcentration) },
  ];
  const activeSeries = series.filter((item) => item.visible);

  const discrete = useMemo(() => {
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const count = chartSteepsData.length;
    const values = activeSeries.flatMap((item) => item.values).filter(Number.isFinite);
    const maxValue = Math.max(5, Math.ceil(Math.max(1, ...values) / 5) * 5);
    const x = (index: number) => CHART.left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
    const y = (value: number) => CHART.top + plotHeight - (clamp(value, 0, maxValue) / maxValue) * plotHeight;
    return {
      plotHeight,
      maxValue,
      x,
      y,
      grid: Array.from({ length: 5 }, (_, index) => {
        const value = (maxValue / 4) * index;
        return { value, y: y(value) };
      }),
      lines: activeSeries.map((item) => ({
        ...item,
        path: makePath(item.values.map((value, index) => ({ x: x(index), y: y(value) }))),
        points: item.values.map((value, index) => ({ x: x(index), y: y(value), value, index })),
      })),
    };
  }, [chartSteepsData, activeSeries]);

  const cup = useMemo(() => {
    if (!isCup || lazyCupTimeline.length === 0) return null;
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const maxMinute = Math.max(1, lazyCupTimeline[lazyCupTimeline.length - 1]?.minute ?? 1);
    const values = activeSeries.flatMap((item) => lazyCupTimeline.map((point) => {
      if (item.id === 'theanine') return point.theanine;
      if (item.id === 'caffeine') return point.caffeine;
      if (item.id === 'catechins') return point.catechins;
      return point.polysaccharides;
    })).filter(Number.isFinite);
    const maxValue = Math.max(5, Math.ceil(Math.max(1, ...values) / 5) * 5);
    const x = (minute: number) => CHART.left + (clamp(minute, 0, maxMinute) / maxMinute) * plotWidth;
    const y = (value: number) => CHART.top + plotHeight - (clamp(value, 0, maxValue) / maxValue) * plotHeight;
    const lines = activeSeries.map((item) => {
      const lineValues = lazyCupTimeline.map((point) => {
        if (item.id === 'theanine') return point.theanine;
        if (item.id === 'caffeine') return point.caffeine;
        if (item.id === 'catechins') return point.catechins;
        return point.polysaccharides;
      });
      return {
        ...item,
        path: makePath(lineValues.map((value, index) => ({ x: x(lazyCupTimeline[index].minute), y: y(value) }))),
      };
    });
    const step = maxMinute > 9 ? 2 : maxMinute > 4 ? 1 : 0.5;
    const xTicks: number[] = [];
    for (let minute = 0; minute < maxMinute; minute += step) xTicks.push(Number(minute.toFixed(2)));
    if (xTicks[xTicks.length - 1] !== maxMinute) xTicks.push(maxMinute);
    return {
      maxMinute,
      maxValue,
      x,
      grid: Array.from({ length: 5 }, (_, index) => {
        const value = (maxValue / 4) * index;
        return { value, y: y(value) };
      }),
      lines,
      markers: lazyCupTimeline.filter((point) => point.label || point.isRefill),
      xTicks,
    };
  }, [isCup, lazyCupTimeline, activeSeries]);

  const temperature = useMemo(() => {
    if (!isCup || !showChartTemperature || lazyCupTimeline.length === 0) return null;
    const height = 204;
    const top = 18;
    const bottom = 36;
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = height - top - bottom;
    const maxMinute = Math.max(1, lazyCupTimeline[lazyCupTimeline.length - 1]?.minute ?? 1);
    const maxTemp = Math.max(100, Math.ceil(Math.max(...lazyCupTimeline.map((point) => point.tempC)) / 10) * 10);
    const x = (minute: number) => CHART.left + (clamp(minute, 0, maxMinute) / maxMinute) * plotWidth;
    const y = (temp: number) => top + plotHeight - ((clamp(temp, 20, maxTemp) - 20) / (maxTemp - 20)) * plotHeight;
    return {
      height,
      top,
      bottom,
      maxMinute,
      x,
      path: makePath(lazyCupTimeline.map((point) => ({ x: x(point.minute), y: y(point.tempC) }))),
      markers: lazyCupTimeline.filter((point) => point.label || point.isRefill),
      grid: [20, 40, 60, 80, 100].map((value) => ({ value, y: y(value) })),
      xTicks: cup?.xTicks ?? [],
    };
  }, [isCup, showChartTemperature, lazyCupTimeline, cup]);

  const hasData = isCup ? Boolean(cup) : chartSteepsData.length > 0;
  const maxConcentration = isCup ? cup?.maxValue ?? 0 : discrete.maxValue;
  const selectedRow = chartSteepsData.find((row) => stageIndex(row) === selectedSteepIndex);

  return (
    <section className="tea-chart-panel overflow-hidden rounded-[1.6rem] border border-stone-200 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-stone-100 bg-gradient-to-br from-stone-50 via-white to-emerald-50/40 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-900 text-emerald-50 shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-stone-900 sm:text-lg">{isCup ? 'Настой во времени' : 'Профиль экстракции'}</h3>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">модельная оценка</span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-500 sm:text-sm">
                {isCup ? 'Изменение концентраций и остывание между доливами. Температура вынесена на отдельную шкалу.' : 'Сравнение концентраций по проливам в мг на 100 мл. Нулевой пролив показывается только там, где он назначен профилем чая.'}
              </p>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-xs text-stone-600 md:flex">
            <FlaskConical className="h-4 w-4 text-emerald-800" />
            <span>{steepsCount} проливов</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Отображаемые вещества">
          {series.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.visible}
              onClick={() => item.toggle(!item.visible)}
              className={'inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ' + (item.visible ? 'bg-white text-stone-900 shadow-sm' : 'border-stone-200 bg-stone-100/70 text-stone-500 opacity-75')}
              style={{ borderColor: item.visible ? item.color : undefined }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.visible ? item.color : '#a8a29e' }} />
              {item.label}
            </button>
          ))}
          {isCup && (
            <button
              type="button"
              aria-pressed={showChartTemperature}
              onClick={() => setShowChartTemperature(!showChartTemperature)}
              className={'inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ' + (showChartTemperature ? 'border-amber-300 bg-amber-50 text-amber-950 shadow-sm' : 'border-stone-200 bg-stone-100/70 text-stone-500')}
            >
              <Thermometer className="h-3.5 w-3.5" /> Температура
            </button>
          )}
        </div>
      </header>

      {!hasData ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Waves className="h-8 w-8 text-stone-300" />
          <p className="text-sm font-semibold text-stone-700">Пока нет данных для графика</p>
          <p className="max-w-md text-xs leading-relaxed text-stone-500">Измените параметры заваривания, чтобы пересчитать профиль экстракции.</p>
        </div>
      ) : (
        <div className="space-y-5 px-3 py-4 sm:px-5 sm:py-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-500">Активные кривые</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-bold tracking-tight text-stone-900">{activeSeries.length}</span><span className="text-[11px] text-stone-500">из 4 показаны</span></div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-500">Макс. концентрация</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-bold tracking-tight text-stone-900">{fmt(maxConcentration, 0)}</span><span className="text-[11px] text-stone-500">мг / 100 мл</span></div>
            </div>
            <div className="col-span-2 rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-3 sm:col-span-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-500">Выбранный этап</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-bold tracking-tight text-stone-900">{selectedRow ? (selectedRow.steepNumber === 0 ? '#0' : '#' + selectedRow.steepNumber) : '—'}</span><span className="text-[11px] text-stone-500">{selectedRow ? String(selectedRow.timeSec) + ' с' : 'выберите точку'}</span></div>
            </div>
          </div>

          {activeSeries.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">Включите хотя бы одно вещество в легенде, чтобы отобразить его кривую.</div>}

          <div className="rounded-2xl border border-stone-200 bg-white p-1.5 sm:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-2">
              <div>
                <div className="text-sm font-bold text-stone-900">{isCup ? 'Концентрация в чашке' : 'Концентрация по проливам'}</div>
                <div className="mt-0.5 text-[11px] text-stone-500">{isCup ? 'Динамика во время заваривания и доливов' : 'Каждая точка — расчётный конец отдельного пролива'}</div>
              </div>
              <span className="rounded-lg bg-stone-100 px-2 py-1 font-mono text-[10px] text-stone-600">мг / 100 мл</span>
            </div>

            <div className="w-full overflow-x-auto">
              <svg viewBox={'0 0 ' + CHART.width + ' ' + CHART.height} className="tea-chart-svg block h-auto w-full min-w-[640px]" role="img" aria-label={isCup ? 'График изменения концентрации во времени' : 'График концентрации по проливам'}>
                <defs>
                  <linearGradient id="tea-chart-selection" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.015" />
                  </linearGradient>
                </defs>

                {(isCup ? cup?.grid ?? [] : discrete.grid).map((tick, index) => (
                  <g key={'y-grid-' + index}>
                    <line x1={CHART.left} x2={CHART.width - CHART.right} y1={tick.y} y2={tick.y} stroke="#e7e5e4" strokeDasharray={index === 0 ? undefined : '4 5'} strokeWidth={index === 0 ? 1.25 : 1} />
                    <text x={CHART.left - 12} y={tick.y + 4} textAnchor="end" fontSize="11" fontWeight="500" fill="#78716c">{fmt(tick.value, 0)}</text>
                  </g>
                ))}

                {isCup && cup ? (
                  <>
                    {cup.markers.map((point, index) => (
                      <g key={'event-' + point.sec + '-' + index}>
                        <line x1={cup.x(point.minute)} x2={cup.x(point.minute)} y1={CHART.top} y2={CHART.height - CHART.bottom} stroke="#d97706" strokeOpacity={point.label ? 0.55 : 0.27} strokeDasharray="4 5" />
                        {point.label && <text x={cup.x(point.minute)} y={CHART.top - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#92400e">{point.label}</text>}
                      </g>
                    ))}
                    {cup.lines.map((line) => <path key={line.id} d={line.path} fill="none" stroke={line.color} strokeWidth={line.id === 'catechins' ? 3.2 : 2.7} strokeLinecap="round" strokeLinejoin="round" />)}
                    {cup.xTicks.map((minute) => (
                      <g key={'x-tick-' + minute}>
                        <line x1={cup.x(minute)} x2={cup.x(minute)} y1={CHART.height - CHART.bottom} y2={CHART.height - CHART.bottom + 5} stroke="#a8a29e" />
                        <text x={cup.x(minute)} y={CHART.height - 15} textAnchor="middle" fontSize="11" fill="#78716c">{fmt(minute, minute % 1 === 0 ? 0 : 1)} мин</text>
                      </g>
                    ))}
                  </>
                ) : (
                  <>
                    {chartSteepsData.map((row, index) => {
                      const x = discrete.x(index);
                      const selected = stageIndex(row) === selectedSteepIndex;
                      return (
                        <g key={'stage-' + row.steepNumber}>
                          {selected && <rect x={x - 20} y={CHART.top} width={40} height={discrete.plotHeight} rx={10} fill="url(#tea-chart-selection)" />}
                          <line x1={x} x2={x} y1={CHART.top} y2={CHART.height - CHART.bottom} stroke={selected ? '#0f766e' : '#e7e5e4'} strokeOpacity={selected ? 0.65 : 0.45} strokeDasharray={selected ? '3 4' : undefined} />
                          <text x={x} y={CHART.height - 27} textAnchor="middle" fontSize="12" fontWeight={selected ? '700' : '500'} fill={selected ? '#0f766e' : '#78716c'}>{row.steepNumber === 0 ? '#0' : '#' + row.steepNumber}</text>
                          <text x={x} y={CHART.height - 10} textAnchor="middle" fontSize="10" fill="#a8a29e">{fmt(row.timeSec, 0)} с</text>
                        </g>
                      );
                    })}
                    {discrete.lines.map((line) => (
                      <g key={line.id}>
                        <path d={line.path} fill="none" stroke={line.color} strokeWidth={line.id === 'catechins' ? 3.2 : 2.7} strokeLinecap="round" strokeLinejoin="round" />
                        {line.points.map((point) => {
                          const row = chartSteepsData[point.index];
                          const selected = stageIndex(row) === selectedSteepIndex;
                          return (
                            <g key={line.id + '-' + point.index} className="tea-chart-point" role="button" tabIndex={0} aria-label={line.label + ', пролив ' + row.steepNumber + ', ' + fmt(point.value) + ' мг на 100 мл'}
                              onClick={() => onSelectSteepIndex(stageIndex(row))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  onSelectSteepIndex(stageIndex(row));
                                }
                              }}>
                              <title>{line.label + ': ' + fmt(point.value) + ' мг / 100 мл'}</title>
                              <circle cx={point.x} cy={point.y} r={selected ? 5.7 : 3.9} fill={line.color} stroke="#ffffff" strokeWidth={selected ? 2.5 : 1.5} />
                              <circle cx={point.x} cy={point.y} r={11} fill="transparent" />
                            </g>
                          );
                        })}
                      </g>
                    ))}
                  </>
                )}
                <text x={CHART.left} y={13} fontSize="10" fontWeight="700" letterSpacing="1.2" fill="#a8a29e">МГ / 100 МЛ</text>
              </svg>
            </div>
          </div>

          {isCup && temperature && (
            <div className="rounded-2xl border border-stone-200 bg-white p-1.5 sm:p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><Thermometer className="h-4 w-4" /></div>
                  <div><div className="text-sm font-bold text-stone-900">Остывание настоя</div><div className="text-[11px] text-stone-500">Отдельная температурная шкала без смешения единиц</div></div>
                </div>
                <span className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-[10px] text-amber-900">°C</span>
              </div>
              <div className="w-full overflow-x-auto">
                <svg viewBox={'0 0 ' + CHART.width + ' ' + temperature.height} className="tea-chart-svg block h-auto w-full min-w-[640px]" role="img" aria-label="График остывания настоя во времени">
                  {temperature.grid.map((tick) => <g key={'temperature-' + tick.value}><line x1={CHART.left} x2={CHART.width - CHART.right} y1={tick.y} y2={tick.y} stroke="#e7e5e4" strokeDasharray="4 5" /><text x={CHART.left - 12} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#78716c">{tick.value}</text></g>)}
                  {temperature.markers.map((point, index) => <line key={'temp-event-' + point.sec + '-' + index} x1={temperature.x(point.minute)} x2={temperature.x(point.minute)} y1={temperature.top} y2={temperature.height - temperature.bottom} stroke="#d97706" strokeOpacity={point.label ? 0.55 : 0.25} strokeDasharray="4 5" />)}
                  <path d={temperature.path} fill="none" stroke="#d97706" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {temperature.xTicks.map((minute) => <text key={'temp-x-' + minute} x={temperature.x(minute)} y={temperature.height - 12} textAnchor="middle" fontSize="11" fill="#78716c">{fmt(minute, minute % 1 === 0 ? 0 : 1)} мин</text>)}
                </svg>
              </div>
            </div>
          )}

          <footer className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />
              <p className="max-w-3xl text-[11px] leading-relaxed text-stone-600">Кривые рассчитаны физической моделью с типовыми параметрами, если нет измерений для конкретного чая. Они помогают сравнить сценарии заваривания, но не заменяют лабораторный анализ.</p>
            </div>
            {adaptiveCustomBrewing && adaptiveCustomBrewing.userSteepsCount > 0 && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-semibold text-emerald-900"><Clock3 className="h-3.5 w-3.5" />{adaptiveCustomBrewing.userSteepsCount} ручн.</span>}
            <span className="hidden shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-stone-400 lg:inline-flex"><TrendingUp className="h-3.5 w-3.5" /> live model</span>
          </footer>
        </div>
      )}
    </section>
  );
};
