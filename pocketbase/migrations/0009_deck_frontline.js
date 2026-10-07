// MedReview v2 — pasta "🎯 Na tela inicial": frontline (bool) marca pastas criadas
// direto no grid da home; as demais ficam no portal Minhas Pastas.
// LIÇÃO (v0.0.239): migrate() precisa ser chamado no top-level — nada solto fora.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('mr_decks')
    if (!col.fields.getByName('frontline')) {
      col.fields.add(new BoolField({ name: 'frontline' }))
      app.save(col)
    }
    // backfill: nenhum deck existente é frontline (comportamento antigo)
    const rows = app.findRecordsByFilter('mr_decks', 'frontline = true', '-created', 500, 0)
    for (const d of rows) {
      d.set('frontline', false)
      app.save(d)
    }
    console.log('[mr-0009] campo frontline pronto')
  },
  (app) => {},
)
