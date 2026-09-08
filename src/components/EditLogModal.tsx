import React from 'react';
import { Download, FileText, RotateCcw, Trash2, X } from 'lucide-react';
import { ParagraphEdit } from '../types';
import {
  buildEditLogJson,
  buildEditLogMarkdown,
  downloadText,
  fileStamp,
  formatDateTime,
  summarizeEdit,
} from '../utils/editStore';

interface EditLogModalProps {
  isOpen: boolean;
  edits: ParagraphEdit[];
  onClose: () => void;
  onRevert: (paragraphId: string) => void;
  onClearAll: () => void;
  onGoToParagraph: (paragraphId: string, standardId: string) => void;
}

export const EditLogModal: React.FC<EditLogModalProps> = ({
  isOpen,
  edits,
  onClose,
  onRevert,
  onClearAll,
  onGoToParagraph,
}) => {
  if (!isOpen) return null;

  const ordered = [...edits].sort((a, b) => b.editedAt.localeCompare(a.editedAt));

  const exportJson = () =>
    downloadText(`standards-edit-log-${fileStamp()}.json`, buildEditLogJson(edits), 'application/json');

  const exportMarkdown = () =>
    downloadText(`standards-edit-log-${fileStamp()}.md`, buildEditLogMarkdown(edits), 'text/markdown');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl max-h-[85vh] bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">수정 로그</h2>
            <p className="text-[11px] text-slate-500">
              문단 {edits.length}건이 고쳐졌습니다. 내보낸 파일을 검토한 뒤 원본에 반영합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={exportMarkdown}
            disabled={edits.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            검토용 문서 (.md)
          </button>
          <button
            onClick={exportJson}
            disabled={edits.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            반영용 기록 (.json)
          </button>
          <span className="text-[11px] text-slate-500 flex-1 min-w-[180px]">
            검토는 <b>.md</b>, 원본 반영은 <b>.json</b> 을 씁니다. 둘 다 내려받아 함께 전달하세요.
          </span>
          {edits.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('수정 기록을 모두 지웁니다. 되돌릴 수 없습니다.')) onClearAll();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              전체 지우기
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {ordered.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-12">
              아직 고친 문단이 없습니다. 본문에서 <b>수정</b> 버튼을 눌러 고쳐 보세요.
            </p>
          )}
          {ordered.map(edit => (
            <div
              key={edit.editId}
              className="border border-slate-200 rounded-lg overflow-hidden"
            >
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <button
                    onClick={() => {
                      onGoToParagraph(edit.paragraphId, edit.standardId);
                      onClose();
                    }}
                    className="text-xs font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer text-left"
                  >
                    {edit.standardCode} 문단 {edit.paragraphNumber}
                  </button>
                  <p className="text-[11px] text-slate-500">
                    {edit.editor} · {formatDateTime(edit.editedAt)} · {summarizeEdit(edit)}
                  </p>
                  {edit.note && (
                    <p className="text-[11px] text-slate-600 mt-0.5">사유: {edit.note}</p>
                  )}
                </div>
                <button
                  onClick={() => onRevert(edit.paragraphId)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-600 border border-slate-300 bg-white hover:bg-slate-100 transition cursor-pointer shrink-0"
                  title="이 문단을 원본으로 되돌리고 기록을 지웁니다"
                >
                  <RotateCcw className="w-3 h-3" />
                  되돌리기
                </button>
              </div>
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                <DiffPane label="수정 전" text={edit.before.content} tone="red" />
                <DiffPane label="수정 후" text={edit.after.content} tone="emerald" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DiffPane: React.FC<{ label: string; text: string; tone: 'red' | 'emerald' }> = ({
  label,
  text,
  tone,
}) => (
  <div className="p-3 min-w-0">
    <div
      className={`text-[10px] font-bold mb-1 ${
        tone === 'red' ? 'text-red-600' : 'text-emerald-700'
      }`}
    >
      {label}
    </div>
    <pre className="text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words font-sans max-h-56 overflow-y-auto">
      {text}
    </pre>
  </div>
);
