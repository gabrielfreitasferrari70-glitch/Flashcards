// Mirrors the active content library of the MedReview owner into each student's
// account. Reviews and scheduling remain in each student's mr_reviews collection.
routerAdd(
  'POST',
  '/backend/v1/mr/seed/apply',
  (e) => {
    const userId = e.auth && e.auth.id ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('Faça login para inicializar sua biblioteca.')
    const ownerEmail = 'gabrielfreitasferrari70@gmail.com'
    let fsys = null
    try {
      const owner = $app.findAuthRecordByEmail('users', ownerEmail)
      const ownerId = owner.id
      const decks = $app.findRecordsByFilter('mr_decks', 'user_id = {:u}', 'order', 5000, 0, {
        u: ownerId,
      })
      const cards = $app.findRecordsByFilter('mr_cards', 'user_id = {:u}', '-created', 10000, 0, {
        u: ownerId,
      })
      const activeDecks = decks.filter((d) => !d.getBool('deleted'))
      const activeDeckIds = Object.create(null)
      const allDecks = Object.create(null)
      for (const d of decks) allDecks[d.id] = d
      for (const d of activeDecks) activeDeckIds[d.id] = true
      const activeCards = cards.filter(
        (c) => !c.getBool('deleted') && activeDeckIds[c.getString('deck')],
      )

      // The owner is the source; never create a mirror in her own account.
      if (userId === ownerId) {
        return e.json(200, {
          ok: true,
          createdDecks: 0,
          createdCards: 0,
          totalDecks: activeDecks.length,
          totalCards: activeCards.length,
        })
      }

      const depthOf = (id) => {
        let n = 0,
          cur = allDecks[id],
          seen = Object.create(null)
        while (cur && cur.getString('parent') && !seen[cur.id] && n < 100) {
          seen[cur.id] = true
          n++
          cur = allDecks[cur.getString('parent')]
        }
        return n
      }
      activeDecks.sort(
        (a, b) => depthOf(a.id) - depthOf(b.id) || a.getInt('order') - b.getInt('order'),
      )
      const targetDeckRows = $app.findRecordsByFilter(
        'mr_decks',
        'user_id = {:u}',
        'order',
        10000,
        0,
        { u: userId },
      )
      const targetDeckByKey = Object.create(null)
      for (const d of targetDeckRows) {
        const key = d.getString('seed_key')
        if (key && !targetDeckByKey[key]) targetDeckByKey[key] = d
      }
      const activeDeckKeys = Object.create(null)
      const sourceToTargetDeck = Object.create(null)
      let createdDecks = 0
      for (const src of activeDecks) {
        // Preserve original seed IDs for existing 186 cards; use stable source IDs for all new content.
        const sourceKey = src.getString('seed_key')
        const key =
          sourceKey && sourceKey.startsWith('initial:') ? sourceKey : 'shared:deck:' + src.id
        activeDeckKeys[key] = true
        let dest = targetDeckByKey[key]
        const isNew = !dest
        if (!dest) dest = new Record($app.findCollectionByNameOrId('mr_decks'))
        const parentId = src.getString('parent')
        const parent = parentId && activeDeckIds[parentId] ? sourceToTargetDeck[parentId] : null
        const changed =
          isNew ||
          dest.getBool('deleted') ||
          dest.getString('title') !== src.getString('title') ||
          dest.getString('kind') !== src.getString('kind') ||
          dest.getInt('order') !== src.getInt('order') ||
          dest.getString('mode') !== (src.getString('mode') || 'study') ||
          dest.getBool('frontline') !== src.getBool('frontline') ||
          dest.getString('parent') !== (parent ? parent.id : '')
        if (changed) {
          dest.set('user_id', userId)
          dest.set('title', src.getString('title'))
          dest.set('kind', src.getString('kind'))
          dest.set('order', src.getInt('order'))
          dest.set('seed_key', key)
          dest.set('mode', src.getString('mode') || 'study')
          dest.set('frontline', src.getBool('frontline'))
          dest.set('deleted', false)
          dest.set('parent', parent ? parent.id : '')
          $app.save(dest)
          if (isNew) createdDecks++
        }
        targetDeckByKey[key] = dest
        sourceToTargetDeck[src.id] = dest
      }

      const targetCards = $app.findRecordsByFilter(
        'mr_cards',
        'user_id = {:u}',
        '-created',
        20000,
        0,
        { u: userId },
      )
      const targetCardByKey = Object.create(null)
      for (const c of targetCards) {
        const key = c.getString('seed_key')
        if (key && !targetCardByKey[key]) targetCardByKey[key] = c
      }
      const activeCardKeys = Object.create(null)
      let createdCards = 0
      for (const src of activeCards) {
        const sourceKey = src.getString('seed_key')
        const key =
          sourceKey && sourceKey.startsWith('initial:') ? sourceKey : 'shared:card:' + src.id
        activeCardKeys[key] = true
        const destDeck = sourceToTargetDeck[src.getString('deck')]
        if (!destDeck) continue
        let dest = targetCardByKey[key]
        const isNew = !dest
        if (!dest) dest = new Record($app.findCollectionByNameOrId('mr_cards'))
        const sourceImage = src.getString('image')
        const targetImage = dest.getString('image')
        const choicesChanged =
          JSON.stringify(dest.get('choices') || null) !== JSON.stringify(src.get('choices') || null)
        const changed =
          isNew ||
          dest.getBool('deleted') ||
          dest.getString('deck') !== destDeck.id ||
          dest.getString('q') !== src.getString('q') ||
          dest.getString('a') !== src.getString('a') ||
          dest.getString('group') !== src.getString('group') ||
          dest.getString('ref') !== src.getString('ref') ||
          dest.getBool('suspended') !== src.getBool('suspended') ||
          dest.getString('diagram_svg') !== src.getString('diagram_svg') ||
          dest.getString('diagram_title') !== src.getString('diagram_title') ||
          dest.getBool('clinical') !== src.getBool('clinical') ||
          dest.getBool('reverse') !== src.getBool('reverse') ||
          choicesChanged ||
          targetImage !== sourceImage
        if (changed) {
          dest.set('user_id', userId)
          dest.set('deck', destDeck.id)
          dest.set('q', src.getString('q'))
          dest.set('a', src.getString('a'))
          dest.set('group', src.getString('group'))
          dest.set('ref', src.getString('ref'))
          dest.set('suspended', src.getBool('suspended'))
          dest.set('deleted', false)
          dest.set('seed_key', key)
          dest.set('diagram_svg', src.getString('diagram_svg'))
          dest.set('diagram_title', src.getString('diagram_title'))
          dest.set('clinical', src.getBool('clinical'))
          dest.set('reverse', src.getBool('reverse'))
          dest.set('choices', src.get('choices'))
          if (sourceImage && targetImage !== sourceImage) {
            if (!fsys) fsys = $app.newFilesystem()
            dest.set(
              'image',
              fsys.getReuploadableFile(src.baseFilesPath() + '/' + sourceImage, true),
            )
          } else if (!sourceImage && targetImage) {
            dest.set('image', null)
          }
          $app.save(dest)
          if (isNew) createdCards++
        }
        targetCardByKey[key] = dest
      }

      // Only retire old mirrored content. Student-created legacy content is untouched;
      // reviews remain in place so restoring a source card restores its prior schedule.
      let removedDecks = 0,
        removedCards = 0
      for (const d of targetDeckRows) {
        const key = d.getString('seed_key')
        if (
          key &&
          (key.startsWith('initial:') || key.startsWith('shared:deck:')) &&
          !activeDeckKeys[key] &&
          !d.getBool('deleted')
        ) {
          d.set('deleted', true)
          $app.save(d)
          removedDecks++
        }
      }
      for (const c of targetCards) {
        const key = c.getString('seed_key')
        if (
          key &&
          (key.startsWith('initial:') || key.startsWith('shared:card:')) &&
          !activeCardKeys[key] &&
          !c.getBool('deleted')
        ) {
          c.set('deleted', true)
          $app.save(c)
          removedCards++
        }
      }
      return e.json(200, {
        ok: true,
        createdDecks,
        createdCards,
        totalDecks: activeDecks.length,
        totalCards: activeCards.length,
        removedDecks,
        removedCards,
      })
    } catch (err) {
      const errorId = 'seed-apply-' + Date.now().toString(36)
      const message = err && err.message ? String(err.message) : String(err)
      $app
        .logger()
        .error(
          'MedReview library mirror failed',
          'errorId',
          errorId,
          'userId',
          userId,
          'error',
          message.slice(0, 180),
        )
      return e.json(500, {
        error: 'seed_apply_failed',
        errorId,
        message: 'Não foi possível sincronizar a biblioteca. Seus dados pessoais foram mantidos.',
      })
    } finally {
      if (fsys) fsys.close()
    }
  },
  $apis.requireAuth(),
)
