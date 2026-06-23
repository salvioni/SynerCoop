import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { isValidEmail } from '../lib/validate.js';
import { ApiError } from '../lib/api.js';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function clr(k) { setErrs(p => { const c = { ...p }; delete c[k]; return c; }); setErr(''); }

  async function doLogin(em, pw) {
    setBusy(true);
    setErr('');
    try {
      const user = await login(em, pw);
      navigate(user.role === 'admin' ? '/admin' : '/app/dashboard', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.raw?.needsVerification) {
          navigate('/verify', { state: { userId: e.raw.userId, email: e.raw.email, devCode: e.raw.devCode } });
          return;
        }
        if (e.fields) setErrs(e.fields);
        else setErr(e.message);
      } else setErr('Erro inesperado. Tente novamente.');
    } finally { setBusy(false); }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const fe = {};
    const em = email.trim();
    if (!em) fe.email = 'Informe o e-mail.';
    else if (!isValidEmail(em)) fe.email = 'E-mail inválido.';
    if (!pass) fe.password = 'Informe a senha.';
    if (Object.keys(fe).length) { setErrs(fe); return; }
    await doLogin(em, pass);
  }

  async function demoLogin(role) {
    const map = { admin: ['admin@finanalyze.internal', 'admin123'], manager: ['gerente@demo.com', 'demo123'] };
    await doLogin(...map[role]);
  }

  return (
    <div className="auth-split">
      {/* Left panel — brand + testimonial */}
      <div className="auth-panel">
        <div className="auth-panel-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="auth-panel-badge">S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>SynerCoop</span>
          </div>
        </div>
        <div className="auth-panel-quote">
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.375, maxWidth: 420 }}>
            "Reduzimos o tempo de análise de balanço de{' '}
            <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>3 horas para 5 minutos</span>.
            O relatório sai pronto."
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--sidebar-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500 }}>RM</div>
            <div>
              <div style={{ fontSize: 14 }}>Dr. Roberto Mendes</div>
              <div style={{ fontSize: 12, opacity: .6 }}>Mendes & Associados</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: .5 }}>
          © 2026 SynerCoop · Dados isolados por escritório · LGPD
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--t0)' }}>
            Bem-vindo de volta
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8 }}>
            Entre no painel do seu escritório.
          </p>

          {err && <div className="auth-err">{err}</div>}

          <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
            <div>
              <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>E-mail</label>
              <div style={{ position: 'relative', marginTop: 6 }}>
                <i className="ti ti-mail" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--t3)' }}></i>
                <input className={`inp${errs.email ? ' inp-err' : ''}`} type="email" placeholder="voce@escritorio.com.br"
                  style={{ paddingLeft: 36 }}
                  value={email} onChange={e => { setEmail(e.target.value); clr('email'); }} autoFocus />
              </div>
              {errs.email && <div className="inp-hint">{errs.email}</div>}
            </div>

            <div>
              <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Senha</label>
              <div style={{ position: 'relative', marginTop: 6 }}>
                <i className="ti ti-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--t3)' }}></i>
                <input className={`inp${errs.password ? ' inp-err' : ''}`} type="password" placeholder="••••••••"
                  style={{ paddingLeft: 36 }}
                  value={pass} onChange={e => { setPass(e.target.value); clr('password'); }} />
              </div>
              {errs.password && <div className="inp-hint">{errs.password}</div>}
            </div>

            <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '10px 18px' }}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--bd)' }}></div>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>ou</span>
            <div style={{ flex: 1, height: 1, background: 'var(--bd)' }}></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={() => demoLogin('manager')} disabled={busy}
              className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              <i className="ti ti-briefcase"></i> Entrar como Gerente (demo)
            </button>
            <button type="button" onClick={() => demoLogin('admin')} disabled={busy}
              className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              <i className="ti ti-shield"></i> Entrar como Admin (demo)
            </button>
          </div>

          <p style={{ fontSize: 14, textAlign: 'center', color: 'var(--t2)', marginTop: 32 }}>
            Não tem conta?{' '}
            <Link to="/register" style={{ color: 'var(--blue-text)', fontWeight: 500 }}>Criar agora</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
