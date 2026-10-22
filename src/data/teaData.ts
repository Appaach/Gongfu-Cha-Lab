import { 
  TeaVariety, 
  ChemicalCompoundInfo, 
  WaterHardnessInfo, 
  VesselMaterialInfo, 
  OptimizationPreset,
  BrewingMethodInfo 
} from '../types';
import { EXTRA_TEAS } from './extraTeaData';

export const RAW_TEA_VARIETIES: TeaVariety[] = EXTRA_TEAS;

export const GENERIC_TEA_ARCHETYPES: TeaVariety[] = [
  {
    id: 'generic_green',
    nameRu: 'Зелёный чай',
    transcriptionRu: 'Люй Ча / Зеленый чай / Неферментированный чай',
    nameZh: '绿茶',
    namePinyin: 'Lǜ Chá',
    type: 'green',
    typeNameRu: 'Зелёный чай',
    origin: 'Различные регионы Китая / Японии',
    cultivar: 'Различные мелко- и среднелистовые культивары',
    oxidationLevel: '0% (Фиксация Шацин)',
    leafMorphology: 'flat',
    optimalTemp: 82,
    tempRange: [75, 85],
    defaultMass: 4.5,
    defaultVolume: 100,
    recommendedVesselRu: 'Фарфоровая гайвань с тонкими стенками или стекло',
    keySensoryNotes: ['Свежая трава', 'Зелёный горошек', 'Умами', 'Цветочная сладость'],
    scientificDescription: 'Древнейшая категория чая, ведущая историю от трактата Лу Юя (эпоха Тан). Ценится за первозданную свежесть весеннего листа, бережно зафиксированную в раскаленном котле без окисления.',
    recommendedSteeps: 6,
    categoryGroup: 'generic',
    generalExamplesRu: ['Колодец Дракона с Озера Сиху (Лунцзин)', 'Изумрудные Спирали Весны (Билочунь)', 'Ворсистые Лезвия из Синьяна (Маоцзянь)', 'Главарь Обезьян из Тайпина (Хоукуй)', 'Ворсистые Пики Жёлтых Гор (Маофэн)', 'Белый Чай из Уезда Аньцзи']
  },
  {
    id: 'generic_white_needle',
    nameRu: 'Белый чай: Почечный',
    transcriptionRu: 'Почечный белый чай / 100% нераскрытые типсы с ворсом / Байхао Иньчжэнь',
    nameZh: '白茶 芽头',
    namePinyin: 'Bái Chá Yátóu',
    type: 'white',
    typeNameRu: 'Белый чай: Почечный',
    origin: 'Фудин / Чжэнхэ, пров. Фуцзянь',
    cultivar: 'Фудин Дабайча / Дахаоча',
    oxidationLevel: '5–8% (Естественное завяливание на солнце)',
    leafMorphology: 'needle',
    optimalTemp: 88,
    tempRange: [82, 92],
    defaultMass: 5.0,
    defaultVolume: 100,
    recommendedVesselRu: 'Фарфоровая гайвань с тонкими стенками или стеклянный бокал',
    keySensoryNotes: ['Берёзовый сок', 'Луговой мёд', 'Белые цветы', 'Дыня'],
    scientificDescription: 'Легендарный почечный чай из уезда Фудин, производимый с 1796 года. Собирается вручную ранней весной и веками поставлялся к императорскому двору как эликсир чистоты и долголетия.',
    recommendedSteeps: 8,
    categoryGroup: 'generic',
    generalExamplesRu: ['Почечный сбор (Байхао Иньчжэнь)', 'Почки из Чжэнхэ', 'Белые почки диких деревьев (Я Бао)']
  },
  {
    id: 'generic_white_mudan',
    nameRu: 'Белый чай: Листо-почечный',
    transcriptionRu: 'Листо-почечный белый чай / Почка + 1–2 молодых листа / Бай Мудань',
    nameZh: '白茶 一芽一二叶',
    namePinyin: 'Bái Chá Yī Yá Yī Èr Yè',
    type: 'white',
    typeNameRu: 'Белый чай: Листо-почечный',
    origin: 'Фудин / Сунси / Цзяньян, Фуцзянь',
    cultivar: 'Дабайча / Шуйсянь',
    oxidationLevel: '8–15% (Солнечное завяливание)',
    leafMorphology: 'twisted_strip',
    optimalTemp: 90,
    tempRange: [85, 94],
    defaultMass: 5.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Широкая фарфоровая гайвань',
    keySensoryNotes: ['Цветущая липа', 'Персик', 'Луговой разнотравный мёд', 'Нежная сладость'],
    scientificDescription: 'Создан в провинции Фуцзянь в 1920-х годах. Получил имя «Белый пион» за сходство пушистой почки и раскрывающихся молодых листьев с благородным весенним цветком.',
    recommendedSteeps: 8,
    categoryGroup: 'generic',
    generalExamplesRu: ['Листо-почечный сорт (Бай Мудань / Белый Пион)', 'Ван Мудань (Королевский Пион)', 'Смешанный весенний сбор']
  },
  {
    id: 'generic_white_shoumei',
    nameRu: 'Белый чай: Зрелый лист',
    transcriptionRu: 'Зрелый листовой белый чай / Крупный лист с черенками / Шоу Мэй',
    nameZh: '白茶 成熟叶',
    namePinyin: 'Bái Chá Chéngshú Yè',
    type: 'white',
    typeNameRu: 'Белый чай: Зрелый лист',
    origin: 'Фудин / Чжэнхэ, Фуцзянь',
    cultivar: 'Фудин Дабайча / Сяобайча',
    oxidationLevel: '12–20% (Глубокое естественное завяливание)',
    leafMorphology: 'twisted_strip',
    optimalTemp: 94,
    tempRange: [90, 98],
    defaultMass: 6.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Фарфоровая гайвань или чайник из глины Цзыни',
    keySensoryNotes: ['Сухие осенние травы', 'Печёное яблоко', 'Клеверный мёд', 'Сладкое древесное эхо'],
    scientificDescription: 'Традиционный крестьянский сбор поздней осени в горах Фудина. Назван «Бровями Долголетия» в честь даосского старца Шоу-сина за крупные изогнутые листья с серебристым пухом.',
    recommendedSteeps: 9,
    categoryGroup: 'generic',
    generalExamplesRu: ['Зрелый листовой сбор (Шоу Мэй / Брови Долголетия)', 'Гун Мэй (Подарочные Брови)', 'Осенний сбор крупного листа']
  },
  {
    id: 'generic_white_aged',
    nameRu: 'Белый чай: Выдержанный',
    transcriptionRu: 'Выдержанный белый чай / Лао Байча / Прессованный блин или рассыпной',
    nameZh: '老白茶 陈化',
    namePinyin: 'Lǎo Bái Chá Chénhuà',
    type: 'white',
    typeNameRu: 'Белый чай: Выдержанный',
    origin: 'Фудин / Чжэнхэ / Юньнань',
    cultivar: 'Дабайча / Дахаоча',
    oxidationLevel: '30–50% (Медленное естественное автоокисление)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 98,
    tempRange: [94, 100],
    defaultMass: 6.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Пористый чайник Цзыни, толстостенная гайвань или варка в стекле',
    keySensoryNotes: ['Китайский финик Унаби', 'Аптечные травы', 'Липовый мёд', 'Древесный бальзам'],
    scientificDescription: 'Культура выдержки белого чая родилась в фуцзяньских деревнях с пословицей: «1 год — чай, 3 года — лекарство, 7 лет — сокровище». Со временем настой обретает целебные финиковые ноты.',
    recommendedSteeps: 11,
    categoryGroup: 'generic',
    generalExamplesRu: ['Выдержанный прессованный блин (Лао Байча от 3 до 10+ лет)', 'Выдержанный рассыпной Шоу Мэй', 'Выдержанный Бай Мудань']
  },
  {
    id: 'generic_yellow_yinzhen',
    nameRu: 'Жёлтый чай: Почечный',
    transcriptionRu: 'Цзюньшань Иньчжэнь / Почечный желтый чай',
    nameZh: '君山银针 黄茶',
    namePinyin: 'Jūn Shān Yín Zhēn',
    type: 'yellow',
    typeNameRu: 'Жёлтый чай: Почечный',
    origin: 'Остров Цзюньшань, озеро Дунтин, Хунань',
    cultivar: 'Цзюньшань Цюньтичжун (ранневесенние почки)',
    oxidationLevel: '10–12% (томление Мэньхуан)',
    leafMorphology: 'needle',
    optimalTemp: 84,
    tempRange: [80, 88],
    defaultMass: 4.5,
    defaultVolume: 100,
    recommendedVesselRu: 'Фарфоровая гайвань или стеклянный высокий стакан',
    keySensoryNotes: ['Печеный каштан', 'Сливочная кукуруза', 'Нежные белые цветы', 'Тонкая сладость'],
    scientificDescription: 'Священный чай с острова Цзюньшань на озере Дунтин. По преданию, вырос из слез жен императора Шуня; с эпохи Тан входил в число главных податных сортов Китая.',
    recommendedSteeps: 6,
    categoryGroup: 'generic',
    generalExamplesRu: ['Серебряные Иглы с Острова Цзюньшань (Цзюньшань Иньчжэнь)', 'Почечный желтый чай с гор Хошань']
  },
  {
    id: 'generic_yellow_huangya',
    nameRu: 'Жёлтый чай: Почечно-листовой',
    transcriptionRu: 'Мэндин Хуанья / Почечно-листовой желтый чай',
    nameZh: '蒙顶黄芽',
    namePinyin: 'Méng Dǐng Huáng Yá',
    type: 'yellow',
    typeNameRu: 'Жёлтый чай: Почечно-листовой',
    origin: 'Гора Мэндин, Яань, Сычуань',
    cultivar: 'Мэндин Маофэн',
    oxidationLevel: '12–15% (томление Мэньхуан в пергаменте)',
    leafMorphology: 'needle',
    optimalTemp: 85,
    tempRange: [80, 88],
    defaultMass: 4.5,
    defaultVolume: 100,
    recommendedVesselRu: 'Фарфоровая гайвань',
    keySensoryNotes: ['Жареный фундук', 'Сухое зерно', 'Абрикосовый нектар', 'Бархатистый умами'],
    scientificDescription: 'Чай с горы Мэндин в Сычуани — колыбели мирового чаеводства, где монах У Личжэнь высадил первые кусты еще до н.э. Веками использовался в императорских жертвоприношениях.',
    recommendedSteeps: 7,
    categoryGroup: 'generic',
    generalExamplesRu: ['Жёлтые Почки с Горы Мэндин (Мэндин Хуанья)', 'Хуаншань Хуанья']
  },
  {
    id: 'generic_yellow_leaf',
    nameRu: 'Жёлтый чай: Зрелый листовой',
    transcriptionRu: 'Хошань Хуанья / Зрелый листовой желтый чай',
    nameZh: '霍山大叶黄茶',
    namePinyin: 'Huò Shān Huáng Chá',
    type: 'yellow',
    typeNameRu: 'Жёлтый чай: Зрелый листовой',
    origin: 'Хошань, Дабишань, Аньхой',
    cultivar: 'Хошань Даечжун',
    oxidationLevel: '15–18% (глубокое томление Мэньхуан)',
    leafMorphology: 'twisted_strip',
    optimalTemp: 86,
    tempRange: [82, 90],
    defaultMass: 5.0,
    defaultVolume: 100,
    recommendedVesselRu: 'Широкая фарфоровая гайвань',
    keySensoryNotes: ['Печеный ржаной хлеб', 'Каштан', 'Спелое яблоко', 'Глубокое сладкое послевкусие'],
    scientificDescription: 'Знаменитый сорт из гор Дабешань провинции Аньхой, известный со времен династии Мин. Листья подвергаются томлению Мэньхуан, обретая мягкий хлебно-ореховый характер.',
    recommendedSteeps: 7,
    categoryGroup: 'generic',
    generalExamplesRu: ['Хошаньские Жёлтые Ростки (Хошань Хуанья)', 'Гуандунский желтый крупнолистовой чай']
  },
  {
    id: 'generic_oolong_light',
    nameRu: 'Светлый улун',
    transcriptionRu: 'Цинсян Улун / Светлый Улун / Тегуаньинь / Алишань / Дун Дин',
    nameZh: '清香型球形乌龙',
    namePinyin: 'Qīng Xiāng Qiú Xíng Wū Lóng',
    type: 'oolong_ball',
    typeNameRu: 'Светлый улун',
    origin: 'Южная Фуцзянь / Тайвань',
    cultivar: 'Тегуаньинь, Цинсинь, Цзинь Сюань, Сы Цзи Чунь',
    oxidationLevel: '15–30% (Слабая ферментация)',
    leafMorphology: 'tight_ball',
    optimalTemp: 95,
    tempRange: [92, 98],
    defaultMass: 7.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Фарфоровая гайвань или чайник из глины Чжуни',
    keySensoryNotes: ['Орхидея', 'Сирень', 'Сливочный персик', 'Весенняя свежесть'],
    scientificDescription: 'Родился в уезде Аньси в XVIII веке благодаря искусству скручивания листа. В XX веке тайваньские мастера довели сферическую форму до совершенства на высокогорьях Алишань.',
    recommendedSteeps: 9,
    categoryGroup: 'generic',
    generalExamplesRu: ['Железная Богиня Милосердия (Тегуаньинь)', 'Высокогорный Улун с Горы Алишань', 'Улун с Морозного Пика (Дун Дин)', 'Габа Улун с Горы Алишань', 'Золотой Цветок (Цзинь Сюань)']
  },
  {
    id: 'generic_oolong_dark',
    nameRu: 'Тёмный скальный улун',
    transcriptionRu: 'Уи Янь Ча / Темный Улун / Да Хун Пао / Дахунпао / Жоу Гуй / Даньцун',
    nameZh: '武夷岩茶条索乌龙',
    namePinyin: 'Wǔ Yí Yán Chá',
    type: 'oolong_strip',
    typeNameRu: 'Тёмный улун',
    origin: 'Уишань / Гуандун (Чаочжоу)',
    cultivar: 'Шуйсянь, Жоу Гуй, Фэнхуан Даньцун',
    oxidationLevel: '40–70% + прогрев Хунпэй',
    leafMorphology: 'twisted_strip',
    optimalTemp: 98,
    tempRange: [95, 100],
    defaultMass: 8.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Исинский чайник из глины Цзыни / Чжуни или фарфоровая гайвань',
    keySensoryNotes: ['Минеральность', 'Пряности', 'Жареные орехи', 'Цветы и фрукты'],
    scientificDescription: 'Утесный чай со скал Уишань с тысячелетней монастырской историей. Мастера бережно хранят секрет медленного прогрева на углях, рождающего знаменитую «утесную мелодию» Янь Юнь.',
    recommendedSteeps: 9,
    categoryGroup: 'generic',
    generalExamplesRu: ['Большой Красный Халат с Утёсов Уи (Да Хун Пао)', 'Корица с Утёсов Уи (Жоу Гуй)', 'Одиночные Кусты с Гор Феникса (Фэн Хуан Дань Цун)', 'Водный Нарцисс с Утёсов Уи (Шуйсянь)']
  },
  {
    id: 'generic_red',
    nameRu: 'Красный чай',
    transcriptionRu: 'Хун Ча / Красный чай / Дянь Хун / Сяочжун / Лапсанг',
    nameZh: '红茶',
    namePinyin: 'Hóng Chá',
    type: 'red',
    typeNameRu: 'Красный чай',
    origin: 'Юньнань / Фуцзянь / Аньхой / Сычуань',
    cultivar: 'Даеча, Сяочжун, Цихун',
    oxidationLevel: '100% (Полная ферментация)',
    leafMorphology: 'twisted_strip',
    optimalTemp: 92,
    tempRange: [88, 96],
    defaultMass: 5.5,
    defaultVolume: 100,
    recommendedVesselRu: 'Фарфоровая гайвань или глиняный чайник',
    keySensoryNotes: ['Мёд', 'Печёные ягоды', 'Сухофрукты', 'Пряный шоколад'],
    scientificDescription: 'Китайский красный чай зародился в деревне Тунму гор Уишань в конце XVI века как сорт Сяочжун, покоривший Европу и давший начало мировой традиции черного чая.',
    recommendedSteeps: 8,
    categoryGroup: 'generic',
    generalExamplesRu: ['Малый Вид с Правильных Гор (Лапсанг Сушонг)', 'Юньнаньские Золотые Почки (Дянь Хун)', 'Золотые Брови с Гор Уи (Цзинь Цзюнь Мэй)', 'Ворсистые Пики из Цимэня (Красный Кимун)']
  },
  {
    id: 'generic_sheng_young',
    nameRu: 'Молодой Шэн Пуэр (1–3 года)',
    transcriptionRu: 'Синь Шэн Пу / Молодой Шэн Пуэр / Шен Пуэр / Сигуй / Булань',
    nameZh: '新生普',
    namePinyin: 'Xīn Shēng Pǔ',
    type: 'sheng_puerh',
    typeNameRu: 'Шэн Пуэр (молодой)',
    origin: 'Юньнань (Мэнхай, Линьцан, Иу, Буланьшань)',
    cultivar: 'Юньнань Даеча (молодой крупнолистовой лист)',
    oxidationLevel: '0–5% (свежий лист, начальное автоокисление)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 90,
    tempRange: [86, 94],
    defaultMass: 7.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Тонкостенная фарфоровая гайвань или чайник из глины Чжуни',
    keySensoryNotes: ['Луговые цветы', 'Свежая зелёная слива', 'Яркая сочная терпкость', 'Взрывной сладкий Хуэй Гань'],
    scientificDescription: 'Древнейший чай Древнего чайного конного пути (Чамагудао). Молодой шэн с вековых деревьев Юньнани хранит дикую силу горных туманов, сочность сливы и мощный Хуэй Гань.',
    recommendedSteeps: 10,
    categoryGroup: 'generic',
    generalExamplesRu: ['Молодой Шэн Пуэр Сигуй (Линьцан)', 'Весенний Шэн Пуэр с Древних Деревьев Иу', 'Молодой Шэн Пуэр с Горы Булань', 'Свежая весенняя маоча']
  },
  {
    id: 'generic_sheng_aged',
    nameRu: 'Выдержанный Шэн Пуэр (4–10 лет)',
    transcriptionRu: 'Чжунци Шэн Пу / Выдержанный Шэн Пуэр / Шен Пуэр / Да И 7542 / Бадашань',
    nameZh: '中期生普',
    namePinyin: 'Zhōng Qī Shēng Pǔ',
    type: 'sheng_puerh',
    typeNameRu: 'Шэн Пуэр (средний)',
    origin: 'Юньнань (Мэнхай, Пуэр, Линьцан)',
    cultivar: 'Юньнань Даеча (средневозрастное сухое хранение)',
    oxidationLevel: '20–50% (активная аэробная полимеризация)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 95,
    tempRange: [92, 97],
    defaultMass: 7.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Пористый исинский чайник из глины Цзыни или фарфоровая гайвань',
    keySensoryNotes: ['Курага', 'Гречишный мёд', 'Сушёное яблоко', 'Мягкая табачно-древесная нота', 'Глубокое послевкусие'],
    scientificDescription: 'Традиция выдержки шэнов родилась в караванных переходах в Тибет: за долгие месяцы пути чай под прессом преображался, обретая аромат кураги, осеннего леса и камфоры.',
    recommendedSteeps: 11,
    categoryGroup: 'generic',
    generalExamplesRu: ['Выдержанный Шэн Пуэр Да И 7542', 'Выдержанный Шэн Пуэр Бадашань', 'Прессованная Точа Сягуань Цзяцзи']
  },
  {
    id: 'generic_sheng_old',
    nameRu: 'Старый Шэн Пуэр (10+ лет)',
    transcriptionRu: 'Лао Шэн Пу / Старый Шэн Пуэр / Лао Шен / Лао Баньчжан / Чжунча',
    nameZh: '老生普',
    namePinyin: 'Lǎo Shēng Pǔ',
    type: 'sheng_puerh',
    typeNameRu: 'Шэн Пуэр (старый)',
    origin: 'Юньнань (выдержанное хранение Гуанчжоу / Куньмин / Тайвань)',
    cultivar: 'Юньнань Даеча (старые деревья Гушу)',
    oxidationLevel: '60–85%+ (глубокое медленное автоокисление и трансформация)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 99,
    tempRange: [95, 100],
    defaultMass: 8.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Толстостенный чайник из исинской глины (Цзыни, Дуаньни) или варка методом Лу Юя',
    keySensoryNotes: ['Камфора', 'Старая древесина', 'Ладан и благовония', 'Финиковый сироп', 'Мощная согревающая Ча Ци'],
    scientificDescription: 'Живая чайная реликвия. Старые коллекционные шэны ведут родословную от старинных рецептов фабрик Мэнхай и Сягуань 1970–80-х годов и ценятся на аукционах дороже золота.',
    recommendedSteeps: 14,
    categoryGroup: 'generic',
    generalExamplesRu: ['Коллекционный Шэн Пуэр Лао Баньчжан (15 лет)', 'Выдержанный Шэн Чжунча Иньюнь 2003', 'Куньминский Железный Блин 8653 (18 лет)']
  },
  {
    id: 'generic_shou_young',
    nameRu: 'Молодой Шу Пуэр (1–2 года)',
    transcriptionRu: 'Синь Шу Пу / Молодой Шу Пуэр / Шу Пуэр 7572 / Сяофа / Гунтин',
    nameZh: '新熟普',
    namePinyin: 'Xīn Shú Pǔ',
    type: 'shou_puerh',
    typeNameRu: 'Шу Пуэр (молодой)',
    origin: 'Юньнань (Мэнхай, Линьцан)',
    cultivar: 'Юньнань Даеча',
    oxidationLevel: '100% (свежая постферментация Водуй)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 96,
    tempRange: [93, 98],
    defaultMass: 7.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Широкая фарфоровая гайвань или пористый чайник Цзыни (для аэрации)',
    keySensoryNotes: ['Горький шоколад', 'Влажная древесина', 'Торфяные ноты', 'Ореховая скорлупа'],
    scientificDescription: 'Технология влажной ферментации «Во Дуй» была разработана в 1973 году на Куньминской фабрике, чтобы воссоздать профиль многолетнего шэна из свежего юньнаньского листа.',
    recommendedSteeps: 8,
    categoryGroup: 'generic',
    generalExamplesRu: ['Шу Пуэр Да И 7572 (Классический рецепт)', 'Французская Шу Точа Сягуань', 'Императорский Дворцовый Гунтин Цзинь Я']
  },
  {
    id: 'generic_shou_aged',
    nameRu: 'Выдержанный Шу Пуэр (3–7 лет)',
    transcriptionRu: 'Чэньнянь Шу Пу / Выдержанный Шу Пуэр / Да И 7262 / Хайвань 9978',
    nameZh: '陈年熟普',
    namePinyin: 'Chén Nián Shú Pǔ',
    type: 'shou_puerh',
    typeNameRu: 'Шу Пуэр (средний)',
    origin: 'Юньнань (Мэнхай, Куньмин)',
    cultivar: 'Юньнань Даеча',
    oxidationLevel: '100% (сбалансированная стабилизация)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 99,
    tempRange: [96, 100],
    defaultMass: 8.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Толстостенный исинский чайник Цзыни или Дуаньни',
    keySensoryNotes: ['Ореховая паста', 'Тёмный шоколад', 'Чернослив', 'Древесный бальзам', 'Сливочная плотность'],
    scientificDescription: 'Выдержанный шу пуэр — признанная классика чайных клубов Гуанчжоу и Гонконга. За годы хранения ноты скирдования уступают место чистому шоколаду, орехам и благородному дереву.',
    recommendedSteeps: 10,
    categoryGroup: 'generic',
    generalExamplesRu: ['Выдержанный Шу Пуэр Да И 7262 (5 лет)', 'Выдержанный Шу Старый Товарищ Хайвань 9978', 'Шу Пуэр со Старых Деревьев Чэньсян Гу Шу']
  },
  {
    id: 'generic_shou_old',
    nameRu: 'Старый Шу Пуэр (8+ лет)',
    transcriptionRu: 'Лао Шу Пу / Старый Шу Пуэр / Да И 0532 / Хайвань Чэньсян / Гунтин Лао Шу',
    nameZh: '老熟普',
    namePinyin: 'Lǎo Shú Pǔ',
    type: 'shou_puerh',
    typeNameRu: 'Шу Пуэр (старый)',
    origin: 'Юньнань (сухое многолетнее хранение)',
    cultivar: 'Юньнань Даеча',
    oxidationLevel: '100% (глубокий ферментативный гидролиз)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 100,
    tempRange: [97, 100],
    defaultMass: 8.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Толстостенный исинский чайник, чугун (Тэцубин) или варка на огне',
    keySensoryNotes: ['Камфора', 'Сухие храмовые благовония', 'Финики унаби', 'Кристальная ореховая сладость'],
    scientificDescription: 'Старый шу пуэр создавался как целебный настой для знати и тибетских монастырей. Десятилетия созревания превращают его в рубиново-коньячный бальзам с нотами фиников и ладана.',
    recommendedSteeps: 12,
    categoryGroup: 'generic',
    generalExamplesRu: ['Золотой Рецепт Мэнхай Да И 0532 (12 лет)', 'Выдержанный Шу Хайвань Чэньсян (14 лет)', 'Коллекционный Дворцовый Лао Шу (16 лет)']
  },
  {
    id: 'generic_heicha',
    nameRu: 'Хэй-ча',
    transcriptionRu: 'Хэй Ча / Хей Ча / Любао / Аньхуа Фучжуань / Цзан Ча',
    nameZh: '黑茶',
    namePinyin: 'Hēi Chá',
    type: 'heicha',
    typeNameRu: 'Хэй-ча',
    origin: 'Хунань (Аньхуа) / Гуанси (Любао) / Сычуань (Яань) / Юньнань',
    cultivar: 'Аньхуа Даеча, Любао Цюньти, Сычуань Даеча',
    oxidationLevel: 'Глубокая микробная постферментация (100%)',
    leafMorphology: 'compressed_cake',
    optimalTemp: 100,
    tempRange: [96, 100],
    defaultMass: 8.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Толстостенный исинский чайник Цзыни или варка на открытом огне',
    keySensoryNotes: ['Орех бетель', 'Древесный погреб', 'Сушёный финик', 'Грибная сладость «Золотых цветов»', 'Мягкий травяной бальзам'],
    scientificDescription: 'Исторический чай конных караванов в Тибет, Монголию и Россию. Прославился драгоценной золотой культурой «Цзинь Хуа» (Золотые Цветы), почитаемой в народе как эликсир здоровья.',
    recommendedSteeps: 12,
    categoryGroup: 'generic',
    generalExamplesRu: ['Чай Любао из Гуанси', 'Хунаньский Кирпичный Чай с Золотыми Цветами', 'Тибетский Плиточный Чай Цзан Ча']
  },
  {
    id: 'generic_gaba_oolong',
    nameRu: 'Габа Улун',
    transcriptionRu: 'Цзяелун Улун / Габа Улун / GABA Oolong / Алишань Габа',
    nameZh: '佳叶龙乌龙茶',
    namePinyin: 'Jiā Yè Lóng Wū Lóng',
    type: 'gaba_oolong',
    typeNameRu: 'Габа Улун',
    origin: 'Тайвань (Алишань, Мэйшань, Наньтоу) / Фуцзянь',
    cultivar: 'Цинсинь, Цзинь Сюань, Сы Цзи Чунь',
    oxidationLevel: '30–50% окисления + азотная N₂ камера (ГАМК > 150–250 мг/100г)',
    leafMorphology: 'tight_ball',
    optimalTemp: 92,
    tempRange: [88, 95],
    defaultMass: 7.0,
    defaultVolume: 110,
    recommendedVesselRu: 'Фарфоровая гайвань или чайник из глины Чжуни / Цзыни',
    keySensoryNotes: ['Печёное яблоко', 'Карамель', 'Мускат', 'Сливочно-цветочная кислинка'],
    scientificDescription: 'Технология бескислородной ферментации в атмосфере азота разработана в 1987 году в Японии и доведена до совершенства мастерами высокогорного тайваньского улуна на горе Алишань.',
    recommendedSteeps: 9,
    categoryGroup: 'generic',
    generalExamplesRu: ['Габа Улун с Горы Алишань', 'Медово-яблочный Габа Улун Мэйшань', 'Молочно-карамельный Габа Улун Цзинь Сюань']
  },
  {
    id: 'generic_gaba_red',
    nameRu: 'Красный Габа Чай',
    transcriptionRu: 'Цзяелун Хунча / Габа Хунча / GABA Black Tea / Руби 18 Габа',
    nameZh: '佳叶龙红茶',
    namePinyin: 'Jiā Yè Lóng Hóng Chá',
    type: 'gaba_red',
    typeNameRu: 'Красный Габа Чай',
    origin: 'Тайвань (Жиюэтань) / Юньнань / Таиланд',
    cultivar: 'Руби #18, Даеча, Ассамика',
    oxidationLevel: '100% ферментация + анаэробная фаза (ГАМК > 200 мг/100г)',
    leafMorphology: 'twisted_strip',
    optimalTemp: 93,
    tempRange: [90, 96],
    defaultMass: 5.5,
    defaultVolume: 110,
    recommendedVesselRu: 'Фарфоровая гайвань или исинская глина Цзыни / Чжуни',
    keySensoryNotes: ['Чернослив', 'Ржаной солод', 'Вяленая вишня', 'Медово-яблочная кислинка'],
    scientificDescription: 'Новаторский союз знаменитого тайваньского красного культивара Руби №18 с озера Жиюэтань и бескислородной ферментации, дарящий яркий ягодный вкус и глубокое умиротворение.',
    recommendedSteeps: 8,
    categoryGroup: 'generic',
    generalExamplesRu: ['Красный Рубиновый Габа Чай #18', 'Ягодный Габа Чай с Озера Солнца и Луны', 'Красный Юньнаньский Габа Чай']
  }
];

export const TEA_VARIETIES: TeaVariety[] = Array.from(
  RAW_TEA_VARIETIES.reduce((map, item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
    return map;
  }, new Map<string, TeaVariety>()).values()
);

export const ALL_TEA_OPTIONS: TeaVariety[] = Array.from(
  [
    ...TEA_VARIETIES.map(t => ({ ...t, categoryGroup: 'specific' as const })),
    ...GENERIC_TEA_ARCHETYPES
  ].reduce((map, item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
    return map;
  }, new Map<string, TeaVariety>()).values()
);

export const ALL_TEA_MAP: Map<string, TeaVariety> = new Map(
  ALL_TEA_OPTIONS.map((t) => [t.id, t])
);

export function isTeaArchetype(tea?: TeaVariety | null): boolean {
  if (!tea) return false;
  return tea.categoryGroup === 'generic' || tea.id.startsWith('generic_') || Boolean(tea.isArchetype);
}

export interface UniversalBrewingRule {
  stepNumber: number;
  titleRu: string;
  scientificPrincipleRu: string;
  actionRu: string;
}

export const UNIVERSAL_BREWING_RULES: UniversalBrewingRule[] = [
  {
    stepNumber: 1,
    titleRu: 'Определение цвета листа и степени ферментации',
    scientificPrincipleRu: 'Ферментация переводит терпкие мономерные катехины в полимерные теафлавины, теарубигины и теаброунины. Чем темнее лист, тем термостабильнее полифенолы.',
    actionRu: 'Зелёный/светлый лист: держите температуру 78–84°C. Тёмный/бурый/чёрный лист: смело используйте 92–98°C.'
  },
  {
    stepNumber: 2,
    titleRu: 'Оценка плотности и морфологии листа',
    scientificPrincipleRu: 'Плотность упаковки определяет гидравлическое сопротивление и площадь смачивания (A) в уравнении Нойеса-Уитни.',
    actionRu: 'Шарообразная скрутка (Тегуаньинь, Дун Дин) и прессованный блин требуют быстрого промыва (3–5 сек) и 95°C+ для раскрытия пор. Продольный или плоский лист отдаёт вкус сразу без долгого промыва.'
  },
  {
    stepNumber: 3,
    titleRu: 'Золотое соотношение массы и объема (1:15)',
    scientificPrincipleRu: 'Гунфу Ча основан на неравновесном диффузионном градиенте (высокое соотношение сухого остатка к воде, сброс раствора каждые 10–20 сек).',
    actionRu: 'Взвесьте 5–7 г сухого листа на стандартную гайвань 100–110 мл. Если нет весов: плоский/шарообразный чай — 1/4 объёма гайвани; объёмный скрученный лист — 1/2 объёма.'
  },
  {
    stepNumber: 4,
    titleRu: 'Тайминг: быстрый слив против переэкстракции',
    scientificPrincipleRu: 'В первые 10 секунд скорость диффузии L-теанина в 2.5–3 раза выше тяжелых катехинов EGCG.',
    actionRu: 'Начинайте с 5–10 секунд для 1-го пролива. Добавляйте по 2–5 секунд на каждый последующий пролив. Если чай горчит — сократите время следующего пролива на 3 секунды.'
  }
];

export const CHEMICAL_COMPOUNDS: ChemicalCompoundInfo[] = [
  {
    id: 'l_theanine',
    nameRu: 'L-Теанин (γ-глутамилэтиламид)',
    nameEn: 'L-Theanine',
    chemicalFormula: 'C7H14N2O3',
    molecularWeight: '174.20 г/моль',
    solubilityTempThreshold: 'Легко растворим при 50–70°C',
    sensoryRoleRu: 'Отвечает за вкус умами (бульонный, сладковатый), шелковистость и психологическое расслабление без седации за счет стимуляции альфа-волн в ЦНС.',
    extractionBehaviorRu: 'Высокая начальная скорость экстракции. В методе проливов 50-65% всего запаса теанина переходит в настой за первые 1–3 пролива. В последующих проливах его концентрация падает.',
    primaryTeas: ['Зеленый (Лунцзин)', 'Белый (Байхао Иньчжэнь)', 'Желтый чай']
  },
  {
    id: 'catechins_egcg',
    nameRu: 'Катехины (EGCG, ECG, EGC, EC)',
    nameEn: 'Catechins / Polyphenols',
    chemicalFormula: 'EGCG: C22H18O11',
    molecularWeight: '458.37 г/моль (EGCG)',
    solubilityTempThreshold: 'Активация при 80–85°C+, взрывной рост при >90°C',
    sensoryRoleRu: 'Определяют терпкость (вяжущий эффект за счёт преципитации белков слюны пролина) и горькие ноты структуры напитка.',
    extractionBehaviorRu: 'Крупные молекулы со сложной кинетикой диффузии из мезофилла листа. При низких температурах (<75°C) удерживаются в листе. В проливах достигают максимальной концентрации на 2-4 проливе, создавая каркас вкуса.',
    primaryTeas: ['Зеленый', 'Шэн Пуэр', 'Светлые улуны']
  },
  {
    id: 'caffeine',
    nameRu: 'Кофеин (1,3,7-триметилксантин)',
    nameEn: 'Caffeine',
    chemicalFormula: 'C8H10N4O2',
    molecularWeight: '194.19 г/моль',
    solubilityTempThreshold: '2.1 г/100мл при 20°C → 18 г/100мл при 80°C → 66 г/100мл при 100°C',
    sensoryRoleRu: 'Чистая бодрящая горечь на спинке языка, синергирует с теанином, образуя с ним временные ассоциативные комплексы («мягкая стимуляция»).',
    extractionBehaviorRu: 'Прямо пропорционален температуре воды. Вымывается постепенно за счет плотности клеточной матрицы цельного листа. Быстрый промыв (5 сек) удаляет лишь 8-12% кофеина (миф о полном удалении кофеина за 30 секунд опровергнут спектрофотометрией).',
    primaryTeas: ['Все сорта Camellia sinensis (особенно почечные и весенние)']
  },
  {
    id: 'volatiles',
    nameRu: 'Летучие терпеноиды и альдегиды (Линалоол, Гераниол, Неролидол)',
    nameEn: 'Volatile Organic Compounds (VOCs)',
    chemicalFormula: 'C10H18O (Линалоол), C15H26O (Неролидол)',
    molecularWeight: '154–222 г/моль',
    solubilityTempThreshold: 'Интенсивная паровая отгонка при 85–100°C',
    sensoryRoleRu: 'Создают весь богатый спектр аромата: цветочные (жасмин, ландыш, орхидея), цитрусовые, фруктовые и мускатные оттенки.',
    extractionBehaviorRu: 'Низкокипящие монотерпены (линалоол, гераниол) выходят яркой вспышкой в первых 1-3 проливах. Высококипящие сесквитерпены (неролидол, кариофиллен) и лактоны проявляются на 4-7 проливах, меняя букет от весенне-цветочного к зрелому фруктово-древесному.',
    primaryTeas: ['Улуны (Даньцуны, Уи Яньча, Тегуаньинь)', 'Белый чай', 'Красный чай']
  },
  {
    id: 'polysaccharides',
    nameRu: 'Растворимые полисахариды чая (TPS)',
    nameEn: 'Tea Polysaccharides (TPS)',
    chemicalFormula: '(C6H10O5)n',
    molecularWeight: '>10 000–100 000 г/моль',
    solubilityTempThreshold: 'Требуют прогрева 90–100°C для гидродинамической диффузии',
    sensoryRoleRu: 'Обеспечивают тактильную плотность, маслянистость настоя (mouthfeel), бархатистость и эффект долгой возвращающейся сладости («Хуэй Гань»).',
    extractionBehaviorRu: 'Обладают наименьшей скоростью диффузии из-за огромного молекулярного веса. Накапливаются в настое с 3 по 8 пролив, сохраняя питьевые качества чая даже тогда, когда катехины и теанин уже истощились.',
    primaryTeas: ['Шу Пуэр', 'Выдержанный Шэн Пуэр', 'Лао Байча (старый белый чай)', 'Улуны']
  },
  {
    id: 'theaflavins_thearubigins',
    nameRu: 'Теафлавины и Теарубигины',
    nameEn: 'Theaflavins (TF) & Thearubigins (TR)',
    chemicalFormula: 'TF: C29H24O12',
    molecularWeight: '564.5 г/моль',
    solubilityTempThreshold: 'Оптимум растворения 88–95°C',
    sensoryRoleRu: 'Теафлавины дают золотисто-оранжевый ореол («золотое кольцо» в пиале) и свежую искристость. Теарубигины дают насыщенный коньячный цвет, округлость и фруктово-карамельную сладость.',
    extractionBehaviorRu: 'Характерны для сильноферментированных красных чаев. Равномерно отдаются на протяжении 6-8 проливов, создавая стабильный профиль без резких перепадов.',
    primaryTeas: ['Красные чаи (Дяньхун, Чжэншань Сяочжун, Кимун)']
  }
];

export const WATER_HARDNESS_PRESETS: WaterHardnessInfo[] = [
  {
    level: 'soft',
    nameRu: 'Мягкая вода (Осмос / Горный родник)',
    tdsPpmRange: '20–60 ppm',
    extractionMultiplier: 1.15,
    scientificImpactRu: 'Минимальное содержание Ca²⁺/Mg²⁺. Высокий диффузионный градиент, максимальный выход L-теанина и тонких терпеновых эфиров аромата. Вкус чистый, звонкий.'
  },
  {
    level: 'optimal',
    nameRu: 'Оптимальная бутилированная (Артезианская)',
    tdsPpmRange: '70–130 ppm',
    extractionMultiplier: 1.0,
    scientificImpactRu: 'Идеальный гидрокарбонатный буфер. Балансирует кислотность полифенолов и не подавляет летучие альдегиды. Эталон для дегустаций по GB/T 23776.'
  },
  {
    level: 'hard',
    nameRu: 'Жёсткая минеральная (Водопровод / Высокий TDS)',
    tdsPpmRange: '180–300+ ppm',
    extractionMultiplier: 0.78,
    scientificImpactRu: 'Ионы Ca²⁺ связываются с катехинами EGCG и пектинами в нерастворимый осадок (чайная плёнка). Экстракция аромата снижается на 20-30%, напиток мутнеет, глушится сладость.'
  }
];

export const VESSEL_MATERIALS: VesselMaterialInfo[] = [
  {
    id: 'ceramic_regular',
    nameRu: 'Обычная керамика (Кружка / Заварочный чайник)',
    heatLossPerSteepC: 3.8,
    tanninAdsorptionFactor: 0.02,
    bestForRu: 'Повседневное заваривание: любые сорта чая на каждый день',
    scientificImpactRu: 'Стандартная бытовая керамическая посуда и кружки. Умеренная теплоёмкость, мягкий равномерный прогрев листа без сложностей в уходе.'
  },
  {
    id: 'glass_regular',
    nameRu: 'Обычное стекло (Кружка / Чайник с ситом / Френч-пресс)',
    heatLossPerSteepC: 6.2,
    tanninAdsorptionFactor: 0.0,
    bestForRu: 'Повседневная чашка, зелёный чай, каркаде, травяные сборы',
    scientificImpactRu: 'Стандартное бытовое стекло. Быстро отводит избыточное тепло наружу и позволяет наглядно контролировать цвет и раскрытие листа.'
  },
  {
    id: 'porcelain',
    nameRu: 'Фарфор / Глазурованная гайвань',
    heatLossPerSteepC: 4.5,
    tanninAdsorptionFactor: 0.0,
    bestForRu: 'Светлые улуны, зелёные, белые и жёлтые чаи',
    scientificImpactRu: 'Абсолютно гладкая непористая поверхность. Нулевая адсорбция эфирных масел. Отражает 100% аутентичный букет листа без искажений.'
  },
  {
    id: 'ceramic_thick',
    nameRu: 'Толстая керамика / Цзяньшуй / Нисин',
    heatLossPerSteepC: 3.0,
    tanninAdsorptionFactor: 0.06,
    bestForRu: 'Красные чаи, улуны со средним прогревом, выдержанный белый чай',
    scientificImpactRu: 'Плотный черепок с высокой теплоёмкостью. Обеспечивает мягкий глубокий прогрев листа без резких температурных скачков и сглаживает кислотность.'
  },
  {
    id: 'yixing_clay',
    nameRu: 'Пористая Исинская глина (Цзыни / Чжуни)',
    heatLossPerSteepC: 2.0,
    tanninAdsorptionFactor: 0.14,
    bestForRu: 'Шу Пуэр, выдержанные Шэны, тёмные скальные улуны',
    scientificImpactRu: 'Высокая микропористость (структура двойных пор) и термостабильность. Сглаживает резкие мономерные танины, адсорбируя избыточную терпкость, и сохраняет пар внутри камеры.'
  },
  {
    id: 'glass',
    nameRu: 'Боросиликатное термостекло (Гайвань / Колба / Типод)',
    heatLossPerSteepC: 6.5,
    tanninAdsorptionFactor: 0.0,
    bestForRu: 'Нежные типсовые зелёные чаи (Лунцзин, Билочунь), жёлтые почки',
    scientificImpactRu: 'Высокая теплоотдача. Вода быстро охлаждается до 75–80°C, предотвращая температурную деструкцию нежных почек и термический ожог L-теанина.'
  },
  {
    id: 'metal_silver',
    nameRu: 'Металл / Серебро / Титан (Серебряный чайник)',
    heatLossPerSteepC: 5.0,
    tanninAdsorptionFactor: 0.0,
    bestForRu: 'Шэн Пуэры, горные улуны, белый чай, чистая дегустация',
    scientificImpactRu: 'Исключительная теплопроводность и олигодинамический эффект серебра (Ag⁺). Смягчает текстуру воды, усиливает звонкость аромата и сладкое послевкусие.'
  },
  {
    id: 'cast_iron',
    nameRu: 'Чугун (Тэцубин / Эмалированный чугун)',
    heatLossPerSteepC: 1.2,
    tanninAdsorptionFactor: 0.02,
    bestForRu: 'Варка и долгое томление Шу Пуэров, Хэй Ча, прессованного чая',
    scientificImpactRu: 'Максимальная тепловая инерция. Удерживает рабочую температуру 97–99°C для глубокой гидродинамической экстракции труднорастворимых полисахаридов (TPS).'
  },
  {
    id: 'thermos',
    nameRu: 'Термос / Изотермический чайник',
    heatLossPerSteepC: 0.5,
    tanninAdsorptionFactor: 0.0,
    bestForRu: 'Варка Шу Пуэров, старых белых чаев (Лао Байча), Хэй Ча',
    scientificImpactRu: 'Почти изотермические условия (ΔT < 1°C). Длительное воздействие стимулирует глубокий гидролиз труднорастворимых полисахаридов TPS.'
  }
];

export const OPTIMIZATION_PRESETS: OptimizationPreset[] = [
  {
    id: 'balanced',
    nameRu: 'Классический баланс Гунфу Ча',
    targetRatio: 15, // 1:15
    tempOffsetC: 0,
    timeFactor: 1.0,
    descriptionRu: 'Гармоничный баланс свежести, мягкости и глубины вкуса.'
  },
  {
    id: 'max_longevity',
    nameRu: 'Марафон проливов (растягивание вкуса)',
    targetRatio: 12, // 1:12
    tempOffsetC: -1,
    timeFactor: 0.65,
    descriptionRu: 'Быстрые проливы на старте для максимального числа заварок.'
  },
  {
    id: 'umami_sweetness',
    nameRu: 'Максимум умами и сладости',
    targetRatio: 18, // 1:18
    tempOffsetC: -4,
    timeFactor: 1.25,
    descriptionRu: 'Мягкое заваривание для нежной сладости и бархатистого вкуса без горечи.'
  },
  {
    id: 'body_density',
    nameRu: 'Плотное тело и послевкусие («Хуэй Гань»)',
    targetRatio: 12, // 1:12
    tempOffsetC: +2,
    timeFactor: 0.85,
    descriptionRu: 'Интенсивное заваривание для густого маслянистого настоя и долгого послевкусия.'
  },
  {
    id: 'aroma_peak',
    nameRu: 'Яркий пик аромата',
    targetRatio: 14, // 1:14
    tempOffsetC: +1,
    timeFactor: 0.9,
    descriptionRu: 'Короткие проливы для ярких цветочных и медовых оттенков аромата.'
  },
  {
    id: 'oil_tar',
    nameRu: 'Режим «Нефть»',
    targetRatio: 9, // 1:9 (11г на 100мл)
    tempOffsetC: +3, // 100°C кипяток
    timeFactor: 2.2, // Пролонгированные экспозиции
    descriptionRu: 'Густой настой для шу пуэров и тёмных чаёв с максимальной плотностью вкуса.',
    allowedTeaTypes: ['shou_puerh', 'heicha']
  },
  {
    id: 'white_debitter',
    nameRu: 'Метод без горечи (нулевой пролив)',
    targetRatio: 16, // 1:16
    tempOffsetC: 0,
    timeFactor: 1.15,
    descriptionRu: 'Короткий прогрев перед чаепитием: убирает резкость и оставляет чистую сладость.',
    allowedTeaTypes: ['white', 'sheng_puerh']
  }
];

export interface TeaEffectDefinition {
  id: import('../types').TeaEffectCategory;
  nameRu: string;
  badgeRu: string;
  shortDescRu: string;
  bioMechanismRu: string;
  recommendedTypes: import('../types').TeaType[];
  icon?: string;
}

export const TEA_EFFECT_DEFINITIONS: TeaEffectDefinition[] = [
  {
    id: 'focus_zen',
    nameRu: 'Концентрация',
    badgeRu: 'L-Теанин',
    shortDescRu: 'Глубокая концентрация, ясность ума и собранность без тремора',
    bioMechanismRu: 'Высокое отношение L-теанина к кофеину стимулирует альфа-волны головного мозга (8–12 Гц), вызывая состояние спокойной собранности (Alert Relaxation).',
    recommendedTypes: ['green', 'white', 'yellow'],
    icon: ''
  },
  {
    id: 'energy_power',
    nameRu: 'Бодрость',
    badgeRu: 'Кофеин',
    shortDescRu: 'Энергетический подъем, тонус и физический драйв для активной работы',
    bioMechanismRu: 'Быстрорастворимый кофеин в синергии с теафлавинами активирует ЦНС, стимулируя выработку дофамина и повышая тонус.',
    recommendedTypes: ['shou_puerh', 'red', 'sheng_puerh'],
    icon: ''
  },
  {
    id: 'calm_gaba',
    nameRu: 'Спокойствие',
    badgeRu: 'GABA',
    shortDescRu: 'Снятие тревожности, глубокое мышечное расслабление и внутренний покой',
    bioMechanismRu: 'Эндогенная γ-аминомасляная кислота (GABA ≥ 150 мг/100г) тормозит гипервозбуждение синапсов и выравнивает психоэмоциональный фон.',
    recommendedTypes: ['gaba_oolong', 'gaba_red', 'white'],
    icon: ''
  },
  {
    id: 'warmth_comfort',
    nameRu: 'Уют',
    badgeRu: 'Пиразины',
    shortDescRu: 'Глубокий согрев тела, ощущение комфорта и умиротворения',
    bioMechanismRu: 'Продукты карамелизации Майяра, пиразины и сесквитерпены утёсного прогрева расширяют капилляры, вызывая волну комфортного тепла.',
    recommendedTypes: ['oolong_strip', 'oolong_ball', 'red'],
    icon: ''
  },
  {
    id: 'digest_detox',
    nameRu: 'Легкость',
    badgeRu: 'Теабровины',
    shortDescRu: 'Легкость после еды, очищение организма и гармоничный баланс',
    bioMechanismRu: 'Макромолекулярные теабровины (TB) и полисахариды стимулируют секрецию защитного муцина желудка и ускоряют обмен веществ.',
    recommendedTypes: ['shou_puerh', 'heicha', 'sheng_puerh'],
    icon: ''
  }
];

export interface TeaRinseInfo {
  required: boolean;
  seconds: number;
  tempC: number;
  badgeRu: string;
  actionRu: string;
  scientificReasonRu: string;
}

export function getTeaRinseInfo(tea: TeaVariety, customTempC?: number, optimizationGoal?: import('../types').OptimizationGoal): TeaRinseInfo {
  // If specialized debittering method for tea is active (Нулевой пролив ~1 мин, 100°C)
  if (optimizationGoal === 'white_debitter') {
    return {
      required: true,
      seconds: 60,
      tempC: customTempC ? customTempC : 100,
      badgeRu: 'Нулевой пролив (60 с, кипяток 100°C)',
      actionRu: 'Залить крутым кипятком 100°C ровно на 60 сек и слить в чабань: глубокая элюция поверхностного горького EGCG и кофеина',
      scientificReasonRu: 'Длительный нулевой пролив может извлечь часть водорастворимых веществ и изменить профиль следующего настоя, но величина эффекта зависит от сорта, листа, температуры и времени. Параметры здесь являются чайным пресетом, а не универсально подтверждённой долей извлечения.'
    };
  }

  // If explicitly configured on variety
  if (tea.rinseRecommended !== undefined) {
    const isReq = tea.rinseRecommended;
    return {
      required: isReq,
      seconds: tea.rinseSeconds ?? (isReq ? 5 : 0),
      tempC: customTempC ?? (tea.type === 'shou_puerh' || tea.type === 'heicha' ? 100 : tea.optimalTemp),
      badgeRu: isReq ? 'Слив (не пить)' : 'Не требуется',
      actionRu: isReq ? 'Быстрый омыв и слив в чабань' : 'Пейте сразу с Пролива #1',
      scientificReasonRu: tea.rinseNoteRu || (isReq ? 'Гидротермический прогрев листа' : 'Сохранение свободного L-теанина')
    };
  }

  // Smart heuristic based on morphology & tea classification
  if (tea.type === 'shou_puerh' || tea.type === 'heicha') {
    return {
      required: true,
      seconds: tea.leafMorphology === 'compressed_cake' ? 6 : 5,
      tempC: 100,
      badgeRu: 'Обязательный промыв',
      actionRu: 'Залить крутым кипятком 100°C, выдержать 5–6 сек и слить в чабань (не пить)',
      scientificReasonRu: 'Смыв микропыли постферментации («Дуй Вэй»), открытие пор спрессованного листа и термодинамическая активация гидролиза полисахаридов (TPS).'
    };
  }

  if (tea.type === 'sheng_puerh') {
    return {
      required: true,
      seconds: 5,
      tempC: 95,
      badgeRu: 'Обязательный промыв',
      actionRu: 'Залить водой 95–98°C на 5 сек и сразу слить в чабань',
      scientificReasonRu: 'Гидротермическое размягчение плотного прессованного блина, снятие поверхностной грубой танинности молодого шэна.'
    };
  }

  if (tea.leafMorphology === 'tight_ball') {
    return {
      required: true,
      seconds: 4,
      tempC: 95,
      badgeRu: 'Пробуждение листа',
      actionRu: 'Быстрый омыв 3–4 сек для снятия поверхностного натяжения скрутки',
      scientificReasonRu: 'Снятие гидрофобного барьера с восковой кутикулы сферической скрутки. 1-й питьевой пролив сразу отдаст богатый сбалансированный настой.'
    };
  }

  if (tea.type === 'oolong_strip') {
    return {
      required: true,
      seconds: 3,
      tempC: 95,
      badgeRu: 'Ароматический омыв',
      actionRu: 'Омыть лист кипятком 3 сек и слить, вдыхая аромат с крышечки',
      scientificReasonRu: 'Мгновенное раскрытие летучих монотерпенов и пиразинов прожарки на огне. Прогревает посуду.'
    };
  }

  if (tea.type === 'white' && tea.leafMorphology === 'compressed_cake') {
    return {
      required: true,
      seconds: 5,
      tempC: 90,
      badgeRu: 'Промыв прессовки',
      actionRu: 'Быстрый прогрев прессованного блина 5 сек',
      scientificReasonRu: 'Разделение спрессованных слоев выдержанного белого чая для равномерной последующей диффузии.'
    };
  }

  // Green teas, yellow teas, uncompressed delicate white and black teas
  return {
    required: false,
    seconds: 0,
    tempC: tea.optimalTemp,
    badgeRu: 'Промыв не нужен',
    actionRu: 'Начинайте сразу с Пролива #1',
    scientificReasonRu: 'Для нежного цельного листа нулевой пролив часто не используют, поскольку часть растворимых веществ уйдёт вместе со сливом. Размер эффекта зависит от чая и условий и не задан здесь точным процентом.'
  };
}

export function getTeaEffect(tea: TeaVariety): TeaEffectDefinition {
  if (tea.effectCategory) {
    const found = TEA_EFFECT_DEFINITIONS.find(e => e.id === tea.effectCategory);
    if (found) return found;
  }

  if (tea.type === 'gaba_oolong' || tea.type === 'gaba_red') {
    return TEA_EFFECT_DEFINITIONS.find(e => e.id === 'calm_gaba')!;
  }
  if (tea.type === 'shou_puerh' || tea.type === 'heicha') {
    return TEA_EFFECT_DEFINITIONS.find(e => e.id === 'digest_detox')!;
  }
  if (tea.type === 'green' || (tea.type === 'white' && tea.leafMorphology === 'needle') || tea.type === 'yellow') {
    return TEA_EFFECT_DEFINITIONS.find(e => e.id === 'focus_zen')!;
  }
  if (tea.type === 'red' || tea.type === 'sheng_puerh') {
    return TEA_EFFECT_DEFINITIONS.find(e => e.id === 'energy_power')!;
  }
  if (tea.type === 'oolong_strip' || tea.type === 'oolong_ball') {
    return TEA_EFFECT_DEFINITIONS.find(e => e.id === 'warmth_comfort')!;
  }

  return TEA_EFFECT_DEFINITIONS[0];
}

export const BREWING_METHODS_DATA: BrewingMethodInfo[] = [
  {
    id: 'gongfu',
    nameRu: 'Гунфу Ча (Полный слив)',
    nameZh: '功夫茶 / 沥干泡法',
    namePinyin: 'Gōng Fū Chá',
    shortDescRu: '100% слив настоя после каждого пролива',
    fullDescRu: 'Классический метод: настой полностью сливается после каждого контакта с водой, раскрывая оттенки аромата и вкуса от чашки к чашке.',
    drainModeRu: 'Полный слив (100% в чахай)',
    idealForRu: 'Улуны (скальные и тайваньские), Пуэры (шэн и шу), Хэй ча, Красный чай'
  },
  {
    id: 'liu_gen',
    nameRu: 'Оставление корня (Лю Гэнь Пао)',
    nameZh: '留根泡法 / 留根法',
    namePinyin: 'Liú Gēn Pào Fǎ',
    shortDescRu: 'Сохранение части настоя в чайнике перед доливом воды',
    fullDescRu: 'После каждого пролива выпивается часть чая, а в посуде оставляется немного настоя как основа. Свежая вода доливается к остатку, делая вкус мягким, ровным и без резкой терпкости.',
    drainModeRu: 'Частичный слив (остаток сохраняется в чайнике)',
    idealForRu: 'Зелёные чаи (Лунцзин, Билочунь), Белые чаи (Бай Хао Инь Чжэнь), Жёлтые чаи, заваривание в бокале/колбе, варка старого белого чая'
  },
  {
    id: 'grandpa_cup',
    nameRu: '«Ленивый» метод (Бэй Пао Фа / 杯泡法)',
    nameZh: '杯泡法',
    namePinyin: 'Bēi Pào Fǎ',
    shortDescRu: 'Заваривание прямо в кружке или стакане с постепенным доливом воды',
    fullDescRu: 'Чай насыпают прямо в кружку или стакан и доливают воду по мере питья. Если оставлять немного чая на дне перед новым доливом, настой дольше сохраняет насыщенность и мягкость.',
    drainModeRu: 'Заваривание в кружке с постепенным доливом воды',
    idealForRu: 'Зелёные чаи (Лунцзин, Билочунь, Аньцзи Байча), Белые чаи (Шоу Мэй, Бай Мудань), нежные Красные чаи и рассыпные Улуны, повседневное чаепитие'
  }
];

