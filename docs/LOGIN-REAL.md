# Login com configuração permanente

> Registro histórico de uma entrega anterior. Para o funcionamento interativo atual e os testes desta revisão, consulte [REFINAMENTO-FINAL.md](REFINAMENTO-FINAL.md) e [DEMONSTRACAO.md](DEMONSTRACAO.md).

Data: **18/11/2026**. Resultado: **6 cenários aprovados**, sem mock, variáveis substitutas ou banco temporário para demonstrar o acesso normal.

A execução utilizou o `backend/.env` real e os comandos habituais `npm run dev` de backend e frontend. O Chrome acessou [localhost:5173/entrar](http://localhost:5173/entrar).

1. Login pelo formulário existente com **demo@example.com** / **NorteDemo@123**, carregamento do dashboard, papel de usuário e ausência de troca obrigatória de senha.
2. Navegação pelos oito módulos e atualização de página mantendo a sessão.
3. Recusa HTTP 403 para gravação, alteração de senha e recuperação; conta fora do JSON recusada com 404.
4. Logout, recusa de senha incorreta e novo login pelo mesmo formulário.
5. Encerramento e reinício dos dois servidores com os mesmos comandos/configuração; novo login e dashboard aprovados.
6. Contagens dos registros financeiros e hashes/configurações dos usuários pessoais iguais antes e depois, verificados apenas por leitura.

[Resultado estruturado](LOGIN-REAL-RESULTADO.json). Capturas: [formulário](images/login-validation/login-real.png), [dashboard](images/login-validation/dashboard-real.png) e [dashboard após reinício](images/login-validation/dashboard-after-restart.png). Somente dados e credenciais públicas demo aparecem nas imagens.

Os servidores e o perfil isolado do Chrome foram encerrados ao final. Não houve gravação de dados pessoais, alteração de senha administrativa, commit, push ou deploy. O único ajuste de configuração real foi o conjunto autorizado de variáveis demo.

A preservação funcional da autenticação administrativa também é coberta por testes com administrador fictício em banco local isolado. Não foi usada nem solicitada a senha pessoal do administrador no navegador. Não há validação de hospedagem pública; HTTPS, domínio e rewrite ainda dependem da implantação.

Para repetir explicitamente a verificação, feche servidores do projeto nas portas 3001/5173 e execute `npm --prefix frontend run test:login-live`. Esse comando é de validação, não é necessário para entrar na aplicação.
