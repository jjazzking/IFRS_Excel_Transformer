import React from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * 단계별 버튼 — 환율·이자율 작업대가 함께 쓴다.
 *
 * TierButton 은 한 단계에서 하나를 고르는 큰 버튼, Chip 은 여러 개를 고르는 작은 버튼이다.
 * 고른 것을 되돌릴 때는 단계 제목 옆의 StepReset 을 쓴다.
 */

export const TierButton: React.FC<{
  id?: string;
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}> = ({ id, active, label, hint, onClick }) => (
  <button
    id={id}
    onClick={onClick}
    aria-pressed={active}
    className={`text-left px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
      active
        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
        : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-500 hover:bg-emerald-50'
    }`}
  >
    <span className="block text-xs font-semibold">{label}</span>
    {hint && (
      <span className={`block text-[10px] leading-tight ${active ? 'text-emerald-50' : 'text-slate-400'}`}>
        {hint}
      </span>
    )}
  </button>
);

export const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; title?: string }> = ({
  active,
  onClick,
  children,
  title,
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    title={title}
    className={`px-2 py-1 rounded-md border text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-emerald-600 border-emerald-600 text-white'
        : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-500 hover:text-emerald-700'
    }`}
  >
    {children}
  </button>
);

/** 단계 제목 옆 '초기화' — 그 단계에서 고른 것만 비운다 */
export const StepReset: React.FC<{ id?: string; onClick: () => void }> = ({ id, onClick }) => (
  <button
    id={id}
    onClick={onClick}
    title="이 단계에서 고른 것을 비웁니다"
    className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
  >
    <RotateCcw className="w-3 h-3" />
    초기화
  </button>
);

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}
