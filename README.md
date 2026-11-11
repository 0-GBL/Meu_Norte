# Meu Norte

Sua vida financeira, na direção certa.

O Meu Norte reúne contas, movimentações, cartões, orçamentos, metas, lembretes, patrimônio e relatórios. O acesso usa sessão autenticada e MongoDB Atlas.

## Inicialização local

Use Node.js 20.19+ ou 22.12+ e npm. A partir da raiz, instale as dependências.

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Se `backend/.env` ainda não existir, use `backend/.env.example` como modelo. Em um arquivo existente, adicione apenas as variáveis necessárias e preserve `MONGODB_URI` e as demais configurações. A API requer um banco Atlas com suporte a transações. O frontend usa o proxy local do Vite por padrão. `CLIENT_ORIGIN` deve corresponder à origem aberta no navegador.

Adicione ao `backend/.env` local as variáveis abaixo. Substitua o marcador pela senha inicial informada para o ambiente local.

```dotenv
INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=admin@meunorte.com
INITIAL_ADMIN_PASSWORD=<senha inicial local>
```

Se você usava a antiga chave local e quer que o administrador abra esse mesmo espaço, confirme o valor antigo de `LEDGER_OWNER` e defina `INITIAL_ADMIN_LEGACY_OWNER` com esse identificador **antes da primeira inicialização**. A configuração padrão antiga era `local`. A API verifica que o espaço existe e associa o login a ele sem alterar o proprietário dos documentos. Sem essa opção, cria um espaço independente. Contas previamente cadastradas continuam acessando seus próprios registros com o login existente.

Inicie a API e o frontend em terminais separados.

```powershell
npm.cmd --prefix backend run dev
npm.cmd --prefix frontend run dev -- --strictPort
```

Abra http://localhost:5173/entrar. Entre com o e-mail e a senha inicial configurados. Em **Meu Perfil**, escolha uma nova senha de pelo menos 12 caracteres e até 72 bytes para liberar o espaço financeiro. A configuração inicial é idempotente e reiniciar a API preserva a senha atual. Depois da troca, remova as variáveis `INITIAL_ADMIN_*` do ambiente local. A sessão permanece ao atualizar a página. **Sair** encerra a sessão atual.

Em produção, configure `NODE_ENV=production`, uma origem HTTPS em `CLIENT_ORIGIN` e o proxy de `/api` para o backend. As demais rotas usam o fallback para `index.html`. A inicialização local por variáveis fica indisponível em produção. O administrador precisa ter trocado a senha inicial antes de entrar nesse ambiente. A sessão usa HttpOnly, SameSite Strict e Secure em HTTPS. A limitação de tentativas é mantida por processo, IP e conta.

A recuperação de contas existentes pode usar `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` e, quando exigidos, `SMTP_USER` e `SMTP_PASS`. O envio usa TLS e os links expiram após 30 minutos. A troca da senha inicial é feita no perfil.

## Regras financeiras

Os campos de valor aceitam digitação ou colagem em reais e exibem a formatação brasileira ao sair do campo. A validação usa centavos inteiros e o limite de R$ 999.999.999,99 por valor. Campos de data completa aceitam DD/MM/AAAA e oferecem um calendário com navegação por mês, ano e teclado. A interface aceita novas datas de 1900 a 2199 e permite manter datas anteriores já salvas. Os dias de fechamento e vencimento dos cartões podem ser digitados ou selecionados de 1 a 31. As próximas datas usam o mesmo ciclo das faturas e incluem o vencimento de um ciclo já fechado quando ele ainda está por vir.

- Todos os valores são registrados em centavos inteiros. O saldo das contas considera o saldo inicial e as movimentações registradas, inclusive contas arquivadas. Transferências alteram apenas a distribuição dos saldos.
- As compras entram no ciclo de fechamento. Compras no dia do fechamento ficam no mesmo ciclo. Dias maiores que o mês usam seu último dia. O vencimento é no mesmo mês se cair após o fechamento e no mês seguinte nos demais casos. Fechamento e vencimento ficam fixos após o primeiro lançamento.
- Parcelas somam o valor original. Centavos que sobrarem são distribuídos nas primeiras parcelas. Pagamentos integrais ou parciais baixam o caixa e a fatura na mesma transação. Orçamentos e relatórios contabilizam parcelas, encargos e estornos no ciclo da fatura. Estornos podem gerar crédito para ciclos seguintes e são limitados ao valor da compra.
- Os orçamentos mensais têm alerta a partir de 80% do limite. O orçamento geral agrega todas as categorias. A previsão das metas usa o valor mensal planejado.
- Excluir um cartão exige faturas liquidadas e crédito zerado. As faturas e os lançamentos continuam disponíveis para consulta. Pagamentos com a mesma fatura, conta, data e valor são tratados como duplicados, mesmo com outra chave de envio.
- Editar ou excluir um limite altera apenas o planejamento. As despesas continuam no histórico. Uma meta tem descrição e prazo opcionais e aparece como concluída ao atingir o alvo.
- Em metas, um aporte ou retirada informativo afeta somente o progresso. Um registro com transferência exige duas contas ativas, altera os saldos individuais e mantém o consolidado. Retiradas respeitam a reserva registrada para aquela conta ou o total informativo, conforme o tipo. Excluir a meta conserva os lançamentos e o histórico, acessível na página de metas.
- Lembretes exigem confirmação manual. A confirmação avança a recorrência sem lançar receita ou despesa. O adiamento preserva o dia de referência da recorrência.
- As avaliações patrimoniais são manuais. O total patrimonial mostra bens ativos avaliados, exclui obrigações e evita somar bens representados em contas. Saldos e faturas são apresentados separadamente. O histórico de saldos usa os saldos iniciais informados como ponto de partida.
- Reenvios com a mesma chave de envio são tratados na mesma transação dos registros. As rotas financeiras determinam o espaço a partir da sessão ou da chave de desenvolvimento.

## Patrimônio, lembretes e histórico

- Avaliações não alteram o caixa. Compra ou venda informativa registra somente o fato patrimonial. No modo vinculado, reaproveite um lançamento de tipo, data e valor compatíveis ou crie um lançamento na conta na mesma transação. O resultado realizado usa o valor recebido menos o custo de aquisição registrado na data da venda. Se o custo for desconhecido, o resultado fica em aberto.
- Excluir conta exige saldo zero, ausência de lançamentos futuros e encerramento ou desvinculação de lembretes e bens ativos. Lançamentos vinculados ou associados a contas excluídas ficam protegidos. Movimentações comuns podem ser corrigidas com registro da versão anterior ou canceladas sem apagar a referência histórica.
- Lembretes mensais preservam o dia original e usam o último dia válido em meses curtos. Lembretes anuais de 29 de fevereiro usam 28 de fevereiro nos anos comuns e voltam a 29 nos bissextos. Os horários e avisos internos seguem o fuso de São Paulo. Lembretes de cartão derivam o calendário das faturas e a dispensa avança apenas a ocorrência selecionada.
- Em **Relatórios**, competência e caixa são exibidos separadamente. Parcelas e estornos entram no mês da fatura; pagamentos alteram o caixa, sem repetir a despesa. Transferências aparecem na variação de caixa de uma conta individual, sem virar receita ou despesa. O período anterior tem a mesma duração em dias; intervalos parciais podem compartilhar um mês de fatura.
- O **Resumo Patrimonial** usa o último dia do período, limitado a hoje, e consolida todas as contas. Soma o saldo assinado e as últimas avaliações de bens ativos, depois desconta dívidas avaliadas e o saldo pendente dos cartões, incluindo parcelas de compras já registradas. Bens e dívidas vinculados a contas não são somados outra vez. Avaliações faltantes aparecem como pendências; o custo de aquisição serve apenas de referência no gráfico.
- A evolução das avaliações mostra os registros nas datas efetivas, por bem. A distribuição patrimonial aplica apenas o filtro de categoria patrimonial e exclui bens vendidos ou baixados na data de referência. O histórico usa os saldos iniciais informados: o sistema não registra sua data efetiva nem versões históricas dos vínculos com contas.

## Verificar

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
```

Os testes de integração precisam de `MONGODB_TEST_URI` no ambiente do terminal. Use um replica set de teste com permissão para criar e remover um banco. A suíte cria um banco com nome aleatório, usa registros fictícios e remove apenas esse banco ao terminar. Ela testa concorrência, reenvios, isolamento, persistência após reconexão e recuperação por meio de um simulador de e-mail. Para validar entrega real, configure SMTP em um ambiente de teste.

O build gera `frontend/dist`.

Depois do build, execute `npm.cmd --prefix frontend run test:reports-browser` para verificar os relatórios no Chrome em quatro larguras, incluindo filtros, falha da API e estados vazios. O teste usa um servidor temporário com dados isolados. Se o Chrome estiver em outro caminho, configure `CHROME_PATH` no terminal.
