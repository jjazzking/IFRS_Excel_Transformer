import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 렌더링 중 예외가 나면 React는 트리 전체를 언마운트한다.
 * 경계가 없으면 화면이 통째로 비어(흰 화면) 원인을 알 수 없으므로,
 * 여기서 잡아 에러 내용을 화면에 표시한다.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const {error} = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-100 p-8 font-sans text-slate-900">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-lg font-bold text-red-700">화면을 그리는 중 오류가 발생했습니다</h1>
          <p className="mb-4 text-sm text-slate-600">
            아래 내용을 복사해서 전달해 주시면 원인을 특정할 수 있습니다.
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-red-700">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({error: null})}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            다시 시도
          </button>
        </div>
      </div>
    );
  }
}
