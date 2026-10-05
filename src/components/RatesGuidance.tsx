import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { ALL_STANDARDS } from '../data/standardsData';
import { PurposeGuide } from '../utils/ratesQuery';

/**
 * 용도별 안내 — 어떤 이자율을 왜 쓰는지와 근거 문단.
 *
 * 문단 원문은 기준서 작업대와 같은 자료(`src/data/standards`)에서 꺼낸다. 안내 문장을
 * 따로 적어 두면 기준서가 개정될 때 어긋나므로, 원문은 늘 자료에서 읽는다.
 */
export const RatesGuidance: React.FC<{ guide: PurposeGuide }> = ({ guide }) => {
  const [open, setOpen] = useState(true);
  const [showText, setShowText] = useState(false);

  const quotes = useMemo(
    () =>
      guide.refs.flatMap(ref => {
        const std = ALL_STANDARDS.find(s => s.id === ref.standardId);
        return ref.numbers.map(n => ({
          key: `${ref.standardId}-${n}`,
          label: `${ref.short} 문단 ${n}`,
          text: std?.paragraphs.find(p => p.number === n)?.content ?? '(기준서 자료에 이 문단이 없습니다)',
        }));
      }),
    [guide]
  );

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl shrink-0 max-h-[26%] overflow-auto">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left cursor-pointer"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-sky-700" /> : <ChevronRight className="w-3.5 h-3.5 text-sky-700" />}
        <BookOpen className="w-3.5 h-3.5 text-sky-700" />
        <span className="text-[11px] font-bold text-sky-900">{guide.label}에 쓰는 이자율</span>
        <span className="text-[10px] text-sky-700/80 truncate">
          {guide.refs.map(r => `${r.short} ${r.numbers.join('·')}`).join(' / ')}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
          <p>{guide.summary}</p>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
            {guide.cautions.map(c => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            onClick={() => setShowText(s => !s)}
            className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
          >
            {showText ? '근거 문단 원문 접기' : '근거 문단 원문 보기'}
          </button>
          {showText && (
            <div className="space-y-1.5">
              {quotes.map(q => (
                <blockquote key={q.key} className="border-l-2 border-sky-300 pl-2 text-slate-600">
                  <span className="font-semibold text-sky-800">{q.label}</span> {q.text}
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
