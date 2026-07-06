import { useParams } from 'react-router-dom';
import ClientDashboard from '../components/ClientDashboard.jsx';

export default function ClientView() {
  const { id } = useParams();
  return <ClientDashboard clientId={id} backHref="/app/clients" allowDelete />;
}
