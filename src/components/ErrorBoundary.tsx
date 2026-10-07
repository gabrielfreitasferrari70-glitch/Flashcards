import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  onReset?: () => void
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
    console.error('MedReview ErrorBoundary capturou um erro não tratado:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.href = '/'
  }

  private handleClearAndReset = () => {
    try {
      // Limpa dados temporários que possam estar corrompidos sem apagar auth
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    if (this.props.onReset) {
      this.setState({ hasError: false, error: null, errorInfo: null })
      this.props.onReset()
    } else {
      window.location.href = '/'
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#f8fafc',
            padding: '24px',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '540px',
              width: '100%',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              padding: '32px 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1.5px solid #ef4444',
                color: '#ef4444',
                display: 'grid',
                placeItems: 'center',
                fontSize: '2rem',
                margin: '0 auto 18px',
              }}
            >
              🩺
            </div>

            <h1
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color: '#ffffff',
                margin: '0 0 10px',
                letterSpacing: '-0.02em',
              }}
            >
              {this.props.fallbackTitle || 'Ops! Algo inesperado aconteceu'}
            </h1>

            <p
              style={{
                fontSize: '.92rem',
                color: '#94a3b8',
                lineHeight: 1.5,
                margin: '0 0 24px',
              }}
            >
              O MedReview encontrou uma instabilidade ao processar este componente. Não se preocupe, seus dados e progresso estão seguros.
            </p>

            {this.state.error && (
              <details
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '24px',
                  textAlign: 'left',
                  fontSize: '.78rem',
                  color: '#fca5a5',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '160px',
                }}
              >
                <summary style={{ cursor: 'pointer', color: '#cbd5e1', fontWeight: 600 }}>
                  Detalhes técnicos do erro
                </summary>
                <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {this.state.error.toString()}
                </p>
              </details>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  fontSize: '.92rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                  transition: 'all 0.2s',
                }}
              >
                🔄 Recarregar MedReview
              </button>

              <button
                onClick={this.handleClearAndReset}
                style={{
                  background: '#334155',
                  color: '#f1f5f9',
                  border: '1px solid #475569',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontSize: '.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🏠 Voltar para a Página Principal
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
