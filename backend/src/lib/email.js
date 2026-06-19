import nodemailer from 'nodemailer';

const APP_NAME = 'FinAnalyze';

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

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

export async function sendVerificationEmail({ to, code }) {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const html = baseHtml('Código de verificação', `
      <p style="margin:0 0 16px;color:#18181b;font-size:15px">Use o código abaixo para verificar seu email:</p>
      <div style="background:#f4f4f5;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1D9E75">${code}</span>
      </div>
      <p style="margin:0;color:#71717a;font-size:13px">O código expira em 15 minutos. Se não foi você, ignore este email.</p>
    `);
    try {
      await getTransporter().sendMail({
        from: `${APP_NAME} <${process.env.EMAIL_USER}>`,
        to, subject: `${code} — código de verificação ${APP_NAME}`, html
      });
      return { sent: true };
    } catch (e) {
      console.error('[email] erro ao enviar:', e.message);
      return { sent: false, error: e.message };
    }
  }
  console.log(`[email] (dev) verificação ${code} para ${to}`);
  return { sent: false, devCode: code };
}

export async function sendPasswordResetEmail({ to, link }) {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const html = baseHtml('Redefinir senha', `
      <p style="margin:0 0 16px;color:#18181b;font-size:15px">Recebemos uma solicitação para redefinir a senha da sua conta.</p>
      <a href="${link}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:16px">Redefinir senha</a>
      <p style="margin:8px 0 0;color:#71717a;font-size:13px">O link expira em 1 hora. Se não foi você, ignore este email.</p>
    `);
    try {
      await getTransporter().sendMail({
        from: `${APP_NAME} <${process.env.EMAIL_USER}>`,
        to, subject: `Redefinição de senha — ${APP_NAME}`, html
      });
      return { sent: true };
    } catch (e) {
      console.error('[email] erro ao enviar:', e.message);
      return { sent: false, error: e.message };
    }
  }
  console.log(`[email] (dev) reset link para ${to}: ${link}`);
  return { sent: false, devLink: link };
}

export async function sendInviteEmail({ to, name, companyName, link, role }) {
  const roleLabel = role === 'manager' ? 'gerente' : 'funcionário';
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const html = baseHtml('Convite para o FinAnalyze', `
      <p style="margin:0 0 8px;color:#18181b;font-size:15px">Olá${name ? `, ${name}` : ''}!</p>
      <p style="margin:0 0 16px;color:#18181b;font-size:15px">Você foi convidado como <strong>${roleLabel}</strong> da empresa <strong>${companyName}</strong> no ${APP_NAME}.</p>
      <a href="${link}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:16px">Aceitar convite</a>
      <p style="margin:8px 0 0;color:#71717a;font-size:13px">O link expira em 48 horas.</p>
    `);
    try {
      await getTransporter().sendMail({
        from: `${APP_NAME} <${process.env.EMAIL_USER}>`,
        to, subject: `Você foi convidado para ${companyName} — ${APP_NAME}`, html
      });
      return { sent: true };
    } catch (e) {
      console.error('[email] erro ao enviar:', e.message);
      return { sent: false, error: e.message };
    }
  }
  console.log(`[email] (dev) convite ${roleLabel} para ${to} (${companyName}): ${link}`);
  return { sent: false, devLink: link };
}
