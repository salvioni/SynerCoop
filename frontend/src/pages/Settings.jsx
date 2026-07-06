import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import { api, uploadFile, ApiError } from '../lib/api.js';
import { getPlan } from '../lib/plans.js';
import UserAvatar, { AVATAR_COLORS } from '../components/UserAvatar.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

export default function Settings() {
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [info, setInfo] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [editOffice, setEditOffice] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [editProfile, setEditProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarColor, setAvatarColor] = useState(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const avatarRef = useRef(null);

  const [editBrand, setEditBrand] = useState(false);
  const [brandLogo, setBrandLogo] = useState(null);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const brandLogoRef = useRef(null);

  const [members, setMembers] = useState([]);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteErrs, setInviteErrs] = useState({});
  const [inviteErr, setInviteErr] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteDone, setInviteDone] = useState(false);
  const [confirm, setConfirm] = useState(null);


  useEffect(() => {
    api.get('/account').then(d => {
      setInfo(d);
      setCompanyName(d.companyName || '');
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
      setInviteDone(true);
      loadMembers();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setInviteErrs(e.fields);
      else setInviteErr(e.message || 'Erro ao convidar.');
    } finally { setInviteBusy(false); }
  }

  function openInvite() {
    setInviteForm({ name: '', email: '' });
    setInviteErrs({}); setInviteErr(''); setInviteDone(false); setInviteBusy(false);
    setInviteModal(true);
  }

  async function removeMember(m) {
    try {
      await api.del(`/users/${m.id}`);
      loadMembers();
    } catch (e) { alert(e.message || 'Erro ao remover.'); }
  }

  useEffect(() => {
    setAvatarUrl(user?.avatar || null);
    setAvatarColor(user?.avatar_color || null);
  }, [user?.avatar, user?.avatar_color]);

  function startEdit() { setDraft(companyName); setEditOffice(true); }
  function cancelEdit() { setEditOffice(false); }

  async function saveOffice(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/account', { name: draft });
      await refresh();
      setCompanyName(draft);
      setEditOffice(false);
    } catch (err) {
      alert(err.message || 'Erro ao salvar.');
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
      alert(err.message || 'Erro ao salvar.');
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
    setAvatarRemoved(false);
  }

  function stageRemoveAvatar() {
    setAvatarUrl(null);
    setAvatarColor(null);
    setPendingAvatarFile(null);
    setAvatarRemoved(true);
  }

  function startEditBrand() { setEditBrand(true); }

  // Mesmo padrão do avatar de perfil: escolher/remover logo só atualiza o
  // preview local — nada é enviado até Salvar, e Cancelar descarta tudo.
  function cancelEditBrand() {
    setEditBrand(false);
    setBrandLogo(info?.logo || null);
    setPendingLogoFile(null);
    setLogoRemoved(false);
  }

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

  async function saveBrand(e) {
    e.preventDefault();
    setSavingBrand(true);
    try {
      if (pendingLogoFile) await uploadFile('/account/logo', pendingLogoFile);
      else if (logoRemoved) await api.del('/account/logo');
      const d = await api.get('/account');
      setInfo(d);
      setBrandLogo(d.logo || null);
      setPendingLogoFile(null);
      setLogoRemoved(false);
      setEditBrand(false);
    } catch (err) {
      alert(err.message || 'Erro ao salvar.');
    } finally {
      setSavingBrand(false);
    }
  }

  return (
    <>
    <div className="page-body" style={{ maxWidth: 768, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--t0)' }}>Ajustes</h1>

      {/* ── Meu perfil ── */}
      <form onSubmit={saveProfile}>
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>Meu perfil</h2>
          {!editProfile
            ? <button type="button" className="btn" onClick={startEditProfile}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={cancelEditProfile} disabled={savingProfile}>Cancelar</button>
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
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {AVATAR_COLORS.map(c => (
                <button key={c.value} type="button" title={c.label} onClick={() => pickColor(c.value)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: c.value, cursor: 'pointer', border: (avatarColor || '') === c.value ? '2px solid var(--gold)' : '2px solid transparent', padding: 0,
                }} />
              ))}
            </div>
            {avatarUrl && (
              <button type="button" className="btn" style={{ fontSize: 12, color: 'var(--red-t)' }} onClick={stageRemoveAvatar}>
                <i className="ti ti-trash"></i> Remover foto
              </button>
            )}
            <input ref={avatarRef} type="file" accept="image/*" onChange={pickAvatarFile} style={{ display: 'none' }} />
          </div>
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

      {/* ── Escritório ── */}
      <form onSubmit={saveOffice}>
      <section id="escritorio" style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>Escritório</h2>
          {!editOffice
            ? <button type="button" className="btn" onClick={startEdit}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={cancelEdit} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
          }
        </div>
        {/* key força o remount ao entrar/sair do modo de edição — os campos
            abaixo (CNPJ, e-mail, telefone) ainda não têm estado próprio nem
            persistência no backend, então usam defaultValue (não controlado);
            sem o remount, o texto digitado ficaria visível mesmo após Cancelar. */}
        <div className="grid-2" key={editOffice ? 'editing' : 'view'}>
          <label style={{ display: 'block' }}>
            <span className="inp-label">Nome</span>
            {editOffice
              ? <input className="inp" value={draft} onChange={e => setDraft(e.target.value)} style={{ marginTop: 6 }} autoFocus />
              : <input className="inp" value={companyName} disabled style={{ marginTop: 6 }} />
            }
          </label>
          <Field label="CNPJ" value="" placeholder="00.000.000/0001-00" disabled={!editOffice} />
          <Field label="E-mail de cobrança" value={user?.email || ''} disabled={!editOffice} />
          <Field label="Telefone" value="" placeholder="(00) 00000-0000" disabled={!editOffice} />
        </div>
      </section>
      </form>

      {/* ── Membros ── */}
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>Membros</h2>
          <button className="btn btn-p" onClick={openInvite}><i className="ti ti-user-plus"></i> Convidar</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {members.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i > 0 ? '1px solid var(--bd)' : 'none' }}>
              <UserAvatar user={m} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t0)' }}>{m.name}{m.id === user?.id && <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400, marginLeft: 6 }}>você</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 1 }}>{m.email}</div>
              </div>
              {m.invite_pending ? <span className="pill" style={{ fontSize: 11 }}>Convite pendente</span> : null}
              {m.id !== user?.id && (
                <button className="ib ib-d" title="Remover membro" onClick={() => setConfirm({ title: 'Remover membro', message: `"${m.name}" perderá o acesso ao escritório.`, confirmLabel: 'Remover', danger: true, onConfirm: () => removeMember(m) })}>
                  <i className="ti ti-trash"></i>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={saveBrand}>
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', margin: 0 }}>Marca branca</h2>
          {!editBrand
            ? <button type="button" className="btn" onClick={startEditBrand}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={cancelEditBrand} disabled={savingBrand}>Cancelar</button>
                <button type="submit" className="btn btn-p" disabled={savingBrand}>{savingBrand ? 'Salvando…' : 'Salvar'}</button>
              </div>
          }
        </div>
        <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4, marginBottom: 16 }}>Personalize o logo, cores e capa dos relatórios.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <div style={{
            position: 'relative', width: 64, height: 64, flexShrink: 0,
            cursor: editBrand ? 'pointer' : 'default',
          }} onClick={() => editBrand && brandLogoRef.current?.click()}>
            <div style={{
              width: 64, height: 64, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--bd)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              ...(brandLogo ? { backgroundImage: `url(${brandLogo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
            }}>
              {!brandLogo && <i className="ti ti-building" style={{ fontSize: 24, color: 'var(--t3)' }}></i>}
            </div>
            {editBrand && (
              <div style={{
                position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%',
                background: 'var(--bg1)', border: '2px solid var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,.25)',
              }}>
                <i className="ti ti-camera" style={{ fontSize: 11, color: 'var(--t1)' }}></i>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t0)' }}>Logo do escritório</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>Aparece na capa dos relatórios DOCX baixados. PNG, JPG, GIF ou BMP.</div>
            {editBrand && brandLogo && (
              <button type="button" className="btn" style={{ fontSize: 12, color: 'var(--red-t)', marginTop: 8 }} onClick={stageRemoveBrandLogo}>
                <i className="ti ti-trash"></i> Remover logo
              </button>
            )}
          </div>
          <input ref={brandLogoRef} type="file" accept="image/png,image/jpeg,image/gif,image/bmp" onChange={pickBrandLogoFile} style={{ display: 'none' }} />
        </div>

        <div key={editBrand ? 'editing' : 'view'}>
          <Field label="Assinatura nos relatórios" value="Meu Escritório — Análise Financeira" disabled={!editBrand} />
        </div>
      </section>
      </form>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--t0)', marginBottom: 16 }}>Plano e cobrança</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--t0)' }}>
              {getPlan(info?.plan).label} · {getPlan(info?.plan).price}<span style={{ fontSize: 14, color: 'var(--t2)', fontFamily: 'inherit' }}>/mês</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4 }}>
              {info?.monthlyAnalyses ?? 0}/{getPlan(info?.plan).limit === Infinity ? '∞' : getPlan(info?.plan).limit} análises este mês
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn">Histórico</button>
            <button className="btn btn-p">Upgrade Enterprise</button>
          </div>
        </div>
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
            {inviteDone ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <i className="ti ti-mail-check" style={{ fontSize: 36, color: 'var(--green-t)', display: 'block', marginBottom: 12 }}></i>
                <div style={{ fontWeight: 500, color: 'var(--t0)', marginBottom: 4 }}>Convite enviado!</div>
                <div style={{ fontSize: 13, color: 'var(--t2)' }}>O membro receberá um e-mail para definir sua senha.</div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setInviteModal(false)}>{inviteDone ? 'Fechar' : 'Cancelar'}</button>
            {!inviteDone && <button className="btn btn-p" onClick={inviteMember} disabled={inviteBusy}>{inviteBusy ? 'Enviando…' : <><i className="ti ti-send"></i> Enviar convite</>}</button>}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function Field({ label, value, placeholder, disabled }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="inp-label">{label}</span>
      <input className="inp" defaultValue={value} placeholder={placeholder} disabled={disabled} style={{ marginTop: 6 }} />
    </label>
  );
}
