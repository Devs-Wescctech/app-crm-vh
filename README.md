# Bom Flow CRM

Sistema de CRM completo desenvolvido pela **Wescctech** para gestao de atendimento ao cliente, vendas (PF e PJ), indicacoes, cobrancas e base de conhecimento.

---

## Indice

- [Visao Geral](#visao-geral)
- [Stack Tecnologica](#stack-tecnologica)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Modulos do Sistema](#modulos-do-sistema)
- [Instalacao e Desenvolvimento](#instalacao-e-desenvolvimento)
- [Variaveis de Ambiente](#variaveis-de-ambiente)
- [Build e Deploy](#build-e-deploy)
- [API Backend](#api-backend)
- [Autenticacao e Permissoes](#autenticacao-e-permissoes)
- [Integracoes Externas](#integracoes-externas)

---

## Visao Geral

O Bom Flow CRM e uma plataforma completa para gestao de relacionamento com clientes, projetada para centralizar operacoes de atendimento, vendas e cobrancas em uma unica interface. O sistema oferece:

- Gestao completa de tickets com SLA e distribuicao automatica
- Pipeline de vendas com Kanban para PF, PJ e Indicacoes
- Automacoes via WhatsApp para follow-up e reengajamento
- Geracao de propostas e contratos com assinatura digital
- Dashboards com metricas em tempo real
- Portal do cliente para autoatendimento
- Controle de qualidade e monitoria
- Sistema RBAC com 7 tipos de agentes

---

## Stack Tecnologica

### Frontend

| Tecnologia | Versao | Uso |
|------------|--------|-----|
| React | 18.x | Biblioteca UI |
| Vite | 6.x | Build tool e dev server |
| Tailwind CSS | 3.x | Estilizacao utility-first |
| Radix UI | - | Componentes acessiveis headless |
| React Query | 5.x | Gerenciamento de estado e cache |
| React Router | 7.x | Roteamento SPA |
| Recharts | 2.x | Graficos e visualizacoes |
| @dnd-kit | 6.x | Drag-and-drop (Kanban) |
| Leaflet | 1.9.x | Mapas e geolocalizacao |
| Framer Motion | 12.x | Animacoes |
| Lucide React | - | Icones |

### Backend

| Tecnologia | Versao | Uso |
|------------|--------|-----|
| Node.js | 20.x | Runtime |
| Express | 4.x | Framework web |
| PostgreSQL | 16.x | Banco de dados |
| pg | 8.x | Driver PostgreSQL nativo |
| jsonwebtoken | 9.x | Autenticacao JWT |
| bcryptjs | 2.x | Hash de senhas |
| multer | 1.x | Upload de arquivos |
| pdfkit | 0.17.x | Geracao de PDFs |
| dotenv | 16.x | Variaveis de ambiente |

---

## Estrutura do Projeto

```
bomflow-crm/
├── backend/                    # Servidor Node.js/Express
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js     # Conexao PostgreSQL
│   │   │   └── schema.sql      # Schema do banco
│   │   ├── routes/
│   │   │   ├── auth.js         # Autenticacao (login, registro, JWT)
│   │   │   ├── entities.js     # CRUD de todas as entidades
│   │   │   ├── functions.js    # Funcoes especiais (propostas, contratos)
│   │   │   ├── upload.js       # Upload de arquivos
│   │   │   └── whatsapp.js     # Integracoes WhatsApp
│   │   ├── services/
│   │   │   └── automationService.js  # Automacoes programadas
│   │   └── server.js           # Entry point do servidor
│   └── package.json
│
├── src/                        # Frontend React
│   ├── api/                    # Clientes de API
│   │   ├── apiClient.js        # Cliente HTTP principal
│   │   ├── entities.js         # Funcoes de acesso a entidades
│   │   ├── functions.js        # Funcoes especiais
│   │   └── integrations.js     # Integracoes externas
│   ├── components/
│   │   ├── ai/                 # Componentes de IA (classificacao, resumo)
│   │   ├── board/              # Kanban board
│   │   ├── collection/         # Cobrancas
│   │   ├── dashboard/          # Filtros e metricas de dashboard
│   │   ├── referral/           # Indicacoes
│   │   ├── sales/              # Vendas (formularios, checklists)
│   │   ├── ticket/             # Tickets (timeline, anexos, templates)
│   │   ├── ui/                 # Componentes UI reutilizaveis (Radix)
│   │   ├── utils/              # Utilitarios visuais
│   │   └── whatsapp/           # Componentes WhatsApp
│   ├── constants/
│   │   └── stages.js           # Definicoes de estagios dos pipelines
│   ├── pages/                  # 90 paginas do sistema
│   └── utils/                  # Funcoes utilitarias
│
├── public/                     # Assets estaticos
├── uploads/                    # Arquivos enviados pelos usuarios
├── deploy/                     # Arquivos de deploy Docker
│   ├── docker-compose.yml
│   ├── server-setup.sh
│   └── .env.example
├── .github/workflows/
│   └── build.yml               # CI/CD GitHub Actions -> GHCR
├── Dockerfile                  # Build multi-stage de producao
└── README-MIGRACAO.md          # Guia de migracao para Docker
```

---

## Modulos do Sistema

### 1. Atendimento (Helpdesk)

Gestao completa de tickets de suporte com SLA, filas e distribuicao automatica.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard | `/Dashboard` | Visao geral com metricas de atendimento |
| Criar Ticket | `/CreateTicket` | Formulario de abertura de ticket |
| Board de Filas | `/QueueBoard` | Kanban de filas de atendimento |
| Controle de Tickets | `/TicketControl` | Tabela com filtros avancados |
| Visualizar Ticket | `/TicketView` | Detalhes e historico do ticket |
| Meus Tickets | `/MyTickets` | Tickets atribuidos ao agente |
| Atendimento Rapido | `/QuickServiceRegister` | Registro rapido de atendimento |
| Tipos de Ticket | `/TicketTypes` | Configuracao de tipos e categorias |
| Templates | `/Templates` | Templates de resposta rapida |
| Relatorios | `/TicketReports` | Relatorios de atendimento |
| Dashboard NPS | `/NPSDashboard` | Metricas de satisfacao |

### 2. Vendas PF (Pessoa Fisica)

Pipeline de vendas B2C com Kanban, mapa de leads e automacoes.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard Vendas | `/SalesDashboard` | Metricas e funil de vendas PF |
| Dashboard Agentes | `/SalesAgentsDashboard` | Performance individual |
| Kanban de Leads | `/LeadsKanban` | Pipeline visual com drag-and-drop |
| Novo Lead | `/NewLead` | Cadastro de lead PF |
| Detalhe do Lead | `/LeadDetail` | Historico, atividades e propostas |
| Busca de Leads | `/LeadSearch` | Pesquisa avancada |
| Mapa de Leads | `/LeadsMap` | Visualizacao geografica |
| Agenda | `/SalesAgenda` | Calendario de atividades |
| Tarefas | `/SalesTasks` | Lista de tarefas pendentes |
| Board de Vendas | `/SalesQueueBoard` | Fila de pre-vendas |
| Rotas | `/SalesRoutes` | Smart Routes com mapa |
| Propostas | `/ProposalTemplates` | Templates de propostas |
| Automacoes | `/LeadAutomations` | Regras de automacao |
| Logs | `/AutomationLogs` | Historico de automacoes |
| Relatorios | `/SalesReports` | Relatorios de vendas PF |

### 3. Vendas PJ (Pessoa Juridica)

Pipeline de vendas B2B com Kanban dedicado.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard PJ | `/SalesPJDashboard` | Metricas de vendas PJ |
| Dashboard Agentes PJ | `/SalesPJAgentsDashboard` | Performance individual |
| Kanban PJ | `/LeadsPJKanban` | Pipeline visual PJ |
| Novo Lead PJ | `/NewLeadPJ` | Cadastro de lead PJ |
| Detalhe Lead PJ | `/LeadPJDetail` | Historico e atividades PJ |
| Busca PJ | `/LeadPJSearch` | Pesquisa avancada PJ |
| Automacoes PJ | `/LeadPJAutomations` | Regras de automacao PJ |
| Relatorios PJ | `/SalesPJReports` | Relatorios de vendas PJ |

### 4. Indicacoes (Referral)

Gestao de indicacoes com rastreamento de comissoes e pipeline de conversao.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard | `/ReferralDashboard` | Metricas de indicacoes |
| Dashboard Agentes | `/ReferralAgentsDashboard` | Performance por agente |
| Nova Indicacao | `/ReferralCreate` | Cadastro de indicacao |
| Pipeline | `/ReferralPipeline` | Kanban de indicacoes |
| Detalhe | `/ReferralDetail` | Detalhes da indicacao |
| Comissoes | `/ReferralCommissions` | Controle de comissoes |
| Agenda | `/ReferralAgenda` | Calendario de follow-ups |
| Tarefas | `/ReferralTasks` | Tarefas pendentes |
| Automacoes | `/ReferralAutomations` | Regras de automacao |
| Relatorios | `/ReferralReports` | Relatorios de indicacoes |

### 5. Cobrancas (Collections)

Gestao de cobrancas com dashboard de inadimplencia e agendamento de contatos.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard | `/CollectionDashboard` | Metricas de cobranca |
| Board | `/CollectionBoard` | Kanban de cobrancas |
| Agenda | `/CollectionAgenda` | Agendamento de contatos |
| Criar Ticket | `/CreateCollectionTicket` | Nova cobranca |
| Visualizar | `/CollectionTicketView` | Detalhes da cobranca |
| Relatorios | `/CollectionReports` | Relatorios de cobranca |

### 6. Qualidade

Monitoria de qualidade e auditorias de atendimento.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Monitor | `/QualityMonitor` | Painel de monitoria |
| Checklists | `/QualityChecklists` | Checklists de avaliacao |

### 7. Base de Conhecimento

Artigos categorizados com versionamento para consulta interna e do portal.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Base | `/KnowledgeBase` | Lista de artigos |
| Artigo | `/KBArticle` | Visualizacao de artigo |

### 8. Portal do Cliente

Area de autoatendimento para clientes acessarem via link.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Login | `/PortalLogin` | Autenticacao do portal |
| Home | `/PortalHome` | Pagina inicial do portal |
| Tickets | `/PortalTickets` | Listagem de tickets |
| Criar Ticket | `/PortalCreateTicket` | Abertura de ticket |
| Contrato | `/PortalContract` | Visualizacao de contrato |
| Boletos | `/PortalBoletos` | Consulta de boletos |
| Atualizar Dados | `/PortalUpdateData` | Atualizacao cadastral |
| Ofertas | `/PortalOffers` | Ofertas disponiveis |
| Criar Indicacao | `/PortalReferralCreate` | Indicar amigo |
| Minhas Indicacoes | `/PortalReferralList` | Acompanhar indicacoes |

### 9. Paginas Publicas

Paginas acessiveis sem autenticacao via links compartilhados.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Assinatura Digital | `/PublicSignature` | Assinatura de contrato |
| Assinatura Contrato | `/PublicContractSign` | Assinatura via Autentique |
| Proposta | `/PublicProposal` | Visualizacao de proposta |
| Pesquisa NPS | `/NPSSurvey` | Pesquisa de satisfacao |

### 10. Administracao

Configuracoes gerais do sistema.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Agentes | `/Agents` | Gestao de equipe e permissoes |
| Configuracoes | `/Settings` | Configuracoes do sistema |
| Regras de Distribuicao | `/DistributionRules` | Round Robin / Least Active |
| Notificacoes | `/NotificationSettings` | Configuracao de alertas |
| Agentes IA | `/AIAgents` | Configuracao de assistentes IA |
| Auditoria | `/AuditDebug` | Logs de auditoria |

### 11. Acoes Rapidas WhatsApp

Registro rapido de interacoes vindas do WhatsApp.

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Acao Geral | `/WhatsAppQuickAction` | Acao rapida geral |
| Ticket | `/WhatsAppQuickTicket` | Criar ticket via WA |
| Lead | `/WhatsAppQuickLead` | Criar lead via WA |
| Cobranca | `/WhatsAppQuickCollection` | Registrar cobranca via WA |

---

## Instalacao e Desenvolvimento

### Pre-requisitos

- Node.js 20.x
- PostgreSQL 16.x
- npm 10.x

### Setup Local

```bash
# 1. Instalar dependencias do frontend
npm install --legacy-peer-deps

# 2. Instalar dependencias do backend
cd backend && npm install

# 3. Configurar variaveis de ambiente (ver secao abaixo)

# 4. Iniciar em modo desenvolvimento
# Terminal 1 - Backend:
cd backend && npm run dev

# Terminal 2 - Frontend:
npm run dev
```

O frontend roda em `http://localhost:5000` e o backend em `http://localhost:3001`.

---

## Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | String de conexao PostgreSQL |
| `JWT_SECRET` | Sim | Chave secreta para tokens JWT |
| `SESSION_SECRET` | Sim | Chave secreta para sessoes |
| `PORT` | Nao | Porta do backend (padrao: 3001) |
| `BACKEND_PORT` | Nao | Porta alternativa do backend |
| `NODE_ENV` | Nao | Ambiente (development/production) |
| `DB_SSL` | Nao | Desabilitar SSL (`false` para Docker local) |
| `AUTENTIQUE_TOKEN` | Nao | Token da API Autentique (assinatura digital) |
| `ERP_AUTH_TOKEN` | Nao | Token do ERP Bom Pastor |
| `RUDO_WHATSAPP_TOKEN` | Nao | Token da API WHU (WhatsApp) |

---

## Build e Deploy

### Build Local

```bash
npm run build
```

Gera os arquivos estaticos em `dist/` que sao servidos pelo backend Express.

### Deploy com Docker

O projeto inclui infraestrutura completa para deploy via Docker:

```bash
# Build da imagem
docker build -t bomflow-crm .

# Rodar localmente
docker run -p 5200:5000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/bomflow \
  -e JWT_SECRET=sua-chave \
  -e SESSION_SECRET=sua-chave \
  bomflow-crm
```

Para deploy completo com CI/CD, consulte o [README-MIGRACAO.md](README-MIGRACAO.md).

---

## API Backend

### Endpoints Principais

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/auth/me` | Usuario atual |
| `GET/POST/PUT/DELETE` | `/api/:entity` | CRUD generico de entidades |
| `POST` | `/api/upload/file` | Upload de arquivo |
| `POST` | `/api/functions/:name` | Funcoes especiais |
| `POST` | `/api/whatsapp/send` | Envio de mensagem WhatsApp |

### Entidades Disponiveis

Tickets, Leads, LeadsPJ, Referrals, Agents, Teams, Queues, Activities, Tasks, Proposals, Contracts, KBArticles, CollectionTickets, Automations, Templates, entre outras.

---

## Autenticacao e Permissoes

### Sistema RBAC

O sistema utiliza controle de acesso baseado em funcoes (RBAC) com 7 tipos de agentes:

| Tipo | Descricao | Acesso |
|------|-----------|--------|
| `admin` | Administrador | Acesso total |
| `supervisor` | Supervisor | Gestao de equipe e relatorios |
| `coordinator` | Coordenador | Coordenacao de area |
| `support` | Atendimento | Tickets e suporte |
| `sales` | Vendas | Pipeline de vendas PF/PJ |
| `referral` | Indicacoes | Modulo de indicacoes |
| `collection` | Cobrancas | Modulo de cobrancas |

### Estrutura de Times

- **Filas de Atendimento**: Distribuicao automatica (Round Robin / Least Active)
- **Times de Vendas**: Agrupamento por coordenador
- **Times de Cobranca**: Segmentacao por carteira

---

## Integracoes Externas

| Integracao | Uso | Configuracao |
|------------|-----|--------------|
| **WhatsApp (WHU API)** | Mensagens automaticas, follow-ups, reengajamento | `RUDO_WHATSAPP_TOKEN` |
| **Autentique** | Assinatura digital de contratos | `AUTENTIQUE_TOKEN` |
| **ERP Bom Pastor** | Consulta CPF no sistema de indicacoes | `ERP_AUTH_TOKEN` |
| **OpenAI** | Classificacao de tickets, respostas inteligentes | Via integracao Replit |

---

## Funcionalidades Tecnicas

### Kanban com Metricas de Tempo

- Badges coloridos indicando tempo no estagio (verde <=2d, amarelo <=7d, laranja <=14d, vermelho >14d)
- Timeline de transicoes com duracao entre estagios
- Media de tempo por coluna exibida no cabecalho

### Automacoes Programadas

- Follow-up automatico apos 48h sem contato
- Alerta ao coordenador apos inatividade
- Reengajamento apos 5 e 10 dias
- Execucao a cada 60 minutos via scheduler interno

### Propostas e Contratos

- Geracao de PDF com PDFKit
- Templates de propostas configuraveis
- Assinatura digital via Autentique com download automatico
- Pagina publica para cliente assinar

### Responsividade

- Layout adaptado para desktop, tablet e mobile
- Menu hamburger para telas menores
- Kanban com scroll horizontal touch-friendly
- Grids responsivos em todas as paginas

---

INFOS UTEIS

sup_wescc@srvappsprod:/var/www/html/app-bomflow$ sudo cat .env 
DATABASE_URL=postgresql://auth_bd:4uth%401307BD@172.17.0.1:5432/bomflow
JWT_SECRET=2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=
SESSION_SECRET=2Iz5EHu2ZKRnebbtxV+R/e1JcPxjX/zcF68Xt5q/mXo=
RUDO_WHATSAPP_TOKEN=696a6cad4817bd38a8efd6b9
sup_wescc@srvappsprod:/var/www/html/app-bomflow$ 

## Licenca

Projeto proprietario - Wescctech. Todos os direitos reservados.
