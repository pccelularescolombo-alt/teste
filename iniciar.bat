@echo off
chcp 65001 >nul
title Radio Pinheirinho Celulares
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

:: ===== Auto-atualiza o atualizador.js ANTES de iniciar =====
:: Baixa direto de um link fixo do Google Drive (nao depende do
:: codigo antigo/quebrado, entao sempre funciona). Troque SEU_ID_AQUI
:: pelo ID do arquivo atualizador.js publico no Drive.
set ATUALIZADOR_FILE_ID=SEU_ID_AQUI
if not "%ATUALIZADOR_FILE_ID%"=="https://drive.google.com/file/d/1vXZU3mZRD4bOK6VEKlopsn1bL4v_80Ah/view?usp=sharing" (
  echo Verificando atualizador.js...
  powershell -NoProfile -Command ^
    "try { Invoke-WebRequest -Uri 'https://drive.usercontent.google.com/download?id=%ATUALIZADOR_FILE_ID%&export=download' -OutFile 'atualizador.js.new' -UseBasicParsing; if ((Get-Item 'atualizador.js.new').Length -gt 0) { Move-Item -Force 'atualizador.js.new' 'atualizador.js' } } catch { Write-Host 'Falha ao verificar atualizador.js, seguindo com a versao local.' }"
)

:loop
node servidor.js
if %errorlevel%==42 (
  goto loop
)

echo.
echo Servidor encerrado. Pressione qualquer tecla para fechar...
pause >nul
