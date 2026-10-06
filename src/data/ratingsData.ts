import { RatingsData } from '../types';

/**
 * 신용등급 자료 읽기.
 *
 * `src/data/ratings/latest.json` 은 GitHub Actions 가 금투협 신용등급 속보에서 받아 커밋한다
 * (`scripts/fetch_kofia_ratings.py`). 회사 · 평가사마다 가장 최근 평정만 담았다.
 * 이자율 표보다 덜 쓰이므로 처음 검색할 때 가져온다.
 */

const modules = import.meta.glob<{ default: RatingsData }>('./ratings/latest.json');
const load = modules['./ratings/latest.json'];

/** 아직 자료를 한 번도 받지 않았을 때 (워크플로우가 돌기 전) */
export const RATINGS_READY = !!load;

let cached: Promise<RatingsData | null> | null = null;

export function loadRatings(): Promise<RatingsData | null> {
  if (!load) return Promise.resolve(null);
  cached ??= load().then(m => m.default);
  return cached;
}
