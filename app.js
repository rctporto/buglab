/* BugLab · Controle de alimentação do insetário
   Front-end estático (GitHub Pages) + Supabase (login, banco e regras de acesso). */
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
let calMonth = null, current = "calendario";
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
  $("#me-papel").textContent = PAPEL_L[perfil.papel] || perfil.papel;
  $$("[data-avatar]").forEach(a=>{ a.textContent=iniciais(perfil.nome); a.title=perfil.nome; });
  $("#cal-add").hidden = !can("registrar");
  $("#tab-dev").hidden = !isDev();
  $("#tab-relatorio").hidden = !can("ver_relatorio");
  $("#pdf").hidden = $("#csv").hidden = !can("exportar");
  const h=(location.hash||"").replace("#","");
  buildForm(); resetForm(todayIso());
  show(VIEWS.includes(h) && tabAllowed(h) ? h : "calendario");
  await Promise.all([loadConfig(), loadRecords()]);
  subscribe();
  loadLogo();
}
async function loadConfig(){
  const { data } = await sb.from("config").select("dados").eq("id",1).maybeSingle();
  cfg = {...structuredClone(DEFAULT_CFG), ...((data&&data.dados)||{})};
  const chk=$$("#f-alvos input:checked,#f-ativ input:checked").map(i=>i.value);
  buildForm(); $$("#f-alvos input,#f-ativ input").forEach(i=>{ if(chk.includes(i.value)) i.checked=true; });
  $("#win-ad").textContent=cfg.janelas.adultos.join("–"); $("#win-la").textContent=cfg.janelas.larvas.join("–");
  renderCurrent();
}
async function loadRecords(){
  const all=[]; let from=0; const step=1000;
  for(;;){
    const { data, error } = await sb.from("registros").select("*").order("data",{ascending:true}).range(from, from+step-1);
    if(error){ notice("Não foi possível carregar os registros. Recarregue a página."); return; }
    all.push(...data); if(data.length<step) break; from+=step;
  }
  records = all.map(r=>({...r, hora:r.hora||"", alvos:r.alvos||[], atividades:r.atividades||[], obs:r.obs||"", ovos:r.ovos||""}));
  loaded = true;
  if(!rPicked && records.length && !records.some(r=>r.data>=weekOf(todayIso()))) rAnchor = sortRecs(records).at(-1).data;
  buildTeam(); renderCurrent();
}
let reloadT=null;
function scheduleReload(){ clearTimeout(reloadT); reloadT=setTimeout(loadRecords, 400); }
function subscribe(){
  try{
    channel = sb.channel("registros-buglab").on("postgres_changes",{event:"*",schema:"public",table:"registros"}, scheduleReload).subscribe();
  }catch(e){}
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) scheduleReload(); });
}
async function loadLogo(){
  try{ const b=await (await fetch("logo.png")).blob(); logoDataUrl=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);}); }catch(e){}
}

/* =================== navegação =================== */
const VIEWS=["calendario","registro","relatorio","dev"];
const tabAllowed = v => v==="dev" ? isDev() : v==="relatorio" ? can("ver_relatorio") : true;
function show(view){
  if(!tabAllowed(view)) view="calendario";
  current=view;
  for(const v of VIEWS){ $("#view-"+v).hidden = v!==view; $("#tab-"+v).setAttribute("aria-selected", String(v===view)); }
  try{ history.replaceState(null,"","#"+view); }catch(e){}
  renderCurrent(); window.scrollTo({top:0});
}
VIEWS.forEach(v=>$("#tab-"+v).onclick=()=>show(v));
function renderCurrent(){
  if(current==="calendario") renderCalendar();
  else if(current==="registro") renderDay();
  else if(current==="relatorio") renderReport();
  else if(current==="dev") renderDev();
}
function openDay(d){ if(editingId) cancelEdit(); resetForm(d); show("registro"); }

/* =================== calendário =================== */
function renderCalendar(){
  if(!calMonth) calMonth = todayIso().slice(0,7);
  const [y,m]=calMonth.split("-").map(Number);
  $("#cal-title").textContent = `${MESES[m-1]} de ${y}`;
  $("#cal-hint").textContent = can("registrar") ? "Clique em um dia para lançar a alimentação daquela data." : "Clique em um dia para ver o que foi feito.";
  const first=new Date(y,m-1,1); const start=new Date(first); start.setDate(1-first.getDay());
  const map=byDate(); const t=todayIso();
  const doMes=records.filter(r=>r.data.startsWith(calMonth));
  $("#cal-stats").replaceChildren(...(loaded?[
    [doMes.length,"registros no mês","file"],
    [new Set(doMes.map(r=>r.data)).size,"dias com alimentação","check"],
    [new Set(doMes.map(r=>r.responsavel)).size,"pessoas registraram","users","b"],
    [(map[t]||[]).length,"registros hoje","clock","a"]
  ]:[]).map(statCard));
  const cal=$("#cal"); cal.replaceChildren(...DOW.map(d=>el("div",{class:"dh",text:d})));
  const weeks = Math.ceil((first.getDay()+new Date(y,m,0).getDate())/7);
  for(let i=0;i<weeks*7;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=iso(d);
    const rs=map[ds]||[]; const other=d.getMonth()!==m-1;
    const names=[...new Set(rs.map(r=>r.responsavel))];
    const done=new Set(rs.flatMap(r=>r.alvos));
    const b=el("button",{type:"button",class:"day-btn"+(other?" other":"")+(ds===t?" today":""),"aria-label":`${DOWL[d.getDay()]}, ${brFull(ds)}: ${rs.length?rs.length+" registro(s) de "+names.join(", "):"sem registros"}.`});
    b.append(el("div",{class:"n"},el("span",{text:String(d.getDate())}),rs.length?el("span",{class:"cnt",text:rs.length+" reg."}):null));
    if(names.length) b.append(el("div",{class:"names",text:names.join(", ")}));
    if(rs.length){ const dots=el("div",{class:"dots"}); cfg.alvos.forEach(a=>dots.append(el("span",{class:"dot"+(done.has(a)?" on":""),text:abbr(a),title:a}))); b.append(dots); }
    else if(!other && loaded && can("registrar")) b.append(el("span",{class:"add",text:"+ registrar"}));
    b.onclick=()=>openDay(ds);
    cal.append(b);
  }
}
$("#cal-prev").onclick=()=>{calMonth=addMonths(calMonth,-1);renderCalendar();};
$("#cal-next").onclick=()=>{calMonth=addMonths(calMonth,1);renderCalendar();};
$("#cal-now").onclick=()=>{calMonth=todayIso().slice(0,7);renderCalendar();};
$("#cal-add").onclick=()=>openDay(todayIso());

/* =================== registro =================== */
function buildForm(){
  const alvos=$("#f-alvos"); alvos.replaceChildren();
  cfg.alvos.forEach((a,i)=>alvos.append(el("label",{class:"chip"},el("input",{type:"checkbox",value:a,id:"alvo-"+i}),el("span",{text:a}))));
  const at=$("#f-ativ"); at.replaceChildren();
  ATIV.forEach(([k,l])=>at.append(el("label",{class:"chip"},el("input",{type:"checkbox",value:k,id:"at-"+k}),el("span",{text:l}))));
  applyFormPerms();
}
function applyFormPerms(){
  const allowed = editingId ? true : can("registrar");
  $("#reg-blocked").hidden = allowed;
  $$("#form input,#form select,#form textarea,#form button").forEach(x=>x.disabled=!allowed);
  $("#f-resp").readOnly = !can("editar_todos");
}
function teamNames(){ const s=new Set(); if(perfil) s.add(perfil.nome); records.forEach(r=>r.responsavel&&s.add(norm(r.responsavel))); return [...s].filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt")); }
function buildTeam(){
  const names=teamNames();
  $("#dl-equipe").replaceChildren(...names.map(n=>el("option",{value:n})));
  const rr=$("#r-resp"), keep=rr.value; rr.replaceChildren(el("option",{value:"",text:"Todos"}),...names.map(n=>el("option",{value:n,text:n}))); rr.value=names.includes(keep)?keep:"";
  const ra=$("#r-alvo"), ka=ra.value; ra.replaceChildren(el("option",{value:"",text:"Todas"}),...cfg.alvos.map(a=>el("option",{value:a,text:a}))); ra.value=cfg.alvos.includes(ka)?ka:"";
}
function resetForm(d){
  $$("#f-alvos input,#f-ativ input").forEach(i=>i.checked=false);
  $("#f-obs").value=""; $("#f-ovos").value=""; $("#f-err").textContent="";
  $("#f-resp").value = perfil ? perfil.nome : "";
  $("#f-data").value = d || todayIso();
  const now=new Date(); $("#f-hora").value = ($("#f-data").value===todayIso()) ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "";
  renderDay();
}
function startEdit(r){
  editingId=r.id;
  $("#f-resp").value=r.responsavel; $("#f-data").value=r.data; $("#f-hora").value=r.hora||"";
  $$("#f-alvos input").forEach(i=>i.checked=r.alvos.includes(i.value));
  $$("#f-ativ input").forEach(i=>i.checked=r.atividades.includes(i.value));
  $("#f-ovos").value=r.ovos||""; $("#f-obs").value=r.obs||""; $("#f-err").textContent="";
  $("#editing").hidden=false; $("#f-submit").textContent="Salvar alterações";
  applyFormPerms(); show("registro");
}
function cancelEdit(){ editingId=null; $("#editing").hidden=true; $("#f-submit").textContent="Salvar registro"; applyFormPerms(); }
$("#edit-cancel").onclick=()=>{ const d=$("#f-data").value; cancelEdit(); resetForm(d); };
$("#f-data").addEventListener("change",()=>renderDay());
$("#reg-back").onclick=()=>{ const d=$("#f-data").value; if(d) calMonth=d.slice(0,7); show("calendario"); };
$("#d-prev").onclick=()=>{ if(editingId) cancelEdit(); resetForm(addDays($("#f-data").value||todayIso(),-1)); };
$("#d-next").onclick=()=>{ if(editingId) cancelEdit(); resetForm(addDays($("#f-data").value||todayIso(),1)); };
function renderDay(){
  const d=$("#f-data").value||todayIso(); const dt=parse(d);
  $("#reg-title").textContent = editingId ? "Editar registro" : "Registrar alimentação";
  $("#reg-date").textContent = `${DOWL[dt.getDay()]}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()} de ${dt.getFullYear()}`;
  $("#day-h").textContent = d===todayIso() ? `Registros de hoje · ${br(d)}` : `Registros de ${br(d)}`;
  const list=$("#day-list");
  if(!loaded){ list.replaceChildren(el("li",{class:"hint none",text:"Carregando…"})); return; }
  const rs=sortRecs(records.filter(r=>r.data===d));
  if(!rs.length){ list.replaceChildren(el("li",{class:"hint none",text:"Nenhum registro nesta data."})); return; }
  list.replaceChildren(...rs.map(r=>{
    const li=el("li",{},el("div",{class:"t",text:`${r.hora||"--:--"} · ${r.responsavel}`}),
      el("div",{text:`${r.alvos.join(", ")||"Sem gaiola indicada"}: ${r.atividades.map(a=>ATIV_L[a]||a).join(", ")||"observação"}`}),
      r.obs?el("div",{class:"hint",text:r.obs}):null);
    if(canEditRec(r)){ const b=el("button",{type:"button",class:"linkbtn",text:"Editar"}); b.onclick=()=>startEdit(r); li.append(b); }
    return li;
  }));
}
$("#form").addEventListener("submit", async e=>{
  e.preventDefault(); const err=$("#f-err"); err.textContent="";
  const rec={ responsavel:norm($("#f-resp").value), data:$("#f-data").value, hora:$("#f-hora").value||"",
    alvos:$$("#f-alvos input:checked").map(i=>i.value), atividades:$$("#f-ativ input:checked").map(i=>i.value),
    ovos:$("#f-ovos").value, obs:$("#f-obs").value.trim() };
  if(!rec.responsavel) return void(err.textContent="Informe o responsável.");
  if(!rec.data) return void(err.textContent="Informe a data.");
  if(!rec.alvos.length) return void(err.textContent="Marque pelo menos uma gaiola ou as larvas.");
  if(!rec.atividades.length && !rec.obs) return void(err.textContent="Marque uma atividade ou escreva uma observação.");
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
const TAB_L={registros:"Registro",perfis:"Usuário",config:"Configurações"};
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
