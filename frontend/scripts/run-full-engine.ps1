# ============================================================
# Hyper-Optimized Regime-Adaptive Institutional Engine Runner
# Step 1: Sync 6-month 15m candle data via /api/optimize/sync-data
# Step 2: Run portfolio simulation locally via Node.js
# ============================================================

$BASE = "https://algobot-frontend.vercel.app"

$COINS = @(
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
  "ADAUSDT","AVAXUSDT","LINKUSDT","DOTUSDT","DOGEUSDT",
  "UNIUSDT","LTCUSDT","APTUSDT","SUIUSDT","NEARUSDT",
  "OPUSDT","ARBUSDT","INJUSDT","TIAUSDT","SHIBUSDT"
)

$CHUNK_DELAY_MS = 400   # ms between chunk calls (rate-limit buffer)
$MAX_CHUNKS     = 40    # 40 × 5-day chunks = 200 days > 6 months

# ── STEP 1: Sync candle data for all coins ────────────────────
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  STEP 1 — Syncing 6-month 15m data via /sync-data       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$totalInserted = 0
$failedCoins   = @()

for ($ci = 0; $ci -lt $COINS.Count; $ci++) {
    $coin    = $COINS[$ci]
    $since   = 0
    $chunk   = 0
    $done    = $false
    $coinIns = 0

    Write-Host "[$($ci+1)/$($COINS.Count)] $coin" -ForegroundColor Yellow -NoNewline

    while (-not $done -and $chunk -lt $MAX_CHUNKS) {
        $isFirst = ($chunk -eq 0)
        $qs = "coin=$coin&since=$since"
        if ($isFirst) { $qs += "&reset=true" }

        try {
            $resp = Invoke-RestMethod -Uri "$BASE/api/optimize/sync-data?$qs" `
                                      -Method GET -TimeoutSec 65

            $coinIns += $resp.inserted
            Write-Host " $($resp.progress)%" -NoNewline

            if ($resp.done -or -not $resp.nextSince) {
                $done = $true
            } else {
                $since = $resp.nextSince
                $chunk++
                Start-Sleep -Milliseconds $CHUNK_DELAY_MS
            }
        }
        catch {
            $msg = $_.Exception.Message
            if ($msg -match "429") {
                Write-Host " [rate-limit 65s]" -ForegroundColor Magenta -NoNewline
                Start-Sleep -Seconds 65
            } elseif ($msg -match "504|timeout|timed out") {
                Write-Host " [timeout, retry]" -ForegroundColor Yellow -NoNewline
                Start-Sleep -Seconds 5
                # Retry same since value — idempotent upsert is safe
            } else {
                Write-Host " [ERR: $msg]" -ForegroundColor Red
                $failedCoins += $coin
                $done = $true
            }
        }
    }

    $totalInserted += $coinIns
    Write-Host "  ✓ $coinIns rows" -ForegroundColor Green
}

Write-Host "`n✅ Sync complete. Total rows inserted: $totalInserted" -ForegroundColor Green
if ($failedCoins.Count -gt 0) {
    Write-Host "⚠  Failed coins: $($failedCoins -join ', ')" -ForegroundColor Red
}

# ── STEP 2: Run portfolio simulation engine ───────────────────
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  STEP 2 — Running Regime-Adaptive Simulation Engine      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$scriptPath = Join-Path $PSScriptRoot "portfolio-simulation.mjs"
node $scriptPath

Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ENGINE RUN COMPLETE — Results saved to Supabase          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
