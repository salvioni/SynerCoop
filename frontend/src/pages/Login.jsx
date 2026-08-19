import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { isValidEmail } from '../lib/validate.js';
import { ApiError } from '../lib/api.js';
import { MIN_PASSWORD_LENGTH, TENANT_TYPES, BUSINESS_SECTORS } from '../lib/constants.js';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import FacebookSignInButton from '../components/FacebookSignInButton.jsx';

const HAS_SOCIAL_LOGIN = !!(import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_FACEBOOK_APP_ID);

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const { login, register, loginWithGoogle, completeGoogleSignup, loginWithFacebook, completeFacebookSignup } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // true enquanto o cliente insiste após uma falha de rede/502-504 — ver
  // fetchWithRetry em lib/api.js. Cobre o "cold start" do backend gratuito
  // (Render), que pode levar até ~1min pra acordar após ficar inativo.
  const [connecting, setConnecting] = useState(false);

  // Formulário de cadastro (mesma página, aba "Criar conta").
  const [regForm, setRegForm] = useState({ name: '', email: '', company: '', companyType: '', sector: '', password: '' });
  const [regErrs, setRegErrs] = useState({});
  const [showRegPass, setShowRegPass] = useState(false);
  const [terms, setTerms] = useState(false);

  function updReg(k, v) { setRegForm(p => ({ ...p, [k]: v })); setRegErrs(p => { const c = { ...p }; delete c[k]; return c; }); setErr(''); }

  async function onRegisterSubmit(e) {
    e.preventDefault();
    const fe = {};
    if (!regForm.name.trim()) fe.name = 'Informe seu nome.';
    const em = regForm.email.trim();
    if (!em) fe.email = 'Informe seu e-mail.';
    else if (!isValidEmail(em)) fe.email = 'E-mail inválido.';
    if (!regForm.company.trim()) fe.company = 'Informe o nome do escritório.';
    if (!regForm.companyType) fe.companyType = 'Selecione o tipo.';
    if (!regForm.sector) fe.sector = 'Selecione a área.';
    if (!regForm.password) fe.password = 'Crie uma senha.';
    else if (regForm.password.length < MIN_PASSWORD_LENGTH) fe.password = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
    if (!terms) fe.terms = 'Aceite os Termos de Uso para continuar.';
    if (Object.keys(fe).length) { setRegErrs(fe); return; }

    setBusy(true);
    setErr('');
    try {
      const r = await register({
        name: regForm.name.trim(), email: em.toLowerCase(), company: regForm.company.trim(),
        companyType: regForm.companyType, sector: regForm.sector, password: regForm.password,
        role: 'manager', terms_accepted: true,
      }, () => setConnecting(true));
      navigate('/verify', { state: { userId: r.userId, email: r.email, devCode: r.devCode } });
    } catch (e) {
      if (e instanceof ApiError && e.fields) setRegErrs(e.fields);
      else setErr(e.message || 'Não foi possível criar a conta.');
    } finally { setBusy(false); setConnecting(false); }
  }

  // Preenchido quando o Google/Facebook confirma um e-mail sem conta cadastrada:
  // pede o nome do escritório antes de criar tenant + usuário.
  const [socialPending, setSocialPending] = useState(null);
  const [company, setCompany] = useState('');
  const [socialType, setSocialType] = useState('');
  const [socialSector, setSocialSector] = useState('');
  const [socialErrs, setSocialErrs] = useState({});
  const [termsSocial, setTermsSocial] = useState(false);

  function clr(k) { setErrs(p => { const c = { ...p }; delete c[k]; return c; }); setErr(''); }

  function goAfterAuth(user) {
    if (user.role === 'admin') return navigate('/admin', { replace: true });
    if (user.tenant_id && !user.plan) return navigate('/select-plan', { replace: true });
    navigate('/app/dashboard', { replace: true });
  }

  async function onGoogleAccessToken(accessToken) {
    setBusy(true);
    setErr('');
    try {
      const result = await loginWithGoogle(accessToken);
      if (result?.needsSignup) {
        setSocialPending({ provider: 'google', token: accessToken, name: result.name, email: result.email });
      } else {
        goAfterAuth(result);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Não foi possível entrar com Google.');
    } finally { setBusy(false); }
  }

  async function onFacebookAccessToken(accessToken) {
    setBusy(true);
    setErr('');
    try {
      const result = await loginWithFacebook(accessToken);
      if (result?.needsSignup) {
        setSocialPending({ provider: 'facebook', token: accessToken, name: result.name, email: result.email });
      } else {
        goAfterAuth(result);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Não foi possível entrar com Facebook.');
    } finally { setBusy(false); }
  }

  async function onCompleteSocialSignup(e) {
    e.preventDefault();
    const c = company.trim();
    const fe = {};
    if (!c) fe.company = 'Informe o nome do escritório.';
    if (!socialType) fe.companyType = 'Selecione o tipo.';
    if (!socialSector) fe.sector = 'Selecione a área.';
    if (!termsSocial) fe.terms = 'Aceite os Termos de Uso para continuar.';
    if (Object.keys(fe).length) { setSocialErrs(fe); return; }

    setBusy(true);
    setSocialErrs({});
    try {
      const user = socialPending.provider === 'google'
        ? await completeGoogleSignup(socialPending.token, c, socialType, socialSector, true)
        : await completeFacebookSignup(socialPending.token, c, socialType, socialSector, true);
      goAfterAuth(user);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setSocialErrs(e.fields);
      else setSocialErrs({ company: e.message || 'Não foi possível concluir o cadastro.' });
    } finally { setBusy(false); }
  }

  async function doLogin(em, pw) {
    setBusy(true);
    setErr('');
    try {
      const user = await login(em, pw, () => setConnecting(true));
      goAfterAuth(user);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.raw?.needsVerification) {
          navigate('/verify', { state: { userId: e.raw.userId, email: e.raw.email, devCode: e.raw.devCode } });
          return;
        }
        if (e.fields) setErrs(e.fields);
        else setErr(e.message);
      } else setErr('Erro inesperado. Tente novamente.');
    } finally { setBusy(false); setConnecting(false); }
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

  const termsLink = (
    <span>
      Li e aceito os{' '}
      <a href="/termos" target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--blue-text)', fontWeight: 500 }}>
        Termos de Uso
      </a>{' '}
      e a{' '}
      <a href="/privacidade" target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--blue-text)', fontWeight: 500 }}>
        Política de Privacidade
      </a>
    </span>
  );

  return (
    <div className="auth-split">
      {/* Left panel — brand + testimonial */}
      <div className="auth-panel">
        <div className="auth-panel-top">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}>
            <div className="auth-panel-badge">S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>SynerCoop</span>
          </Link>
        </div>
        <div className="auth-panel-quote" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 0 }}>
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
            {isRegister ? 'Criar conta' : socialPending ? 'Bem-vindo!' : 'Bem-vindo de volta'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8 }}>
            {isRegister ? 'Cadastre seu escritório para começar.' : socialPending ? 'Só mais um passo para criar sua conta.' : 'Entre no painel do seu escritório.'}
          </p>

          {err && <div className="auth-err">{err}</div>}

          {isRegister ? (
            <form onSubmit={onRegisterSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
              <div>
                <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Nome</label>
                <div style={{ marginTop: 6 }}>
                  <input className={`inp${regErrs.name ? ' inp-err' : ''}`} placeholder="Seu nome" required
                    value={regForm.name} onChange={e => updReg('name', e.target.value)} autoFocus />
                </div>
                {regErrs.name && <div className="inp-hint">{regErrs.name}</div>}
              </div>

              <div>
                <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>E-mail</label>
                <div style={{ marginTop: 6 }}>
                  <input className={`inp${regErrs.email ? ' inp-err' : ''}`} type="email" placeholder="seu@email.com" required
                    value={regForm.email} onChange={e => updReg('email', e.target.value)} />
                </div>
                {regErrs.email && <div className="inp-hint">{regErrs.email}</div>}
              </div>

              <div>
                <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Nome da organização</label>
                <div style={{ marginTop: 6 }}>
                  <input className={`inp${regErrs.company ? ' inp-err' : ''}`} placeholder="Nome do seu escritório, empresa ou cooperativa" required
                    value={regForm.company} onChange={e => updReg('company', e.target.value)} />
                </div>
                {regErrs.company && <div className="inp-hint">{regErrs.company}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Tipo</label>
                  <div style={{ marginTop: 6 }}>
                    <select className={`inp${regErrs.companyType ? ' inp-err' : ''}`} required
                      style={{ color: regForm.companyType ? 'var(--t0)' : 'var(--t3)' }}
                      value={regForm.companyType} onChange={e => updReg('companyType', e.target.value)}>
                      <option value="" disabled hidden style={{ color: 'var(--t3)' }}>Selecione…</option>
                      {TENANT_TYPES.map(t => <option key={t.value} value={t.value} style={{ color: 'var(--t0)' }}>{t.label}</option>)}
                    </select>
                  </div>
                  {regErrs.companyType && <div className="inp-hint">{regErrs.companyType}</div>}
                </div>

                <div>
                  <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Área de atuação</label>
                  <div style={{ marginTop: 6 }}>
                    <select className={`inp${regErrs.sector ? ' inp-err' : ''}`} required
                      style={{ color: regForm.sector ? 'var(--t0)' : 'var(--t3)' }}
                      value={regForm.sector} onChange={e => updReg('sector', e.target.value)}>
                      <option value="" disabled hidden style={{ color: 'var(--t3)' }}>Selecione…</option>
                      {BUSINESS_SECTORS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--t0)' }}>{s.label}</option>)}
                    </select>
                  </div>
                  {regErrs.sector && <div className="inp-hint">{regErrs.sector}</div>}
                </div>
              </div>

              <div>
                <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Senha</label>
                <div style={{ position: 'relative', marginTop: 6 }}>
                  <input className={`inp${regErrs.password ? ' inp-err' : ''}`} type={showRegPass ? 'text' : 'password'} placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`} required
                    style={{ paddingRight: 36 }}
                    value={regForm.password} onChange={e => updReg('password', e.target.value)} />
                  <button type="button" onClick={() => setShowRegPass(v => !v)} tabIndex={-1}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 4, color: 'var(--t3)', cursor: 'pointer', display: 'flex' }}>
                    <i className={`ti ${showRegPass ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 16 }}></i>
                  </button>
                </div>
                {regErrs.password && <div className="inp-hint">{regErrs.password}</div>}
              </div>

              {/* Aceite dos Termos — obrigatório (LGPD Art. 7) */}
              <div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={terms} onChange={e => { setTerms(e.target.checked); setRegErrs(p => ({ ...p, terms: '' })); }}
                    style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--blue-text)', width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.4 }}>{termsLink}</span>
                </label>
                {regErrs.terms && <div className="inp-hint" style={{ marginTop: 4 }}>{regErrs.terms}</div>}
              </div>

              <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '10px 18px' }}>
                {connecting ? 'Conectando ao servidor… pode levar até 1 min' : busy ? 'Criando…' : 'Criar conta'}
              </button>
            </form>
          ) : socialPending ? (
            <form onSubmit={onCompleteSocialSignup} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
              <p style={{ fontSize: 14, color: 'var(--t2)' }}>
                Informe o nome da sua organização para concluir o cadastro de <strong>{socialPending.email}</strong>.
              </p>
              <div>
                <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Nome da organização</label>
                <div style={{ marginTop: 6 }}>
                  <input className={`inp${socialErrs.company ? ' inp-err' : ''}`} placeholder="Nome do seu escritório, empresa ou cooperativa" required
                    value={company} onChange={e => { setCompany(e.target.value); setSocialErrs(p => ({ ...p, company: '' })); }} autoFocus />
                </div>
                {socialErrs.company && <div className="inp-hint">{socialErrs.company}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Tipo</label>
                  <div style={{ marginTop: 6 }}>
                    <select className={`inp${socialErrs.companyType ? ' inp-err' : ''}`} required
                      style={{ color: socialType ? 'var(--t0)' : 'var(--t3)' }}
                      value={socialType} onChange={e => { setSocialType(e.target.value); setSocialErrs(p => ({ ...p, companyType: '' })); }}>
                      <option value="" disabled hidden style={{ color: 'var(--t3)' }}>Selecione…</option>
                      {TENANT_TYPES.map(t => <option key={t.value} value={t.value} style={{ color: 'var(--t0)' }}>{t.label}</option>)}
                    </select>
                  </div>
                  {socialErrs.companyType && <div className="inp-hint">{socialErrs.companyType}</div>}
                </div>

                <div>
                  <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Área de atuação</label>
                  <div style={{ marginTop: 6 }}>
                    <select className={`inp${socialErrs.sector ? ' inp-err' : ''}`} required
                      style={{ color: socialSector ? 'var(--t0)' : 'var(--t3)' }}
                      value={socialSector} onChange={e => { setSocialSector(e.target.value); setSocialErrs(p => ({ ...p, sector: '' })); }}>
                      <option value="" disabled hidden style={{ color: 'var(--t3)' }}>Selecione…</option>
                      {BUSINESS_SECTORS.map(s => <option key={s.value} value={s.value} style={{ color: 'var(--t0)' }}>{s.label}</option>)}
                    </select>
                  </div>
                  {socialErrs.sector && <div className="inp-hint">{socialErrs.sector}</div>}
                </div>
              </div>

              {/* Aceite dos Termos — obrigatório (LGPD Art. 7) */}
              <div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={termsSocial} onChange={e => { setTermsSocial(e.target.checked); setSocialErrs(p => ({ ...p, terms: '' })); }}
                    style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--blue-text)', width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.4 }}>{termsLink}</span>
                </label>
                {socialErrs.terms && <div className="inp-hint" style={{ marginTop: 4 }}>{socialErrs.terms}</div>}
              </div>

              <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '10px 18px' }}>
                {busy ? 'Criando conta…' : 'Criar conta e entrar'}
              </button>
              <button type="button" className="btn" disabled={busy}
                onClick={() => { setSocialPending(null); setCompany(''); setSocialType(''); setSocialSector(''); setSocialErrs({}); setTermsSocial(false); }}
                style={{ width: '100%', justifyContent: 'center' }}>
                Cancelar
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
                <div>
                  <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>E-mail</label>
                  <div style={{ position: 'relative', marginTop: 6 }}>
                    <i className="ti ti-mail" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--t3)' }}></i>
                    <input className={`inp${errs.email ? ' inp-err' : ''}`} type="email" placeholder="voce@escritorio.com.br" required
                      style={{ paddingLeft: 36 }}
                      value={email} onChange={e => { setEmail(e.target.value); clr('email'); }} autoFocus />
                  </div>
                  {errs.email && <div className="inp-hint">{errs.email}</div>}
                </div>

                <div>
                  <label className="inp-label" style={{ fontSize: 12, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--t0)' }}>Senha</label>
                  <div style={{ position: 'relative', marginTop: 6 }}>
                    <i className="ti ti-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--t3)' }}></i>
                    <input className={`inp${errs.password ? ' inp-err' : ''}`} type={showPass ? 'text' : 'password'} placeholder="••••••••" required
                      style={{ paddingLeft: 36, paddingRight: 36 }}
                      value={pass} onChange={e => { setPass(e.target.value); clr('password'); }} />
                    <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 4, color: 'var(--t3)', cursor: 'pointer', display: 'flex' }}>
                      <i className={`ti ${showPass ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 16 }}></i>
                    </button>
                  </div>
                  {errs.password && <div className="inp-hint">{errs.password}</div>}
                  <div style={{ textAlign: 'right', marginTop: 6 }}>
                    <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--blue-text)', fontWeight: 500 }}>Esqueceu sua senha?</Link>
                  </div>
                </div>

                <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '10px 18px' }}>
                  {connecting ? 'Conectando ao servidor… pode levar até 1 min' : busy ? 'Entrando…' : 'Entrar'}
                </button>
              </form>

              {HAS_SOCIAL_LOGIN && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--bd)' }}></div>
                    <span style={{ fontSize: 12, color: 'var(--t2)' }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--bd)' }}></div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <GoogleSignInButton onAccessToken={onGoogleAccessToken} />
                    <FacebookSignInButton onAccessToken={onFacebookAccessToken} />
                  </div>
                </>
              )}
            </>
          )}

          <p style={{ fontSize: 14, textAlign: 'center', color: 'var(--t2)', marginTop: 32 }}>
            {isRegister ? (
              <>Já tem conta?{' '}
                <Link to="/login" onClick={() => { setErr(''); setRegErrs({}); setTerms(false); }} style={{ color: 'var(--blue-text)', fontWeight: 500 }}>Entrar</Link>
              </>
            ) : socialPending ? (
              <>Já possui uma conta?{' '}
                <a onClick={() => { setSocialPending(null); setCompany(''); setSocialType(''); setSocialSector(''); setSocialErrs({}); setTermsSocial(false); }}
                  style={{ color: 'var(--blue-text)', fontWeight: 500, cursor: 'pointer' }}>Entrar</a>
              </>
            ) : (
              <>Não tem conta?{' '}
                <Link to="/register" onClick={() => { setErr(''); setErrs({}); }} style={{ color: 'var(--blue-text)', fontWeight: 500 }}>Criar agora</Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
