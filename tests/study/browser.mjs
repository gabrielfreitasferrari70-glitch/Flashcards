// Local regression tests. Every remote request is intercepted; no production writes.
import { chromium, webkit, devices } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const base = process.env.STUDY_BASE_URL || 'http://127.0.0.1:8083'
const output = process.env.STUDY_SCREENSHOTS || '/tmp/medreview-study-tests'
await mkdir(output, { recursive: true })
const engine = process.env.STUDY_BROWSER || 'chromium'
const browser = engine === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] })
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'study-test@example.invalid', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: { provider: 'email' } }
const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }, 'fixture'].map(v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')).join('.')
const deck = { id: '22222222-2222-4222-8222-222222222222', title: 'Pasta teste toque', kind: 'custom', order: 1, parent: null, user_id: user.id }
const cards = Array.from({ length: 12 }, (_, i) => ({
  id: `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`, deck: deck.id, deck_id: deck.id, user_id: user.id,
  q: `Pergunta de estudo ${i + 1}`, a: '<p>Resposta de estudo.</p>'.repeat(35), created_at: '2026-01-01T00:00:00Z', suspended: false,
}))

async function setup(profile, settings) {
  const context = await browser.newContext({ ...profile, serviceWorkers: 'block' })
  await context.addInitScript((settings) => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })
    if (settings) localStorage.setItem('mr_scheduler_settings', JSON.stringify(settings))
  }, settings)
  await context.routeWebSocket('**', socket => socket.close())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const state = { writes: [], reviews: [], mutations: [], delay: 0, fail: false, failDeckDelete: false }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/catalog.json') return route.fulfill({ json: { decks: [deck], cards } })
    if (url.hostname === '127.0.0.1') return route.continue()
    if (!url.hostname.endsWith('.supabase.co')) return route.abort()
    let data = [], status = 200
    if (url.pathname.endsWith('/token')) data = { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture', user }
    else if (url.pathname.endsWith('/user')) data = user
    else if (url.pathname.includes('/profiles')) data = { id: user.id, name: 'Teste', approved: true }
    else if (url.pathname.includes('/mr_decks')) {
      data = [deck]
      if (request.method() !== 'GET') {
        state.mutations.push({ table: 'decks', method: request.method() })
        if (state.failDeckDelete) return route.fulfill({ status: 400, json: { message: 'Falha controlada na exclusão' } })
      }
    } else if (url.pathname.includes('/mr_cards')) {
      data = (request.headers().range || '0').startsWith('1000') ? [] : cards
      if (request.method() !== 'GET') state.mutations.push({ table: 'cards', method: request.method() })
    } else if (url.pathname.includes('/mr_reviews')) {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON()
        state.writes.push(payload)
        if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay))
        if (state.fail) return route.fulfill({ status: 400, json: { message: 'Falha de rede controlada' } })
        const id = `44444444-4444-4444-8444-${String(state.writes.length).padStart(12, '0')}`
        state.reviews.push({ ...payload, id })
        data = { id }
      } else if (request.method() === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '')
        state.reviews = state.reviews.filter(review => review.id !== id)
        state.mutations.push({ table: 'reviews', method: 'DELETE', id })
        data = []
      } else data = (request.headers().range || '0').startsWith('1000') ? [] : state.reviews
    }
    return route.fulfill({ status, json: data, headers: { 'access-control-allow-origin': '*' } })
  })
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.getByLabel('E-mail', { exact: true }).fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Entrar na minha conta', exact: true }).click()
  await page.getByRole('heading', { name: 'Um passo a mais na sua preparação.' }).waitFor()
  return { context, page, state, errors }
}

const index = page => page.locator('.mr-legacy-counter-badge > span').first().textContent()
const revealed = page => page.locator('.mr-flip-inner.is-flipped').count()
const waitArmed = page => page.waitForFunction(() => {
  const button = document.querySelector('.mr-legacy-rating-row button')
  return button && !button.disabled
})
async function waitWrites(page, state, count) {
  const deadline = Date.now() + 3000
  while (state.writes.length < count && Date.now() < deadline) await page.waitForTimeout(20)
  assert.equal(state.writes.length, count, 'Expected review writes must reach the intercepted backend')
}
async function key(page, key, extra = {}) {
  await page.evaluate(({ key, extra }) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })), { key, extra })
}
async function gesture(page, dx, dy = 0, { verticalDetour = false, duration = 0, target = '.mr-legacy-study-card', multi = false, cancel = false, compatibilityClick = true } = {}) {
  await page.locator(target).evaluate((el, { dx, dy, verticalDetour, duration, multi, cancel, compatibilityClick }) => {
    const point = (x, y) => ({ clientX: x, clientY: y, identifier: 0, target: el })
    const fire = (type, points) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : points },
        changedTouches: { value: points },
      })
      el.dispatchEvent(event)
    }
    const now = Date.now
    try {
      fire('touchstart', multi ? [point(150, 200), point(160, 210)] : [point(150, 200)])
      if (verticalDetour) fire('touchmove', [point(180, 250)])
      else fire('touchmove', [point(150 + dx, 200 + dy)])
      if (duration) Date.now = () => now() + duration
      fire(cancel ? 'touchcancel' : 'touchend', [point(150 + dx, 200 + dy)])
      // A compatibility click must not hide the answer or reveal the next card.
      if (compatibilityClick) el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    } finally { Date.now = now }
  }, { dx, dy, verticalDetour, duration, multi, cancel, compatibilityClick })
}

try {
  const profiles = [
    ['desktop-Mac-shortcuts', { viewport: { width: 1440, height: 1000 } }],
    ['iPhone-emulation', devices['iPhone 13']],
    ['Android-emulation', devices['Pixel 7']],
    ['small-phone-320', { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true }],
  ]
  for (const [name, profile] of profiles) {
    const { context, page, state, errors } = await setup(profile)
    try {
      // Cancel deletion must preserve both UI and backend.
      await page.getByTitle('Opções da pasta', { exact: true }).first().click()
      page.once('dialog', dialog => dialog.dismiss())
      await page.getByRole('button', { name: '🗑️ Excluir pasta', exact: true }).click()
      await page.waitForTimeout(100)
      assert.equal(state.mutations.filter(m => m.table !== 'reviews').length, 0, 'Cancel must not issue any deck/card mutation')
      assert(await page.getByRole('heading', { name: deck.title, exact: true }).isVisible())
      await page.getByRole('button', { name: 'Estudar agora', exact: true }).click()
      await page.locator('.mr-legacy-study-card').waitFor()
      assert.equal(await revealed(page), 0)
      await gesture(page, 120)
      await gesture(page, 0, -100)
      assert.equal(await index(page), '1')
      assert.equal(state.writes.length, 0, 'Gestures default off')
      assert.equal(await revealed(page), 0, 'Scrolling/swiping with gestures off must not reveal')
      await page.waitForTimeout(650)
      // A card click reveals only; buttons are initially disabled.
      const question = page.locator('.mr-flip-front .mr-legacy-question')
      if (profile.hasTouch) await question.tap()
      else await question.click()
      assert.equal(await revealed(page), 1)
      assert(await page.locator('.mr-legacy-rating-row button').first().isDisabled())
      await page.locator('.mr-legacy-study-card').dispatchEvent('click')
      assert.equal(await revealed(page), 1, 'A second tap never hides the answer')
      await waitArmed(page)
      const row = await page.locator('.mr-legacy-rating-row').evaluate(el => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect()
        return { columns: style.gridTemplateColumns.split(' ').length, position: style.position, bottom: rect.bottom, height: rect.height, widths: [...el.children].map(b => b.getBoundingClientRect().width), heights: [...el.children].map(b => b.getBoundingClientRect().height) }
      })
      assert.equal(row.columns, 4)
      if (profile.viewport.width <= 640) {
        assert.equal(row.position, 'sticky')
        assert(row.heights.every(height => height >= 54))
        assert(row.bottom <= profile.viewport.height + 1, 'Rating row stays inside viewport even with a tall answer')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
      }
      await page.screenshot({ path: `${output}/${name}-rating.png`, fullPage: true })
      // Two synchronous clicks on the same card only produce one review.
      await page.locator('.mr-legacy-rating-row button').nth(2).evaluate(button => { button.click(); button.click() })
      await page.waitForFunction(() => document.querySelector('.mr-legacy-counter-badge > span').textContent === '2')
      await page.waitForTimeout(100)
      assert.equal(state.writes.length, 1)
      assert.equal(await revealed(page), 0)
      await key(page, 'z', { metaKey: true })
      await page.waitForFunction(() => document.querySelector('.mr-legacy-counter-badge > span').textContent === '1')
      await page.waitForTimeout(100)
      assert.equal(state.reviews.length, 0, 'Undo must execute the server delete, not only remove local state')
      assert(await page.getByTitle('Desfazer última avaliação (⌘Z)', { exact: true }).count() === 0, 'Undo clears last review')
      await waitArmed(page)
      await gesture(page, 120)
      assert.equal(await index(page), '1', 'Disabled swipe setting also applies to revealed answers')
      // Save the gesture preference through the real settings UI.
      await page.getByRole('button', { name: 'Ferramentas', exact: true }).click()
      await page.getByRole('button', { name: 'Configurações', exact: true }).click()
      const checkbox = page.getByLabel('Gestos de deslizar para avaliar', { exact: true })
      assert.equal(await checkbox.isChecked(), false)
      await checkbox.check()
      await page.getByRole('button', { name: 'Salvar', exact: true }).click()
      await page.locator('.mr-legacy-modal-overlay').waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => localStorage.getItem('mr_swipe_gestures')), '1')
      const prior = state.writes.length
      for (const [dx, dy, opts] of [[89, 0, {}], [120, 41, {}], [120, 0, { duration: 601 }], [120, 0, { verticalDetour: true }], [0, -120, {}], [120, 0, { multi: true }], [120, 0, { cancel: true }]]) {
        await gesture(page, dx, dy, opts)
        assert.equal(state.writes.length, prior, 'Invalid/vertical/multitouch/cancelled gestures cannot grade')
        assert.equal(await index(page), '1')
      }
      // All excluded controls, including nested labels/notes/highlighters/images.
      for (const html of ['<button>controle</button>', '<a>link</a>', '<input>', '<textarea></textarea>', '<select><option>A</option></select>', '<label>rótulo</label>', '<div role="button">controle</div>', '<div class="mr-legacy-card-note-box">nota</div>', '<div class="mr-highlighter-cluster">marca</div>', '<div class="mr-occlusion-btn">oclusão</div>', '<img alt="teste">']) {
        await page.locator('.mr-legacy-study-card').evaluate((card, html) => {
          const node = document.createElement('div'); node.id = 'interactive-test'; node.innerHTML = html; card.append(node)
        }, html)
        await gesture(page, 120, 0, { target: '#interactive-test > *', compatibilityClick: false })
        assert.equal(await index(page), '1')
        await page.locator('#interactive-test').evaluate(node => node.remove())
      }
      await gesture(page, 90, 40)
      await page.waitForFunction(() => document.querySelector('.mr-legacy-counter-badge > span').textContent === '2')
      assert.equal(await revealed(page), 0, 'Compatibility click after swipe must not reveal next card')
      await gesture(page, -90)
      assert.equal(await index(page), '2')
      assert.equal(await revealed(page), 1, 'First enabled swipe only reveals')
      assert(await page.locator('.mr-legacy-rating-row button').first().isDisabled())
      await gesture(page, -90)
      assert.equal(await index(page), '2', 'Swipe grading is also blocked during the initial 350ms')
      await waitArmed(page)
      await gesture(page, -90)
      await page.waitForFunction(() => document.querySelector('.mr-legacy-counter-badge > span').textContent === '3')
      await waitWrites(page, state, prior + 2)
      assert.equal(state.writes.at(-1).rating, 'again')
      // Mac browser modifiers and repeated keys must never act as study shortcuts.
      await key(page, 'a', { metaKey: true }); await key(page, 'p', { metaKey: true })
      await key(page, 'p', { ctrlKey: true }); await key(page, '3', { metaKey: true })
      await key(page, 'p', { repeat: true })
      assert.equal(await index(page), '3')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mr_attention_card_ids') || '[]').length), 0)
      await key(page, 'a')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mr_attention_card_ids')).length), 1)
      const tools = page.getByRole('button', { name: 'Ferramentas', exact: true })
      await tools.focus(); await page.keyboard.press('Enter')
      assert.equal(await revealed(page), 1, 'Enter reveals even with focus on a button')
      assert(await page.evaluate(() => document.activeElement.tagName !== 'BUTTON'))
      await waitArmed(page)
      // Undo offline must remove the queued review and pending counter, then never upload it.
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')) })
      await key(page, '3')
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('mr_offline_reviews_queue') || '[]').length === 1)
      assert.equal(await index(page), '4')
      assert(await page.getByTitle('Estudando offline. Sincronização automática ao reconectar.').textContent().then(text => text.includes('(1)')))
      const beforeReconnect = state.writes.length
      await key(page, 'z')
      assert.equal(await index(page), '3')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mr_offline_reviews_queue') || '[]').length), 0)
      assert(await page.getByTitle('Estudando offline. Sincronização automática ao reconectar.').textContent().then(text => !text.includes('(1)')))
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')) })
      await page.waitForTimeout(100)
      assert.equal(state.writes.length, beforeReconnect, 'Undone offline review cannot be uploaded on reconnect')
      if (profile.viewport.width <= 640) {
        const toastBottom = await page.locator('.mr-app-toast').evaluate(el => parseFloat(getComputedStyle(el).bottom))
        assert(toastBottom >= 90)
      }
      // The opt-in survives a full reload and can be turned off again.
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Estudar agora', exact: true }).click()
      await page.getByRole('button', { name: 'Ferramentas', exact: true }).click()
      await page.getByRole('button', { name: 'Configurações', exact: true }).click()
      assert(await page.getByLabel('Gestos de deslizar para avaliar', { exact: true }).isChecked())
      await page.getByLabel('Gestos de deslizar para avaliar', { exact: true }).uncheck()
      await page.getByRole('button', { name: 'Salvar', exact: true }).click()
      await page.locator('.mr-legacy-modal-overlay').waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => localStorage.getItem('mr_swipe_gestures')), '0')
      assert.equal(errors.length, 0, errors.join('; '))
      console.log(`PASS ${engine}/${name}: cancel deletion, reveal-only taps, opt-in gestures/thresholds/controls, 350ms lock, double grading, keyboard modifiers/focus, offline undo, layout`)
    } catch (error) {
      await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true })
      throw error
    } finally { await context.close() }
  }

  const failedDelete = await setup({ viewport: { width: 1440, height: 1000 } })
  try {
    const { page, state } = failedDelete
    state.failDeckDelete = true
    await page.getByTitle('Opções da pasta', { exact: true }).first().click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: '🗑️ Excluir pasta', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Erro ao excluir' }).waitFor()
    await page.getByRole('heading', { name: deck.title, exact: true }).waitFor()
    assert(state.mutations.some(m => m.table === 'decks' && m.method === 'DELETE'))
    console.log('PASS failed deck deletion: visible error and optimistic state restored by reload')
  } finally { await failedDelete.context.close() }

  // Save-time fuzz changes only automatic due/scheduled_days, never stability or labels.
  for (const manual of [false, true]) {
    const settings = manual ? { mode: 'manual', intervals: { again: '10min', hard: '1d', good: '10d', easy: '20d' } } : undefined
    const { context, page, state } = await setup({ viewport: { width: 1440, height: 1000 } }, settings)
    try {
      await page.getByRole('button', { name: 'Estudar agora', exact: true }).click()
      await key(page, 'Enter'); await waitArmed(page)
      const quality = manual ? 2 : 3
      const before = await page.locator('.mr-legacy-rating-row button').nth(quality).textContent()
      await page.evaluate(() => { Math.random = () => 0 })
      await key(page, 'a') // re-render must keep the unfuzzed label
      assert.equal(await page.locator('.mr-legacy-rating-row button').nth(quality).textContent(), before)
      await key(page, String(quality + 1))
      await page.waitForTimeout(150)
      const saved = state.writes.at(-1)
      assert(saved)
      assert.equal(saved.scheduled_days, manual ? 10 : 14)
      assert.equal(saved.stability, manual ? 10 : 15.69105)
      assert(Math.abs((Date.parse(saved.due) - Date.parse(saved.reviewed_at)) / 86400000 - saved.scheduled_days) < 1e-8)
      console.log(`PASS schedule persistence: ${manual ? 'manual intervals remain exact' : 'automatic fuzz affects saved due/interval only; label and FSRS stability unchanged'}`)
    } finally { await context.close() }
  }

  // Delayed background saves must not resurrect a review after undo.
  for (const fail of [false, true]) {
    const { context, page, state } = await setup({ viewport: { width: 1440, height: 1000 } })
    try {
      state.delay = 700; state.fail = fail
      await page.getByRole('button', { name: 'Estudar agora', exact: true }).click()
      await key(page, 'Enter'); await waitArmed(page); await key(page, '3')
      await page.waitForFunction(() => document.querySelector('.mr-legacy-counter-badge > span').textContent === '2')
      await key(page, 'z')
      await page.waitForTimeout(900)
      assert.equal(state.reviews.length, 0)
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mr_offline_reviews_queue') || '[]').length), 0)
      console.log(`PASS delayed save/undo: ${fail ? 'network failure does not requeue undone review' : 'late server write is removed'}`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
