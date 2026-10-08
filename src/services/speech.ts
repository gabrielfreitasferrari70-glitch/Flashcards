/**
 * MedReview Speech Service (Text-to-Speech nativo)
 * Lê perguntas e respostas em voz alta usando a API SpeechSynthesis do navegador.
 * Suporta português brasileiro (pt-BR) com limpeza de HTML e suporte a Cloze.
 */

class SpeechService {
  private synth: SpeechSynthesis | null = null
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private preferredVoice: SpeechSynthesisVoice | null = null
  private isSpeaking = false
  private listeners = new Set<(speaking: boolean) => void>()
  public rate = 1.0

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis
      this.loadVoices()
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices()
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return
    const voices = this.synth.getVoices()
    // Prioriza vozes pt-BR naturais (Google português, Luciana, etc)
    const ptBr = voices.find((v) => v.lang === 'pt-BR' || v.lang === 'pt_BR') ||
      voices.find((v) => v.lang.startsWith('pt'))
    if (ptBr) {
      this.preferredVoice = ptBr
    }
  }

  public subscribe(callback: (speaking: boolean) => void) {
    this.listeners.add(callback)
    callback(this.isSpeaking)
    return () => {
      this.listeners.delete(callback)
    }
  }

  private notify(speaking: boolean) {
    this.isSpeaking = speaking
    this.listeners.forEach((cb) => cb(speaking))
  }

  /**
   * Limpa tags HTML e formata expressões Cloze para leitura natural por voz
   */
  public cleanTextForSpeech(raw: string, isRevealed: boolean = false): string {
    if (!raw) return ''
    let text = raw
      // Substitui Cloze {{c1::termo::dica}}
      .replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g, (_, term, tip) => {
        if (isRevealed) {
          return term
        }
        return tip ? `espaço em branco, dica: ${tip}` : 'espaço em branco'
      })
      // Remove tags HTML
      .replace(/<[^>]*>/g, ' ')
      // Decodifica entidades HTML básicas
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()

    return text
  }

  public speak(text: string, isRevealed: boolean = false, rate?: number): Promise<void> {
    if (!this.synth) return Promise.resolve()
    this.stop()

    const cleaned = this.cleanTextForSpeech(text, isRevealed)
    if (!cleaned) return Promise.resolve()

    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(cleaned)
      utter.lang = 'pt-BR'
      if (this.preferredVoice) {
        utter.voice = this.preferredVoice
      }
      utter.rate = rate || this.rate

      utter.onstart = () => {
        this.notify(true)
      }
      utter.onend = () => {
        this.notify(false)
        this.currentUtterance = null
        resolve()
      }
      utter.onerror = () => {
        this.notify(false)
        this.currentUtterance = null
        resolve()
      }

      this.currentUtterance = utter
      this.synth?.speak(utter)
    })
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel()
      this.currentUtterance = null
      this.notify(false)
    }
  }

  public isCurrentlySpeaking(): boolean {
    return this.isSpeaking
  }
}

export const speechService = new SpeechService()
