import * as XLSX from 'xlsx';
import { 
  AccountingStandard, 
  StandardParagraph, 
  ExportConfig, 
  FormattedCell, 
  ClipboardExportResult, 
  ParagraphNumberFormat,
  TableTheme 
} from '../types';

/**
 * 포맷에 따른 문단 번호 변환
 */
export function formatParagraphNumber(numberStr: string, format: ParagraphNumberFormat): string {
  const cleanNum = numberStr.replace(/^[제\s]+|[호\s]+$/g, '').trim();
  switch (format) {
    case 'raw':
      return cleanNum;
    case 'bracket':
      return `[${cleanNum}]`;
    case 'korean':
      return `제${cleanNum}호`;
    case 'hash':
      return `#${cleanNum}`;
    default:
      return cleanNum;
  }
}

/**
 * 문장 보존형 스마트 텍스트 분할 알고리즘
 * - 개행문자(\n) 우선 분리
 * - 글자수 초과 시 마침표(.), 쉼표(,), 괄호, 공백 등을 탐색하여 문장 의미가 훼손되지 않게 다음 줄로 내림
 */
export function splitContentSmart(text: string, maxChars: number): string[] {
  if (!text) return [];
  const lines: string[] = [];

  // 원문에 포함된 개행 기준으로 먼저 분리 (예: (1), (2) 리스트 항목 등)
  const rawParagraphs = text.split(/\r?\n/).map(p => p.trim()).filter(Boolean);

  for (const paragraph of rawParagraphs) {
    if (paragraph.length <= maxChars) {
      lines.push(paragraph);
      continue;
    }

    let remaining = paragraph;

    while (remaining.length > 0) {
      if (remaining.length <= maxChars) {
        lines.push(remaining.trim());
        break;
      }

      // maxChars 범위 내에서 가장 적절한 분할 지점 탐색
      const searchWindow = remaining.slice(0, maxChars + 5); // 약간의 유연성을 두어 탐색

      // 1순위: 마침표 + 공백
      const periodIdx = searchWindow.lastIndexOf('. ');
      // 2순위: 닫는 괄호 + 공백
      const parenIdx = searchWindow.lastIndexOf(') ');
      // 3순위: 세미콜론/콜론 + 공백
      const semiIdx = searchWindow.search(/[:;]\s/);
      // 4순위: 쉼표 + 공백
      const commaIdx = searchWindow.lastIndexOf(', ');
      // 5순위: 일반 공백
      const spaceIdx = searchWindow.lastIndexOf(' ');

      let splitPoint = -1;

      if (periodIdx !== -1 && periodIdx >= maxChars * 0.55 && periodIdx <= maxChars + 3) {
        splitPoint = periodIdx + 1; // 마침표 포함
      } else if (parenIdx !== -1 && parenIdx >= maxChars * 0.55 && parenIdx <= maxChars + 3) {
        splitPoint = parenIdx + 1; // 괄호 포함
      } else if (commaIdx !== -1 && commaIdx >= maxChars * 0.6 && commaIdx <= maxChars + 2) {
        splitPoint = commaIdx + 1; // 쉼표 포함
      } else if (semiIdx !== -1 && semiIdx >= maxChars * 0.6 && semiIdx <= maxChars) {
        splitPoint = semiIdx + 1;
      } else if (spaceIdx !== -1 && spaceIdx >= maxChars * 0.6) {
        splitPoint = spaceIdx;
      } else {
        // 끊을 만한 문장 부호가 없다면 maxChars에서 분할
        splitPoint = maxChars;
      }

      const chunk = remaining.slice(0, splitPoint).trim();
      if (chunk) {
        lines.push(chunk);
      }
      remaining = remaining.slice(splitPoint).trim();
    }
  }

  return lines;
}

/**
 * 엑셀 상대 위치(Row 1 ~ N, Col A & B) 셀 배열 생성기
 */
export function generateFormattedCells(
  standard: AccountingStandard | null,
  paragraphs: StandardParagraph[],
  config: ExportConfig
): FormattedCell[] {
  const cells: FormattedCell[] = [];
  let currentRow = 1;

  // 1) A1: 기준서 제목
  if (config.includeStandardTitle && standard) {
    cells.push({
      relativeRow: currentRow++,
      colA: config.customHeaderTitle || `${standard.code} ${standard.title}`,
      colB: '',
      isHeaderRow: true,
      isStandardTitle: true
    });
  }

  // 2) A2: 대표 섹션 제목 또는 소제목 (선택된 첫 문단의 섹션명 등)
  if (config.includeSectionTitle && paragraphs.length > 0) {
    const firstSec = paragraphs[0].sectionTitle || paragraphs[0].subTitle || '기준서 주요 발췌 문단';
    cells.push({
      relativeRow: currentRow++,
      colA: firstSec,
      colB: '',
      isHeaderRow: true,
      isSectionTitle: true
    });
  }

  // 3) 각 문단별 A열(문단번호), B열(분할 본문) 배치
  paragraphs.forEach((p, pIndex) => {
    const lines = splitContentSmart(p.content, config.maxCharsPerLine);
    const formattedNum = formatParagraphNumber(p.number, config.paragraphNumberFormat);

    if (lines.length === 0) {
      cells.push({
        relativeRow: currentRow++,
        colA: formattedNum,
        colB: '',
        isParagraphStart: true,
        paragraphId: p.id
      });
    } else {
      lines.forEach((line, lineIndex) => {
        const isFirstLine = lineIndex === 0;
        cells.push({
          relativeRow: currentRow++,
          colA: isFirstLine ? formattedNum : '', // 첫 줄에만 문단번호, 이후는 빈 셀
          colB: line,
          isParagraphStart: isFirstLine,
          paragraphId: p.id
        });
      });
    }

    // 문단 사이 빈 행 추가 옵션
    if (config.addBlankLineBetweenParagraphs && pIndex < paragraphs.length - 1) {
      cells.push({
        relativeRow: currentRow++,
        colA: '',
        colB: '',
        isParagraphStart: false
      });
    }
  });

  return cells;
}

/**
 * 테마별 CSS/HTML 스타일 매핑
 */
function getThemeStyles(theme: TableTheme) {
  switch (theme) {
    case 'audit_gray': // 전통 감사조서 스타일 (연한 회색 헤더 + 얇은 회색 격자 테두리)
      return {
        tableStyle: 'border-collapse: collapse; border: 1px solid #7F7F7F; font-family: "Malgun Gothic", "맑은 고딕", Dotum, sans-serif; font-size: 10pt; width: 100%;',
        titleTd: 'border: 1px solid #7F7F7F; background-color: #D9D9D9; font-weight: bold; padding: 5px 8px; text-align: left; mso-border-alt: solid #7F7F7F .5pt;',
        sectionTd: 'border: 1px solid #7F7F7F; background-color: #F2F2F2; font-weight: bold; padding: 4px 8px; text-align: left; mso-border-alt: solid #7F7F7F .5pt;',
        colATd: 'border: 1px solid #A6A6A6; background-color: #F2F2F2; text-align: center; vertical-align: top; font-weight: bold; padding: 4px 6px; width: 55pt; mso-border-alt: solid #A6A6A6 .5pt;',
        colBTd: 'border: 1px solid #A6A6A6; background-color: #FFFFFF; text-align: left; vertical-align: top; padding: 4px 8px; mso-number-format:"\\@"; mso-border-alt: solid #A6A6A6 .5pt;',
        emptyRowTd: 'border: 1px solid #D9D9D9; background-color: #FFFFFF; height: 14px; mso-border-alt: solid #D9D9D9 .5pt;'
      };
    case 'audit_blue': // 회계법인 블루 톤앤매너
      return {
        tableStyle: 'border-collapse: collapse; border: 1px solid #1F4E78; font-family: "Malgun Gothic", "맑은 고딕", Dotum, sans-serif; font-size: 10pt; width: 100%;',
        titleTd: 'border: 1px solid #1F4E78; background-color: #1F4E78; color: #FFFFFF; font-weight: bold; padding: 5px 8px; text-align: left; mso-border-alt: solid #1F4E78 .5pt;',
        sectionTd: 'border: 1px solid #2F5597; background-color: #D9E1F2; font-weight: bold; color: #1F4E78; padding: 4px 8px; text-align: left; mso-border-alt: solid #2F5597 .5pt;',
        colATd: 'border: 1px solid #8EA9DB; background-color: #F2F5F9; text-align: center; vertical-align: top; font-weight: bold; color: #1F4E78; padding: 4px 6px; width: 55pt; mso-border-alt: solid #8EA9DB .5pt;',
        colBTd: 'border: 1px solid #8EA9DB; background-color: #FFFFFF; text-align: left; vertical-align: top; padding: 4px 8px; mso-number-format:"\\@"; mso-border-alt: solid #8EA9DB .5pt;',
        emptyRowTd: 'border: 1px solid #D9D9D9; background-color: #FFFFFF; height: 14px; mso-border-alt: solid #D9D9D9 .5pt;'
      };
    case 'classic_accounting': // 굵은 상하 테두리 회계 조서
      return {
        tableStyle: 'border-collapse: collapse; border-top: 2px solid #000000; border-bottom: 2px solid #000000; font-family: "Malgun Gothic", "맑은 고딕", Dotum, sans-serif; font-size: 10pt; width: 100%;',
        titleTd: 'border-top: 2px solid #000000; border-bottom: 1px solid #000000; border-left: none; border-right: none; font-weight: bold; padding: 5px 8px; text-align: left; background-color: #FFFFFF;',
        sectionTd: 'border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: none; border-right: none; font-weight: bold; padding: 4px 8px; text-align: left; background-color: #F9F9F9;',
        colATd: 'border-top: 1px solid #D9D9D9; border-bottom: 1px solid #D9D9D9; border-left: none; border-right: 1px solid #D9D9D9; text-align: center; vertical-align: top; font-weight: bold; padding: 4px 6px; width: 55pt;',
        colBTd: 'border-top: 1px solid #D9D9D9; border-bottom: 1px solid #D9D9D9; border-left: none; border-right: none; background-color: #FFFFFF; text-align: left; vertical-align: top; padding: 4px 8px; mso-number-format:"\\@";',
        emptyRowTd: 'border-top: 1px solid #D9D9D9; border-bottom: 1px solid #D9D9D9; border-left: none; border-right: none; height: 14px;'
      };
    case 'minimal': // 테두리 최소화
      return {
        tableStyle: 'border-collapse: collapse; font-family: "Malgun Gothic", "맑은 고딕", Dotum, sans-serif; font-size: 10pt; width: 100%;',
        titleTd: 'font-weight: bold; padding: 4px 6px; text-align: left; border-bottom: 1px solid #D9D9D9;',
        sectionTd: 'font-weight: bold; padding: 4px 6px; text-align: left; color: #4A5568; border-bottom: 1px solid #E0E0E0;',
        colATd: 'text-align: center; vertical-align: top; font-weight: bold; padding: 3px 6px; width: 50pt; border-bottom: 1px solid #F0F0F0;',
        colBTd: 'text-align: left; vertical-align: top; padding: 3px 6px; mso-number-format:"\\@"; border-bottom: 1px solid #F0F0F0;',
        emptyRowTd: 'height: 12px; border-bottom: 1px solid #F0F0F0;'
      };
    case 'standard':
    default: // 기본 표준 (완전한 상하좌우 격자 테두리)
      return {
        tableStyle: 'border-collapse: collapse; border: 1px solid #A6A6A6; font-family: "Malgun Gothic", "맑은 고딕", Dotum, sans-serif; font-size: 10pt; width: 100%;',
        titleTd: 'border: 1px solid #A6A6A6; background-color: #E7E6E6; font-weight: bold; padding: 5px 8px; text-align: left; mso-border-alt: solid #A6A6A6 .5pt;',
        sectionTd: 'border: 1px solid #A6A6A6; background-color: #F2F2F2; font-weight: bold; padding: 4px 8px; text-align: left; mso-border-alt: solid #A6A6A6 .5pt;',
        colATd: 'border: 1px solid #BFBFBF; background-color: #F8F9FA; text-align: center; vertical-align: top; font-weight: bold; padding: 4px 6px; width: 55pt; mso-border-alt: solid #BFBFBF .5pt;',
        colBTd: 'border: 1px solid #BFBFBF; background-color: #FFFFFF; text-align: left; vertical-align: top; padding: 4px 8px; mso-number-format:"\\@"; mso-border-alt: solid #BFBFBF .5pt;',
        emptyRowTd: 'border: 1px solid #D9D9D9; background-color: #FFFFFF; height: 14px; mso-border-alt: solid #D9D9D9 .5pt;'
      };
  }
}

/**
 * 엑셀 클립보드 데이터(TSV + HTML) 생성
 */
export function generateClipboardData(cells: FormattedCell[], config: ExportConfig): ClipboardExportResult {
  // 1. TSV 생성 (Excel이 기본 탭/개행 파싱으로 붙여넣는 방식)
  const tsvLines = cells.map(cell => {
    const colA = (cell.colA || '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    const colB = (cell.colB || '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    return `${colA}\t${colB}`;
  });
  const tsv = tsvLines.join('\r\n');

  // 2. HTML Table 생성 (Excel에 붙여넣을 때 테두리, 배경색, 열 너비가 완벽하게 유지되는 MS Office 호환 HTML)
  const theme = getThemeStyles(config.theme);
  
  let tableRows = '';

  cells.forEach(cell => {
    if (cell.isStandardTitle) {
      tableRows += `<tr><td colspan="2" style="${theme.titleTd}">${escapeHtml(cell.colA)}</td></tr>`;
    } else if (cell.isSectionTitle) {
      tableRows += `<tr><td colspan="2" style="${theme.sectionTd}">${escapeHtml(cell.colA)}</td></tr>`;
    } else if (!cell.colA && !cell.colB) {
      tableRows += `<tr><td style="${theme.emptyRowTd}">&nbsp;</td><td style="${theme.emptyRowTd}">&nbsp;</td></tr>`;
    } else {
      const colAVal = cell.colA ? escapeHtml(cell.colA) : '&nbsp;';
      const colBVal = cell.colB ? escapeHtml(cell.colB) : '&nbsp;';
      tableRows += `<tr><td style="${theme.colATd}">${colAVal}</td><td style="${theme.colBTd}">${colBVal}</td></tr>`;
    }
  });

  // MS Excel 전용 클립보드 HTML 래퍼 구조
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>조서추출</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<meta http-equiv="content-type" content="text/html; charset=utf-8">
<style>
  table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  td { mso-number-format: "\\@"; white-space: normal; }
</style>
</head>
<body>
<!--StartFragment-->
<table border="1" cellpadding="0" cellspacing="0" style="${theme.tableStyle}">
<colgroup>
  <col width="75" style="width: 55pt; mso-width-source: userset; mso-width-alt: 2400;">
  <col width="650" style="width: 480pt; mso-width-source: userset; mso-width-alt: 18000;">
</colgroup>
<tbody>
${tableRows}
</tbody>
</table>
<!--EndFragment-->
</body>
</html>`;

  return {
    tsv,
    html,
    rowCount: cells.length,
    cells
  };
}

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 엑셀 파일(.xlsx)로 즉시 다운로드
 */
export function exportToExcelFile(cells: FormattedCell[], fileName: string = '회계기준서_조서발췌.xlsx') {
  const data: string[][] = [];

  cells.forEach(c => {
    if (c.isStandardTitle || c.isSectionTitle) {
      data.push([c.colA, '']);
    } else {
      data.push([c.colA, c.colB]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // 열 너비 지정
  ws['!cols'] = [
    { wch: 14 }, // A열 (문단번호)
    { wch: 75 }  // B열 (본문)
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '기준서발췌');
  XLSX.writeFile(wb, fileName);
}
