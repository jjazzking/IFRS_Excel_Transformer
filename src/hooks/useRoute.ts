import { useCallback, useEffect, useState } from 'react';
import { parseRoute, WorkspaceId } from '../workspaces/registry';

/**
 * 주소창 해시로 화면을 가른다. 라우터 라이브러리를 들이지 않은 이유는 두 가지다 —
 * 화면이 '첫 화면 + 작업대' 두 계층뿐이고, GitHub Pages 는 정적 호스팅이라
 * 해시가 아닌 경로는 새로고침할 때 404 가 나기 때문이다.
 */
export function useRoute() {
  const [route, setRoute] = useState<WorkspaceId | 'home'>(() =>
    parseRoute(window.location.hash)
  );

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 해시를 바꾸면 위의 리스너가 route 를 따라 바꾼다. 뒤로가기가 그대로 동작한다.
  const go = useCallback((next: WorkspaceId | 'home') => {
    window.location.hash = next === 'home' ? '/' : `/${next}`;
  }, []);

  return { route, go };
}
