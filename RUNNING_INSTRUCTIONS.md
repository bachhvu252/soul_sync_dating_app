# 🚀 Running SoulSync

To get the full platform up and running, you need to start three core components: the Database, the Node.js API, and the FastAPI AI Service.

## 1. Prerequisites (Database)
Make sure your PostgreSQL server is running. 
- **Port:** `5433` (as discovered on your local machine)
- **Database Name:** `soulsync`
- **Check Status:** You can check if the service is running in Windows Services (`postgresql-x64-18`).

---

## 2. Start the Node.js Primary API
This is the main backend that handles authentication, profiles, and matches.

1. Open a terminal in the `backend-node` directory.
2. Install dependencies (if not already done):
   ```powershell
   npm install
   ```
3. Start the server in development mode:
   ```powershell
   npm run dev
   ```
   **URL:** `http://localhost:3001`

---

## 3. Start the FastAPI AI Service
This service handles sentiment analysis and AI matching.

1. Open a terminal in the `backend-fastapi` directory.
2. Create and activate a virtual environment (optional but recommended):
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Start the service:
   ```powershell
   uvicorn app.main:app --reload --port 8001
   ```
   **URL:** `http://localhost:8001`

---

## 4. Start the Frontend
1. Open a terminal in the `frontend` directory.
2. Start the Vite development server:
   ```powershell
   npm run dev
   ```
   **URL:** `http://localhost:5173` (or `5174`)

---

## ✅ Verification
Once all services are running:
1. Visit the Frontend URL.
2. Go to the **Login** or **Sign Up** page.
3. Use the forms to create an account or sign in.
4. Check the **Browser Console** or **Node.js Terminal** for logs confirming DB connection.
