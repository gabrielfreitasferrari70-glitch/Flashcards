// MedReview v2.1 — chaves idempotentes, subpastas e referência correta da carta revisada.
// Preserva mr_reviews.card, que foi criado como relação para mr_decks.
migrate(
  (app) => {
    const decks = app.findCollectionByNameOrId('mr_decks')
    const decksId = decks.id
    if (!decks.fields.getByName('seed_key')) {
      decks.fields.add(new TextField({ name: 'seed_key', max: 120 }))
    }
    if (!decks.fields.getByName('deleted')) {
      decks.fields.add(new BoolField({ name: 'deleted' }))
    }
    if (!decks.fields.getByName('parent')) {
      decks.fields.add(
        new RelationField({
          name: 'parent',
          collectionId: decksId,
          cascadeDelete: false,
          minSelect: 0,
          maxSelect: 1,
        }),
      )
    }
    decks.addIndex('idx_mr_decks_user_seed', true, 'user_id, seed_key', "seed_key != ''")
    decks.addIndex('idx_mr_decks_user_parent_order', false, 'user_id, parent, \"order\"', '')
    app.save(decks)

    const cards = app.findCollectionByNameOrId('mr_cards')
    if (!cards.fields.getByName('seed_key'))
      cards.fields.add(new TextField({ name: 'seed_key', max: 160 }))
    if (!cards.fields.getByName('deleted')) cards.fields.add(new BoolField({ name: 'deleted' }))
    if (!cards.fields.getByName('diagram_svg'))
      cards.fields.add(new TextField({ name: 'diagram_svg', max: 20000 }))
    if (!cards.fields.getByName('diagram_title'))
      cards.fields.add(new TextField({ name: 'diagram_title', max: 200 }))
    cards.addIndex('idx_mr_cards_user_seed', true, 'user_id, seed_key', "seed_key != ''")
    cards.addIndex('idx_mr_cards_user_deck', false, 'user_id, deck', '')
    app.save(cards)

    const reviews = app.findCollectionByNameOrId('mr_reviews')
    if (!reviews.fields.getByName('card_ref')) {
      reviews.fields.add(
        new RelationField({
          name: 'card_ref',
          collectionId: cards.id,
          cascadeDelete: true,
          minSelect: 0,
          maxSelect: 1,
        }),
      )
    }
    // Only the authenticated backend route creates reviews after checking card ownership.
    reviews.createRule = null
    reviews.updateRule = null
    reviews.deleteRule = null
    reviews.addIndex(
      'idx_mr_reviews_user_cardref_time',
      false,
      'user_id, card_ref, reviewed_at',
      '',
    )
    app.save(reviews)
  },
  (app) => {
    const reviews = app.findCollectionByNameOrId('mr_reviews')
    try {
      reviews.removeIndex('idx_mr_reviews_user_cardref_time')
    } catch (_) {}
    if (reviews.fields.getByName('card_ref')) reviews.fields.removeByName('card_ref')
    reviews.createRule = "@request.auth.id != '' && user_id = @request.auth.id"
    reviews.updateRule = "@request.auth.id != '' && user_id = @request.auth.id"
    reviews.deleteRule = "@request.auth.id != '' && user_id = @request.auth.id"
    app.save(reviews)
    const cards = app.findCollectionByNameOrId('mr_cards')
    try {
      cards.removeIndex('idx_mr_cards_user_seed')
    } catch (_) {}
    try {
      cards.removeIndex('idx_mr_cards_user_deck')
    } catch (_) {}
    if (cards.fields.getByName('seed_key')) cards.fields.removeByName('seed_key')
    if (cards.fields.getByName('deleted')) cards.fields.removeByName('deleted')
    if (cards.fields.getByName('diagram_svg')) cards.fields.removeByName('diagram_svg')
    if (cards.fields.getByName('diagram_title')) cards.fields.removeByName('diagram_title')
    app.save(cards)
    const decks = app.findCollectionByNameOrId('mr_decks')
    try {
      decks.removeIndex('idx_mr_decks_user_seed')
    } catch (_) {}
    try {
      decks.removeIndex('idx_mr_decks_user_parent_order')
    } catch (_) {}
    if (decks.fields.getByName('parent')) decks.fields.removeByName('parent')
    if (decks.fields.getByName('seed_key')) decks.fields.removeByName('seed_key')
    if (decks.fields.getByName('deleted')) decks.fields.removeByName('deleted')
    app.save(decks)
  },
)
