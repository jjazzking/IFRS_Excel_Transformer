import React, { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, ChevronRight, Star, XCircle } from 'lucide-react';
import { ALL_STANDARDS } from '../data/standardsData';
import { PurposeGuide } from '../utils/ratesQuery';

/**
 * 용도별 안내 — 어떤 이자율을 왜 쓰는지와 근거 문단.
 *
 * 맨 위에 권하는 이자율과 그 이유(번호 붙인 짧은 결론 + 설명 + 근거 문단)를, 그 아래에
 * 쓰면 안 되는 이자율을 둔다. 기준서 요지·주의점·원문은 그 다음이다.
 *
 * 문단 원문은 기준서 작업대와 같은 자료(`src/data/standards`)에서 꺼낸다. 안내 문장을
 * 따로 적어 두면 기준서가 개정될 때 어긋나므로, 원문은 늘 자료에서 읽는다.
 */
export const RatesGuidance: React.FC<{ guide: PurposeGuide }> = ({ guide }) => {
  const [open, setOpen] = useState(true);
  const [showText, setShowText] = useState(false);
  const rec = guide.recommend;

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
    <div className="bg-sky-50 border border-sky-200 rounded-xl shrink-0 max-h-[40%] overflow-auto">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left cursor-pointer"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-sky-700" /> : <ChevronRight className="w-3.5 h-3.5 text-sky-700" />}
        <BookOpen className="w-3.5 h-3.5 text-sky-700" />
        <span className="text-[11px] font-bold text-sky-900">{guide.label}에 쓰는 이자율</span>
        {!open && rec && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-800">
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            {rec.rate}
          </span>
        )}
        <span className="text-[10px] text-sky-700/80 truncate">
          {guide.refs.map(r => `${r.short} ${r.numbers.join('·')}`).join(' / ')}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-2 text-[11px] text-slate-700 leading-relaxed">
          {rec && (
            <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 bg-emerald-50 border-b border-emerald-100">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                  <Star className="w-2.5 h-2.5 fill-white" />
                  추천
                </span>
                <span className="text-[13px] font-bold text-emerald-900">{rec.rate}</span>
              </div>
              <div className="px-2.5 py-2">
                <p className="text-[10px] font-semibold text-slate-500 mb-1.5">왜 이 이자율인가</p>
                <ol className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                  {rec.reasons.map((r, i) => (
                    <li key={r.point} className="flex gap-1.5 rounded-md bg-slate-50 border border-slate-200 px-2 py-1.5">
                      <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-emerald-600 text-white grid place-items-center text-[9px] font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 leading-snug">{r.point}</p>
                        <p className="text-[10.5px] text-slate-600 leading-snug mt-0.5">{r.detail}</p>
                        {r.ref && (
                          <span className="inline-block mt-1 px-1 rounded bg-sky-100 text-sky-800 text-[9.5px] font-medium">
                            {r.ref}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              {rec.avoid && (
                <div className="flex gap-1.5 px-2.5 py-1.5 bg-rose-50 border-t border-rose-100">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-500" />
                  <p className="text-rose-900">
                    <span className="font-semibold">쓰지 않는 이자율 · {rec.avoid.rate}</span>
                    <span className="text-rose-800/90"> — {rec.avoid.why}</span>
                  </p>
                </div>
              )}
            </div>
          )}
          <p>
            <span className="font-semibold text-sky-900">기준서 요지 </span>
            {guide.summary}
          </p>
          {guide.cautions.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-800 mb-0.5">
                <AlertTriangle className="w-3 h-3" />
                자주 틀리는 점
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                {guide.cautions.map(c => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
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
