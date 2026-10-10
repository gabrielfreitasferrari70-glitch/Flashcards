// MedReview — persistência na Nuvem (PocketBase)
// Coleção medreview_state: um registro por usuário com o snapshot completo
// do estado do app (cartas, pastas, progresso FSRS, histórico de avaliações,
// tempo de estudo e configurações), serializado em JSON.
migrate(
  (app) => {
    const collection = new Collection({
      name: 'medreview_state',
      type: 'base',
      // RLS: cada usuário só vê e altera o próprio registro
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
          name: 'data',
          type: 'json',
          required: true,
          maxSize: 5242880, // 5 MB — snapshot completo do estado
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('medreview_state')
    app.delete(collection)
  },
)
