import { useRef, useState } from 'react';
import googleLogo from '../assets/google-logo.svg';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SDK_URL = 'https://accounts.google.com/gsi/client';

let sdkPromise = null;
function loadGoogleSdk() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById('google-gsi');
      if (existing) { existing.addEventListener('load', () => resolve(window.google)); return; }
      const js = document.createElement('script');
      js.id = 'google-gsi';
      js.src = SDK_URL;
      js.async = true;
      js.onload = () => resolve(window.google);
      js.onerror = reject;
      document.body.appendChild(js);
    });
  }
  return sdkPromise;
}

// Botão de "Entrar com Google" 100% nosso (mesma classe .btn dos outros
// botões — o widget renderizado pelo Google vem num iframe com fonte/tamanho
// fixos que não conseguimos estilizar, por isso disparamos o fluxo OAuth2 de
// token via google.accounts.oauth2 a partir de um botão customizado.
// Repassa o access token recebido para o backend validar contra a API do Google.
// Não renderiza nada se VITE_GOOGLE_CLIENT_ID não estiver configurado.
export default function GoogleSignInButton({ onAccessToken, label = 'Entrar com Google' }) {
  const cbRef = useRef(onAccessToken);
  cbRef.current = onAccessToken;
  const clientRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [unavailable] = useState(!CLIENT_ID);

  async function handleClick() {
    setBusy(true);
    try {
      const google = await loadGoogleSdk();
      if (!clientRef.current) {
        clientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'openid email profile',
          callback: (resp) => {
            setBusy(false);
            if (resp?.access_token) cbRef.current(resp.access_token);
          },
          error_callback: () => setBusy(false),
        });
      }
      clientRef.current.requestAccessToken();
    } catch {
      setBusy(false);
    }
  }

  if (unavailable) return null;
  return (
    <button type="button" onClick={handleClick} disabled={busy} className="btn btn-social">
      <img src={googleLogo} alt="" width={18} height={18} />
      {busy ? 'Conectando…' : label}
    </button>
  );
}
