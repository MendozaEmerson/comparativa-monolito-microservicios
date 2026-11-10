# ==============================================================================
# run-experiment.ps1
# Script maestro del experimento: Levanta tratamientos y ejecuta pruebas k6
# UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software (Hito 2)
# ==============================================================================

param(
    [ValidateSet("monolith","microservices","both")]
    [string]$Tratamiento = "both",

    [ValidateSet("smoke","load","stress","resilience","all")]
    [string]$Prueba = "all"
)

$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RESULTS_DIR = "$ROOT\benchmark\results"

if (-not (Test-Path $RESULTS_DIR)) {
    New-Item -ItemType Directory -Path $RESULTS_DIR | Out-Null
}

function Write-Header($msg) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
}

function Run-K6Test($testFile, $baseUrl, $tratamiento) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $nombre = [System.IO.Path]::GetFileNameWithoutExtension($testFile)
    $output = "$RESULTS_DIR\${nombre}_${tratamiento}_$timestamp.json"

    Write-Host "  Ejecutando: $testFile" -ForegroundColor Yellow
    Write-Host "  URL: $baseUrl  → Resultados: $output"

    k6 run `
        --env BASE_URL=$baseUrl `
        --out "json=$output" `
        "$ROOT\benchmark\k6\$testFile"

    Write-Host "  [OK] Prueba completada. Archivo: $output" -ForegroundColor Green
}

function Run-Tratamiento($nombre, $composeFile, $baseUrl) {
    Write-Header "INICIANDO TRATAMIENTO: $($nombre.ToUpper())"

    # Levantar el tratamiento
    Write-Host "`n[1/4] Levantando entorno Docker ($nombre)..." -ForegroundColor Yellow
    docker compose -f "$ROOT\$composeFile" up -d
    
    Write-Host "[2/4] Esperando 30 segundos para que los servicios estén listos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30

    # Ejecutar las pruebas según lo solicitado
    Write-Host "[3/4] Ejecutando pruebas de carga..." -ForegroundColor Yellow

    if ($Prueba -eq "smoke" -or $Prueba -eq "all") {
        Run-K6Test "01-smoke-test.js" $baseUrl $nombre
    }
    if ($Prueba -eq "load" -or $Prueba -eq "all") {
        Run-K6Test "02-load-test.js" $baseUrl $nombre
    }
    if ($Prueba -eq "stress" -or $Prueba -eq "all") {
        Run-K6Test "03-stress-contention.js" $baseUrl $nombre
    }
    if ($Prueba -eq "resilience" -or $Prueba -eq "all") {
        Write-Host "  [Resiliencia] Iniciando colector de métricas en segundo plano..." -ForegroundColor Magenta
        Start-Job -ScriptBlock {
            param($script, $t)
            & $script -Tratamiento $t -DuracionSegundos 130
        } -ArgumentList "$ROOT\benchmark\scripts\collect-docker-stats.ps1", $nombre
        
        Run-K6Test "04-resilience.js" $baseUrl $nombre
    }

    # Detener el tratamiento
    Write-Host "[4/4] Deteniendo entorno Docker ($nombre)..." -ForegroundColor Yellow
    docker compose -f "$ROOT\$composeFile" down
    Write-Host "  Entorno detenido correctamente." -ForegroundColor Green
}

# ---- INICIO DEL EXPERIMENTO ----
Write-Header "TAIS HITO 2 - EXPERIMENTO COMPARATIVO ARQUITECTURAL"
Write-Host "  Proyecto: Monolito Modular vs. Microservicios (Patrón Strangler Fig)"
Write-Host "  App de Estudio: Hi.Events (HiEventsDev/Hi.Events)"
Write-Host "  Equipo: UNSA - EPIS"
Write-Host "  Tratamiento seleccionado: $($Tratamiento.ToUpper())"
Write-Host "  Prueba seleccionada: $($Prueba.ToUpper())"

if ($Tratamiento -eq "monolith" -or $Tratamiento -eq "both") {
    Run-Tratamiento "monolith" "docker-compose.monolith.yml" "http://localhost:8123"
}

if ($Tratamiento -eq "microservices" -or $Tratamiento -eq "both") {
    Run-Tratamiento "microservices" "docker-compose.microservices.yml" "http://localhost:8123"
}

Write-Header "EXPERIMENTO FINALIZADO"
Write-Host "  Resultados guardados en: $RESULTS_DIR" -ForegroundColor Green
Write-Host "  Para analizar los datos, usa el script Python en benchmark/scripts/analyze.py"
