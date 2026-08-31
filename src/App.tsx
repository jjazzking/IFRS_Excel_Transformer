import React, { useState, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { StandardBrowser } from './components/StandardBrowser';
import { SelectedList } from './components/SelectedList';
import { ExportSettings } from './components/ExportSettings';
import { ExcelPreviewGrid } from './components/ExcelPreviewGrid';
import { VbaSnippetModal } from './components/VbaSnippetModal';
import { ImportCustomDbModal } from './components/ImportCustomDbModal';

import { AccountingStandard, StandardParagraph, ExportConfig } from './types';
import { INITIAL_STANDARDS } from './data/standardsData';
import { generateFormattedCells } from './utils/textSplitter';

export default function App() {
  // 기준서 데이터베이스 상태
  const [standards, setStandards] = useState<AccountingStandard[]>(INITIAL_STANDARDS);
  const [selectedStandardId, setSelectedStandardId] = useState<string>(INITIAL_STANDARDS[0].id);

  // 선택된 문단들
  const [selectedParagraphs, setSelectedParagraphs] = useState<StandardParagraph[]>([
    INITIAL_STANDARDS[0].paragraphs[0], // 기본으로 제1115호 문단 31 선택
    INITIAL_STANDARDS[0].paragraphs[3], // 문단 38 선택
  ]);

  // 서식 및 추출 설정
  const [config, setConfig] = useState<ExportConfig>({
    maxCharsPerLine: 45, // 기본 45자 (실무 조서의 B열 기본 폭에 최적화)
    includeStandardTitle: true, // A1: 기준서명
    includeSectionTitle: true, // A2: 소제목
    paragraphNumberFormat: 'raw', // '38' 형태
    theme: 'audit_gray', // 전통 감사조서 스타일
    addBlankLineBetweenParagraphs: false,
    alignNumberToTop: true,
  });

  // 모달 상태
  const [isVbaModalOpen, setIsVbaModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // 현재 선택된 기준서 객체
  const currentStandard = useMemo(() => {
    return standards.find(s => s.id === selectedStandardId) || standards[0];
  }, [standards, selectedStandardId]);

  // 문단 토글 (체크 / 해제)
  const handleToggleParagraph = (paragraph: StandardParagraph) => {
    setSelectedParagraphs(prev => {
      const exists = prev.some(p => p.id === paragraph.id);
      if (exists) {
        return prev.filter(p => p.id !== paragraph.id);
      } else {
        return [...prev, paragraph];
      }
    });
  };

  // 현재 보이는 문단 전체 선택
  const handleSelectAllVisible = (paragraphs: StandardParagraph[]) => {
    setSelectedParagraphs(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const toAdd = paragraphs.filter(p => !existingIds.has(p.id));
      return [...prev, ...toAdd];
    });
  };

  // 현재 보이는 문단 전체 해제
  const handleDeselectAllVisible = (paragraphIds: string[]) => {
    const removeSet = new Set(paragraphIds);
    setSelectedParagraphs(prev => prev.filter(p => !removeSet.has(p.id)));
  };

  // 선택 문단 개별 삭제
  const handleRemoveParagraph = (id: string) => {
    setSelectedParagraphs(prev => prev.filter(p => p.id !== id));
  };

  // 문단 순서 위로 이동
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSelectedParagraphs(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  // 문단 순서 아래로 이동
  const handleMoveDown = (index: number) => {
    if (index === selectedParagraphs.length - 1) return;
    setSelectedParagraphs(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  // 전체 선택 비우기
  const handleClearAll = () => {
    setSelectedParagraphs([]);
  };

  // 전체 초기화
  const handleResetAll = () => {
    setSelectedParagraphs([INITIAL_STANDARDS[0].paragraphs[0], INITIAL_STANDARDS[0].paragraphs[3]]);
    setConfig({
      maxCharsPerLine: 45,
      includeStandardTitle: true,
      includeSectionTitle: true,
      paragraphNumberFormat: 'raw',
      theme: 'audit_gray',
      addBlankLineBetweenParagraphs: false,
      alignNumberToTop: true,
    });
  };

  // 사내 DB 임포트
  const handleImportStandards = (newStandards: AccountingStandard[]) => {
    setStandards(newStandards);
    if (newStandards.length > 0) {
      setSelectedStandardId(newStandards[0].id);
      setSelectedParagraphs([]);
    }
  };

  // 총 문단 개수 계산
  const totalParagraphCount = useMemo(() => {
    return standards.reduce((acc, s) => acc + s.paragraphs.length, 0);
  }, [standards]);

  // 실시간 엑셀 그리드 셀 데이터 생성
  const formattedCells = useMemo(() => {
    return generateFormattedCells(currentStandard, selectedParagraphs, config);
  }, [currentStandard, selectedParagraphs, config]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 antialiased font-sans">
      {/* 상단 네비게이션 */}
      <Navbar
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenVbaGuide={() => setIsVbaModalOpen(true)}
        onResetAll={handleResetAll}
        standardCount={standards.length}
        totalParagraphs={totalParagraphCount}
      />

      {/* 메인 3컬럼 워크스페이스 레이아웃 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[700px]">
          
          {/* 컬럼 1: 기준서 탐색 및 문단 선택 (4 cols) */}
          <div className="lg:col-span-4 h-full flex flex-col">
            <StandardBrowser
              standards={standards}
              selectedStandardId={selectedStandardId}
              onSelectStandard={setSelectedStandardId}
              selectedParagraphs={selectedParagraphs}
              onToggleParagraph={handleToggleParagraph}
              onSelectAllVisible={handleSelectAllVisible}
              onDeselectAllVisible={handleDeselectAllVisible}
            />
          </div>

          {/* 컬럼 2: 선택된 문단 관리 & 서식 설정 (3.5 cols) */}
          <div className="lg:col-span-3 h-full flex flex-col space-y-4 overflow-y-auto pr-1">
            <div className="flex-1 min-h-[300px]">
              <SelectedList
                selectedParagraphs={selectedParagraphs}
                onRemoveParagraph={handleRemoveParagraph}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onClearAll={handleClearAll}
                config={config}
              />
            </div>
            <div className="shrink-0">
              <ExportSettings
                config={config}
                onChangeConfig={setConfig}
                defaultStandardTitle={currentStandard ? `${currentStandard.code} ${currentStandard.title}` : ''}
              />
            </div>
          </div>

          {/* 컬럼 3: 실시간 엑셀 그리드 미리보기 및 복사 (4.5 cols) */}
          <div className="lg:col-span-5 h-full flex flex-col">
            <ExcelPreviewGrid
              cells={formattedCells}
              config={config}
              standardTitle={currentStandard ? currentStandard.title : '기준서'}
            />
          </div>

        </div>
      </main>

      {/* 모달 1: VBA 매크로 및 단축키 안내 */}
      <VbaSnippetModal
        isOpen={isVbaModalOpen}
        onClose={() => setIsVbaModalOpen(false)}
      />

      {/* 모달 2: 사내 DB 임포트 */}
      <ImportCustomDbModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportStandards={handleImportStandards}
      />
    </div>
  );
}
