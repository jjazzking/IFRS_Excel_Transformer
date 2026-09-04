import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, ListTree, PanelLeftClose, Search } from 'lucide-react';
import { AccountingStandard } from '../types';
import { TocNode, buildToc, nodeKeysForParagraph, rangeLabel } from '../utils/toc';

interface ExplorerPanelProps {
  standards: AccountingStandard[];
  currentStandard?: AccountingStandard;
  onSelectStandard: (id: string) => void;
  /** 본문 리더가 지금 보고 있는 문단 (목차에서 현재 위치를 강조) */
  activeParagraphId: string;
  onGoToParagraph: (paragraphId: string) => void;
  /** 이 패널을 접는다 */
  onCollapse: () => void;
}

type Tab = 'standards' | 'toc';

export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({
  standards,
  currentStandard,
  onSelectStandard,
  activeParagraphId,
  onGoToParagraph,
  onCollapse,
}) => {
  const [tab, setTab] = useState<Tab>('standards');
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(standards.map(s => s.category)))],
    [standards]
  );

  const visibleStandards = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return standards.filter(s => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (!term) return true;
      return (
        (s.number || '').includes(term) ||
        s.code.toLowerCase().includes(term) ||
        s.title.toLowerCase().includes(term)
      );
    });
  }, [standards, filter, categoryFilter]);

  const toc = useMemo(() => buildToc(currentStandard), [currentStandard]);

  // 현재 읽고 있는 문단을 품은 노드들 — 목차에서 강조하고, 접혀 있으면 펼친다.
  const activeKeys = useMemo(
    () => nodeKeysForParagraph(toc, activeParagraphId),
    [toc, activeParagraphId]
  );

  // 기준서를 바꾸면 목차를 처음 상태(모두 펼침)로 되돌린다.
  useEffect(() => {
    setCollapsed(new Set());
  }, [currentStandard?.id]);

  const toggleNode = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 탭: 기준서 목록 ↔ 현재 기준서 목차 */}
      <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
        <TabButton
          active={tab === 'standards'}
          onClick={() => setTab('standards')}
          icon={<BookOpen className="w-3.5 h-3.5" />}
          label={`기준서 ${standards.length}`}
        />
        <TabButton
          active={tab === 'toc'}
          onClick={() => setTab('toc')}
          icon={<ListTree className="w-3.5 h-3.5" />}
          label="목차"
        />
        <button
          onClick={onCollapse}
          title="탐색 패널 접기"
          className="px-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer border-b-2 border-transparent"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {tab === 'standards' ? (
        <StandardList
          standards={visibleStandards}
          totalCount={standards.length}
          currentId={currentStandard?.id ?? ''}
          filter={filter}
          onChangeFilter={setFilter}
          categories={categories}
          categoryFilter={categoryFilter}
          onChangeCategory={setCategoryFilter}
          onSelect={id => {
            onSelectStandard(id);
            setTab('toc'); // 고르면 곧바로 그 기준서의 목차로 넘어간다
          }}
        />
      ) : (
        <TocTree
          standard={currentStandard}
          toc={toc}
          collapsed={collapsed}
          activeKeys={activeKeys}
          onToggleNode={toggleNode}
          onGoToParagraph={onGoToParagraph}
          onBackToList={() => setTab('standards')}
        />
      )}
    </div>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition cursor-pointer border-b-2 ${
      active
        ? 'border-emerald-600 text-emerald-700 bg-white'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ---------------------------------------------------------------------------
// 기준서 목록
// ---------------------------------------------------------------------------

const StandardList: React.FC<{
  standards: AccountingStandard[];
  totalCount: number;
  currentId: string;
  filter: string;
  onChangeFilter: (v: string) => void;
  categories: string[];
  categoryFilter: string;
  onChangeCategory: (v: string) => void;
  onSelect: (id: string) => void;
}> = ({
  standards,
  totalCount,
  currentId,
  filter,
  onChangeFilter,
  categories,
  categoryFilter,
  onChangeCategory,
  onSelect,
}) => (
  <>
    <div className="p-2.5 space-y-2 border-b border-slate-200 shrink-0">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          id="input-filter-standards"
          type="text"
          value={filter}
          onChange={e => onChangeFilter(e.target.value)}
          placeholder="번호 또는 기준서명"
          className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => onChangeCategory(cat)}
            className={`px-1.5 py-0.5 rounded text-[11px] transition cursor-pointer border ${
              categoryFilter === cat
                ? 'bg-emerald-700 text-white border-emerald-700 font-medium'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {cat === 'all' ? `전체 ${totalCount}` : cat}
          </button>
        ))}
      </div>
    </div>

    <div className="flex-1 overflow-y-auto p-1.5">
      {standards.length === 0 ? (
        <p className="text-center text-xs text-slate-400 py-10">조건에 맞는 기준서가 없습니다.</p>
      ) : (
        standards.map(s => {
          const active = s.id === currentId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg flex items-start gap-2 transition cursor-pointer ${
                active ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-slate-100'
              }`}
            >
              <span
                className={`font-mono text-[11px] pt-px shrink-0 tabular-nums ${
                  active ? 'text-emerald-700 font-bold' : 'text-slate-400'
                }`}
              >
                {s.number || '—'}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-xs leading-snug ${
                    active ? 'text-emerald-900 font-semibold' : 'text-slate-700'
                  }`}
                >
                  {s.title}
                </span>
                <span className="block text-[10px] text-slate-400 mt-0.5">
                  문단 {s.paragraphs.length}
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  </>
);

// ---------------------------------------------------------------------------
// 목차 트리
// ---------------------------------------------------------------------------

const TocTree: React.FC<{
  standard?: AccountingStandard;
  toc: TocNode[];
  collapsed: Set<string>;
  activeKeys: Set<string>;
  onToggleNode: (key: string) => void;
  onGoToParagraph: (paragraphId: string) => void;
  onBackToList: () => void;
}> = ({ standard, toc, collapsed, activeKeys, onToggleNode, onGoToParagraph, onBackToList }) => {
  if (!standard) {
    return <p className="text-center text-xs text-slate-400 py-10">기준서를 먼저 선택하세요.</p>;
  }

  return (
    <>
      <button
        onClick={onBackToList}
        className="px-3 py-2 text-left border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition cursor-pointer shrink-0"
        title="기준서 목록으로"
      >
        <span className="block text-[11px] font-mono text-slate-500">{standard.code}</span>
        <span className="block text-xs font-semibold text-slate-800 leading-snug">
          {standard.title}
        </span>
      </button>

      <div className="flex-1 overflow-y-auto py-1.5 pr-1">
        {toc.map(node => (
          <TocNodeRow
            key={node.key}
            node={node}
            collapsed={collapsed}
            activeKeys={activeKeys}
            onToggleNode={onToggleNode}
            onGoToParagraph={onGoToParagraph}
          />
        ))}
      </div>
    </>
  );
};

const TocNodeRow: React.FC<{
  node: TocNode;
  collapsed: Set<string>;
  activeKeys: Set<string>;
  onToggleNode: (key: string) => void;
  onGoToParagraph: (paragraphId: string) => void;
}> = ({ node, collapsed, activeKeys, onToggleNode, onGoToParagraph }) => {
  const isCollapsed = collapsed.has(node.key);
  const isActive = activeKeys.has(node.key);
  const hasChildren = node.children.length > 0;

  // 들여쓰기: 파트(0) → 대분류(1) → 소분류(2)
  const indent = ['pl-2', 'pl-4', 'pl-7'][node.level];
  const textStyle = [
    'text-xs font-bold text-slate-800',
    'text-xs font-medium',
    'text-[11px]',
  ][node.level];

  return (
    <div>
      <div className={`flex items-start gap-1 ${indent} pr-1`}>
        {hasChildren ? (
          <button
            onClick={() => onToggleNode(node.key)}
            className="shrink-0 mt-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label={isCollapsed ? '펼치기' : '접기'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <button
          onClick={() => onGoToParagraph(node.anchorId)}
          className={`flex-1 min-w-0 text-left py-1 rounded transition cursor-pointer hover:bg-slate-100 ${
            isActive ? 'bg-emerald-50' : ''
          }`}
          title={node.title}
        >
          <span
            className={`${textStyle} ${
              isActive ? 'text-emerald-800 font-semibold' : 'text-slate-700'
            }`}
          >
            {node.title}
          </span>
          <span className="text-[10px] text-slate-400 ml-1 tabular-nums">
            ({rangeLabel(node)})
          </span>
        </button>
      </div>

      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map(child => (
            <TocNodeRow
              key={child.key}
              node={child}
              collapsed={collapsed}
              activeKeys={activeKeys}
              onToggleNode={onToggleNode}
              onGoToParagraph={onGoToParagraph}
            />
          ))}
        </div>
      )}
    </div>
  );
};
