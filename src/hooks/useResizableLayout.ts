import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 3존 레이아웃의 폭·접기 상태.
 *
 * 노트북 한 화면에 탐색·본문·엑셀을 모두 올리다 보니 어디에 폭을 줄지는
 * 그때그때 달라진다. 경계를 드래그해서 직접 정하고, 정한 값은 브라우저에
 * 남겨 다음에 열 때 그대로 쓴다.
 */

const STORAGE_KEY = 'workpaper.layout.v1';

export const MIN_LEFT = 190;
export const MAX_LEFT = 460;
export const MIN_RIGHT = 320;
/** 본문이 이보다 좁아지면 읽을 수 없으므로 다른 패널이 더 넓어지지 못하게 막는다. */
export const MIN_CENTER = 360;

// 이 앱의 핵심은 엑셀 미리보기라, 기본값부터 오른쪽에 넉넉히 준다.
const DEFAULT_LEFT = 240;
const DEFAULT_RIGHT = 540;

export type LayoutPreset = 'explore' | 'balanced' | 'excel';
type Side = 'left' | 'right';

export interface LayoutState {
  left: number;
  right: number;
  leftOpen: boolean;
  rightOpen: boolean;
}

const DEFAULT_STATE: LayoutState = {
  left: DEFAULT_LEFT,
  right: DEFAULT_RIGHT,
  leftOpen: true,
  rightOpen: true,
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

// 폭을 계산할 때 패널 말고도 자리를 차지하는 것들.
const PADDING = 24; // main 의 좌우 여백 (p-3)
const SPLITTER = 12; // 경계, 또는 패널이 접혔을 때 그 자리의 여백
const RAIL = 36; // 접힌 패널이 남기는 세로 띠 (w-9)

function readStored(): LayoutState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      left: typeof parsed.left === 'number' ? parsed.left : DEFAULT_LEFT,
      right: typeof parsed.right === 'number' ? parsed.right : DEFAULT_RIGHT,
      leftOpen: parsed.leftOpen !== false,
      rightOpen: parsed.rightOpen !== false,
    };
  } catch {
    // 로컬 저장소를 못 읽는 브라우저 설정에서도 앱은 그냥 기본값으로 뜨면 된다.
    return DEFAULT_STATE;
  }
}

/** 좌·우와 경계를 뺀 뒤 가운데에 실제로 남는 폭. */
function centerWidth(state: LayoutState, total: number): number {
  const leftPart = (state.leftOpen ? state.left : RAIL) + SPLITTER;
  const rightPart = (state.rightOpen ? state.right : RAIL) + SPLITTER;
  return total - PADDING - leftPart - rightPart;
}

/** 한쪽 패널이 지금 더 가져갈 수 있는 최대 폭 (가운데의 여유를 다 흡수했을 때). */
function maxWidthFor(side: Side, state: LayoutState, total: number): number {
  const slack = Math.max(0, centerWidth(state, total) - MIN_CENTER);
  const current = side === 'left' ? state.left : state.right;
  const cap = side === 'left' ? MAX_LEFT : Number.POSITIVE_INFINITY;
  return Math.min(cap, current + slack);
}

/**
 * 가운데가 MIN_CENTER 아래로 눌리지 않게 폭을 다시 맞춘다.
 * 모자란 만큼 오른쪽에서 먼저 걷고, 그래도 모자라면 왼쪽에서 걷는다.
 */
function fit(state: LayoutState, total: number): LayoutState {
  if (total <= 0) return state;
  const next: LayoutState = {
    ...state,
    left: state.leftOpen ? clamp(state.left, MIN_LEFT, MAX_LEFT) : state.left,
    right: state.rightOpen ? Math.max(state.right, MIN_RIGHT) : state.right,
  };

  let deficit = MIN_CENTER - centerWidth(next, total);
  if (deficit > 0 && next.rightOpen) {
    const give = Math.min(deficit, next.right - MIN_RIGHT);
    next.right -= give;
    deficit -= give;
  }
  if (deficit > 0 && next.leftOpen) {
    const give = Math.min(deficit, next.left - MIN_LEFT);
    next.left -= give;
  }
  return next;
}

export function useResizableLayout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LayoutState>(readStored);
  const [dragging, setDragging] = useState<Side | null>(null);
  const dragRef = useRef<{ side: Side; startX: number; startLeft: number; startRight: number } | null>(null);

  const startDrag = useCallback(
    (side: Side) => (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = { side, startX: e.clientX, startLeft: state.left, startRight: state.right };
      setDragging(side);
    },
    [state.left, state.right]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const total = containerRef.current?.clientWidth ?? 0;
      const delta = e.clientX - drag.startX;

      setState(prev => {
        if (drag.side === 'left') {
          const max = maxWidthFor('left', prev, total);
          return { ...prev, left: clamp(drag.startLeft + delta, MIN_LEFT, max) };
        }
        // 오른쪽 경계는 왼쪽으로 끌수록 넓어진다.
        const max = maxWidthFor('right', prev, total);
        return { ...prev, right: clamp(drag.startRight - delta, MIN_RIGHT, max) };
      });
    };
    const stop = () => {
      dragRef.current = null;
      setDragging(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging]);

  // 드래그 중에는 커서와 선택 동작이 텍스트에 걸리지 않게 한다.
  useEffect(() => {
    if (!dragging) return;
    const { style } = document.body;
    const prevCursor = style.cursor;
    const prevSelect = style.userSelect;
    style.cursor = 'col-resize';
    style.userSelect = 'none';
    return () => {
      style.cursor = prevCursor;
      style.userSelect = prevSelect;
    };
  }, [dragging]);

  // 드래그가 끝났을 때만 저장한다 (움직이는 내내 쓰지 않는다).
  useEffect(() => {
    if (dragging) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장하지 못해도 이번 세션 동안의 레이아웃은 그대로 쓸 수 있다.
    }
  }, [state, dragging]);

  useEffect(() => {
    const onResize = () => {
      const total = containerRef.current?.clientWidth ?? 0;
      setState(prev => fit(prev, total));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleSide = useCallback((side: Side) => {
    setState(prev => {
      const total = containerRef.current?.clientWidth ?? 0;
      const next =
        side === 'left'
          ? { ...prev, leftOpen: !prev.leftOpen }
          : { ...prev, rightOpen: !prev.rightOpen };
      return fit(next, total);
    });
  }, []);

  /** 경계를 더블클릭하면 그 패널만 기본 폭으로 되돌린다. */
  const resetSide = useCallback((side: Side) => {
    setState(prev => {
      const total = containerRef.current?.clientWidth ?? 0;
      const next = side === 'left' ? { ...prev, left: DEFAULT_LEFT } : { ...prev, right: DEFAULT_RIGHT };
      return fit(next, total);
    });
  }, []);

  const applyPreset = useCallback((preset: LayoutPreset) => {
    const total = containerRef.current?.clientWidth ?? 0;
    setState(prev => {
      if (preset === 'explore') {
        // 찾는 데 집중: 목차와 본문을 넓게, 엑셀은 접는다.
        return fit({ ...prev, left: 280, leftOpen: true, rightOpen: false }, total);
      }
      if (preset === 'excel') {
        // 조서에 집중: 탐색을 접고, 본문에 최소폭만 남긴 채 미리보기가 나머지를 가져간다.
        const base = { ...prev, leftOpen: false, rightOpen: true, right: MIN_RIGHT };
        const slack = Math.max(0, centerWidth(base, total) - MIN_CENTER);
        return fit({ ...base, right: MIN_RIGHT + slack }, total);
      }
      return fit({ left: DEFAULT_LEFT, right: DEFAULT_RIGHT, leftOpen: true, rightOpen: true }, total);
    });
  }, []);

  return { containerRef, state, dragging, startDrag, resetSide, toggleSide, applyPreset };
}
