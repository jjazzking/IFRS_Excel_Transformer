import React, { useState } from 'react';
import { X, Upload, Database, Check, AlertCircle, FileText } from 'lucide-react';
import { AccountingStandard } from '../types';

interface ImportCustomDbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportStandards: (newStandards: AccountingStandard[]) => void;
}

export const ImportCustomDbModal: React.FC<ImportCustomDbModalProps> = ({
  isOpen,
  onClose,
  onImportStandards
}) => {
  const [jsonText, setJsonText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const sampleJson = `[
  {
    "id": "custom-std-1",
    "code": "K-IFRS 제1115호",
    "title": "고객과의 계약에서 생기는 수익 (사내버전)",
    "category": "수익/비용",
    "paragraphs": [
      {
        "id": "std-38",
        "number": "38",
        "sectionTitle": "수익인식",
        "subTitle": "한 시점에 이행하는 수행의무",
        "content": "수행의무가 문단 35~37에 따라 기간에 걸쳐 이행되지 않는다면, 기업은 그 수행의무를 한 시점에 이행한다.",
        "keywords": ["수익인식", "통제이전"]
      }
    ]
  }
]`;

  const handleImport = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!jsonText.trim()) {
      setErrorMsg('JSON 데이터를 입력해주세요.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        throw new Error('데이터는 기준서 배열([ ... ]) 형식이어야 합니다.');
      }

      // 간단 유효성 검사 및 문단에 기준서 메타데이터 자동 보강
      const normalizedStandards: AccountingStandard[] = parsed.map(item => {
        if (!item.id || !item.code || !item.title || !Array.isArray(item.paragraphs)) {
          throw new Error('각 기준서 객체는 id, code, title, paragraphs 필드를 포함해야 합니다.');
        }
        return {
          ...item,
          paragraphs: item.paragraphs.map((p: any) => ({
            ...p,
            standardId: p.standardId || item.id,
            standardCode: p.standardCode || item.code,
            standardTitle: p.standardTitle || item.title
          }))
        };
      });

      onImportStandards(normalizedStandards);
      setSuccessMsg(`성공적으로 ${normalizedStandards.length}개의 기준서 데이터를 불러왔습니다!`);
      setTimeout(() => {
        onClose();
        setJsonText('');
        setSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'JSON 파싱 오류가 발생했습니다.');
    }
  };

  const handleLoadSample = () => {
    setJsonText(sampleJson);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* 헤더 */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-100">
              사내 회계기준서 DB 가져오기
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-y-auto space-y-3 text-xs text-slate-700">
          <p className="text-slate-600 leading-relaxed">
            사내 IT팀이나 사내 포털에서 추출한 회계기준서 JSON 데이터를 아래 입력란에 붙여넣어 즉시 애플리케이션의 검색 DB로 등록할 수 있습니다.
          </p>

          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800">JSON 데이터 붙여넣기:</span>
            <button
              onClick={handleLoadSample}
              className="text-emerald-700 hover:text-emerald-800 hover:underline text-[11px] font-medium cursor-pointer"
            >
              샘플 구조 채우기
            </button>
          </div>

          <textarea
            id="input-custom-db-json"
            rows={10}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder="[ { &quot;id&quot;: &quot;k-ifrs-1115&quot;, &quot;code&quot;: &quot;K-IFRS 제1115호&quot;, &quot;title&quot;: &quot;고객과의 계약에서 생기는 수익&quot;, &quot;paragraphs&quot;: [ ... ] } ]"
            className="w-full p-3 font-mono text-[11px] bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center space-x-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center space-x-1.5">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-medium cursor-pointer"
          >
            취소
          </button>
          <button
            id="btn-confirm-import-db"
            onClick={handleImport}
            className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer flex items-center space-x-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>DB 적용하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
