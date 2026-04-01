# Bom Flow CRM - Guia de Migração Replit → Docker (Servidor Próprio)

## Visão Geral

Esta documentação descreve o processo completo de migração da aplicação Bom Flow CRM do Replit para um servidor Docker próprio, utilizando GitHub Actions para CI/CD e GHCR (GitHub Container Registry) para armazenamento de imagens.

### Stack

- **Frontend**: React 18 + Vite (build estático servido pelo backend)
- **Backend**: Node.js 20 + Express
- **Banco de Dados**: PostgreSQL (no host, fora do Docker)
- **Porta no Host**: 5200
- **Porta Interna**: 5000

### Infraestrutura

```
GitHub (push main) → GitHub Actions → Build Docker Image → Push GHCR
Servidor (pull) → Docker Compose → Container app-bomflow:5200 → PostgreSQL host:5432
```

---

## Passo 1: Conectar Replit ao GitHub

### 1.1 Criar repositório no GitHub

1. Acesse https://github.com/organizations/Devs-Wescctech/repositories/new
2. Nome: `app-bomflow`
3. Visibilidade: **Private**
4. NÃO inicialize com README (o código já existe)

### 1.2 Conectar e fazer push do Replit

No Shell do Replit, execute:

```bash
git remote add origin https://github.com/Devs-Wescctech/app-bomflow.git
git branch -M main
git push -u origin main
```

Se pedir autenticação, use um **GitHub Personal Access Token (PAT)** com permissões `repo` e `write:packages`.

---

## Passo 2: Configurar GitHub Secrets

No repositório GitHub, vá em: **Settings → Secrets and variables → Actions → New repository secret**

O `GITHUB_TOKEN` já é fornecido automaticamente pelo GitHub Actions com as permissões configuradas no workflow. Não é necessário criar manualmente.

> **Nota**: As credenciais do banco e secrets de sessão são configuradas no arquivo `.env` do servidor, **não** no GitHub Secrets.

---

## Passo 3: Setup no Servidor (srvappsprod)

### 3.1 Copiar arquivos de deploy

```bash
# No seu PC local, clone o repo e copie os arquivos de deploy
git clone https://github.com/Devs-Wescctech/app-bomflow.git
cd app-bomflow/deploy
scp docker-compose.yml server-setup.sh .env.example sup_wescc@srvappsprod:/tmp/
```

### 3.2 Executar o setup no servidor

```bash
ssh sup_wescc@srvappsprod
cd /tmp
chmod +x server-setup.sh
./server-setup.sh
```

O script irá:
1. Criar a pasta `/opt/bomflow` e diretório de uploads
2. Criar o banco `bomflow` e o usuário no PostgreSQL do host
3. Configurar `pg_hba.conf` para permitir acesso Docker
4. Criar o arquivo `.env` com as credenciais (em `/opt/bomflow/.env`, com permissões restritas)
5. Fazer login no GHCR (vai pedir seu GitHub PAT)
6. Baixar a imagem e iniciar o container

> **Importante**: Após o setup, revise o arquivo `/opt/bomflow/.env` e ajuste credenciais se necessário.

### 3.3 Verificar acesso

```bash
curl http://localhost:5200/api/health
# Esperado: {"status":"ok"}
```

---

## Passo 4: Atualizar Deploy (Após Novos Pushes)

Após cada push na branch `main`, o GitHub Actions automaticamente builda e publica uma nova imagem. Para atualizar no servidor:

```bash
ssh sup_wescc@srvappsprod
cd /opt/bomflow
docker compose pull
docker compose up -d
```

### Script rápido de atualização

```bash
#!/bin/bash
cd /opt/bomflow
docker compose pull
docker compose up -d
docker image prune -f
echo "Deploy atualizado!"
```

---

## Passo 5: Troubleshooting

### Porta 5200 já em uso

```bash
# Verificar quem está usando a porta
sudo lsof -i :5200
# Ou altere a porta no docker-compose.yml:
# ports: "5201:5000"
```

### Container não inicia

```bash
# Ver logs do container
docker logs app-bomflow
docker logs -f app-bomflow  # logs em tempo real

# Ver status
docker ps -a --filter "name=app-bomflow"
```

### Healthcheck falhando

```bash
# Verificar healthcheck
docker inspect --format='{{json .State.Health}}' app-bomflow | python3 -m json.tool

# Testar manualmente de dentro do container
docker exec app-bomflow wget -qO- http://localhost:5000/api/health
```

### Erro de conexão com banco de dados

```bash
# Verificar se o PostgreSQL está rodando
sudo systemctl status postgresql

# Verificar se o banco existe
sudo -u postgres psql -l | grep bomflow

# Verificar conectividade do container ao host
docker exec app-bomflow wget -qO- http://172.17.0.1:5432 || echo "Porta acessível"

# Verificar pg_hba.conf (permitir conexão de 172.17.0.0/16)
sudo grep -n "172.17" /etc/postgresql/*/main/pg_hba.conf
# Se não existir, adicionar:
# host    bomflow    auth_bd    172.17.0.0/16    md5
# E reiniciar: sudo systemctl restart postgresql
```

### Imagem não atualiza

```bash
# Forçar pull da imagem mais recente
docker compose pull --no-cache
docker compose up -d --force-recreate

# Limpar imagens antigas
docker image prune -f
```

### Verificar variáveis de ambiente no container

```bash
docker exec app-bomflow env | grep -E "DATABASE_URL|PORT|NODE_ENV"
```

---

## Estrutura de Arquivos de Deploy

```
app-bomflow/
├── Dockerfile                    # Build multi-stage (frontend + backend)
├── .dockerignore                 # Arquivos ignorados no build Docker
├── .github/
│   └── workflows/
│       └── build.yml             # CI/CD: build e push para GHCR
├── deploy/
│   ├── docker-compose.yml        # Compose para o servidor de produção
│   └── server-setup.sh           # Script de setup inicial do servidor
└── README-MIGRACAO.md            # Este documento
```

---

## Portas em Uso no Servidor

| Porta | Aplicação |
|-------|-----------|
| 3000 | *(existente)* |
| 3001 | *(existente)* |
| 3002 | *(existente)* |
| 3100 | *(existente)* |
| 5000 | *(existente)* |
| **5200** | **Bom Flow CRM** |

---

## Configuração do pg_hba.conf

Para que o container Docker consiga acessar o PostgreSQL no host, é necessário que o `pg_hba.conf` permita conexões da rede Docker bridge (172.17.0.0/16).

Adicione a seguinte linha ao `/etc/postgresql/*/main/pg_hba.conf`:

```
host    bomflow    auth_bd    172.17.0.0/16    md5
```

E reinicie o PostgreSQL:

```bash
sudo systemctl restart postgresql
```
