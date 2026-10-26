/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  TeaSample,
  TeaCategory,
  LeafMorphology,
  DataOriginType,
  createValueWithOrigin,
} from '../../domain/tea/types.ts';
import { validateTeaSample } from '../../domain/tea/validation.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { DataOriginBadge } from '../../components/DataOriginBadge.tsx';
import { Plus, Trash2, Play, AlertTriangle } from 'lucide-react';

interface CustomTeasViewProps {
  customTeas: TeaSample[];
  onAddCustomTea: (tea: TeaSample) => void;
  onDeleteCustomTea: (id: string) => void;
  onSelectForBrewing: (id: string) => void;
}

export const CustomTeasView: React.FC<CustomTeasViewProps> = ({
  customTeas,
  onAddCustomTea,
  onDeleteCustomTea,
  onSelectForBrewing,
}) => {
  const [isCreating, setIsCreating] = useState(false);

  // Состояние формы
  const [name, setName] = useState('');
  const [nativeName, setNativeName] = useState('');
  const [category, setCategory] = useState<TeaCategory>('oolong_dark');
  const [originRegion, setOriginRegion] = useState('');
  const [harvestYear, setHarvestYear] = useState<number>(new Date().getFullYear());
  const [morphology, setMorphology] = useState<LeafMorphology>('strip_rolled');
  const [notes, setNotes] = useState('');

  // Параметры с источниками
  const [waterAbsorptionVal, setWaterAbsorptionVal] = useState<number>(2.8);
  const [waterAbsorptionOrigin, setWaterAbsorptionOrigin] = useState<DataOriginType>('user_defined');

  const [hydrationVal, setHydrationVal] = useState<number>(1.0);
  const [hydrationOrigin, setHydrationOrigin] = useState<DataOriginType>('estimated');

  const [densityVal, setDensityVal] = useState<number>(0.35);
  const [densityOrigin, setDensityOrigin] = useState<DataOriginType>('estimated');

  const [solubleFractionVal, setSolubleFractionVal] = useState<number>(38.0);
  const [solubleFractionOrigin, setSolubleFractionOrigin] = useState<DataOriginType>('user_defined');

  const [caffeineVal, setCaffeineVal] = useState<number>(3.0);
  const [caffeineOrigin, setCaffeineOrigin] = useState<DataOriginType>('unknown');

  const [theanineVal, setTheanineVal] = useState<number>(2.0);
  const [theanineOrigin, setTheanineOrigin] = useState<DataOriginType>('unknown');

  const [polyphenolsVal, setPolyphenolsVal] = useState<number>(18.0);
  const [polyphenolsOrigin, setPolyphenolsOrigin] = useState<DataOriginType>('unknown');

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const candidateTea: TeaSample = {
      id: `custom-tea-${Date.now()}`,
      name: name.trim(),
      nativeName: nativeName.trim() || undefined,
      category,
      originRegion: originRegion.trim() || 'Пользовательская партия',
      harvestYear: harvestYear ? Number(harvestYear) : undefined,
      morphology,
      hydrationSpeedFactor: createValueWithOrigin(
        hydrationOrigin === 'unknown' ? null : Number(hydrationVal),
        hydrationOrigin,
        'ед.'
      ),
      waterAbsorptionRatio: createValueWithOrigin(
        waterAbsorptionOrigin === 'unknown' ? null : Number(waterAbsorptionVal),
        waterAbsorptionOrigin,
        'г/г'
      ),
      leafDensityGPerCm3: createValueWithOrigin(
        densityOrigin === 'unknown' ? null : Number(densityVal),
        densityOrigin,
        'г/см³'
      ),
      totalSolubleFraction: createValueWithOrigin(
        solubleFractionOrigin === 'unknown' ? null : Number(solubleFractionVal),
        solubleFractionOrigin,
        '%'
      ),
      caffeineEstimate: createValueWithOrigin(
        caffeineOrigin === 'unknown' ? null : Number(caffeineVal),
        caffeineOrigin,
        '%'
      ),
      theanineEstimate: createValueWithOrigin(
        theanineOrigin === 'unknown' ? null : Number(theanineVal),
        theanineOrigin,
        '%'
      ),
      polyphenolsEstimate: createValueWithOrigin(
        polyphenolsOrigin === 'unknown' ? null : Number(polyphenolsVal),
        polyphenolsOrigin,
        '%'
      ),
      isCustom: true,
      notes: notes.trim() || undefined,
    };

    const issues = validateTeaSample(candidateTea);
    const errors = issues.filter((i) => i.severity === 'error');

    if (errors.length > 0) {
      setFormErrors(errors.map((e) => e.message));
      return;
    }

    onAddCustomTea(candidateTea);
    setIsCreating(false);
    setFormErrors([]);
    setName('');
    setNativeName('');
    setNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Мои чаи и лабораторные образцы
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Создание собственных сортов с фиксацией источника каждого параметра (измерено, оценка, неизвестно)
          </p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#224233] hover:bg-[#1A3327] rounded-md transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isCreating ? 'Закрыть форму' : 'Добавить образец'}</span>
        </button>
      </div>

      {/* Форма добавления нового чая */}
      {isCreating && (
        <form onSubmit={handleSubmit}>
          <SectionCard
            title="Паспорт нового чайного образца"
            subtitle="Заполните известные параметры. Для неустановленных величин выберите статус «Неизвестно» (Unknown ≠ 0)"
          >
            {formErrors.length > 0 && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 space-y-1">
                {formErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Название чая (обязательно) *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Фэн Хуан Дань Цун Я Ши Сян"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Оригинальное название (иероглифы, опционально)
                </label>
                <input
                  type="text"
                  value={nativeName}
                  onChange={(e) => setNativeName(e.target.value)}
                  placeholder="Например: 鸭屎香"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Категория чая
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TeaCategory)}
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                >
                  <option value="green">Зелёный</option>
                  <option value="white">Белый</option>
                  <option value="yellow">Жёлтый</option>
                  <option value="oolong_light">Светлый улун</option>
                  <option value="oolong_dark">Тёмный улун</option>
                  <option value="black">Красный / Чёрный</option>
                  <option value="sheng_puer">Шэн пуэр</option>
                  <option value="shou_puer">Шу пуэр</option>
                  <option value="hei_cha">Хэй ча</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Регион сбора
                </label>
                <input
                  type="text"
                  value={originRegion}
                  onChange={(e) => setOriginRegion(e.target.value)}
                  placeholder="Гуандун, Чаочжоу"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Год сбора / урожая
                </label>
                <input
                  type="number"
                  min={1990}
                  max={2030}
                  value={harvestYear}
                  onChange={(e) => setHarvestYear(Number(e.target.value))}
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Морфология листа
                </label>
                <select
                  value={morphology}
                  onChange={(e) => setMorphology(e.target.value as LeafMorphology)}
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                >
                  <option value="strip_rolled">Продольная скрутка полосой</option>
                  <option value="tightly_rolled_ball">Тугая сферическая скрутка</option>
                  <option value="whole_bud">Цельная верхушечная почка</option>
                  <option value="bud_and_leaves">Почка и верхние листья</option>
                  <option value="mature_open_leaves">Крупные зрелые листья</option>
                  <option value="compressed_cake_chunk">Прессованный блин / кирпич</option>
                </select>
              </div>
            </div>

            {/* Физические и химические параметры с селектором происхождения */}
            <div className="pt-4 border-t border-stone-200">
              <h3 className="text-xs font-semibold text-stone-900 mb-3 uppercase tracking-wider font-mono">
                Физические и химические параметры с указанием источника
              </h3>

              <div className="space-y-3">
                {/* Водопоглощение */}
                <div className="p-3 bg-stone-50 rounded border border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="sm:w-1/3">
                    <span className="text-xs font-medium text-stone-900 block">
                      Водопоглощение (г воды / г листа)
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Сколько воды связывает сухой лист при замачивании (норма: 2.0 – 3.2 г/г)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:w-2/3">
                    <input
                      type="number"
                      step={0.1}
                      disabled={waterAbsorptionOrigin === 'unknown'}
                      value={waterAbsorptionOrigin === 'unknown' ? '' : waterAbsorptionVal}
                      onChange={(e) => setWaterAbsorptionVal(Number(e.target.value))}
                      placeholder={waterAbsorptionOrigin === 'unknown' ? 'Неизвестно' : ''}
                      className="w-28 text-xs py-1.5 px-2 bg-white border border-stone-300 rounded font-mono disabled:bg-stone-100 disabled:text-stone-400"
                    />
                    <select
                      value={waterAbsorptionOrigin}
                      onChange={(e) => setWaterAbsorptionOrigin(e.target.value as DataOriginType)}
                      className="text-xs py-1.5 px-2 bg-white border border-stone-300 rounded text-stone-800"
                    >
                      <option value="user_defined">Ручной ввод</option>
                      <option value="estimated">Оценка культивара</option>
                      <option value="measured">Лаб. измерение</option>
                      <option value="unknown">Неизвестно (Unknown)</option>
                    </select>
                  </div>
                </div>

                {/* Общий резервуар сухих веществ */}
                <div className="p-3 bg-stone-50 rounded border border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="sm:w-1/3">
                    <span className="text-xs font-medium text-stone-900 block">
                      Доля экстрактивных сухих веществ (%)
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Суммарная водорастворимая фракция (норма: 30% – 45%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:w-2/3">
                    <input
                      type="number"
                      step={0.5}
                      disabled={solubleFractionOrigin === 'unknown'}
                      value={solubleFractionOrigin === 'unknown' ? '' : solubleFractionVal}
                      onChange={(e) => setSolubleFractionVal(Number(e.target.value))}
                      placeholder={solubleFractionOrigin === 'unknown' ? 'Неизвестно' : ''}
                      className="w-28 text-xs py-1.5 px-2 bg-white border border-stone-300 rounded font-mono disabled:bg-stone-100 disabled:text-stone-400"
                    />
                    <select
                      value={solubleFractionOrigin}
                      onChange={(e) => setSolubleFractionOrigin(e.target.value as DataOriginType)}
                      className="text-xs py-1.5 px-2 bg-white border border-stone-300 rounded text-stone-800"
                    >
                      <option value="user_defined">Ручной ввод</option>
                      <option value="estimated">Оценка культивара</option>
                      <option value="measured">Лаб. измерение</option>
                      <option value="unknown">Неизвестно (Unknown)</option>
                    </select>
                  </div>
                </div>

                {/* Кофеин */}
                <div className="p-3 bg-stone-50 rounded border border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="sm:w-1/3">
                    <span className="text-xs font-medium text-stone-900 block">
                      Кофеин (% сухой массы)
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Алкалоиды (типично 2.0% – 5.0%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:w-2/3">
                    <input
                      type="number"
                      step={0.1}
                      disabled={caffeineOrigin === 'unknown'}
                      value={caffeineOrigin === 'unknown' ? '' : caffeineVal}
                      onChange={(e) => setCaffeineVal(Number(e.target.value))}
                      placeholder={caffeineOrigin === 'unknown' ? 'Неизвестно' : ''}
                      className="w-28 text-xs py-1.5 px-2 bg-white border border-stone-300 rounded font-mono disabled:bg-stone-100 disabled:text-stone-400"
                    />
                    <select
                      value={caffeineOrigin}
                      onChange={(e) => setCaffeineOrigin(e.target.value as DataOriginType)}
                      className="text-xs py-1.5 px-2 bg-white border border-stone-300 rounded text-stone-800"
                    >
                      <option value="unknown">Неизвестно (Unknown)</option>
                      <option value="user_defined">Ручной ввод</option>
                      <option value="estimated">Оценка культивара</option>
                      <option value="measured">Лаб. измерение</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Заметки */}
            <div className="mt-4 pt-4 border-t border-stone-200">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Лабораторные заметки и описание партии
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Условия хранения, особенности обработки, вкусовые дескрипторы..."
                className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3.5 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-[#224233] hover:bg-[#1A3327] rounded-md transition-colors cursor-pointer"
              >
                Сохранить образец в лабораторию
              </button>
            </div>
          </SectionCard>
        </form>
      )}

      {/* Список сохраненных пользовательских чаев */}
      {customTeas.length === 0 ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-lg space-y-2">
          <p className="text-sm font-semibold text-stone-800">
            В вашей лаборатории пока нет добавленных сортов
          </p>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            Нажмите кнопку «Добавить образец» выше, чтобы создать паспорт вашей партии чая
            с точным указанием проверенных и неустановленных характеристик.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customTeas.map((tea) => (
            <div
              key={tea.id}
              className="p-5 bg-white border border-stone-200 rounded-lg flex flex-col justify-between space-y-4 hover:border-stone-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-base font-bold text-stone-900">
                      {tea.name}
                    </h2>
                    {tea.nativeName && (
                      <span className="text-xs font-mono text-stone-400">
                        {tea.nativeName}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteCustomTea(tea.id)}
                    className="text-stone-400 hover:text-rose-700 p-1 cursor-pointer transition-colors"
                    title="Удалить чай"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-stone-500 mb-3">
                  <span>{tea.originRegion}</span>
                  {tea.harvestYear && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{tea.harvestYear} г.</span>
                    </>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Водопоглощение:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>{tea.waterAbsorptionRatio.value ?? '—'} г/г</span>
                      <DataOriginBadge origin={tea.waterAbsorptionRatio.origin} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Экстрактивные вещества:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>{tea.totalSolubleFraction.value ?? '—'} %</span>
                      <DataOriginBadge origin={tea.totalSolubleFraction.origin} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Кофеин:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>{tea.caffeineEstimate.value !== null ? `${tea.caffeineEstimate.value} %` : '—'}</span>
                      <DataOriginBadge origin={tea.caffeineEstimate.origin} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                <span className="text-[11px] font-mono text-stone-400">
                  ID: {tea.id}
                </span>
                <button
                  onClick={() => onSelectForBrewing(tea.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Заварить в симуляторе</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
