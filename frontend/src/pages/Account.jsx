import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import { api } from '../lib/api.js';

const THEMES = [
  {
    k: 'light',
    name: 'Claro',
    desc: 'Fundo branco',
    preview: (
      <div style={{ width: '100%', height: '100%', background: '#F4F6FB', display: 'flex' }}>
        <div style={{ width: 30, background: '#fff', borderRight: '1px solid #E2E6F0', padding: '8px 5px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ height: 6, background: '#1D4ED8', borderRadius: 3 }} />
          <div style={{ height: 4, background: '#E2E6F0', borderRadius: 2 }} />
          <div style={{ height: 4, background: '#E2E6F0', borderRadius: 2 }} />
        </div>
        <div style={{ flex: 1, padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ height: 12, background: '#fff', borderRadius: 3, border: '1px solid #E2E6F0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 22, background: '#fff', borderRadius: 3, border: '1px solid #E2E6F0' }} />)}
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 3, border: '1px solid #E2E6F0' }} />
        </div>
      </div>
    ),
  },
  {
    k: 'dark',
    name: 'Escuro',
    desc: 'Fundo preto',
    preview: (
      <div style={{ width: '100%', height: '100%', background: '#070910', display: 'flex' }}>
        <div style={{ width: 30, background: '#0D0F17', borderRight: '1px solid #1E2233', padding: '8px 5px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ height: 6, background: '#60A5FA', borderRadius: 3 }} />
          <div style={{ height: 4, background: '#1E2233', borderRadius: 2 }} />
          <div style={{ height: 4, background: '#1E2233', borderRadius: 2 }} />
        </div>
        <div style={{ flex: 1, padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ height: 12, background: '#0D0F17', borderRadius: 3, border: '1px solid #1E2233' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 22, background: '#0D0F17', borderRadius: 3, border: '1px solid #1E2233' }} />)}
          </div>
          <div style={{ flex: 1, background: '#0D0F17', borderRadius: 3, border: '1px solid #1E2233' }} />
        </div>
      </div>
    ),
  },
  {
    k: 'system',
    name: 'Automático',
    desc: 'Segue o sistema',
    preview: (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <div style={{ flex: 1, background: '#F4F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-sun" style={{ fontSize: 22, color: '#D97706' }} />
        </div>
        <div style={{ width: 1, background: 'rgba(128,128,128,.25)' }} />
        <div style={{ flex: 1, background: '#070910', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-moon" style={{ fontSize: 22, color: '#60A5FA' }} />
        </div>
      </div>
    ),
  },
];

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function Account() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [info, setInfo] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrs, setPwErrs] = useState({});
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { api.get('/account').then(setInfo).catch(() => {}); }, []);

  function updPw(k, v) { setPw(p => ({ ...p, [k]: v })); setPwErrs(p => { const c = { ...p }; delete c[k]; return c; }); setPwMsg(''); }

  async function changePassword(e) {
    e.preventDefault();
    const fe = {};
    if (!pw.current) fe.current = 'Campo obrigatório.';
    if (!pw.next) fe.next = 'Campo obrigatório.';
    else if (pw.next.length < 8) fe.next = 'Mínimo 8 caracteres.';
    if (!pw.confirm) fe.confirm = 'Campo obrigatório.';
    else if (pw.next && pw.next !== pw.confirm) fe.confirm = 'As senhas não coincidem.';
    if (Object.keys(fe).length) { setPwErrs(fe); return; }
    setPwBusy(true);
    setPwErrs({});
    setPwMsg('');
    try {
      await api.post('/account/change-password', { current: pw.current, next: pw.next });
      setPwMsg('Senha alterada com sucesso.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      if (e.fields) setPwErrs(e.fields);
      else setPwErrs({ current: e.message || 'Erro ao alterar senha.' });
    } finally { setPwBusy(false); }
  }

  if (!user) return null;

  return (
    <>
      <div className="page-head">
        <div className="page-head-l">
          <h1>Minha conta</h1>
          <p>Configurações pessoais</p>
        </div>
      </div>
      <div className="page-body" style={{ maxWidth: 500 }}>

        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {initials(user.name)}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--t0)' }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>{user.email}</div>
            <span className="pill pill-b" style={{ marginTop: 4 }}>Gerente</span>
          </div>
        </div>

        {info && (
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div className="sec-title">Escritório</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Nome', val: info.companyName },
                { label: 'Clientes ativos', val: info.activeClients },
                { label: 'Análises', val: info.totalAnalyses },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 7, padding: '8px 11px' }}>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontWeight: 600, color: 'var(--t0)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div className="sec-title" style={{ marginBottom: 12 }}>Aparência</div>
          <div className="theme-grid">
            {THEMES.map(({ k, name, desc, preview }) => (
              <button key={k} className={`theme-card${theme === k ? ' selected' : ''}`} onClick={() => setTheme(k)}>
                <div className="theme-preview">{preview}</div>
                <div className="theme-footer">
                  <div>
                    <div className="theme-footer-name">{name}</div>
                    <div className="theme-footer-desc">{desc}</div>
                  </div>
                  <div className={`theme-check${theme === k ? ' on' : ''}`}>
                    {theme === k && <i className="ti ti-check" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 16 }}>
          <div className="sec-title" style={{ marginBottom: 12 }}>Alterar senha</div>
          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { id: 'pw-current', k: 'current', label: 'Senha atual', placeholder: '••••••••', complete: 'current-password' },
              { id: 'pw-next', k: 'next', label: 'Nova senha', placeholder: 'Mínimo 8 caracteres', complete: 'new-password' },
              { id: 'pw-confirm', k: 'confirm', label: 'Confirmar nova senha', placeholder: 'Repita a nova senha', complete: 'new-password' },
            ].map(({ id, k, label, placeholder, complete }) => (
              <div key={k}>
                <label htmlFor={id} className="inp-label">{label}</label>
                <input id={id} type="password" className={`inp${pwErrs[k] ? ' inp-err' : ''}`}
                  value={pw[k]} onChange={e => updPw(k, e.target.value)}
                  placeholder={placeholder} autoComplete={complete} />
                {pwErrs[k] && <div className="inp-hint">{pwErrs[k]}</div>}
              </div>
            ))}
            {pwMsg && <div style={{ fontSize: 12, color: 'var(--green-t)', display: 'flex', alignItems: 'center', gap: 5 }}><i className="ti ti-circle-check"></i>{pwMsg}</div>}
            <button type="submit" className="btn btn-p" disabled={pwBusy} style={{ alignSelf: 'flex-start' }}>
              {pwBusy ? 'Salvando…' : 'Alterar senha'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
