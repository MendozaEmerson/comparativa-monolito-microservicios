# ==============================================================================
# collect-docker-stats.ps1
# Script PowerShell: Muestreo de CPU y RAM por contenedor cada 1 segundo (CSV)
# Genera archivo de métricas listo para análisis estadístico en Excel/Python
# UNSA - EPIS | Tópicos Avanzados en Ingeniería de Software (Hito 2)
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("monolith","microservices")]
    [string]$Tratamiento,

    [int]$DuracionSegundos = 150,
    [string]$OutputDir = ".\benchmark\results"
)

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$OutputFile = "$OutputDir\metricas_${Tratamiento}_$Timestamp.csv"

# Crear carpeta de resultados si no existe
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Encabezado CSV
"timestamp,contenedor,cpu_pct,mem_mib,mem_limit_mib,mem_pct,net_in_mb,net_out_mb" | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host "========================================================"
Write-Host "  TAIS Hito 2 - Recolección de Métricas Docker"
Write-Host "  Tratamiento: $($Tratamiento.ToUpper())"
Write-Host "  Duración:    $DuracionSegundos segundos"
Write-Host "  Salida:      $OutputFile"
Write-Host "========================================================"
Write-Host "Presiona Ctrl+C para detener anticipadamente."
Write-Host ""

$Inicio = Get-Date
$Contador = 0

while ((Get-Date) -lt $Inicio.AddSeconds($DuracionSegundos)) {
    try {
        # Capturar stats de todos los contenedores del experimento en un solo frame
        $statsRaw = docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}}" 2>$null
        
        if ($statsRaw) {
            $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
            
            foreach ($linea in $statsRaw) {
                # Solo capturar contenedores del experimento TAIS
                if ($linea -notmatch "tais-") { continue }
                
                $partes = $linea -split ","
                if ($partes.Length -lt 5) { continue }

                $nombre    = $partes[0].Trim()
                $cpuStr    = $partes[1].Trim() -replace '%', ''
                $memStr    = $partes[2].Trim()   # Ej: "256MiB / 1GiB"
                $memPctStr = $partes[3].Trim() -replace '%', ''
                $netStr    = $partes[4].Trim()   # Ej: "1.5kB / 2.3MB"

                # Parsear uso de memoria
                $memParts = $memStr -split " / "
                $memUsedMib  = [double]($memParts[0] -replace '[^0-9.]', '') 
                $memLimitMib = [double]($memParts[1] -replace '[^0-9.]', '')

                # Ajustar a MiB si viene en GiB
                if ($memStr -match "GiB") { $memLimitMib = $memLimitMib * 1024 }
                if ($memParts[0] -match "GiB") { $memUsedMib = $memUsedMib * 1024 }
                if ($memParts[0] -match "kB")  { $memUsedMib = $memUsedMib / 1024 }

                # Parsear tráfico de red
                $netParts  = $netStr -split " / "
                $netInMb   = [double]($netParts[0] -replace '[^0-9.]', '')
                $netOutMb  = [double]($netParts[1] -replace '[^0-9.]', '')
                if ($netStr -match "kB") { $netInMb = $netInMb / 1024 }

                "$ts,$nombre,$cpuStr,$([math]::Round($memUsedMib,2)),$([math]::Round($memLimitMib,2)),$memPctStr,$([math]::Round($netInMb,3)),$([math]::Round($netOutMb,3))" |
                    Out-File -FilePath $OutputFile -Encoding UTF8 -Append
            }
        }
    } catch {
        Write-Warning "Error en muestreo $Contador : $_"
    }

    $Contador++
    if ($Contador % 10 -eq 0) {
        $elapsed = [int]((Get-Date) - $Inicio).TotalSeconds
        Write-Host "[$elapsed s / $DuracionSegundos s] $Contador muestras capturadas..."
    }

    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "COMPLETADO. Métricas guardadas en: $OutputFile"
Write-Host "Total de muestras capturadas: $Contador"
