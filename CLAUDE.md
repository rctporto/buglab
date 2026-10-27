# BugLab · Controle de alimentação do insetário

Contexto para o Claude Code continuar o projeto. Responda sempre em **português do Brasil**.

## O que é
Sistema web do **BugLab** (laboratório da Univille com a Nório Nanotecnologia, Joinville/SC) para a equipe registrar a alimentação e o manejo de **mosquitos adultos (gaiolas)** e **larvas**. Substitui uma planilha semanal (ver `privado/referencia/`). Dono do projeto: Renato Porto.

## Arquitetura
- **Front-end estático**, sem build: `index.html`, `style.css`, `app.js`, `config.js`, `logo.png`, `favicon.png`. Será publicado no **GitHub Pages** (repositório público, branch `main`, raiz).
- **Supabase** para login, banco (Postgres) e regras de acesso (RLS). Biblioteca: `@supabase/supabase-js@2.45.4` (UMD via jsDelivr).
- PDF com `jspdf@2.5.1` + `jspdf-autotable@3.8.2` (cdnjs). Fontes: Archivo, Public Sans, IBM Plex Mono (Google Fonts).
- `config.js` tem a Project URL e a chave **anon** do Supabase (públicas). **Nunca** colocar a chave `service_role` no projeto.

## Login
- Usuário digita `nome.sobrenome`; o app converte para o e-mail interno `nome.sobrenome@buglab.local` (`dominioLogin` em `config.js`). Nenhum e-mail é enviado.
- Usuários são criados por SQL (`_criar_usuario`) direto em `auth.users` + `auth.identities` (senha com `extensions.crypt`/bcrypt). O cadastro aberto do Supabase deve ficar **desligado**.
- Toda conta nova nasce com `trocar_senha = true`: no primeiro acesso a pessoa cria senha nova (mín. 8 caracteres, diferente do login) via RPC `trocar_minha_senha`.
- Desativar usuário = `banned_until = 'infinity'` em `auth.users`.

## Banco (`supabase/01_estrutura.sql`, reexecutável)
- `perfis` (id = auth.users.id, login, nome, papel `desenvolvedor|usuario`, permissoes jsonb, ativo, trocar_senha)
- `registros` (data, hora texto, responsavel, alvos text[], atividades text[], ovos `''|sim|nao`, obs, origem, autor, criado_em, atualizado_em)
- `config` (linha única id=1, `dados` jsonb: alvos, inicioSemana, janelas, base de contagem)
- `historico` (preenchido por gatilhos em registros, perfis e config)
- Funções: `eh_ativo()`, `eh_dev()`, `tem_perm(p)`, `perms_padrao(papel)`, `admin_criar_usuario`, `admin_listar_usuarios`, `admin_atualizar_usuario`, `admin_definir_senha`, `admin_excluir_usuario`, `trocar_minha_senha`. `_criar_usuario` é interna (sem execute para anon/authenticated).
- Importa os 17 registros da planilha de 14–20/10/2026 (`origem = 'planilha'`, autor nulo).
- Testado num Postgres 16 local com um schema `auth` simulado: regras de acesso, funções e histórico funcionaram. **Ainda não rodou num Supabase real.**

## Permissões (flags em `perfis.permissoes`)
`registrar`, `editar_proprios`, `editar_todos`, `ver_relatorio`, `exportar`. Desenvolvedor tem todas + aba Desenvolvedor. Padrão de usuário: tudo menos `editar_todos`. As regras valem no banco (RLS), não só na interface.

## Usuários iniciais (`privado/02_usuarios_iniciais.sql` — NÃO versionar)
renato.porto, patricia.uchoa, denise.abatti (desenvolvedor); romana.apel, amanda.schramm, gabriel.schroder (usuário). Senha inicial aleatória (no próprio arquivo), troca obrigatória no 1º acesso.

## Telas (`app.js`)
1. **Login** — logo centralizada, login e senha abaixo; botão de modo claro/escuro.
2. **Troca de senha** (1º acesso).
3. **Calendário** — mês; clicar no dia abre o Registro daquela data; mostra quem alimentou e G1/G2/G3/L.
4. **Registro** — formulário do dia + lista dos registros da data; edição de registro existente.
5. **Relatório** — semana/mês/tudo, filtros por responsável e gaiola, grade semanal no formato da planilha (horário fora da janela em laranja), contagem por pessoa (base da planilha até 20/10 + dias na plataforma), observações, **PDF** e **CSV**.
6. **Desenvolvedor** — usuários e permissões (flags por linha), novo usuário, configurações, histórico de alterações.

Regras de negócio: semana começa na **quarta** (como a planilha); janelas: adultos 10:00–18:00, larvas 15:00–18:00; "vezes que alimentou" = dias distintos com registro por pessoa.

## Identidade visual
Logo: mosquito verde em círculo (`assets/buglab-logo-original.png`); wordmark **BUG** (Archivo 800) + *lab* (Archivo 300 itálico). Verde principal `#3a8650` (claro) / `#5fb877` (escuro). Neutros levemente esverdeados. Todas as cores são tokens em `:root` com modo escuro por `prefers-color-scheme` e `[data-theme]`.

## Prévia (`privado/previa/`)
`mock.js` simula o Supabase em memória com os 6 usuários. `python3 privado/previa/montar_previa.py` gera `buglab-previa.html` (arquivo único). No artifact do claude.ai, downloads passam pela capability `downloads`; por isso `baixar()` em `app.js` tenta `window.claude.use("downloads")` e cai para `<a download>` no site normal.

## Versão nova (`nova/`)
O novo design (mockups de 26/10/2026) está publicado em <https://rctporto.github.io/buglab/nova/>, na pasta `nova/` (index.html, style.css, app.js, logo, favicon). Tem uma cópia de `config.js` (`nova/config.js`, manter igual ao da raiz), então o banco e os usuários são os mesmos. A mesma pasta é publicada no **Firebase Hosting** da Nório (projeto `norio-pd-os`, que também tem o site `norio-pd-os`, não mexer) em <https://buglab-adm.web.app>, no ar desde 27/10/2026 (`firebase.json`: site `buglab-adm`, pasta `nova`); o deploy é automático pelo GitHub Actions (`.github/workflows/firebase-hosting.yml`, a cada push na main que mexa em `nova/`; segredos `FIREBASE_TOKEN` (de `firebase login:ci`; a Nório não permite chave de conta de serviço) e `FIREBASE_PROJECT_ID`; sem eles, publicar à mão com `firebase deploy --only hosting --project <id>`). Só a hospedagem é Firebase: login e banco continuam no Supabase, com login `nome.sobrenome` sem e-mail. O site da raiz continua com o visual antigo até o Renato decidir trocar; o PR #1 (branch `novo-design`) faz essa troca na raiz. Ao mudar o sistema, mantenha as duas versões em dia ou combine qual delas vale.

## Status e próximos passos
- [x] Repositório público <https://github.com/rctporto/buglab> (branch `main`); push via HTTPS com token clássico guardado no Keychain do Mac.
- [x] GitHub Pages ativo: <https://rctporto.github.io/buglab/>.
- [x] Projeto Supabase `BUGLAB` (us-east-1), `https://oovkoanznsaundopicnw.supabase.co`; `config.js` com a chave publishable (`sb_publishable_…`).
- [x] Cadastro aberto e "Confirm email" desligados; Site URL = endereço do Pages.
- [x] `01_estrutura.sql` e `02_usuarios_iniciais.sql` rodados (senhas iniciais aleatórias estão no próprio 02).
- [ ] Rodar de novo o `01_estrutura.sql`, que agora tem grants explícitos para `authenticated` (projeto novo pode não liberar tabelas sozinho), e conferir em `information_schema.role_table_grants`.
- [ ] Testar no Supabase real: login, troca de senha, registro, edição, permissões, histórico, PDF.
- [ ] Domínio próprio depois (CNAME + Site URL no Supabase) — nada mais muda.

## Cuidados
- A prévia publicada no claude.ai está com link público e contém os logins; por isso o `02_usuarios_iniciais.sql` usa senhas iniciais aleatórias (não iguais ao login).
- Não commitar nada de `privado/`.
- Ao mudar o banco, manter `01_estrutura.sql` reexecutável (`if not exists`, `create or replace`, `drop policy if exists`).
