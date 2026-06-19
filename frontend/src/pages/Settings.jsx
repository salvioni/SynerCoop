import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import { api } from '../lib/api.js';

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [info, setInfo] = useState(null);

  useEffect(() => { api.get('/account').then(setInfo).catch(() => {}); }, []);

  return (
    <div className="page-body" style={{ padding: '40px 32px', maxWidth: 768, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--t0)', marginBottom: 32 }}>Configurações</h1>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)', marginBottom: 16 }}>Escritório</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Nome" value={info?.companyName || ''} />
          <Field label="CNPJ" value="" placeholder="00.000.000/0001-00" />
          <Field label="E-mail de cobrança" value={user?.email || ''} />
          <Field label="Telefone" value="" placeholder="(00) 00000-0000" />
        </div>
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)', marginBottom: 16 }}>Plano e cobrança</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--t0)' }}>
              Pro · R$ 297<span style={{ fontSize: 14, color: 'var(--t2)', fontFamily: 'inherit' }}>/mês</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4 }}>
              Renovação em 14 de julho · {info?.totalAnalyses || 0}/100 análises
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn">Histórico</button>
            <button className="btn btn-p">Upgrade Enterprise</button>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)' }}>Marca branca</h2>
        <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4, marginBottom: 16 }}>Personalize o logo, cores e capa dos relatórios (Pro e Enterprise).</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Cor principal" value="#1a2b5e" />
          <Field label="Assinatura nos relatórios" value="Meu Escritório — Análise Financeira" />
        </div>
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)', marginBottom: 16 }}>Aparência</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { k: 'light', label: 'Claro', icon: 'ti-sun' },
            { k: 'dark', label: 'Escuro', icon: 'ti-moon' },
            { k: 'system', label: 'Automático', icon: 'ti-device-desktop' },
          ].map(({ k, label, icon }) => (
            <button key={k} onClick={() => setTheme(k)}
              style={{
                flex: 1, padding: '16px', borderRadius: 8, cursor: 'pointer',
                border: theme === k ? '2px solid var(--gold)' : '1px solid var(--bd)',
                background: theme === k ? 'var(--gold-dim)' : 'var(--bg2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                color: theme === k ? 'var(--t0)' : 'var(--t2)', fontWeight: theme === k ? 500 : 400,
                fontSize: 14,
              }}>
              <i className={`ti ${icon}`} style={{ fontSize: 22 }}></i>
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, placeholder }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="inp-label">{label}</span>
      <input className="inp" defaultValue={value} placeholder={placeholder} style={{ marginTop: 6 }} />
    </label>
  );
}
