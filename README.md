# Meu Norte

Sua vida financeira, na direção certa.

O Meu Norte reúne contas, movimentações, cartões, orçamentos, metas, lembretes, patrimônio e relatórios. A demonstração roda com dados fictícios. O modo conectado registra dados manuais em um espaço por usuário.

## Rodar a demonstração

Use Node.js 20.19+ ou 22.12+ e npm. No PowerShell, a partir da raiz do projeto, execute:

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run dev
```

Abra o endereço informado pelo Vite. A visão geral abre na raiz e a apresentação do produto em `/inicio`. A demonstração funciona sem configurar a API.

## Ativar contas de usuário e persistência

Copie os exemplos de configuração e instale as dependências:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Preencha `MONGODB_URI` em `backend/.env` com a URI de um banco MongoDB Atlas de desenvolvimento. A API requer suporte a transações. O exemplo de frontend usa `VITE_LEDGER_API_URL=/` para enviar as chamadas ao proxy local do Vite. Use a mesma origem do navegador em `CLIENT_ORIGIN`.

Inicie a API e o frontend em terminais separados:

```powershell
npm.cmd --prefix backend run dev
npm.cmd --prefix frontend run dev -- --strictPort
```

Acesse http://localhost:5173/inicio. Crie uma conta e use o passo inicial para adicionar a primeira conta financeira. O botão de saída fica em **Configurações e ajuda**.

### Recuperação de acesso

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` e, quando exigidos pelo servidor de e-mail, `SMTP_USER` e `SMTP_PASS` no ambiente do backend. O envio usa TLS. Os links expiram em 30 minutos, são de uso único e apontam para `CLIENT_ORIGIN`. Redefinir a senha invalida as sessões anteriores. Sem SMTP configurado, cadastro e login continuam disponíveis.

### Espaço de desenvolvimento anterior

Para acessar registros antigos do modo local, mantenha o mesmo `LEDGER_OWNER` e a chave de 64 dígitos hexadecimais em `LEDGER_ACCESS_KEY`. Use **Configurações e ajuda → Registros locais** com uma origem de loopback. Contas pessoais novas começam com um espaço próprio. Os registros da chave local não são migrados automaticamente.

Em produção, use `NODE_ENV=production`, uma origem HTTPS em `CLIENT_ORIGIN` e um proxy que encaminhe `/api` ao backend de loopback. A chave local deve ficar vazia. Configure o fallback da aplicação para `index.html` nas demais rotas. A sessão usa cookie HttpOnly, SameSite Strict e Secure em HTTPS. Os limites de tentativas atuais são por processo, IP e conta quando aplicável. O proxy deve aplicar seus próprios limites de tráfego quando houver várias instâncias ou IP compartilhado.

## Regras financeiras

- Todos os valores são registrados em centavos inteiros. O saldo das contas considera o saldo inicial e as movimentações registradas, inclusive contas arquivadas. Transferências alteram apenas a distribuição dos saldos.
- As compras entram no ciclo de fechamento. Compras no dia do fechamento ficam no mesmo ciclo. Dias maiores que o mês usam seu último dia. O vencimento é no mesmo mês se cair após o fechamento e no mês seguinte nos demais casos. Fechamento e vencimento ficam fixos após o primeiro lançamento.
- Parcelas somam o valor original. Centavos que sobrarem são distribuídos nas primeiras parcelas. Pagamentos integrais ou parciais baixam o caixa e a fatura na mesma transação. Orçamentos e relatórios contabilizam parcelas, encargos e estornos no ciclo da fatura. Estornos podem gerar crédito para ciclos seguintes e são limitados ao valor da compra.
- Os orçamentos mensais têm alerta a partir de 80% do limite. O orçamento geral agrega todas as categorias. Aportes e retiradas das metas são registros manuais separados das movimentações. A previsão usa o valor mensal planejado.
- Lembretes exigem confirmação manual. A confirmação avança a recorrência sem lançar receita ou despesa. O adiamento preserva o dia de referência da recorrência.
- As avaliações patrimoniais são manuais. O total soma saldos e avaliações, deduz dívidas cadastradas e exclui registros vinculados a contas. Dívidas de cartão podem ser acompanhadas nas faturas. O histórico de saldos usa os saldos iniciais informados como ponto de partida.
- Reenvios com a mesma chave de envio são tratados na mesma transação dos registros. As rotas financeiras determinam o espaço a partir da sessão ou da chave de desenvolvimento.

## Verificar

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
```

Os testes de integração precisam de `MONGODB_TEST_URI` no ambiente do terminal. Use um replica set de teste com permissão para criar e remover um banco. A suíte cria um banco com nome aleatório, usa registros fictícios e remove apenas esse banco ao terminar. Ela testa concorrência, reenvios, isolamento, persistência após reconexão e recuperação por meio de um simulador de e-mail. Para validar entrega real, configure SMTP em um ambiente de teste.

O build gera `frontend/dist`.
