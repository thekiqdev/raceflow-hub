@echo off
REM Script de inicialização do RaceFlow Hub
REM Inicia banco de dados, backend e frontend

echo ========================================
echo    RaceFlow Hub - Inicializacao
echo ========================================
echo.

REM Verificar se Docker está rodando
echo [1/5] Verificando Docker...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Docker nao esta rodando!
    echo Por favor, inicie o Docker Desktop e tente novamente.
    pause
    exit /b 1
)
echo Docker OK!
echo.

REM Iniciar banco de dados
echo [2/5] Iniciando banco de dados PostgreSQL...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ERRO: Falha ao iniciar banco de dados!
    pause
    exit /b 1
)
echo Banco de dados iniciado!
echo Aguardando 5 segundos para o banco ficar pronto...
timeout /t 5 /nobreak >nul
echo.

REM Verificar se migrations já foram executadas
echo [3/5] Verificando migrations...
cd backend

REM Tentar executar migrations (pode falhar se já foram executadas, mas não é crítico)
echo Executando migrations...
psql -h localhost -U raceflow_user -d raceflow_db -f migrations/001_initial_schema.sql >nul 2>&1
psql -h localhost -U raceflow_user -d raceflow_db -f migrations/002_add_indexes.sql >nul 2>&1
psql -h localhost -U raceflow_user -d raceflow_db -f migrations/003_optimize_queries.sql >nul 2>&1

REM Se psql não estiver no PATH, tentar via Docker
if %errorlevel% neq 0 (
    echo Executando migrations via Docker...
    docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db < migrations/001_initial_schema.sql >nul 2>&1
    docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db < migrations/002_add_indexes.sql >nul 2>&1
    docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db < migrations/003_optimize_queries.sql >nul 2>&1
)

echo Migrations verificadas!
cd ..
echo.

REM Verificar se node_modules existe no backend
echo [4/5] Verificando dependencias do backend...
cd backend
if not exist "node_modules" (
    echo Instalando dependencias do backend...
    call npm install
    if %errorlevel% neq 0 (
        echo ERRO: Falha ao instalar dependencias do backend!
        cd ..
        pause
        exit /b 1
    )
)
cd ..
echo.

REM Verificar se node_modules existe no frontend
echo Verificando dependencias do frontend...
if not exist "node_modules" (
    echo Instalando dependencias do frontend...
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo ERRO: Falha ao instalar dependencias do frontend!
        pause
        exit /b 1
    )
)
echo.

REM Iniciar backend em nova janela
echo [5/5] Iniciando servicos...
echo.
echo Iniciando Backend (porta 3001)...
start "RaceFlow Backend" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak >nul

REM Iniciar frontend em nova janela
echo Iniciando Frontend (porta 5173)...
start "RaceFlow Frontend" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo    Sistema iniciado com sucesso!
echo ========================================
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Pressione qualquer tecla para fechar esta janela.
echo As janelas do backend e frontend permanecerao abertas.
echo.
pause >nul





