# Capturas reais do Meu Norte

As dez imagens WebP foram geradas na revisão de portfólio de 17/11/2026, com Chrome headless, API Express e dados exclusivamente fictícios de um banco local temporário. Foram preservadas como registro visual da interface. O antigo script de captura foi removido junto da configuração demo obsoleta.

As imagens WebP são capturas diretas da aplicação, sem composição ou edição dos valores. Qualidade 85, desktop de 1440 px e mobile de 390 px. Não incluem a barra do navegador, ferramentas de desenvolvimento, tokens ou credenciais administrativas. As credenciais públicas demo são exclusivas da demonstração e não aparecem nas capturas das telas internas.

`logo.svg` exporta a bússola Lucide já renderizada no cabeçalho, com as cores e o fundo da identidade existente. Não foi criada uma marca diferente. Os badges de tecnologias no README são fornecidos pelo Shields.io; não são indicadores de aprovação de testes.

| Arquivo | Tela |
| --- | --- |
| dashboard.webp | Visão geral, tema claro |
| tema-escuro.webp | Visão geral, tema escuro |
| movimentacoes.webp | Histórico de receitas, despesas e transferência |
| contas.webp | Contas e saldos |
| cartoes.webp | Cartão fictício e faturas |
| planejamento.webp | Meta de reserva de emergência |
| orcamentos.webp | Orçamento de alimentação |
| relatorios.webp | Resumo financeiro e gráficos |
| patrimonio.webp | Bem ativo avaliado |
| mobile.webp | Visão geral em 390 px |

As datas das imagens refletem a captura histórica. A demonstração atual inicializa cópias editáveis por sessão a partir do JSON fictício, exclusivamente em memória e sem MongoDB.

As capturas PNG em `login-validation/` são da validação permanente de 18/11/2026. Para repeti-la, com portas 3001/5173 livres e `.env` configurado, execute `npm --prefix frontend run test:login-live`. O script usa um perfil isolado do Chrome e encerra os servidores que iniciou. Veja [LOGIN-REAL.md](../LOGIN-REAL.md).
