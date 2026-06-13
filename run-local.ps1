# run-local.ps1
# Load environment variables from .env file
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $key, $val = $line -split '=', 2
            if ($key -and $val) {
                [System.Environment]::SetEnvironmentVariable($key.Trim(), $val.Trim(), "Process")
            }
        }
    }
    Write-Host "Loaded environment variables from .env successfully!" -ForegroundColor Green
} else {
    Write-Host "No .env file found!" -ForegroundColor Yellow
}

# Start Spring Boot backend
Write-Host "Launching Spring Boot backend..." -ForegroundColor Cyan
cd backend
mvn spring-boot:run
