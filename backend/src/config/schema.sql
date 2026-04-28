-- Wescctech CRM Database Schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USERS & AUTH
-- =====================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- ORGANIZATIONAL STRUCTURE
-- =====================
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    supervisor_email VARCHAR(255),
    supervisor_id UUID,
    coordinator_id UUID,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(20),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'agent',
    must_reset_password BOOLEAN DEFAULT FALSE,
    password_updated_at TIMESTAMP,
    agent_type VARCHAR(50) DEFAULT 'support',
    team_id UUID REFERENCES teams(id),
    skills TEXT[],
    active BOOLEAN DEFAULT TRUE,
    photo_url TEXT,
    permissions JSONB DEFAULT '{}',
    level VARCHAR(50) DEFAULT 'pleno',
    online BOOLEAN DEFAULT FALSE,
    capacity JSONB DEFAULT '{"P1": 2, "P2": 5, "P3": 10, "P4": 20}',
    working_hours JSONB DEFAULT '{"start": "08:00", "end": "18:00", "days": [1,2,3,4,5]}',
    queue_ids TEXT[],
    work_unit VARCHAR(100),
    whatsapp_access_token TEXT,
    whatsapp_token_expires_at TIMESTAMP,
    phone VARCHAR(50),
    territory_id UUID,
    timezone TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    team_id UUID REFERENCES teams(id),
    default_priority VARCHAR(10) DEFAULT 'P3',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(100) DEFAULT 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    modules TEXT[],
    allowed_submenus TEXT[],
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    region VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- CRM - CONTACTS & ACCOUNTS
-- =====================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20),
    fantasy_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    document VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    account_id UUID REFERENCES accounts(id),
    birth_date DATE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id),
    account_id UUID REFERENCES accounts(id),
    contract_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    value DECIMAL(15,2),
    plan_name VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dependents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES contracts(id),
    name VARCHAR(255) NOT NULL,
    document VARCHAR(20),
    birth_date DATE,
    relationship VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- TICKETS & HELPDESK
-- =====================
CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    default_queue_id UUID REFERENCES queues(id),
    form_schema JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sla_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    priority VARCHAR(10),
    response_time_hours INTEGER,
    resolution_time_hours INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number SERIAL,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'novo',
    priority VARCHAR(10) DEFAULT 'P3',
    contact_id UUID REFERENCES contacts(id),
    contract_id UUID REFERENCES contracts(id),
    queue_id UUID REFERENCES queues(id),
    agent_id UUID REFERENCES agents(id),
    ticket_type_id UUID REFERENCES ticket_types(id),
    sla_policy_id UUID REFERENCES sla_policies(id),
    channel VARCHAR(50) DEFAULT 'web',
    sla_due_date TIMESTAMP,
    first_response_at TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    tags TEXT[],
    custom_fields JSONB,
    created_by_agent_id UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'public',
    sender_type VARCHAR(50) DEFAULT 'agent',
    sender_id UUID,
    sender_name VARCHAR(255),
    attachments JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS macros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    actions JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subject VARCHAR(255),
    body TEXT,
    variables TEXT[],
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csat_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id),
    rating INTEGER,
    comment TEXT,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- KNOWLEDGE BASE
-- =====================
CREATE TABLE IF NOT EXISTS kb_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT,
    parent_id UUID REFERENCES kb_categories(id),
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    content TEXT,
    category_id UUID REFERENCES kb_categories(id),
    author_id UUID REFERENCES agents(id),
    status VARCHAR(50) DEFAULT 'draft',
    views INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    tags TEXT[],
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_article_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
    content TEXT,
    version_number INTEGER,
    changed_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
    is_helpful BOOLEAN,
    comment TEXT,
    user_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SALES & LEADS (PF)
-- =====================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    source VARCHAR(100),
    stage VARCHAR(50) DEFAULT 'novo',
    agent_id UUID REFERENCES agents(id),
    territory_id UUID REFERENCES territories(id),
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'active',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    notes TEXT,
    custom_fields JSONB,
    last_contact_at TIMESTAMP,
    converted_at TIMESTAMP,
    lost_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE,
    outcome VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'media',
    assigned_to VARCHAR(255),
    metadata JSONB,
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW(),
    google_event_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id),
    scheduled_at TIMESTAMP,
    visited_at TIMESTAMP,
    check_in_lat DECIMAL(10,8),
    check_in_lng DECIMAL(11,8),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id),
    period VARCHAR(20),
    year INTEGER,
    month INTEGER,
    target_value DECIMAL(15,2),
    achieved_value DECIMAL(15,2) DEFAULT 0,
    target_leads INTEGER,
    achieved_leads INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SALES & LEADS (PJ)
-- =====================
CREATE TABLE IF NOT EXISTS leads_pj (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cnpj VARCHAR(20),
    razao_social VARCHAR(255),
    nome_fantasia VARCHAR(255),
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    source VARCHAR(100),
    stage VARCHAR(50) DEFAULT 'novo',
    agent_id UUID REFERENCES agents(id),
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'active',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    employees_count INTEGER,
    segment VARCHAR(100),
    notes TEXT,
    custom_fields JSONB,
    last_contact_at TIMESTAMP,
    converted_at TIMESTAMP,
    lost_reason TEXT,
    porte VARCHAR(100),
    atividade_principal TEXT,
    situacao_cadastral VARCHAR(100),
    natureza_juridica VARCHAR(255),
    cnae_principal VARCHAR(100),
    data_abertura VARCHAR(20),
    contact_role VARCHAR(100),
    phone VARCHAR(50),
    phone_secondary VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    street VARCHAR(255),
    number VARCHAR(20),
    complement VARCHAR(255),
    neighborhood VARCHAR(100),
    cep VARCHAR(20),
    interest VARCHAR(100),
    num_employees VARCHAR(50),
    monthly_revenue DECIMAL(15,2),
    monthly_value DECIMAL(15,2),
    proposal_url TEXT,
    proposal_status VARCHAR(50),
    contract_token VARCHAR(255),
    contract_signature_url TEXT,
    contract_signed_at TIMESTAMP,
    contract_url TEXT,
    signature_autentique_id VARCHAR(255),
    signature_link TEXT,
    signature_status VARCHAR(50) DEFAULT 'none',
    concluded BOOLEAN DEFAULT FALSE,
    lost BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities_pj (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads_pj(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE,
    outcome VARCHAR(100),
    created_by UUID REFERENCES agents(id),
    assigned_to VARCHAR(255),
    priority VARCHAR(50) DEFAULT 'media',
    notes TEXT,
    duration INTEGER,
    duration_minutes INTEGER,
    reminder VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    google_event_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS lead_notes_pj (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads_pj(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_by UUID REFERENCES agents(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_pj_lead_id ON lead_notes_pj(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_pj_created_at ON lead_notes_pj(created_at DESC);

CREATE TABLE IF NOT EXISTS lead_pj_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- PROPOSALS & SALES
-- =====================
CREATE TABLE IF NOT EXISTS proposal_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT,
    variables JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID,
    lead_pj_id UUID,
    agent_id UUID REFERENCES agents(id),
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'pending',
    proposal_url TEXT,
    signed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- REFERRALS
-- =====================
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_name VARCHAR(255),
    referrer_email VARCHAR(255),
    referrer_phone VARCHAR(50),
    referrer_cpf VARCHAR(20),
    referrer_contract_id VARCHAR(100),
    referrer_erp_data JSONB,
    referrer_level INTEGER DEFAULT 1,
    referrer_total_conversions INTEGER DEFAULT 0,
    referred_name VARCHAR(255),
    referred_email VARCHAR(255),
    referred_phone VARCHAR(50),
    referred_cpf VARCHAR(20),
    referred_address TEXT,
    referred_birth_date DATE,
    relationship VARCHAR(100),
    interest VARCHAR(255),
    monthly_value DECIMAL(15,2),
    adhesion_value DECIMAL(15,2),
    total_dependents INTEGER,
    referral_code VARCHAR(50),
    stage VARCHAR(50) DEFAULT 'novo',
    status VARCHAR(50) DEFAULT 'ativo',
    stage_history JSONB DEFAULT '[]',
    agent_id UUID REFERENCES agents(id),
    value DECIMAL(15,2),
    commission DECIMAL(15,2),
    commission_value DECIMAL(15,2),
    commission_status VARCHAR(50) DEFAULT 'pending',
    commission_paid_at TIMESTAMP,
    commission_payment_method VARCHAR(100),
    commission_notes TEXT,
    notes TEXT,
    concluded BOOLEAN DEFAULT false,
    lost BOOLEAN DEFAULT false,
    converted_at TIMESTAMP,
    proposal_url TEXT,
    contract_token VARCHAR(255),
    contract_signature_url TEXT,
    contract_signed_at TIMESTAMP,
    contract_uploaded_at TIMESTAMPTZ,
    contract_url TEXT,
    signature_autentique_id VARCHAR(255),
    signature_link TEXT,
    signature_status VARCHAR(50) DEFAULT 'none',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referral_id UUID REFERENCES referrals(id) ON DELETE CASCADE,
    type VARCHAR(50),
    description TEXT,
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- QUICK SERVICE
-- =====================
CREATE TABLE IF NOT EXISTS quick_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id),
    contact_name VARCHAR(255),
    contact_cpf VARCHAR(20),
    contact_phone VARCHAR(50),
    service_type VARCHAR(100),
    description TEXT,
    agent_id UUID REFERENCES agents(id),
    status VARCHAR(50) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- DISTRIBUTION RULES
-- =====================
CREATE TABLE IF NOT EXISTS distribution_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50),
    conditions JSONB,
    target_queue_id UUID REFERENCES queues(id),
    target_agent_id UUID REFERENCES agents(id),
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- PORTAL & SESSIONS
-- =====================
CREATE TABLE IF NOT EXISTS portal_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id),
    token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SYSTEM SETTINGS
-- =====================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- NOTIFICATIONS
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255),
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50),
    link TEXT,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255),
    notification_type VARCHAR(100),
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- QUALITY & AUDITS
-- =====================
CREATE TABLE IF NOT EXISTS quality_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    items JSONB,
    is_default BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id),
    ticket_id UUID REFERENCES tickets(id),
    checklist_id UUID REFERENCES quality_checklists(id),
    audio_url TEXT,
    duration INTEGER,
    transcription TEXT,
    dialogue JSONB,
    analysis JSONB,
    score INTEGER,
    status VARCHAR(50) DEFAULT 'processing',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- TICKET STATUS HISTORY (for SLA tracking)
-- =====================
CREATE TABLE IF NOT EXISTS ticket_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- LEAD HISTORY (for automation tracking)
-- =====================
CREATE TABLE IF NOT EXISTS lead_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    action VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- ADDITIONAL COLUMNS FOR BUSINESS RULES
-- =====================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT TRUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'pleno';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capacity JSONB DEFAULT '{"P1": 2, "P2": 5, "P3": 10, "P4": 20}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS queue_ids UUID[] DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS working_hours JSONB;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS stop_on_trigger BOOLEAN DEFAULT FALSE;

-- Extend automations for WhatsApp integration
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS whatsapp_template_id VARCHAR(100);
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(255);
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

CREATE TABLE IF NOT EXISTS lead_automation_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES lead_automations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(automation_id, team_id)
);

INSERT INTO lead_automation_teams (automation_id, team_id)
SELECT id, team_id FROM lead_automations
WHERE team_id IS NOT NULL
ON CONFLICT (automation_id, team_id) DO NOTHING;

ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS stop_on_trigger BOOLEAN DEFAULT FALSE;
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS whatsapp_template_id VARCHAR(100);
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(255);
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS contact1_name VARCHAR(255);
ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS contact1_role VARCHAR(255);
ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS contact1_phone VARCHAR(50);
ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS contact2_name VARCHAR(255);
ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS contact2_role VARCHAR(255);
ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS contact2_phone VARCHAR(50);

-- =====================
-- ACTIVITIES PJ — metadata estruturada (ex.: histórico de reatribuição)
-- =====================
ALTER TABLE activities_pj ADD COLUMN IF NOT EXISTS metadata JSONB;

-- =====================
-- LEAD PJ FILES (Anexos da Proposta)
-- =====================
CREATE TABLE IF NOT EXISTS lead_pj_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads_pj(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by UUID,
    uploaded_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_pj_files_lead_id ON lead_pj_files(lead_id);

-- =====================
-- LEAD PJ PROPOSAL ITEMS (Múltiplos produtos por proposta)
-- =====================
CREATE TABLE IF NOT EXISTS lead_pj_proposal_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads_pj(id) ON DELETE CASCADE,
    descricao VARCHAR(500) NOT NULL,
    quantidade NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    valor_unitario NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_pj_proposal_items_lead_id ON lead_pj_proposal_items(lead_id);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_pj_proposal_items_quantidade_check'
  ) THEN
    ALTER TABLE lead_pj_proposal_items
      ADD CONSTRAINT lead_pj_proposal_items_quantidade_check CHECK (quantidade > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_pj_proposal_items_valor_unitario_check'
  ) THEN
    ALTER TABLE lead_pj_proposal_items
      ADD CONSTRAINT lead_pj_proposal_items_valor_unitario_check CHECK (valor_unitario >= 0);
  END IF;
END $$;

-- =====================
-- REFERRAL AUTOMATIONS
-- =====================
CREATE TABLE IF NOT EXISTS referral_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    whatsapp_template_id VARCHAR(100),
    whatsapp_template_name VARCHAR(255),
    priority INTEGER DEFAULT 0,
    stop_on_trigger BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- REFERRAL CHANNEL CONFIG (token per channel)
-- =====================
CREATE TABLE IF NOT EXISTS referral_channel_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_token VARCHAR(500) NOT NULL,
    channel_label VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- REFERRAL CHANNEL AUTOMATIONS (per-channel token)
-- =====================
CREATE TABLE IF NOT EXISTS referral_channel_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    whatsapp_template_id VARCHAR(100),
    whatsapp_template_name VARCHAR(255),
    channel_token VARCHAR(500) NOT NULL,
    channel_token_label VARCHAR(255),
    priority INTEGER DEFAULT 0,
    stop_on_trigger BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- AUTOMATION EXECUTION LOG
-- =====================
CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    automation_id UUID,
    automation_type VARCHAR(50),
    lead_id UUID,
    referral_id UUID,
    action_type VARCHAR(50),
    action_result JSONB,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    executed_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS first_response_minutes INTEGER;
ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS resolution_minutes INTEGER;
ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS pause_on_statuses TEXT[] DEFAULT '{"awaiting_customer", "awaiting_third_party", "on_hold"}';

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets(queue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent_id ON tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent_id ON leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_pj_agent ON leads_pj(agent_id);
CREATE INDEX IF NOT EXISTS idx_contacts_document ON contacts(document);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_audits_agent ON call_audits(agent_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket_id ON ticket_status_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_lead_history_lead_id ON lead_history(lead_id);

-- =====================
-- TRIGGERS FOR UPDATED_AT
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- DEFAULT DATA
-- =====================
INSERT INTO system_settings (setting_key, setting_value) VALUES 
    ('company_name', 'Wescctech CRM'),
    ('company_logo', ''),
    ('primary_color', '#0066cc')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, setting_type) VALUES
    ('lead_temperature_rules', '{"hot":{"maxDaysSinceContact":2,"minRecentInteractions":3,"interactionWindowHours":48,"minValue":null},"cold":{"minDaysSinceContact":7}}', 'json')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO teams (name, description) VALUES 
    ('Suporte', 'Equipe de suporte ao cliente')
ON CONFLICT (name) DO NOTHING;

INSERT INTO queues (name, default_priority) VALUES 
    ('Geral', 'P3')
ON CONFLICT (name) DO NOTHING;

-- =====================
-- BOM AUTO
-- =====================
CREATE TABLE IF NOT EXISTS bom_auto_atendimentos (
  id SERIAL PRIMARY KEY,
  protocolo VARCHAR(20) NOT NULL UNIQUE,
  documento_cliente VARCHAR(20) NOT NULL,
  nome_cliente VARCHAR(255) NOT NULL,
  placa VARCHAR(20) NOT NULL,
  descricao_veiculo VARCHAR(255),
  tipo_servico VARCHAR(100) NOT NULL,
  observacoes TEXT,
  data_hora TIMESTAMP DEFAULT NOW(),
  usuario VARCHAR(255) NOT NULL,
  status_atendimento VARCHAR(50) NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bom_auto_imagens (
  id SERIAL PRIMARY KEY,
  atendimento_id INTEGER NOT NULL REFERENCES bom_auto_atendimentos(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS telefone_contato VARCHAR(20);
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS contratos_servicos TEXT;
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS data_hora_inicio_tratamento TIMESTAMP;
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS usuario_responsavel_tratamento VARCHAR(255);
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS observacoes_tratamento TEXT;

CREATE TABLE IF NOT EXISTS bom_auto_historico_alteracoes (
  id SERIAL PRIMARY KEY,
  atendimento_id INTEGER NOT NULL REFERENCES bom_auto_atendimentos(id) ON DELETE CASCADE,
  status_anterior VARCHAR(50),
  status_novo VARCHAR(50),
  usuario VARCHAR(255) NOT NULL,
  data_hora TIMESTAMP DEFAULT NOW(),
  observacao TEXT
);

-- =====================
-- LEAD GENERATOR WHATSAPP LOGS
-- =====================
CREATE TABLE IF NOT EXISTS gerador_leads_whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_number VARCHAR(50) NOT NULL,
  lead_name VARCHAR(255),
  user_id UUID,
  user_email VARCHAR(255),
  sent_at TIMESTAMP DEFAULT NOW(),
  http_status INTEGER,
  api_response JSONB,
  success BOOLEAN DEFAULT FALSE,
  message_sent_id VARCHAR(255),
  filters_used JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS team_id UUID;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS template_id VARCHAR(255);
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS status_envio VARCHAR(50) DEFAULT 'enviado';
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS tentativa_numero INTEGER DEFAULT 1;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_glwl_block_check ON gerador_leads_whatsapp_logs (lead_number, success, sent_at);
CREATE INDEX IF NOT EXISTS idx_glwl_sent_at ON gerador_leads_whatsapp_logs (sent_at);
CREATE INDEX IF NOT EXISTS idx_glwl_batch ON gerador_leads_whatsapp_logs (batch_id);

-- =====================
-- LEAD GENERATOR QUEUE
-- =====================
CREATE TABLE IF NOT EXISTS gerador_leads_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL,
  lead_id UUID,
  lead_number VARCHAR(50) NOT NULL,
  lead_name VARCHAR(255),
  template_id VARCHAR(255) NOT NULL,
  status_envio VARCHAR(50) DEFAULT 'pendente',
  tentativa_numero INTEGER DEFAULT 1,
  max_tentativas INTEGER DEFAULT 3,
  user_id UUID,
  user_email VARCHAR(255),
  team_id UUID,
  filters_used JSONB,
  motivo_bloqueio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  scheduled_at TIMESTAMP
);

ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS channel_token VARCHAR(500);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_uf VARCHAR(2);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_cidade VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_produto VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_situacao VARCHAR(100);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS template_name VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS automation_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_glq_batch ON gerador_leads_queue (batch_id);
CREATE INDEX IF NOT EXISTS idx_glq_status ON gerador_leads_queue (status_envio);
CREATE INDEX IF NOT EXISTS idx_glq_batch_status ON gerador_leads_queue (batch_id, status_envio);

-- =====================
-- LEAD GENERATOR AUDIT LOG
-- =====================
CREATE TABLE IF NOT EXISTS gerador_leads_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  user_email VARCHAR(255),
  agent_type VARCHAR(100),
  action VARCHAR(255) NOT NULL,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- LEAD GENERATOR RATE CONFIG
-- =====================
CREATE TABLE IF NOT EXISTS gerador_leads_rate_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value INTEGER NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO gerador_leads_rate_config (key, value, description) VALUES
  ('limite_por_segundo', 2, 'Máximo de mensagens enviadas por segundo'),
  ('limite_por_minuto', 30, 'Máximo de mensagens enviadas por minuto'),
  ('limite_por_usuario_dia', 5000, 'Máximo de mensagens por usuário por dia'),
  ('bloqueio_recorrencia_dias', 30, 'Dias de bloqueio para reenvio ao mesmo número')
ON CONFLICT (key) DO NOTHING;

-- =====================
-- LEAD GENERATOR CONVERSIONS
-- =====================
CREATE TABLE IF NOT EXISTS gerador_leads_conversoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_number VARCHAR(50) NOT NULL,
  lead_number_normalized VARCHAR(50) NOT NULL,
  lead_name VARCHAR(255),
  dispatch_log_id UUID REFERENCES gerador_leads_whatsapp_logs(id),
  dispatch_date TIMESTAMP,
  dispatch_user_id UUID,
  dispatch_user_email VARCHAR(255),
  dispatch_batch_id UUID,
  venda_identificada BOOLEAN DEFAULT TRUE,
  data_venda TIMESTAMP DEFAULT NOW(),
  erp_data JSONB,
  erp_titular VARCHAR(255),
  erp_cpf VARCHAR(20),
  erp_contrato VARCHAR(100),
  erp_produto VARCHAR(255),
  erp_situacao VARCHAR(50),
  erp_valor_contrato DECIMAL(12,2),
  erp_cel_indicador VARCHAR(50),
  erp_cel_indicador_normalized VARCHAR(50),
  matched_by VARCHAR(50) DEFAULT 'phone',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glc_lead_number ON gerador_leads_conversoes (lead_number_normalized);
CREATE INDEX IF NOT EXISTS idx_glc_dispatch_date ON gerador_leads_conversoes (dispatch_date);
CREATE INDEX IF NOT EXISTS idx_glc_data_venda ON gerador_leads_conversoes (data_venda);
CREATE INDEX IF NOT EXISTS idx_glc_dispatch_user ON gerador_leads_conversoes (dispatch_user_id);
CREATE INDEX IF NOT EXISTS idx_glc_batch ON gerador_leads_conversoes (dispatch_batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_glc_unique_conversion ON gerador_leads_conversoes (lead_number_normalized, erp_contrato);
ALTER TABLE gerador_leads_conversoes ADD COLUMN IF NOT EXISTS team_id UUID;

CREATE TABLE IF NOT EXISTS gerador_leads_auditoria (
    id SERIAL PRIMARY KEY,
    data_execucao TIMESTAMP DEFAULT NOW(),
    periodo_inicio TIMESTAMP,
    periodo_fim TIMESTAMP,
    leads_disparados INT,
    disparos_sucesso INT,
    vendas_erp INT,
    vendas_vinculadas INT,
    valor_total_erp DECIMAL,
    valor_total_dashboard DECIMAL,
    divergencias INT DEFAULT 0,
    detalhes JSONB
);

CREATE INDEX IF NOT EXISTS idx_gla_data_execucao ON gerador_leads_auditoria (data_execucao);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS erp_agent_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_erp_agent_id ON agents (erp_agent_id) WHERE erp_agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS processed_referral_sales (
    id SERIAL PRIMARY KEY,
    sale_identifier VARCHAR(500) NOT NULL,
    indicator_cpf VARCHAR(20),
    indicator_phone VARCHAR(50),
    indicator_name VARCHAR(255),
    contrato_servicos VARCHAR(100),
    valor_contrato VARCHAR(100),
    data_contrato VARCHAR(100),
    processed_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_referral_sales_identifier ON processed_referral_sales (sale_identifier);

CREATE TABLE IF NOT EXISTS processed_referral_contracts (
    id SERIAL PRIMARY KEY,
    contrato_servicos VARCHAR(255) NOT NULL,
    referral_id UUID NOT NULL,
    cpf_indicado VARCHAR(20),
    processed_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_referral_contracts_contrato ON processed_referral_contracts (contrato_servicos);

CREATE TABLE IF NOT EXISTS commission_reconciliation_logs (
    id SERIAL PRIMARY KEY,
    contrato_servicos VARCHAR(255),
    referral_id UUID,
    cpf_indicado VARCHAR(20),
    tipo_problema VARCHAR(50) NOT NULL,
    descricao TEXT,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    execution_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_reconciliation_date ON commission_reconciliation_logs (execution_date);
CREATE INDEX IF NOT EXISTS idx_commission_reconciliation_tipo ON commission_reconciliation_logs (tipo_problema);

CREATE TABLE IF NOT EXISTS commission_payment_batches (
    id SERIAL PRIMARY KEY,
    periodo_inicio TIMESTAMP NOT NULL,
    periodo_fim TIMESTAMP NOT NULL,
    data_geracao TIMESTAMP DEFAULT NOW(),
    total_indicadores INTEGER DEFAULT 0,
    valor_total DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'aberto',
    email_enviado BOOLEAN DEFAULT FALSE,
    data_envio_email TIMESTAMP,
    usuario_envio VARCHAR(255),
    tipo_envio VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_commission_settings (
    id SERIAL PRIMARY KEY,
    smtp_server VARCHAR(255) DEFAULT 'email-ssl.com.br',
    smtp_port INTEGER DEFAULT 465,
    smtp_user VARCHAR(255) DEFAULT 'noreplybompastor@wescctech.com.br',
    smtp_password VARCHAR(500),
    email_from VARCHAR(255) DEFAULT 'noreplybompastor@wescctech.com.br',
    email_to TEXT DEFAULT 'tais.dequi@wescctech.com.br',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO email_commission_settings (smtp_server, smtp_port, smtp_user, email_from, email_to)
SELECT 'email-ssl.com.br', 465, 'noreplybompastor@wescctech.com.br', 'noreplybompastor@wescctech.com.br', 'tais.dequi@wescctech.com.br'
WHERE NOT EXISTS (SELECT 1 FROM email_commission_settings);

CREATE TABLE IF NOT EXISTS commission_payment_control (
    id SERIAL PRIMARY KEY,
    cpf_indicador VARCHAR(20),
    nome_indicador VARCHAR(255),
    cel_indicador VARCHAR(50),
    cpf_indicado VARCHAR(20),
    nome_indicado VARCHAR(255),
    data_contrato VARCHAR(100),
    valor_contrato VARCHAR(100),
    contrato_servicos VARCHAR(255) NOT NULL,
    status_pagamento VARCHAR(20) DEFAULT 'elegivel',
    periodo_pagamento VARCHAR(100),
    lote_pagamento_id INTEGER REFERENCES commission_payment_batches(id),
    data_confirmacao_pagamento TIMESTAMP,
    usuario_confirmacao VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payment_control_contrato ON commission_payment_control (contrato_servicos);
CREATE INDEX IF NOT EXISTS idx_commission_payment_control_lote ON commission_payment_control (lote_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_commission_payment_control_status ON commission_payment_control (status_pagamento);

CREATE TABLE IF NOT EXISTS commission_weekly_snapshot (
    id SERIAL PRIMARY KEY,
    cycle_start TIMESTAMP NOT NULL,
    cycle_end TIMESTAMP NOT NULL,
    batch_id INTEGER REFERENCES commission_payment_batches(id),
    cpf_indicador VARCHAR(20),
    nome_indicador VARCHAR(255),
    cel_indicador VARCHAR(50),
    total_conversoes INTEGER NOT NULL DEFAULT 0,
    nivel_comissao INTEGER NOT NULL DEFAULT 1,
    valor_comissao NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_snapshot_cycle ON commission_weekly_snapshot (cycle_start, cycle_end);
CREATE INDEX IF NOT EXISTS idx_commission_snapshot_batch ON commission_weekly_snapshot (batch_id);
CREATE INDEX IF NOT EXISTS idx_commission_snapshot_cpf ON commission_weekly_snapshot (cpf_indicador);

CREATE TABLE IF NOT EXISTS indicadores_pix (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cpf_indicador VARCHAR(20) NOT NULL UNIQUE,
    chave_pix VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicadores_pix_cpf ON indicadores_pix (cpf_indicador);

-- =====================
-- LEAD GENERATOR LOG ESTRUTURADO
-- =====================
CREATE TABLE IF NOT EXISTS gerador_leads_log_estruturado (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL,
  disparado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ,
  duracao_ms INTEGER,
  lead_number VARCHAR(20) NOT NULL,
  lead_name VARCHAR(255),
  lead_uf VARCHAR(2),
  lead_cidade VARCHAR(255),
  lead_produto VARCHAR(255),
  lead_situacao VARCHAR(100),
  agent_id UUID,
  agent_name VARCHAR(255),
  agent_email VARCHAR(255),
  template_id VARCHAR(100),
  template_name VARCHAR(255),
  channel_token VARCHAR(500),
  automation_name VARCHAR(255),
  tentativa_numero INTEGER DEFAULT 1,
  status_envio VARCHAR(50) NOT NULL,
  http_status INTEGER,
  message_sent_id VARCHAR(255),
  api_response JSONB,
  motivo_bloqueio TEXT,
  convertido BOOLEAN DEFAULT FALSE,
  data_conversao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_est_batch_id ON gerador_leads_log_estruturado(batch_id);
CREATE INDEX IF NOT EXISTS idx_log_est_disparado_em ON gerador_leads_log_estruturado(disparado_em);
CREATE INDEX IF NOT EXISTS idx_log_est_lead_number ON gerador_leads_log_estruturado(lead_number);
CREATE INDEX IF NOT EXISTS idx_log_est_agent_id ON gerador_leads_log_estruturado(agent_id);
CREATE INDEX IF NOT EXISTS idx_log_est_status_envio ON gerador_leads_log_estruturado(status_envio);
CREATE INDEX IF NOT EXISTS idx_log_est_convertido ON gerador_leads_log_estruturado(convertido);

-- access_token / refresh_token: stored as ciphertext using AES-256-GCM
-- with version prefix `enc:v1:` (see backend/src/utils/cryptoTokens.js).
-- Plaintext values from before Phase 1.1 are migrated by
-- backend/scripts/encrypt_gcal_tokens.js (idempotent).
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ,
    calendar_email VARCHAR(255),
    last_sync_at TIMESTAMPTZ,
    sync_token TEXT,
    granted_scope TEXT,
    target_calendar_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 1.2 — granted_scope tracks which OAuth scope the user actually consented
-- to. Tokens issued before this column existed have NULL here and are flagged as
-- outdated by the API; the UI can prompt reconnection.
ALTER TABLE google_calendar_tokens ADD COLUMN IF NOT EXISTS granted_scope TEXT;

CREATE INDEX IF NOT EXISTS idx_gcal_tokens_agent ON google_calendar_tokens(agent_id);

-- Phase 2.1 — Outbox of pending Google Calendar operations.
-- Hooks in entities.js enqueue rows here instead of calling the Google API
-- directly, so that transient failures can be retried with exponential
-- backoff by gcalOutboxWorker (see backend/src/workers/gcalOutboxWorker.js).
CREATE TABLE IF NOT EXISTS gcal_event_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    activity_id UUID,
    activity_table VARCHAR(20) NOT NULL CHECK (activity_table IN ('activities','activities_pj')),
    op VARCHAR(10) NOT NULL CHECK (op IN ('create','update','delete')),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed')),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcal_event_outbox_status_next_retry
    ON gcal_event_outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_gcal_event_outbox_activity
    ON gcal_event_outbox (activity_table, activity_id);

-- =====================
-- COORDINATOR ROLE MIGRATION
-- =====================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coordinator_id UUID;
CREATE INDEX IF NOT EXISTS idx_teams_coordinator ON teams(coordinator_id);

INSERT INTO agent_types (id, key, label, description, color, modules, allowed_submenus, active)
VALUES (
  gen_random_uuid(),
  'coordinator',
  'Coordenador',
  'Coordenador de vendas com visibilidade total e gestão dos times atribuídos',
  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  ARRAY['dashboard', 'sales_pj', 'agents', 'teams', 'reports'],
  ARRAY[]::TEXT[],
  true
) ON CONFLICT (key) DO NOTHING;

-- =====================
-- SUPERVISOR ROLE MIGRATION
-- =====================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS supervisor_id UUID;
CREATE INDEX IF NOT EXISTS idx_teams_supervisor ON teams(supervisor_id);

UPDATE agents SET agent_type = 'supervisor' WHERE agent_type = 'sales_supervisor';
DELETE FROM agent_types WHERE key = 'sales_supervisor' AND EXISTS (SELECT 1 FROM agent_types WHERE key = 'supervisor');
UPDATE agent_types SET key = 'supervisor', label = 'Supervisor' WHERE key = 'sales_supervisor';

-- =====================
-- FASE S1: VÍNCULO DIRETO VENDEDOR → SUPERVISOR
-- =====================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES agents(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_agents_user_email ON agents(user_email);
CREATE INDEX IF NOT EXISTS idx_agents_supervisor_id ON agents(supervisor_id);

UPDATE agents a
SET supervisor_id = t.supervisor_id
FROM teams t
WHERE a.team_id = t.id
  AND a.agent_type = 'sales'
  AND t.supervisor_id IS NOT NULL
  AND a.supervisor_id IS NULL;
