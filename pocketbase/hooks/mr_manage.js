// Rota administrativa (diagnóstico/reparo): SEM auth do PocketBase, protegida
// APENAS pela chave X-MR-Admin-Key (secret do projeto). Nunca exposta ao frontend.
// Path v2: a rota /backend/v1/mr/admin antiga pode ficar em memória no runtime
// do PocketBase (rotas duplicadas = a primeira registrada responde); um path
// novo garante que ESTA versão do hook atenda.
routerAdd('POST', '/backend/v1/mr/admin2', (e) => {
  const adminKey = $secrets.get('MR_ADMIN_KEY') || ''
  const info = e.requestInfo()
  const rawHeaders = info.headers || {}
  const lowerHeaders = {}
  for (const k of Object.keys(rawHeaders)) lowerHeaders[String(k).toLowerCase()] = rawHeaders[k]
  const reqKey = String(lowerHeaders['x_mr_admin_key'] || '')

  if (!adminKey || reqKey !== adminKey) {
    return e.json(403, { ok: false, error: 'chave inválida' })
  }
  const body = e.requestInfo().body || {}
  const action = String(body.action || '')
  if (action === 'admin_find_user') {
    try {
      const email = String(body.email || '').toLowerCase()
      const rows = $app.findRecordsByFilter('users', 'email = {:email}', '-created', 5, 0, {
        email,
      })
      return e.json(200, {
        ok: true,
        users: rows.map((u) => ({
          id: u.id,
          email: u.getString('email'),
          name: u.getString('name'),
        })),
      })
    } catch (err) {
      return e.json(500, { ok: false, error: String(err && err.message ? err.message : err) })
    }
  }
  if (action === 'admin_inspect') {
    const target = String(body.user_id || '')
    const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
      user: target,
    })
    const decks = rows.map((d) => ({
      id: d.id,
      title: d.getString('title'),
      kind: d.getString('kind'),
      parent: d.getString('parent'),
      mode: d.getString('mode'),
      seed_key: d.getString('seed_key'),
      deleted: d.getBool('deleted'),
    }))
    return e.json(200, { ok: true, decks })
  }
  if (action === 'admin_cards') {
    // Cartas da conta: vivas e apagadas, com o deck — para diagnosticar perdas.
    const target = String(body.user_id || '')
    const rows = $app.findRecordsByFilter('mr_cards', 'user_id = {:user}', '-created', 2000, 0, {
      user: target,
    })
    const cards = rows.map((c) => ({
      id: c.id,
      deck: c.getString('deck'),
      q: c.getString('q').slice(0, 60),
      deleted: c.getBool('deleted'),
    }))
    return e.json(200, {
      ok: true,
      total: cards.length,
      alive: cards.filter((c) => !c.deleted).length,
      deleted: cards.filter((c) => c.deleted).length,
      cards,
    })
  }
  if (action === 'admin_restore_deck') {
    // Restaurar (undelete) TODOS os decks soft-deletados da conta + suas cartas.
    const target = String(body.user_id || '')
    const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
      user: target,
    })
    let restoredDecks = 0
    let restoredCards = 0
    for (const d of rows) {
      if (!d.getBool('deleted')) continue
      d.set('deleted', false)
      $app.save(d)
      restoredDecks++
      const cards = $app.findRecordsByFilter(
        'mr_cards',
        'user_id = {:user} && deck = {:deck}',
        '-created',
        1000,
        0,
        { user: target, deck: d.id },
      )
      for (const c of cards) {
        if (c.getBool('deleted')) {
          c.set('deleted', false)
          $app.save(c)
          restoredCards++
        }
      }
    }
    return e.json(200, { ok: true, restoredDecks, restoredCards })
  }
  if (action === 'admin_deck_edit') {
    // Editar deck da conta: kind e parent (reorganização administrativa).
    const target = String(body.user_id || '')
    const d = $app.findRecordById('mr_decks', String(body.deck_id || ''))
    if (d.getString('user_id') !== target)
      return e.json(403, { ok: false, error: 'não é da conta' })
    if (['tutoria', 'prova', 'custom'].includes(body.kind)) d.set('kind', body.kind)
    if ('parent' in body) d.set('parent', String(body.parent || ''))
    if (body.title) d.set('title', String(body.title).slice(0, 200))
    $app.save(d)
    return e.json(200, {
      ok: true,
      id: d.id,
      kind: d.getString('kind'),
      parent: d.getString('parent'),
    })
  }
  if (action === 'admin_deck_delete') {
    // Soft-delete SELETIVO de um deck (e subárvore + cartas) — limpeza de pastas de teste.
    const target = String(body.user_id || '')
    const root = $app.findRecordById('mr_decks', String(body.deck_id || ''))
    if (root.getString('user_id') !== target)
      return e.json(403, { ok: false, error: 'não é da conta' })
    const allDecks = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
      user: target,
    })
    const ids = {}
    ids[root.id] = true
    let changed = true
    while (changed) {
      changed = false
      for (const d of allDecks) {
        const pid = d.getString('parent')
        if (pid && ids[pid] && !ids[d.id]) {
          ids[d.id] = true
          changed = true
        }
      }
    }
    let n = 0
    for (const d of allDecks) {
      if (!ids[d.id] || d.getBool('deleted')) continue
      d.set('deleted', true)
      $app.save(d)
      n++
      const cards = $app.findRecordsByFilter(
        'mr_cards',
        'user_id = {:user} && deck = {:deck}',
        '-created',
        1000,
        0,
        { user: target, deck: d.id },
      )
      for (const c of cards) {
        if (!c.getBool('deleted')) {
          c.set('deleted', true)
          $app.save(c)
        }
      }
    }
    return e.json(200, { ok: true, deleted: n })
  }
  if (action === 'admin_repair') {
    // Restaurar estado inicial de um kind (mesma lógica do deck_section_repair)
    const toRestoreKind = ['tutoria', 'prova', 'custom'].includes(body.restore_kind)
      ? body.restore_kind
      : ''
    if (!toRestoreKind) return e.json(400, { ok: false, error: 'kind inválido' })
    const target = String(body.user_id || '')
    const allDecks = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
      user: target,
    })
    const sectionNames =
      toRestoreKind === 'tutoria'
        ? ['Tutoria']
        : toRestoreKind === 'prova'
          ? ['Prova de Módulo', 'Prova']
          : []
    let blocksDeleted = 0
    let restored = 0
    for (const d of allDecks) {
      if (d.getBool('deleted')) continue
      const isBlock =
        d.getString('mode') === 'organizer' &&
        sectionNames.includes(d.getString('title')) &&
        d.getString('kind') !== toRestoreKind
      if (isBlock) {
        for (const kid of allDecks) {
          if (kid.getString('parent') === d.id && !kid.getBool('deleted')) {
            kid.set('parent', '')
            kid.set('kind', toRestoreKind)
            $app.save(kid)
          }
        }
        d.set('deleted', true)
        $app.save(d)
        blocksDeleted++
        continue
      }
      const title = d.getString('title')
      const pattern = body.title_pattern || ''
      if (pattern && !new RegExp(pattern, 'i').test(title)) continue
      if (d.getString('mode') === 'organizer' && sectionNames.includes(title)) continue
      const isRootOfKind = !d.getString('parent') && d.getString('kind') === toRestoreKind
      if (isRootOfKind) continue
      d.set('parent', '')
      d.set('kind', toRestoreKind)
      $app.save(d)
      restored++
    }
    return e.json(200, { ok: true, restored, blocksDeleted })
  }
  if (action === 'admin_list_users') {
    const rows = $app.findRecordsByFilter('users', '', '-created', 20, 0)
    return e.json(200, {
      ok: true,
      users: rows.map((u) => ({
        id: u.id,
        email: u.getString('email'),
        name: u.getString('name'),
        created: u.getString('created'),
      })),
    })
  }
  if (action === 'admin_delete_user') {
    // Apagar conta de teste definitivamente: remove o user + dados MedReview.
    const target = String(body.user_id || '')
    const u = $app.findRecordById('users', target)
    u.set('verified', true)
    $app.delete(u)
    return e.json(200, { ok: true, deleted: target })
  }
  if (action === 'admin_fix_frontline') {
    // Reparo: pastas custom de raiz marcadas como frontline mas sem o campo
    // gravado (bug de criação v0.0.304-311) — restaura a visibilidade na home.
    const target = String(body.user_id || '')
    const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
      user: target,
    })
    let fixed = 0
    for (const d of rows) {
      if (d.getBool('deleted')) continue
      if (d.getString('kind') !== 'custom' || d.getString('parent')) continue
      if (d.getBool('frontline')) continue
      if (!body.title) continue
      if (d.getString('title') !== String(body.title)) continue
      d.set('frontline', true)
      $app.save(d)
      fixed++
    }
    return e.json(200, { ok: true, fixed })
  }
  if (action === 'admin_fix_seedkeys') {
    // Reparo de dados: pastas do catálogo (Tutoria N / Prova ...) sem seed_key
    // viram "cards de usuário" na home (duplicando com o card da seção).
    const target = String(body.user_id || '')
    const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
      user: target,
    })
    let fixed = 0
    for (const d of rows) {
      if (d.getBool('deleted')) continue
      if (d.getString('seed_key')) continue
      const title = d.getString('title')
      const isSeed =
        (d.getString('kind') === 'tutoria' && /^Tutoria \d+/.test(title)) ||
        (d.getString('kind') === 'prova' && /^Prova /.test(title))
      if (!isSeed) continue
      d.set('seed_key', 'seed:' + d.id)
      $app.save(d)
      fixed++
    }
    return e.json(200, { ok: true, fixed })
  }
  return e.json(400, { ok: false, error: 'ação desconhecida' })
})

// Operações de gestão MedReview; todas verificam ownership dentro do backend.
// v0.0.242: choices/reverse (múltipla escolha e reversas) — requer migration 0005.
routerAdd(
  'POST',
  '/backend/v1/mr/manage',
  (e) => {
    const userId = e.auth && e.auth.id ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('Faça login para alterar sua biblioteca.')
    // Ação administrativa pontual: agora vive na rota dedicada /backend/v1/mr/admin
    // (chave X-MR-Admin-Key). Nada de leitura de header aqui — e.requestInfo()
    // não tem .header() e um TypeError aqui derruba TODAS as ações do manage.
    const body = e.requestInfo().body || {}
    const action = String(body.action || '')
    const ownDeck = (id) => {
      const deck = $app.findRecordById('mr_decks', String(id || ''))
      if (deck.getString('user_id') !== userId || deck.getBool('deleted'))
        throw new Error('deck_not_owned')
      return deck
    }
    const ownCard = (id) => {
      const card = $app.findRecordById('mr_cards', String(id || ''))
      if (card.getString('user_id') !== userId || card.getBool('deleted'))
        throw new Error('card_not_owned')
      return card
    }
    const cleanText = (value, max) =>
      String(value == null ? '' : value)
        .trim()
        .slice(0, max)
    try {
      if (action === 'admin_inspect') {
        // Diagnóstico: árvore completa de pastas do usuário (id, título, kind,
        // parent, mode, deleted) — para ver exatamente onde as pastas estão.
        const target = String(body.user_id || '')
        const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
          user: target,
        })
        const decks = rows.map((d) => ({
          id: d.id,
          title: d.getString('title'),
          kind: d.getString('kind'),
          parent: d.getString('parent'),
          mode: d.getString('mode'),
          seed_key: d.getString('seed_key'),
          deleted: d.getBool('deleted'),
        }))
        return e.json(200, { ok: true, decks })
      }
      if (action === 'deck_create') {
        const title = cleanText(body.title, 200)
        const kind = ['tutoria', 'prova', 'custom'].includes(body.kind) ? body.kind : 'custom'
        const mode = ['study', 'organizer'].includes(body.mode) ? body.mode : 'study'
        if (!title) return e.badRequestError('O nome da pasta é obrigatório.')
        let parent = null
        if (body.parent_id) parent = ownDeck(body.parent_id)
        const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
          user: userId,
        })
        const col = $app.findCollectionByNameOrId('mr_decks')
        const deck = new Record(col)
        deck.set('user_id', userId)
        deck.set('title', title)
        deck.set('kind', kind)
        deck.set('mode', mode)
        deck.set('order', rows.length + 1)
        if (parent) deck.set('parent', parent.id)
        if (body.frontline === true) deck.set('frontline', true)
        $app.save(deck)
        // A pasta que ganhou uma subpasta passa a ser organizadora.
        if (parent && parent.getString('mode') !== 'organizer') {
          parent.set('mode', 'organizer')
          $app.save(parent)
        }
        return e.json(201, { id: deck.id, title, kind, mode, parent: parent ? parent.id : '' })
      }

      if (action === 'deck_rename') {
        const deck = ownDeck(body.deck_id)
        const title = cleanText(body.title, 200)
        if (!title) return e.badRequestError('O nome da pasta é obrigatório.')
        deck.set('title', title)
        $app.save(deck)
        return e.json(200, { id: deck.id, title })
      }

      if (action === 'deck_delete') {
        const root = ownDeck(body.deck_id)
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const ids = {}
        ids[root.id] = true
        let changed = true
        while (changed) {
          changed = false
          for (let i = 0; i < allDecks.length; i++) {
            const parentId = allDecks[i].getString('parent')
            if (parentId && ids[parentId] && !ids[allDecks[i].id]) {
              ids[allDecks[i].id] = true
              changed = true
            }
          }
        }
        let deletedDecks = 0
        for (let i = 0; i < allDecks.length; i++) {
          if (!ids[allDecks[i].id]) continue
          allDecks[i].set('deleted', true)
          $app.save(allDecks[i])
          deletedDecks++
          const cards = $app.findRecordsByFilter(
            'mr_cards',
            'user_id = {:user} && deck = {:deck}',
            '-created',
            1000,
            0,
            { user: userId, deck: allDecks[i].id },
          )
          for (let j = 0; j < cards.length; j++) {
            if (!cards[j].getBool('deleted')) {
              cards[j].set('deleted', true)
              $app.save(cards[j])
            }
          }
        }
        return e.json(200, { ok: true, deletedDecks })
      }

      if (action === 'card_import_auto') {
        // Importação com pastas automáticas: cada item pode trazer folder_title;
        // pastas inexistentes são criadas sob o deck pai informado (ou raiz custom).
        const parentDeck = body.parent_deck_id ? ownDeck(body.parent_deck_id) : null
        const inputCards = Array.isArray(body.cards) ? body.cards : []
        if (!inputCards.length || inputCards.length > 250)
          return e.badRequestError('Envie entre 1 e 250 cartões por lote.')
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const byTitle = {}
        for (const d of allDecks) {
          if (!d.getBool('deleted')) byTitle[d.getString('title').toLowerCase()] = d
        }
        const createdDecks = {}
        const getOrCreateDeck = (title) => {
          const key = String(title).trim().toLowerCase()
          if (!key) return parentDeck || null
          if (byTitle[key]) return byTitle[key]
          const col = $app.findCollectionByNameOrId('mr_decks')
          const deck = new Record(col)
          deck.set('user_id', userId)
          deck.set('title', String(title).trim().slice(0, 200))
          deck.set('kind', parentDeck ? parentDeck.getString('kind') : 'custom')
          deck.set('order', allDecks.length + Object.keys(createdDecks).length + 1)
          if (parentDeck) deck.set('parent', parentDeck.id)
          $app.save(deck)
          // A pasta que recebeu o import com pastas automáticas vira organizadora.
          if (parentDeck && parentDeck.getString('mode') !== 'organizer') {
            parentDeck.set('mode', 'organizer')
            $app.save(parentDeck)
          }
          byTitle[key] = deck
          createdDecks[deck.id] = true
          return deck
        }
        const createdIds = []
        for (let i = 0; i < inputCards.length; i++) {
          const item = inputCards[i] || {}
          const q = String(item.q == null ? '' : item.q).trim()
          const a = String(item.a == null ? '' : item.a).trim()
          if (!q || !a) return e.badRequestError('Cada cartão precisa ter frente e verso.')
          if (q.length > 5000 || a.length > 20000)
            return e.badRequestError('Frente ou verso excede o limite de caracteres.')
          const deck = getOrCreateDeck(item.folder_title || '')
          if (!deck) return e.badRequestError('Informe a pasta de destino ou a coluna pasta.')
          const col = $app.findCollectionByNameOrId('mr_cards')
          const card = new Record(col)
          card.set('user_id', userId)
          card.set('deck', deck.id)
          card.set('q', q)
          card.set('a', a)
          card.set('group', cleanText(item.group, 200))
          card.set('ref', cleanText(item.ref, 500))
          card.set('suspended', false)
          card.set('deleted', false)
          card.set('clinical', !!item.clinical)
          if (item.imageUrl && /^https?:\/\//i.test(String(item.imageUrl))) {
            card.set('diagram_svg', String(item.imageUrl).trim().slice(0, 2000))
            card.set('diagram_title', 'Imagem')
          }
          $app.save(card)
          createdIds.push(card.id)
        }
        return e.json(201, {
          created: createdIds.length,
          ids: createdIds,
          createdDecks: Object.keys(createdDecks).length,
        })
      }

      if (action === 'card_create' || action === 'card_import') {
        const deck = ownDeck(body.deck_id)
        const inputCards = action === 'card_import' ? body.cards : [body.card || body]
        if (!Array.isArray(inputCards) || inputCards.length < 1 || inputCards.length > 250) {
          return e.badRequestError('Envie entre 1 e 250 cartões por lote.')
        }
        const createdIds = []
        for (let i = 0; i < inputCards.length; i++) {
          const item = inputCards[i] || {}
          const q = String(item.q == null ? '' : item.q).trim()
          const a = String(item.a == null ? '' : item.a).trim()
          if (!q || !a) return e.badRequestError('Cada cartão precisa ter frente e verso.')
          if (q.length > 5000 || a.length > 20000)
            return e.badRequestError('Frente ou verso excede o limite de caracteres.')
          const col = $app.findCollectionByNameOrId('mr_cards')
          const card = new Record(col)
          card.set('user_id', userId)
          card.set('deck', deck.id)
          card.set('q', q)
          card.set('a', a)
          card.set('group', cleanText(item.group, 200))
          card.set('ref', cleanText(item.ref, 500))
          card.set('suspended', false)
          card.set('deleted', false)
          card.set('clinical', !!item.clinical)
          if (item.diagramSvg) {
            card.set('diagram_svg', String(item.diagramSvg).slice(0, 20000))
            card.set('diagram_title', cleanText(item.diagramTitle, 200))
          }
          if (item.imageUrl && /^https?:\/\//i.test(String(item.imageUrl))) {
            card.set('diagram_svg', String(item.imageUrl).trim().slice(0, 2000))
            card.set('diagram_title', 'Imagem')
          }
          if (item.choices !== undefined && item.choices !== null) {
            let opts = item.choices
            if (typeof opts === 'string') {
              try {
                opts = JSON.parse(opts)
              } catch (_) {
                opts = []
              }
            }
            if (Array.isArray(opts)) {
              const bad = opts
                .map((o) =>
                  String(o == null ? '' : o)
                    .trim()
                    .slice(0, 300),
                )
                .filter(Boolean)
              card.set('choices', bad.slice(0, 6))
            }
          }
          if (item.reverse !== undefined) card.set('reverse', !!item.reverse)
          $app.save(card)
          createdIds.push(card.id)
        }
        return e.json(201, { created: createdIds.length, ids: createdIds })
      }

      if (action === 'card_update') {
        const card = ownCard(body.card_id)
        const q = String(body.q == null ? '' : body.q).trim()
        const a = String(body.a == null ? '' : body.a).trim()
        if (!q || !a) return e.badRequestError('Frente e verso são obrigatórios.')
        if (q.length > 5000 || a.length > 20000)
          return e.badRequestError('Frente ou verso excede o limite de caracteres.')
        card.set('q', q)
        card.set('a', a)
        card.set('group', cleanText(body.group, 200))
        card.set('ref', cleanText(body.ref, 500))
        if (body.clinical !== undefined) card.set('clinical', !!body.clinical)
        if (body.imageUrl && /^https?:\/\//i.test(String(body.imageUrl))) {
          card.set('diagram_svg', String(body.imageUrl).trim().slice(0, 2000))
          card.set('diagram_title', 'Imagem')
        }
        if (body.choices !== undefined) {
          let opts = body.choices
          if (typeof opts === 'string') {
            try {
              opts = JSON.parse(opts)
            } catch (_) {
              opts = []
            }
          }
          if (Array.isArray(opts)) {
            const bad = opts
              .map((o) =>
                String(o == null ? '' : o)
                  .trim()
                  .slice(0, 300),
              )
              .filter(Boolean)
            card.set('choices', bad.slice(0, 6))
          } else card.set('choices', null)
        }
        if (body.reverse !== undefined) card.set('reverse', !!body.reverse)
        $app.save(card)
        return e.json(200, { id: card.id, ok: true })
      }

      if (action === 'card_suspend') {
        const card = ownCard(body.card_id)
        card.set('suspended', !!body.suspended)
        $app.save(card)
        return e.json(200, { id: card.id, suspended: card.getBool('suspended') })
      }

      if (action === 'card_delete') {
        const card = ownCard(body.card_id)
        card.set('deleted', true)
        $app.save(card)
        return e.json(200, { id: card.id, deleted: true })
      }

      if (action === 'card_move') {
        const card = ownCard(body.card_id)
        const deck = ownDeck(body.deck_id)
        card.set('deck', deck.id)
        $app.save(card)
        return e.json(200, { id: card.id, deck: deck.id })
      }

      if (action === 'deck_section_repair') {
        // Restaurar estado inicial: devolve TODAS as pastas de um kind que estão
        // em outro lugar (dentro de pasta/bloco ou kind errado) para o nível
        // inicial do próprio kind — e APAGA os blocos de seção que ficarem vazios
        // (fantasmas de movidas antigas, que duplicavam a home).
        const toRestoreKind = ['tutoria', 'prova', 'custom'].includes(body.restore_kind)
          ? body.restore_kind
          : ''
        if (!toRestoreKind) return e.badRequestError('Seção inválida.')
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const sectionNames =
          toRestoreKind === 'tutoria'
            ? ['Tutoria']
            : toRestoreKind === 'prova'
              ? ['Prova de Módulo', 'Prova']
              : []
        // PASSO 1: blocos de seção (pasta organizadora na raiz de OUTRO kind com o
        // nome da seção) — devolve as pastas de dentro ao nível inicial e apaga o bloco.
        let blocksDeleted = 0
        if (sectionNames.length) {
          for (const d of allDecks) {
            if (d.getBool('deleted')) continue
            // o bloco fica DENTRO do destino (não na raiz) — não exigir parent vazio
            const isBlock =
              d.getString('mode') === 'organizer' &&
              sectionNames.includes(d.getString('title')) &&
              d.getString('kind') !== toRestoreKind
            if (!isBlock) continue
            for (const kid of allDecks) {
              if (kid.getString('parent') === d.id && !kid.getBool('deleted')) {
                kid.set('parent', '')
                kid.set('kind', toRestoreKind)
                $app.save(kid)
              }
            }
            d.set('deleted', true)
            $app.save(d)
            blocksDeleted++
          }
        }
        // PASSO 2: pastas soltas com o título da seção fora do lugar
        const pattern = body.title_pattern || ''
        let restored = 0
        for (const d of allDecks) {
          if (d.getBool('deleted')) continue
          const title = d.getString('title')
          if (pattern && !new RegExp(pattern, 'i').test(title)) continue
          // não tratar bloco organizador como pasta solta (passo 1 já cuidou)
          if (d.getString('mode') === 'organizer' && sectionNames.includes(title)) continue
          const isRootOfKind = !d.getString('parent') && d.getString('kind') === toRestoreKind
          if (isRootOfKind) continue
          d.set('parent', '')
          d.set('kind', toRestoreKind)
          $app.save(d)
          restored++
        }
        return e.json(200, { ok: true, restored, blocksDeleted })
      }

      if (action === 'deck_move_section_undo') {
        // Desfazer: devolve TODAS as pastas raiz que estão no toKind mas vieram
        // de outro kind (marcadas no undo) para o kind/raiz original.
        // Estratégia: o frontend guarda os ids movidos; aqui só aceita ids próprios.
        const ids = Array.isArray(body.deck_ids) ? body.deck_ids : []
        const toRestoreKind = ['tutoria', 'prova', 'custom'].includes(body.restore_kind)
          ? body.restore_kind
          : ''
        if (!ids.length || !toRestoreKind) return e.badRequestError('Nada para desfazer.')
        let restored = 0
        for (let i = 0; i < ids.length; i++) {
          const d = ownDeck(String(ids[i]))
          if (d.getString('kind') === toRestoreKind && !d.getString('parent')) continue
          d.set('parent', '')
          d.set('kind', toRestoreKind)
          d.set('mode', d.getString('mode'))
          $app.save(d)
          restored++
        }
        // apaga o bloco da seção que ficou VAZIO (senão sobra pasta fantasma
        // com o mesmo nome, que reaparece na próxima movida)
        let blockDeleted = 0
        let blockNote = ''
        const blockId = String(body.block_id || '')
        if (blockId) {
          try {
            const block = ownDeck(blockId)
            // bool vazio no PB = "" (não false) — filtrar só por parent e checar
            // deleted no código
            const kids = $app.findRecordsByFilter(
              'mr_decks',
              'user_id = {:user} && parent = {:block}',
              '-updated',
              500,
              0,
              { user: userId, block: blockId },
            )
            const alive = kids.filter((k) => !k.getBool('deleted'))
            if (!alive.length) {
              block.set('deleted', true)
              $app.save(block)
              blockDeleted = 1
            } else {
              blockNote = 'bloco ainda tem ' + alive.length + ' pasta(s)'
            }
          } catch (err) {
            blockNote = 'bloco: ' + (err && err.message ? err.message : String(err))
          }
        }
        return e.json(200, { ok: true, restored, blockDeleted, blockNote })
      }

      if (action === 'deck_move_section') {
        // Mover a seção como UMA PASTA (modelo da Nathalia): a seção vira uma
        // pasta única no destino — "Tutoria" — e as pastas da seção ficam DENTRO
        // dela, cada uma com suas subpastas intactas. Nada solto, nada apagado.
        // No destino aparece SÓ a pasta da seção; abrir ela mostra as outras.
        const fromKind = ['tutoria', 'prova', 'custom'].includes(body.from_kind)
          ? body.from_kind
          : ''
        if (!fromKind) return e.badRequestError('Seção de origem inválida.')
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const roots = allDecks.filter(
          (d) =>
            !d.getString('parent') && d.getString('kind') === fromKind && !d.getBool('deleted'),
        )
        if (!roots.length) return e.badRequestError('Nenhuma pasta nesta seção.')
        // valida destino antes de mover qualquer coisa
        let target = null
        let toKind = fromKind
        if (body.parent_id) {
          target = ownDeck(body.parent_id)
          toKind = target.getString('kind')
        } else if (['tutoria', 'prova', 'custom'].includes(body.kind)) {
          toKind = body.kind
        }
        const ids = {}
        for (const d of roots) ids[d.id] = true
        if (target && ids[target.id]) return e.badRequestError('Destino inválido.')
        // nome da pasta da seção (default: nome da seção de origem)
        const blockName =
          cleanText(body.block_title, 200) ||
          (fromKind === 'tutoria'
            ? 'Tutoria'
            : fromKind === 'prova'
              ? 'Prova de Módulo'
              : 'Minhas Pastas')
        // 1) a pasta da seção nasce no destino
        const col = $app.findCollectionByNameOrId('mr_decks')
        const block = new Record(col)
        block.set('user_id', userId)
        block.set('title', blockName)
        block.set('kind', toKind)
        block.set('mode', 'organizer')
        block.set('order', allDecks.length + 1)
        if (target) block.set('parent', target.id)
        $app.save(block)
        // 2) as pastas da seção entram DENTRO dela (subpastas intactas)
        let moved = 0
        for (const root of roots) {
          root.set('parent', block.id)
          root.set('kind', toKind)
          root.set('order', allDecks.length + 1 + moved)
          $app.save(root)
          moved++
        }
        // 3) propaga o kind para toda a subárvore
        let propagated = 0
        let grew = true
        const marked = {}
        for (const d of roots) marked[d.id] = true
        while (grew) {
          grew = false
          for (let i = 0; i < allDecks.length; i++) {
            const pid = allDecks[i].getString('parent')
            if (pid && marked[pid] && !marked[allDecks[i].id]) {
              marked[allDecks[i].id] = true
              grew = true
            }
          }
        }
        for (let i = 0; i < allDecks.length; i++) {
          const d = allDecks[i]
          if (marked[d.id] && !ids[d.id] && d.getString('kind') !== toKind) {
            d.set('kind', toKind)
            $app.save(d)
            propagated++
          }
        }
        return e.json(200, {
          ok: true,
          moved,
          propagated,
          blockId: block.id,
          blockTitle: blockName,
        })
      }

      if (action === 'deck_move') {
        // Mover pasta (e toda a subárvore) para dentro de outra pasta OU para o
        // nível inicial da própria seção (parent_id vazio).
        // Proteções: destino tem que ser próprio, não pode ser a própria pasta
        // nem nenhum descendente dela (evita ciclo na árvore).
        const moving = ownDeck(body.deck_id)
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const subtree = {}
        subtree[moving.id] = true
        let grew = true
        while (grew) {
          grew = false
          for (let i = 0; i < allDecks.length; i++) {
            const pid = allDecks[i].getString('parent')
            if (pid && subtree[pid] && !subtree[allDecks[i].id]) {
              subtree[allDecks[i].id] = true
              grew = true
            }
          }
        }
        let newKind = moving.getString('kind')
        let newParent = ''
        if (body.parent_id) {
          const target = ownDeck(body.parent_id)
          if (moving.id === target.id)
            return e.badRequestError('A pasta não pode ir para dentro dela mesma.')
          if (subtree[target.id])
            return e.badRequestError(
              'Destino inválido: a pasta destino está dentro da pasta que está sendo movida.',
            )
          newParent = target.id
          newKind = target.getString('kind')
        } else if (['tutoria', 'prova', 'custom'].includes(body.kind)) {
          newKind = body.kind
        }
        moving.set('parent', newParent)
        moving.set('kind', newKind)
        moving.set('order', allDecks.length + 1)
        // Mover para DENTRO de outra pasta = a pasta movida passa a ser uma
        // "subpasta" da destino: modo organizador não faz sentido aqui.
        if (newParent) moving.set('mode', 'study')
        $app.save(moving)
        // A subárvore inteira acompanha a seção (kind) da pasta movida.
        let movedKinds = 0
        for (let i = 0; i < allDecks.length; i++) {
          const id = allDecks[i].id
          if (id === moving.id || !subtree[id]) continue
          if (allDecks[i].getString('kind') !== newKind) {
            allDecks[i].set('kind', newKind)
            $app.save(allDecks[i])
            movedKinds++
          }
        }
        return e.json(200, {
          id: moving.id,
          parent: newParent,
          kind: moving.getString('kind'),
          movedKinds,
        })
      }

      if (action === 'deck_reset') {
        const root = ownDeck(body.deck_id)
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const ids = {}
        ids[root.id] = true
        let changed = true
        while (changed) {
          changed = false
          for (let i = 0; i < allDecks.length; i++) {
            const parentId = allDecks[i].getString('parent')
            if (parentId && ids[parentId] && !ids[allDecks[i].id]) {
              ids[allDecks[i].id] = true
              changed = true
            }
          }
        }
        const deckIds = Object.keys(ids)
        let clearedCards = 0
        for (let i = 0; i < deckIds.length; i++) {
          const cards = $app.findRecordsByFilter(
            'mr_cards',
            'user_id = {:user} && deck = {:deck}',
            '-created',
            1000,
            0,
            { user: userId, deck: deckIds[i] },
          )
          for (let j = 0; j < cards.length; j++) {
            const reviews = $app.findRecordsByFilter(
              'mr_reviews',
              'user_id = {:user} && card_ref = {:card}',
              '-reviewed_at',
              1000,
              0,
              { user: userId, card: cards[j].id },
            )
            for (let k = 0; k < reviews.length; k++) {
              try {
                $app.delete(reviews[k])
              } catch (delErr) {
                reviews[k].set('rating', 'again')
                reviews[k].set('state', 'new')
                reviews[k].set('stability', 0)
                reviews[k].set('difficulty', 0)
                reviews[k].set('due', new Date().toISOString().slice(0, 19).replace('T', ' '))
                $app.save(reviews[k])
              }
            }
            clearedCards++
          }
        }
        return e.json(200, { ok: true, clearedCards })
      }

      return e.badRequestError('Operação de gestão desconhecida.')
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err)
      if (message === 'deck_not_owned' || message === 'card_not_owned') {
        return e.forbiddenError('A pasta ou o cartão não pertence à sua conta.')
      }
      const errorId = 'manage-' + Date.now().toString(36)
      $app
        .logger()
        .error(
          'MedReview management failed',
          'errorId',
          errorId,
          'userId',
          userId,
          'action',
          action,
          'error',
          message.slice(0, 180),
        )
      return e.json(500, {
        error: 'manage_failed',
        errorId,
        message: 'Não foi possível salvar. Confira os dados e tente novamente.',
      })
    }
  },
  $apis.requireAuth(),
)
