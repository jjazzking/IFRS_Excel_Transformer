import React, { useEffect, useRef, useState } from 'react';

interface LoadingRingProps {
  label: string;
  started: number;
  /** 진행 정도를 알 수 없을 때 — 이 예상 시간(ms) 기준으로 채운다. */
  estimate?: number;
  /** 몇 건 중 몇 건 끝났는지 알 때 — 그 비율로 채우고, 남은 시간은 지금까지의 속도로 셈한다. */
  done?: number;
  total?: number;
}

/**
 * 기다리는 동안 도는 동그라미와 남은 시간.
 * 예상 시간으로 채울 때는 예상 시간에 90% 까지 차고, 넘기면 99% 쪽으로 천천히 다가간다
 * (끝나기 전에 100% 가 되어 멈춰 보이지 않게).
 */
export const LoadingRing: React.FC<LoadingRingProps> = ({ label, started, estimate = 3000, done = 0, total }) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  // 마지막으로 몇 건이 끝난 때 — 남은 시간을 그때의 속도로 셈하고 그 뒤로는 줄여 나간다.
  const mark = useRef({ done: 0, at: started });
  if (done !== mark.current.done) mark.current = { done, at: Date.now() };

  const elapsed = now - started;
  let progress: number;
  let left: number | null;
  if (total) {
    progress = Math.min(done / total, 1);
    left = done > 0 ? ((mark.current.at - started) / done) * (total - done) - (now - mark.current.at) : null;
  } else {
    const t = elapsed / estimate;
    progress = t < 1 ? 0.9 * t : 0.9 + 0.09 * (1 - Math.exp(1 - t));
    left = estimate - elapsed;
  }
  const sec = left === null ? null : Math.ceil(left / 1000);
  const R = 7;
  const C = 2 * Math.PI * R;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={R} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
      </svg>
      {label} · {sec === null ? '남은 시간 계산 중' : sec > 0 ? `약 ${sec}초` : '거의 다 됐습니다…'}
    </span>
  );
};
