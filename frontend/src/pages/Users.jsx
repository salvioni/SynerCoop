import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

function initials(name) {
  const p = name?.trim().split(' ').filter(Boolean) || [];
  return p.length ? (p[0][0] + (p[1]?.[0] || '')).toUpperCase() : '?';
}

export default function Users() {
  const { user: me, isManager } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [devLink, setDevLink] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await api.get('/users'); setUsers(r.users || []); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openInvite() {
    setForm({ name: '', email: '' }); setErrs({}); setErr(''); setDevLink(null); setInviteOpen(true);
  }

  function upd(k, v) { setForm(p => ({ ...p, [k]: v })); setErrs(p => ({ ...p, [k]: '' })); }

  async function sendInvite() {
    const fe = {};
    if (!form.name.trim()) fe.name = 'Informe o nome.';
    if (!form.email.trim()) fe.email = 'Informe o e-mail.';
    if (Object.keys(fe).length) { setErrs(fe); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post('/users/invite', { ...form, role: 'manager' });
      setDevLink(r.devLink || true);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      else setErr(e.message || 'Erro ao enviar convite.');
    } finally { setBusy(false); }
  }

  async function doRemove(u) {
    setConfirm(null);
    try { await api.del(`/users/${u.id}`); load(); }
    catch (e) { alert(e.message); }
  }

  return (
    <>
      <div className="page-body" style={{ padding: '40px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--t2)' }}>Membros do escritório</div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', marginTop: 4, color: 'var(--t0)' }}>Equipe</h1>
          </div>
          {isManager && (
            <button className="btn btn-p" onClick={openInvite}>
              <i className="ti ti-plus"></i> Convidar membro
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: 'var(--t2)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Carregando…</div>
        ) : (
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
            {users.map((u, i) => {
              const isMe = u.id === me?.id;
              const pending = !!u.invite_pending;
              return (
                <div key={u.id} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderTop: i > 0 ? '1px solid var(--bd)' : 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                    {initials(u.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: 'var(--t0)', fontSize: 14 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <i className="ti ti-mail" style={{ fontSize: 12 }}></i> {u.email}
                    </div>
                  </div>
                  <span className="pill pill-b" style={{ gap: 4 }}>
                    <i className="ti ti-shield" style={{ fontSize: 12 }}></i> {pending ? 'Pendente' : 'Gerente'}
                  </span>
                  {isManager && !isMe && (
                    <button className="ib ib-d" title="Remover" onClick={() => setConfirm({
                      title: `Remover ${u.name}?`,
                      message: 'A pessoa perderá acesso imediatamente.',
                      danger: true, confirmLabel: 'Remover',
                      onConfirm: () => doRemove(u),
                    })}>
                      <i className="ti ti-trash"></i>
                    </button>
                  )}
                </div>
              );
            })}
            {!users.length && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)' }}>Nenhum membro.</div>
            )}
          </div>
        )}
      </div>

      {inviteOpen && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setInviteOpen(false); }}>
          <div className="modal">
            <div className="modal-head">
              <span className="modal-title">Convidar gerente</span>
              <button className="modal-close" onClick={() => setInviteOpen(false)}>
                <i className="ti ti-x"></i>
              </button>
            </div>
            <div className="modal-body">
              {devLink ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--green-t)', fontSize: 13, marginBottom: 10 }}>
                    <i className="ti ti-circle-check"></i> Convite enviado para <strong>{form.email}</strong>
                  </div>
                  {typeof devLink === 'string' && (
                    <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 7, padding: '7px 10px', fontSize: 11, color: 'var(--yellow-t)' }}>
                      <i className="ti ti-info-circle"></i> Link de demo:{' '}
                      <a href={devLink} style={{ color: 'var(--yellow-t)', textDecoration: 'underline', wordBreak: 'break-all' }}>{devLink}</a>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>A pessoa receberá um link por e-mail para criar senha e acessar como gerente.</p>
                  {err && <div className="err-banner">{err}</div>}
                  <div className="inp-wrap">
                    <label className="inp-label">Nome completo</label>
                    <input className={`inp${errs.name ? ' inp-err' : ''}`} placeholder="Ex: Maria Silva"
                      value={form.name} onChange={e => upd('name', e.target.value)} autoFocus />
                    {errs.name && <div className="inp-hint">{errs.name}</div>}
                  </div>
                  <div className="inp-wrap">
                    <label className="inp-label">E-mail</label>
                    <input className={`inp${errs.email ? ' inp-err' : ''}`} type="email" placeholder="pessoa@escritorio.com"
                      value={form.email} onChange={e => upd('email', e.target.value)} />
                    {errs.email && <div className="inp-hint">{errs.email}</div>}
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot">
              {devLink ? (
                <>
                  <button className="btn" onClick={() => { setDevLink(null); setForm({ name: '', email: '' }); }}>
                    <i className="ti ti-user-plus"></i> Convidar outro
                  </button>
                  <button className="btn btn-p" onClick={() => setInviteOpen(false)}>Fechar</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => setInviteOpen(false)}>Cancelar</button>
                  <button className="btn btn-p" onClick={sendInvite} disabled={busy}>
                    {busy ? 'Enviando…' : <><i className="ti ti-send"></i> Enviar</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
