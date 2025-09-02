# STUDIO360 Backend API

This directory contains the backend API services for the STUDIO360 bookkeeping system.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## 📁 Project Structure

```
backend/
├── api/              # API routes and controllers
├── config/           # Configuration files
├── middleware/       # Custom middleware
├── services/         # Business logic services
├── utils/            # Utility functions
├── logs/             # Application logs
├── uploads/          # File uploads
├── tests/            # Test files
└── server.js         # Main server file
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile

### AI Bookkeeper (OCR & utilities)
- `POST /api/ai/upload` - Upload files for OCR
- `POST /api/ai/categorize` - Categorize transactions
- `GET /api/ai/categories` - Get categories
- `GET /api/ai/logs` - Get processing logs

### Assistant (chatbot-only, decoupled from OCR)
- `POST /api/assistant/message` - Send a chat message `{ message, sessionId? }`
- `GET /api/assistant/health` - Check webhook configuration
	- Backward-compat: `/api/ai/assistant/*` is still available; prefer `/api/assistant/*` moving forward.

Mock n8n mode (no Docker required):

- Set in `backend/.env`:
	- `N8N_WEBHOOK_URL=mock:ai-assistant`
- Restart backend. Health will show configured: true, and replies will be intent-based without a live n8n server.

### Invoice Management
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/:id` - Get invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice

### Bookkeeping
- `GET /api/bookkeeping/journal` - Get journal
- `GET /api/bookkeeping/ledger` - Get ledger
- `POST /api/bookkeeping/transactions` - Add transaction
- `GET /api/bookkeeping/reports` - Get reports

## 🛠️ Technologies

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **JWT** - Authentication
- **Multer** - File uploads
- **Winston** - Logging

## 📋 Environment Variables

Create a `.env` file:

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/studio360
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:3000
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📊 Monitoring

- **Health Check**: `GET /api/health`
- **Metrics**: `GET /api/metrics`
- **Logs**: Check `logs/` directory

---

**Backend Version**: 1.0.0  
**Last Updated**: December 2024 

## 🐳 Docker + n8n Quick Start

From the repo root:

1) Build and start services:

```
docker compose up -d --build
```

2) Services:
- Backend: http://localhost:3001/api/health
- n8n: http://localhost:5678/

3) Backend inside Docker uses `backend/.env.docker` and calls the n8n workflow at
	`http://n8n:5678/webhook/ai-assistant` over the internal Docker network.

4) In n8n, create a Webhook node (POST) with path `ai-assistant` and set response to “Last node”.
	Have the last node return JSON like `{ "reply": "Hi!" }`.

5) The frontend chat can call `/api/assistant/message` (chatbot-only) or `/api/ai/assistant/message` (legacy path). The backend forwards to n8n and falls back locally if n8n is down.
