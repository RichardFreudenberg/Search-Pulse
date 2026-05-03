# pipeline/run_daily.ps1
# ──────────────────────
# Daily pipeline job — runs automatically via Windows Task Scheduler.
# Step 1: Fetch fresh German company data from Bundesanzeiger / Unternehmensregister
# Step 2: Fetch P&L financials from Bundesanzeiger for all companies
# Step 3: Sync everything (companies + financials) to Firebase CRM

# ── Config ────────────────────────────────────────────────────────────────────
$ProjectRoot   = "C:\Users\richf\Documents\01 MBA\01 HBS\01 Academics\02 RC2\06 DSAIL\search-fund-crm"
$PythonExe     = "python"
$LogFile       = "$ProjectRoot\pipeline\data\daily_run.log"
$Runner        = "$ProjectRoot\pipeline\run_simple.py"

# Firebase credentials — fill in FIREBASE_USER_ID if not already set
$env:FIREBASE_PROJECT_ID        = "search-pulse"
$env:FIREBASE_CREDENTIALS_PATH  = "$ProjectRoot\pipeline\config\serviceAccountKey.json"
# Set this once — your Firebase Auth UID (find it in Firebase Console → Authentication)
if (-not $env:FIREBASE_USER_ID) {
    $env:FIREBASE_USER_ID = "YOUR_FIREBASE_USER_ID_HERE"
}

# ── Searches to run each day ──────────────────────────────────────────────────
# Edit these to match your target sectors / geographies
$Queries = @(
    "GmbH München",
    "GmbH Hamburg",
    "GmbH Berlin",
    "GmbH Frankfurt",
    "Maschinenbau GmbH",
    "Software GmbH",
    "Technologie GmbH",
    "Handel GmbH"
)

$PagesPerQuery = 3   # ~30 companies per query

# ── Helpers ───────────────────────────────────────────────────────────────────
function Log($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Add-Content $LogFile $line
    Write-Host $line
}

# ── Start ─────────────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "$ProjectRoot\pipeline\data" | Out-Null
Add-Content $LogFile ""
Add-Content $LogFile "========== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =========="
Log "SearchPulse daily pipeline starting"

Set-Location $ProjectRoot

# ── Step 1: Fetch new companies ───────────────────────────────────────────────
Log "--- Step 1: Fetching companies ---"
foreach ($Query in $Queries) {
    Log "Fetching: $Query ..."
    $out = & $PythonExe $Runner --query $Query --pages $PagesPerQuery 2>&1
    Log $out
    Start-Sleep -Seconds 5
}

# ── Step 2: Fetch financials for all companies ────────────────────────────────
Log "--- Step 2: Fetching P&L financials from Bundesanzeiger ---"
$finOut = & $PythonExe $Runner --financials 2>&1
Log $finOut

# ── Step 3: Sync companies + financials to Firestore ─────────────────────────
Log "--- Step 3: Syncing to Firebase CRM ---"
$syncOut = & $PythonExe $Runner --sync-firestore 2>&1
Log $syncOut

# Also sync any newly fetched financials
$finSyncOut = & $PythonExe $Runner --refresh-financials --sync 2>&1
Log $finSyncOut

Log "Daily pipeline complete. Log: $LogFile"
