# 디데이 푸시 발송 + 큐 워커 두 cron 을 Windows 작업 스케줄러에 등록
#
# 동작 모델:
#   1) GnuboardDdayPush       — 매일 1회 (기본 09:00). 디데이 매칭 → push_queue INSERT.
#   2) GnuboardPushQueueWorker — 매분 1회. push_queue 의 pending 을 100건씩 drain.
#
# 큐를 분리한 이유:
#   - 매일 9시 단일 cron 으로 직접 발송하면 MAU 1만+ 에선 타임아웃 / 부분 발송 위험.
#   - enqueue 는 INSERT 만 — 빠르게 끝남. 발송은 worker 가 시간 예산 안에서 처리,
#     남으면 다음 cron 이 이어받아 durable.
#
# 사용:
#   PowerShell 관리자 모드, 그누보드 루트에서 (-ProjectDir 는 그 루트):
#   .\plugin\webapp\cron\install-windows-task.ps1 -ProjectDir C:\xampp\www\gnuboard5
#
# 제거:
#   Unregister-ScheduledTask -TaskName 'GnuboardDdayPush' -Confirm:$false
#   Unregister-ScheduledTask -TaskName 'GnuboardPushQueueWorker' -Confirm:$false

param(
    [string]$EnqueueTaskName = 'GnuboardDdayPush',
    [string]$WorkerTaskName  = 'GnuboardPushQueueWorker',
    [string]$CleanupTokensTaskName = 'GnuboardCleanupPushTokens',
    [string]$PurgeWithdrawnTaskName = 'GnuboardPurgeWithdrawn',
    [string]$Time            = '09:00',
    [string]$ProjectDir      = 'C:\xampp\www\gnuboard5'
)

$ErrorActionPreference = 'Stop'

$phpExe          = 'C:\xampp\php\php.exe'
$enqueueScript   = Join-Path $ProjectDir 'plugin\dday\cron\send_dday_push.php'
$workerScript    = Join-Path $ProjectDir 'plugin\webapp\cron\process_push_queue.php'
$cleanupScript   = Join-Path $ProjectDir 'plugin\webapp\cron\cleanup_push_tokens.php'
$purgeScript     = Join-Path $ProjectDir 'plugin\webapp\cron\purge_withdrawn_members.php'
$logDir          = Join-Path $ProjectDir 'data\dday_push_logs'
$enqueueLog      = Join-Path $logDir 'push.enqueue.log'
$enqueueErr      = Join-Path $logDir 'push.enqueue.err.log'
$workerLog       = Join-Path $logDir 'push.worker.log'
$workerErr       = Join-Path $logDir 'push.worker.err.log'
$cleanupLog      = Join-Path $logDir 'push.cleanup.log'
$cleanupErr      = Join-Path $logDir 'push.cleanup.err.log'
$purgeLog        = Join-Path $logDir 'members.purge.log'
$purgeErr        = Join-Path $logDir 'members.purge.err.log'

if (-not (Test-Path $phpExe))        { throw "PHP not found: $phpExe" }
# 디데이 인큐는 디데이 앱(plugin/dday)이 있는 사이트만 쓴다. 없으면 그 작업만 건너뛴다.
$hasEnqueue = Test-Path $enqueueScript
if (-not $hasEnqueue) { Write-Host "D-day enqueue script not found, skipping that task: $enqueueScript" }
if (-not (Test-Path $workerScript))  { throw "Script not found: $workerScript" }
if (-not (Test-Path $cleanupScript)) { Write-Warning "Optional script missing: $cleanupScript" }
if (-not (Test-Path $purgeScript))   { Write-Warning "Optional script missing: $purgeScript" }
if (-not (Test-Path $logDir))        { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# ---------------------------------------------------------------------------
# 1) Enqueue 작업 — 매일 1회
# ---------------------------------------------------------------------------
if ($hasEnqueue) {
    $enqueueArgs = "/c `"$phpExe`" `"$enqueueScript`" >> `"$enqueueLog`" 2> `"$enqueueErr`""
    $enqueueAction  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $enqueueArgs -WorkingDirectory $ProjectDir
    $enqueueTrigger = New-ScheduledTaskTrigger -Daily -At $Time
    $enqueueSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    if (Get-ScheduledTask -TaskName $EnqueueTaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $EnqueueTaskName -Confirm:$false
        Write-Host "Existing task '$EnqueueTaskName' removed."
    }

    Register-ScheduledTask -TaskName $EnqueueTaskName -Action $enqueueAction -Trigger $enqueueTrigger -Settings $enqueueSettings -Description '디데이 매칭 → push_queue 인큐 (매일)' | Out-Null

    Write-Host "Registered '$EnqueueTaskName' (daily at $Time)."
}

# ---------------------------------------------------------------------------
# 2) Worker 작업 — 매분 1회 (push_queue drain)
# ---------------------------------------------------------------------------
$workerArgs = "/c `"$phpExe`" `"$workerScript`" >> `"$workerLog`" 2> `"$workerErr`""
$workerAction  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $workerArgs -WorkingDirectory $ProjectDir

# 매분 트리거 — 한 번 시작해서 무한 반복 (1분 간격).
$workerTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$workerSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances 'IgnoreNew'

if (Get-ScheduledTask -TaskName $WorkerTaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $WorkerTaskName -Confirm:$false
    Write-Host "Existing task '$WorkerTaskName' removed."
}

Register-ScheduledTask -TaskName $WorkerTaskName -Action $workerAction -Trigger $workerTrigger -Settings $workerSettings -Description 'push_queue drain (매분)' | Out-Null

Write-Host "Registered '$WorkerTaskName' (every 1 minute, dedup IgnoreNew)."

# ---------------------------------------------------------------------------
# 3) 푸시 토큰 cleanup — 매일 04:00 (90일 미사용 토큰 정리)
# ---------------------------------------------------------------------------
if (Test-Path $cleanupScript) {
    $cleanupArgs = "/c `"$phpExe`" `"$cleanupScript`" >> `"$cleanupLog`" 2> `"$cleanupErr`""
    $cleanupAction  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cleanupArgs -WorkingDirectory $ProjectDir
    $cleanupTrigger = New-ScheduledTaskTrigger -Daily -At '04:00'
    $cleanupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    if (Get-ScheduledTask -TaskName $CleanupTokensTaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $CleanupTokensTaskName -Confirm:$false
        Write-Host "Existing task '$CleanupTokensTaskName' removed."
    }
    Register-ScheduledTask -TaskName $CleanupTokensTaskName -Action $cleanupAction -Trigger $cleanupTrigger -Settings $cleanupSettings -Description '죽은/오래된 push token 정리 (매일 04:00)' | Out-Null
    Write-Host "Registered '$CleanupTokensTaskName' (daily 04:00)."
}

# ---------------------------------------------------------------------------
# 4) 탈퇴 회원 hard-purge — 매일 04:30 (30일 grace period 지난 회원)
# ---------------------------------------------------------------------------
if (Test-Path $purgeScript) {
    $purgeArgs = "/c `"$phpExe`" `"$purgeScript`" >> `"$purgeLog`" 2> `"$purgeErr`""
    $purgeAction  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $purgeArgs -WorkingDirectory $ProjectDir
    $purgeTrigger = New-ScheduledTaskTrigger -Daily -At '04:30'
    $purgeSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

    if (Get-ScheduledTask -TaskName $PurgeWithdrawnTaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $PurgeWithdrawnTaskName -Confirm:$false
        Write-Host "Existing task '$PurgeWithdrawnTaskName' removed."
    }
    Register-ScheduledTask -TaskName $PurgeWithdrawnTaskName -Action $purgeAction -Trigger $purgeTrigger -Settings $purgeSettings -Description '탈퇴 30일 지난 회원 hard-purge (매일 04:30)' | Out-Null
    Write-Host "Registered '$PurgeWithdrawnTaskName' (daily 04:30)."
}

Write-Host ""
Write-Host "Logs:"
Write-Host "  enqueue: $enqueueLog (err: $enqueueErr)"
Write-Host "  worker:  $workerLog (err: $workerErr)"
Write-Host "  cleanup: $cleanupLog (err: $cleanupErr)"
Write-Host "  purge:   $purgeLog (err: $purgeErr)"
Write-Host ""
Write-Host "수동 실행 테스트:"
Write-Host "  Start-ScheduledTask -TaskName '$EnqueueTaskName'"
Write-Host "  Start-ScheduledTask -TaskName '$WorkerTaskName'"
Write-Host "  또는 직접: $phpExe $enqueueScript --dry-run"
Write-Host "  또는 직접: $phpExe $workerScript --verbose"
