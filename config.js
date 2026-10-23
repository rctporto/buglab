// BugLab · configuração do Supabase
// Supabase → Project Settings → API. Cole a Project URL e a chave "anon / public".
// A chave anon é pública por natureza (o acesso é protegido pelas regras do banco).
// NUNCA coloque aqui a chave "service_role".
window.BUGLAB_CONFIG = {
  supabaseUrl: "COLE_AQUI_A_PROJECT_URL",          // ex.: https://abcdefgh.supabase.co
  supabaseAnonKey: "COLE_AQUI_A_CHAVE_ANON",
  dominioLogin: "buglab.local"                      // não altere depois de criar os usuários
};
