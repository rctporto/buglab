// BugLab · configuração do Supabase
// Cópia do config.js da raiz para o site novo (GitHub /nova e Firebase buglab-adm.web.app). Mantenha os dois iguais.
// Supabase → Project Settings → API. Cole a Project URL e a chave "anon / public".
// A chave anon é pública por natureza (o acesso é protegido pelas regras do banco).
// NUNCA coloque aqui a chave "service_role".
window.BUGLAB_CONFIG = {
  supabaseUrl: "https://oovkoanznsaundopicnw.supabase.co",
  supabaseAnonKey: "sb_publishable_SPi-3CYtIpwLGxmq2Dm_ow_3dhStWn5",
  dominioLogin: "buglab.local"                      // não altere depois de criar os usuários
};
