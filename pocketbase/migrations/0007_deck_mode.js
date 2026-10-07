// MedReview v2 — modo da pasta: 'study' (clica e estuda os flashcards direto)
// ou 'organizer' (abre e mostra as pastas dentro, como a Tutoria).
// Regra de reparo: pasta que JÁ tem subpasta = organizadora; resto mantém o comportamento atual (estudo).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('mr_decks')
    if (!col.fields.getByName('mode')) {
      col.fields.add(
        new SelectField({ name: 'mode', values: ['study', 'organizer'], maxSelect: 1 }),
      )
      app.save(col)
    }
    const decks = app.findRecordsByFilter('mr_decks', '', '', 500, 0)
    const hasChild = {}
    for (const d of decks) {
      const p = d.getString('parent')
      if (p) hasChild[p] = true
    }
    let set = 0
    for (const d of decks) {
      if (d.getString('mode')) continue
      d.set('mode', hasChild[d.id] ? 'organizer' : 'study')
      app.save(d)
      set++
    }
    console.log('[mr-0007] modos definidos:', set)
  },
  (app) => {},
)
