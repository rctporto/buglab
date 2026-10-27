/* BugLab · Gestão do insetário
   Front-end estático + Supabase (login, banco e regras de acesso).
   Telas: Dashboard, Calendário, Registro diário, Registro da criação, Agendamentos, Escala, Relatório e Desenvolvedor. */
(() => {
"use strict";

/* =================== constantes =================== */
const ATIV = [
  ["agua","Troca de água"],["agua_add","Adição de água"],["comida","Troca de comida (açúcar)"],
  ["repasto","Repasto sanguíneo"],["repasto_rem","Remoção do repasto"],["jejum","Jejum"],
  ["papel","Troca de papel para ovos"],["larva_alim","Alimentação das larvas"],["larva_agua","Troca de água das larvas"]
];
const ATIV_L = Object.fromEntries(ATIV);
const PERMS = [
  ["registrar","Lançar registros"],
  ["editar_proprios","Editar e excluir os próprios registros"],
  ["editar_todos","Editar e excluir registros de outras pessoas"],
  ["ver_relatorio","Ver o relatório"],
  ["exportar","Gerar PDF e CSV"]
];
const PERMS_PADRAO = {
  desenvolvedor:{registrar:true,editar_proprios:true,editar_todos:true,ver_relatorio:true,exportar:true},
  usuario:{registrar:true,editar_proprios:true,editar_todos:false,ver_relatorio:true,exportar:true}
};
const PAPEL_L = {desenvolvedor:"Desenvolvedor", usuario:"Usuário"};
const DEFAULT_CFG = {
  alvos:["Gaiola 1","Gaiola 2","Gaiola 3","Larvas"], inicioSemana:3,
  janelas:{adultos:["10:00","18:00"],larvas:["15:00","18:00"]},
  base:{desde:"2026-09-12",ate:"2026-10-20",contagem:{}}
};
const DOW = ["dom","seg","ter","qua","qui","sex","sáb"];
const DOWL = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TIPO_L = {alimentacao:"Alimentação", verificacao:"Verificação"};
const ESTAGIOS = [["ovos","Ovos"],["larvas","Larvas"],["pupas","Pupas"],["adultos","Adultos"]];
const ESTAGIO_L = Object.fromEntries(ESTAGIOS);
const STATUS_L = {concluida:"Concluída", parcial:"Parcial", pendente:"Pendente", atrasada:"Atrasada"};
const SIT_L = {acompanhamento:"Em acompanhamento", encerrado:"Encerrado", descartado:"Descartado"};

/* =================== utilidades =================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (t,a={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(v===true)e.setAttribute(k,"");else e.setAttribute(k,v)}for(const k of kids)if(k!=null)e.append(k);return e};
const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
const br = s => { const [,m,d]=s.split("-"); return `${d}/${m}`; };
const brFull = s => { const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; };
const addDays = (s,n) => { const d=parse(s); d.setDate(d.getDate()+n); return iso(d); };
const addMonths = (ym,n) => { const [y,m]=ym.split("-").map(Number); const d=new Date(y,m-1+n,1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; };
const todayIso = () => iso(new Date());
const weekOf = s => { const d=parse(s); const diff=(d.getDay()-cfg.inicioSemana+7)%7; d.setDate(d.getDate()-diff); return iso(d); };
const isLarva = a => /larva/i.test(a);
const abbr = a => isLarva(a) ? "L" : a.replace(/^Gaiola\s*/i,"G");
const outOfWindow = (alvo,hora) => { if(!hora) return false; const w = isLarva(alvo)?cfg.janelas.larvas:cfg.janelas.adultos; return hora < w[0] || hora > w[1]; };
const norm = s => (s||"").trim().replace(/\s+/g," ");
const sortRecs = arr => [...arr].sort((a,b)=> (a.data+(a.hora||"99")).localeCompare(b.data+(b.hora||"99")));
const byDate = () => { const m={}; records.forEach(r=>{(m[r.data]||(m[r.data]=[])).push(r)}); return m; };
const fmtDT = ts => { if(!ts) return "—"; const d=new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mondayOf = s => addDays(s, -((parse(s).getDay()+6)%7));
const nowHM = () => { const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nowIso = () => `${todayIso()}T${nowHM()}`;
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const fmtN = n => n==null ? "—" : Number(n).toLocaleString("pt-BR");
const mesNome = ym => { const [y,m]=ym.split("-").map(Number); return `${MESES[m-1]} de ${y}`; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));
function fillSelect(sel, opts, val){ sel.replaceChildren(...opts.map(([v,l])=>el("option",{value:v,text:l}))); if(opts.some(o=>o[0]===val)) sel.value=val; }
const errMsg = e => (e && (e.message || e.error_description)) || "Erro inesperado.";

const SVGNS="http://www.w3.org/2000/svg";
const ico = n => { const s=document.createElementNS(SVGNS,"svg"); s.setAttribute("class","i"); s.setAttribute("aria-hidden","true"); const u=document.createElementNS(SVGNS,"use"); u.setAttribute("href","#i-"+n); s.append(u); return s; };
const statCard = ([n,l,ic,tone]) => el("div",{class:"stat"+(tone?" "+tone:"")},el("span",{class:"ic"},ico(ic)),el("div",{},el("b",{class:"mono",text:String(n)}),el("span",{text:l})));
const iniciais = nome => { const p=norm(nome).split(" ").filter(Boolean); return ((p[0]||"?")[0]+(p.length>1?p.at(-1)[0]:"")).toUpperCase(); };

function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2800);}
function notice(msg){const n=$("#notice");n.textContent=msg||"";n.hidden=!msg;}

/* =================== estado =================== */
const CONF = window.BUGLAB_CONFIG || {};
let sb = null, uid = null, perfil = null;
let cfg = structuredClone(DEFAULT_CFG);
let records = [], loaded = false, channel = null;
let current = "calendario";
let agendas = [], escalas = [], lotes = [], placas = [], criacao = [], equipe = [], novasOk = true;
let rMode = "semana", rAnchor = null, rPicked = false;
let editingId = null;
let logoDataUrl = null;

const isDev = () => perfil && perfil.papel === "desenvolvedor";
const can = p => !!perfil && (isDev() || !!(perfil.permissoes||{})[p]);
const canEditRec = r => can("editar_todos") || (can("editar_proprios") && r.autor && r.autor === uid);

/* =================== tema =================== */
const SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function effectiveTheme(){ const a=document.documentElement.getAttribute("data-theme"); if(a==="dark"||a==="light") return a; return matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"; }
function paintThemeBtn(){ const dark=effectiveTheme()==="dark"; $$("[data-theme-btn]").forEach(b=>{b.innerHTML=(dark?MOON:SUN)+`<span>${dark?"Tema escuro":"Tema claro"}</span>`;b.setAttribute("aria-pressed",String(dark));}); }
$$("[data-theme-btn]").forEach(b=>b.onclick=()=>{ const t=effectiveTheme()==="dark"?"light":"dark"; document.documentElement.setAttribute("data-theme",t); try{localStorage.setItem("buglab-tema",t)}catch(e){} paintThemeBtn(); });
try{ matchMedia("(prefers-color-scheme: dark)").addEventListener("change",paintThemeBtn); }catch(e){}
paintThemeBtn();

/* =================== telas de acesso =================== */
function showScreen(name){
  $("#tela-login").hidden = name!=="login";
  $("#tela-senha").hidden = name!=="senha";
  $("#app").hidden = name!=="app";
  document.body.classList.toggle("in-app", name==="app");
}
$$(".pw-toggle").forEach(b=>b.onclick=()=>{const i=document.getElementById(b.dataset.pw);const show=i.type==="password";i.type=show?"text":"password";b.replaceChildren(ico(show?"eye-off":"eye"));b.setAttribute("aria-label",show?"Ocultar senha":"Mostrar senha");});
// "Manter conectado": a sessão fica no localStorage (sobrevive ao fechar o navegador) ou só no sessionStorage
const lerManter = () => { try{ return localStorage.getItem("buglab-manter")!=="0"; }catch(e){ return true; } };
const sessaoStore = {
  getItem:k=>{ try{ return localStorage.getItem(k) ?? sessionStorage.getItem(k); }catch(e){ return null; } },
  setItem:(k,v)=>{ try{ const m=lerManter(); (m?localStorage:sessionStorage).setItem(k,v); (m?sessionStorage:localStorage).removeItem(k); }catch(e){} },
  removeItem:k=>{ try{ localStorage.removeItem(k); sessionStorage.removeItem(k); }catch(e){} }
};
$("#l-manter").checked = lerManter();
$("#l-esqueci").onclick=()=>{ const a=$("#l-ajuda"); a.hidden=!a.hidden; $("#l-esqueci").setAttribute("aria-expanded",String(!a.hidden)); };
$$("[data-sair]").forEach(b=>b.onclick=async()=>{ try{ await sb.auth.signOut(); }catch(e){} location.hash=""; location.reload(); });

$("#login-form").addEventListener("submit", async e=>{
  e.preventDefault();
  const err=$("#l-err"); err.textContent="";
  if(!sb){ err.textContent="O sistema ainda não foi configurado (arquivo config.js)."; return; }
  const login=norm($("#l-login").value).toLowerCase(), senha=$("#l-senha").value;
  if(!login||!senha){ err.textContent="Preencha login e senha."; return; }
  try{ localStorage.setItem("buglab-manter", $("#l-manter").checked?"1":"0"); }catch(e){}
  const btn=$("#l-btn"); btn.disabled=true; btn.textContent="Entrando…";
  try{
    const email = login.includes("@") ? login : `${login}@${CONF.dominioLogin||"buglab.local"}`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if(error){
      const m=(error.message||"").toLowerCase();
      err.textContent = m.includes("banned") ? "Este usuário está desativado. Fale com um desenvolvedor." : "Login ou senha incorretos.";
      return;
    }
    await afterLogin(data.user);
  }catch(x){ err.textContent="Não foi possível conectar. Verifique a internet e tente de novo."; }
  finally{ btn.disabled=false; btn.textContent="Entrar"; }
});

async function afterLogin(user){
  uid = user.id;
  const { data, error } = await sb.from("perfis").select("*").eq("id", uid).maybeSingle();
  if(error || !data || !data.ativo){
    await sb.auth.signOut();
    showScreen("login");
    $("#l-err").textContent = !data ? "Este login não tem perfil no sistema. Fale com um desenvolvedor." : "Este usuário está desativado. Fale com um desenvolvedor.";
    return;
  }
  perfil = data;
  if(perfil.trocar_senha){ showScreen("senha"); $("#s-atual").focus(); return; }
  enterApp();
}

$("#senha-form").addEventListener("submit", async e=>{
  e.preventDefault();
  const err=$("#s-err"); err.textContent="";
  const a=$("#s-atual").value, n=$("#s-nova").value, c=$("#s-conf").value;
  if(!a||!n){ err.textContent="Preencha a senha atual e a nova."; return; }
  if(n.length<8){ err.textContent="A nova senha precisa ter pelo menos 8 caracteres."; return; }
  if(n!==c){ err.textContent="A confirmação não confere com a nova senha."; return; }
  const btn=$("#s-btn"); btn.disabled=true; btn.textContent="Salvando…";
  const { error } = await sb.rpc("trocar_minha_senha", { p_atual:a, p_nova:n });
  btn.disabled=false; btn.textContent="Salvar nova senha";
  if(error){ err.textContent=errMsg(error); return; }
  perfil.trocar_senha=false; $("#senha-form").reset(); toast("Senha criada");
  enterApp();
});

/* =================== entrada no sistema =================== */
async function enterApp(){
  showScreen("app");
  $("#me-nome").textContent = perfil.nome;
  $("#me-papel").textContent = isDev() ? "Administrador" : (PAPEL_L[perfil.papel] || perfil.papel);
  $$("[data-avatar]").forEach(a=>{ a.textContent=iniciais(perfil.nome); a.title=perfil.nome; });
  $("#cal-add").hidden = !can("registrar");
  ["dev","dashboard","agendamentos","escala"].forEach(v=>$("#tab-"+v).hidden=!isDev());
  $("#tab-relatorio").hidden = !can("ver_relatorio");
  $("#pdf").hidden = $("#csv").hidden = !can("exportar");
  $("#cr-novo-lote").hidden = !can("registrar");
  const h=(location.hash||"").replace("#","");
  buildForm(); resetForm(todayIso());
  show(VIEWS.includes(h) && tabAllowed(h) ? h : (isDev() ? "dashboard" : "calendario"));
  await Promise.all([loadConfig(), loadRecords(), loadNovas(), isDev()?loadEquipe():null]);
  subscribe();
  loadLogo();
}
async function loadConfig(){
  const { data } = await sb.from("config").select("dados").eq("id",1).maybeSingle();
  cfg = {...structuredClone(DEFAULT_CFG), ...((data&&data.dados)||{})};
  const chk=$$("#f-ativ input:checked").map(i=>i.value);
  buildForm(); $$("#f-ativ input").forEach(i=>{ if(chk.includes(i.value)) i.checked=true; });
  renderCurrent();
}
async function fetchAll(table, order){
  const all=[]; let from=0; const step=1000;
  for(;;){
    const { data, error } = await sb.from(table).select("*").order(order||"criado_em",{ascending:true}).range(from, from+step-1);
    if(error) return { error };
    all.push(...data); if(data.length<step) break; from+=step;
  }
  return { data: all };
}
async function loadRecords(){
  const { data, error } = await fetchAll("registros","data");
  if(error){ notice("Não foi possível carregar os registros. Recarregue a página."); return; }
  records = data.map(r=>({...r, hora:r.hora||"", alvos:r.alvos||[], atividades:r.atividades||[], obs:r.obs||"", ovos:r.ovos||"", gaiolas:Array.isArray(r.gaiolas)?r.gaiolas:[]}));
  loaded = true;
  if(!rPicked && records.length && !records.some(r=>r.data>=weekOf(todayIso()))) rAnchor = sortRecs(records).at(-1).data;
  buildTeam(); renderCurrent();
}
// Tabelas das telas novas (agendamentos, escala e criação). Se o banco ainda não foi atualizado, avisa e segue com o resto.
async function loadNovas(){
  const res = await Promise.all([fetchAll("agendamentos","data"), fetchAll("escala","data"), fetchAll("lotes"), fetchAll("placas"), fetchAll("criacao_registros","data")]);
  const falhou = res.find(r=>r.error);
  if(falhou){
    novasOk = false;
    notice(isDev() ? "As telas novas precisam das tabelas novas no banco: rode de novo o arquivo supabase/01_estrutura.sql no SQL Editor do Supabase." : "Algumas telas ainda estão sendo preparadas. Fale com um administrador.");
    renderCurrent(); return;
  }
  novasOk = true; if(/01_estrutura/.test($("#notice").textContent)) notice("");
  [agendas, escalas, lotes, placas, criacao] = res.map(r=>r.data);
  agendas.forEach(a=>{ a.gaiolas=a.gaiolas||[]; a.hora=a.hora||""; });
  renderCurrent();
}
async function loadEquipe(){
  const { data } = await sb.rpc("admin_listar_usuarios");
  equipe = (data||[]).filter(u=>u.ativo).sort((a,b)=>a.nome.localeCompare(b.nome,"pt"));
  renderCurrent();
}
async function loadLogo(){
  try{ const b=await (await fetch("logo.png")).blob(); logoDataUrl=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);}); }catch(e){}
}
let reloadT=null, reloadNovasT=null;
function scheduleReload(){ clearTimeout(reloadT); reloadT=setTimeout(loadRecords, 400); }
function scheduleNovas(){ clearTimeout(reloadNovasT); reloadNovasT=setTimeout(loadNovas, 400); }
function subscribe(){
  try{
    channel = sb.channel("buglab").on("postgres_changes",{event:"*",schema:"public",table:"registros"}, scheduleReload);
    ["agendamentos","escala","lotes","placas","criacao_registros"].forEach(t=>channel.on("postgres_changes",{event:"*",schema:"public",table:t}, scheduleNovas));
    channel.subscribe();
  }catch(e){}
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ scheduleReload(); scheduleNovas(); } });
}
const precisaBanco = () => { if(novasOk) return false; toast("Atualize o banco (01_estrutura.sql) para usar esta função."); return true; };

/* =================== navegação =================== */
const VIEWS=["dashboard","calendario","registro","criacao","agendamentos","escala","relatorio","dev"];
const tabAllowed = v => ["dev","dashboard","agendamentos","escala"].includes(v) ? isDev() : v==="relatorio" ? can("ver_relatorio") : true;
function show(view){
  if(!tabAllowed(view)) view="calendario";
  current=view;
  for(const v of VIEWS){ $("#view-"+v).hidden = v!==view; $("#tab-"+v).setAttribute("aria-selected", String(v===view)); }
  try{ history.replaceState(null,"","#"+view); }catch(e){}
  renderCurrent(); window.scrollTo({top:0});
}
VIEWS.forEach(v=>$("#tab-"+v).onclick=()=>show(v));
function renderCurrent(){
  ({dashboard:renderDashboard, calendario:renderCalendar, registro:renderDay, criacao:renderCriacao,
    agendamentos:renderAgendamentos, escala:renderEscala, relatorio:renderReport, dev:renderDev}[current]||(()=>{}))();
}
function openRegistro(d, agId){ if(editingId) cancelEdit(); resetForm(d, agId); show("registro"); }

/* =================== atividades (agendadas + registradas) =================== */
const regTipo = r => r.tipo || "alimentacao";
const regEstagio = r => r.estagio || (r.alvos.some(isLarva) ? "larvas" : "adultos");
const regGaiolas = r => r.gaiolas.length ? r.gaiolas : r.alvos.map(g=>({gaiola:g,situacao:"realizada",obs:""}));
const parcial = r => regGaiolas(r).some(g=>g.situacao==="nao_realizada");
const agendaById = id => agendas.find(a=>a.id===id);
function agStatus(a){
  const rs=records.filter(r=>r.agendamento_id===a.id);
  if(rs.length) return rs.some(parcial) ? "parcial" : "concluida";
  return `${a.data}T${a.hora||"23:59"}` < nowIso() ? "atrasada" : "pendente";
}
function activities(de, ate){
  const out=[];
  agendas.forEach(a=>{ if(a.data>=de && a.data<=ate) out.push({k:"ag", id:a.id, data:a.data, hora:a.hora, tipo:a.tipo, estagio:a.estagio, gaiolas:a.gaiolas, resp:a.responsavel, respId:a.responsavel_id, status:agStatus(a), obs:a.obs, ag:a}); });
  records.forEach(r=>{ if(r.data>=de && r.data<=ate && !(r.agendamento_id && agendaById(r.agendamento_id)))
    out.push({k:"reg", id:r.id, data:r.data, hora:r.hora, tipo:regTipo(r), estagio:regEstagio(r), gaiolas:regGaiolas(r).map(g=>g.gaiola), resp:r.responsavel, respId:r.autor, status:parcial(r)?"parcial":"concluida", obs:r.obs, reg:r}); });
  return out.sort((x,y)=>(x.data+(x.hora||"99")).localeCompare(y.data+(y.hora||"99")));
}
const actKey = a => a.k+":"+a.id;
const feita = a => a.status==="concluida" || a.status==="parcial";
const gaiolasTxt = g => !g.length ? "" : g.length===1 ? g[0] : `${g.length} gaiolas`;
const actTitle = a => `${TIPO_L[a.tipo]} · ${ESTAGIO_L[a.estagio].toLowerCase()}`;
function statusPill(st, agendada){
  const ic={concluida:"check",parcial:"alert",pendente:"clock",atrasada:"alert"}[st];
  return el("span",{class:"st "+(agendada&&st==="pendente"?"agendada":st)},ico(ic),document.createTextNode(agendada&&st==="pendente"?"Agendada":STATUS_L[st]));
}
function filterActs(list, f){
  if(f==="minhas") return list.filter(a=>a.respId===uid || norm(a.resp)===perfil.nome);
  if(f==="pendentes") return list.filter(a=>!feita(a));
  if(f) return list.filter(a=>a.tipo===f);
  return list;
}

/* =================== dashboard =================== */
let dbData=null, dbPlaca="", dbMes="";
function renderDashboard(){
  if(!isDev()) return;
  if(!dbData) dbData=todayIso();
  $("#db-data").value=dbData;
  const acts=activities(dbData,dbData);
  $("#db-stats").replaceChildren(...[
    [acts.length,"Atividades do dia","file"],
    [acts.filter(feita).length,"Concluídas","check"],
    [acts.filter(a=>a.status==="pendente").length,"Pendentes","clock","a"],
    [acts.filter(a=>a.status==="atrasada").length,"Atrasadas","alert","d"]
  ].map(statCard));
  // filtros da criação
  const meses=[...new Set([todayIso().slice(0,7),...criacao.map(c=>c.data.slice(0,7))])].sort().reverse();
  if(!dbMes || !meses.includes(dbMes)) dbMes=dbData.slice(0,7);
  if(!meses.includes(dbMes)) meses.unshift(dbMes);
  fillSelect($("#db-mes"), meses.map(m=>[m,mesNome(m)]), dbMes);
  const esp=[...new Set(lotes.map(l=>l.especie))].sort();
  const espSel=$("#db-especie").value;
  fillSelect($("#db-especie"), [["","Todas as espécies"],...esp.map(e=>[e,e])], esp.includes(espSel)?espSel:"");
  const pl=placasOrdenadas().filter(p=>!$("#db-especie").value || loteDe(p).especie===$("#db-especie").value);
  if(!pl.some(p=>p.id===dbPlaca)) dbPlaca = (pl[0]||{}).id || "";
  fillSelect($("#db-placa"), pl.length?pl.map(p=>[p.id,placaNome(p)]):[["","Nenhum lote"]], dbPlaca);
  const p=placas.find(x=>x.id===dbPlaca);
  const sub = p ? `Lote ${loteDe(p).codigo} · Placa ${p.codigo}` : "";
  $("#db-conv-sub").replaceChildren(document.createTextNode(sub), p?el("span",{class:"st "+(p.situacao==="acompanhamento"?"pendente":"neutro"),text:SIT_L[p.situacao]}):"");
  $("#db-sexo-sub").textContent=sub;
  const vazio = msg => el("div",{class:"empty",text:msg});
  if(!p){
    const m = novasOk ? "Nenhum lote cadastrado ainda. Cadastre em Registro da criação." : "Atualize o banco para ver a criação.";
    ["#db-conv","#db-sexo","#db-emerg"].forEach(s=>$(s).replaceChildren(vazio(m)));
  } else {
    const t=totais(p.id);
    $("#db-conv").replaceChildren(convChart(p,t));
    $("#db-sexo").replaceChildren(t.adultos ? donut(t) : vazio("Ainda não há adultos contados nesta placa."));
    $("#db-emerg").replaceChildren(emergChart(p.id, dbMes));
  }
  // rotina do dia
  const tbl=$("#db-rotina"); tbl.replaceChildren(el("thead",{},el("tr",{},...["Atividade","Responsável","Situação"].map(h=>el("th",{text:h})))));
  const tb=el("tbody");
  if(!acts.length) tb.append(el("tr",{},el("td",{colspan:"3",class:"hint",text:"Nenhuma atividade nesta data."})));
  acts.slice(0,6).forEach(a=>tb.append(el("tr",{},el("td",{},el("b",{text:actTitle(a)}),el("div",{class:"hint",text:[a.hora,gaiolasTxt(a.gaiolas)].filter(Boolean).join(" · ")})),el("td",{text:a.resp||"—"}),el("td",{},statusPill(a.status)))));
  tbl.append(tb);
  $("#db-rotina-n").textContent = acts.length>6 ? `Exibindo 6 de ${acts.length} atividades.` : acts.length ? `${acts.length} atividade(s).` : "";
}
$("#db-data").onchange=e=>{ if(e.target.value){ dbData=e.target.value; renderDashboard(); } };
$("#db-mes").onchange=e=>{ dbMes=e.target.value; renderDashboard(); };
$("#db-especie").onchange=()=>{ dbPlaca=""; renderDashboard(); };
$("#db-placa").onchange=e=>{ dbPlaca=e.target.value; renderDashboard(); };
$("#db-ver-cal").onclick=()=>{ calAnchor=dbData; calMode="semana"; show("calendario"); };
const pct = (a,b) => b ? Math.round(a/b*100)+"%" : "—";
function convChart(p,t){
  const rows=[["Ovos",p.ovos_iniciais],["Larvas",t.larvas],["Pupas",t.pupas],["Adultos",t.adultos]];
  const max=Math.max(1,...rows.map(r=>r[1]||0));
  const box=el("div",{class:"conv"},el("p",{class:"mini-h",text:"Acumulado por estágio"}));
  rows.forEach(([l,v],i)=>{
    const bar=el("span",{class:"conv-fill s"+i}); bar.style.width=((v||0)/max*100)+"%";
    box.append(el("div",{class:"conv-row",title:`${l}: ${v==null?"não informado":fmtN(v)}`},el("span",{class:"conv-l",text:l}),el("span",{class:"conv-track"},bar),el("span",{class:"conv-v mono",text:v==null?"—":fmtN(v)})));
  });
  const k=el("div",{class:"kpis"});
  [[pct(t.larvas,p.ovos_iniciais),"Eclosão",p.ovos_iniciais?`${fmtN(t.larvas)} / ${fmtN(p.ovos_iniciais)}`:"sem contagem de ovos"],
   [pct(t.pupas,t.larvas),"Larvas → pupas",`${fmtN(t.pupas)} / ${fmtN(t.larvas)}`],
   [pct(t.adultos,t.pupas),"Pupas → adultos",`${fmtN(t.adultos)} / ${fmtN(t.pupas)}`]
  ].forEach(([v,l,s])=>k.append(el("div",{},el("b",{text:v}),el("span",{text:l}),el("small",{class:"mono",text:s}))));
  box.append(k);
  if(p.situacao==="acompanhamento") box.append(el("p",{class:"hint ic-line"},ico("info"),document.createTextNode("Taxas parciais enquanto o lote estiver em acompanhamento.")));
  return box;
}
function donut(t){
  const segs=[["Fêmeas",t.femeas,"f"],["Machos",t.machos,"m"],["Não identificado",t.naoid,"n"]];
  const R=70, C=2*Math.PI*R, gap=segs.filter(s=>s[1]>0).length>1 ? 2 : 0;
  const svg=document.createElementNS(SVGNS,"svg"); svg.setAttribute("viewBox","0 0 200 200"); svg.setAttribute("class","donut"); svg.setAttribute("role","img");
  svg.setAttribute("aria-label",segs.map(s=>`${s[0]} ${s[1]}`).join(", "));
  let off=0;
  segs.forEach(([l,v,c])=>{ if(!v) return; const len=v/t.adultos*C;
    const ci=document.createElementNS(SVGNS,"circle"); ci.setAttribute("cx","100"); ci.setAttribute("cy","100"); ci.setAttribute("r",String(R)); ci.setAttribute("class","seg "+c);
    ci.setAttribute("stroke-dasharray",`${Math.max(len-gap,0.5)} ${C}`); ci.setAttribute("stroke-dashoffset",String(-off)); ci.setAttribute("transform","rotate(-90 100 100)");
    const ti=document.createElementNS(SVGNS,"title"); ti.textContent=`${l}: ${v} (${(v/t.adultos*100).toFixed(1).replace(".",",")}%)`; ci.append(ti);
    svg.append(ci); off+=len; });
  const center=el("div",{class:"donut-c"},el("b",{text:fmtN(t.adultos)}),el("span",{text:"adultos"}));
  const leg=el("div",{class:"donut-leg"},...segs.map(([l,v,c])=>el("div",{},el("span",{class:"sw "+c}),el("div",{},el("b",{text:l}),el("span",{class:"mono",text:v?`${fmtN(v)} · ${(v/t.adultos*100).toFixed(1).replace(".",",")}%`:"0"})))));
  return el("div",{class:"donut-box"},el("div",{class:"donut-wrap"},svg,center),leg);
}
function emergChart(placaId, mes){
  const por={}; criacao.filter(c=>c.placa_id===placaId && c.data.startsWith(mes) && c.novos_adultos>0).forEach(c=>por[c.data]=(por[c.data]||0)+c.novos_adultos);
  const dias=Object.keys(por).sort().slice(-12);
  if(!dias.length) return el("div",{class:"empty",text:`Sem emergência de adultos em ${mesNome(mes).toLowerCase()} nesta placa.`});
  const max=Math.max(...dias.map(d=>por[d]));
  const box=el("div",{class:"vbars"});
  dias.forEach(d=>{ const b=el("span",{class:"vbar"}); b.style.height=(por[d]/max*100)+"%";
    box.append(el("div",{class:"vcol",title:`${brFull(d)}: ${por[d]} novos adultos`},el("span",{class:"vval mono",text:String(por[d])}),el("div",{class:"vtrack"},b),el("span",{class:"vlab mono",text:br(d)}))); });
  return el("div",{},box,el("p",{class:"hint center-t",text:mesNome(mes)}));
}

/* =================== calendário =================== */
let calMode="semana", calAnchor=null, calSel=null;
function renderCalendar(){
  if(!calAnchor) calAnchor=todayIso();
  const t=todayIso();
  const hoje=activities(t,t);
  $("#cal-stats").replaceChildren(...(loaded?[
    [hoje.length,"Atividades do dia","cal"],[hoje.filter(feita).length,"Concluídas","check"],[hoje.filter(a=>!feita(a)).length,"Pendentes","clock","a"]
  ]:[]).map(statCard));
  $$("#cal-modo button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cal===calMode)));
  const f=$("#cal-filtro").value;
  if(calMode==="semana") renderWeek(f); else renderMonth(f);
  renderCalSide();
}
function renderWeek(f){
  const ini=mondayOf(calAnchor), fim=addDays(ini,6), t=todayIso();
  const di=parse(ini), df=parse(fim);
  $("#cal-title").textContent = di.getMonth()===df.getMonth()
    ? `${di.getDate()} – ${df.getDate()} de ${MESES[df.getMonth()].toLowerCase()} de ${df.getFullYear()}`
    : `${di.getDate()} de ${MESES[di.getMonth()].toLowerCase()} – ${df.getDate()} de ${MESES[df.getMonth()].toLowerCase()} de ${df.getFullYear()}`;
  const acts=filterActs(activities(ini,fim),f);
  const days=[...Array(7)].map((_,i)=>addDays(ini,i));
  const horas=acts.filter(a=>a.hora).map(a=>Number(a.hora.slice(0,2)));
  const h0=Math.min(8,...horas), h1=Math.max(17,...horas);
  const tbl=el("table",{class:"wkcal"});
  tbl.append(el("thead",{},el("tr",{},el("th",{class:"hcol"}),...days.map(d=>{ const dt=parse(d); return el("th",{class:d===t?"today":null},el("span",{class:"dow",text:DOW[dt.getDay()]}),el("b",{text:pad(dt.getDate())})); }))));
  const tb=el("tbody");
  const linha=(rot, pega)=>{ const tr=el("tr",{},el("th",{class:"hcol mono",text:rot}));
    days.forEach(d=>{ const td=el("td",{class:d===t?"today":null}); pega(d).forEach(a=>td.append(evBtn(a))); tr.append(td); }); tb.append(tr); };
  if(acts.some(a=>!a.hora)) linha("—", d=>acts.filter(a=>a.data===d&&!a.hora));
  for(let h=h0; h<=h1; h++) linha(pad(h)+":00", d=>acts.filter(a=>a.data===d&&a.hora&&Number(a.hora.slice(0,2))===h));
  tbl.append(tb);
  const wrap=el("div",{class:"scroll flat"},tbl);
  $("#cal-main").replaceChildren(wrap, acts.length?"":el("p",{class:"hint pad",text:loaded?"Nenhuma atividade nesta semana.":"Carregando…"}));
}
function evBtn(a){
  const b=el("button",{type:"button",class:`ev ${a.tipo==="verificacao"?"ver":"ali"}${feita(a)?" done":""}${a.status==="atrasada"?" late":""}${calSel===actKey(a)?" sel":""}`,
    "aria-label":`${actTitle(a)}, ${a.hora||"sem horário"}, ${STATUS_L[a.status]}`});
  b.append(el("b",{},feita(a)?ico("check"):null,document.createTextNode(TIPO_L[a.tipo])),
    el("span",{text:[gaiolasTxt(a.gaiolas)||ESTAGIO_L[a.estagio],STATUS_L[a.status]].join(" · ")}));
  b.onclick=()=>{ calSel=actKey(a); renderCalendar(); if(innerWidth<1100) $("#cal-side").scrollIntoView({behavior:"smooth",block:"nearest"}); };
  return b;
}
function renderMonth(f){
  const ym=calAnchor.slice(0,7); const [y,m]=ym.split("-").map(Number);
  $("#cal-title").textContent=`${MESES[m-1]} de ${y}`;
  const first=new Date(y,m-1,1); const lead=(first.getDay()+6)%7; const start=addDays(iso(first),-lead);
  const weeks=Math.ceil((lead+new Date(y,m,0).getDate())/7);
  const acts=filterActs(activities(start,addDays(start,weeks*7-1)),f); const t=todayIso();
  const cal=el("div",{class:"cal"},...["seg","ter","qua","qui","sex","sáb","dom"].map(d=>el("div",{class:"dh",text:d})));
  for(let i=0;i<weeks*7;i++){
    const ds=addDays(start,i); const dt=parse(ds); const as=acts.filter(a=>a.data===ds); const other=dt.getMonth()!==m-1;
    const b=el("button",{type:"button",class:"day-btn"+(other?" other":"")+(ds===t?" today":""),"aria-label":`${DOWL[dt.getDay()]}, ${brFull(ds)}: ${as.length} atividade(s)`});
    b.append(el("div",{class:"n"},el("span",{text:String(dt.getDate())}),as.length?el("span",{class:"cnt",text:`${as.filter(feita).length}/${as.length}`}):null));
    as.slice(0,3).forEach(a=>b.append(el("div",{class:`mini-ev ${a.tipo==="verificacao"?"ver":"ali"}${feita(a)?" done":""}`,text:`${a.hora||"—"} ${TIPO_L[a.tipo]}`})));
    if(as.length>3) b.append(el("div",{class:"more-n",text:`+${as.length-3}`}));
    b.onclick=()=>{ calAnchor=ds; calMode="semana"; calSel=null; renderCalendar(); };
    cal.append(b);
  }
  $("#cal-main").replaceChildren(cal);
}
function renderCalSide(){
  const side=$("#cal-side");
  const ini = calMode==="semana" ? mondayOf(calAnchor) : addDays(calAnchor.slice(0,7)+"-01",-7);
  const a = calSel && activities(addDays(ini,-40), addDays(ini,80)).find(x=>actKey(x)===calSel);
  if(!a){ side.replaceChildren(el("div",{class:"side-empty"},ico("info"),el("p",{text:"Clique em uma atividade para ver os detalhes e registrar a execução."}))); return; }
  const dt=parse(a.data);
  const head=el("div",{class:"side-h "+(a.tipo==="verificacao"?"ver":"ali")},el("h3",{text:TIPO_L[a.tipo]}),statusPill(a.status));
  const kv=el("div",{class:"kv-list"},
    el("div",{},ico("cal"),el("span",{text:`${cap(DOWL[dt.getDay()])}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`})),
    el("div",{},ico("clock"),el("span",{text:a.hora||"Sem horário"})));
  const kv2=el("dl",{class:"kv2"},el("dt",{},ico("user"),document.createTextNode("Responsável")),el("dd",{text:a.resp||"—"}),
    el("dt",{},ico("bug"),document.createTextNode("Estágio")),el("dd",{text:ESTAGIO_L[a.estagio]}),
    el("dt",{},ico("list"),document.createTextNode("Gaiolas")),el("dd",{text:String(a.gaiolas.length)}));
  const rs = a.k==="ag" ? records.filter(r=>r.agendamento_id===a.id) : [a.reg];
  const sit={}; rs.forEach(r=>regGaiolas(r).forEach(g=>sit[g.gaiola]=g));
  const gl=el("div",{class:"g-list"},...a.gaiolas.map(g=>el("div",{class:sit[g]?(sit[g].situacao==="realizada"?"ok":"nok"):null},el("span",{text:g}),sit[g]?el("small",{text:sit[g].situacao==="realizada"?"Realizada":"Não realizada"+(sit[g].obs?": "+sit[g].obs:"")}):null)));
  const out=[head,kv,kv2,el("h4",{class:"mini-h",text:"Gaiolas incluídas"}),gl];
  if(a.obs) out.push(el("p",{class:"side-obs",text:a.obs}));
  if(a.k==="ag" && !feita(a) && can("registrar")){ const b=el("button",{class:"btn wide",type:"button",text:"Registrar execução"}); b.onclick=()=>openRegistro(a.data, a.id); out.push(b); }
  if(rs.length){ const r=rs[0]; const b=el("button",{class:"btn ghost wide-ghost",type:"button",text:canEditRec(r)?"Ver e editar registro":"Ver registro do dia"}); b.onclick=()=>{ openRegistro(r.data); if(canEditRec(r)) startEdit(r); }; out.push(b); }
  if(a.k==="ag" && isDev()){ const d=el("button",{class:"linkbtn danger",type:"button",text:"Excluir agendamento"}); d.onclick=()=>confirmar(d,"Excluir este agendamento?",async()=>{ await excluirAgendas([a.id]); calSel=null; }); out.push(d); }
  side.replaceChildren(...out);
}
$$("#cal-modo button").forEach(b=>b.onclick=()=>{ calMode=b.dataset.cal; renderCalendar(); });
$("#cal-filtro").onchange=renderCalendar;
$("#cal-prev").onclick=()=>{ calAnchor = calMode==="semana" ? addDays(calAnchor,-7) : addMonths(calAnchor.slice(0,7),-1)+"-01"; renderCalendar(); };
$("#cal-next").onclick=()=>{ calAnchor = calMode==="semana" ? addDays(calAnchor,7) : addMonths(calAnchor.slice(0,7),1)+"-01"; renderCalendar(); };
$("#cal-now").onclick=()=>{ calAnchor=todayIso(); renderCalendar(); };
$("#cal-add").onclick=()=>openRegistro(todayIso());
function confirmar(btn, pergunta, acao){
  const box=el("span",{class:"confirm"},el("span",{class:"hint",text:pergunta}));
  const ok=el("button",{class:"linkbtn danger",type:"button",text:"Confirmar"}), no=el("button",{class:"linkbtn",type:"button",text:"Cancelar"});
  ok.onclick=async()=>{ ok.disabled=true; await acao(); box.isConnected && box.replaceWith(btn); };
  no.onclick=()=>box.replaceWith(btn); box.append(ok,no); btn.replaceWith(box);
}
async function excluirAgendas(ids){
  if(precisaBanco()) return;
  const { data, error } = await sb.from("agendamentos").delete().in("id",ids).select();
  if(error || !data || !data.length){ toast("Não foi possível excluir."); return; }
  toast(ids.length>1?`${data.length} agendamentos excluídos`:"Agendamento excluído"); await loadNovas();
}

/* =================== registro diário =================== */
let fG=[];
function buildForm(){
  fillSelect($("#f-estagio"), ESTAGIOS, $("#f-estagio").value||"adultos");
  const at=$("#f-ativ"); const chk=$$("#f-ativ input:checked").map(i=>i.value); at.replaceChildren();
  ATIV.forEach(([k,l])=>{ const i=el("input",{type:"checkbox",value:k,id:"at-"+k}); i.checked=chk.includes(k); at.append(el("label",{class:"chip"},i,el("span",{text:l}))); });
  fillGaiolaSel($("#f-gsel"), fG.map(g=>g.gaiola));
  applyFormPerms();
}
function fillGaiolaSel(sel, usadas){
  const livres=cfg.alvos.filter(a=>!usadas.includes(a));
  fillSelect(sel, livres.length?[["","Selecionar gaiola…"],...livres.map(a=>[a,a])]:[["","Todas já adicionadas"]], "");
}
function applyFormPerms(){
  const allowed = editingId ? true : can("registrar");
  $("#reg-blocked").hidden = allowed;
  $$("#form input,#form select,#form textarea,#form button").forEach(x=>x.disabled=!allowed);
  $("#f-resp").readOnly = !can("editar_todos");
}
function teamNames(){ const s=new Set(); if(perfil) s.add(perfil.nome); records.forEach(r=>r.responsavel&&s.add(norm(r.responsavel))); equipe.forEach(u=>s.add(u.nome)); return [...s].filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt")); }
function buildTeam(){
  const names=teamNames();
  $("#dl-equipe").replaceChildren(...names.map(n=>el("option",{value:n})));
  const rr=$("#r-resp"), keep=rr.value; rr.replaceChildren(el("option",{value:"",text:"Todos"}),...names.map(n=>el("option",{value:n,text:n}))); rr.value=names.includes(keep)?keep:"";
  const ra=$("#r-alvo"), ka=ra.value; ra.replaceChildren(el("option",{value:"",text:"Todas"}),...cfg.alvos.map(a=>el("option",{value:a,text:a}))); ra.value=cfg.alvos.includes(ka)?ka:"";
}
const fTipo = () => ($("#form [name=f-tipo]:checked")||{}).value || "alimentacao";
const setTipo = (name,v) => $$(`[name=${name}]`).forEach(i=>i.checked=i.value===v);
function fillAgendaOpts(keepId){
  const d=$("#f-data").value;
  const ags=agendas.filter(a=>a.id===keepId || (a.data===d && !feita({status:agStatus(a)}))).sort((a,b)=>(a.hora||"99").localeCompare(b.hora||"99"));
  const hoje = d===todayIso() ? "hoje" : br(d);
  fillSelect($("#f-agenda"), [["","Sem agendamento"],...ags.map(a=>[a.id,`${TIPO_L[a.tipo]} · ${a.data===d?hoje:br(a.data)}, ${a.hora||"sem horário"} · ${gaiolasTxt(a.gaiolas)||ESTAGIO_L[a.estagio]}${a.responsavel?" · "+a.responsavel:""}`])], keepId||"");
}
function aplicarAgenda(id){
  const a=agendaById(id); if(!a) return;
  setTipo("f-tipo",a.tipo); $("#f-estagio").value=a.estagio;
  fG=a.gaiolas.map(g=>({gaiola:g,situacao:"realizada",obs:""}));
  renderG();
}
function renderG(){
  const chips=$("#f-gchips"); chips.replaceChildren(...fG.map((g,i)=>{ const x=el("button",{type:"button","aria-label":"Remover "+g.gaiola},ico("x")); x.onclick=()=>{ fG.splice(i,1); renderG(); }; return el("span",{class:"token"},document.createTextNode(g.gaiola),x); }));
  $("#f-gcount").textContent = fG.length ? `${fG.length} selecionada${fG.length>1?"s":""}` : "";
  $("#f-gcount").hidden=!fG.length;
  const tbl=$("#f-gtable"); $("#f-gwrap").hidden=!fG.length;
  tbl.replaceChildren(el("thead",{},el("tr",{},el("th",{text:"Gaiola"}),el("th",{text:"Situação"}),el("th",{text:"Observação"}))));
  const tb=el("tbody");
  fG.forEach(g=>{
    const sel=el("select",{class:"sit "+g.situacao,"aria-label":"Situação de "+g.gaiola},el("option",{value:"realizada",text:"Realizada"}),el("option",{value:"nao_realizada",text:"Não realizada"}));
    sel.value=g.situacao; sel.onchange=()=>{ g.situacao=sel.value; renderG(); };
    const ob=el("input",{type:"text",value:g.obs||"",placeholder:g.situacao==="realizada"?"Sem alterações":"Registrar motivo","aria-label":"Observação de "+g.gaiola});
    ob.oninput=()=>{ g.obs=ob.value; };
    tb.append(el("tr",{},el("td",{},el("span",{class:"gdot "+g.situacao}),document.createTextNode(g.gaiola)),el("td",{},sel),el("td",{},ob)));
  });
  tbl.append(tb);
  fillGaiolaSel($("#f-gsel"), fG.map(g=>g.gaiola));
  renderResumo(); applyFormPerms();
}
function renderResumo(){
  $("#rs-tipo").textContent=TIPO_L[fTipo()];
  $("#rs-estagio").textContent=ESTAGIO_L[$("#f-estagio").value]||"—";
  const d=$("#f-data").value; $("#rs-dt").textContent = d ? `${brFull(d)}${$("#f-hora").value?" · "+$("#f-hora").value:""}` : "—";
  const ok=fG.filter(g=>g.situacao==="realizada").length, nok=fG.length-ok;
  $("#rs-n").textContent=fG.length; $("#rs-nl").textContent=fG.length===1?"gaiola":"gaiolas";
  $("#rs-ok").textContent=ok; $("#rs-nok").textContent=nok;
  $("#rs-ok").nextElementSibling.textContent=ok===1?"realizada":"realizadas"; $("#rs-nok").nextElementSibling.textContent=nok===1?"não realizada":"não realizadas";
  $("#rs-warn").hidden=!nok;
  $("#rs-warn b").textContent = $("#f-agenda").value ? "Agendamento parcialmente realizado" : "Atividade parcialmente realizada";
}
function resetForm(d, agId){
  $$("#f-ativ input").forEach(i=>i.checked=false); $("#f-more").open=false;
  $("#f-obs").value=""; $("#f-ovos").value=""; $("#f-err").textContent="";
  $("#f-resp").value = perfil ? perfil.nome : "";
  $("#f-data").value = d || todayIso();
  $("#f-hora").value = ($("#f-data").value===todayIso()) ? nowHM() : "";
  setTipo("f-tipo","alimentacao"); $("#f-estagio").value="adultos"; fG=[];
  fillAgendaOpts(agId);
  if(agId){ aplicarAgenda(agId); const a=agendaById(agId); if(a && a.data!==todayIso()) $("#f-hora").value=a.hora||""; }
  renderG(); renderDay();
}
function startEdit(r){
  editingId=r.id;
  $("#f-resp").value=r.responsavel; $("#f-data").value=r.data; $("#f-hora").value=r.hora||"";
  setTipo("f-tipo",regTipo(r)); $("#f-estagio").value=regEstagio(r);
  fillAgendaOpts(r.agendamento_id||"");
  fG=regGaiolas(r).map(g=>({...g}));
  $$("#f-ativ input").forEach(i=>i.checked=r.atividades.includes(i.value));
  $("#f-more").open = r.atividades.length>0 || !!r.ovos;
  $("#f-ovos").value=r.ovos||""; $("#f-obs").value=r.obs||""; $("#f-err").textContent="";
  $("#editing").hidden=false; $("#f-submit").textContent="Salvar alterações";
  renderG(); show("registro");
}
function cancelEdit(){ editingId=null; $("#editing").hidden=true; $("#f-submit").textContent="Salvar registro"; applyFormPerms(); }
$("#edit-cancel").onclick=()=>{ const d=$("#f-data").value; cancelEdit(); resetForm(d); };
$("#f-cancel").onclick=()=>{ const d=$("#f-data").value; if(editingId) cancelEdit(); resetForm(d); };
$("#f-data").addEventListener("change",()=>{ fillAgendaOpts($("#f-agenda").value); renderResumo(); renderDay(); });
$("#f-hora").addEventListener("change",renderResumo);
$("#f-estagio").onchange=renderResumo;
$$("[name=f-tipo]").forEach(i=>i.onchange=renderResumo);
$("#f-agenda").onchange=e=>{ if(e.target.value) aplicarAgenda(e.target.value); else renderResumo(); };
$("#f-gadd").onclick=()=>{ const v=$("#f-gsel").value; if(!v) return; fG.push({gaiola:v,situacao:"realizada",obs:""}); renderG(); };
$("#f-gsel").onchange=()=>$("#f-gadd").click();
$("#f-gall").onclick=()=>{ cfg.alvos.forEach(a=>{ if(!fG.some(g=>g.gaiola===a)) fG.push({gaiola:a,situacao:"realizada",obs:""}); }); renderG(); };
$("#reg-back").onclick=()=>{ const d=$("#f-data").value; if(d) calAnchor=d; show("calendario"); };
$("#d-prev").onclick=()=>{ if(editingId) cancelEdit(); resetForm(addDays($("#f-data").value||todayIso(),-1)); };
$("#d-next").onclick=()=>{ if(editingId) cancelEdit(); resetForm(addDays($("#f-data").value||todayIso(),1)); };
function renderDay(){
  const d=$("#f-data").value||todayIso(); const dt=parse(d);
  if(document.activeElement!==$("#f-agenda")) fillAgendaOpts($("#f-agenda").value);
  $("#reg-title").textContent = editingId ? "Editar registro" : "Registrar atividade";
  $("#reg-date").textContent = `${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()} de ${dt.getFullYear()}`;
  $("#day-h").textContent = d===todayIso() ? `Registros de hoje · ${br(d)}` : `Registros de ${br(d)}`;
  const list=$("#day-list");
  if(!loaded){ list.replaceChildren(el("li",{class:"hint none",text:"Carregando…"})); return; }
  const rs=sortRecs(records.filter(r=>r.data===d));
  if(!rs.length){ list.replaceChildren(el("li",{class:"hint none",text:"Nenhum registro nesta data."})); return; }
  list.replaceChildren(...rs.map(r=>{
    const nok=regGaiolas(r).filter(g=>g.situacao==="nao_realizada").map(g=>g.gaiola);
    const li=el("li",{class:nok.length?"partial":null},el("div",{class:"t",text:`${r.hora||"--:--"} · ${r.responsavel}`}),
      el("div",{text:`${TIPO_L[regTipo(r)]} · ${ESTAGIO_L[regEstagio(r)].toLowerCase()}: ${regGaiolas(r).map(g=>g.gaiola).join(", ")||"sem gaiola indicada"}`}),
      nok.length?el("div",{class:"hint warn-t",text:"Não realizada: "+nok.join(", ")}):null,
      r.atividades.length?el("div",{class:"hint",text:r.atividades.map(a=>ATIV_L[a]||a).join(", ")}):null,
      r.obs?el("div",{class:"hint",text:r.obs}):null);
    if(canEditRec(r)){ const b=el("button",{type:"button",class:"linkbtn",text:"Editar"}); b.onclick=()=>startEdit(r); li.append(b); }
    return li;
  }));
}
$("#form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#f-err"); err.textContent="";
  const gaiolas=fG.map(g=>({gaiola:g.gaiola,situacao:g.situacao,obs:norm(g.obs)}));
  const rec={ responsavel:norm($("#f-resp").value), data:$("#f-data").value, hora:$("#f-hora").value||"",
    tipo:fTipo(), estagio:$("#f-estagio").value, agendamento_id:$("#f-agenda").value||null, gaiolas,
    alvos:gaiolas.filter(g=>g.situacao==="realizada").map(g=>g.gaiola),
    atividades:$$("#f-ativ input:checked").map(i=>i.value), ovos:$("#f-ovos").value, obs:$("#f-obs").value.trim() };
  if(!rec.responsavel) return void(err.textContent="Informe quem registrou.");
  if(!rec.data) return void(err.textContent="Informe a data da execução.");
  if(!gaiolas.length) return void(err.textContent="Adicione pelo menos uma gaiola.");
  const semMotivo=gaiolas.filter(g=>g.situacao==="nao_realizada"&&!g.obs).map(g=>g.gaiola);
  if(semMotivo.length) return void(err.textContent=`Informe o motivo para: ${semMotivo.join(", ")}.`);
  if(!novasOk){ ["tipo","estagio","agendamento_id","gaiolas"].forEach(k=>delete rec[k]); }
  const btn=$("#f-submit"); btn.disabled=true; btn.textContent="Salvando…";
  try{
    let res;
    if(editingId) res = await sb.from("registros").update(rec).eq("id",editingId).select();
    else res = await sb.from("registros").insert({...rec, autor:uid}).select();
    if(res.error) throw res.error;
    if(!res.data || !res.data.length) throw {message:"Seu usuário não tem permissão para esta alteração."};
    const wasEdit=!!editingId; if(wasEdit) cancelEdit();
    await loadRecords();
    resetForm(rec.data);
    toast(wasEdit?"Alterações salvas":`Registro de ${br(rec.data)} salvo`);
  }catch(x){
    const m=errMsg(x); err.textContent = /row-level security/i.test(m) ? "Seu usuário não tem permissão para esta alteração." : m;
  }finally{ btn.disabled=false; btn.textContent=editingId?"Salvar alterações":"Salvar registro"; applyFormPerms(); }
});

/* =================== registro da criação =================== */
let crTab="novo", crLote="", crPlaca="";
const loteDe = p => lotes.find(l=>l.id===p.lote_id) || {codigo:"?",especie:""};
const placaNome = p => `${loteDe(p).codigo} / ${p.codigo}`;
const ultimaData = pid => criacao.filter(c=>c.placa_id===pid).reduce((m,c)=>c.data>m?c.data:m, "");
const placasOrdenadas = () => [...placas].sort((a,b)=>ultimaData(b.id).localeCompare(ultimaData(a.id)) || (b.criado_em||"").localeCompare(a.criado_em||"") || placaNome(b).localeCompare(placaNome(a)));
function totais(pid, extra){
  const t={larvas:0,pupas:0,adultos:0,machos:0,femeas:0,naoid:0};
  [...criacao.filter(c=>c.placa_id===pid), ...(extra?[extra]:[])].forEach(c=>{ t.larvas+=c.novas_larvas; t.pupas+=c.novas_pupas; t.adultos+=c.novos_adultos; t.machos+=c.machos; t.femeas+=c.femeas; t.naoid+=c.nao_identificado; });
  return t;
}
const num = id => Math.max(0, parseInt($(id).value,10)||0);
const crExtra = () => ({novas_larvas:num("#cr-larvas"),novas_pupas:num("#cr-pupas"),novos_adultos:num("#cr-adultos"),machos:num("#cr-machos"),femeas:num("#cr-femeas"),nao_identificado:num("#cr-naoid")});
function renderCriacao(){
  $$(".ftab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.cr===crTab)));
  $$("[data-crview]").forEach(v=>v.hidden=v.dataset.crview!==crTab);
  $("#cr-crumb").textContent = crTab==="novo" ? "Novo registro" : "Histórico do lote";
  const ls=[...lotes].sort((a,b)=>b.codigo.localeCompare(a.codigo,"pt",{numeric:true}));
  if(!crPlaca || !placas.some(p=>p.id===crPlaca)){ const p=placasOrdenadas()[0]; crPlaca=p?p.id:""; crLote=p?p.lote_id:(ls[0]||{}).id||""; }
  fillSelect($("#cr-lote"), ls.length?ls.map(l=>[l.id,l.codigo]):[["",novasOk?"Nenhum lote: clique em Novo lote":"Atualize o banco"]], crLote);
  const pls=placas.filter(p=>p.lote_id===crLote).sort((a,b)=>a.codigo.localeCompare(b.codigo,"pt",{numeric:true}));
  fillSelect($("#cr-placa"), pls.length?pls.map(p=>[p.id,p.codigo]):[["","—"]], crPlaca);
  const p=placas.find(x=>x.id===crPlaca);
  if(!$("#cr-data").value) $("#cr-data").value=todayIso();
  if(!$("#cr-hora").value) $("#cr-hora").value=nowHM();
  $("#cr-resp").value=perfil.nome;
  $("#cr-especie").value = p ? loteDe(p).especie : "";
  $("#cr-inicio").value = p&&p.inicio_eclosao ? p.inicio_eclosao : "";
  $("#cr-ovos-v").textContent = p&&p.ovos_iniciais!=null ? fmtN(p.ovos_iniciais) : "não informado";
  if(p && document.activeElement!==$("#cr-sit")) $("#cr-sit").value=p.situacao;
  $("#cr-btn").disabled = !p || !can("registrar");
  $("#cr-ovos-ed").disabled = !p || !can("registrar");
  // soma dos sexos
  const x=crExtra(); const s=x.machos+x.femeas+x.nao_identificado; const ok=s===x.novos_adultos;
  $("#cr-soma").className="sum-check "+(ok?"ok":"bad");
  $("#cr-soma").replaceChildren(ico(ok?"check":"alert"),document.createTextNode(`${x.machos} + ${x.femeas} + ${x.nao_identificado} = ${s} adultos`+(ok?"":` (novos adultos: ${x.novos_adultos})`)));
  // resumo
  const temNovo = Object.values(x).some(v=>v>0);
  $("#cr-previa").hidden=!temNovo;
  $("#cr-res-sub").textContent = p ? `${loteDe(p).codigo} · ${p.codigo}` : "Nenhuma placa selecionada";
  const t = p ? totais(p.id, temNovo?x:null) : totais("");
  const item=(ic,l,v,extra)=>el("div",{class:"ls-row"},el("span",{class:"ls-ic"},ico(ic)),el("span",{class:"ls-l",text:l}),el("b",{class:"ls-v",text:v}),extra||null);
  $("#cr-sum").replaceChildren(
    item("egg","Ovos iniciais",p&&p.ovos_iniciais!=null?fmtN(p.ovos_iniciais):"—"),
    item("worm","Larvas eclodidas",fmtN(t.larvas)),
    item("pupa","Pupas formadas",fmtN(t.pupas)),
    item("bug","Adultos emergidos",fmtN(t.adultos),el("div",{class:"ls-sex"},el("span",{},ico("male"),el("b",{text:fmtN(t.machos)}),document.createTextNode(" machos")),el("span",{},ico("female"),el("b",{text:fmtN(t.femeas)}),document.createTextNode(" fêmeas")))));
  const rate=(l,v)=>el("div",{class:"rate"},el("span",{text:l}),el("b",{text:v}));
  $("#cr-taxas").replaceChildren(rate("Eclosão",pct(t.larvas,p&&p.ovos_iniciais)),rate("Larvas → pupas",pct(t.pupas,t.larvas)),rate("Pupas → adultos",pct(t.adultos,t.pupas)));
  $("#cr-taxa-nota").textContent = p && p.ovos_iniciais==null ? "Sem contagem inicial de ovos, a taxa de eclosão fica indisponível." : "";
  const ult = p ? criacao.filter(c=>c.placa_id===p.id).sort((a,b)=>(b.data+b.hora).localeCompare(a.data+a.hora)).slice(0,3) : [];
  $("#cr-ult").replaceChildren(...(ult.length?ult.map(c=>rate(`${br(c.data)} · ${faseDe(c)[0]}`,faseDe(c)[1])):[el("p",{class:"hint",style:"margin:0",text:"Nenhuma contagem nesta placa ainda."})]));
  if(crTab==="hist") renderCrHist();
}
function faseDe(c){
  if(c.novos_adultos) return ["Emergência",`${fmtN(c.novos_adultos)} adultos`];
  if(c.novas_pupas) return ["Pupação",`${fmtN(c.novas_pupas)} pupas`];
  if(c.novas_larvas) return ["Eclosão",`${fmtN(c.novas_larvas)} larvas`];
  return ["Observação","sem contagem"];
}
function renderCrHist(){
  fillSelect($("#cr-hist-placa"), placasOrdenadas().map(p=>[p.id,placaNome(p)]), crPlaca);
  const tbl=$("#cr-hist"); tbl.replaceChildren(el("thead",{},el("tr",{},...["Data","Hora","Larvas","Pupas","Adultos","Machos","Fêmeas","N/I","Observações","Por",""].map(h=>el("th",{text:h})))));
  const tb=el("tbody");
  const rs=criacao.filter(c=>c.placa_id===crPlaca).sort((a,b)=>(b.data+b.hora).localeCompare(a.data+a.hora));
  if(!rs.length) tb.append(el("tr",{},el("td",{colspan:"11",class:"hint",text:"Nenhuma contagem nesta placa."})));
  rs.forEach(c=>{
    const acts=el("td",{});
    if(can("editar_todos") || (can("editar_proprios") && c.autor===uid)){
      const d=el("button",{class:"linkbtn",type:"button",text:"Excluir"});
      d.onclick=()=>confirmar(d,"Excluir?",async()=>{ const {data,error}=await sb.from("criacao_registros").delete().eq("id",c.id).select(); if(error||!data||!data.length){toast("Não foi possível excluir");return;} toast("Contagem excluída"); await loadNovas(); });
      acts.append(d);
    }
    tb.append(el("tr",{},el("td",{class:"mono",text:brFull(c.data)}),el("td",{class:"mono",text:c.hora||"—"}),
      ...[c.novas_larvas,c.novas_pupas,c.novos_adultos,c.machos,c.femeas,c.nao_identificado].map(v=>el("td",{class:"n mono",text:fmtN(v)})),
      el("td",{class:"obs",text:c.obs||""}),el("td",{text:c.responsavel||""}),acts));
  });
  tbl.append(tb);
}
$$(".ftab").forEach(b=>b.onclick=()=>{ crTab=b.dataset.cr; renderCriacao(); });
$("#cr-ver-hist").onclick=()=>{ crTab="hist"; renderCriacao(); };
$("#cr-hist-placa").onchange=e=>{ crPlaca=e.target.value; const p=placas.find(x=>x.id===crPlaca); if(p) crLote=p.lote_id; renderCriacao(); };
$("#cr-lote").onchange=e=>{ crLote=e.target.value; const p=placas.find(x=>x.lote_id===crLote); crPlaca=p?p.id:""; renderCriacao(); };
$("#cr-placa").onchange=e=>{ crPlaca=e.target.value; renderCriacao(); };
["#cr-larvas","#cr-pupas","#cr-adultos","#cr-machos","#cr-femeas","#cr-naoid"].forEach(s=>$(s).addEventListener("input",renderCriacao));
$("#cr-ovos-ed").onclick=()=>{ const p=placas.find(x=>x.id===crPlaca); $("#cr-ovos-box").hidden=false; $("#cr-ovos").value=p&&p.ovos_iniciais!=null?p.ovos_iniciais:""; $("#cr-ovos").focus(); };
$("#cr-ovos-ok").onclick=async()=>{
  if(precisaBanco()) return;
  const v=$("#cr-ovos").value===""?null:Math.max(0,parseInt($("#cr-ovos").value,10)||0);
  const {data,error}=await sb.from("placas").update({ovos_iniciais:v}).eq("id",crPlaca).select();
  if(error||!data||!data.length){ toast("Não foi possível salvar."); return; }
  $("#cr-ovos-box").hidden=true; toast("Ovos colocados atualizados"); await loadNovas();
};
$("#cr-cancel").onclick=()=>{ ["#cr-larvas","#cr-pupas","#cr-adultos","#cr-machos","#cr-femeas","#cr-naoid"].forEach(s=>$(s).value="0"); $("#cr-obs").value=""; $("#cr-err").textContent=""; $("#cr-data").value=todayIso(); $("#cr-hora").value=nowHM(); renderCriacao(); };
$("#cr-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#cr-err"); err.textContent="";
  if(precisaBanco()) return;
  const p=placas.find(x=>x.id===crPlaca); if(!p) return void(err.textContent="Escolha o lote e a placa.");
  const x=crExtra();
  if(x.machos+x.femeas+x.nao_identificado!==x.novos_adultos) return void(err.textContent="A soma de machos, fêmeas e não identificados precisa ser igual aos novos adultos.");
  if(!$("#cr-data").value) return void(err.textContent="Informe a data.");
  const btn=$("#cr-btn"); btn.disabled=true; btn.textContent="Salvando…";
  try{
    const r=await sb.from("criacao_registros").insert({...x, placa_id:p.id, data:$("#cr-data").value, hora:$("#cr-hora").value||"", obs:$("#cr-obs").value.trim(), responsavel:perfil.nome, autor:uid}).select();
    if(r.error) throw r.error;
    const mud={}; if($("#cr-sit").value!==p.situacao) mud.situacao=$("#cr-sit").value; if(($("#cr-inicio").value||null)!==(p.inicio_eclosao||null)) mud.inicio_eclosao=$("#cr-inicio").value||null;
    if(Object.keys(mud).length){ const u=await sb.from("placas").update(mud).eq("id",p.id).select(); if(u.error) throw u.error; }
    $("#cr-cancel").click(); await loadNovas(); toast(`Contagem de ${placaNome(p)} salva`);
  }catch(x2){ const m=errMsg(x2); err.textContent=/row-level security/i.test(m)?"Seu usuário não tem permissão para esta alteração.":m; }
  finally{ btn.disabled=false; btn.textContent="Salvar registro"; }
});
$("#cr-novo-lote").onclick=()=>{ const f=$("#cr-lote-form"); f.hidden=!f.hidden; if(!f.hidden){ $("#nl-inicio").value=todayIso(); $("#nl-lote").focus(); } };
$("#nl-cancel").onclick=()=>{ $("#cr-lote-form").hidden=true; $("#cr-lote-form").reset(); };
$("#cr-lote-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#nl-err"); err.textContent="";
  if(precisaBanco()) return;
  const codigo=norm($("#nl-lote").value).toUpperCase(), placa=norm($("#nl-placa").value).toUpperCase(), especie=norm($("#nl-especie").value)||"Aedes aegypti";
  if(!codigo||!placa) return void(err.textContent="Informe o código do lote e da placa.");
  const btn=$("#nl-btn"); btn.disabled=true;
  try{
    let lote=lotes.find(l=>l.codigo.toUpperCase()===codigo);
    if(!lote){ const r=await sb.from("lotes").insert({codigo,especie}).select(); if(r.error) throw r.error; lote=r.data[0]; }
    if(placas.some(p=>p.lote_id===lote.id && p.codigo.toUpperCase()===placa)) throw {message:`O lote ${codigo} já tem a placa ${placa}.`};
    const ov=$("#nl-ovos").value===""?null:Math.max(0,parseInt($("#nl-ovos").value,10)||0);
    const r2=await sb.from("placas").insert({lote_id:lote.id,codigo:placa,inicio_eclosao:$("#nl-inicio").value||null,ovos_iniciais:ov}).select(); if(r2.error) throw r2.error;
    crLote=lote.id; crPlaca=r2.data[0].id; $("#nl-cancel").click(); crTab="novo"; await loadNovas(); toast(`Lote ${codigo} / ${placa} criado`);
  }catch(x){ const m=errMsg(x); err.textContent=/row-level security/i.test(m)?"Seu usuário não tem permissão para criar lotes.":/duplicate|unique/i.test(m)?"Esse código já existe.":m; }
  finally{ btn.disabled=false; }
});

/* =================== agendamentos =================== */
let agG=[];
function renderAgendamentos(){
  if(!isDev()) return;
  if(!$("#ag-data").value) $("#ag-data").value=todayIso();
  if(!$("#ag-estagio").options.length) fillSelect($("#ag-estagio"), ESTAGIOS, "adultos");
  const rk=$("#ag-resp").value;
  fillSelect($("#ag-resp"), equipe.length?equipe.map(u=>[u.id,u.nome]):[[uid,perfil.nome]], rk||(equipe[0]||{}).id||uid);
  renderAgG(); renderAgList();
}
function renderAgG(){
  $("#ag-gchips").replaceChildren(...agG.map((g,i)=>{ const x=el("button",{type:"button","aria-label":"Remover "+g},ico("x")); x.onclick=()=>{ agG.splice(i,1); renderAgG(); }; return el("span",{class:"token"},document.createTextNode(g),x); }));
  $("#ag-gn").textContent = agG.length ? `${agG.length} gaiola${agG.length>1?"s":""} selecionada${agG.length>1?"s":""}` : "";
  fillGaiolaSel($("#ag-gsel"), agG);
  renderAgResumo();
}
function datasRepeticao(d, rep){
  if(rep==="d7") return [...Array(7)].map((_,i)=>addDays(d,i));
  if(rep==="u10"){ const out=[]; let x=d; while(out.length<10){ const w=parse(x).getDay(); if(w!==0&&w!==6) out.push(x); x=addDays(x,1); } return out; }
  if(rep==="s4"||rep==="s8") return [...Array(Number(rep.slice(1)))].map((_,i)=>addDays(d,7*i));
  return [d];
}
function renderAgResumo(){
  const tipo=($("[name=ag-tipo]:checked")||{}).value||"alimentacao";
  $("#ags-tipo").replaceChildren(ico(tipo==="verificacao"?"clip":"fork"),document.createTextNode(TIPO_L[tipo]));
  $("#ags-tipo").className="tipo-pill "+(tipo==="verificacao"?"ver":"ali");
  const d=$("#ag-data").value; const dt=d?parse(d):null;
  const n=d?datasRepeticao(d,$("#ag-rep").value).length:1;
  $("#ags-data").textContent = dt ? `${cap(DOWL[dt.getDay()])}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}${n>1?` (+${n-1} repetições)`:""}` : "—";
  $("#ags-hora").textContent=$("#ag-hora").value||"Sem horário";
  const r=$("#ag-resp"); $("#ags-resp").textContent=r.selectedOptions[0]?r.selectedOptions[0].textContent:"—";
  $("#ags-estagio").textContent=ESTAGIO_L[$("#ag-estagio").value]||"—";
  $("#ags-gaiolas").replaceChildren(...(agG.length?agG.map(g=>el("div",{},ico("check"),el("span",{text:g}))):[el("p",{class:"hint",style:"margin:0",text:"Nenhuma gaiola ainda."})]));
  $("#ags-info-t").textContent = `${n>1?n+" atividades":"Uma atividade"}, ${agG.length} gaiola${agG.length===1?"":"s"}.`;
}
function renderAgList(){
  const ver=$("#ag-ver-passados").checked, t=todayIso();
  const ls=agendas.filter(a=>ver||a.data>=t).sort((a,b)=>(a.data+(a.hora||"99")).localeCompare(b.data+(b.hora||"99")));
  const tbl=$("#ag-list"); tbl.replaceChildren(el("thead",{},el("tr",{},...["Data","Horário","Atividade","Gaiolas","Responsável","Situação",""].map(h=>el("th",{text:h})))));
  const tb=el("tbody");
  if(!ls.length) tb.append(el("tr",{},el("td",{colspan:"7",class:"hint",text:novasOk?"Nenhum agendamento.":"Atualize o banco para usar os agendamentos."})));
  ls.slice(0,150).forEach(a=>{
    const acts=el("td",{class:"acts"});
    const d=el("button",{class:"linkbtn",type:"button",text:"Excluir"}); d.onclick=()=>confirmar(d,"Excluir?",()=>excluirAgendas([a.id]));
    acts.append(d);
    if(a.serie){ const futuros=agendas.filter(x=>x.serie===a.serie && x.data>=a.data && agStatus(x)!=="concluida" && agStatus(x)!=="parcial").map(x=>x.id);
      if(futuros.length>1){ const ds=el("button",{class:"linkbtn",type:"button",text:`Excluir esta e as próximas (${futuros.length})`}); ds.onclick=()=>confirmar(ds,"Excluir a série?",()=>excluirAgendas(futuros)); acts.append(ds); } }
    tb.append(el("tr",{},el("td",{class:"mono",text:brFull(a.data)}),el("td",{class:"mono",text:a.hora||"—"}),el("td",{text:actTitle(a)}),el("td",{text:a.gaiolas.join(", ")||"—"}),el("td",{text:a.responsavel||"—"}),el("td",{},statusPill(agStatus(a),true)),acts));
  });
  tbl.append(tb);
}
$$("[name=ag-tipo]").forEach(i=>i.onchange=renderAgResumo);
["#ag-data","#ag-hora","#ag-resp","#ag-rep","#ag-estagio"].forEach(s=>$(s).addEventListener("change",renderAgResumo));
$("#ag-ver-passados").onchange=renderAgList;
$("#ag-gadd").onclick=()=>{ const v=$("#ag-gsel").value; if(v){ agG.push(v); renderAgG(); } };
$("#ag-gsel").onchange=()=>$("#ag-gadd").click();
$("#ag-cancel").onclick=()=>{ agG=[]; $("#ag-obs").value=""; $("#ag-rep").value="0"; $("#ag-err").textContent=""; $("#ag-data").value=todayIso(); setTipo("ag-tipo","alimentacao"); renderAgG(); };
$("#ag-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#ag-err"); err.textContent="";
  if(precisaBanco()) return;
  const d=$("#ag-data").value; if(!d) return void(err.textContent="Informe a data.");
  if(!agG.length) return void(err.textContent="Adicione pelo menos uma gaiola.");
  const r=$("#ag-resp"); const datas=datasRepeticao(d,$("#ag-rep").value); const serie=datas.length>1?uuid():null;
  const base={tipo:($("[name=ag-tipo]:checked")||{}).value||"alimentacao", estagio:$("#ag-estagio").value, gaiolas:[...agG], hora:$("#ag-hora").value||"",
    responsavel_id:r.value||null, responsavel:r.selectedOptions[0]?r.selectedOptions[0].textContent:"", obs:$("#ag-obs").value.trim(), origem:"agendamento", serie};
  const btn=$("#ag-btn"); btn.disabled=true; btn.textContent="Agendando…";
  const {data,error}=await sb.from("agendamentos").insert(datas.map(x=>({...base,data:x}))).select();
  btn.disabled=false; btn.textContent="Agendar atividade";
  if(error||!data||!data.length){ err.textContent=error?errMsg(error):"Não foi possível agendar."; return; }
  toast(datas.length>1?`${datas.length} atividades agendadas`:`Atividade agendada para ${br(d)}`);
  $("#ag-cancel").click(); await loadNovas();
});

/* =================== escala da equipe =================== */
let esAnchor=null, esSel=null, esItens=[];
const escalaDe = (cid,d) => escalas.find(e=>e.colaborador_id===cid && e.data===d);
const agendasDe = (cid,d) => agendas.filter(a=>a.responsavel_id===cid && a.data===d).sort((a,b)=>(a.hora||"99").localeCompare(b.hora||"99"));
const hCurta = h => h ? (h.endsWith(":00") ? String(Number(h.slice(0,2)))+"h" : h.replace(":","h")) : "";
const faixa = (a,b) => a.endsWith(":00")&&b.endsWith(":00") ? `${Number(a.slice(0,2))}–${hCurta(b)}` : `${hCurta(a)}–${hCurta(b)}`;
function renderEscala(){
  if(!isDev()) return;
  if(!esAnchor) esAnchor=mondayOf(todayIso());
  const ini=esAnchor, fim=addDays(ini,6), di=parse(ini), df=parse(fim), t=todayIso();
  $("#es-title").textContent = di.getMonth()===df.getMonth() ? `${di.getDate()} – ${df.getDate()} de ${MESES[df.getMonth()].toLowerCase()} de ${df.getFullYear()}` : `${di.getDate()} de ${MESES[di.getMonth()].toLowerCase()} – ${df.getDate()} de ${MESES[df.getMonth()].toLowerCase()} de ${df.getFullYear()}`;
  const days=[...Array(7)].map((_,i)=>addDays(ini,i));
  const q=norm($("#es-busca").value).toLowerCase(), f=$("#es-filtro").value;
  const pessoas=equipe.filter(u=>(!q||u.nome.toLowerCase().includes(q)) && (f!=="escalados" || days.some(d=>escalaDe(u.id,d)||agendasDe(u.id,d).length)));
  if(!esSel && equipe.length){ esSel={cid:equipe[0].id, data:t>=ini&&t<=fim?t:ini}; carregarPlano(); }
  const tbl=$("#es-grid"); tbl.replaceChildren(el("thead",{},el("tr",{},el("th",{class:"pcol",text:"Colaborador"}),...days.map(d=>{const dt=parse(d);return el("th",{class:d===t?"today":null},el("span",{class:"dow",text:DOW[dt.getDay()]}),el("b",{text:pad(dt.getDate())}));}))));
  const tb=el("tbody");
  if(!pessoas.length) tb.append(el("tr",{},el("td",{colspan:"8",class:"hint",text:equipe.length?"Ninguém encontrado.":"Carregando equipe…"})));
  pessoas.forEach(u=>{
    const tr=el("tr",{},el("th",{class:"pcol"},el("div",{class:"pwrap"},el("span",{class:"avatar sm",text:iniciais(u.nome)}),el("span",{class:"pname",text:u.nome}))));
    days.forEach(d=>{
      const e=escalaDe(u.id,d), n=agendasDe(u.id,d).length, sel=esSel&&esSel.cid===u.id&&esSel.data===d;
      const b=el("button",{type:"button",class:"es-cell"+(e||n?" on":"")+(sel?" sel":""),"aria-label":`${u.nome}, ${brFull(d)}: ${e?`${e.entrada} às ${e.saida}`:"sem escala"}${n?`, ${n} atividade(s)`:""}`});
      if(e||n){ if(e) b.append(el("b",{text:faixa(e.entrada,e.saida)})); b.append(el("span",{text:n?`${n} ativ.`:"sem ativ."})); }
      else b.append(ico("plus"));
      b.onclick=()=>{ esSel={cid:u.id,data:d}; carregarPlano(); renderEscala(); };
      tr.append(el("td",{},b));
    });
    tb.append(tr);
  });
  tbl.append(tb);
  // atividades do dia selecionado
  const nome=esSel?(equipe.find(u=>u.id===esSel.cid)||{}).nome:"";
  $("#es-dia-h").textContent = esSel ? `Atividades de ${(nome||"").split(" ")[0]} · ${parse(esSel.data).getDate()} de ${MESES[parse(esSel.data).getMonth()].toLowerCase()}` : "Atividades do dia";
  const ags=esSel?agendasDe(esSel.cid,esSel.data):[];
  $("#es-dia").replaceChildren(...(ags.length?ags.map(a=>el("div",{class:"act-row"},el("span",{class:"act-h mono",text:a.hora||"—"}),el("span",{class:"act-ic "+(a.tipo==="verificacao"?"ver":"ali")},ico(a.tipo==="verificacao"?"clip":"fork")),
    el("div",{class:"act-t"},el("b",{text:actTitle(a)}),el("span",{text:[ESTAGIO_L[a.estagio],a.gaiolas.join(", ")].filter(Boolean).join(" · ")})),statusPill(agStatus(a),true))):[el("p",{class:"hint",style:"margin:0",text:"Nenhuma atividade neste dia."})]));
  renderPlano();
}
function carregarPlano(){
  if(!esSel) return;
  const e=escalaDe(esSel.cid,esSel.data);
  $("#es-ent").value=e?e.entrada:"08:00"; $("#es-sai").value=e?e.saida:"12:00"; $("#es-rep").value="0"; $("#es-err").textContent="";
  esItens=agendasDe(esSel.cid,esSel.data).map((a,i)=>({id:a.id,tipo:a.tipo,estagio:a.estagio,hora:a.hora,gaiolas:[...a.gaiolas],obs:a.obs,aberto:i===0}));
}
function renderPlano(){
  if(!esSel){ $("#es-plan-sub").textContent=""; return; }
  const dt=parse(esSel.data);
  $("#es-plan-sub").textContent=`${cap(DOWL[dt.getDay()])}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`;
  fillSelect($("#es-colab"), equipe.map(u=>[u.id,u.nome]), esSel.cid);
  $("#es-data").value=esSel.data;
  $("#es-del").hidden=!escalaDe(esSel.cid,esSel.data);
  $("#es-nat").textContent=esItens.length;
  const box=$("#es-ativs"); box.replaceChildren();
  esItens.forEach((it,i)=>{
    const head=el("div",{class:"acc-h"},el("span",{class:"num",text:String(i+1)}),el("b",{text:`${TIPO_L[it.tipo]} · ${ESTAGIO_L[it.estagio].toLowerCase()}`}),el("span",{class:"mono hint",text:it.hora||""}));
    const del=el("button",{type:"button",class:"icon-btn sm","aria-label":"Remover atividade"},ico("trash")); del.onclick=ev=>{ ev.stopPropagation(); esItens.splice(i,1); renderPlano(); };
    const tog=el("button",{type:"button",class:"icon-btn sm","aria-label":it.aberto?"Recolher":"Expandir","aria-expanded":String(!!it.aberto)},ico("chev")); tog.onclick=()=>{ it.aberto=!it.aberto; renderPlano(); };
    head.append(del,tog);
    const card=el("div",{class:"acc-item"+(it.aberto?" open":"")},head);
    if(it.aberto){
      const tipo=el("select",{"aria-label":"Atividade"}); fillSelect(tipo,Object.entries(TIPO_L),it.tipo); tipo.onchange=()=>{ it.tipo=tipo.value; renderPlano(); };
      const est=el("select",{"aria-label":"Estágio"}); fillSelect(est,ESTAGIOS,it.estagio); est.onchange=()=>{ it.estagio=est.value; renderPlano(); };
      const hr=el("input",{type:"time",value:it.hora||"","aria-label":"Horário"}); hr.onchange=()=>{ it.hora=hr.value; renderPlano(); };
      const gs=el("select",{"aria-label":"Adicionar gaiola"}); fillGaiolaSel(gs,it.gaiolas); gs.onchange=()=>{ if(gs.value){ it.gaiolas.push(gs.value); renderPlano(); } };
      const toks=el("div",{class:"tokens in"},...it.gaiolas.map((g,j)=>{ const x=el("button",{type:"button","aria-label":"Remover "+g},ico("x")); x.onclick=()=>{ it.gaiolas.splice(j,1); renderPlano(); }; return el("span",{class:"token"},document.createTextNode(g),x); }));
      card.append(el("div",{class:"acc-b"},
        el("label",{class:"f"},el("span",{class:"lbl soft",text:"Atividade"}),tipo),
        el("div",{class:"row two"},el("label",{class:"f"},el("span",{class:"lbl soft",text:"Estágio"}),est),el("label",{class:"f"},el("span",{class:"lbl soft",text:"Horário"}),hr)),
        el("div",{class:"f"},el("span",{class:"lbl soft",text:"Gaiolas / bandejas"}),toks,gs)));
    }
    box.append(card);
  });
}
$("#es-prev").onclick=()=>{ esAnchor=addDays(esAnchor,-7); renderEscala(); };
$("#es-next").onclick=()=>{ esAnchor=addDays(esAnchor,7); renderEscala(); };
$("#es-now").onclick=()=>{ esAnchor=mondayOf(todayIso()); renderEscala(); };
$("#es-busca").oninput=renderEscala; $("#es-filtro").onchange=renderEscala;
$("#es-colab").onchange=e=>{ esSel={cid:e.target.value,data:esSel.data}; carregarPlano(); renderEscala(); };
$("#es-data").onchange=e=>{ if(!e.target.value) return; esSel={cid:esSel.cid,data:e.target.value}; esAnchor=mondayOf(e.target.value); carregarPlano(); renderEscala(); };
$("#es-add-at").onclick=()=>{ esItens.forEach(x=>x.aberto=false); esItens.push({tipo:"alimentacao",estagio:"adultos",hora:$("#es-ent").value||"09:00",gaiolas:[],obs:"",aberto:true}); renderPlano(); };
$("#es-cancel").onclick=()=>{ carregarPlano(); renderEscala(); };
$("#es-del").onclick=()=>confirmar($("#es-del"),"Remover a escala e as atividades da escala deste dia?",async()=>{
  if(precisaBanco()) return;
  const e=escalaDe(esSel.cid,esSel.data); const ids=agendasDe(esSel.cid,esSel.data).filter(a=>a.origem==="escala"&&agStatus(a)!=="concluida"&&agStatus(a)!=="parcial").map(a=>a.id);
  if(ids.length) await sb.from("agendamentos").delete().in("id",ids);
  if(e) await sb.from("escala").delete().eq("id",e.id);
  toast("Escala removida"); await loadNovas(); carregarPlano(); renderEscala();
});
$("#es-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#es-err"); err.textContent="";
  if(precisaBanco()||!esSel) return;
  const ent=$("#es-ent").value, sai=$("#es-sai").value;
  if(!ent||!sai) return void(err.textContent="Informe a entrada e a saída.");
  if(sai<=ent) return void(err.textContent="A saída precisa ser depois da entrada.");
  const semG=esItens.findIndex(it=>!it.gaiolas.length); if(semG>=0) return void(err.textContent=`Adicione gaiolas na atividade ${semG+1}.`);
  const u=equipe.find(x=>x.id===esSel.cid); const nome=u?u.nome:"";
  const datas=[esSel.data,...[...Array(Number($("#es-rep").value))].map((_,i)=>addDays(esSel.data,7*(i+1)))];
  const btn=$("#es-btn"); btn.disabled=true; btn.textContent="Salvando…";
  try{
    const r1=await sb.from("escala").upsert(datas.map(d=>({colaborador_id:esSel.cid,colaborador:nome,data:d,entrada:ent,saida:sai})),{onConflict:"colaborador_id,data"}).select();
    if(r1.error) throw r1.error;
    // dia escolhido: sincroniza as atividades (altera, cria e remove)
    const antes=agendasDe(esSel.cid,esSel.data); const fica=new Set(esItens.filter(it=>it.id).map(it=>it.id));
    const remover=antes.filter(a=>!fica.has(a.id)).map(a=>a.id);
    if(remover.length){ const r=await sb.from("agendamentos").delete().in("id",remover); if(r.error) throw r.error; }
    const row=it=>({tipo:it.tipo,estagio:it.estagio,hora:it.hora||"",gaiolas:it.gaiolas,responsavel_id:esSel.cid,responsavel:nome,obs:it.obs||""});
    for(const it of esItens.filter(it=>it.id)){ const r=await sb.from("agendamentos").update(row(it)).eq("id",it.id).select(); if(r.error) throw r.error; }
    const novos=esItens.filter(it=>!it.id).map(it=>({...row(it),data:esSel.data,origem:"escala"}));
    // repetição: copia as atividades para as próximas semanas em que a pessoa ainda não tem atividades
    const serie=datas.length>1?uuid():null;
    datas.slice(1).forEach(d=>{ if(!agendasDe(esSel.cid,d).length) esItens.forEach(it=>novos.push({...row(it),data:d,origem:"escala",serie})); });
    if(novos.length){ const r=await sb.from("agendamentos").insert(novos).select(); if(r.error) throw r.error; }
    toast(datas.length>1?`Escala salva para ${datas.length} semanas`:`Escala de ${nome.split(" ")[0]} salva`);
    await loadNovas(); carregarPlano(); renderEscala();
  }catch(x){ err.textContent=errMsg(x); }
  finally{ btn.disabled=false; btn.textContent="Salvar escala"; }
});

/* =================== relatório =================== */
function periodRange(){
  if(rMode==="tudo") return [null,null];
  if(rMode==="mes"){ const ym=rAnchor.slice(0,7); const [y,m]=ym.split("-").map(Number); return [ym+"-01", iso(new Date(y,m,0))]; }
  const s=weekOf(rAnchor); return [s, addDays(s,6)];
}
function filtered(){
  const [a,b]=periodRange(); const fr=$("#r-resp").value, fa=$("#r-alvo").value;
  return sortRecs(records.filter(r=>(!a||r.data>=a)&&(!b||r.data<=b)&&(!fr||r.responsavel===fr)&&(!fa||r.alvos.includes(fa))));
}
function renderReport(){
  if(!rAnchor) rAnchor=todayIso();
  const [a,b]=periodRange();
  $$(".seg button").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.mode===rMode)));
  $("#rel-nav").hidden = rMode==="tudo";
  if(rMode==="semana") $("#rel-title").textContent=`Semana ${br(a)} – ${br(b)}`;
  else if(rMode==="mes"){ const [y,m]=a.split("-").map(Number); $("#rel-title").textContent=`${MESES[m-1]} de ${y}`; }
  else $("#rel-title").textContent="Todos os registros";
  $("#rel-now").textContent = rMode==="mes"?"Mês atual":"Semana atual";
  const fr=filtered();
  const days=new Set(fr.map(r=>r.data)), people=new Set(fr.map(r=>r.responsavel));
  $("#stats").replaceChildren(...[[fr.length,"registros","file"],[days.size,"dias com alimentação","check"],[people.size,"pessoas","users","b"],[fr.filter(r=>r.obs).length,"com observação","msg","a"]].map(statCard));
  $("#wk-sec").hidden = rMode!=="semana";
  if(rMode==="semana") renderGrid(a, fr);
  renderTally(); renderLog(fr);
}
function renderGrid(start, wr){
  const days=[...Array(7)].map((_,i)=>addDays(start,i)); const t=todayIso();
  const tbl=$("#wk-table"); tbl.replaceChildren();
  const hr=el("tr",{},el("th",{class:"rowh",text:""}));
  days.forEach(d=>{const th=el("th",{class:d===t?"today-col":null},el("span",{text:br(d)}),el("span",{class:"dow",text:DOW[parse(d).getDay()]}));hr.append(th);});
  tbl.append(el("thead",{},hr));
  const tb=el("tbody");
  const wrow=el("tr",{},el("th",{class:"rowh",text:"Responsável"}));
  days.forEach(d=>wrow.append(el("td",{class:"who"+(d===t?" today-col":""),text:[...new Set(wr.filter(r=>r.data===d).map(r=>r.responsavel))].join(", ")})));
  tb.append(wrow);
  const fa=$("#r-alvo").value; const alvos=fa?[fa]:[...cfg.alvos]; if(!fa) wr.forEach(r=>r.alvos.forEach(x=>{if(!alvos.includes(x))alvos.push(x)}));
  alvos.forEach(al=>{
    const tr=el("tr",{},el("th",{class:"rowh",text:al}));
    days.forEach(d=>{
      const td=el("td",{class:d===t?"today-col":null}); const rs=wr.filter(r=>r.data===d&&r.alvos.includes(al));
      [...new Set(rs.map(r=>r.hora||""))].forEach(h=>{const s=el("span",{class:"tm"+(outOfWindow(al,h)?" out":""),text:h||"✓"});const acts=rs.filter(r=>(r.hora||"")===h).flatMap(r=>r.atividades.map(x=>ATIV_L[x]||x));s.title=[...new Set(acts)].join(", ")+(outOfWindow(al,h)?" · fora da janela":"");td.append(s);});
      tr.append(td);
    });
    tb.append(tr);
  });
  tbl.append(tb);
}
function tallyData(){
  const b=cfg.base||{}; const base=b.contagem||{}; const after={}; const seen=new Set();
  records.forEach(r=>{ if(b.ate && r.data<=b.ate) return; const k=r.data+"|"+r.responsavel; if(seen.has(k))return; seen.add(k); after[r.responsavel]=(after[r.responsavel]||0)+1; });
  const names=[...new Set([...Object.keys(base),...Object.keys(after)])].sort((x,y)=>((base[y]||0)+(after[y]||0))-((base[x]||0)+(after[x]||0))||x.localeCompare(y,"pt"));
  return {b, base, after, names};
}
function renderTally(){
  const {b, base, after, names}=tallyData();
  $("#tally-h").textContent=`Quantas vezes cada um alimentou desde ${b.desde?br(b.desde):"o início"}`;
  const tbl=$("#tally"); tbl.replaceChildren();
  tbl.append(el("thead",{},el("tr",{},el("th",{text:"Equipe"}),el("th",{class:"n",text:b.ate?`Até ${br(b.ate)}`:"Anterior"}),el("th",{class:"n",text:"Na plataforma"}),el("th",{class:"n",text:"Total"}))));
  const tb=el("tbody"); const T=[0,0,0];
  if(!names.length) tb.append(el("tr",{},el("td",{colspan:"4",class:"hint",text:loaded?"Sem registros ainda.":"Carregando…"})));
  names.forEach(n=>{const x=base[n]||0,y=after[n]||0;T[0]+=x;T[1]+=y;T[2]+=x+y;tb.append(el("tr",{},el("td",{text:n}),el("td",{class:"n",text:String(x)}),el("td",{class:"n",text:String(y)}),el("td",{class:"n",text:String(x+y)})));});
  tbl.append(tb);
  if(names.length) tbl.append(el("tfoot",{},el("tr",{},el("td",{text:"Total"}),el("td",{class:"n",text:String(T[0])}),el("td",{class:"n",text:String(T[1])}),el("td",{class:"n",text:String(T[2])}))));
  $("#tally-note").textContent=b.ate?`Uma vez = um dia de plantão. A coluna "Até ${br(b.ate)}" vem da planilha anterior; depois disso, conta cada dia em que a pessoa registrou alimentação aqui. Este quadro considera todo o histórico, sem filtros.`:"";
}
function renderLog(fr){
  const log=$("#log"); log.replaceChildren();
  $("#log-h").textContent=`Registros e observações (${fr.length})`;
  if(!loaded){log.append(el("div",{class:"empty",text:"Carregando registros…"}));return;}
  if(!fr.length){log.append(el("div",{class:"empty",text:"Nenhum registro neste período com esses filtros."}));return;}
  [...new Set(fr.map(r=>r.data))].sort().reverse().forEach(d=>{
    const rs=fr.filter(r=>r.data===d);
    const box=el("div",{class:"day"},el("h4",{},brFull(d)+" ",el("span",{text:DOWL[parse(d).getDay()]+" · "+[...new Set(rs.map(r=>r.responsavel))].join(", ")})));
    rs.forEach(r=>box.append(entry(r))); log.append(box);
  });
}
function entry(r){
  const tags=el("div",{class:"tags"});
  r.alvos.forEach(a=>tags.append(el("span",{class:"tag",text:a})));
  r.atividades.forEach(a=>tags.append(el("span",{class:"tag a",text:ATIV_L[a]||a})));
  if(r.ovos==="sim") tags.append(el("span",{class:"tag",text:"Com ovos"}));
  if(r.ovos==="nao") tags.append(el("span",{class:"tag",text:"Sem ovos"}));
  const meta = r.atualizado_em ? el("div",{class:"meta",text:`Editado em ${fmtDT(r.atualizado_em)}`}) : (r.origem==="planilha"?el("div",{class:"meta",text:"Importado da planilha"}):null);
  const body=el("div",{},el("div",{class:"who",text:r.responsavel}),tags,r.obs?el("p",{text:r.obs}):null,meta);
  const acts=el("div",{class:"acts"});
  if(canEditRec(r)){
    const ed=el("button",{class:"linkbtn",type:"button",text:"Editar"}); ed.onclick=()=>startEdit(r);
    const del=el("button",{class:"linkbtn del",type:"button",text:"Excluir"});
    del.onclick=()=>{
      acts.replaceChildren(el("span",{class:"hint",text:"Excluir?"}));
      const ok=el("button",{class:"linkbtn danger",type:"button",text:"Confirmar"}); const no=el("button",{class:"linkbtn",type:"button",text:"Cancelar"});
      ok.onclick=async()=>{ const {data,error}=await sb.from("registros").delete().eq("id",r.id).select(); if(error||!data||!data.length){toast("Não foi possível excluir");acts.replaceChildren(ed,del);return;} toast("Registro excluído"); loadRecords(); };
      no.onclick=()=>acts.replaceChildren(ed,del); acts.append(ok,no);
    };
    acts.append(ed,del);
  }
  return el("div",{class:"entry"},el("div",{class:"t",text:r.hora||"--:--"}),body,acts);
}
$$(".seg button").forEach(b=>b.onclick=()=>{rMode=b.dataset.mode;renderReport();});
$("#r-resp").onchange=renderReport; $("#r-alvo").onchange=renderReport;
$("#rel-prev").onclick=()=>{rPicked=true;rAnchor= rMode==="mes"?addMonths(rAnchor.slice(0,7),-1)+"-01":addDays(rAnchor,-7);renderReport();};
$("#rel-next").onclick=()=>{rPicked=true;rAnchor= rMode==="mes"?addMonths(rAnchor.slice(0,7),1)+"-01":addDays(rAnchor,7);renderReport();};
$("#rel-now").onclick=()=>{rPicked=true;rAnchor=todayIso();renderReport();};

/* ---------- exportação ---------- */
function baixarLink(blob, nome){ const u=URL.createObjectURL(blob); const a=el("a",{href:u,download:nome}); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),2000); }
// Salva o arquivo: dentro do Claude usa o salvamento do próprio Claude; no site publicado, download normal.
async function baixar(blob, nome){
  let d=null;
  try{ if(window.claude && window.claude.use) d = await window.claude.use("downloads"); }catch(e){ d=null; }
  if(d){
    try{ await d.save({filename:nome, data:blob}); return true; }
    catch(e){ const c=e&&e.code; if(c==="declined") return false; if(c==="rate_limited"){ toast("Aguarde a janela de salvamento anterior."); return false; } if(c!=="unavailable"&&c!=="not_granted"&&c!=="capability_disabled"&&c!=="capability_removed") throw e; }
  }
  baixarLink(blob, nome); return true;
}
$("#csv").onclick=async()=>{
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const rows=[["data","hora","responsavel","alvos","atividades","ovos","observacoes"].join(";")];
  filtered().forEach(r=>rows.push([brFull(r.data),r.hora,r.responsavel,r.alvos.join(", "),r.atividades.map(a=>ATIV_L[a]||a).join(", "),r.ovos==="sim"?"com ovos":r.ovos==="nao"?"sem ovos":"",r.obs].map(q).join(";")));
  try{ await baixar(new Blob(["﻿"+rows.join("\n")],{type:"text/csv;charset=utf-8"}), `buglab-alimentacao-${todayIso()}.csv`); }catch(e){ toast("Não foi possível salvar o CSV."); }
};
$("#pdf").onclick=async()=>{
  const btn=$("#pdf");
  if(!window.jspdf||!window.jspdf.jsPDF){ toast("O gerador de PDF não carregou. Recarregue a página."); return; }
  btn.disabled=true; btn.textContent="Gerando…";
  try{
    const {jsPDF}=window.jspdf; const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
    const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=14, GREEN=[58,134,80];
    const fr=filtered(); const [a,b]=periodRange();
    if(logoDataUrl){ try{ doc.addImage(logoDataUrl,"PNG",M,10,16,15.2); }catch(e){} }
    doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(27,36,29); doc.text("BUG",M+20,19);
    doc.setFont("helvetica","italic"); doc.text("lab",M+20+doc.getTextWidth("BUG")+0.5,19);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(91,106,94); doc.text("Relatório de alimentação do insetário",M+20,24.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(27,36,29); doc.text($("#rel-title").textContent.replace("–","-"),W-M,17,{align:"right"});
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(91,106,94);
    doc.text(`Responsável: ${$("#r-resp").value||"todos"} · Gaiola/larvas: ${$("#r-alvo").value||"todas"} · Gerado por ${perfil.nome} em ${fmtDT(new Date())}`,W-M,23,{align:"right"});
    doc.setDrawColor(...GREEN); doc.setLineWidth(.6); doc.line(M,29,W-M,29);
    const days=new Set(fr.map(r=>r.data)), people=new Set(fr.map(r=>r.responsavel));
    doc.setFontSize(10); doc.setTextColor(27,36,29);
    doc.text(`${fr.length} registros  ·  ${days.size} dias com alimentação  ·  ${people.size} pessoas  ·  ${fr.filter(r=>r.obs).length} com observação`,M,36);
    let y=41;
    const base={styles:{font:"helvetica",fontSize:8.5,cellPadding:1.8,textColor:[27,36,29],lineColor:[217,224,214],lineWidth:.2,overflow:"linebreak"},headStyles:{fillColor:GREEN,textColor:255,fontStyle:"bold"},alternateRowStyles:{fillColor:[246,248,245]},margin:{left:M,right:M}};
    const section=t=>{ if(y>180){doc.addPage();y=16;} doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(27,36,29);doc.text(t,M,y);y+=3; };
    if(rMode==="semana"){
      section("Grade da semana");
      const ds=[...Array(7)].map((_,i)=>addDays(a,i)); const fa=$("#r-alvo").value; const alvos=fa?[fa]:[...cfg.alvos];
      const body=[["Responsável",...ds.map(d=>[...new Set(fr.filter(r=>r.data===d).map(r=>r.responsavel))].join(", "))]];
      alvos.forEach(al=>body.push([al,...ds.map(d=>[...new Set(fr.filter(r=>r.data===d&&r.alvos.includes(al)).map(r=>r.hora||"feito"))].join("\n"))]));
      doc.autoTable({...base,startY:y,head:[["",...ds.map(d=>`${br(d)} ${DOW[parse(d).getDay()]}`)]],body,columnStyles:{0:{fontStyle:"bold",fillColor:[238,242,236],cellWidth:28}}});
      y=doc.lastAutoTable.finalY+8;
    }
    section("Quantas vezes cada um alimentou");
    const t=tallyData();
    doc.autoTable({...base,startY:y,tableWidth:130,head:[["Equipe",t.b.ate?`Até ${br(t.b.ate)}`:"Anterior","Na plataforma","Total"]],body:t.names.map(n=>[n,t.base[n]||0,t.after[n]||0,(t.base[n]||0)+(t.after[n]||0)]),columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right",fontStyle:"bold"}}});
    y=doc.lastAutoTable.finalY+8;
    section("Registros e observações");
    doc.autoTable({...base,startY:y,head:[["Data","Hora","Responsável","Onde","Atividades","Ovos","Observações"]],
      body:fr.map(r=>[brFull(r.data),r.hora||"-",r.responsavel,r.alvos.join(", ")||"-",r.atividades.map(x=>ATIV_L[x]||x).join(", "),r.ovos==="sim"?"Com ovos":r.ovos==="nao"?"Sem ovos":"",r.obs||""]),
      columnStyles:{0:{cellWidth:20},1:{cellWidth:13},2:{cellWidth:28},3:{cellWidth:38},4:{cellWidth:55},5:{cellWidth:17}}});
    const n=doc.getNumberOfPages();
    for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(91,106,94); doc.text(`BugLab · página ${i} de ${n}`,W/2,H-7,{align:"center"}); }
    const per = rMode==="tudo"?"completo":(rMode==="mes"?a.slice(0,7):`${a}_a_${b}`);
    await baixar(doc.output("blob"), `buglab-relatorio-${per}.pdf`);
  }catch(e){ toast("Não foi possível gerar o PDF."); }
  finally{ btn.disabled=false; btn.textContent="Gerar PDF"; }
};

/* =================== desenvolvedor =================== */
let devSub="usuarios", users=[];
$$(".subtab").forEach(b=>b.onclick=()=>{devSub=b.dataset.sub;renderDev();});
function renderDev(){
  if(!isDev()) return;
  $$(".subtab").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.sub===devSub)));
  $$("[data-subview]").forEach(v=>v.hidden=v.dataset.subview!==devSub);
  if(devSub==="usuarios") loadUsers();
  else if(devSub==="novo") fillNewUserPerms();
  else if(devSub==="sistema") fillCfgForm();
  else if(devSub==="historico") loadHist();
}

/* ---- usuários ---- */
async function loadUsers(){
  const err=$("#users-err"); err.textContent="";
  const { data, error } = await sb.rpc("admin_listar_usuarios");
  if(error){ err.textContent=errMsg(error); return; }
  users=data||[]; renderUsers();
}
function permChecks(container, papel, perms, idPrefix, onChange){
  container.replaceChildren(...PERMS.map(([k,l])=>{
    const dev=papel==="desenvolvedor";
    const i=el("input",{type:"checkbox",id:`${idPrefix}-${k}`,"data-perm":k}); i.checked=dev||!!perms[k]; i.disabled=dev;
    if(onChange) i.onchange=onChange;
    return el("label",{class:"chk"},i,document.createTextNode(l));
  }));
}
function renderUsers(){
  const tbl=$("#users-table"); tbl.replaceChildren();
  tbl.append(el("thead",{},el("tr",{},...["Pessoa","Perfil","Pode","Ativo","Último acesso",""].map(h=>el("th",{text:h})))));
  const tb=el("tbody");
  users.forEach(u=>{
    const tr=el("tr",{class:u.id===uid?"me-row":null});
    const markDirty=()=>{ tr.classList.add("dirty"); save.disabled=false; };
    const nome=el("input",{type:"text",value:u.nome,"aria-label":"Nome"}); nome.oninput=markDirty;
    const nameCell=el("td",{class:"u-name"},nome,el("div",{class:"u-login",text:u.login}),
      u.trocar_senha?el("span",{class:"pill",text:"Ainda não trocou a senha"}):null);
    const papel=el("select",{"aria-label":"Perfil"},...Object.entries(PAPEL_L).map(([v,l])=>{const o=el("option",{value:v,text:l}); if(v===u.papel)o.selected=true; return o;}));
    if(u.id===uid) papel.disabled=true;
    const permBox=el("div",{class:"perm-cell"});
    const drawPerms=()=>permChecks(permBox, papel.value, papel.value==="desenvolvedor"?PERMS_PADRAO.desenvolvedor:(papel.value!==u.papel?PERMS_PADRAO.usuario:(u.permissoes||{})), "p-"+u.id, markDirty);
    drawPerms(); papel.onchange=()=>{drawPerms();markDirty();};
    const ativo=el("input",{type:"checkbox","aria-label":"Ativo"}); ativo.checked=u.ativo; if(u.id===uid) ativo.disabled=true; ativo.onchange=markDirty;
    const save=el("button",{class:"btn sm",type:"button",text:"Salvar"}); save.disabled=true;
    save.onclick=async()=>{
      const perms={}; permBox.querySelectorAll("[data-perm]").forEach(i=>perms[i.dataset.perm]=i.checked);
      save.disabled=true; save.textContent="Salvando…";
      const { error } = await sb.rpc("admin_atualizar_usuario",{p_id:u.id,p_nome:norm(nome.value),p_papel:papel.value,p_perms:perms,p_ativo:ativo.checked});
      save.textContent="Salvar";
      if(error){ $("#users-err").textContent=errMsg(error); save.disabled=false; return; }
      toast(`${norm(nome.value)} atualizado`); loadUsers();
      if(u.id===uid){ perfil.nome=norm(nome.value); $("#me-nome").textContent=perfil.nome; $$("[data-avatar]").forEach(a=>a.textContent=iniciais(perfil.nome)); }
    };
    const pwBtn=el("button",{class:"btn ghost sm",type:"button",text:"Redefinir senha"});
    const pwBox=el("div",{class:"u-pw",hidden:true});
    const pwIn=el("input",{type:"text",placeholder:"Nova senha inicial",autocomplete:"off","aria-label":"Nova senha"});
    const pwOk=el("button",{class:"btn sm",type:"button",text:"Definir"});
    const pwNo=el("button",{class:"linkbtn",type:"button",text:"Cancelar"});
    pwBtn.onclick=()=>{pwBox.hidden=false;pwIn.value=u.login;pwIn.focus();pwIn.select();};
    pwNo.onclick=()=>{pwBox.hidden=true;};
    pwOk.onclick=async()=>{
      if(pwIn.value.length<6){ $("#users-err").textContent="A senha precisa ter pelo menos 6 caracteres."; return; }
      const { error } = await sb.rpc("admin_definir_senha",{p_id:u.id,p_senha:pwIn.value});
      if(error){ $("#users-err").textContent=errMsg(error); return; }
      pwBox.hidden=true; toast(`Senha de ${u.login} redefinida. A pessoa troca no próximo acesso.`); loadUsers();
    };
    pwBox.append(pwIn,pwOk,pwNo);
    const acts=el("div",{class:"u-actions"},save,pwBtn);
    if(u.id!==uid){
      const del=el("button",{class:"linkbtn",type:"button",text:"Excluir"});
      del.onclick=()=>{
        const conf=el("span",{class:"u-actions"},el("span",{class:"hint",text:`Excluir ${u.login}?`}));
        const ok=el("button",{class:"linkbtn danger",type:"button",text:"Confirmar"}); const no=el("button",{class:"linkbtn",type:"button",text:"Cancelar"});
        ok.onclick=async()=>{ const { error } = await sb.rpc("admin_excluir_usuario",{p_id:u.id}); if(error){ $("#users-err").textContent=errMsg(error); return; } toast(`${u.login} excluído`); loadUsers(); };
        no.onclick=()=>conf.replaceWith(del);
        conf.append(ok,no); del.replaceWith(conf);
      };
      acts.append(del);
    }
    tr.append(nameCell, el("td",{},papel), el("td",{},permBox),
      el("td",{},el("label",{class:"chk"},ativo,document.createTextNode(u.ativo?"Ativo":"Inativo"))),
      el("td",{class:"when",text:u.ultimo_acesso?fmtDT(u.ultimo_acesso):"Nunca entrou"}),
      el("td",{},acts,pwBox));
    tb.append(tr);
  });
  tbl.append(tb);
}

/* ---- novo usuário ---- */
function fillNewUserPerms(){ const p=$("#nu-papel").value; permChecks($("#nu-perms"), p, PERMS_PADRAO[p], "nu"); }
$("#nu-papel").onchange=fillNewUserPerms;
$("#nu-nome").addEventListener("input",()=>{
  const li=$("#nu-login"); if(li.dataset.touched) return;
  const parts=norm($("#nu-nome").value).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z\s]/g,"").split(" ").filter(Boolean);
  li.value = parts.length>1 ? parts[0]+"."+parts.at(-1) : (parts[0]||"");
});
$("#nu-login").addEventListener("input",e=>{ e.target.dataset.touched="1"; });
$("#nu-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#nu-err"); err.textContent="";
  const nome=norm($("#nu-nome").value), login=norm($("#nu-login").value).toLowerCase(), senha=$("#nu-senha").value, papel=$("#nu-papel").value;
  if(!nome) return void(err.textContent="Informe o nome.");
  if(!/^[a-z0-9._-]{3,40}$/.test(login)) return void(err.textContent="Login inválido: use letras minúsculas, números, ponto, hífen ou sublinhado.");
  if(senha.length<6) return void(err.textContent="A senha inicial precisa ter pelo menos 6 caracteres.");
  const perms={}; $$("#nu-perms [data-perm]").forEach(i=>perms[i.dataset.perm]=i.checked);
  const btn=$("#nu-btn"); btn.disabled=true; btn.textContent="Criando…";
  const { error } = await sb.rpc("admin_criar_usuario",{p_login:login,p_nome:nome,p_senha:senha,p_papel:papel,p_perms:papel==="desenvolvedor"?null:perms});
  btn.disabled=false; btn.textContent="Criar usuário";
  if(error){ err.textContent=errMsg(error); return; }
  $("#nu-form").reset(); delete $("#nu-login").dataset.touched; fillNewUserPerms();
  toast(`Usuário ${login} criado`); devSub="usuarios"; renderDev();
});

/* ---- configurações ---- */
function fillCfgForm(){
  $("#cfg-alvos").value=cfg.alvos.join("\n");
  $("#cfg-ad1").value=cfg.janelas.adultos[0]; $("#cfg-ad2").value=cfg.janelas.adultos[1];
  $("#cfg-la1").value=cfg.janelas.larvas[0]; $("#cfg-la2").value=cfg.janelas.larvas[1];
  $("#cfg-semana").value=String(cfg.inicioSemana);
  $("#cfg-desde").value=(cfg.base&&cfg.base.desde)||""; $("#cfg-ate").value=(cfg.base&&cfg.base.ate)||"";
  $("#cfg-contagem").value=Object.entries((cfg.base&&cfg.base.contagem)||{}).map(([k,v])=>`${k} = ${v}`).join("\n");
  $("#cfg-err").textContent="";
}
$("#cfg-form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#cfg-err"); err.textContent="";
  const alvos=$("#cfg-alvos").value.split("\n").map(norm).filter(Boolean);
  if(!alvos.length) return void(err.textContent="Informe pelo menos uma gaiola ou as larvas.");
  const contagem={};
  for(const line of $("#cfg-contagem").value.split("\n").map(norm).filter(Boolean)){
    const m=line.match(/^(.+?)\s*[=:]\s*(\d+)$/); if(!m) return void(err.textContent=`Não entendi a linha "${line}". Use o formato Nome = número.`);
    contagem[m[1]]=Number(m[2]);
  }
  const dados={...cfg, alvos, inicioSemana:Number($("#cfg-semana").value),
    janelas:{adultos:[$("#cfg-ad1").value||"10:00",$("#cfg-ad2").value||"18:00"],larvas:[$("#cfg-la1").value||"15:00",$("#cfg-la2").value||"18:00"]},
    base:{desde:$("#cfg-desde").value||null, ate:$("#cfg-ate").value||null, contagem}};
  const btn=$("#cfg-btn"); btn.disabled=true; btn.textContent="Salvando…";
  const { data, error } = await sb.from("config").update({dados}).eq("id",1).select();
  btn.disabled=false; btn.textContent="Salvar configurações";
  if(error||!data||!data.length){ err.textContent=error?errMsg(error):"Não foi possível salvar."; return; }
  toast("Configurações salvas"); await loadConfig(); buildTeam();
});

/* ---- histórico ---- */
const ACAO_L={insert:"criou",update:"alterou",delete:"excluiu"};
const TAB_L={registros:"Registro",perfis:"Usuário",config:"Configurações",agendamentos:"Agendamento",escala:"Escala",lotes:"Lote",placas:"Placa",criacao_registros:"Contagem da criação"};
const IGNORAR=new Set(["atualizado_em","criado_em","id","autor","updated_at"]);
function resumoMudanca(h){
  if(h.acao!=="update"||!h.detalhes||!h.detalhes.antes) return "";
  const a=h.detalhes.antes, d=h.detalhes.depois; const out=[];
  for(const k of Object.keys(d)){ if(IGNORAR.has(k)) continue; if(JSON.stringify(a[k])!==JSON.stringify(d[k])) out.push(k==="trocar_senha"?(d[k]?"senha redefinida":"trocou a própria senha"):k); }
  return out.length?"Campos: "+out.join(", "):"";
}
async function loadHist(){
  const tbl=$("#hist-table"); tbl.replaceChildren(el("tbody",{},el("tr",{},el("td",{class:"hint",text:"Carregando…"}))));
  const { data, error } = await sb.from("historico").select("*").order("quando",{ascending:false}).limit(300);
  tbl.replaceChildren();
  if(error){ tbl.append(el("tbody",{},el("tr",{},el("td",{class:"err",text:errMsg(error)})))); return; }
  tbl.append(el("thead",{},el("tr",{},...["Quando","Quem","Ação","Onde","Item","Detalhe"].map(h=>el("th",{text:h})))));
  const tb=el("tbody");
  if(!data.length) tb.append(el("tr",{},el("td",{colspan:"6",class:"hint",text:"Nenhuma alteração registrada ainda."})));
  data.forEach(h=>tb.append(el("tr",{},
    el("td",{class:"q",text:fmtDT(h.quando)}), el("td",{text:h.login||"—"}),
    el("td",{},el("span",{class:"ac "+h.acao,text:ACAO_L[h.acao]||h.acao})),
    el("td",{text:TAB_L[h.tabela]||h.tabela}), el("td",{text:h.alvo||""}), el("td",{class:"chg",text:resumoMudanca(h)}))));
  tbl.append(tb);
}
$("#hist-reload").onclick=loadHist;

/* =================== início =================== */
(async function boot(){
  const ok = CONF.supabaseUrl && !/COLE_AQUI/.test(CONF.supabaseUrl) && CONF.supabaseAnonKey && !/COLE_AQUI/.test(CONF.supabaseAnonKey);
  showScreen("login");
  if(!ok || !window.supabase){
    $("#l-err").textContent = !window.supabase ? "Não foi possível carregar o sistema. Verifique a internet." : "Sistema ainda não configurado: preencha o arquivo config.js com os dados do Supabase.";
    return;
  }
  sb = window.supabase.createClient(CONF.supabaseUrl, CONF.supabaseAnonKey, { auth:{ persistSession:true, autoRefreshToken:true, storage:sessaoStore } });
  sb.auth.onAuthStateChange((ev)=>{ if(ev==="SIGNED_OUT" && !$("#app").hidden){ location.reload(); } });
  const { data } = await sb.auth.getSession();
  if(data && data.session && data.session.user){ await afterLogin(data.session.user); }
  else { $("#l-login").focus(); }
})();
})();
