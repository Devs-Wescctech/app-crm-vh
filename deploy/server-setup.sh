#!/bin/bash
set -e

echo "============================================"
echo "  SalesTwo CRM - Server Setup Script"
echo "============================================"

APP_DIR="/var/www/html/app-salestwo"
DB_NAME="salestwo"
DB_USER="auth_bd"
DB_PASS="4uth@1307BD"

echo ""
echo "[1/5] Criando diretórios..."
sudo mkdir -p ${APP_DIR}/uploads
sudo chown -R ${USER}:${USER} ${APP_DIR}
echo "  -> ${APP_DIR} criado com sucesso."

echo ""
echo "[2/5] Configurando banco de dados PostgreSQL..."
echo "  -> Criando banco '${DB_NAME}' com usuário '${DB_USER}'..."
sudo -u postgres psql <<EOF
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

sudo -u postgres psql -d ${DB_NAME} <<EOF
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
EOF
echo "  -> Banco e permissões configurados."

echo ""
echo "[3/5] Verificando pg_hba.conf para acesso Docker..."
PG_HBA=$(sudo find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
if [ -n "$PG_HBA" ]; then
  if ! sudo grep -q "172.17.0.0/16" "$PG_HBA"; then
    echo "  -> Adicionando regra Docker ao pg_hba.conf..."
    echo "host    ${DB_NAME}    ${DB_USER}    172.17.0.0/16    md5" | sudo tee -a "$PG_HBA" > /dev/null
    sudo systemctl restart postgresql
    echo "  -> pg_hba.conf atualizado e PostgreSQL reiniciado."
  else
    echo "  -> Regra Docker já existe no pg_hba.conf."
  fi
else
  echo "  -> AVISO: pg_hba.conf não encontrado. Configure manualmente."
fi

echo ""
echo "[4/5] Copiando docker-compose.yml..."
cp docker-compose.yml ${APP_DIR}/docker-compose.yml
echo "  -> docker-compose.yml copiado para ${APP_DIR}"

echo ""
echo "[5/5] Baixando imagem e iniciando container..."
cd ${APP_DIR}
docker compose pull
docker compose up -d
echo "  -> Container app-salestwo iniciado."

echo ""
echo "Verificando status..."
sleep 10
if docker ps --filter "name=app-salestwo" --filter "status=running" | grep -q app-salestwo; then
  echo "  -> Container rodando com sucesso!"
  echo "  -> Acesse: http://$(hostname -I | awk '{print $1}'):5200"
  echo "  -> URL pública: https://salestwo.wescctech.com.br (configure o Nginx)"
else
  echo "  -> AVISO: Container pode não ter iniciado corretamente."
  echo "  -> Verifique com: docker logs app-salestwo"
fi

echo ""
echo "============================================"
echo "  Setup concluído!"
echo "============================================"
