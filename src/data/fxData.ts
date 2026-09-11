import { FxCurrencyData, FxCurrencyMeta, FxIndex } from '../types';

/**
 * 환율 자료 읽기.
 *
 * 자료는 `src/data/fx/` 아래 통화별 JSON 이다. GitHub Actions 가 서울외국환중개에서
 * 받아 커밋한다 (`scripts/fetch_fx_rates.py`). 앱은 그 파일만 읽는다 — 정적 호스팅이라
 * 브라우저가 원 사이트를 직접 부를 수 없기 때문이다.
 *
 * 통화 하나가 3년치면 수백 KB 라, 전부 묶어 두면 첫 화면이 느려진다. 목록만 미리 읽고
 * 일자별 자료는 고른 통화만 그때 가져온다.
 */

const indexModules = import.meta.glob<{ default: FxIndex }>('./fx/index.json', { eager: true });
const currencyModules = import.meta.glob<{ default: FxCurrencyData }>('./fx/*.json');

const loadedIndex: FxIndex | undefined = Object.values(indexModules)[0]?.default;

export const FX_INDEX: FxCurrencyMeta[] = loadedIndex?.currencies ?? [];
export const FX_SOURCE = loadedIndex?.source ?? '서울외국환중개 (www.smbs.biz)';
export const FX_UPDATED_AT = loadedIndex?.updatedAt ?? '';

/** 아직 자료를 한 번도 받지 않았을 때 (워크플로우가 돌기 전) */
export const FX_READY = FX_INDEX.length > 0;

const cache = new Map<string, FxCurrencyData>();

export async function loadCurrency(code: string): Promise<FxCurrencyData | null> {
  const cached = cache.get(code);
  if (cached) return cached;

  const load = currencyModules[`./fx/${code}.json`];
  if (!load) return null;

  const data = (await load()).default;
  cache.set(code, data);
  return data;
}
