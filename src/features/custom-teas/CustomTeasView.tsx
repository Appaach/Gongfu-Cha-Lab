/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  TeaSample,
  TeaCategory,
  LeafMorphology,
  RoastLevel,
  DataOriginType,
  createValueWithOrigin,
} from '../../domain/tea/types.ts';
import { validateTeaSample } from '../../domain/tea/validation.ts';
import { SectionCard } from '../../components/SectionCard.tsx';
import { DataOriginBadge } from '../../components/DataOriginBadge.tsx';
import { Plus, Trash2, Play, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface CustomTeasViewProps {
  customTeas: TeaSample[];
  onAddCustomTea: (tea: TeaSample) => void;
  onDeleteCustomTea: (id: string) => void;
  onSelectForBrewing: (id: string) => void;
}

const CATEGORY_LABELS: Record<TeaCategory, string> = {
  green: 'Зелёный',
  white: 'Белый',
  yellow: 'Жёлтый',
  oolong_light: 'Светлый улун',
  oolong_dark: 'Тёмный улун',
  black: 'Красный / Чёрный',
  sheng_puer: 'Шэн пуэр',
  shou_puer: 'Шу пуэр',
  hei_cha: 'Хэй ча',
};

const MORPHOLOGY_LABELS: Record<LeafMorphology, string> = {
  strip_rolled: 'Продольная скрутка полосой',
  tightly_rolled_ball: 'Тугая сферическая скрутка',
  whole_bud: 'Цельная верхушечная почка',
  bud_and_leaves: 'Почка и 1-2 листа',
  mature_open_leaves: 'Крупные зрелые листья',
  compressed_cake_chunk: 'Прессованный блин / кирпич',
};

export const CustomTeasView: React.FC<CustomTeasViewProps> = ({
  customTeas,
  onAddCustomTea,
  onDeleteCustomTea,
  onSelectForBrewing,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Основные доступные пользователю сведения (без автоматической подстановки фиктивных значений!)
  const [name, setName] = useState('');
  const [nativeName, setNativeName] = useState('');
  const [category, setCategory] = useState<TeaCategory | ''>('');
  const [morphology, setMorphology] = useState<LeafMorphology | ''>('');
  const [originRegion, setOriginRegion] = useState('');
  const [cultivar, setCultivar] = useState('');
  const [producer, setProducer] = useState('');
  const [harvestYear, setHarvestYear] = useState<string>(''); // пустая строка, не подставляем текущий год!
  const [productionYear, setProductionYear] = useState<string>('');
  const [roastLevel, setRoastLevel] = useState<RoastLevel | ''>('');
  const [processingNotes, setProcessingNotes] = useState('');

  // Расширенные лабораторные поля (по умолчанию строго Unknown, без фиктивных значений!)
  const [waterAbsorptionVal, setWaterAbsorptionVal] = useState<string>('');
  const [waterAbsorptionOrigin, setWaterAbsorptionOrigin] = useState<DataOriginType>('unknown');

  const [densityVal, setDensityVal] = useState<string>('');
  const [densityOrigin, setDensityOrigin] = useState<DataOriginType>('unknown');

  const [extractableVal, setExtractableVal] = useState<string>('');
  const [extractableOrigin, setExtractableOrigin] = useState<DataOriginType>('unknown');

  const [caffeineVal, setCaffeineVal] = useState<string>('');
  const [caffeineOrigin, setCaffeineOrigin] = useState<DataOriginType>('unknown');

  const [theanineVal, setTheanineVal] = useState<string>('');
  const [theanineOrigin, setTheanineOrigin] = useState<DataOriginType>('unknown');

  const [polyphenolsVal, setPolyphenolsVal] = useState<string>('');
  const [polyphenolsOrigin, setPolyphenolsOrigin] = useState<DataOriginType>('unknown');

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    function parseNumericParam(strVal: string, origin: DataOriginType, unit: string) {
      if (origin === 'unknown' || !strVal.trim()) {
        return createValueWithOrigin<number>(null, 'unknown', unit);
      }
      const num = parseFloat(strVal);
      if (isNaN(num)) {
        return createValueWithOrigin<number>(null, 'unknown', unit);
      }
      return createValueWithOrigin<number>(num, origin, unit);
    }

    const candidateTea: TeaSample = {
      id: `custom-tea-${Date.now()}`,
      name: name.trim(),
      nativeName: nativeName.trim() || undefined,
      category: category ? category : undefined,
      morphology: morphology ? morphology : undefined,
      originRegion: originRegion.trim() || undefined,
      cultivar: cultivar.trim() || undefined,
      producer: producer.trim() || undefined,
      harvestYear: harvestYear.trim() ? parseInt(harvestYear, 10) : undefined,
      productionYear: productionYear.trim() ? parseInt(productionYear, 10) : undefined,
      roastLevel: roastLevel ? roastLevel : undefined,
      processingNotes: processingNotes.trim() || undefined,

      // Физические параметры (строго Unknown, если не введены пользователем)
      waterAbsorptionRatio: parseNumericParam(waterAbsorptionVal, waterAbsorptionOrigin, 'г/г'),
      leafBulkDensityGPerCm3: parseNumericParam(densityVal, densityOrigin, 'г/см³'),

      // Химические фракции (% от массы сухого листа)
      totalExtractableFraction: parseNumericParam(extractableVal, extractableOrigin, '%'),
      caffeineFraction: parseNumericParam(caffeineVal, caffeineOrigin, '%'),
      theanineFraction: parseNumericParam(theanineVal, theanineOrigin, '%'),
      totalPolyphenolsFraction: parseNumericParam(polyphenolsVal, polyphenolsOrigin, '%'),

      isCustom: true,
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
    // Сброс формы
    setName('');
    setNativeName('');
    setCategory('');
    setMorphology('');
    setOriginRegion('');
    setCultivar('');
    setProducer('');
    setHarvestYear('');
    setProductionYear('');
    setRoastLevel('');
    setProcessingNotes('');
    setShowAdvanced(false);
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
            Создание чая без необходимости указывать неизвестный химический состав (Unknown ≠ 0)
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
            title="Паспорт чайного образца"
            subtitle="Заполните известные вам сведения. Все неизвестные поля останутся в статусе «Нет данных» и не будут искажать расчёты."
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

            {/* Базовый блок: доступные сведения */}
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
                  Оригинальное название (иероглифы, если известно)
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
                  Категория чая (если известна)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TeaCategory | '')}
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                >
                  <option value="">Не указано / Не знаю</option>
                  {(Object.keys(CATEGORY_LABELS) as TeaCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Форма и целостность листа (если известна)
                </label>
                <select
                  value={morphology}
                  onChange={(e) => setMorphology(e.target.value as LeafMorphology | '')}
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                >
                  <option value="">Не указано / Не знаю</option>
                  {(Object.keys(MORPHOLOGY_LABELS) as LeafMorphology[]).map((m) => (
                    <option key={m} value={m}>
                      {MORPHOLOGY_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Регион сбора / терруар
                </label>
                <input
                  type="text"
                  value={originRegion}
                  onChange={(e) => setOriginRegion(e.target.value)}
                  placeholder="Например: Гуандун, Чаочжоу, Удун"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Культивар / разновидность
                </label>
                <input
                  type="text"
                  value={cultivar}
                  onChange={(e) => setCultivar(e.target.value)}
                  placeholder="Например: Я Ши Сян / Ба Сянь"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Производитель / мастер / фабрика
                </label>
                <input
                  type="text"
                  value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                  placeholder="Например: Фабрика Мэнхай / Мастер Вонг"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Степень прогрева / обжарки
                </label>
                <select
                  value={roastLevel}
                  onChange={(e) => setRoastLevel(e.target.value as RoastLevel | '')}
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
                >
                  <option value="">Не указано</option>
                  <option value="none">Без прогрева (цин сян / зелёный)</option>
                  <option value="light">Слабый прогрев</option>
                  <option value="medium">Средний прогрев</option>
                  <option value="heavy">Глубокий прогрев (хунпэй на углях)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Год сбора урожая (если известен)
                </label>
                <input
                  type="number"
                  min={1980}
                  max={2035}
                  value={harvestYear}
                  onChange={(e) => setHarvestYear(e.target.value)}
                  placeholder="Оставьте пустым, если не знаете"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Год производства / прессовки
                </label>
                <input
                  type="number"
                  min={1980}
                  max={2035}
                  value={productionYear}
                  onChange={(e) => setProductionYear(e.target.value)}
                  placeholder="Оставьте пустым, если не знаете"
                  className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900 font-mono"
                />
              </div>
            </div>

            {/* Технологические особенности обработки */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Особенности обработки, ферментации и прессования (технические факты)
              </label>
              <input
                type="text"
                value={processingNotes}
                onChange={(e) => setProcessingNotes(e.target.value)}
                placeholder="Например: Ручной шацин, продольная скрутка, сушка на древесных углях"
                className="w-full text-xs py-2 px-3 bg-white border border-stone-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 text-stone-900"
              />
            </div>

            {/* Дополнительный лабораторный блок (свернут по умолчанию, все поля unknown) */}
            <div className="pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>Дополнительные физико-химические параметры (если известны протоколы)</span>
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-3 bg-stone-50/70 p-4 rounded-lg border border-stone-200">
                  <p className="text-[11px] text-stone-500 mb-3">
                    По умолчанию все параметры имеют статус «Неизвестно». Заполняйте поля только при наличии лабораторного анализа или проверенных данных.
                  </p>

                  {/* Водопоглощение */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded border border-stone-200/80">
                    <div>
                      <span className="text-xs font-medium text-stone-900 block">
                        Водопоглощение матрицы (г воды / г сухого листа)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={0.1}
                        value={waterAbsorptionVal}
                        onChange={(e) => {
                          setWaterAbsorptionVal(e.target.value);
                          if (e.target.value && waterAbsorptionOrigin === 'unknown') {
                            setWaterAbsorptionOrigin('user_defined');
                          }
                        }}
                        placeholder="—"
                        className="w-24 text-xs py-1 px-2 border border-stone-300 rounded font-mono"
                      />
                      <select
                        value={waterAbsorptionOrigin}
                        onChange={(e) => setWaterAbsorptionOrigin(e.target.value as DataOriginType)}
                        className="text-xs py-1 px-2 border border-stone-300 rounded bg-white"
                      >
                        <option value="unknown">Неизвестно</option>
                        <option value="user_defined">Ручной ввод</option>
                        <option value="literature">Литература</option>
                        <option value="measured">Лаб. измерение</option>
                      </select>
                    </div>
                  </div>

                  {/* Экстрактивные сухие вещества */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded border border-stone-200/80">
                    <div>
                      <span className="text-xs font-medium text-stone-900 block">
                        Суммарный водорастворимый экстракт (% от массы сухого листа)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={0.5}
                        value={extractableVal}
                        onChange={(e) => {
                          setExtractableVal(e.target.value);
                          if (e.target.value && extractableOrigin === 'unknown') {
                            setExtractableOrigin('user_defined');
                          }
                        }}
                        placeholder="—"
                        className="w-24 text-xs py-1 px-2 border border-stone-300 rounded font-mono"
                      />
                      <select
                        value={extractableOrigin}
                        onChange={(e) => setExtractableOrigin(e.target.value as DataOriginType)}
                        className="text-xs py-1 px-2 border border-stone-300 rounded bg-white"
                      >
                        <option value="unknown">Неизвестно</option>
                        <option value="user_defined">Ручной ввод</option>
                        <option value="literature">Литература</option>
                        <option value="measured">Лаб. измерение</option>
                      </select>
                    </div>
                  </div>

                  {/* Кофеин */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white rounded border border-stone-200/80">
                    <div>
                      <span className="text-xs font-medium text-stone-900 block">
                        Кофеин (% от массы сухого листа)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={0.1}
                        value={caffeineVal}
                        onChange={(e) => {
                          setCaffeineVal(e.target.value);
                          if (e.target.value && caffeineOrigin === 'unknown') {
                            setCaffeineOrigin('user_defined');
                          }
                        }}
                        placeholder="—"
                        className="w-24 text-xs py-1 px-2 border border-stone-300 rounded font-mono"
                      />
                      <select
                        value={caffeineOrigin}
                        onChange={(e) => setCaffeineOrigin(e.target.value as DataOriginType)}
                        className="text-xs py-1 px-2 border border-stone-300 rounded bg-white"
                      >
                        <option value="unknown">Неизвестно</option>
                        <option value="user_defined">Ручной ввод</option>
                        <option value="literature">Литература</option>
                        <option value="measured">Лаб. измерение</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
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
                Сохранить образец
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
            Нажмите кнопку «Добавить образец» выше, чтобы создать паспорт вашей партии чая.
            Химические параметры указывать не обязательно — модель честно учтет их как неизвестные.
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

                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mb-3">
                  {tea.category && <span>{CATEGORY_LABELS[tea.category] ?? tea.category}</span>}
                  {tea.originRegion && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{tea.originRegion}</span>
                    </>
                  )}
                  {tea.harvestYear && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{tea.harvestYear} г.</span>
                    </>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Водопоглощение листа:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>{tea.waterAbsorptionRatio.value !== null ? `${tea.waterAbsorptionRatio.value} г/г` : '—'}</span>
                      <DataOriginBadge origin={tea.waterAbsorptionRatio.origin} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Экстрактивные вещества:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>{tea.totalExtractableFraction.value !== null ? `${tea.totalExtractableFraction.value} %` : '—'}</span>
                      <DataOriginBadge origin={tea.totalExtractableFraction.origin} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Кофеин:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>{tea.caffeineFraction.value !== null ? `${tea.caffeineFraction.value} %` : '—'}</span>
                      <DataOriginBadge origin={tea.caffeineFraction.origin} />
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
