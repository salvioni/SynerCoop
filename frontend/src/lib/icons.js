// Ícones Tabler usados no FinAnalyze (v3.24.0)

// Componentes de ícone SVG inline para uso nos componentes React
export function IconUpload({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 9l5 -5l5 5" />
      <path d="M12 4l0 12" />
    </svg>
  );
}

export function IconFileAnalytics({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
      <path d="M9 17l0 -5" />
      <path d="M12 17l0 -1" />
      <path d="M15 17l0 -3" />
    </svg>
  );
}

export function IconBuilding({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 21l18 0" />
      <path d="M9 8l1 0" />
      <path d="M9 12l1 0" />
      <path d="M9 16l1 0" />
      <path d="M14 8l1 0" />
      <path d="M14 12l1 0" />
      <path d="M14 16l1 0" />
      <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16" />
    </svg>
  );
}

export function IconChartBar({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 12m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
      <path d="M9 8m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
      <path d="M15 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
      <path d="M4 20l14 0" />
    </svg>
  );
}

export function IconDownload({ size = 18, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    </svg>
  );
}

// Lista de ícones Tabler para seletores de ícone
export const ICON_LIST = [
  'ti-building-factory', 'ti-building-factory-2', 'ti-building-warehouse',
  'ti-building', 'ti-building-bank', 'ti-building-community',
  'ti-chart-bar', 'ti-chart-line', 'ti-chart-dots', 'ti-chart-pie',
  'ti-chart-area', 'ti-trending-up', 'ti-trending-down',
  'ti-file', 'ti-file-analytics', 'ti-file-check', 'ti-file-description',
  'ti-report', 'ti-report-analytics', 'ti-notes', 'ti-writing',
  'ti-coin', 'ti-coins', 'ti-cash', 'ti-wallet', 'ti-receipt',
  'ti-calculator', 'ti-percentage',
  'ti-users', 'ti-user-check', 'ti-user-circle', 'ti-user-star',
  'ti-shield', 'ti-shield-check', 'ti-certificate', 'ti-license',
  'ti-star', 'ti-bookmark', 'ti-tag', 'ti-package',
  'ti-settings', 'ti-settings-2', 'ti-dashboard', 'ti-gauge',
  'ti-clock', 'ti-calendar', 'ti-history',
  'ti-map-pin', 'ti-server', 'ti-category',
  'ti-leaf', 'ti-plant', 'ti-recycle',
];

export const EMOJI_LIST = [
  { e: '🏢', t: 'empresa escritório prédio comercial' },
  { e: '🏭', t: 'fábrica indústria cooperativa produção' },
  { e: '🤝', t: 'cooperativa parceria contrato acordo' },
  { e: '📊', t: 'relatório estatística gráfico indicador' },
  { e: '📈', t: 'relatório crescimento estatística indicador' },
  { e: '📉', t: 'queda indicador estatística análise' },
  { e: '💰', t: 'dinheiro finanças capital lucro' },
  { e: '💳', t: 'pagamento cartão financeiro' },
  { e: '🏦', t: 'banco financeiro crédito' },
  { e: '📋', t: 'checklist formulário lista verificação' },
  { e: '📝', t: 'formulário registro anotação documento' },
  { e: '🧮', t: 'calculadora contabilidade cálculo' },
  { e: '🌾', t: 'cooperativa agrícola rural grão' },
  { e: '🌱', t: 'crescimento sustentável agronegócio' },
  { e: '🐄', t: 'cooperativa pecuária bovino' },
  { e: '🍊', t: 'cooperativa citricultura fruta' },
  { e: '⭐', t: 'qualidade destaque excelência' },
  { e: '🎯', t: 'meta objetivo controle qualidade' },
];
