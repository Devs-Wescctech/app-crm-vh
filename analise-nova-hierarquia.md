# Análise Técnica: Implementação de Nova Hierarquia de Acesso

---

## 1. RESUMO EXECUTIVO

### Complexidade Geral: **MÉDIA-ALTA**

A mudança é conceitualmente simples (adicionar um nível hierárquico), mas o impacto é amplificado pela quantidade de locais no código que usam `team_id` para filtrar dados. O `team_id` está entrelaçado em praticamente todas as camadas: schema, middleware, rotas de backend, dashboards, Kanban, relatórios, agenda, tarefas e automações.

### Principais Desafios:
1. **`team_id` está em 6+ tabelas do banco e 15+ arquivos** — migrar para `supervisor_id` exige tocar em muitos pontos.
2. **O middleware de visibilidade (`buildVisibilityQuery`) não está 100% integrado** — muitas rotas fazem filtros manuais, o que significa que não basta mudar um ponto central.
3. **O conceito "Coordenador = Admin" pode criar confusão** — se ambos veem tudo, a distinção precisa ser clara.
4. **Migração de dados existentes** — vínculos atuais via `team_id` precisam ser mapeados para `supervisor_id`.

### Recomendação: **Prossiga, mas em fases, mantendo `team_id` como base.**

A abordagem mais segura é **não remover `team_id`**, e sim **redefinir o que "time" significa**: um supervisor É o líder do time, e seus vendedores são os membros. Isso minimiza a refatoração.

---

## 2. ANÁLISE DETALHADA POR ÁREA

### 2.1 BANCO DE DADOS

#### Impacto de adicionar `supervisor_id` e `coordinator_id`:

**Opção A — Adicionar colunas diretas:**
```
agents:
  + supervisor_id UUID REFERENCES agents(id)   -- vendedor → supervisor
  + coordinator_id UUID REFERENCES agents(id)  -- supervisor → coordenador
```

- **Prós**: Simples, relação direta.
- **Contras**: Referência circular (agents referencia agents), dificulta queries de hierarquia. Se um coordenador também pode supervisionar diretamente, a lógica fica ambígua.

**Opção B (RECOMENDADA) — Manter `team_id` e enriquecer teams:**
```
teams:
  + supervisor_id UUID REFERENCES agents(id)    -- quem supervisiona este time
  + coordinator_id UUID REFERENCES agents(id)   -- quem coordena este time

agents:
  team_id (já existe) → define a qual time/supervisor o vendedor pertence
```

- **Prós**: Não quebra nenhuma query existente de `team_id`. A relação vendedor→supervisor é implícita via time. Só precisa adicionar 2 colunas em `teams`.
- **Contras**: Supervisor não pode ter vendedores fora do time (limitação aceitável).

#### Queries existentes afetadas:

| Query/Padrão Atual | Impacto com Opção B |
|:---|:---|
| `WHERE team_id = $1` | **Nenhum** — continua funcionando |
| `WHERE agent_id = $1` | **Nenhum** — filtro individual não muda |
| Joins com `teams` | **Mínimo** — teams ganha colunas extras, joins existentes ignoram |
| Dashboard com `selectedTeam` | **Nenhum** — time continua existindo |

#### Índices necessários:
- `CREATE INDEX idx_teams_supervisor ON teams(supervisor_id);`
- `CREATE INDEX idx_teams_coordinator ON teams(coordinator_id);`
- Os índices existentes em `agents.team_id` já bastam.

#### Risco de inconsistência na migração:
- **Baixo com Opção B**: A migração seria apenas preencher `teams.supervisor_id` com o agente que já é supervisor do time (campo `supervisorEmail` já existe na UI de times).
- **Médio com Opção A**: Precisaria popular `agents.supervisor_id` para cada vendedor, com risco de vendedores "órfãos".

---

### 2.2 COMPATIBILIDADE COM O SISTEMA ATUAL

#### Tipos de agentes existentes:

Os tipos `sales`, `pre_sales`, `post_sales`, `support`, `collection` **continuariam funcionando normalmente**. O novo tipo `coordinator` seria adicionado como mais um entry em `ROLE_PERMISSIONS` e na tabela `agent_types`.

#### Coexistência team_id / supervisor_id:

Com a Opção B (recomendada), **não há coexistência conflitante** — `team_id` continua sendo o vínculo principal. O supervisor é identificado via `teams.supervisor_id`, não via coluna no agente.

O filtro de visibilidade ficaria:

| Role | Filtro Atual | Filtro Novo |
|:---|:---|:---|
| `admin` | `type: 'all'` | `type: 'all'` (sem mudança) |
| `coordinator` | *não existe* | `type: 'all'` (novo, igual admin) |
| `supervisor` | `type: 'team'` → `WHERE team_id = X` | `type: 'team'` → `WHERE team_id IN (times do supervisor)` |
| `sales` e outros | `type: 'own'` → `WHERE agent_id = X` | `type: 'own'` (sem mudança) |

A mudança no supervisor é sutil mas importante: hoje ele filtra por **um** `team_id` (o dele). Se um supervisor coordenar múltiplos sub-times no futuro, seria `team_id IN (...)`. Mas no modelo proposto (1 supervisor = 1 time), fica idêntico ao atual.

---

### 2.3 IMPACTO NO BACKEND

#### Arquivos que precisariam de modificação:

| Arquivo | Mudança | Complexidade |
|:---|:---|:---|
| `backend/src/config/permissions.js` | Adicionar role `COORDINATOR` em `ROLE_PERMISSIONS` | Baixa |
| `backend/src/config/permissions.js` | Ajustar `getVisibilityFilter` para coordinator | Baixa |
| `backend/src/middleware/permissions.js` | Reconhecer coordinator no `loadAgentMiddleware` | Baixa |
| `backend/src/routes/entities.js` | Adicionar `supervisor_id`/`coordinator_id` no CRUD de teams | Baixa |
| `backend/src/config/schema.sql` | ALTER TABLE teams + novo agent_type | Baixa |
| `backend/src/routes/functions.js` | Relatórios/comissões que filtram por time | Média |

**Total: ~6 arquivos, sendo 4 com mudanças triviais.**

#### `getVisibilityFilter` e novo filtro:

A função atual já suporta `'all'`, `'team'` e `'own'`. Adicionar coordinator seria:

```
if (agentType === 'coordinator') return { type: 'all' };
```

Se coordinator vê tudo, é literalmente uma linha. A complexidade real só aumenta se coordinator tiver visibilidade parcial (ex: só times sob ele), que exigiria um novo tipo `'coordinator_teams'`.

#### Endpoints dependentes de team_id:

Os mais críticos são:
1. **Automações WhatsApp** (`automationService.js`) — filtra leads por `team_id` para enviar mensagens
2. **Fila WhatsApp** (`whatsappQueueService.js`) — loga `team_id` por mensagem
3. **Lead automations** (`entities.js`) — junction table `lead_automation_teams`
4. **Relatórios de comissões** (`functions.js`) — agrupam por time

Nenhum precisaria de refatoração se `team_id` for mantido (Opção B).

---

### 2.4 IMPACTO NO FRONTEND

#### Formulário de agentes (`Agents.jsx`):

O formulário já tem:
- Campo `agentType` (Select) — basta adicionar "Coordenador" na lista
- Campo `teamId` (Select) — já existe para vendedores

**Campos condicionais necessários:**
- Se `agentType = vendedor`: mostrar `teamId` (já existe)
- Se `agentType = supervisor`: mostrar quais times ele supervisiona (já existe parcialmente na aba "Times")
- Se `agentType = coordinator`: não precisa de team (vê tudo)

A UI de Times já tem campo `supervisorEmail` — bastaria trocar por `supervisorId` e adicionar `coordinatorId`.

#### Menu/filtros:

O menu já é filtrado dinamicamente via `filterMenuItems` e `useMemo` em `Layout.jsx`. Adicionar coordinator seria:

- No `Layout.jsx`: adicionar `isCoordinator` na lógica de detecção
- No `permissions.jsx`: adicionar mapeamento `coordinator` em `AGENT_PERMISSIONS`

**Complexidade: Baixa** — ~10 linhas de código.

#### Dashboards e relatórios:

Os dashboards (`SalesPJDashboard.jsx`, `SalesPJReports.jsx`, etc.) já têm filtro de time com dropdown. Para coordinator:
- Se vê tudo → comportamento idêntico ao admin → **nenhuma mudança necessária**

---

### 2.5 MIGRAÇÃO DE DADOS

#### Estratégia recomendada (Opção B):

1. **ALTER TABLE teams**: Adicionar `supervisor_id` e `coordinator_id` (nullable).
2. **Popular supervisor_id**: Para cada time que já tem `supervisor_email`, fazer UPDATE com o `agent.id` correspondente.
3. **Criar tipo coordinator**: INSERT na tabela `agent_types`.
4. **Designar coordenadores**: O admin atribui manualmente quais agentes são coordenadores via UI.

#### Riscos:

| Risco | Probabilidade | Mitigação |
|:---|:---|:---|
| Times sem supervisor atribuído | Média | Default: manter `NULL`, UI mostra "Sem supervisor" |
| Relatórios históricos quebram | **Nenhum** com Opção B | `team_id` não muda, dados históricos intactos |
| Vendedor sem time | Baixa | Já é possível hoje — não é novo |

**Não há necessidade de supervisores "fantasma"** — a Opção B simplesmente enriquece a tabela `teams`.

---

## 3. RISCOS IDENTIFICADOS

### Críticos (podem quebrar o sistema):

1. **Filtros manuais de visibilidade espalhados**: Várias rotas e páginas (Kanban, Dashboard, LostReport) fazem seus próprios filtros com `team_id` no frontend. Se alguém esquecer de ajustar um deles, um supervisor pode ver dados que não deveria — ou não ver dados que deveria. Há **~15 pontos** no frontend que fazem filtragem por time.

2. **Middleware de visibilidade não uniformizado**: O `applyVisibilityFilter`/`buildVisibilityQuery` existe mas NÃO é usado em todas as rotas. Muitas rotas em `entities.js` e `functions.js` fazem queries SQL manuais. Qualquer mudança na lógica de visibilidade precisa ser replicada nesses pontos manuais.

### Moderados (podem causar bugs):

3. **Duplicidade de lógica frontend/backend**: `AGENT_PERMISSIONS` (frontend) e `ROLE_PERMISSIONS` (backend) são mantidos separadamente. Adicionar `coordinator` em um e esquecer no outro cria inconsistência.

4. **Detecção de role no frontend inconsistente**: O código atual mistura `user?.role === 'admin'`, `agentType === 'admin'`, `agentType?.includes('supervisor')` em vários arquivos. Adicionar coordinator exige tocar em todos esses pontos.

5. **Google Calendar / Agenda**: A agenda filtra por time quando em "modo equipe". Se coordinator vê todos os times, a lógica de team events precisa contemplar múltiplos teams.

### Leves (inconvenientes):

6. **Label/UI**: Decidir se "Coordenador" aparece como aba separada ou junto com supervisores nos filtros de dashboard.

7. **Performance**: Se coordinator busca dados de todos os times, as queries são as mesmas do admin — sem impacto novo.

---

## 4. PLANO SUGERIDO (SE FOSSE IMPLEMENTAR)

### Fase 1: Preparação (Antes de qualquer alteração)

1. **Mapear todos os pontos de filtro por team_id** — criar lista completa de:
   - Queries SQL no backend que usam `team_id`
   - Filtros frontend que usam `teamId` ou `team_id`
   - Middleware que aplica visibilidade

2. **Definir regras de negócio finais:**
   - Coordenador pode editar leads de qualquer time?
   - Coordenador pode reatribuir vendedores entre times?
   - Se um supervisor sai, o que acontece com os vendedores?

3. **Criar testes manuais** para os fluxos críticos atuais (login como admin, supervisor e vendedor; verificar o que cada um vê).

### Fase 2: Implementação (Ordem recomendada)

**Etapa 2.1 — Backend (schema + permissões):**
- ALTER TABLE teams ADD COLUMN supervisor_id, coordinator_id
- Adicionar `COORDINATOR` em ROLE_PERMISSIONS e agent_types
- Atualizar `getVisibilityFilter` para reconhecer coordinator

**Etapa 2.2 — Backend (rotas):**
- Ajustar CRUD de teams para salvar supervisor_id/coordinator_id
- Verificar que rotas com filtros manuais reconhecem coordinator como "all"

**Etapa 2.3 — Frontend (permissões):**
- Adicionar coordinator em `AGENT_PERMISSIONS`
- Atualizar Layout.jsx para detectar coordinator
- Ajustar Agents.jsx para criar/editar coordenadores
- Ajustar UI de Times para vincular supervisor e coordenador

**Etapa 2.4 — Frontend (páginas):**
- Verificar cada dashboard/relatório para garantir que coordinator vê dados corretos
- Ajustar filtros de time nos componentes que fazem filtragem manual

### Fase 3: Migração de Dados

1. Executar migration SQL para adicionar colunas
2. Popular `teams.supervisor_id` a partir dos dados existentes
3. Criar registro de coordinator em `agent_types`
4. Admin designa coordenadores via interface

### Fase 4: Validação

Testar exaustivamente como cada role:

| Cenário | Admin | Coordinator | Supervisor | Vendedor |
|:---|:---|:---|:---|:---|
| Dashboard geral | Vê tudo | Vê tudo | Só equipe | Só próprios |
| Kanban | Todos os leads | Todos os leads | Leads da equipe | Leads próprios |
| Relatórios | Todos | Todos | Equipe | Próprios |
| Agenda | Todos | Todos | Equipe | Própria |
| Cadastro de agentes | Pode | Pode? | Não | Não |
| Configurações | Pode | Pode? | Não | Não |
| Criar lead | Pode | Pode | Pode | Pode |
| Mover lead no Kanban | Qualquer | Qualquer | Equipe | Próprios |

---

## 5. PERGUNTAS PARA DECISÃO ANTES DE COMEÇAR

### Regras de negócio:

1. **Coordenador pode gerenciar agentes/configurações?** Se sim, é praticamente um admin. Se não, qual a diferença concreta além da visibilidade?

2. **Um supervisor pode ter vendedores em múltiplos times?** Ou é sempre 1 supervisor = 1 time?

3. **Coordenador é vinculado a times específicos?** Ou vê literalmente tudo como o admin?

4. **O que acontece quando um supervisor é removido?** Vendedores ficam sem time? São redistribuídos?

5. **Relatórios de comissões/indicações**: Coordenador recebe relatório consolidado de todos os times?

### Técnicas:

6. **Manter team_id** (Opção B) ou **migrar para supervisor_id** (Opção A)? A recomendação é Opção B, mas a decisão final depende do roadmap.

7. **O campo `supervisorEmail` que já existe na UI de Times** — esse dado está sendo salvo no banco corretamente? Se sim, a migração é simples.

8. **Qual é a urgência?** Isso define se fazemos em 1 fase completa ou em etapas incrementais.

---

## 6. ESTIMATIVA DE ESFORÇO

| Fase | Estimativa | Complexidade |
|:---|:---|:---|
| Schema + migration | 2-3 horas | Baixa |
| Backend (permissions + middleware) | 3-4 horas | Baixa-Média |
| Backend (rotas com filtros manuais) | 4-6 horas | Média |
| Frontend (Agents, Teams, Layout) | 4-6 horas | Média |
| Frontend (dashboards, relatórios, kanban) | 6-8 horas | Média-Alta |
| Testes e validação | 4-6 horas | Média |
| **Total estimado** | **~24-33 horas (3-4 dias úteis)** | **Média-Alta** |

### Abordagem em fases (recomendada):

- **Fase 1** (1 dia): Schema + role coordinator + permissões backend/frontend. Coordinator funciona como admin internamente.
- **Fase 2** (1-2 dias): Ajustar UI de Agents e Teams para vincular supervisor/coordinator explicitamente.
- **Fase 3** (1 dia): Validar todos os dashboards, relatórios e Kanban com os 4 níveis de acesso.

Isso permite que o coordinator funcione imediatamente após a Fase 1, enquanto os refinamentos de UI vêm depois.
