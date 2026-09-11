import React from 'react';
import { ArrowRight, FileSpreadsheet, Lock, PanelsTopLeft } from 'lucide-react';
import { WorkspaceId, WorkspaceMeta, WORKSPACES } from '../workspaces/registry';

interface HomeScreenProps {
  onOpen: (id: WorkspaceId) => void;
  /** 카드에 붙는 부제 — 기준서 작업대는 실제 데이터 규모를 보여준다 */
  standardCount: number;
  totalParagraphs: number;
}

// 색은 카드마다 다르지만 클래스 문자열은 통째로 적어 둔다.
// `bg-${accent}-600` 처럼 조립하면 Tailwind 가 빌드할 때 찾지 못해 색이 빠진다.
const ACCENT: Record<
  WorkspaceMeta['accent'],
  { chip: string; icon: string; ring: string; arrow: string }
> = {
  emerald: {
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: 'bg-emerald-600 text-white',
    ring: 'hover:border-emerald-400 hover:shadow-emerald-100',
    arrow: 'text-emerald-600',
  },
  sky: {
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: 'bg-sky-600 text-white',
    ring: 'hover:border-sky-400 hover:shadow-sky-100',
    arrow: 'text-sky-600',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: 'bg-amber-500 text-white',
    ring: 'hover:border-amber-400 hover:shadow-amber-100',
    arrow: 'text-amber-600',
  },
  violet: {
    chip: 'bg-violet-50 text-violet-700 border-violet-200',
    icon: 'bg-violet-600 text-white',
    ring: 'hover:border-violet-400 hover:shadow-violet-100',
    arrow: 'text-violet-600',
  },
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpen,
  standardCount,
  totalParagraphs,
}) => (
  <div className="min-h-screen bg-slate-100 text-slate-900 antialiased font-sans overflow-y-auto">
    <header className="bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shadow-inner shrink-0">
            <FileSpreadsheet className="w-5.5 h-5.5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-2xl tracking-tight">기준서 데스크</h1>
            <p className="text-sm text-slate-400">조서를 만들 때 찾아야 하는 것들을 한 자리에</p>
          </div>
        </div>

        <p className="mt-6 text-slate-300 text-sm leading-relaxed max-w-2xl">
          작업대는 모두 같은 모양입니다. <span className="text-white font-medium">왼쪽에서 찾고,
          오른쪽 엑셀 미리보기에서 그대로 조서에 붙여넣습니다.</span> 찾는 대상만 다릅니다.
        </p>

        <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-1.5">
          <PanelsTopLeft className="w-3.5 h-3.5 text-emerald-400" />
          왼쪽 <span className="text-slate-200">찾기</span> · 가운데{' '}
          <span className="text-slate-200">읽기</span> · 오른쪽{' '}
          <span className="text-slate-200">담기 · 엑셀</span>
        </div>
      </div>
    </header>

    <main className="max-w-5xl mx-auto px-6 py-8">
      <h2 className="text-sm font-semibold text-slate-500 mb-3">작업대 고르기</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {WORKSPACES.map(ws => {
          const accent = ACCENT[ws.accent];
          const ready = ws.status === 'ready';
          const Icon = ws.icon;

          return (
            <button
              key={ws.id}
              id={`card-workspace-${ws.id}`}
              onClick={() => ready && onOpen(ws.id)}
              disabled={!ready}
              aria-disabled={!ready}
              className={`text-left bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition group ${
                ready
                  ? `cursor-pointer hover:shadow-md ${accent.ring}`
                  : 'cursor-not-allowed opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    ready ? accent.icon : 'bg-slate-300 text-slate-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-slate-900">{ws.name}</h3>
                    {ready ? (
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full border font-medium ${accent.chip}`}
                      >
                        {standardCount}개 기준서 · {totalParagraphs.toLocaleString()}개 문단
                      </span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-slate-300 bg-slate-100 text-slate-500 font-medium inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        준비 중
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{ws.description}</p>

                  <dl className="mt-3 grid grid-cols-[2.2rem_1fr] gap-x-2 gap-y-1 text-[11px]">
                    <dt className="text-slate-400 font-medium">왼쪽</dt>
                    <dd className="text-slate-600">{ws.leftPane}</dd>
                    <dt className="text-slate-400 font-medium">오른쪽</dt>
                    <dd className="text-slate-600">{ws.rightPane}</dd>
                  </dl>

                  {ready ? (
                    <span
                      className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${accent.arrow}`}
                    >
                      열기
                      <ArrowRight className="w-3.5 h-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                      먼저 정해야 할 것: {ws.blockedBy}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-500 leading-relaxed">
        준비 중인 작업대는 찾아올 데이터의 출처가 정해지면 열립니다. 어떤 값을 어느 조서에 쓰는지
        알려주시면 그 순서대로 붙입니다.
      </p>
    </main>
  </div>
);
