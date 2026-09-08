import React, { useEffect, useState } from 'react';
import { AlertTriangle, ListChecks, PencilLine, X } from 'lucide-react';

/** 수정 모드로 들어갈 때 이름을 받는다. 누가 고쳤는지 기록에 남기기 위해서다. */
export const EditorNameModal: React.FC<{
  isOpen: boolean;
  defaultName: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}> = ({ isOpen, defaultName, onCancel, onConfirm }) => {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) setName(defaultName);
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const submit = () => {
    if (name.trim()) onConfirm(name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <PencilLine className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-bold text-slate-900">기준서 수정 모드</h2>
        </div>
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            원본 기준서 파일은 바뀌지 않습니다. 고친 내용은 <b>수정 기록</b>으로 남고,
            기록을 내보내 검토한 뒤에 원본에 반영합니다.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              수정자 이름
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onCancel();
              }}
              placeholder="예: 홍길동"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              수정 기록마다 이 이름이 함께 저장됩니다.
            </p>
          </div>
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            수정 모드 시작
          </button>
        </div>
      </div>
    </div>
  );
};

/** 수정 모드가 켜져 있는 동안 화면 위에 계속 붙어 있는 띠. */
export const EditModeBar: React.FC<{
  editor: string;
  editCount: number;
  /** 의심 문단 표시가 켜져 있는지 */
  auditOn: boolean;
  auditTotal: number;
  onToggleAudit: () => void;
  onOpenAuditList: () => void;
  onOpenLog: () => void;
  onExit: () => void;
}> = ({
  editor,
  editCount,
  auditOn,
  auditTotal,
  onToggleAudit,
  onOpenAuditList,
  onOpenLog,
  onExit,
}) => (
  <div className="bg-amber-500 text-amber-950 shrink-0">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <PencilLine className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs font-bold whitespace-nowrap">수정 모드</span>
        <span className="text-xs truncate">
          수정자 <b>{editor}</b> · 이 브라우저에 {editCount}건 기록됨
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onToggleAudit}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer border ${
            auditOn
              ? 'bg-amber-950 text-amber-100 border-amber-950'
              : 'bg-amber-100/80 hover:bg-amber-50 text-amber-900 border-transparent'
          }`}
          title="기준서 데이터에서 원문과 다를 것 같은 문단을 찾아 노란색으로 표시합니다"
        >
          <AlertTriangle className="w-3 h-3" />
          {auditOn ? `의심 ${auditTotal}곳 표시 중` : '의심 문단 훑기'}
        </button>
        {auditOn && (
          <button
            onClick={onOpenAuditList}
            className="px-2 py-1 rounded-md bg-amber-100/80 hover:bg-amber-50 text-amber-900 text-[11px] font-semibold transition cursor-pointer"
          >
            목록
          </button>
        )}
        <span className="w-px h-4 bg-amber-600/40" aria-hidden />
        <button
          onClick={onOpenLog}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100/80 hover:bg-amber-50 text-amber-900 text-[11px] font-semibold transition cursor-pointer"
        >
          <ListChecks className="w-3 h-3" />
          수정 로그 {editCount > 0 && `(${editCount})`}
        </button>
        <button
          onClick={onExit}
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-amber-600/40 text-[11px] font-medium transition cursor-pointer"
          title="수정 모드 끄기 (기록은 남습니다)"
        >
          <X className="w-3 h-3" />
          종료
        </button>
      </div>
    </div>
  </div>
);
