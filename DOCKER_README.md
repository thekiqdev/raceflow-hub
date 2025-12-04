# Docker Setup - RaceFlow Hub

## Pré-requisitos
- Docker Desktop instalado e rodando
- Docker Compose v2+

## Configuração Inicial

1. **Copiar arquivo de ambiente:**
   ```bash
   cp env.example .env
   ```

2. **Editar variáveis de ambiente (opcional):**
   Edite o arquivo `.env` se quiser alterar as configurações padrão:
   - `POSTGRES_USER`: Usuário do banco (padrão: raceflow_user)
   - `POSTGRES_PASSWORD`: Senha do banco (padrão: raceflow_password)
   - `POSTGRES_DB`: Nome do banco (padrão: raceflow_db)
   - `POSTGRES_PORT`: Porta do PostgreSQL (padrão: 5432)

## Comandos Úteis

### Iniciar o banco de dados
```bash
docker-compose up -d
```

### Parar o banco de dados
```bash
docker-compose down
```

### Parar e remover volumes (apaga todos os dados)
```bash
docker-compose down -v
```

### Ver logs do PostgreSQL
```bash
docker-compose logs -f postgres
```

### Ver status dos containers
```bash
docker-compose ps
```

### Acessar o PostgreSQL via CLI
```bash
docker-compose exec postgres psql -U raceflow_user -d raceflow_db
```

### Executar comando SQL
```bash
docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db -c "SELECT version();"
```

## String de Conexão

Para usar no backend, a string de conexão será:
```
postgresql://raceflow_user:raceflow_password@localhost:5432/raceflow_db
```

Ou usando variáveis de ambiente:
```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
```

## Verificação

Para verificar se o PostgreSQL está rodando e saudável:
```bash
docker ps --filter "name=raceflow_postgres"
```

O status deve mostrar `(healthy)` quando estiver pronto.

## Troubleshooting

### Container não inicia
- Verifique se a porta 5432 não está em uso: `netstat -ano | findstr :5432`
- Verifique os logs: `docker-compose logs postgres`

### Erro de permissão
- No Windows, certifique-se de que o Docker Desktop está rodando
- Verifique se você tem permissões para criar volumes

### Resetar banco de dados
```bash
docker-compose down -v
docker-compose up -d
```





