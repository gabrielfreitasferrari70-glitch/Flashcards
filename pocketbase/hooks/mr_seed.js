// Seed inicial MedReview v1, lido de catálogo global privado no backend.
// O endpoint nunca consulta snapshots de usuários individuais.
routerAdd(
  'GET',
  '/backend/v1/mr/seed',
  (e) => {
    const errorId = 'seed-' + Date.now().toString(36)
    try {
      const record = $app.findFirstRecordByData('mr_seed_catalog', 'version', 'medreview-seed-v1')
      const raw = record.getString('data')
      if (!raw) throw new Error('seed_catalog_empty')
      let catalog = JSON.parse(raw)
      if (typeof catalog === 'string') catalog = JSON.parse(catalog)
      if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
        throw new Error('seed_catalog_shape_invalid')
      }
      const decks = catalog.decks
      if (!Array.isArray(decks)) throw new Error('seed_catalog_decks_missing')
      const totalCards = decks.reduce(
        (total, deck) => total + (Array.isArray(deck.cards) ? deck.cards.length : 0),
        0,
      )
      const totalSvgs = decks.reduce((total, deck) => {
        if (!Array.isArray(deck.cards)) return total
        return total + deck.cards.filter((card) => !!card.diagramSvg).length
      }, 0)
      if (decks.length !== 20 || totalCards !== 186 || totalSvgs !== 4) {
        throw new Error(
          'seed_catalog_integrity_mismatch:' + decks.length + ':' + totalCards + ':' + totalSvgs,
        )
      }
      return e.json(200, { schemaVersion: 1, decks, totalCards })
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err)
      $app
        .logger()
        .error('MedReview seed route failed', 'errorId', errorId, 'code', message.slice(0, 180))
      return e.json(500, {
        error: 'seed_failed',
        errorId,
        message: 'Não foi possível carregar o catálogo inicial.',
      })
    }
  },
  $apis.requireAuth(),
)
