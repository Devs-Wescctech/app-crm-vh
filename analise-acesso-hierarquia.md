# Análise Completa: Sistema de Gerenciamento de Acessos e Hierarquia

---

## 1. ESTRUTURA DE ROLES / PERFIS DE USUÁRIO

### Tipos de usuário existentes:

| Role/Tipo | Nível | Descrição |
|:---|:---|:---|
| `admin` | Mais alto | Acesso irrestrito a todas as funcionalidades |
| `supervisor` / `sales_supervisor` | Intermediário | Acesso à equipe, relatórios, visão de time |
| `sales` | Operacional | Acesso apenas a leads próprios e dashboard pessoal |
| `pre_sales` | Operacional | Pré-venda |
| `post_sales` | Operacional | Pós-venda |
| `support` | Operacional | Suporte |
| `collection` | Operacional | Cobrança |

### Como estão definidos:

- **Banco de dados**: Tabela `agent_types` com colunas `key`, `label`, `modules` (TEXT[]) e `allowed_submenus` (TEXT[]).
- **Backend hardcoded**: Arquivo `backend/src/config/permissions.js` contém o objeto `ROLE_PERMISSIONS` com mapeamentos detalhados por tipo.
- **Frontend hardcoded**: Arquivo `src/components/utils/permissions.jsx` contém `AGENT_PERMISSIONS` — espelho parcial do backend focado em `sales_pj` e `config`.

### Hierarquia:

```
admin (acesso total)
  └── supervisor (visão de equipe + relatórios)
       └── sales / pre_sales / post_sales / support / collection (visão individual)
```

### Arquivos onde roles são declarados:

| Arquivo | Responsabilidade |
|:---|:---|
| `backend/src/config/permissions.js` | Definição autoritativa dos roles e permissões |
| `backend/src/config/schema.sql` | Tabelas `users`, `agents`, `agent_types` |
| `src/components/utils/permissions.jsx` | Espelho frontend para UI |

---

## 2. BANCO DE DADOS

### Tabelas relacionadas ao controle de acesso:

#### `users`
```sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```
- Campo `role` genérico (default: `'user'`), mas na prática o role real vem da tabela `agents`.

#### `agents`
```sql
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(20),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    phone VARCHAR(30),
    agent_type VARCHAR(50) DEFAULT 'sales',
    team_id UUID REFERENCES teams(id),
    status VARCHAR(20) DEFAULT 'active',
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```
- `agent_type`: Define o role principal (admin, supervisor, sales, etc.)
- `team_id`: Associação ao time (usado para filtros de visibilidade)
- `permissions`: JSONB para overrides granulares individuais (ex: `can_view_all_leads`)

#### `agent_types`
```sql
CREATE TABLE IF NOT EXISTS agent_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    modules TEXT[] DEFAULT '{}',
    allowed_submenus TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
```
- Define templates de permissões por tipo: quais módulos e submenus cada tipo pode acessar.

#### `teams`
```sql
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Relacionamentos:
- `agents.team_id` → `teams.id` (N:1)
- `agents.agent_type` → `agent_types.key` (referência lógica, sem FK explícita)
- `users.email` = `agents.email` (vinculação por email, sem FK explícita)
- **Não existe** tabela separada de permissões ou many-to-many entre usuários e permissões.

---

## 3. AUTENTICAÇÃO

### Mecanismo: JWT (JSON Web Tokens)

**Biblioteca**: `jsonwebtoken` + `bcryptjs`

### Geração de tokens (`backend/src/middleware/auth.js`):

```javascript
function generateTokens(user) {
    const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    const refreshToken = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
}
```

- **Access Token**: Expira em **24 horas**. Contém `id`, `email`, `role`.
- **Refresh Token**: Expira em **7 dias**. Contém `id`, `email`.
- **Role derivado de**: campo `agent_type` do agente no banco.

### Validação (`backend/src/middleware/auth.js`):

```javascript
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    // Extrai Bearer token, verifica com jwt.verify, 
    // anexa payload em req.user
}
```

### Refresh Token (`backend/src/routes/auth.js`):

- Endpoint: `POST /api/auth/refresh`
- Recebe o refresh token, verifica se o usuário ainda existe, gera novos tokens.

### Frontend — Interceptor (`src/api/tokenInterceptor.js`):

- Sobrescreve `window.fetch` para injetar `Authorization: Bearer <token>` automaticamente.
- Em caso de `401`, tenta refresh automático e re-executa a request original.
- Tokens armazenados em `localStorage` como `accessToken` e `refreshToken`.

---

## 4. AUTORIZAÇÃO E CONTROLE DE ACESSO

### Backend — Middleware de Autorização:

| Middleware | Arquivo | Função |
|:---|:---|:---|
| `authMiddleware` | `backend/src/middleware/auth.js` | Verifica JWT válido |
| `loadAgentMiddleware` | `backend/src/middleware/permissions.js` | Carrega `req.agent` e `req.permissions` |
| `requireRole(...roles)` | `backend/src/middleware/permissions.js` | Restringe a roles específicos |
| `applyVisibilityFilter(entity)` | `backend/src/middleware/permissions.js` | Injeta filtro WHERE baseado no role |

### Funções de Visibilidade (`backend/src/config/permissions.js`):

```javascript
getVisibilityFilter(agentType, userId, teamId, entity)
// Retorna: 'all' | 'team' | 'own'
```

- **Admin**: Vê tudo (`all`)
- **Supervisor**: Vê o time (`team`) — filtra por `team_id`
- **Sales/outros**: Vê só os seus (`own`) — filtra por `agent_id`

### Modelo de controle: **Híbrido RBAC + ABAC**

- **RBAC**: Roles base (admin, supervisor, sales) determinam acesso a módulos e visibilidade.
- **ABAC**: Coluna `permissions` JSONB no agente permite overrides granulares (ex: `can_view_all_leads: true` em um agente que normalmente só veria os próprios).

### Verificação em ambos os lados:

- **Backend**: `authMiddleware` + `requireRole` + `applyVisibilityFilter` nas rotas.
- **Frontend**: `filterMenuItems` no menu + checks com `canViewAll`, `canManageAgents` em cada página.

---

## 5. HIERARQUIA E HERANÇA DE PERMISSÕES

### Herança de roles:

- **Não há herança formal** entre roles. Cada role tem seu próprio conjunto de permissões definido em `ROLE_PERMISSIONS`.
- Na prática, `admin` tem todas as permissões. Supervisor tem um subconjunto. Sales tem ainda menos.

### Múltiplos roles:

- **Não**. Cada agente tem um único `agent_type`. Não existe sistema de múltiplos roles.

### Super Admin:

- `admin` funciona como super admin com acesso irrestrito.
- Adicionalmente, `user.role === 'admin'` (campo da tabela `users`) também concede acesso total no frontend.

### Resolução de conflitos:

- Override individual (JSONB `permissions`) **sobrepõe** a permissão do role base.
- Verificação: `agent.permissions?.can_view_all_leads === true` é checado antes do fallback para o role.

---

## 6. FRONTEND

### Como o frontend sabe o role:

1. Chamada `base44.auth.me()` retorna o objeto `user` com `role` e `agent` (incluindo `agent_type`, `permissions`).
2. Armazenado via React Query (`queryKey: ['currentUser']`).

### Renderização condicional:

```javascript
// Layout.jsx
const isAdminUser = user?.role === 'admin' || currentAgentType === 'admin';
const isSupervisorUser = currentAgentType?.includes('supervisor');
const isCommercialUser = !isAdminUser && !isSupervisorUser && !!currentAgent;

// Menu filtrado com useMemo baseado no tipo de usuário
const filteredMenuModules = useMemo(() => {
    // Admins: veem tudo
    // Commercial: dashboard substituído por MyDashboardPJ
    // ...
}, [user, currentAgent, isCommercialUser]);
```

### Guard de rota:

- **Não existe um componente PrivateRoute dedicado.**
- A proteção é feita no `Layout.jsx` (linhas 612-620):
  ```javascript
  if (!isPublicPage && !isLoadingUser && (userError || !token)) {
      navigate('/login');
  }
  ```
- `HomeRedirect` em `index.jsx` redireciona comerciais para `MyDashboardPJ`.

### Onde estão implementados:

| Lógica | Arquivo |
|:---|:---|
| Guard de autenticação | `src/pages/Layout.jsx` (redirect para /login) |
| Redirect por role | `src/pages/index.jsx` (HomeRedirect) |
| Filtro de menu | `src/pages/Layout.jsx` (filteredMenuModules) |
| Utilitários de permissão | `src/components/utils/permissions.jsx` |

---

## 7. FLUXO COMPLETO DE ACESSO

### 1. Login
```
Usuário digita email/senha → Login.jsx
  → POST /api/auth/login
  → Backend busca agente por email, verifica bcrypt
  → Gera accessToken (24h) + refreshToken (7d)
  → Frontend salva em localStorage
```

### 2. Token gerado contém:
```json
{
  "id": "uuid-do-usuario",
  "email": "user@email.com",
  "role": "admin|user",
  "iat": 1234567890,
  "exp": 1234654290
}
```

### 3. Acesso a rota protegida:
```
Frontend faz fetch → tokenInterceptor injeta Authorization header
  → Backend authMiddleware verifica JWT
  → loadAgentMiddleware carrega req.agent + req.permissions
  → requireRole verifica se agent_type está na lista permitida
  → applyVisibilityFilter limita dados por all/team/own
  → Resposta enviada
```

### 4. Acesso negado:
```
Backend retorna 401 (não autenticado) ou 403 (sem permissão)
  → Se 401: tokenInterceptor tenta refresh automático
  → Se refresh falha: redireciona para /login
  → Se 403: frontend mostra erro (toast)
```

---

## 8. PONTOS DE ATENÇÃO E INCONSISTÊNCIAS

### Rotas que deveriam ser protegidas mas não estão:

1. **Rotas do frontend**: Todas as rotas em `index.jsx` são acessíveis diretamente via URL. Não há um `PrivateRoute` wrapper — a proteção depende do redirect no `Layout.jsx`, mas o componente da página pode renderizar brevemente antes do redirect.

2. **SalesPJDashboard**: Um agente comercial pode acessar `/SalesPJDashboard` diretamente pela URL, mesmo que não apareça no menu. Falta um guard no nível da rota.

### Lógica duplicada/inconsistente:

1. **Dois sistemas de roles**: A tabela `users.role` e `agents.agent_type` coexistem. O login usa a tabela `agents` como fonte primária, mas o `users.role` default `'user'` pode criar confusão.

2. **Permissões espelhadas**: `ROLE_PERMISSIONS` no backend e `AGENT_PERMISSIONS` no frontend são definidos separadamente e podem ficar dessincronizados.

3. **Detecção de role no frontend**: Vários padrões coexistem:
   - `user?.role === 'admin'`
   - `currentAgentType === 'admin'`
   - `agentType?.includes('supervisor')`
   - `!isAdmin && !isSupervisor && !!currentAgent`
   
   Não há uma função centralizada como `isAdmin(user)`.

### Permissões hardcoded:

1. `backend/src/config/permissions.js` — `ROLE_PERMISSIONS` é hardcoded. Mudanças nos módulos de um role exigem deploy.
2. A tabela `agent_types` tem `modules` e `allowed_submenus` dinâmicos, mas o backend também consulta `ROLE_PERMISSIONS` hardcoded — os dois podem conflitar.

### Sem TODOs/FIXMEs encontrados.

---

## 9. LISTA DE ARQUIVOS RELEVANTES

| Arquivo | Responsabilidade | Funções Principais |
|:---|:---|:---|
| `backend/src/middleware/auth.js` | Autenticação JWT | `generateTokens()`, `authMiddleware()`, `verifyToken()`, `optionalAuth()` |
| `backend/src/middleware/permissions.js` | Autorização backend | `loadAgentMiddleware()`, `requireRole()`, `applyVisibilityFilter()`, `buildVisibilityQuery()` |
| `backend/src/config/permissions.js` | Definição de roles/permissões | `ROLE_PERMISSIONS`, `getPermissions()`, `getVisibilityFilter()` |
| `backend/src/config/schema.sql` | Schema do banco | Tabelas `users`, `agents`, `agent_types`, `teams` |
| `backend/src/routes/auth.js` | Rotas de login/refresh | `POST /login`, `POST /refresh`, `GET /me` |
| `src/api/base44Client.js` | Client API frontend | `auth.login()`, `auth.me()`, `auth.logout()` |
| `src/api/tokenInterceptor.js` | Interceptor de tokens | Auto-inject auth header, auto-refresh em 401 |
| `src/components/utils/permissions.jsx` | Utilitários de permissão frontend | `filterMenuItems()`, `canViewAll()`, `canViewTeam()`, `canManageAgents()`, `canAccessModule()` |
| `src/pages/Layout.jsx` | Layout + guards de UI | Menu filtering, redirect para login, detecção de role |
| `src/pages/index.jsx` | Rotas + redirect por role | `HomeRedirect`, definição de rotas |
| `src/pages/Login.jsx` | Tela de login | Captura credenciais, chama auth.login() |

---

## 10. RESUMO EXECUTIVO

### Como funciona hoje:

O sistema usa **JWT** para autenticação e um modelo **híbrido RBAC+ABAC** para autorização. Existem 3 níveis principais: admin (acesso total), supervisor (visão de equipe) e agentes operacionais (visão individual). As permissões base vêm do `agent_type` do agente, com possibilidade de overrides via coluna JSONB `permissions`. No frontend, o menu é filtrado dinamicamente e algumas páginas verificam permissões antes de renderizar conteúdo. No backend, middlewares protegem rotas e filtram dados por visibilidade.

### Pontos fortes:

1. **Refresh token automático** — experiência de usuário sem interrupções
2. **Filtro de visibilidade no backend** — dados são filtrados no servidor, não apenas na UI
3. **ABAC via JSONB** — flexibilidade para overrides individuais sem criar novos roles
4. **Separação de concerns** — middlewares modulares no backend

### Principais fragilidades:

1. **Sem guard de rota dedicado no frontend** — Qualquer rota pode ser acessada via URL direta
2. **Permissões duplicadas** — Backend (ROLE_PERMISSIONS) e frontend (AGENT_PERMISSIONS) mantidos separadamente
3. **Dois sistemas de identidade** — Tabelas `users` e `agents` coexistem sem FK, vinculadas apenas por email
4. **Detecção de role inconsistente** — Múltiplos padrões de verificação espalhados pelo código
5. **Sem audit log** — Não há registro de ações sensíveis (alterações de permissão, login, etc.)

### O que melhorar para escalar:

1. **Componente `ProtectedRoute`** que verifica role antes de renderizar a página
2. **Endpoint `/api/permissions`** que retorne permissões computadas do usuário (elimina duplicação frontend)
3. **Unificar** tabelas `users` e `agents` ou criar FK explícita
4. **Função centralizada** `isAdmin(user)`, `isSupervisor(user)` usada em todo o frontend
5. **Audit log** para ações críticas
6. **Mover ROLE_PERMISSIONS** para o banco (tabela `agent_types` já existe, mas não é usada como fonte única)
