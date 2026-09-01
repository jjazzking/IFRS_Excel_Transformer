import { AccountingStandard } from '../types';

// src/data/standards/ 안의 *.json 을 자동으로 모두 읽어들인다.
// 기준서를 추가할 때는 이 폴더에 JSON 파일만 넣으면 되고, 코드 수정은 필요 없다.
// 각 파일은 AccountingStandard 배열([{ ... }]) 형식이어야 한다.
const STANDARD_MODULES = import.meta.glob<AccountingStandard[]>(
  './standards/*.json',
  { eager: true, import: 'default' }
);

export const ALL_STANDARDS: AccountingStandard[] = Object.keys(STANDARD_MODULES)
  .sort() // 파일명 순으로 정렬해 빌드마다 순서가 일정하도록 한다
  .flatMap(path => {
    const loaded = STANDARD_MODULES[path];
    if (!Array.isArray(loaded)) {
      console.warn(`[standardsData] ${path} 은 기준서 배열이 아니라 건너뜁니다.`);
      return [];
    }
    return loaded;
  });

