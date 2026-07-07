export const CLIENT_TYPES = ['cooperativa', 'empresa', 'associacao', 'outro'];

export const TENANT_TYPES = [
  { value: 'cooperativa', label: 'Cooperativa' },
  { value: 'escritorio', label: 'Escritório' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'associacao', label: 'Associação' },
  { value: 'outro', label: 'Outro' },
];

// Ramos de atuação (baseado na classificação da OCB para cooperativas,
// aplicável de forma geral a qualquer tipo de negócio cadastrado).
export const BUSINESS_SECTORS = [
  { value: 'agropecuario', label: 'Agropecuário' },
  { value: 'agricultura', label: 'Agricultura' },
  { value: 'consumo', label: 'Consumo' },
  { value: 'credito', label: 'Crédito' },
  { value: 'educacional', label: 'Educacional' },
  { value: 'especial', label: 'Especial' },
  { value: 'habitacional', label: 'Habitacional' },
  { value: 'hospitalar', label: 'Hospitalar' },
  { value: 'infraestrutura', label: 'Infraestrutura' },
  { value: 'mineral', label: 'Mineral' },
  { value: 'producao', label: 'Produção' },
  { value: 'saude', label: 'Saúde' },
  { value: 'trabalho', label: 'Trabalho' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'turismo_lazer', label: 'Turismo e Lazer' },
  { value: 'outro', label: 'Outro' },
];

export const MIN_PASSWORD_LENGTH = 8;

// Credenciais de demonstração (seedadas em backend/src/lib/seed.js, fora de
// produção) — fonte única usada pelos botões "Entrar como demo" no Login e na
// Landing Page.
export const DEMO_ACCOUNTS = {
  admin: { label: 'Admin', icon: 'ti-shield', email: 'admin@demo.com', password: 'demo123' },
  escritorio: { label: 'Escritório', icon: 'ti-briefcase', email: 'escritorio@demo.com', password: 'demo123' },
  cooperativa: { label: 'Cooperativa', icon: 'ti-building-community', email: 'cooperativa@demo.com', password: 'demo123' },
  empresa: { label: 'Empresa', icon: 'ti-building', email: 'empresa@demo.com', password: 'demo123' },
  associacao: { label: 'Associação', icon: 'ti-users', email: 'associacao@demo.com', password: 'demo123' },
  outro: { label: 'Outro', icon: 'ti-dots', email: 'outro@demo.com', password: 'demo123' },
};
