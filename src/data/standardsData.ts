import { AccountingStandard } from '../types';
import kifrs1001 from './standards/k-ifrs-1001.json';

export const INITIAL_STANDARDS: AccountingStandard[] = [
  {
    id: 'k-ifrs-1115',
    code: 'K-IFRS 제1115호',
    title: '고객과의 계약에서 생기는 수익',
    category: '수익/비용',
    effectiveDate: '2018.01.01',
    paragraphs: [
      {
        id: '1115-31',
        number: '31',
        standardId: 'k-ifrs-1115',
        standardCode: 'K-IFRS 제1115호',
        standardTitle: '고객과의 계약에서 생기는 수익',
        sectionTitle: '수행의무의 이행',
        subTitle: '수익인식의 기본 원칙',
        content: '기업은 고객에게 약속한 재화나 용역(즉, 자산)을 이전하여 수행의무를 이행할 때(또는 기간에 걸쳐 이행할 때) 수익을 인식한다. 자산은 고객이 그 자산을 통제하게 될 때(또는 통제하게 됨에 따라) 이전된다.',
        keywords: ['수행의무', '수익인식', '통제', '재화', '용역']
      },
      {
        id: '1115-32',
        number: '32',
        standardId: 'k-ifrs-1115',
        standardCode: 'K-IFRS 제1115호',
        standardTitle: '고객과의 계약에서 생기는 수익',
        sectionTitle: '수행의무의 이행',
        subTitle: '자산의 통제 정의',
        content: '자산에 대한 통제는 그 자산을 사용하도록 지시하고 자산의 나머지 효익의 대부분을 획득할 수 있는 능력을 말한다. 통제에는 다른 기업이 자산의 사용을 지시하고 자산에서 효익을 획득하지 못하게 하는 능력이 포함된다. 자산의 효익은 다음을 포함하여 여러 가지 방법으로 직간접적으로 획득할 수 있는 잠재적 현금유입(또는 현금유출의 감소)이다.',
        keywords: ['통제', '효익', '현금유입']
      },
      {
        id: '1115-35',
        number: '35',
        standardId: 'k-ifrs-1115',
        standardCode: 'K-IFRS 제1115호',
        standardTitle: '고객과의 계약에서 생기는 수익',
        sectionTitle: '기간에 걸쳐 이행하는 수행의무',
        subTitle: '진행기준 적용 조건',
        content: '다음 기준 중 어느 하나를 충족하는 경우에 기업은 약속한 재화나 용역에 대한 통제를 기간에 걸쳐 이전하므로, 기간에 걸쳐 수행의무를 이행하여 기간에 걸쳐 수익을 인식한다:\n(1) 기업이 수행하는 대로 고객이 기업의 수행에서 제공하는 효익을 동시에 얻고 소비한다.\n(2) 기업이 수행하여 만들어지거나 가치가 높아지는 대로 고객이 통제하는 자산(예: 건설 중인 자산)을 기업이 만들거나 가치를 높인다.\n(3) 기업이 수행하여 만든 자산이 기업 자체에는 대체 용도가 없고, 지금까지 수행을 완료한 부분에 대해 집행 가능한 지급청구권이 기업에 있다.',
        keywords: ['기간에 걸쳐', '진행기준', '대체 용도', '지급청구권', '수행의무']
      },
      {
        id: '1115-38',
        number: '38',
        standardId: 'k-ifrs-1115',
        standardCode: 'K-IFRS 제1115호',
        standardTitle: '고객과의 계약에서 생기는 수익',
        sectionTitle: '한 시점에 이행하는 수행의무',
        subTitle: '통제 이전의 지표',
        content: '수행의무가 문단 35~37에 따라 기간에 걸쳐 이행되지 않는다면, 기업은 그 수행의무를 한 시점에 이행한다. 고객이 약속한 자산을 통제하고 기업이 수행의무를 이행하는 시점을 판단할 때, 기업은 문단 31~34의 통제에 관한 요구사항을 고려해야 한다. 또한 다음을 포함하여 통제 이전의 지표를 고려해야 한다:\n(1) 기업은 자산에 대해 현재 시점에 대가를 지급받을 권리가 있다.\n(2) 고객에게 자산의 법적 소유권이 있다.\n(3) 기업이 자산의 물리적 점유를 이전하였다.\n(4) 자산의 소유에 따른 유의적인 위험과 보상이 고객에게 있다.\n(5) 고객이 자산을 인수하였다.',
        keywords: ['한 시점', '통제 이전', '법적 소유권', '물리적 점유', '위험과 보상', '인수']
      },
      {
        id: '1115-B34',
        number: 'B34',
        standardId: 'k-ifrs-1115',
        standardCode: 'K-IFRS 제1115호',
        standardTitle: '고객과의 계약에서 생기는 수익',
        sectionTitle: '본인 대 대리인 고려사항',
        subTitle: '본인과 대리인의 구분 원칙',
        content: '고객에게 재화나 용역을 제공하는 데 다른 당사자가 관여하는 경우, 기업은 약속의 성격이 고객에게 지정된 재화나 용역을 스스로 제공하는 수행의무(본인)인지, 아니면 다른 당사자가 그 재화나 용역을 제공하도록 주선하는 수행의무(대리인)인지를 판단해야 한다.',
        keywords: ['본인', '대리인', '총액', '순액', '주선']
      },
      {
        id: '1115-B35',
        number: 'B35',
        standardId: 'k-ifrs-1115',
        standardCode: 'K-IFRS 제1115호',
        standardTitle: '고객과의 계약에서 생기는 수익',
        sectionTitle: '본인 대 대리인 고려사항',
        subTitle: '본인의 통제 요건',
        content: '기업이 고객에게 이전하기 전에 지정된 재화나 용역을 통제한다면 기업은 본인이다. 그러나 기업이 고객에게 재화나 용역에 대한 법적 소유권을 이전하기 직전에만 그 권리를 일시적으로 얻는 경우에는 반드시 그 재화나 용역을 통제한다고 볼 수는 없다.',
        keywords: ['본인', '통제', '법적 소유권']
      }
    ]
  },
  {
    id: 'k-ifrs-1116',
    code: 'K-IFRS 제1116호',
    title: '리스',
    category: '자산/부채',
    effectiveDate: '2019.01.01',
    paragraphs: [
      {
        id: '1116-9',
        number: '9',
        standardId: 'k-ifrs-1116',
        standardCode: 'K-IFRS 제1116호',
        standardTitle: '리스',
        sectionTitle: '리스의 식별',
        subTitle: '리스 계약의 정의',
        content: '계약에서 대가의 수취나 지급을 대가로 식별되는 자산의 사용 통제권을 일정 기간 이전하게 한다면 그 계약은 리스이거나 리스를 포함한다.',
        keywords: ['리스', '식별되는 자산', '사용 통제권', '계약']
      },
      {
        id: '1116-B9',
        number: 'B9',
        standardId: 'k-ifrs-1116',
        standardCode: 'K-IFRS 제1116호',
        standardTitle: '리스',
        sectionTitle: '리스의 식별',
        subTitle: '사용 통제권의 평가 기준',
        content: '계약에서 식별되는 자산의 사용 통제권을 이전하는지를 평가할 때, 기업은 사용기간 내내 다음 두 가지 모두에 해당하는지 평가해야 한다:\n(1) 식별되는 자산의 사용으로 생기는 경제적 효익의 대부분을 얻을 권리(문단 B21~B23 참조)\n(2) 식별되는 자산의 사용을 지시할 권리(문단 B24~B30 참조)',
        keywords: ['경제적 효익', '사용 지시권', '통제권']
      },
      {
        id: '1116-22',
        number: '22',
        standardId: 'k-ifrs-1116',
        standardCode: 'K-IFRS 제1116호',
        standardTitle: '리스',
        sectionTitle: '리스이용자의 회계처리',
        subTitle: '사용권자산과 리스부채의 인식',
        content: '리스이용자는 리스개시일에 사용권자산과 리스부채를 인식해야 한다.',
        keywords: ['리스개시일', '사용권자산', '리스부채', '인식']
      },
      {
        id: '1116-24',
        number: '24',
        standardId: 'k-ifrs-1116',
        standardCode: 'K-IFRS 제1116호',
        standardTitle: '리스',
        sectionTitle: '리스이용자의 회계처리',
        subTitle: '사용권자산의 최초 측정 원가',
        content: '사용권자산의 원가는 다음 항목으로 구성된다:\n(1) 리스부채의 최초 측정금액\n(2) 리스개시일이나 그 전에 지급한 리스료(받은 리스 인센티브는 차감)\n(3) 리스이용자가 부담하는 리스개설직접원가\n(4) 기초자산을 해체하고 제거하거나 기초자산이나 기초자산이 위치한 부지를 복구할 때 리스이용자가 부담하는 원가의 추정치',
        keywords: ['원가구성', '리스부채', '리스개설직접원가', '복구원가', '인센티브']
      },
      {
        id: '1116-26',
        number: '26',
        standardId: 'k-ifrs-1116',
        standardCode: 'K-IFRS 제1116호',
        standardTitle: '리스',
        sectionTitle: '리스이용자의 회계처리',
        subTitle: '리스부채의 최초 측정',
        content: '리스개시일에 리스이용자는 그날 현재 지급되지 않은 리스료의 현재가치로 리스부채를 측정해야 한다. 리스료는 리스의 내재이자율로 할인한다. 그 이자율을 쉽게 산정할 수 없는 경우에는 리스이용자의 증분차입이자율을 사용한다.',
        keywords: ['리스부채', '현재가치', '내재이자율', '증분차입이자율']
      }
    ]
  },
  {
    id: 'k-ifrs-1109',
    code: 'K-IFRS 제1109호',
    title: '금융상품',
    category: '금융상품',
    effectiveDate: '2018.01.01',
    paragraphs: [
      {
        id: '1109-4.1.1',
        number: '4.1.1',
        standardId: 'k-ifrs-1109',
        standardCode: 'K-IFRS 제1109호',
        standardTitle: '금융상품',
        sectionTitle: '금융자산의 분류',
        subTitle: '금융자산 분류 기준',
        content: '문단 4.1.5를 적용하는 경우를 제외하고는, 다음 두 가지 조건에 기초하여 금융자산이 상각후원가 측정 금융자산, 기타포괄손익-공정가치 측정 금융자산 또는 당기손익-공정가치 측정 금융자산으로 후속 측정되도록 분류한다:\n(1) 금융자산의 관리를 위한 기업의 사업모형\n(2) 금융자산의 계약상 현금흐름 특성',
        keywords: ['금융자산', '상각후원가', 'FVOCI', 'FVPL', '사업모형', 'SPPI']
      },
      {
        id: '1109-5.5.1',
        number: '5.5.1',
        standardId: 'k-ifrs-1109',
        standardCode: 'K-IFRS 제1109호',
        standardTitle: '금융상품',
        sectionTitle: '손상',
        subTitle: '기대신용손실 모형',
        content: '상각후원가로 측정하는 금융자산, 기타포괄손익-공정가치로 측정하는 채무상품, 리스채권, 계약자산 또는 대출약정과 금융보증계약에 대하여 손실충당금을 인식한다.',
        keywords: ['기대신용손실', '손실충당금', '대손', '손상']
      },
      {
        id: '1109-5.5.3',
        number: '5.5.3',
        standardId: 'k-ifrs-1109',
        standardCode: 'K-IFRS 제1109호',
        standardTitle: '금융상품',
        sectionTitle: '손상',
        subTitle: '신용위험의 유의적 증가 (Stage 2/3)',
        content: '보고기간 말에 금융상품의 신용위험이 최초 인식 이후 유의적으로 증가한 경우에는, 전체기간 기대신용손실에 해당하는 금액으로 손실충당금을 측정한다.',
        keywords: ['신용위험', '유의적 증가', '전체기간 기대신용손실', '12개월']
      }
    ]
  },
  {
    id: 'k-ifrs-1016',
    code: 'K-IFRS 제1016호',
    title: '유형자산',
    category: '자산/부채',
    effectiveDate: '2011.01.01',
    paragraphs: [
      {
        id: '1016-7',
        number: '7',
        standardId: 'k-ifrs-1016',
        standardCode: 'K-IFRS 제1016호',
        standardTitle: '유형자산',
        sectionTitle: '인식조건',
        subTitle: '유형자산 인식기준',
        content: '유형자산으로 정의되는 항목의 원가는 다음 조건을 모두 충족하는 경우에만 자산으로 인식한다:\n(1) 자산으로부터 발생하는 미래경제적효익이 기업에 유입될 가능성이 높다.\n(2) 자산의 원가를 신뢰성 있게 측정할 수 있다.',
        keywords: ['유형자산', '인식조건', '미래경제적효익', '신뢰성']
      },
      {
        id: '1016-16',
        number: '16',
        standardId: 'k-ifrs-1016',
        standardCode: 'K-IFRS 제1016호',
        standardTitle: '유형자산',
        sectionTitle: '원가의 구성요소',
        subTitle: '취득원가에 포함되는 항목',
        content: '유형자산의 원가는 다음과 같이 구성된다:\n(1) 관세 및 환급불가능한 취득관련 세금을 가산하고 매입할인과 리베이트 등을 차감한 구입가격\n(2) 경영진이 의도하는 방식으로 자산을 가동하는 데 필요한 장소와 상태에 이르게 하는 데 직접 관련되는 원가\n(3) 자산을 해체, 제거하거나 부지를 복구하는 데 소요될 것으로 최초에 추정되는 원가',
        keywords: ['취득원가', '구입가격', '직접관련원가', '복구원가']
      },
      {
        id: '1016-50',
        number: '50',
        standardId: 'k-ifrs-1016',
        standardCode: 'K-IFRS 제1016호',
        standardTitle: '유형자산',
        sectionTitle: '감가상각',
        subTitle: '감가상각액 및 기간',
        content: '유형자산의 감가상각대상금액은 내용연수에 걸쳐 체계적인 방법으로 배분되어야 한다.',
        keywords: ['감가상각', '감가상각대상금액', '내용연수']
      }
    ]
  },
  {
    id: 'k-ifrs-1038',
    code: 'K-IFRS 제1038호',
    title: '무형자산',
    category: '자산/부채',
    effectiveDate: '2011.01.01',
    paragraphs: [
      {
        id: '1038-21',
        number: '21',
        standardId: 'k-ifrs-1038',
        standardCode: 'K-IFRS 제1038호',
        standardTitle: '무형자산',
        sectionTitle: '인식 및 측정',
        subTitle: '무형자산 인식기준',
        content: '무형자산은 다음 조건을 모두 충족하는 경우에만 인식한다:\n(1) 자산에서 발생하는 미래경제적효익이 기업에 유입될 가능성이 높다.\n(2) 자산의 원가를 신뢰성 있게 측정할 수 있다.',
        keywords: ['무형자산', '인식조건', '원가측정']
      },
      {
        id: '1038-57',
        number: '57',
        standardId: 'k-ifrs-1038',
        standardCode: 'K-IFRS 제1038호',
        standardTitle: '무형자산',
        sectionTitle: '내부창출 무형자산',
        subTitle: '개발단계 자산화 요건 (6가지)',
        content: '개발단계에서 발생한 지출은 다음 사항을 모두 입증할 수 있는 경우에만 무형자산으로 인식한다:\n(1) 무형자산을 사용하거나 판매하기 위해 그 자산을 완성할 수 있는 기술적 실현가능성\n(2) 무형자산을 완성하여 사용하거나 판매하려는 기업의 의도\n(3) 무형자산을 사용하거나 판매할 수 있는 기업의 능력\n(4) 무형자산이 미래경제적효익을 창출하는 방법 (자산의 산출물이나 무형자산 자체의 시장 존재 등)\n(5) 무형자산의 개발을 완료하고 사용하거나 판매하는 데 필요한 기술적, 재정적 자원 등의 입수 가능성\n(6) 개발과정에서 무형자산에 관련된 지출을 신뢰성 있게 측정할 수 있는 기업의 능력',
        keywords: ['개발비', '자산화', '기술적 실현가능성', '개발단계', '6가지 요건']
      }
    ]
  }
];

// HWP 원문에서 파싱한 기준서(scripts/parse_kifrs_hwp.py 산출물)를 DB에 합친다.
// JSON 은 구조상 AccountingStandard 와 동일하지만 리터럴 타입(category 등)이
// 넓혀지므로 단언으로 좁혀준다.
const PARSED_STANDARDS = [
  ...(kifrs1001 as unknown as AccountingStandard[])
];

export const ALL_STANDARDS: AccountingStandard[] = [
  ...INITIAL_STANDARDS,
  ...PARSED_STANDARDS
];
