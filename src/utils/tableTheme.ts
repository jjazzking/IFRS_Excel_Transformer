/**
 * 엑셀에 붙여넣을 때 살아남는 표 서식.
 *
 * 클립보드로 넘기는 HTML 은 브라우저 화면용이 아니라 엑셀이 읽는 것이다. 그래서
 * 클래스가 아니라 인라인 style 로 쓰고, 테두리는 mso-border-alt 를 같이 적는다.
 * 기준서 문단 표(2열)와 환율 같은 여러 열짜리 표가 같은 서식을 쓰도록 여기 모아 둔다.
 */
import { TableTheme } from '../types';

export interface TableThemeStyles {
  tableStyle: string;
  /** 표 맨 위 제목 행 (열 전체를 가로지른다) */
  titleTd: string;
  /** 구분 행 — 문단제목, 표의 열 머리글 */
  sectionTd: string;
  /** 왼쪽 좁은 열 — 문단번호, 날짜 같은 라벨 */
  colATd: string;
  /** 본문 열 */
  colBTd: string;
  emptyRowTd: string;
}

export function getThemeStyles(theme: TableTheme): TableThemeStyles {
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

/** 숫자 열은 오른쪽으로 붙이고, 엑셀이 문자열로 받지 않도록 텍스트 서식을 뗀다. */
export function numericTd(theme: TableThemeStyles): string {
  return theme.colBTd
    .replace(/text-align:\s*left;?/, 'text-align: right;')
    .replace(/mso-number-format:"\\@";?/, '')
    .concat(' font-family: Consolas, "맑은 고딕", monospace;');
}

/** 합계·평균처럼 눈에 띄어야 하는 행 */
export function totalTd(theme: TableThemeStyles): string {
  return `${numericTd(theme)} font-weight: bold; background-color: #F2F2F2;`;
}
