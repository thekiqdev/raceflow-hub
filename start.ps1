# Script de inicialização do RaceFlow Hub (PowerShell)
# Inicia banco de dados, backend e frontend

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   RaceFlow Hub - Inicialização" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está rodando
Write-Host "[1/5] Verificando Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "Docker OK!" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker não está rodando!" -ForegroundColor Red
    Write-Host "Por favor, inicie o Docker Desktop e tente novamente." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}
Write-Host ""

# Iniciar banco de dados
Write-Host "[2/5] Iniciando banco de dados PostgreSQL..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao iniciar banco de dados!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}
Write-Host "Banco de dados iniciado!" -ForegroundColor Green
Write-Host "Aguardando 5 segundos para o banco ficar pronto..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host ""

# Verificar e executar migrations
Write-Host "[3/5] Verificando migrations..." -ForegroundColor Yellow
Set-Location backend

# Tentar executar migrations via psql
$migrations = @(
    "migrations/001_initial_schema.sql",
    "migrations/002_add_indexes.sql",
    "migrations/003_optimize_queries.sql"
)

$migrationSuccess = $false
foreach ($migration in $migrations) {
    try {
        $env:PGPASSWORD = "raceflow_password"
        psql -h localhost -U raceflow_user -d raceflow_db -f $migration 2>&1 | Out-Null
        $migrationSuccess = $true
    } catch {
        # Se psql não estiver disponível, tentar via Docker
        try {
            Get-Content $migration | docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db 2>&1 | Out-Null
            $migrationSuccess = $true
        } catch {
            Write-Host "Aviso: Não foi possível executar $migration (pode já estar executada)" -ForegroundColor Yellow
        }
    }
}

Set-Location ..
Write-Host "Migrations verificadas!" -ForegroundColor Green
Write-Host ""

# Verificar dependências do backend
Write-Host "[4/5] Verificando dependências do backend..." -ForegroundColor Yellow
Set-Location backend
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependências do backend..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao instalar dependências do backend!" -ForegroundColor Red
        Set-Location ..
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}
Set-Location ..
Write-Host ""

# Verificar dependências do frontend
Write-Host "Verificando dependências do frontend..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependências do frontend..." -ForegroundColor Yellow
    npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao instalar dependências do frontend!" -ForegroundColor Red
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}
Write-Host ""

# Iniciar backend
Write-Host "[5/5] Iniciando serviços..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Iniciando Backend (porta 3001)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; npm run dev"
Start-Sleep -Seconds 3

# Iniciar frontend
Write-Host "Iniciando Frontend (porta 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev"
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Sistema iniciado com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "As janelas do backend e frontend foram abertas." -ForegroundColor Yellow
Write-Host "Pressione qualquer tecla para fechar esta janela..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")





