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
- `registros` também tem `tipo`, `estagio`, `agendamento_id` e `gaiolas` jsonb (`[{gaiola, situacao: realizada|nao_realizada, obs}]`); `alvos` guarda só as gaiolas realizadas (o relatório usa).
- `agendamentos` (tipo, estagio, gaiolas[], data, hora, responsavel_id/responsavel, obs, origem `agendamento|escala`, serie) e `escala` (colaborador_id, data, entrada, saida; único por pessoa e dia): todos leem, só desenvolvedor grava.
- `lotes` (codigo único, especie), `placas` (lote, codigo, inicio_eclosao, ovos_iniciais, situacao) e `criacao_registros` (contagens; check machos+femeas+nao_identificado = novos_adultos): quem tem `registrar` cria; contagens seguem as regras de edição dos registros.
- `historico` (preenchido por gatilhos em todas as tabelas acima, perfis e config)
- Funções: `eh_ativo()`, `eh_dev()`, `tem_perm(p)`, `perms_padrao(papel)`, `admin_criar_usuario`, `admin_listar_usuarios`, `admin_atualizar_usuario`, `admin_definir_senha`, `admin_excluir_usuario`, `trocar_minha_senha`. `_criar_usuario` é interna (sem execute para anon/authenticated).
- Importa os 17 registros da planilha de 14–20/10/2026 (`origem = 'planilha'`, autor nulo).
- Testado num Postgres 16 local com um schema `auth` simulado (também com as tabelas novas de 27/10/2026, rodando o arquivo duas vezes): regras de acesso, funções e histórico funcionaram.

## Permissões (flags em `perfis.permissoes`)
`registrar`, `editar_proprios`, `editar_todos`, `ver_relatorio`, `exportar`. Desenvolvedor tem todas + aba Desenvolvedor. Padrão de usuário: tudo menos `editar_todos`. As regras valem no banco (RLS), não só na interface.

## Usuários iniciais (`privado/02_usuarios_iniciais.sql` — NÃO versionar)
renato.porto, patricia.uchoa, denise.abatti (desenvolvedor); romana.apel, amanda.schramm, gabriel.schroder (usuário). Senha inicial aleatória (no próprio arquivo), troca obrigatória no 1º acesso.

## Telas (`app.js`)
Layout do sistema (mockups de 26/10/2026): barra lateral (marca "Gestão do insetário", navegação com ícones, usuário e Sair embaixo), cabeçalho "Laboratório de entomologia", breadcrumbs, título grande com subtítulo, cartões de resumo e conteúdo em cartões. Ícones são `<symbol>` no topo do `index.html` (`ico()` no `app.js`). No celular a barra lateral vira faixa no topo com abas roláveis. "Administrador" nas telas = perfil `desenvolvedor`.

1. **Login** — painel verde à esquerda (marca, frase, atalhos) e formulário à direita; botão de modo claro/escuro. Abaixo de 860px só o formulário.
2. **Troca de senha** (1º acesso).
3. **Dashboard** (só administrador, tela inicial dele) — atividades do dia (concluídas, pendentes, atrasadas), conversão entre estágios, adultos por sexo (rosca), emergência de adultos por dia e rotina do dia.
4. **Calendário de atividades** — semana (seg–dom, linhas por hora) ou mês; mostra agendamentos e registros avulsos; painel lateral com detalhes e "Registrar execução".
5. **Registro diário** — tipo (Alimentação/Verificação), estágio, agendamento opcional, gaiolas com situação por gaiola (não realizada exige motivo), detalhes do manejo opcionais (atividades antigas e ovos), lista dos registros do dia e edição.
6. **Registro da criação** — lotes e placas de ovos, contagens de novas larvas/pupas/adultos e sexo (soma tem que bater), resumo do lote com taxas parciais, histórico do lote.
7. **Agendamentos** (só administrador) — agenda atividade (tipo, estágio, gaiolas, data, hora, responsável, repetição) e lista os próximos, com exclusão da série.
8. **Escala da equipe** (só administrador) — grade semana × colaborador, planejar dia (entrada/saída e atividades, que viram agendamentos `origem = 'escala'`), repetir nas próximas semanas.
9. **Relatório** — semana/mês/tudo, filtros por responsável e gaiola, grade semanal no formato da planilha (horário fora da janela em laranja), contagem por pessoa (base da planilha até 20/10 + dias na plataforma), observações, **PDF** e **CSV**.
10. **Desenvolvedor** — usuários e permissões (flags por linha), novo usuário, configurações (a lista de gaiolas vem daqui), histórico de alterações.

Situação de um agendamento é calculada no navegador: concluída/parcial se há registro com `agendamento_id`, atrasada se passou da data e hora, senão pendente. Se as tabelas novas não existirem no banco, o app avisa para rodar o `01_estrutura.sql` e o resto continua funcionando.

Regras de negócio: semana começa na **quarta** (como a planilha); janelas: adultos 10:00–18:00, larvas 15:00–18:00; "vezes que alimentou" = dias distintos com registro por pessoa.

## Identidade visual
Logo: mosquito verde em círculo (`assets/buglab-logo-original.png`); wordmark **BUG** (Archivo 800) + *lab* (Archivo 300 itálico). Verde principal `#3a8650` (claro) / `#5fb877` (escuro). Neutros levemente esverdeados. Todas as cores são tokens em `:root` com modo escuro por `prefers-color-scheme` e `[data-theme]`.

## Prévia (`privado/previa/`)
`mock.js` simula o Supabase em memória com os 6 usuários e dados de exemplo das telas novas (agendamentos da semana atual, escala, lote L-026). `python3 privado/previa/montar_previa.py` gera `buglab-previa.html` (arquivo único; o logo é embutido uma vez e preenche os `<img data-logo>`). No artifact do claude.ai, downloads passam pela capability `downloads`; por isso `baixar()` em `app.js` tenta `window.claude.use("downloads")` e cai para `<a download>` no site normal.

## Status e próximos passos
- [x] Repositório público <https://github.com/rctporto/buglab> (branch `main`); push via HTTPS com token clássico guardado no Keychain do Mac.
- [x] GitHub Pages ativo: <https://rctporto.github.io/buglab/>.
- [x] Projeto Supabase `BUGLAB` (us-east-1), `https://oovkoanznsaundopicnw.supabase.co`; `config.js` com a chave publishable (`sb_publishable_…`).
- [x] Cadastro aberto e "Confirm email" desligados; Site URL = endereço do Pages.
- [x] `01_estrutura.sql` e `02_usuarios_iniciais.sql` rodados (senhas iniciais aleatórias estão no próprio 02).
- [ ] Rodar de novo o `01_estrutura.sql` (27/10/2026: cria as tabelas das telas novas e tem grants explícitos para `authenticated`) e conferir em `information_schema.role_table_grants`.
- [ ] Testar no Supabase real: login, troca de senha, registro, edição, permissões, histórico, PDF.
- [ ] Domínio próprio depois (CNAME + Site URL no Supabase) — nada mais muda.

## Cuidados
- A prévia publicada no claude.ai está com link público e contém os logins; por isso o `02_usuarios_iniciais.sql` usa senhas iniciais aleatórias (não iguais ao login).
- Não commitar nada de `privado/`.
- Ao mudar o banco, manter `01_estrutura.sql` reexecutável (`if not exists`, `create or replace`, `drop policy if exists`).
