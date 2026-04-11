# SoulSync — Project Intelligence File

## Project Overview

SoulSync is a modern dating platform designed to connect compatible individuals through AI-powered matching, real-time communication, and a safe, moderated environment. This document serves as the master reference for architecture decisions, coding conventions, and feature implementation patterns.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | UI, routing, state management |
| Primary Backend | Node.js (Express) | REST API, auth, real-time (Socket.IO) |
| AI/ML Service | Python (FastAPI) | AI matching, sentiment analysis, conversation starters |
| Media Service | Python (Flask) | Image upload, processing, storage |
| Database | PostgreSQL | Relational data (users, matches, messages) |
| Cache | Redis | Sessions, real-time pub/sub |
| File Storage | AWS S3 / Cloudinary | Profile photos and media |

---

## Repository Structure

```
soulsync/
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── assets/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── common/        # Button, Modal, Avatar, etc.
│   │   │   ├── chat/          # MessageBubble, ChatInput, EmojiPicker
│   │   │   ├── profile/       # ProfileCard, PhotoGallery, EditForm
│   │   │   └── match/         # SwipeCard, MatchModal, LikeButton
│   │   ├── pages/             # Route-level page components
│   │   │   ├── Auth/          # Login, Register
│   │   │   ├── Dashboard/
│   │   │   ├── Profile/
│   │   │   ├── Discover/
│   │   │   ├── Matches/
│   │   │   └── Chat/
│   │   ├── hooks/             # Custom React hooks
│   │   ├── context/           # AuthContext, ChatContext, MatchContext
│   │   ├── services/          # API client functions
│   │   │   ├── api.js         # Axios instance + interceptors
│   │   │   ├── auth.service.js
│   │   │   ├── match.service.js
│   │   │   ├── chat.service.js
│   │   │   └── ai.service.js
│   │   ├── store/             # Zustand or Redux Toolkit slices
│   │   └── utils/
│   ├── public/
│   ├── index.html
│   └── vite.config.js
│
├── backend-node/              # Node.js + Express
│   ├── src/
│   │   ├── config/            # DB, Redis, JWT config
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── user.controller.js
│   │   │   ├── match.controller.js
│   │   │   └── chat.controller.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── upload.middleware.js
│   │   │   └── rateLimit.middleware.js
│   │   ├── models/            # Sequelize or Prisma models
│   │   ├── routes/
│   │   ├── sockets/           # Socket.IO event handlers
│   │   │   ├── chat.socket.js
│   │   │   └── match.socket.js
│   │   ├── services/
│   │   └── utils/
│   ├── package.json
│   └── server.js
│
├── backend-fastapi/           # Python FastAPI — AI Service
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── matching.py
│   │   │   ├── sentiment.py
│   │   │   └── conversation.py
│   │   ├── models/            # Pydantic schemas
│   │   ├── services/
│   │   │   ├── matching_engine.py
│   │   │   ├── sentiment_analyzer.py
│   │   │   └── conversation_ai.py
│   │   └── utils/
│   ├── requirements.txt
│   └── Dockerfile
│
├── backend-flask/             # Python Flask — Media Service
│   ├── app/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   └── media.py
│   │   ├── services/
│   │   │   ├── image_processor.py
│   │   │   └── storage.py
│   │   └── utils/
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml
└── .env.example
```

---

## Architecture & Service Boundaries

```
Browser (React)
     │
     ├──[REST/WS]──► Node.js API (Port 3001)
     │                   ├── Auth, User CRUD
     │                   ├── Matching logic
     │                   ├── Chat (Socket.IO)
     │                   └── Moderation
     │
     ├──[REST]────► Flask Media Service (Port 5001)
     │                   └── Upload, resize, store images
     │
     └──[REST]────► FastAPI AI Service (Port 8001)
                        ├── /ai/match        — compatibility scoring
                        ├── /ai/starters     — conversation starters
                        └── /ai/sentiment    — message tone analysis
```

**Rule:** The frontend never calls FastAPI or Flask directly from sensitive flows. All AI and media calls should be proxied through Node.js when authentication or logging is required.

---

## Database Schema (PostgreSQL)

```sql
-- Users & Auth
users (id, email, password_hash, created_at, is_active, is_verified)
profiles (user_id PK, name, age, gender, bio, location, preferences_json, embedding_vector)
photos (id, user_id, url, is_primary, order_index, uploaded_at)

-- Matching
swipes (id, swiper_id, swiped_id, direction ENUM('like','dislike'), created_at)
matches (id, user1_id, user2_id, matched_at, is_active)

-- Chat
conversations (id, match_id, created_at)
messages (id, conversation_id, sender_id, content, media_url, message_type, sentiment_score, sent_at, read_at)

-- Safety
reports (id, reporter_id, reported_id, reason, details, status, created_at)
blocks (id, blocker_id, blocked_id, created_at)
```

---

## Feature Implementation Guide

### 1. Authentication

**Stack:** Node.js + JWT + bcrypt + Redis (token blacklist)

**Flow:**
1. `POST /api/auth/register` — validate, hash password, create `users` + `profiles` row, send verification email.
2. `POST /api/auth/login` — verify credentials, issue `accessToken` (15m) + `httpOnly refreshToken` (7d).
3. `POST /api/auth/refresh` — rotate tokens using refresh token stored in Redis.
4. `POST /api/auth/logout` — blacklist access token in Redis.

**Conventions:**
- Always use `httpOnly, Secure, SameSite=Strict` cookies for refresh tokens.
- Access tokens go in `Authorization: Bearer` header only.
- Never store tokens in `localStorage`.
- Middleware: `authMiddleware.js` validates JWT on every protected route.

```js
// middleware/auth.middleware.js pattern
const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = await User.findByPk(decoded.id);
  next();
};
```

---

### 2. Profile Management

**Stack:** Node.js (data) + Flask (media)

**Endpoints (Node.js):**
- `GET /api/profile/:id` — fetch public profile.
- `PUT /api/profile` — update bio, preferences, location (auth required).
- `PATCH /api/profile/preferences` — update matching preferences.

**Photo Upload Flow:**
1. Frontend sends `multipart/form-data` to `POST /api/media/upload` (Flask).
2. Flask service: validate MIME type (jpg/png/webp only), resize to max 1080px, compress, upload to S3/Cloudinary, return `{ url, thumbnailUrl }`.
3. Frontend then calls Node.js `POST /api/profile/photos` with returned URL to persist in DB.

**Flask Media Service conventions:**
- Use `Pillow` for image processing.
- Enforce max file size: 10MB.
- Generate two sizes: `original` (1080px max) and `thumbnail` (300px).
- Strip EXIF metadata before storing (privacy).

```python
# Flask: app/services/image_processor.py pattern
from PIL import Image
import io

def process_image(file_bytes: bytes, max_size: int = 1080) -> bytes:
    img = Image.open(io.BytesIO(file_bytes))
    img = img.convert("RGB")  # Strip EXIF
    img.thumbnail((max_size, max_size))
    output = io.BytesIO()
    img.save(output, format="JPEG", quality=85, optimize=True)
    return output.getvalue()
```

---

### 3. Matching System

**Stack:** Node.js (interactions) + FastAPI (scoring)

**Swipe Flow:**
1. User calls `POST /api/match/swipe` with `{ swipedUserId, direction: 'like' | 'dislike' }`.
2. Node.js records the swipe in `swipes` table.
3. If `direction === 'like'`, Node.js checks if the other user already liked back (mutual like).
4. If mutual match: create `matches` row, emit `match:new` Socket.IO event to both users, trigger AI to generate conversation starters.

**Suggestion Flow:**
1. `GET /api/match/suggestions` — Node.js fetches candidate pool (filtered by age, location, gender preferences, excluding already-swiped).
2. Node.js calls FastAPI `POST /ai/match/score` with `{ userId, candidates: [...] }`.
3. FastAPI returns ranked list with compatibility scores.
4. Node.js returns top N candidates to frontend.

**FastAPI AI Matching:**
```python
# FastAPI: app/routers/matching.py
@router.post("/score")
async def score_candidates(payload: MatchRequest):
    scores = matching_engine.rank(payload.user_profile, payload.candidates)
    return {"ranked": scores}
```

**Matching algorithm inputs (in `profiles.preferences_json`):**
- Age range, max distance, gender preference.
- Interest overlap (hobbies, values tags).
- Activity score (recency of logins).
- Embedding cosine similarity (bio text vectorized via sentence-transformers).

---

### 4. Chat & Messaging

**Stack:** Node.js + Socket.IO + Redis Pub/Sub

**Socket.IO Events:**

| Event | Direction | Payload |
|---|---|---|
| `chat:join` | Client → Server | `{ conversationId }` |
| `chat:message` | Client → Server | `{ conversationId, content, type }` |
| `chat:message:new` | Server → Client | Full message object |
| `chat:typing` | Client → Server | `{ conversationId, isTyping }` |
| `chat:read` | Client → Server | `{ messageId }` |
| `match:new` | Server → Client | `{ matchId, user }` |

**Message Types:** `text`, `image`, `emoji`, `starter` (AI-generated).

**Image in Chat:**
1. Client uploads image to Flask `/api/media/upload` first.
2. Receives URL, then emits `chat:message` with `{ type: 'image', content: url }`.

**Sentiment Analysis on send:**
1. When `type === 'text'`, Node.js asynchronously calls FastAPI `POST /ai/sentiment` after saving the message.
2. FastAPI returns `{ score: float, label: 'positive'|'neutral'|'negative' }`.
3. Node.js updates `messages.sentiment_score` — used for moderation flagging, not exposed to users.

```js
// sockets/chat.socket.js pattern
socket.on('chat:message', async (data) => {
  const msg = await Message.create({ ...data, senderId: socket.userId });
  io.to(data.conversationId).emit('chat:message:new', msg);
  // Fire-and-forget sentiment analysis
  aiService.analyzeSentiment(msg.id, msg.content).catch(console.error);
});
```

---

### 5. AI Integration (FastAPI)

**Endpoints:**

| Route | Method | Description |
|---|---|---|
| `/ai/match/score` | POST | Rank candidate profiles by compatibility |
| `/ai/sentiment` | POST | Analyze message sentiment |
| `/ai/starters` | POST | Generate conversation starter prompts |

**Conversation Starters:**
- Triggered automatically after a mutual match is created.
- Input: both users' bios and interest tags.
- Output: 3 personalized openers.
- Stored in `matches` table as `starters_json`.
- Displayed in the match modal on the frontend.

**FastAPI conventions:**
- All AI endpoints must respond within 3s; use timeouts.
- Use `pydantic` models for all request/response schemas.
- Load ML models once at startup with `@app.on_event("startup")`.
- Never block the event loop: use `asyncio.run_in_executor` for CPU-bound inference.

```python
# FastAPI: app/main.py startup pattern
from app.services.matching_engine import MatchingEngine
from app.services.sentiment_analyzer import SentimentAnalyzer

@app.on_event("startup")
async def load_models():
    app.state.matcher = MatchingEngine()
    app.state.sentiment = SentimentAnalyzer()
```

---

### 6. Safety & Moderation

**Reporting:**
- `POST /api/safety/report` — `{ reportedUserId, reason, details }`.
- Reasons enum: `inappropriate_photo`, `harassment`, `spam`, `fake_profile`, `other`.
- Creates a `reports` row with `status: 'pending'`.
- Auto-flag: if a user accumulates 3+ pending reports → temporarily restrict their swipe ability.

**Blocking:**
- `POST /api/safety/block` — `{ blockedUserId }`.
- Immediately: deactivate any existing match, hide each from each other's discovery feed, remove from each other's conversation list.
- Blocking is one-way but mutual in effect.

**Moderation conventions:**
- All moderation routes require authentication.
- A user cannot report or block themselves (server-side validation).
- Blocked users must be excluded at the DB query level, not filtered in application code (use `NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)` in candidate queries).
- Sentiment scores below threshold (e.g., `< -0.7`) on messages auto-flag the message for human review.

---

## Frontend Conventions (React + Vite)

**State Management:** Zustand (preferred for simplicity) or Redux Toolkit.

**Key stores:**
- `useAuthStore` — user session, tokens.
- `useMatchStore` — suggestions queue, active matches.
- `useChatStore` — conversation list, messages per conversation.

**Routing:** React Router v6. Protected routes wrap authenticated pages.

```jsx
// Protect route pattern
<Route element={<ProtectedRoute />}>
  <Route path="/discover" element={<DiscoverPage />} />
  <Route path="/matches" element={<MatchesPage />} />
  <Route path="/chat/:matchId" element={<ChatPage />} />
</Route>
```

**API Client:** Axios instance with interceptors for auth token injection and 401 → token refresh flow.

**Socket Client:** Single Socket.IO client instance, initialized after login, stored in context.

**Component naming:** PascalCase for components, camelCase for hooks (prefix `use`), camelCase for service functions.

**Styling:** Tailwind CSS. No inline styles. Component-level `className` only.

---

## Environment Variables

```bash
# .env.example

# Node.js
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/soulsync
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Flask Media Service
FLASK_PORT=5001
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=soulsync-media
CLOUDINARY_URL=             # Alternative to S3

# FastAPI AI Service
FASTAPI_PORT=8001
OPENAI_API_KEY=             # For conversation starters (optional)
SENTENCE_TRANSFORMER_MODEL=all-MiniLM-L6-v2

# Shared
INTERNAL_API_SECRET=        # For Node → Flask/FastAPI service-to-service calls
```

---

## API Conventions

- All responses: `{ success: bool, data: any, error?: string }`.
- HTTP status codes must be semantically correct (200, 201, 400, 401, 403, 404, 409, 500).
- Pagination: `?page=1&limit=20`. Response includes `{ data, total, page, pages }`.
- All dates: ISO 8601 UTC strings.
- IDs: UUIDs (not sequential integers) for all public-facing entities.
- Input validation: `Joi` (Node.js), `Pydantic` (FastAPI/Flask).

---

## Security Checklist

- [ ] Passwords hashed with bcrypt (cost factor ≥ 12).
- [ ] JWT secrets are 256-bit random strings, rotated periodically.
- [ ] All user input sanitized before DB queries (use parameterized queries / ORM).
- [ ] File upload: validate MIME type server-side (not just extension), enforce size limits.
- [ ] Rate limiting on auth endpoints: max 10 req/min per IP.
- [ ] CORS: whitelist frontend origin only in production.
- [ ] HTTPS enforced in production; `Secure` flag on all cookies.
- [ ] Block lists enforced at DB query level.
- [ ] Sensitive fields (password_hash, sentiment scores) never returned in API responses.

---

## Real-Time Architecture Notes

- Socket.IO rooms are named by `conversationId`.
- On connection, authenticated users join their own `userId` room for receiving match notifications.
- Redis adapter (`socket.io-redis`) enables horizontal scaling across multiple Node instances.
- Typing indicators: debounce on client, emit stop after 3s of inactivity.

---

## Development Setup

```bash
# Start all services with Docker Compose
docker-compose up

# Frontend dev server
cd frontend && npm install && npm run dev

# Node.js backend
cd backend-node && npm install && npm run dev

# FastAPI
cd backend-fastapi && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001

# Flask
cd backend-flask && pip install -r requirements.txt && flask run --port 5001
```

---

## Key Design Decisions

1. **Why Node.js for the primary backend?** Real-time WebSocket support via Socket.IO is first-class in Node.js, and it handles the high I/O concurrency of chat and swipe interactions efficiently.

2. **Why FastAPI for AI?** Python's ML ecosystem (scikit-learn, sentence-transformers, transformers, spaCy) is unmatched. FastAPI provides async support and auto-generated OpenAPI docs.

3. **Why Flask for media?** Flask's simplicity suits a focused microservice. Pillow for image processing is mature and well-documented in Python.

4. **Why separate AI and media services?** Independent scaling — AI inference is CPU/GPU-heavy; media processing is I/O-heavy. Separating them allows targeted resource allocation.

5. **Blocks at DB level:** Filtering blocked users in application code risks leaking them through pagination edge cases. DB-level exclusion is authoritative and consistent.