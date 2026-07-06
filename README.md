# SynerCoop

Plataforma SaaS de análise financeira para escritórios contábeis que atendem cooperativas e empresas brasileiras. Permite upload de balanços (PDF/XLSX), geração automática de indicadores financeiros, narrativas por IA e relatórios profissionais.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Backend | Node.js 20+ · Express 4 · ES Modules |
| Banco | SQLite (dev) / PostgreSQL (prod) |
| Frontend | React 18 · Vite · React Router 6 |
| Autenticação | JWT (30d) · bcrypt (custo 12) |
| IA | Anthropic Claude / Google Gemini |
| Pagamentos | Stripe |
| E-mail | Nodemailer (Gmail App Password) |
| Logging | Pino (JSON em prod, pretty em dev) |

---

## Estrutura

```
synercoop/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express factory (middleware, rotas, error handler)
│   │   ├── server.js         # Entry point (initDb, seedDb, listen)
│   │   ├── routes/
│   │   │   ├── auth.js       # Registro, login, verificação, reset de senha, convites
│   │   │   ├── account.js    # Perfil do usuário, avatar, senha, dados do escritório
│   │   │   ├── clients.js    # CRUD de clientes + upload/análise de arquivos
│   │   │   ├── analyses.js   # Listagem de análises por tenant
│   │   │   ├── users.js      # Convite e gerenciamento de membros
│   │   │   ├── stats.js      # Dashboard stats
│   │   │   ├── admin.js      # Rotas administrativas (role=admin)
│   │   │   └── stripe.js     # Webhooks e checkout Stripe
│   │   ├── middleware/
│   │   │   └── auth.js       # authRequired · managerOnly · adminOnly
│   │   └── lib/
│   │       ├── db.js          # Abstração dual-driver SQLite/Postgres
│   │       ├── jwt.js         # signToken / verifyToken
│   │       ├── email.js       # Emails transacionais (verificação, reset, convite)
│   │       ├── audit.js       # Logs de auditoria (LGPD)
│   │       ├── calculator.js  # Cálculo de indicadores financeiros
│   │       ├── extractor.js   # Parser de PDF/XLSX para balanços
│   │       ├── llm.js         # Abstração de provider de IA
│   │       ├── logger.js      # Pino logger configurado
│   │       ├── plans.js       # Limites por plano (trial/basic/pro/enterprise)
│   │       ├── report.js      # Geração de relatório DOCX
│   │       ├── seed.js        # Dados demo (apenas em desenvolvimento)
│   │       └── validate.js    # Helpers de validação e HttpError
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/             # Dashboard, Clients, Analyses, Settings, etc.
    │   ├── components/        # UserAvatar, ConfirmModal, FilterSelect, etc.
    │   ├── lib/
    │   │   ├── api.js         # Cliente HTTP com interceptor de auth
    │   │   ├── auth.jsx       # AuthContext + useAuth hook
    │   │   └── plans.js       # Metadados de planos (frontend)
    │   └── styles/
    │       └── main.css       # Design system (variáveis CSS, componentes)
    └── package.json
```

---

## Setup local

### Pré-requisitos

- Node.js 20+
- npm 10+

### 1. Clone e instale dependências

```bash
git clone <repo>
cd synercoop

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure variáveis de ambiente

```bash
cp backend/.env.example backend/.env
# Edite backend/.env com suas credenciais
```

Variáveis obrigatórias em produção:

| Variável | Descrição |
|----------|-----------|
| `JWT_SECRET` | Mínimo 32 chars aleatórios |
| `DATABASE_URL` | URL Postgres (`postgres://...`) |
| `ADMIN_EMAIL` | E-mail do primeiro admin |
| `ADMIN_INITIAL_PASSWORD` | Senha do admin inicial |
| `FRONTEND_URL` | URL do frontend (CORS) |

Variáveis opcionais mas recomendadas:

| Variável | Descrição |
|----------|-----------|
| `EMAIL_USER` / `EMAIL_PASS` | Gmail App Password para e-mails transacionais |
| `ANTHROPIC_API_KEY` | Para narrativas via Claude |
| `OPENAI_API_KEY` | Fallback de IA |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Para cobrança |

> **Dev sem e-mail configurado:** os códigos de verificação e links de convite aparecem na resposta da API (apenas quando `NODE_ENV !== 'production'`).

### 3. Inicie em desenvolvimento

```bash
# Terminal 1 — Backend (porta 4000)
cd backend && npm run dev

# Terminal 2 — Frontend (porta 5173)
cd frontend && npm run dev
```

O banco SQLite é criado automaticamente em `backend/data.db`.

---

## Deploy em produção

### Requisitos mínimos
- PostgreSQL 14+
- Node.js 20+
- Servidor com HTTPS (Nginx + Let's Encrypt recomendado)

### Variáveis obrigatórias

```bash
NODE_ENV=production
JWT_SECRET=<string aleatória 64+ chars>
DATABASE_URL=postgres://user:password@host:5432/synercoop
ADMIN_EMAIL=admin@seudominio.com
ADMIN_INITIAL_PASSWORD=<senha forte>
FRONTEND_URL=https://app.seudominio.com
```

### Build do frontend

```bash
cd frontend && npm run build
# Servir /dist com Nginx ou CDN
```

### Checklist de segurança antes do deploy

- [ ] `JWT_SECRET` tem pelo menos 64 chars aleatórios
- [ ] `NODE_ENV=production` está definido
- [ ] Banco em Postgres com SSL
- [ ] HTTPS habilitado no servidor
- [ ] `FRONTEND_URL` aponta para o domínio correto (CORS)
- [ ] `ADMIN_INITIAL_PASSWORD` definido e seguro
- [ ] Trocar a senha do admin após primeiro login
- [ ] E-mail configurado (`EMAIL_USER`/`EMAIL_PASS`) para verificação de conta

---

## Segurança

### Autenticação e autorização
- JWT assinado com HS256, expira em 30 dias
- Senhas com bcrypt, custo 12
- Bloqueio de conta após 5 tentativas de login falhas (15 min)
- Rate limiting por rota: login (5/min), registro (3/min), reset (3/min)
- Comparação de tokens com `crypto.timingSafeEqual`

### Headers e CORS
- `helmet` ativo em todas as rotas
- CORS restrito às origens configuradas em `FRONTEND_URL`
- Body JSON limitado a 50 MB (necessário para base64 de imagens)

### Validação
- Inputs validados no backend em todas as rotas autenticadas
- Imagens validadas por tipo MIME (avatar) e tamanho (logo ≤ 2 MB)
- Cores de avatar/logo validadas como hex `#RRGGBB`
- Upload de arquivos via multer: somente PDF, XLSX, XLS (≤ 50 MB)

### Auditoria
- Log estruturado (pino) em todas as requisições
- Audit trail em banco: criação/edição de clientes, análises, usuários

---

## LGPD

### Dados pessoais coletados
- **Usuários:** nome, e-mail, foto (opcional), cor de avatar
- **Clientes:** nome da empresa, CNPJ, e-mail e telefone de contato (opcionais), notas
- **Análises:** dados financeiros históricos da empresa cliente

### Medidas implementadas
- Audit logs com identificação do ator, ação e timestamp
- Soft-delete para clientes (flag `active = 0`)
- Exclusão real de usuários via `DELETE /users/:id`
- Dados segmentados por tenant (isolamento total entre escritórios)
- Todos os endpoints autenticados verificam `tenant_id` antes de qualquer acesso a dados

### Pendências para compliance completo
- Endpoint de exportação de dados do titular (Art. 18 LGPD)
- Política de retenção e anonimização de audit logs
- Termo de consentimento no cadastro
- DPA (Data Processing Agreement) com subprocessadores (Anthropic, Google, Stripe)

---

## API — Principais endpoints

Todos os endpoints (exceto `/auth/*`) requerem `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | Cria conta + tenant |
| `POST` | `/auth/login` | Login, retorna JWT |
| `POST` | `/auth/verify-email` | Verifica código de 6 dígitos |
| `POST` | `/auth/forgot-password` | Envia link de reset |
| `POST` | `/auth/reset-password` | Redefine senha com token |
| `GET` | `/auth/me` | Dados do usuário autenticado |
| `GET` | `/clients` | Lista clientes do tenant (`?active=1`) |
| `POST` | `/clients` | Cria cliente |
| `GET` | `/clients/:id` | Detalhe + análises do cliente |
| `PUT` | `/clients/:id` | Atualiza cliente |
| `DELETE` | `/clients/:id` | Soft-delete do cliente |
| `POST` | `/clients/:id/extract` | Extrai dados de PDF/XLSX (preview) |
| `POST` | `/clients/:id/analyses` | Cria análise (upload ou JSON) |
| `GET` | `/analyses` | Lista análises do tenant |
| `GET` | `/stats` | Stats do dashboard |
| `GET` | `/account` | Dados da conta do escritório |
| `PATCH` | `/account/profile` | Atualiza nome do usuário |
| `POST` | `/account/avatar` | Upload de foto de perfil |
| `POST` | `/account/change-password` | Troca de senha |
| `GET` | `/users` | Lista membros do tenant |
| `POST` | `/users/invite` | Convida membro |
| `DELETE` | `/users/:id` | Remove membro |

---

## Planos

| Plano | Análises/mês | Observação |
|-------|-------------|------------|
| Trial | 3 | Padrão ao criar conta |
| Basic | 10 | — |
| Pro | 50 | — |
| Enterprise | Ilimitado | — |

Limites verificados server-side em `POST /clients/:id/analyses`.

---

## Testes

```bash
cd backend && npm test
```

Usa Vitest. Testes de integração em `src/**/*.test.js`.

---

## Licença

Proprietário — todos os direitos reservados.
