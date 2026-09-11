import React, { useMemo } from 'react';
import { HomeScreen } from './components/HomeScreen';
import StandardsWorkspace from './workspaces/StandardsWorkspace';
import FxWorkspace from './workspaces/FxWorkspace';
import { useRoute } from './hooks/useRoute';
import { ALL_STANDARDS } from './data/standardsData';
import { FX_INDEX } from './data/fxData';
import { WorkspaceId } from './workspaces/registry';

/**
 * 화면은 두 계층이다.
 *   첫 화면(작업대 고르기)  →  작업대 하나 (왼쪽 찾기 / 오른쪽 엑셀 미리보기)
 * 어느 작업대에 있는지는 주소창 해시(`#/standards`)에 남으므로 링크로 바로 열 수 있다.
 */
export default function App() {
  const { route, go } = useRoute();

  // 첫 화면 카드의 배지. 수정 기록을 덧씌우기 전 원본 기준이면 충분하다.
  const badges = useMemo<Partial<Record<WorkspaceId, string>>>(() => {
    const paragraphs = ALL_STANDARDS.reduce((acc, s) => acc + s.paragraphs.length, 0);
    const out: Partial<Record<WorkspaceId, string>> = {
      standards: `기준서 ${ALL_STANDARDS.length}개 · 문단 ${paragraphs.toLocaleString()}개`,
    };
    if (FX_INDEX.length > 0) {
      const from = FX_INDEX.reduce((a, c) => (c.from < a ? c.from : a), FX_INDEX[0].from);
      const to = FX_INDEX.reduce((a, c) => (c.to > a ? c.to : a), FX_INDEX[0].to);
      out.fx = `통화 ${FX_INDEX.length}개 · ${from.slice(0, 7)}~${to.slice(0, 7)}`;
    }
    return out;
  }, []);

  if (route === 'standards') {
    return <StandardsWorkspace onBackHome={() => go('home')} />;
  }
  if (route === 'fx') {
    return <FxWorkspace onBackHome={() => go('home')} />;
  }

  // 준비 중인 작업대는 카드에서 눌리지 않으므로 여기까지 오지 않는다.
  return <HomeScreen onOpen={go} badges={badges} />;
}
