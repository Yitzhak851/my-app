# 🚀 QUICK START GUIDE

## ⚡ 5-Minute Setup (Windows)

### Prerequisites
- Node.js 18+
- Python 3.9+
- MySQL 5.7+

### Step 1: Clone & Navigate
```bash
git clone https://github.com/Yitzhak851/YBO-fullstack-assignment-course.git
cd YBO-fullstack-assignment-course/my-YBO-app
```

### Step 2: Install Everything
```bash
scripts/install-all.bat
```

This will:
- Install frontend dependencies
- Create Python virtual environment
- Install backend dependencies

### Step 3: Start the App
```bash
scripts/start-app.bat
```

This opens 2 windows:
- Backend (Flask) on http://localhost:5000
- Frontend (React) on http://localhost:5173

### Step 4: Open in Browser
Visit: http://localhost:5173

---

## 📝 Manual Setup (If Scripts Don't Work)

### Terminal 1: Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
python run.py
```

### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## ✅ Verify Everything Works

### 1. Frontend Loads
- Open http://localhost:5173
- You should see the YBO app

### 2. Can Login
- Create account or login
- LocalStorage should save user

### 3. Can Create Posts
- Create a new post
- Should appear in feed

### 4. Can Follow Users
- View user profile
- Click follow button
- Count should increase

### 5. Run Tests
```bash
cd frontend
npm run test
npm run test:e2e
```

---

## 📂 File Structure Quick Reference

```
my-YBO-app/
├── frontend/          <- React app (localhost:5173)
├── backend/           <- Flask API (localhost:5000)
├── scripts/           <- Windows batch files
└── README.md          <- Full documentation
```

---

## 🆘 Troubleshooting

### Port 5000 in use?
```bash
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### MySQL not connecting?
1. Start MySQL: mysql -u root -p
2. Create database: CREATE DATABASE social_app;
3. Check credentials in backend/.env

### Frontend can't reach backend?
- Check backend is running (http://localhost:5000)
- Check frontend/.env has correct API URL
- Check browser console for CORS errors

---

## 🧪 Testing

```bash
npm run test-frontend
npm run test-e2e
npm run test-all
```

---

**Ready? Run: `scripts/install-all.bat` then `scripts/start-app.bat`**
