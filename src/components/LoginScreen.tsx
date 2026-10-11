import { useState } from 'react'
import { ArrowRight, Brain, Cloud, Eye, EyeOff, Stethoscope, WifiOff } from 'lucide-react'

interface Props {
  mode: 'login' | 'signup'
  onModeChange: (mode: 'login' | 'signup') => void
  name: string
  onNameChange: (value: string) => void
  email: string
  onEmailChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  error: string
  busy: boolean
  onSubmit: () => void
}

export function LoginScreen(props: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const signup = props.mode === 'signup'

  return (
    <section className="mr-login" aria-label="Acesso ao MedReview">
      <div className="mr-login-card">
        <div className="mr-login-brand">
          <Stethoscope size={28} aria-hidden="true" />
        </div>
        <h1>MedReview</h1>
        <p className="mr-login-intro">Sua rotina de estudo, com mais clareza.</p>
        <div className="mr-login-tabs" role="group" aria-label="Tipo de acesso">
          <button type="button" aria-pressed={!signup} onClick={() => props.onModeChange('login')}>
            Entrar
          </button>
          <button type="button" aria-pressed={signup} onClick={() => props.onModeChange('signup')}>
            Criar conta
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!props.busy) props.onSubmit()
          }}
        >
          {signup && (
            <div className="mr-login-field">
              <label htmlFor="mr-login-name">Nome</label>
              <input
                id="mr-login-name"
                autoComplete="name"
                placeholder="Como podemos te chamar?"
                value={props.name}
                onChange={(event) => props.onNameChange(event.target.value)}
              />
            </div>
          )}
          <div className="mr-login-field">
            <label htmlFor="mr-login-email">E-mail</label>
            <input
              id="mr-login-email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={props.email}
              onChange={(event) => props.onEmailChange(event.target.value)}
            />
          </div>
          <div className="mr-login-field">
            <label htmlFor="mr-login-password">Senha</label>
            <div className="mr-login-password">
              <input
                id="mr-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={signup ? 'new-password' : 'current-password'}
                placeholder={signup ? 'Pelo menos 8 caracteres' : 'Sua senha'}
                value={props.password}
                onChange={(event) => props.onPasswordChange(event.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          {props.error && (
            <p className="mr-login-error" role="alert">
              {props.error}
            </p>
          )}
          <button className="mr-login-submit" type="submit" disabled={props.busy}>
            {props.busy ? 'Aguarde…' : signup ? 'Criar conta e começar' : 'Entrar na minha conta'}
            {!props.busy && <ArrowRight size={18} aria-hidden="true" />}
          </button>
        </form>
        <div className="mr-login-benefits">
          <span>
            <Cloud size={14} aria-hidden="true" /> Progresso na nuvem
          </span>
          <span>
            <WifiOff size={14} aria-hidden="true" /> Estudo offline
          </span>
          <span>
            <Brain size={14} aria-hidden="true" /> FSRS-5
          </span>
        </div>
      </div>
      <p className="mr-login-footer">Revisão médica ativa. Um pouco a cada dia.</p>
    </section>
  )
}
