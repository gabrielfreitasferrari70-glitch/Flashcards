import { supabase } from '../supabase/client'

// Um proxy (adaptador) para enganar o frontend antigo fazendo-o pensar que está falando com o PocketBase,
// mas na verdade está falando com o Supabase.

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
        
        // Pega o perfil para ver se está aprovado
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
            password: payload.password
          })
          if (error) throw error
          
          // O trigger do Supabase cria o profile automaticamente com approved=false.
          // Só atualizamos o nome se necessário.
          if (data.user && payload.name) {
            await supabase.from('profiles').update({ name: payload.name }).eq('id', data.user.id)
          }
          
          return data.user
        }
        throw new Error('Create not implemented for ' + name)
      },
      getFullList: async (options?: { sort?: string }) => {
        let query = supabase.from(name).select('*')
        
        if (options?.sort) {
          const isDesc = options.sort.startsWith('-')
          const col = isDesc ? options.sort.substring(1) === "created" ? "created_at" : (options.sort.substring(1) || options.sort) === "created" ? "created_at" : (options.sort.startsWith("-") ? options.sort.substring(1) : options.sort)
          query = query.order(col, { ascending: !isDesc })
        }
        
        const { data, error } = await query
        if (error) {
          console.error(`Erro ao buscar ${name}:`, error)
          return []
        }
        return data
      }
    }
  },
  files: {
    getURL: (record: any, filename: string) => {
      // Retorna placeholder ou null por enquanto, já que imagens demandariam Storage no Supabase
      return ''
    }
  }
}

export default pb
