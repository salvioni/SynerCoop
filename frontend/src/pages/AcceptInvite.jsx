import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { acceptInvite } = useAuth();
  const token = params.get('token');

  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState('loading');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    api.get(`/auth/accept-invite/${token}`)
      .then(d => { setInfo(d); setStatus('ready'); })
      .catch(e => {
        const msg = e instanceof ApiError ? e.message : '';
        if (msg.includes('utilizado')) setStatus('used');
        else if (msg.includes('expirou')) setStatus('expired');
        else setStatus('invalid');
      });
  }, [token]);

  async function onSubmit(e) {
    e.preventDefault();
    const fe = {};
    if (!pass) fe.pass = 'Informe a senha.';
    else if (pass.length < 6) fe.pass = 'Mínimo 6 caracteres.';
    if (!pass2) fe.pass2 = 'Confirme a senha.';
    else if (pass !== pass2) fe.pass2 = 'As senhas não coincidem.';
    if (Object.keys(fe).length) { setErrs(fe); return; }
    setBusy(true);
    setErr('');
    try {
      const d = await api.post(`/auth/accept-invite/${token}`, { password: pass });
      acceptInvite(d.token, d.user);
      navigate('/app/clients', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro inesperado.');
    } finally { setBusy(false); }
  }

  const logoRow = (
    <div className="auth-logo" style={{ marginBottom: 16 }}>
      <div className="auth-logo-badge">S</div>
      <span className="auth-logo-name">SynerCoop</span>
    </div>
  );

  if (status === 'loading') return (
    <div className="auth-outer">
      <div className="auth-box" style={{ textAlign: 'center', color: 'var(--t2)' }}>
        {logoRow} Verificando convite…
      </div>
    </div>
  );

  if (status === 'used') return (
    <div className="auth-outer">
      <div className="auth-box" style={{ textAlign: 'center' }}>
        {logoRow}
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--green-t)', fontSize: 22 }}><i className="ti ti-circle-check"></i></div>
        <div className="auth-title">Convite já utilizado</div>
        <div className="auth-sub">Este convite já foi aceito. Faça login.</div>
        <button className="btn btn-p" onClick={() => navigate('/login')} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          <i className="ti ti-login"></i> Ir para o login
        </button>
      </div>
    </div>
  );

  if (status === 'expired' || status === 'invalid') return (
    <div className="auth-outer">
      <div className="auth-box" style={{ textAlign: 'center' }}>
        {logoRow}
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--red-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--red-t)', fontSize: 22 }}><i className="ti ti-clock-exclamation"></i></div>
        <div className="auth-title">{status === 'expired' ? 'Convite expirado' : 'Convite inválido'}</div>
        <div className="auth-sub">{status === 'expired' ? 'Este link expirou após 48h.' : 'Link inválido. Verifique o e-mail.'}</div>
        <button className="btn" onClick={() => navigate('/login')} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Voltar ao login</button>
      </div>
    </div>
  );

  return (
    <div className="auth-outer">
      <div className="auth-box">
        {logoRow}
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--green-t)', fontSize: 22 }}><i className="ti ti-mail-opened"></i></div>
        <div className="auth-title" style={{ textAlign: 'center' }}>Bem-vindo, {info?.name?.split(' ')[0]}!</div>
        <div className="auth-sub" style={{ textAlign: 'center' }}>
          Convidado como gerente{info?.companyName ? ` de ${info.companyName}` : ''}. Crie sua senha.
        </div>
        <form onSubmit={onSubmit} noValidate>
          {err && <div className="auth-err">{err}</div>}
          <div className="inp-wrap">
            <label className="inp-label">E-mail</label>
            <input className="inp" value={info?.email || ''} disabled style={{ opacity: .6 }} />
          </div>
          <div className="inp-wrap">
            <label className="inp-label">Criar senha</label>
            <input className={`inp${errs.pass ? ' inp-err' : ''}`} type="password" placeholder="Mínimo 6 caracteres"
              value={pass} onChange={e => { setPass(e.target.value); setErrs(p => ({ ...p, pass: '' })); }} autoFocus />
            {errs.pass && <div className="inp-hint">{errs.pass}</div>}
          </div>
          <div className="inp-wrap">
            <label className="inp-label">Confirmar senha</label>
            <input className={`inp${errs.pass2 ? ' inp-err' : ''}`} type="password" placeholder="Repita a senha"
              value={pass2} onChange={e => { setPass2(e.target.value); setErrs(p => ({ ...p, pass2: '' })); }} />
            {errs.pass2 && <div className="inp-hint">{errs.pass2}</div>}
          </div>
          <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            <i className="ti ti-check"></i> {busy ? 'Ativando…' : 'Ativar minha conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
