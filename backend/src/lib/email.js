import { Resend } from 'resend';
import { DEMO_MODE } from './demo.js';

const APP_NAME = 'SynerCoop';
const IS_PROD = process.env.NODE_ENV === 'production';

// Envia via API HTTPS (porta 443, nunca bloqueada por rede/firewall) em vez
// de SMTP — SMTP costuma ser bloqueado por provedores de internet, VPNs e
// firewalls corporativos, o que travava o envio (e, sem timeout, a rota
// inteira) sempre que isso acontecia.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function baseHtml(title, body) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
        <tr><td style="background:#1D9E75;padding:24px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700">${APP_NAME}</span>
        </td></tr>
        <tr><td style="padding:32px">${body}</td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f4f4f5">
          <span style="color:#a1a1aa;font-size:12px">Você recebeu este email porque possui uma conta no ${APP_NAME}.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Fora de produção (ou quando o envio falha), expõe o código/link direto na
// resposta da API — assim o fluxo continua testável sem uma caixa de e-mail.
// Em DEMO_MODE expõe sempre, mesmo com sent:true: o Resend em modo sandbox
// (sem domínio verificado) só entrega pro dono da conta, então qualquer
// outra pessoa se cadastrando nessa demo nunca receberia o e-mail de verdade.
function withDevData(result, key, value) {
  if (DEMO_MODE) return { ...result, [key]: value };
  return result.sent || IS_PROD ? result : { ...result, [key]: value };
}

async function send({ to, subject, html }) {
  if (!resend) return { sent: false, error: 'not_configured' };
  try {
    const { error } = await resend.emails.send({ from: `${APP_NAME} <${EMAIL_FROM}>`, to, subject, html });
    if (error) throw new Error(error.message || 'Falha ao enviar e-mail.');
    return { sent: true };
  } catch (e) {
    console.error('[email] erro ao enviar:', e.message);
    return { sent: false, error: e.message };
  }
}

export async function sendVerificationEmail({ to, code }) {
  if (resend) {
    const html = baseHtml('Código de verificação', `
      <p style="margin:0 0 16px;color:#18181b;font-size:15px">Use o código abaixo para verificar seu email:</p>
      <div style="background:#f4f4f5;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1D9E75">${code}</span>
      </div>
      <p style="margin:0;color:#71717a;font-size:13px">O código expira em 15 minutos. Se não foi você, ignore este email.</p>
    `);
    const r = await send({ to, subject: `${code} — código de verificação ${APP_NAME}`, html });
    return withDevData(r, 'devCode', code);
  }
  console.log(`[email] (dev) verificação ${code} para ${to}`);
  return { sent: false, devCode: code };
}

export async function sendPasswordResetEmail({ to, link }) {
  if (resend) {
    const html = baseHtml('Redefinir senha', `
      <p style="margin:0 0 16px;color:#18181b;font-size:15px">Recebemos uma solicitação para redefinir a senha da sua conta.</p>
      <a href="${link}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:16px">Redefinir senha</a>
      <p style="margin:8px 0 0;color:#71717a;font-size:13px">O link expira em 1 hora. Se não foi você, ignore este email.</p>
    `);
    const r = await send({ to, subject: `Redefinição de senha — ${APP_NAME}`, html });
    return withDevData(r, 'devLink', link);
  }
  console.log(`[email] (dev) reset link para ${to}: ${link}`);
  return { sent: false, devLink: link };
}

export async function sendInviteEmail({ to, name, companyName, link, role }) {
  const roleLabel = role === 'manager' ? 'gerente' : 'funcionário';
  if (resend) {
    const html = baseHtml('Convite para o FinAnalyze', `
      <p style="margin:0 0 8px;color:#18181b;font-size:15px">Olá${name ? `, ${name}` : ''}!</p>
      <p style="margin:0 0 16px;color:#18181b;font-size:15px">Você foi convidado como <strong>${roleLabel}</strong> da empresa <strong>${companyName}</strong> no ${APP_NAME}.</p>
      <a href="${link}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:16px">Aceitar convite</a>
      <p style="margin:8px 0 0;color:#71717a;font-size:13px">O link expira em 48 horas.</p>
    `);
    const r = await send({ to, subject: `Você foi convidado para ${companyName} — ${APP_NAME}`, html });
    return withDevData(r, 'devLink', link);
  }
  console.log(`[email] (dev) convite ${roleLabel} para ${to} (${companyName}): ${link}`);
  return { sent: false, devLink: link };
}
