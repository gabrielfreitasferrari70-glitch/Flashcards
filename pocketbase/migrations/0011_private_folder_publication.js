// Publicação opt-in de pastas privadas do administrador no Catálogo Geral.
// Todas as pastas existentes continuam privadas: publish_global inicia falso.
migrate(
  (app) => {
    const decks = app.findCollectionByNameOrId('mr_decks')
    if (!decks.fields.getByName('publish_global'))
      decks.fields.add(new BoolField({ name: 'publish_global' }))
    app.save(decks)

    const globalDecks = app.findCollectionByNameOrId('mr_global_decks')
    if (!globalDecks.fields.getByName('parent')) {
      globalDecks.fields.add(
        new RelationField({
          name: 'parent',
          collectionId: globalDecks.id,
          cascadeDelete: false,
          minSelect: 0,
          maxSelect: 1,
        }),
      )
    }
    if (!globalDecks.fields.getByName('is_published'))
      globalDecks.fields.add(new BoolField({ name: 'is_published' }))
    globalDecks.listRule = "@request.auth.id != '' && is_published = true"
    globalDecks.viewRule = "@request.auth.id != '' && is_published = true"
    const previousDecks = app.findRecordsByFilter('mr_global_decks', '', '', 5000, 0)
    for (const d of previousDecks) {
      d.set('is_published', true)
      app.save(d)
    }
    app.save(globalDecks)

    const globalCards = app.findCollectionByNameOrId('mr_global_cards')
    if (!globalCards.fields.getByName('is_published'))
      globalCards.fields.add(new BoolField({ name: 'is_published' }))
    globalCards.listRule = "@request.auth.id != '' && is_published = true"
    globalCards.viewRule = "@request.auth.id != '' && is_published = true"
    const previousCards = app.findRecordsByFilter('mr_global_cards', '', '', 10000, 0)
    for (const c of previousCards) {
      c.set('is_published', true)
      app.save(c)
    }
    app.save(globalCards)

    const map = new Collection({
      name: 'mr_catalog_source_map',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'source_user_id', type: 'text', required: true, max: 15 },
        {
          name: 'source_kind',
          type: 'select',
          values: ['deck', 'card'],
          maxSelect: 1,
          required: true,
        },
        { name: 'source_id', type: 'text', required: true, max: 15 },
        { name: 'global_id', type: 'text', required: true, max: 15 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_mr_catalog_source_unique ON mr_catalog_source_map (source_user_id, source_kind, source_id)',
      ],
    })
    app.save(map)
    console.log(
      '[mr-0011] opt-in folder publication ready; existing private folders remain private',
    )
  },
  (app) => {
    const decks = app.findCollectionByNameOrId('mr_decks')
    if (decks.fields.getByName('publish_global')) decks.fields.removeByName('publish_global')
    app.save(decks)
    const globalCards = app.findCollectionByNameOrId('mr_global_cards')
    if (globalCards.fields.getByName('is_published'))
      globalCards.fields.removeByName('is_published')
    globalCards.listRule = "@request.auth.id != ''"
    globalCards.viewRule = "@request.auth.id != ''"
    app.save(globalCards)
    const globalDecks = app.findCollectionByNameOrId('mr_global_decks')
    if (globalDecks.fields.getByName('is_published'))
      globalDecks.fields.removeByName('is_published')
    if (globalDecks.fields.getByName('parent')) globalDecks.fields.removeByName('parent')
    globalDecks.listRule = "@request.auth.id != ''"
    globalDecks.viewRule = "@request.auth.id != ''"
    app.save(globalDecks)
    app.delete(app.findCollectionByNameOrId('mr_catalog_source_map'))
  },
)
