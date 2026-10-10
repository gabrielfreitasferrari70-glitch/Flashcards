/**
 * MedReview — Sincronização em Nuvem (PocketBase)
 * - Login transparente: usa conta demo criada no primeiro acesso (por dispositivo,
 *   e-mail derivado do localStorage; persistida para reuso).
 * - Pull: ao carregar, baixa o estado do usuário do banco e aplica no app.
 * - Push: intercepta saveState() e grava no banco (debounce 2s), com fallback
 *   silencioso para localStorage se o backend falhar.
 * - Nunca bloqueia o app: tudo é async e try/catch.
 */
;(function () {
  'use strict'

  var PB_URL = (window.__MR_PB_URL__ || '').replace(/\/$/, '')
  if (!PB_URL) return // sem backend configurado, não faz nada

  var DEMO_KEY = 'medreview_demo_account'
  var LAST_SYNC_KEY = 'medreview_last_sync_at'

  function pb() {
    // PocketBase JS SDK embutido (sem dependência externa): usa fetch direto
    return {
      authRefresh: function (token) {
        return fetch(PB_URL + '/api/collections/users/auth-refresh', {
          method: 'POST',
          headers: { Authorization: token },
        }).then(function (r) {
          return r.json()
        })
      },
      authWithPassword: function (email, password) {
        return fetch(PB_URL + '/api/collections/users/auth-with-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identity: email, password: password }),
        }).then(function (r) {
          return r.json()
        })
      },
      createDemoUser: function (email, password) {
        return fetch(PB_URL + '/api/collections/users/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            password: password,
            passwordConfirm: password,
            name: 'Estudante MedReview',
          }),
        }).then(function (r) {
          return r.json()
        })
      },
      getState: function (token, userId) {
        return fetch(
          PB_URL +
            '/api/collections/medreview_state/records?filter=' +
            encodeURIComponent('user_id="' + userId + '"'),
          {
            headers: { Authorization: token },
          },
        ).then(function (r) {
          return r.json()
        })
      },
      createState: function (token, userId, data) {
        return fetch(PB_URL + '/api/collections/medreview_state/records', {
          method: 'POST',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, data: data }),
        }).then(function (r) {
          return r.json()
        })
      },
      updateState: function (token, recId, data) {
        return fetch(PB_URL + '/api/collections/medreview_state/records/' + recId, {
          method: 'PATCH',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: data }),
        }).then(function (r) {
          return r.json()
        })
      },
    }
  }

  var api = pb()
  var token = null
  var userId = null
  var stateRecId = null
  var pushTimer = null
  var pulling = false

  function log() {
    try {
      console.log.apply(console, ['[mr-sync]'].concat([].slice.call(arguments)))
    } catch (e) {}
  }

  function getStoredAccount() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) || 'null')
    } catch (e) {
      return null
    }
  }

  function storeAccount(acc) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(acc))
    } catch (e) {}
  }

  function ensureAccount() {
    var acc = getStoredAccount()
    if (acc && acc.email && acc.password) return Promise.resolve(acc)
    // Cria conta demo determinística por dispositivo
    var seed = localStorage.getItem('medreview_device_seed')
    if (!seed) {
      seed = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('medreview_device_seed', seed)
    }
    var email = 'mr-' + seed + '@medreview.local'
    var password = 'Mr' + seed.replace(/[^a-z0-9]/gi, '') + '!2026'
    return api.createDemoUser(email, password).then(function (created) {
      if (created && created.id) {
        var acc2 = { email: email, password: password, id: created.id }
        storeAccount(acc2)
        return acc2
      }
      // e-mail já existia (raro): tenta login
      return api.authWithPassword(email, password).then(function (auth) {
        if (auth && auth.token) {
          var acc3 = { email: email, password: password, id: auth.record && auth.record.id }
          storeAccount(acc3)
          return acc3
        }
        throw new Error('não foi possível criar nem autenticar conta demo')
      })
    })
  }

  function authenticate() {
    return ensureAccount().then(function (acc) {
      return api.authWithPassword(acc.email, acc.password).then(function (auth) {
        if (!auth || !auth.token) throw new Error('auth falhou')
        token = auth.token
        userId = auth.record.id
        storeAccount({ email: acc.email, password: acc.password, id: userId })
        log('autenticado', userId)
      })
    })
  }

  function pullState() {
    if (!token || pulling) return Promise.resolve()
    pulling = true
    return api
      .getState(token, userId)
      .then(function (res) {
        var items = (res && res.items) || []
        if (items.length === 0) {
          log('nenhum estado remoto — primeiro acesso neste backend')
          // Faz push imediato do estado local (bootstrap)
          pushNow(true)
          return
        }
        var rec = items[0]
        stateRecId = rec.id
        var remoteData = rec.data
        var localRaw = null
        try {
          localRaw = localStorage.getItem('medreview_store_v1')
        } catch (e) {}
        var localData = null
        try {
          localData = localRaw ? JSON.parse(localRaw) : null
        } catch (e) {}

        // Conflito: vence o mais recente (remote.updated vs local mtime salvo)
        var lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10)
        var remoteUpdated = rec.updated ? new Date(rec.updated).getTime() : 0
        var localTouched = parseInt(localStorage.getItem('medreview_state_touched_at') || '0', 10)

        if (localData && localTouched > lastSync && localTouched > remoteUpdated) {
          log('local mais novo — push')
          pushNow(true)
        } else if (remoteData && remoteData.state && remoteUpdated > lastSync) {
          log('remoto mais novo — aplicando estado do banco')
          try {
            localStorage.setItem('medreview_store_v1', JSON.stringify(remoteData.state))
            if (remoteData.evalHistory)
              localStorage.setItem(
                'medreview_eval_history_v1',
                JSON.stringify(remoteData.evalHistory),
              )
            if (remoteData.studyTimeMs != null)
              localStorage.setItem('medreview_study_time_ms', String(remoteData.studyTimeMs))
            if (remoteData.retention)
              localStorage.setItem('medreview_fsrs_retention', String(remoteData.retention))
            localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
            // Recarrega para o app reler o estado do localStorage (guard anti-loop)
            var lastApply = 0
            try {
              lastApply = parseInt(sessionStorage.getItem('medreview_sync_applied_at') || '0', 10)
              if (lastApply && Date.now() - lastApply < 15000) {
                log('guard anti-loop: recarga recente, pulando')
                return
              }
              sessionStorage.setItem('medreview_sync_applied_at', String(Date.now()))
            } catch (e2) {}
            location.reload()
          } catch (e) {
            log('erro ao aplicar estado remoto', e)
          }
        }
      })
      .catch(function (e) {
        log('pull falhou (seguindo em localStorage)', e)
      })
      .finally(function () {
        pulling = false
      })
  }

  function pushNow(force) {
    if (!token || !userId) return Promise.resolve()
    var payload
    try {
      payload = {
        state: JSON.parse(localStorage.getItem('medreview_store_v1') || 'null'),
        evalHistory: JSON.parse(localStorage.getItem('medreview_eval_history_v1') || '[]'),
        studyTimeMs: parseInt(localStorage.getItem('medreview_study_time_ms') || '0', 10),
        retention: parseFloat(localStorage.getItem('medreview_fsrs_retention') || '0.9'),
        savedAt: new Date().toISOString(),
      }
    } catch (e) {
      log('payload inválido', e)
      return Promise.resolve()
    }
    if (!payload.state) return Promise.resolve()
    try {
      localStorage.setItem('medreview_state_touched_at', String(Date.now()))
    } catch (e) {}

    var req = stateRecId
      ? api.updateState(token, stateRecId, payload)
      : api.createState(token, userId, payload).then(function (created) {
          if (created && created.id) stateRecId = created.id
          return created
        })
    return req
      .then(function (r) {
        if (r && (r.id || r.code === 200)) {
          localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
          log('estado salvo na Nuvem MedReview')
        } else {
          log('resposta inesperada ao salvar', r)
        }
      })
      .catch(function (e) {
        log('push falhou (dados ficam no localStorage)', e)
      })
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(function () {
      pushNow(false)
    }, 2000)
  }

  // Intercepta saveState para detectar alterações
  function hookSaveState() {
    var tries = 0
    var iv = setInterval(function () {
      tries++
      if (typeof window.saveState === 'function' && !window.saveState.__mrSyncHooked) {
        var orig = window.saveState
        var hooked = function () {
          var r = orig.apply(this, arguments)
          schedulePush()
          return r
        }
        hooked.__mrSyncHooked = true
        window.saveState = hooked
        clearInterval(iv)
        log('saveState interceptado')
      }
      if (tries > 60) clearInterval(iv)
    }, 500)
  }

  // Boot
  authenticate()
    .then(pullState)
    .then(hookSaveState)
    .catch(function (e) {
      log('boot falhou — app continua 100% local', e)
    })

  // Push também ao fechar a aba (best effort)
  window.addEventListener('beforeunload', function () {
    if (token && userId) {
      try {
        var payload = localStorage.getItem('medreview_store_v1')
        if (payload && stateRecId) {
          navigator.sendBeacon &&
            navigator.sendBeacon(
              PB_URL + '/api/collections/medreview_state/records/' + stateRecId,
              new Blob([JSON.stringify({ data: JSON.parse(payload) })], { type: 'text/plain' }),
            )
        }
      } catch (e) {}
    }
  })
})()
