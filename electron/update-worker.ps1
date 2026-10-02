# Embedded as an EncodedCommand by SCOUT. Paths are decoded data, never script.
$ErrorActionPreference = 'Stop'
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__SCOUT_PARAMETERS__')) | ConvertFrom-Json
$replaced = $false
$nextProcess = $null
function Write-Record($filename, $record) {
  $temp = $filename + '.tmp'
  [IO.File]::WriteAllText($temp, ($record | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
  if ([IO.File]::Exists($filename)) { [IO.File]::Replace($temp, $filename, $null) }
  else { [IO.File]::Move($temp, $filename) }
}
function Check-File($filename, $hash, $size) {
  $item = Get-Item -LiteralPath $filename -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'An executable path became a link or directory.' }
  if ($size -gt 0 -and $item.Length -ne $size) { throw 'The update size changed before installation.' }
  if ((Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'An executable changed before installation.' }
}
function Start-Game {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $p.target
  $start.WorkingDirectory = [IO.Path]::GetDirectoryName($p.target)
  $start.UseShellExecute = $false
  $start.EnvironmentVariables.Remove('PORTABLE_EXECUTABLE_FILE')
  $start.EnvironmentVariables.Remove('PORTABLE_EXECUTABLE_DIR')
  $start.EnvironmentVariables.Remove('PORTABLE_EXECUTABLE_APP_FILENAME')
  return [Diagnostics.Process]::Start($start)
}
try {
  if ($p.token -notmatch '^[a-f0-9-]{36}$' -or $p.pids.Count -lt 1) { throw 'Invalid update transaction.' }
  Check-File $p.replacement $p.sha256 $p.size
  Check-File $p.target $p.originalHash 0
  Write-Record $p.ready @{ token = $p.token }
  # The renderer's last position is flushed before the main process quits.
  # The outer NSIS portable launcher then closes and releases its own file.
  $deadline = [DateTime]::UtcNow.AddSeconds(150)
  foreach ($processId in $p.pids) {
    try { $old = [Diagnostics.Process]::GetProcessById([int]$processId) }
    catch { continue }
    $remaining = [int][Math]::Max(0, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    if (-not $old.WaitForExit($remaining)) { throw 'SCOUT did not finish closing. The current executable was left unchanged.' }
    $old.Dispose()
  }
  Check-File $p.replacement $p.sha256 $p.size
  Check-File $p.target $p.originalHash 0
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ($true) {
    try {
      # Replacement and backup are siblings: Windows keeps this operation on
      # one volume and preserves the original if replacement cannot succeed.
      [IO.File]::Replace($p.replacement, $p.target, $p.backup, $false)
      $replaced = $true
      break
    } catch {
      if ([DateTime]::UtcNow -ge $deadline) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
  Check-File $p.target $p.sha256 $p.size
  $nextProcess = Start-Game
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  $acknowledged = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([IO.File]::Exists($p.acknowledgement)) {
      try {
        $ack = [IO.File]::ReadAllText($p.acknowledgement) | ConvertFrom-Json
        if ($ack.token -eq $p.token -and $ack.version -eq $p.to) { $acknowledged = $true; break }
      } catch { }
    }
    if ($nextProcess.HasExited) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $acknowledged) { throw 'The updated game did not reach its startup checkpoint.' }
  Write-Record $p.result @{ status = 'installed'; from = $p.from; to = $p.to; message = ('SCOUT updated to ' + $p.to + '. Your career was preserved.'); backup = $p.backup }
  Remove-Item -LiteralPath $p.pending -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $p.acknowledgement -Force -ErrorAction SilentlyContinue
} catch {
  $failure = $_.Exception.Message
  $status = 'error'
  if ($replaced -and [IO.File]::Exists($p.backup)) {
    try {
      if ($nextProcess -and -not $nextProcess.HasExited) {
        # Only terminate the new launch's process tree so its file can unlock.
        $taskkill = [IO.Path]::Combine($env:SystemRoot, 'System32', 'taskkill.exe')
        & $taskkill /PID $nextProcess.Id /T /F 2>&1 | Out-Null
        $nextProcess.WaitForExit(10000) | Out-Null
      }
      Check-File $p.backup $p.originalHash 0
      [IO.File]::Replace($p.backup, $p.target, $p.failed, $false)
      $status = 'rolled-back'
      $failure = 'The update could not start. The previous SCOUT version was restored; your career is unchanged.'
    } catch {
      $failure = 'The update could not start. Your career is safe in its original save folder. The previous executable remains beside the game as a .bak file.'
    }
  }
  try { Write-Record $p.result @{ status = $status; from = $p.from; to = $p.to; message = $failure; backup = $p.backup } } catch { }
  if ($status -eq 'rolled-back' -or -not $replaced) { try { Start-Game | Out-Null } catch { } }
  try { Remove-Item -LiteralPath $p.pending -Force -ErrorAction SilentlyContinue } catch { }
} finally {
  # Save files are deliberately absent from this transaction and all cleanup.
  Remove-Item -LiteralPath $p.ready -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $p.replacement -Force -ErrorAction SilentlyContinue
}
