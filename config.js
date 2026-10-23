// BugLab · configuração do Supabase
// Supabase → Project Settings → API. Cole a Project URL e a chave "anon / public".
// A chave anon é pública por natureza (o acesso é protegido pelas regras do banco).
// NUNCA coloque aqui a chave "service_role".
window.BUGLAB_CONFIG = {
  supabaseUrl: "https://oovkoanznsaundopicnw.supabase.co",
  supabaseAnonKey: "sb_publishable_SPi-3CYtIpwLGxmq2Dm_ow_3dhStWn5",
  dominioLogin: "buglab.local"                      // não altere depois de criar os usuários
};
