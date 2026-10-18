export interface LeafMorphologyInfo {
  title: string;
  sub: string;
  simpleDesc: string;
  userTip: string;
}

/**
 * Provides domain-specific brewing insights and sensory guidance based on leaf morphology.
 */
export function getLeafMorphologyInfo(morphology: string): LeafMorphologyInfo {
  switch (morphology) {
    case 'tight_ball':
      return {
        title: 'Сферическая скрутка (шарики)',
        sub: 'Те Гуань Инь, Дун Дин, Тайваньские улуны',
        simpleDesc: 'Плотный лист. Раскрывается к 3–4 проливу.',
        userTip: 'Пик вкуса к 3–4 проливу.'
      };
    case 'twisted_strip':
      return {
        title: 'Продольная скрутка (жгутики)',
        sub: 'Да Хун Пао, Утесные улуны, Дань Цуны, Дянь Хун',
        simpleDesc: 'Открытая форма. Быстрая отдача вкуса.',
        userTip: 'Первые проливы быстрые (8–10 с).'
      };
    case 'bud_needle':
    case 'needle':
      return {
        title: 'Почки и типсы (иглы)',
        sub: 'Бай Хао Инь Чжэнь, Цзинь Цзюнь Мэй',
        simpleDesc: 'Нежные почки. Сладкий настой без горечи.',
        userTip: 'Мягкий настой, высокая стойкость.'
      };
    case 'flat_pressed':
    case 'flat':
      return {
        title: 'Плоский лист',
        sub: 'Си Ху Лун Цзин, Тайпин Хоукуй',
        simpleDesc: 'Тонкий лист. Моментальный выход теанина.',
        userTip: 'Быстрые проливы при 75–80°C.'
      };
    case 'pressed_cake':
    case 'compressed_cake':
      return {
        title: 'Прессованный лист (блин/точа)',
        sub: 'Шэн Пуэр, Шу Пуэр, выдержанный белый чай',
        simpleDesc: 'Плотная форма. Требует распаривания.',
        userTip: 'Нужен быстрый нулевой промыв.'
      };
    case 'broken_leaf':
      return {
        title: 'Мелкий / ломаный лист',
        sub: 'Мелколистовые чаи, ганпаудер',
        simpleDesc: 'Нарушенная структура. Быстрая экстракция.',
        userTip: 'Мгновенный слив (5–8 с).'
      };
    case 'large_open':
    default:
      return {
        title: 'Крупный цельный лист',
        sub: 'Шоу Мэй, Белый чай, крупные красные чаи',
        simpleDesc: 'Свободный лист. Плавная отдача веществ.',
        userTip: 'Баланс вкуса на 8–10 проливов.'
      };
  }
}
