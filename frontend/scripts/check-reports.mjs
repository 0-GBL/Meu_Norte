import { spawn } from 'node:child_process'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { preview } from 'vite'
import { periodReport, portfolioPosition, reportComparison } from '../../backend/src/reports.js'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const chrome = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome')
const day = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'}).format(new Date())
const month = day.slice(0,7)
const from = month + '-01'
const prior = new Date(from + 'T00:00:00Z')
prior.setUTCDate(0)
const previousThrough = prior.toISOString().slice(0,10)
const previousFrom = previousThrough.slice(0,7)+'-01'
const accounts = [{_id:'a',name:'Conta corrente',initialBalance:-5000}]
const entries = [
 {type:'income',accountId:'a',date:from,amount:450000,category:'Salário'},
 ...[120000,55000,2100].map((amount,index)=>({type:'expense',accountId:'a',date:from,amount,category:['Moradia','Mercado','Táxi'][index]}))
]
const assets = [{_id:'v',name:'Veículo',kind:'vehicle',acquired:4000000,valuations:[{date:day,value:3200000},...(day === from ? [] : [{date:from,value:4000000}])]}]
let state='normal'
let requestCount=0
const server = await preview({root,configFile:false,preview:{host:'127.0.0.1',port:0},plugins:[{
 name:'fixture',configurePreviewServer(server){
  server.middlewares.use((req,res,next)=>{
   const url = new URL(req.url,'http://localhost')
   let data
   if(url.pathname==='/api/auth/session') data={user:{name:'Teste',email:'fixture@example.test',role:'admin'}}
   else if(url.pathname==='/api/ledger') data={accounts,entries,cards:[],assets,reminders:[],goals:[],budgets:[]}
   else if(url.pathname==='/api/ledger/reports'){
    requestCount++
    if(state==='error'){res.statusCode=503; data={message:'Serviço indisponível'}}
    else{
     const query=Object.fromEntries(url.searchParams)
     const input={accounts,entries:state==='empty'?[]:entries,assets:state==='empty'?[]:assets,cards:[],currentDay:day,accountId:query.account,category:query.category,type:query.type,assetKind:query.assetKind}
     const current=periodReport({...input,from:query.from,through:query.through})
     const previous=periodReport({...input,from:previousFrom,through:previousThrough})
     data={...current,comparison:reportComparison(current,previous),previous:{...previous,from:previousFrom,through:previousThrough},position:portfolioPosition({...input,date:day})}
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
 const count = requestCount
 await evalIn('(()=>{const el=document.querySelector(".report-view select");el.value="comparison";el.dispatchEvent(new Event("change",{bubbles:true}));})()')
 await eventually(()=>evalIn('Array.from(document.querySelectorAll(".recharts-cartesian-axis-tick-value")).some(el=>el.textContent==="Selecionado")'))
 assert.equal(requestCount,count)
 await evalIn('document.querySelector(".report-legend details summary").click()')
 assert.equal(await evalIn('document.querySelector(".report-legend details").open'),true)
 await evalIn('(()=>{const el=document.querySelectorAll(".report-filter-grid select")[2];el.value="Mercado";el.dispatchEvent(new Event("change",{bubbles:true}));})()')
 await eventually(()=>evalIn('document.querySelector(".report-active-filters")?.textContent.includes("Mercado") && document.querySelector(".report-metrics article:nth-child(2)")?.textContent.includes("550,00")'))
 state='error'
 await evalIn('document.querySelector(".report-link").click()')
 await eventually(()=>evalIn('document.querySelector("[role=alert]")?.textContent.includes("Serviço indisponível")'))
 state='empty'
 await evalIn('document.querySelector("[role=alert] button").click()')
 await eventually(()=>evalIn('document.querySelectorAll(".report-empty").length >= 3'))
 assert.deepEqual(exceptions,[])
 console.log('Comparação, detalhes da categoria, erro, nova tentativa e estados vazios confirmados')
} finally {
 socket?.close()
 if(browser.pid) browser.kill()
 server.httpServer.close()
 await pause(400)
 await rm(profile,{recursive:true,force:true,maxRetries:2,retryDelay:200}).catch(()=>{})
}
