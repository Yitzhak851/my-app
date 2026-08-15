# YBO Social Network Application

שקם Networking App מלא - רשת חברתית עם React Frontend, Flask Backend ו-MySQL Database.

## 📋 תוכן עיניינים

1. [תיאור](#תיאור)
2. [טכנולוגיות](#טכנולוגיות)
3. [מבנה הפרויקט](#מבנה-הפרויקט)
4. [דרישות סיסטם](#דרישות-סיסטם)
5. [התקנה](#התקנה)
6. [הרצה](#הרצה)
7. [בדיקות](#בדיקות)
8. [API Endpoints](#api-endpoints)
9. [סטטוס פיתוח](#סטטוס-פיתוח)
10. [בעיות נפוצות](#בעיות-נפוצות)

---

## תיאור

YBO Social Network היא אפליקציית רשת חברתית מלאה המאפשרת למשתמשים:

- הרשמה והתחברות
- יצירה וצפייה בפוסטים
- עקיבה אחר משתמשים (Follow/Unfollow)
- צפייה בפרופילים של משתמשים
- חיפוש משתמשים
- ניהול פיד אישי

---

## טכנולוגיות

### Frontend
- React 19.2.5 - User Interface
- Vite 8.0.10 - Build tool
- React Router 7.15.0 - Navigation
- Material-UI (MUI) 9.0.0 - Component library
- Vitest 1.0.4 - Unit testing
- React Testing Library 14.1.2 - Component testing
- Cypress 15.16.0 - E2E testing

### Backend
- Flask 3.0.0 - Web framework
- Python 3.9+ - Programming language
- MySQL Connector 8.2.0 - Database connection
- Bcrypt 4.1.2 - Password hashing
- Flask-CORS 4.0.0 - Cross-origin requests
- python-dotenv 1.0.0 - Environment configuration

### Database
- MySQL 5.7+ - Relational database
- Tables: users, posts, follows

---

## מבנה הפרויקט

```
my-YBO-app/
├── frontend/                    # React Frontend
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── auth/               # Authentication
│   │   ├── api/                # API client
│   │   ├── tests/              # Unit tests
│   │   ├── assets/             # Static files
│   │   └── setupTests.js
│   ├── cypress/                # E2E tests
│   ├── .env
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── backend/                    # Flask Backend
│   ├── app/
│   │   ├── __init__.py        # Flask factory
│   │   ├── config/            # Configuration
│   │   ├── models/            # Data models
│   │   ├── services/          # Business logic
│   │   ├── routes/            # API endpoints
│   │   └── utils/             # Utilities
│   ├── .env
│   ├── requirements.txt
│   └── run.py
│
├── scripts/                   # Automation scripts
│   ├── install-all.bat
│   ├── start-app.bat
│   └── test-all.bat
│
├── package.json              # Root npm scripts
└── README.md
```

---

## דרישות סיסטם

### Windows
- Node.js 18+
- Python 3.9+
- MySQL 5.7+
- Git Bash (recommended)

### Verification
```bash
node --version        # Should show v18.x.x or higher
python --version      # Should show 3.9.x or higher
mysql --version       # Should show 5.7.x or higher
```

---

## התקנה

### 1. Clone the Repository
```bash
git clone https://github.com/Yitzhak851/YBO-fullstack-assignment-course.git
cd YBO-fullstack-assignment-course/my-YBO-app
```

### 2. Install Dependencies

**Using script (Windows):**
```bash
scripts/install-all.bat
```

**Manual installation:**

Frontend:
```bash
cd frontend && npm install && cd ..
```

Backend:
```bash
cd backend
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
cd ..
```

### 3. Setup Environment Variables

Frontend (.env):
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Backend (.env):
```env
FLASK_ENV=development
FLASK_DEBUG=True
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=X0f2qq64g@@
DB_NAME=social_app
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
SECRET_KEY=social-app-secret-key-dev-only
```

### 4. Database Setup

Run SQL commands in MySQL:
```sql
CREATE DATABASE IF NOT EXISTS social_app;

USE social_app;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  bio TEXT,
  profile_picture VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE follows (
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id)
);
```

---

## הרצה

### Option 1: Using Script (Windows)
```bash
scripts/start-app.bat
```

### Option 2: Manual Start

Terminal 1 (Backend):
```bash
cd backend
venv\Scripts\activate.bat
python run.py
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### Option 3: npm scripts
```bash
npm run start-app
```

---

## בדיקות

### Unit Tests
```bash
cd frontend
npm run test
```

### E2E Tests
```bash
cd frontend
npm run test:e2e
```

### Run All Tests
```bash
npm run test-all
```

---

## API Endpoints

**Auth:**
- POST /api/auth/signup
- POST /api/auth/login

**Posts:**
- GET /api/posts
- POST /api/posts

**Users:**
- GET /api/users
- GET /api/users/:id
- GET /api/users/:id/follow-stats

**Follows:**
- POST /api/follows
- DELETE /api/follows
- GET /api/follows/check
- GET /api/follows/:id/followers
- GET /api/follows/:id/following

---

## סטטוס פיתוח

### Completed
- Flask backend with Blueprints
- Database models and services
- Authentication (signup/login)
- Posts CRUD
- Users management
- Follow system
- Environment configuration
- CORS setup
- Frontend API client
- Unit tests (Vitest)
- E2E tests (Cypress)
- Automation scripts

---

## בעיות נפוצות

### Port 5000 already in use
```bash
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

Or change PORT in backend/.env

### MySQL connection failed
1. Verify MySQL is running
2. Check credentials in backend/.env
3. Verify database exists

### Frontend can't connect to backend
1. Ensure backend is running on localhost:5000
2. Check frontend/.env has correct API URL
3. Verify CORS is enabled

### Tests not running
```bash
cd frontend
rm -r node_modules
npm install
npm run test
```

---

**Version:** 1.0.0
**Last Updated:** June 2024
