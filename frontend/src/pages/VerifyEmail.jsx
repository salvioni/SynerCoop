import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api, ApiError } from '../lib/api.js';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmail } = useAuth();

  const userId = location.state?.userId;
  const email = location.state?.email;
  const [devCode, setDevCode] = useState(location.state?.devCode);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (!userId) navigate('/register', { replace: true });
  }, [userId, navigate]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function doVerify(v) {
    const c = (v || code).trim();
    setErr(''); setOk('');
    if (!c) return setErr('Digite o código.');
    if (c.length !== 6) return setErr('O código deve ter 6 dígitos.');
    setBusy(true);
    try {
      await verifyEmail(userId, c);
      navigate('/app/clients', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fields?.code) setErr(e.fields.code);
      else setErr(e.message || 'Código incorreto.');
    } finally { setBusy(false); }
  }

  function onCodeChange(v) {
    const cleaned = v.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    if (err) setErr('');
    if (cleaned.length === 6 && !busy) doVerify(cleaned);
  }

  async function resend() {
    if (cooldown > 0) return;
    setErr(''); setOk('');
    try {
      const r = await api.post('/auth/resend-code', { userId });
      setDevCode(r.devCode);
      setCode('');
      setOk(`Novo código enviado para ${email}.`);
      setCooldown(30);
      ref.current?.focus();
    } catch (e) { setErr(e.message || 'Não foi possível reenviar.'); }
  }

  if (!userId) return null;

  return (
    <div className="auth-outer">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-badge">S</div>
          <span className="auth-logo-name">SynerCoop</span>
        </div>

        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--blue-text)', fontSize: 22 }}>
          <i className="ti ti-mail-check"></i>
        </div>

        <div className="auth-title" style={{ textAlign: 'center' }}>Verifique seu e-mail</div>
        <div className="auth-sub" style={{ textAlign: 'center' }}>
          Código de 6 dígitos enviado para <strong style={{ color: 'var(--t1)' }}>{email}</strong>
        </div>

        {err && <div className="auth-err">{err}</div>}
        {ok && <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 7, padding: '7px 11px', fontSize: 12, color: 'var(--green-t)', marginBottom: 12 }}>{ok}</div>}

        <div className="inp-wrap">
          <label className="inp-label">Código de verificação</label>
          <input ref={ref}
            className={`inp${err ? ' inp-err' : ''}`}
            inputMode="numeric" maxLength={6} autoComplete="one-time-code"
            placeholder="000000" value={code}
            onChange={e => onCodeChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doVerify(); }}
            style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20, fontFamily: 'monospace' }}
          />
        </div>

        {devCode && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 7, padding: '7px 10px', fontSize: 11, color: 'var(--yellow-t)', marginBottom: 12, display: 'flex', gap: 6 }}>
            <i className="ti ti-info-circle" style={{ flexShrink: 0, marginTop: 1 }}></i>
            <span>Demo — use o código: <strong style={{ fontFamily: 'monospace' }}>{devCode}</strong></span>
          </div>
        )}

        <button className="btn btn-p" onClick={() => doVerify()} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          <i className="ti ti-check"></i> {busy ? 'Verificando…' : 'Confirmar'}
        </button>

        <div className="auth-foot" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>
            Não recebeu?{' '}
            <span onClick={resend} style={{ color: cooldown > 0 ? 'var(--t3)' : 'var(--blue-text)', cursor: cooldown > 0 ? 'default' : 'pointer' }}>
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar'}
            </span>
          </span>
          <Link to="/register" style={{ color: 'var(--t3)' }}>← Corrigir e-mail</Link>
        </div>
      </div>
    </div>
  );
}
