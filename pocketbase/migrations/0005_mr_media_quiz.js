// MedReview v2 — mídia e modos de estudo: imagem (upload), alternativas de múltipla escolha e carta reversa.
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId('mr_cards')
    if (!cards.fields.getByName('image')) {
      cards.fields.add(
        new FileField({
          name: 'image',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        }),
      )
    }
    if (!cards.fields.getByName('choices')) {
      cards.fields.add(new JSONField({ name: 'choices', maxSize: 4000 }))
    }
    if (!cards.fields.getByName('reverse')) {
      cards.fields.add(new BoolField({ name: 'reverse' }))
    }
    app.save(cards)
    console.log('[mr-0005] campos image/choices/reverse garantidos em mr_cards')
  },
  (app) => {
    const cards = app.findCollectionByNameOrId('mr_cards')
    if (cards.fields.getByName('image')) cards.fields.removeByName('image')
    if (cards.fields.getByName('choices')) cards.fields.removeByName('choices')
    if (cards.fields.getByName('reverse')) cards.fields.removeByName('reverse')
    app.save(cards)
  },
)
