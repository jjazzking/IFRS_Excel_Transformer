import React, { useEffect, useState } from 'react';
import { ExternalLink, Info, X } from 'lucide-react';

/** 원데이터를 어디서 받았는지. 조서화 전에 사용자가 직접 확인하러 갈 곳이다. */
const DATA_SOURCES: { label: string; source: string; url: string }[] = [
  { label: '환율', source: '서울외국환중개', url: 'http://www.smbs.biz/ExRate/StdExRate.jsp' },
  { label: '이자율', source: '금융투자협회 채권정보센터', url: 'https://www.kofiabond.or.kr' },
  { label: '기준서', source: '회계기준원', url: 'https://www.kasb.or.kr' },
];

/**
 * 헤더 오른쪽 위의 '이용안내' 버튼과 안내 창.
 * 첫 화면과 모든 작업대 헤더에 같은 버튼을 둔다 — 열림 상태는 버튼이 스스로 갖는다.
 */
export const UsageGuideButton: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        id="btn-usage-guide"
        onClick={() => setOpen(true)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer shrink-0"
        title="이용안내"
      >
        <Info className="w-3.5 h-3.5 text-sky-400" />
        <span>이용안내</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="usage-guide-title"
            className="w-full max-w-lg max-h-[85vh] bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 id="usage-guide-title" className="font-semibold text-slate-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-sky-600" />
                이용안내
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="px-5 py-4 space-y-4 text-sm leading-relaxed overflow-y-auto">
              <li className="flex gap-2">
                <span className="font-semibold text-slate-500 shrink-0">1)</span>
                <p>
                  본 사이트는 조서 작성 시 필요한 다양한 외부 재무/경제 데이터 및 회계기준서를
                  참조하거나 엑셀에 조서화할 시의 업무 부담을 줄이도록 설계되어 있습니다.
                </p>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-slate-500 shrink-0">2)</span>
                <div className="min-w-0">
                  <p>
                    본 사이트의 모든 데이터는 아래의 원데이터 소스로부터 다운받은 데이터이며, 본
                    사이트는 해당 원 데이터를 탐색하고 엑셀에 조서화하기 위한 용도로 만들었습니다.
                  </p>
                  <ul className="mt-2 rounded-lg border border-slate-200 divide-y divide-slate-200">
                    {DATA_SOURCES.map(d => (
                      <li key={d.label} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">{d.label}</span>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                        >
                          {d.source}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-slate-500 shrink-0">3)</span>
                <p className="font-medium text-rose-700">
                  조서화 전 반드시 직접 원데이터 소스에 접근하여 내용이 맞는지 체크하시기 바랍니다.
                </p>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};
