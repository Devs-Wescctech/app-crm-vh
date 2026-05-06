# SalesTwo - Vendas B2B

SalesTwo is a B2B sales management platform for lead management, pipeline tracking, proposals, and agent/access management.

## Run & Operate

```bash
# Install dependencies
npm install

# Run frontend development server
npm run dev

# Run backend development server
npm run server

# Build for production
npm run build
```

**Required Environment Variables:**
OAuth credentials, API keys, and similar secrets must be stored in Replit Secrets (not `.replit`). Only non-sensitive runtime configurations belong in `.replit`.

## Stack

**Frontend:**
- **Framework**: React 18 (Vite)
- **State Management**: React Query
- **Routing**: React Router
- **Styling**: Tailwind CSS, Radix UI
- **Charting**: Recharts

**Backend:**
- **Runtime**: Node.js (Express)
- **Database**: PostgreSQL (`pg` client)
- **Authentication**: JWT
- **File Uploads**: Multer

## Where things live

- `src/`
    - `api/`: Frontend API service definitions
    - `components/`: Reusable React components
    - `pages/`: React application pages
    - `utils/`: Frontend utility functions
- `backend/`
    - `src/`: Backend source code
        - `config/permissions.js`: Centralized backend data scoping logic
        - `services/`: Backend services (e.g., `whatsappService.js`, `googleCalendarService.js`)
        - `routes/`: API route definitions
        - `models/`: Database models
- `public/`: Static assets (e.g., `logo-saleswo.png`)
- `scripts/`: Development utility scripts (e.g., `check-replit-secrets.sh`)
- `deploy/`: Deployment configurations

**Source-of-truth files:**
- **DB Schema**: `backend/src/models/` (model definitions imply schema)
- **API Contracts**: Defined implicitly by routes in `backend/src/routes/` and services in `backend/src/services/`
- **Theme Files**: `tailwind.config.js` and Radix UI configurations

## Architecture decisions

- **Monorepo Structure**: Frontend and Backend coexist within a single repository for simplified development and deployment.
- **Role-Based Access Control (RBAC)**: Centralized permission logic in `backend/src/config/permissions.js` and `src/components/utils/permissions.jsx` ensures consistent data visibility across the application.
- **Google Calendar Integration**: Full bidirectional OAuth2 sync with robust error handling and outbox pattern for updates, ensuring calendar consistency without blocking user actions.
- **Configurable Sales Fields**: Lead interest and source options are stored in `system_settings` as JSON, allowing dynamic updates without code changes.
- **Automated Secret Guardrail**: A pre-commit hook prevents accidental commitment of sensitive secrets to `.replit`, enforcing security best practices.

## Product

- **B2B Lead Management**: Comprehensive pipeline tracking, lead creation, and detailed lead views for PJ (Pessoa Jurídica) leads.
- **Agent and Access Management**: Flexible user roles (admin, coordinator, supervisor, sales) with granular permissions for modules and data visibility.
- **Proposal Generation**: Tools for creating and managing sales proposals.
- **Reporting and Dashboards**: Dynamic dashboards and reports offering insights into sales performance, with role-based data visibility.
- **WhatsApp Automation**: Configurable automation token via UI for interacting with WhatsApp templates.
- **Digital Contract Signing**: Public-facing module for secure electronic contract signatures.
- **Activity and Agenda Management**: Integrated calendar and task system with Google Calendar synchronization for efficient scheduling and reminders.

## User preferences

- I want iterative development.
- I want to be asked before making major changes.
- I prefer detailed explanations.
- Do not make changes to folder `src/api/base44Client.js`.
- Use the DashboardFilters component as the default pattern for all dashboard filter implementations (period presets, agent selector, stage filter).

## Gotchas

- **Secrets in `.replit`**: Never commit real secret values to `.replit`. Use Replit Secrets pane for sensitive data. A pre-commit hook is in place to enforce this.
- **Google Calendar Integration**: Ensure Google Cloud Console credentials (Client ID, Client Secret, Redirect URI) are correctly configured in `system_settings` for admin use.

## Pointers

- **React Query Documentation**: `https://react-query-v3.tanstack.com/`
- **Tailwind CSS Documentation**: `https://tailwindcss.com/docs`
- **Radix UI Documentation**: `https://www.radix-ui.com/docs/primitives`
- **Node.js Documentation**: `https://nodejs.org/docs/latest/api/`
- **Express.js Documentation**: `https://expressjs.com/`
- **PostgreSQL Documentation**: `https://www.postgresql.org/docs/`
- **`@dnd-kit` Documentation**: `https://dndkit.com/`
- **GitHub Repository**: `https://github.com/Devs-Wescctech/app-crm-vh`