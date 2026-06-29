# Algo Trading Platform

Crypto backtesting platform — FastAPI backend + Next.js frontend.

---

## LOCAL SETUP (Windows)

### Step 1 — Backend

Open **Command Prompt** or **PowerShell** inside the `backend` folder:

```
cd algo-trading-platform\backend
```

Create a virtual environment and install dependencies:
```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Copy the env file and fill in your details:
```
copy .env.example .env
```

Edit `.env` with Notepad — add your Supabase URL and key.
(If you don't have Supabase yet, leave them blank — the bot runs without DB, logs a warning.)

Start the backend:
```
uvicorn app.main:app --reload --port 8000
```

You should see: `Uvicorn running on http://127.0.0.1:8000`
Test it: open http://localhost:8000 in your browser — you should see `{"status":"Algo Trading Platform API running"}`

---

### Step 2 — Frontend

Open a **new** Command Prompt window, navigate to `frontend`:
```
cd algo-trading-platform\frontend
```

Install Node dependencies (requires Node.js — download from nodejs.org if needed):
```
npm install
```

Copy the env file:
```
copy .env.local.example .env.local
```

Start the frontend:
```
npm run dev
```

Open http://localhost:3000 in your browser.

---

### Step 3 — Supabase (optional but recommended)

1. Go to https://supabase.com and create a free account + project
2. Go to: Project → SQL Editor → New Query
3. Paste the contents of `supabase_schema.sql` and click Run
4. Go to: Project → Settings → API
5. Copy `Project URL` → paste as `SUPABASE_URL` in `backend/.env`
6. Copy `service_role` key → paste as `SUPABASE_KEY` in `backend/.env`
7. Copy `anon` key → paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `frontend/.env.local`
8. Restart the backend

---

## DEPLOY TO VERCEL

### Frontend → Vercel
1. Go to https://vercel.com → New Project → Import from GitHub
2. Set root directory to `frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL` = your Render URL
4. Deploy — Vercel gives you a URL like `https://algo-trading.vercel.app`

---

## PUSH TO GITHUB

```bash
cd algo-trading-platform
git init
git add .
git commit -m "Initial commit: algo trading platform"
```

Go to https://github.com → New Repository → name it `algo-trading-platform` → Create

Then run the commands GitHub shows you (they look like):
```bash
git remote add origin https://github.com/YOUR_USERNAME/algo-trading-platform.git
git branch -M main
git push -u origin main
```
