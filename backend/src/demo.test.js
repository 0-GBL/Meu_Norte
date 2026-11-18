import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import * as models from './models.js'
import { createApplication } from './application.js'
import { demoConfiguration, DEMO_EMAIL, DEMO_PASSWORD } from './demo.js'
import { createDemoStore } from './demoStore.js'
const env={DEMO_MODE:'true',DEMO_EMAIL,DEMO_PASSWORD}

test('configuração interativa exige somente habilitação e credenciais válidas',()=>{
 assert.equal(demoConfiguration({}).enabled,false)
 assert.equal(demoConfiguration(env).enabled,true)
 for(const fields of [{DEMO_DAILY_WRITE_LIMIT:'0'},{DEMO_DAILY_WRITE_LIMIT:'1.5'},{DEMO_DAILY_WRITE_LIMIT:'1001'},{DEMO_MODE:'yes'},{DEMO_EMAIL:''},{DEMO_EMAIL:'inválido'},{DEMO_PASSWORD:''}])assert.throws(()=>demoConfiguration({...env,...fields}))
})
test('dados fictícios são independentes, coerentes e reutilizam os cálculos existentes',()=>{
 const store=createDemoStore(), a=store.seed('a'), b=store.seed('b')
 a.accounts[0].name='alterado';assert.equal(b.accounts[0].name,'Conta corrente')
 assert.notEqual(a.entries[0].owner,b.entries[0].owner)
 assert.equal(a.valuations.length,2)

})
test('demo interativa autentica e navega sem qualquer operação de banco',async t=>{
 const originals=[];let accesses=0
 for(const model of Object.values(models))for(const method of ['find','findOne','findById','countDocuments','create','updateOne','deleteOne','aggregate']){
  originals.push([model,method,model[method]]);model[method]=()=>{accesses++;throw Error('A demo tentou usar o banco pessoal.')}
 }
 const servers=[]
 t.after(async()=>{for(const s of servers)await new Promise(r=>s.close(r));for(const [m,k,v]of originals)m[k]=v})
 const origin='http://localhost:5173'
 async function server(enabled=true,secure=false){const http=createApplication({origin,secureCookies:secure,demo:demoConfiguration({...env,DEMO_MODE:String(enabled)})}).listen(0,'127.0.0.1');await once(http,'listening');servers.push(http)
  return async(path,{body,cookie,method=body?'POST':'GET',source=origin}={})=>{const r=await fetch('http://127.0.0.1:'+http.address().port+'/api'+path,{method,headers:{'Idempotency-Key':randomUUID(),Origin:source,'Content-Type':'application/json',...(cookie&&{Cookie:cookie})},...(body&&{body:JSON.stringify(body)})});return {status:r.status,cookies:r.headers.getSetCookie(),data:await r.json().catch(()=>null)}}
 }
 const request=await server();let cookie
 await t.test('formulário padrão cria sessão editável sem troca de senha',async()=>{
  const r=await request('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD}});assert.equal(r.status,200);assert.equal(r.data.user.demo,true);assert.equal(r.data.user.role,'user');assert.equal(r.data.user.mustChangePassword,false)
  assert.match(r.cookies[0],/HttpOnly.*SameSite=Strict/);cookie=r.cookies[0].split(';')[0]
  assert.equal((await request('/auth/session',{cookie})).data.user.email,DEMO_EMAIL)
  const ledger=(await request('/ledger',{cookie})).data;assert.equal(ledger.total,1126000);assert.equal(ledger.goals[0].saved,250000)
  const preflight=await request('/ledger',{cookie,method:'OPTIONS'});assert.equal(preflight.status,204)
  const report=await request('/ledger/reports?from=2026-11-01&through=2026-11-18',{cookie});assert.equal(report.status,200);assert.equal(report.data.income,520000);assert.equal(report.data.expenses,260000)
 })
 await t.test('credenciais são bloqueadas no servidor e filtros privados são recusados',async()=>{
  for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of ['/auth/password','/auth/forgot','/auth/reset'])assert.equal((await request(path,{cookie,body:{email:DEMO_EMAIL},method})).status,403)
  assert.equal((await request('/ledger?owner=admin',{cookie})).data.accounts.length,2)
  assert.equal((await request('/ledger/reports?from=2026-11-01&through=2026-11-18&account=999999999999999999999999',{cookie})).status,404)
  assert.equal((await request('/ledger',{cookie,source:'https://hostile.example'})).status,403)
 })
 await t.test('senha incorreta e campos de privilégio são recusados',async()=>{
  assert.equal((await request('/auth/login',{body:{email:DEMO_EMAIL,password:'errada'}})).status,401)
  assert.equal((await request('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD,role:'admin'}})).status,400)
 })
 await t.test('logout revoga token e novo login continua funcionando',async()=>{
  assert.equal((await request('/auth/logout',{cookie,body:{}})).status,200)
  assert.equal((await request('/ledger',{cookie})).status,401)
  const r=await request('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD}});cookie=r.cookies[0].split(';')[0];assert.equal(r.status,200)
 })
 await t.test('reinício encerra a sessão efêmera e permite nova entrada com a mesma senha',async()=>{
  const fresh=await server();assert.equal((await fresh('/ledger',{cookie})).status,401)
  assert.equal((await fresh('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD}})).status,200)
 })
 await t.test('sessão expira e modo desativado não autentica nem consulta MongoDB',async()=>{
  const original=Date.now;Date.now=()=>original()+3600001
  try{assert.equal((await request('/ledger',{cookie})).status,401)}finally{Date.now=original}
  const off=await server(false);assert.equal((await off('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD}})).status,401)
  assert.equal((await off('/ledger',{cookie})).status,401)
 })
 await t.test('HTTPS conserva cookie Secure e prefixo protegido',async()=>{
  const https=await server(true,true),r=await https('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD}})
  assert.match(r.cookies[0],/^__Host-meunorte-demo=/);assert.match(r.cookies[0],/Secure/)
 })
 await t.test('tentativas excessivas são limitadas',async()=>{
  const fresh=await server();for(let i=0;i<8;i++)assert.equal((await fresh('/auth/login',{body:{email:DEMO_EMAIL,password:'errada'}})).status,401)
  assert.equal((await fresh('/auth/login',{body:{email:DEMO_EMAIL,password:DEMO_PASSWORD}})).status,429)
 })
 assert.equal(accesses,0,'Nenhuma leitura ou gravação privada pode ser feita pela demo')
})
