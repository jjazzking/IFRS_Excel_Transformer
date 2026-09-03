import React from 'react';
import { Sliders, Palette, FileText, CheckCircle } from 'lucide-react';
import { ExportConfig, ParagraphNumberFormat, TableTheme } from '../types';

interface ExportSettingsProps {
  config: ExportConfig;
  onChangeConfig: (newConfig: ExportConfig) => void;
  defaultStandardTitle?: string;
}

export const ExportSettings: React.FC<ExportSettingsProps> = ({
  config,
  onChangeConfig,
  defaultStandardTitle
}) => {
  const update = (partial: Partial<ExportConfig>) => {
    onChangeConfig({ ...config, ...partial });
  };

  const numberFormats: { id: ParagraphNumberFormat; label: string; example: string }[] = [
    { id: 'raw', label: '숫자만 (권장)', example: '38' },
    { id: 'bracket', label: '대괄호', example: '[38]' },
    { id: 'korean', label: '한글 표기', example: '제38호' },
    { id: 'hash', label: '해시', example: '#38' }
  ];

  const themes: { id: TableTheme; label: string; desc: string; previewBg: string; border: string }[] = [
    {
      id: 'audit_gray',
      label: '감사조서 표준 (그레이)',
      desc: '연회색 헤더 음영 + 얇은 그레이 격자 테두리',
      previewBg: 'bg-slate-200',
      border: 'border-slate-400'
    },
    {
      id: 'audit_blue',
      label: '회계법인 블루',
      desc: '네이비 헤더 + 소프트 블루 음영',
      previewBg: 'bg-blue-800 text-white',
      border: 'border-blue-700'
    },
    {
      id: 'classic_accounting',
      label: '클래식 조서 (상하 실선)',
      desc: '공인회계사회 보고서 스타일 굵은 구분선',
      previewBg: 'bg-white',
      border: 'border-t-2 border-b border-black'
    },
    {
      id: 'standard',
      label: '심플 테두리',
      desc: '기본 1px 실선 격자 테두리',
      previewBg: 'bg-slate-100',
      border: 'border-slate-300'
    },
    {
      id: 'minimal',
      label: '순수 내용 (테두리 없음)',
      desc: '기존 조서의 셀 서식을 전혀 건드리지 않는 텍스트 모드',
      previewBg: 'bg-transparent',
      border: 'border-dashed border-slate-200'
    }
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800">조서 출력 및 서식 설정</h2>
        </div>
      </div>

      {/* 1. 글자 수 슬라이더 (폭 설정) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="input-max-chars" className="font-semibold text-slate-700">
            1줄당 최대 권장 글자 수 (열 너비 맞춤)
          </label>
          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {config.maxCharsPerLine}자
          </span>
        </div>
        <input
          id="input-max-chars"
          type="range"
          min={25}
          max={75}
          step={5}
          value={config.maxCharsPerLine}
          onChange={(e) => update({ maxCharsPerLine: Number(e.target.value) })}
          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>좁은 조서 (30자)</span>
          <span>표준 조서 (45~50자)</span>
          <span>넓은 조서 (70자)</span>
        </div>
      </div>

      {/* 2. 문단 번호 포맷 선택 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-slate-700">
          문단 번호 표기 방식
        </label>
        <div className="grid grid-cols-2 gap-2">
          {numberFormats.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => update({ paragraphNumberFormat: fmt.id })}
              className={`flex items-center justify-between p-2 rounded-lg border text-xs transition cursor-pointer ${
                config.paragraphNumberFormat === fmt.id
                  ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span>{fmt.label}</span>
              <span className="font-mono text-[11px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                {fmt.example}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. 헤더 포함 옵션 */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <label className="block text-xs font-semibold text-slate-700">
          상대적 헤더 행(A1, A2) 삽입 설정
        </label>
        <div className="space-y-1.5">
          <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeStandardTitle}
              onChange={(e) => update({ includeStandardTitle: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span>A1 행에 <strong>기준서명</strong> 포함 (예: K-IFRS 제1115호 ...)</span>
          </label>
          <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeSectionTitle}
              onChange={(e) => update({ includeSectionTitle: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span><strong>문단제목</strong> 행 포함 (제목이 바뀌면 그 위치에 다시 삽입)</span>
          </label>

          {config.includeSectionTitle && (
            <div className="ml-6 grid grid-cols-3 gap-1.5">
              {([
                { id: 'section', label: '대분류만', hint: '공동약정 당사자들의 재무제표' },
                { id: 'sub', label: '소분류만', hint: '공동영업' },
                { id: 'both', label: '대 > 소', hint: '공동약정 당사자들의 재무제표 > 공동영업' }
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  onClick={() => update({ sectionTitleLevel: opt.id })}
                  className={`px-2 py-1 rounded-lg border text-[11px] transition cursor-pointer ${
                    config.sectionTitleLevel === opt.id
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 font-semibold ring-1 ring-emerald-500'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.addBlankLineBetweenParagraphs}
              onChange={(e) => update({ addBlankLineBetweenParagraphs: e.target.checked })}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span>문단과 문단 사이에 <strong>빈 행(1줄)</strong> 추가</span>
          </label>
        </div>
      </div>

      {/* 4. 서식 테마 (음영/테두리) */}
      <div className="space-y-1.5 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            엑셀 복사 시 서식 스타일 (음영/테두리)
          </label>
          <Palette className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="space-y-1.5">
          {themes.map(t => (
            <div
              key={t.id}
              onClick={() => update({ theme: t.id })}
              className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition ${
                config.theme === t.id
                  ? 'border-emerald-600 bg-emerald-50/60 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className={`w-5 h-5 rounded ${t.previewBg} ${t.border} flex items-center justify-center text-[9px]`}>
                  {config.theme === t.id && <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />}
                </div>
                <div>
                  <div className="text-slate-800">{t.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal">{t.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
