import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import { preview } from 'vite'
import mongoose from '../../backend/node_modules/mongoose/index.js'
import { createApp } from '../../backend/src/app.js'
import { hashPassword } from '../../backend/src/auth.js'
import * as models from '../../backend/src/models.js'

const require = createRequire(import.meta.url)
const { MongoMemoryReplSet } = require('../../backend/node_modules/mongodb-memory-server')
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const mongo = await MongoMemoryReplSet.create({ binary: { downloadDir: resolve(root, '../backend/node_modules/.cache/mongodb-binaries') }, replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } })
let previewServer, api, browser, profile, socket
const exceptions = [], pending = new Map()
let sequence = 0, apiBase, completed = 0, loads = 0
try {
  await mongoose.connect(mongo.getUri(), { dbName: 'meu_norte_browser_isolated' })
  await Promise.all(Object.values(models).map(model => model.init()))
  const password = 'senha-ficticia-navegador-123'
  const user = await models.User.create({ name: 'Administrador de teste', email: 'browser@example.test', role: 'admin', passwordHash: await hashPassword(password) })
  const owner = String(user._id)
  await models.Workspace.create({ _id: owner })
  previewServer = await preview({ root, configFile: false, preview: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'isolated-api', configurePreviewServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next()
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk)
        const body = Buffer.concat(chunks), headers = {}
        for (const key of ['origin', 'cookie', 'content-type', 'idempotency-key']) if (req.headers[key]) headers[key] = req.headers[key]
        const response = await fetch(apiBase + req.url, { method: req.method, headers, body: body.length ? body : undefined })
        res.statusCode = response.status
        for (const key of ['content-type', 'cache-control']) if (response.headers.has(key)) res.setHeader(key, response.headers.get(key))
        const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader('set-cookie', cookies)
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch { res.statusCode = 502; res.end(JSON.stringify({ message: 'API isolada indisponível' })) }
    })
  } }] })
  const origin = 'http://127.0.0.1:' + previewServer.httpServer.address().port
  api = createApp({ origin }).listen(0, '127.0.0.1'); await once(api, 'listening')
  apiBase = 'http://127.0.0.1:' + api.address().port
  profile = await mkdtemp(join(tmpdir(), 'meunorte-app-'))
  browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  const eventually = async fn => { for (let i = 0; i < 120; i++) { const result = await fn().catch(() => false); if (result) return result; await pause(100) } throw Error('Tempo esgotado aguardando interface') }
  const port = await eventually(async () => (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0])
  const [tab] = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  socket = new WebSocket(tab.webSocketDebuggerUrl); await once(socket, 'open')
  socket.addEventListener('message', event => { const msg = JSON.parse(event.data)
    if (msg.method === 'Page.loadEventFired') loads++
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    if (!msg.id) return
    const call = pending.get(msg.id); pending.delete(msg.id); if (msg.error) call.reject(Error(msg.error.message)); else call.resolve(msg.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value }
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true })
  const navigate = async path => { const before = loads; await send('Page.navigate', { url: origin + path }); await eventually(async () => loads > before); await eventually(() => evaluate(`location.pathname===${JSON.stringify(path.split('?')[0])} && Boolean(document.querySelector('h1')) && (location.pathname==='/entrar'||location.pathname==='/perfil'||Boolean(document.querySelector('.module-page,.reports-page,.balance-value')))`)) }
  const fill = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  const choose = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  const click = (text, scope = 'document') => evaluate(`(()=>{const root=${scope === 'document' ? 'document' : `document.querySelector(${JSON.stringify(scope)})`};const el=Array.from(root.querySelectorAll('button,a,summary')).find(el=>el.checkVisibility()&&(el.textContent.trim()===${JSON.stringify(text)}||el.childNodes[0]?.textContent.trim()===${JSON.stringify(text)}));if(!el)throw Error('Controle ausente: '+${JSON.stringify(text)});el.focus();el.click()})()`)
  const closed = () => eventually(() => evaluate('!document.querySelector("dialog[open]")'))
  const opened = () => eventually(() => evaluate('Boolean(document.querySelector(".action-panel[open]"))'))
  const close = async () => { await click('Fechar painel', 'dialog'); await closed() }
  const step = async (name, run) => { await run(); completed++; console.log('✔ Navegador/API/Mongo: ' + name) }
  let a, b, card, goal, expense
  await step('login real e persistência da sessão', async () => {
    await navigate('/entrar'); await fill('input[name=email]', user.email); await fill('input[name=password]', password); await click('Entrar')
    await eventually(() => evaluate('location.pathname==="/" && Boolean(document.querySelector(".balance-value"))'))
    await navigate('/contas'); assert.equal(await evaluate('Array.from(document.querySelectorAll("form")).filter(el=>el.checkVisibility()).length'), 0)
  })
  async function addAccount(name, balance) {
    await click('Adicionar conta'); await opened(); await fill('dialog input[name=name]', name); await fill('dialog input[name=initialBalance]', balance); await click('Salvar conta', 'dialog'); await closed()
    return models.Account.findOne({ owner, name }).lean()
  }
  await step('cadastro rápido de contas e saldo inicial', async () => {
    a = await addAccount('Corrente teste', '1000'); b = await addAccount('Reserva teste', '0')
    assert.equal(a.initialBalance, 100000); assert.equal(b.initialBalance, 0)
  })
  async function entry(type, description, amount) {
    await navigate('/movimentacoes'); await click(type === 'income' ? 'Adicionar receita' : 'Adicionar despesa'); await opened()
    await fill('dialog input[name=description]', description); await fill('dialog input[name=amount]', amount); await choose('dialog select', String(a._id)); await click('Salvar movimentação', 'dialog'); await closed()
    return models.Entry.findOne({ owner, description }).lean()
  }
  await step('receita e despesa rápidas com categoria padrão', async () => {
    const income = await entry('income', 'Salário teste', '200'); expense = await entry('expense', 'Mercado teste', '50')
    assert.equal(income.category, 'Geral'); assert.equal(expense.expenseKind, 'variable'); assert.equal(expense.amount, 5000)
  })
  await step('transferência iniciada em Contas sem alterar o total', async () => {
    await navigate('/contas'); await evaluate(`document.getElementById('${a._id}').querySelector('button').click()`); await opened(); await click('Transferir dinheiro', 'dialog')
    await fill('dialog input[name=description]', 'Transferência reserva'); await fill('dialog input[name=amount]', '100'); await choose('dialog select[name=destinationId]', String(b._id))
    await click('Confirmar transferência', 'dialog'); await closed()
    assert.equal((await models.Entry.findOne({ owner, type: 'transfer' })).amount, 10000)
  })
  await step('consultar movimentações pela conta mantém o filtro e os detalhes', async () => {
    await navigate('/contas'); await evaluate(`document.getElementById('${a._id}').querySelector('button').click()`); await opened(); await click('Consultar movimentações', 'dialog')
    await eventually(() => evaluate(`location.search.includes('conta=${a._id}') && !document.querySelector('dialog') && Boolean(document.querySelector('input[type=search]'))`))
    assert.equal(await evaluate('document.querySelector(".module-section").textContent.includes("Conta: Corrente teste")'), true)
    await click('Ver todas')
    assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'), 3)
  })
  async function details(description) {
    await navigate('/movimentacoes')
    await evaluate(`(()=>{const row=Array.from(document.querySelectorAll('tbody tr')).find(el=>el.textContent.includes(${JSON.stringify(description)}));row.querySelector('button').click()})()`); await opened()
  }
  await step('edição e cancelamento preservam o histórico financeiro', async () => {
    await details('Mercado teste'); await click('Editar movimentação', 'dialog'); await fill('dialog input[name=amount]', '40'); await click('Salvar movimentação', 'dialog'); await closed()
    assert.equal((await models.Entry.findById(expense._id)).amount, 4000)
    await details('Salário teste'); await click('Cancelar lançamento', 'dialog'); await click('Confirmar cancelamento', 'dialog'); await closed()
    assert.ok((await models.Entry.findOne({ owner, description: 'Salário teste' })).cancelledAt)
  })
  await step('arquivamento e reativação de conta preservam saldo e bloqueiam novos lançamentos', async () => {
    await navigate('/contas'); await evaluate(`document.getElementById('${a._id}').querySelector('button').click()`); await opened(); await click('Mais opções e detalhes', 'dialog')
    assert.equal(await evaluate('document.querySelector("dialog").textContent.includes("Para excluir a conta")'), true)
    await click('Arquivar conta', 'dialog'); await closed()
    await navigate('/movimentacoes'); await click('Adicionar receita'); await opened()
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('dialog select option')).some(el=>el.value==='${a._id}')`), false); await close()
    await navigate('/contas'); await click('Contas arquivadas'); await evaluate(`document.getElementById('${a._id}').querySelector('button').click()`); await opened(); await click('Mais opções e detalhes', 'dialog'); await click('Reativar conta', 'dialog'); await closed()
  })
  await step('cartão e compra preservam categoria e parcelamento', async () => {
    await navigate('/cartoes'); await click('Adicionar cartão'); await opened(); await fill('dialog input[name=name]', 'Cartão teste'); await fill('dialog input[name=limit]', '500'); await fill('dialog input[name=close]', '15'); await fill('dialog input[name=due]', '22'); await click('Salvar cartão', 'dialog'); await closed()
    card = await models.Card.findOne({ owner, name: 'Cartão teste' })
    await click('Registrar compra'); await opened(); await fill('dialog input[name=description]', 'Compra teste'); await fill('dialog input[name=amount]', '120'); await click('Registrar compra', 'dialog'); await closed()
    const purchase = await models.CardEvent.findOne({ owner, type: 'purchase' }); assert.equal(purchase.installments, 1); assert.equal(purchase.category, 'Geral')
  })
  await step('pagamento parcial e erro de API sem duplicar despesas', async () => {
    await click('Pagar fatura'); await opened(); await choose('dialog select[name=accountId]', String(a._id)); await fill('dialog input[name=amount]', '999'); await click('Registrar pagamento', 'dialog')
    await eventually(() => evaluate('document.querySelector("dialog [role=alert]")?.textContent.includes("pagamento")'))
    assert.equal(await models.CardEvent.countDocuments({ owner, type: 'payment' }), 0)
    await fill('dialog input[name=amount]', '30'); await click('Registrar pagamento', 'dialog'); await closed()
    assert.equal(await models.Entry.countDocuments({ owner, type: 'cardPayment' }), 1)
  })
  await step('estorno e encargo continuam acessíveis nas opções avançadas', async () => {
    const purchase = await models.CardEvent.findOne({ owner, type: 'purchase' })
    await click('Gerenciar cartão'); await opened(); await click('Mais opções', 'dialog'); await click('Registrar estorno', 'dialog'); await choose('dialog select[name=purchaseId]', String(purchase._id)); await fill('dialog input[name=amount]', '20'); await click('Registrar estorno', 'dialog'); await closed()
    await click('Gerenciar cartão'); await opened(); await click('Mais opções', 'dialog'); await click('Registrar encargo', 'dialog'); await fill('dialog input[name=description]', 'Tarifa teste'); await fill('dialog input[name=amount]', '5'); await click('Registrar encargo', 'dialog'); await closed()
    assert.equal(await models.CardEvent.countDocuments({ owner }), 4)
  })
  await step('orçamento agrega gastos sem repetir pagamentos de fatura', async () => {
    await navigate('/orcamentos'); await click('Definir limite'); await opened(); await fill('dialog input[name=limit]', '200'); await click('Salvar limite do mês', 'dialog'); await closed()
    assert.equal((await models.Budget.findOne({ owner })).limit, 20000)
    assert.equal(await evaluate('document.querySelector(".progress-grid").textContent.includes("145,00")'), true)
  })
  await step('meta informativa e transferência vinculada mantêm o caixa consistente', async () => {
    await navigate('/metas'); await click('Adicionar meta'); await opened(); await fill('dialog input[name=name]', 'Viagem teste'); await fill('dialog input[name=target]', '500'); await click('Salvar meta', 'dialog'); await closed()
    goal = await models.Goal.findOne({ owner, name: 'Viagem teste' })
    await click('Gerenciar meta'); await opened(); await fill('dialog input[name=amount]', '50'); await click('Registrar', 'dialog')
    await eventually(async () => await models.GoalEvent.countDocuments({ owner, goalId: goal._id }) === 1)
    await eventually(() => evaluate('!document.querySelector("dialog fieldset").disabled'))
    assert.equal(await models.Entry.countDocuments({ owner, goalId: goal._id }), 0)
    await click('Movimentar entre contas', 'dialog'); await choose('dialog form select:not([name])', 'deposit')
    await evaluate(`(()=>{const el=Array.from(document.querySelectorAll('dialog form select')).find(el=>Array.from(el.options).some(op=>op.value==='transfer'));el.value='transfer';el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await choose('dialog select[name=accountId]', String(a._id)); await choose('dialog select[name=destinationId]', String(b._id)); await fill('dialog input[name=amount]', '10'); await click('Registrar', 'dialog')
    await eventually(async () => await models.Entry.countDocuments({ owner, goalId: goal._id }) === 1); await close()
    assert.equal((await models.GoalEvent.find({ owner, goalId: goal._id })).reduce((sum, row) => sum + row.amount, 0), 6000)
  })
  await step('lembrete mensal avança a ocorrência sem criar receita ou despesa', async () => {
    const count = await models.Entry.countDocuments({ owner })
    await navigate('/lembretes'); await click('Adicionar lembrete'); await opened(); await fill('dialog input[name=name]', 'Revisar orçamento'); await click('Recorrência e informações adicionais', 'dialog'); await choose('dialog select[name=frequency]', 'monthly'); await click('Salvar lembrete', 'dialog'); await closed()
    const reminder = await models.Reminder.findOne({ owner, name: 'Revisar orçamento' })
    await click('Concluir ocorrência'); await eventually(async () => (await models.Reminder.findById(reminder._id)).history.length === 1)
    assert.notEqual((await models.Reminder.findById(reminder._id)).dueOn, reminder.dueOn)
    assert.equal(await models.Entry.countDocuments({ owner }), count)
  })
  await step('relatórios conciliam caixa, competência, cancelamentos e transferências', async () => {
    await navigate('/relatorios'); await eventually(() => evaluate('document.querySelectorAll(".report-metric").length===8'))
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const report = await evaluate(`fetch('/api/ledger/reports?from=${day.slice(0, 7)}-01&through=${day}').then(response=>response.json())`)
    assert.equal(report.income, 0); assert.equal(report.expenses, 14500); assert.equal(report.cash, -7000); assert.equal(report.position.balance, 93000)
  })
  await step('painéis fecham por Escape e permanecem utilizáveis entre 320 e 1440 px', async () => {
    for (const width of [320, 390, 900, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 })
      await navigate('/contas'); await click('Adicionar conta'); await opened()
      assert.equal(await evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'), true)
      for (let i = 0; i < 12; i++) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      }
      assert.equal(await evaluate('Boolean(document.activeElement.closest(".action-panel"))'), true)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await closed()
      assert.equal(await evaluate('document.activeElement.textContent.includes("Adicionar conta")'), true)
      if (process.env.REPORT_SCREENSHOTS && [320,1440].includes(width)) for (const path of ['/contas','/movimentacoes','/cartoes','/orcamentos','/metas','/lembretes']) {
        await navigate(path)
        const image = await send('Page.captureScreenshot')
        await writeFile(join(process.env.REPORT_SCREENSHOTS,'final-'+path.slice(1)+'-'+width+'.png'),Buffer.from(image.data,'base64'))
      }
    }
  })
  assert.deepEqual(exceptions, [])
  console.log(completed + ' fluxos reais de navegador/API/MongoDB isolado aprovados; nenhum dado do Atlas utilizado.')
} finally {
  socket?.close(); if (browser?.pid) browser.kill()
  if (api) await new Promise(resolve => api.close(resolve))
  if (previewServer) await new Promise(resolve => previewServer.httpServer.close(resolve))
  if (mongoose.connection.readyState) { await mongoose.connection.dropDatabase(); await mongoose.disconnect() }
  await mongo.stop()
  if (profile) { await pause(400); await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 }).catch(() => {}) }
}
