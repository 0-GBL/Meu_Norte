import { spawn } from 'node:child_process'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { preview } from 'vite'
import { periodReport, portfolioPosition, reportComparison } from '../../backend/src/reports.js'
import { comparisonPeriod } from '../../shared/reportPeriods.mjs'
import { cardSummary } from '../../backend/src/cards.js'
import { accountBalances } from '../../backend/src/ledger.js'
import { auditContrast } from './audit-contrast.mjs'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const chrome = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome')
const day = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'}).format(new Date())
const month = day.slice(0,7)
const from = month + '-01'
const accounts = [{_id:'a',name:'Conta corrente',initialBalance:-5000}]
const entries = [
 {_id:'income-fixture',description:'Salário',type:'income',accountId:'a',date:from,amount:450000,category:'Salário'},
 ...[120000,55000,2100].map((amount,index)=>({_id:'expense-'+index,description:'Despesa '+index,type:'expense',accountId:'a',date:from,amount,category:['Moradia','Mercado','Táxi'][index]}))
]
entries.push({_id:'receipt',type:'income',accountId:'a',assetId:'sold-valued',assetOperation:'sale',assetReceiptSource:'existing',date:day,amount:1800000,category:'Patrimônio',description:'Recebimento do bem'})
const reminders=[]
const mutations=[]
let failForecast=false
let contrastMode=false,publicMode=false
const sampleCard=cardSummary({_id:'card-fixture',name:'Cartão teste',limit:500000,close:15,due:22},[
 {_id:'card-purchase',type:'purchase',date:from,amount:9000,description:'Compra teste',category:'Compras',installments:1},
],day)
const ledger=()=>({...accountBalances(accounts,entries),entries,cancelledEntries:[],cards:contrastMode?[sampleCard]:[],assets,
 reminders:contrastMode?[{_id:'reminder-fixture',name:'Lembrete teste',kind:'manual',frequency:'once',dueOn:day,effectiveDate:day,notifyOn:day,status:'active',read:false,history:[]}]:reminders,goals:[],budgets:[]})
const assets = [{_id:'v',name:'Veículo',kind:'vehicle',acquired:4000000,valuations:[{date:day,value:3200000},...(day === from ? [] : [{date:from,value:4000000}])]}]
assets.push(
 {_id:'sold',name:'Vendido sem avaliação',kind:'vehicle',acquired:2000000,status:'sold',endedOn:day,sale:{date:day,amount:1800000,cost:2000000},valuations:[]},
 {_id:'sold-valued',name:'Vendido com avaliação',kind:'other',acquired:2000000,status:'sold',endedOn:day,sale:{date:day,amount:1800000,cost:2000000,entryId:'receipt'},valuations:[{_id:'valuation',date:from,value:1900000}]},
 {_id:'retired',name:'Bem baixado',kind:'equipment',acquired:100000,status:'retired',endedOn:day,valuations:[]}
)
let state='normal'
let requestCount=0
const server = await preview({root,configFile:false,preview:{host:'127.0.0.1',port:0},plugins:[{
 name:'fixture',configurePreviewServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url = new URL(req.url,'http://localhost')
   let data
   if(url.pathname==='/api/auth/session') data={user:publicMode?null:{name:'Teste',email:'fixture@example.test',role:'admin'},recovery:true}
   else if(url.pathname==='/api/ledger') data=ledger()
   else if(req.method==='POST' && (url.pathname==='/api/ledger/assets' || /^\/api\/ledger\/assets\/[^/]+\/(valuations|operations)$/.test(url.pathname)) || req.method==='PUT' && /^\/api\/ledger\/assets\/[^/]+$/.test(url.pathname)) {
    let raw='';for await(const chunk of req)raw+=chunk
    const body=JSON.parse(raw)
    mutations.push({path:url.pathname,...body})
    let asset=assets.find(row=>row._id===url.pathname.split('/')[4])
    if(url.pathname==='/api/ledger/assets') {
      asset={...body,_id:'asset-'+mutations.length,valuations:body.value==null?[]:[{_id:'initial-value',date:body.date,value:body.value}]}
      assets.push(asset)
    } else if(req.method==='PUT') Object.assign(asset,body)
    else if(url.pathname.endsWith('/valuations')) {
      asset.valuations.unshift({...body,_id:'value-'+mutations.length})
      asset.reviewOn=body.reviewOn
    } else if(body.type==='purchase') {
      asset.purchase={date:body.date,amount:body.amount}
      asset.acquired=body.amount;asset.acquiredOn=body.date
    } else {
      asset.status=body.type==='sale'?'sold':'retired';asset.endedOn=body.date
      if(body.type==='sale') {
        asset.sale={date:body.date,amount:body.amount,cost:asset.acquired,operationId:'sale-'+mutations.length}
        if(body.mode==='new') {
          asset.sale.entryId='sale-receipt-'+mutations.length
          entries.push({_id:asset.sale.entryId,assetId:asset._id,assetOperation:'sale',assetReceiptSource:'new',type:'income',category:'Patrimônio',description:'Venda recebida',amount:body.amount,date:body.date,accountId:body.accountId})
        }
      }
    }
    data=ledger()
   }
   else if(req.method==='POST' && /^\/api\/ledger\/assets\/[^/]+\/receipt$/.test(url.pathname)) {
    let raw='';for await(const chunk of req)raw+=chunk
    const body=JSON.parse(raw)
    mutations.push({path:url.pathname,...body})
    const asset=assets.find(row=>row._id===url.pathname.split('/')[4])
    asset.sale.history??=[]
    if(body.action==='schedule' && failForecast) {
      failForecast=false;res.statusCode=503;data={message:'Previsão indisponível no teste'}
    } else if(body.action==='schedule') {
      const changed=(asset.sale.expectedOn??null)!==body.expectedOn
      if(changed) {
        asset.sale.history.push({action:'schedule',previousDate:asset.sale.expectedOn??null,nextDate:body.expectedOn,recordedAt:new Date().toISOString()})
        asset.sale.expectedOn=body.expectedOn
      } else res.statusCode=200
      data={...ledger(),mutation:{changed,dateChanged:changed,reminderChanged:false,message:changed?'Previsão atualizada.':'Nenhuma alteração: a previsão e o lembrete permanecem iguais.'}}
    } else if(body.action==='confirm') {
      assert.equal(body.confirmed,true)
      assert.equal('amount' in body,false)
      asset.sale.entryId='confirmed-receipt'
      entries.push({_id:'confirmed-receipt',assetId:asset._id,assetOperation:'sale',assetReceiptSource:'new',type:'income',category:'Patrimônio',description:'Recebimento confirmado',amount:asset.sale.amount,date:body.date,accountId:body.accountId})
      asset.sale.history.push({action:'confirm',entryId:asset.sale.entryId,date:body.date,recordedAt:new Date().toISOString()})
    }
    data??=ledger()
   }
   else if(url.pathname==='/api/ledger/reports'){
    requestCount++
    if(state==='error'){res.statusCode=503; data={message:'Serviço indisponível'}}
    else{
     const query=Object.fromEntries(url.searchParams)
     const input={accounts,entries:state==='empty'?[]:entries,assets:state==='empty'?[]:assets,cards:[],currentDay:day,accountId:query.account,category:query.category,type:query.type,assetKind:query.assetKind}
     const current=periodReport({...input,from:query.from,through:query.through})
     const range=comparisonPeriod(query.from,query.through,query.comparison)
     const previous=periodReport({...input,...range})
     data={...current,comparison:reportComparison(current,previous),previous:{...previous,...range},position:portfolioPosition({...input,date:day})}
    }
   } else return next()
   res.setHeader('Content-Type','application/json')
   res.end(JSON.stringify(data))
  })
 }
}]})
const profile = await mkdtemp(join(tmpdir(),'meunorte-reports-'))
const browser = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'})
const eventually = async fn=>{for(let i=0;i<80;i++){try{const result=await fn();if(result)return result}catch{} if(browserError) throw browserError; await pause(100)} throw Error('Timed out waiting for browser state')}
let browserError
browser.on('error', error => { browserError = error })
let socket
const pending = new Map()
let id=0
const exceptions=[]
try{
 const port = await eventually(async()=> (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0])
 const [tab] = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()
 socket=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data)
  if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
  if(!msg.id)return
  const call=pending.get(msg.id);pending.delete(msg.id)
  if(msg.error)call.reject(Error(msg.error.message));else call.resolve(msg.result)
 })
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}))})
 const evalIn=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value
 await send('Runtime.enable')
 await send('Page.enable')
 const url='http://127.0.0.1:'+server.httpServer.address().port+'/relatorios'
 const layout=async(width,height,mobile)=>{
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile})
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile})
  await send('Page.navigate',{url})
  await eventually(()=>evalIn('document.querySelectorAll(".report-metric").length === 8 && document.querySelectorAll(".recharts-surface").length >= 4'))
  assert.equal(await evalIn('document.documentElement.scrollWidth <= innerWidth'),true)
  assert.equal(await evalIn('document.querySelector(".report-filter-toggle").getAttribute("aria-expanded")'),String(!mobile))
  const columns=await evalIn('getComputedStyle(document.querySelector(".report-chart-grid")).gridTemplateColumns.split(" ").length')
  assert.equal(columns,mobile?1:2)
  if(process.env.REPORT_SCREENSHOTS) {
    await evalIn('document.querySelector(".report-view").scrollIntoView({block:"start"})')
    await pause(150)
    const shot=await send('Page.captureScreenshot')
    await writeFile(join(process.env.REPORT_SCREENSHOTS,'reports-charts-'+width+'.png'),Buffer.from(shot.data,'base64'))
  }
  console.log('Layout '+width+'px: '+columns+' coluna(s), sem rolagem horizontal')
 }
 await layout(1440,1000,false)
 await layout(900,1000,false)
 await layout(390,844,true)
 await layout(320,760,true)
 await evalIn('document.querySelector(".report-filter-toggle").click()')
 assert.equal(await evalIn('document.querySelector(".report-filter-toggle").getAttribute("aria-expanded")'),'true')
 assert.equal(await evalIn('document.querySelector(".report-section-title .report-pill")?.textContent.includes("Mesmo período do mês anterior")'),true)
 await evalIn('(()=>{const el=Array.from(document.querySelectorAll("label")).find(el=>el.textContent.startsWith("Comparação")).querySelector("select");el.value="consecutive";el.dispatchEvent(new Event("change",{bubbles:true}));})()')
 await eventually(()=>evalIn('document.querySelector(".report-section-title .report-pill")?.textContent.includes("Intervalo anterior de mesma duração")'))
 const count = requestCount
 await evalIn('(()=>{const el=document.querySelector(".report-view select");el.value="comparison";el.dispatchEvent(new Event("change",{bubbles:true}));})()')
 await eventually(()=>evalIn('Array.from(document.querySelectorAll(".recharts-cartesian-axis-tick-value")).some(el=>el.textContent==="Selecionado")'))
 assert.equal(requestCount,count)
 await evalIn('document.querySelector(".report-legend details summary").click()')
 assert.equal(await evalIn('document.querySelector(".report-legend details").open'),true)
 await evalIn('document.querySelector(".report-extra-filters > summary").click()')
 await evalIn('(()=>{const el=Array.from(document.querySelectorAll("label")).find(el=>el.textContent.startsWith("Categoria de movimentação")).querySelector("select");el.value="Mercado";el.dispatchEvent(new Event("change",{bubbles:true}));})()')
 await eventually(()=>evalIn('document.querySelector(".report-active-filters")?.textContent.includes("Mercado") && document.querySelector(".report-metrics article:nth-child(2)")?.textContent.includes("550,00")'))
 state='error'
 await evalIn('document.querySelector(".report-link").click()')
 await eventually(()=>evalIn('document.querySelector("[role=alert]")?.textContent.includes("Serviço indisponível")'))
 state='empty'
 await evalIn('document.querySelector("[role=alert] button").click()')
 await eventually(()=>evalIn('document.querySelectorAll(".report-empty").length >= 3'))
 const click=async text=>evalIn(`Array.from(document.querySelectorAll('dialog button, dialog summary')).find(el=>el.textContent.trim()===${JSON.stringify(text)} || el.childNodes[0]?.textContent.trim()===${JSON.stringify(text)}).click()`)
 const close=async()=>{await click('Fechar painel');await eventually(()=>evalIn('!document.querySelector("dialog")'))}
 const fill=async(selector,value)=>evalIn(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
 const choose=async(selector,value)=>evalIn(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`)
 const manage=async id=>{await evalIn(`(()=>{const el=document.getElementById(${JSON.stringify(id)}).querySelector('button');el.focus();el.click()})()`);await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open]"))'))}
 const visible=async selector=>evalIn(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(el=>el.checkVisibility()).length`)
 const dayText=day.split('-').reverse().join('/')
 for(const width of [1440,900,390,320]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<760})
  await send('Page.navigate',{url:url.replace('/relatorios','/patrimonio')})
  await eventually(()=>evalIn('Boolean(document.getElementById("v"))'))
  assert.equal(await evalIn('document.querySelectorAll(".assets-page form").length'),0)
  assert.equal(await evalIn('document.querySelector(".asset-closed").open'),false)
  assert.equal(await evalIn('document.querySelectorAll("#v button").length'),1)
  const contrast=await evalIn(`(()=>{const luminance=color=>{const rgb=color.match(/\\d+/g).slice(0,3).map(value=>{const x=Number(value)/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722};const a=luminance(getComputedStyle(document.querySelector('.asset-overview strong')).color),b=luminance(getComputedStyle(document.querySelector('.asset-overview')).backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)})()`)
  assert.ok(contrast>=4.5,'Resumo deve ter contraste legível: '+contrast)
  assert.equal(await evalIn('document.getElementById("sold").textContent.includes("Aguardando avaliação")'),false)
  assert.equal(await evalIn('document.documentElement.scrollWidth <= innerWidth'),true)
  if(process.env.REPORT_SCREENSHOTS && [1440,320].includes(width)) {
    const shot=await send('Page.captureScreenshot')
    await writeFile(join(process.env.REPORT_SCREENSHOTS,'assets-simple-'+width+'.png'),Buffer.from(shot.data,'base64'))
  }
  await manage('v')
  assert.equal(await visible('dialog form'),0)
  if(process.env.REPORT_SCREENSHOTS && [1440,320].includes(width)) {
    const shot=await send('Page.captureScreenshot')
    await writeFile(join(process.env.REPORT_SCREENSHOTS,'assets-manage-'+width+'.png'),Buffer.from(shot.data,'base64'))
  }
  await click('Mais opções')
  assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("Criar lembrete")'),true)
  await click('← Voltar')
  for(let tab=0;tab<12;tab++) {
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  }
  assert.equal(await evalIn('Boolean(document.activeElement.closest("dialog"))'),true)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await eventually(()=>evalIn('!document.querySelector("dialog")'))
  assert.equal(await evalIn('document.activeElement.closest("article")?.id'),'v')
  await evalIn('document.querySelector(".asset-closed > summary").click()')
  await manage('sold')
  assert.equal(await evalIn('document.querySelector("dialog input[readonly]").readOnly'),true)
  assert.equal(await evalIn('document.querySelector("dialog input[readonly]").value.includes("18.000,00")'),true)
  assert.equal(await evalIn('document.querySelector("dialog .receipt-advanced").open'),false)
  assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("Última avaliação anterior à vendaNão informada")'),true)
  assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("-R$ 2.000,00")'),true)
  await evalIn('document.querySelectorAll("dialog details").forEach(el=>el.open=true)')
  assert.equal(await evalIn('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth'),true,
    JSON.stringify(await evalIn(`(()=>{const el=document.querySelector('dialog'),rect=el.getBoundingClientRect();return {width:innerWidth,scroll:el.scrollWidth,client:el.clientWidth,overflow:Array.from(el.querySelectorAll('*')).filter(row=>row.getBoundingClientRect().right>rect.right).slice(0,10).map(row=>({tag:row.tagName,cls:row.className,text:row.textContent.slice(0,50)}))}})()`)))
  await close()
  await manage('sold-valued')
  assert.equal(await evalIn('document.querySelector("dialog .receipt-state").textContent.includes("Recebido")'),true)
  await click('Ver histórico do bem')
  assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("Valores registrados")'),true)
  await close()
  await manage('retired')
  assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("Baixado")'),true)
  assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("Aguardando avaliação")'),false)
  await close()
 }
 // Existing sales keep forecasting and explicit receipt confirmation inside details.
 await manage('sold')
 await click('Alterar previsão de recebimento')
 const mutationCount=mutations.length
 await fill('dialog .form-field:has(input[name=expectedOn]) input[type=text]',dayText)
 assert.equal(await evalIn('document.querySelector("dialog input[name=expectedOn]").value'),day,'Previsão digitada é preservada')
 await click('Salvar previsão')
 await eventually(()=>evalIn(`document.querySelector('dialog').textContent.includes('Previsão de recebimento: ${dayText}')`))
 assert.equal(mutations.length,mutationCount+1)
 const savedHistory=assets.find(row=>row._id==='sold').sale.history.length
 await click('Salvar previsão')
 await eventually(()=>evalIn('document.querySelector("dialog").textContent.includes("Nenhuma alteração:")'))
 assert.equal(assets.find(row=>row._id==='sold').sale.history.length,savedHistory)
 await click('Confirmar recebimento')
 await choose('dialog select[name=accountId]','a')
 await click('Revisar recebimento')
 await eventually(()=>evalIn('Boolean(document.querySelector("dialog .receipt-confirmation"))'))
 assert.equal(mutations.length,mutationCount+2)
 await click('Confirmar operação')
 await eventually(()=>evalIn('document.querySelector("dialog .receipt-state").textContent.includes("Recebido")'))
 assert.equal(mutations.length,mutationCount+3)
 assert.equal(await evalIn(`Array.from(document.querySelectorAll('dialog summary')).some(el=>el.textContent==='Confirmar recebimento')`),false)
 await close()

 const createAsset=async name=>{
  await evalIn('document.querySelector(".asset-overview > button").click()')
  await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open] input[name=name]"))'))
  assert.equal(await visible('dialog input:not([type=hidden]), dialog select'),3,'Cadastro rápido mostra somente nome, categoria e aquisição')
  await fill('dialog input[name=name]',name)
  await fill('dialog input[name=acquired]','20000')
  await click('Salvar')
  await eventually(()=>evalIn('!document.querySelector("dialog")'))
  const asset=assets.find(row=>row.name===name)
  assert.equal(asset.acquired,2000000)
  assert.equal(asset.valuations.length,0)
  return asset
 }
 const quick=await createAsset('Cadastro simples')
 await manage(quick._id)
 await click('Editar bem')
 await fill('dialog input[name=name]','Cadastro editado')
 await click('Salvar')
 await eventually(()=>evalIn('Boolean(document.querySelector("dialog nav"))'))
 assert.equal(quick.name,'Cadastro editado')
 await click('Atualizar valor')
 await fill('dialog input[name=value]','21000')
 await click('Salvar valor')
 await eventually(()=>evalIn('Boolean(document.querySelector("dialog nav"))'))
 assert.equal(quick.valuations[0].value,2100000)
 await click('Ver histórico')
 assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("21.000,00")'),true)
 await click('← Voltar')
 await click('Vender ou retirar')
 await click('Vender')
 await fill('dialog input[name=amount]','18000')

 await choose('dialog .asset-wizard select','no')
 await fill('dialog .form-field:has(input[name=expectedOn]) input[type=text]',dayText)
 assert.equal(await evalIn('document.querySelector("dialog input[name=expectedOn]").value'),day,'Previsão digitada na mesma tela da venda')
 if(process.env.REPORT_SCREENSHOTS) {
  const shot=await send('Page.captureScreenshot')
  await writeFile(join(process.env.REPORT_SCREENSHOTS,'sale-single-form.png'),Buffer.from(shot.data,'base64'))
 }
 await click('Revisar venda')
 const beforeSale=mutations.length
 assert.equal(await evalIn('document.querySelector("dialog").textContent.includes("Conferir e confirmar")'),true)
 await click('Voltar')
 assert.equal(await evalIn('document.querySelector("dialog input[name=expectedOn]").value'),day,'Voltar mantém a previsão')
 assert.equal(await evalIn('document.querySelector("dialog input[name=amount]").value.includes("18.000")'),true,'Voltar mantém o valor')
 await click('Revisar venda')
 assert.equal(mutations.length,beforeSale,'Revisar e voltar não salvam a operação')
 failForecast=true
 await click('Confirmar venda')
 await eventually(()=>evalIn('document.querySelector("dialog").textContent.includes("A venda foi salva.")'))
 assert.equal(mutations.filter(row=>row.path.endsWith('/'+quick._id+'/operations')).length,1)
 await click('Tentar salvar previsão')
 await eventually(()=>evalIn('Boolean(document.querySelector("dialog .receipt-state"))'))
 assert.equal(quick.sale.amount,1800000)
 assert.equal(quick.sale.expectedOn,day)
 assert.equal(mutations.filter(row=>row.path.endsWith('/'+quick._id+'/operations')).length,1,'Falha da previsão não repete a venda')
 assert.equal(mutations.length,beforeSale+3)
 await close()

 const paid=await createAsset('Venda já recebida')
 await manage(paid._id);await click('Vender ou retirar');await click('Vender')
 await fill('dialog input[name=amount]','9000');
 await choose('dialog .asset-wizard select','yes')
 await choose('dialog select[name=accountId]','a')
 await click('Revisar venda')
 const paidCount=mutations.length
 await click('Confirmar venda e recebimento')
 await eventually(()=>evalIn('document.querySelector("dialog .receipt-state")?.textContent.includes("Recebido")'))
 assert.equal(mutations.length,paidCount+1,'Venda recebida permanece uma única operação da API')
 assert.equal(entries.filter(row=>row.assetId===paid._id).length,1)
 await close()

 const retired=await createAsset('Baixa simples')
 await manage(retired._id);await click('Vender ou retirar');await click('Retirar bem')
 const beforeRetire=mutations.length,entryCount=entries.length
 await click('Revisar retirada')
 assert.equal(mutations.length,beforeRetire)
 await click('Confirmar retirada')
 await eventually(()=>evalIn('document.querySelector("dialog").textContent.includes("Situação: Baixado")'))
 assert.equal(retired.status,'retired')
 assert.equal(entries.length,entryCount)
 await close()
 // Deep links still reveal the sold section and its management panel.
 await send('Page.navigate',{url:url.replace('/relatorios','/patrimonio')+'#sold-valued'})
 await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open] .receipt-state"))'))
 assert.equal(await evalIn('document.querySelector(".asset-closed").open'),true)
 assert.equal(await evalIn('document.documentElement.scrollWidth <= innerWidth'),true)
 await close()
 contrastMode=true;state='normal'
 await auditContrast({send,evalIn,eventually,origin:new URL(url).origin,setPublic:value=>{publicMode=value},
   screenshot:process.env.REPORT_SCREENSHOTS?async name=>{const shot=await send('Page.captureScreenshot');await writeFile(join(process.env.REPORT_SCREENSHOTS,name+'.png'),Buffer.from(shot.data,'base64'))}:undefined})
 assert.deepEqual(exceptions,[])
 console.log('Patrimônio simplificado aprovado: cadastro, edição, avaliação, venda com confirmação, recebimento, baixa, recuperação de falha, opções avançadas, teclado e layouts de 320 a 1440 px')
} finally {
 socket?.close()
 if(browser.pid) browser.kill()
 server.httpServer.close()
 await pause(400)
 await rm(profile,{recursive:true,force:true,maxRetries:2,retryDelay:200}).catch(()=>{})
}
