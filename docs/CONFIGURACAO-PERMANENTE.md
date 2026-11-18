# Configuração permanente validada

> Registro histórico de uma entrega anterior. Para o funcionamento interativo atual e os testes desta revisão, consulte [REFINAMENTO-FINAL.md](REFINAMENTO-FINAL.md) e [DEMONSTRACAO.md](DEMONSTRACAO.md).

Em **18/11/2026**, o arquivo local `backend/.env` foi alterado pontualmente apenas para habilitar `DEMO_MODE=true`, `DEMO_EMAIL=demo@example.com` e `DEMO_PASSWORD=NorteDemo@123`. Todas as demais variáveis e credenciais foram preservadas e verificadas sem publicar seus valores.

A demonstração utiliza JSON estático e sessões em memória; nenhum banco adicional ou credencial Atlas demo é necessário. A conexão pessoal mantém o funcionamento administrativo habitual.

O login foi validado no Chrome com `npm run dev` nos diretórios backend e frontend, nas portas originais 3001 e 5173. Após encerrar e iniciar novamente ambos os servidores, as mesmas credenciais permitiram novo login. Os processos da validação foram encerrados.

[Como executar](DEMONSTRACAO.md) · [Resultados](LOGIN-REAL.md) · [Hospedagem](HOSPEDAGEM.md)
