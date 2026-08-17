# Opmetingen backup

Daily local backup of the verkoopmodule's submissions: one PDF per
opmeting (klantgegevens, ingevulde antwoorden, notitie) plus a zip of its
photos, written to a folder on this machine. Skips anything already
backed up, so a missed day or a re-run is harmless.

This runs independently of the app — it's a small standalone Node.js
script meant for a Windows machine that's always on, scheduled daily via
Task Scheduler.

## Setup

### 1. Install Node.js (skip if already installed)

Download the **LTS** installer from [nodejs.org](https://nodejs.org) and
run it with defaults. Open a **new** Command Prompt afterwards (PATH
changes don't apply to windows already open) and confirm with:

```
node -v
```

### 2. Configure

```
cd scripts\backup-opmetingen
copy .env.example .env
npm install
```

Edit `.env`:
- `SUPABASE_URL` — Project Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → **service_role**
  key. This is a secret that bypasses row-level security (needed so the
  backup sees every sales rep's opmetingen) — never put it in the app,
  never commit it, never share it outside this one `.env` file.
- `BACKUP_DIR` — already defaulted to `P:\Projecten Linear\App\Opmetingen`

### 3. Try it once by hand

```
node backup.js
```

You should see a summary line like:
```
Klaar — 3 nieuwe pdf('s), 2 nieuwe foto-zip(s), 0 opmetingen waren al volledig gebackupt.
```
and matching files appear in the `BACKUP_DIR` folder.

### 4. Schedule it daily

1. Open **Task Scheduler** (search it in the Start menu)
2. **Create Task…** (not "Basic Task", so the "Start in" field is available)
3. **General** tab: name it e.g. `Wachtelaer opmetingen backup`. Under
   "Security options", pick **Run whether user is logged on or not** so
   it still runs if nobody's signed in.
4. **Triggers** tab → **New…** → Daily, pick a time (e.g. 02:00)
5. **Actions** tab → **New…**:
   - Program/script: full path to `run-backup.bat` in this folder, e.g.
     `C:\path\to\WachtelaerVeldapp\scripts\backup-opmetingen\run-backup.bat`
   - Start in: the same folder (so the `.env` file is found)
6. Save. Right-click the task → **Run** to test it fires correctly.

Each run appends to `backup.log` in this folder — check that if a
scheduled run doesn't produce the expected files.
