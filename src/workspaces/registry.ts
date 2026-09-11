/**
 * 이 도구가 담는 작업 하나하나를 '작업대(workspace)'라고 부른다.
 *
 * 작업대는 모두 같은 모양이다 — 왼쪽에서 찾고, 오른쪽 엑셀 미리보기에서 바로 조서에
 * 붙여넣는다. 찾는 대상만 다르다 (기준서 문단 / 이자율 / 환율 / 소송 사건).
 * 첫 화면은 이 목록을 카드로 늘어놓은 것이고, 카드를 누르면 그 작업대로 들어간다.
 */
import { BookOpen, Gavel, LucideIcon, Percent, Landmark } from 'lucide-react';

export type WorkspaceId = 'standards' | 'rates' | 'fx' | 'litigation';

export type WorkspaceStatus = 'ready' | 'preparing';

export interface WorkspaceMeta {
  id: WorkspaceId;
  /** 카드와 헤더에 쓰는 이름 */
  name: string;
  /** 무엇을 찾는 작업대인지 한 줄로 */
  tagline: string;
  /** 카드 뒷면의 설명 — 어떤 조서를 만들 때 쓰는지 */
  description: string;
  /** 왼쪽 구역에서 찾는 것 / 오른쪽 구역에 담기는 것 */
  leftPane: string;
  rightPane: string;
  icon: LucideIcon;
  status: WorkspaceStatus;
  /** 준비 중일 때, 무엇이 준비되면 열리는지 */
  blockedBy?: string;
  /** 카드 색 (tailwind 클래스 조각) */
  accent: 'emerald' | 'sky' | 'amber' | 'violet';
}

export const WORKSPACES: WorkspaceMeta[] = [
  {
    id: 'standards',
    name: '기준서 찾기',
    tagline: '회계기준서 문단을 찾아 조서에 인용한다',
    description:
      '기준서 40건 · 문단 3,661건을 통합검색하고, 담은 문단을 조서 양식대로 줄바꿈해 엑셀에 붙여넣는다.',
    leftPane: '기준서 목록 · 목차 · 본문',
    rightPane: '인용함 + 엑셀 미리보기',
    icon: BookOpen,
    status: 'ready',
    accent: 'emerald',
  },
  {
    id: 'rates',
    name: '이자율 찾기',
    tagline: '국고채·회사채 수익률을 날짜로 찾는다',
    description:
      '리스 할인율, 현재가치 할인, 충당부채 할인에 쓰는 시장이자율을 기준일로 찾아 조서에 붙여넣는다.',
    leftPane: '만기·등급·기준일로 이자율 조회',
    rightPane: '고른 이자율 표 + 엑셀 미리보기',
    icon: Percent,
    status: 'preparing',
    blockedBy: '금리 데이터 출처 확정 (한국은행 ECOS · 금융투자협회)',
    accent: 'sky',
  },
  {
    id: 'fx',
    name: '환율 찾기',
    tagline: '기말환율·평균환율을 통화와 기간으로 찾는다',
    description:
      '서울외국환중개 고시 매매기준율을 통화·기간으로 뽑고, 기간 평균환율과 기말환율까지 계산해 붙여넣는다.',
    leftPane: '통화·기간으로 환율 조회',
    rightPane: '담은 날짜 + 평균·기말 + 엑셀 미리보기',
    icon: Landmark,
    status: 'ready',
    accent: 'amber',
  },
  {
    id: 'litigation',
    name: '사건번호 찾기',
    tagline: '소송 사건번호로 진행 상황을 확인한다',
    description:
      '소송충당부채·우발부채 조서에 쓰는 사건 진행 내역을 사건번호로 찾아 표로 정리한다.',
    leftPane: '법원·사건번호로 조회',
    rightPane: '사건 진행 내역 + 엑셀 미리보기',
    icon: Gavel,
    status: 'preparing',
    blockedBy: '대법원 사건검색은 공개 API가 없어 입력 방식부터 정해야 함',
    accent: 'violet',
  },
];

export const WORKSPACE_BY_ID = new Map(WORKSPACES.map(w => [w.id, w]));

/** 주소창의 `#/rates` 같은 조각을 작업대 id 로 읽는다. 모르는 값이면 첫 화면. */
export function parseRoute(hash: string): WorkspaceId | 'home' {
  const id = hash.replace(/^#\/?/, '').split('?')[0] as WorkspaceId;
  return WORKSPACE_BY_ID.has(id) ? id : 'home';
}
