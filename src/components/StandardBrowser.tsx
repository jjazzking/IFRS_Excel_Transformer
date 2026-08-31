import React, { useState, useMemo } from 'react';
import { Search, CheckSquare, Square, Filter, ChevronRight, CheckCircle2, BookmarkCheck } from 'lucide-react';
import { AccountingStandard, StandardParagraph } from '../types';

interface StandardBrowserProps {
  standards: AccountingStandard[];
  selectedStandardId: string;
  onSelectStandard: (id: string) => void;
  selectedParagraphs: StandardParagraph[];
  onToggleParagraph: (paragraph: StandardParagraph) => void;
  onSelectAllVisible: (paragraphs: StandardParagraph[]) => void;
  onDeselectAllVisible: (paragraphIds: string[]) => void;
}

export const StandardBrowser: React.FC<StandardBrowserProps> = ({
  standards,
  selectedStandardId,
  onSelectStandard,
  selectedParagraphs,
  onToggleParagraph,
  onSelectAllVisible,
  onDeselectAllVisible
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // 현재 선택된 기준서 객체
  const currentStandard = useMemo(() => {
    return standards.find(s => s.id === selectedStandardId) || standards[0];
  }, [standards, selectedStandardId]);

  // 카테고리 목록
  const categories = useMemo(() => {
    const set = new Set(standards.map(s => s.category));
    return ['all', ...Array.from(set)];
  }, [standards]);

  // 카테고리 필터 적용된 기준서 목록
  const filteredStandards = useMemo(() => {
    if (categoryFilter === 'all') return standards;
    return standards.filter(s => s.category === categoryFilter);
  }, [standards, categoryFilter]);

  // 현재 기준서 내에서 검색어로 필터링된 문단 목록
  const filteredParagraphs = useMemo(() => {
    if (!currentStandard) return [];
    if (!searchTerm.trim()) return currentStandard.paragraphs;

    const term = searchTerm.toLowerCase().trim();
    return currentStandard.paragraphs.filter(p => {
      const matchNum = p.number.toLowerCase().includes(term);
      const matchContent = p.content.toLowerCase().includes(term);
      const matchSection = (p.sectionTitle || '').toLowerCase().includes(term);
      const matchSub = (p.subTitle || '').toLowerCase().includes(term);
      const matchKeywords = (p.keywords || []).some(k => k.toLowerCase().includes(term));
      return matchNum || matchContent || matchSection || matchSub || matchKeywords;
    });
  }, [currentStandard, searchTerm]);

  // 선택 여부 빠른 조회용 Set
  const selectedIdsSet = useMemo(() => {
    return new Set(selectedParagraphs.map(p => p.id));
  }, [selectedParagraphs]);

  // 현재 필터된 목록의 전체 선택 여부
  const isAllVisibleSelected = useMemo(() => {
    if (filteredParagraphs.length === 0) return false;
    return filteredParagraphs.every(p => selectedIdsSet.has(p.id));
  }, [filteredParagraphs, selectedIdsSet]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 1. 상단 기준서 선택 및 필터 */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>분류:</span>
            <div className="flex space-x-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded text-xs transition cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-emerald-700 text-white font-medium shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {cat === 'all' ? '전체' : cat}
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            선택된 문단: <strong className="text-emerald-700">{selectedParagraphs.length}개</strong>
          </span>
        </div>

        {/* 기준서 드롭다운 */}
        <div>
          <label htmlFor="select-standard" className="block text-xs font-semibold text-slate-700 mb-1">
            회계기준서 선택
          </label>
          <select
            id="select-standard"
            value={selectedStandardId}
            onChange={(e) => onSelectStandard(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
          >
            {filteredStandards.map(s => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.title} ({s.paragraphs.length}개 문단)
              </option>
            ))}
          </select>
        </div>

        {/* 문단 검색창 */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-paragraph"
            type="text"
            placeholder="문단 번호(예: 31, 38, B34) 또는 조문 키워드 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* 일괄 선택 컨트롤 바 */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs text-slate-600">
          <span>
            검색 결과: <strong>{filteredParagraphs.length}</strong>개 문단
          </span>
          <div className="flex space-x-2">
            <button
              id="btn-toggle-all-visible"
              onClick={() => {
                if (isAllVisibleSelected) {
                  onDeselectAllVisible(filteredParagraphs.map(p => p.id));
                } else {
                  onSelectAllVisible(filteredParagraphs);
                }
              }}
              className="flex items-center space-x-1 text-slate-700 hover:text-emerald-700 font-medium cursor-pointer"
            >
              {isAllVisibleSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>전체 해제</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>현재 목록 전체 선택</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. 문단 카드 목록 스크롤 뷰 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-100">
        {filteredParagraphs.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            검색어와 일치하는 문단이 없습니다.
          </div>
        ) : (
          filteredParagraphs.map((p) => {
            const isSelected = selectedIdsSet.has(p.id);
            return (
              <div
                key={p.id}
                id={`paragraph-card-${p.id}`}
                onClick={() => onToggleParagraph(p)}
                className={`pt-2.5 first:pt-0 p-3 rounded-lg border transition cursor-pointer select-none ${
                  isSelected
                    ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center space-x-2">
                    <div className="pt-0.5">
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                      ) : (
                        <div className="w-4 h-4 rounded border border-slate-300 bg-white" />
                      )}
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                      문단 {p.number}
                    </span>
                    {p.subTitle && (
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">
                        {p.subTitle}
                      </span>
                    )}
                  </div>

                  {p.sectionTitle && (
                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {p.sectionTitle}
                    </span>
                  )}
                </div>

                {/* 본문 미리보기 */}
                <p className="text-xs text-slate-700 leading-relaxed pl-6 line-clamp-3">
                  {p.content}
                </p>

                {/* 키워드 태그 */}
                {p.keywords && p.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pl-6">
                    {p.keywords.map(k => (
                      <span
                        key={k}
                        className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200"
                      >
                        #{k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
