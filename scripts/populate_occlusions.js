import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fxqmezfgyxqeyqmfpnym.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cW1lemZneXhxZXlxbWZwbnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTgyOTAsImV4cCI6MjEwNjk3NDI5MH0.pu5YfYtCh8zspmW8uT5hLZ1-OP3XTUT83I7tps1llsk'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

async function run() {
  console.log('1. Autenticando...')
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gabrielfreitasferrari70@gmail.com',
    password: '12345678',
  })
  if (authErr) throw authErr
  console.log('Autenticado com sucesso!')

  console.log('2. Buscando cartões de oclusão...')
  const { data: cards, error: cErr } = await supabase
    .from('mr_cards')
    .select('id, deck_id, q, a, created_at')
    .ilike('q', '%image-occlusion:%')
    .order('created_at', { ascending: true })

  if (cErr) throw cErr
  console.log('Cartões encontrados:', cards.length)

  // Agrupa por questão / diagrama
  const groups = new Map()
  for (const c of cards) {
    if (!groups.has(c.q)) groups.set(c.q, [])
    groups.get(c.q).push(c)
  }

  console.log('Diagramas únicos:', groups.size)

  let updatedCount = 0
  for (const [qText, noteCards] of groups.entries()) {
    const sampleA = noteCards[0].a
    const imgM = (sampleA + ' ' + qText).match(/<img[^>]+src=["']([^"']+)["']/i)
    const imgUrl = imgM ? imgM[1] : ''

    const maskMatches = [...qText.matchAll(/(?:\{\{c(\d+)::)?image-occlusion:(\w+):([^}\n<"]+)(?:\}\})?/g)]
    const masks = []
    let idx = 0
    for (const m of maskMatches) {
      idx++
      const clozeNum = m[1] ? parseInt(m[1], 10) : idx
      const params = m[3]
      const leftM = params.match(/left=([0-9.]+)/)
      const topM = params.match(/top=([0-9.]+)/)
      const widthM = params.match(/width=([0-9.]+)/)
      const heightM = params.match(/height=([0-9.]+)/)

      if (leftM && topM && widthM && heightM) {
        masks.push({
          id: 'c_' + clozeNum,
          x: Math.max(0, Math.min(100, parseFloat(leftM[1]) * 100)),
          y: Math.max(0, Math.min(100, parseFloat(topM[1]) * 100)),
          width: Math.max(0.5, Math.min(100, parseFloat(widthM[1]) * 100)),
          height: Math.max(0.5, Math.min(100, parseFloat(heightM[1]) * 100)),
          label: 'Estrutura ' + clozeNum,
        })
      }
    }

    for (let ord = 0; ord < noteCards.length; ord++) {
      const card = noteCards[ord]
      const activeMask = masks[ord] || masks[0]
      const occObj = {
        imageUrl: imgUrl,
        imageTitle: 'Anatomia — Identificação Muscular',
        masks,
        activeMaskId: activeMask ? activeMask.id : 'c_1',
        mode: 'hide_all_guess_one',
      }

      const { error: uErr } = await supabase
        .from('mr_cards')
        .update({ occlusion: occObj })
        .eq('id', card.id)

      if (uErr) {
        console.error('Erro ao atualizar card:', card.id, uErr)
      } else {
        updatedCount++
      }
    }
  }

  console.log('Sucesso! Total de cartões de oclusão gravados no Supabase:', updatedCount)
}

run()
