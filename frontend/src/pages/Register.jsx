import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { isValidEmail } from '../lib/validate.js';
import { ApiError } from '../lib/api.js';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', company: '', password: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function upd(k, v) { setForm(p => ({ ...p, [k]: v })); setErrs(p => { const c = { ...p }; delete c[k]; return c; }); setErr(''); }

  async function onSubmit(e) {
    e.preventDefault();
    const fe = {};
    if (!form.name.trim()) fe.name = 'Informe seu nome.';
    const em = form.email.trim();
    if (!em) fe.email = 'Informe seu e-mail.';
    else if (!isValidEmail(em)) fe.email = 'E-mail inválido.';
    if (!form.company.trim()) fe.company = 'Informe o nome do escritório.';
    if (!form.password) fe.password = 'Crie uma senha.';
    else if (form.password.length < 6) fe.password = 'Mínimo 6 caracteres.';
    if (Object.keys(fe).length) { setErrs(fe); return; }

    setBusy(true);
    setErr('');
    try {
      const r = await register({ name: form.name.trim(), email: em.toLowerCase(), company: form.company.trim(), password: form.password, role: 'manager' });
      navigate('/verify', { state: { userId: r.userId, email: r.email, devCode: r.devCode } });
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      else setErr(e.message || 'Não foi possível criar a conta.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-outer">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-badge">S</div>
          <span className="auth-logo-name">SynerCoop</span>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className="auth-title">Criar conta</div>
          <div className="auth-sub">Análise financeira de cooperativas</div>

          {err && <div className="auth-err">{err}</div>}

          <div className="inp-wrap">
            <label className="inp-label">Nome completo</label>
            <input className={`inp${errs.name ? ' inp-err' : ''}`} placeholder="Seu nome"
              value={form.name} onChange={e => upd('name', e.target.value)} autoFocus />
            {errs.name && <div className="inp-hint">{errs.name}</div>}
          </div>

          <div className="inp-wrap">
            <label className="inp-label">E-mail</label>
            <input className={`inp${errs.email ? ' inp-err' : ''}`} type="email" placeholder="seu@email.com"
              value={form.email} onChange={e => upd('email', e.target.value)} />
            {errs.email && <div className="inp-hint">{errs.email}</div>}
          </div>

          <div className="inp-wrap">
            <label className="inp-label">Escritório / Empresa</label>
            <input className={`inp${errs.company ? ' inp-err' : ''}`} placeholder="Nome do escritório contábil"
              value={form.company} onChange={e => upd('company', e.target.value)} />
            {errs.company && <div className="inp-hint">{errs.company}</div>}
          </div>

          <div className="inp-wrap">
            <label className="inp-label">Senha</label>
            <input className={`inp${errs.password ? ' inp-err' : ''}`} type="password" placeholder="Mínimo 6 caracteres"
              value={form.password} onChange={e => upd('password', e.target.value)} />
            {errs.password && <div className="inp-hint">{errs.password}</div>}
          </div>

          <button className="btn btn-p" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            <i className="ti ti-user-plus"></i> {busy ? 'Criando…' : 'Criar conta'}
          </button>
        </form>

        <div className="auth-foot">
          Já tem conta? <Link to="/login">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
