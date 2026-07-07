import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { AVATAR_COLORS, initials } from './UserAvatar.jsx';
import { CLIENT_TYPES } from '../lib/constants.js';

// Modal de criação/edição de cliente, usado tanto na página Clientes quanto
// no passo 1 de Nova Análise (para cadastrar o primeiro cliente sem sair do fluxo).
export default function ClientFormModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: client?.name || '', cnpj: client?.cnpj || '', type: client?.type || CLIENT_TYPES[0],
    contact_email: client?.contact_email || '', contact_phone: client?.contact_phone || '',
    notes: client?.notes || '', logo: client?.logo || null, logo_color: client?.logo_color || null,
    // Preserva o estado ativo/arquivado do cliente — sem isso, o backend
    // (routes/clients.js) assume active=1 quando o campo não vem no body,
    // reativando um cliente arquivado silenciosamente ao editar qualquer campo.
    active: client?.active ?? true,
  });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const logoRef = useRef(null);

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
      const r = client ? await api.put(`/clients/${client.id}`, form) : await api.post('/clients', form);
      onSaved(r.client);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      else setErr(e.message || 'Erro ao salvar.');
    } finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide">
        <div className="modal-head">
          <span className="modal-title" style={{ fontSize: 18 }}>{client ? `Editar — ${client.name}` : 'Novo cliente'}</span>
          <button className="modal-close" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          {err && <div className="err-banner">{err}</div>}
          <div className="inp-wrap">
            <span className="inp-label">Logo do cliente <span style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>(opcional)</span></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 56, height: 56, cursor: 'pointer', flexShrink: 0 }} onClick={() => logoRef.current?.click()}>
                <div className="cl-card-av" style={{ width: 56, height: 56, borderRadius: 14, fontSize: 18, ...(form.logo ? { backgroundImage: `url(${form.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : form.logo_color ? { background: form.logo_color } : {}) }}>
                  {!form.logo && initials(form.name)}
                </div>
                <div style={{
                  position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--bg1)', border: '2px solid var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                }}>
                  <i className="ti ti-camera" style={{ fontSize: 11, color: 'var(--t1)' }}></i>
                </div>
              </div>
              <div>
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
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/bmp" style={{ display: 'none' }} onChange={pickLogo} />
            </div>
          </div>
          <div className="grid-2" style={{ marginBottom: 13 }}>
            <div>
              <label className="inp-label">Nome *</label>
              <input className={`inp${errs.name ? ' inp-err' : ''}`} placeholder="Nome da empresa" value={form.name} onChange={e => upd('name', e.target.value)} autoFocus />
              {errs.name && <div className="inp-hint">{errs.name}</div>}
            </div>
            <div>
              <label className="inp-label">Tipo</label>
              <select className="inp" value={form.type} onChange={e => upd('type', e.target.value)}>
                {CLIENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="inp-label">CNPJ</label>
              <input className="inp" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => upd('cnpj', e.target.value)} />
            </div>
            <div>
              <label className="inp-label">E-mail de contato</label>
              <input className="inp" type="email" placeholder="contato@empresa.com" value={form.contact_email} onChange={e => upd('contact_email', e.target.value)} />
            </div>
            <div>
              <label className="inp-label">Telefone</label>
              <input className="inp" placeholder="(00) 00000-0000" value={form.contact_phone} onChange={e => upd('contact_phone', e.target.value)} />
            </div>
          </div>
          <div className="inp-wrap" style={{ marginBottom: 0 }}>
            <label className="inp-label">Observações</label>
            <textarea className="inp" rows={5} style={{ resize: 'vertical' }} value={form.notes} onChange={e => upd('notes', e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" onClick={save} disabled={busy}>
            {busy ? 'Salvando…' : <><i className="ti ti-check"></i> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
