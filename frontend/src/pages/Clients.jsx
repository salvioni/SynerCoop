import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { AVATAR_COLORS, initials } from '../components/UserAvatar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CLIENT_TYPES } from '../lib/constants.js';

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', cnpj: '', type: CLIENT_TYPES[0], contact_email: '', contact_phone: '', notes: '', logo: null, logo_color: null });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const logoRef = useRef(null);

  async function load() {
    setLoading(true);
    try { const r = await api.get('/clients?active=1'); setClients(r.clients || []); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.cnpj || '').includes(search)
  );

  function openNew() {
    setForm({ name: '', cnpj: '', type: CLIENT_TYPES[0], contact_email: '', contact_phone: '', notes: '', logo: null, logo_color: null });
    setErrs({}); setErr(''); setModal('new');
  }

  function openEdit(c, e) {
    e.stopPropagation();
    setForm({ name: c.name, cnpj: c.cnpj || '', type: c.type || 'cooperativa', contact_email: c.contact_email || '', contact_phone: c.contact_phone || '', notes: c.notes || '', logo: c.logo || null, logo_color: c.logo_color || null });
    setErrs({}); setErr(''); setModal({ client: c });
  }

  function pickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(p => ({ ...p, logo: ev.target.result, logo_color: null }));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function pickColor(color) {
    setForm(p => ({ ...p, logo_color: color, logo: null }));
  }

  function upd(k, v) { setForm(p => ({ ...p, [k]: v })); setErrs(p => ({ ...p, [k]: '' })); setErr(''); }

  async function save() {
    if (!form.name.trim()) { setErrs({ name: 'Informe o nome.' }); return; }
    setBusy(true); setErr('');
    try {
      if (modal === 'new') await api.post('/clients', form);
      else await api.put(`/clients/${modal.client.id}`, form);
      setModal(null); load();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      else setErr(e.message || 'Erro ao salvar.');
    } finally { setBusy(false); }
  }

  async function doDelete(client) {
    setConfirm(null);
    try { await api.del(`/clients/${client.id}`); load(); }
    catch (e) { alert(e.message); }
  }

  return (
    <>
      <div className="page-body">
        <PageHeader
          subtitle="Empresas analisadas"
          title="Clientes"
          action={<button className="btn btn-p" onClick={openNew}><i className="ti ti-plus"></i> Adicionar cliente</button>}
        />

        <div className="cl-search" style={{ marginBottom: 24, maxWidth: 480, width: '100%' }}>
          <i className="ti ti-search"></i>
          <input className="inp" placeholder="Buscar cliente ou CNPJ..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ color: 'var(--t2)', fontSize: 13 }}>Carregando…</div>
        ) : !filtered.length ? (
          <div className="cl-empty">
            <i className="ti ti-building-off"></i>
            {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Clique em "+ Novo cliente" para começar.'}
          </div>
        ) : (
          <div className="cl-grid">
            {filtered.map(c => (
              <div key={c.id} className="cl-card" onClick={() => navigate(`/app/clients/${c.id}`)}>
                <div className="cl-card-head">
                  <div className="cl-card-av" style={c.logo ? { backgroundImage: `url(${c.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : c.logo_color ? { background: c.logo_color } : {}}>
                    {!c.logo && initials(c.name)}
                  </div>
                  <span className="cl-card-type">{c.type || 'empresa'}</span>
                </div>
                <div className="cl-card-name">{c.name}</div>
                <div className="cl-card-cnpj">{c.cnpj || ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal !== null && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div className="modal-head">
              <span className="modal-title">{modal === 'new' ? 'Novo cliente' : `Editar — ${modal.client?.name}`}</span>
              <button className="modal-close" onClick={() => setModal(null)}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body">
              {err && <div className="err-banner">{err}</div>}
              <div className="inp-wrap" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="cl-logo-pick" onClick={() => logoRef.current?.click()}>
                  <div className="cl-card-av" style={{ width: 56, height: 56, borderRadius: 14, fontSize: 18, ...(form.logo ? { backgroundImage: `url(${form.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : form.logo_color ? { background: form.logo_color } : {}) }}>
                    {!form.logo && initials(form.name)}
                  </div>
                  <div className="cl-logo-pick-ov" style={{ borderRadius: 14 }}>
                    <i className="ti ti-camera" style={{ fontSize: 18, color: '#fff' }}></i>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t0)', marginBottom: 8 }}>Logo do cliente <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(opcional)</span></div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {AVATAR_COLORS.map(c => (
                      <button key={c.value} type="button" title={c.label} onClick={() => pickColor(c.value)} style={{ width: 22, height: 22, borderRadius: '50%', background: c.value, border: form.logo_color === c.value ? '2px solid var(--gold)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                  {(form.logo || form.logo_color) && (
                    <button type="button" style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--red-t)', cursor: 'pointer' }} onClick={() => setForm(p => ({ ...p, logo: null, logo_color: null }))}>
                      Remover
                    </button>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickLogo} />
              </div>
              <div className="inp-wrap">
                <label className="inp-label">Nome *</label>
                <input className={`inp${errs.name ? ' inp-err' : ''}`} placeholder="Nome da empresa" value={form.name} onChange={e => upd('name', e.target.value)} autoFocus />
                {errs.name && <div className="inp-hint">{errs.name}</div>}
              </div>
              <div className="inp-wrap">
                <label className="inp-label">Tipo</label>
                <select className="inp" value={form.type} onChange={e => upd('type', e.target.value)}>
                  {CLIENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="inp-wrap">
                <label className="inp-label">CNPJ</label>
                <input className="inp" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => upd('cnpj', e.target.value)} />
              </div>
              <div className="inp-wrap">
                <label className="inp-label">E-mail de contato</label>
                <input className="inp" type="email" placeholder="contato@empresa.com" value={form.contact_email} onChange={e => upd('contact_email', e.target.value)} />
              </div>
              <div className="inp-wrap">
                <label className="inp-label">Telefone</label>
                <input className="inp" placeholder="(00) 00000-0000" value={form.contact_phone} onChange={e => upd('contact_phone', e.target.value)} />
              </div>
              <div className="inp-wrap" style={{ marginBottom: 0 }}>
                <label className="inp-label">Observações</label>
                <textarea className="inp" rows={2} style={{ resize: 'vertical' }} value={form.notes} onChange={e => upd('notes', e.target.value)} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-p" onClick={save} disabled={busy}>
                {busy ? 'Salvando…' : <><i className="ti ti-check"></i> Salvar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
