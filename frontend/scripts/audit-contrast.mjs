import assert from 'node:assert/strict'

// Inspect computed styles after compositing transparent backgrounds, including gradient stops.
// This measures the rendered controls, not a second copy of the CSS palette.
const measurement = `(() => {
  const rgba = value => { const numbers = value.match(/[\\d.]+/g)?.map(Number) ?? []; return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1] }
  const over = (a, b) => [0,1,2].map(i => a[i]*a[3]+b[i]*(1-a[3])).concat(1)
  const backgrounds = element => {
    if (!element) return [[255,255,255,1]]
    const style = getComputedStyle(element), color = rgba(style.backgroundColor)
    const images = style.backgroundImage.match(/rgba?\\([^)]+\\)/g)
    const parent = color[3] === 1 ? [color] : backgrounds(element.parentElement).map(bg => over(color, bg))
    return images ? images.flatMap(value => parent.map(bg => over(rgba(value), bg))) : parent
  }
  const luminance = color => { const c=color.slice(0,3).map(n=>{const x=n/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722 }
  const ratio = (a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  const failures=[], controls=Array.from(document.querySelectorAll('button, a.action-button, a.text-link, a.icon-button, a.balance-link')).filter(el=>el.checkVisibility())
  let texts=0,icons=0
  const test=(element,color,minimum,kind,label)=>{
    for(const bg of backgrounds(element)) {const value=ratio(over(rgba(color),bg),bg);if(value<minimum)failures.push({kind,label:label.slice(0,55),ratio:value,fg:color,bg:bg.slice(0,3)})}
  }
  for(const control of controls) {
    const walker=document.createTreeWalker(control,NodeFilter.SHOW_TEXT)
    while(walker.nextNode()) {const node=walker.currentNode,parent=node.parentElement;if(!node.textContent.trim()||!parent.checkVisibility()||parent.closest('.sr-only, [aria-hidden="true"], svg'))continue;texts++;test(parent,getComputedStyle(parent).color,4.5,'text',node.textContent.trim())}
    for(const svg of control.querySelectorAll('svg')) {if(!svg.checkVisibility())continue;icons++;test(svg,getComputedStyle(svg).color,3,'icon',control.getAttribute('aria-label')||control.textContent.trim())}
  }
  const target=document.querySelector('[data-contrast-target]')
  let targetStyle=null
  if(target) {const style=getComputedStyle(target);targetStyle={color:style.color,background:style.backgroundColor,outline:style.outlineStyle,outlineWidth:style.outlineWidth,outlineRatio:Math.min(...backgrounds(target.parentElement).map(bg=>ratio(rgba(style.outlineColor),bg))),borderRatio:Math.min(...backgrounds(target.parentElement).map(bg=>ratio(rgba(style.borderColor),bg))),fillRatio:Math.min(...backgrounds(target.parentElement).map(bg=>ratio(rgba(style.backgroundColor),bg)))} }
  return {controls:controls.length,texts,icons,failures,targetStyle}
})()`

export async function auditContrast({ send, evalIn, eventually, origin, setPublic, screenshot }) {
  await send('DOM.enable'); await send('CSS.enable')
  const paths=['/','/contas','/movimentacoes','/cartoes','/orcamentos','/metas','/patrimonio','/lembretes','/relatorios','/perfil','/configuracoes','/entrar']
  let screens=0,checks=0,stateChecks=0
  const failures=[]
  async function check(label) {
    const result=await evalIn(measurement)
    failures.push(...result.failures.map(row=>({screen:label,...row})))
    assert.ok(result.controls>0,label+' sem controles renderizados')
    checks+=result.texts+result.icons
    return result
  }
  async function navigate(path,theme) {
    setPublic(path==='/entrar')
    await evalIn(`localStorage.setItem('meu-norte-theme',${JSON.stringify(theme)})`)
    await send('Page.navigate',{url:origin+path})
    await eventually(()=>evalIn(`Boolean(document.querySelector('h1')) && document.documentElement.dataset.theme===${JSON.stringify(theme)} && location.pathname===${JSON.stringify(path)}`))
    if(path==='/relatorios')await eventually(()=>evalIn('document.querySelectorAll(".report-metric").length===8'))
  }
  async function states(selector,primary,theme) {
    await evalIn(`document.querySelector(${JSON.stringify(selector)}).setAttribute('data-contrast-target','true')`)
    const root=(await send('DOM.getDocument',{depth:0})).root.nodeId
    const {nodeId}=await send('DOM.querySelector',{nodeId:root,selector:'[data-contrast-target]'})
    for(const state of ['normal','hover','active','focus','selected','selected-hover','disabled','loading']) {
      await send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover','selected-hover'].includes(state)?['hover']:state==='active'?['hover','active']:state==='focus'?['focus','focus-visible']:[]})
      await evalIn(`(()=>{const el=document.querySelector('[data-contrast-target]');el.disabled=${state==='disabled'};el.setAttribute('aria-busy',${JSON.stringify(String(state==='loading'))});${state.startsWith('selected')?"el.setAttribute('aria-pressed','true')":"el.removeAttribute('aria-pressed')"}})()`)
      const result=await check(theme+' / '+(primary?'principal':'secundário')+' / '+state)
      if(primary)assert.equal(result.targetStyle.color,'rgb(255, 255, 255)',state+' deve manter texto branco')
      if(state==='focus') {
        assert.notEqual(result.targetStyle.outline,'none')
        assert.ok(parseFloat(result.targetStyle.outlineWidth)>=2)
        assert.ok(result.targetStyle.outlineRatio>=3,'Foco deve contrastar com a superfície: '+JSON.stringify(result.targetStyle))
      }
      if(primary && state!=='disabled')assert.ok(Math.max(result.targetStyle.borderRatio,result.targetStyle.fillRatio)>=3,'Botão principal deve se distinguir da superfície: '+JSON.stringify(result.targetStyle))
      stateChecks++
    }
    await send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]})
    await evalIn(`(()=>{const el=document.querySelector('[data-contrast-target]');el.disabled=false;el.removeAttribute('aria-busy');el.removeAttribute('aria-pressed');el.removeAttribute('data-contrast-target')})()`)
  }
  for(const theme of ['light','dark']) {
    for(const width of [320,390,900,1440]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<760})
      for(const path of paths) {
        await navigate(path,theme)
        await check(theme+' '+width+'px '+path)
        assert.equal(await evalIn('document.documentElement.scrollWidth<=innerWidth'),true,theme+' '+width+' '+path)
        screens++
        if(path==='/') {
          assert.equal(await evalIn('Array.from(document.querySelectorAll(".sidebar-group")).every(el=>!el.open)'),true,'Grupos começam recolhidos')
          if(width<=900)await evalIn('document.querySelector("#mobile-menu-button").click()')
          await eventually(()=>evalIn('getComputedStyle(document.querySelector(".sidebar")).visibility==="visible"'))
          await evalIn('document.querySelector(".sidebar-group summary").focus()')
          assert.equal(await evalIn('document.activeElement===document.querySelector(".sidebar-group summary")'),true,'Grupo recebe foco '+theme+' '+width)
          await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '})
          await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32})
          await eventually(()=>evalIn('document.querySelector(".sidebar-group").open'))
          assert.equal(await evalIn('document.querySelector(".sidebar-group").open'),true,'Grupo abre por teclado')
          if(width<=900)assert.equal(await evalIn('document.querySelector(".sidebar").classList.contains("mobile-open")'),true,'Expandir grupo mantém menu aberto')
          await evalIn('document.querySelectorAll(".sidebar-group").forEach(el=>el.open=true)')
          assert.equal(await evalIn('document.querySelectorAll(".sidebar nav a").length'),10,'Todas as páginas continuam acessíveis')
          await check(theme+' '+width+' menu expandido')
          if([320,1440].includes(width))await screenshot?.('simple-menu-'+width+'-'+theme)
          await evalIn('Array.from(document.querySelectorAll(".sidebar nav a")).find(el=>el.pathname==="/metas").click()')
          await eventually(()=>evalIn('location.pathname==="/metas"'))
          assert.equal(await evalIn('document.querySelector(".sidebar-group").open'),true)
          if(width<=900)assert.equal(await evalIn('document.querySelector(".sidebar").classList.contains("mobile-open")'),false,'Navegar fecha o menu')
        }
        if(path==='/relatorios')assert.equal(await evalIn('Boolean(document.querySelector("#report-charts")) && document.querySelector("#report-flow").textContent==="Resumo do período"'),true)
        if(path==='/perfil') {
          assert.equal(await evalIn('Array.from(document.querySelectorAll("input[type=password]")).every(el=>!el.checkVisibility())'),true)
          await evalIn('document.querySelector("main details > summary").click()')
          assert.equal(await evalIn('Array.from(document.querySelectorAll("input[type=password]")).filter(el=>el.checkVisibility() && el.required).length'),3)
          await check(theme+' '+width+' alterar senha')
        }
        if(path==='/cartoes') {
          await evalIn(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Ver fatura').click()`)
          await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open]"))'))
          await check(theme+' '+width+' faturas')
          await evalIn('document.querySelector("dialog details > summary").click()')
          await evalIn(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes('Compras e lançamentos')).click()`)
          await check(theme+' '+width+' cartão / lançamentos')
          await evalIn(`Array.from(document.querySelectorAll('dialog button')).find(el=>el.textContent==='Voltar às faturas').click()`)
          await evalIn('document.querySelector("dialog details > summary").click()')
          await evalIn(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes('Pagamentos')).click()`)
          await check(theme+' '+width+' cartão / pagamentos')
        }
        if(path==='/patrimonio') {
          await evalIn('document.querySelector(".asset-overview > button").click()')
          await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open] input[name=name]"))'))
          await check(theme+' '+width+' modal cadastro')
          await evalIn('document.querySelector("dialog .asset-additional").open=true')
          await check(theme+' '+width+' formulário expandido')
          if(width===320)await screenshot?.('contrast-modal-'+theme)
          await evalIn(`Array.from(document.querySelectorAll('dialog button')).find(el=>el.textContent==='Fechar painel').click()`)
          if(width===1440) {
            await states('.asset-overview > button',true,theme)
            await states('#v > button',false,theme)
            await states('.topbar-actions button',false,theme)
            // Real theme switch with the existing preference mechanism.
            await evalIn(`document.querySelector('.topbar-actions button').click()`)
            await eventually(()=>evalIn(`document.documentElement.dataset.theme===${JSON.stringify(theme==='light'?'dark':'light')}`))
            await check('Troca de tema sem recarregar')
            await evalIn(`document.querySelector('.topbar-actions button').click()`)
            await eventually(()=>evalIn(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`))
          }
        }
        if(path==='/movimentacoes') {
          await evalIn(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Adicionar despesa').click()`)
          await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open] .date-picker-control"))'))
          await check(theme+' '+width+' modal movimentação')
          await evalIn('document.querySelector(".date-picker-control").click()')
          await eventually(()=>evalIn('Boolean(document.querySelector(".date-calendar[open]"))'))
          await check(theme+' '+width+' calendário / seleção')
          await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
          await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
        }
        if(['/contas','/orcamentos','/metas','/lembretes'].includes(path)) {
          const label={'/contas':'Adicionar conta','/orcamentos':'Definir limite','/metas':'Adicionar meta','/lembretes':'Adicionar lembrete'}[path]
          await evalIn(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent===${JSON.stringify(label)}).click()`)
          await eventually(()=>evalIn('Boolean(document.querySelector("dialog[open]"))'))
          await check(theme+' '+width+' formulário '+label)
          await evalIn('document.querySelectorAll("dialog details").forEach(el=>el.open=true)')
          await check(theme+' '+width+' opções expandidas '+label)
          assert.equal(await evalIn('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'),true,'Painel não deve ultrapassar a tela')
        }
      }
    }
    console.log('Contraste '+theme+': módulos, ícones, formulários, modais e estados aprovados')
  }
  setPublic(false)
  assert.deepEqual(failures,[],'Contraste dos controles renderizados')
  console.log('Contraste: '+screens+' telas, '+stateChecks+' estados e '+checks+' medições de textos/ícones aprovadas')
  return {screens,stateChecks,checks}
}
