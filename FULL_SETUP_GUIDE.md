# 🏁 Full SoulSync Environment Setup Guide

This guide will walk you through setting up SoulSync on a brand-new computer from scratch.

---

## 🛠️ Step 1: Install Core Software

You need to install the following tools. Follow the links to download the installers:

1.  **Node.js (v18 or newer)**: [Download Node.js](https://nodejs.org/)
2.  **Python (v3.9 or newer)**: [Download Python](https://www.python.org/)
3.  **PostgreSQL (v15 or newer)**: [Download PostgreSQL](https://www.postgresql.org/download/windows/)
    *   *Note: During installation, set the password to `12345678` (or remember what you set and update the `.env` later).*
4.  **Git**: [Download Git](https://git-scm.com/)
5.  **Redis (Optional but Recommended)**:
    *   On Windows, we recommend [Memurai](https://www.memurai.com/) (Redis for Windows) or using Docker/WSL.

---

## 🗄️ Step 2: Database Setup

1.  **Open "pgAdmin 4"** (installed with PostgreSQL).
2.  **Create a new Database**:
    *   Right-click "Databases" -> "Create" -> "Database..."
    *   Name it: `soulsync`
3.  **Run the Schema Script**:
    *   Open a query tool on the `soulsync` database.
    *   Copy and paste the content of `database/schema.sql` and execute it.
    *   Then, copy and paste the content of `database/migration_add_prompts_details.sql` and execute it.

Alternatively, via command line:
```powershell
# Open terminal in the project root
psql -U postgres -d soulsync -f database/schema.sql
psql -U postgres -d soulsync -f database/migration_add_prompts_details.sql
```

---

## ⚙️ Step 3: Environment Configuration

In the root directory, you should see `.env.example`. 
1.  Create a copy of it and rename it to `.env`.
2.  Open `.env` and update the values (especially `DATABASE_URL` with your local postgres credentials).

Example `DATABASE_URL`: `postgresql://postgres:12345678@localhost:5433/soulsync`

---

## 🚀 Step 4: Install & Run Services

Open a separate terminal (PowerShell or Bash) for each service.

### 📦 4.1: Primary Backend (Node.js)
```powershell
cd backend-node
npm install
node schema-migration.js  # Apply final database structural updates
npm run dev
```

### 🧠 4.2: AI Service (FastAPI)
```powershell
cd backend-fastapi
# Create a virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install libraries
pip install sentence-transformers==2.7.0 fastapi uvicorn[standard] pydantic httpx numpy scikit-learn openai python-dotenv

# Run service
uvicorn app.main:app --reload --port 8001
```

### 🖼️ 4.3: Media Service (Flask)
```powershell
cd backend-flask
# Create a virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install libraries
pip install Flask==3.0.3 Pillow==10.3.0 python-dotenv==1.0.1 Werkzeug==3.0.3

# Run service
# Note: On Windows PowerShell use $env:FLASK_APP = 'app'
# On CMD use set FLASK_APP=app
set FLASK_APP=app
flask run --port 5001
```

### 💻 4.4: Frontend (React + Vite)
```powershell
cd frontend
npm install
npm run dev
```

---

## ✅ Verification Checklist

*   [ ] **Frontend**: Open `http://localhost:5173`
*   [ ] **Node API**: Visit `http://localhost:3001/api/health` (should return JSON)
*   [ ] **AI API**: Visit `http://localhost:8001/docs` (should show Swagger UI)
*   [ ] **Media API**: Visit `http://localhost:5001/` (should return a 404 or welcome message)

---

## 💡 Troubleshooting
*   **Port 5433 vs 5432**: If your PostgreSQL is on port `5432` (default), update the `.env` and `schema-migration.js` files to point to `port=5432`.
*   **Environment Variables**: Ensure all keys in `.env` are filled out correctly.
*   **Python Errors**: If `pip install` fails, ensure you have the latest `pip` (`python -m pip install --upgrade pip`).
