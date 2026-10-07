// MedReview v2 — flag de Modo Clínico nas cartas: quando true, a carta aparece
// no Modo Caso Clínico da tela inicial (treino só de clínica), além da pasta onde vive.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('mr_cards')
    if (!col.fields.getByName('clinical')) {
      col.fields.add(new BoolField({ name: 'clinical' }))
      app.save(col)
    }
    const cards = app.findRecordsByFilter('mr_cards', '', '', 50000, 0)
    let set = 0
    for (const c of cards) {
      if (/caso cl[ií]nico/i.test(c.getString('q'))) {
        if (!c.getBool('clinical')) {
          c.set('clinical', true)
          app.save(c)
          set++
        }
      } else if (c.getString('clinical') === '') {
        c.set('clinical', false)
        app.save(c)
        set++
      }
    }
    console.log('[mr-0008] cartas marcadas clínica/normal:', set)
  },
  (app) => {},
)
