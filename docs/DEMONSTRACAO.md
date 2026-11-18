# Demonstração interativa

[Voltar ao README](../README.md) · [Hospedagem](HOSPEDAGEM.md) · [Validação atual](REFINAMENTO-FINAL.md)

A API atende administrador e visitante no mesmo serviço. Cada sessão demo recebe uma cópia independente de [demoData.json](../backend/src/demoData.json), mantida exclusivamente na memória do backend. Não há segundo MongoDB, usuário Atlas ou gravação de registros demo no banco pessoal.

## Acesso e configuração

Use o formulário existente, sem cadastro ou troca obrigatória de senha:

- E-mail: **demo@example.com**
- Senha: **NorteDemo@123**

Acrescente ao ambiente do backend, preservando a conexão e as credenciais administrativas:

```env
DEMO_MODE=true
DEMO_EMAIL=demo@example.com
DEMO_PASSWORD=NorteDemo@123
DEMO_DAILY_WRITE_LIMIT=50
```

A cota assume 50 quando ausente. Aceita inteiro de 1 a 1000; configuração inválida impede a inicialização. Novas instalações deixam a demo desativada por padrão. Não publique o arquivo .env real.

Execute normalmente, em dois terminais, sem comandos específicos para visitantes:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Abra [localhost:5173/entrar](http://localhost:5173/entrar). Não cadastre informações financeiras pessoais: os dados são fictícios e as alterações são temporárias.

## Funcionalidades e consistência

Contas, movimentações, transferências, cartões, compras, pagamentos, estornos, orçamentos, metas, bens, avaliações, vendas, recebimentos e lembretes usam as mesmas rotas, validações e cálculos do administrador. Saldos, históricos e relatórios refletem as alterações reais da sessão.

O módulo demoStore implementa somente o subconjunto de armazenamento usado pelas rotas financeiras. Reutiliza os schemas Mongoose para tipos, valores padrão e subdocumentos, sem executar consultas Mongoose. O caminho administrativo mantém os modelos e transações MongoDB originais. O antigo gerador duplicado de relatórios estáticos foi removido.

Cada transação trabalha em uma cópia e só a publica se operação, cálculo do snapshot, capacidade e cota forem aprovados. Falhas descartam alterações parciais. Leituras e escritas da mesma sessão passam por uma fila, limitada a oito transações pendentes. Chaves de idempotência continuam válidas; repetição bem-sucedida não gera novo registro ou consumo de cota.

## Limites e proteção contra abuso

A cota diária é por sessão e por dia civil de **America/Sao_Paulo**. Uma ação concluída com mudança financeira conta uma vez, mesmo alterando várias coleções. Consultas, navegação, login/logout, erros, repetições idempotentes e gravações sem mudança não consomem a cota. A comparação ignora a revisão interna do workspace e recibos de idempotência.

Ao ultrapassar a cota, a API responde HTTP 429 sem encerrar a sessão:

> Você atingiu o limite de operações da demonstração. Ainda é possível consultar todas as informações do aplicativo.

Controles adicionais exclusivos da demo, por processo:

| Controle | Limite |
| --- | --- |
| Sessões ativas | 200, com validade absoluta de uma hora |
| Dados por sessão | 512 KiB serializados e 1500 registros, incluindo históricos/recibos |
| Fila por sessão | 8 transações, incluindo a ativa |
| Logins por endereço | 8 tentativas a cada janela de 15 minutos; 20 sessões emitidas por dia |
| Escritas concluídas por endereço | 4 vezes a cota diária configurada, compartilhadas entre sessões |
| Requisições por endereço | 900 por janela de 15 minutos; registros financeiros: 600 |
| Tentativas financeiras de escrita por endereço | 120 por janela de 15 minutos, incluindo erros |
| Requisições globais | 6000 por janela de 15 minutos |
| Tentativas globais de login | 60 por janela de 15 minutos |
| Verificações de senha simultâneas | 4 |
| Endereços nos contadores diários | Até 20000, identificados por hash |

Os limites de frequência também contam requisições inválidas para conter abuso; isso é independente da cota de alterações concluídas. Nenhum desses controles se aplica ao administrador. Reiniciar o navegador ou sair e entrar não zera o contador por endereço do processo. O Express não confia em cabeçalhos de IP arbitrários; um proxy ou rede compartilhada pode agrupar visitantes.

**Dados e contadores estão em memória e podem reiniciar junto com o serviço. Não há limite diário persistente ou impossível de contornar.** Mudanças de endereço, reinício do processo ou múltiplas instâncias têm as limitações inerentes ao controle local. Não foram adicionados serviços externos. Múltiplas instâncias exigem afinidade de sessão; os limites continuam por processo, não distribuídos.

## Isolamento e descarte

O backend emite um token aleatório de 32 bytes e guarda seu hash em memória. Cookie próprio HttpOnly, SameSite Strict e Path /, com Secure e prefixo __Host- em HTTPS. O cookie demo, mesmo adulterado ou expirado, nunca encaminha a solicitação aos dados privados. A identidade e o owner são definidos no servidor; parâmetros enviados pelo visitante não selecionam outra sessão.

Refresh e navegação preservam a cópia. Logout, novo login no mesmo cookie, expiração ou reinício descartam os registros. Uma varredura a cada minuto libera sessões vencidas mesmo sem novas requisições. Transações pendentes verificam validade e revogação antes de publicar o resultado.

Troca e recuperação da senha pública permanecem bloqueadas no backend, sem privilégio administrativo. A validação de origem e as proteções de autenticação existentes foram preservadas. A topologia HTTPS via rewrite Vercel/Render está descrita no [guia de hospedagem](HOSPEDAGEM.md); nenhum deploy foi executado.
