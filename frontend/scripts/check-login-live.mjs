import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import net from 'node:net'
import mongoose from '../../backend/node_modules/mongoose/index.js'
import { parse } from '../../backend/node_modules/dotenv/lib/main.js'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../shared/demoAccess.mjs'

// Permanent project configuration, real npm dev processes. No MongoDB creation or seeding.
const root=dirname(dirname(fileURLToPath(import.meta.url))),project=resolve(root,'..')
const origin='http://localhost:5173',apiBase='http://127.0.0.1:3001'
const evidence=resolve(project,'docs/images/login-validation')
await mkdir(evidence,{recursive:true})
const settings=parse(await readFile(resolve(project,'backend/.env'),'utf8'))
assert.equal(settings.DEMO_MODE,'true');assert.equal(settings.DEMO_EMAIL,DEMO_EMAIL);assert.equal(settings.DEMO_PASSWORD,DEMO_PASSWORD)
for(const host of ['127.0.0.1','::1'])for(const port of [3001,5173])await new Promise((resolve,reject)=>{
 const probe=net.createServer();probe.once('error',()=>reject(Error('Porta '+port+' ocupada. Identifique a instância anterior antes de validar.')));probe.listen(port,host,()=>probe.close(resolve))
})
const client=new mongoose.mongo.MongoClient(process.env.MONGODB_URI||settings.MONGODB_URI,{serverSelectionTimeoutMS:5000})
let backend,frontend,browser,profile,socket
const pending=new Map(),exceptions=[]
let sequence=0,loads=0,completed=0
async function stopTree(child){if(!child?.pid||child.exitCode!=null)return;if(process.platform==='win32')await new Promise(r=>execFile('taskkill',['/PID',String(child.pid),'/T','/F'],()=>r()));else child.kill('SIGTERM')}
function command(text){const child=process.platform==='win32'?spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',text],{cwd:project,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']}):spawn('sh',['-c',text],{cwd:project,env:process.env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>process.stdout.write(x));child.stderr.on('data',x=>process.stderr.write(x));return child}
async function ready(url,child){for(let i=0;i<150;i++){if(child.exitCode!=null)throw Error('O processo normal não iniciou.');try{if((await fetch(url)).ok)return}catch{}await pause(100)}throw Error('Serviço indisponível: '+url)}
async function privateSnapshot(){
 const db=client.db(),counts={}
 for(const name of ['accounts','entries','cards','cardevents','budgets','goals','goalevents','assets','valuations','reminders','workspaces','ledgerreceipts'])counts[name]=await db.collection(name).countDocuments()
 const users=await db.collection('users').find({},{projection:{_id:1,passwordHash:1,role:1,mustChangePassword:1,sessionVersion:1}}).sort({_id:1}).toArray()
 return createHash('sha256').update(JSON.stringify({counts,users})).digest('hex')
}
try{
 await client.connect();const before=await privateSnapshot()
 backend=command('npm --prefix backend run dev');await ready(apiBase+'/api/health',backend)
 frontend=command('npm --prefix frontend run dev');await ready(origin+'/entrar',frontend)
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const navigate = async path => { const before = loads; await send('Page.navigate', { url: origin + path }); await eventually(async () => loads > before); await eventually(() => evaluate(`location.pathname===${JSON.stringify(path.split('?')[0])} && Boolean(document.querySelector('h1')) && (location.pathname==='/entrar'||location.pathname==='/perfil'||Boolean(document.querySelector('.module-page,.reports-page,.balance-value,.asset-overview')))`)) }
  const fill = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  const click = (text, scope = 'document') => evaluate(`(()=>{const root=${scope === 'document' ? 'document' : `document.querySelector(${JSON.stringify(scope)})`};const el=Array.from(root.querySelectorAll('button,a,summary')).find(el=>el.checkVisibility()&&(el.textContent.trim()===${JSON.stringify(text)}||el.childNodes[0]?.textContent.trim()===${JSON.stringify(text)}));if(!el)throw Error('Controle ausente: '+${JSON.stringify(text)});el.focus();el.click()})()`)
  const step = async (name, run) => { await run(); completed++; console.log('✔ Navegador/API/Mongo: ' + name) }


 async function login(password=DEMO_PASSWORD){await navigate('/entrar');await eventually(()=>evaluate('!document.querySelector(".signin-submit").disabled'));await fill('input[name=email]',DEMO_EMAIL);await fill('input[name=password]',password);await click('Entrar');await eventually(()=>evaluate('location.pathname==="/" && Boolean(document.querySelector(".balance-value"))'))}
 async function logout(){await click('Sair');await eventually(()=>evaluate('location.pathname==="/entrar" && Boolean(document.querySelector(".signin-submit")) && !document.querySelector(".signin-submit").disabled'))}
 async function screenshot(name){await pause(200);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(evidence,name+'.png'),Buffer.from(shot.data,'base64'))}
 await step('login real com backend/.env permanente e comandos npm run dev normais',async()=>{
  await navigate('/entrar');await eventually(()=>evaluate('!document.querySelector(".signin-submit").disabled'))
  assert.equal(await evaluate('document.querySelectorAll(".access-panel button").length'),1)
  await fill('input[name=email]',DEMO_EMAIL);await fill('input[name=password]',DEMO_PASSWORD);await screenshot('login-real')
  await click('Entrar');await eventually(()=>evaluate('location.pathname==="/" && Boolean(document.querySelector(".balance-value"))'))
  assert.equal(await evaluate('(async()=>{const r=await fetch("/api/auth/session");const x=await r.json();return x.user.demo && x.user.role==="user" && !x.user.mustChangePassword})()'),true)
  await screenshot('dashboard-real')
 })
 await step('navegação completa e atualização da página preservam a sessão',async()=>{
  for(const path of ['/contas','/movimentacoes','/cartoes','/orcamentos','/metas','/patrimonio','/lembretes','/relatorios','/'])await navigate(path)
  await send('Page.reload');await eventually(()=>evaluate('Boolean(document.querySelector(".balance-value"))'))
 })
 await step('demo grava em memória e recusa alteração de senha, recuperação e IDs privados',async()=>{
  const codes=await evaluate('(async()=>{const post=(path,body)=>fetch("/api"+path,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(body)}).then(r=>r.status);return Promise.all([post("/ledger/accounts",{name:"Conta temporária teste",kind:"Corrente",initialBalance:0}),post("/auth/password",{currentPassword:"NorteDemo@123",newPassword:"Nunca-salvar-12345"}),post("/auth/forgot",{email:"demo@example.com"})])})()')
  assert.deepEqual(codes,[201,403,403])
  assert.equal(await evaluate('(async()=>{const r=await fetch("/api/ledger/reports?from=2026-11-01&through=2026-11-18&account=999999999999999999999999");return r.status})()'),404)
 })
 await step('logout, senha incorreta e nova entrada usam somente o formulário existente',async()=>{
  await logout();await fill('input[name=email]',DEMO_EMAIL);await fill('input[name=password]','errada-ficticia');await click('Entrar')
  await eventually(()=>evaluate('document.querySelector("[role=alert]")?.textContent.includes("E-mail ou senha incorretos.")'))
  await login()
 })
 await step('reinício dos dois servidores usa a mesma configuração e permite novo login',async()=>{
  await stopTree(frontend);await stopTree(backend)
  backend=command('npm --prefix backend run dev');await ready(apiBase+'/api/health',backend)
  frontend=command('npm --prefix frontend run dev');await ready(origin+'/entrar',frontend)
  await login();await screenshot('dashboard-after-restart')
 })
 await step('dados e hashes administrativos existentes permanecem inalterados',async()=>{
  if(before!==await privateSnapshot())throw Error('A comparação de integridade privada mudou; é necessário investigar.')
 })
 assert.deepEqual(exceptions,[])
 await writeFile(resolve(project,'docs/LOGIN-REAL-RESULTADO.json'),JSON.stringify({configuration:'backend/.env permanente',backendCommand:'npm --prefix backend run dev',frontendCommand:'npm --prefix frontend run dev',temporaryDatabases:0,demoData:'editable per-session memory initialized from fictional JSON',mocked:false,passed:completed,failed:0,refreshValidated:true,restartBothValidated:true,privateDataAndPasswordHashesUnchanged:true,serversStoppedAfterValidation:true},null,2)+'\n')
 console.log('LOGIN_PERMANENTE_APROVADO: '+completed+' cenários, sem banco extra ou configuração substituta.')
}catch(error){console.error('Validação interrompida: '+(error instanceof assert.AssertionError?error.message:error.name));process.exitCode=1}
finally{
 socket?.close();await stopTree(browser);await stopTree(frontend);await stopTree(backend);await client.close()
 if(profile){const p=resolve(profile);assert.ok(p.startsWith(resolve(tmpdir())+String.fromCharCode(process.platform==='win32'?92:47)));await rm(p,{recursive:true,force:true,maxRetries:2,retryDelay:200}).catch(()=>{})}
}
