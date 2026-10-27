/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Источник происхождения числовых или качественных данных в модели.
 * Строгая градация достоверности:
 * - measured: проверенное лабораторное измерение конкретного образца (с указанием метода и сведений об образце);
 * - literature: значение из проверяемого литературного / научного источника (монография, справочник, статья);
 * - model_profile: предварительная оценка или типовой ориентировочный профиль модели (демонстрационные данные);
 * - user_defined: значение, явно введённое пользователем вручную;
 * - unknown: неизвестное значение (данные отсутствуют).
 *
 * Принцип: "Неизвестное значение не равно нулю" (Unknown ≠ 0).
 */
export type DataOriginType =
  | 'measured'
  | 'literature'
  | 'model_profile'
  | 'user_defined'
  | 'unknown';

/**
 * Обоснованная оценка неопределённости (только при наличии реального протокола).
 */
export interface MeasurementUncertainty {
  readonly plusMinus?: number;
  readonly description?: string;
}

/**
 * Обертка над физической или химической величиной с явным указанием единицы измерения и источника.
 */
export interface ValueWithOrigin<T> {
  readonly value: T | null;
  readonly origin: DataOriginType;
  readonly unit: string;
  readonly uncertainty?: MeasurementUncertainty; // Не фиктивный, только если обоснован протоколом
  readonly sourceNotes?: string;                 // Пояснение контекста происхождения
  readonly citation?: string;                    // Библиографическая ссылка для литературы
  readonly measurementMethod?: string;           // Лабораторный метод (для measured)
  readonly sampleInfo?: string;                  // Идентификатор / описание образца (для measured)
}

/**
 * Категории чая по китайской классификации (степень окисления и технология).
 */
export type TeaCategory =
  | 'green'        // Зелёный (неферментированный)
  | 'white'        // Белый (естественное завяливание и сушка)
  | 'yellow'       // Жёлтый (слабое томление / мэнхуан)
  | 'oolong_light' // Светлый улун (слабая ферментация, сферическая скрутка)
  | 'oolong_dark'  // Тёмный улун (продольная скрутка, прогрев на углях)
  | 'black'        // Красный / Чёрный (полная оксидация)
  | 'sheng_puer'   // Шэн пуэр (естественная постферментация)
  | 'shou_puer'    // Шу пуэр (ускоренная влажная постферментация)
  | 'hei_cha';     // Хэй ча (чёрный чай прессованный)

/**
 * Морфологическая форма и целостность чайного листа.
 */
export type LeafMorphology =
  | 'whole_bud'             // Цельная верхушечная почка
  | 'bud_and_leaves'        // Почка и 1-2 прилегающих листа
  | 'mature_open_leaves'    // Крупные зрелые раскрытые листья
  | 'tightly_rolled_ball'   // Сферическая тугая скрутка
  | 'strip_rolled'          // Продольная полосовая скрутка
  | 'compressed_cake_chunk'; // Прессованный фрагмент блина / кирпича

/**
 * Степень прогрева / обжарки листа (технический параметр).
 */
export type RoastLevel = 'none' | 'light' | 'medium' | 'heavy';

/**
 * Полный паспорт образца чая.
 * Все характеристики являются входными данными, а не результатами симуляции.
 */
export interface TeaSample {
  readonly id: string;
  readonly name: string;
  readonly nativeName?: string;
  readonly category?: TeaCategory; // Для пользовательского чая может быть не указана
  readonly morphology?: LeafMorphology; // Для пользовательского чая может быть не указана
  readonly originRegion?: string;
  readonly cultivar?: string;      // Культивар / ботаническая разновидность
  readonly producer?: string;      // Производитель / фабрика / мастер
  readonly harvestYear?: number;   // Год сбора (не подставляется автоматически!)
  readonly productionYear?: number; // Год прессовки / финальной обработки
  readonly roastLevel?: RoastLevel;
  readonly processingNotes?: string; // Технологические особенности обработки

  // --- Физические параметры листа ---
  // Физическое водопоглощение матрицы сухого листа (г связанной воды на 1 г сухого листа)
  readonly waterAbsorptionRatio: ValueWithOrigin<number>;
  // Насыпная плотность сухой навески (г/см³)
  readonly leafBulkDensityGPerCm3: ValueWithOrigin<number>;
  // Некалиброванный внутренний параметр модели (скорость смачивания). Не является обязательным свойством чая.
  readonly uncalibratedHydrationSpeed?: ValueWithOrigin<number>;
  // Размерная константа скорости гидратации (с⁻¹ / s⁻¹).
  // Физически отделена от безразмерного эвристического индекса uncalibratedHydrationSpeed.
  readonly hydrationRateConstantPerSecond?: ValueWithOrigin<number>;

  // --- Химический состав сухого листа (% от массы сухого листа) ---
  // Общая доля водорастворимого сухого остатка (% от массы сухого листа).
  // Включает в себя растворимые углеводы, полифенолы, аминокислоты, минералы и алкалоиды.
  readonly totalExtractableFraction: ValueWithOrigin<number>;
  // Отдельные компоненты (входят в состав сухого листа, НЕ прибавляются сверх totalExtractableFraction!):
  readonly caffeineFraction: ValueWithOrigin<number>;      // Алкалоиды / кофеин (% от массы сухого листа)
  readonly totalPolyphenolsFraction: ValueWithOrigin<number>; // Суммарные полифенолы / катехины (% от массы сухого листа)
  readonly theanineFraction: ValueWithOrigin<number>;      // L-теанин и аминокислоты (% от массы сухого листа)

  readonly isCustom: boolean;
  // Редакционное энциклопедическое описание для каталога (не субъективные дегустационные заметки!)
  readonly editorialSummary?: string;
}

/**
 * Создание типизированного значения с источником и валидацией инвариантов.
 * Инварианты:
 * 1. Если origin === 'unknown', value ОБЯЗАНО быть null.
 * 2. Если origin !== 'unknown', value НЕ МОЖЕТ быть null или undefined (иначе origin принудительно unknown).
 * 3. Не допускается автоматическое присвоение confidence = 1.0.
 */
export function createValueWithOrigin<T = number>(
  value: T | null | undefined,
  origin: DataOriginType,
  unit: string,
  options?: {
    uncertainty?: MeasurementUncertainty;
    sourceNotes?: string;
    citation?: string;
    measurementMethod?: string;
    sampleInfo?: string;
  }
): ValueWithOrigin<T> {
  // Инвариант: unknown всегда имеет value: null
  if (origin === 'unknown' || value === null || value === undefined) {
    return {
      value: null,
      origin: 'unknown',
      unit,
      sourceNotes: options?.sourceNotes,
    };
  }

  return {
    value,
    origin,
    unit,
    uncertainty: options?.uncertainty,
    sourceNotes: options?.sourceNotes,
    citation: options?.citation,
    measurementMethod: options?.measurementMethod,
    sampleInfo: options?.sampleInfo,
  };
}

/**
 * Проверка, является ли значение известным (не unknown и не null).
 */
export function isKnownValue<T>(
  item: ValueWithOrigin<T> | undefined | null
): item is ValueWithOrigin<T> & { value: T } {
  return (
    item !== undefined &&
    item !== null &&
    item.origin !== 'unknown' &&
    item.value !== null &&
    item.value !== undefined
  );
}

/**
 * Форматирование величины с единицей измерения или обозначением отсутствия данных.
 */
export function formatValueWithUnit(
  val: ValueWithOrigin<number> | undefined | null,
  digits = 1
): string {
  if (!isKnownValue(val)) {
    return 'Данные отсутствуют';
  }
  const uncertaintyStr = val.uncertainty?.plusMinus
    ? ` ± ${val.uncertainty.plusMinus.toFixed(digits)}`
    : '';
  return `${val.value.toFixed(digits)}${uncertaintyStr} ${val.unit}`;
}
