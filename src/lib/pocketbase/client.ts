import { supabase } from '../supabase/client'

class AuthStore {
  isValid = false
  record: any = null

  clear() {
    this.isValid = false
    this.record = null
    supabase.auth.signOut()
  }
}

const authStore = new AuthStore()

const pb = {
  authStore,
  collection: (name: string) => {
    return {
      authRefresh: async () => {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error || !session) {
          authStore.clear()
          throw new Error('Sessão inválida')
        }
        
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        
        authStore.isValid = true
        authStore.record = {
          id: session.user.id,
          email: session.user.email,
          name: profile?.name || session.user.email,
          approved: profile?.approved === true
        }
        return { record: authStore.record }
      },
      authWithPassword: async (email: string, pass: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw new Error('Credenciais inválidas ou erro no Supabase')
        
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
        
        authStore.isValid = true
        authStore.record = {
          id: data.user.id,
          email: data.user.email,
          name: profile?.name || data.user.email,
          approved: profile?.approved === true
        }
        return { record: authStore.record }
      },
      create: async (payload: any) => {
        if (name === 'users') {
          const { data, error } = await supabase.auth.signUp({
            email: payload.email,
            password: payload.password,
            options: {
              data: { name: payload.name }
            }
          })
          if (error) throw error
          
          if (data.user && payload.name) {
            await supabase.from('profiles').update({ name: payload.name }).eq('id', data.user.id)
          }
          return data.user
        }
        throw new Error('Create not implemented for ' + name)
      },
      getFullList: async (options?: { sort?: string }) => {
        const batchSize = name === 'mr_cards' ? 250 : 1000
        let allRows: any[] = []
        let from = 0
        let hasMore = true

        while (hasMore) {
          let query = supabase.from(name).select('*')

          if (name === 'mr_cards') {
            // Ignora os registros legados pesados com Base64 (que causam statement timeout)
            // e carrega apenas os 1.352 cartões limpos e otimizados
            query = query.gte('created_at', '2026-10-08T12:00:00Z')
          }

          const { data, error } = await query.range(from, from + batchSize - 1)

          if (error) {
            console.error(`Erro ao buscar ${name} (range ${from}-${from + batchSize - 1}):`, error)
            break
          }
          if (!data || data.length === 0) {
            break
          }
          allRows.push(...data)
          if (data.length < batchSize) {
            hasMore = false
          } else {
            from += batchSize
          }
        }

        // Ordenação client-side ultra-rápida em memória (evita timeouts no Postgres)
        if (options?.sort) {
          const isDesc = options.sort.startsWith('-')
          let col = isDesc ? options.sort.substring(1) : options.sort
          if (col === 'created') col = 'created_at'
          if (col === 'updated') col = 'updated_at'
          allRows.sort((a, b) => {
            const va = a[col]
            const vb = b[col]
            if (va === vb) return 0
            if (va === null || va === undefined) return 1
            if (vb === null || vb === undefined) return -1
            return isDesc ? (va > vb ? -1 : 1) : (va > vb ? 1 : -1)
          })
        }

        // Mapeia colunas do Supabase para o formato esperado pelo frontend (estilo Pocketbase)
        return allRows.map((row: any) => {
          const mapped = { ...row }
          if (row.created_at) mapped.created = row.created_at
          if (row.updated_at) mapped.updated = row.updated_at
          if (name === 'mr_cards' && row.deck_id) mapped.deck = row.deck_id
          if (name === 'mr_reviews' && row.card_id) mapped.card_ref = row.card_id
          return mapped
        })
      }
    }
  },
  files: {
    getURL: (record: any, filename: string) => {
      if (!filename) return ''
      if (/^(https?:|data:|\/)/i.test(filename)) return filename
      return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/card-images/${filename}`
    }
  }
}

export default pb
