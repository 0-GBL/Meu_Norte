# Demonstração de consulta

[README](../README.md) · [Hospedagem](HOSPEDAGEM.md) · [Validação real](LOGIN-REAL.md)

A API atende administrador e visitante no mesmo serviço. A conta demo usa somente dados fictícios fixos de [demoData.json](../backend/src/demoData.json), sem banco próprio e sem consultar ou gravar no MongoDB pessoal. Os cálculos existentes são reutilizados para apresentar os dados; nenhuma regra financeira foi alterada.

## Configuração única

Acrescente ao ambiente do backend, preservando as demais variáveis:

```ini
DEMO_MODE=true
DEMO_EMAIL=demo@example.com
DEMO_PASSWORD=NorteDemo@123
```

Novas instalações deixam a demo desativada por padrão no `.env.example`. `MONGODB_URI` continua necessária para o acesso administrativo já existente. Não é necessário criar outro banco, usuário Atlas, seed ou servidor de demonstração. A conta demo não é um documento da coleção de usuários.

Execute os comandos habituais em dois terminais:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Abra [localhost:5173/entrar](http://localhost:5173/entrar) e informe **demo@example.com** / **NorteDemo@123**. O formulário permanece igual, sem botão extra, cadastro ou troca inicial de senha. O administrador usa suas credenciais habituais.

## Segurança e sessão

O backend verifica a senha, limita tentativas e emite um token aleatório em cookie HttpOnly/SameSite Strict, Secure em HTTPS. Guarda somente o hash do token em memória, por uma hora, com no máximo 200 sessões demo por processo. O cookie próprio evita confundir sessões administrativas e demo; IDs ou filtros nunca selecionam o banco pessoal. Trocar o acesso no mesmo navegador limpa o cookie oposto, preservando sessões em outros navegadores.

A sessão continua após atualizar páginas. Reiniciar a API, expirar o prazo ou sair encerra a sessão demo; basta entrar novamente com as mesmas credenciais. Sessões administrativas continuam persistidas no MongoDB como antes. Em múltiplas instâncias, a demo precisa de afinidade de sessão; a configuração simples documentada usa uma instância de backend.

Toda escrita financeira e alteração/recuperação de senha demo é recusada no servidor. O visitante tem papel de usuário, nunca de administrador. Recursos de gerenciamento existentes podem ser consultados, mas salvar não é permitido. Dados e datas são estáticos; filtros de outros meses podem apresentar resultados vazios. Não use a demonstração para guardar informações pessoais.

## Validação

`npm --prefix backend run test:isolated` cobre a autenticação administrativa e demo em paralelo, cookies, tokens, filtros e bloqueios. Um teste adicional intercepta todos os métodos de consulta/gravação dos modelos e comprova que a demo funciona sem operação MongoDB.

`npm --prefix frontend run test:login-live` inicia os comandos normais com o `backend/.env` permanente, abre Chrome, testa navegação/refresh/logout/reinício e encerra seus servidores. Apenas lê contagens e hashes administrativos para conferir integridade; não modifica dados pessoais. Não exige comandos extras para o uso normal.

Hospedagem depende das três variáveis demo no Render, além da configuração administrativa e HTTPS já existentes. Não houve deploy nem anúncio de endereço público.
