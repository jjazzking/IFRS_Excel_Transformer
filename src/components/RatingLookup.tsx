import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Search, X } from 'lucide-react';
import { CompanyRating, RateRowMeta, RatedCompany, RatingKind, RatingsData } from '../types';
import { RATINGS_READY, loadRatings } from '../data/ratingsData';
import { KIND_LABEL, isStale, rateRowForGrade, ratingNote, searchCompanies } from '../utils/ratingsQuery';

interface RatingLookupProps {
  rows: RateRowMeta[];
  pickedRows: string[];
  /** 이자율 기준일 — 이보다 1년 넘게 앞선 평정은 오래됐다고 표시한다 */
  asOf: string;
  /** 지금 조서 각주에 들어가 있는 신용등급 문장 */
  note?: string;
  onPick: (rowCode: string, note: string) => void;
  onClearNote: () => void;
}

const KIND_STYLE: Record<RatingKind, string> = {
  bond: 'bg-sky-100 text-sky-800 border-sky-200',
  icr: 'bg-violet-100 text-violet-800 border-violet-200',
};

/** 등급 종류 표시 — 채권등급인지 기업신용등급인지 늘 함께 보여 준다 */
export const KindBadge: React.FC<{ kind: RatingKind }> = ({ kind }) => (
  <span
    title={KIND_LABEL[kind].help}
    className={`inline-block px-1.5 py-px rounded border text-[10px] font-semibold whitespace-nowrap cursor-help ${KIND_STYLE[kind]}`}
  >
    {KIND_LABEL[kind].short}
  </span>
);

/**
 * 종류·등급(행) 단계 위 — 회사명으로 공시된 신용등급을 찾아 그 등급의 회사채 행을 고른다.
 *
 * 공시된 등급이 없으면 '없음'에서 멈춘다. 등급을 추정하지 않는다.
 */
export const RatingLookup: React.FC<RatingLookupProps> = ({ rows, pickedRows, asOf, note, onPick, onClearNote }) => {
  const [data, setData] = useState<RatingsData | null>(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<RatedCompany | null>(null);

  useEffect(() => {
    if (!RATINGS_READY || data || !text.trim()) return;
    let cancelled = false;
    loadRatings().then(d => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [text, data]);

  const results = useMemo(() => (data ? searchCompanies(data.companies, text) : []), [data, text]);
  const searching = text.trim().length > 0 && !selected;

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold text-slate-700">회사 신용등급 찾기</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <KindBadge kind="bond" />
          회사채 한 건의 등급
          <span className="text-slate-300">·</span>
          <KindBadge kind="icr" />
          회사 자체의 등급 (아직 없음)
        </span>
      </div>

      {!RATINGS_READY ? (
        <p className="text-[11px] text-slate-500">
          신용등급 자료를 아직 받지 않았습니다. GitHub Actions 의 <span className="font-medium">신용등급 받기</span> 가
          돌면 채워집니다.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              id="input-rating-company"
              type="text"
              value={selected ? selected.name : text}
              placeholder="회사명 (예: 삼성카드, 한국투자캐피탈)"
              onChange={e => {
                setSelected(null);
                setText(e.target.value);
              }}
              className="w-full pl-7 pr-7 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {(text || selected) && (
              <button
                onClick={() => {
                  setSelected(null);
                  setText('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="검색 지우기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searching && data && results.length > 0 && (
            <ul className="max-h-36 overflow-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
              {results.map(c => (
                <li key={c.name}>
                  <button
                    onClick={() => setSelected(c)}
                    className="w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-emerald-50 cursor-pointer"
                  >
                    <span className="font-medium text-slate-800 truncate">{c.name}</span>
                    <span className="ml-auto flex items-center gap-1 text-slate-500 tabular-nums shrink-0">
                      {[...new Set(c.ratings.map(r => r.grade))].join(' · ')}
                      <span className="text-slate-300">|</span>
                      {c.ratings[0].date}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searching && data && results.length === 0 && (
            <div className="flex gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-500" />
              <p>
                <span className="font-semibold">공시된 신용등급 없음</span> — 금투협 신용등급 속보({data.from} ~ {data.to})에
                이 이름의 회사가 없습니다. 비상장사이거나 이 기간에 회사채 등급을 받지 않은 회사입니다. 등급을 추정하지
                않습니다.
              </p>
            </div>
          )}

          {selected && data && (
            <CompanyCard
              company={selected}
              agencies={data.agencies}
              rows={rows}
              pickedRows={pickedRows}
              asOf={asOf}
              onPick={onPick}
            />
          )}

          {note && (
            <p className="flex items-center gap-1 text-[10px] text-emerald-800">
              <Check className="w-3 h-3" />
              조서 각주에 넣음: {note}
              <button onClick={onClearNote} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="각주에서 빼기">
                <X className="w-3 h-3" />
              </button>
            </p>
          )}

          {data && (
            <p className="text-[10px] text-slate-400">
              출처: {data.source} · 평정일 {data.from} ~ {data.to} · 회사 {data.companies.length.toLocaleString()}곳
            </p>
          )}
        </>
      )}
    </div>
  );
};

const CompanyCard: React.FC<{
  company: RatedCompany;
  agencies: Record<string, string>;
  rows: RateRowMeta[];
  pickedRows: string[];
  asOf: string;
  onPick: (rowCode: string, note: string) => void;
}> = ({ company, agencies, rows, pickedRows, asOf, onPick }) => (
  <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
    {company.ratings.map(r => (
      <RatingRow
        key={`${r.kind}-${r.agency}`}
        company={company.name}
        rating={r}
        agencyName={agencies[r.agency] ?? r.agency}
        row={rateRowForGrade(rows, r.grade)}
        pickedRows={pickedRows}
        stale={isStale(r, asOf)}
        onPick={onPick}
      />
    ))}
  </div>
);

const RatingRow: React.FC<{
  company: string;
  rating: CompanyRating;
  agencyName: string;
  row: RateRowMeta | undefined;
  pickedRows: string[];
  stale: boolean;
  onPick: (rowCode: string, note: string) => void;
}> = ({ company, rating: r, agencyName, row, pickedRows, stale, onPick }) => {
  const picked = !!row && pickedRows.includes(row.code);
  return (
    <div className="px-2 py-1.5 text-[11px] space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <KindBadge kind={r.kind} />
        <span className="text-slate-600 w-[5.5rem] shrink-0">{agencyName}</span>
        <span className="text-sm font-bold text-slate-900 tabular-nums">{r.grade}</span>
        {(r.outlook || r.watch) && <span className="text-slate-500">{[r.outlook, r.watch].filter(Boolean).join(' · ')}</span>}
        <span className={`tabular-nums ${stale ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>{r.date} 평정</span>
        <span className="text-slate-400 truncate max-w-[12rem]" title={r.issue}>
          {r.issue}
          {r.issues > 1 ? ` 등 ${r.issues}건` : ''}
        </span>
        {row ? (
          <button
            onClick={() => onPick(row.code, ratingNote(company, r, agencyName))}
            disabled={picked}
            className={`ml-auto px-2 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap ${
              picked
                ? 'bg-emerald-600 border-emerald-600 text-white cursor-default'
                : 'bg-white border-emerald-500 text-emerald-700 hover:bg-emerald-50 cursor-pointer'
            }`}
          >
            {picked ? '행 고름' : `회사채 무보증 ${row.grade} 행 고르기`}
          </button>
        ) : (
          <span className="ml-auto text-[10px] text-slate-400">표에 이 등급의 회사채 행이 없음</span>
        )}
      </div>
      {stale && <Warn>평정일이 기준일보다 1년 넘게 앞섭니다. 그 뒤 등급이 바뀌었을 수 있습니다.</Warn>}
      {r.guaranteed && <Warn>지급보증 종목의 등급입니다 — 보증한 회사의 등급일 수 있습니다.</Warn>}
      {r.others && r.others.length > 0 && (
        <Warn>
          같은 날 다른 종목에 다른 등급:{' '}
          {r.others.map(o => `${o.grade}${o.guaranteed ? '(보증)' : ''} ${o.issue}`).join(' · ')}
        </Warn>
      )}
    </div>
  );
};

const Warn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-start gap-1 text-[10px] text-amber-800 pl-0.5">
    <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
    <span>{children}</span>
  </p>
);
