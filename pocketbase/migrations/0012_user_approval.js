// Adiciona o campo de aprovação manual de usuários (approved)
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!col.fields.getByName('approved')) {
      col.fields.add(new BoolField({ name: 'approved' }))
      app.save(col)
    }
    // Aprova todo mundo que já estava no sistema para não bloquear usuários antigos
    const users = app.findRecordsByFilter('_pb_users_auth_', '', '', 50000, 0)
    let count = 0
    for (const u of users) {
      if (!u.getBool('approved')) {
        u.set('approved', true)
        app.save(u)
        count++
      }
    }
    console.log('[mr-0012] usuários antigamente cadastrados aprovados:', count)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    if (col.fields.getByName('approved')) {
      col.fields.removeByName('approved')
      app.save(col)
    }
  }
)
