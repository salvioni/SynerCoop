import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ClientDashboard from '../components/ClientDashboard.jsx';

/**
 * Desempenho — a evolução financeira da própria organização.
 *
 * É o mesmo painel que um escritório vê ao abrir um cliente (indicadores,
 * semáforo, gráficos de evolução), aplicado ao cliente-espelho da conta. Ficava
 * no "Início" das contas de entidade única, mas ali competia com o que a
 * organização quer ver primeiro — cooperados, análises, membros. Separado, cada
 * tela responde a uma pergunta: o Início diz "como está a organização", o
 * Desempenho diz "como estão os números ao longo do tempo".
 *
 * Só existe em conta de entidade única — é ela que tem self_client_id. Um
 * escritório chega no mesmo conteúdo abrindo cada cliente da carteira.
 */
export default function Desempenho() {
  const { user, isSingleEntity } = useAuth();

  if (!isSingleEntity) return <Navigate to="/app/dashboard" replace />;

  return (
    <ClientDashboard
      clientId={user.self_client_id}
      allowDelete={false}
      hideHeader
      topSlot={<PageHeader subtitle="Evolução financeira" title="Desempenho" />}
    />
  );
}
