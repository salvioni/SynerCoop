import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import { api, uploadFile, ApiError, downloadFile } from '../lib/api.js';
import { getPlan } from '../lib/plans.js';
import { TENANT_TYPES } from '../lib/constants.js';
import UserAvatar, { AVATAR_COLORS } from '../components/UserAvatar.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

export default function Settings() {
  const { user, refresh } = useAuth();
  const tenantType = TENANT_TYPES.find(t => t.value === user?.tenant_type) || TENANT_TYPES.find(t => t.value === 'escritorio');
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [info, setInfo] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [editOffice, setEditOffice] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftCnpj, setDraftCnpj] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftBillingEmail, setDraftBillingEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [editProfile, setEditProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarColor, setAvatarColor] = useState(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const avatarRef = useRef(null);

  const [brandLogo, setBrandLogo] = useState(null);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const brandLogoRef = useRef(null);

  const [members, setMembers] = useState([]);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteErrs, setInviteErrs] = useState({});
  const [inviteErr, setInviteErr] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [saveOfficeErr, setSaveOfficeErr] = useState('');
  const [saveProfileErr, setSaveProfileErr] = useState('');
  const [removeMemberErr, setRemoveMemberErr] = useState('');
  const [resendBusy, setResendBusy] = useState(null); // id do membro sendo reenviado
  const [resendDone, setResendDone] = useState(null); // id do membro cujo reenvio foi concluído
  const [exportBusy, setExportBusy] = useState(false);


  useEffect(() => {
    api.get('/account').then(d => {
      setInfo(d);
      setCompanyName(d.companyName || '');
      setCnpj(d.cnpj || '');
      setPhone(d.phone || '');
      setBillingEmail(d.billingEmail || '');
      setBrandLogo(d.logo || null);
    }).catch(() => {});
    loadMembers();
  }, []);

  // Permite navegar direto para uma seção específica (ex.: "Gerenciar
  // escritório" no Dashboard aponta para /app/settings#escritorio) sem cair
  // sempre no topo da página de ajustes.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  function loadMembers() {
    api.get('/users').then(r => setMembers(r.users || [])).catch(() => {});
  }

  async function inviteMember() {
    if (!inviteForm.name.trim()) { setInviteErrs({ name: 'Informe o nome.' }); return; }
    if (!inviteForm.email.trim()) { setInviteErrs({ email: 'Informe o e-mail.' }); return; }
    setInviteBusy(true); setInviteErr('');
    try {
      await api.post('/users/invite', inviteForm);
      loadMembers();
      setInviteModal(false);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setInviteErrs(e.fields);
      else setInviteErr(e.message || 'Erro ao convidar.');
    } finally { setInviteBusy(false); }
  }

  function openInvite() {
    setInviteForm({ name: '', email: '' });
    setInviteErrs({}); setInviteErr(''); setInviteBusy(false);
    setInviteModal(true);
  }

  async function removeMember(m) {
    setRemoveMemberErr('');
    try {
      await api.del(`/users/${m.id}`);
      loadMembers();
    } catch (e) { setRemoveMemberErr(e.message || 'Erro ao remover membro.'); }
  }

  async function resendInvite(m) {
    setResendBusy(m.id);
    setResendDone(null);
    try {
      await api.post(`/users/${m.id}/resend-invite`, {});
      setResendDone(m.id);
      loadMembers();
      // Limpa o feedback de "enviado" depois de 4 segundos
      setTimeout(() => setResendDone(d => d === m.id ? null : d), 4000);
    } catch (e) {
      setRemoveMemberErr(e.message || 'Erro ao reenviar convite.');
    } finally {
      setResendBusy(null);
    }
  }

  async function exportData() {
    setExportBusy(true);
    try {
      const blob = await downloadFile('/account/export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-synercoop-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Fallback: tenta como JSON normal se downloadFile falhar
      try {
        const data = await api.get('/account/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meus-dados-synercoop-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch { /* ignora */ }
    } finally { setExportBusy(false); }
  }

  useEffect(() => {
    setAvatarUrl(user?.avatar || null);
    setAvatarColor(user?.avatar_color || null);
  }, [user?.avatar, user?.avatar_color]);

  function maskCnpj(v) {
    const d = v.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }

  function maskPhone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }

  function startEdit() {
    setDraft(companyName);
    setDraftCnpj(cnpj);
    setDraftPhone(phone);
    setDraftBillingEmail(billingEmail);
    setEditOffice(true);
  }
  function cancelEdit() {
    setEditOffice(false);
    setBrandLogo(info?.logo || null);
    setPendingLogoFile(null);
    setLogoRemoved(false);
  }

  async function saveOffice(e) {
    e.preventDefault();
    const cnpjDigits = draftCnpj.replace(/\D/g, '');
    const phoneDigits = draftPhone.replace(/\D/g, '');
    if (draftCnpj && cnpjDigits.length !== 14) { setSaveOfficeErr('CNPJ incompleto — informe os 14 dígitos.'); return; }
    if (draftPhone && phoneDigits.length < 10) { setSaveOfficeErr('Telefone incompleto — informe DDD + número.'); return; }
    if (draftBillingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftBillingEmail.trim())) { setSaveOfficeErr('E-mail de cobrança inválido.'); return; }
    setSaving(true);
    try {
      await api.patch('/account', { name: draft, cnpj: draftCnpj, phone: draftPhone, billingEmail: draftBillingEmail });
      if (pendingLogoFile) await uploadFile('/account/logo', pendingLogoFile);
      else if (logoRemoved) await api.del('/account/logo');
      await refresh();
      const d = await api.get('/account');
      setInfo(d);
      setCompanyName(d.companyName || '');
      setCnpj(d.cnpj || '');
      setPhone(d.phone || '');
      setBillingEmail(d.billingEmail || '');
      setBrandLogo(d.logo || null);
      setPendingLogoFile(null);
      setLogoRemoved(false);
      setEditOffice(false);
    } catch (err) {
      setSaveOfficeErr(err.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function startEditProfile() { setProfileName(user?.name || ''); setEditProfile(true); }

  // Cancelar precisa desfazer qualquer troca de foto/cor só armazenada
  // localmente (ver pickAvatarFile/pickColor/stageRemoveAvatar abaixo) —
  // volta a mostrar exatamente o que está salvo em `user`.
  function cancelEditProfile() {
    setEditProfile(false);
    setAvatarUrl(user?.avatar || null);
    setAvatarColor(user?.avatar_color || null);
    setPendingAvatarFile(null);
    setAvatarRemoved(false);
  }

  // Nome, foto, cor e remoção de foto só são de fato enviados ao backend
  // aqui, no Salvar — os handlers de foto/cor abaixo só atualizam estado
  // local (preview), pra Cancelar realmente descartar a mudança.
  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/account/profile', { name: profileName });
      if (pendingAvatarFile) {
        await uploadFile('/account/avatar', pendingAvatarFile);
      } else if (avatarRemoved) {
        await api.del('/account/avatar');
      } else if (avatarColor !== (user?.avatar_color || null)) {
        await api.patch('/account/avatar-color', { color: avatarColor });
      }
      await refresh();
      setPendingAvatarFile(null);
      setAvatarRemoved(false);
      setEditProfile(false);
    } catch (err) {
      setSaveProfileErr(err.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      setSavingProfile(false);
    }
  }

  function pickAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setAvatarUrl(ev.target.result); setAvatarColor(null); };
    reader.readAsDataURL(file);
    setPendingAvatarFile(file);
    setAvatarRemoved(false);
    e.target.value = '';
  }

  function pickColor(color) {
    setAvatarColor(color);
    setAvatarUrl(null);
    setPendingAvatarFile(null);
    // Se havia foto salva no servidor, precisa deletá-la ao salvar
    setAvatarRemoved(!!user?.avatar);
  }

  function stageRemoveAvatar() {
    setAvatarUrl(null);
    setAvatarColor(null);
    setPendingAvatarFile(null);
    setAvatarRemoved(true);
  }

  // Mesmo padrão do avatar de perfil: escolher/remover logo só atualiza o
  // preview local — nada é enviado até Salvar, e Cancelar descarta tudo.
  function pickBrandLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setBrandLogo(ev.target.result);
    reader.readAsDataURL(file);
    setPendingLogoFile(file);
    setLogoRemoved(false);
    e.target.value = '';
  }

  function stageRemoveBrandLogo() {
    setBrandLogo(null);
    setPendingLogoFile(null);
    setLogoRemoved(true);
  }

  return (
    <>
    <div className="page-body" style={{ maxWidth: 768, margin: '0 auto', width: '100%' }}>
      <h1 className="page-h1">Ajustes</h1>

      {/* ── Meu perfil ── */}
      <form onSubmit={saveProfile}>
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>Meu perfil</h2>
          {!editProfile
            ? <button type="button" className="btn" onClick={() => { setSaveProfileErr(''); startEditProfile(); }}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setSaveProfileErr(''); cancelEditProfile(); }} disabled={savingProfile}>Cancelar</button>
                <button type="submit" className="btn btn-p" disabled={savingProfile}>{savingProfile ? 'Salvando…' : 'Salvar'}</button>
              </div>
          }
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: editProfile ? 16 : 20 }}>
          <div style={{ flexShrink: 0 }}>
            {editProfile ? (
              <div style={{ position: 'relative', width: 72, height: 72, cursor: 'pointer' }} onClick={() => avatarRef.current?.click()}>
                <UserAvatar user={{ ...user, name: profileName || user?.name, avatar: avatarUrl, avatar_color: avatarColor }} size={72} />
                <div style={{
                  position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--bg1)', border: '2px solid var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                }}>
                  <i className="ti ti-camera" style={{ fontSize: 14, color: 'var(--t1)' }}></i>
                </div>
              </div>
            ) : (
              <UserAvatar user={{ ...user, avatar: avatarUrl, avatar_color: avatarColor }} size={72} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--t0)' }}>{editProfile ? (profileName || user?.name) : user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>{user?.email}</div>
          </div>
        </div>

        {editProfile && (
          <>
            <span className="inp-label" style={{ display: 'block', marginBottom: 8 }}>Cor do avatar</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {AVATAR_COLORS.map(c => (
                <button key={c.value} type="button"
                  title={c.label}
                  onClick={() => pickColor(c.value)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c.value, padding: 0,
                    cursor: 'pointer',
                    border: !avatarUrl && (avatarColor || '') === c.value ? '2px solid var(--gold)' : '2px solid transparent',
                  }} />
              ))}
            </div>
            <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/bmp" onChange={pickAvatarFile} style={{ display: 'none' }} />
          </>
        )}

        {saveProfileErr && (
          <div className="auth-err" style={{ marginBottom: 12 }}>{saveProfileErr}</div>
        )}

        {editProfile && (
          <div className="grid-2">
            <label style={{ display: 'block' }}>
              <span className="inp-label">Nome</span>
              <input className="inp" value={profileName} onChange={e => setProfileName(e.target.value)} style={{ marginTop: 6 }} autoFocus />
            </label>
            <label style={{ display: 'block' }}>
              <span className="inp-label">E-mail</span>
              <input className="inp" value={user?.email || ''} disabled style={{ marginTop: 6 }} />
            </label>
          </div>
        )}

      </section>
      </form>

      {/* ── Escritório ── */}
      <form onSubmit={saveOffice}>
      <section id="escritorio" style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>{tenantType.label}</h2>
          {!editOffice
            ? <button type="button" className="btn" onClick={() => { setSaveOfficeErr(''); startEdit(); }}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setSaveOfficeErr(''); cancelEdit(); }} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
          }
        </div>

        {!editOffice ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 4 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--bd)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
              ...(brandLogo ? { backgroundImage: `url(${brandLogo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
            }}>
              {!brandLogo && <i className="ti ti-building" style={{ fontSize: 28, color: 'var(--t3)' }}></i>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--t0)' }}>{companyName || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Nome não informado</span>}</div>
              {cnpj && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}><i className="ti ti-id-badge" style={{ fontSize: 12, marginRight: 4 }}></i>{cnpj}</div>}
              {phone && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}><i className="ti ti-phone" style={{ fontSize: 12, marginRight: 4 }}></i>{phone}</div>}
              {billingEmail && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}><i className="ti ti-mail" style={{ fontSize: 12, marginRight: 4 }}></i>{billingEmail}</div>}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <span className="inp-label">Logo {tenantType.article} {tenantType.label.toLowerCase()}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
                <div style={{
                  position: 'relative', width: 64, height: 64, flexShrink: 0, cursor: 'pointer',
                }} onClick={() => brandLogoRef.current?.click()}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--bd)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    ...(brandLogo ? { backgroundImage: `url(${brandLogo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                  }}>
                    {!brandLogo && <i className="ti ti-building" style={{ fontSize: 24, color: 'var(--t3)' }}></i>}
                  </div>
                  <div style={{
                    position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--bg1)', border: '2px solid var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                  }}>
                    <i className="ti ti-camera" style={{ fontSize: 11, color: 'var(--t1)' }}></i>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--t2)' }}>Aparece na capa dos relatórios baixados. PNG, JPG ou BMP.</div>
                  {brandLogo && (
                    <button type="button" className="btn" style={{ fontSize: 12, color: 'var(--red-t)', marginTop: 8 }} onClick={stageRemoveBrandLogo}>
                      <i className="ti ti-trash"></i> Remover logo
                    </button>
                  )}
                </div>
                <input ref={brandLogoRef} type="file" accept="image/png,image/jpeg,image/bmp" onChange={pickBrandLogoFile} style={{ display: 'none' }} />
              </div>
            </div>

            {saveOfficeErr && (
              <div className="auth-err" style={{ marginBottom: 12 }}>{saveOfficeErr}</div>
            )}

            <div className="grid-2">
              <label style={{ display: 'block' }}>
                <span className="inp-label">Nome</span>
                <input className="inp" value={draft} onChange={e => setDraft(e.target.value)} style={{ marginTop: 6 }} autoFocus />
              </label>
              <label style={{ display: 'block' }}>
                <span className="inp-label">CNPJ</span>
                <input className="inp" value={draftCnpj} onChange={e => setDraftCnpj(maskCnpj(e.target.value))} placeholder="00.000.000/0001-00" style={{ marginTop: 6 }} inputMode="numeric" />
              </label>
              <label style={{ display: 'block' }}>
                <span className="inp-label">E-mail de cobrança</span>
                <input className="inp" type="email" value={draftBillingEmail} onChange={e => setDraftBillingEmail(e.target.value)} style={{ marginTop: 6 }} />
              </label>
              <label style={{ display: 'block' }}>
                <span className="inp-label">Telefone</span>
                <input className="inp" value={draftPhone} onChange={e => setDraftPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" style={{ marginTop: 6 }} inputMode="numeric" />
              </label>
            </div>
          </>
        )}
      </section>
      </form>

      {/* ── Membros ── */}
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: removeMemberErr ? 12 : 20 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>Membros</h2>
          <button className="btn btn-p" onClick={openInvite}><i className="ti ti-user-plus"></i> Convidar</button>
        </div>
        {removeMemberErr && (
          <div className="auth-err" style={{ marginBottom: 16 }}>{removeMemberErr}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {members.map((m, i) => {
            const isPending = m.invite_status === 'pending';
            const isExpired = m.invite_status === 'expired';
            const needsAction = isPending || isExpired;
            const isResending = resendBusy === m.id;
            const justSent = resendDone === m.id;
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i > 0 ? '1px solid var(--bd)' : 'none' }}>
                <UserAvatar user={m} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t0)' }}>
                    {m.name}
                    {m.id === user?.id && <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400, marginLeft: 6 }}>você</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 1 }}>{m.email}</div>
                </div>

                {/* Badge de status do convite — clicável para reenviar */}
                {justSent && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(20,135,78,.10)', color: 'var(--green-t)', border: '1px solid rgba(20,135,78,.25)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-circle-check" style={{ fontSize: 11 }}></i>
                    Enviado!
                  </span>
                )}
                {!justSent && isPending && m.id !== user?.id && (
                  <button type="button" onClick={() => !isResending && resendInvite(m)}
                    title="Clique para reenviar o convite"
                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(235,136,31,.12)', color: 'var(--yellow-t)', border: '1px solid rgba(235,136,31,.3)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, cursor: isResending ? 'default' : 'pointer' }}>
                    {isResending
                      ? <><i className="ti ti-loader" style={{ fontSize: 11, animation: 'spin .8s linear infinite' }}></i> Enviando…</>
                      : <><i className="ti ti-mail" style={{ fontSize: 11 }}></i> Convite enviado</>
                    }
                  </button>
                )}
                {!justSent && isExpired && m.id !== user?.id && (
                  <button type="button" onClick={() => !isResending && resendInvite(m)}
                    title="Clique para reenviar o convite"
                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(208,29,33,.10)', color: 'var(--red-t)', border: '1px solid rgba(208,29,33,.25)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, cursor: isResending ? 'default' : 'pointer' }}>
                    {isResending
                      ? <><i className="ti ti-loader" style={{ fontSize: 11, animation: 'spin .8s linear infinite' }}></i> Enviando…</>
                      : <><i className="ti ti-mail-off" style={{ fontSize: 11 }}></i> Convite expirado</>
                    }
                  </button>
                )}
                {!justSent && isPending && m.id === user?.id && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'rgba(235,136,31,.12)', color: 'var(--yellow-t)', border: '1px solid rgba(235,136,31,.3)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-mail" style={{ fontSize: 11 }}></i> Convite enviado
                  </span>
                )}

                {m.id !== user?.id && (
                  <button className="ib ib-d" title="Remover membro" onClick={() => setConfirm({
                    title: 'Remover membro',
                    message: `"${m.name}" perderá o acesso ao escritório.${needsAction ? ' O convite não aceito também será cancelado.' : ''}`,
                    confirmLabel: 'Remover', danger: true,
                    onConfirm: () => removeMember(m),
                  })}>
                    <i className="ti ti-trash"></i>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', marginBottom: 16 }}>Plano e cobrança</h2>
        {(() => {
          const plan = getPlan(info?.plan);
          const used = info?.monthlyAnalyses ?? 0;
          const limit = plan.limit;
          const unlimited = limit === Infinity;
          const pct = unlimited ? 100 : Math.min(100, (used / limit) * 100);
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Plano atual</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--t0)' }}>
                    {plan.label} · {plan.price}<span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'inherit' }}>/mês</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn">Histórico</button>
                  <button className="btn btn-p">Upgrade Enterprise</button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--t2)' }}>Análises este mês</span>
                <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>
                  {unlimited ? `${used} utilizadas` : `${used} de ${limit}`}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--bg2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: 'var(--gold)', width: `${pct}%`, transition: 'width .4s ease' }} />
              </div>
            </>
          );
        })()}
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', marginBottom: 16 }}>Aparência</h2>
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

      {/* ── Privacidade (LGPD) ── */}
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', marginBottom: 8 }}>Privacidade e dados</h2>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
          Pela LGPD (Art. 18), você tem direito de acessar e exportar todos os seus dados pessoais armazenados pelo SynerCoop.
        </p>
        <button className="btn" onClick={exportData} disabled={exportBusy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-download"></i>
          {exportBusy ? 'Preparando…' : 'Exportar meus dados (.json)'}
        </button>
      </section>

    </div>
    {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

    {inviteModal && (
      <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setInviteModal(false); }}>
        <div className="modal">
          <div className="modal-head">
            <span className="modal-title">Convidar membro</span>
            <button className="modal-close" onClick={() => setInviteModal(false)}><i className="ti ti-x"></i></button>
          </div>
          <div className="modal-body">
            {inviteErr && <div className="err-banner">{inviteErr}</div>}
            <div className="inp-wrap">
              <label className="inp-label">Nome *</label>
              <input className={`inp${inviteErrs.name ? ' inp-err' : ''}`} value={inviteForm.name} onChange={e => { setInviteForm(p => ({ ...p, name: e.target.value })); setInviteErrs(p => ({ ...p, name: '' })); }} autoFocus />
              {inviteErrs.name && <div className="inp-hint">{inviteErrs.name}</div>}
            </div>
            <div className="inp-wrap" style={{ marginBottom: 0 }}>
              <label className="inp-label">E-mail *</label>
              <input className={`inp${inviteErrs.email ? ' inp-err' : ''}`} type="email" value={inviteForm.email} onChange={e => { setInviteForm(p => ({ ...p, email: e.target.value })); setInviteErrs(p => ({ ...p, email: '' })); }} />
              {inviteErrs.email && <div className="inp-hint">{inviteErrs.email}</div>}
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setInviteModal(false)}>Cancelar</button>
            <button className="btn btn-p" onClick={inviteMember} disabled={inviteBusy}>{inviteBusy ? 'Enviando…' : <><i className="ti ti-send"></i> Enviar convite</>}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
