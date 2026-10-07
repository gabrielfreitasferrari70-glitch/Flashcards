// Catálogo Geral: publicação explícita de subárvores privadas e revisões individuais separadas.
routerAdd(
  'POST',
  '/backend/v1/mr/global-catalog',
  (e) => {
    if (!e.auth || !e.auth.id) return e.unauthorizedError('Faça login.')
    const userId = e.auth.id
    const email = String(e.auth.getString('email') || '').toLowerCase()
    const isAdmin = email === 'gabrielfreitasferrari70@gmail.com'
    const body = e.requestInfo().body || {}
    const action = String(body.action || '')
    const clean = (x, n) =>
      String(x == null ? '' : x)
        .trim()
        .slice(0, n)
    const catalogOwner = () => {
      try {
        return $app.findAuthRecordByEmail('users', 'gabrielfreitasferrari70@gmail.com').id
      } catch (_) {
        throw new Error('catalog_owner_missing')
      }
    }
    const getMap = (owner, kind, sourceId) => {
      const rows = $app.findRecordsByFilter(
        'mr_catalog_source_map',
        'source_user_id = {:u} && source_kind = {:k} && source_id = {:s}',
        '',
        1,
        0,
        { u: owner, k: kind, s: String(sourceId) },
      )
      return rows.length ? rows[0] : null
    }
    const upsertMap = (owner, kind, sourceId, globalId) => {
      let m = getMap(owner, kind, sourceId)
      if (!m) m = new Record($app.findCollectionByNameOrId('mr_catalog_source_map'))
      m.set('source_user_id', owner)
      m.set('source_kind', kind)
      m.set('source_id', String(sourceId))
      m.set('global_id', globalId)
      $app.save(m)
      return m
    }
    const subtree = (rootId, decks) => {
      const ids = new Set([rootId])
      let changed = true
      while (changed) {
        changed = false
        for (const d of decks)
          if (
            !d.getBool('deleted') &&
            d.getString('parent') &&
            ids.has(d.getString('parent')) &&
            !ids.has(d.id)
          ) {
            ids.add(d.id)
            changed = true
          }
      }
      return ids
    }
    const syncPublished = (owner) => {
      const sourceDecks = $app.findRecordsByFilter('mr_decks', 'user_id = {:u}', 'order', 5000, 0, {
        u: owner,
      })
      const byId = {}
      for (const d of sourceDecks) byId[d.id] = d
      const publishedRoots = sourceDecks.filter(
        (d) => !d.getBool('deleted') && d.getBool('publish_global'),
      )
      const wantedDecks = new Set(),
        wantedCards = new Set()
      for (const root of publishedRoots)
        for (const id of subtree(root.id, sourceDecks)) wantedDecks.add(id)
      const privateCards = $app.findRecordsByFilter(
        'mr_cards',
        'user_id = {:u}',
        '-created',
        10000,
        0,
        { u: owner },
      )
      for (const c of privateCards)
        if (!c.getBool('deleted') && wantedDecks.has(c.getString('deck'))) wantedCards.add(c.id)
      let createdDecks = 0,
        createdCards = 0
      // Parent-first: IDs have been recorded before children are linked.
      const orderedDeckIds = [...wantedDecks].sort((a, b) => {
        const depth = (id) => {
          let n = 0,
            cur = byId[id],
            seen = {}
          while (cur && cur.getString('parent') && !seen[cur.id] && n < 100) {
            seen[cur.id] = true
            n++
            cur = byId[cur.getString('parent')]
          }
          return n
        }
        return depth(a) - depth(b)
      })
      for (const id of orderedDeckIds) {
        const src = byId[id]
        if (!src || src.getBool('deleted')) continue
        let m = getMap(owner, 'deck', id),
          dest = null
        if (m) {
          try {
            dest = $app.findRecordById('mr_global_decks', m.getString('global_id'))
          } catch (_) {
            dest = null
          }
        }
        if (!dest) {
          dest = new Record($app.findCollectionByNameOrId('mr_global_decks'))
          createdDecks++
        }
        const parentId = src.getString('parent'),
          parentMap = parentId && wantedDecks.has(parentId) ? getMap(owner, 'deck', parentId) : null
        dest.set('title', src.getString('title'))
        dest.set(
          'kind',
          ['tutoria', 'prova', 'custom'].includes(src.getString('kind'))
            ? src.getString('kind')
            : 'custom',
        )
        dest.set('created_by', owner)
        dest.set('order', src.get('order') || 0)
        dest.set('deleted', false)
        dest.set('is_published', true)
        dest.set('parent', parentMap ? parentMap.getString('global_id') : '')
        $app.save(dest)
        upsertMap(owner, 'deck', id, dest.id)
      }
      for (const id of wantedCards) {
        const src = privateCards.find((c) => c.id === id)
        if (!src) continue
        const deckMap = getMap(owner, 'deck', src.getString('deck'))
        if (!deckMap) continue
        let m = getMap(owner, 'card', id),
          dest = null
        if (m) {
          try {
            dest = $app.findRecordById('mr_global_cards', m.getString('global_id'))
          } catch (_) {
            dest = null
          }
        }
        if (!dest) {
          dest = new Record($app.findCollectionByNameOrId('mr_global_cards'))
          createdCards++
        }
        dest.set('deck', deckMap.getString('global_id'))
        dest.set('q', src.getString('q'))
        dest.set('a', src.getString('a'))
        dest.set('group', src.getString('group'))
        dest.set('ref', src.getString('ref'))
        dest.set('created_by', owner)
        dest.set('clinical', src.getBool('clinical'))
        dest.set('suspended', src.getBool('suspended'))
        dest.set('deleted', false)
        dest.set('is_published', true)
        dest.set('diagram_svg', src.getString('diagram_svg'))
        dest.set('diagram_title', src.getString('diagram_title'))
        dest.set('choices', src.get('choices'))
        dest.set('reverse', src.getBool('reverse'))
        $app.save(dest)
        upsertMap(owner, 'card', id, dest.id)
      }
      const mappings = $app.findRecordsByFilter(
        'mr_catalog_source_map',
        'source_user_id = {:u}',
        '',
        20000,
        0,
        { u: owner },
      )
      for (const m of mappings) {
        const kind = m.getString('source_kind'),
          sid = m.getString('source_id')
        if (
          (kind === 'deck' && !wantedDecks.has(sid)) ||
          (kind === 'card' && !wantedCards.has(sid))
        ) {
          try {
            const name = kind === 'deck' ? 'mr_global_decks' : 'mr_global_cards'
            const rec = $app.findRecordById(name, m.getString('global_id'))
            rec.set('deleted', true)
            rec.set('is_published', false)
            $app.save(rec)
          } catch (_) {
            /* already removed */
          }
        }
      }
      return { decks: wantedDecks.size, cards: wantedCards.size, createdDecks, createdCards }
    }
    try {
      if (action === 'list_catalog') {
        // Only the administrator syncs her opted-in private folders; readers see published copies.
        if (isAdmin) syncPublished(userId)
        const deckRows = $app.findRecordsByFilter('mr_global_decks', '', 'order', 500, 0)
        const cardRows = $app.findRecordsByFilter('mr_global_cards', '', '-created', 5000, 0)
        const decks = deckRows
          .filter((d) => !d.getBool('deleted') && d.getBool('is_published'))
          .map((d) => ({
            id: d.id,
            title: d.getString('title'),
            kind: d.getString('kind'),
            parent: d.getString('parent'),
          }))
        const liveDeck = {}
        for (const d of decks) liveDeck[d.id] = true
        const cards = cardRows
          .filter(
            (c) =>
              !c.getBool('deleted') && c.getBool('is_published') && liveDeck[c.getString('deck')],
          )
          .map((c) => ({
            id: c.id,
            deck: c.getString('deck'),
            q: c.getString('q'),
            a: c.getString('a'),
            group: c.getString('group'),
            ref: c.getString('ref'),
            suspended: c.getBool('suspended'),
            diagram_svg: c.getString('diagram_svg'),
            diagram_title: c.getString('diagram_title'),
            choices: c.get('choices'),
            reverse: c.getBool('reverse'),
            clinical: c.getBool('clinical'),
            is_global: true,
          }))
        return e.json(200, { decks, cards })
      }
      if (action === 'get_consent') {
        const u = $app.findRecordById('users', userId)
        return e.json(200, { consent: u.getBool('admin_catalog_review_consent') })
      }
      if (action === 'set_consent') {
        const u = $app.findRecordById('users', userId)
        u.set('admin_catalog_review_consent', body.consent === true)
        $app.save(u)
        return e.json(200, { consent: u.getBool('admin_catalog_review_consent') })
      }
      if (action === 'list_publishable_decks') {
        if (!isAdmin) return e.forbiddenError('Somente a administradora pode publicar pastas.')
        const ds = $app
          .findRecordsByFilter('mr_decks', 'user_id = {:u}', 'order', 5000, 0, { u: userId })
          .filter((d) => !d.getBool('deleted'))
        const cs = $app
          .findRecordsByFilter('mr_cards', 'user_id = {:u}', '-created', 10000, 0, { u: userId })
          .filter((c) => !c.getBool('deleted'))
        const byId = {}
        for (const d of ds) byId[d.id] = d
        const out = ds.map((d) => {
          const ids = subtree(d.id, ds)
          let inherited = ''
          let p = d.getString('parent'),
            guard = 0
          while (p && byId[p] && guard++ < 100) {
            if (byId[p].getBool('publish_global')) {
              inherited = byId[p].id
              break
            }
            p = byId[p].getString('parent')
          }
          return {
            id: d.id,
            title: d.getString('title'),
            kind: d.getString('kind'),
            parent: d.getString('parent'),
            publish_global: d.getBool('publish_global'),
            inherited_from: inherited,
            count: cs.filter((c) => ids.has(c.getString('deck'))).length,
            folders: ids.size,
          }
        })
        return e.json(200, { decks: out })
      }
      if (action === 'set_folder_publication') {
        if (!isAdmin) return e.forbiddenError('Somente a administradora pode publicar pastas.')
        const deck = $app.findRecordById('mr_decks', String(body.deck_id || ''))
        if (deck.getString('user_id') !== userId || deck.getBool('deleted'))
          return e.notFoundError('Pasta não encontrada.')
        const enabled = body.publish === true
        if (enabled && !deck.getBool('publish_global')) {
          const ds = $app.findRecordsByFilter('mr_decks', 'user_id = {:u}', 'order', 5000, 0, {
              u: userId,
            }),
            ids = subtree(deck.id, ds)
          const cs = $app.findRecordsByFilter('mr_cards', 'user_id = {:u}', '-created', 10000, 0, {
            u: userId,
          })
          const count = cs.filter(
            (c) => !c.getBool('deleted') && ids.has(c.getString('deck')),
          ).length
          if (body.confirmed !== true)
            return e.json(200, {
              needsConfirmation: true,
              deckTitle: deck.getString('title'),
              cards: count,
              folders: ids.size,
            })
        }
        deck.set('publish_global', enabled)
        $app.save(deck)
        const sync = syncPublished(userId)
        return e.json(200, { publish_global: enabled, sync })
      }
      if (action === 'admin_list_reviews') {
        if (!isAdmin)
          return e.forbiddenError('Somente a administradora pode consultar esse histórico.')
        const cardRows = $app.findRecordsByFilter(
            'mr_global_cards',
            'deleted = false && is_published = true',
            '-created',
            5000,
            0,
          ),
          cardIds = {},
          questions = {}
        for (const c of cardRows) {
          cardIds[c.id] = true
          questions[c.id] = c.getString('q').slice(0, 180)
        }
        const userRows = $app.findRecordsByFilter(
            'users',
            'admin_catalog_review_consent = true',
            '-created',
            1000,
            0,
          ),
          consented = {}
        for (const u of userRows) consented[u.id] = true
        const rows = $app.findRecordsByFilter('mr_global_reviews', '', '-reviewed_at', 10000, 0),
          result = []
        for (const r of rows) {
          const uid = r.getString('user_id'),
            cid = r.getString('global_card_ref')
          if (!consented[uid] || !cardIds[cid]) continue
          result.push({
            id: r.id,
            card_ref: cid,
            question: questions[cid] || '',
            rating: r.getString('rating'),
            stability: r.get('stability'),
            difficulty: r.get('difficulty'),
            state: r.getString('state'),
            due: r.getString('due'),
            reviewed_at: r.getString('reviewed_at'),
          })
        }
        return e.json(200, { reviews: result })
      }
      if (!isAdmin)
        return e.forbiddenError('Somente a conta administradora pode editar o Catálogo Geral.')
      if (action === 'create_deck') {
        const title = clean(body.title, 200)
        if (!title) return e.badRequestError('Informe o nome da pasta.')
        const rows = $app.findRecordsByFilter(
          'mr_global_decks',
          'created_by = {:u} && deleted = false',
          'order',
          500,
          0,
          { u: userId },
        )
        const d = new Record($app.findCollectionByNameOrId('mr_global_decks'))
        d.set('title', title)
        d.set('kind', ['tutoria', 'prova', 'custom'].includes(body.kind) ? body.kind : 'custom')
        d.set('created_by', userId)
        d.set('order', rows.length + 1)
        d.set('deleted', false)
        d.set('is_published', true)
        $app.save(d)
        return e.json(201, { id: d.id })
      }
      if (action === 'create_card') {
        const deck = $app.findRecordById('mr_global_decks', String(body.deck_id || ''))
        if (deck.getString('created_by') !== userId || deck.getBool('deleted'))
          return e.notFoundError('Pasta não encontrada.')
        const v = body.card || {},
          q = clean(v.q, 5000),
          a = clean(v.a, 20000)
        if (!q || !a) return e.badRequestError('Preencha frente e verso.')
        const c = new Record($app.findCollectionByNameOrId('mr_global_cards'))
        c.set('deck', deck.id)
        c.set('q', q)
        c.set('a', a)
        c.set('group', clean(v.group, 200))
        c.set('ref', clean(v.ref, 500))
        c.set('created_by', userId)
        c.set('clinical', !!v.clinical)
        c.set('suspended', false)
        c.set('deleted', false)
        c.set('is_published', true)
        c.set('reverse', !!v.reverse)
        if (v.imageUrl && /^https?:\/\//i.test(String(v.imageUrl))) {
          c.set('diagram_svg', String(v.imageUrl).slice(0, 2000))
          c.set('diagram_title', 'Imagem')
        }
        if (Array.isArray(v.choices))
          c.set(
            'choices',
            v.choices
              .map((x) => clean(x, 300))
              .filter(Boolean)
              .slice(0, 6),
          )
        $app.save(c)
        return e.json(201, { id: c.id })
      }
      if (action === 'update_card') {
        const c = $app.findRecordById('mr_global_cards', String(body.card_id || ''))
        if (c.getString('created_by') !== userId || c.getBool('deleted'))
          return e.forbiddenError('Card não pertence à administradora.')
        const q = clean(body.q, 5000),
          a = clean(body.a, 20000)
        if (!q || !a) return e.badRequestError('Preencha frente e verso.')
        c.set('q', q)
        c.set('a', a)
        c.set('group', clean(body.group, 200))
        c.set('ref', clean(body.ref, 500))
        c.set('clinical', !!body.clinical)
        c.set('reverse', !!body.reverse)
        if (body.imageUrl !== undefined) {
          c.set(
            'diagram_svg',
            /^https?:\/\//i.test(String(body.imageUrl)) ? String(body.imageUrl).slice(0, 2000) : '',
          )
          c.set('diagram_title', body.imageUrl ? 'Imagem' : '')
        }
        if (Array.isArray(body.choices))
          c.set(
            'choices',
            body.choices
              .map((x) => clean(x, 300))
              .filter(Boolean)
              .slice(0, 6),
          )
        $app.save(c)
        return e.json(200, { id: c.id })
      }
      if (action === 'delete_card') {
        const c = $app.findRecordById('mr_global_cards', String(body.card_id || ''))
        if (c.getString('created_by') !== userId)
          return e.forbiddenError('Card não pertence à administradora.')
        c.set('deleted', true)
        c.set('is_published', false)
        $app.save(c)
        return e.json(200, { id: c.id, deleted: true })
      }
      return e.badRequestError('Ação do Catálogo Geral desconhecida.')
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err)
      $app
        .logger()
        .error('MedReview global catalog failure', 'action', action, 'error', message.slice(0, 160))
      return e.internalServerError('Não foi possível concluir a operação do Catálogo Geral.')
    }
  },
  $apis.requireAuth(),
)
