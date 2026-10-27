/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeaSample, createValueWithOrigin } from '../domain/tea/types.ts';

/**
 * Эталонный демонстрационный каталог чаёв Gongfu Cha Lab.
 *
 * ВАЖНОЕ МЕТРОЛОГИЧЕСКОЕ ПРИМЕЧАНИЕ:
 * Ни одно из приведенных ниже демонстрационных значений не является физически подтвержденным
 * первичным лабораторным измерением конкретной партии (отсутствует лабораторный сертификат
 * испытаний с идентификатором партии и поверенным протоколом).
 *
 * Все приведенные числовые параметры разделены на:
 * - 'literature': типичные диапазоны из опубликованной чайной литературы / справочников культиваров;
 * - 'model_profile': демонстрационные ориентиры модели для предварительного моделирования;
 * - 'unknown': параметры, для которых нет надежного основания (значение равно null, Unknown ≠ 0).
 */
export const REFERENCE_TEAS: TeaSample[] = [
  {
    id: 'tea-longjing',
    name: 'Си Ху Лун Цзин',
    nativeName: '西湖龙井',
    category: 'green',
    originRegion: 'Чжэцзян, Ханчжоу (Мэйцзяву)',
    cultivar: 'Лунцзин #43 / Цюньтичжун',
    harvestYear: undefined, // Не подставляем фиктивный год сбора для эталона
    morphology: 'bud_and_leaves',
    roastLevel: 'light',
    processingNotes: 'Фиксация и формование в котле (Шацин), плоский приплюснутый лист',

    // Физические параметры
    waterAbsorptionRatio: createValueWithOrigin(2.6, 'literature', 'г/г', {
      sourceNotes: 'Обобщенные литературные данные сорбции воды неферментированным зеленым листом',
    }),
    leafBulkDensityGPerCm3: createValueWithOrigin(0.38, 'model_profile', 'г/см³', {
      sourceNotes: 'Ориентировочная насыпная плотность сухой навески плоского листа',
    }),
    uncalibratedHydrationSpeed: createValueWithOrigin(1.4, 'model_profile', 'ед.', {
      sourceNotes: 'Некалиброванный модельный параметр скорости смачивания',
    }),
    hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
      sourceNotes: 'Размерная константа скорости гидратации для данной партии не измерена (Unknown ≠ 0)',
    }),

    // Химические фракции (% от массы сухого листа)
    totalExtractableFraction: createValueWithOrigin(38.0, 'literature', '%', {
      sourceNotes: 'Литературный диапазон водорастворимого сухого экстракта зеленого чая высшего сорта (36–42%)',
    }),
    caffeineFraction: createValueWithOrigin(3.2, 'literature', '%', {
      sourceNotes: 'Обобщенные литературные данные содержания кофеина в весенних флешах Camellia sinensis',
    }),
    totalPolyphenolsFraction: createValueWithOrigin(20.0, 'literature', '%', {
      sourceNotes: 'Литературные данные суммарных катехинов для культивара Лунцзин #43',
    }),
    theanineFraction: createValueWithOrigin(3.0, 'literature', '%', {
      sourceNotes: 'Характерное для ранневесеннего Лунцзина высокое содержание L-теанина',
    }),

    isCustom: false,
    editorialSummary: 'Ранневесенний зелёный чай слабой прогревки. Плоская форма листа способствует быстрому первичному смачиванию.',
  },
  {
    id: 'tea-yinzhen',
    name: 'Бай Хао Инь Чжэнь',
    nativeName: '白毫银针',
    category: 'white',
    originRegion: 'Фуцзянь, Фудин (Таймушань)',
    cultivar: 'Фудин Да Бай Ча',
    harvestYear: undefined,
    morphology: 'whole_bud',
    roastLevel: 'none',
    processingNotes: 'Естественное завяливание на солнце и медленная сушка на ситах',

    waterAbsorptionRatio: createValueWithOrigin(2.9, 'model_profile', 'г/г', {
      sourceNotes: 'Демонстрационный ориентир водопоглощения плотной почки',
    }),
    leafBulkDensityGPerCm3: createValueWithOrigin(0.24, 'model_profile', 'г/см³', {
      sourceNotes: 'Низкая насыпная плотность из-за густого ворса',
    }),
    uncalibratedHydrationSpeed: createValueWithOrigin(0.7, 'model_profile', 'ед.', {
      sourceNotes: 'Замедленное первичное смачивание из-за гидрофобного пуха',
    }),
    hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
      sourceNotes: 'Размерная константа скорости гидратации для данной партии не измерена (Unknown ≠ 0)',
    }),

    totalExtractableFraction: createValueWithOrigin(34.0, 'literature', '%', {
      sourceNotes: 'Литературный диапазон экстрактивности почек белого чая',
    }),
    caffeineFraction: createValueWithOrigin(4.0, 'literature', '%', {
      sourceNotes: 'Верхушечные почки Да Бай Ча накапливают повышенное количество пуриновых алкалоидов',
    }),
    totalPolyphenolsFraction: createValueWithOrigin(17.5, 'literature', '%', {
      sourceNotes: 'Неокисленные полифенолы белого чая слабой ферментации',
    }),
    theanineFraction: createValueWithOrigin(3.5, 'literature', '%', {
      sourceNotes: 'Высокое содержание свободных аминокислот в верхушечной почке',
    }),

    isCustom: false,
    editorialSummary: 'Белый чай, состоящий исключительно из цельных весенних почек с густым белым ворсом.',
  },
  {
    id: 'tea-tieguanyin',
    name: 'Аньси Те Гуаньинь',
    nativeName: '安溪铁观音',
    category: 'oolong_light',
    originRegion: 'Фуцзянь, Аньси (Ганьдэ)',
    cultivar: 'Те Гуаньинь',
    harvestYear: undefined,
    morphology: 'tightly_rolled_ball',
    roastLevel: 'none',
    processingNotes: 'Слабая ферментация (Цин Сян), тугая сферическая скрутка в мешках',

    waterAbsorptionRatio: createValueWithOrigin(3.1, 'literature', 'г/г', {
      sourceNotes: 'Удержание влаги зрелым крупным листом с черенком при полном раскрытии',
    }),
    leafBulkDensityGPerCm3: createValueWithOrigin(0.60, 'model_profile', 'г/см³', {
      sourceNotes: 'Высокая насыпная плотность плотных сфер машинной скрутки',
    }),
    uncalibratedHydrationSpeed: createValueWithOrigin(0.45, 'model_profile', 'ед.', {
      sourceNotes: 'Медленное первичное раскручивание тугих гранул',
    }),
    hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
      sourceNotes: 'Размерная константа скорости гидратации для данной партии не измерена (Unknown ≠ 0)',
    }),

    totalExtractableFraction: createValueWithOrigin(40.0, 'literature', '%', {
      sourceNotes: 'Литературные данные по экстрактивным веществам улунов',
    }),
    caffeineFraction: createValueWithOrigin(2.8, 'literature', '%', {
      sourceNotes: 'Зрелые листья 2-3 порядка содержат меньше кофеина, чем почки',
    }),
    totalPolyphenolsFraction: createValueWithOrigin(18.0, 'literature', '%', {
      sourceNotes: 'Частичная ферментация улунов (25–35%)',
    }),
    theanineFraction: createValueWithOrigin(1.8, 'literature', '%', {
      sourceNotes: 'Умеренное содержание аминокислот в зрелом листе',
    }),

    isCustom: false,
    editorialSummary: 'Светлый южнофуцзяньский улун сферической скрутки. Требует пролива для расправления листьев.',
  },
  {
    id: 'tea-dahongpao',
    name: 'Уи Да Хун Пао',
    nativeName: '武夷大红袍',
    category: 'oolong_dark',
    originRegion: 'Фуцзянь, горы Уи (Чжэн Янь)',
    cultivar: 'Смешанный утесный купаж (Шуйсянь / Жоугуй / Цидань)',
    harvestYear: undefined,
    morphology: 'strip_rolled',
    roastLevel: 'heavy',
    processingNotes: 'Традиционный прогрев на древесных углях (Хунпэй), продольная скрутка',

    waterAbsorptionRatio: createValueWithOrigin(2.7, 'model_profile', 'г/г', {
      sourceNotes: 'Демонстрационный ориентир водопоглощения прогретого утесного листа',
    }),
    leafBulkDensityGPerCm3: createValueWithOrigin(0.32, 'model_profile', 'г/см³', {
      sourceNotes: 'Объемные изогнутые полосы продольной скрутки',
    }),
    uncalibratedHydrationSpeed: createValueWithOrigin(1.2, 'model_profile', 'ед.', {
      sourceNotes: 'Относительно быстрое смачивание за счет пористости прогретой ткани листа',
    }),
    hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
      sourceNotes: 'Размерная константа скорости гидратации для данной партии не измерена (Unknown ≠ 0)',
    }),

    totalExtractableFraction: createValueWithOrigin(39.0, 'literature', '%', {
      sourceNotes: 'Литературный диапазон экстрактивности темных улунов',
    }),
    caffeineFraction: createValueWithOrigin(2.8, 'literature', '%', {
      sourceNotes: 'Справочный уровень кофеина для северофуцзяньских культиваров',
    }),
    totalPolyphenolsFraction: createValueWithOrigin(16.0, 'literature', '%', {
      sourceNotes: 'Полифенолы, частично полимеризованные и окисленные при прогреве',
    }),
    // Для теанина точных литературных данных для этой партии нет -> честный Unknown!
    theanineFraction: createValueWithOrigin<number>(null, 'unknown', '%', {
      sourceNotes: 'Точный уровень свободных аминокислот после глубокого хунпэя не подтвержден литературой',
    }),

    isCustom: false,
    editorialSummary: 'Утёсный улун традиционного угольного прогрева. Высокая термическая устойчивость.',
  },
  {
    id: 'tea-dianhong',
    name: 'Дянь Хун Цзинь Хао',
    nativeName: '滇红金毫',
    category: 'black',
    originRegion: 'Юньнань, Фэнцин',
    cultivar: 'Юньнаньский крупнолистовой (Camellia sinensis var. assamica)',
    harvestYear: undefined,
    morphology: 'bud_and_leaves',
    roastLevel: 'light',
    processingNotes: 'Глубокое сминание, полная ферментация и сушка горячим воздухом',

    waterAbsorptionRatio: createValueWithOrigin(2.7, 'model_profile', 'г/г', {
      sourceNotes: 'Демонстрационный ориентир сорбции крупного юньнаньского листа',
    }),
    leafBulkDensityGPerCm3: createValueWithOrigin(0.35, 'model_profile', 'г/см³', {
      sourceNotes: 'Насыпная плотность крупного листа с ворсом',
    }),
    uncalibratedHydrationSpeed: createValueWithOrigin(1.5, 'model_profile', 'ед.', {
      sourceNotes: 'Разрушенные при сминании клетки листа обеспечивают быстрое смачивание',
    }),
    hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
      sourceNotes: 'Размерная константа скорости гидратации для данной партии не измерена (Unknown ≠ 0)',
    }),

    totalExtractableFraction: createValueWithOrigin(42.0, 'literature', '%', {
      sourceNotes: 'Высокая экстрактивность юньнаньской ассамики по ГОСТ/литературе Китая',
    }),
    caffeineFraction: createValueWithOrigin(3.6, 'literature', '%', {
      sourceNotes: 'Повышенный уровень алкалоидов в крупнолистовом сырье Юньнани',
    }),
    totalPolyphenolsFraction: createValueWithOrigin(14.0, 'literature', '%', {
      sourceNotes: 'Окисленные полифенолы (теафлавины и теарубигины)',
    }),
    theanineFraction: createValueWithOrigin<number>(null, 'unknown', '%', {
      sourceNotes: 'Данные по аминокислотному составу для конкретного профиля отсутствуют',
    }),

    isCustom: false,
    editorialSummary: 'Красный чай из Фэнцина. Высокая плотность экстракта на первых проливах благодаря глубокой оксидации.',
  },
  {
    id: 'tea-sheng-menghai',
    name: 'Мэнхай Шэн Пуэр',
    nativeName: '勐海生普',
    category: 'sheng_puer',
    originRegion: 'Юньнань, Сишуанбаньна (Мэнхай)',
    cultivar: 'Юньнаньский крупнолистовой дикорастущий/плантационный',
    harvestYear: undefined,
    morphology: 'compressed_cake_chunk',
    roastLevel: 'none',
    processingNotes: 'Прессование паром в форме блина, естественное созревание',

    waterAbsorptionRatio: createValueWithOrigin(2.9, 'model_profile', 'г/г', {
      sourceNotes: 'Демонстрационный ориентир сорбции прессованного пуэра',
    }),
    leafBulkDensityGPerCm3: createValueWithOrigin(0.75, 'model_profile', 'г/см³', {
      sourceNotes: 'Плотность прессованного фрагмента блина',
    }),
    uncalibratedHydrationSpeed: createValueWithOrigin(0.35, 'model_profile', 'ед.', {
      sourceNotes: 'Плотная механическая прессовка замедляет проникновение воды',
    }),
    hydrationRateConstantPerSecond: createValueWithOrigin<number>(null, 'unknown', 's^-1', {
      sourceNotes: 'Размерная константа скорости гидратации для данной партии не измерена (Unknown ≠ 0)',
    }),

    totalExtractableFraction: createValueWithOrigin(41.0, 'literature', '%', {
      sourceNotes: 'Литературный диапазон экстрактивности юньнаньского крупнолистового сырья',
    }),
    caffeineFraction: createValueWithOrigin(3.8, 'literature', '%', {
      sourceNotes: 'Крупнолистовой юньнаньский подвид',
    }),
    totalPolyphenolsFraction: createValueWithOrigin(26.0, 'literature', '%', {
      sourceNotes: 'Высокая концентрация неокисленных катехинов в молодом шэне',
    }),
    theanineFraction: createValueWithOrigin<number>(null, 'unknown', '%', {
      sourceNotes: 'Данные анализа аминокислот отсутствуют (Unknown ≠ 0)',
    }),

    isCustom: false,
    editorialSummary: 'Молодой шэн пуэр плотной прессовки. Высокое содержание полифенолов формирует выраженную терпкость.',
  },
];
