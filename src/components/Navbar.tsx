import React from 'react';
import { BookOpen, FileSpreadsheet, Code2, Upload, RotateCcw } from 'lucide-react';

interface NavbarProps {
  onOpenImport: () => void;
  onOpenVbaGuide: () => void;
  onResetAll: () => void;
  standardCount: number;
  totalParagraphs: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenImport,
  onOpenVbaGuide,
  onResetAll,
  standardCount,
  totalParagraphs
}) => {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-inner">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-lg text-slate-100 tracking-tight">회계기준서 조서 추출기</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-medium">
                Workpaper Assistant
              </span>
            </div>
            <p className="text-xs text-slate-400">
              사내 DB 검색 · 스마트 문장 분할 · 엑셀 상대위치 자동 서식 복사
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="hidden md:flex items-center text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <BookOpen className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            기준서 <span className="text-emerald-300 font-semibold mx-1">{standardCount}개</span> ({totalParagraphs}개 문단)
          </div>

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
