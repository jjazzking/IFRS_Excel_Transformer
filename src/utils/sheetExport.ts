import * as XLSX from 'xlsx';
import { CellShade, ClipboardExportResult, SheetTable, TableTheme } from '../types';
import { getThemeStyles, numericTd, styleAttr, totalTd } from './tableTheme';

/**
 * 여러 열짜리 표를 엑셀 조서에 붙일 수 있는 형태로 바꾼다.
 *
 * 기준서 문단은 `textSplitter` 가 2열로 만들지만, 환율처럼 열이 여럿인 자료는
 * 여기를 쓴다. 서식(테두리·음영)은 두 쪽이 같은 `tableTheme` 을 본다.
 */

/** 숫자를 조서에 적히는 모양으로. 천단위 쉼표는 넣되 자릿수는 열이 정한다. */
export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function cellText(value: string | number | null, digits?: number): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'number' ? formatNumber(value, digits ?? 2) : value;
}

/**
 * 음영 색 — 엑셀 기본 팔레트의 노랑 두 단계. 조서에서 형광펜으로 칠하는 그 색이다.
 * 미리보기(`SHADE_PREVIEW_CLASS`)와 같은 색을 쓴다.
 */
export const SHADE_FILL: Record<CellShade, string> = {
  soft: '#FFF2CC',
  strong: '#FFD966',
};

function shadeCss(shade: CellShade | null | undefined): string {
  return shade ? ` background-color: ${SHADE_FILL[shade]}; mso-pattern: auto;` : '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateSheetClipboard(
  table: SheetTable,
  theme: TableTheme
): ClipboardExportResult {
  const styles = getThemeStyles(theme);
  const numStyle = numericTd(styles);
  const totalStyle = totalTd(styles);
  const colCount = table.columns.length;

  // --- TSV: 엑셀이 탭/개행으로 그대로 받아들이는 형식 -------------------
  // 붙여넣고 나서 계산에 쓰려면 숫자가 숫자로 들어가야 한다. 쉼표를 넣으면
  // 엑셀이 문자열로 읽는 경우가 있어, TSV 에는 서식 없는 숫자를 적는다.
  const lines: string[] = [];
  if (table.title) lines.push(table.title);
  lines.push(table.columns.map(c => c.label).join('\t'));
  table.rows.forEach(row => {
    lines.push(
      row.cells
        .map(v => (typeof v === 'number' ? String(v) : (v ?? '').toString().replace(/\t/g, ' ')))
        .join('\t')
    );
  });
  if (table.footnote) lines.push(table.footnote);
  const tsv = lines.join('\r\n');

  // --- HTML: 엑셀이 테두리와 음영까지 읽는 형식 -------------------------
  let body = '';
  if (table.title) {
    body += `<tr><td colspan="${colCount}" style="${styleAttr(styles.titleTd)}">${escapeHtml(table.title)}</td></tr>`;
  }
  body += '<tr>';
  table.columns.forEach(c => {
    body += `<td style="${styleAttr(`${styles.sectionTd} text-align: center;${shadeCss(c.shade)}`)}">${escapeHtml(c.label)}</td>`;
  });
  body += '</tr>';

  table.rows.forEach(row => {
    body += '<tr>';
    row.cells.forEach((value, i) => {
      const col = table.columns[i];
      const isNum = typeof value === 'number';
      const style = row.emphasis === 'total' ? totalStyle : isNum ? numStyle : styles.colATd;
      body += `<td style="${styleAttr(style + shadeCss(row.shades?.[i]))}">${escapeHtml(cellText(value, col?.digits)) || '&nbsp;'}</td>`;
    });
    body += '</tr>';
  });

  if (table.footnote) {
    body += `<tr><td colspan="${colCount}" style="${styleAttr(`${styles.emptyRowTd} text-align: left; padding: 3px 6px; font-size: 8pt; color: #595959;`)}">${escapeHtml(table.footnote)}</td></tr>`;
  }

  const colgroup = table.columns
    .map(c => `<col width="${(c.width ?? 12) * 8}" style="width: ${(c.width ?? 12) * 6}pt;">`)
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="content-type" content="text/html; charset=utf-8">
<style>table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }</style>
</head>
<body>
<!--StartFragment-->
<table border="1" cellpadding="0" cellspacing="0" style="${styleAttr(styles.tableStyle)}">
<colgroup>${colgroup}</colgroup>
<tbody>
${body}
</tbody>
</table>
<!--EndFragment-->
</body>
</html>`;

  return { tsv, html, rowCount: table.rows.length, cells: [] };
}

/**
 * .xlsx 로 내려받는다. 이 라이브러리(SheetJS 무료판)는 칸 서식을 쓰지 못해 음영은 빠진다 —
 * 음영까지 필요하면 '조서에 붙여넣기(서식 유지)'를 쓴다.
 */
export function exportSheetToExcelFile(table: SheetTable, fileName: string, sheetName = '환율') {
  const aoa: (string | number | null)[][] = [];
  if (table.title) aoa.push([table.title]);
  aoa.push(table.columns.map(c => c.label));
  table.rows.forEach(r => aoa.push(r.cells));
  if (table.footnote) aoa.push([table.footnote]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = table.columns.map(c => ({ wch: c.width ?? 12 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}
