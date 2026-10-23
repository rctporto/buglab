# BugLab · Controle de alimentação do insetário

Sistema web para registrar e acompanhar a alimentação de mosquitos adultos e larvas do BugLab.

- **Calendário:** visão do mês; clique em um dia para registrar.
- **Registro:** formulário do dia (responsável, hora, gaiolas/larvas, atividades, ovos, observações).
- **Relatório:** semana, mês ou tudo; filtros, grade semanal, contagem por pessoa, PDF e CSV.
- **Desenvolvedor:** usuários e permissões, novo usuário, configurações e histórico de alterações.

O site é estático (GitHub Pages) e usa o **Supabase** para login, banco de dados e regras de acesso.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html`, `style.css`, `app.js` | O sistema |
| `config.js` | Endereço e chave pública do Supabase |
| `logo.png`, `favicon.png` | Marca |
| `supabase/01_estrutura.sql` | Cria tabelas, regras de acesso, funções e importa os registros de 14–20/10/2026 |

O script com os usuários e senhas iniciais (**02_usuarios_iniciais.sql**) fica **fora** deste repositório.

## Publicação — passo a passo

### 1. Supabase
1. Crie um projeto gratuito em <https://supabase.com>.
2. **Authentication → Sign In / Providers → Email:** desligue *Allow new users to sign up* e *Confirm email*. Assim só desenvolvedores criam contas.
3. **SQL Editor → New query:** cole `supabase/01_estrutura.sql` e clique em **Run**.
4. **SQL Editor → New query:** cole o `02_usuarios_iniciais.sql` (arquivo privado) e clique em **Run**. A última tabela mostra os seis usuários criados.
5. **Project Settings → API:** copie a **Project URL** e a chave **anon / public**.

### 2. Configurar o site
Abra `config.js` e cole a Project URL e a chave anon. **Nunca** use a chave `service_role` no site.

### 3. GitHub Pages
1. Envie os arquivos para o repositório (público).
2. **Settings → Pages → Build and deployment:** *Source* = **Deploy from a branch**, *Branch* = **main**, pasta **/ (root)** → **Save**.
3. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
4. No Supabase, em **Authentication → URL Configuration**, coloque esse endereço em *Site URL*.

### 4. Primeiro acesso
Cada pessoa entra com o login (`nome.sobrenome`) e a senha inicial, e o sistema pede uma senha nova de pelo menos 8 caracteres, diferente do login.

## Domínio próprio (depois)
1. **Settings → Pages → Custom domain:** informe o domínio (ex.: `buglab.univille.br`) e marque *Enforce HTTPS*.
2. No provedor do domínio, crie um registro **CNAME** apontando para `SEU-USUARIO.github.io`.
3. No Supabase, atualize a *Site URL* para o domínio novo.

Nada mais muda: o banco, os usuários e os registros continuam os mesmos.

## Perfis e permissões
- **Desenvolvedor:** tudo, inclusive a aba Desenvolvedor.
- **Usuário:** o que estiver marcado na aba Desenvolvedor:
  - Lançar registros
  - Editar e excluir os próprios registros
  - Editar e excluir registros de outras pessoas
  - Ver o relatório
  - Gerar PDF e CSV

As permissões são verificadas no próprio banco (Row Level Security); esconder um botão na tela não é a única proteção.

## Tarefas comuns
- **Esqueceram a senha:** aba Desenvolvedor → Usuários → *Redefinir senha*. A pessoa troca no próximo acesso.
- **Alguém saiu da equipe:** desmarque *Ativo*. A pessoa não entra mais e os registros dela continuam.
- **Nova gaiola:** aba Desenvolvedor → Configurações → acrescente uma linha.
