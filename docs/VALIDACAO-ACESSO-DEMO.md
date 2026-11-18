# Validação da demonstração simplificada

Data: **18/11/2026**. A implementação anterior com segundo banco, seed e runners próprios foi removida. A configuração atual está em [DEMONSTRACAO.md](DEMONSTRACAO.md).

| Verificação | Resultado |
| --- | --- |
| Backend: `npm --prefix backend run test:isolated` | 67 aprovados, 0 falhas, 0 ignorados |
| Frontend: `npm --prefix frontend test` | 16 aprovados |
| Produção: `npm --prefix frontend run build` | Aprovado |
| Administrativo no Chrome: `test:app-browser` | 15 fluxos aprovados com fixtures locais |
| Configuração permanente no Chrome: `test:login-live` | 6 cenários aprovados; ambos os servidores reiniciados |

A demo foi testada sem consultas ou gravações MongoDB, inclusive com os métodos dos modelos bloqueados no teste unitário. Os testes combinados confirmam login administrativo e demo simultâneos, cookies independentes, tokens adulterados recusados, IDs privados inacessíveis, gravação administrativa preservada e demo somente de consulta. Não há usuário, sessão ou token de recuperação demo no MongoDB.

A execução permanente não cria bancos nem troca configurações: valida o login normal, navegação, refresh, logout e reinício. Leitura de integridade confirmou contagens financeiras e hashes administrativos preservados. Os testes administrativos de escrita usaram somente um replica set temporário local. [Evidências reais](LOGIN-REAL.md).

Foram removidos os módulos de conexão demo, seed, teste de startup antigo e scripts exclusivos. A documentação, o diagnóstico de configuração e os testes úteis foram adaptados. A interface e os cálculos financeiros permanecem iguais. Todas as variáveis privadas do `.env` foram preservadas.

Não há impedimento local conhecido para o acesso demo. Para hospedagem, ainda é preciso configurar domínios, variáveis no Render e rewrite HTTPS da Vercel, conforme [HOSPEDAGEM.md](HOSPEDAGEM.md). Nenhum deploy foi executado. Sessões demo são locais ao processo, duram uma hora e exigem novo login após reiniciar a API; o acesso administrativo mantém a persistência existente.
