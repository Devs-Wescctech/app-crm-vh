# SalesTwo - Vendas B2B

## Overview
SalesTwo is a focused B2B sales management platform built on a streamlined version of the original Wescctech CRM. The system is designed exclusively for managing B2B (Pessoa Jurídica) sales operations, including lead management, pipeline tracking, proposals, and agent/access management.

## Brand Identity
- **Primary Colors**: Burgundy (#5A2A3C) + Coral (#F98F6F)
- **Logo**: `/public/logo-saleswo.png` (full), `/public/logo-saleswo-icon-nobg.png` (icon, transparent)
- **Favicon**: `/public/logo-saleswo-icon-nobg.png`
- **Page Title**: "SalesTwo - Vendas B2B"

## Active Modules
1. **Vendas PJ** — Main module: B2B lead pipeline, dashboards, proposals, automations, reports
2. **Agentes** — User/agent management with permissions and access control
3. **Configurações** — System settings (branding, permissions)

## Secrets Convention
- **Never commit real secret values to `.replit`**. The `[userenv.*]` blocks are tracked in git, so any value placed there is published to GitHub.
- Real OAuth credentials, API keys, tokens, and similar secrets must be stored in the Replit Secrets pane (workspace secrets), which the runtime injects as environment variables — **not** in `.replit`.
- Only non-sensitive runtime configuration (ports, public redirect URIs, feature flags) belongs in `.replit`.

### Automated guardrail
A pre-commit hook enforces the rule above:
- `scripts/check-replit-secrets.sh` scans `.replit` for known provider patterns (Google OAuth, Stripe, OpenAI, AWS, GitHub, Slack, private-key blocks) and for high-entropy values assigned to `*_SECRET` / `*_KEY` / `*_TOKEN` / `*_PASSWORD` / `*_APIKEY` variables inside `[userenv.*]` / `[env]` sections.
- In pre-commit mode it only blocks NEW secret-looking additions — pre-existing values are tolerated so a legacy leak does not wedge all future commits.
- Install on a fresh clone: `bash scripts/install-git-hooks.sh` (idempotent).
- Bypass (not recommended): `git commit --no-verify`.
- Run manually against any file: `bash scripts/check-replit-secrets.sh path/to/file`.

### Known legacy secret in `.replit`
`GCAL_TOKEN_ENC_KEY` (encryption key for Google Calendar tokens at rest) currently lives in `[userenv.development]` of `.replit` and is therefore visible in git history. It was intentionally not rotated by the user. If/when it is rotated, the new value must go into Replit Secrets (not `.replit`), and the legacy line should be removed from `.replit` in the same commit.
- Git history was rewritten on 2026-04-20 to scrub previously leaked `GCAL_CLIENT_ID` / `GCAL_CLIENT_SECRET` values from commit `b8b4e48` and its descendants. Those Google OAuth credentials must be rotated in Google Cloud Console.

## User Preferences
- I want iterative development.
- I want to be asked before making major changes.
- I prefer detailed explanations.
- Do not make changes to folder `src/api/base44Client.js`.
- Use the DashboardFilters component as the default pattern for all dashboard filter implementations (period presets, agent selector, stage filter).

## System Architecture

### Frontend
- **Framework**: React 18 with Vite
- **State Management**: React Query
- **Routing**: React Router
- **Styling**: Tailwind CSS, Radix UI
- **Charting**: Recharts

### Backend
- **Framework**: Node.js with Express
- **Database**: PostgreSQL
- **Authentication**: JWT
- **File Uploads**: Multer

### Active Pages
- **Vendas PJ**: SalesPJDashboard, SalesPJAgentsDashboard, NewLeadPJ, LeadsPJKanban, LeadPJSearch, SalesPJReports, SalesPJWonReport, LeadPJAutomations, LeadPJDetail
- **Shared**: SalesAgenda, SalesTasks, ProposalTemplates, AutomationLogs
- **Admin**: Agents, Settings
- **Public**: PublicSignature, PublicProposal, PublicContractSign
- **Auth**: Login

### WhatsApp Automation Token
- Token is stored in `system_settings` table as `automation_token`
- Backend `whatsappService.js` uses `getConfiguredToken()` which reads from DB first, falls back to `RUDO_WHATSAPP_TOKEN` env var
- Frontend configuration UI available in LeadPJAutomations page
- Token is masked in UI for security (shows first 6 + last 4 chars)
- Saving a new token auto-refreshes WhatsApp templates
- Template parameter count is dynamically detected from template definition (no hardcoded IDs)

### Activities/Agenda
- `SalesAgenda` and `SalesTasks` use only `activities_pj` table and `LeadPJ` entities (PF removed)
- All activities link to `LeadPJDetail`
- Activity types include: visit, call, whatsapp, email, task, meeting
- **Create activity button** in SalesAgenda header — opens Sheet form with title, type, priority, datetime
- **Activity reminders**: Backend setInterval every 5min checks `activities_pj` due within 15min, creates notification via `notificationService`; entity_type `activity_pj_reminder` prevents duplicates
- Notification bell shows `CalendarClock` icon for `activity_reminder` type
- Google Calendar-inspired layout: full-height time grid (day/week), month grid with event pills, mini calendar sidebar, activity filters, summary stats, current-time red line indicator
- Internal activities render above Google events (z-index layering); all-day Google events supported in all views
- **Google Calendar Integration**: Full bidirectional OAuth2 sync via `googleCalendarService.js` + `googleapis`
  - **Admin config (one-time)**: Client ID + Secret stored in `system_settings` (keys: `google_calendar_client_id`, `google_calendar_client_secret`)
  - **Per-agent tokens**: `google_calendar_tokens` table stores OAuth tokens per agent (access_token, refresh_token, token_expiry, calendar_email, sync_token)
  - **SalesTwo → Google**: Activities created/updated/deleted in BOTH `activities` and `activities_pj` tables are automatically pushed to Google Calendar via hooks in `entities.js`
  - **Google → SalesTwo**: Periodic sync every 5 minutes (`syncAllAgents` in `server.js`) pulls new events from Google Calendar and creates `activities_pj` entries
  - Both `activities.google_event_id` and `activities_pj.google_event_id` columns track synced events (prevents duplicates)
  - `createGoogleEvent(agentId, activity, tableName)` — pass `'activities'` or `'activities_pj'` to update correct table
  - Events from SalesTwo are prefixed with `[SalesTwo]` and skipped during Google→SalesTwo sync
  - OAuth callback redirect URL: `{origin}/api/functions/google-calendar/callback`
  - Routes: status, auth-url, callback, events, sync, disconnect (per-agent via `req.user.id`)
  - Settings page > "Google Agenda" tab: all users see Connect/Disconnect button, admin also sees credential config

### UI/UX Design
- **Kanban Boards**: Advanced drag-and-drop implementation using `@dnd-kit` with sticky headers, auto-scroll, and mobile responsiveness.
- **Component Library**: Radix UI for accessibility, styled with Tailwind CSS.
- **Data Visualization**: Recharts for dynamic dashboards.
- **Visual Design System**: Indigo/violet gradient theme for B2B sales, glassmorphism sidebar, temperature badges.
- **Mobile Responsiveness**: Full support with hamburger menu, collapsible sidebar, touch-friendly Kanban, and responsive grids.

### Configurable Sales Fields
- Interest and source options for leads (PF and PJ) are stored in `system_settings` as JSON arrays:
  - `interest_options_pj`, `source_options_pj` — for PJ leads
  - `interest_options_pf`, `source_options_pf` — for PF leads
- Managed via Settings page > "Campos de Vendas" tab (add/remove options)
- Used by: `LeadPJDetail.jsx`, `LeadDetail.jsx`, `QuickLeadPJForm.jsx`, `NewLead.jsx`
- Falls back to hardcoded defaults if settings not loaded

### Agents & Permissions
- Admin agent: `admin@wescctech.com` / `123456`, agent_type `admin`
- Active agent_types: `admin`, `coordinator`, `supervisor`, `sales`
- Permissions driven by `agent_types.modules` array from DB; fallback to `AGENT_PERMISSIONS` in `permissions.jsx`
- Team: "Vendas" (single active team)
- **Centralized visibility logic** (Phase 0 refactoring):
  - Backend: `getDataScope(agent)` in `backend/src/config/permissions.js` — single source of truth for `all`/`team`/`own` scoping
  - Frontend: `hasFullVisibility()`, `hasTeamVisibility()`, `getVisibleAgentIds()`, `getVisibleTeams()`, `getDataVisibilityKey()` in `src/components/utils/permissions.jsx`
  - All 8 dashboard/report/kanban/agenda/tasks pages use these centralized functions instead of inline role checks
  - `getVisibleAgentsForFilter(currentAgent, allAgents)` — returns filtered agent objects for filter dropdowns (supervisor sees only their linked agents)
  - `getVisibleTeams(currentAgent, allTeams, allAgents)` — derives visible teams from supervisor's visible agents' team_ids (requires `allAgents` param for supervisor scoping)
  - All filter dropdowns (DashboardFilters) across SalesPJDashboard, SalesPJReports, SalesPJWonReport, SalesPJLostReport, LeadsPJKanban, LeadPJSearch, SalesPJAgentsDashboard use these functions
  - Old functions (`canViewAll`, `canViewTeam`) still exported for backward compatibility
  - `isSupervisorType()` matches: `'supervisor'`, `'sales_supervisor'`, and any `*_supervisor` pattern
- **Coordinator role** (Phase 1):
  - `coordinator` has full data visibility (same as admin) but NO access to system settings
  - Can manage agents and teams, but cannot create/promote agents to `admin` type (enforced both UI and server-side)
  - Teams have `coordinator_id UUID` column linking coordinator to managed teams
  - `canManageTeam()` and `getManagedTeams()` functions in `permissions.jsx` for team-level access control
  - `canAccessModule('config')` returns `true` for coordinator (to access Agents page), but `canManageSettings()` returns `false`
  - Server-side RBAC: POST/PUT `/agents` checks if requestor is coordinator and blocks creating admin agents
  - Agent type config: purple badge (`bg-purple-100 text-purple-700`)
  - Team form: coordinator selector added alongside supervisor selector
- **Supervisor role** (Phase 2):
  - `supervisor` has team-scoped data visibility (leads, reports, agents of their team only)
  - Can manage agents in their team: create/edit/delete, but only `sales` type agents
  - Cannot create/promote agents to `admin`, `coordinator`, or `supervisor` types (enforced server-side + UI)
  - Teams have `supervisor_id UUID` column linking supervisor to managed teams
  - `canManageAgentInTeam()` function in `permissions.jsx` checks team membership
  - `canAccessModule('config')` returns `true` for supervisor (to access Agents page only)
  - Server-side RBAC: POST/PUT/DELETE `/agents` validates supervisor can only manage their team's agents
  - In Agents page: tabs "Times" and "Perfis de Acesso" are hidden for supervisor
  - Agent form: team is auto-filled (supervisor's team) and not editable; type restricted to non-admin types
  - Agent type config: emerald badge (`bg-emerald-100 text-emerald-700`)
  - `sales_supervisor` type unified to `supervisor` via DB migration
- **Sales (vendedor) isolation** (Phase 3):
  - `sales` has `own`-scoped visibility only — sees only their own leads, reports, and data
  - Cannot create, edit, or delete agents (server-side RBAC blocks POST/PUT/DELETE /agents for non-manager types)
  - PUT /agents/:id exception: vendedor can edit their own profile (e.g., photo, working hours)
  - `canManageAgents()` returns `false`, `canAccessModule('config')` returns `false`
  - Menu shows only `dashboard` and `sales_pj` modules; no access to agents, teams, config, or reports pages
  - All report pages use `getVisibleAgentIds()` which returns only `[own id]` for sales type
- **Vendedor → Supervisor direct link** (Phase S1):
  - `agents.supervisor_id UUID` column links each sales agent directly to their supervisor
  - Migration auto-populates `supervisor_id` from `teams.supervisor_id` for existing sales agents
  - `getVisibleAgentIds()` for supervisor now filters by `agent.supervisorId === currentAgent.id` (not team_id)
  - Agent form shows "Supervisor" dropdown when agent type is `sales`; admin/coordinator can choose any supervisor; supervisor sees their own name (fixed, not editable)
  - Agent card displays supervisor name ("Sup: Nome") when supervisor_id is set
  - `team_id` is preserved for backward compatibility but supervisor visibility uses `supervisor_id` as primary source
  - Backend: supervisor creates agent → `supervisor_id` forced to their own ID; `team_id` set from their team if available
  - Backend `GET /leads-pj` now applies server-side visibility filtering: supervisor sees only leads from their linked agents; sales sees only own leads; admin/coordinator see all
  - `SalesPJAgentsDashboard.jsx` uses `getVisibleAgentIds()` for agent stats filtering (not ad-hoc `canSeeAllAgents`)
  - `SalesAgenda.jsx` and `SalesTasks.jsx` no longer show unassigned activities to supervisor — only activities assigned to or created by visible agents

### Technical Implementations
- **Monorepo Structure**: Frontend and Backend coexist within a single repository.
- **API Design**: RESTful API with standardized CRUD operations.
- **Authentication & Authorization**: JWT-based authentication with RBAC system.
- **Lead Automation**: Automated triggers and actions based on lead stage and inactivity for PJ leads.
- **Digital Contract Signing**: Public-facing module for digital contract signatures with token-based access.
- **Optimistic UI**: Implemented for Kanban drag-and-drop interactions.
- **Dashboard Filters**: Reusable `DashboardFilters` component with period presets, team, agent, and stage filters.
- **Token Auto-Refresh**: Global fetch interceptor for transparently refreshing expired access tokens.
- **Configurable Automation Token**: WhatsApp automation token configurable via UI, stored in system_settings DB table.

## GitHub Repository
- **Repo**: `Devs-Wescctech/app-crm-vh`
- **URL**: https://github.com/Devs-Wescctech/app-crm-vh
- **All source files pushed**: 167 files including backend, frontend, deploy configs, logos
- **Deploy files**: `deploy/server-setup.sh` and `deploy/docker-compose.yml` use environment variables (no hardcoded credentials)

## External Dependencies
- **PostgreSQL**: Primary database for the system.
- **React 18**: Frontend library for building user interfaces.
- **Vite**: Fast development build tool for the frontend.
- **React Query**: For server state management and data fetching.
- **React Router**: For client-side routing in the single-page application.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Radix UI**: Headless component library for accessible UI primitives.
- **Recharts**: JavaScript charting library for data visualization.
- **Node.js**: JavaScript runtime for the backend server.
- **Express**: Web framework for Node.js backend.
- **`pg`**: Node.js native PostgreSQL client.
- **`jsonwebtoken`**: For implementing JWT-based authentication.
- **`multer`**: Middleware for handling `multipart/form-data`, used for file uploads.
- **`@dnd-kit/core` and `@dnd-kit/sortable`**: Libraries for drag-and-drop functionality.
