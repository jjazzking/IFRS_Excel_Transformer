import React from 'react';
import { 
  Sliders, 
  Palette, 
  Layers, 
  Sparkles, 
  Check, 
  HelpCircle,
  Maximize2
} from 'lucide-react';
import { ExportConfig, ParagraphNumberFormat, TableTheme } from '../types';

interface CompactConfigToolbarProps {
  config: ExportConfig;
  onChangeConfig: (newConfig: ExportConfig) => void;
  startCell: string;
  onChangeStartCell: (val: string) => void;
}

export const CompactConfigToolbar: React.FC<CompactConfigToolbarProps> = ({
  config,
  onChangeConfig,
  startCell,
  onChangeStartCell
}) => {
  const update = (partial: Partial<ExportConfig>) => {
    onChangeConfig({ ...config, ...partial });
  };

  const numberFormats: { id: ParagraphNumberFormat; label: string; example: string }[] = [
    { id: 'raw', label: '숫자만 (38)', example: '38' },
    { id: 'bracket', label: '대괄호 [38]', example: '[38]' },
    { id: 'korean', label: '한글 제38호', example: '제38호' },
    { id: 'hash', label: '해시 #38', example: '#38' }
  ];

  const themes: { id: TableTheme; label: string; previewBadge: string }[] = [
    { id: 'audit_gray', label: '감사조서 그레이', previewBadge: 'bg-slate-200 text-slate-800 border-slate-400' },
    { id: 'audit_blue', label: '회계법인 블루', previewBadge: 'bg-blue-900 text-white border-blue-950' },
    { id: 'classic_accounting', label: '클래식 실선', previewBadge: 'bg-white text-slate-900 border-slate-900' },
    { id: 'standard', label: '심플 테두리', previewBadge: 'bg-slate-100 text-slate-800 border-slate-300' },
    { id: 'minimal', label: '순수 텍스트(선 없음)', previewBadge: 'bg-transparent text-slate-600 border-dashed border-slate-300' }
  ];

  return (
    <div className="bg-slate-50/95 border-b border-slate-200 px-4 py-3 space-y-3">
      {/* 1행: 핵심 조절 컨트롤 (슬라이더, 시작셀, 문단번호 형식, 테마) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        
        {/* (1) 1행당 글자 수 슬라이더 (4 cols) */}
        <div className="md:col-span-4 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              1행당 글자 수
            </span>
            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px] border border-emerald-200">
              {config.maxCharsPerLine}자
            </span>
          </div>
          <input
            id="toolbar-max-chars"
            type="range"
            min={25}
            max={75}
            step={5}
            value={config.maxCharsPerLine}
            onChange={(e) => update({ maxCharsPerLine: Number(e.target.value) })}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
          />
          <div className="flex justify-between text-[9px] text-slate-400 font-mono">
            <span>좁은 조서 (30자)</span>
            <span>표준 (45자)</span>
            <span>넓은 조서 (70자)</span>
          </div>
        </div>

        {/* (2) 문단 번호 표기 방식 드롭다운 (3 cols) */}
        <div className="md:col-span-3 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <label htmlFor="toolbar-num-format" className="block text-xs font-semibold text-slate-700">
            문단번호 표기
          </label>
          <select
            id="toolbar-num-format"
            value={config.paragraphNumberFormat}
            onChange={(e) => update({ paragraphNumberFormat: e.target.value as ParagraphNumberFormat })}
            className="w-full bg-slate-50 border border-slate-200 rounded text-xs px-2 py-1 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {numberFormats.map(fmt => (
              <option key={fmt.id} value={fmt.id}>
                {fmt.label}
              </option>
            ))}
          </select>
        </div>

        {/* (3) 테마 스타일 드롭다운 (3 cols) */}
        <div className="md:col-span-3 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <label htmlFor="toolbar-theme-select" className="block text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>조서 테두리/음영</span>
            <Palette className="w-3 h-3 text-slate-400" />
          </label>
          <select
            id="toolbar-theme-select"
            value={config.theme}
            onChange={(e) => update({ theme: e.target.value as TableTheme })}
            className="w-full bg-slate-50 border border-slate-200 rounded text-xs px-2 py-1 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {themes.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* (4) 시작 셀 위치 인풋 (2 cols) */}
        <div className="md:col-span-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <label htmlFor="toolbar-start-cell" className="block text-xs font-semibold text-slate-700">
            시작 셀
          </label>
          <input
            id="toolbar-start-cell"
            type="text"
            value={startCell}
            onChange={(e) => onChangeStartCell(e.target.value)}
            className="w-full text-center font-mono font-bold text-emerald-700 uppercase bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="C26"
          />
        </div>

      </div>

      {/* 2행: 헤더 및 간격 세부 체크박스 옵션 (상시 표시) */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 pt-2 border-t border-slate-200/80 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-slate-500 text-[11px]">상대 헤더/구분선:</span>
          
          <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-900 select-none">
            <input
              type="checkbox"
              checked={config.includeStandardTitle}
              onChange={(e) => update({ includeStandardTitle: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span>A1 행에 <strong>기준서명</strong></span>
          </label>

          <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-900 select-none">
            <input
              type="checkbox"
              checked={config.includeSectionTitle}
              onChange={(e) => update({ includeSectionTitle: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span><strong>문단제목</strong> 행</span>
          </label>

          {config.includeSectionTitle && (
            <select
              aria-label="문단제목 표기 수준"
              value={config.sectionTitleLevel}
              onChange={(e) => update({ sectionTitleLevel: e.target.value as ExportConfig['sectionTitleLevel'] })}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="section">대분류만</option>
              <option value="sub">소분류만</option>
              <option value="both">대분류 &gt; 소분류</option>
            </select>
          )}

          <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-900 select-none">
            <input
              type="checkbox"
              checked={config.addBlankLineBetweenParagraphs}
              onChange={(e) => update({ addBlankLineBetweenParagraphs: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span>문단 사이 <strong>빈 행(1줄)</strong> 추가</span>
          </label>
        </div>

        <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
          ⚡ 옵션 변경 시 아래 엑셀 시트에 즉시 반영됩니다
        </div>
      </div>
    </div>
  );
};
