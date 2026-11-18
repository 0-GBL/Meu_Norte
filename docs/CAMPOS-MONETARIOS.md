# Padronização dos campos monetários

Implementação local em 18/11/2026, sem mudanças em backend, autenticação, credenciais, limites da demonstração ou dados pessoais do Atlas. Sem commit, push ou deploy.

## Implementação e arquivos

O `MoneyField` existente foi reaproveitado para manter rótulos, erros, regras de obrigatoriedade, zero e sinal negativo. Sua entrada passou a usar o componente compartilhado `CurrencyInput`.

| Arquivo | Alteração |
| --- | --- |
| `frontend/src/components/CurrencyInput.jsx` | Entrada incremental, seleção, exclusão, colagem, teclado físico/móvel, reset de formulário e tratamento de entrada alternativa |
| `frontend/src/currencyInput.js` | Edição dos dígitos em centavos inteiros, posições do cursor, sinal, colagem e limite compartilhado do backend |
| `frontend/src/components/FinancialFields.jsx` | Integração com MoneyField, preservando validações e acessibilidade; instrução para leitores de tela |
| `frontend/src/currencyInput.test.js` | Testes da sequência incremental, valores, exclusão, seleção, sinal, colagem, edição e limites |
| `frontend/src/ledgerFormat.js` | Remoção da máscara antiga `moneyDraft`; preservação de `formatMoney` e `toCents` |
| `frontend/src/ledgerFormat.test.js` | Substituição da cobertura da máscara antiga pelos testes da nova; demais testes preservados |
| `frontend/scripts/check-app.mjs` | Fixtures monetárias fornecidas em BRL explícito, preservando os valores esperados dos testes integrados |
| `frontend/scripts/check-reports.mjs` | Mesmo ajuste nas fixtures de patrimônio e relatórios |

Também foram adicionados este relatório e uma [captura real do campo no layout móvel](images/currency-input/campo-mobile.jpg).

## Campos padronizados

Todos os campos monetários editáveis encontrados já utilizavam MoneyField e recebem o comportamento compartilhado:

- Contas: saldo inicial, incluindo valores negativos permitidos.
- Movimentações: receitas, despesas, transferências e ajustes de entrada/retirada pelos fluxos existentes.
- Cartões: limite, compras, pagamentos de faturas, estornos e encargos.
- Orçamentos: limites mensais.
- Metas: valor desejado, aporte mensal, aportes e retiradas.
- Patrimônio: aquisição, estimativa, avaliações, compra, venda e correção de venda/recebimento.
- Lembretes: valor de referência opcional.

Valores bloqueados em recebimentos já são apresentados em BRL e continuam somente leitura. Datas, porcentagens, antecedência, quantidades e parcelas não receberam máscara monetária.

## Comportamento e integridade

Digitar `150000` produz **R$ 1.500,00**, atualizando a cada tecla. Backspace remove um dígito; Delete e seleção parcial operam sobre dígitos, preservando separadores. Selecionar todo o campo permite substituir o valor, inclusive seu sinal. Caracteres inválidos são recusados. O sinal de menos só é aceito onde a regra existente permite.

Colar substitui o valor integral e interpreta a quantia copiada como reais: `1500`, `1.500,00` e `R$ 1.500,00` produzem a mesma quantia. Formatos inválidos, valores negativos proibidos e quantias acima do limite mantêm a última entrada válida.

O limite continua **99.999.999.999 centavos (R$ 999.999.999,99)**, importado das regras compartilhadas. A edição opera sobre dígitos inteiros, sem arredondar a entrada. Valores existentes continuam carregados pelos contratos atuais dos formulários.

Campos vazios continuam vazios no formulário, com placeholder **R$ 0,00**. Digitar zero produz um zero explícito; apagar esse zero retorna ao vazio. Assim, campos opcionais podem continuar enviando `null` ou usar o valor padrão conforme suas regras originais. Campos que exigem valor positivo continuam rejeitando zero.

`formatMoney` e `toCents` foram reutilizados. Os formulários continuam convertendo a apresentação para **centavos inteiros antes da requisição**, sem alteração no contrato da API ou nos cálculos financeiros.

## Limpeza

Foram removidos `moneyDraft`, os manipuladores antigos que retiravam o formato no foco e formatavam apenas ao sair, e seu controle redundante de rascunho dentro de MoneyField. A cobertura antiga foi substituída por testes equivalentes e ampliados para a entrada incremental. Nenhuma dependência foi adicionada ou removida.

## Testes executados

| Validação | Resultado |
| --- | --- |
| `npm --prefix frontend test` | **21 aprovados, zero falhas** |
| `npm --prefix backend run test:isolated` | **73 aprovados, zero falhas e zero ignorados**, MongoDB local descartável |
| `npm --prefix frontend run test:app-browser` | **15 fluxos reais de navegador/API/MongoDB local aprovados** |
| `npm --prefix frontend run test:reports-browser` | Patrimônio, relatórios, erros, confirmação, teclado e responsividade aprovados |
| Contraste do runner de relatórios | **96 telas, 48 estados e 2934 medições aprovadas**, claro e escuro |
| `npm --prefix frontend run build` | Build de produção aprovado |
| Sintaxe dos scripts e `git diff --check` | Sem erros |

Os testes integrados administrativos verificaram os valores exatos armazenados e calculados em contas, receitas/despesas, transferências, cartões, pagamentos, estornos, encargos, orçamentos e metas. O teste de backend preservou as regras e o isolamento da demonstração. Nenhuma conta administrativa pessoal foi usada para escritas de teste.

## Navegador real, sem mock no fluxo demo

A API local e o Vite foram executados; o login público existente foi utilizado. Foram conferidos:

- A sequência **R$ 0,01 → R$ 0,15 → R$ 1,50 → R$ 15,00 → R$ 150,00 → R$ 1.500,00**.
- Todos os valores solicitados: zero, 0,01; 0,50; 1,00; 10,50; 150,00; 1.500,00 e 100.000,99, além do máximo permitido.
- Digitação contínua, Backspace, seleção/substituição, colagem de BRL, rejeição de letras e rejeição do dígito que excederia o máximo.
- Substituição do saldo por **-R$ 12,50** em um campo que aceita negativos; tentativa de digitar/colar negativo recusada no campo de receita.
- Conta criada com **R$ 0,01**; receita criada com **R$ 0,50** e editada para **R$ 1,00**, carregando corretamente o valor anterior.
- Após navegar novamente, conta com saldo **R$ 1,01**, saldo total **R$ 11.261,01** e relatório de receitas **R$ 5.201,00**, coerentes com os dados iniciais da demo.
- Campo opcional vazio, zero explícito e retorno ao vazio após apagar; valor mantido ao sair e voltar pelo teclado.
- `inputmode="numeric"`, rótulos e descrição acessível; layout móvel de 390 px sem overflow no formulário e aparência nos temas claro e escuro. Os runners existentes também cobriram layouts de 320 a 1440 px.

A validação móvel usou viewport de navegador; não foi realizado ensaio em aparelho físico. O formulário foi fechado, a sessão demo encerrada, o viewport restaurado e a aba de teste fechada. Os processos iniciados para a validação foram encerrados.
