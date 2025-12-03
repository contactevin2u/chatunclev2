# ChatUncle - WhatsApp Sales Agent Platform

A multi-tenant WhatsApp messaging platform where sales agents can connect multiple WhatsApp accounts, view and reply to messages, with admin oversight.

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL
- **WhatsApp**: Baileys (WebSocket-based, no browser needed)
- **Real-time**: Socket.io

## Project Structure

```
chatuncle/
├── backend/          # Express API server
│   ├── src/
│   │   ├── config/       # Database, environment config
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Auth middleware
│   │   ├── services/     # WhatsApp session manager
│   │   └── types/        # TypeScript types
│   └── package.json
│
├── frontend/         # Next.js web app
│   ├── src/
│   │   ├── app/          # App Router pages
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # API client, utilities
│   │   └── types/        # TypeScript types
│   └── package.json
│
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE chatuncle;
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database URL and secrets
# DATABASE_URL=postgresql://user:password@localhost:5432/chatuncle
# JWT_SECRET=your-secret-key
# CORS_ORIGIN=http://localhost:3000

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

The backend will run on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your backend URL
# NEXT_PUBLIC_API_URL=http://localhost:3001

# Start development server
npm run dev
```

The frontend will run on `http://localhost:3000`

### 4. Create Admin User

Register a new user through the frontend, then update their role in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```

## Features

### For Sales Agents

- **Multi-Account Support**: Connect multiple WhatsApp numbers
- **Real-time Messaging**: Receive and send messages instantly
- **Media Support**: Images, videos, audio, documents
- **Message Templates**: Quick replies with shortcuts
- **Contact Labels**: Organize contacts with color-coded tags

### For Admins

- **Agent Management**: Create, edit, delete agents
- **View All Conversations**: Monitor all agent conversations
- **Statistics Dashboard**: Track messages, accounts, activity

## Deployment

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your repository
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables
6. Use a Persistent Disk for WhatsApp sessions

### Frontend (Vercel)

1. Import your repository on Vercel
2. Set root directory to `frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL`
4. Deploy

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new agent
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### WhatsApp Accounts
- `GET /api/accounts` - List accounts
- `POST /api/accounts` - Create new account (starts QR)
- `DELETE /api/accounts/:id` - Remove account
- `POST /api/accounts/:id/reconnect` - Reconnect

### Conversations & Messages
- `GET /api/conversations` - List conversations
- `GET /api/messages/conversation/:id` - Get messages
- `POST /api/messages/conversation/:id` - Send message

### Admin
- `GET /api/admin/agents` - List all agents
- `GET /api/admin/stats` - Dashboard statistics

## Socket.io Events

### Client → Server
- `join:account` - Subscribe to account updates

### Server → Client
- `message:new` - New incoming message
- `qr:update` - QR code for scanning
- `account:status` - Connection status change

## Security Notes

- This uses the unofficial Baileys library
- WhatsApp may ban accounts that violate their ToS
- Do not use for spam or bulk messaging
- Sessions are stored locally on the server

## License

MIT
