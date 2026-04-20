# Processo Completo de Migração — SalesTwo B2B Vendas PJ

> Documento técnico de referência para deploy do sistema SalesTwo em qualquer servidor Linux com Docker.

---

## 1. Importação do Código via GitHub

### 1.1 Repositório

- **Repositório:** `https://github.com/Devs-Wescctech/app-crm-vh`
- **Branch principal:** `main`
- **Registro de imagem:** `ghcr.io/devs-wescctech/app-crm-vh:latest`

### 1.2 Clonar o repositório no servidor

```bash
cd /var/www/html
git clone https://github.com/Devs-Wescctech/app-crm-vh.git app-salestwo
cd app-salestwo
```

### 1.3 Estrutura do projeto

```
app-salestwo/
├── backend/                 # API Node.js (Express)
│   ├── src/
│   │   ├── server.js        # Entrada principal
│   │   ├── config/
│   │   │   └── schema.sql   # Schema completo do banco
│   │   ├── routes/          # Rotas da API
│   │   └── utils/           # Utilitários (crud.js, etc)
│   └── package.json
├── src/                     # Frontend React + Vite
├── public/                  # Assets estáticos (logos, etc)
├── Dockerfile               # Build multi-stage
├── .github/workflows/
│   └── build.yml            # CI/CD automático
└── deploy/
    └── docker-compose.yml   # Compose para produção
```

---

## 2. Preparação da Imagem Docker

### 2.1 Dockerfile (Multi-stage build)

O projeto usa um Dockerfile multi-stage com 3 etapas:

```dockerfile
# ETAPA 1: Build do frontend (React + Vite)
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json ./
RUN echo "legacy-peer-deps=true" > .npmrc && npm install --legacy-peer-deps
COPY index.html vite.config.js tailwind.config.js postcss.config.js jsconfig.json components.json ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# ETAPA 2: Dependências do backend
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# ETAPA 3: Imagem final de produção
FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY backend/ ./backend/
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY --from=frontend-build /app/dist ./dist
RUN mkdir -p /app/uploads /app/backend/public/proposals /app/backend/public/signatures \
    && chown -R appuser:appgroup /app \
    && chmod -R 777 /app/uploads /app/backend/public/proposals /app/backend/public/signatures
USER appuser
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1
CMD ["node", "backend/src/server.js"]
```

**O que acontece:**
1. O frontend React é compilado com `npm run build` → gera a pasta `dist/`
2. As dependências do backend são instaladas separadamente (só produção)
3. A imagem final contém apenas: backend + node_modules de produção + dist compilado
4. Roda com usuário não-root (`appuser`) por segurança
5. Healthcheck automático na rota `/api/health`

### 2.2 GitHub Actions — Build automático

O arquivo `.github/workflows/build.yml` faz o build e push automático a cada push na branch `main`:

```yaml
name: Build and Push to GHCR

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: devs-wescctech/app-crm-vh

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=,format=short

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

**Fluxo:**
1. Desenvolvedor faz push na `main`
2. GitHub Actions builda a imagem Docker
3. Publica automaticamente em `ghcr.io/devs-wescctech/app-crm-vh:latest`
4. No servidor, basta fazer `docker compose pull && docker compose up -d`

### 2.3 Build manual (caso necessário)

```bash
# No servidor, dentro da pasta do projeto:
docker build -t ghcr.io/devs-wescctech/app-crm-vh:latest .

# Ou para build local sem push:
docker build -t app-salestwo:latest .
```

---

## 3. Docker Compose para Produção

### 3.1 Arquivo base (`docker-compose.yml`)

Crie o arquivo na pasta do projeto no servidor (ex: `/var/www/html/app-salestwo/docker-compose.yml`):

```yaml
version: '3.8'

services:
  app-salestwo:
    image: ghcr.io/devs-wescctech/app-crm-vh:latest
    container_name: app-salestwo
    restart: unless-stopped
    ports:
      - "5300:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - DATABASE_URL=postgresql://USUARIO_BD:SENHA_BD@172.17.0.1:5432/salestwo
      - JWT_SECRET=GERAR_UMA_CHAVE_SECRETA_AQUI
      - SESSION_SECRET=GERAR_OUTRA_CHAVE_SECRETA_AQUI
      - DB_SSL=false
      - PUBLIC_URL=https://app.salestwocrm.com.br
    volumes:
      - /var/www/html/app-salestwo/uploads:/app/uploads
    networks:
      - salestwo-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

networks:
  salestwo-network:
    driver: bridge
```

### 3.2 Variáveis de ambiente — o que configurar

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `NODE_ENV` | Ambiente de execução | `production` |
| `PORT` | Porta interna do container | `5000` (não alterar) |
| `DATABASE_URL` | String de conexão PostgreSQL | `postgresql://usuario:senha@host:5432/salestwo` |
| `JWT_SECRET` | Chave para tokens JWT | Gerar com `openssl rand -base64 32` |
| `SESSION_SECRET` | Chave para sessões | Gerar com `openssl rand -base64 32` |
| `DB_SSL` | SSL na conexão com o banco | `false` (se banco local) |
| `PUBLIC_URL` | URL pública da aplicação | `https://app.salestwocrm.com.br` |

### 3.3 Gerar chaves secretas

```bash
# JWT_SECRET
openssl rand -base64 32

# SESSION_SECRET
openssl rand -base64 32
```

### 3.4 Mapear porta no host

A porta `5300` no host aponta para `5000` dentro do container. Ajuste conforme necessário:

```yaml
ports:
  - "PORTA_DO_HOST:5000"
```

### 3.5 Exemplo com banco PostgreSQL no mesmo servidor (docker)

Se quiser rodar o PostgreSQL também via Docker:

```yaml
version: '3.8'

services:
  postgres-salestwo:
    image: postgres:16-alpine
    container_name: postgres-salestwo
    restart: unless-stopped
    environment:
      - POSTGRES_DB=salestwo
      - POSTGRES_USER=auth_bd
      - POSTGRES_PASSWORD=SuaSenhaSegura123
    volumes:
      - pgdata-salestwo:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    networks:
      - salestwo-network

  app-salestwo:
    image: ghcr.io/devs-wescctech/app-crm-vh:latest
    container_name: app-salestwo
    restart: unless-stopped
    depends_on:
      - postgres-salestwo
    ports:
      - "5300:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - DATABASE_URL=postgresql://auth_bd:SuaSenhaSegura123@postgres-salestwo:5432/salestwo
      - JWT_SECRET=GERAR_COM_OPENSSL
      - SESSION_SECRET=GERAR_COM_OPENSSL
      - DB_SSL=false
      - PUBLIC_URL=https://seudominio.com.br
    volumes:
      - /var/www/html/app-salestwo/uploads:/app/uploads
    networks:
      - salestwo-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

volumes:
  pgdata-salestwo:

networks:
  salestwo-network:
    driver: bridge
```

### 3.6 Comandos operacionais

```bash
# Subir o sistema
docker compose up -d

# Ver logs em tempo real
docker compose logs -f app-salestwo

# Parar o sistema
docker compose down

# Atualizar para nova versão (após push no GitHub)
docker compose pull && docker compose up -d

# Verificar saúde do container
docker inspect --format='{{.State.Health.Status}}' app-salestwo

# Entrar no container (debug)
docker exec -it app-salestwo sh
```

---

## 4. Migração do Banco de Dados de Produção

### 4.1 Pré-requisitos no servidor

```bash
# Instalar PostgreSQL client (se não tiver)
sudo apt install postgresql-client -y

# Ou via Docker
docker exec -it postgres-salestwo psql -U auth_bd -d salestwo
```

### 4.2 Criar o banco de dados

```bash
# Se o PostgreSQL estiver no host:
sudo -u postgres psql -c "CREATE DATABASE salestwo;"
sudo -u postgres psql -c "CREATE USER auth_bd WITH PASSWORD 'SuaSenhaSegura123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE salestwo TO auth_bd;"
sudo -u postgres psql -d salestwo -c "GRANT ALL ON SCHEMA public TO auth_bd;"
```

### 4.3 Executar o schema completo

O schema está em `backend/src/config/schema.sql`. Execute no banco:

```bash
# Via host
sudo -u postgres psql -d salestwo < backend/src/config/schema.sql

# Via pgAdmin: abra o arquivo schema.sql e execute como Query
```

### 4.4 Seed de dados iniciais — Agent Types

```sql
INSERT INTO agent_types (key, label, description, color, modules, allowed_submenus, active) VALUES
('admin', 'Administrador', 'Acesso completo ao sistema', 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
 ARRAY['dashboard','leads_pj','agents','settings'],
 ARRAY['kanban','agenda','tasks','reports','won_report','agents_list','agent_types','teams','general','ai'],
 true),
('sales_supervisor', 'Supervisor Comercial', 'Gestão de equipe comercial', 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
 ARRAY['dashboard','leads_pj','agents'],
 ARRAY['kanban','agenda','tasks','reports','won_report','agents_list','teams'],
 true),
('sales', 'Comercial', 'Vendedor - acesso individual', 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
 ARRAY['dashboard','leads_pj'],
 ARRAY['kanban','agenda','tasks'],
 true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  modules = EXCLUDED.modules,
  allowed_submenus = EXCLUDED.allowed_submenus;
```

### 4.5 Criar usuário administrador

```bash
# Gerar hash da senha (rodar no servidor com Node.js):
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('SUA_SENHA_AQUI', 10).then(h => console.log(h));"
```

```sql
-- Substituir o HASH pela saída do comando acima
INSERT INTO agents (name, email, password_hash, agent_type, role, active, permissions) VALUES
('Administrador', 'admin@suaempresa.com', 'HASH_GERADO_AQUI', 'admin', 'admin', true,
 '{"can_view_all_tickets":true,"can_view_team_tickets":true,"can_access_reports":true,"can_manage_agents":true,"can_manage_settings":true}')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
```

### 4.6 Exportar banco de produção existente (backup)

Se precisar migrar dados de um servidor para outro:

```bash
# EXPORTAR (no servidor de origem)
pg_dump -U auth_bd -h localhost -d salestwo --no-owner --no-acl > salestwo_backup.sql

# Ou somente dados (sem schema):
pg_dump -U auth_bd -h localhost -d salestwo --data-only --no-owner > salestwo_data.sql

# IMPORTAR (no servidor de destino)
psql -U auth_bd -h localhost -d salestwo < salestwo_backup.sql
```

### 4.7 Migração via pgAdmin

1. **No servidor de origem:** Botão direito no banco → Backup → Formato: Plain → Salvar `.sql`
2. **No servidor de destino:** Criar banco `salestwo` → Botão direito → Restore → Selecionar arquivo `.sql`

### 4.8 Verificar se tudo está funcionando

```bash
# Testar API
curl -s http://localhost:5300/api/health

# Testar login
curl -s -X POST http://localhost:5300/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@suaempresa.com","password":"SUA_SENHA"}'

# Ver tabelas criadas
sudo -u postgres psql -d salestwo -c "\dt"
```

---

## 5. Configuração do Nginx (Proxy Reverso + SSL)

### 5.1 Exemplo de configuração

```nginx
server {
    listen 80;
    server_name app.salestwocrm.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.salestwocrm.com.br;

    ssl_certificate /etc/letsencrypt/live/app.salestwocrm.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.salestwocrm.com.br/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5.2 Gerar certificado SSL

```bash
sudo certbot --nginx -d app.salestwocrm.com.br
```

---

## 6. Checklist Final de Deploy

- [ ] Banco PostgreSQL criado e acessível
- [ ] Schema executado (`schema.sql`)
- [ ] Agent types inseridos
- [ ] Usuário admin criado
- [ ] `docker-compose.yml` configurado com variáveis corretas
- [ ] `docker compose up -d` executado
- [ ] Container saudável (`docker inspect --format='{{.State.Health.Status}}' app-salestwo`)
- [ ] Nginx configurado com SSL
- [ ] Login funcionando em `https://app.salestwocrm.com.br`
- [ ] Pasta de uploads com permissão correta

---

## 7. Atualizações Futuras

O fluxo de atualização é simples:

1. Fazer alterações no código
2. Push para `main` no GitHub
3. Aguardar GitHub Actions buildar (~3 min)
4. No servidor:
```bash
cd /var/www/html/app-salestwo
docker compose pull
docker compose up -d
```

Pronto — a nova versão estará no ar.
