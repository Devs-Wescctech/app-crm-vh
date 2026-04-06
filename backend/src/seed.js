import 'dotenv/config';
import { query, pool } from './config/database.js';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Starting database seed...');

  try {
    const passwordHash = await bcrypt.hash('123456', 10);
    
    const usersResult = await query(`
      INSERT INTO users (email, password_hash, full_name, role) VALUES 
      ('admin@wescctech.com', $1, 'Administrador Master', 'admin'),
      ('carlos.silva@wescctech.com', $1, 'Carlos Silva', 'user'),
      ('maria.santos@wescctech.com', $1, 'Maria Santos', 'user'),
      ('joao.oliveira@wescctech.com', $1, 'João Oliveira', 'supervisor'),
      ('ana.paula@wescctech.com', $1, 'Ana Paula', 'user'),
      ('pedro.costa@wescctech.com', $1, 'Pedro Costa', 'user'),
      ('fernanda.lima@wescctech.com', $1, 'Fernanda Lima', 'user'),
      ('ricardo.souza@wescctech.com', $1, 'Ricardo Souza', 'supervisor'),
      ('bruno.martins@wescctech.com', $1, 'Bruno Martins', 'user')
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, full_name, role
    `, [passwordHash]);
    console.log(`Created ${usersResult.rowCount} users`);

    const teamsResult = await query(`
      INSERT INTO teams (name, description, active) VALUES 
      ('Suporte N1', 'Equipe de suporte técnico nível 1 - primeiro atendimento', true),
      ('Suporte N2', 'Equipe de suporte técnico nível 2 - casos complexos', true),
      ('Vendas Hunter', 'Equipe de prospecção e novos clientes', true),
      ('Vendas Farmer', 'Equipe de manutenção e upsell de clientes', true),
      ('Cobrança', 'Equipe de cobrança e recuperação', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${teamsResult.rowCount} teams`);
    const teams = teamsResult.rows;

    const queuesResult = await query(`
      INSERT INTO queues (name, default_priority, active) VALUES 
      ('Suporte Geral', 'P3', true),
      ('Suporte Urgente', 'P1', true),
      ('Financeiro', 'P2', true),
      ('Comercial', 'P3', true),
      ('Cancelamento', 'P1', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${queuesResult.rowCount} queues`);
    const queues = queuesResult.rows;

    const agentsResult = await query(`
      INSERT INTO agents (name, email, password_hash, agent_type, role, active, permissions) VALUES 
      ('Administrador Master', 'admin@wescctech.com', $1, 'admin', 'admin', true, '{"can_view_all_tickets":true,"can_view_team_tickets":true,"can_access_reports":true,"can_manage_agents":true,"can_manage_settings":true}'),
      ('Pedro Costa', 'pedro.costa@wescctech.com', $1, 'sales', 'agent', true, '{"can_access_reports":true}'),
      ('Fernanda Lima', 'fernanda.lima@wescctech.com', $1, 'sales', 'agent', true, '{"can_access_reports":true}'),
      ('Ricardo Souza', 'ricardo.souza@wescctech.com', $1, 'sales_supervisor', 'supervisor', true, '{"can_view_all_tickets":true,"can_view_team_tickets":true,"can_access_reports":true,"can_manage_agents":true}')
      ON CONFLICT (email) DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
      RETURNING id, name
    `, [passwordHash]);
    console.log(`Created or updated ${agentsResult.rowCount} agents`);
    const agents = agentsResult.rows;

    const territoriesResult = await query(`
      INSERT INTO territories (name, description, region, active) VALUES 
      ('Zona Sul SP', 'Região zona sul de São Paulo', 'São Paulo', true),
      ('Zona Norte SP', 'Região zona norte de São Paulo', 'São Paulo', true),
      ('ABC Paulista', 'Região do ABC', 'São Paulo', true),
      ('Campinas', 'Região de Campinas e interior', 'São Paulo', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${territoriesResult.rowCount} territories`);

    const accountsResult = await query(`
      INSERT INTO accounts (name, cnpj, fantasy_name, email, phone, city, state, active) VALUES 
      ('Tech Solutions Ltda', '12.345.678/0001-90', 'Tech Solutions', 'contato@techsolutions.com.br', '1133334444', 'São Paulo', 'SP', true),
      ('Inovação Digital S.A.', '98.765.432/0001-10', 'InovaDigital', 'comercial@inovadigital.com.br', '1144445555', 'Campinas', 'SP', true),
      ('Comércio Express ME', '11.222.333/0001-44', 'Express Store', 'vendas@expressstore.com.br', '1155556666', 'São Paulo', 'SP', true),
      ('Indústria ABC Ltda', '33.444.555/0001-66', 'ABC Indústria', 'contato@abcindustria.com.br', '1166667777', 'Santo André', 'SP', true),
      ('Serviços Rápidos ME', '77.888.999/0001-22', 'Rapidinho', 'atendimento@rapidinho.com.br', '1177778888', 'São Paulo', 'SP', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${accountsResult.rowCount} accounts`);
    const accounts = accountsResult.rows;

    const contactsResult = await query(`
      INSERT INTO contacts (name, document, email, phone, whatsapp, city, state, active) VALUES 
      ('Roberto Almeida', '123.456.789-00', 'roberto@email.com', '11988887777', '11988887777', 'São Paulo', 'SP', true),
      ('Juliana Ferreira', '234.567.890-11', 'juliana@email.com', '11977776666', '11977776666', 'São Paulo', 'SP', true),
      ('Marcos Pereira', '345.678.901-22', 'marcos@email.com', '11966665555', '11966665555', 'Campinas', 'SP', true),
      ('Patricia Souza', '456.789.012-33', 'patricia@email.com', '11955554444', '11955554444', 'Santo André', 'SP', true),
      ('Anderson Costa', '567.890.123-44', 'anderson@email.com', '11944443333', '11944443333', 'São Paulo', 'SP', true),
      ('Camila Rodrigues', '678.901.234-55', 'camila@email.com', '11933332222', '11933332222', 'Guarulhos', 'SP', true),
      ('Lucas Oliveira', '789.012.345-66', 'lucas@email.com', '11922221111', '11922221111', 'São Paulo', 'SP', true),
      ('Beatriz Lima', '890.123.456-77', 'beatriz@email.com', '11911110000', '11911110000', 'Osasco', 'SP', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${contactsResult.rowCount} contacts`);
    const contacts = contactsResult.rows;

    const contractsResult = await query(`
      INSERT INTO contracts (contract_number, status, start_date, value, plan_name, notes) VALUES 
      ('CTR-2024-001', 'active', '2024-01-15', 299.90, 'Plano Básico', 'Contrato padrão 12 meses'),
      ('CTR-2024-002', 'active', '2024-02-01', 499.90, 'Plano Profissional', 'Contrato corporativo'),
      ('CTR-2024-003', 'active', '2024-03-10', 199.90, 'Plano Starter', 'Primeiro contrato'),
      ('CTR-2024-004', 'suspended', '2024-01-20', 399.90, 'Plano Business', 'Aguardando regularização'),
      ('CTR-2024-005', 'active', '2024-04-05', 799.90, 'Plano Enterprise', 'Cliente premium')
      ON CONFLICT DO NOTHING
      RETURNING id, contract_number
    `);
    console.log(`Created ${contractsResult.rowCount} contracts`);

    const slaResult = await query(`
      INSERT INTO sla_policies (name, priority, response_time_hours, resolution_time_hours, active) VALUES 
      ('SLA Crítico', 'P1', 1, 4, true),
      ('SLA Alto', 'P2', 4, 24, true),
      ('SLA Normal', 'P3', 8, 48, true),
      ('SLA Baixo', 'P4', 24, 72, true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${slaResult.rowCount} SLA policies`);

    const ticketTypesResult = await query(`
      INSERT INTO ticket_types (name, category, description, active) VALUES 
      ('Problema Técnico', 'suporte', 'Problemas técnicos gerais', true),
      ('Dúvida de Uso', 'suporte', 'Dúvidas sobre utilização do sistema', true),
      ('Solicitação de Recurso', 'melhoria', 'Solicitação de novos recursos', true),
      ('Cancelamento', 'comercial', 'Solicitação de cancelamento', true),
      ('Financeiro', 'financeiro', 'Questões financeiras e boletos', true),
      ('Reclamação', 'qualidade', 'Reclamações gerais', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${ticketTypesResult.rowCount} ticket types`);

    const ticketsResult = await query(`
      INSERT INTO tickets (subject, description, status, priority, channel, tags) VALUES 
      ('Sistema não carrega após login', 'Ao tentar acessar o sistema, aparece uma tela em branco após o login. Já tentei limpar cache.', 'novo', 'P2', 'web', ARRAY['bug', 'login']),
      ('Dúvida sobre emissão de NF', 'Como faço para emitir nota fiscal pelo sistema? Não encontro a opção.', 'em_atendimento', 'P3', 'whatsapp', ARRAY['duvida', 'fiscal']),
      ('Erro ao gerar relatório', 'Quando clico para gerar o relatório mensal, aparece erro 500.', 'em_atendimento', 'P1', 'email', ARRAY['bug', 'relatorio']),
      ('Solicitar upgrade de plano', 'Gostaria de fazer upgrade do meu plano atual para o Profissional.', 'aguardando_cliente', 'P3', 'telefone', ARRAY['comercial', 'upgrade']),
      ('Problema com boleto', 'Recebi um boleto com valor incorreto. O valor deveria ser R$ 299,90.', 'resolvido', 'P2', 'email', ARRAY['financeiro', 'boleto']),
      ('Cancelar assinatura', 'Preciso cancelar minha assinatura por motivos financeiros.', 'novo', 'P1', 'web', ARRAY['cancelamento']),
      ('Integração com ERP', 'Preciso de ajuda para configurar a integração com o nosso ERP.', 'em_atendimento', 'P2', 'email', ARRAY['integracao', 'tecnico']),
      ('Treinamento para equipe', 'Gostaria de agendar um treinamento para nossa equipe de 10 pessoas.', 'fechado', 'P4', 'telefone', ARRAY['treinamento', 'comercial'])
      ON CONFLICT DO NOTHING
      RETURNING id, subject
    `);
    console.log(`Created ${ticketsResult.rowCount} tickets`);

    const leadsResult = await query(`
      INSERT INTO leads (name, cpf, email, phone, whatsapp, source, stage, value, status, city, state, notes) VALUES 
      ('Fernando Gomes', '111.222.333-44', 'fernando.gomes@email.com', '11999001122', '11999001122', 'website', 'novo', 299.90, 'active', 'São Paulo', 'SP', 'Interessado no plano básico'),
      ('Carla Mendes', '222.333.444-55', 'carla.mendes@email.com', '11988112233', '11988112233', 'indicacao', 'qualificado', 499.90, 'active', 'Campinas', 'SP', 'Indicação do cliente Roberto'),
      ('Diego Santos', '333.444.555-66', 'diego.santos@email.com', '11977223344', '11977223344', 'google_ads', 'proposta', 799.90, 'active', 'São Paulo', 'SP', 'Proposta enviada 10/12'),
      ('Vanessa Lima', '444.555.666-77', 'vanessa.lima@email.com', '11966334455', '11966334455', 'facebook', 'negociacao', 399.90, 'active', 'Osasco', 'SP', 'Negociando desconto'),
      ('Thiago Rocha', '555.666.777-88', 'thiago.rocha@email.com', '11955445566', '11955445566', 'linkedin', 'ganho', 599.90, 'converted', 'São Paulo', 'SP', 'Convertido em 15/12'),
      ('Amanda Costa', '666.777.888-99', 'amanda.costa@email.com', '11944556677', '11944556677', 'website', 'perdido', 299.90, 'lost', 'Guarulhos', 'SP', 'Optou pela concorrência')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${leadsResult.rowCount} leads`);

    const leadsPJResult = await query(`
      INSERT INTO leads_pj (cnpj, razao_social, nome_fantasia, contact_name, contact_email, contact_phone, source, stage, value, status, city, state, employees_count, segment) VALUES 
      ('11.222.333/0001-44', 'Empresa Alpha Ltda', 'Alpha Tech', 'João da Silva', 'joao@alphatech.com', '11999112233', 'website', 'novo', 2999.90, 'active', 'São Paulo', 'SP', 50, 'Tecnologia'),
      ('22.333.444/0001-55', 'Beta Soluções S.A.', 'Beta Solutions', 'Maria Oliveira', 'maria@beta.com', '11988223344', 'linkedin', 'qualificado', 4999.90, 'active', 'Campinas', 'SP', 120, 'Serviços'),
      ('33.444.555/0001-66', 'Gamma Indústria ME', 'Gamma', 'Pedro Santos', 'pedro@gamma.com', '11977334455', 'indicacao', 'proposta', 7999.90, 'active', 'São Paulo', 'SP', 200, 'Indústria'),
      ('44.555.666/0001-77', 'Delta Comércio Ltda', 'Delta Store', 'Ana Paula', 'ana@delta.com', '11966445566', 'google_ads', 'negociacao', 1999.90, 'active', 'Santo André', 'SP', 30, 'Varejo')
      ON CONFLICT DO NOTHING
      RETURNING id, razao_social
    `);
    console.log(`Created ${leadsPJResult.rowCount} PJ leads`);

    const referralsResult = await query(`
      INSERT INTO referrals (referrer_name, referrer_email, referrer_phone, referred_name, referred_email, referred_phone, stage, value, commission, commission_status, notes) VALUES 
      ('Roberto Almeida', 'roberto@email.com', '11988887777', 'Fernando Gomes', 'fernando.gomes@email.com', '11999001122', 'novo', 299.90, 29.99, 'pending', 'Indicação do mês de dezembro'),
      ('Juliana Ferreira', 'juliana@email.com', '11977776666', 'Carla Mendes', 'carla.mendes@email.com', '11988112233', 'qualificado', 499.90, 49.99, 'pending', 'Lead qualificado'),
      ('Marcos Pereira', 'marcos@email.com', '11966665555', 'Thiago Rocha', 'thiago.rocha@email.com', '11955445566', 'convertido', 599.90, 59.99, 'paid', 'Comissão paga em 18/12')
      ON CONFLICT DO NOTHING
      RETURNING id, referrer_name
    `);
    console.log(`Created ${referralsResult.rowCount} referrals`);

    const kbCategoriesResult = await query(`
      INSERT INTO kb_categories (name, slug, description, icon, sort_order, active) VALUES 
      ('Primeiros Passos', 'primeiros-passos', 'Guias para começar a usar o sistema', 'BookOpen', 1, true),
      ('Tutoriais', 'tutoriais', 'Tutoriais passo a passo', 'GraduationCap', 2, true),
      ('FAQ', 'faq', 'Perguntas frequentes', 'HelpCircle', 3, true),
      ('Integrações', 'integracoes', 'Guias de integração com outros sistemas', 'Plug', 4, true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${kbCategoriesResult.rowCount} KB categories`);
    const kbCategories = kbCategoriesResult.rows;

    if (kbCategories.length > 0) {
      const articlesResult = await query(`
        INSERT INTO kb_articles (title, slug, content, status, views, helpful_count, not_helpful_count, tags, published_at) VALUES 
        ('Como criar sua primeira conta', 'como-criar-primeira-conta', 'Neste guia, vamos mostrar como criar sua primeira conta no sistema. Acesse o site e clique em Criar Conta...', 'published', 150, 45, 3, ARRAY['inicio', 'conta'], NOW()),
        ('Configurando seu perfil', 'configurando-perfil', 'Após criar sua conta, é importante configurar seu perfil corretamente. Acesse Configurações > Perfil...', 'published', 89, 28, 1, ARRAY['perfil', 'configuracao'], NOW()),
        ('Como gerar relatórios', 'como-gerar-relatorios', 'O sistema oferece diversos tipos de relatórios. Para acessar, vá em Relatórios no menu principal...', 'published', 234, 67, 5, ARRAY['relatorios', 'dados'], NOW()),
        ('Integrando com seu ERP', 'integrando-erp', 'Para integrar com seu ERP, você precisará da chave de API. Acesse Configurações > Integrações...', 'draft', 0, 0, 0, ARRAY['integracao', 'erp', 'api'], NULL),
        ('Perguntas Frequentes - Pagamentos', 'faq-pagamentos', 'Reunimos as principais dúvidas sobre pagamentos e faturamento...', 'published', 456, 123, 8, ARRAY['faq', 'pagamento', 'boleto'], NOW())
        ON CONFLICT DO NOTHING
        RETURNING id, title
      `);
      console.log(`Created ${articlesResult.rowCount} KB articles`);
    }

    const checklistsResult = await query(`
      INSERT INTO quality_checklists (name, description, items, is_default, active) VALUES 
      ('Atendimento Padrão', 'Checklist padrão para avaliação de atendimentos', 
       '[{"id": "1", "text": "Saudação adequada", "weight": 10}, {"id": "2", "text": "Identificou o problema corretamente", "weight": 20}, {"id": "3", "text": "Ofereceu solução adequada", "weight": 30}, {"id": "4", "text": "Tempo de resposta adequado", "weight": 20}, {"id": "5", "text": "Encerramento cordial", "weight": 10}, {"id": "6", "text": "Registrou informações no sistema", "weight": 10}]'::jsonb, 
       true, true),
      ('Vendas - Prospecção', 'Checklist para avaliação de ligações de prospecção',
       '[{"id": "1", "text": "Apresentação clara", "weight": 15}, {"id": "2", "text": "Identificou necessidades do cliente", "weight": 25}, {"id": "3", "text": "Apresentou benefícios do produto", "weight": 25}, {"id": "4", "text": "Tratou objeções adequadamente", "weight": 20}, {"id": "5", "text": "Agendou próximo contato", "weight": 15}]'::jsonb,
       false, true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${checklistsResult.rowCount} quality checklists`);

    const csatResult = await query(`
      INSERT INTO csat_surveys (rating, comment, submitted_at) VALUES 
      (5, 'Excelente atendimento! Resolveram meu problema rapidamente.', NOW() - interval '2 days'),
      (4, 'Bom atendimento, mas demorou um pouco para responder.', NOW() - interval '3 days'),
      (5, 'Muito satisfeito com o suporte!', NOW() - interval '1 day'),
      (3, 'Atendimento ok, mas poderia ser mais claro nas explicações.', NOW() - interval '5 days'),
      (5, 'Perfeito! Super recomendo.', NOW() - interval '1 day')
      ON CONFLICT DO NOTHING
      RETURNING id, rating
    `);
    console.log(`Created ${csatResult.rowCount} CSAT surveys`);

    const templatesResult = await query(`
      INSERT INTO templates (name, category, subject, body, variables, active) VALUES 
      ('Boas Vindas', 'onboarding', 'Bem-vindo à Wescctech!', 'Olá {{nome}}, seja bem-vindo! Estamos felizes em tê-lo conosco. Qualquer dúvida, estamos à disposição.', ARRAY['nome'], true),
      ('Resposta Inicial', 'suporte', 'Re: {{assunto}}', 'Olá {{nome}}, recebemos sua solicitação e já estamos trabalhando nela. Número do ticket: {{ticket_id}}', ARRAY['nome', 'assunto', 'ticket_id'], true),
      ('Resolução de Ticket', 'suporte', 'Ticket Resolvido - {{assunto}}', 'Olá {{nome}}, informamos que seu ticket foi resolvido. Caso tenha mais alguma dúvida, é só responder este email.', ARRAY['nome', 'assunto'], true),
      ('Cobrança Amigável', 'cobranca', 'Lembrete de Pagamento', 'Olá {{nome}}, identificamos um valor em aberto de R$ {{valor}}. Entre em contato para regularizar.', ARRAY['nome', 'valor'], true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log(`Created ${templatesResult.rowCount} templates`);

    const salesGoalsResult = await query(`
      INSERT INTO sales_goals (period, year, month, target_value, achieved_value, target_leads, achieved_leads) VALUES 
      ('monthly', 2024, 12, 50000.00, 35000.00, 20, 14),
      ('monthly', 2024, 11, 45000.00, 48000.00, 18, 21),
      ('monthly', 2024, 10, 45000.00, 42000.00, 18, 16)
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    console.log(`Created ${salesGoalsResult.rowCount} sales goals`);

    console.log('\nSeed completed successfully!');
    console.log('Summary:');
    console.log('- 5 Teams');
    console.log('- 5 Queues');
    console.log('- 7 Support Agents');
    console.log('- 3 Sales Agents');
    console.log('- 4 Territories');
    console.log('- 5 Accounts');
    console.log('- 8 Contacts');
    console.log('- 5 Contracts');
    console.log('- 4 SLA Policies');
    console.log('- 6 Ticket Types');
    console.log('- 8 Tickets');
    console.log('- 6 PF Leads');
    console.log('- 4 PJ Leads');
    console.log('- 3 Referrals');
    console.log('- 4 KB Categories');
    console.log('- 5 KB Articles');
    console.log('- 2 Quality Checklists');
    console.log('- 5 CSAT Surveys');
    console.log('- 4 Templates');
    console.log('- 3 Sales Goals');

  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch(console.error);
