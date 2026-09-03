import React, { useState, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { StandardBrowser } from './components/StandardBrowser';
import { ExcelPreviewGrid } from './components/ExcelPreviewGrid';
import { VbaSnippetModal } from './components/VbaSnippetModal';
import { ImportCustomDbModal } from './components/ImportCustomDbModal';

import { AccountingStandard, StandardParagraph, ExportConfig } from './types';
import { ALL_STANDARDS } from './data/standardsData';
import { generateFormattedCells } from './utils/textSplitter';
import { sortParagraphsByStandardAndNumber } from './utils/paragraphSorter';

// 첫 화면에서 미리 선택해 둘 문단(첫 기준서의 앞 두 문단). 기준서 DB 가 비어 있어도 안전하다.
const DEFAULT_PARAGRAPHS: StandardParagraph[] = ALL_STANDARDS[0]?.paragraphs.slice(0, 2) ?? [];

export default function App() {
  // 기준서 데이터베이스 상태
  const [standards, setStandards] = useState<AccountingStandard[]>(ALL_STANDARDS);
  const [selectedStandardId, setSelectedStandardId] = useState<string>(ALL_STANDARDS[0]?.id ?? '');

  // 선택된 문단들
  const [selectedParagraphs, setSelectedParagraphs] = useState<StandardParagraph[]>([
    ...DEFAULT_PARAGRAPHS,
  ]);

  // 서식 및 추출 설정
  const [config, setConfig] = useState<ExportConfig>({
    maxCharsPerLine: 45, // 기본 45자 (실무 조서의 B열 기본 폭에 최적화)
    includeStandardTitle: true, // A1: 기준서명
    includeSectionTitle: true, // 문단제목 행
    sectionTitleLevel: 'both', // 대분류 > 소분류 를 함께 표기
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
        const enriched: StandardParagraph = {
          ...paragraph,
          standardId: paragraph.standardId || currentStandard?.id,
          standardCode: paragraph.standardCode || currentStandard?.code,
          standardTitle: paragraph.standardTitle || currentStandard?.title,
        };
        return [...prev, enriched];
      }
    });
  };

  // 현재 보이는 문단 전체 선택
  const handleSelectAllVisible = (paragraphs: StandardParagraph[]) => {
    setSelectedParagraphs(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const toAdd = paragraphs
        .filter(p => !existingIds.has(p.id))
        .map(p => ({
          ...p,
          standardId: p.standardId || currentStandard?.id,
          standardCode: p.standardCode || currentStandard?.code,
          standardTitle: p.standardTitle || currentStandard?.title,
        }));
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

  // 기준서별 문단 번호 정렬
  const handleSortParagraphs = (direction: 'asc' | 'desc' = 'asc') => {
    setSelectedParagraphs(prev => sortParagraphsByStandardAndNumber(prev, direction));
  };

  // 전체 선택 비우기
  const handleClearAll = () => {
    setSelectedParagraphs([]);
  };

  // 전체 초기화
  const handleResetAll = () => {
    setSelectedParagraphs([...DEFAULT_PARAGRAPHS]);
    setConfig({
      maxCharsPerLine: 45,
      includeStandardTitle: true,
      includeSectionTitle: true,
      sectionTitleLevel: 'both',
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

      {/* 메인 2컬럼 레이아웃: 좌측(기준서 탐색 및 선택) vs 우측(서식 설정 툴바 & 엑셀 시뮬레이션) */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-5 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-130px)] min-h-[720px]">
          
          {/* 컬럼 1 (좌측 5 cols): 기준서 탐색, 필터 및 문단 체크 */}
          <div className="lg:col-span-5 h-full flex flex-col min-h-0">
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

          {/* 컬럼 2 (우측 7 cols): 상시 서식 설정 툴바 + 실시간 엑셀 시뮬레이터 & 원클릭 복사 */}
          <div className="lg:col-span-7 h-full flex flex-col min-h-0">
            <ExcelPreviewGrid
              cells={formattedCells}
              config={config}
              onChangeConfig={setConfig}
              standardTitle={currentStandard ? currentStandard.title : '기준서'}
              selectedParagraphs={selectedParagraphs}
              onRemoveParagraph={handleRemoveParagraph}
              onClearAll={handleClearAll}
              onSortParagraphs={handleSortParagraphs}
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
