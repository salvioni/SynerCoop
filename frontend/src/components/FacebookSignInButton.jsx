import { useEffect, useRef, useState } from 'react';
import facebookLogo from '../assets/facebook-logo.png';

const APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;
const SDK_URL = 'https://connect.facebook.net/pt_BR/sdk.js';

let sdkPromise = null;
function loadFacebookSdk() {
  if (window.FB) return Promise.resolve(window.FB);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.fbAsyncInit = function () {
        window.FB.init({ appId: APP_ID, cookie: false, xfbml: false, version: 'v19.0' });
        resolve(window.FB);
      };
      const existing = document.getElementById('facebook-jssdk');
      if (existing) return;
      const js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.src = SDK_URL;
      js.onerror = reject;
      document.body.appendChild(js);
    });
  }
  return sdkPromise;
}

// Botão de "Entrar com Facebook" via Facebook Login (JS SDK). Repassa o
// accessToken recebido para o backend validar contra a Graph API.
// Não renderiza nada se VITE_FACEBOOK_APP_ID não estiver configurado.
export default function FacebookSignInButton({ onAccessToken, label = 'Entrar com Facebook' }) {
  const cbRef = useRef(onAccessToken);
  cbRef.current = onAccessToken;
  const [busy, setBusy] = useState(false);
  const [unavailable] = useState(!APP_ID);

  useEffect(() => {
    if (!APP_ID) return;
    loadFacebookSdk().catch(() => {});
  }, []);

  async function handleClick() {
    setBusy(true);
    try {
      const FB = await loadFacebookSdk();
      FB.login((response) => {
        setBusy(false);
        const token = response?.authResponse?.accessToken;
        if (token) cbRef.current(token);
      }, { scope: 'email' });
    } catch {
      setBusy(false);
    }
  }

  if (unavailable) return null;
  return (
    <button type="button" onClick={handleClick} disabled={busy} className="btn btn-social">
      <img src={facebookLogo} alt="" width={18} height={18} />
      {busy ? 'Conectando…' : label}
    </button>
  );
}
