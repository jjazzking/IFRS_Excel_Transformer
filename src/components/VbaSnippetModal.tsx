import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Lightbulb, Keyboard } from 'lucide-react';

interface VbaSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VbaSnippetModal: React.FC<VbaSnippetModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const vbaCode = `' ==============================================================================
' [K-IFRS 조서 자동 행 삽입 매크로]
' 단축키 설정: Alt+F8 -> 옵션 -> Ctrl+Shift+V
' 기능: 클립보드의 기준서 텍스트 행 수만큼 행을 자동 추가(Shift Down)하고 서식 주입
' ==============================================================================
Sub InsertWorkpaperParagraphs()
    Dim MyData As Object
    Dim ClipText As String
    Dim Lines() As String
    Dim RowCount As Long
    Dim TargetCell As Range
    
    On Error GoTo ErrHandler
    
    ' 1. 클립보드에서 텍스트 읽기
    Set MyData = CreateObject("New:{1C3B4210-F441-11CE-B9EA-00AA006B1A69}")
    MyData.GetFromClipboard
    ClipText = MyData.GetText
    
    If Trim(ClipText) = "" Then
        MsgBox "클립보드가 비어 있습니다. 웹 추출기에서 먼저 복사해주세요.", vbExclamation, "안내"
        Exit Sub
    End If
    
    ' 2. 행 개수 계산
    Lines = Split(Replace(ClipText, vbCrLf, vbLf), vbLf)
    RowCount = UBound(Lines) + 1
    If Trim(Lines(UBound(Lines))) = "" Then RowCount = RowCount - 1
    
    If RowCount <= 0 Then Exit Sub
    
    Set TargetCell = ActiveCell
    
    ' 3. 현재 선택된 셀 위치에서 필요한 행 수만큼 자동 삽입 (기존 조서 밀어내기)
    Application.ScreenUpdating = False
    TargetCell.Resize(RowCount, 1).EntireRow.Insert Shift:=xlDown, CopyOrigin:=xlFormatFromLeftOrAbove
    
    ' 4. 클립보드 내용 붙여넣기
    TargetCell.Offset(-RowCount, 0).Select
    ActiveSheet.PasteSpecial Format:="HTML", Link:=False, DisplayAsIcon:=False
    
    Application.ScreenUpdating = True
    MsgBox RowCount & "개 행이 조서에 안전하게 삽입되었습니다.", vbInformation, "삽입 완료"
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    ' 일반 텍스트 붙여넣기 폴백
    ActiveSheet.Paste
End Sub`;

  const handleCopy = () => {
    navigator.clipboard.writeText(vbaCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 모달 헤더 */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-100">
              엑셀 붙여넣기 방법 및 원클릭 매크로(VBA) 안내
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
          {/* 방법 1: 엑셀 기본 단축키 (별도 설치 필요 없음) */}
          <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-950 font-bold text-xs">
              <Keyboard className="w-4 h-4 text-emerald-600" />
              <span>방법 1: 엑셀 기본 내장 단축키 활용 (가장 추천)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-700 leading-relaxed pl-1">
              <li>웹 추출기에서 <strong>[엑셀 서식 복사]</strong> 버튼을 누릅니다.</li>
              <li>엑셀 조서에서 기준서를 끼워넣을 <strong>행 머리글 번호</strong>(예: 26행)를 클릭하여 행 전체를 선택합니다.</li>
              <li>
                <kbd className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-mono font-bold text-emerald-800">
                  Ctrl + +
                </kbd>{' '}
                (또는 마우스 우클릭 → <strong>[복사한 셀 삽입]</strong>)을 누릅니다.
              </li>
              <li>기존 조서 데이터가 아래로 밀려나면서(Shift Down), 기준서가 행 단위로 쏙 들어갑니다!</li>
            </ol>
          </div>

          {/* 방법 2: 엑셀 내장 단축키 매크로 등록 (선택 사항) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>방법 2: 원클릭 자동 매크로 코드 (개인용 매크로 통합문서용)</span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '복사됨!' : 'VBA 코드 복사'}</span>
              </button>
            </div>
            <p className="text-slate-500">
              엑셀에서 <kbd className="bg-slate-100 px-1 border border-slate-300 rounded font-mono">Alt + F11</kbd>을 누른 뒤 [삽입] → [모듈]에 붙여넣고 단축키(<kbd className="bg-slate-100 px-1 border border-slate-300 rounded font-mono">Ctrl+Shift+V</kbd>)를 지정하면 셀 위치만 잡고 눌렀을 때 자동으로 행을 삽입해 줍니다.
            </p>
            <pre className="p-3 bg-slate-900 text-emerald-300 rounded-xl font-mono text-[11px] overflow-x-auto max-h-52 border border-slate-800">
              {vbaCode}
            </pre>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
