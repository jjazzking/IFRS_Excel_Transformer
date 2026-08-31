import React, { useState, useMemo } from 'react';
import { 
  Copy, 
  Download, 
  Check, 
  FileSpreadsheet, 
  HelpCircle, 
  Info, 
  Sparkles,
  ClipboardCheck,
  Table
} from 'lucide-react';
import { FormattedCell, ExportConfig, ClipboardExportResult } from '../types';
import { generateClipboardData, exportToExcelFile } from '../utils/textSplitter';

interface ExcelPreviewGridProps {
  cells: FormattedCell[];
  config: ExportConfig;
  standardTitle: string;
}

export const ExcelPreviewGrid: React.FC<ExcelPreviewGridProps> = ({
  cells,
  config,
  standardTitle
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success_formatted' | 'success_plain'>('idle');
  const [startCellInput, setStartCellInput] = useState<string>('C26'); // 사용자 설명에 나온 예시 'C26'

  // 상대 위치 계산 (예: C26 기준일 때의 실제 열/행 라벨)
  const cellCoordinateInfo = useMemo(() => {
    const match = startCellInput.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return { col1: 'A', col2: 'B', startRow: 1 };
    }
    const colStr = match[1];
    const startRow = parseInt(match[2], 10);

    // 단일 문자 열 기준 계산 (간단화: A~Z)
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
        // Fallback
        await navigator.clipboard.writeText(clipboardData.tsv);
      }

      setCopyStatus('success_formatted');
      setTimeout(() => setCopyStatus('idle'), 3500);
    } catch (err) {
      // Fallback
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
          headerRow: 'bg-slate-200 text-slate-900 font-bold border-slate-400',
          sectionRow: 'bg-slate-100 text-slate-800 font-bold border-slate-400',
          numCell: 'bg-slate-50 text-slate-900 font-bold text-center border-slate-300',
          contentCell: 'bg-white text-slate-800 border-slate-300'
        };
      case 'audit_blue':
        return {
          headerRow: 'bg-blue-900 text-white font-bold border-blue-950',
          sectionRow: 'bg-blue-100 text-blue-950 font-bold border-blue-300',
          numCell: 'bg-blue-50/70 text-blue-950 font-bold text-center border-blue-200',
          contentCell: 'bg-white text-slate-800 border-slate-200'
        };
      case 'classic_accounting':
        return {
          headerRow: 'bg-white text-slate-950 font-bold border-t-2 border-b-2 border-black',
          sectionRow: 'bg-slate-50 text-slate-900 font-semibold border-b border-black',
          numCell: 'bg-white text-slate-900 font-semibold text-center border-b border-slate-200',
          contentCell: 'bg-white text-slate-800 border-b border-slate-200'
        };
      case 'minimal':
        return {
          headerRow: 'bg-transparent text-slate-900 font-bold border-transparent',
          sectionRow: 'bg-transparent text-slate-700 font-bold border-transparent',
          numCell: 'bg-transparent text-slate-900 font-semibold text-center border-transparent',
          contentCell: 'bg-transparent text-slate-800 border-transparent'
        };
      case 'standard':
      default:
        return {
          headerRow: 'bg-slate-100 text-slate-900 font-bold border-slate-300',
          sectionRow: 'bg-slate-50 text-slate-800 font-bold border-slate-300',
          numCell: 'bg-slate-50 text-slate-900 font-semibold text-center border-slate-200',
          contentCell: 'bg-white text-slate-800 border-slate-200'
        };
    }
  };

  const themeClasses = getThemePreviewClasses();

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 1. 상단 컨트롤 바 */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Table className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-800">엑셀 조서 실시간 시뮬레이션</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono font-medium">
              총 {cells.length}행
            </span>
          </div>

          {/* 상대 위치 기준점 인풋 */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
            <span className="font-medium text-slate-500">붙여넣을 시작 셀:</span>
            <input
              id="input-start-cell"
              type="text"
              value={startCellInput}
              onChange={(e) => setStartCellInput(e.target.value)}
              className="w-14 text-center font-mono font-bold text-emerald-700 uppercase bg-slate-50 border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="C26"
            />
            <span className="text-[11px] text-slate-400">
              ({cellCoordinateInfo.col1}열 문단번호, {cellCoordinateInfo.col2}열 본문)
            </span>
          </div>
        </div>

        {/* 복사 및 내보내기 액션 버튼 영역 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center space-x-2">
            {/* 메인: 서식 포함 복사 */}
            <button
              id="btn-copy-formatted"
              onClick={handleCopyFormatted}
              disabled={cells.length === 0}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>엑셀 서식 복사 (음영/테두리 유지)</span>
            </button>

            {/* 서브: 순수 텍스트만 복사 */}
            <button
              id="btn-copy-plain"
              onClick={handleCopyPlain}
              disabled={cells.length === 0}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="기존 엑셀 조서 서식을 유지하고 값만 붙여넣을 때 사용"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>순수 텍스트만 복사</span>
            </button>
          </div>

          <button
            id="btn-download-xlsx"
            onClick={handleDownloadXlsx}
            disabled={cells.length === 0}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>.xlsx 파일 다운로드</span>
          </button>
        </div>

        {/* 복사 완료 알림 툴팁 */}
        {copyStatus !== 'idle' && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-900 flex items-start space-x-2 animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">
                {copyStatus === 'success_formatted'
                  ? '클립보드에 엑셀 서식(HTML + TSV)으로 복사되었습니다!'
                  : '클립보드에 순수 텍스트(TSV)로 복사되었습니다!'}
              </p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                💡 <strong>엑셀 조서에 삽입하는 팁:</strong> 엑셀에서 끼워넣을 행(예: <strong>{cellCoordinateInfo.startRow}행</strong>) 머리글을 클릭한 후 
                <kbd className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-mono font-bold mx-1">Ctrl + +</kbd>
                (복사한 셀 삽입)를 누르면 기존 서식 훼손 없이 행이 자동 추가되며 깔끔하게 들어갑니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. 엑셀 시트 뷰어 (그리드) */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4">
        {cells.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">
              미리보기를 생성할 문단이 없습니다.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              문단을 선택하면 엑셀 시트에 배치될 형태가 실시간으로 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded border border-slate-300 shadow-sm overflow-hidden inline-block min-w-full font-sans text-xs">
            {/* 엑셀 열 머리글 (Column Header) */}
            <div className="flex bg-slate-200 border-b border-slate-300 select-none sticky top-0 z-10">
              <div className="w-12 py-1 px-2 text-center text-[11px] font-semibold text-slate-600 border-r border-slate-300 bg-slate-200 shrink-0">
                #
              </div>
              <div className="w-24 py-1 px-2 text-center text-[11px] font-semibold text-slate-700 border-r border-slate-300 bg-slate-200 shrink-0">
                {cellCoordinateInfo.col1} (상대 A열)
              </div>
              <div className="flex-1 min-w-[340px] py-1 px-3 text-left text-[11px] font-semibold text-slate-700 bg-slate-200">
                {cellCoordinateInfo.col2} (상대 B열 - 본문)
              </div>
            </div>

            {/* 행 데이터 (Rows) */}
            <div className="divide-y divide-slate-200">
              {cells.map((cell, idx) => {
                const actualRowNumber = cellCoordinateInfo.startRow + idx;
                
                if (cell.isStandardTitle) {
                  return (
                    <div key={idx} className={`flex border-b ${themeClasses.headerRow}`}>
                      <div className="w-12 py-1.5 px-2 text-center text-[11px] font-mono text-slate-500 bg-slate-100 border-r border-slate-300 shrink-0 select-none">
                        {actualRowNumber}
                      </div>
                      <div className="flex-1 py-1.5 px-3 font-bold text-sm tracking-tight">
                        {cell.colA}
                      </div>
                    </div>
                  );
                }

                if (cell.isSectionTitle) {
                  return (
                    <div key={idx} className={`flex border-b ${themeClasses.sectionRow}`}>
                      <div className="w-12 py-1.5 px-2 text-center text-[11px] font-mono text-slate-500 bg-slate-100 border-r border-slate-300 shrink-0 select-none">
                        {actualRowNumber}
                      </div>
                      <div className="flex-1 py-1.5 px-3 font-semibold text-xs text-slate-800">
                        {cell.colA}
                      </div>
                    </div>
                  );
                }

                // 일반 문단 행
                return (
                  <div
                    key={idx}
                    className={`flex items-stretch hover:bg-slate-50 transition ${
                      cell.isParagraphStart ? 'border-t border-slate-300' : ''
                    }`}
                  >
                    {/* 행 번호 */}
                    <div className="w-12 py-1 px-2 text-center text-[11px] font-mono text-slate-400 bg-slate-50 border-r border-slate-300 shrink-0 select-none flex items-center justify-center">
                      {actualRowNumber}
                    </div>

                    {/* A열: 문단 번호 */}
                    <div
                      className={`w-24 py-1.5 px-2 text-xs border-r border-slate-300 shrink-0 flex items-start justify-center ${
                        themeClasses.numCell
                      }`}
                    >
                      {cell.colA ? (
                        <span className="font-bold text-slate-900">{cell.colA}</span>
                      ) : (
                        <span className="text-slate-300 text-[10px] select-none font-mono"></span>
                      )}
                    </div>

                    {/* B열: 분할된 본문 */}
                    <div
                      className={`flex-1 min-w-[340px] py-1.5 px-3 text-xs leading-relaxed ${
                        themeClasses.contentCell
                      }`}
                    >
                      {cell.colB || (
                        <span className="text-slate-300 text-[10px] select-none italic">
                          (공란)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 하단 설명 가이드 */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            열 너비와 무관하게 <strong>최대 {config.maxCharsPerLine}자</strong> 단위로 문장이 보존되어 다음 행에 배치됩니다.
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          셀 병합(Merge) 미사용 · 원본 조서 서식 안전
        </span>
      </div>
    </div>
  );
};
