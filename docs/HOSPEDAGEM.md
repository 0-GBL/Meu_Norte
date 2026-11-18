# Preparação para Vercel, Render e MongoDB Atlas

[Voltar ao README](../README.md) · [Demonstração](DEMONSTRACAO.md)

Preparação de código e instruções, **sem deploy executado**. Não há domínio público homologado nem garantia de funcionamento de um ambiente externo ainda não configurado.

## Topologia prevista

```text
Navegador → HTTPS da Vercel
              ├─ frontend/dist (React/Vite)
              └─ /api/* → rewrite HTTPS → API única no Render
                                            ├─ Atlas: banco pessoal
                                            └─ Demo: JSON estático + sessão em memória
```

Use a API pelo mesmo domínio do frontend, por meio de rewrite. Isso mantém o cookie no contexto do site visitado, sem alterar SameSite Strict para permitir cookies entre sites. Não configure `VITE_LEDGER_API_URL` com o domínio de outro site nessa topologia: deixe o padrão `/`.

## Render — backend

- Serviço Node.js; **Root Directory: raiz do repositório**, para incluir `shared/`.
- Build Command: `npm --prefix backend ci --omit=dev`.
- Start Command: `npm --prefix backend start`.
- Health Check Path: `/api/health` (204 quando a conexão administrativa está disponível).
- Node.js 22.12+; a versão validada localmente é Node.js 24.
- Configure `NODE_ENV=production`. A API usa `PORT` fornecida pelo serviço e escuta em `0.0.0.0` em produção; desenvolvimento mantém `127.0.0.1`.
- Configure `CLIENT_ORIGIN` com a origem HTTPS exata e estável da Vercel, sem barra final. Domínios de preview não são autorizados automaticamente.
- Preserve `MONGODB_URI` do banco pessoal e a conta administrativa existente. SMTP pode continuar configurado para recuperação administrativa.
- Para habilitar a demo **no mesmo serviço**, configure somente `DEMO_MODE=true`, `DEMO_EMAIL=demo@example.com` e `DEMO_PASSWORD=NorteDemo@123`. Os dados fictícios são estáticos, sem segundo banco Atlas ou criação de usuário demo. [Configuração completa](DEMONSTRACAO.md).
- Em produção, mantenha `INITIAL_ADMIN_*` ausentes/vazias, como já exigido pela aplicação. Essas variáveis continuam sendo apenas para o bootstrap local; não recrie nem redefina o administrador existente.

Produção usa um único `start`, com a conexão administrativa existente e o conjunto estático demo incluído no backend. Nenhum seed, banco descartável ou comando de preparação demo é necessário. A conta pública fica desativada quando `DEMO_MODE` não está habilitada explicitamente. A rede do Atlas continua restrita ao serviço autorizado para o acesso administrativo.

## Vercel — frontend

- **Root Directory: raiz do repositório**, preservando os imports de `shared/`.
- Install Command: `npm --prefix frontend ci`.
- Build Command: `npm --prefix frontend run build`.
- Output Directory: `frontend/dist`.
- Use configuração de build que respeite esses comandos e caminhos (preset Other, se o preset Vite assumir `dist` na raiz).
- `VITE_LEDGER_API_URL` ausente ou `/`; nenhuma URI de MongoDB, senha privada ou variável do backend no build do frontend.

O arquivo [vercel.json.example](../deploy/vercel.json.example) é um **modelo inativo**. Antes de usá-lo, substitua o destino `https://API_RENDER_ORIGIN.invalid` pela origem HTTPS real do serviço Render e salve o resultado como `vercel.json` na raiz. `.invalid` é um marcador deliberadamente não funcional, não um endereço de demonstração. Não publique o modelo sem substituir esse valor.

O rewrite `/api/:path*` precisa vir antes do fallback da SPA. O fallback permite atualizar `/contas`, `/relatorios` e outras rotas sem 404; a API nunca deve receber o HTML da SPA em lugar de JSON. Os arquivos estáticos continuam servidos pelo sistema de arquivos da Vercel.

## Cookies, origem e sessões

A API já aplica CORS à origem exata, verifica `Origin` nas escritas e recusa origens diferentes. Essas regras não foram flexibilizadas. Cookies HTTPS mantêm o prefixo `__Host-`, Secure, HttpOnly, Path `/` e SameSite Strict; não adicione Domain ao cookie.

O proxy precisa preservar o `Origin` do navegador e encaminhar **todos os cabeçalhos `Set-Cookie`**, inclusive o cookie removido ao alternar o acesso. O administrador mantém `__Host-meunorte`; a demo usa `__Host-meunorte-demo`. Sem HTTPS local, os nomes não têm o prefixo `__Host-`. Tokens administrativos continuam no MongoDB; apenas hashes dos tokens demo ficam em memória do processo. Um token demo não autentica no fluxo pessoal. Ao mudar de acesso no mesmo navegador, o cookie oposto é limpo, sem revogar sessões administrativas em outros navegadores. Sessões administrativas mantêm sua persistência e validade originais. A sessão demo dura uma hora, sobrevive ao refresh e termina ao reiniciar a API; o visitante entra novamente com as mesmas credenciais. Use uma instância de backend nessa configuração simples; múltiplas instâncias exigem afinidade de sessão. A demo limita a 200 sessões simultâneas por processo. O backend não habilita `trust proxy` indiscriminadamente; o limitador atual poderá agrupar visitantes pelo IP do proxy. Antes de publicar, valide o comportamento real de IP e aplique limites na borda; não confie em cabeçalhos arbitrários enviados pelo cliente.

## Critérios para anunciar um endereço online

1. Conferir que a demo fornece somente o JSON fictício e que o acesso administrativo mantém seu banco e permissões.
2. Configurar os domínios reais, HTTPS e rewrite, sem expor as variáveis de backend.
3. Validar o login demo com a senha fixa, o login administrativo, refresh, logout e cookies pelo mesmo domínio público da Vercel. Usar dois navegadores para conferir os acessos simultaneamente.
4. Conferir atualização de rotas internas, API e arquivos de `shared/` presentes no deploy.
5. Repetir as tentativas de escrita, senha e recuperação: devem continuar bloqueadas; conferir que a demo não cria usuários ou sessões no MongoDB e não lê registros pessoais.
6. Validar origem maliciosa, regras da rede do Atlas, limites de borda, logs, comportamento após reinício/expiração e custos/limites dos serviços escolhidos.

Somente após essas verificações acrescente o endereço real no README. Nesta entrega, isolamento de recursos externos, rewrite hospedado, HTTPS, domínio, rede do Atlas e configuração de serviços **não foram validados online**.

Referências oficiais consultadas em 17/11/2026: [porta e interface de rede no Render](https://render.com/docs/web-services), [rewrites externos na Vercel](https://vercel.com/docs/routing/rewrites).

## Diagnóstico de login antes de disponibilizar o endereço

Configure as três variáveis demo no ambiente do Render e reinicie o serviço após a configuração inicial. Preserve a conexão MongoDB administrativa e todas as suas credenciais. Não coloque senhas ou variáveis do backend no frontend. O recrutador precisa apenas abrir a URL real da aplicação e informar **demo@example.com** / **NorteDemo@123** no formulário existente.

O log informa se a demonstração está habilitada com dados estáticos ou desativada. Para diagnóstico opcional, `npm --prefix backend run check:auth` analisa o ambiente e o `.env` sem conectar ao MongoDB nem mostrar valores privados. O comando não é necessário para visitantes.

A configuração local permanente foi validada, incluindo reinício dos dois servidores, conforme [LOGIN-REAL.md](LOGIN-REAL.md). Isso não substitui a homologação de domínio, HTTPS, cookies e rewrite no ambiente hospedado. Nenhum serviço externo foi configurado e nenhum endereço público é anunciado nesta entrega.
