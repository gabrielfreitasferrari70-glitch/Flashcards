// MedReview v2 — reparo: subpastas criadas pela home herdavam 'custom' em vez do tipo do pai.
// Regra: toda pasta com pai herda o kind do pai. Só na raiz 'custom' é legítimo.
migrate(
  (app) => {
    const decks = app.findRecordsByFilter('mr_decks', '', '', 500, 0)
    const byId = {}
    for (const d of decks) byId[d.id] = d
    let fixed = 0
    for (const d of decks) {
      const parentId = d.getString('parent')
      if (!parentId) continue
      const parent = byId[parentId]
      if (parent && d.getString('kind') !== parent.getString('kind')) {
        d.set('kind', parent.getString('kind'))
        app.save(d)
        fixed++
      }
    }
    console.log('[mr-0006] subpastas com kind herdado do pai corrigidas:', fixed)
  },
  (app) => {},
)
