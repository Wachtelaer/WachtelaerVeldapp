@echo off
REM Runs the backup with this .bat file's own folder as the working
REM directory, regardless of what directory Task Scheduler starts in.
cd /d "%~dp0"

REM Pull the latest fixes before every run — otherwise a scheduled run
REM just keeps re-running whatever code happened to be on disk since the
REM last manual "git pull", silently missing any later update. If this
REM fails (e.g. no network), it's just logged — the backup still runs
REM with whatever code is already there.
git -C "%~dp0..\.." pull --ff-only >> backup.log 2>&1

node backup.js >> backup.log 2>&1
