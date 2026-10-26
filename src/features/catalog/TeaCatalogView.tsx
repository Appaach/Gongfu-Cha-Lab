/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { TeaSample, TeaCategory } from '../../domain/tea/types.ts';
import { MetricDisplay } from '../../components/MetricDisplay.tsx';
import { DataOriginBadge } from '../../components/DataOriginBadge.tsx';
import { Search, Play } from 'lucide-react';

interface TeaCatalogViewProps {
  teas: TeaSample[];
  selectedTeaId: string;
  onSelectTeaForBrewing: (id: string) => void;
}

const CATEGORY_NAMES: Record<TeaCategory | 'all', string> = {
  all: 'Все категории',
  green: 'Зелёный',
  white: 'Белый',
  yellow: 'Жёлтый',
  oolong_light: 'Светлый улун',
  oolong_dark: 'Тёмный улун',
  black: 'Красный',
  sheng_puer: 'Шэн пуэр',
  shou_puer: 'Шу пуэр',
  hei_cha: 'Хэй ча',
};

const MORPHOLOGY_NAMES: Record<string, string> = {
  whole_bud: 'Цельная почка',
  bud_and_leaves: 'Почка и верхние листья',
  mature_open_leaves: 'Зрелые раскрытые листья',
  tightly_rolled_ball: 'Сферическая тугая скрутка',
  strip_rolled: 'Продольная скрутка полосой',
  compressed_cake_chunk: 'Прессованный блин / кирпич',
};

export const TeaCatalogView: React.FC<TeaCatalogViewProps> = ({
  teas,
  selectedTeaId,
  onSelectTeaForBrewing,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<TeaCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedTeaId, setInspectedTeaId] = useState<string>(selectedTeaId || teas[0]?.id || '');

  const filteredTeas = useMemo(() => {
    return teas.filter((tea) => {
      const matchesCategory = selectedCategory === 'all' || tea.category === selectedCategory;
      const matchesQuery =
        searchQuery.trim().length === 0 ||
        tea.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tea.originRegion.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tea.nativeName && tea.nativeName.includes(searchQuery));
      return matchesCategory && matchesQuery;
    });
  }, [teas, selectedCategory, searchQuery]);

  const inspectedTea = teas.find((t) => t.id === inspectedTeaId) ?? filteredTeas[0] ?? teas[0];

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Каталог чаёв и физико-химические паспорта
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Справочные профили сортов с явной маркировкой подтверждённых, оценочных и отсутствующих данных
          </p>
        </div>

        <div className="text-xs font-mono text-stone-500 self-start sm:self-auto">
          ОБРАЗЦОВ В БАЗЕ: <span className="font-semibold text-stone-900">{teas.length}</span>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Интерактивный переключатель категорий (button-based) */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(['all', 'green', 'white', 'oolong_light', 'oolong_dark', 'black', 'sheng_puer'] as Array<TeaCategory | 'all'>).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200/70'
                }`}
              >
                {CATEGORY_NAMES[cat]}
              </button>
            )
          )}
        </div>

        {/* Поисковая строка */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по сорту или региону..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
          />
        </div>
      </div>

      {/* Двухколоночный макет: Список сортов + Детальный паспорт */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Список карточек чая (слева, 5 колонок) */}
        <div className="lg:col-span-5 space-y-2.5">
          {filteredTeas.length === 0 ? (
            <div className="p-8 text-center bg-white border border-stone-200 rounded-lg text-xs text-stone-500">
              По вашему запросу образцов не найдено.
            </div>
          ) : (
            filteredTeas.map((tea) => {
              const isInspected = inspectedTea?.id === tea.id;
              return (
                <div
                  key={tea.id}
                  onClick={() => setInspectedTeaId(tea.id)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    isInspected
                      ? 'border-emerald-800 bg-white ring-1 ring-emerald-800 shadow-xs'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <h2 className="text-sm font-semibold text-stone-900 leading-tight">
                        {tea.name}
                      </h2>
                      {tea.nativeName && (
                        <span className="text-xs font-mono text-stone-400">
                          {tea.nativeName}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-stone-500 font-medium">
                      {CATEGORY_NAMES[tea.category]}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-stone-500 mb-2">
                    <span>{tea.originRegion}</span>
                    {tea.harvestYear && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{tea.harvestYear} г.</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{MORPHOLOGY_NAMES[tea.morphology] ?? tea.morphology}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                    <span className="font-mono text-stone-600 text-[11px]">
                      TDS рез.: {tea.totalSolubleFraction.value ?? '—'}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTeaForBrewing(tea.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>В симулятор</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Детальный физико-химический паспорт (справа, 7 колонок) */}
        {inspectedTea && (
          <div className="lg:col-span-7 bg-white border border-stone-200/90 rounded-lg p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-lg font-bold text-stone-900 tracking-tight">
                    {inspectedTea.name}
                  </h2>
                  {inspectedTea.nativeName && (
                    <span className="text-sm font-mono text-stone-400">
                      {inspectedTea.nativeName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500 mt-1">
                  <span>{CATEGORY_NAMES[inspectedTea.category]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectedTea.originRegion}</span>
                  {inspectedTea.harvestYear && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Урожай {inspectedTea.harvestYear}</span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectTeaForBrewing(inspectedTea.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#224233] hover:bg-[#1A3327] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Заварить этот чай</span>
              </button>
            </div>

            {/* Физические параметры матрицы */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 font-mono mb-3">
                Физико-морфологические параметры листа
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricDisplay
                  label="Водопоглощение"
                  metric={inspectedTea.waterAbsorptionRatio}
                  description="Масса воды, удерживаемой 1 г сухого листа при набухании"
                />
                <MetricDisplay
                  label="Скорость гидратации"
                  metric={inspectedTea.hydrationSpeedFactor}
                  description="Относительный коэффициент смачивания матрицы"
                />
                <MetricDisplay
                  label="Насыпная плотность"
                  metric={inspectedTea.leafDensityGPerCm3}
                  description="Плотность сухих листьев в навеске"
                />
              </div>
            </div>

            {/* Химические резервуары экстрактивных веществ */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 font-mono mb-3">
                Химические резервуары растворимых веществ (% сухого веса)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MetricDisplay
                  label="Общие сухие вещества (TDS резервуар)"
                  metric={inspectedTea.totalSolubleFraction}
                  description="Максимальный теоретический выход экстракта при полном вываривании"
                />
                <MetricDisplay
                  label="Алкалоиды (Кофеин)"
                  metric={inspectedTea.caffeineEstimate}
                  description="Пуриновые алкалоиды, определяющие тонизирующее действие и чистую горечь"
                />
                <MetricDisplay
                  label="Полифенолы (Катехины / Танины)"
                  metric={inspectedTea.polyphenolsEstimate}
                  description="Антиоксидантный комплекс, формирующий терпкость и вяжущее тело"
                />
                <MetricDisplay
                  label="L-теанин и аминокислоты"
                  metric={inspectedTea.theanineEstimate}
                  description="Определяют вкус умами, сладость послевкусия и седативный баланс"
                />
              </div>
            </div>

            {/* Описание и происхождение данных */}
            {inspectedTea.notes && (
              <div className="p-3.5 bg-stone-50 rounded-md border border-stone-200/80 text-xs text-stone-600 leading-relaxed">
                <strong className="text-stone-900 font-medium block mb-0.5">
                  Органолептический и морфологический комментарий:
                </strong>
                {inspectedTea.notes}
              </div>
            )}

            <div className="pt-2 text-[11px] text-stone-400 font-mono flex items-center justify-between border-t border-stone-100">
              <span>ИДЕНТИФИКАТОР: {inspectedTea.id}</span>
              <span>ИСТОЧНИК: {inspectedTea.isCustom ? 'Пользовательская лаборатория' : 'Эталонный архив'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
