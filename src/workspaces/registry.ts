/**
 * 이 도구가 담는 작업 하나하나를 '작업대(workspace)'라고 부른다.
 *
 * 작업대는 모두 같은 모양이다 — 왼쪽에서 찾고, 오른쪽 엑셀 미리보기에서 바로 조서에
 * 붙여넣는다. 찾는 대상만 다르다 (기준서 문단 / 이자율 / 환율 / 소송 사건).
 * 첫 화면은 이 목록을 카드로 늘어놓은 것이고, 카드를 누르면 그 작업대로 들어간다.
 */
import {
  BookOpen,
  Gavel,
  LucideIcon,
  Percent,
  Landmark,
  ScrollText,
  MapPin,
  TrendingUp,
} from 'lucide-react';

export type WorkspaceId =
  | 'standards'
  | 'rates'
  | 'fx'
  | 'minutes'
  | 'litigation'
  | 'landprice'
  | 'stocks';

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
  accent: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose' | 'teal' | 'indigo';
  /**
   * 사용자에게 보이지 않게 숨긴다. 코드는 그대로 두되, 첫 화면 카드에서 빠지고
   * 주소창으로 직접 들어와도(`#/minutes`) 첫 화면으로 돌려보낸다.
   */
  hidden?: boolean;
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
    tagline: '금투협 시가평가수익률을 기준일로 찾는다',
    description:
      '리스·충당부채·퇴직급여 할인율을 금융투자협회 채권시가평가수익률(평가사 평균) 표에서 찾고, 쓴 행·열에 음영을 칠해 근거 문단과 함께 붙여넣는다.',
    leftPane: '용도·기준일·등급·만기로 조회',
    rightPane: '음영 칠한 수익률 표 + 엑셀 미리보기',
    icon: Percent,
    status: 'ready',
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
    id: 'minutes',
    name: '의사록 읽기',
    tagline: '이사회 의사록에서 회의 사실과 의안을 뽑는다',
    description:
      '의사록 PDF 를 규칙만으로 읽어 일시·장소·출석 인원을 뽑고, 각 값이 원문 어디에서 나왔는지 함께 보여준다. 파일은 브라우저 밖으로 나가지 않는다.',
    leftPane: '의사록 원본 PDF',
    rightPane: '뽑아낸 정규 스키마 + 검토 필요 표시',
    icon: ScrollText,
    status: 'ready',
    accent: 'rose',
    // 숨김 — 저장소 주인이 따로 말하기 전까지 다시 켜거나 기능을 더 발전시키지 않는다.
    hidden: true,
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
  {
    id: 'landprice',
    name: '공시지가 찾기',
    tagline: '엑셀에서 긁어온 주소로 개별공시지가를 한 번에 찾는다',
    description:
      '엑셀 파일을 올릴 필요 없이 조서의 주소 열을 그대로 복사해 붙여넣으면, 주소마다 개별공시지가를 한꺼번에 찾아 같은 순서로 다시 붙여넣을 수 있게 정리한다.',
    leftPane: '엑셀에서 복사한 주소 붙여넣기',
    rightPane: '주소별 공시지가 + 엑셀 미리보기',
    icon: MapPin,
    status: 'preparing',
    blockedBy: '공시지가 조회 API(국토교통부 등)와 주소 → 필지 변환 방식부터 정해야 함',
    accent: 'teal',
  },
  {
    id: 'stocks',
    name: '주가 찾기',
    tagline: '상장주식 종가를 특정일·회계기간으로 찾는다',
    description:
      '상장주식 한 종목씩, 또는 여러 종목을 한 번에 넣어 특정일 종가나 회계기간의 일별 주가·평균을 찾아 붙여넣는다.',
    leftPane: '종목(여러 개 가능) · 기준일 또는 기간',
    rightPane: '종목별 주가 표 + 엑셀 미리보기',
    icon: TrendingUp,
    status: 'preparing',
    blockedBy: '주가 데이터 출처(KRX 정보데이터시스템 등)와 수정주가 적용 여부부터 정해야 함',
    accent: 'indigo',
  },
];

export const WORKSPACE_BY_ID = new Map(WORKSPACES.map(w => [w.id, w]));

/** 사용자에게 보이는 작업대만 — 첫 화면 카드는 이 목록을 따른다. */
export const VISIBLE_WORKSPACES = WORKSPACES.filter(w => !w.hidden);

/** 주소창의 `#/rates` 같은 조각을 작업대 id 로 읽는다. 모르거나 숨긴 값이면 첫 화면. */
export function parseRoute(hash: string): WorkspaceId | 'home' {
  const id = hash.replace(/^#\/?/, '').split('?')[0] as WorkspaceId;
  const ws = WORKSPACE_BY_ID.get(id);
  return ws && !ws.hidden ? id : 'home';
}
