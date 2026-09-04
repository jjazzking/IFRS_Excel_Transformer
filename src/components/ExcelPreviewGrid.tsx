import React, { useState, useMemo } from 'react';
import { 
  Copy, 
  Download, 
  Check, 
  FileSpreadsheet, 
  Info, 
  ClipboardCheck,
  Table,
  Sparkles,
  ArrowDownAZ,
  Trash2,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { FormattedCell, ExportConfig, ClipboardExportResult, StandardParagraph } from '../types';
import { generateClipboardData, exportToExcelFile } from '../utils/textSplitter';
import { CompactConfigToolbar } from './CompactConfigToolbar';

interface ExcelPreviewGridProps {
  cells: FormattedCell[];
  config: ExportConfig;
  onChangeConfig: (newConfig: ExportConfig) => void;
  standardTitle: string;
  selectedParagraphs: StandardParagraph[];
  onRemoveParagraph?: (id: string) => void;
  onClearAll?: () => void;
  onSortParagraphs?: (direction?: 'asc' | 'desc') => void;
}

export const ExcelPreviewGrid: React.FC<ExcelPreviewGridProps> = ({
  cells,
  config,
  onChangeConfig,
  standardTitle,
  selectedParagraphs,
  onRemoveParagraph,
  onClearAll,
  onSortParagraphs
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success_formatted' | 'success_plain'>('idle');
  const [startCellInput, setStartCellInput] = useState<string>('C26'); // 기본 C26
  const [isConfigOpen, setIsConfigOpen] = useState(true);

  // 상대 위치 계산 (예: C26 기준일 때의 실제 열/행 라벨)
  const cellCoordinateInfo = useMemo(() => {
    const match = startCellInput.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return { col1: 'A', col2: 'B', startRow: 1 };
    }
    const colStr = match[1];
    const startRow = parseInt(match[2], 10);

    const colCode = colStr.charCodeAt(colStr.length - 1);
    const col1 = colStr;
    const col2 = String.fromCharCode(colCode + 1);

    return { col1, col2, startRow };
  }, [startCellInput]);

  // 클립보드 데이터 계산
  const clipboardData = useMemo<ClipboardExportResult>(() => {
    return generateClipboardData(cells, config);
  }, [cells, config]);

  // 1. 서식(HTML) + 텍스트(TSV) 동시 복사 (엑셀에 붙여넣으면 테두리와 음영이 적용됨)
  const handleCopyFormatted = async () => {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([clipboardData.tsv], { type: 'text/plain' });
        const htmlBlob = new Blob([clipboardData.html], { type: 'text/html' });

        const item = new ClipboardItem({
          'text/plain': textBlob,
          'text/html': htmlBlob
        });

        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(clipboardData.tsv);
      }

      setCopyStatus('success_formatted');
      setTimeout(() => setCopyStatus('idle'), 3500);
    } catch (err) {
      await navigator.clipboard.writeText(clipboardData.tsv);
      setCopyStatus('success_formatted');
      setTimeout(() => setCopyStatus('idle'), 3500);
    }
  };

  // 2. 순수 텍스트(TSV)만 복사 (기존 엑셀 서식 100% 보존)
  const handleCopyPlain = async () => {
    await navigator.clipboard.writeText(clipboardData.tsv);
    setCopyStatus('success_plain');
    setTimeout(() => setCopyStatus('idle'), 3500);
  };

  // 3. 엑셀 파일 다운로드
  const handleDownloadXlsx = () => {
    const filename = `${standardTitle.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_조서추출.xlsx`;
    exportToExcelFile(cells, filename);
  };

  // 테마별 미리보기 CSS 스타일 매핑
  const getThemePreviewClasses = () => {
    switch (config.theme) {
      case 'audit_gray':
        return {
          tableBorder: 'border-slate-400',
          headerRow: 'bg-slate-200 text-slate-900 font-bold',
          sectionRow: 'bg-slate-100 text-slate-800 font-bold',
          headerCell: 'border border-slate-400',
          numCell: 'bg-slate-50 text-slate-900 font-bold text-center border border-slate-300',
          contentCell: 'bg-white text-slate-800 border border-slate-300'
        };
      case 'audit_blue':
        return {
          tableBorder: 'border-blue-900',
          headerRow: 'bg-blue-900 text-white font-bold',
          sectionRow: 'bg-blue-100 text-blue-950 font-bold',
          headerCell: 'border border-blue-950',
          numCell: 'bg-blue-50/70 text-blue-950 font-bold text-center border border-blue-200',
          contentCell: 'bg-white text-slate-800 border border-slate-300'
        };
      case 'classic_accounting':
        return {
          tableBorder: 'border-slate-900',
          headerRow: 'bg-white text-slate-950 font-bold',
          sectionRow: 'bg-slate-50 text-slate-900 font-semibold',
          headerCell: 'border-t-2 border-b-2 border-black border-x-0',
          numCell: 'bg-white text-slate-900 font-semibold text-center border-b border-r border-slate-300',
          contentCell: 'bg-white text-slate-800 border-b border-slate-300'
        };
      case 'minimal':
        return {
          tableBorder: 'border-slate-200',
          headerRow: 'bg-transparent text-slate-900 font-bold',
          sectionRow: 'bg-transparent text-slate-700 font-bold',
          headerCell: 'border-b border-slate-200',
          numCell: 'bg-transparent text-slate-900 font-semibold text-center border-b border-slate-100',
          contentCell: 'bg-transparent text-slate-800 border-b border-slate-100'
        };
      case 'standard':
      default:
        return {
          tableBorder: 'border-slate-400',
          headerRow: 'bg-slate-100 text-slate-900 font-bold',
          sectionRow: 'bg-slate-50 text-slate-800 font-bold',
          headerCell: 'border border-slate-300',
          numCell: 'bg-slate-50 text-slate-900 font-semibold text-center border border-slate-300',
          contentCell: 'bg-white text-slate-800 border border-slate-300'
        };
    }
  };

  const themeClasses = getThemePreviewClasses();

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      {/* 1. 서식 설정 툴바 — 한 번 맞춰 두면 계속 볼 일이 없으므로 접을 수 있게 했다.
             3존 레이아웃에서 이 패널이 좁아진 만큼, 접으면 미리보기에 높이를 넘겨준다. */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0">
        <span className="text-[11px] font-semibold text-slate-600">서식 설정</span>
        <button
          onClick={() => setIsConfigOpen(v => !v)}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition cursor-pointer"
          title={isConfigOpen ? '설정 접기' : '설정 펼치기'}
        >
          {isConfigOpen ? (
            <>
              접기 <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              {config.maxCharsPerLine || '제한 없음'}
              {config.maxCharsPerLine ? '자' : ''} · {startCellInput} 기준
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
      {isConfigOpen && (
        <CompactConfigToolbar
          config={config}
          onChangeConfig={onChangeConfig}
          startCell={startCellInput}
          onChangeStartCell={setStartCellInput}
        />
      )}

      {/* 2. 시뮬레이션 상태 바 & 원클릭 복사/추출 액션 버튼 영역 */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2 flex-wrap">
          <div className="flex items-center space-x-1.5 text-slate-800">
            <Table className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold">엑셀 조서 미리보기</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
            선택 문단 {selectedParagraphs.length}개
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-medium border border-slate-200">
            총 {cells.length}행 ({cellCoordinateInfo.col1}{cellCoordinateInfo.startRow}~{cellCoordinateInfo.col2}{cellCoordinateInfo.startRow + Math.max(0, cells.length - 1)})
          </span>

          {/* 선택 문단 빠른 정렬 및 비우기 */}
          {selectedParagraphs.length > 0 && (
            <div className="flex items-center space-x-1 pl-1">
              {onSortParagraphs && (
                <button
                  id="btn-toolbar-sort"
                  onClick={() => onSortParagraphs('asc')}
                  className="text-[11px] text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded flex items-center space-x-1 cursor-pointer transition font-medium"
                  title="기준서별 문단 번호 오름차순으로 순서 정렬"
                >
                  <ArrowDownAZ className="w-3 h-3 text-emerald-600" />
                  <span>문단번호 정렬</span>
                </button>
              )}
              {onClearAll && (
                <button
                  id="btn-toolbar-clear"
                  onClick={onClearAll}
                  className="text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent hover:border-rose-200 px-1.5 py-0.5 rounded flex items-center space-x-0.5 cursor-pointer transition"
                  title="선택된 모든 문단 비우기"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>비우기</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 메인 복사 액션 버튼들 */}
        <div className="flex items-center space-x-2">
          {/* 메인: 서식 포함 복사 */}
          <button
            id="btn-copy-formatted"
            onClick={handleCopyFormatted}
            disabled={cells.length === 0}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>엑셀 서식 복사 (음영/테두리)</span>
          </button>

          {/* 서브: 순수 텍스트만 복사 */}
          <button
            id="btn-copy-plain"
            onClick={handleCopyPlain}
            disabled={cells.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="기존 엑셀 조서의 서식을 그대로 유지하고 텍스트 내용만 채워넣을 때 사용"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            <span>순수 텍스트 복사</span>
          </button>

          {/* 엑셀 파일 다운로드 */}
          <button
            id="btn-download-xlsx"
            onClick={handleDownloadXlsx}
            disabled={cells.length === 0}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title=".xlsx 파일로 다운로드"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>.xlsx</span>
          </button>
        </div>
      </div>

      {/* 복사 성공 토스트 알림 */}
      {copyStatus !== 'idle' && (
        <div className="mx-4 mt-2 p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-900 flex items-start space-x-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">
              {copyStatus === 'success_formatted'
                ? '클립보드에 엑셀 서식(HTML + TSV)으로 복사되었습니다!'
                : '클립보드에 순수 텍스트(TSV)로 복사되었습니다!'}
            </p>
            <p className="text-[11px] text-emerald-800 mt-0.5">
              💡 엑셀 조서의 <strong>{cellCoordinateInfo.startRow}행</strong> 머리글을 클릭한 후 
              <kbd className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-mono font-bold mx-1">Ctrl + +</kbd>
              (복사한 셀 삽입)를 누르면 기존 조서 손상 없이 완벽하게 들어갑니다.
            </p>
          </div>
        </div>
      )}

      {/* 3. 선택된 문단 칩 태그 바 (어떤 문단들이 포함되어 있는지 가로 스크롤로 가볍게 확인) */}
      {selectedParagraphs.length > 0 && (
        <div className="px-4 py-1.5 bg-slate-50/70 border-b border-slate-200 flex items-center space-x-1.5 overflow-x-auto text-xs select-none scrollbar-thin">
          <span className="text-[11px] font-semibold text-slate-500 shrink-0 mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-400" />
            포함 문단:
          </span>
          {selectedParagraphs.map((p, idx) => (
            <div
              key={p.id}
              className="inline-flex items-center space-x-1 bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-800 shrink-0 shadow-2xs hover:border-slate-300 transition"
            >
              {p.standardCode && (
                <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1 rounded">
                  {p.standardCode.replace('K-IFRS 제', '')}
                </span>
              )}
              <span className="font-bold text-slate-900">문단 {p.number}</span>
              {onRemoveParagraph && (
                <button
                  onClick={() => onRemoveParagraph(p.id)}
                  className="text-slate-400 hover:text-rose-600 ml-1 text-xs cursor-pointer"
                  title="제거"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 4. 엑셀 시트 뷰어 (실시간 그리드) */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4">
        {cells.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center text-slate-400 p-8">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">
              미리보기를 생성할 선택된 문단이 없습니다.
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              좌측 기준서 목록에서 추출할 문단을 체크하시면, 엑셀 시트에 배치될 조서 양식이 실시간으로 구성됩니다.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden inline-block min-w-full font-sans text-xs">
            {/* 엑셀 시뮬레이션 테이블 */}
            <table className="w-full border-collapse text-xs">
              {/* 엑셀 열 머리글 (Column Header) */}
              <thead>
                <tr className="bg-slate-200 border-b border-slate-300 select-none sticky top-0 z-10">
                  <th className="w-12 py-1.5 px-2 text-center text-[11px] font-semibold text-slate-600 border-r border-slate-300 bg-slate-200">
                    #
                  </th>
                  <th className="w-28 py-1.5 px-2 text-center text-[11px] font-semibold text-slate-700 border-r border-slate-300 bg-slate-200">
                    {cellCoordinateInfo.col1} (상대 A열)
                  </th>
                  <th className="py-1.5 px-3 text-left text-[11px] font-semibold text-slate-700 bg-slate-200">
                    {cellCoordinateInfo.col2} (상대 B열 - 조문 본문)
                  </th>
                </tr>
              </thead>

              {/* 행 데이터 (Rows) */}
              <tbody>
                {cells.map((cell, idx) => {
                  const actualRowNumber = cellCoordinateInfo.startRow + idx;
                  
                  if (cell.isStandardTitle) {
                    return (
                      <tr key={idx} className={themeClasses.headerRow}>
                        <td className="w-12 py-1.5 px-2 text-center text-[11px] font-mono text-slate-500 bg-slate-100 border border-slate-300 select-none">
                          {actualRowNumber}
                        </td>
                        <td colSpan={2} className={`py-2 px-3 font-bold text-sm tracking-tight ${themeClasses.headerCell}`}>
                          {cell.colA}
                        </td>
                      </tr>
                    );
                  }

                  if (cell.isSectionTitle) {
                    return (
                      <tr key={idx} className={themeClasses.sectionRow}>
                        <td className="w-12 py-1.5 px-2 text-center text-[11px] font-mono text-slate-500 bg-slate-100 border border-slate-300 select-none">
                          {actualRowNumber}
                        </td>
                        <td colSpan={2} className={`py-1.5 px-3 font-semibold text-xs ${themeClasses.headerCell}`}>
                          {cell.colA}
                        </td>
                      </tr>
                    );
                  }

                  if (!cell.colA && !cell.colB) {
                    return (
                      <tr key={idx} className="h-4 bg-slate-50/50">
                        <td className="w-12 py-0.5 px-2 text-center text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-300 select-none">
                          {actualRowNumber}
                        </td>
                        <td className="w-28 py-0.5 px-2 border border-slate-200"></td>
                        <td className="py-0.5 px-3 border border-slate-200"></td>
                      </tr>
                    );
                  }

                  // 일반 문단 행
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/80 transition ${
                        cell.isParagraphStart ? 'border-t-2 border-slate-300' : ''
                      }`}
                    >
                      {/* 행 번호 */}
                      <td className="w-12 py-1.5 px-2 text-center text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-300 select-none align-top">
                        {actualRowNumber}
                      </td>

                      {/* A열: 문단 번호 */}
                      <td
                        className={`w-28 py-1.5 px-2 text-xs select-none border border-slate-300 align-top ${
                          themeClasses.numCell
                        }`}
                      >
                        {cell.colA ? (
                          <span className="font-bold text-slate-900">{cell.colA}</span>
                        ) : null}
                      </td>

                      {/* B열: 분할된 본문 */}
                      <td
                        className={`py-1.5 px-3 text-xs leading-relaxed border border-slate-300 align-top ${
                          themeClasses.contentCell
                        }`}
                      >
                        {cell.colB || (
                          <span className="text-slate-300 text-[10px] select-none italic">
                            (공란)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 하단 상태 표시줄 */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            {config.maxCharsPerLine > 0 ? (
              <>열 너비와 무관하게 <strong>최대 {config.maxCharsPerLine}자</strong> 단위로 조문이 분할되어 다음 행에 안전하게 배치됩니다.</>
            ) : (
              <>글자수 제한 없이 <strong>문장 단위</strong>로 한 줄씩 조문이 배치됩니다.</>
            )}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
          셀 병합(Merge) 미사용 · 원본 조서 수식 안전
        </span>
      </div>

    </div>
  );
};
