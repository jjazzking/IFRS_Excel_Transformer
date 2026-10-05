import { RatesDay, RatesIndex, RatesYearData } from '../types';

/**
 * 이자율 자료 읽기.
 *
 * 자료는 `src/data/rates/` 아래 연도별 JSON 이다. GitHub Actions 가 금융투자협회
 * 채권정보센터에서 받아 커밋한다 (`scripts/fetch_kofia_rates.py`). 앱은 그 파일만 읽는다.
 *
 * 하루치 표가 43행 × 16만기라 한 해치가 1MB 남짓이다. 목록(index)만 미리 읽고
 * 연도 파일은 고른 기준일에 필요한 해만 그때 가져온다.
 */

const indexModules = import.meta.glob<{ default: RatesIndex }>('./rates/index.json', { eager: true });
const yearModules = import.meta.glob<{ default: RatesYearData }>('./rates/avg-*.json');

export const RATES_INDEX: RatesIndex | undefined = Object.values(indexModules)[0]?.default;

/** 아직 자료를 한 번도 받지 않았을 때 (워크플로우가 돌기 전) */
export const RATES_READY = !!RATES_INDEX && RATES_INDEX.files.length > 0;

/** 자료가 있는 구간 */
export const RATES_BOUNDS: { from: string; to: string } | null = RATES_READY
  ? {
      from: RATES_INDEX!.files.reduce((m, f) => (f.from < m ? f.from : m), RATES_INDEX!.files[0].from),
      to: RATES_INDEX!.files.reduce((m, f) => (f.to > m ? f.to : m), RATES_INDEX!.files[0].to),
    }
  : null;

const cache = new Map<number, RatesYearData>();

async function loadYear(year: number): Promise<RatesYearData | null> {
  const cached = cache.get(year);
  if (cached) return cached;
  const load = yearModules[`./rates/avg-${year}.json`];
  if (!load) return null;
  const data = (await load()).default;
  cache.set(year, data);
  return data;
}

/**
 * 기준일의 표. 그날 고시가 없으면(주말·휴일) 직전 고시일 것을 준다.
 * 연초 휴일이면 지난해 파일까지 거슬러 본다.
 */
export async function loadRatesOn(date: string): Promise<RatesDay | null> {
  const year = Number(date.slice(0, 4));
  for (const y of [year, year - 1]) {
    const data = await loadYear(y);
    if (!data) continue;
    // rows 는 날짜 오름차순이다. 기준일 이하 중 가장 늦은 날.
    for (let i = data.rows.length - 1; i >= 0; i--) {
      if (data.rows[i].date <= date) return data.rows[i];
    }
  }
  return null;
}
