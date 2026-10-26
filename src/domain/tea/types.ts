/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Источник происхождения числовых или качественных данных в модели.
 * Принцип: "Неизвестное значение не равно нулю" (Unknown != 0).
 */
export type DataOriginType = 'measured' | 'estimated' | 'user_defined' | 'unknown';

/**
 * Обертка над физической или химической величиной с явным указанием единицы измерения и источника.
 */
export interface ValueWithOrigin<T> {
  readonly value: T | null;
  readonly origin: DataOriginType;
  readonly unit: string;
  readonly confidence?: number; // 0.0 – 1.0 (степень доверия к значению)
  readonly sourceNotes?: string; // Литературный источник, прибор или примечание
}

/**
 * Категории чая по китайской классификации (степень окисления и технология).
 */
export type TeaCategory =
  | 'green'        // Зелёный (неферментированный)
  | 'white'        // Белый (естественное завяливание и сушка)
  | 'yellow'       // Жёлтый (слабое томление / мэнхуан)
  | 'oolong_light' // Светлый улун (сферическая скрутка, слабая ферментация)
  | 'oolong_dark'  // Тёмный улун (продольная скрутка, прогрев на углях)
  | 'black'        // Красный / Чёрный (полная оксидация)
  | 'sheng_puer'   // Шэн пуэр (естественная постферментация)
  | 'shou_puer'    // Шу пуэр (ускоренная влажная постферментация)
  | 'hei_cha';     // Хэй ча (чёрный чай кирпичной прессовки)

/**
 * Морфологическая форма чайного листа.
 * Определяет площадь соприкосновения с водой и кинетику набухания.
 */
export type LeafMorphology =
  | 'whole_bud'             // Цельная почка (Цзинь Цзюнь Мэй, Бай Хао Инь Чжэнь)
  | 'bud_and_leaves'        // Почка и верхние листья (1-2 листа)
  | 'mature_open_leaves'    // Крупные зрелые раскрытые листья
  | 'tightly_rolled_ball'   // Сферическая тугая скрутка (Те Гуаньинь, Дун Дин)
  | 'strip_rolled'          // Продольная полосовая скрутка (Да Хун Пао, Даньцуны)
  | 'compressed_cake_chunk'; // Прессованный блин / кирпич (пуэры, хэй ча)

/**
 * Полный паспорт образца чая.
 * Все характеристики являются входными данными, а не результатами симуляции.
 */
export interface TeaSample {
  readonly id: string;
  readonly name: string;
  readonly nativeName?: string; // Оригинальное китайское название иероглифами
  readonly category: TeaCategory;
  readonly originRegion: string;
  readonly harvestYear?: number;
  readonly morphology: LeafMorphology;

  // Физико-морфологические параметры листа
  readonly hydrationSpeedFactor: ValueWithOrigin<number>; // Условная скорость смачивания листа (0.1 – 2.0)
  readonly waterAbsorptionRatio: ValueWithOrigin<number>; // г воды, удерживаемой 1 г сухого листа (типично 2.0 – 3.2 г/г)
  readonly leafDensityGPerCm3: ValueWithOrigin<number>;   // Насыпная плотность листа (г/см³)

  // Химический резервуар экстрагируемых веществ (% от массы сухого листа или г/100г)
  readonly totalSolubleFraction: ValueWithOrigin<number>; // Суммарная доля водорастворимого сухого остатка (30–45%)
  readonly caffeineEstimate: ValueWithOrigin<number>;     // Алкалоиды / кофеин (2.0–5.5%)
  readonly polyphenolsEstimate: ValueWithOrigin<number>;  // Полифенолы / катехины (12–30%)
  readonly theanineEstimate: ValueWithOrigin<number>;     // L-теанин и аминокислоты (1.0–4.5%)

  readonly isCustom: boolean;
  readonly notes?: string;
}

/**
 * Фабричная функция для создания типизированного значения с источником.
 */
export function createValueWithOrigin<T>(
  value: T | null,
  origin: DataOriginType,
  unit: string,
  sourceNotes?: string,
  confidence?: number
): ValueWithOrigin<T> {
  return {
    value: origin === 'unknown' ? null : value,
    origin,
    unit,
    confidence: origin === 'unknown' ? undefined : (confidence ?? 1.0),
    sourceNotes,
  };
}

/**
 * Проверка, является ли значение известным (не unknown и не null).
 */
export function isKnownValue<T>(item: ValueWithOrigin<T>): item is ValueWithOrigin<T> & { value: T } {
  return item.origin !== 'unknown' && item.value !== null && item.value !== undefined;
}

/**
 * Форматирование величины с единицей измерения или обозначением отсутствия данных.
 */
export function formatValueWithUnit(
  val: ValueWithOrigin<number>,
  digits = 1
): string {
  if (!isKnownValue(val)) {
    return 'Данные отсутствуют';
  }
  return `${val.value.toFixed(digits)} ${val.unit}`;
}
