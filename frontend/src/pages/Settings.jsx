import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import { api, uploadFile } from '../lib/api.js';
import { getPlan } from '../lib/plans.js';
import UserAvatar, { AVATAR_COLORS } from '../components/UserAvatar.jsx';

export default function Settings() {
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
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
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const avatarRef = useRef(null);

  const [showPw, setShowPw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api.get('/account').then(d => {
      setInfo(d);
      setCompanyName(d.companyName || '');
    }).catch(() => {});
    if (user?.avatar) setAvatarUrl(user.avatar);
    if (user?.avatar_color) setAvatarColor(user.avatar_color);
  }, []);

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

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/account/profile', { name: profileName });
      await refresh();
      setEditProfile(false);
    } catch (err) {
      alert(err.message || 'Erro ao salvar.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await uploadFile('/account/avatar', file);
      setAvatarUrl(data.avatar);
      setShowAvatarModal(false);
      await refresh();
    } catch (err) {
      alert(err.message || 'Erro ao enviar imagem.');
    }
  }

  async function pickColor(color) {
    try {
      await api.patch('/account/avatar-color', { color });
      setAvatarColor(color);
      setAvatarUrl(null);
      setShowAvatarModal(false);
      await refresh();
    } catch (err) {
      alert(err.message || 'Erro ao salvar cor.');
    }
  }

  async function removeAvatar() {
    try {
      await api.del('/account/avatar');
      setAvatarUrl(null);
      setShowAvatarModal(false);
      await refresh();
    } catch (err) {
      alert(err.message || 'Erro ao remover foto.');
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwErr(''); setSavingPw(true);
    try {
      await api.post('/account/change-password', { current: currentPw, next: newPw });
      setShowPw(false); setCurrentPw(''); setNewPw('');
      alert('Senha alterada com sucesso.');
    } catch (err) {
      setPwErr(err.message || 'Erro ao alterar senha.');
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="page-body" style={{ maxWidth: 768, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--t0)' }}>Ajustes</h1>

      {/* ── Meu perfil ── */}
      <form onSubmit={saveProfile}>
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)', margin: 0 }}>Meu perfil</h2>
          {!editProfile
            ? <button type="button" className="btn" onClick={startEditProfile}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setEditProfile(false)} disabled={savingProfile}>Cancelar</button>
                <button type="submit" className="btn btn-p" disabled={savingProfile}>{savingProfile ? 'Salvando…' : 'Salvar'}</button>
              </div>
          }
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setShowAvatarModal(true)}>
            <UserAvatar user={{ ...user, avatar: avatarUrl, avatar_color: avatarColor }} size={72} />
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--bg1)', border: '2px solid var(--bd)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-camera" style={{ fontSize: 13, color: 'var(--t2)' }}></i>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--t0)' }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>{user?.email}</div>
          </div>
        </div>

        <div className="grid-2">
          <label style={{ display: 'block' }}>
            <span className="inp-label">Nome</span>
            {editProfile
              ? <input className="inp" value={profileName} onChange={e => setProfileName(e.target.value)} style={{ marginTop: 6 }} autoFocus />
              : <input className="inp" value={user?.name || ''} disabled style={{ marginTop: 6 }} />
            }
          </label>
          <label style={{ display: 'block' }}>
            <span className="inp-label">E-mail</span>
            <input className="inp" value={user?.email || ''} disabled style={{ marginTop: 6 }} />
          </label>
        </div>

        {!showPw ? (
          <button type="button" className="btn" onClick={() => setShowPw(true)} style={{ marginTop: 16 }}>
            <i className="ti ti-lock"></i> Alterar senha
          </button>
        ) : (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg2)', borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t0)', marginBottom: 12 }}>Alterar senha</div>
            {pwErr && <div className="err-banner" style={{ marginBottom: 12 }}>{pwErr}</div>}
            <div className="grid-2">
              <label style={{ display: 'block' }}>
                <span className="inp-label">Senha atual</span>
                <input className="inp" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} style={{ marginTop: 6 }} />
              </label>
              <label style={{ display: 'block' }}>
                <span className="inp-label">Nova senha</span>
                <input className="inp" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mínimo 8 caracteres" style={{ marginTop: 6 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => { setShowPw(false); setPwErr(''); setCurrentPw(''); setNewPw(''); }}>Cancelar</button>
              <button type="button" className="btn btn-p" onClick={changePassword} disabled={savingPw || !currentPw || !newPw}>
                {savingPw ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </section>
      </form>

      {/* ── Escritório ── */}
      <form onSubmit={saveOffice}>
      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)', margin: 0 }}>Escritório</h2>
          {!editOffice
            ? <button type="button" className="btn" onClick={startEdit}><i className="ti ti-edit"></i> Editar</button>
            : <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={cancelEdit} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
          }
        </div>
        <div className="grid-2">
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

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)', marginBottom: 16 }}>Plano e cobrança</h2>
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

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400, color: 'var(--t0)' }}>Marca branca</h2>
        <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4, marginBottom: 16 }}>Personalize o logo, cores e capa dos relatórios (Pro e Enterprise).</p>
        <div className="grid-2">
          <Field label="Cor principal" value="#1a2b5e" />
          <Field label="Assinatura nos relatórios" value="Meu Escritório — Análise Financeira" />
        </div>
      </section>

      <section style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginTop: 24 }}>
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

      {showAvatarModal && (
        <div className="overlay" onClick={() => setShowAvatarModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Foto do perfil</span>
              <button className="modal-close" onClick={() => setShowAvatarModal(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <UserAvatar user={{ ...user, avatar: avatarUrl, avatar_color: avatarColor }} size={96} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div className="inp-label" style={{ marginBottom: 10 }}>Cor de fundo</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {AVATAR_COLORS.map(c => (
                    <div
                      key={c.value}
                      onClick={() => pickColor(c.value)}
                      title={c.label}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                        background: c.value, border: (avatarColor || 'var(--blue)') === c.value ? '3px solid var(--gold)' : '2px solid var(--bd)',
                        transition: 'border .15s',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
                <div className="inp-label" style={{ marginBottom: 10 }}>Enviar foto</div>
                <button type="button" className="btn" onClick={() => avatarRef.current?.click()} style={{ width: '100%', justifyContent: 'center' }}>
                  <i className="ti ti-upload"></i> Escolher imagem
                </button>
                <input ref={avatarRef} type="file" accept="image/*" onChange={uploadAvatar} style={{ display: 'none' }} />
                {avatarUrl && (
                  <button type="button" className="btn" onClick={removeAvatar} style={{ width: '100%', justifyContent: 'center', marginTop: 8, color: 'var(--red-t)' }}>
                    <i className="ti ti-trash"></i> Remover foto
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
