import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = 'https://fxqmezfgyxqeyqmfpnym.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cW1lemZneXhxZXlxbWZwbnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTgyOTAsImV4cCI6MjEwNjk3NDI5MH0.pu5YfYtCh8zspmW8uT5hLZ1-OP3XTUT83I7tps1llsk'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

async function run() {
  console.log('1. Autenticando usuário master...')
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gabrielfreitasferrari70@gmail.com',
    password: '12345678',
  })
  if (authErr) throw authErr
  const userId = auth.user.id
  console.log('Autenticado como:', userId)

  console.log('2. Limpando dados legados do banco...')
  await supabase.from('mr_reviews').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('mr_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('mr_decks').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  console.log('3. Lendo arquivos fonte...')
  const uc2Path = '/Users/gabrielferrari/.gemini/antigravity/brain/d6b84a1d-9968-465e-aff0-6283c1ad3706/.user_uploaded/media_1791406266508_e2698f60.json'
  const uc2Data = JSON.parse(fs.readFileSync(uc2Path, 'utf8'))

  const catalogPath = path.resolve('public/catalog.json')
  const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

  // Mapa de Decks criados (title -> deckId)
  const titleToDeckId = new Map()
  const oldIdToNewId = new Map()

  // -------------------------------------------------------------
  // ESTRUTURA DO UC-2 (27 Pastas)
  // -------------------------------------------------------------
  console.log('4. Criando hierarquia de pastas do UC-2...')
  
  // Raiz UC-2
  const { data: uc2Deck } = await supabase.from('mr_decks').insert({
    title: 'UC-2',
    parent: null,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('UC-2', uc2Deck.id)
  oldIdToNewId.set('2g4vouhvqs2pmr4', uc2Deck.id)

  // Nível 1 de UC-2: Tutoria e Prova de Módulo
  const { data: tutoriaDeck } = await supabase.from('mr_decks').insert({
    title: 'Tutoria',
    parent: uc2Deck.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('Tutoria', tutoriaDeck.id)
  oldIdToNewId.set('fd7qc513s10zpx2', tutoriaDeck.id)

  const { data: provaModDeck } = await supabase.from('mr_decks').insert({
    title: 'Prova de Módulo',
    parent: uc2Deck.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('Prova de Módulo', provaModDeck.id)
  oldIdToNewId.set('wnme8gb4fzp48ui', provaModDeck.id)

  // Nível 2 de UC-2: Tutoria 1 até 17 (todas filhas de Tutoria)
  const tutoriaDecksList = uc2Data.decks.filter(d => d.parent === 'fd7qc513s10zpx2')
  for (const td of tutoriaDecksList) {
    const { data: created } = await supabase.from('mr_decks').insert({
      title: td.title,
      parent: tutoriaDeck.id,
      kind: 'custom',
      user_id: userId,
    }).select().single()
    titleToDeckId.set(td.title, created.id)
    oldIdToNewId.set(td.id, created.id)
  }

  // Nível 2 de UC-2: Prova de Cardiorrespiratório e Prova de Urogenital (filhas de Prova de Módulo)
  const { data: cardioDeck } = await supabase.from('mr_decks').insert({
    title: 'Prova de Cardiorrespiratório',
    parent: provaModDeck.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('Prova de Cardiorrespiratório', cardioDeck.id)
  oldIdToNewId.set('nswtbfvuy9q4v8u', cardioDeck.id)

  const { data: uroDeck } = await supabase.from('mr_decks').insert({
    title: 'Prova de Urogenital',
    parent: provaModDeck.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('Prova de Urogenital', uroDeck.id)
  oldIdToNewId.set('ifhjxifa9knz8y8', uroDeck.id)

  // Nível 3 de UC-2: Disciplinas de Cardiorrespiratório
  const cardioDisciplinas = uc2Data.decks.filter(d => d.parent === 'nswtbfvuy9q4v8u')
  for (const cd of cardioDisciplinas) {
    const { data: created } = await supabase.from('mr_decks').insert({
      title: cd.title,
      parent: cardioDeck.id,
      kind: 'custom',
      user_id: userId,
    }).select().single()
    titleToDeckId.set(cd.title, created.id)
    oldIdToNewId.set(cd.id, created.id)
  }

  console.log('UC-2 criado com sucesso! Total de pastas:', titleToDeckId.size)

  // -------------------------------------------------------------
  // ESTRUTURA DO UC-1 (Músculos / Locomotor)
  // -------------------------------------------------------------
  console.log('5. Criando hierarquia de pastas do UC-1...')
  const { data: uc1Deck } = await supabase.from('mr_decks').insert({
    title: 'UC-1',
    parent: null,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('UC-1', uc1Deck.id)

  const { data: uc1Anatomia } = await supabase.from('mr_decks').insert({
    title: 'Anatomia (UC-1)',
    parent: uc1Deck.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()

  const { data: uc1Locomotor } = await supabase.from('mr_decks').insert({
    title: 'Locomotor',
    parent: uc1Anatomia.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()

  const { data: uc1Musculo } = await supabase.from('mr_decks').insert({
    title: 'Prova prática de músculo.',
    parent: uc1Locomotor.id,
    kind: 'custom',
    user_id: userId,
  }).select().single()
  titleToDeckId.set('Prova prática de músculo.', uc1Musculo.id)

  // -------------------------------------------------------------
  // INSERÇÃO DAS 486 CARTAS DO UC-2
  // -------------------------------------------------------------
  console.log('6. Inserindo as 486 cartas do UC-2...')
  const uc2CardsPayload = []
  for (const c of uc2Data.cartas) {
    const targetDeckId = titleToDeckId.get(c.pasta)
    if (!targetDeckId) {
      console.warn('Aviso: pasta não encontrada:', c.pasta)
      continue
    }
    uc2CardsPayload.push({
      deck_id: targetDeckId,
      user_id: userId,
      q: c.frente,
      a: c.verso,
      ref: c.referencia || '',
      group: c.grupo || '',
      suspended: !!c.suspensa,
      clinical: /caso clínico|caso clinico/i.test(c.frente),
      reverse: false,
      tags: [],
    })
  }

  // Inserção em lotes de 100
  for (let i = 0; i < uc2CardsPayload.length; i += 100) {
    const chunk = uc2CardsPayload.slice(i, i + 100)
    const { error } = await supabase.from('mr_cards').insert(chunk)
    if (error) console.error('Erro ao inserir lote UC-2:', error)
  }
  console.log(`Sucesso: ${uc2CardsPayload.length} cartas do UC-2 inseridas!`)

  // -------------------------------------------------------------
  // INSERÇÃO DAS 377 CARTAS DO UC-1 (Músculos)
  // -------------------------------------------------------------
  console.log('7. Inserindo as 377 cartas de músculo do UC-1...')
  const muscleDeckOldId = catalogData.decks.find(d => d.title === 'Prova prática de músculo.')?.id
  const muscleCards = catalogData.cards.filter(c => c.deck === muscleDeckOldId)
  
  const uc1CardsPayload = muscleCards.map(c => ({
    deck_id: uc1Musculo.id,
    user_id: userId,
    q: c.q,
    a: c.a,
    ref: c.ref || '',
    group: c.group || '',
    suspended: !!c.suspended,
    clinical: !!c.clinical,
    reverse: !!c.reverse,
    tags: c.tags || [],
  }))

  for (let i = 0; i < uc1CardsPayload.length; i += 50) {
    const chunk = uc1CardsPayload.slice(i, i + 50)
    const { error } = await supabase.from('mr_cards').insert(chunk)
    if (error) console.error('Erro ao inserir lote UC-1:', error)
  }
  console.log(`Sucesso: ${uc1CardsPayload.length} cartas do UC-1 inseridas!`)

  // -------------------------------------------------------------
  // GERAÇÃO DO CATALOG.JSON ATUALIZADO (BACKUP ESTÁTICO PERFEITO)
  // -------------------------------------------------------------
  console.log('8. Gerando novo catalog.json unificado...')
  const { data: finalDecks } = await supabase.from('mr_decks').select('*')
  const { data: finalCards } = await supabase.from('mr_cards').select('id, deck_id, q, a, ref, group, suspended, clinical, reverse, tags, created_at')
  
  const updatedCatalog = {
    exported_at: new Date().toISOString(),
    decks: finalDecks.map(d => ({
      id: d.id,
      title: d.title,
      parent: d.parent,
      kind: d.kind,
      order: d.order,
    })),
    cards: finalCards.map(c => ({
      id: c.id,
      deck: c.deck_id,
      q: c.q,
      a: c.a,
      ref: c.ref,
      group: c.group,
      suspended: c.suspended,
      clinical: c.clinical,
      reverse: c.reverse,
      tags: c.tags,
      created: c.created_at,
    })),
  }

  fs.writeFileSync('public/catalog.json', JSON.stringify(updatedCatalog, null, 2))
  fs.writeFileSync('public/restorationData.json', JSON.stringify(updatedCatalog, null, 2))
  console.log(`Concluído! ${finalDecks.length} pastas e ${finalCards.length} cartões sincronizados em produção.`)
}

run().catch(console.error)
