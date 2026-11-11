# Meu Norte — Direção Financeira

Aplicação web de gestão financeira pessoal desenvolvida como projeto de aprendizado e portfólio Full Stack.

## Visão geral e objetivo

O Meu Norte reúne receitas, despesas, contas, cartões, metas e patrimônio para ajudar pessoas a organizar suas finanças em um só lugar. O projeto procura tornar a consulta de saldos, o registro de movimentações e o acompanhamento de planos mais simples e compreensíveis.

A interface prioriza clareza, acessibilidade e experiência do usuário: navegação por áreas relacionadas, campos opcionais em informações adicionais e recursos avançados disponíveis quando necessários. O visual utiliza azul-marinho e verde-menta, com temas claro e escuro e adaptação a computador e celular.

O desenvolvimento principal está concluído. Os cenários validados e os limites de uso estão registrados em [VALIDACAO_FINAL.md](VALIDACAO_FINAL.md).

## Principais funcionalidades

- Login administrativo, sessão persistente, troca de senha e recuperação por e-mail quando SMTP está configurado.
- Contas com saldos, transferências, arquivamento e exclusão protegida.
- Receitas/despesas e histórico unificado com busca, filtros, referências, edição e cancelamento.
- Cartões com compras parceladas, faturas, pagamentos parciais, estornos, encargos e crédito.
- Orçamentos mensais e metas, com registros informativos ou transferências entre contas.
- Bens, avaliações, compra/venda/baixa e recebimentos patrimoniais integrais, com previsão e histórico.
- Lembretes recorrentes e notificações internas, com confirmação manual por ocorrência.
- Relatórios 2.0 com resumo financeiro, gráficos, comparação de períodos e distinção entre receitas/despesas, caixa e posição patrimonial.
- Interface responsiva, temas claro e escuro, formulários curtos e navegação por teclado.

Não há integração bancária automática, geração automática de receitas/despesas recorrentes ou um modo de demonstração embutido. Os dados fictícios pertencem somente aos testes isolados.

## Tecnologias utilizadas

| Área | Tecnologias |
| --- | --- |
| Frontend | JavaScript, React 19, React Router 7, Vite 7 e Tailwind CSS 4 |
| Gráficos e ícones | Recharts e Lucide React |
| Backend | Node.js, Express 5, Mongoose 9, bcryptjs, Nodemailer e dotenv |
| Banco de dados | MongoDB com replica set, local ou MongoDB Atlas |
| Testes | `node:test`, `mongodb-memory-server` e Chrome headless via Chrome DevTools Protocol |

## Estrutura do projeto

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

## Como executar localmente

### Requisitos

- Node.js **22.12+** e npm; as validações finais foram executadas com Node.js 24.
- MongoDB com **replica set e suporte a transações**: Atlas privado ou instalação local equivalente. Uma instância standalone não atende aos fluxos transacionais.
- Chrome para os testes de navegador. Defina `CHROME_PATH` se o executável não estiver no caminho esperado pelo script.
- As suítes isoladas baixam um binário MongoDB caso ele ainda não esteja em cache. Não precisam de acesso ao Atlas.

### Instalar dependências

Execute a partir da raiz do repositório. No PowerShell, use `npm.cmd` se a política de execução bloquear `npm.ps1`.

```powershell
npm --prefix backend ci
npm --prefix frontend ci

# Crie apenas se o arquivo ainda não existir. Nunca substitua um .env real.
if (!(Test-Path backend/.env)) {
  Copy-Item backend/.env.example backend/.env
}
```

### Executar

Após preencher as variáveis descritas na próxima seção, abra dois terminais na raiz:

```powershell
# Terminal 1
npm --prefix backend run dev

# Terminal 2
npm --prefix frontend run dev -- --strictPort
```

Abra [http://localhost:5173/entrar](http://localhost:5173/entrar). A API local escuta em `127.0.0.1:3001`. A origem aberta no navegador deve corresponder a `CLIENT_ORIGIN`; mudar entre `localhost`, `127.0.0.1` ou outra porta exige configuração consistente.

## Variáveis de ambiente

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

O frontend usa o proxy `/api` do Vite. `VITE_LEDGER_API_URL` pode definir a origem pública da API, quando necessário; o código acrescenta `/api` aos caminhos. O padrão é `/`, sem necessidade de configurar o frontend para a execução local. Nunca coloque senhas, tokens ou segredos em variáveis `VITE_*`: elas são destinadas ao código público do navegador. `frontend/.env.local` é local e ignorado pelo Git.

### Administrador inicial

1. Em uma instalação local nova, preencha nome, e-mail e uma senha inicial exclusiva nas variáveis `INITIAL_ADMIN_*`. Prefira uma senha forte com pelo menos 12 caracteres, respeitando o limite de 72 bytes.
2. Inicie a API e entre com esses dados. Em **Minha conta**, abra **Alterar senha** e troque a senha para liberar os módulos financeiros.
3. Remova as variáveis iniciais do seu ambiente após a troca. A criação é idempotente: reiniciar a API não redefine a senha de uma conta já existente.

Se houver um espaço legado, configure `INITIAL_ADMIN_LEGACY_OWNER` **antes da primeira criação** e somente com o identificador conhecido desse espaço. Sem essa opção, o administrador recebe um espaço independente. Não use essa configuração para tentar substituir um administrador existente.

Esta documentação não redefine credenciais existentes. A recuperação de senha requer SMTP configurado; os testes usam um simulador e não enviam mensagens externas.

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

Última validação registrada em **11/11/2026**: **48 testes de backend, 16 de frontend e 15 fluxos de ponta a ponta aprovados**, sem reprovações ou testes ignorados. A auditoria percorreu **96 telas, 48 estados representativos e 2.934 medições de texto/ícones**, em 320, 390, 900 e 1440 px. O build foi concluído. Evidências e limites estão em [VALIDACAO_FINAL.md](VALIDACAO_FINAL.md).

## Segurança e limitações conhecidas

### Integridade financeira

- Valores usam centavos inteiros; transferências próprias não são receitas ou despesas.
- Compras de cartão entram por competência da fatura. Pagamentos alteram o caixa sem repetir a despesa. Parcelas preservam os centavos; pagamentos duplicados são protegidos.
- Contas com saldo ou dependências não podem ser excluídas. Exclusões lógicas e cancelamentos preservam referências e histórico.
- Avaliações e vendas patrimoniais informativas não movimentam contas. Recebimentos confirmados entram uma única vez no caixa, separados das receitas comuns nos Relatórios 2.0.
- O preço e o custo original de uma venda ficam bloqueados. Correções exigem cancelamento controlado e novo registro; recebimentos ativos precisam de tratamento financeiro explícito antes do cancelamento da venda.
- Bens vendidos ou baixados ficam fora do patrimônio ativo, preservando avaliações e operações anteriores.
- Salvar uma previsão inalterada não cria reagendamento nem reabre notificações. Mudanças apenas no lembrete têm registro próprio.
- Comparações mensais usam os mesmos dias do mês anterior, com ajuste para meses curtos; meses completos comparam meses completos. O intervalo consecutivo continua disponível. As datas são tratadas sem deslocamentos de fuso.

### Autenticação e proteção dos dados

Sessões usam tokens aleatórios armazenados com hash, validade de sete dias e cookies HttpOnly/SameSite Strict, com Secure em HTTPS. A API verifica origem, propriedade dos registros, validade da sessão, entradas e limites de tentativas. Logs de falha não imprimem credenciais ou corpos das requisições.

Mantenha arquivos `.env`, senhas, tokens e conexões privadas fora do repositório. Os arquivos `.env.example` contêm apenas nomes de variáveis e configurações locais sem segredos. As verificações de segurança e dependências registradas na validação final refletem a data em que foram executadas; não substituem revisão humana, auditoria externa ou acompanhamento de novos avisos.

### Limitações conhecidas

Limitações desta versão: recebimentos patrimoniais integrais; recorrência restrita a lembretes com confirmação manual; limitação de login por processo; ausência de importação/conciliação bancária; posição histórica dependente do saldo inicial cadastrado e sem versões históricas de vínculos com contas.

Antes de uma disponibilização pública, ainda é necessário homologar HTTPS/proxy/cookies, SMTP, backups/restauração, volume de dados, outros navegadores, dispositivos físicos e tecnologias assistivas. O Chrome automatizado e os testes de contraste realizados não equivalem a homologação de produção ou certificação completa de acessibilidade.

### Cuidados antes de publicar o código

Revise as alterações e os arquivos novos antes de incluí-los em um commit. Estes comandos permitem conferir o conteúdo local e o que já está preparado no índice:

```powershell
git status --short
git diff --check
git diff
git diff --cached --stat
git diff --cached --name-only
git diff --cached
```

Inclua somente código, testes e documentação conhecidos. Não publique arquivos `.env` reais, chaves privadas, credenciais, dados pessoais, exports de dados, dumps, logs, `node_modules` ou `dist`. Não use `git add -f` para contornar o `.gitignore`. Se um segredo tiver sido exposto, revogue-o ou substitua-o no serviço correspondente; removê-lo do arquivo atual não elimina a exposição anterior.

## Sobre o desenvolvedor

Sou Gabriel Araujo, Desenvolvedor Full Stack em formação. Tenho foco no ecossistema JavaScript e interesse no desenvolvimento de aplicações web modernas, funcionais e intuitivas.

O Meu Norte faz parte do meu portfólio de projetos e representa a aplicação prática dos meus estudos em desenvolvimento frontend, backend, integração com banco de dados e organização de sistemas web.

**Contato:**

- GitHub: [0-GBL](https://github.com/0-GBL)
- LinkedIn: [Gabriel Araujo](https://www.linkedin.com/in/gabriel-araujo-5929a72ba/)
- E-mail profissional: [araujo.gabriel3289@gmail.com](mailto:araujo.gabriel3289@gmail.com)
