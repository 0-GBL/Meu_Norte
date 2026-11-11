# Meu Norte — encerramento da versão

## Revisão final de usabilidade — 11/11/2026

Esta revisão posterior à auditoria abaixo fez apenas ajustes de apresentação. O dashboard, os cálculos, as APIs, a autenticação e as permissões não foram alterados.

- Menu lateral com acesso direto às operações diárias e grupos recolhíveis **Planejar** (Orçamentos, Metas, Lembretes) e **Acompanhar** (Patrimônio, Relatórios). O grupo da página atual abre automaticamente; todas as páginas permanecem a um clique de grupo. No celular, expandir não fecha o menu; navegar fecha.
- Perfil discreto, com nome e acesso a **Minha conta**. E-mail permanece no perfil. Alteração de senha recolhida, exceto quando a troca inicial é obrigatória; os três campos e as validações foram preservados.
- Venda com valor, data e pergunta sobre recebimento na mesma tela, seguida da confirmação financeira. Voltar preserva os dados. Previsão opcional, conta obrigatória quando há recebimento e tentativa de salvar a previsão sem repetir a venda continuam disponíveis.
- Ações **Retirar bem** e **Usar um recebimento já registrado** com linguagem direta. Situações históricas e conceitos financeiros internos preservados.
- Relatórios com **Resumo do período**, indicador **Receitas menos despesas** e seção **Gráficos e detalhes**. Explicações mantêm a distinção entre mês da fatura, caixa, receitas comuns e patrimônio. Nenhum cálculo mudou.
- Os formulários que já oferecem **Informações adicionais** foram mantidos, sem ampliar o escopo.

### Arquivos desta revisão

- frontend/src/App.jsx
- frontend/src/navigation.js
- frontend/src/styles.css
- frontend/src/pages/ProfilePage.jsx
- frontend/src/pages/Reports.jsx
- frontend/src/pages/AssetsPage.jsx
- frontend/src/components/AssetForms.jsx
- frontend/src/components/AssetReceiptPanel.jsx
- frontend/scripts/check-reports.mjs
- frontend/scripts/audit-contrast.mjs
- VALIDACAO_FINAL.md

### Validação desta revisão

- Frontend: 16 testes aprovados; build de produção aprovado.
- Backend: 48 testes aprovados, sem falhas ou testes ignorados, em MongoDB temporário local.
- Integração: 15 fluxos reais de Chrome/API/MongoDB local aprovados, incluindo contas, receitas/despesas, transferências, cartões, faturas, orçamentos, metas, lembretes, sessão e relatórios.
- Interface: cadastro, avaliação, venda informativa e recebida, retirada, histórico, recuperação de falha sem duplicação e opções avançadas aprovados. Menu por teclado, perfil recolhível, relatórios e formulários verificados nos dois temas e larguras 320, 390, 900 e 1440 px; 96 telas, 48 estados e 2.934 medições de contraste aprovados.
- Os testes de interface foram adaptados aos novos rótulos, ao formulário único e ao tempo de abertura do menu móvel. Nenhum bug financeiro novo foi reproduzido.
- Nenhum dado real do Atlas foi acessado ou modificado; não houve migração, instalação de biblioteca, deploy ou push.

### Conferência manual no navegador

1. Abrir o menu em tela pequena, expandir Planejar/Acompanhar por toque ou teclado e acessar uma página. Conferir os atalhos diretos e o grupo aberto da página atual.
2. Em Patrimônio, adicionar um bem fictício em ambiente local de teste. Conferir informações adicionais, atualizar o valor e abrir Vender ou retirar. Informar a venda e recebimento na mesma tela, revisar, voltar e confirmar. Conferir histórico e opções avançadas.
3. Abrir Relatórios e conferir o resumo antes dos gráficos, os filtros adicionais e as explicações dos indicadores.
4. Em Minha conta, expandir Alterar senha sem salvar alterações. Alternar claro/escuro e conferir tudo em desktop e celular.

Não há pendência conhecida que impeça encerrar esta revisão. A validação automatizada de navegador usa Chrome com emulação de largura; não equivale a homologação em todos os aparelhos e navegadores. Os limites de produção registrados na auditoria abaixo continuam válidos.

---


Data do encerramento: **11/11/2026**. Ambiente executado: Windows, Node.js **24.12.0**, npm **11.6.2**, Chrome headless e MongoDB temporário local em replica set.

O escopo desta versão está congelado. Esta etapa auditou o sistema existente, repetiu as validações e preparou a documentação para portfólio. Não adicionou módulos, funções financeiras, integrações, dashboards, gráficos ou autenticação; preservou as interfaces aprovadas.

## 1. Status final fundamentado

| Destinação | Avaliação | Condições e limites |
| --- | --- | --- |
| Apresentação em portfólio | **Pronto para apresentação do código e dos cenários validados** | README e evidências concluídos; revisar o índice Git antes de publicar e incluir os arquivos novos das etapas anteriores |
| Execução local | **Pronto conforme os requisitos documentados** | Instalar dependências, configurar banco privado com replica set e administrador local; nenhum dado ou credencial real acompanha o repositório |
| Disponibilização pública em produção | **Não homologado** | Ainda exige validação de hospedagem, HTTPS/proxy/cookies, SMTP, carga, recuperação operacional e navegadores/dispositivos adicionais |

Não foi atribuída uma porcentagem de conclusão. Não há problema crítico conhecido que impeça a apresentação desta versão nos cenários testados, com as limitações descritas abaixo.

## 2. Funcionalidades existentes verificadas

- Login, sessão administrativa persistente, expiração/revogação, troca de senha e recuperação por simulador de e-mail.
- Contas, saldos iniciais, consulta filtrada, transferências, arquivamento, reativação e exclusão protegida.
- Receitas, despesas, histórico, edição, cancelamentos e referências de origem.
- Cartões, compras, parcelamento, faturas, pagamentos parciais, estornos, encargos e crédito.
- Orçamentos mensais e metas com registros informativos ou transferências vinculadas.
- Patrimônio, avaliações, vendas informativas ou vinculadas, baixas e histórico preservado.
- Recebimentos patrimoniais integrais, previsões, lembretes e correção controlada de operações.
- Lembretes recorrentes, notificações internas, ocorrências individuais e reagendamento sem alterações fictícias.
- Relatórios 2.0, comparação de períodos e separação entre competência, caixa e posição patrimonial.

## 3. Problemas encontrados e correções desta finalização

Nenhum novo bug crítico de execução, autorização ou integridade financeira foi reproduzido pela auditoria e pelas suítes finais. Por isso, **a lógica da aplicação não foi alterada nesta etapa**.

Foram corrigidas lacunas de preparação do repositório:

1. O README estava centrado nas etapas de desenvolvimento e repetia informações. Foi organizado para apresentar objetivo, funcionalidades, tecnologias, estrutura, requisitos, configuração sem segredos, administrador inicial, execução, testes e limites.
2. O relatório precisava distinguir encerramento da versão, execução local e produção. Este registro final foi acrescentado; o relatório de refinamento anterior permanece abaixo, como histórico documental.
3. O `.gitignore` já protegia `.env`, dependências e build, mas não explicitava formatos comuns de chaves, credenciais e exports. Foram acrescentadas proteções para esses arquivos, caches e dumps locais.

Arquivos modificados **somente nesta etapa**: `.gitignore`, `README.md` e `VALIDACAO_FINAL.md`. As alterações de código e arquivos novos das etapas anteriores foram preservados e continuam pendentes do commit a ser decidido pelo usuário.

Não foi necessário apagar arquivos. `node_modules` e `dist` são gerados e permanecem ignorados; testes, documentos e históricos úteis foram mantidos. As dependências instaladas não apresentaram problemas em `npm ls --depth=0`; os intervalos declarados nos dois manifests são compatíveis com seus lockfiles. Nenhum pacote foi instalado, atualizado ou substituído nesta finalização.

## 4. Resultados da execução final

| Comando/verificação | Resultado final | Falhas/ignorados |
| --- | --- | --- |
| `npm --prefix backend run test:isolated` | **48 testes aprovados** | 0 / 0 |
| `npm --prefix frontend test` | **16 testes aprovados** | 0 / 0 |
| `npm --prefix frontend run test:app-browser` | **15 fluxos reais navegador → API → MongoDB local aprovados** | 0 / 0 |
| `npm --prefix frontend run test:reports-browser` | Fluxos patrimoniais/relatórios aprovados; **96 telas, 48 estados representativos e 2.826 medições de texto/ícones** | 0 / 0 |
| `npm --prefix frontend run build` | Build de produção concluído | Sem erro |
| `npm audit --omit=dev --json` nos dois pacotes | **0 vulnerabilidades conhecidas** nas dependências de produção | Consulta concluída |
| `npm audit --json` nos dois pacotes | **0 vulnerabilidades conhecidas**, incluindo ferramentas de desenvolvimento/teste | Consulta concluída |
| Proteções do `.gitignore` | **15 verificações aprovadas** para caminhos sensíveis, gerados e exemplos permitidos | 0 falhas |
| `git diff --check` | Sem erro de whitespace | Avisos locais de conversão LF/CRLF não são falhas dos testes |

Os testes acima foram executados novamente nesta finalização; os números não são apenas resultados reaproveitados da etapa anterior. A validação visual automatizada percorreu os temas claro/escuro e as larguras **320, 390, 900 e 1440 px**. Foram verificados erros da API, estados vazios, foco, Escape, retorno do foco ao controle de origem, controles desabilitados, seleção com hover e formulários/modais.

As medições de contraste e a navegação automatizada fornecem evidência de acessibilidade básica nos cenários examinados, sem equivaler a certificação WCAG completa ou teste com todas as tecnologias assistivas.

## 5. Segurança e integridade

- Rotas privadas continuam protegidas pela sessão, pela propriedade dos registros e pela validação de origem em gravações. Os testes cobriram sessão inválida/expirada/revogada, campos inesperados, isolamento entre espaços e limite de login.
- Tokens de sessão são aleatórios e armazenados com hash. Cookies usam HttpOnly/SameSite Strict e Secure em HTTPS. Credenciais existentes não foram redefinidas.
- Transações, revisão do espaço e chaves de idempotência permaneceram intactas. Foram testados concorrência, reenvio, recebimentos únicos e pagamentos de cartão sem duplicação de despesa.
- Exclusões lógicas e cancelamentos mantêm histórico e referências. Avaliações, vendas informativas e lembretes não criam caixa automaticamente; bens encerrados ficam fora dos totais ativos.
- Os logs de falha examinados imprimem categorias de erro, sem despejar credenciais, tokens ou corpos das requisições.
- A varredura local abrangeu **71 arquivos candidatos ao versionamento** e os **dois commits disponíveis** nas referências locais. Não foram encontrados indícios nos padrões examinados de URI autenticada de banco remoto, chave privada ou tokens de provedores; não há `.env` real rastreado nem encontrado nesse histórico local.
- A verificação não consultou o conteúdo remoto do GitHub nem afirma cobertura sobre históricos/publicações externos ao clone disponível. Não foi identificado um segredo publicado que exigisse rotação; se uma exposição for encontrada fora desse escopo, a credencial deve ser revogada/rotacionada pelo responsável. Nenhuma credencial foi alterada automaticamente.
- `.env` reais continuam intocados e ignorados. Os `.env.example` permanecem permitidos, com valores vazios ou configurações sem segredos. As novas regras ignoram chaves, diretórios de credenciais, backups, dumps e exports comuns; revisão humana continua necessária antes de cada commit.
- Todos os testes de banco usaram servidores locais temporários, com dados exclusivos. Não houve conexão destrutiva ou modificação de registros reais do MongoDB Atlas.

Os resultados do npm refletem os avisos conhecidos na consulta desta data, não uma garantia permanente de ausência de vulnerabilidades.

## 6. Limitações e pendências não críticas

- A automação de navegador foi executada no Chrome em Windows. Firefox, Safari, Edge, dispositivos físicos e leitores de tela continuam dependendo de validação adicional.
- Não foi feito teste de carga ou análise com uma base real volumosa. O estado financeiro é consolidado por snapshots; desempenho em escala deve ser medido antes de uma abertura pública.
- HTTPS, proxy, cookies na hospedagem real, envio SMTP e procedimento de backup/restauração não foram homologados nesta execução. A limitação de tentativas é mantida por processo.
- Recorrências financeiras automáticas, importação/conciliação bancária e recebimentos patrimoniais parciais não pertencem a esta versão.
- A posição histórica depende do saldo inicial cadastrado; não há versões históricas de vínculos entre bens e contas. A previsão posterior à venda usa as APIs existentes e possui recuperação própria sem repetir a venda caso falhe.
- O repositório não recebeu configuração de CI, licença ou publicação automática nesta tarefa. Eventuais decisões sobre licença e descrição pública devem ser feitas pelo proprietário ao publicar.

Essas pendências delimitam a prontidão de produção; não abrem uma nova etapa de desenvolvimento ou impedem o uso local/documentado e a apresentação em portfólio.

## 7. Commit e apresentação em portfólio

O README contém a sequência segura para revisar diferenças, adicionar código/testes/documentação conhecidos e inspecionar o índice antes do commit. É importante incluir os arquivos novos de `src`, `scripts` e `shared` das etapas anteriores; um commit apenas dos arquivos já rastreados deixaria a aplicação incompleta.

Antes de confirmar o commit, revisar `git status --short`, `git diff --cached --name-only` e `git diff --cached`. O índice não deve conter configurações privadas, credenciais, exports, logs, dependências ou build. Não usar `git add -f` para contornar as proteções. A publicação remota fica sob decisão do usuário.

**Avaliação de encerramento:** versão estável nos cenários executados, com módulos existentes preservados, documentação adequada e nenhuma falha crítica conhecida que impeça sua apresentação como projeto de portfólio. As condições de execução local estão documentadas; produção pública permanece não homologada.

Nenhuma funcionalidade nova, alteração estética, refatoração de código, mudança de credenciais, edição de `.env` real, migração, alteração de histórico Git, commit, push ou deploy foi realizada nesta finalização.

## Registro do refinamento anterior

O texto abaixo preserva a auditoria e as implementações da etapa precedente. Ele não amplia o escopo da versão encerrada.

### Relatório da etapa de refinamento

Data: 11/11/2026. Avaliação baseada em comportamento, execução de testes e pendências verificáveis; não foi atribuída uma porcentagem de conclusão.

## A. Auditoria e implementações

A auditoria inicial examinou frontend React/Vite, contexto de autenticação e requisições, API Express, modelos Mongoose, serviços financeiros, documentação e suítes existentes antes das alterações. O backend já concentrava autorização por espaço, validações e transações. A principal lacuna observada era a divulgação simultânea de cadastro, consulta e ações avançadas nas páginas.

Prioridades executadas: preservar regras financeiras e autenticação; simplificar ações comuns; conservar opções avançadas e vínculos; reutilizar um painel acessível; validar com banco local; documentar lacunas sem criar novos módulos.

| Área | Resultado desta etapa | Funcionalidades preservadas |
| --- | --- | --- |
| Contas | Saldo total, cartões de nome/saldo, Adicionar conta e Gerenciar | Consulta filtrada de movimentações, edição, transferência, arquivamento, reativação, exclusão protegida e saldo inicial |
| Movimentações | Três ações principais, cadastro curto, busca e filtros recolhidos | Categoria, classificação, alteração de tipo, edição, cancelamento, histórico de cartões/metas/bens e links de origem |
| Cartões | Limite e fatura a pagar com vencimento, ações comuns diretas | Parcelamento, faturas detalhadas, pagamentos parciais, estornos, encargos, crédito, arquivamento, exclusão e histórico completo |
| Orçamentos | Limites e gasto do mês primeiro; cadastro e histórico sob demanda | Orçamento geral e por categoria, meses anteriores, alertas, edição e exclusão sem apagar despesas |
| Metas | Valor restante e progresso primeiro; cadastro/gerenciamento em painel | Aportes/retiradas, registro informativo ou transferência, prazo, aporte planejado, status e histórico de metas excluídas |
| Lembretes | Atrasados e próximos separados; encerrados e configurações recolhidos | Recorrência, vínculos, notificações, leitura, conclusão/dispensa por ocorrência, adiamento, reativação e histórico |
| Relatórios 2.0 | Período/comparação separados dos filtros adicionais | Gráficos existentes, competência/caixa, comparação, saldos, patrimônio, avaliações, vendas e recebimentos |
| Patrimônio | Experiência simplificada anterior preservada | Venda/recebimento, custo/preço bloqueados, baixa, avaliações e histórico |
| Dashboard | Direção visual, navegação, resumo e atalhos preservados | Revisões já representadas por lembretes ativos não aparecem duplicadas no resumo |

Correções adicionais: contas excluídas não são oferecidas para pagamentos de cartão ou transferências de metas; histórico principal identifica transferências e pagamentos sem expor colunas técnicas; utilitário de texto acessível foi movido para os estilos globais; estilos do antigo layout de cartões sem uso foram removidos. Nenhuma dependência foi adicionada.

`ActionPanel` compartilha o comportamento dos novos modais: nome acessível, foco por teclado, Escape, retorno ao botão de origem, feedback da API e bloqueio do fechamento enquanto uma gravação está em andamento. O painel patrimonial estável não foi refeito.

### Arquivos criados nesta etapa

- `frontend/src/components/ActionPanel.jsx`
- `frontend/src/components/Progressive.css`
- `frontend/src/reminderFormat.js`
- `frontend/src/reminderFormat.test.js`
- `frontend/scripts/check-app.mjs`
- `backend/src/security.test.js`
- `VALIDACAO_FINAL.md`

### Arquivos modificados nesta etapa

- `frontend/src/pages/LedgerPages.jsx`
- `frontend/src/pages/CardsPage.jsx`
- `frontend/src/pages/PlanningPages.jsx`
- `frontend/src/pages/RecordsPages.jsx`
- `frontend/src/pages/Reports.jsx`
- `frontend/src/pages/Reports.css`
- `frontend/src/pages/AssetsPage.css` — apenas remoção do utilitário global realocado
- `frontend/src/styles.css`
- `frontend/scripts/audit-contrast.mjs`
- `frontend/scripts/check-reports.mjs`
- `frontend/package.json` — comando de validação de ponta a ponta
- `backend/src/atlas.test.js` — rejeição explícita de URI remota
- `README.md`

O diretório já continha alterações das etapas anteriores. Elas foram preservadas. Não houve commit, publicação ou deploy.

## B. Validação executada

| Execução final | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| Backend: `npm --prefix backend run test:isolated` | 48 | 0 | 0 |
| Frontend: `npm --prefix frontend test` | 16 | 0 | 0 |
| Navegador + API real + MongoDB local: `npm --prefix frontend run test:app-browser` | 15 fluxos | 0 | 0 |
| Navegador com fixtures: `npm --prefix frontend run test:reports-browser` | Fluxos patrimoniais/relatórios e auditoria visual | 0 | 0 |
| Produção: `npm --prefix frontend run build` | Build concluído | 0 | — |

As duas suítes de navegador foram executadas no Chrome headless. Larguras: 320, 390, 900 e 1440 px. A auditoria percorreu 12 páginas nas quatro larguras e em ambos os temas: **96 telas**, **48 combinações de estados** de controles representativos e **2.826 medições** de texto/ícones. Também foram verificados seleção com hover, foco, desabilitado, carregamento, troca de tema, formulários expandidos e calendário. As medições usam os alvos de contraste já documentados; não constituem uma certificação completa WCAG.

As capturas com dados fictícios de Contas, Movimentações, Cartões, Orçamentos, Metas e Lembretes foram inspecionadas em desktop e celular. Não foi observada rolagem horizontal da página nas resoluções verificadas; tabelas técnicas permanecem em regiões próprias de rolagem quando necessário.

### Fluxos reais exercitados pelo navegador

1. Login pelo formulário e sessão mantida entre páginas.
2. Cadastro de duas contas e seus saldos iniciais.
3. Receita/despesa rápidas com categoria Geral e classificação válida.
4. Transferência iniciada em Contas sem mudar o consolidado.
5. Movimentações filtradas pelo link de uma conta e remoção do filtro.
6. Edição de despesa e cancelamento de receita com histórico preservado.
7. Arquivamento/reativação e indisponibilidade da conta arquivada para novos registros.
8. Cartão e compra com parcelamento/categoria padrão.
9. Pagamento excessivo rejeitado pela API, seguido de pagamento parcial válido.
10. Estorno e encargo pelas opções avançadas.
11. Orçamento sem duplicar o pagamento da fatura nos gastos.
12. Meta com aporte informativo e transferência vinculada, sem alterar indevidamente o caixa.
13. Lembrete mensal com avanço da ocorrência, sem lançamento financeiro.
14. Relatório conciliando receitas canceladas, despesas, transferências, cartão e saldo.
15. Painel nas quatro larguras, ciclo de foco, Escape e retorno ao controle de origem.

Na conciliação real do cenário isolado: saldo inicial de R$ 1.000,00, receita depois cancelada, despesa editada para R$ 40,00, pagamento parcial de fatura de R$ 30,00 e transferências internas produziram saldo final de **R$ 930,00**. As despesas por competência foram **R$ 145,00**, contando compra, estorno e encargo sem repetir o pagamento da fatura; a variação de caixa foi **−R$ 70,00**.

Os testes de segurança verificaram rotas privadas, cookie persistente protegido, expiração, revogação da sessão, origem indevida, campos inesperados, isolamento entre proprietários e HTTP 429 por tentativas repetidas de login. As suítes financeiras anteriores continuam cobrindo concorrência, idempotência, referências, competência de cartões, avaliações, vendas informativas, recebimentos, baixas, anos bissextos e reagendamento sem mudança.

Não foi usado MongoDB Atlas nos testes. Os runners criam seus próprios replica sets locais, bancos exclusivos e dados fictícios, sem carregar `.env`; as suítes de integração rejeitam URIs remotas. Nenhum registro real foi lido para esses cenários ou alterado.

## C. Matriz objetiva de conclusão desta etapa

| Critério solicitado | Situação | Evidência |
| --- | --- | --- |
| Páginas principais mais simples | Atendido | Consulta primeiro; cadastro e opções avançadas sob demanda |
| Fluxos financeiros essenciais funcionando | Atendido nos cenários testados | 48 testes backend e 15 fluxos reais pelo navegador |
| Ações avançadas acessíveis | Atendido | Vínculos, filtros, estorno, encargo, arquivo/exclusão, recorrência e históricos preservados |
| Testes existentes passando | Atendido | Execuções finais sem testes reprovados ou ignorados |
| Build de produção | Atendido | Vite concluído |
| Autenticação funcional | Atendido | Login real, sessão e testes de segurança |
| Regressões críticas conhecidas | Nenhuma identificada nos cenários verificados | Conciliação, erros de API e proteções testadas |
| Responsividade | Atendido nas resoluções testadas | Quatro larguras, dois temas, painéis e tabelas |
| Contraste dos controles | Atendido nos controles/cenários medidos | 2.826 medições e estados representativos |
| Documentação atualizada | Atendido | README, comandos locais, limites e este relatório |

A etapa de refinamento está concluída sob esses critérios. A prontidão para produção ainda depende das validações operacionais abaixo; não há fundamento para converter o resultado em uma porcentagem de conclusão do produto.

## D. Pendências e próximos passos

### Necessário antes de liberar produção

- Homologar HTTPS, origem, proxy e cookies Secure na configuração real de hospedagem. O limite de login é por processo; várias instâncias precisam de estratégia operacional compatível.
- Validar entrega e expiração de links de recuperação com SMTP de homologação. Nenhuma mensagem externa foi enviada por esta etapa.
- Testar Safari, Firefox e Edge, dispositivos físicos e tecnologias assistivas. Não foi executada auditoria manual completa de acessibilidade.
- Validar uma base representativa em volume e os tempos de consulta/snapshot. As suítes usam conjuntos pequenos; não foi feito teste de carga.
- Confirmar o procedimento de backup/restauração e permissões de menor privilégio do Atlas em ambiente apropriado, sem ensaio destrutivo na base real.

### Limitações existentes preservadas

- Recorrência pertence aos lembretes; não existe geração automática de receitas/despesas recorrentes. Concluir uma ocorrência não confirma dinheiro.
- Recebimentos patrimoniais são integrais. Não foram introduzidos parcelamentos de vendas ou integração bancária.
- A posição histórica depende do saldo inicial cadastrado; o sistema não armazena sua data efetiva nem versões históricas de vínculos de bens com contas.
- A atualização de previsão após uma venda usa as APIs existentes. Se falhar, a interface repete somente a previsão, preservando a venda já salva.

### Opcionais para versões futuras

Geração assistida de lançamentos recorrentes, importação/conciliação bancária, recebimentos parciais, exportações adicionais, testes de carga mais extensos e novas automatizações devem ter escopo e regras próprios. Não são necessários para concluir este refinamento e não foram implementados para evitar complexidade e regressões.

Nenhuma migração, alteração de credenciais, redefinição do administrador, modificação de `.env`, publicação no GitHub ou deploy foi executado.
