import React from 'react';
import { ArrowLeft, BookOpen, Code2, PencilLine, Upload, RotateCcw } from 'lucide-react';

interface NavbarProps {
  /** 첫 화면(작업대 고르기)으로 돌아간다 */
  onBackHome: () => void;
  onOpenImport: () => void;
  onOpenVbaGuide: () => void;
  onResetAll: () => void;
  standardCount: number;
  totalParagraphs: number;
  /** 기준서 본문을 그 자리에서 고칠 수 있는 모드 */
  editMode: boolean;
  onToggleEditMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onBackHome,
  onOpenImport,
  onOpenVbaGuide,
  onResetAll,
  standardCount,
  totalParagraphs,
  editMode,
  onToggleEditMode
}) => {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            id="btn-back-home"
            onClick={onBackHome}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
            title="작업대 고르기로 돌아가기"
            aria-label="작업대 고르기로 돌아가기"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-slate-300" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <button
                onClick={onBackHome}
                className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                기준서 데스크
              </button>
              <span className="text-slate-600 text-xs">/</span>
              <h1 className="font-bold text-lg text-slate-100 tracking-tight truncate">기준서 찾기</h1>
            </div>
            <p className="text-xs text-slate-400 truncate">
              통합검색 · 담기 · 엑셀 상대위치 자동 서식 복사
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="hidden md:flex items-center text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <BookOpen className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            기준서 <span className="text-emerald-300 font-semibold mx-1">{standardCount}개</span> ({totalParagraphs}개 문단)
          </div>

          <button
            id="btn-edit-mode"
            onClick={onToggleEditMode}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              editMode
                ? 'bg-amber-500 text-amber-950 border-amber-400 font-semibold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="기준서 본문을 직접 고치고 수정 기록을 남깁니다"
          >
            <PencilLine className={`w-3.5 h-3.5 ${editMode ? 'text-amber-900' : 'text-amber-400'}`} />
            <span>{editMode ? '수정 모드 켜짐' : '수정 모드'}</span>
          </button>

          <button
            id="btn-import-db"
            onClick={onOpenImport}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
            title="사내 기준서 DB (JSON/Excel) 불러오기"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">사내 DB 가져오기</span>
          </button>

          <button
            id="btn-vba-guide"
            onClick={onOpenVbaGuide}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
            title="엑셀 자동 행 삽입 단축키 및 VBA 매크로 안내"
          >
            <Code2 className="w-3.5 h-3.5 text-amber-400" />
            <span>엑셀 붙여넣기 팁/VBA</span>
          </button>

          <button
            id="btn-reset"
            onClick={onResetAll}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            title="선택 목록 초기화"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
