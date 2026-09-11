import React, { useMemo, useState } from 'react';
import { Check, ClipboardCheck, Copy, Download, Table, Trash2 } from 'lucide-react';
import { SheetTable, TableTheme } from '../types';
import { exportSheetToExcelFile, formatNumber, generateSheetClipboard } from '../utils/sheetExport';
import { getThemePreviewClasses } from '../utils/tableTheme';

interface SheetPreviewProps {
  table: SheetTable;
  /** 파일명·헤더에 쓸 이름 */
  name: string;
  theme: TableTheme;
  onChangeTheme: (theme: TableTheme) => void;
  onClearAll?: () => void;
  /** 표가 비었을 때 대신 보여 줄 말 */
  emptyHint: string;
}

const THEMES: { value: TableTheme; label: string }[] = [
  { value: 'audit_gray', label: '감사조서(회색)' },
  { value: 'audit_blue', label: '감사조서(파랑)' },
  { value: 'classic_accounting', label: '상하 테두리' },
  { value: 'standard', label: '표준 격자' },
  { value: 'minimal', label: '테두리 없음' },
];

/**
 * 여러 열짜리 표를 조서에 붙이기 직전 모습으로 보여 주고, 그대로 복사한다.
 *
 * 기준서 문단은 `ExcelPreviewGrid`(2열 고정)를 쓰고, 환율처럼 열이 여럿인 자료는
 * 이 컴포넌트를 쓴다. 서식은 두 쪽이 같은 `tableTheme` 을 본다.
 */
export const SheetPreview: React.FC<SheetPreviewProps> = ({
  table,
  name,
  theme,
  onChangeTheme,
  onClearAll,
  emptyHint,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'formatted' | 'plain'>('idle');
  const classes = getThemePreviewClasses(theme);
  const clipboard = useMemo(() => generateSheetClipboard(table, theme), [table, theme]);
  const isEmpty = table.rows.length === 0;

  const flash = (status: 'formatted' | 'plain') => {
    setCopyStatus(status);
    window.setTimeout(() => setCopyStatus('idle'), 3000);
  };

  const handleCopyFormatted = async () => {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([clipboard.tsv], { type: 'text/plain' }),
            'text/html': new Blob([clipboard.html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(clipboard.tsv);
      }
    } catch {
      // 서식까지 담지 못하는 브라우저에서도 값은 넘어가야 한다.
      await navigator.clipboard.writeText(clipboard.tsv);
    }
    flash('formatted');
  };

  const handleCopyPlain = async () => {
    await navigator.clipboard.writeText(clipboard.tsv);
    flash('plain');
  };

  const handleDownload = () => {
    const safe = name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    exportSheetToExcelFile(table, `${safe}_환율.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0">
        <span className="text-[11px] font-semibold text-slate-600">서식 설정</span>
        <select
          id="select-sheet-theme"
          value={theme}
          onChange={e => onChangeTheme(e.target.value as TableTheme)}
          className="text-[11px] bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {THEMES.map(t => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="px-3 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-800">
            <Table className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold">엑셀 조서 미리보기</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
            {table.rows.length}행
          </span>
          {onClearAll && !isEmpty && (
            <button
              id="btn-sheet-clear"
              onClick={onClearAll}
              className="text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent hover:border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer transition"
            >
              <Trash2 className="w-3 h-3" />
              비우기
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-sheet-copy-formatted"
            onClick={handleCopyFormatted}
            disabled={isEmpty}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ClipboardCheck className="w-4 h-4" />
            조서에 붙여넣기 (서식 유지)
          </button>
          <button
            id="btn-sheet-copy-plain"
            onClick={handleCopyPlain}
            disabled={isEmpty}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="조서의 기존 서식을 그대로 두고 값만 채울 때"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            텍스트만
          </button>
          <button
            id="btn-sheet-download"
            onClick={handleDownload}
            disabled={isEmpty}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            .xlsx
          </button>
        </div>
      </div>

      {copyStatus !== 'idle' && (
        <div className="mx-3 mt-2 p-2 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-900 flex items-start gap-2 shrink-0">
          <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <span>
            {copyStatus === 'formatted'
              ? '복사했습니다. 조서에서 붙여넣을 칸을 고르고 Ctrl+V 를 누르세요. 테두리와 음영이 함께 들어갑니다.'
              : '값만 복사했습니다. 조서의 기존 서식은 그대로 남습니다.'}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {isEmpty ? (
          <p className="text-xs text-slate-500 leading-relaxed">{emptyHint}</p>
        ) : (
          <table className={`w-full text-[11px] border-collapse border ${classes.tableBorder}`}>
            <tbody>
              {table.title && (
                <tr>
                  <td
                    colSpan={table.columns.length}
                    className={`${classes.headerRow} ${classes.headerCell} px-2 py-1`}
                  >
                    {table.title}
                  </td>
                </tr>
              )}
              <tr>
                {table.columns.map(c => (
                  <td
                    key={c.key}
                    className={`${classes.sectionRow} ${classes.headerCell} px-2 py-1 text-center whitespace-nowrap`}
                  >
                    {c.label}
                  </td>
                ))}
              </tr>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.cells.map((value, j) => {
                    const col = table.columns[j];
                    const isNum = typeof value === 'number';
                    return (
                      <td
                        key={col?.key ?? j}
                        className={`px-2 py-1 whitespace-nowrap ${
                          isNum ? `${classes.numCell} text-right tabular-nums` : classes.contentCell
                        } ${row.emphasis === 'total' ? 'font-bold' : ''}`}
                      >
                        {isNum ? formatNumber(value, col?.digits) : (value ?? '')}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {table.footnote && (
                <tr>
                  <td
                    colSpan={table.columns.length}
                    className={`${classes.contentCell} px-2 py-1 text-[10px] text-slate-500`}
                  >
                    {table.footnote}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
