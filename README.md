# Meu Norte

**Sua vida financeira, na direção certa.**

Aplicativo de finanças pessoais desenvolvido como projeto de portfólio. Reúne contas, movimentações, cartões, planejamento, patrimônio, lembretes e relatórios em uma interface com opções avançadas sob demanda, temas claro/escuro e suporte a telas pequenas.

Esta versão está encerrada para novas funcionalidades e validada nos cenários descritos em [VALIDACAO_FINAL.md](VALIDACAO_FINAL.md). Está preparada para apresentação do código e execução local conforme os requisitos abaixo; **não há homologação suficiente para disponibilização pública em produção**.

## Funcionalidades

- Login administrativo, sessão persistente, troca de senha e recuperação por e-mail quando SMTP está configurado.
- Contas com saldos, transferências, arquivamento e exclusão protegida.
- Receitas/despesas e histórico unificado com busca, filtros, referências, edição e cancelamento.
- Cartões com compras parceladas, faturas, pagamentos parciais, estornos, encargos e crédito.
- Orçamentos mensais e metas, com registros informativos ou transferências entre contas.
- Bens, avaliações, compra/venda/baixa e recebimentos patrimoniais integrais, com previsão e histórico.
- Lembretes recorrentes e notificações internas, com confirmação manual por ocorrência.
- Relatórios 2.0 com comparação de períodos, competência, caixa e posição patrimonial.

Não há integração bancária automática, geração automática de receitas/despesas recorrentes ou um modo de demonstração embutido. Os dados fictícios pertencem somente aos testes isolados.

## Tecnologias e estrutura

**Frontend:** React 19, React Router, Vite 7, Tailwind CSS 4, Recharts e Lucide. **Backend:** Node.js, Express 5, Mongoose 9, MongoDB, bcryptjs e Nodemailer. **Validação:** `node:test`, MongoDB temporário em replica set e Chrome headless.

```text
backend/
  src/          API, autenticação, modelos, regras financeiras e testes
  scripts/      runner de integração com MongoDB local temporário
frontend/
  src/          páginas, componentes, contexto de sessão/dados e estilos
  scripts/      testes de navegador, integração e contraste
shared/         validações e regras de datas compartilhadas
VALIDACAO_FINAL.md
```

As rotas `/api/ledger` usam o espaço financeiro definido pela sessão autenticada. Operações relacionadas executam em transações MongoDB; a revisão do espaço serializa gravações concorrentes. Criações recebem chave de idempotência para evitar repetição do mesmo envio.

## Requisitos

- Node.js **22.12+** e npm; as validações finais foram executadas com Node.js 24.
- MongoDB com **replica set e suporte a transações**: Atlas privado ou instalação local equivalente. Uma instância standalone não atende aos fluxos transacionais.
- Chrome para os testes de navegador. Defina `CHROME_PATH` se o executável não estiver no caminho esperado pelo script.
- As suítes isoladas baixam um binário MongoDB caso ele ainda não esteja em cache. Não precisam de acesso ao Atlas.

## Instalação e configuração local

Execute a partir da raiz do repositório. No PowerShell, use `npm.cmd` se a política de execução bloquear `npm.ps1`.

```powershell
npm --prefix backend ci
npm --prefix frontend ci

# Crie apenas se o arquivo ainda não existir. Nunca substitua um .env real.
if (!(Test-Path backend/.env)) {
  Copy-Item backend/.env.example backend/.env
}
```

Preencha `backend/.env` apenas no seu computador, com os dados do seu banco privado. Os exemplos versionados não contêm credenciais.

| Variável | Uso |
| --- | --- |
| `MONGODB_URI` | Conexão privada do banco com replica set; obrigatória |
| `CLIENT_ORIGIN` | Origem exata do frontend; padrão local `http://localhost:5173` |
| `PORT` | Porta da API; padrão `3001` |
| `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | Configuração inicial do administrador, somente no ambiente local de desenvolvimento |
| `INITIAL_ADMIN_LEGACY_OWNER` | Opcional, somente para associar um administrador inicial a um espaço anterior já existente |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Recuperação por e-mail; opcional e com TLS |
| `NODE_ENV` | Configuração do ambiente; não use `production` para a criação local inicial do administrador |

O frontend usa o proxy `/api` do Vite. `VITE_LEDGER_API_URL` pode definir outra base pública, quando necessário. Nunca coloque senhas, tokens ou segredos em variáveis `VITE_*`: elas são destinadas ao código público do navegador. `frontend/.env.local` é local e ignorado pelo Git.

### Administrador inicial

1. Em uma instalação local nova, preencha nome, e-mail e uma senha inicial exclusiva nas variáveis `INITIAL_ADMIN_*`. Prefira uma senha forte com pelo menos 12 caracteres, respeitando o limite de 72 bytes.
2. Inicie a API e entre com esses dados. Em **Meu Perfil**, altere a senha para liberar os módulos financeiros.
3. Remova as variáveis iniciais do seu ambiente após a troca. A criação é idempotente: reiniciar a API não redefine a senha de uma conta já existente.

Se houver um espaço legado, configure `INITIAL_ADMIN_LEGACY_OWNER` **antes da primeira criação** e somente com o identificador conhecido desse espaço. Sem essa opção, o administrador recebe um espaço independente. Não use essa configuração para tentar substituir um administrador existente.

Esta documentação não redefine credenciais existentes. A recuperação de senha requer SMTP configurado; os testes usam um simulador e não enviam mensagens externas.

### Executar

Abra dois terminais na raiz:

```powershell
# Terminal 1
npm --prefix backend run dev

# Terminal 2
npm --prefix frontend run dev -- --strictPort
```

Abra [http://localhost:5173/entrar](http://localhost:5173/entrar). A API local escuta em `127.0.0.1:3001`. A origem aberta no navegador deve corresponder a `CLIENT_ORIGIN`; mudar entre `localhost`, `127.0.0.1` ou outra porta exige configuração consistente.

## Testes e build

```powershell
npm --prefix backend run test:isolated
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run test:reports-browser
npm --prefix frontend run test:app-browser
```

- `test:isolated`: executa todos os testes de backend em replica set local temporário. Não carrega `.env` nem reaproveita a URI do Atlas.
- `frontend test`: testes unitários de valores, datas, apresentação e lembretes.
- `test:reports-browser`: fixtures locais para patrimônio, relatórios, erros, estados vazios e auditoria de controles nos dois temas.
- `test:app-browser`: login real e fluxos pelo navegador contra a API Express e um MongoDB temporário local, com dados exclusivos do teste.
- `build`: gera `frontend/dist`, que permanece ignorado pelo Git.

As suítes de integração recusam URIs remotas. `npm --prefix backend test` sem `MONGODB_TEST_URI` executa os testes unitários e ignora as integrações; prefira o runner isolado para validar a versão completa. Não configure `MONGODB_TEST_URI` com uma conexão do Atlas.

Última execução final: **48 testes de backend, 16 de frontend e 15 fluxos de ponta a ponta aprovados**, sem reprovações ou testes ignorados. A auditoria percorreu **96 telas, 48 estados representativos e 2.826 medições de texto/ícones**, em 320, 390, 900 e 1440 px. O build foi concluído. Evidências e limites estão em [VALIDACAO_FINAL.md](VALIDACAO_FINAL.md).

## Regras de integridade preservadas

- Valores usam centavos inteiros; transferências próprias não são receitas ou despesas.
- Compras de cartão entram por competência da fatura. Pagamentos alteram o caixa sem repetir a despesa. Parcelas preservam os centavos; pagamentos duplicados são protegidos.
- Contas com saldo ou dependências não podem ser excluídas. Exclusões lógicas e cancelamentos preservam referências e histórico.
- Avaliações e vendas patrimoniais informativas não movimentam contas. Recebimentos confirmados entram uma única vez no caixa, separados das receitas comuns nos Relatórios 2.0.
- O preço e o custo original de uma venda ficam bloqueados. Correções exigem cancelamento controlado e novo registro; recebimentos ativos precisam de tratamento financeiro explícito antes do cancelamento da venda.
- Bens vendidos ou baixados ficam fora do patrimônio ativo, preservando avaliações e operações anteriores.
- Salvar uma previsão inalterada não cria reagendamento nem reabre notificações. Mudanças apenas no lembrete têm registro próprio.
- Comparações mensais usam os mesmos dias do mês anterior, com ajuste para meses curtos; meses completos comparam meses completos. O intervalo consecutivo continua disponível. As datas são tratadas sem deslocamentos de fuso.

## Segurança e limitações

Sessões usam tokens aleatórios armazenados com hash, validade de sete dias e cookies HttpOnly/SameSite Strict, com Secure em HTTPS. A API verifica origem, propriedade dos registros, validade da sessão, entradas e limites de tentativas. Logs de falha não imprimem credenciais ou corpos das requisições.

A revisão local dos arquivos candidatos ao commit e dos dois commits disponíveis não encontrou indícios de segredos nos padrões verificados. `npm audit` não apontou vulnerabilidades conhecidas nas dependências instaladas na consulta registrada. Essas verificações não substituem revisão humana, auditoria externa ou monitoramento futuro de avisos.

Limitações desta versão: recebimentos patrimoniais integrais; recorrência restrita a lembretes com confirmação manual; limitação de login por processo; ausência de importação/conciliação bancária; posição histórica dependente do saldo inicial cadastrado e sem versões históricas de vínculos com contas.

Antes de uma disponibilização pública, ainda é necessário homologar HTTPS/proxy/cookies, SMTP, backups/restauração, volume de dados, outros navegadores, dispositivos físicos e tecnologias assistivas. O Chrome automatizado e os testes de contraste realizados não equivalem a homologação de produção ou certificação completa de acessibilidade.

## Commit final seguro

As alterações das etapas anteriores e arquivos novos precisam ser revisados juntos. Nenhum commit ou envio remoto é feito automaticamente.

```powershell
git status --short
git diff --check
git diff

# Após revisar, inclua somente código, testes e documentação conhecidos.
git add -- .gitignore README.md VALIDACAO_FINAL.md backend/src backend/scripts backend/package.json backend/package-lock.json frontend/src frontend/scripts frontend/package.json frontend/package-lock.json shared

git diff --cached --stat
git diff --cached --name-only
git diff --cached
```

Confira que o índice não contém `.env` reais, chaves privadas, credenciais, exports de dados, dumps, logs, `node_modules` ou `dist`. Os arquivos `.env.example` devem conter apenas exemplos sem segredos. Não use `git add -f` para contornar o `.gitignore`.

Depois dessa revisão, você pode criar o commit local com `git commit -m "Finaliza versão de portfólio do Meu Norte"`. A publicação no GitHub fica sob sua decisão. Se qualquer segredo tiver sido publicado fora do histórico local examinado, revogue/rotacione o segredo no serviço correspondente; apenas removê-lo do arquivo atual não resolve a exposição.
