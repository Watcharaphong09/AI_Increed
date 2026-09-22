import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RefreshCw, Trash2 } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleClearAndReload = () => {
    try {
      sessionStorage.clear()
    } catch {
      // ignore
    }
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 min-h-[300px] h-full flex flex-col items-center justify-center p-6 text-center bg-gray-950 text-gray-100">
          <div className="max-w-md w-full p-6 rounded-2xl border border-red-500/30 bg-red-950/20 shadow-2xl backdrop-blur-sm space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-900/40 border border-red-500/40 flex items-center justify-center text-red-400">
              <AlertOctagon className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-red-300">
                {this.props.fallbackTitle || 'เกิดข้อผิดพลาดในการแสดงผลหน้าจอ'}
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                ระบบตรวจพบข้อผิดพลาดขณะวาดหน้าจอ (React Render Error)
                สามารถลองรีโหลดหรือล้างข้อมูลชั่วคราวเพื่อแก้ไขได้ทันที
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-gray-950/80 border border-red-900/40 rounded-lg p-3 text-[11px] text-red-300/90 font-mono break-all max-h-28 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>รีโหลดใหม่</span>
              </button>
              <button
                type="button"
                onClick={this.handleClearAndReload}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/60 transition-colors shadow-md"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ล้างแคช & รีเซ็ต</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
