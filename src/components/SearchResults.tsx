import React from 'react';
import { Check, ChevronRight, Plus, SearchX } from 'lucide-react';
import { StandardParagraph } from '../types';
import { PART_LABEL } from '../data/normalize';
import { SearchResult, highlightParts } from '../utils/search';

interface SearchResultsProps {
  result: SearchResult;
  query: string;
  selectedIds: Set<string>;
  onToggleParagraph: (paragraph: StandardParagraph) => void;
  /** 본문에서 보기 — 해당 기준서로 옮겨가 그 문단까지 스크롤한다 */
  onOpenParagraph: (standardId: string, paragraphId: string) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  result,
  query,
  selectedIds,
  onToggleParagraph,
  onOpenParagraph,
}) => {
  if (!query.trim()) return null;

  if (result.totalHits === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
        <SearchX className="w-8 h-8" />
        <p className="text-sm">
          <strong className="text-slate-600">{query}</strong> 에 해당하는 문단이 없습니다.
        </p>
        <p className="text-xs">띄어쓰기를 줄이거나 더 짧은 말로 찾아보세요.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {result.partial ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          모든 낱말이 다 들어간 문단은 없어서, <strong>일부 낱말만 맞는</strong> 문단{' '}
          <strong>{result.totalHits}</strong>건을 대신 보여줍니다.
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          기준서 <strong className="text-slate-800">{result.groups.length}</strong>건에서 문단{' '}
          <strong className="text-emerald-700">{result.totalHits}</strong>건을 찾았습니다.
        </p>
      )}

      {result.groups.map(group => (
        <section key={group.standard.id}>
          {/* 기준서별 묶음 머리말 */}
          <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-1.5 mb-1 border-b border-slate-200 flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {group.standard.number}
            </span>
            <h3 className="text-xs font-bold text-slate-800 truncate">{group.standard.title}</h3>
            <span className="ml-auto text-[11px] text-slate-500 shrink-0">
              {group.hits.length}건
            </span>
          </header>

          <ul className="divide-y divide-slate-100">
            {group.hits.map(hit => {
              const p = hit.paragraph;
              const selected = selectedIds.has(p.id);
              const part = p.part || 'main';
              return (
                <li key={p.id} className="py-2 flex gap-2.5 group hover:bg-slate-50 rounded px-1 -mx-1">
                  <button
                    onClick={() => onToggleParagraph(p)}
                    className={`shrink-0 self-start mt-0.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition cursor-pointer ${
                      selected
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-500 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                    }`}
                    title={selected ? '조서에서 빼기' : '조서에 담기'}
                  >
                    {selected ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                    {selected ? '담김' : '담기'}
                  </button>

                  <button
                    onClick={() => onOpenParagraph(group.standard.id, p.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                    title="본문에서 보기"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                        문단 {p.number}
                      </span>
                      {part !== 'main' && (
                        <span className="text-[10px] px-1 rounded bg-slate-200 text-slate-600">
                          {PART_LABEL[part]}
                        </span>
                      )}
                      {(p.sectionTitle || p.subTitle) && (
                        <span className="text-[10px] text-slate-400 truncate">
                          {[p.sectionTitle, p.subTitle].filter(Boolean).join(' › ')}
                        </span>
                      )}
                      <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 ml-auto shrink-0" />
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 line-clamp-3">
                      {hit.snippetTruncatedStart && '… '}
                      {highlightParts(hit.snippet, result.tokens).map((part2, i) =>
                        part2.hit ? (
                          <mark key={i} className="bg-amber-200 text-slate-900 rounded-sm px-0.5">
                            {part2.text}
                          </mark>
                        ) : (
                          <React.Fragment key={i}>{part2.text}</React.Fragment>
                        )
                      )}
                      {hit.snippetTruncatedEnd && ' …'}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
