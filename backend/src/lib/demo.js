// Flag única pra tudo que é específico de um deploy de demonstração pública
// (ver render.yaml) — hoje controla duas coisas: semear as contas "Entrar
// como X (demo)" (lib/seed.js) e expor o código/link de verificação nas
// respostas da API (routes/auth.js), já que o Resend em modo sandbox
// (EMAIL_FROM=onboarding@resend.dev, sem domínio verificado) só entrega
// e-mail pro dono da conta Resend, nunca pra quem se cadastra de verdade.
// Nunca deve ficar true numa instância de produção real com clientes reais.
export const DEMO_MODE = process.env.SEED_DEMO_DATA === 'true';
