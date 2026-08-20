# Formulieren backup

Daily local backup of every ingevuld formulier (onderhoud airco,
onderhoud ventilatie, recuperatie koelmiddel, druktest leidingen, opstart
airco): one PDF per formulier (klantgegevens, ingevulde velden, nota)
plus a zip of its photos, written to a folder per klant on this machine.
Skips anything already backed up, so a missed day or a re-run is
harmless.

This runs independently of the app — it's a small standalone Node.js
script meant for a Windows machine that's always on, scheduled daily via
Task Scheduler. It's a separate script from `../backup-opmetingen` and
`../backup-werfrapporten` (different table, different folder) so all
three can run on their own schedules.

## Setup

### 1. Install Node.js (skip if already installed, e.g. you already set up
   the opmetingen or werfrapporten backup on this same machine)

Download the **LTS** installer from [nodejs.org](https://nodejs.org) and
run it with defaults. Open a **new** Command Prompt afterwards (PATH
changes don't apply to windows already open) and confirm with:

```
node -v
```

### 2. Configure

```
cd scripts\backup-formulieren
copy .env.example .env
npm install
```

Edit `.env`:
- `SUPABASE_URL` — Project Settings → API → Project URL (same value as
  the other backups' `.env`)
- `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → **service_role**
  key (same value too). This is a secret that bypasses row-level security
  (needed so the backup sees every formulier) — never put it in the app,
  never commit it, never share it outside this one `.env` file.
- `BACKUP_DIR` — already defaulted to `P:\Projecten Linear\App\Formulieren`

### 3. Try it once by hand

```
node backup.js
```

You should see a summary line like:
```
Klaar — 3 nieuwe pdf('s), 1 nieuwe foto-zip(s), 0 formulieren waren al volledig gebackupt.
```
and a subfolder per klant appear in the `BACKUP_DIR` folder, each with
that klant's PDFs (and photo zips, if any).

### 4. Schedule it daily

Same as the other two backups, but as its **own** task pointing at this
folder's `run-backup.bat`:

1. Open **Task Scheduler**
2. **Create Task…** (not "Basic Task", so the "Start in" field is available)
3. **General** tab: name it e.g. `Wachtelaer formulieren backup`. Under
   "Security options", pick **Run whether user is logged on or not**.
4. **Triggers** tab → **New…** → Daily, pick a time (e.g. 02:30, so it
   doesn't overlap the other backups)
5. **Actions** tab → **New…**:
   - Program/script: full path to `run-backup.bat` in this folder, e.g.
     `C:\path\to\WachtelaerVeldapp\scripts\backup-formulieren\run-backup.bat`
   - Start in: the same folder (so the `.env` file is found)
6. Save. Right-click the task → **Run** to test it fires correctly.

Each run appends to `backup.log` in this folder — check that if a
scheduled run doesn't produce the expected files.
