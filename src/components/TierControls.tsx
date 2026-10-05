import React from 'react';

/**
 * 단계별 버튼 — 환율·이자율 작업대가 함께 쓴다.
 *
 * TierButton 은 한 단계에서 하나를 고르는 큰 버튼, Chip 은 여러 개를 고르는 작은 버튼이다.
 */

export const TierButton: React.FC<{
  id?: string;
  active: boolean;
  label: string;
  hint?: string;
  /** 골라져 있지만 아래 단계가 남아 있어 지금은 취소할 수 없다 */
  locked?: boolean;
  onClick: () => void;
}> = ({ id, active, label, hint, locked, onClick }) => (
  <button
    id={id}
    onClick={onClick}
    aria-pressed={active}
    title={active ? (locked ? '아래 단계를 먼저 해제하면 취소할 수 있습니다' : '한 번 더 누르면 취소') : undefined}
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

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}
