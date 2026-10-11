/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Header, ActiveTab } from './components/Header';
import { TeaVariety, InitialTastingSessionData, InitialBrewParams } from './types';
import { Beaker, ArrowUp } from 'lucide-react';

const ExtractionSimulator = lazy(() => import('./components/ExtractionSimulator').then(m => ({ default: m.ExtractionSimulator })));
const ResearchArticlesView = lazy(() => import('./components/ResearchArticlesView').then(m => ({ default: m.ResearchArticlesView })));
const TeaComparisonView = lazy(() => import('./components/TeaComparisonView').then(m => ({ default: m.TeaComparisonView })));
const TeaTastingJournalView = lazy(() => import('./components/TeaTastingJournalView').then(m => ({ default: m.TeaTastingJournalView })));

const ComponentLoader = () => (
  <div className="flex flex-col items-center justify-center py-20 space-y-3 text-stone-500 animate-pulse">
    <Beaker className="w-8 h-8 text-amber-800 animate-bounce" />
    <span className="text-xs font-semibold text-stone-600 font-serif">Загрузка данных кинетики чая...</span>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Inter-tab transition states
  const [selectedTeaForSimulator, setSelectedTeaForSimulator] = useState<TeaVariety | null>(null);
  const [selectedBrewParamsForSimulator, setSelectedBrewParamsForSimulator] = useState<InitialBrewParams | null>(null);
  const [comparisonTeaAId, setComparisonTeaAId] = useState<string | undefined>(undefined);
  const [journalInitialSession, setJournalInitialSession] = useState<InitialTastingSessionData | null>(null);

  const handleOpenComparison = (tea: TeaVariety) => {
    setComparisonTeaAId(tea.id);
    setActiveTab('compare');
  };

  const handleOpenJournal = (sessionData: InitialTastingSessionData | TeaVariety) => {
    if ('id' in sessionData && 'type' in sessionData) {
      setJournalInitialSession({
        tea: sessionData as TeaVariety,
        waterTempC: (sessionData as TeaVariety).optimalTemp,
        teaMassG: (sessionData as TeaVariety).defaultMass,
        waterVolumeMl: (sessionData as TeaVariety).defaultVolume,
        steepsCount: (sessionData as TeaVariety).recommendedSteeps
      });
    } else {
      setJournalInitialSession(sessionData as InitialTastingSessionData);
    }
    setActiveTab('journal');
  };

  const handleSelectTeaToBrew = (tea: TeaVariety, brewParams?: InitialBrewParams) => {
    setSelectedTeaForSimulator(tea);
    if (brewParams) {
      setSelectedBrewParamsForSimulator(brewParams);
    } else {
      setSelectedBrewParamsForSimulator({
        tea,
        waterTempC: tea.optimalTemp,
        teaMassG: tea.defaultMass,
        waterVolumeMl: tea.defaultVolume,
        steepsCount: tea.recommendedSteeps
      });
    }
    setActiveTab('simulator');
  };

  return (
    <div className="min-h-screen bg-stone-100/70 text-stone-900 flex flex-col font-sans selection:bg-amber-200 selection:text-amber-950">
      {/* Top Header & Navigation - Sticky and always accessible */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Suspense fallback={<ComponentLoader />}>
          <div className={activeTab === 'simulator' ? 'block' : 'hidden'}>
            <ExtractionSimulator 
              initialSelectedTea={selectedTeaForSimulator}
              initialBrewParams={selectedBrewParamsForSimulator}
              onOpenComparison={handleOpenComparison}
              onOpenJournal={handleOpenJournal}
            />
          </div>
          <div className={activeTab === 'compare' ? 'block' : 'hidden'}>
            <TeaComparisonView 
              initialTeaAId={comparisonTeaAId}
              onSelectTeaToBrew={handleSelectTeaToBrew}
            />
          </div>
          <div className={activeTab === 'journal' ? 'block' : 'hidden'}>
            <TeaTastingJournalView 
              initialSessionData={journalInitialSession}
              onSelectTeaToBrew={handleSelectTeaToBrew}
            />
          </div>
          <div className={activeTab === 'research' ? 'block' : 'hidden'}>
            <ResearchArticlesView />
          </div>
        </Suspense>
      </main>

      {/* Scientific Footer */}
      <footer className="border-t border-stone-200 bg-stone-50 py-8 text-stone-500 text-xs mt-12 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <span className="font-serif font-bold text-stone-800">
              Gongfu Cha Lab
            </span>
            <span className="hidden sm:inline-block ml-2 text-stone-400">
              • Расчет кинетики экстракции чая
            </span>
          </div>

          <div className="text-center md:text-right text-stone-400">
            Данные и расчёты основаны на исследованиях: <span className="text-stone-600">Food Chemistry, JAFC, LWT, CAAS (2019–2024)</span> и стандартах <span className="text-stone-600">GB/T 23776 / ISO 9768</span>
          </div>
        </div>
      </footer>

      {/* Floating Scroll-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3.5 bg-amber-900/90 hover:bg-amber-950 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 flex items-center justify-center cursor-pointer border border-amber-700/30 backdrop-blur-xs group"
          title="Наверх"
          aria-label="Перейти наверх страницы"
        >
          <ArrowUp className="w-5 h-5 group-hover:animate-pulse" />
        </button>
      )}
    </div>
  );
}
