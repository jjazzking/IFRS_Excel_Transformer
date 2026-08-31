import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Layers, ListOrdered, Sparkles } from 'lucide-react';
import { StandardParagraph, ExportConfig } from '../types';
import { splitContentSmart, formatParagraphNumber } from '../utils/textSplitter';

interface SelectedListProps {
  selectedParagraphs: StandardParagraph[];
  onRemoveParagraph: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onClearAll: () => void;
  config: ExportConfig;
}

export const SelectedList: React.FC<SelectedListProps> = ({
  selectedParagraphs,
  onRemoveParagraph,
  onMoveUp,
  onMoveDown,
  onClearAll,
  config
}) => {
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ListOrdered className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800">조서 추출 대기 목록</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
            {selectedParagraphs.length}개
          </span>
        </div>
        {selectedParagraphs.length > 0 && (
          <button
            id="btn-clear-selection"
            onClick={onClearAll}
            className="text-xs text-rose-600 hover:text-rose-800 hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>전체 비우기</span>
          </button>
        )}
      </div>

      {/* 목록 스크롤 뷰 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {selectedParagraphs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <Layers className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">
              추출할 문단이 선택되지 않았습니다
            </p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              좌측 기준서 목록에서 필요한 문단을 클릭하거나 검색하여 추가해 주세요.
            </p>
          </div>
        ) : (
          selectedParagraphs.map((p, index) => {
            const splitLines = splitContentSmart(p.content, config.maxCharsPerLine);
            const formattedNum = formatParagraphNumber(p.number, config.paragraphNumberFormat);

            return (
              <div
                key={p.id}
                id={`selected-item-${p.id}`}
                className="p-3 bg-slate-50/70 rounded-lg border border-slate-200 hover:border-slate-300 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                      문단 {formattedNum}
                    </span>
                    {p.subTitle && (
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">
                        {p.subTitle}
                      </span>
                    )}
                  </div>

                  {/* 제어 버튼: 위/아래 이동 및 삭제 */}
                  <div className="flex items-center space-x-1">
                    <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1">
                      {splitLines.length}행 차지
                    </span>
                    <button
                      onClick={() => onMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      title="위로 이동"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onMoveDown(index)}
                      disabled={index === selectedParagraphs.length - 1}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      title="아래로 이동"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemoveParagraph(p.id)}
                      className="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 cursor-pointer"
                      title="제거"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 분할 미리보기 미니 라인 */}
                <div className="bg-white p-2 rounded border border-slate-200 text-[11px] space-y-1 text-slate-600 font-mono">
                  {splitLines.slice(0, 3).map((l, lIdx) => (
                    <div key={lIdx} className="flex items-start">
                      <span className="text-slate-400 w-6 shrink-0 select-none">
                        L{lIdx + 1}:
                      </span>
                      <span className="truncate text-slate-800">{l}</span>
                    </div>
                  ))}
                  {splitLines.length > 3 && (
                    <div className="text-[10px] text-slate-400 pl-6 italic">
                      + 외 {splitLines.length - 3}줄 추가 분할...
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
