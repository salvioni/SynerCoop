import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { isValidEmail } from '../lib/validate.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    const em = email.trim();
    if (!em) return setErr('Informe o e-mail.');
    if (!isValidEmail(em)) return setErr('E-mail inválido.');
    setBusy(true);
    try {
      const r = await api.post('/auth/forgot-password', { email: em });
      setSent(true);
      if (r.devLink) setDevLink(r.devLink);
    } catch (e) {
      if (e instanceof ApiError && e.fields?.email) setErr(e.fields.email);
      else setErr(e.message || 'Não foi possível processar.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-outer">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-badge">S</div>
          <span className="auth-logo-name">SynerCoop</span>
        </div>

        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(245,158,11,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--yellow-t)', fontSize: 22 }}>
          <i className="ti ti-key"></i>
        </div>

        <div className="auth-title" style={{ textAlign: 'center' }}>Esqueci minha senha</div>
        <div className="auth-sub" style={{ textAlign: 'center' }}>Enviaremos um link para redefinir a senha.</div>

        {sent ? (
          <>
            <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 7, padding: '9px 11px', fontSize: 12, color: 'var(--green-t)', marginBottom: 12 }}>
              Se o e-mail <strong>{email}</strong> existir, um link foi enviado.
            </div>
            {devLink && (
              <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 7, padding: '7px 10px', fontSize: 11, color: 'var(--yellow-t)', marginBottom: 12 }}>
                <i className="ti ti-info-circle"></i> Demo:{' '}
                <a href={devLink} style={{ color: 'var(--yellow-t)', textDecoration: 'underline', wordBreak: 'break-all' }}>{devLink}</a>
              </div>
            )}
            <div className="auth-foot"><Link to="/login">← Voltar ao login</Link></div>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            {err && <div className="auth-err">{err}</div>}
            <div className="inp-wrap">
              <label className="inp-label">E-mail</label>
              <input className={`inp${err ? ' inp-err' : ''}`} type="email" placeholder="seu@email.com"
                value={email} onChange={e => { setEmail(e.target.value); if (err) setErr(''); }} autoFocus />
            </div>
            <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              <i className="ti ti-send"></i> {busy ? 'Enviando…' : 'Enviar link'}
            </button>
            <div className="auth-foot" style={{ marginTop: 14 }}>
              Lembrou a senha? <Link to="/login">Voltar ao login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
