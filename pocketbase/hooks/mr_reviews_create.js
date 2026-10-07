// Grava avaliações privadas ou, se global_card_ref foi enviada, no histórico global privado do usuário.
routerAdd(
  'POST',
  '/backend/v1/mr/reviews',
  (e) => {
    const body = e.requestInfo().body || {}
    if (!e.auth || !e.auth.id) return e.unauthorizedError('Faça login para salvar a revisão.')
    if (!body.rating) return e.badRequestError('A avaliação é obrigatória.')
    if (!['again', 'hard', 'good', 'easy'].includes(body.rating))
      return e.badRequestError('Avaliação inválida.')
    const global = !!body.global_card_ref
    let card
    let deckId = ''
    if (global) {
      try {
        card = $app.findRecordById('mr_global_cards', String(body.global_card_ref))
      } catch (_) {
        return e.notFoundError('Carta global não encontrada.')
      }
      if (card.getBool('deleted') || card.getBool('suspended'))
        return e.forbiddenError('Esta carta global não está disponível.')
      deckId = card.getString('deck')
    } else {
      if (!body.card_ref) return e.badRequestError('Carta é obrigatória.')
      try {
        card = $app.findRecordById('mr_cards', String(body.card_ref))
      } catch (_) {
        return e.notFoundError('Carta não encontrada.')
      }
      if (card.getString('user_id') !== e.auth.id || card.getBool('deleted'))
        return e.forbiddenError('Esta carta não pertence à sua conta.')
      deckId = card.getString('deck')
    }
    const collection = $app.findCollectionByNameOrId(global ? 'mr_global_reviews' : 'mr_reviews')
    const review = new Record(collection)
    review.set('user_id', e.auth.id)
    if (global) review.set('global_card_ref', card.id)
    else {
      // Campo legado card aponta para deck; card_ref identifica o card privado.
      review.set('card', deckId)
      review.set('card_ref', card.id)
    }
    review.set('rating', body.rating)
    review.set('stability', Number(body.stability) || 0)
    review.set('difficulty', Number(body.difficulty) || 0)
    if (body.retrievability !== null && body.retrievability !== undefined)
      review.set('retrievability', Number(body.retrievability))
    review.set('elapsed_days', Number(body.elapsed_days) || 0)
    review.set('scheduled_days', Number(body.scheduled_days) || 0)
    review.set('state', body.state || 'review')
    review.set('due', body.due)
    review.set('reviewed_at', body.reviewed_at)
    $app.save(review)
    return e.json(201, {
      id: review.id,
      card_ref: global ? '' : card.id,
      global_card_ref: global ? card.id : '',
      rating: review.getString('rating'),
    })
  },
  $apis.requireAuth(),
)
