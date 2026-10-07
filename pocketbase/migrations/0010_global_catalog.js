// Catálogo Geral isolado + revisões globais privadas por estudante e consentimento opt-in.
migrate(
  (app) => {
    const decks = new Collection({
      name: 'mr_global_decks',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'title', type: 'text', required: true, max: 200 },
        {
          name: 'kind',
          type: 'select',
          values: ['tutoria', 'prova', 'custom'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
          required: true,
        },
        { name: 'order', type: 'number', onlyInt: true },
        { name: 'deleted', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_mr_global_decks_order ON mr_global_decks ("order")'],
    })
    app.save(decks)
    const decksId = app.findCollectionByNameOrId('mr_global_decks').id
    const cards = new Collection({
      name: 'mr_global_cards',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'deck',
          type: 'relation',
          collectionId: decksId,
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        { name: 'q', type: 'text', required: true, max: 5000 },
        { name: 'a', type: 'text', required: true, max: 20000 },
        { name: 'group', type: 'text', max: 200 },
        { name: 'ref', type: 'text', max: 500 },
        { name: 'suspended', type: 'bool' },
        { name: 'deleted', type: 'bool' },
        { name: 'diagram_svg', type: 'text', max: 20000 },
        { name: 'diagram_title', type: 'text', max: 200 },

        { name: 'choices', type: 'json', maxSize: 4000 },
        { name: 'reverse', type: 'bool' },
        { name: 'clinical', type: 'bool' },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
          required: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_mr_global_cards_deck ON mr_global_cards (deck)'],
    })
    app.save(cards)
    const reviews = new Collection({
      name: 'mr_global_reviews',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'global_card_ref',
          type: 'relation',
          collectionId: app.findCollectionByNameOrId('mr_global_cards').id,
          cascadeDelete: false,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'rating',
          type: 'select',
          values: ['again', 'hard', 'good', 'easy'],
          maxSelect: 1,
          required: true,
        },
        { name: 'stability', type: 'number' },
        { name: 'difficulty', type: 'number' },
        { name: 'retrievability', type: 'number' },
        { name: 'elapsed_days', type: 'number' },
        { name: 'scheduled_days', type: 'number' },
        {
          name: 'state',
          type: 'select',
          values: ['new', 'learning', 'review', 'relearning'],
          maxSelect: 1,
        },
        { name: 'due', type: 'date' },
        { name: 'reviewed_at', type: 'date', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_mr_global_reviews_user_card_time ON mr_global_reviews (user_id, global_card_ref, reviewed_at)',
      ],
    })
    app.save(reviews)
    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.getByName('admin_catalog_review_consent')) {
      users.fields.add(new BoolField({ name: 'admin_catalog_review_consent' }))
    }
    app.save(users)
    console.log(
      '[mr-0010] global catalog, private review collection, and default-off consent ready',
    )
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    if (users.fields.getByName('admin_catalog_review_consent'))
      users.fields.removeByName('admin_catalog_review_consent')
    app.save(users)
    app.delete(app.findCollectionByNameOrId('mr_global_reviews'))
    app.delete(app.findCollectionByNameOrId('mr_global_cards'))
    app.delete(app.findCollectionByNameOrId('mr_global_decks'))
  },
)
