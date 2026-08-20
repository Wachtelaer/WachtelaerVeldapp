@echo off
REM Runs the backup with this .bat file's own folder as the working
REM directory, regardless of what directory Task Scheduler starts in.
cd /d "%~dp0"
node backup.js >> backup.log 2>&1
