// Catálogo-base MedReview v1: copia somente conteúdo pedagógico validado.
// Não leva usuário, progresso, revisões, favoritos nem histórico.
migrate(
  (app) => {
    const collection = new Collection({
      name: 'mr_seed_catalog',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'version', type: 'text', required: true, max: 64 },
        { name: 'data', type: 'json', required: true, maxSize: 524288 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_mr_seed_catalog_version ON mr_seed_catalog (version)'],
    })
    app.save(collection)

    // One-time copy from the validated original snapshot. Runtime seeding reads only
    // mr_seed_catalog, not this per-user legacy record.
    const source = app.findRecordById('medreview_state', 'alw0c9r44hr44yl')
    const raw = source.getString('data')
    let parsed = JSON.parse(raw)
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    const state = parsed && parsed.state ? parsed.state : parsed
    const tutorias = (state && state.tutorias_numbered) || {}
    const provas = (state && state.provas) || {}
    const decks = []
    const addDeck = (deck, kind, deckNumber, order, fallbackTitle) => {
      if (!deck || !Array.isArray(deck.cards)) return
      const seedKey = 'initial:' + kind + ':' + String(deckNumber).padStart(2, '0')
      const cards = deck.cards.map((card, index) => {
        const output = {
          seed_key: seedKey + ':' + String(index + 1).padStart(3, '0'),
          q: card.q || '',
          a: card.a || '',
          group: card.group || '',
          ref: card.ref || '',
        }
        if (card.diagramSvg) {
          output.diagramSvg = card.diagramSvg
          output.diagramTitle = card.diagramTitle || ''
        }
        return output
      })
      decks.push({
        seed_key: seedKey,
        title: deck.title || fallbackTitle,
        kind,
        order,
        cards,
      })
    }

    const tutoriaKeys = Object.keys(tutorias).sort((a, b) => {
      const na = parseInt((String(a).match(/[0-9]+/) || ['999'])[0], 10)
      const nb = parseInt((String(b).match(/[0-9]+/) || ['999'])[0], 10)
      return na - nb
    })
    tutoriaKeys.forEach((key, index) => {
      const number = parseInt((String(key).match(/[0-9]+/) || [String(index + 1)])[0], 10)
      addDeck(tutorias[key], 'tutoria', number, index + 1, key)
    })

    const provaKeys = Object.keys(provas).sort()
    provaKeys.forEach((key, index) => {
      addDeck(provas[key], 'prova', index + 1, tutoriaKeys.length + index + 1, key)
    })

    const totalCards = decks.reduce((total, deck) => total + deck.cards.length, 0)
    const totalSvgs = decks.reduce(
      (total, deck) => total + deck.cards.filter((card) => !!card.diagramSvg).length,
      0,
    )
    if (decks.length !== 20 || totalCards !== 186 || totalSvgs !== 4) {
      throw new Error(
        'MedReview seed catalog validation failed: decks=' +
          decks.length +
          ', cards=' +
          totalCards +
          ', svg=' +
          totalSvgs,
      )
    }

    const record = new Record(collection)
    record.set('version', 'medreview-seed-v1')
    record.set('data', { schemaVersion: 1, decks, totalCards })
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('mr_seed_catalog'))
    } catch (_) {}
  },
)
