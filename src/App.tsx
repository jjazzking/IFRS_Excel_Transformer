import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, PanelRightClose, Search, Table, X } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { ExplorerPanel } from './components/ExplorerPanel';
import { StandardReader } from './components/StandardReader';
import { SearchResults } from './components/SearchResults';
import { ExcelPreviewGrid } from './components/ExcelPreviewGrid';
import { VbaSnippetModal } from './components/VbaSnippetModal';
import { ImportCustomDbModal } from './components/ImportCustomDbModal';
import { CollapsedRail, PresetSwitch, Splitter } from './components/LayoutControls';
import { useResizableLayout } from './hooks/useResizableLayout';

import { AccountingStandard, ParagraphPart, StandardParagraph, ExportConfig } from './types';
import { ALL_STANDARDS } from './data/standardsData';
import { normalizeStandards } from './data/normalize';
import { buildSearchIndex, searchAll, tokenize } from './utils/search';
import { generateFormattedCells } from './utils/textSplitter';
import { sortParagraphsByStandardAndNumber } from './utils/paragraphSorter';

const DEFAULT_CONFIG: ExportConfig = {
  maxCharsPerLine: 45, // 기본 45자 (실무 조서의 B열 기본 폭에 최적화)
  includeStandardTitle: true, // A1: 기준서명
  includeSectionTitle: true, // 문단제목 행
  sectionTitleLevel: 'both', // 대분류 > 소분류 를 함께 표기
  paragraphNumberFormat: 'raw', // '38' 형태
  theme: 'audit_gray', // 전통 감사조서 스타일
  addBlankLineBetweenParagraphs: false,
  alignNumberToTop: true,
};

// 검색어를 칠 때마다 3,600여 문단을 훑지 않도록 잠깐 기다린다.
const SEARCH_DEBOUNCE_MS = 180;

// part / framework 같은 파생 필드를 채워 둔 기준서. JSON 에는 적지 않아도 된다.
const INITIAL_STANDARDS = normalizeStandards(ALL_STANDARDS);

export default function App() {
  // 기준서 데이터베이스 상태
  const [standards, setStandards] = useState<AccountingStandard[]>(INITIAL_STANDARDS);
  const [selectedStandardId, setSelectedStandardId] = useState<string>(
    INITIAL_STANDARDS[0]?.id ?? ''
  );

  // 조서에 담은 문단들
  const [selectedParagraphs, setSelectedParagraphs] = useState<StandardParagraph[]>([]);

  // 검색 상태 — 입력값과, 디바운스를 거쳐 실제로 검색에 쓰이는 값을 나눠 둔다.
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'all' | 'current'>('all');
  const [centerView, setCenterView] = useState<'reader' | 'results'>('reader');

  // 본문 리더 상태
  const [partFilter, setPartFilter] = useState<ParagraphPart | 'all'>('all');
  const [activeParagraphId, setActiveParagraphId] = useState('');
  const [scrollTarget, setScrollTarget] = useState({ id: '', seq: 0 });

  // 3존 폭·접기 (경계 드래그로 조절하고 브라우저에 기억시킨다)
  const { containerRef, state: layout, dragging, startDrag, resetSide, toggleSide, applyPreset } =
    useResizableLayout();

  const [config, setConfig] = useState<ExportConfig>(DEFAULT_CONFIG);
  const [isVbaModalOpen, setIsVbaModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const currentStandard = useMemo(
    () => standards.find(s => s.id === selectedStandardId) || standards[0],
    [standards, selectedStandardId]
  );

  const searchIndex = useMemo(() => buildSearchIndex(standards), [standards]);

  const searchResult = useMemo(
    () =>
      searchAll(searchIndex, query, {
        standardId: searchScope === 'current' ? currentStandard?.id : undefined,
      }),
    [searchIndex, query, searchScope, currentStandard]
  );

  // 검색 결과에서 본문으로 넘어가도 찾던 말이 계속 강조되도록 토큰을 따로 들고 있는다.
  const highlightTokens = useMemo(() => tokenize(query), [query]);

  const selectedIds = useMemo(
    () => new Set(selectedParagraphs.map(p => p.id)),
    [selectedParagraphs]
  );

  const handleToggleParagraph = useCallback((paragraph: StandardParagraph) => {
    setSelectedParagraphs(prev =>
      prev.some(p => p.id === paragraph.id)
        ? prev.filter(p => p.id !== paragraph.id)
        : [...prev, paragraph]
    );
  }, []);

  const handleSelectAll = useCallback((paragraphs: StandardParagraph[]) => {
    setSelectedParagraphs(prev => {
      const existing = new Set(prev.map(p => p.id));
      return [...prev, ...paragraphs.filter(p => !existing.has(p.id))];
    });
  }, []);

  const handleDeselectAll = useCallback((paragraphIds: string[]) => {
    const remove = new Set(paragraphIds);
    setSelectedParagraphs(prev => prev.filter(p => !remove.has(p.id)));
  }, []);

  const handleRemoveParagraph = useCallback((id: string) => {
    setSelectedParagraphs(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleSortParagraphs = useCallback((direction: 'asc' | 'desc' = 'asc') => {
    setSelectedParagraphs(prev => sortParagraphsByStandardAndNumber(prev, direction));
  }, []);

  const handleClearAll = useCallback(() => setSelectedParagraphs([]), []);

  const handleResetAll = () => {
    setSelectedParagraphs([]);
    setConfig(DEFAULT_CONFIG);
    setQueryInput('');
    setPartFilter('all');
    setCenterView('reader');
  };

  /** 목차·검색 결과에서 특정 문단으로 이동한다. */
  const goToParagraph = useCallback(
    (paragraphId: string, standardId?: string) => {
      if (standardId && standardId !== selectedStandardId) {
        setSelectedStandardId(standardId);
      }
      setPartFilter('all'); // 다른 파트의 문단이면 필터에 가려지지 않도록 푼다
      setCenterView('reader');
      setScrollTarget(prev => ({ id: paragraphId, seq: prev.seq + 1 }));
    },
    [selectedStandardId]
  );

  const handleChangeQuery = (value: string) => {
    setQueryInput(value);
    setCenterView(value.trim() ? 'results' : 'reader');
  };

  const handleImportStandards = (newStandards: AccountingStandard[]) => {
    const normalized = normalizeStandards(newStandards);
    setStandards(normalized);
    if (normalized.length > 0) {
      setSelectedStandardId(normalized[0].id);
      setSelectedParagraphs([]);
      setQueryInput('');
      setCenterView('reader');
    }
  };

  const totalParagraphCount = useMemo(
    () => standards.reduce((acc, s) => acc + s.paragraphs.length, 0),
    [standards]
  );

  // 파일명/헤더에 쓸 대표 기준서 제목 (여러 기준서를 함께 담으면 '외 N건')
  const exportTitle = useMemo(() => {
    const titles = Array.from(
      new Set(selectedParagraphs.map(p => (p.standardTitle || '').trim()).filter(Boolean))
    );
    if (titles.length === 0) return currentStandard ? currentStandard.title : '기준서';
    if (titles.length === 1) return titles[0];
    return `${titles[0]} 외 ${titles.length - 1}건`;
  }, [selectedParagraphs, currentStandard]);

  const formattedCells = useMemo(
    () => generateFormattedCells(currentStandard, selectedParagraphs, config),
    [currentStandard, selectedParagraphs, config]
  );

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans overflow-hidden">
      <Navbar
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenVbaGuide={() => setIsVbaModalOpen(true)}
        onResetAll={handleResetAll}
        standardCount={standards.length}
        totalParagraphs={totalParagraphCount}
      />

      {/* 3존: 좌(기준서·목차) / 중(검색 결과 또는 본문) / 우(조서 + 엑셀 미리보기).
          가운데 경계를 드래그하면 폭이 바뀐다. */}
      <main ref={containerRef} className="flex-1 min-h-0 flex p-3">
        {layout.leftOpen ? (
          <>
            <aside style={{ width: layout.left }} className="shrink-0 min-h-0">
              <ExplorerPanel
                standards={standards}
                currentStandard={currentStandard}
                onSelectStandard={setSelectedStandardId}
                activeParagraphId={activeParagraphId}
                onGoToParagraph={goToParagraph}
                onCollapse={() => toggleSide('left')}
              />
            </aside>
            <Splitter
              label="탐색 패널 폭"
              active={dragging === 'left'}
              onPointerDown={startDrag('left')}
              onDoubleClick={() => resetSide('left')}
            />
          </>
        ) : (
          <>
            <CollapsedRail
              icon={<BookOpen className="w-4 h-4" />}
              label="기준서 · 목차"
              onClick={() => toggleSide('left')}
            />
            <div className="w-3 shrink-0" />
          </>
        )}

        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          {/* 통합 검색 바 */}
          <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-200 shadow-sm px-2.5 py-2 shrink-0">
            <div className="relative flex-1 min-w-[160px] basis-40">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="input-global-search"
                type="text"
                value={queryInput}
                onChange={e => handleChangeQuery(e.target.value)}
                placeholder="찾는 말을 그대로 쓰세요"
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {queryInput && (
                <button
                  onClick={() => handleChangeQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                  title="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 검색 범위 */}
            <div className="flex rounded-lg border border-slate-300 overflow-hidden shrink-0 text-[11px] font-medium">
              {(['all', 'current'] as const).map(scope => (
                <button
                  key={scope}
                  onClick={() => setSearchScope(scope)}
                  className={`px-2 py-1.5 transition cursor-pointer whitespace-nowrap ${
                    searchScope === scope
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {scope === 'all' ? '전체 기준서' : '이 기준서'}
                </button>
              ))}
            </div>

            {query.trim() && (
              <button
                onClick={() => setCenterView(v => (v === 'results' ? 'reader' : 'results'))}
                className="px-2 py-1.5 rounded-lg text-[11px] font-medium border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                {centerView === 'results'
                  ? '본문 보기'
                  : `검색 결과 ${searchResult.totalHits}건`}
              </button>
            )}

            <PresetSwitch onApply={applyPreset} />

            {layout.rightOpen && (
              <button
                onClick={() => toggleSide('right')}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                title="조서 패널 접기"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 검색 결과 또는 본문 */}
          {centerView === 'results' ? (
            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <SearchResults
                result={searchResult}
                query={query}
                selectedIds={selectedIds}
                onToggleParagraph={handleToggleParagraph}
                onOpenParagraph={(standardId, paragraphId) =>
                  goToParagraph(paragraphId, standardId)
                }
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <StandardReader
                standard={currentStandard}
                selectedIds={selectedIds}
                onToggleParagraph={handleToggleParagraph}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                scrollTarget={scrollTarget}
                onActiveParagraphChange={setActiveParagraphId}
                highlightTokens={highlightTokens}
                partFilter={partFilter}
                onChangePartFilter={setPartFilter}
              />
            </div>
          )}
        </section>

        {layout.rightOpen ? (
          <>
            <Splitter
              label="조서 패널 폭"
              active={dragging === 'right'}
              onPointerDown={startDrag('right')}
              onDoubleClick={() => resetSide('right')}
            />
            <aside style={{ width: layout.right }} className="shrink-0 min-h-0">
              <ExcelPreviewGrid
                cells={formattedCells}
                config={config}
                onChangeConfig={setConfig}
                standardTitle={exportTitle}
                selectedParagraphs={selectedParagraphs}
                onRemoveParagraph={handleRemoveParagraph}
                onClearAll={handleClearAll}
                onSortParagraphs={handleSortParagraphs}
              />
            </aside>
          </>
        ) : (
          <>
            <div className="w-3 shrink-0" />
            <CollapsedRail
              icon={<Table className="w-4 h-4" />}
              label="조서 · 엑셀"
              onClick={() => toggleSide('right')}
            />
          </>
        )}
      </main>

      <VbaSnippetModal isOpen={isVbaModalOpen} onClose={() => setIsVbaModalOpen(false)} />
      <ImportCustomDbModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportStandards={handleImportStandards}
      />
    </div>
  );
}
