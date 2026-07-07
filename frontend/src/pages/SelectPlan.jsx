import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api, ApiError } from '../lib/api.js';
import { PLANS, PLAN_ORDER } from '../lib/plans.js';

// ~30s de tentativas (1.5s de intervalo) esperando o webhook do Stripe
// confirmar a assinatura antes de desistir e oferecer uma saída manual.
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1500;

export default function SelectPlan() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, refresh, logout } = useAuth();
  const [busyPlan, setBusyPlan] = useState(null);
  const [err, setErr] = useState('');
  const checkout = params.get('checkout');
  const [pollAttempts, setPollAttempts] = useState(0);
  const confirming = checkout === 'success' && pollAttempts < MAX_POLL_ATTEMPTS && !user?.plan;
  const pollTimedOut = checkout === 'success' && pollAttempts >= MAX_POLL_ATTEMPTS && !user?.plan;

  // Volta do checkout do Stripe: aguarda o webhook confirmar a assinatura
  // (tenants.plan deixa de ser nulo) antes de liberar o dashboard. Desiste
  // após MAX_POLL_ATTEMPTS para nunca deixar a pessoa presa num spinner.
  useEffect(() => {
    if (checkout !== 'success') return;
    if (user?.plan) { navigate('/app/dashboard', { replace: true }); return; }
    if (pollAttempts >= MAX_POLL_ATTEMPTS) return;
    const id = setTimeout(() => { refresh(); setPollAttempts(a => a + 1); }, POLL_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [checkout, user?.plan, pollAttempts]);

  // choosePro() sai da página via window.location.href (redireciona pro
  // Checkout do Stripe) sem nunca zerar busyPlan — se a pessoa aperta
  // "voltar" no navegador, o Firefox/Safari/Chrome costumam restaurar essa
  // página do bfcache exatamente como ficou congelada, com o botão travado
  // em "Abrindo pagamento…" e os outros desabilitados. pageshow com
  // persisted:true detecta essa restauração e libera a tela de novo.
  useEffect(() => {
    function onPageShow(e) {
      if (e.persisted) setBusyPlan(null);
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function chooseTrial() {
    setErr(''); setBusyPlan('trial');
    try {
      await api.post('/account/select-plan', { plan: 'trial' });
      await refresh();
      navigate('/app/dashboard', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Não foi possível ativar o plano.');
    } finally { setBusyPlan(null); }
  }

  async function choosePro() {
    setErr(''); setBusyPlan('pro');
    try {
      const r = await api.post('/stripe/create-checkout', { plan: 'pro' });
      window.location.href = r.url;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Não foi possível iniciar o pagamento.');
      setBusyPlan(null);
    }
  }

  const CTA_ACTIONS = {
    trial: { className: 'btn', busyLabel: 'Ativando…', onClick: chooseTrial },
    pro: { className: 'btn btn-p', busyLabel: 'Abrindo pagamento…', onClick: choosePro },
    enterprise: {
      className: 'btn',
      href: `mailto:contato@synercoop.com?subject=${encodeURIComponent('Interesse no plano Enterprise')}` +
        (user?.email ? `&body=${encodeURIComponent(`Meu e-mail de cadastro: ${user.email}`)}` : ''),
    },
  };

  function onSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  if (confirming) {
    return (
      <div className="auth-outer">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <div className="auth-logo" style={{ justifyContent: 'center' }}>
            <div className="auth-logo-badge">S</div>
            <span className="auth-logo-name">SynerCoop</span>
          </div>
          <div className="processing">
            <i className="ti ti-loader-2"></i>
            <div className="auth-title" style={{ marginTop: 0 }}>Confirmando pagamento…</div>
            <div className="auth-sub">Isso leva só alguns segundos.</div>
          </div>
          <span onClick={onSignOut} style={{ fontSize: 13, color: 'var(--t3)', cursor: 'pointer' }}>Sair</span>
        </div>
      </div>
    );
  }

  if (pollTimedOut) {
    return (
      <div className="auth-outer">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <div className="auth-logo" style={{ justifyContent: 'center' }}>
            <div className="auth-logo-badge">S</div>
            <span className="auth-logo-name">SynerCoop</span>
          </div>
          <div className="auth-title">Ainda não confirmamos seu pagamento</div>
          <div className="auth-sub">
            Isso pode acontecer se a confirmação do Stripe está demorando. Se você concluiu o pagamento, tente novamente em instantes.
          </div>
          <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  onClick={() => setPollAttempts(0)}>
            <i className="ti ti-refresh"></i> Verificar novamente
          </button>
          <span onClick={onSignOut} style={{ display: 'block', marginTop: 12, fontSize: 13, color: 'var(--t3)', cursor: 'pointer' }}>Sair</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg0)', padding: '48px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="auth-logo-badge">S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--t0)' }}>SynerCoop</span>
          </div>
          <span onClick={onSignOut} style={{ fontSize: 13, color: 'var(--t3)', cursor: 'pointer' }}>Sair</span>
        </div>

        <div style={{ maxWidth: 560, marginBottom: 8 }}>
          <div className="ld-section-label">Último passo</div>
          <h1 className="ld-section-title" style={{ fontSize: 36 }}>Escolha um plano para começar</h1>
          <p style={{ fontSize: 15, color: 'var(--t2)', marginTop: 8 }}>
            Seu e-mail foi confirmado. Escolha um plano para liberar o acesso ao sistema.
          </p>
        </div>

        {err && <div className="auth-err" style={{ marginTop: 16, marginBottom: -8 }}>{err}</div>}

        <div className="ld-plans">
          {PLAN_ORDER.map(key => {
            const p = PLANS[key];
            const action = CTA_ACTIONS[key];
            return (
              <div key={p.key} className={`ld-plan${p.highlight ? ' ld-plan-hl' : ''}`}>
                {p.highlight && <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--gold)', marginBottom: 12 }}>Mais popular</div>}
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>{p.label}</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 36, marginTop: 8 }}>
                  {p.price}
                  {p.key === 'pro' && <span style={{ fontSize: 14, color: 'var(--t2)', fontFamily: 'var(--font-sans)' }}>/mês</span>}
                </div>
                <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8 }}>{p.desc}</p>
                <ul className="ld-plan-feats">
                  {p.feats.map(f => (
                    <li key={f}><span style={{ color: 'var(--gold)' }}>✓</span> {f}</li>
                  ))}
                </ul>
                {action.href ? (
                  <a className={action.className} style={{ width: '100%', justifyContent: 'center', marginTop: 28 }} href={action.href}>
                    {p.cta}
                  </a>
                ) : (
                  <button className={action.className} style={{ width: '100%', justifyContent: 'center', marginTop: 28 }}
                          disabled={!!busyPlan} onClick={action.onClick}>
                    {busyPlan === key ? action.busyLabel : p.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
