// MedReview v2 — banco nativo: decks, cartas e revisões por usuário
migrate(
  (app) => {
    const decks = new Collection({
      name: 'mr_decks',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: "@request.auth.id != '' && user_id = @request.auth.id",
      updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'title', type: 'text', required: true, max: 200 },
        {
          name: 'kind',
          type: 'select',
          values: ['tutoria', 'prova', 'custom'],
          maxSelect: 1,
          required: true,
        },
        { name: 'order', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(decks)

    // Resolve o id interno do mr_decks recém-criado para as relações
    const decksId = app.findCollectionByNameOrId('mr_decks').id

    const cards = new Collection({
      name: 'mr_cards',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: "@request.auth.id != '' && user_id = @request.auth.id",
      updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'deck',
          type: 'relation',
          required: true,
          collectionId: decksId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'q', type: 'text', required: true, max: 5000 },
        { name: 'a', type: 'text', required: true, max: 20000 },
        { name: 'group', type: 'text', max: 200 },
        { name: 'ref', type: 'text', max: 500 },
        { name: 'suspended', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(cards)

    const reviews = new Collection({
      name: 'mr_reviews',
      type: 'base',
      listRule: "@request.auth.id != '' && user_id = @request.auth.id",
      viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
      createRule: "@request.auth.id != '' && user_id = @request.auth.id",
      updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'card',
          type: 'relation',
          required: true,
          collectionId: decksId,
          cascadeDelete: true,
          maxSelect: 1,
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
    })
    app.save(reviews)
  },
  (app) => {
    for (const name of ['mr_reviews', 'mr_cards', 'mr_decks']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (e) {}
    }
  },
)
