import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import ConfirmModal from '../../components/ConfirmModal.jsx';

export default function AdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newErr, setNewErr] = useState('');
  const [inviteOpen, setInviteOpen] = useState(null);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteErrs, setInviteErrs] = useState({});
  const [inviteErr, setInviteErr] = useState('');
  const [inviteLink, setInviteLink] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try { const r = await api.get('/admin/tenants'); setTenants(r.tenants || []); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createTenant() {
    if (!newName.trim()) { setNewErr('Informe o nome.'); return; }
    setSaving(true);
    try {
      await api.post('/admin/tenants', { name: newName.trim() });
      setNewOpen(false); setNewName(''); setNewErr(''); load();
    } catch (e) { setNewErr(e.message || 'Erro ao criar.'); }
    finally { setSaving(false); }
  }

  function openInvite(tenant) {
    setInviteOpen(tenant); setInviteForm({ name: '', email: '' }); setInviteErrs({}); setInviteErr(''); setInviteLink(null);
  }

  async function sendInvite() {
    setSaving(true); setInviteErr('');
    try {
      const r = await api.post(`/admin/tenants/${inviteOpen.id}/invite`, inviteForm);
      setInviteLink(r.inviteUrl || r.link || r.devLink || null);
      if (!r.inviteUrl && !r.link && !r.devLink) setInviteOpen(null);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setInviteErrs(e.fields);
      else setInviteErr(e.message || 'Erro ao enviar.');
    } finally { setSaving(false); }
  }

  function toggleTenant(t) {
    setConfirm({
      title: `${t.active ? 'Desativar' : 'Ativar'} "${t.name}"?`,
      message: t.active ? 'O escritório ficará inacessível.' : 'O escritório voltará a ter acesso.',
      confirmLabel: t.active ? 'Desativar' : 'Ativar',
      danger: t.active,
      onConfirm: async () => {
        setConfirm(null);
        try { await api.patch(`/admin/tenants/${t.id}/toggle`); load(); }
        catch (e) { alert(e.message); }
      },
    });
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head-l">
          <h1>Tenants</h1>
          <p>Escritórios de contabilidade</p>
        </div>
        <button className="btn btn-p" onClick={() => { setNewOpen(true); setNewName(''); setNewErr(''); }}>
          <i className="ti ti-plus"></i> Novo tenant
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div style={{ color: 'var(--t2)' }}>Carregando…</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Nome</th><th>Status</th><th>Usuários</th><th>Clientes</th><th>Análises</th><th>Criado em</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500, color: 'var(--t0)' }}>{t.name}</td>
                    <td>{t.active ? <span className="pill pill-g">Ativo</span> : <span className="pill pill-r">Inativo</span>}</td>
                    <td>{t.managers}</td>
                    <td>{t.clientCount}</td>
                    <td>{t.analysisCount}</td>
                    <td style={{ fontSize: 11 }}>{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button className="ib" title="Convidar" onClick={() => openInvite(t)}>
                          <i className="ti ti-user-plus"></i>
                        </button>
                        <button className={`ib${t.active ? ' ib-d' : ''}`} title={t.active ? 'Desativar' : 'Ativar'} onClick={() => toggleTenant(t)}>
                          <i className={`ti ${t.active ? 'ti-ban' : 'ti-check'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!tenants.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)' }}>Nenhum tenant.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New tenant modal */}
      {newOpen && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setNewOpen(false); }}>
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-head">
              <span className="modal-title">Novo tenant</span>
              <button className="modal-close" onClick={() => setNewOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body">
              <div className="inp-wrap" style={{ marginBottom: 0 }}>
                <label className="inp-label">Nome do escritório *</label>
                <input className="inp" autoFocus value={newName}
                  onChange={e => { setNewName(e.target.value); setNewErr(''); }}
                  placeholder="Ex: Escritório Contábil Silva" />
                {newErr && <div className="inp-hint">{newErr}</div>}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setNewOpen(false)}>Cancelar</button>
              <button className="btn btn-p" onClick={createTenant} disabled={saving}>
                {saving ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) { setInviteOpen(null); setInviteLink(null); } }}>
          <div className="modal">
            <div className="modal-head">
              <span className="modal-title">Convidar — {inviteOpen.name}</span>
              <button className="modal-close" onClick={() => { setInviteOpen(null); setInviteLink(null); }}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body">
              {inviteLink ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--green-t)', fontSize: 13, marginBottom: 10 }}>
                    <i className="ti ti-circle-check"></i> Convite gerado!
                  </div>
                  <div className="inp-wrap" style={{ marginBottom: 0 }}>
                    <label className="inp-label">Link de convite</label>
                    <input className="inp" readOnly value={inviteLink} onClick={e => e.target.select()} />
                  </div>
                </>
              ) : (
                <>
                  {inviteErr && <div className="err-banner">{inviteErr}</div>}
                  <div className="inp-wrap">
                    <label className="inp-label">Nome *</label>
                    <input className={`inp${inviteErrs.name ? ' inp-err' : ''}`} autoFocus
                      value={inviteForm.name} onChange={e => { setInviteForm(p => ({ ...p, name: e.target.value })); setInviteErrs(p => ({ ...p, name: '' })); }} />
                    {inviteErrs.name && <div className="inp-hint">{inviteErrs.name}</div>}
                  </div>
                  <div className="inp-wrap" style={{ marginBottom: 0 }}>
                    <label className="inp-label">E-mail *</label>
                    <input className={`inp${inviteErrs.email ? ' inp-err' : ''}`} type="email"
                      value={inviteForm.email} onChange={e => { setInviteForm(p => ({ ...p, email: e.target.value })); setInviteErrs(p => ({ ...p, email: '' })); }} />
                    {inviteErrs.email && <div className="inp-hint">{inviteErrs.email}</div>}
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot">
              {inviteLink ? (
                <button className="btn btn-p" onClick={() => { setInviteOpen(null); setInviteLink(null); }}>Fechar</button>
              ) : (
                <>
                  <button className="btn" onClick={() => setInviteOpen(null)}>Cancelar</button>
                  <button className="btn btn-p" onClick={sendInvite} disabled={saving}>
                    {saving ? 'Enviando…' : <><i className="ti ti-send"></i> Enviar</>}
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
