$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$script:stopping = $false

function Write-RecognitionEvent($payload) {
  try {
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  } catch {
    # Ignore serialization failures so the recognizer stays alive.
  }
}

try {
  Add-Type -AssemblyName System.Speech
} catch {
  Write-RecognitionEvent @{ type = "error"; message = "Windows System.Speech is unavailable: $($_.Exception.Message)" }
  exit 1
}

$culture = $null
$recognizer = $null
try {
  $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if (-not $installed -or $installed.Count -eq 0) {
    Write-RecognitionEvent @{ type = "error"; message = "No Windows desktop speech recognizer is installed. Enable Speech in Windows Settings." }
    exit 1
  }

  $culture = $installed | Where-Object { $_.Culture.Name -like "en-*" } | Select-Object -First 1
  if (-not $culture) {
    $culture = $installed | Select-Object -First 1
  }

  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
  $dictation = New-Object System.Speech.Recognition.DictationGrammar
  $dictation.Name = "FreeformDictation"
  $recognizer.LoadGrammar($dictation)
  $recognizer.SetInputToDefaultAudioDevice()
  $recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(0)
  $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(0)
  $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(500)
} catch {
  Write-RecognitionEvent @{ type = "error"; message = "Unable to start Windows speech recognition: $($_.Exception.Message)" }
  if ($recognizer) { $recognizer.Dispose() }
  exit 1
}

function Start-RecognitionLoop {
  if ($script:stopping -or -not $recognizer) { return }
  try {
    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  } catch {
    Write-RecognitionEvent @{ type = "error"; message = "Recognizer failed to listen: $($_.Exception.Message)" }
  }
}

$recognizer.add_SpeechRecognized({
  param($sender, $event)
  if ($event.Result -and $event.Result.Text) {
    Write-RecognitionEvent @{
      type = "final"
      text = $event.Result.Text
      confidence = $event.Result.Confidence
    }
  }
})

$recognizer.add_RecognizeCompleted({
  param($sender, $event)
  if ($event.Error) {
    Write-RecognitionEvent @{ type = "error"; message = $event.Error.Message }
  }
  if (-not $script:stopping) {
    Start-Sleep -Milliseconds 100
    Start-RecognitionLoop
  }
})

$recognizer.add_SpeechRecognitionRejected({
  param($sender, $event)
  if ($event.Result -and $event.Result.Text -and $event.Result.Text.Trim().Length -gt 1) {
    Write-RecognitionEvent @{
      type = "final"
      text = $event.Result.Text
      confidence = $event.Result.Confidence
    }
  }
})

Write-RecognitionEvent @{
  type = "ready"
  engine = $recognizer.RecognizerInfo.Name
  culture = $culture.Culture.Name
}
Start-RecognitionLoop

try {
  while (-not $script:stopping) {
    Start-Sleep -Milliseconds 250
  }
} finally {
  $script:stopping = $true
  try { $recognizer.RecognizeAsyncCancel() } catch { }
  try { $recognizer.Dispose() } catch { }
}
