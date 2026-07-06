import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import ClientFormModal from '../components/ClientFormModal.jsx';
import { initials } from '../components/UserAvatar.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [modal, setModal] = useState(null);
  const requestIdRef = useRef(0);

  async function load() {
    // Guarda contra respostas fora de ordem: alternar rápido entre as abas
    // Ativos/Arquivados pode disparar duas requisições sobrepostas — sem isso,
    // a resposta mais antiga poderia sobrescrever a lista com dados da aba errada.
    const requestId = ++requestIdRef.current;
    // Não reseta `loading` aqui: isso serve só pra tela de carregamento inicial.
    // Trocar de aba deve manter a lista atual visível até a nova chegar, em
    // vez de piscar "Carregando…" a cada clique.
    try {
      const r = await api.get(`/clients?active=${status === 'active' ? 1 : 0}`);
      if (requestId !== requestIdRef.current) return;
      setClients(r.clients || []);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.cnpj || '').includes(search)
  );

  return (
    <>
      <div className="page-body">
        <PageHeader
          subtitle="Empresas analisadas"
          title="Clientes"
          action={<button className="btn btn-p" onClick={() => setModal('new')}><i className="ti ti-plus"></i> Adicionar cliente</button>}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={`nav-tab${status === 'active' ? ' active' : ''}`} onClick={() => setStatus('active')}><i className="ti ti-circle-check"></i> Ativos</button>
          <button className={`nav-tab${status === 'archived' ? ' active' : ''}`} onClick={() => setStatus('archived')}><i className="ti ti-archive"></i> Arquivados</button>
        </div>

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
            {search
              ? 'Nenhum cliente encontrado.'
              : status === 'active' ? 'Nenhum cliente ainda. Clique em "+ Adicionar cliente" para começar.' : 'Nenhum cliente arquivado.'}
          </div>
        ) : (
          <div className="cl-grid">
            {filtered.map(c => (
              <div key={c.id} className="cl-card" onClick={() => navigate(`/app/clients/${c.id}`)} style={status === 'archived' ? { opacity: .65 } : undefined}>
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
        <ClientFormModal
          client={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </>
  );
}
