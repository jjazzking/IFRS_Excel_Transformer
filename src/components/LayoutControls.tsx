import React from 'react';
import { LayoutPreset } from '../hooks/useResizableLayout';

/** 두 구역 사이의 경계. 드래그하면 폭이 바뀌고, 더블클릭하면 기본 폭으로 돌아간다. */
export const Splitter: React.FC<{
  active: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  label: string;
}> = ({ active, onPointerDown, onDoubleClick, label }) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label={label}
    title={`${label} — 드래그해서 폭 조절, 더블클릭하면 기본 폭`}
    onPointerDown={onPointerDown}
    onDoubleClick={onDoubleClick}
    className="group w-3 shrink-0 flex items-center justify-center cursor-col-resize touch-none"
  >
    <span
      className={`w-1 h-12 rounded-full transition-colors ${
        active ? 'bg-emerald-500' : 'bg-slate-300 group-hover:bg-emerald-400'
      }`}
    />
  </div>
);

/** 접힌 패널 자리에 남는 세로 띠. 누르면 다시 펼쳐진다. */
export const CollapsedRail: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    title={`${label} 펼치기`}
    className="w-9 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center gap-2 py-3 text-slate-400 hover:text-emerald-700 hover:bg-slate-50 transition cursor-pointer"
  >
    {icon}
    <span className="text-[11px] font-medium tracking-tight" style={{ writingMode: 'vertical-rl' }}>
      {label}
    </span>
  </button>
);

const PRESETS: { key: LayoutPreset; label: string; title: string }[] = [
  { key: 'explore', label: '탐색', title: '목차와 본문을 넓게 (엑셀 접기)' },
  { key: 'balanced', label: '균형', title: '세 구역을 기본 폭으로' },
  { key: 'excel', label: '조서', title: '엑셀 미리보기를 최대로 (탐색 접기)' },
];

export const PresetSwitch: React.FC<{ onApply: (preset: LayoutPreset) => void }> = ({ onApply }) => (
  <div className="flex rounded-lg border border-slate-300 overflow-hidden shrink-0 text-[11px] font-medium">
    {PRESETS.map(p => (
      <button
        key={p.key}
        onClick={() => onApply(p.key)}
        title={p.title}
        className="px-2 py-1.5 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap border-r border-slate-200 last:border-r-0"
      >
        {p.label}
      </button>
    ))}
  </div>
);
