import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!token) setErr('Link inválido. Solicite um novo link de recuperação.'); }, [token]);

  function upd(setter, k, v) { setter(v); setErrs(p => { const c = { ...p }; delete c[k]; return c; }); setErr(''); }

  async function onSubmit(e) {
    e.preventDefault();
    const fe = {};
    if (!pass) fe.password = 'Crie uma nova senha.';
    else if (pass.length < 8) fe.password = 'Mínimo 8 caracteres.';
    if (!pass2) fe.password2 = 'Confirme a nova senha.';
    else if (pass !== pass2) fe.password2 = 'As senhas não conferem.';
    if (Object.keys(fe).length) { setErrs(fe); return; }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password: pass });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        if (e.fields.token) setErr(e.fields.token);
        else setErrs(e.fields);
      } else setErr(e.message || 'Não foi possível redefinir a senha.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-outer">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-badge">S</div>
          <span className="auth-logo-name">SynerCoop</span>
        </div>

        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--blue-text)', fontSize: 22 }}>
          <i className="ti ti-lock"></i>
        </div>

        <div className="auth-title" style={{ textAlign: 'center' }}>Definir nova senha</div>
        <div className="auth-sub" style={{ textAlign: 'center' }}>Mínimo 8 caracteres.</div>

        {err && <div className="auth-err">{err}</div>}

        {done ? (
          <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 7, padding: '9px 11px', fontSize: 12, color: 'var(--green-t)', textAlign: 'center' }}>
            <i className="ti ti-circle-check"></i> Senha redefinida! Redirecionando…
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div className="inp-wrap">
              <label className="inp-label">Nova senha</label>
              <input className={`inp${errs.password ? ' inp-err' : ''}`} type="password" placeholder="Mínimo 8 caracteres"
                value={pass} onChange={e => upd(setPass, 'password', e.target.value)} autoFocus />
              {errs.password && <div className="inp-hint">{errs.password}</div>}
            </div>
            <div className="inp-wrap">
              <label className="inp-label">Confirmar nova senha</label>
              <input className={`inp${errs.password2 ? ' inp-err' : ''}`} type="password" placeholder="Repita a senha"
                value={pass2} onChange={e => upd(setPass2, 'password2', e.target.value)} />
              {errs.password2 && <div className="inp-hint">{errs.password2}</div>}
            </div>
            <button className="btn btn-p" type="submit" disabled={busy || !token} style={{ width: '100%', justifyContent: 'center' }}>
              <i className="ti ti-check"></i> {busy ? 'Salvando…' : 'Redefinir senha'}
            </button>
          </form>
        )}

        <div className="auth-foot" style={{ marginTop: 14 }}><Link to="/login">← Voltar ao login</Link></div>
      </div>
    </div>
  );
}
