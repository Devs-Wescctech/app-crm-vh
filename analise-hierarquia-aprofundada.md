# Análise Aprofundada: Nova Hierarquia de Acesso
## Arquiteto Sênior — Documento de Planejamento

---

## 1. COMPARAÇÃO FINAL: OPÇÃO A vs OPÇÃO B

### Relembrando:

**Opção A** — Adicionar `supervisor_id` e `coordinator_id` direto na tabela `agents`:
```
agents:
  + supervisor_id UUID REFERENCES agents(id)
  + coordinator_id UUID REFERENCES agents(id)
```

**Opção B** — Enriquecer `teams` com `supervisor_id` e `coordinator_id`, mantendo `agents.team_id`:
```
teams:
  + supervisor_id UUID REFERENCES agents(id)
  + coordinator_id UUID REFERENCES agents(id)
agents:
  team_id (já existe, sem mudanças)
```

### Análise com base no estado real do sistema:

#### Onde `team_id` é usado hoje (mapeamento completo):

| Camada | Arquivos que filtram por team_id | Tipo de uso |
|:---|:---|:---|
| **Schema** | `agents`, `queues`, `tickets`, `leads`, `lead_automation_teams`, `whatsapp_logs`, `whatsapp_conversions` | FK/coluna |
| **Backend middleware** | `permissions.js` → `buildVisibilityQuery` → `WHERE team_id = $1` | Filtro SQL |
| **Backend rotas** | `entities.js` (agents CRUD, lead automations), `automationService.js`, `whatsappQueueService.js` | Joins/filtros |
| **Frontend dashboards** | `SalesPJDashboard.jsx`, `SalesPJAgentsDashboard.jsx`, `SalesPJReports.jsx`, `SalesPJWonReport.jsx`, `SalesPJLostReport.jsx` | Filtro de agentes por `teamId` |
| **Frontend operacional** | `LeadsPJKanban.jsx`, `LeadPJDetail.jsx`, `SalesAgenda.jsx`, `SalesTasks.jsx` | Filtro de agentes por `teamId` |
| **Frontend pessoal** | `MyDashboardPJ.jsx` | Filtra só por `agentId` (sem impacto) |

**Total: 7 tabelas + 2 arquivos backend + 9 arquivos frontend = ~18 pontos de contato.**

#### O padrão dominante no frontend:

Em **todos** os dashboards e páginas, o supervisor vê dados da equipe usando esta lógica:

```javascript
const teamAgents = allAgents.filter(a => a.teamId === currentAgent.teamId);
const teamAgentIds = teamAgents.map(a => a.id);
// Filtra leads/atividades onde agent_id está em teamAgentIds
```

Ou seja: **o vínculo supervisor→vendedores é indireto, via `teamId` compartilhado**. O supervisor não "possui" vendedores diretamente — ele simplesmente está no mesmo time.

### Veredicto: **MANTENHO A RECOMENDAÇÃO PELA OPÇÃO B, COM UM AJUSTE.**

#### Por que NÃO a Opção A:

1. **Quebraria todo o padrão de filtragem existente.** Hoje, 9 arquivos frontend calculam `teamAgentIds` via `agent.teamId`. Se usarmos `supervisor_id`, CADA UM desses arquivos precisaria de uma lógica diferente: "buscar agentes onde `supervisor_id === currentAgent.id`". São 9 refatorações de lógica de filtro, cada uma com risco de regressão.

2. **`buildVisibilityQuery` no backend** faz `WHERE team_id = $1`. Com Opção A, seria `WHERE supervisor_id = $1` OU `WHERE agent_id IN (SELECT id FROM agents WHERE supervisor_id = $1)`. Subquery em toda rota, impacto em performance.

3. **6 tabelas além de `agents`** têm `team_id` (queues, tickets, leads, whatsapp_logs, etc.). Com Opção A, esses `team_id` perdem sentido semântico ou precisam de migração.

4. **O formulário de times já tem campo `supervisorEmail`** — o time JÁ conhece seu supervisor hoje. O vínculo já existe conceitualmente.

#### Por que SIM a Opção B (com ajuste):

1. **Zero mudanças nos 9 arquivos frontend de filtragem.** O padrão `teamAgents.filter(a => a.teamId === currentAgent.teamId)` continua funcionando exatamente igual.

2. **Zero mudanças no middleware `buildVisibilityQuery`.** `WHERE team_id = $1` continua válido.

3. **A tabela `teams` já tem `supervisor_email`** — basta evoluir para `supervisor_id` (UUID) para ter a referência correta.

4. **Adicionar `coordinator_id` em `teams`** cria a cadeia: Coordenador → Time(s) → Supervisor + Vendedores.

#### O ajuste na Opção B:

O campo atual `supervisor_email` na tabela `teams` deveria ser `supervisor_id` (UUID). Isso é uma evolução natural, não uma quebra. Na migração, basta: `UPDATE teams SET supervisor_id = (SELECT id FROM agents WHERE email = supervisor_email)`.

### Como fica a cadeia hierárquica com Opção B:

```
COORDENADOR (agent_type = 'coordinator')
  │
  ├── TIME "Equipe Alfa" (teams.coordinator_id = coordenador.id)
  │     ├── supervisor_id = supervisor_alfa.id
  │     ├── Vendedor 1 (agents.team_id = equipe_alfa.id)
  │     ├── Vendedor 2 (agents.team_id = equipe_alfa.id)
  │     └── Vendedor 3 (agents.team_id = equipe_alfa.id)
  │
  └── TIME "Equipe Beta" (teams.coordinator_id = coordenador.id)
        ├── supervisor_id = supervisor_beta.id
        ├── Vendedor 4 (agents.team_id = equipe_beta.id)
        └── Vendedor 5 (agents.team_id = equipe_beta.id)

ADMINISTRADOR → vê tudo (sem filtro)
COORDENADOR → vê tudo (sem filtro, igual admin em dados)
SUPERVISOR ALFA → vê leads/atividades dos agentes com team_id = equipe_alfa.id
VENDEDOR 1 → vê apenas seus próprios leads/atividades
```

**O vínculo "vendedor → supervisor" é implícito**: vendedor pertence a um time, e o time tem um supervisor. Para o frontend/backend, nada muda — o filtro continua sendo por `team_id`.

**O vínculo "supervisor → coordenador" é explícito**: o time tem um `coordinator_id`. Para a visibilidade, não importa (coordenador vê tudo), mas para governança/organização, o coordenador sabe quais times estão sob ele.

---

## 2. COMO CHEGAR NA HIERARQUIA DESEJADA

### 2.1 Representação técnica de cada role:

| Role | `agent_type` key | Já existe? | Visibilidade | Permissões especiais |
|:---|:---|:---|:---|:---|
| **Administrador** | `admin` | Sim | `all` | Tudo |
| **Coordenador** | `coordinator` | **Novo** | `all` | Tudo em dados; gestão de supervisores/vendedores; sem acesso a configurações de sistema (recomendado) |
| **Supervisor** | `supervisor` / `sales_supervisor` | Sim (unificar para `supervisor`) | `team` | Vê equipe; gerencia vendedores do time; acessa relatórios do time |
| **Vendedor** | `sales` | Sim (reaproveitar) | `own` | Vê só o próprio; MyDashboardPJ; Kanban filtrado |

**Recomendação sobre `sales` vs novo `seller`**: Reaproveitar `sales` como vendedor. Criar um tipo novo só adiciona complexidade sem ganho. O `sales` já tem o comportamento correto (visão individual). Se no futuro precisar distinguir `pre_sales`, `post_sales`, etc., eles compartilham a mesma visibilidade `own`.

### 2.2 Mudanças necessárias em cada camada:

#### `agent_types` (tabela no banco):

- INSERT novo registro: `key = 'coordinator'`, `label = 'Coordenador'`, `modules = '{dashboard, sales_pj, config}'`, `allowed_submenus` com acesso amplo.
- Considerar unificar `supervisor` e `sales_supervisor` em um único `supervisor`.

#### `ROLE_PERMISSIONS` (backend/src/config/permissions.js):

Adicionar entry para `COORDINATOR`:
- `modules`: iguais ao admin
- `canViewAllTickets`: true
- `canViewAllLeads`: true
- `canManageAgents`: **decisão de negócio** (recomendo true para supervisores/vendedores, false para outros coordenadores)
- `canManageSettings`: **recomendo false** (diferencial em relação ao admin)
- `canAccessReports`: true

#### `AGENT_PERMISSIONS` (frontend/src/components/utils/permissions.jsx):

Adicionar entry para `coordinator`:
- Acesso a todos os módulos de vendas
- `canAccessReports`: true
- `canManageAgents`: segundo a decisão de negócio
- NÃO precisa de acesso ao módulo `config` de sistema (se quiser diferenciar do admin)

### 2.3 Regra de visibilidade resumida:

```
admin        → type: 'all'           → sem filtro SQL
coordinator  → type: 'all'           → sem filtro SQL
supervisor   → type: 'team'          → WHERE team_id = supervisor.team_id
vendedor     → type: 'own'           → WHERE agent_id = vendedor.id
```

**Isso conversa perfeitamente com o `team_id` atual** porque:
- O middleware já retorna `{ type: 'all' }` para quem tem `canViewAllLeads = true`
- O middleware já retorna `{ type: 'team', teamId }` para quem tem `canViewTeamLeads = true`
- O middleware já retorna `{ type: 'own', agentId }` para todos os demais
- Coordinator teria `canViewAllLeads = true` → cai no `type: 'all'` → zero mudança no middleware

### 2.4 E no frontend?

Os 9 arquivos de filtragem usam este padrão:
```javascript
const isAdmin = user?.role === 'admin' || agentType?.includes('supervisor');
```

Bastaria estender para:
```javascript
const isAdmin = user?.role === 'admin' || agentType === 'coordinator' || agentType?.includes('supervisor');
```

Ou, melhor ainda, criar uma função centralizada `canSeeAll(agent)` que retorna `true` para admin e coordinator, e usar em todos os arquivos.

---

## 3. PLANO MÍNIMO DE MUDANÇAS (5 ETAPAS)

### Etapa 1: Criar o role `coordinator` no backend
- **Área**: Banco + Backend
- **Ações**:
  - INSERT em `agent_types`: key `coordinator`, modules completos
  - Adicionar `COORDINATOR` em `ROLE_PERMISSIONS` com `canViewAllLeads: true`, `canViewAllTickets: true`
  - Ajustar `getVisibilityFilter` para reconhecer coordinator (se `agentType === 'coordinator'` → return `{ type: 'all' }`)
- **Risco**: **Baixo** — é aditivo, não muda nada existente
- **Compatibilidade**: 100% compatível, sem migração necessária

### Etapa 2: Reconhecer coordinator no frontend
- **Área**: Frontend (2-3 arquivos)
- **Ações**:
  - Em `permissions.jsx`: adicionar `coordinator` no mapa de permissões
  - Em `Layout.jsx`: adicionar `isCoordinator` na lógica de detecção para mostrar menu completo
  - Em `index.jsx` (HomeRedirect): coordinator vai para `SalesPJDashboard` (igual admin)
- **Risco**: **Baixo** — aditivo, sem impacto em outros roles
- **Compatibilidade**: 100% compatível

### Etapa 3: Ajustar a filtragem dos 9 dashboards/páginas para reconhecer coordinator
- **Área**: Frontend (9 arquivos)
- **Ações**:
  - Criar função utilitária `hasFullVisibility(agent)` que retorna `true` para admin e coordinator
  - Substituir todos os `isAdmin` que incluem supervisor por essa função + `isSupervisor` separado
  - Cada arquivo: trocar `const isAdmin = user?.role === 'admin' || agentType?.includes('supervisor')` por chamadas às funções centralizadas
- **Risco**: **Médio** — toca em 9 arquivos, mas a mudança em cada um é mecânica (trocar uma linha)
- **Compatibilidade**: 100% compatível, sem migração

### Etapa 4: Enriquecer a tabela `teams` e o formulário de Times
- **Área**: Banco + Backend + Frontend (Agents.jsx)
- **Ações**:
  - ALTER TABLE teams: adicionar `supervisor_id` (UUID), `coordinator_id` (UUID)
  - Migrar dados: popular `supervisor_id` a partir de `supervisor_email` existente
  - No formulário de Times em `Agents.jsx`: trocar campo `supervisorEmail` por `supervisorId` (Select com agentes supervisores) + adicionar campo `coordinatorId` (Select com agentes coordenadores)
- **Risco**: **Médio** — migração de dados, mas com rollback simples
- **Compatibilidade**: Requer migration, mas não quebra filtragem existente (team_id permanece)

### Etapa 5: Ajustar o formulário de Agentes para mostrar vínculo hierárquico
- **Área**: Frontend (Agents.jsx)
- **Ações**:
  - Quando `agentType = sales` (vendedor): mostrar campo "Time" (já existe) — o supervisor é implícito
  - Quando `agentType = supervisor`: mostrar campo informativo "Coordenador" do time dele
  - Quando `agentType = coordinator`: mostrar quais times estão sob ele (lista read-only)
- **Risco**: **Baixo** — apenas UI, sem impacto em lógica de negócio
- **Compatibilidade**: 100% compatível

### Resumo do plano:

| Etapa | Arquivos | Risco | Dependência |
|:---|:---|:---|:---|
| 1. Role coordinator backend | 2-3 arquivos backend | Baixo | Nenhuma |
| 2. Coordinator no frontend | 2-3 arquivos frontend | Baixo | Etapa 1 |
| 3. Função de visibilidade centralizada | 9 arquivos frontend | Médio | Etapa 2 |
| 4. Teams enriquecido | Schema + Agents.jsx | Médio | Etapa 1 |
| 5. UI de vínculo hierárquico | Agents.jsx | Baixo | Etapa 4 |

**Etapas 1-3 podem ser feitas sem nenhuma mudança de schema.** Coordenadores funcionariam imediatamente como "admins sem acesso a configurações". As etapas 4-5 formalizam a governança (quem coordena quem).

---

## 4. RISCOS ESPECÍFICOS PARA A HIERARQUIA DESEJADA

### 4.1 Bugs de visibilidade que podem acontecer:

| Bug potencial | Causa provável | Onde é mais provável |
|:---|:---|:---|
| **Supervisor vendo leads de outro time** | `isAdmin` no frontend inclui supervisores junto com admins em uma condição (`agentType?.includes('supervisor')` usado como equivalente a admin) | `SalesPJDashboard.jsx`, `SalesPJWonReport.jsx`, `SalesPJLostReport.jsx` — esses 3 arquivos tratam supervisor como se tivesse visibilidade `all`, mas depois aplicam filtro de team. Se alguém remover o filtro de team achando que supervisor "vê tudo", quebra. |
| **Coordinator vendo MENOS do que deveria** | Coordinator não adicionado em alguma condição `isAdmin` em uma página específica | `LeadsPJKanban.jsx`, `SalesAgenda.jsx`, `SalesTasks.jsx` — esses 3 são os mais propensos porque cada um tem sua própria lógica de filtro independente |
| **Vendedor vendo dados de outro vendedor** | Erro na lógica `own` — se `agent_id` do lead estiver null ou como string em vez de UUID | `LeadPJDetail.jsx` — permite edição, então um bug aqui tem impacto maior |
| **Automações WhatsApp disparando para leads do time errado** | `automationService.js` filtra por `team_id` — se um lead for movido de time sem atualizar `team_id`, a automação pode disparar para o supervisor errado | `backend/src/services/automationService.js` |

### 4.2 Áreas de maior probabilidade de falha:

**1. Kanban (`LeadsPJKanban.jsx`)** — RISCO ALTO
- Motivo: É a tela mais complexa (drag-and-drop, filtros, mutações). A filtragem de leads é feita na query `leadsPJ` com lógica inline. Qualquer inconsistência aqui afeta a operação diária dos vendedores.
- Falha típica: Coordinator é tratado como "não-admin" e só vê seus leads próprios (tela vazia).

**2. Relatórios (`SalesPJReports.jsx`, `SalesPJWonReport.jsx`, `SalesPJLostReport.jsx`)** — RISCO MÉDIO
- Motivo: Têm filtros de time que podem excluir ou incluir leads errados. Se coordinator cair na lógica de "team" em vez de "all", verá dados parciais.
- Falha típica: Coordinator com `teamId` próprio vê apenas dados do seu time, não de todos.

**3. Agenda (`SalesAgenda.jsx`)** — RISCO MÉDIO
- Motivo: Tem integração com Google Calendar + lógica de "team events". Se coordinator não for reconhecido, pode não ver eventos da equipe.
- Falha típica: Coordinator não consegue ver eventos de Google Calendar de outros times.

**4. Automações WhatsApp** — RISCO BAIXO-MÉDIO
- Motivo: Filtram por `team_id` no backend. Se coordinator gerenciar automações cross-team, a lógica atual que filtra por um `team_id` específico limitaria o escopo.

### 4.3 Estratégia de mitigação recomendada:

**Conceito central: Criar funções de autoridade única.**

Em vez de cada arquivo implementar sua própria lógica de "quem pode ver o quê", criar funções centrais:

**Backend:**
- `canSeeAllData(agentType)` → retorna `true` para admin e coordinator
- `getAgentScope(agent)` → retorna `{ type: 'all' | 'team' | 'own', teamId?, agentId? }`
- Usar essas funções em TODA rota que filtra dados. Se amanhã mudar a regra, muda em 1 lugar.

**Frontend:**
- `hasFullVisibility(agent)` → `true` para admin e coordinator
- `hasTeamVisibility(agent)` → `true` para supervisor
- `getVisibleAgentIds(currentAgent, allAgents)` → retorna lista de IDs que o agente pode ver
  - admin/coordinator: todos os IDs
  - supervisor: agentes do mesmo `teamId`
  - vendedor: só o próprio ID

Hoje, cada arquivo recalcula `teamAgents`, `teamAgentIds`, `isAdmin`, `isSupervisor` de forma independente. Se centralizar em `permissions.jsx` e importar, garante consistência.

**Teste de regressão mínimo:**
Após implementação, testar login com 4 contas (admin, coordinator, supervisor, vendedor) e verificar:
- Kanban: quantos leads aparecem
- Dashboard: valores corretos
- Relatórios: leads ganhos/perdidos visíveis
- Agenda: atividades visíveis
- Configurações: acessível ou não

---

## 5. RECOMENDAÇÃO FINAL

### Viabilidade:

**Sim, é viável implementar essa hierarquia com impacto MÉDIO.**

A razão de ser "médio" e não "alto" é a decisão pela Opção B (manter `team_id`), que preserva toda a infraestrutura de filtragem existente. Se fosse Opção A (supervisor_id direto em agents), o impacto seria ALTO.

### Cuidados essenciais:

1. **Centralizar a lógica de visibilidade ANTES de adicionar o coordinator.** Enquanto os 9 arquivos tiverem lógica inline de filtro, cada um é um ponto de falha. Criar `hasFullVisibility()` e `getVisibleAgentIds()` em `permissions.jsx` e refatorar os 9 arquivos para usá-las PRIMEIRO, sem mudar comportamento. Depois, adicionar coordinator nessas funções centrais — e ele automaticamente funciona em todos os 9 arquivos.

2. **Fazer as etapas 1-3 antes das 4-5.** Coordinator funcionando como "admin com menos permissões de sistema" é suficiente para começar a usar. O enriquecimento de `teams` (etapas 4-5) é refinamento organizacional.

3. **Definir claramente a diferença entre coordinator e admin.** Se a única diferença for "governança" (quem supervisiona quem), recomendo: coordinator NÃO acessa Configurações do Sistema (Settings), NÃO gerencia tipos de agentes, NÃO mexe em automações de sistema. Pode gerenciar agentes (criar/editar vendedores e supervisores), ver todos os relatórios, e operar o Kanban como admin.

### Sugestão de simplificação conceitual:

Se o coordenador **não precisar ter times atrelados a ele** (ou seja, ele simplesmente vê tudo, sem importar quem está "sob" ele formalmente), as **etapas 4-5 podem ser eliminadas completamente**. O coordinator seria apenas um role com `canViewAllLeads: true` e `canManageAgents: true`, sem nenhuma alteração de schema.

A cadeia hierárquica ficaria:
- Coordinator sabe quais supervisores existem → simplesmente olhando a lista de agentes
- Supervisor sabe quais vendedores tem → pelo time
- A governança formal (quem responde a quem) ficaria como informação visual, não como restrição de sistema

Isso reduz a implementação de ~24-33 horas para **~12-16 horas (2 dias úteis)**, eliminando toda a complexidade de migração de schema.

### Decisão-chave para o cliente:

> "Você precisa que o sistema IMPEÇA um coordenador de gerenciar times que não são dele? Ou basta que ele VEJA todos os dados e a organização (quem supervisiona quem) seja apenas informativa?"

Se a resposta for "informativa basta", a implementação é significativamente mais simples e pode ser feita com risco mínimo.
