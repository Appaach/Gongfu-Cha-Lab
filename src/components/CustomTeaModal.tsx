import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Leaf, 
  Thermometer, 
  Check, 
  HelpCircle, 
  Trash2,
  Calendar,
  Layers,
  ChevronDown,
  Coffee
} from 'lucide-react';
import { TeaVariety } from '../types';
import { GENERIC_TEA_ARCHETYPES } from '../data/teaData';
import { canTeaAge } from '../domain/teaAging';

interface CustomTeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTea: (tea: TeaVariety) => void;
  editingTea?: TeaVariety | null;
  onDeleteTea?: (teaId: string) => void;
}

const COMMON_SENSORY_TAGS = [
  'Цветочный', 'Мёд', 'Орхидея', 'Печёное яблоко', 'Чернослив', 
  'Сухофрукты', 'Древесный', 'Грецкий орех', 'Тёмный шоколад', 
  'Камфора', 'Карамель', 'Пряности', 'Лесные ягоды', 'Лесной мох', 
  'Легкий дым', 'Свежая трава', 'Умами', 'Персик', 'Цветущая липа', 
  'Минеральный'
];

const LEAF_MORPHOLOGY_OPTIONS: { id: TeaVariety['leafMorphology']; label: string; desc: string }[] = [
  { id: 'twisted_strip', label: 'Продольная скрутка', desc: 'Скрученные жгутики (Утёсные улуны, Красные чаи, Шэн Пуэры)' },
  { id: 'tight_ball', label: 'Сферическая скрутка', desc: 'Плотные шарики (Тегуаньинь, Тайваньские улуны)' },
  { id: 'compressed_cake', label: 'Прессованный лист', desc: 'Блин, кирпич, точа, гнездо (Шэн/Шу Пуэры, Лао Ча)' },
  { id: 'flat', label: 'Плоский лист', desc: 'Расплющенный в котле лист (Лунцзин, Тайпин Хоукуй)' },
  { id: 'needle', label: 'Почки / иглы', desc: 'Нераскрытые типсы с серебристым пухом (Бай Хао Инь Чжэнь)' }
];

const EXISTING_VESSEL_OPTIONS = [
  {
    id: 'gaiwan_porcelain',
    label: 'Фарфоровая гайвань (110–120 мл)',
    desc: 'Классическая непористая глазурь. Чистота вкуса и аромата любого чая.',
    value: 'Фарфоровая гайвань 110–120 мл'
  },
  {
    id: 'gaiwan_thin_porcelain',
    label: 'Тонкостенная фарфоровая гайвань',
    desc: 'Быстро отводит тепло. Идеальна для нежных зелёных, белых и жёлтых чаёв.',
    value: 'Тонкостенная фарфоровая гайвань'
  },
  {
    id: 'gaiwan_wide_porcelain',
    label: 'Широкая фарфоровая гайвань',
    desc: 'Большое зеркало испарения для крупных листьев улунов и шэн пуэров.',
    value: 'Широкая фарфоровая гайвань'
  },
  {
    id: 'yixing_clay_pot',
    label: 'Исинский чайник (Цзыни / Чжуни)',
    desc: 'Пористая глина двойного обжига. Смягчает терпкость шу пуэров и утёсных улунов.',
    value: 'Пористая исинская глина (Цзыни / Чжуни)'
  },
  {
    id: 'thick_ceramic_pot',
    label: 'Толстая керамика (Цзяньшуй / Нисин)',
    desc: 'Плотный черепок с высокой теплоёмкостью для красных чаёв и томления.',
    value: 'Толстостенная керамика (Цзяньшуй / Нисин)'
  },
  {
    id: 'glass_flask_pitcher',
    label: 'Боросиликатное термостекло (Колба / Типод)',
    desc: 'Удобное заваривание проливом с кнопкой и контроль цвета настоя.',
    value: 'Боросиликатное термостекло (Колба / Типод)'
  },
  {
    id: 'glass_tall_cup',
    label: 'Высокий стеклянный стакан (Бэй Пао Фа)',
    desc: 'Настаивание типсов и почек в открытом стакане без крышки.',
    value: 'Высокий стеклянный стакан (Бэй Пао Фа)'
  },
  {
    id: 'cast_iron_pot',
    label: 'Чугунный чайник (Тэцубин) / Варка на огне',
    desc: 'Максимальная тепловая инерция для варки хэй ча и старых пуэров.',
    value: 'Чугунный чайник (Тэцубин) или варка на огне'
  },
  {
    id: 'thermos_vessel',
    label: 'Термос / Изотермический чайник',
    desc: 'Изотермическое томление для глубокого раскрытия прессованного листа.',
    value: 'Термос / Изотермический чайник'
  },
  {
    id: 'ceramic_regular_pot',
    label: 'Обычная керамика (Кружка / Заварочный чайник)',
    desc: 'Повседневное заваривание на каждый день без специальной посуды.',
    value: 'Обычная керамика (Кружка / Заварочный чайник)'
  }
];

export const CustomTeaModal: React.FC<CustomTeaModalProps> = ({
  isOpen,
  onClose,
  onSaveTea,
  editingTea,
  onDeleteTea
}) => {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // Archetype selection
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('generic_sheng_young');

  // Form fields
  const [nameRu, setNameRu] = useState<string>('');
  const [nameZh, setNameZh] = useState<string>('');
  const [origin, setOrigin] = useState<string>('');
  const [cultivar, setCultivar] = useState<string>('');
  const [oxidationLevel, setOxidationLevel] = useState<string>('');
  const [leafMorphology, setLeafMorphology] = useState<TeaVariety['leafMorphology']>('twisted_strip');

  // Calculations parameters (optional, defaults to archetype)
  const [optimalTemp, setOptimalTemp] = useState<string>('');
  const [defaultMass, setDefaultMass] = useState<string>('');
  const [defaultVolume, setDefaultVolume] = useState<string>('');
  const [recommendedSteeps, setRecommendedSteeps] = useState<string>('');
  const [recommendedVesselRu, setRecommendedVesselRu] = useState<string>('');
  const [vintageYear, setVintageYear] = useState<string>(String(currentYear));

  // Sensory and notes
  const [sensoryTags, setSensoryTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [scientificDescription, setScientificDescription] = useState<string>('');

  // UI state
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [isMorphologyDropdownOpen, setIsMorphologyDropdownOpen] = useState<boolean>(false);
  const [isVesselDropdownOpen, setIsVesselDropdownOpen] = useState<boolean>(false);

  // Active base archetype object
  const baseArchetype = useMemo(() => {
    return GENERIC_TEA_ARCHETYPES.find((a) => a.id === selectedArchetypeId) || GENERIC_TEA_ARCHETYPES[0];
  }, [selectedArchetypeId]);

  // Aging capability is derived strictly from the archetype
  const isAgingSupportedByArchetype = useMemo(() => {
    return canTeaAge(baseArchetype);
  }, [baseArchetype]);

  const currentMorphology = useMemo(() => {
    return LEAF_MORPHOLOGY_OPTIONS.find((opt) => opt.id === leafMorphology) || LEAF_MORPHOLOGY_OPTIONS[0];
  }, [leafMorphology]);

  const currentVessel = useMemo(() => {
    if (!recommendedVesselRu.trim()) {
      return {
        label: `По умолчанию: ${baseArchetype.recommendedVesselRu}`,
        desc: `Рекомендация базового архетипа (${baseArchetype.nameRu})`
      };
    }
    const matched = EXISTING_VESSEL_OPTIONS.find((v) => v.value === recommendedVesselRu || v.label === recommendedVesselRu);
    if (matched) return matched;
    return {
      label: recommendedVesselRu,
      desc: 'Выбранная посуда'
    };
  }, [recommendedVesselRu, baseArchetype]);

  const archetypeOxNum = useMemo(() => {
    const match = baseArchetype.oxidationLevel.match(/\d+/);
    return match ? match[0] : '70';
  }, [baseArchetype]);

  // Load editing tea or defaults when opening
  useEffect(() => {
    if (!isOpen) return;

    setIsConfirmingDelete(false);
    setIsMorphologyDropdownOpen(false);
    setIsVesselDropdownOpen(false);

    if (editingTea) {
      const matchedArch = GENERIC_TEA_ARCHETYPES.find((a) => a.type === editingTea.type) || GENERIC_TEA_ARCHETYPES[0];
      setSelectedArchetypeId(matchedArch.id);
      setNameRu(editingTea.nameRu || '');
      setNameZh(editingTea.nameZh || '');
      setOrigin(editingTea.origin || '');
      setCultivar(editingTea.cultivar || '');
      setOxidationLevel(editingTea.oxidationLevel ? (editingTea.oxidationLevel.match(/\d+/)?.[0] || '') : '');
      setLeafMorphology(editingTea.leafMorphology || 'twisted_strip');
      setOptimalTemp(editingTea.optimalTemp ? String(editingTea.optimalTemp) : '');
      setDefaultMass(editingTea.defaultMass ? String(editingTea.defaultMass) : '');
      setDefaultVolume(editingTea.defaultVolume ? String(editingTea.defaultVolume) : '');
      setRecommendedSteeps(editingTea.recommendedSteeps ? String(editingTea.recommendedSteeps) : '');
      setRecommendedVesselRu(editingTea.recommendedVesselRu || '');
      setVintageYear(editingTea.vintageYear ? String(editingTea.vintageYear) : String(currentYear));
      setSensoryTags(editingTea.keySensoryNotes || []);
      setScientificDescription(editingTea.scientificDescription || '');
      setShowAdvancedParams(true);
    } else {
      setSelectedArchetypeId('generic_sheng_young');
      setNameRu('');
      setNameZh('');
      setOrigin('');
      setCultivar('');
      setOxidationLevel('');
      setLeafMorphology('twisted_strip');
      setOptimalTemp('');
      setDefaultMass('');
      setDefaultVolume('');
      setRecommendedSteeps('');
      setRecommendedVesselRu('');
      setVintageYear(String(currentYear));
      setSensoryTags([]);
      setCustomTagInput('');
      setScientificDescription('');
      setShowAdvancedParams(false);
      setValidationError(null);
    }
  }, [isOpen, editingTea, currentYear]);

  // When changing archetype on a new tea, prefill morphology
  const handleArchetypeChange = (newArchetypeId: string) => {
    setSelectedArchetypeId(newArchetypeId);
    const arch = GENERIC_TEA_ARCHETYPES.find((a) => a.id === newArchetypeId);
    if (!arch) return;

    setLeafMorphology(arch.leafMorphology);
    setOxidationLevel('');
    setRecommendedVesselRu(arch.recommendedVesselRu);
  };

  const handleToggleTag = (tag: string) => {
    if (sensoryTags.includes(tag)) {
      setSensoryTags(sensoryTags.filter((t) => t !== tag));
    } else {
      if (sensoryTags.length < 8) {
        setSensoryTags([...sensoryTags, tag]);
      }
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (trimmed && !sensoryTags.includes(trimmed) && sensoryTags.length < 8) {
      setSensoryTags([...sensoryTags, trimmed]);
      setCustomTagInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameRu.trim()) {
      setValidationError('Пожалуйста, укажите название чая');
      return;
    }

    // Calculations parameters (fallback to base archetype if empty)
    const parsedTemp = optimalTemp.trim() ? Math.max(60, Math.min(100, Math.round(Number(optimalTemp)))) : baseArchetype.optimalTemp;
    const parsedMass = defaultMass.trim() ? Math.max(1, Math.min(25, Number(defaultMass))) : baseArchetype.defaultMass;
    const parsedVolume = defaultVolume.trim() ? Math.max(40, Math.min(500, Math.round(Number(defaultVolume)))) : baseArchetype.defaultVolume;
    const parsedSteeps = recommendedSteeps.trim() ? Math.max(3, Math.min(20, Math.round(Number(recommendedSteeps)))) : baseArchetype.recommendedSteeps;
    const parsedYear = vintageYear.trim() ? Math.max(1950, Math.min(currentYear, Math.round(Number(vintageYear)))) : currentYear;

    // Rinse is strictly derived from archetype
    const isRinseNeeded = baseArchetype.rinseRecommended ?? (
      baseArchetype.type === 'sheng_puerh' || 
      baseArchetype.type === 'shou_puerh' || 
      baseArchetype.type === 'heicha' || 
      baseArchetype.leafMorphology === 'tight_ball' || 
      baseArchetype.leafMorphology === 'compressed_cake'
    );
    const archetypeRinseSec = baseArchetype.rinseSeconds || 5;
    const archetypeRinseNote = baseArchetype.rinseNoteRu || (isRinseNeeded ? 'Быстрое пробуждение листа' : 'Промыв не требуется');

    const savedTea: TeaVariety = {
      id: editingTea?.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      nameRu: nameRu.trim(),
      transcriptionRu: editingTea?.transcriptionRu || `${nameRu.trim()} (Собственный чай)`,
      // Non-brewing fields: if left empty, keep empty!
      nameZh: nameZh.trim(),
      namePinyin: '',
      type: baseArchetype.type,
      typeNameRu: baseArchetype.typeNameRu,
      origin: origin.trim(),
      cultivar: cultivar.trim(),
      leafMorphology: leafMorphology || baseArchetype.leafMorphology,
      oxidationLevel: (() => {
        const clean = oxidationLevel.trim();
        if (!clean) return baseArchetype.oxidationLevel;
        if (/^\d+(\.\d+)?$/.test(clean)) return `${clean}%`;
        return clean;
      })(),
      optimalTemp: parsedTemp,
      tempRange: [Math.max(60, parsedTemp - 5), Math.min(100, parsedTemp + 5)],
      defaultMass: parsedMass,
      defaultVolume: parsedVolume,
      recommendedVesselRu: recommendedVesselRu.trim() || baseArchetype.recommendedVesselRu,
      keySensoryNotes: sensoryTags,
      scientificDescription: scientificDescription.trim(),
      recommendedSteeps: parsedSteeps,
      categoryGroup: 'specific',
      isArchetype: false,
      isCustom: true,
      // Aging is strictly based on archetype
      canAge: isAgingSupportedByArchetype,
      vintageYear: isAgingSupportedByArchetype ? parsedYear : currentYear,
      // Rinse is strictly based on archetype
      rinseRecommended: isRinseNeeded,
      rinseSeconds: isRinseNeeded ? archetypeRinseSec : 0,
      rinseNoteRu: archetypeRinseNote,
      effectCategory: baseArchetype.effectCategory,
      effectNameRu: baseArchetype.effectNameRu,
      effectDescriptionRu: baseArchetype.effectDescriptionRu
    };

    onSaveTea(savedTea);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl border border-stone-200 shadow-2xl p-5 sm:p-7 text-stone-900 flex flex-col max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200/80 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0 shadow-2xs">
              <Leaf className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-tight">
                {editingTea ? 'Редактировать свой чай' : 'Добавить чай'}
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Недостающие параметры для расчётов автоматически рассчитаются по эталонному архетипу
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            title="Закрыть окно"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {validationError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. Base Archetype Selection */}
          <div className="space-y-2 p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
            <div className="flex items-center justify-between">
              <label htmlFor="archetype-select" className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-700" />
                <span>Базовый архетип (семейство чая):</span>
              </label>
              <span className="text-[11px] text-amber-900 font-medium">
                Ядро математической модели
              </span>
            </div>

            <div className="relative">
              <select
                id="archetype-select"
                value={selectedArchetypeId}
                onChange={(e) => handleArchetypeChange(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-stone-300 bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 focus:border-amber-700 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
              >
                {GENERIC_TEA_ARCHETYPES.map((arch) => (
                  <option key={arch.id} value={arch.id}>
                    {arch.nameRu} ({arch.typeNameRu}) • Базово {arch.optimalTemp}°C, 1:{Math.round(arch.defaultVolume / arch.defaultMass)}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="text-[11px] text-stone-600 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/70 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
              <div>
                <strong>{baseArchetype.nameRu}:</strong> {baseArchetype.scientificDescription.slice(0, 140)}...
              </div>
            </div>
          </div>

          {/* 2. Main Identity Fields */}
          <div className="space-y-3.5">
            <div>
              <label htmlFor="custom-tea-name" className="block text-xs font-bold text-stone-800 mb-1">
                Название чая <span className="text-rose-600">*</span>
              </label>
              <input
                id="custom-tea-name"
                type="text"
                required
                value={nameRu}
                onChange={(e) => {
                  setNameRu(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="например: Дикий Шэн с горы Иу, Красный Дянь Хун Маофэн..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 focus:border-amber-700 font-medium text-stone-900 shadow-2xs placeholder:text-stone-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="custom-tea-zh" className="block text-xs font-semibold text-stone-700 mb-1">
                  Иероглифы
                </label>
                <input
                  id="custom-tea-zh"
                  type="text"
                  value={nameZh}
                  onChange={(e) => setNameZh(e.target.value)}
                  placeholder="например: 易武古树, 大红袍"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 focus:border-amber-700 font-serif text-stone-900 shadow-2xs placeholder:text-stone-400"
                />
              </div>

              <div>
                <label htmlFor="custom-tea-origin" className="block text-xs font-semibold text-stone-700 mb-1">
                  Регион / Провинция
                </label>
                <input
                  id="custom-tea-origin"
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="например: Юньнань, Сишуанбаньна"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 focus:border-amber-700 text-stone-900 shadow-2xs placeholder:text-stone-400"
                />
              </div>
            </div>

            <div>
              <label htmlFor="custom-tea-cultivar" className="block text-xs font-semibold text-stone-700 mb-1">
                Культивар / Сырьё
              </label>
              <input
                id="custom-tea-cultivar"
                type="text"
                value={cultivar}
                onChange={(e) => setCultivar(e.target.value)}
                placeholder="например: Ассамика, Цай Ча, Мэйчжань"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 focus:border-amber-700 text-stone-900 shadow-2xs placeholder:text-stone-400"
              />
            </div>

            {/* Vintage / Aging block - only for archetypes that mature with age */}
            {isAgingSupportedByArchetype && (
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-800" />
                    <span>Год сбора урожая:</span>
                  </span>
                  <span className="text-[11px] text-amber-900 font-medium">
                    Сорт подлежит выдержке по архетипу
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <div className="w-36">
                    <input
                      type="number"
                      min="1950"
                      max={currentYear}
                      value={vintageYear}
                      onChange={(e) => setVintageYear(e.target.value)}
                      placeholder={String(currentYear)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white font-mono font-bold text-stone-900 text-center"
                    />
                  </div>
                  <span className="text-xs text-stone-500">
                    {Number(vintageYear) === currentYear ? (
                      'Свежий сбор текущего года'
                    ) : (
                      `Возраст: ${Math.max(0, currentYear - Number(vintageYear))} лет выдержки`
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Sensory Profile Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Вкусовой букет и ноты:</span>
              </label>
              <span className="text-[11px] text-stone-400">
                выбрано {sensoryTags.length} из 8
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 p-2 bg-stone-50 rounded-xl border border-stone-200 max-h-36 overflow-y-auto">
              {COMMON_SENSORY_TAGS.map((tag) => {
                const isSelected = sensoryTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-800 text-white border-amber-800 shadow-2xs font-semibold'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder="например: курага, жасмин, лесной мох..."
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white text-stone-900 placeholder:text-stone-400"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="px-3 py-1.5 text-xs rounded-lg bg-stone-200 hover:bg-stone-300 font-semibold text-stone-800 transition-colors cursor-pointer"
              >
                Добавить
              </button>
            </div>
          </div>

          {/* 4. Advanced / Calculations Parameters Toggle */}
          <div className="border-t border-stone-200 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
              className="w-full flex items-center justify-between text-left p-2.5 rounded-xl hover:bg-stone-100/70 transition-colors cursor-pointer text-xs font-bold text-stone-800"
            >
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-700" />
                <span>Параметры расчёта экстракции</span>
                <span className="text-[11px] font-normal text-stone-500">
                  (температура, граммовка, посуда, форма листа, ферментация)
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${showAdvancedParams ? 'rotate-180' : ''}`} />
            </button>

            {showAdvancedParams && (
              <div className="mt-3 space-y-4 p-4 bg-stone-50/70 rounded-2xl border border-stone-200 animate-in fade-in duration-150 text-xs">
                {/* Notice */}
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-950 flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                  <span>
                    Если оставить поля пустыми, алгоритм симулятора применит эталонные физико-химические константы архетипа <strong>{baseArchetype.nameRu}</strong>.
                  </span>
                </div>

                {/* Dropdowns Grid: Leaf Morphology & Recommended Vessel */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Leaf Morphology Custom Dropdown */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
                      <Leaf className="w-3.5 h-3.5 text-amber-700" />
                      <span>Форма листа / Скрутка:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMorphologyDropdownOpen(!isMorphologyDropdownOpen);
                        setIsVesselDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white hover:border-amber-700/60 focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 text-left transition-all flex items-center justify-between shadow-2xs cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-stone-900 truncate">
                          {currentMorphology.label}
                        </div>
                        <div className="text-[11px] text-stone-500 truncate mt-0.5">
                          {currentMorphology.desc}
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${isMorphologyDropdownOpen ? 'rotate-180 text-amber-800' : ''}`} />
                    </button>

                    {isMorphologyDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-stone-200 shadow-xl p-1.5 space-y-1 z-30 animate-in fade-in duration-150 max-h-56 overflow-y-auto">
                        {LEAF_MORPHOLOGY_OPTIONS.map((opt) => {
                          const isSelected = leafMorphology === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setLeafMorphology(opt.id);
                                setIsMorphologyDropdownOpen(false);
                              }}
                              className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer flex flex-col ${
                                isSelected ? 'bg-amber-100/70 text-amber-950 font-bold' : 'hover:bg-stone-50 text-stone-800'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{opt.label}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-amber-800 shrink-0" />}
                              </div>
                              <span className="text-[11px] text-stone-500 font-normal mt-0.5">{opt.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recommended Vessel Custom Dropdown */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
                      <Coffee className="w-3.5 h-3.5 text-amber-700" />
                      <span>Рекомендуемая посуда:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsVesselDropdownOpen(!isVesselDropdownOpen);
                        setIsMorphologyDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white hover:border-amber-700/60 focus:outline-hidden focus:ring-2 focus:ring-amber-800/20 text-left transition-all flex items-center justify-between shadow-2xs cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-stone-900 truncate">
                          {currentVessel.label}
                        </div>
                        <div className="text-[11px] text-stone-500 truncate mt-0.5">
                          {currentVessel.desc}
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${isVesselDropdownOpen ? 'rotate-180 text-amber-800' : ''}`} />
                    </button>

                    {isVesselDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-stone-200 shadow-xl p-1.5 space-y-1 z-30 animate-in fade-in duration-150 max-h-56 overflow-y-auto">
                        {/* Option 0: Archetype default */}
                        <button
                          type="button"
                          onClick={() => {
                            setRecommendedVesselRu('');
                            setIsVesselDropdownOpen(false);
                          }}
                          className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer flex flex-col ${
                            !recommendedVesselRu ? 'bg-amber-100/70 text-amber-950 font-bold' : 'hover:bg-stone-50 text-stone-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">По умолчанию архетипа ({baseArchetype.nameRu})</span>
                            {!recommendedVesselRu && <Check className="w-3.5 h-3.5 text-amber-800 shrink-0" />}
                          </div>
                          <span className="text-[11px] text-stone-500 font-normal mt-0.5">{baseArchetype.recommendedVesselRu}</span>
                        </button>

                        {/* Existing Vessels Options */}
                        {EXISTING_VESSEL_OPTIONS.map((opt) => {
                          const isSelected = recommendedVesselRu === opt.value;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setRecommendedVesselRu(opt.value);
                                setIsVesselDropdownOpen(false);
                              }}
                              className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer flex flex-col ${
                                isSelected ? 'bg-amber-100/70 text-amber-950 font-bold' : 'hover:bg-stone-50 text-stone-800'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{opt.label}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-amber-800 shrink-0" />}
                              </div>
                              <span className="text-[11px] text-stone-500 font-normal mt-0.5">{opt.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Numerical Extraction Parameters Grid: Temp, Mass, Volume, Fermentation */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="custom-temp" className="block font-semibold text-stone-700 mb-1">
                      Температура (°C)
                    </label>
                    <input
                      id="custom-temp"
                      type="number"
                      min="60"
                      max="100"
                      value={optimalTemp}
                      onChange={(e) => setOptimalTemp(e.target.value)}
                      placeholder={`например: ${baseArchetype.optimalTemp}`}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-mono text-center font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="custom-mass" className="block font-semibold text-stone-700 mb-1">
                      Масса листа (г)
                    </label>
                    <input
                      id="custom-mass"
                      type="number"
                      step="0.1"
                      min="1"
                      max="20"
                      value={defaultMass}
                      onChange={(e) => setDefaultMass(e.target.value)}
                      placeholder={`например: ${baseArchetype.defaultMass}`}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-mono text-center font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="custom-volume" className="block font-semibold text-stone-700 mb-1">
                      Объем воды (мл)
                    </label>
                    <input
                      id="custom-volume"
                      type="number"
                      min="40"
                      max="500"
                      value={defaultVolume}
                      onChange={(e) => setDefaultVolume(e.target.value)}
                      placeholder={`например: ${baseArchetype.defaultVolume}`}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-mono text-center font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="custom-tea-ox" className="block font-semibold text-stone-700 mb-1">
                      Ферментация (%)
                    </label>
                    <input
                      id="custom-tea-ox"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={oxidationLevel}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val === '') {
                          setOxidationLevel('');
                        } else {
                          const num = Math.min(100, Math.max(0, parseInt(val, 10)));
                          setOxidationLevel(String(num));
                        }
                      }}
                      placeholder={`например: ${archetypeOxNum}`}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-mono text-center font-bold text-stone-900"
                    />
                  </div>
                </div>

                {/* Expected Steeps */}
                <div className="max-w-xs">
                  <label htmlFor="custom-steeps" className="block font-semibold text-stone-700 mb-1">
                    Ожидаемое число заварок
                  </label>
                  <input
                    id="custom-steeps"
                    type="number"
                    min="3"
                    max="20"
                    value={recommendedSteeps}
                    onChange={(e) => setRecommendedSteeps(e.target.value)}
                    placeholder={`например: ${baseArchetype.recommendedSteeps}`}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-mono text-center font-bold text-stone-900"
                  />
                </div>

                {/* Notes and description */}
                <div>
                  <label htmlFor="custom-desc" className="block font-semibold text-stone-700 mb-1">
                    Личные заметки / Описание чая
                  </label>
                  <textarea
                    id="custom-desc"
                    rows={2}
                    value={scientificDescription}
                    onChange={(e) => setScientificDescription(e.target.value)}
                    placeholder="например: Весенний сбор со старых деревьев, выраженная сладость и плотный настой..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 bg-white text-stone-900 shadow-2xs placeholder:text-stone-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer with Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-stone-200">
            {editingTea && onDeleteTea ? (
              isConfirmingDelete ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-rose-700 font-semibold">Точно удалить?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTea(editingTea.id);
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-2xs"
                  >
                    Да, удалить
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-3 py-2 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить сорт</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{editingTea ? 'Сохранить изменения' : 'Добавить чай'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
