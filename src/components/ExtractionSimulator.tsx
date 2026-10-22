import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from 'react';
import { 
  Flame, 
  Droplet, 
  RotateCcw, 
  Sliders, 
  Sparkles, 
  ShieldAlert, 
  Info, 
  Award,
  Hash,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Clock,
  Waves,
  Coffee,
  Feather,
  ChevronDown,
  Check,
  Search,
  X,
  Lightbulb,
  CheckCircle,
  ArrowRight,
  ArrowDown,
  Star,
  FlaskConical,
  FileText,
  Bookmark,
  BookOpen,
  Scale as ScaleIcon,
  Thermometer,
  Plus,
  Edit3,
  Trash2,
  Leaf,
  Upload,
  Download
} from 'lucide-react';
import { 
  TEA_VARIETIES, 
  GENERIC_TEA_ARCHETYPES, 
  ALL_TEA_OPTIONS, 
  ALL_TEA_MAP, 
  WATER_HARDNESS_PRESETS,
  VESSEL_MATERIALS,
  OPTIMIZATION_PRESETS,
  getTeaEffect,
  getTeaRinseInfo,
  isTeaArchetype
} from '../data/teaData';
import { 
  optimizeBrewingParametersMulti,
  calculateAdaptiveCustomBrewing,
  calculateDynamicSteepTemperatures
} from '../utils/extractionKinetics';
import { simulatePhysicalBrewing, resolveZeroInfusionOptions, optimizePhysicalSchedule } from '../domain/physicalBrewingModel';
import { loadAppSettings } from '../utils/appSettings';
import { 
  matchTeaSearch, 
  matchTeaBySensory, 
  POPULAR_SENSORY_GROUPS,
  cleanTeaChars 
} from '../utils/teaSearch';
import { useLongPress } from '../utils/useLongPress';
import { getLiquorColor } from '../domain/liquorColor';
import { getSteepTasteSensations } from '../domain/tasteSensations';
import { getLeafMorphologyInfo } from '../domain/leafMorphology';
import { calculateContinuousInfusionTimeline } from '../domain/extractionChartCalculations';
import { BREWING_DEFAULTS, BREWING_LIMITS } from '../config/brewingDefaults';
import { 
  TeaType,
  TeaVariety, 
  TeaCategoryGroup, 
  WaterHardnessLevel, 
  VesselMaterialType, 
  OptimizationGoal,
  TeaEffectCategory,
  BrewingMethod,
  InitialTastingSessionData,
  InitialBrewParams,
  AppSettings,
  canTeaAge,
  cleanTeaTitleForDisplay
} from '../types';
import { SteepBubbleCard } from './SteepBubbleCard';
import { ExtractionCharts } from './ExtractionCharts';
import { TeaBlendStudio } from './TeaBlendStudio';
import { TeaCheatSheetModal } from './TeaCheatSheetModal';
import { SteepTimerModal } from './SteepTimerModal';
import { CustomTeaModal } from './CustomTeaModal';

export interface ExtractionSimulatorProps {
  initialSelectedTea?: TeaVariety | null;
  initialBrewParams?: InitialBrewParams | null;
  onOpenComparison?: (tea: TeaVariety) => void;
  onOpenJournal?: (sessionData: InitialTastingSessionData | TeaVariety) => void;
  settings?: AppSettings;
  onOpenSettings?: () => void;
}

export const ExtractionSimulator: React.FC<ExtractionSimulatorProps> = ({
  initialSelectedTea,
  initialBrewParams,
  onOpenComparison,
  onOpenJournal,
  settings,
  onOpenSettings
}) => {
  const appSettings = settings || loadAppSettings();
  const initialTea = initialBrewParams?.tea || initialSelectedTea;
  // Tea Category Tab: 'generic' (archetypes) first, 'specific' (popular teas) second, 'flavor' (search by flavor notes) third
  const [activeCategoryTab, setActiveCategoryTab] = useState<TeaCategoryGroup>(
    initialTea?.categoryGroup === 'generic' ? 'generic' : initialTea?.categoryGroup === 'blend' ? 'blend' : initialTea ? 'specific' : 'generic'
  );
  const [selectedTeaId, setSelectedTeaId] = useState<string>(initialTea?.id || 'generic_green');

  // Collapsible state for adaptive kinetics guidance block (hidden by default)
  const [isAdaptiveExpanded, setIsAdaptiveExpanded] = useState<boolean>(false);

  // Collapsible states for Correctness window sections (hidden by default)
  const [isChecksExpanded, setIsChecksExpanded] = useState<boolean>(false);
  const [isRecommendationsExpanded, setIsRecommendationsExpanded] = useState<boolean>(false);

  // Custom synthesized tea blend state (from TeaBlendStudio)
  const [customBlendTea, setCustomBlendTea] = useState<TeaVariety | null>(null);

  // Cheat Sheet Modal state
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);

  // Favorites state with localStorage persistence (storing id and vintageYear)
  const FAVORITES_STORAGE_KEY_V3 = 'gongfu_tea_favorites_v3';
  const FAVORITES_STORAGE_KEY_V2 = 'gongfu_tea_favorite_ids_v2';

  const [favoriteEntries, setFavoriteEntries] = useState<{ id: string; vintageYear?: number }[]>(() => {
    try {
      const savedV3 = localStorage.getItem(FAVORITES_STORAGE_KEY_V3);
      if (savedV3) {
        const parsed = JSON.parse(savedV3);
        if (Array.isArray(parsed)) {
          return parsed.map((item) =>
            typeof item === 'string' ? { id: item } : { id: item.id, vintageYear: item.vintageYear }
          );
        }
      }
      const savedV2 = localStorage.getItem(FAVORITES_STORAGE_KEY_V2);
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        if (Array.isArray(parsed)) {
          return parsed.map((id: string) => ({ id }));
        }
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Filter out any stale or non-existent tea IDs from favorite entries
  const validFavoriteEntries = useMemo(() => {
    return favoriteEntries.filter((f) => ALL_TEA_MAP.has(f.id) || (customBlendTea && f.id === customBlendTea.id));
  }, [favoriteEntries, customBlendTea]);

  const favoriteIds = useMemo(() => validFavoriteEntries.map((f) => f.id), [validFavoriteEntries]);

  // Sync back sanitized favorites if invalid IDs were found in local storage
  useEffect(() => {
    if (favoriteEntries.length !== validFavoriteEntries.length) {
      setFavoriteEntries(validFavoriteEntries);
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY_V3, JSON.stringify(validFavoriteEntries));
        localStorage.setItem(FAVORITES_STORAGE_KEY_V2, JSON.stringify(validFavoriteEntries.map((f) => f.id)));
      } catch {
        // ignore
      }
    }
  }, [favoriteEntries.length, validFavoriteEntries]);

  const clearAllFavorites = () => {
    setFavoriteEntries([]);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY_V3, JSON.stringify([]));
      localStorage.setItem(FAVORITES_STORAGE_KEY_V2, JSON.stringify([]));
    } catch {
      // ignore
    }
  };

  const toggleFavorite = (teaId: string, vintageYear?: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setFavoriteEntries((prev) => {
      const exists = prev.some((f) => f.id === teaId);
      let next: { id: string; vintageYear?: number }[];
      if (exists) {
        const existing = prev.find((f) => f.id === teaId);
        if (vintageYear && existing?.vintageYear !== vintageYear) {
          next = prev.map((f) => (f.id === teaId ? { ...f, vintageYear } : f));
        } else {
          next = prev.filter((f) => f.id !== teaId);
        }
      } else {
        next = [...prev, { id: teaId, vintageYear }];
      }
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY_V3, JSON.stringify(next));
        localStorage.setItem(FAVORITES_STORAGE_KEY_V2, JSON.stringify(next.map((f) => f.id)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [favoritesSearchQuery, setFavoritesSearchQuery] = useState<string>('');
  const deferredFavoritesSearchQuery = useDeferredValue(favoritesSearchQuery);
  const [favoritesTypeFilter, setFavoritesTypeFilter] = useState<string>('all');

  // Search and Filter State: strictly isolated by tab
  // 1. Popular Teas search & category filter + integrated sensory flavor search
  const [popularSearchQuery, setPopularSearchQuery] = useState<string>('');
  const deferredPopularSearchQuery = useDeferredValue(popularSearchQuery);
  const [popularTypeFilter, setPopularTypeFilter] = useState<string>('all');
  const [showFlavorInPopular, setShowFlavorInPopular] = useState<boolean>(false);

  // Custom Teas state with localStorage persistence
  const [customTeas, setCustomTeas] = useState<TeaVariety[]>(() => {
    try {
      const saved = localStorage.getItem('gongfu_my_custom_teas');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCustomTeaModalOpen, setIsCustomTeaModalOpen] = useState<boolean>(false);
  const [editingCustomTea, setEditingCustomTea] = useState<TeaVariety | null>(null);
  const [teaPendingDelete, setTeaPendingDelete] = useState<TeaVariety | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportFilenameInput, setExportFilenameInput] = useState<string>('my_teas.json');
  const [selectedExportTeaIds, setSelectedExportTeaIds] = useState<string[]>([]);
  const [importNotification, setImportNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic tea map including user's custom teas
  const allTeasMap = useMemo(() => {
    const map = new Map(ALL_TEA_MAP);
    customTeas.forEach((t) => map.set(t.id, t));
    return map;
  }, [customTeas]);

  // Flavor Search within Popular Teas (Sensory notes & bouquet)
  const [flavorSearchQuery, setFlavorSearchQuery] = useState<string>('');
  const deferredFlavorSearchQuery = useDeferredValue(flavorSearchQuery);
  const [selectedFlavorGroupId, setSelectedFlavorGroupId] = useState<string | null>(null);
  const [selectedFlavorTag, setSelectedFlavorTag] = useState<string | null>(null);

  // 3. Biochemical Effect Filter (shared/global)
  const [selectedEffectFilter, setSelectedEffectFilter] = useState<TeaEffectCategory | 'all'>('all');

  // Find active tea from the comprehensive list in O(1) time
  const selectedTea = useMemo(() => {
    if (customBlendTea && selectedTeaId === customBlendTea.id) {
      return customBlendTea;
    }
    return allTeasMap.get(selectedTeaId) || ALL_TEA_OPTIONS[0];
  }, [selectedTeaId, customBlendTea, allTeasMap]);

  // Fast rendering limits for 500+ tea varieties database (prevents frame drops and ensures 60 FPS)
  const [popularDisplayLimit, setPopularDisplayLimit] = useState<number>(10);

  // Key Environmental Parameters (Water Hardness & Vessel Material)
  const [waterHardness, setWaterHardness] = useState<WaterHardnessLevel>('optimal');
  const [vesselMaterial, setVesselMaterial] = useState<VesselMaterialType>('porcelain');
  const [isVesselDropdownOpen, setIsVesselDropdownOpen] = useState(false);
  const [isGoalDropdownOpen, setIsGoalDropdownOpen] = useState(false);
  const [isVintageDropdownOpen, setIsVintageDropdownOpen] = useState(false);
  const [customRinseTime, setCustomRinseTime] = useState<number | null>(null);

  // Dynamic current year (e.g. 2026, 2027) for vintage aging calculations
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const getRussianYearWord = useCallback((years: number): string => {
    const mod10 = years % 10;
    const mod100 = years % 100;
    if (mod100 >= 11 && mod100 <= 19) return 'лет';
    if (mod10 === 1) return 'год';
    if (mod10 >= 2 && mod10 <= 4) return 'года';
    return 'лет';
  }, []);

  const getVintageSubtitle = useCallback((teaType: TeaType, age: number): string => {
    if (age === 0) {
      if (teaType === 'shou_puerh') return 'Плотный землисто-ореховый профиль';
      if (teaType === 'sheng_puerh') return 'Травянисто-цветочный, яркая горчинка и хуэйгань';
      if (teaType === 'white') return 'Весенние цветы и белый виноград';
      if (teaType === 'heicha') return 'Древесно-травянистый с легким дымом';
      return 'Первичный свежий букет листа';
    }

    if (teaType === 'sheng_puerh') {
      if (age <= 3) return 'Золотистый настой, курага и сухое разнотравье';
      if (age <= 7) return 'Янтарный настой, липовый мед и вяленое яблоко';
      if (age <= 14) return 'Тёмный янтарь, камфора и осенний лес';
      return 'Рубиновый настой, лекарственные травы и финики';
    }
    if (teaType === 'shou_puerh') {
      if (age <= 1) return 'Плотный настой, древесная кора и влажная земля';
      if (age <= 4) return 'Чистый настой, темный шоколад и жареный орех';
      if (age <= 9) return 'Шелковистая текстура, сладкий чернослив и карамель';
      return 'Рубиновый настой, бальзамические и камфорные ноты';
    }
    if (teaType === 'heicha') {
      if (age <= 2) return 'Плотный настой, древесно-хвойный с легким дымом';
      if (age <= 6) return 'Мягкий настой, сосновая кора и сушеные ягоды';
      if (age <= 12) return 'Коньячный настой, бетелевый орех и пряности';
      return 'Бархатистый настой, финики и корень солодки';
    }
    if (teaType === 'white') {
      if (age <= 1) return 'Весенние травы, белый виноград и тонкий мед';
      if (age <= 4) return 'Золотистый настой, липовый цвет, дыня и прополис';
      if (age <= 8) return 'Янтарный настой, печеное яблоко, воск и финики';
      return 'Глубокий настой, финиковый отвар и целебные травы';
    }
    return 'Мягкий настой, округлый древесно-сухофруктовый вкус';
  }, []);

  const getVintageDescription = useCallback((teaType: TeaType, age: number): string => {
    if (teaType === 'sheng_puerh') {
      if (age === 0) return 'Свежий лист: луговые цветы, яркая полифенольная терпкость и сладкий хуэйгань.';
      if (age <= 3) return 'Золотистый настой: сухие травы, курага, светлый изюм и яблочная пастила.';
      if (age <= 7) return 'Янтарный настой: мягкая бархатистость, липовый мёд, сухофрукты и теплое дерево.';
      if (age <= 14) return 'Тёмный янтарь: осенний лес, камфора, вяленый инжир и смолистые ноты.';
      return 'Коньячно-рубиновый настой: шелковистый вкус, камфора, финики и аптечные травы.';
    }
    if (teaType === 'shou_puerh') {
      if (age <= 1) return 'Свежий сбор: густой настой, ноты влажной коры, сырой земли и минералов.';
      if (age <= 4) return 'Чистый прозрачный настой: горький шоколад, жареный фундук и древесина.';
      if (age <= 9) return 'Маслянистая текстура: сладкий чернослив, вяленая вишня и карамельный дуб.';
      return 'Темный рубин: бархатистый вкус, бальзамические и камфорные ноты со сладостью.';
    }
    if (teaType === 'heicha') {
      if (age <= 2) return 'Плотный янтарный настой: древесно-хвойный характер с дымным прогревом.';
      if (age <= 6) return 'Мягкий настой: сосновая кора, луговое сено, прелые листья и сухие ягоды.';
      if (age <= 12) return 'Коньячный оттенок: ноты бетелевого ореха, лесных грибов и медовой сладости.';
      return 'Бархатистый вкус: сушеные финики, старое дерево, солодка и смолистые ноты.';
    }
    if (teaType === 'white') {
      if (age <= 1) return 'Светло-соломенный настой: весенние цветы, свежее сено и белый виноград.';
      if (age <= 4) return 'Золотистый настой: липовый цвет, сушеная дыня, разнотравье и прополис.';
      if (age <= 8) return 'Янтарный настой: печеное яблоко, медовый воск, финики и целебные травы.';
      return 'Глубокий настой: финиковый отвар, инжир и карамелизованный мед.';
    }
    if (age === 0) return 'Свежий лист: яркая цветочно-травянистая ароматика.';
    if (age <= 3) return 'Мягкий настой: округлый вкус и теплые фруктовые оттенки.';
    return 'Выдержанный профиль: ноты сухофруктов, меда и благородной древесины.';
  }, []);

  const getDefaultTeaVintageYear = useCallback((tea: TeaVariety): number => {
    if (tea.vintageYear) return tea.vintageYear;
    const text = `${tea.nameRu} ${tea.scientificDescription}`;
    const yearMatch = text.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
    if (yearMatch) {
      const yr = Number(yearMatch[1]);
      if (yr >= 1970 && yr <= currentYear) return yr;
    }
    if (['sheng_puerh', 'shou_puerh', 'heicha', 'white'].includes(tea.type)) {
      return currentYear - 2;
    }
    return currentYear;
  }, [currentYear]);

  const [selectedVintageYear, setSelectedVintageYear] = useState<number>(() => {
    if (initialBrewParams?.vintageYear !== undefined) return initialBrewParams.vintageYear;
    return getDefaultTeaVintageYear(selectedTea);
  });

  const lastProcessedTeaIdRef = useRef<string>(selectedTea.id);

  useEffect(() => {
    if (lastProcessedTeaIdRef.current !== selectedTea.id) {
      lastProcessedTeaIdRef.current = selectedTea.id;
      setSelectedVintageYear(getDefaultTeaVintageYear(selectedTea));
    }
  }, [selectedTea, getDefaultTeaVintageYear]);

  // Chart compound visibility toggles
  const [showChartTheanine, setShowChartTheanine] = useState<boolean>(true);
  const [showChartCaffeine, setShowChartCaffeine] = useState<boolean>(true);
  const [showChartCatechins, setShowChartCatechins] = useState<boolean>(true);
  const [showChartPolysaccharides, setShowChartPolysaccharides] = useState<boolean>(true);
  const [showChartTemperature, setShowChartTemperature] = useState<boolean>(true);

  // Filtered generic archetypes:
  // Strictly isolated: NOT affected by popular teas' name search or type filters!
  // Displays the full set of 18 archetypes (filtered only if a specific biochemical effect is chosen).
  const filteredGenericTeas = useMemo(() => {
    return GENERIC_TEA_ARCHETYPES.filter((tea) => {
      if (selectedEffectFilter !== 'all') {
        const eff = getTeaEffect(tea);
        if (eff.id !== selectedEffectFilter) return false;
      }
      return true;
    });
  }, [selectedEffectFilter]);

  // Filtered popular teas: seamlessly combines custom teas, name search, type filter, effect filter AND flavor bouquet notes!
  const filteredPopularTeas = useMemo(() => {
    const activeSensoryQuery = (selectedFlavorTag || deferredFlavorSearchQuery || '').trim();

    // Pool of teas: custom teas first, then standard popular catalog
    const teaPool = popularTypeFilter === 'my_teas' 
      ? customTeas 
      : [...customTeas, ...TEA_VARIETIES];

    return teaPool.map((tea) => {
      if (popularTypeFilter !== 'all' && popularTypeFilter !== 'my_teas') {
        if (popularTypeFilter === 'oolong' && !tea.type.includes('oolong')) return null;
        else if (popularTypeFilter === 'gaba' && !tea.type.startsWith('gaba')) return null;
        else if (popularTypeFilter === 'puerh' && !tea.type.includes('puerh') && tea.type !== 'heicha') return null;
        else if (popularTypeFilter !== 'oolong' && popularTypeFilter !== 'gaba' && popularTypeFilter !== 'puerh' && tea.type !== popularTypeFilter) {
          return null;
        }
      }
      if (selectedEffectFilter !== 'all') {
        const eff = getTeaEffect(tea);
        if (eff.id !== selectedEffectFilter) return null;
      }
      if (selectedFlavorGroupId) {
        const grp = POPULAR_SENSORY_GROUPS.find((g) => g.id === selectedFlavorGroupId);
        if (grp) {
          const notes = tea.keySensoryNotes || [];
          const matchesGroup = grp.popularTags.some((tag) => {
            const cleanTag = cleanTeaChars(tag);
            return notes.some((n) => cleanTeaChars(n).includes(cleanTag));
          });
          if (!matchesGroup) return null;
        }
      }
      let matchedNotes: string[] = tea.keySensoryNotes || [];
      if (activeSensoryQuery) {
        const { matches, matchedNotes: sensoryMatches } = matchTeaBySensory(tea, activeSensoryQuery);
        if (!matches) return null;
        matchedNotes = sensoryMatches;
      }
      if (deferredPopularSearchQuery.trim()) {
        if (!matchTeaSearch(tea, deferredPopularSearchQuery)) return null;
      }
      return { tea, matchedNotes };
    }).filter((item): item is { tea: TeaVariety; matchedNotes: string[] } => item !== null);
  }, [customTeas, deferredPopularSearchQuery, popularTypeFilter, selectedEffectFilter, selectedFlavorGroupId, selectedFlavorTag, deferredFlavorSearchQuery]);

  // Filtered favorites
  const filteredFavoriteTeas = useMemo(() => {
    return favoriteIds
      .map((id) => {
        if (customBlendTea && id === customBlendTea.id) return customBlendTea;
        return allTeasMap.get(id);
      })
      .filter((tea): tea is TeaVariety => {
        if (!tea) return false;
        if (favoritesTypeFilter !== 'all') {
          if (favoritesTypeFilter === 'oolong' && !tea.type.includes('oolong')) return false;
          else if (favoritesTypeFilter === 'gaba' && !tea.type.startsWith('gaba')) return false;
          else if (favoritesTypeFilter === 'puerh' && !tea.type.includes('puerh') && tea.type !== 'heicha') return false;
          else if (favoritesTypeFilter !== 'oolong' && favoritesTypeFilter !== 'gaba' && favoritesTypeFilter !== 'puerh' && tea.type !== favoritesTypeFilter) {
            return false;
          }
        }
        if (selectedEffectFilter !== 'all') {
          const eff = getTeaEffect(tea);
          if (eff.id !== selectedEffectFilter) return false;
        }
        return matchTeaSearch(tea, deferredFavoritesSearchQuery);
      });
  }, [favoriteIds, customBlendTea, allTeasMap, deferredFavoritesSearchQuery, favoritesTypeFilter, selectedEffectFilter]);

  // Progressive rendering slices:
  // When active text search or flavor query is typed, show all matching results immediately.
  // When browsing all 483+ teas, show smooth chunked rendering to prevent DOM bloat.
  const visiblePopularTeas = useMemo(() => {
    if (deferredPopularSearchQuery.trim() || deferredFlavorSearchQuery.trim() || selectedFlavorTag || popularTypeFilter === 'my_teas') {
      return filteredPopularTeas;
    }
    return filteredPopularTeas.slice(0, popularDisplayLimit);
  }, [filteredPopularTeas, deferredPopularSearchQuery, deferredFlavorSearchQuery, selectedFlavorTag, popularDisplayLimit, popularTypeFilter]);

  // If a tea is selected that is beyond the current limit, automatically expand to ensure visibility
  useEffect(() => {
    if (activeCategoryTab === 'specific') {
      const idx = filteredPopularTeas.findIndex(({ tea }) => tea.id === selectedTeaId);
      if (idx >= popularDisplayLimit) {
        setPopularDisplayLimit(Math.ceil((idx + 1) / 10) * 10);
      }
    }
  }, [selectedTeaId, activeCategoryTab, filteredPopularTeas, popularDisplayLimit]);

  // Unified Multi-Parameter Optimizer State (Single source of truth)
  const [fixVolume, setFixVolume] = useState<boolean>(false);
  const [fixedVolumeVal, setFixedVolumeVal] = useState<number>(selectedTea.defaultVolume);

  const [fixMass, setFixMass] = useState<boolean>(false);
  const [fixedMassVal, setFixedMassVal] = useState<number>(selectedTea.defaultMass);

  const [fixTemp, setFixTemp] = useState<boolean>(false);
  const [fixedTempVal, setFixedTempVal] = useState<number>(selectedTea.optimalTemp);

  const [fixSteeps, setFixSteeps] = useState<boolean>(false);
  const [fixedSteepsVal, setFixedSteepsVal] = useState<number>(selectedTea.recommendedSteeps || 8);

  // Temporary string state while typing to allow clearing the inputs completely with backspace/delete
  const [rawVolumeStr, setRawVolumeStr] = useState<string | null>(null);
  const [rawMassStr, setRawMassStr] = useState<string | null>(null);
  const [rawTempStr, setRawTempStr] = useState<string | null>(null);
  const [rawSteepsStr, setRawSteepsStr] = useState<string | null>(null);

  const [optimizationGoal, setOptimizationGoal] = useState<OptimizationGoal>('balanced');
  const [selectedSteepIndex, setSelectedSteepIndex] = useState<number>(0);

  // When tea changes, update default parameters and non-fixed inputs
  const handleTeaChange = (tea: TeaVariety) => {
    setSelectedTeaId(tea.id);
    setSelectedSteepIndex(0);
    setCustomRinseTime(null);

    // Restore saved vintage year if tea is in favorites, else default
    const favEntry = favoriteEntries.find((f) => f.id === tea.id);
    if (favEntry?.vintageYear) {
      setSelectedVintageYear(favEntry.vintageYear);
    } else {
      setSelectedVintageYear(getDefaultTeaVintageYear(tea));
    }

    setRawVolumeStr(null);
    setRawMassStr(null);
    setRawTempStr(null);
    setRawSteepsStr(null);

    // If active goal was oil_tar or white_debitter but current tea does not support it, reset to balanced
    if (optimizationGoal === 'oil_tar' && tea.type !== 'shou_puerh' && tea.type !== 'heicha') {
      setOptimizationGoal('balanced');
    }
    if (optimizationGoal === 'white_debitter' && tea.type !== 'white') {
      setOptimizationGoal('balanced');
    }

    if (!fixVolume || tea.categoryGroup === 'blend') setFixedVolumeVal(tea.defaultVolume);
    if (!fixMass || tea.categoryGroup === 'blend') setFixedMassVal(tea.defaultMass);
    if (!fixTemp || tea.categoryGroup === 'blend') setFixedTempVal(tea.optimalTemp);
    if (!fixSteeps || tea.categoryGroup === 'blend') setFixedSteepsVal(tea.recommendedSteeps || 8);

    setIsVintageDropdownOpen(false);
    setIsGoalDropdownOpen(false);
    setIsVesselDropdownOpen(false);
  };

  const handleSaveCustomTea = (tea: TeaVariety) => {
    setCustomTeas((prev) => {
      const exists = prev.some((t) => t.id === tea.id);
      const updated = exists ? prev.map((t) => (t.id === tea.id ? tea : t)) : [tea, ...prev];
      try {
        localStorage.setItem('gongfu_my_custom_teas', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save custom teas to localStorage', e);
      }
      return updated;
    });
    // Immediately select and switch to the new custom tea
    handleTeaChange(tea);
    // Switch to Popular Teas tab and 'my_teas' filter so user sees their tea
    setActiveCategoryTab('specific');
    setPopularTypeFilter('my_teas');
  };

  const handleDeleteCustomTea = (teaId: string) => {
    setCustomTeas((prev) => {
      const updated = prev.filter((t) => t.id !== teaId);
      try {
        localStorage.setItem('gongfu_my_custom_teas', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save custom teas to localStorage', e);
      }
      return updated;
    });
    if (selectedTeaId === teaId) {
      handleTeaChange(ALL_TEA_OPTIONS[0]);
    }
  };

  const handleExportTeas = (teasToExport: TeaVariety[], filename: string) => {
    if (teasToExport.length === 0) return;
    let cleanFilename = filename.trim();
    if (!cleanFilename.endsWith('.json')) {
      cleanFilename += '.json';
    }
    const exportPayload = {
      format: 'gongfu_cha_custom_teas',
      version: 1,
      exportDate: new Date().toISOString(),
      count: teasToExport.length,
      teas: teasToExport,
    };
    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
    setImportNotification({
      type: 'success',
      message: `Экспортировано ${teasToExport.length} сортов в файл «${cleanFilename}»`
    });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        let incomingList: any[] = [];
        if (Array.isArray(parsed)) {
          incomingList = parsed;
        } else if (parsed && Array.isArray(parsed.teas)) {
          incomingList = parsed.teas;
        } else if (parsed && Array.isArray(parsed.varieties)) {
          incomingList = parsed.varieties;
        } else if (parsed && typeof parsed === 'object' && (parsed.nameRu || parsed.id)) {
          incomingList = [parsed];
        }

        if (incomingList.length === 0) {
          setImportNotification({
            type: 'error',
            message: 'В выбранном файле не найдено сортов чая.'
          });
          return;
        }

        const validTeas: TeaVariety[] = [];
        const existingIds = new Set(customTeas.map((t) => t.id));

        for (const item of incomingList) {
          if (!item || typeof item !== 'object' || !item.nameRu) continue;

          let teaId = item.id;
          if (!teaId || existingIds.has(teaId)) {
            teaId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          }
          existingIds.add(teaId);

          const sanitized: TeaVariety = {
            id: teaId,
            nameRu: String(item.nameRu).trim(),
            nameZh: item.nameZh ? String(item.nameZh).trim() : '',
            namePinyin: item.namePinyin ? String(item.namePinyin).trim() : '',
            transcriptionRu: item.transcriptionRu || `${String(item.nameRu).trim()} (Собственный чай)`,
            type: item.type || 'sheng_puerh',
            typeNameRu: item.typeNameRu || 'Шэн Пуэр',
            origin: item.origin ? String(item.origin).trim() : '',
            cultivar: item.cultivar ? String(item.cultivar).trim() : '',
            leafMorphology: item.leafMorphology || 'twisted_strip',
            oxidationLevel: item.oxidationLevel || '15%',
            optimalTemp: Number(item.optimalTemp) || 95,
            tempRange: Array.isArray(item.tempRange) && item.tempRange.length === 2 ? item.tempRange : [90, 100],
            defaultMass: Number(item.defaultMass) || 7,
            defaultVolume: Number(item.defaultVolume) || 120,
            recommendedVesselRu: item.recommendedVesselRu || 'Фарфоровая гайвань 120 мл',
            keySensoryNotes: Array.isArray(item.keySensoryNotes) ? item.keySensoryNotes : [],
            scientificDescription: item.scientificDescription || '',
            recommendedSteeps: Number(item.recommendedSteeps) || 8,
            categoryGroup: 'specific',
            isArchetype: false,
            isCustom: true,
            canAge: Boolean(item.canAge ?? item.isAgedTea),
            vintageYear: item.vintageYear ? Number(item.vintageYear) : undefined,
            rinseSeconds: item.rinseSeconds !== undefined ? Number(item.rinseSeconds) : 5,
            rinseNoteRu: item.rinseNoteRu || 'Быстрое пробуждение листа'
          };
          validTeas.push(sanitized);
        }

        if (validTeas.length === 0) {
          setImportNotification({
            type: 'error',
            message: 'Файл не содержит корректных записей сортов чая.'
          });
          return;
        }

        setCustomTeas((prev) => {
          const updated = [...validTeas, ...prev];
          try {
            localStorage.setItem('gongfu_my_custom_teas', JSON.stringify(updated));
          } catch (err) {
            console.error('Failed to save imported teas', err);
          }
          return updated;
        });

        setActiveCategoryTab('specific');
        setPopularTypeFilter('my_teas');
        handleTeaChange(validTeas[0]);

        setImportNotification({
          type: 'success',
          message: `Успешно импортировано: ${validTeas.length} ${validTeas.length === 1 ? 'сорт' : validTeas.length < 5 ? 'сорта' : 'сортов'}!`
        });
      } catch (err) {
        console.error('Import error:', err);
        setImportNotification({
          type: 'error',
          message: 'Ошибка при чтении файла JSON. Проверьте корректность формата.'
        });
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!importNotification) return;
    const timer = setTimeout(() => {
      setImportNotification(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [importNotification]);

  // Sync when initialBrewParams or initialSelectedTea changes
  useEffect(() => {
    if (initialBrewParams) {
      const tea = initialBrewParams.tea;
      lastProcessedTeaIdRef.current = tea.id;
      setSelectedTeaId(tea.id);
      setActiveCategoryTab(
        tea.categoryGroup === 'blend' ? 'blend' : tea.categoryGroup === 'generic' ? 'generic' : 'specific'
      );
      if (tea.categoryGroup === 'blend' && !ALL_TEA_MAP.has(tea.id)) {
        setCustomBlendTea(tea);
      }
      if (initialBrewParams.vintageYear !== undefined) {
        setSelectedVintageYear(initialBrewParams.vintageYear);
      }
      if (initialBrewParams.brewingMethod !== undefined) {
        setBrewingMethod(initialBrewParams.brewingMethod);
      } else if (initialBrewParams.vesselUsed) {
        const v = initialBrewParams.vesselUsed.toLowerCase();
        if (v.includes('кружк') || v.includes('стакан') || v.includes('термос') || v.includes('чашк')) {
          setBrewingMethod('grandpa_cup');
        }
      }
      if (initialBrewParams.rootFraction !== undefined) {
        setRootFraction(initialBrewParams.rootFraction);
      }
      if (initialBrewParams.waterHardness !== undefined) {
        setWaterHardness(initialBrewParams.waterHardness);
      }
      if (initialBrewParams.optimizationGoal !== undefined) {
        setOptimizationGoal(initialBrewParams.optimizationGoal);
      }
      if (initialBrewParams.customRinseTime !== undefined) {
        setCustomRinseTime(initialBrewParams.customRinseTime);
      }
      if (initialBrewParams.waterTempC !== undefined) {
        setFixedTempVal(initialBrewParams.waterTempC);
        setFixTemp(true);
      }
      if (initialBrewParams.teaMassG !== undefined) {
        setFixedMassVal(initialBrewParams.teaMassG);
        setFixMass(true);
      }
      if (initialBrewParams.waterVolumeMl !== undefined) {
        setFixedVolumeVal(initialBrewParams.waterVolumeMl);
        setFixVolume(true);
      }
      if (initialBrewParams.steepsCount !== undefined) {
        setFixedSteepsVal(initialBrewParams.steepsCount);
        setFixSteeps(true);
      }
      if (initialBrewParams.steepScheduleSec && initialBrewParams.steepScheduleSec.length > 0) {
        setCustomSteepTimes(initialBrewParams.steepScheduleSec);
        setIsManualTimeEditMode(true);
      }
      if (initialBrewParams.vesselMaterial !== undefined) {
        setVesselMaterial(initialBrewParams.vesselMaterial);
      } else if (initialBrewParams.vesselUsed) {
        const v = initialBrewParams.vesselUsed.toLowerCase();
        if (v.includes('глинян') || v.includes('исин') || v.includes('чаочжоу') || v.includes('yixing')) {
          setVesselMaterial('yixing_clay');
        } else if (v.includes('стекл') || v.includes('типод') || v.includes('колб') || v.includes('glass')) {
          setVesselMaterial('glass_regular');
        } else if (v.includes('толст') || v.includes('фаянс')) {
          setVesselMaterial('ceramic_thick');
        } else if (v.includes('керамик')) {
          setVesselMaterial('ceramic_regular');
        } else if (v.includes('чугун') || v.includes('iron')) {
          setVesselMaterial('cast_iron');
        } else if (v.includes('серебр') || v.includes('silver')) {
          setVesselMaterial('metal_silver');
        } else if (v.includes('термос')) {
          setVesselMaterial('thermos');
        } else {
          setVesselMaterial('porcelain');
        }
      }
      setSelectedSteepIndex(0);
    } else if (initialSelectedTea) {
      lastProcessedTeaIdRef.current = initialSelectedTea.id;
      setSelectedTeaId(initialSelectedTea.id);
      setActiveCategoryTab(
        initialSelectedTea.categoryGroup === 'blend' ? 'blend' : initialSelectedTea.categoryGroup === 'generic' ? 'generic' : 'specific'
      );
      if (initialSelectedTea.categoryGroup === 'blend' && !ALL_TEA_MAP.has(initialSelectedTea.id)) {
        setCustomBlendTea(initialSelectedTea);
      }
    }
  }, [initialBrewParams, initialSelectedTea]);

  const handleCategoryTabChange = (tab: TeaCategoryGroup) => {
    setActiveCategoryTab(tab);
  };

  const handleApplyBlend = (compositeTea: TeaVariety) => {
    setCustomBlendTea(compositeTea);
    setSelectedTeaId(compositeTea.id);
    setSelectedSteepIndex(0);
    setCustomRinseTime(null);
    setRawVolumeStr(null);
    setRawMassStr(null);
    setRawTempStr(null);
    setRawSteepsStr(null);

    // Forcefully sync optimizer parameters to blend's exact calculations
    setFixVolume(true);
    setFixedVolumeVal(compositeTea.defaultVolume);
    setFixMass(true);
    setFixedMassVal(compositeTea.defaultMass);
    setFixTemp(true);
    setFixedTempVal(compositeTea.optimalTemp);
    setFixSteeps(false);
    setFixedSteepsVal(compositeTea.recommendedSteeps || 8);

    // Switch to generic tab to view the active brewing simulation
    setActiveCategoryTab('generic');
  };

  // Brewing Method State: 'gongfu' (Полный слив), 'liu_gen' (Оставление корня), 'grandpa_cup' (Бэй Пао Фа)
  const [brewingMethod, setBrewingMethod] = useState<BrewingMethod>('gongfu');
  const [rootFraction, setRootFraction] = useState<number>(0.333);

  const resetToOptimized = () => {
    setFixVolume(false);
    setFixedVolumeVal(selectedTea.defaultVolume);
    setFixMass(false);
    setFixedMassVal(selectedTea.defaultMass);
    setFixTemp(false);
    setFixedTempVal(selectedTea.optimalTemp);
    setFixSteeps(false);
    setFixedSteepsVal(selectedTea.recommendedSteeps || 8);
    setRawVolumeStr(null);
    setRawMassStr(null);
    setRawTempStr(null);
    setRawSteepsStr(null);
    setOptimizationGoal('balanced');
    setWaterHardness('optimal');
    setVesselMaterial('porcelain');
    setSelectedSteepIndex(0);
    setCustomRinseTime(null);
    setBrewingMethod('gongfu');
    setRootFraction(0.333);
  };

  // Dynamic Multi-Parameter Optimization (Single unified solver)
  const activeOptimization = useMemo(() => {
    return optimizeBrewingParametersMulti(
      selectedTea,
      {
        fixVolume,
        fixedVolume: fixedVolumeVal,
        fixMass,
        fixedMass: fixedMassVal,
        fixTemp,
        fixedTemp: fixedTempVal,
        fixSteeps,
        fixedSteeps: fixedSteepsVal
      },
      optimizationGoal,
      waterHardness,
      vesselMaterial
    );
  }, [
    selectedTea,
    fixVolume,
    fixedVolumeVal,
    fixMass,
    fixedMassVal,
    fixTemp,
    fixedTempVal,
    fixSteeps,
    fixedSteepsVal,
    optimizationGoal,
    waterHardness,
    vesselMaterial
  ]);

  // Derived active brewing parameters (Always live and in sync with optimizer)
  const waterVolume = activeOptimization.recommendedWaterVolume;
  const leafMass = activeOptimization.recommendedLeafMass;
  const waterTemp = activeOptimization.recommendedWaterTemp;
  const steepsCount = activeOptimization.recommendedSteepCount;
  const ratio = activeOptimization.recommendedRatio;
  const fixedCount = (fixVolume ? 1 : 0) + (fixMass ? 1 : 0) + (fixTemp ? 1 : 0) + (fixSteeps ? 1 : 0);

  // Dynamic adaptive steep durations computed in real-time by kinetics model (always active)
  const computedAdaptiveDurations = activeOptimization.recommendedDurations;

  // Custom Steeps Timing Mode ("Своё время") State - double click edit mode toggle
  const [isManualTimeEditMode, setIsManualTimeEditMode] = useState<boolean>(false);
  const [editingSteepIndex, setEditingSteepIndex] = useState<number | null>(null);
  const [customSteepTimes, setCustomSteepTimes] = useState<(number | null)[]>([]);

  // Custom Steeps Dynamic Water Temperature ("Своя температура") State
  const [customSteepTemps, setCustomSteepTemps] = useState<(number | null)[]>([]);
  const [customRinseTemp, setCustomRinseTemp] = useState<number | null>(null);

  // Dynamic temperature schedule computed across all steeps & rinse
  const dynamicTemperatures = useMemo(() => {
    return calculateDynamicSteepTemperatures(
      selectedTea,
      steepsCount,
      optimizationGoal,
      customSteepTemps,
      customRinseTemp,
      waterTemp,
      brewingMethod
    );
  }, [selectedTea, steepsCount, optimizationGoal, customSteepTemps, customRinseTemp, waterTemp, brewingMethod]);

  const handleSetCustomSteepTemp = useCallback((steepIndex: number, tempC: number | null) => {
    setCustomSteepTemps((prev) => {
      const next = [...prev];
      while (next.length < steepsCount) {
        next.push(null);
      }
      next[steepIndex] = (tempC !== null && !isNaN(tempC)) ? Math.min(BREWING_LIMITS.MAX_TEMP_C, Math.max(BREWING_LIMITS.MIN_TEMP_C, Math.round(tempC))) : null;
      return next;
    });
  }, [steepsCount]);

  const handleResetAllCustomTemps = useCallback(() => {
    setCustomSteepTemps(new Array(steepsCount).fill(null));
    setCustomRinseTemp(null);
  }, [steepsCount]);

  const customTempsCount = useMemo(() => {
    let cnt = customSteepTemps.filter((t) => t !== null && t !== undefined).length;
    if (customRinseTemp !== null) cnt++;
    return cnt;
  }, [customSteepTemps, customRinseTemp]);

  // Adaptive Recalculation Engine for User-defined Steeps
  const adaptiveCustomBrewing = useMemo(() => {
    return calculateAdaptiveCustomBrewing(
      selectedTea,
      steepsCount,
      waterTemp,
      leafMass,
      waterVolume,
      waterHardness,
      optimizationGoal,
      customSteepTimes,
      brewingMethod,
      rootFraction,
      customRinseTime,
      selectedVintageYear
    );
  }, [
    selectedTea,
    steepsCount,
    waterTemp,
    leafMass,
    waterVolume,
    waterHardness,
    optimizationGoal,
    customSteepTimes,
    brewingMethod,
    rootFraction,
    customRinseTime,
    selectedVintageYear
  ]);

  // Effective durations and flags feeding into the chemical simulation
  const effectiveDurations = useMemo(() => {
    if (adaptiveCustomBrewing) {
      return adaptiveCustomBrewing.combinedDurations;
    }
    return computedAdaptiveDurations;
  }, [adaptiveCustomBrewing, computedAdaptiveDurations]);

  const effectiveCustomFlags = useMemo(() => {
    if (adaptiveCustomBrewing) {
      return adaptiveCustomBrewing.customFlags;
    }
    return undefined;
  }, [adaptiveCustomBrewing]);

  const handleSetCustomSteepTime = useCallback((steepIndex: number, timeSec: number | null) => {
    setCustomSteepTimes((prev) => {
      const next = [...prev];
      while (next.length < steepsCount) {
        next.push(null);
      }
      next[steepIndex] = timeSec;
      return next;
    });
  }, [steepsCount]);

  const handleResetAllCustomTimes = useCallback(() => {
    setCustomSteepTimes(new Array(steepsCount).fill(null));
    setCustomRinseTime(null);
  }, [steepsCount]);

  // Steep Timer modal state and handlers (triggered on long press or timer button)
  const [isTimerModalOpen, setIsTimerModalOpen] = useState<boolean>(false);
  const [timerSteepIndex, setTimerSteepIndex] = useState<number>(0);

  const handleOpenTimer = useCallback((idx: number) => {
    setTimerSteepIndex(idx);
    setSelectedSteepIndex(idx);
    setIsTimerModalOpen(true);
  }, []);

  const rinseLongPressProps = useLongPress({
    onLongPress: () => {
      setSelectedSteepIndex(-1);
      handleOpenTimer(-1);
    },
    onClick: () => setSelectedSteepIndex(-1),
  });

  const exposureLongPressProps = useLongPress({
    onLongPress: () => {
      setSelectedSteepIndex(selectedSteepIndex);
      handleOpenTimer(selectedSteepIndex);
    },
    onClick: () => {
      setSelectedSteepIndex(selectedSteepIndex);
      handleOpenTimer(selectedSteepIndex);
    },
  });

  const rinseExposureLongPressProps = useLongPress({
    onLongPress: () => {
      setSelectedSteepIndex(-1);
      handleOpenTimer(-1);
    },
    onClick: () => {
      setSelectedSteepIndex(-1);
      handleOpenTimer(-1);
    },
  });

  const effectiveRinseTemp = useMemo(() => {
    if (appSettings.useDynamicTemperatures) {
      return dynamicTemperatures.rinseTempC;
    }
    if (customRinseTemp !== null) return customRinseTemp;
    if (optimizationGoal === 'white_debitter') return 100;
    return selectedTea.type === 'shou_puerh' || selectedTea.type === 'heicha' ? 100 : waterTemp;
  }, [appSettings.useDynamicTemperatures, dynamicTemperatures, customRinseTemp, optimizationGoal, selectedTea, waterTemp]);

  const zeroInfusionOptions = useMemo(() => resolveZeroInfusionOptions({
    tea: selectedTea,
    waterTempC: waterTemp,
    waterVolumeMl: waterVolume,
    optimizationGoal,
    customDurationSec: customRinseTime,
    customTemperatureC: appSettings.useDynamicTemperatures
      ? dynamicTemperatures.rinseTempC
      : customRinseTemp,
    isCustomTime: customRinseTime !== null,
    isCustomTemperature: appSettings.useDynamicTemperatures
      ? dynamicTemperatures.isCustomRinseTemp
      : customRinseTemp !== null,
  }), [
    selectedTea,
    waterTemp,
    waterVolume,
    optimizationGoal,
    customRinseTime,
    customRinseTemp,
    appSettings.useDynamicTemperatures,
    dynamicTemperatures,
  ]);

  // Search a small, deterministic set of time/temperature candidates by running the
  // same physical model. Explicitly edited times and temperatures are treated as fixed.
  const physicalSchedule = useMemo(() => {
    const initialTemperatures = appSettings.useDynamicTemperatures
      ? dynamicTemperatures.steepTempsC
      : Array(steepsCount).fill(waterTemp);
    const simulationInput = {
      tea: selectedTea,
      leafMassGrams: leafMass,
      waterVolumeMl: waterVolume,
      waterTempC: waterTemp,
      durations: effectiveDurations,
      requestedSteepsCount: steepsCount,
      waterHardnessLevel: waterHardness,
      vesselMaterial,
      customFlags: effectiveCustomFlags,
      optimizationGoal,
      brewingMethod,
      rootFraction,
      perSteepTempsC: initialTemperatures,
      customTempFlags: appSettings.useDynamicTemperatures
        ? dynamicTemperatures.isCustomSteepTemp
        : Array(steepsCount).fill(false),
      zeroInfusion: {
        ...zeroInfusionOptions,
        waterVolumeMl: zeroInfusionOptions.enabled ? zeroInfusionOptions.waterVolumeMl : waterVolume,
        disposition: zeroInfusionOptions.disposition ?? 'discard',
      },
    };
    return optimizePhysicalSchedule({
      simulation: simulationInput,
      userDurations: customSteepTimes,
      userTemperaturesC: appSettings.useDynamicTemperatures ? customSteepTemps : [],
      optimizeTemperatures: appSettings.useDynamicTemperatures,
      targetSteepIndex: 1,
    });
  }, [
    selectedTea,
    leafMass,
    waterVolume,
    waterTemp,
    effectiveDurations,
    steepsCount,
    waterHardness,
    vesselMaterial,
    effectiveCustomFlags,
    optimizationGoal,
    brewingMethod,
    rootFraction,
    zeroInfusionOptions,
    customSteepTimes,
    customSteepTemps,
    appSettings.useDynamicTemperatures,
    dynamicTemperatures,
  ]);

  const physicalSimulation = useMemo(() => {
    return simulatePhysicalBrewing({
      tea: selectedTea,
      leafMassGrams: leafMass,
      waterVolumeMl: waterVolume,
      waterTempC: waterTemp,
      durations: physicalSchedule.durations,
      requestedSteepsCount: steepsCount,
      waterHardnessLevel: waterHardness,
      vesselMaterial,
      customFlags: effectiveCustomFlags,
      optimizationGoal,
      brewingMethod,
      rootFraction,
      perSteepTempsC: physicalSchedule.temperaturesC,
      customTempFlags: appSettings.useDynamicTemperatures
        ? dynamicTemperatures.isCustomSteepTemp
        : Array(steepsCount).fill(false),
      zeroInfusion: zeroInfusionOptions,
    });
  }, [
    selectedTea,
    leafMass,
    waterVolume,
    waterTemp,
    physicalSchedule,
    steepsCount,
    waterHardness,
    vesselMaterial,
    effectiveCustomFlags,
    optimizationGoal,
    brewingMethod,
    rootFraction,
    zeroInfusionOptions,
    appSettings.useDynamicTemperatures,
    dynamicTemperatures,
  ]);

  const simulationResults = physicalSimulation.steeps;

  // Scientific rinse parameters based on leaf morphology and cultivar
  const baseTeaRinseInfo = useMemo(() => {
    return getTeaRinseInfo(selectedTea, effectiveRinseTemp, optimizationGoal);
  }, [selectedTea, effectiveRinseTemp, optimizationGoal]);

  const teaRinseInfo = useMemo(() => {
    return {
      ...baseTeaRinseInfo,
      // The shared simulation is the source of truth for whether #0 exists and its actual settings.
      required: physicalSimulation.zeroInfusionData !== null,
      seconds: physicalSimulation.zeroInfusionData?.timeSec
        ?? (customRinseTime !== null ? customRinseTime : baseTeaRinseInfo.seconds),
      tempC: physicalSimulation.zeroInfusionData?.waterTempC ?? effectiveRinseTemp,
      isCustomUserTime: customRinseTime !== null,
      isCustomTemp: appSettings.useDynamicTemperatures
        ? dynamicTemperatures.isCustomRinseTemp
        : customRinseTemp !== null
    };
  }, [baseTeaRinseInfo, customRinseTime, effectiveRinseTemp, appSettings.useDynamicTemperatures, dynamicTemperatures, customRinseTemp, physicalSimulation]);

  const isRinseEnabled = teaRinseInfo.required;

  // Reuse the zero-infusion result from the same simulation that produces the main steeps.
  const rinseSteepData = isRinseEnabled ? physicalSimulation.zeroInfusionData : null;

  const isRinseSelected = selectedSteepIndex === -1 && isRinseEnabled;
  const safeSteepIndex = Math.min(Math.max(0, selectedSteepIndex), Math.max(0, simulationResults.length - 1));
  const currentSteepData = (isRinseSelected && rinseSteepData) 
    ? rinseSteepData 
    : (simulationResults[safeSteepIndex] || simulationResults[0]);

  // Auto reset steep index if current tea does not have a rinse
  useEffect(() => {
    if (!isRinseEnabled && selectedSteepIndex === -1) {
      setSelectedSteepIndex(0);
    }
  }, [isRinseEnabled, selectedSteepIndex]);


  const morphologyInfo = getLeafMorphologyInfo(selectedTea.leafMorphology);

  // Cumulative yield and extracted compounds
  const lastSteepYield = simulationResults.length > 0 
    ? simulationResults[simulationResults.length - 1].cumulativeExtractionYieldPercent 
    : 0;

  const totalCaffeineExtracted = simulationResults.reduce((acc, curr) => acc + (curr.caffeineConcentration * (waterVolume / 100)), 0).toFixed(1);
  const totalTheanineExtracted = simulationResults.reduce((acc, curr) => acc + (curr.theanineConcentration * (waterVolume / 100)), 0).toFixed(1);

  // Full sequence for chart visualization including Steep #0 (Rinse) when rinse is enabled
  const chartSteepsData = useMemo(() => {
    if (isRinseEnabled && rinseSteepData) {
      return [rinseSteepData, ...simulationResults];
    }
    return simulationResults;
  }, [isRinseEnabled, rinseSteepData, simulationResults]);

  // Continuous minute-by-minute timeline data for «Ленивый» метод (Бэй Пао Фа)
  const lazyCupTimeline = useMemo(() => {
    if (brewingMethod !== 'grandpa_cup') return [];
    return calculateContinuousInfusionTimeline({
      simulationResults,
      waterTemp,
      waterVolume,
      steepsCount,
      cycleDurationSec: physicalSchedule.durations[0] || 180,
    });
  }, [brewingMethod, simulationResults, waterTemp, waterVolume, steepsCount, physicalSchedule.durations]);

  return (
    <div className="space-y-6">
      {/* Top Utility Bar: Base Selector (Generic, Popular Teas, Favorites, Blending Studio) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 sm:px-4 rounded-xl border border-stone-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xs font-bold text-stone-800 shrink-0">База сортов:</span>
          <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-stone-100 p-1 border border-stone-200">
            {/* 1. Общие архетипы */}
            <button
              id="category-tab-generic"
              onClick={() => handleCategoryTabChange('generic')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer text-center ${
                activeCategoryTab === 'generic'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              Общие архетипы ({GENERIC_TEA_ARCHETYPES.length})
            </button>

            {/* 2. Популярные чаи */}
            <button
              id="category-tab-specific"
              onClick={() => handleCategoryTabChange('specific')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer text-center ${
                activeCategoryTab === 'specific'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              Популярные чаи ({TEA_VARIETIES.length + customTeas.length})
            </button>

            {/* 3. Смешивание и купажирование */}
            <button
              id="category-tab-blend"
              onClick={() => handleCategoryTabChange('blend')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer text-center ${
                activeCategoryTab === 'blend'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <span>Смешивание чаёв (Купажи)</span>
            </button>

            {/* 4. Избранные чаи */}
            <button
              id="category-tab-favorites"
              onClick={() => handleCategoryTabChange('favorites')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer text-center ${
                activeCategoryTab === 'favorites'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <span>Избранное ({favoriteIds.length})</span>
            </button>
          </div>
        </div>

        {/* Search Bar for Popular Teas */}
        {activeCategoryTab === 'specific' && (
          <div className="flex items-center gap-2 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по сорту, названию, региону, вкусу..."
                value={popularSearchQuery}
                onChange={(e) => setPopularSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/70 focus:bg-white focus:border-amber-700 focus:outline-hidden focus:ring-1 focus:ring-amber-700/30 transition-all text-stone-900 placeholder:text-stone-400"
              />
              {popularSearchQuery && (
                <button
                  type="button"
                  onClick={() => setPopularSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                  title="Очистить поиск"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Toggle Flavor Notes in Popular Teas */}
            <button
              type="button"
              onClick={() => setShowFlavorInPopular(!showFlavorInPopular)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1 shrink-0 cursor-pointer ${
                showFlavorInPopular || selectedFlavorTag || selectedFlavorGroupId || flavorSearchQuery
                  ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
                  : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
              }`}
              title="Открыть фильтр по нотам букета и вкусу"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden sm:inline">Вкус и ноты</span>
              {(selectedFlavorTag || selectedFlavorGroupId || flavorSearchQuery) && (
                <span className="w-2 h-2 rounded-full bg-amber-600" />
              )}
            </button>
          </div>
        )}

        {/* Search Bar for Favorites */}
        {activeCategoryTab === 'favorites' && (
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по избранным сортам..."
                value={favoritesSearchQuery}
                onChange={(e) => setFavoritesSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/70 focus:bg-white focus:border-amber-700 focus:outline-hidden focus:ring-1 focus:ring-amber-700/30 transition-all text-stone-900 placeholder:text-stone-400"
              />
              {favoritesSearchQuery && (
                <button
                  type="button"
                  onClick={() => setFavoritesSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                  title="Очистить поиск"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {activeCategoryTab === 'generic' && (
          <div className="text-xs text-stone-500 font-medium hidden sm:block">
            Базовые архетипы для моделирования любых видов чая
          </div>
        )}

        {activeCategoryTab === 'blend' && (
          <div className="text-xs text-amber-900 font-semibold hidden sm:block">
            Лаборатория блендинга и расчёта синергии
          </div>
        )}
      </div>

      {/* Quick Category Filter Pills - Shown for Popular Teas */}
      {activeCategoryTab === 'specific' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider shrink-0 mr-1">Раздел:</span>
          {[
            { id: 'all', label: 'Все сорта' },
            { id: 'green', label: 'Зелёный' },
            { id: 'white', label: 'Белый' },
            { id: 'yellow', label: 'Жёлтый' },
            { id: 'oolong', label: 'Улун' },
            { id: 'gaba', label: 'Габа' },
            { id: 'red', label: 'Красный' },
            { id: 'puerh', label: 'Пуэр / Хэйча' },
            { id: 'my_teas', label: `Мои чаи (${customTeas.length})` }
          ].map((filter) => {
            const isActive = popularTypeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setPopularTypeFilter(filter.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 border cursor-pointer ${
                  isActive
                    ? 'bg-amber-900 text-white border-amber-900 shadow-2xs font-semibold'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Quick Category Filter Pills - Shown for Favorites */}
      {activeCategoryTab === 'favorites' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider shrink-0 mr-1">Тип чая:</span>
          {[
            { id: 'all', label: 'Все' },
            { id: 'green', label: 'Зелёный' },
            { id: 'white', label: 'Белый' },
            { id: 'yellow', label: 'Жёлтый' },
            { id: 'oolong', label: 'Улун' },
            { id: 'gaba', label: 'Габа' },
            { id: 'red', label: 'Красный' },
            { id: 'puerh', label: 'Пуэр / Хэйча' }
          ].map((filter) => {
            const isActive = favoritesTypeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setFavoritesTypeFilter(filter.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 border cursor-pointer ${
                  isActive
                    ? 'bg-amber-900 text-white border-amber-900 shadow-2xs'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Integrated Flavor Profile Explorer in Popular Teas */}
      {activeCategoryTab === 'specific' && (showFlavorInPopular || selectedFlavorTag || selectedFlavorGroupId || flavorSearchQuery) && (
        <div className="space-y-2.5 p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 shadow-2xs animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-800" />
              <span className="text-xs font-bold text-stone-900">Вкусовой букет и ароматические направления:</span>
            </div>
            <div className="flex items-center space-x-2">
              {(selectedFlavorGroupId || selectedFlavorTag || flavorSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFlavorGroupId(null);
                    setSelectedFlavorTag(null);
                    setFlavorSearchQuery('');
                  }}
                  className="text-xs text-amber-800 hover:text-amber-950 font-semibold cursor-pointer underline underline-offset-2"
                >
                  Сбросить ноты
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowFlavorInPopular(false)}
                className="text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                title="Скрыть панель нот"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Direct text search for specific flavor notes */}
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-amber-700 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск нот: мёд, орхидея, шоколад, сливки, персик..."
              value={flavorSearchQuery}
              onChange={(e) => {
                setFlavorSearchQuery(e.target.value);
                if (selectedFlavorTag) setSelectedFlavorTag(null);
              }}
              className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-amber-300 bg-white focus:border-amber-700 focus:outline-hidden focus:ring-1 focus:ring-amber-700/30 text-stone-900 placeholder:text-stone-400"
            />
            {flavorSearchQuery && (
              <button
                type="button"
                onClick={() => setFlavorSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Group pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
            <button
              type="button"
              onClick={() => {
                setSelectedFlavorGroupId(null);
                setSelectedFlavorTag(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
                !selectedFlavorGroupId && !selectedFlavorTag
                  ? 'bg-amber-800 text-white border-amber-800 shadow-2xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              Все направления
            </button>
            {POPULAR_SENSORY_GROUPS.map((grp) => {
              const isActive = selectedFlavorGroupId === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      setSelectedFlavorGroupId(null);
                    } else {
                      setSelectedFlavorGroupId(grp.id);
                      setSelectedFlavorTag(null);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border cursor-pointer flex items-center gap-1 ${
                    isActive
                      ? 'bg-amber-800 text-white border-amber-800 shadow-2xs'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span>{grp.icon}</span>
                  <span>{grp.nameRu}</span>
                </button>
              );
            })}
          </div>

          {/* Quick tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-amber-200/60 text-xs">
            <span className="text-[11px] font-semibold text-stone-500 mr-1">Популярные ноты:</span>
            {(() => {
              const activeGroup = POPULAR_SENSORY_GROUPS.find((g) => g.id === selectedFlavorGroupId);
              const tagsToShow = activeGroup 
                ? activeGroup.popularTags 
                : ['мёд', 'орхидея', 'жасмин', 'персик', 'тёмный шоколад', 'хвоя', 'дым костра', 'карамель', 'сливки', 'чернослив', 'грецкий орех', 'каштан'];

              return tagsToShow.map((tag) => {
                const isSelected = selectedFlavorTag === tag || flavorSearchQuery.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedFlavorTag(null);
                        setFlavorSearchQuery('');
                      } else {
                        setSelectedFlavorTag(tag);
                        setFlavorSearchQuery(tag);
                      }
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-amber-900 text-white border-amber-900 shadow-2xs'
                        : 'bg-white text-stone-700 border-amber-200/90 hover:bg-amber-100/60'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}
      {/* Tea Selection Section */}
      <div className="space-y-3">
        {/* 1. Generic Archetypes */}
        {activeCategoryTab === 'generic' ? (
          filteredGenericTeas.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-2xl border border-stone-200 space-y-2">
              <p className="text-xs text-stone-500 font-medium">По выбранному состоянию архетипов не найдено</p>
              <button
                type="button"
                onClick={() => setSelectedEffectFilter('all')}
                className="text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
              >
                Сбросить фильтр состояний
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 min-w-0">
              {customBlendTea && (
                <button
                  key={customBlendTea.id}
                  id={`tea-generic-${customBlendTea.id}`}
                  onClick={() => handleTeaChange(customBlendTea)}
                  className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between min-w-0 cursor-pointer col-span-2 ${
                    customBlendTea.id === selectedTeaId
                      ? 'bg-amber-800 text-white border-amber-800 shadow-xs ring-2 ring-amber-700/20'
                      : 'bg-amber-50/80 hover:bg-amber-100/70 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                    <Sparkles className="w-3 h-3" />
                    <span>Созданный купаж</span>
                  </div>
                  <span className="text-xs font-bold break-words leading-tight line-clamp-1 block mt-0.5">
                    {customBlendTea.nameRu}
                  </span>
                  <span className={`text-[10px] mt-1 font-serif italic truncate block ${
                    customBlendTea.id === selectedTeaId ? 'text-amber-200' : 'text-stone-500'
                  }`}>
                    {customBlendTea.optimalTemp}°C • 1:{Math.round(customBlendTea.defaultVolume / customBlendTea.defaultMass)}
                  </span>
                </button>
              )}
              {filteredGenericTeas.map((tea) => {
                const isSelected = tea.id === selectedTeaId;
                return (
                  <button
                    key={tea.id}
                    id={`tea-generic-${tea.id}`}
                    onClick={() => handleTeaChange(tea)}
                    className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between min-w-0 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-800 text-white border-amber-800 shadow-xs ring-2 ring-amber-700/20'
                        : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                    }`}
                  >
                    <span className="text-xs font-bold break-words leading-tight line-clamp-2 block">
                      {tea.nameRu}
                    </span>
                    <span className={`text-[10px] mt-1.5 font-serif italic truncate block ${
                      isSelected ? 'text-amber-200' : 'text-stone-400'
                    }`}>
                      {tea.nameZh}
                    </span>
                  </button>
                );
              })}
            </div>
          )
        ) : activeCategoryTab === 'specific' ? (
          /* 2. Popular Teas (with integrated flavor notes & search) */
          filteredPopularTeas.length === 0 ? (
            popularTypeFilter === 'my_teas' ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-2xs">
                  <Leaf className="w-6 h-6 text-amber-800" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h4 className="text-sm font-bold text-stone-900">
                    В разделе «Мои чаи» пока нет сортов
                  </h4>
                  <p className="text-xs text-stone-500">
                    Добавьте свой чай, заполнив форму. Все необходимые данные для расчётов симулятора (температура, гидромодуль, кинетика экстракции) автоматически подставятся из выбранного архетипа.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCustomTea(null);
                      setIsCustomTeaModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Добавить чай</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-stone-50 text-stone-700 font-semibold text-xs border border-stone-300 shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    title="Загрузить один или несколько сортов из JSON"
                  >
                    <Upload className="w-4 h-4 text-stone-600" />
                    <span>Импортировать из файла</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 space-y-2.5">
                <p className="text-sm font-semibold text-stone-800">По вашему запросу сортов не найдено</p>
                <p className="text-xs text-stone-500 max-w-md mx-auto">
                  Попробуйте изменить запрос или сбросить фильтры по типу и нотам букета.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPopularSearchQuery('');
                    setFlavorSearchQuery('');
                    setSelectedFlavorTag(null);
                    setSelectedFlavorGroupId(null);
                    setPopularTypeFilter('all');
                    setSelectedEffectFilter('all');
                  }}
                  className="mt-2 inline-flex items-center text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-amber-800 text-white hover:bg-amber-900 transition-colors shadow-2xs cursor-pointer"
                >
                  Сбросить фильтры
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {popularTypeFilter === 'my_teas' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    id="add-custom-tea-btn"
                    onClick={() => {
                      setEditingCustomTea(null);
                      setIsCustomTeaModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                    title="Добавить чай"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить чай</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                    title="Импортировать один или несколько чаёв из JSON-файла"
                  >
                    <Upload className="w-3.5 h-3.5 text-stone-600" />
                    <span>Импорт</span>
                  </button>

                  {customTeas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const defaultName = appSettings.customTeasExportFilename || 'my_teas.json';
                        setExportFilenameInput(defaultName);
                        setSelectedExportTeaIds(customTeas.map((t) => t.id));
                        setIsExportModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                      title="Выбрать сорта и экспортировать свои чаи в JSON-файл"
                    >
                      <Download className="w-3.5 h-3.5 text-stone-600" />
                      <span>Экспорт ({customTeas.length})</span>
                    </button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2.5">
                {visiblePopularTeas.map(({ tea, matchedNotes }) => {
                  const isSelected = tea.id === selectedTeaId;
                  const isFav = favoriteIds.includes(tea.id);
                  const activeSearchNote = (flavorSearchQuery || selectedFlavorTag || popularSearchQuery).toLowerCase().trim();

                  return (
                    <div
                      key={tea.id}
                      id={`tea-select-${tea.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTeaChange(tea)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleTeaChange(tea);
                        }
                      }}
                      className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between select-none cursor-pointer shadow-2xs min-w-0 relative group ${
                        isSelected
                          ? 'bg-amber-800 text-white border-amber-800 shadow-xs ring-2 ring-amber-700/20'
                          : 'bg-white hover:bg-amber-50/40 border-stone-200 text-stone-800'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 w-full">
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`font-semibold truncate ${isSelected ? 'text-amber-200' : 'text-amber-800'}`}>
                              {tea.typeNameRu}
                            </span>
                            {tea.isCustom && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                                isSelected ? 'bg-stone-200/90 text-stone-900 border border-stone-300' : 'bg-stone-100 text-stone-600 border border-stone-200'
                              }`}>
                                Мой сорт
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            {tea.isCustom && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCustomTea(tea);
                                    setIsCustomTeaModalOpen(true);
                                  }}
                                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                                    isSelected ? 'text-amber-200 hover:text-white hover:bg-amber-700/60' : 'text-stone-400 hover:text-amber-800 hover:bg-stone-100'
                                  }`}
                                  title="Редактировать параметры чая"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTeaPendingDelete(tea);
                                  }}
                                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                                    isSelected ? 'text-amber-300 hover:text-rose-200 hover:bg-amber-700/60' : 'text-stone-400 hover:text-rose-700 hover:bg-stone-100'
                                  }`}
                                  title="Удалить свой сорт"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <span className={`font-serif italic text-[10px] ${isSelected ? 'text-amber-200' : 'text-stone-400'}`}>
                              {tea.nameZh}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => toggleFavorite(tea.id, canTeaAge(tea) ? selectedVintageYear : undefined, e)}
                              className={`p-1 -mr-1 rounded-md transition-colors cursor-pointer ${
                                isFav
                                  ? 'text-amber-400 hover:text-amber-500'
                                  : isSelected
                                  ? 'text-amber-300/60 hover:text-amber-200'
                                  : 'text-stone-300 hover:text-amber-500 opacity-80 group-hover:opacity-100'
                              }`}
                              title={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
                            >
                              <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <div className={`text-xs sm:text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-stone-900'}`} title={tea.nameRu}>
                          {cleanTeaTitleForDisplay(tea.nameRu, canTeaAge(tea))}
                        </div>

                        {/* Sensory Notes Badges */}
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {(matchedNotes && matchedNotes.length > 0 ? matchedNotes : tea.keySensoryNotes || []).slice(0, 3).map((note, nIdx) => {
                            const isHighlighted = activeSearchNote && note.toLowerCase().includes(activeSearchNote);
                            return (
                              <span
                                key={nIdx}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-colors ${
                                  isSelected
                                    ? 'bg-amber-900/80 text-amber-100 border border-amber-700/60'
                                    : isHighlighted
                                    ? 'bg-amber-100 text-amber-950 border border-amber-300 font-semibold'
                                    : 'bg-stone-100 text-stone-700 border border-stone-200'
                                }`}
                              >
                                {note}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className={`flex items-center justify-between gap-1 mt-2.5 pt-1.5 border-t text-[10px] ${
                        isSelected ? 'border-amber-700/50 text-amber-200' : 'border-stone-100 text-stone-500'
                      }`}>
                        <span className="truncate">{tea.origin.split(',')[0]}</span>
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTeaChange(tea);
                              const el = document.getElementById('brewing-parameters-section');
                              if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs ${
                              isSelected
                                ? 'bg-amber-100 text-amber-950 hover:bg-white border border-amber-300'
                                : 'bg-amber-800 text-white hover:bg-amber-900'
                            }`}
                            title="Перейти к настройке параметров заваривания"
                          >
                            <span>Перейти к чаю</span>
                            <ArrowDown className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredPopularTeas.length > visiblePopularTeas.length && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 pb-1 border-t border-stone-200 text-xs text-stone-600">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-700">
                      Показано {visiblePopularTeas.length} из {filteredPopularTeas.length} сортов
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPopularDisplayLimit((prev) => prev + 10)}
                      className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium transition-colors cursor-pointer text-xs"
                    >
                      Показать ещё (+10)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPopularDisplayLimit(filteredPopularTeas.length)}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-medium transition-colors cursor-pointer text-xs shadow-2xs"
                    >
                      Показать все ({filteredPopularTeas.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        ) : activeCategoryTab === 'favorites' ? (
          /* 3. Favorites Tab */
          filteredFavoriteTeas.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Star className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-sm font-bold text-stone-900">
                  {favoriteIds.length === 0 ? 'Список избранного пуст' : 'Ничего не найдено в избранном'}
                </h4>
                <p className="text-xs text-stone-500">
                  {favoriteIds.length === 0
                    ? 'Нажмите на иконку звёздочки на любой карточке чая в «Популярных чаях», чтобы добавить сорт в личную коллекцию.'
                    : 'Попробуйте изменить поисковый запрос или сбросить фильтр по типу чая.'}
                </p>
              </div>
              {favoriteIds.length === 0 ? (
                <button
                  type="button"
                  onClick={() => handleCategoryTabChange('specific')}
                  className="px-4 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                >
                  Перейти к популярным чаям
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFavoritesSearchQuery('');
                    setFavoritesTypeFilter('all');
                    setSelectedEffectFilter('all');
                  }}
                  className="text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
                >
                  Сбросить фильтры поиска
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-end text-xs text-stone-500">
                <button
                  type="button"
                  onClick={clearAllFavorites}
                  className="text-stone-400 hover:text-red-600 underline font-medium transition-colors cursor-pointer text-[11px]"
                >
                  Очистить список избранного
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredFavoriteTeas.map((tea) => {
                const isSelected = tea.id === selectedTeaId;
                const teaEff = getTeaEffect(tea);
                return (
                  <div
                    key={tea.id}
                    id={`tea-fav-${tea.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTeaChange(tea)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleTeaChange(tea);
                      }
                    }}
                    className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between select-none cursor-pointer shadow-2xs min-w-0 relative group ${
                      isSelected
                        ? 'bg-amber-800 text-white border-amber-800 shadow-xs ring-2 ring-amber-700/20'
                        : 'bg-white hover:bg-amber-50/40 border-stone-200 text-stone-800'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0 w-full">
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className={`font-semibold truncate ${isSelected ? 'text-amber-200' : 'text-amber-800'}`}>
                          {tea.typeNameRu}
                        </span>
                        <div className="flex items-center space-x-1 shrink-0">
                          <span className={`font-serif italic text-[10px] ${isSelected ? 'text-amber-200' : 'text-stone-400'}`}>
                            {tea.nameZh}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(tea.id, undefined, e)}
                            className="p-1 -mr-1 rounded-md text-amber-400 hover:text-amber-500 transition-colors cursor-pointer"
                            title="Удалить из избранного"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                          </button>
                        </div>
                      </div>

                      <div className={`text-xs sm:text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-stone-900'}`} title={tea.nameRu}>
                        {cleanTeaTitleForDisplay(tea.nameRu, canTeaAge(tea))}
                      </div>

                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {(tea.keySensoryNotes || []).slice(0, 3).map((note, nIdx) => (
                          <span
                            key={nIdx}
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                              isSelected
                                ? 'bg-amber-900/80 text-amber-100 border border-amber-700/60'
                                : 'bg-stone-100 text-stone-700 border border-stone-200'
                            }`}
                          >
                            {note}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className={`flex items-center justify-between gap-1 mt-2.5 pt-1.5 border-t text-[10px] ${
                      isSelected ? 'border-amber-700/50 text-amber-200' : 'border-stone-100 text-stone-500'
                    }`}>
                      <span className="truncate">{tea.origin.split(',')[0]}</span>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTeaChange(tea);
                            const el = document.getElementById('brewing-parameters-section');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs ${
                            isSelected
                              ? 'bg-amber-100 text-amber-950 hover:bg-white border border-amber-300'
                              : 'bg-amber-800 text-white hover:bg-amber-900'
                          }`}
                          title="Перейти к настройке параметров заваривания"
                        >
                          <span>Перейти к чаю</span>
                          <ArrowDown className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )
        ) : (
          /* 4. Tea Blending Studio */
          <TeaBlendStudio 
            allTeaMap={ALL_TEA_MAP} 
            onApplyBlend={handleApplyBlend} 
            onLogBlendToJournal={(sessionData) => {
              if (onOpenJournal) {
                onOpenJournal(sessionData);
              }
            }}
          />
        )}
      </div>

      {/* Selected Tea Info Card and Main Simulator Controls (Shown for Archetypes, Popular Teas & non-empty Favorites) */}
      {activeCategoryTab !== 'blend' && (activeCategoryTab !== 'favorites' || favoriteIds.length > 0) && (
        <>
          {/* Selected Tea Info Card with Plain-Language Leaf Morphology */}
          <div id="brewing-parameters-section" className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row gap-6 items-start min-w-0 max-w-full overflow-hidden">
        <div className="flex-1 space-y-3 min-w-0 max-w-full">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-stone-900 font-serif break-words">
              {cleanTeaTitleForDisplay(selectedTea.nameRu, canTeaAge(selectedTea))} {selectedTea.nameZh && `(${selectedTea.nameZh})`}
            </h3>

            {/* Favorite toggle button for selected tea (only non-generic) */}
            {!isTeaArchetype(selectedTea) && (
              <button
                type="button"
                onClick={() => toggleFavorite(selectedTea.id, canTeaAge(selectedTea) ? selectedVintageYear : undefined)}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold border transition-all cursor-pointer ${
                  favoriteIds.includes(selectedTea.id)
                    ? 'bg-amber-100 text-amber-950 border-amber-300 shadow-2xs'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                }`}
                title={favoriteIds.includes(selectedTea.id) ? 'Удалить сорт из избранного' : 'Добавить сорт в избранное'}
              >
                <Star className={`w-3.5 h-3.5 ${favoriteIds.includes(selectedTea.id) ? 'text-amber-500 fill-amber-400' : 'text-stone-400'}`} />
                <span>
                  {favoriteIds.includes(selectedTea.id)
                    ? `В избранном ${canTeaAge(selectedTea) && favoriteEntries.find((f) => f.id === selectedTea.id)?.vintageYear ? `(${favoriteEntries.find((f) => f.id === selectedTea.id)?.vintageYear}г)` : ''}`
                    : 'В избранное'}
                </span>
              </button>
            )}

            <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 font-medium max-w-full break-words">
              {selectedTea.origin}
            </span>
            {appSettings.advancedMode && (
              <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-medium max-w-full break-words">
                Ферментация: {selectedTea.oxidationLevel}
              </span>
            )}
            {selectedTea.categoryGroup === 'generic' && (
              <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium shrink-0">
                Общий архетип
              </span>
            )}
            {selectedTea.categoryGroup === 'blend' && (
              <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200 font-medium shrink-0">
                Авторский купаж
              </span>
            )}
            {/* Effect Badge */}
            {(() => {
              const currentEff = getTeaEffect(selectedTea);
              return (
                <span 
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-950 border border-amber-300 font-medium cursor-help"
                  title={currentEff.bioMechanismRu}
                >
                  <span className="font-semibold">{currentEff.nameRu}</span>
                </span>
              );
            })()}
            {/* Rinse Status Badge */}
            <span 
              className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium ${
                teaRinseInfo.required
                  ? 'bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs'
                  : 'bg-stone-100 text-stone-700 border border-stone-300 shadow-2xs'
              }`}
              title={teaRinseInfo.required ? `Нулевой пролив: ${teaRinseInfo.seconds}с • ${teaRinseInfo.badgeRu}` : 'Прямой 1-й пролив без промывки'}
            >
              <strong className="font-semibold">
                {teaRinseInfo.required ? 'Нулевой пролив' : 'Без нулевого пролива'}
              </strong>
            </span>
          </div>

          {/* Interactive Vintage Year Selector (Only for teas that can be aged; hidden for generic archetypes, blends, and teas that cannot age) */}
          {/* Interactive Vintage Year Selector (Expandable Dropdown in the same style as other dropdowns) */}
          {!isTeaArchetype(selectedTea) && selectedTea.categoryGroup !== 'blend' && canTeaAge(selectedTea) && (
            <div className="space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-200 w-full animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  Год сбора / Выдержка:
                </span>
                <span className="text-xs font-bold text-amber-950 bg-amber-100/90 px-2 py-0.5 rounded-lg border border-amber-300/80 shadow-2xs font-mono">
                  {currentYear - selectedVintageYear === 0 ? (
                    'Свежий сбор'
                  ) : (
                    `${currentYear - selectedVintageYear} ${getRussianYearWord(currentYear - selectedVintageYear)}`
                  )}
                </span>
              </div>

              {/* Dropdown Trigger Box */}
              <div className="relative">
                <button
                  type="button"
                  id="vintage-year-dropdown-btn"
                  onClick={() => {
                    setIsVintageDropdownOpen(!isVintageDropdownOpen);
                    setIsGoalDropdownOpen(false);
                    setIsVesselDropdownOpen(false);
                  }}
                  className="w-full p-2.5 sm:p-3 bg-white rounded-xl border-2 border-stone-200 hover:border-amber-700/60 focus:outline-hidden focus:ring-2 focus:ring-amber-800/30 text-left transition-all flex items-center justify-between shadow-2xs gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-stone-900 truncate">
                      {selectedVintageYear} год сбора {selectedVintageYear === currentYear ? '(Свежий)' : ''}
                    </div>
                    <div className="text-xs text-stone-500 truncate mt-0.5">
                      {getVintageSubtitle(selectedTea.type, currentYear - selectedVintageYear)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0 text-stone-400">
                    <span className="text-xs hidden sm:inline text-stone-500">
                      {isVintageDropdownOpen ? 'Свернуть' : 'Выбрать год'}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isVintageDropdownOpen ? 'rotate-180 text-amber-800' : ''}`} />
                  </div>
                </button>

                {/* Expandable Dropdown Menu List */}
                {isVintageDropdownOpen && (
                  <div className="mt-1.5 bg-white rounded-xl border border-stone-200 shadow-xl p-1.5 space-y-1 z-30 animate-in fade-in slide-in-from-top-1 duration-150 max-h-72 sm:max-h-80 overflow-y-auto">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider px-2 py-1">
                      Выберите год сбора урожая:
                    </div>

                    {Array.from({ length: 51 }, (_, i) => currentYear - i).map((yr) => {
                      const isSelected = selectedVintageYear === yr;
                      const age = currentYear - yr;

                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            setSelectedVintageYear(yr);
                            setIsVintageDropdownOpen(false);
                          }}
                          className={`w-full p-2.5 rounded-lg text-left text-xs transition-all flex items-start justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-amber-50 border border-amber-300 text-amber-950 font-medium shadow-2xs'
                              : 'hover:bg-stone-50 text-stone-700 border border-transparent'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-xs text-stone-900 font-mono">
                                {yr} год
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-stone-500 leading-relaxed">
                              {getVintageDescription(selectedTea.type, age)}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0 text-xs">
                            <span className={`px-1.5 py-0.5 rounded border font-medium ${
                              age === 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-stone-100 text-stone-700 border-stone-200 font-mono'
                            }`}>
                              {age === 0 ? 'Свежий сбор' : `${age} ${getRussianYearWord(age)}`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Note under the trigger aligned with other dropdowns */}
              <p className="text-xs text-stone-500 leading-relaxed pt-0.5">
                {getVintageDescription(selectedTea.type, currentYear - selectedVintageYear)}
              </p>
            </div>
          )}


          {/* Selected Tea History */}
          <div className="text-xs sm:text-sm text-stone-700 bg-stone-50/70 p-3 rounded-xl border border-stone-200/80 space-y-1 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-amber-800 shrink-0" />
              <span>История сорта:</span>
            </div>
            <p className="text-stone-700 break-words">
              {selectedTea.scientificDescription}
            </p>
          </div>

          {selectedTea.keySensoryNotes && selectedTea.keySensoryNotes.length > 0 && (
            <div className="text-xs text-stone-800 bg-stone-50/90 p-3 rounded-xl border border-stone-200 space-y-1.5">
              <span className="font-bold text-stone-800 block flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Вкусовые ноты и ароматический букет:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedTea.keySensoryNotes.map((note, nIdx) => (
                  <span key={nIdx} className="bg-white px-2.5 py-1 rounded-md border border-stone-200 text-stone-800 font-medium text-xs shadow-2xs">
                    {note}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedTea.generalExamplesRu && (
            <div className="text-xs text-stone-700 bg-stone-50 p-2.5 rounded-xl border border-stone-200 flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="font-semibold text-stone-900 shrink-0">Подходит для сортов:</span>
              {selectedTea.generalExamplesRu.map((ex, idx) => (
                <span key={idx} className="inline-flex items-center bg-white px-2 py-0.5 rounded-md border border-stone-200 text-stone-800 text-[11px] max-w-full break-words text-left">
                  {ex}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setIsCheatSheetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-stone-300 hover:border-amber-700 bg-white hover:bg-stone-50 text-stone-700 hover:text-amber-950 font-semibold text-xs transition-all shadow-2xs cursor-pointer"
              title="Открыть готовую шпаргалку проливов для сохранения в PDF или копирования"
            >
              <FileText className="w-3.5 h-3.5 text-amber-700" />
              <span>Шпаргалка</span>
            </button>

            {onOpenJournal && (
              <button
                type="button"
                onClick={() => {
                  const vesselName = selectedTea.recommendedVesselRu?.split('(')[0]?.trim() || (brewingMethod === 'grandpa_cup' ? `Кружка / чашка ${waterVolume} мл` : `Гайвань ${waterVolume} мл`);
                  const eff = getTeaEffect(selectedTea);
                  const isDyn = Boolean(appSettings.useDynamicTemperatures);
                  const steepTemps = isDyn ? dynamicTemperatures.steepTempsC : undefined;
                  const steepScheduleText = effectiveDurations.map((s, idx) => {
                    const t = isDyn && steepTemps && steepTemps[idx] ? ` (${steepTemps[idx]}°C)` : '';
                    return `${s}с${t}`;
                  }).join(', ');

                  onOpenJournal({
                    tea: selectedTea,
                    vintageYear: selectedVintageYear,
                    vesselMaterial: vesselMaterial,
                    brewingMethod: brewingMethod,
                    optimizationGoal: optimizationGoal,
                    waterHardness: waterHardness,
                    customRinseTime: customRinseTime,
                    waterTempC: waterTemp,
                    teaMassG: leafMass,
                    waterVolumeMl: waterVolume,
                    steepsCount: steepsCount,
                    steepScheduleSec: effectiveDurations,
                    useDynamicTemperatures: isDyn,
                    steepTemperaturesC: steepTemps,
                    vesselUsed: vesselName,
                    effectNote: eff.nameRu,
                    userNotes: selectedTea.categoryGroup === 'blend'
                      ? `Авторский купаж (${selectedTea.nameRu}): ${isDyn ? 'динамическая t°C' : `${waterTemp}°C`}, ${leafMass}г / ${waterVolume}мл. Проливы: ${steepScheduleText}.`
                      : `Проведено заваривание (${isDyn ? 'динамическая t°C' : `${waterTemp}°C`}, ${leafMass}г на ${waterVolume}мл). Проливы: ${steepScheduleText}.`,
                    tags: selectedTea.categoryGroup === 'blend' ? ['Авторский купаж', 'Гунфу Ча', 'Симулятор'] : ['Гунфу Ча', 'Симулятор']
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 hover:border-amber-700 bg-white hover:bg-stone-50 text-stone-700 hover:text-amber-950 font-semibold text-xs transition-all cursor-pointer"
                title="Зафиксировать результаты заваривания в дневник дегустаций"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-700" />
                <span>Записать в дневник</span>
              </button>
            )}

            {onOpenComparison && (
              <button
                type="button"
                onClick={() => onOpenComparison(selectedTea)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 hover:border-sky-700 bg-white hover:bg-stone-50 text-stone-700 hover:text-sky-950 font-semibold text-xs transition-all cursor-pointer"
                title="Сравнить характеристики этого сорта с другим чаем"
              >
                <ScaleIcon className="w-3.5 h-3.5 text-sky-700" />
                <span>Сравнить сорт</span>
              </button>
            )}
          </div>
        </div>

        {/* Right side box: Vessel and Plain-Language Morphology explanation */}
        <div className="w-full lg:w-84 max-w-full bg-stone-50/90 border border-stone-200 rounded-xl p-4 text-xs space-y-3 shrink-0 min-w-0 overflow-hidden">
          <div className="space-y-1 min-w-0">
            <div className="font-semibold text-stone-900 flex items-center space-x-1.5 min-w-0">
              <Award className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="break-words">Рекомендованная посуда:</span>
            </div>
            <p className="text-stone-600 leading-relaxed break-words">
              {selectedTea.recommendedVesselRu}
            </p>
          </div>

          {/* Simple Leaf Morphology Explanation */}
          <div className="pt-2.5 border-t border-stone-200/80 space-y-1.5 min-w-0">
            <div className="flex items-center space-x-1.5 text-stone-900 font-bold min-w-0">
              <Feather className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="break-words">Форма листа: {morphologyInfo.title}</span>
            </div>
            <p className="text-stone-600 leading-relaxed text-[11px] break-words">
              {morphologyInfo.simpleDesc}
            </p>
            <div className="text-[11px] text-stone-700 bg-stone-100/90 p-2.5 rounded-lg border border-stone-200 font-medium break-words min-w-0">
              <strong className="text-stone-900">Рекомендации:</strong> {morphologyInfo.userTip}
            </div>
          </div>
        </div>
      </div>

      {/* Main Controls & Simulation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Unified Brewing Parameters & Scientific Optimizer (4 cols) */}
        <div className="lg:col-span-4 space-y-5 bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-amber-700/10 text-amber-800 flex items-center justify-center shrink-0">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm leading-tight flex items-center space-x-1.5">
                  <span>Оптимизатор параметров</span>
                </h4>
                <div className="text-[11px] text-stone-500">
                  {fixedCount === 0 
                    ? 'Все параметры свободны (авто-расчёт)' 
                    : `Зафиксировано: ${fixedCount} из 4`}
                </div>
              </div>
            </div>

            <button
              id="reset-params-btn"
              onClick={resetToOptimized}
              className="text-xs text-amber-800 hover:text-amber-950 px-2 py-1 rounded-lg hover:bg-amber-50 flex items-center space-x-1 font-medium transition-colors"
              title="Сбросить все параметры к эталонным значениям"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сброс параметров</span>
            </button>
          </div>

          {/* Brewing Method Selector (Gongfu Cha vs Liu Gen Pao / Оставление корня) */}
          {appSettings.showBrewingMethod && (
            <div className="space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-700" />
                  <span>Метод заваривания:</span>
                </span>
                <span className="text-[10px] font-mono text-stone-500">
                  {brewingMethod === 'liu_gen'
                    ? 'Лю Гэнь (留根法)'
                    : brewingMethod === 'grandpa_cup'
                    ? 'Ленивый метод (杯泡法)'
                    : 'Гунфу Ча (功夫茶)'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-lg border border-stone-200">
                <button
                  type="button"
                  id="brewing-method-gongfu"
                  onClick={() => {
                    setBrewingMethod('gongfu');
                    setCustomSteepTemps([]);
                  }}
                  className={`py-1.5 px-1.5 rounded-md text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    brewingMethod === 'gongfu'
                      ? 'bg-amber-800 text-white shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span>Гунфу Ча</span>
                  <span className={`text-[9px] font-normal ${brewingMethod === 'gongfu' ? 'text-amber-100' : 'text-stone-400'}`}>
                    100% слив
                  </span>
                </button>

                <button
                  type="button"
                  id="brewing-method-liu-gen"
                  onClick={() => {
                    setBrewingMethod('liu_gen');
                    setCustomSteepTemps([]);
                  }}
                  className={`py-1.5 px-1.5 rounded-md text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    brewingMethod === 'liu_gen'
                      ? 'bg-amber-800 text-white shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span>Оставление корня</span>
                  <span className={`text-[9px] font-normal ${brewingMethod === 'liu_gen' ? 'text-amber-100' : 'text-stone-400'}`}>
                    Лю Гэнь (остаток)
                  </span>
                </button>

                <button
                  type="button"
                  id="brewing-method-grandpa-cup"
                  onClick={() => {
                    setBrewingMethod('grandpa_cup');
                    setCustomSteepTemps([]);
                    if (!fixVolume && waterVolume < 200) {
                      setFixedVolumeVal(250);
                    }
                    if (!fixMass && leafMass > 5) {
                      setFixedMassVal(3.8);
                    }
                    if (!fixSteeps) {
                      setFixedSteepsVal(4);
                    }
                  }}
                  className={`py-1.5 px-1.5 rounded-md text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    brewingMethod === 'grandpa_cup'
                      ? 'bg-amber-800 text-white shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span>«Ленивый» метод</span>
                  <span className={`text-[9px] font-normal ${brewingMethod === 'grandpa_cup' ? 'text-amber-100' : 'text-stone-400'}`}>
                    Бэй Пао Фа (杯泡法)
                  </span>
                </button>
              </div>

              {/* Selection of leftover fraction in the vessel for Grandpa Cup and Liu Gen */}
              {(brewingMethod === 'liu_gen' || brewingMethod === 'grandpa_cup') && (
                <div className="pt-2 border-t border-stone-200/70 space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-700 font-semibold">Доля остатка в сосуде:</span>
                    <span className="font-mono font-bold text-amber-900">
                      {Math.round(rootFraction * 100)}% ({Math.round(waterVolume * rootFraction)} мл)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    {[
                      { label: '1/4 (25%)', val: 0.25, tip: 'Лёгкий' },
                      { label: '1/3 (33%)', val: 0.333, tip: 'Канон' },
                      { label: '1/2 (50%)', val: 0.5, tip: 'Плотный' }
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setRootFraction(preset.val)}
                        className={`py-1.5 px-1.5 rounded-lg border font-mono text-center transition-all cursor-pointer ${
                          Math.abs(rootFraction - preset.val) < 0.05
                            ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold shadow-2xs'
                            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <div>{preset.label}</div>
                        <div className="text-[9px] text-stone-400 font-sans">{preset.tip}</div>
                      </button>
                    ))}
                  </div>

                  {/* Real-time liquid volume breakdown */}
                  <div className="bg-amber-50/70 rounded-lg p-2 border border-amber-200/80 text-[11px] text-amber-950 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Остаток в сосуде:</span>
                      <span className="font-mono font-bold text-amber-900">{Math.round(waterVolume * rootFraction)} мл</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Долив горячей воды:</span>
                      <span className="font-mono font-bold text-stone-900">+{Math.round(waterVolume * (1 - rootFraction))} мл</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Target Profile / Goal Preset Selector: Expandable Dropdown */}
          {appSettings.showGoalAndMethod && (
            <div className="space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>Метод пролива:</span>
                </span>
              </div>

              {/* Dropdown Trigger Box */}
              <div className="relative">
                {(() => {
                  const currentPreset = OPTIMIZATION_PRESETS.find(p => p.id === optimizationGoal) || OPTIMIZATION_PRESETS[0];
                  return (
                    <button
                      type="button"
                      id="optimization-goal-dropdown-btn"
                      onClick={() => {
                        setIsGoalDropdownOpen(!isGoalDropdownOpen);
                        setIsVesselDropdownOpen(false);
                        setIsVintageDropdownOpen(false);
                      }}
                      className="w-full p-2.5 sm:p-3 bg-white rounded-xl border-2 border-stone-200 hover:border-amber-700/60 focus:outline-hidden focus:ring-2 focus:ring-amber-800/30 text-left transition-all flex items-center justify-between shadow-2xs gap-2 cursor-pointer"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-100/70 text-amber-900 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4 text-amber-800" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-stone-900 truncate">
                            {currentPreset.nameRu}
                          </div>
                          {appSettings.advancedMode ? (
                            <div className="text-xs text-stone-500 truncate mt-0.5 font-mono">
                              {currentPreset.tempOffsetC !== 0 
                                ? `Температурный сдвиг: ${currentPreset.tempOffsetC > 0 ? '+' : ''}${currentPreset.tempOffsetC}°C` 
                                : 'Температурный сдвиг: 0°C (базовый)'}
                            </div>
                          ) : (
                            <div className="text-xs text-stone-500 truncate mt-0.5">
                              {currentPreset.descriptionRu}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0 text-stone-400">
                        <span className="text-xs hidden sm:inline text-stone-500">
                          {isGoalDropdownOpen ? 'Свернуть' : 'Выбрать метод'}
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isGoalDropdownOpen ? 'rotate-180 text-amber-800' : ''}`} />
                      </div>
                    </button>
                  );
                })()}

                {/* Expandable Dropdown Menu List */}
                {isGoalDropdownOpen && (
                  <div className="mt-1.5 bg-white rounded-xl border border-stone-200 shadow-xl p-1.5 space-y-1 z-30 animate-in fade-in slide-in-from-top-1 duration-150 max-h-72 sm:max-h-80 overflow-y-auto">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider px-2 py-1">
                      Варианты метода:
                    </div>

                    {OPTIMIZATION_PRESETS.slice().sort((a, b) => {
                      const aEligible = !a.allowedTeaTypes || a.allowedTeaTypes.includes(selectedTea.type);
                      const bEligible = !b.allowedTeaTypes || b.allowedTeaTypes.includes(selectedTea.type);
                      if (aEligible && !bEligible) return -1;
                      if (!aEligible && bEligible) return 1;
                      return 0;
                    }).map((preset) => {
                      const isSelected = optimizationGoal === preset.id;
                      const isEligible = !preset.allowedTeaTypes || preset.allowedTeaTypes.includes(selectedTea.type);

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          disabled={!isEligible}
                          onClick={() => {
                            if (isEligible) {
                              setOptimizationGoal(preset.id as OptimizationGoal);
                              setCustomSteepTemps([]);
                              setIsGoalDropdownOpen(false);
                            }
                          }}
                          className={`w-full p-2.5 rounded-lg text-left text-xs transition-all flex items-start justify-between gap-2 cursor-pointer ${
                            !isEligible
                              ? 'opacity-40 cursor-not-allowed bg-stone-50 text-stone-400'
                              : isSelected
                              ? 'bg-amber-50 border border-amber-300 text-amber-950 font-medium shadow-2xs'
                              : 'hover:bg-stone-50 text-stone-700 border border-transparent'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-xs text-stone-900 break-words">
                                {preset.nameRu}
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-stone-500 leading-relaxed">
                              {preset.descriptionRu}
                              {!isEligible && (
                                <span className="block text-amber-800 font-semibold mt-0.5">
                                  {preset.id === 'white_debitter'
                                    ? '(Доступно для Белых чаёв и Шэнов)'
                                    : '(Доступно только для Шу Пуэров и Хэй Ча)'}
                                </span>
                              )}
                            </p>
                          </div>

                          {appSettings.advancedMode && preset.tempOffsetC !== 0 && (
                            <div className="flex flex-col items-end gap-1 shrink-0 text-xs font-mono">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${preset.tempOffsetC > 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                                {preset.tempOffsetC > 0 ? `+${preset.tempOffsetC}` : preset.tempOffsetC}°C
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-xs text-stone-500 leading-relaxed pt-0.5">
                {OPTIMIZATION_PRESETS.find(p => p.id === optimizationGoal)?.descriptionRu}
              </p>

              {appSettings.advancedMode && (OPTIMIZATION_PRESETS.find(p => p.id === optimizationGoal)?.tempOffsetC ?? 0) !== 0 && (
                <div className="text-xs text-stone-600 bg-stone-100/90 p-2 rounded-lg border border-stone-200/80 flex items-center gap-1.5 mt-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>
                    Коррекция температуры: <strong>{(OPTIMIZATION_PRESETS.find(p => p.id === optimizationGoal)?.tempOffsetC ?? 0) > 0 ? `+${OPTIMIZATION_PRESETS.find(p => p.id === optimizationGoal)?.tempOffsetC}` : OPTIMIZATION_PRESETS.find(p => p.id === optimizationGoal)?.tempOffsetC}°C</strong> к базовой температуре чая.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 4 Interactive Parameters with Lock / Free switches */}
          <div className="space-y-3.5">
            {/* 1. Water Volume */}
            <div className={`p-3 rounded-xl border transition-all ${
              fixVolume ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-400/20' : 'bg-stone-50/70 border-stone-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="water-volume-input" className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Droplet className="w-3.5 h-3.5 text-blue-600" />
                  <span>{brewingMethod === 'grandpa_cup' ? 'Объём чашки / стакана (мл)' : 'Объём сосуда (мл)'}</span>
                </label>
                <button
                  type="button"
                  id="toggle-fix-volume-btn"
                  onClick={() => {
                    if (!fixVolume) setFixedVolumeVal(waterVolume);
                    setFixVolume(!fixVolume);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
                    fixVolume 
                      ? 'bg-amber-700 text-white shadow-xs' 
                      : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                  title={fixVolume ? 'Зафиксирован: значение задано вами' : 'Свободен: вычисляется алгоритмом'}
                >
                  {fixVolume ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-stone-500" />}
                  <span>{fixVolume ? 'Зафиксирован' : 'Авто'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    id="water-volume-input"
                    type="number"
                    step="5"
                    min="40"
                    max="500"
                    placeholder={String(selectedTea.defaultVolume)}
                    value={rawVolumeStr !== null ? rawVolumeStr : waterVolume}
                    onChange={(e) => {
                      setRawVolumeStr(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setFixVolume(true);
                        setFixedVolumeVal(val);
                      }
                    }}
                    onBlur={() => {
                      if (rawVolumeStr === null) return;
                      const trimmed = rawVolumeStr.trim();
                      if (trimmed === '' || isNaN(parseFloat(trimmed)) || parseFloat(trimmed) <= 0) {
                        // User cleared input -> reset to optimal recommended default volume
                        setFixedVolumeVal(selectedTea.defaultVolume);
                        setFixVolume(true);
                      } else {
                        const clamped = Math.max(40, Math.min(500, Math.round(parseFloat(trimmed))));
                        setFixedVolumeVal(clamped);
                        setFixVolume(true);
                      }
                      setRawVolumeStr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={`w-24 h-8 text-center font-mono font-bold text-sm rounded border ${
                      fixVolume 
                        ? 'bg-white text-stone-900 border-amber-400 ring-1 ring-amber-300' 
                        : 'bg-stone-100 text-stone-700 border-stone-300'
                    }`}
                  />
                  <span className="text-xs text-stone-500 font-semibold">мл</span>
                  <div className="flex-1 text-[11px] text-right font-mono text-stone-500">
                    {fixVolume ? 'Фикс. объём' : 'Рассчитан по массе'}
                  </div>
                </div>

                <input
                  id="water-volume-slider"
                  type="range"
                  min="40"
                  max="500"
                  step="5"
                  value={Math.min(500, Math.max(40, waterVolume))}
                  onChange={(e) => {
                    setRawVolumeStr(null);
                    setFixVolume(true);
                    setFixedVolumeVal(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />

                <div className="flex flex-wrap gap-1 text-[10px]">
                  {[80, 100, 110, 120, 150, 180, 200].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setRawVolumeStr(null);
                        setFixVolume(true);
                        setFixedVolumeVal(v);
                      }}
                      className={`px-1.5 py-0.5 rounded font-mono border ${
                        waterVolume === v && fixVolume
                          ? 'bg-amber-800 text-white border-amber-800 font-bold'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Leaf Mass */}
            <div className={`p-3 rounded-xl border transition-all ${
              fixMass ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-400/20' : 'bg-stone-50/70 border-stone-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="leaf-mass-input" className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Scale className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Масса листа (г)</span>
                </label>
                <button
                  type="button"
                  id="toggle-fix-mass-btn"
                  onClick={() => {
                    setRawMassStr(null);
                    if (!fixMass) setFixedMassVal(leafMass);
                    setFixMass(!fixMass);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
                    fixMass 
                      ? 'bg-amber-700 text-white shadow-xs' 
                      : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                  title={fixMass ? 'Зафиксирована: задана вами' : 'Свободна: вычисляется из гидромодуля'}
                >
                  {fixMass ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-stone-500" />}
                  <span>{fixMass ? 'Зафиксирована' : 'Авто'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    id="leaf-mass-input"
                    type="number"
                    step="0.5"
                    min="1"
                    max="25"
                    placeholder={String(selectedTea.defaultMass)}
                    value={rawMassStr !== null ? rawMassStr : leafMass}
                    onChange={(e) => {
                      setRawMassStr(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        setFixMass(true);
                        setFixedMassVal(val);
                      }
                    }}
                    onBlur={() => {
                      if (rawMassStr === null) return;
                      const trimmed = rawMassStr.trim();
                      if (trimmed === '' || isNaN(parseFloat(trimmed)) || parseFloat(trimmed) <= 0) {
                        // User cleared input -> reset to optimal recommended leaf mass
                        setFixedMassVal(selectedTea.defaultMass);
                        setFixMass(true);
                      } else {
                        const clamped = Math.max(1, Math.min(25, Math.round(parseFloat(trimmed) * 10) / 10));
                        setFixedMassVal(clamped);
                        setFixMass(true);
                      }
                      setRawMassStr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className={`w-24 h-8 text-center font-mono font-bold text-sm rounded border ${
                      fixMass 
                        ? 'bg-white text-stone-900 border-amber-400 ring-1 ring-amber-300' 
                        : 'bg-stone-100 text-stone-700 border-stone-300'
                    }`}
                  />
                  <span className="text-xs text-stone-500 font-semibold">г</span>
                  <div className="flex-1 text-[11px] text-right font-mono text-stone-500">
                    {fixMass ? 'Фикс. порция' : 'Рассчитана по объёму'}
                  </div>
                </div>

                <input
                  id="leaf-mass-slider"
                  type="range"
                  min="1"
                  max="25"
                  step="0.5"
                  value={Math.min(25, Math.max(1, leafMass))}
                  onChange={(e) => {
                    setRawMassStr(null);
                    setFixMass(true);
                    setFixedMassVal(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />

                <div className="flex flex-wrap gap-1 text-[10px]">
                  {[3, 4, 5, 6, 7, 7.5, 8, 10].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setRawMassStr(null);
                        setFixMass(true);
                        setFixedMassVal(m);
                      }}
                      className={`px-1.5 py-0.5 rounded font-mono border ${
                        leafMass === m && fixMass
                          ? 'bg-amber-800 text-white border-amber-800 font-bold'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {m}г
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Blend Component Mass Breakdown */}
              {selectedTea.blendComponents && selectedTea.blendComponents.length > 0 && (
                <div className="mt-2.5 bg-purple-50/90 border border-purple-200/90 rounded-xl p-2.5 text-xs space-y-2 shadow-2xs w-full overflow-hidden">
                  <div className="font-bold text-purple-950 flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>состав купажа (всего {leafMass} г):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTea.blendComponents.map((comp, cIdx) => {
                      const scaledMass = Math.round(leafMass * comp.ratioFraction * 10) / 10;
                      const percent = Math.round(comp.ratioFraction * 100);
                      return (
                        <div key={cIdx} className="bg-white border border-purple-200 px-2.5 py-1.5 rounded-lg text-purple-950 font-medium text-xs shadow-2xs flex items-center gap-1.5">
                          <span className="font-bold text-stone-900">{comp.teaNameRu}:</span>
                          <span className="font-mono font-black text-purple-900 bg-purple-100/70 px-1.5 py-0.5 rounded">{scaledMass} г</span>
                          <span className="text-[11px] text-stone-500 font-mono">({percent}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Гидромодуль: Соотношение чая и воды — отображается только в расширенном режиме */}
            {appSettings.advancedMode && (
              <div className="p-3 bg-stone-50/90 rounded-xl border border-stone-200 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Scale className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                    <span className="text-xs font-bold text-stone-800 truncate">
                      Гидромодуль
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono font-bold text-xs bg-white text-stone-900 px-2.5 py-0.5 rounded-lg border border-stone-200 shadow-2xs">
                      1 : {ratio}
                    </span>
                  </div>
                </div>

                {/* Текущее соотношение */}
                <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs">
                  <span className="text-stone-600 font-medium">Текущее соотношение:</span>
                  <span className="font-bold text-stone-900 font-mono">
                    {leafMass} г на {waterVolume} мл
                  </span>
                </div>
              </div>
            )}

            {/* 3. Water Temperature: Dynamic Mode or Static Slider */}
            {appSettings.useDynamicTemperatures ? (
              <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-bold text-xs text-stone-800">
                    <Thermometer className="w-3.5 h-3.5 text-amber-700" />
                    <span>Динамическая температура</span>
                  </div>
                  {customTempsCount > 0 && (
                    <span className="text-[10px] font-mono font-bold text-amber-900 bg-stone-200 px-2 py-0.5 rounded-full border border-stone-300">
                      Своя t° ({customTempsCount})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Температура автоматически выставляется для каждого отдельного пролива.
                </p>
                {customTempsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllCustomTemps}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-700" />
                    <span>Сбросить t°C к авто-профилю</span>
                  </button>
                )}
              </div>
            ) : (
              <div className={`p-3 rounded-xl border transition-all ${
                fixTemp ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-400/20' : 'bg-stone-50/70 border-stone-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="water-temp-input" className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                    <Flame className="w-3.5 h-3.5 text-red-600" />
                    <span>Температура воды (°C)</span>
                  </label>
                  <button
                    type="button"
                    id="toggle-fix-temp-btn"
                    onClick={() => {
                      setRawTempStr(null);
                      if (!fixTemp) setFixedTempVal(waterTemp);
                      setFixTemp(!fixTemp);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
                      fixTemp 
                        ? 'bg-amber-700 text-white shadow-xs' 
                        : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                    }`}
                    title={fixTemp ? 'Зафиксирована: задана вручную' : 'Оптимум: рекомендована для данного сорта'}
                  >
                    {fixTemp ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-stone-500" />}
                    <span>{fixTemp ? 'Зафиксирована' : 'Авто'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <input
                        id="water-temp-input"
                        type="number"
                        step="1"
                        min="60"
                        max="100"
                        placeholder={String(selectedTea.optimalTemp)}
                        value={rawTempStr !== null ? rawTempStr : waterTemp}
                        onChange={(e) => {
                          setRawTempStr(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setFixTemp(true);
                            setFixedTempVal(val);
                          }
                        }}
                        onBlur={() => {
                          if (rawTempStr === null) return;
                          const trimmed = rawTempStr.trim();
                          if (trimmed === '' || isNaN(parseFloat(trimmed)) || parseFloat(trimmed) <= 0) {
                            // User cleared input -> reset to optimal recommended temperature
                            setFixedTempVal(selectedTea.optimalTemp);
                            setFixTemp(true);
                          } else {
                            const clamped = Math.max(60, Math.min(100, Math.round(parseFloat(trimmed))));
                            setFixedTempVal(clamped);
                            setFixTemp(true);
                          }
                          setRawTempStr(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className={`w-20 h-8 text-center font-mono font-bold text-base rounded border ${
                          fixTemp
                            ? 'bg-white text-stone-900 border-amber-400 ring-1 ring-amber-300'
                            : 'bg-stone-100 text-stone-700 border-stone-300'
                        }`}
                      />
                      <span className="text-xs font-semibold text-stone-600">°C</span>
                    </div>
                    <span className="text-[11px] text-stone-500">
                      Оптимум сорта: <strong className="text-stone-700">{selectedTea.optimalTemp}°C</strong>
                    </span>
                  </div>

                  <input
                    id="water-temp-slider"
                    type="range"
                    min="60"
                    max="100"
                    step="1"
                    value={waterTemp}
                    onChange={(e) => {
                      setRawTempStr(null);
                      setFixTemp(true);
                      setFixedTempVal(Number(e.target.value));
                    }}
                    className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                  />

                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {[75, 80, 85, 90, 95, 100].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setRawTempStr(null);
                          setFixTemp(true);
                          setFixedTempVal(t);
                        }}
                        className={`px-1.5 py-0.5 rounded font-mono border ${
                          waterTemp === t && fixTemp
                            ? 'bg-amber-800 text-white border-amber-800 font-bold'
                            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {t}°C
                      </button>
                    ))}
                  </div>

                  {appSettings.advancedMode && (
                    <>
                      {waterTemp < selectedTea.tempRange[0] && (
                        <div className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-start space-x-1.5">
                          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                          <span>Температура ниже оптимума. Тайминг проливов автоматически продлён.</span>
                        </div>
                      )}
                      {waterTemp > selectedTea.tempRange[1] && (
                        <div className="text-xs text-rose-800 bg-rose-50 p-2 rounded-lg border border-rose-200 flex items-start space-x-1.5">
                          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                          <span>Выше оптимума! Ускорен выход вяжущих танинов EGCG.</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 4. Steep Count */}
            <div className={`p-3 rounded-xl border transition-all ${
              fixSteeps ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-400/20' : 'bg-stone-50/70 border-stone-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="steeps-count-input" className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Hash className="w-3.5 h-3.5 text-amber-800" />
                  <span>{brewingMethod === 'grandpa_cup' ? 'Циклы / Доливы в чашку' : 'Количество проливов'}</span>
                </label>
                <button
                  type="button"
                  id="toggle-fix-steeps-btn"
                  onClick={() => {
                    setRawSteepsStr(null);
                    if (!fixSteeps) setFixedSteepsVal(steepsCount);
                    setFixSteeps(!fixSteeps);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center space-x-1 transition-all ${
                    fixSteeps 
                      ? 'bg-amber-700 text-white shadow-xs' 
                      : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                  }`}
                  title={fixSteeps ? 'Зафиксировано: задано вами' : 'Авто: рассчитано по ресурсу листа'}
                >
                  {fixSteeps ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-stone-500" />}
                  <span>{fixSteeps ? 'Зафиксировано' : 'Авто'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      id="steep-decrement-btn"
                      onClick={() => {
                        setRawSteepsStr(null);
                        setFixSteeps(true);
                        setFixedSteepsVal(Math.max(1, steepsCount - 1));
                      }}
                      className="w-7 h-7 rounded bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold flex items-center justify-center transition-colors"
                    >
                      -
                    </button>
                    <input
                      id="steeps-count-input"
                      type="number"
                      min="1"
                      max="30"
                      placeholder={String(selectedTea.recommendedSteeps || 8)}
                      value={rawSteepsStr !== null ? rawSteepsStr : steepsCount}
                      onChange={(e) => {
                        setRawSteepsStr(e.target.value);
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1) {
                          setFixSteeps(true);
                          setFixedSteepsVal(val);
                        }
                      }}
                      onBlur={() => {
                        if (rawSteepsStr === null) return;
                        const trimmed = rawSteepsStr.trim();
                        if (trimmed === '' || isNaN(parseInt(trimmed, 10)) || parseInt(trimmed, 10) <= 0) {
                          // User cleared input -> reset to optimal recommended steep count
                          setFixedSteepsVal(selectedTea.recommendedSteeps || 8);
                          setFixSteeps(true);
                        } else {
                          const clamped = Math.max(1, Math.min(30, parseInt(trimmed, 10)));
                          setFixedSteepsVal(clamped);
                          setFixSteeps(true);
                        }
                        setRawSteepsStr(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={`w-16 h-7 text-center font-bold text-sm rounded border font-mono ${
                        fixSteeps
                          ? 'bg-white text-stone-900 border-amber-400 ring-1 ring-amber-300'
                          : 'bg-stone-100 text-stone-700 border-stone-300'
                      }`}
                    />
                    <button
                      type="button"
                      id="steep-increment-btn"
                      onClick={() => {
                        setRawSteepsStr(null);
                        setFixSteeps(true);
                        setFixedSteepsVal(Math.min(30, steepsCount + 1));
                      }}
                      className="w-7 h-7 rounded bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-[11px] text-stone-500 font-mono">
                    {fixSteeps ? 'Фиксировано' : `Ресурс сорта (~${selectedTea.recommendedSteeps || 8})`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 text-[10px]">
                  {(brewingMethod === 'grandpa_cup' ? [2, 3, 4, 5, 6] : [5, 8, 10, 12, 15, 20]).map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setRawSteepsStr(null);
                        setFixSteeps(true);
                        setFixedSteepsVal(num);
                      }}
                      className={`px-2 py-0.5 rounded font-mono border ${
                        steepsCount === num && fixSteeps
                          ? 'bg-amber-800 text-white border-amber-800 font-bold'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                <Waves className="w-3.5 h-3.5 text-blue-600" />
                <span>Минерализация воды:</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {WATER_HARDNESS_PRESETS.map((preset) => (
                <button
                  key={preset.level}
                  type="button"
                  onClick={() => setWaterHardness(preset.level)}
                  className={`p-2 rounded-lg text-left text-xs border transition-all ${
                    waterHardness === preset.level
                      ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <div className="text-[11px] leading-tight truncate">{preset.nameRu.split('(')[0]}</div>
                  {appSettings.advancedMode && (
                    <div className="text-[10px] text-stone-400 font-mono mt-0.5">{preset.tdsPpmRange}</div>
                  )}
                </button>
              ))}
            </div>
            {appSettings.advancedMode ? (
              <p className="text-[11px] text-stone-500 italic">
                {WATER_HARDNESS_PRESETS.find(h => h.level === waterHardness)?.scientificImpactRu}
              </p>
            ) : (
              <p className="text-[11px] text-stone-500">
                {waterHardness === 'soft' && 'Мягкая вода — настой чистый, легкий и сладкий.'}
                {waterHardness === 'optimal' && 'Оптимальная вода — гармоничный баланс вкуса и аромата.'}
                {waterHardness === 'hard' && 'Жесткая вода — может приглушать аромат и сладость.'}
              </p>
            )}
          </div>

          {/* Vessel Material: Expandable Dropdown Selector */}
          <div className="space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-700" />
                <span>Материал посуды:</span>
              </span>
            </div>

            {/* Dropdown Trigger Box */}
            <div className="relative">
              <button
                type="button"
                id="vessel-material-dropdown-btn"
                onClick={() => {
                  setIsVesselDropdownOpen(!isVesselDropdownOpen);
                  setIsGoalDropdownOpen(false);
                  setIsVintageDropdownOpen(false);
                }}
                className="w-full p-2.5 sm:p-3 bg-white rounded-xl border-2 border-stone-200 hover:border-amber-700/60 focus:outline-hidden focus:ring-2 focus:ring-amber-800/30 text-left transition-all flex items-center justify-between shadow-2xs gap-2 cursor-pointer"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-100/70 text-amber-900 flex items-center justify-center shrink-0">
                    <Coffee className="w-4 h-4 text-amber-800" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-stone-900 truncate">
                      {VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.nameRu}
                    </div>
                    {appSettings.advancedMode ? (
                      <div className="text-xs text-stone-500 flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                        <span className="bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded text-xs">
                          ΔT: -{VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.heatLossPerSteepC}°C
                        </span>
                        {(VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.tanninAdsorptionFactor || 0) > 0 && (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded text-xs">
                            -{Math.round((VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.tanninAdsorptionFactor || 0) * 100)}% танинов
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-stone-500 truncate mt-0.5">
                        {VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.bestForRu}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0 text-stone-400">
                  <span className="text-xs hidden sm:inline text-stone-500">
                    {isVesselDropdownOpen ? 'Свернуть' : 'Выбрать материал'}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isVesselDropdownOpen ? 'rotate-180 text-amber-800' : ''}`} />
                </div>
              </button>

              {/* Expandable Dropdown Menu List */}
              {isVesselDropdownOpen && (
                <div className="mt-1.5 bg-white rounded-xl border border-stone-200 shadow-xl p-1.5 space-y-1 z-30 animate-in fade-in slide-in-from-top-1 duration-150 max-h-72 sm:max-h-80 overflow-y-auto">
                  <div className="text-xs font-bold text-stone-400 uppercase tracking-wider px-2 py-1">
                    Выберите тип чайника / гайвани:
                  </div>

                  {VESSEL_MATERIALS.map((vessel) => {
                    const isSelected = vesselMaterial === vessel.id;
                    return (
                      <button
                        key={vessel.id}
                        type="button"
                        onClick={() => {
                          setVesselMaterial(vessel.id);
                          setIsVesselDropdownOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-lg text-left text-xs transition-all flex items-start justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-amber-50 border border-amber-300 text-amber-950 font-medium shadow-2xs'
                            : 'hover:bg-stone-50 text-stone-700 border border-transparent'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-xs text-stone-900 break-words">
                              {vessel.nameRu}
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-stone-500 leading-relaxed">
                            {appSettings.advancedMode ? vessel.scientificImpactRu : vessel.bestForRu}
                          </p>
                        </div>

                        {appSettings.advancedMode && (
                          <div className="flex flex-col items-end gap-1 shrink-0 text-xs font-mono">
                            <span className="bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">
                              ΔT: -{vessel.heatLossPerSteepC}°C
                            </span>
                            {vessel.tanninAdsorptionFactor > 0 ? (
                              <span className="bg-emerald-100/70 text-emerald-800 px-1.5 py-0.5 rounded font-semibold">
                                -{Math.round(vessel.tanninAdsorptionFactor * 100)}% танинов
                              </span>
                            ) : vessel.id === 'metal_silver' ? (
                              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                Ag⁺ ионы
                              </span>
                            ) : vessel.id === 'cast_iron' ? (
                              <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                                Теплоёмкость
                              </span>
                            ) : (
                              <span className="text-stone-400">Нейтрально</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-stone-500 leading-relaxed pt-0.5">
              {appSettings.advancedMode
                ? VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.scientificImpactRu
                : VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.bestForRu}
            </p>

            {appSettings.advancedMode && (
              <div className="text-xs text-stone-600 bg-stone-100/90 p-2 rounded-lg border border-stone-200/80 flex flex-wrap items-center gap-1.5 mt-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>
                  Потери тепла: <strong>-{VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.heatLossPerSteepC}°C</strong> за пролив
                  {(VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.tanninAdsorptionFactor || 0) > 0 && (
                    <span className="ml-1 text-emerald-800 font-semibold">
                      • Поглощение танинов порами: -{Math.round((VESSEL_MATERIALS.find(v => v.id === vesselMaterial)?.tanninAdsorptionFactor || 0) * 100)}%
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Окно «Корректность» */}
          <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-3.5">
            {/* Header with Score */}
            <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
              <div className="flex items-center space-x-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  activeOptimization.diagnostics.overallStatusType === 'optimal'
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeOptimization.diagnostics.overallStatusType === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {activeOptimization.diagnostics.overallStatusType === 'optimal' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : activeOptimization.diagnostics.overallStatusType === 'warning' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <ShieldAlert className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-stone-900 truncate">
                    Корректность
                  </h5>
                  <span className={`text-[10px] font-semibold block truncate ${
                    activeOptimization.diagnostics.overallStatusType === 'optimal'
                      ? 'text-emerald-700'
                      : activeOptimization.diagnostics.overallStatusType === 'warning'
                      ? 'text-amber-800'
                      : 'text-rose-700'
                  }`}>
                    {activeOptimization.diagnostics.overallStatusRu}
                  </span>
                </div>
              </div>

              {/* Quality Score Badge */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-stone-400 font-medium">Оценка:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded-full text-xs ${
                  activeOptimization.diagnostics.overallScorePercent >= 85
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeOptimization.diagnostics.overallScorePercent >= 70
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-rose-100 text-rose-900'
                }`}>
                  {activeOptimization.diagnostics.overallScorePercent}%
                </span>
              </div>
            </div>

            {/* Diagnostic Checks Accordion / Item List - Collapsible, hidden by default */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIsChecksExpanded(!isChecksExpanded)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-stone-50 hover:bg-stone-100/80 border border-stone-200 transition-colors cursor-pointer text-left select-none text-xs font-bold text-stone-800 shadow-2xs"
                aria-expanded={isChecksExpanded}
              >
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-stone-600" />
                  <span>Анализ заваривания</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${isChecksExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isChecksExpanded && (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  {activeOptimization.diagnostics.checks.map((check) => (
                    <div
                      key={check.id}
                      className={`p-2.5 rounded-lg border text-xs space-y-1 transition-all ${
                        check.status === 'optimal'
                          ? 'bg-emerald-50/40 border-emerald-200/60'
                          : check.status === 'warning'
                          ? 'bg-amber-50/60 border-amber-200'
                          : 'bg-rose-50/70 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-stone-900 text-[11px] flex items-center gap-1.5">
                          {check.status === 'optimal' ? (
                            <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : check.status === 'warning' ? (
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                          )}
                          <span>{check.titleRu}</span>
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                          check.status === 'optimal'
                            ? 'bg-emerald-100 text-emerald-800'
                            : check.status === 'warning'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}>
                          {check.status === 'optimal' ? 'Оптимум' : check.status === 'warning' ? 'Внимание' : 'Сбой'}
                        </span>
                      </div>

                      <div className="text-[11px] text-stone-600 leading-snug">
                        {check.descriptionRu}
                      </div>

                      {check.recommendationRu && (
                        <div className="text-[11px] font-medium text-amber-950 bg-amber-100/50 p-1.5 rounded border border-amber-200/50 mt-1">
                          💡 {check.recommendationRu}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Practical Flavor Improvement Recommendations - Collapsible, hidden by default */}
            {activeOptimization.diagnostics.flavorImprovementRecommendations.length > 0 && (
              <div className="pt-2 border-t border-stone-100 space-y-2">
                <button
                  type="button"
                  onClick={() => setIsRecommendationsExpanded(!isRecommendationsExpanded)}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200 transition-colors cursor-pointer text-left select-none text-xs font-bold text-amber-950 shadow-2xs"
                  aria-expanded={isRecommendationsExpanded}
                >
                  <span className="flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Рекомендации по улучшению вкуса ({activeOptimization.diagnostics.flavorImprovementRecommendations.length})</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-amber-800 transition-transform duration-200 ${isRecommendationsExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isRecommendationsExpanded && (
                  <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                    {activeOptimization.diagnostics.flavorImprovementRecommendations.map((rec, rIdx) => (
                      <div
                        key={rIdx}
                        className="text-[11px] text-stone-700 bg-amber-50/60 border border-amber-200/70 p-2 rounded-lg leading-relaxed flex items-start gap-1.5"
                      >
                        <span className="text-amber-800 font-bold shrink-0">•</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cumulative Totals according to ISO 9768 (Advanced Mode) */}
          {appSettings.advancedMode && (
            <div className="pt-2 border-t border-stone-100 text-xs space-y-2 text-stone-600">
              <div className="flex justify-between">
                <span>Суммарный выход экстракта (ISO 9768):</span>
                <span className="font-mono font-bold text-amber-900">{lastSteepYield}% от сухой массы</span>
              </div>
              <div className="flex justify-between">
                <span>Суммарно извлечено кофеина:</span>
                <span className="font-mono font-bold text-stone-900">{totalCaffeineExtracted} мг</span>
              </div>
              <div className="flex justify-between">
                <span>Суммарно извлечено L-теанина:</span>
                <span className="font-mono font-bold text-emerald-800">{totalTheanineExtracted} мг</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: 1. UNIFIED STEEPS + CUP DEEP DIVE WINDOW -> 2. KINETIC CURVES AT VERY BOTTOM */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. SINGLE UNIFIED CARD: STEEPS, TIMINGS & DETAILED CHEMICAL PROFILE */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
            {/* Window Top Header & Steeps Selector */}
            <div className="space-y-4 border-b border-stone-100 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
                    <Clock className="w-4 h-4 text-amber-800" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-base font-serif">
                      {brewingMethod === 'grandpa_cup'
                        ? 'Циклы заваривания и доливы воды в чашку'
                        : 'Проливы, тайминги и химический профиль пиалы'}
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      {brewingMethod === 'grandpa_cup'
                        ? '1-й завар (2–3 мин.), затем питьё 2/3 и доливы кипятка при остатке 1/3 настоя'
                        : 'Хронометраж экстракции, концентрация биоактивных веществ и баланс вкуса'}
                    </p>
                  </div>
                </div>

                {/* Header Controls for Custom Steeps */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-xl transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={isManualTimeEditMode}
                      onChange={(e) => {
                        setIsManualTimeEditMode(e.target.checked);
                        if (!e.target.checked) setEditingSteepIndex(null);
                      }}
                      className="rounded border-stone-300 text-amber-800 focus:ring-amber-800 h-3.5 w-3.5 accent-amber-800 cursor-pointer"
                    />
                    <span>Своё время (двойной клик)</span>
                  </label>

                  {((adaptiveCustomBrewing && adaptiveCustomBrewing.userSteepsCount > 0) || customRinseTime !== null) && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-950 bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-xl">
                        Изменено: {(adaptiveCustomBrewing?.userSteepsCount || 0) + (customRinseTime !== null ? 1 : 0)} {customRinseTime !== null ? '(в т.ч. промыв)' : `из ${steepsCount}`}
                      </span>
                      <button
                        type="button"
                        onClick={handleResetAllCustomTimes}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Сбросить всё к эталонам</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status and guidance header when custom times or custom rinse are altered */}
              {adaptiveCustomBrewing && (adaptiveCustomBrewing.userSteepsCount > 0 || Boolean(adaptiveCustomBrewing.rinseStatus)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden text-xs text-amber-950 animate-in fade-in duration-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setIsAdaptiveExpanded(!isAdaptiveExpanded)}
                    className="w-full p-3 font-bold flex items-center justify-between hover:bg-amber-100/70 transition-colors cursor-pointer text-left select-none"
                    aria-expanded={isAdaptiveExpanded}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                      <span className="truncate">Адаптивный перерасчёт проливов (кинетическая модель):</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {adaptiveCustomBrewing.rinseStatus && (
                        <span className="text-[10px] bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded font-mono font-semibold">
                          Промыв: {adaptiveCustomBrewing.rinseStatus.customRinseSec}с ({adaptiveCustomBrewing.rinseStatus.deviationSec > 0 ? '+' : ''}{adaptiveCustomBrewing.rinseStatus.deviationSec}с)
                        </span>
                      )}
                      <ChevronDown className={`w-4 h-4 text-amber-800 transition-transform duration-200 ${isAdaptiveExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isAdaptiveExpanded && (
                    <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-amber-200/60">
                      <p className="text-stone-700 leading-relaxed font-medium pt-1.5">
                        {adaptiveCustomBrewing.summaryMessageRu}
                      </p>
                      <p className="text-[11px] text-stone-500 leading-normal pt-1 border-t border-amber-200/60 font-mono">
                        🔬 {adaptiveCustomBrewing.scientificDetailRu}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Ergonomic Steeps Deck & Bubbles */}
              <div className="pt-0.5">
                <div className="grid gap-2 grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 transition-all">
                  {/* Rinse #0 Bubble if enabled */}
                  {isRinseEnabled && (
                    editingSteepIndex === -1 ? (
                      <div
                        className="group relative min-h-[92px] rounded-xl border p-2 flex flex-col justify-between text-left transition-all shadow-xs ring-2 ring-amber-800 border-amber-800 bg-amber-50/95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className="text-[11px] font-bold font-mono text-amber-950 font-black">
                            #0 ПРОМЫВ
                          </span>
                          <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-800 text-amber-50 px-1 py-0.2 rounded leading-none">
                            ввод
                          </span>
                        </div>

                        <div className="my-0.5 flex items-center justify-center space-x-1 w-full">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoFocus
                            defaultValue={customRinseTime ?? teaRinseInfo.seconds}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const raw = (e.target as HTMLInputElement).value.trim();
                                const parsed = parseInt(raw.replace(/\D/g, ''), 10);
                                if (!isNaN(parsed) && parsed >= 0) {
                                  setCustomRinseTime(Math.min(BREWING_LIMITS.MAX_STEEP_SEC, parsed));
                                } else if (raw === '') {
                                  setCustomRinseTime(null);
                                }
                                setEditingSteepIndex(null);
                              } else if (e.key === 'Escape') {
                                setEditingSteepIndex(null);
                              }
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const parsed = parseInt(raw.replace(/\D/g, ''), 10);
                              if (!isNaN(parsed) && parsed >= 0) {
                                setCustomRinseTime(Math.min(BREWING_LIMITS.MAX_STEEP_SEC, parsed));
                              } else if (raw === '') {
                                setCustomRinseTime(null);
                              }
                              setEditingSteepIndex(null);
                            }}
                            className="w-12 text-center font-mono font-bold text-sm py-0.5 px-1 bg-white border border-amber-500 rounded-md text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-800 shadow-xs"
                          />
                          <span className="text-xs font-mono font-bold text-amber-900/60">
                            с
                          </span>
                        </div>

                        <div className="pt-0.5 border-t border-amber-200/80 text-center flex items-center justify-center leading-none text-[8.5px] text-amber-900 font-semibold w-full">
                          Enter — готово
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        id="steep-bubble-rinse-0"
                        {...rinseLongPressProps}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          setEditingSteepIndex(-1);
                        }}
                        title="Клик для выбора, зажмите для таймера, двойной клик для ввода времени"
                        className={`group relative min-h-[92px] p-2.5 rounded-xl text-left flex flex-col justify-between transition-all select-none cursor-pointer shadow-2xs ${
                          selectedSteepIndex === -1
                            ? 'border-2 border-amber-800 ring-2 ring-amber-800 bg-amber-50/90 text-stone-900 shadow-xs'
                            : customRinseTime !== null
                            ? 'border-transparent bg-amber-50 text-amber-950 hover:bg-amber-100/60'
                            : 'border-transparent bg-white text-stone-700 hover:bg-stone-100/60'
                        }`}
                        style={{
                          borderWidth: selectedSteepIndex === -1 ? '2px' : '0px',
                          borderStyle: 'solid'
                        }}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className={`text-[11px] font-bold font-mono tracking-wider uppercase ${
                            selectedSteepIndex === -1 ? 'text-amber-950 font-black' : customRinseTime !== null ? 'text-amber-950' : 'text-stone-700'
                          }`}>
                            #0 ПРОМЫВ
                          </span>
                          {customRinseTime !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded leading-none bg-amber-800 text-amber-50">
                                ФАКТ
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomRinseTime(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    setCustomRinseTime(null);
                                  }
                                }}
                                className="p-0.5 rounded hover:bg-amber-200/90 text-amber-900 transition-colors cursor-pointer"
                                title="Сбросить время промыва к эталону"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                              </span>
                            </span>
                          ) : null}
                        </div>

                        <div className="my-1 flex items-center justify-center space-x-1">
                          <span className={`font-mono text-base sm:text-lg font-extrabold tracking-tight ${
                            selectedSteepIndex === -1 ? 'text-amber-950 font-black' : customRinseTime !== null ? 'text-amber-950' : 'text-stone-800'
                          }`}>
                            {teaRinseInfo.seconds}
                          </span>
                          <span className="text-xs sm:text-sm font-mono font-bold text-amber-900/70">
                            с
                          </span>
                        </div>

                        {appSettings.useDynamicTemperatures && (
                          <div className="flex items-center justify-center gap-1 mt-0.5">
                            <span className={`text-[10px] font-mono leading-tight flex items-center gap-0.5 ${
                              customRinseTemp !== null
                                ? 'text-rose-700 font-bold'
                                : 'text-stone-600 font-medium'
                            }`}>
                              <Thermometer className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                              <span>{effectiveRinseTemp}°C</span>
                            </span>
                            {customRinseTemp !== null && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomRinseTemp(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    setCustomRinseTemp(null);
                                  }
                                }}
                                className="p-0.5 rounded hover:bg-rose-200 text-rose-900 transition-colors cursor-pointer"
                                title="Сбросить t°C промыва к авто-профилю"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        )}

                        {customRinseTime !== null ? (
                          <div className={`pt-0.5 border-t text-center leading-none text-[9.5px] truncate font-medium ${
                            selectedSteepIndex === -1 ? 'border-amber-200 text-amber-900' : 'border-stone-200 text-stone-400'
                          }`}>
                            эт: {baseTeaRinseInfo.seconds}с
                          </div>
                        ) : (
                          <div className="pt-0.5 min-h-[14px]" />
                        )}
                      </button>
                    )
                  )}

                  {simulationResults.map((d, idx) => {
                    const baselineSec = adaptiveCustomBrewing?.steepStatus[idx]?.baselineSec ?? computedAdaptiveDurations[idx] ?? 10;
                    const statusObj = adaptiveCustomBrewing?.steepStatus[idx];
                    const userVal = customSteepTimes[idx];

                    return (
                      <SteepBubbleCard
                        key={d.steepNumber}
                        idx={idx}
                        steepNum={d.steepNumber}
                        isSelected={idx === selectedSteepIndex}
                        baselineSec={baselineSec}
                        statusObj={statusObj}
                        userVal={userVal}
                        effectiveSec={d.timeSec}
                        isEditing={editingSteepIndex === idx}
                        isManualModeActive={isManualTimeEditMode}
                        brewingMethod={brewingMethod}
                        rootFraction={rootFraction}
                        waterVolume={waterVolume}
                        useDynamicTemperatures={appSettings.useDynamicTemperatures}
                        steepTempC={d.waterTempC}
                        isCustomTemp={Boolean(d.isCustomTemp)}
                        onSaveTemp={handleSetCustomSteepTemp}
                        onSelect={setSelectedSteepIndex}
                        onDoubleClick={(i) => setEditingSteepIndex(i)}
                        onLongPress={handleOpenTimer}
                        onSaveTime={handleSetCustomSteepTime}
                        onCancelEdit={() => setEditingSteepIndex(null)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Selected Steep Deep-Dive Profile */}
            <div className="space-y-6">
              {isRinseSelected ? (
                /* Dedicated Clean Rinse #0 Header */
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-4">
                    <div 
                      className="w-14 h-14 rounded-full border-4 border-stone-100 shadow-inner flex items-center justify-center relative shrink-0"
                      style={{
                        backgroundColor: getLiquorColor(selectedTea, 0),
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)'
                      }}
                      title="Цвет промывки листа (#0)"
                    >
                      <span className="cup-number-badge text-[10px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-xs font-mono shadow-2xs">
                        #0
                      </span>
                    </div>

                    <div>
                      <h5 className="text-lg font-bold text-stone-900 font-serif flex flex-wrap items-center gap-2">
                        <span>Пролив #0: Промыв листа («Вэнь Жун» / Пробуждение)</span>
                        <span 
                          {...rinseExposureLongPressProps}
                          className={`text-xs px-2.5 py-0.5 rounded-md font-mono font-bold cursor-pointer select-none transition-all hover:ring-2 hover:ring-amber-400 ${
                            customRinseTime !== null
                              ? 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                          }`}
                          title="Экспозиция промыва листа. Нажмите или удерживайте для запуска таймера"
                        >
                          Экспозиция: {teaRinseInfo.seconds} секунд • {teaRinseInfo.tempC}°C
                          {customRinseTime !== null && ' (своё время)'}
                        </span>
                        {customRinseTime !== null && (
                          <button
                            type="button"
                            onClick={() => setCustomRinseTime(null)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 px-2 py-0.5 rounded-md transition-colors cursor-pointer shadow-2xs"
                            title="Сбросить время промыва к эталону"
                          >
                            <RotateCcw className="w-3 h-3 text-amber-700" />
                            <span>Сброс к эталону ({baseTeaRinseInfo.seconds}с)</span>
                          </button>
                        )}
                        <span className="text-xs px-2.5 py-0.5 rounded-md font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          {teaRinseInfo.badgeRu}
                        </span>
                      </h5>

                      {appSettings.advancedMode ? (
                        <p className="text-xs text-stone-700 leading-relaxed font-medium mt-1.5 max-w-xl">
                          {teaRinseInfo.scientificReasonRu}
                        </p>
                      ) : (
                        <p className="text-xs text-stone-600 mt-1.5 max-w-lg">
                          {teaRinseInfo.actionRu}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedSteepIndex(0)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
                  >
                    <span>К питьевому Проливу #1</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-4">
                  {/* Visual Cup Color Rendering */}
                  <div 
                    className="w-14 h-14 rounded-full border-4 border-stone-100 shadow-inner flex items-center justify-center relative shrink-0"
                    style={{
                      backgroundColor: getLiquorColor(selectedTea, currentSteepData.steepNumber),
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)'
                    }}
                    title={`Цвет настоя на ${currentSteepData.steepNumber}-м проливе`}
                  >
                    <span className="cup-number-badge text-[10px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-xs font-mono shadow-2xs">
                      #{currentSteepData.steepNumber}
                    </span>
                  </div>

                  <div>
                    <h5 className="text-lg font-bold text-stone-900 font-serif flex flex-wrap items-center gap-2">
                      <span>
                        {brewingMethod === 'grandpa_cup'
                          ? (currentSteepData.steepNumber === 1 ? 'Настой #1 (1-й залив в чашку)' : `Долив #${currentSteepData.steepNumber} (свежая вода)`)
                          : `Пролив #${currentSteepData.steepNumber}`}
                      </span>
                      <span 
                        {...exposureLongPressProps}
                        className={`text-xs px-2.5 py-0.5 rounded-md font-mono font-bold cursor-pointer select-none transition-all hover:ring-2 hover:ring-amber-400 ${
                          currentSteepData.isCustomUserTime
                            ? 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                            : currentSteepData.isAdaptedReference
                            ? 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                            : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                        title="Экспозиция пролива. Нажмите или удерживайте для запуска таймера"
                      >
                        Экспозиция: {currentSteepData.timeSec} секунд
                        {currentSteepData.isCustomUserTime && ' (своё время)'}
                        {currentSteepData.isAdaptedReference && ' (адаптировано)'}
                      </span>
                      {currentSteepData.isCustomUserTime && (
                        <button
                          type="button"
                          onClick={() => handleSetCustomSteepTime(selectedSteepIndex, null)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 px-2 py-0.5 rounded-md transition-colors cursor-pointer shadow-2xs"
                          title="Сбросить время этого пролива к эталону"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-700" />
                          <span>Сброс к эталону ({adaptiveCustomBrewing?.steepStatus[selectedSteepIndex]?.baselineSec || computedAdaptiveDurations[selectedSteepIndex] || 10}с)</span>
                        </button>
                      )}
                      {brewingMethod === 'grandpa_cup' && (
                        <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          {currentSteepData.steepNumber === 1 ? 'Залив 100% стакана' : `Остаток корня 1/3 + Долив +${currentSteepData.freshWaterAddedMl || Math.round(waterVolume * 0.67)} мл`}
                        </span>
                      )}
                      {brewingMethod === 'liu_gen' && (
                        <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          {currentSteepData.steepNumber === 1 ? 'Формирование корня' : `Остаток корня ${Math.round(rootFraction * 100)}% + Долив`}
                        </span>
                      )}
                    </h5>

                    {appSettings.advancedMode ? (
                      <div className="space-y-1.5 mt-2 max-w-2xl">
                        {/* Physical-chemical kinetic description */}
                        <p className="text-xs text-stone-700 leading-relaxed font-medium">
                          {currentSteepData.keyNotes}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 mt-2 max-w-xl">
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {getSteepTasteSensations(selectedTea, currentSteepData.steepNumber, isRinseSelected)}
                        </p>
                        {selectedTea.keySensoryNotes && selectedTea.keySensoryNotes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-[11px] text-stone-400">Вкусовые ноты:</span>
                            {selectedTea.keySensoryNotes.slice(0, 3).map((note, idx) => (
                              <span key={idx} className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200 font-medium">
                                {note}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-stone-100 sm:pl-4">
                  <div className="text-xs text-stone-400">Интенсивность аромата</div>
                  <div className="text-xl font-bold font-mono text-amber-700">
                    {currentSteepData.volatilesIntensity} / 100
                  </div>
                </div>
              </div>
            )}

              {/* Liu Gen Method info in steep */}
              {brewingMethod === 'liu_gen' && (
                <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1.5 animate-in fade-in duration-150">
                  <div className="font-bold flex items-center justify-between text-amber-950">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-800" />
                      <span>Оставление корня (Лю Гэнь) • {currentSteepData.steepNumber}-й пролив:</span>
                    </span>
                    <span className="font-mono text-[11px] bg-amber-200/80 px-2 py-0.5 rounded text-amber-950">
                      Остаток = {Math.round(waterVolume * rootFraction)} мл • Долив = {Math.round(waterVolume * (1 - rootFraction))} мл
                    </span>
                  </div>
                  <p className="text-stone-700 text-[11px] leading-relaxed">
                    {currentSteepData.steepNumber === 1
                      ? `Первый пролив формирует чайную основу: вы выпиваете ${Math.round(waterVolume * (1 - rootFraction))} мл, оставляя ${Math.round(waterVolume * rootFraction)} мл в посуде для мягкого перехода ко второму проливу.`
                      : `Оставленный настой смягчает вкус и защищает лист от резкого перепада, сохраняя баланс сладости и мягкости. В пиалу сливается ${Math.round(waterVolume * (1 - rootFraction))} мл готового чая.`}
                  </p>
                </div>
              )}

              {/* Chemical Concentrations in this steep */}
              {appSettings.showChemicalComposition && (
                <>
                  <div className="space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
                        Фракционный состав пиалы:
                      </div>
                      {currentSteepData.tasteHarmonyIndex !== undefined && (
                        <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200">
                          <span className="text-stone-500 font-medium">Индекс гармонии вкуса (THI):</span>
                          <span className={`font-mono font-bold ${
                            currentSteepData.tasteHarmonyIndex >= 0.8
                              ? 'text-emerald-700'
                              : currentSteepData.tasteHarmonyIndex >= 0.5
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}>
                            {currentSteepData.tasteHarmonyIndex}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {currentSteepData.tasteHarmonyIndex >= 0.8 ? '(умами/сладость)' : currentSteepData.tasteHarmonyIndex >= 0.5 ? '(баланс)' : '(терпкость)'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Scientific Metrics Badge Row (TDS, Dry residue, Extraction yield, Exposure, Temp) */}
                    <div className={`grid grid-cols-2 sm:grid-cols-4 ${appSettings.useDynamicTemperatures ? 'lg:grid-cols-5' : ''} gap-3 bg-stone-50/80 p-3.5 rounded-xl border border-stone-200`}>
                      <div>
                        <div className="text-[11px] text-stone-500">TDS (Сухой остаток)</div>
                        <div className="text-base font-bold font-mono text-stone-900 mt-0.5">
                          {currentSteepData.tdsPpm} <span className="text-xs font-normal text-stone-500">ppm (мг/л)</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-500">Выход экстракта (ISO 9768)</div>
                        <div className="text-base font-bold font-mono text-amber-800 mt-0.5">
                          {currentSteepData.cumulativeExtractionYieldPercent}% <span className="text-xs font-normal text-stone-500">листа</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-500">Индекс баланса (Теанин / Танины)</div>
                        <div className="text-base font-bold font-mono text-emerald-800 mt-0.5">
                          {currentSteepData.theanineToCatechinsRatio} <span className="text-xs font-normal text-stone-500">{currentSteepData.theanineToCatechinsRatio > 0.25 ? '(Умами+)' : '(Танины+)'}</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-500">Время экспозиции</div>
                        <div className="text-xl sm:text-2xl font-black font-mono text-amber-900 mt-0.5">
                          {currentSteepData.timeSec} <span className="text-xs font-bold text-stone-500">сек</span>
                        </div>
                      </div>

                      {appSettings.useDynamicTemperatures && (
                        <div>
                          <div className="text-[11px] text-stone-500">Температура воды</div>
                          <div className="text-base font-bold font-mono text-rose-900 mt-0.5 flex items-center gap-1">
                            <Thermometer className="w-3.5 h-3.5 text-rose-600" />
                            <span>{currentSteepData.waterTempC}°C</span>
                            <span className="text-[10px] font-normal text-stone-500">
                              {currentSteepData.isCustomTemp ? '(своя)' : '(авто)'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-stone-500">
                        Концентрация экстрагированных веществ (мг / 100 мл):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                          <div className="text-[11px] text-emerald-800 font-medium">L-Теанин</div>
                          <div className="text-lg font-bold font-mono text-emerald-950 mt-0.5">
                            {currentSteepData.theanineConcentration} <span className="text-xs font-normal">мг</span>
                          </div>
                        </div>

                        <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl">
                          <div className="text-[11px] text-blue-800 font-medium">Кофеин</div>
                          <div className="text-lg font-bold font-mono text-blue-950 mt-0.5">
                            {currentSteepData.caffeineConcentration} <span className="text-xs font-normal">мг</span>
                          </div>
                        </div>

                        <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl">
                          <div className="text-[11px] text-rose-800 font-medium">Катехины</div>
                          <div className="text-lg font-bold font-mono text-rose-950 mt-0.5">
                            {currentSteepData.catechinsConcentration} <span className="text-xs font-normal">мг</span>
                          </div>
                        </div>

                        <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl">
                          <div className="text-[11px] text-purple-800 font-medium">Полисахариды</div>
                          <div className="text-lg font-bold font-mono text-purple-950 mt-0.5">
                            {currentSteepData.polysaccharidesConcentration} <span className="text-xs font-normal">мг</span>
                          </div>
                        </div>
                      </div>
                    </div>


                  </div>

              {/* Sensory Balance Bars */}
              <div className="space-y-3 pt-2 min-w-0">
                <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider break-words">
                  Сенсорный баланс вкуса (шкала органолептической оценки 0 – 10 по GB/T 23776):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 min-w-0">
                  {/* Umami */}
                  <div className="min-w-0">
                    <div className="flex justify-between text-xs mb-1 min-w-0 gap-2">
                      <span className="font-medium text-stone-700 break-words min-w-0">Умами / Сладковатость аминокислот</span>
                      <span className="font-mono font-bold text-emerald-700 shrink-0">{currentSteepData.sensoryScores.umami}</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${(currentSteepData.sensoryScores.umami / 10) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Sweetness */}
                  <div className="min-w-0">
                    <div className="flex justify-between text-xs mb-1 min-w-0 gap-2">
                      <span className="font-medium text-stone-700 break-words min-w-0">Сладость и послевкусие («Хуэй Гань»)</span>
                      <span className="font-mono font-bold text-amber-700 shrink-0">{currentSteepData.sensoryScores.sweetness}</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${(currentSteepData.sensoryScores.sweetness / 10) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Bitterness */}
                  <div className="min-w-0">
                    <div className="flex justify-between text-xs mb-1 min-w-0 gap-2">
                      <span className="font-medium text-stone-700 break-words min-w-0">Горечь (кофеин + окисленные флавоноиды)</span>
                      <span className="font-mono font-bold text-stone-700 shrink-0">{currentSteepData.sensoryScores.bitterness}</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-stone-600 rounded-full transition-all duration-300"
                        style={{ width: `${(currentSteepData.sensoryScores.bitterness / 10) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Astringency */}
                  <div className="min-w-0">
                    <div className="flex justify-between text-xs mb-1 min-w-0 gap-2">
                      <span className="font-medium text-stone-700 break-words min-w-0">Терпкость (вяжущие катехины EGCG)</span>
                      <span className="font-mono font-bold text-rose-700 shrink-0">{currentSteepData.sensoryScores.astringency}</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-300"
                        style={{ width: `${(currentSteepData.sensoryScores.astringency / 10) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Body */}
                  <div className="min-w-0">
                    <div className="flex justify-between text-xs mb-1 min-w-0 gap-2">
                      <span className="font-medium text-stone-700 break-words min-w-0">Тело / Шелковистость («Ча Тан»)</span>
                      <span className="font-mono font-bold text-purple-700 shrink-0">{currentSteepData.sensoryScores.body}</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-300"
                        style={{ width: `${(currentSteepData.sensoryScores.body / 10) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Aroma */}
                  <div className="min-w-0">
                    <div className="flex justify-between text-xs mb-1 min-w-0 gap-2">
                      <span className="font-medium text-stone-700 break-words min-w-0">Ароматическая диффузия («Ча Сян»)</span>
                      <span className="font-mono font-bold text-orange-700 shrink-0">{currentSteepData.sensoryScores.aroma}</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full transition-all duration-300"
                        style={{ width: `${(currentSteepData.sensoryScores.aroma / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

            </div>
          </div>

          {/* 2. KINETIC CURVES VISUALIZATION & ACTION RECOMMENDATIONS */}
          {appSettings.showExtractionChart && (
            <ExtractionCharts
              brewingMethod={brewingMethod}
              steepsCount={steepsCount}
              chartSteepsData={chartSteepsData}
              selectedSteepIndex={selectedSteepIndex}
              onSelectSteepIndex={setSelectedSteepIndex}
              lazyCupTimeline={lazyCupTimeline}
              adaptiveCustomBrewing={adaptiveCustomBrewing}
              showChartTheanine={showChartTheanine}
              setShowChartTheanine={setShowChartTheanine}
              showChartCaffeine={showChartCaffeine}
              setShowChartCaffeine={setShowChartCaffeine}
              showChartCatechins={showChartCatechins}
              setShowChartCatechins={setShowChartCatechins}
              showChartPolysaccharides={showChartPolysaccharides}
              setShowChartPolysaccharides={setShowChartPolysaccharides}
              showChartTemperature={showChartTemperature}
              setShowChartTemperature={setShowChartTemperature}
            />
          )}
        </div>
      </div>
        </>
      )}

      {/* Cheat Sheet Modal for Print / Quick Reference */}
      {isCheatSheetOpen && (
        <TeaCheatSheetModal
          tea={selectedTea}
          waterTemp={waterTemp}
          teaMass={leafMass}
          waterVolume={waterVolume}
          steepsCount={steepsCount}
          steepSchedule={physicalSchedule.durations}
          rinseSeconds={customRinseTime !== null ? customRinseTime : teaRinseInfo.seconds}
          isRinseEnabled={teaRinseInfo.required}
          brewingMethod={brewingMethod}
          vesselMaterial={vesselMaterial}
          vesselUsed={selectedTea.recommendedVesselRu}
          waterHardness={waterHardness}
          vintageYear={selectedVintageYear}
          useDynamicTemperatures={appSettings.useDynamicTemperatures}
          rinseTemperature={effectiveRinseTemp}
          steepTemperatures={dynamicTemperatures.steepTempsC}
          onClose={() => setIsCheatSheetOpen(false)}
        />
      )}

      {/* Interactive Tea Steep Timer Modal & Top Floating Countdown Bar */}
      <SteepTimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        onOpenModal={() => setIsTimerModalOpen(true)}
        targetSeconds={
          timerSteepIndex === -1
            ? (customRinseTime ?? teaRinseInfo.seconds)
            : (simulationResults[timerSteepIndex]?.timeSec ?? computedAdaptiveDurations[timerSteepIndex] ?? 10)
        }
        steepNumber={timerSteepIndex === -1 ? -1 : timerSteepIndex + 1}
        teaName={selectedTea.nameRu}
        totalSteepsCount={steepsCount}
        hasRinse={isRinseEnabled}
        onSelectSteepIndex={(newIdx) => {
          const clamped = isRinseEnabled ? Math.max(-1, newIdx) : Math.max(0, newIdx);
          setTimerSteepIndex(clamped);
          setSelectedSteepIndex(clamped);
        }}
      />

      {/* Custom Tea Creation & Editing Modal */}
      <CustomTeaModal
        isOpen={isCustomTeaModalOpen}
        onClose={() => {
          setIsCustomTeaModalOpen(false);
          setEditingCustomTea(null);
        }}
        onSaveTea={handleSaveCustomTea}
        editingTea={editingCustomTea}
        onDeleteTea={handleDeleteCustomTea}
      />

      {/* Confirmation Modal for deleting custom tea */}
      {teaPendingDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setTeaPendingDelete(null)}
        >
          <div 
            className="bg-white rounded-2xl border border-stone-200 shadow-2xl p-5 max-w-sm w-full space-y-4 text-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-stone-900 leading-tight">Удалить сорт?</h4>
                <p className="text-xs text-stone-500 mt-0.5 truncate">«{teaPendingDelete.nameRu}»</p>
              </div>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Сорт будет удалён из вашей коллекции «Мои чаи». Это действие нельзя отменить.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setTeaPendingDelete(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer border border-stone-200"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteCustomTea(teaPendingDelete.id);
                  setTeaPendingDelete(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-2xs"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for custom teas import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".json,application/json"
        className="hidden"
      />

      {/* Export Custom Teas Modal */}
      {isExportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsExportModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 text-stone-900 flex flex-col max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-900">
                  <Download className="w-5 h-5 text-amber-800" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Экспорт своих сортов</h3>
                  <p className="text-xs text-stone-500">Сохранение коллекции в файл JSON</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {appSettings.promptExportFilename ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Имя экспортируемого файла:
                  </label>
                  <input
                    type="text"
                    value={exportFilenameInput}
                    onChange={(e) => setExportFilenameInput(e.target.value)}
                    placeholder="my_teas.json"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 font-mono text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-800"
                  />
                  <span className="text-[11px] text-stone-400 mt-1 block">
                    Файл будет скачан в формате .json с указанным вами именем.
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-100 text-xs text-stone-600 border border-stone-200">
                  <span>Стандартное имя файла:</span>
                  <span className="font-mono font-semibold text-stone-800">{exportFilenameInput || 'my_teas.json'}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-stone-700">Сорта для экспорта:</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedExportTeaIds.length === customTeas.length) {
                        setSelectedExportTeaIds([]);
                      } else {
                        setSelectedExportTeaIds(customTeas.map((t) => t.id));
                      }
                    }}
                    className="text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
                  >
                    {selectedExportTeaIds.length === customTeas.length ? 'Снять все' : 'Выбрать все'}
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-stone-200 rounded-xl p-2 bg-stone-50">
                  {customTeas.map((t) => {
                    const isChecked = selectedExportTeaIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2.5 p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-amber-100/60 font-semibold text-amber-950' : 'bg-white text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedExportTeaIds(selectedExportTeaIds.filter((id) => id !== t.id));
                            } else {
                              setSelectedExportTeaIds([...selectedExportTeaIds, t.id]);
                            }
                          }}
                          className="rounded text-amber-800 focus:ring-amber-800"
                        />
                        <span className="truncate">{t.nameRu}</span>
                        <span className="text-[10px] text-stone-400 ml-auto shrink-0 font-normal">
                          {t.typeNameRu}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={selectedExportTeaIds.length === 0}
                  onClick={() => {
                    const teasToExport = customTeas.filter((t) => selectedExportTeaIds.includes(t.id));
                    handleExportTeas(teasToExport, exportFilenameInput || 'my_teas.json');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                    selectedExportTeaIds.length > 0
                      ? 'bg-amber-800 hover:bg-amber-900 text-white shadow-2xs'
                      : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Экспортировать ({selectedExportTeaIds.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification for import/export actions */}
      {importNotification && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border bg-white animate-in slide-in-from-bottom-2 duration-200 max-w-sm">
          {importNotification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="text-xs font-semibold text-stone-900">
            {importNotification.message}
          </span>
          <button
            type="button"
            onClick={() => setImportNotification(null)}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 ml-auto shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
