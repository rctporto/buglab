-- =====================================================================
-- BugLab · Controle de alimentação do insetário
-- 01_estrutura.sql — tabelas, regras de acesso, funções e dados iniciais
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo
-- inteiro → Run. Pode ser executado de novo sem duplicar dados.
-- Este arquivo NÃO contém senhas e pode ficar no repositório público.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Perfil de cada pessoa (complementa o usuário de login do Supabase)
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  login         text not null unique,
  nome          text not null,
  papel         text not null default 'usuario' check (papel in ('desenvolvedor','usuario')),
  permissoes    jsonb not null default '{}'::jsonb,
  ativo         boolean not null default true,
  trocar_senha  boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Registros de alimentação / manejo
create table if not exists public.registros (
  id             uuid primary key default gen_random_uuid(),
  data           date not null,
  hora           text not null default '',
  responsavel    text not null,
  alvos          text[] not null default '{}',
  atividades     text[] not null default '{}',
  ovos           text not null default '',
  obs            text not null default '',
  origem         text,
  autor          uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz
);
create index if not exists registros_data_idx on public.registros (data);

-- Configurações gerais (uma linha só)
create table if not exists public.config (
  id     int primary key default 1 check (id = 1),
  dados  jsonb not null
);

-- Histórico de alterações (preenchido automaticamente)
create table if not exists public.historico (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  usuario   uuid,
  login     text,
  acao      text not null,
  tabela    text not null,
  alvo      text,
  detalhes  jsonb
);
create index if not exists historico_quando_idx on public.historico (quando desc);

-- ---------------------------------------------------------------------
-- 2. Funções auxiliares de permissão
-- ---------------------------------------------------------------------

create or replace function public.eh_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

create or replace function public.eh_dev() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and papel = 'desenvolvedor');
$$;

-- Desenvolvedor tem todas as permissões; usuário depende das flags
create or replace function public.tem_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and ativo
      and (papel = 'desenvolvedor' or coalesce((permissoes ->> p)::boolean, false))
  );
$$;

-- Permissões padrão de cada perfil
create or replace function public.perms_padrao(p_papel text) returns jsonb
language sql immutable as $$
  select case when p_papel = 'desenvolvedor' then
    '{"registrar":true,"editar_proprios":true,"editar_todos":true,"ver_relatorio":true,"exportar":true}'::jsonb
  else
    '{"registrar":true,"editar_proprios":true,"editar_todos":false,"ver_relatorio":true,"exportar":true}'::jsonb
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. Regras de acesso (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.perfis    enable row level security;
alter table public.registros enable row level security;
alter table public.config    enable row level security;
alter table public.historico enable row level security;

-- Perfis: cada um vê o próprio; desenvolvedores veem todos.
-- Alterações só pelas funções admin_* abaixo.
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_dev());

-- Registros: qualquer usuário ativo lê; gravar depende das flags
drop policy if exists registros_ler on public.registros;
create policy registros_ler on public.registros for select to authenticated
  using (public.eh_ativo());

drop policy if exists registros_criar on public.registros;
create policy registros_criar on public.registros for insert to authenticated
  with check (public.tem_perm('registrar') and autor = auth.uid());

drop policy if exists registros_editar on public.registros;
create policy registros_editar on public.registros for update to authenticated
  using (public.tem_perm('editar_todos') or (public.tem_perm('editar_proprios') and autor = auth.uid()))
  with check (public.tem_perm('editar_todos') or (public.tem_perm('editar_proprios') and autor = auth.uid()));

drop policy if exists registros_excluir on public.registros;
create policy registros_excluir on public.registros for delete to authenticated
  using (public.tem_perm('editar_todos') or (public.tem_perm('editar_proprios') and autor = auth.uid()));

-- Configurações: todos os ativos leem; só desenvolvedores alteram
drop policy if exists config_ler on public.config;
create policy config_ler on public.config for select to authenticated
  using (public.eh_ativo());

drop policy if exists config_editar on public.config;
create policy config_editar on public.config for update to authenticated
  using (public.eh_dev()) with check (public.eh_dev());

-- Histórico: só desenvolvedores leem; ninguém grava direto
drop policy if exists historico_ler on public.historico;
create policy historico_ler on public.historico for select to authenticated
  using (public.eh_dev());

revoke all on public.perfis, public.registros, public.config, public.historico from anon;
-- Acesso de quem está logado (as regras acima filtram as linhas). Explícito porque
-- projetos novos do Supabase podem não liberar tabelas novas automaticamente.
grant select, insert, update, delete on public.registros to authenticated;
grant select, update on public.config to authenticated;
grant select on public.perfis, public.historico to authenticated;

-- ---------------------------------------------------------------------
-- 4. Gatilhos: autor fixo, data de edição e histórico
-- ---------------------------------------------------------------------

create or replace function public.registros_ao_editar() returns trigger
language plpgsql as $$
begin
  new.autor := old.autor;
  new.criado_em := old.criado_em;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists registros_ao_editar on public.registros;
create trigger registros_ao_editar before update on public.registros
  for each row execute function public.registros_ao_editar();

create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_login text;
  v_alvo  text;
  v_det   jsonb;
begin
  select login into v_login from perfis where id = auth.uid();

  if tg_table_name = 'registros' then
    if tg_op = 'DELETE' then v_alvo := to_char(old.data, 'DD/MM/YYYY') || ' · ' || old.responsavel;
    else v_alvo := to_char(new.data, 'DD/MM/YYYY') || ' · ' || new.responsavel; end if;
  elsif tg_table_name = 'perfis' then
    if tg_op = 'DELETE' then v_alvo := old.login; else v_alvo := new.login; end if;
  else
    v_alvo := 'Configurações';
  end if;

  if tg_op = 'INSERT' then v_det := to_jsonb(new);
  elsif tg_op = 'DELETE' then v_det := to_jsonb(old);
  else v_det := jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new));
  end if;

  insert into historico (usuario, login, acao, tabela, alvo, detalhes)
  values (auth.uid(), coalesce(v_login, 'sistema'), lower(tg_op), tg_table_name, v_alvo, v_det);

  return coalesce(new, old);
end $$;

drop trigger if exists historico_registros on public.registros;
create trigger historico_registros after insert or update or delete on public.registros
  for each row execute function public.registrar_historico();

drop trigger if exists historico_perfis on public.perfis;
create trigger historico_perfis after insert or update or delete on public.perfis
  for each row execute function public.registrar_historico();

drop trigger if exists historico_config on public.config;
create trigger historico_config after update on public.config
  for each row execute function public.registrar_historico();

-- ---------------------------------------------------------------------
-- 5. Gestão de usuários
--    Login "nome.sobrenome" vira o e-mail interno nome.sobrenome@buglab.local
--    (nenhum e-mail é enviado; serve só para o Supabase identificar a conta)
-- ---------------------------------------------------------------------

-- Função interna: só pode ser chamada pelo SQL Editor ou pelas funções admin
create or replace function public._criar_usuario(
  p_login text, p_nome text, p_senha text, p_papel text, p_perms jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text;
begin
  p_login := lower(trim(p_login));
  p_nome  := trim(p_nome);
  if p_login !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Login inválido: use letras minúsculas, números, ponto, hífen ou sublinhado (3 a 40 caracteres).';
  end if;
  if coalesce(p_nome, '') = '' then raise exception 'Informe o nome da pessoa.'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  if p_papel not in ('desenvolvedor', 'usuario') then raise exception 'Perfil inválido.'; end if;
  if exists (select 1 from perfis where login = p_login) then
    raise exception 'Já existe um usuário com o login %.', p_login;
  end if;

  v_email := p_login || '@buglab.local';
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Já existe uma conta de acesso para %.', p_login;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('login', p_login, 'nome', p_nome), now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into perfis (id, login, nome, papel, permissoes, ativo, trocar_senha)
  values (v_id, p_login, p_nome, p_papel,
          coalesce(p_perms, perms_padrao(p_papel)), true, true);

  return v_id;
end $$;
revoke all on function public._criar_usuario(text, text, text, text, jsonb) from public, anon, authenticated;

-- Criar usuário (aba Desenvolvedor)
create or replace function public.admin_criar_usuario(
  p_login text, p_nome text, p_senha text, p_papel text, p_perms jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not eh_dev() then raise exception 'Apenas desenvolvedores podem criar usuários.'; end if;
  return _criar_usuario(p_login, p_nome, p_senha, p_papel, p_perms);
end $$;

-- Listar usuários com último acesso
create or replace function public.admin_listar_usuarios()
returns table (id uuid, login text, nome text, papel text, permissoes jsonb,
               ativo boolean, trocar_senha boolean, ultimo_acesso timestamptz, criado_em timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not eh_dev() then raise exception 'Apenas desenvolvedores podem ver a lista de usuários.'; end if;
  return query
    select p.id, p.login, p.nome, p.papel, p.permissoes, p.ativo, p.trocar_senha,
           u.last_sign_in_at, p.criado_em
    from perfis p join auth.users u on u.id = p.id
    order by p.papel, p.nome;
end $$;

-- Alterar nome, perfil, permissões e situação
create or replace function public.admin_atualizar_usuario(
  p_id uuid, p_nome text, p_papel text, p_perms jsonb, p_ativo boolean
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not eh_dev() then raise exception 'Apenas desenvolvedores podem alterar usuários.'; end if;
  if p_id = auth.uid() and (p_papel <> 'desenvolvedor' or not p_ativo) then
    raise exception 'Você não pode remover o seu próprio acesso de desenvolvedor.';
  end if;
  if p_papel not in ('desenvolvedor', 'usuario') then raise exception 'Perfil inválido.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da pessoa.'; end if;

  update perfis set nome = trim(p_nome), papel = p_papel,
                    permissoes = coalesce(p_perms, perms_padrao(p_papel)), ativo = p_ativo
  where id = p_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;

  -- Usuário desativado não consegue mais entrar
  update auth.users
     set banned_until = case when p_ativo then null else 'infinity'::timestamptz end,
         updated_at = now()
   where id = p_id;
end $$;

-- Redefinir a senha de alguém (a pessoa troca no próximo acesso)
create or replace function public.admin_definir_senha(p_id uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not eh_dev() then raise exception 'Apenas desenvolvedores podem redefinir senhas.'; end if;
  if length(coalesce(p_senha, '')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
   where id = p_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  update perfis set trocar_senha = true where id = p_id;
end $$;

-- Excluir usuário (os registros feitos por ele continuam)
create or replace function public.admin_excluir_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not eh_dev() then raise exception 'Apenas desenvolvedores podem excluir usuários.'; end if;
  if p_id = auth.uid() then raise exception 'Você não pode excluir o seu próprio usuário.'; end if;
  delete from auth.users where id = p_id;
end $$;

-- Trocar a própria senha (obrigatório no primeiro acesso)
create or replace function public.trocar_minha_senha(p_atual text, p_nova text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_hash  text;
  v_login text;
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  select login into v_login from perfis where id = auth.uid();
  if v_hash is null or v_hash <> extensions.crypt(p_atual, v_hash) then
    raise exception 'A senha atual está incorreta.';
  end if;
  if length(coalesce(p_nova, '')) < 8 then raise exception 'A nova senha precisa ter pelo menos 8 caracteres.'; end if;
  if lower(p_nova) = lower(v_login) then raise exception 'A nova senha não pode ser igual ao login.'; end if;
  if p_nova = p_atual then raise exception 'A nova senha precisa ser diferente da atual.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_nova, extensions.gen_salt('bf')), updated_at = now()
   where id = auth.uid();
  update perfis set trocar_senha = false where id = auth.uid();
end $$;

revoke all on function public.admin_criar_usuario(text, text, text, text, jsonb) from public, anon;
revoke all on function public.admin_listar_usuarios() from public, anon;
revoke all on function public.admin_atualizar_usuario(uuid, text, text, jsonb, boolean) from public, anon;
revoke all on function public.admin_definir_senha(uuid, text) from public, anon;
revoke all on function public.admin_excluir_usuario(uuid) from public, anon;
revoke all on function public.trocar_minha_senha(text, text) from public, anon;
grant execute on function public.admin_criar_usuario(text, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_listar_usuarios() to authenticated;
grant execute on function public.admin_atualizar_usuario(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_definir_senha(uuid, text) to authenticated;
grant execute on function public.admin_excluir_usuario(uuid) to authenticated;
grant execute on function public.trocar_minha_senha(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Atualização ao vivo dos registros entre as telas abertas
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null;
          when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 7. Configuração inicial
-- ---------------------------------------------------------------------
insert into public.config (id, dados) values (1, '{
  "alvos": ["Gaiola 1", "Gaiola 2", "Gaiola 3", "Larvas"],
  "inicioSemana": 3,
  "janelas": {"adultos": ["10:00", "18:00"], "larvas": ["15:00", "18:00"]},
  "base": {"desde": "2026-09-12", "ate": "2026-10-20",
           "contagem": {"Romana Apel": 15, "Amanda Schramm": 13, "Kerolyn": 13}}
}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 8. Registros da planilha (14/10 a 20/10/2026)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.registros where origem = 'planilha') then return; end if;
  insert into public.registros (data, hora, responsavel, alvos, atividades, ovos, obs, origem, autor) values
  ('2026-10-14','17:55','Amanda Schramm', array['Gaiola 1','Gaiola 2','Gaiola 3'], array['agua'], 'nao',
     'Agora temos 3 gaiolas. Sem presença de ovos. Não possuímos mais larvas: as que estavam na BOD foram levadas para realização do MEV.', 'planilha', null),
  ('2026-10-15','14:50','Kerolyn', array[]::text[], array['jejum'], '',
     '1 gaiola em jejum para alimentação com sangue (gaiola não identificada na planilha).', 'planilha', null),
  ('2026-10-15','15:00','Kerolyn', array['Gaiola 1','Gaiola 2','Gaiola 3'], array['agua'], '',
     'Água trocada em todas as gaiolas. Troca de comida em 2 gaiolas (não identificadas na planilha).', 'planilha', null),
  ('2026-10-15','16:30','Romana Apel', array['Gaiola 1','Gaiola 2'], array['repasto'], '',
     'Repasto sanguíneo feito às 16:30.', 'planilha', null),
  ('2026-10-15','19:30','Romana Apel', array['Gaiola 1','Gaiola 2'], array['repasto_rem'], '',
     'Repasto removido às 19:30.', 'planilha', null),
  ('2026-10-16','10:00','Kerolyn', array['Gaiola 1'], array['comida','agua'], '',
     'Deixei solução açucarada pronta na geladeira, está identificada. Tinha bastante água de ontem também, não está evaporando como na BOD.', 'planilha', null),
  ('2026-10-16','10:05','Kerolyn', array['Gaiola 2'], array['comida','agua'], '', '', 'planilha', null),
  ('2026-10-16','10:10','Kerolyn', array['Gaiola 3'], array['comida','agua'], '', '', 'planilha', null),
  ('2026-10-17','17:00','Romana Apel', array['Gaiola 1','Gaiola 2','Gaiola 3'], array['agua'], '',
     'Apenas a troca de água e alimentação das larvas.', 'planilha', null),
  ('2026-10-17','17:00','Romana Apel', array['Larvas'], array['larva_alim'], '', '', 'planilha', null),
  ('2026-10-18','18:40','Romana Apel', array['Gaiola 1','Gaiola 2'], array['comida'], '', '', 'planilha', null),
  ('2026-10-18','18:00','Romana Apel', array['Larvas'], array['larva_alim'], '', 'Larvas se desenvolvendo bem.', 'planilha', null),
  ('2026-10-19','16:30','Amanda Schramm', array['Gaiola 1','Gaiola 2','Gaiola 3'], array['agua_add'], '', '', 'planilha', null),
  ('2026-10-19','','Amanda Schramm', array['Gaiola 1','Gaiola 2'], array['papel'], '', 'Troca de papéis para ovos.', 'planilha', null),
  ('2026-10-19','16:40','Amanda Schramm', array['Larvas'], array['larva_alim'], '', 'Alimentação regular.', 'planilha', null),
  ('2026-10-20','','Romana Apel', array['Gaiola 1','Gaiola 2','Gaiola 3'], array['agua'], '', '', 'planilha', null),
  ('2026-10-20','18:00','Romana Apel', array['Larvas'], array['larva_agua','larva_alim'], '', '', 'planilha', null);
end $$;
