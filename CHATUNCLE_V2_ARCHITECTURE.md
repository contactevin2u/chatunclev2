# ChatUncle V2 - Complete Architecture & Implementation Plan

## Executive Summary

This document provides a comprehensive review of the current ChatUncle codebase and a complete architecture plan for ChatUncle V2 - a rewrite optimized for multi-channel messaging, multi-account support, and scalable deployment on Render (Singapore) with Vercel frontend.

---

## Part 1: Current Codebase Analysis

### 1.1 Project Structure

```
CHATUNCLE/
├── backend/                 # Express.js + Socket.io backend
│   ├── src/
│   │   ├── config/         # Environment, database config
│   │   ├── db/             # PostgreSQL migrations
│   │   ├── helpers/        # Utility functions (accountAccess)
│   │   ├── middleware/     # Auth, rate limiting
│   │   ├── routes/         # REST API endpoints
│   │   ├── services/       # Business logic
│   │   │   ├── whatsapp/   # Baileys integration (SessionManager, etc.)
│   │   │   └── channel/    # Multi-channel adapter pattern
│   │   └── types/          # TypeScript interfaces
│   └── package.json
├── frontend/               # Next.js 14 frontend
│   ├── src/
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   │   ├── chat/      # MessageThread, ConversationList, etc.
│   │   │   ├── channel/   # ChannelIcon, etc.
│   │   │   └── ui/        # ShadCN UI components
│   │   ├── hooks/         # useSocket, useAuth
│   │   ├── lib/           # API client, socket client
│   │   └── types/         # Shared types
│   └── package.json
└── render.yaml             # Render deployment blueprint
```

### 1.2 Technology Stack

**Backend:**
- Node.js + Express.js
- Socket.io for real-time communication
- PostgreSQL (pg driver, raw SQL)
- Baileys v7.0.0-rc.6 for WhatsApp Web API
- JWT authentication
- Sharp for image processing

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TailwindCSS + ShadCN UI
- Socket.io-client
- Lucide React icons

### 1.3 Database Schema (Current)

#### Core Tables:
```sql
-- Users & Authentication
users (id, email, password_hash, name, role, created_at)

-- Accounts (WhatsApp sessions)
accounts (
  id, user_id, phone_number, status, channel_type,
  channel_identifier, credentials, settings,
  incognito_mode, last_connected_at, created_at
)

-- Multi-agent access
account_access (account_id, agent_id, role, created_at)

-- Contacts
contacts (
  id, account_id, wa_id, name, phone_number, profile_pic_url,
  channel_type, jid_type, telegram_user_id, tiktok_user_id,
  instagram_user_id, messenger_user_id, created_at
)

-- Conversations
conversations (
  id, account_id, contact_id, group_id, is_group,
  last_message_at, unread_count, first_response_at,
  assigned_agent_id, channel_type,
  telegram_chat_id, tiktok_conversation_id,
  instagram_conversation_id, messenger_conversation_id,
  created_at
)

-- Messages
messages (
  id, conversation_id, wa_message_id, sender_type,
  content_type, content, media_url, media_mime_type,
  status, agent_id, is_auto_reply, response_time_ms,
  sender_jid, sender_name, reactions, is_edited, edited_at,
  quoted_message_id, quoted_wa_message_id, quoted_content,
  quoted_sender_name, raw_message, channel_type,
  retry_count, next_retry_at, created_at
)

-- Groups
groups (
  id, account_id, group_jid, name, description,
  owner_jid, participant_count, profile_pic_url,
  created_at
)

-- LID/PN Mappings (WhatsApp v7 deduplication)
lid_pn_mappings (
  id, account_id, lid, pn, created_at
)
```

#### Feature Tables:
```sql
-- Templates (shared message templates)
templates (id, user_id, name, content, category, variables, created_at)

-- Sequences (automated message flows)
sequences (id, user_id, name, steps, trigger_type, is_active, created_at)

-- Scheduled Messages
scheduled_messages (
  id, account_id, conversation_id, content, content_type,
  media_url, scheduled_at, status, sent_at, error, created_at
)

-- Auto-Reply Rules
auto_reply_rules (
  id, account_id, trigger_keyword, response_content,
  match_type, is_active, created_at
)

-- Knowledge Bank (AI context)
knowledge_entries (
  id, user_id, title, content, category, embedding, created_at
)

-- Notes (contact context panel)
notes (id, contact_id, agent_id, content, created_at)

-- Labels
labels (id, account_id, name, color, created_at)
contact_labels (contact_id, label_id)
```

---

## Part 2: Current Features Analysis

### 2.1 WhatsApp Integration (Baileys)

**File:** `backend/src/services/whatsapp/SessionManager.ts`

**Current Implementation:**
- Uses Baileys v7.0.0-rc.6
- PostgreSQL-backed auth state (`PostgresAuthState.ts`)
- Session restoration on server restart
- QR code pairing via Socket.io
- Pairing code support (8-digit code alternative)

**Key Components:**
```
SessionManager (singleton)
├── sessions: Map<accountId, WASocket>
├── createSession(accountId, pairingCode?)
├── destroySession(accountId)
├── restoreAllSessions()
├── sendMessage(accountId, jid, content, options)
└── broadcastToUsers(accountId, event, data)

PostgresAuthState
├── state: AuthenticationState
├── saveCreds()
├── loadCreds()
└── keys: SignalDataSet (pre-keys, sessions, etc.)

BufferedEventHandler
├── processMessageBatch()
├── deduplication (3-layer)
└── emit socket events
```

**Anti-Ban Mechanisms (`antiBan.ts`):**
- Random delays between messages (5-15 seconds)
- Typing simulation before sending
- Rate limiting per account
- Exponential backoff on failures
- Human-like behavior patterns

**Message Queue (`MessageQueue.ts`):**
- p-queue based with concurrency=1
- 1 second interval between operations
- Max 500 messages per queue
- Priority support for urgent messages

### 2.2 Multi-Channel Architecture

**Adapter Pattern (`services/channel/`):**

```typescript
interface IChannelAdapter {
  channelType: ChannelType;
  connect(accountId, options): Promise<void>;
  disconnect(accountId): Promise<void>;
  sendMessage(accountId, recipientId, message, options): Promise<SendResult>;
  getContactProfile(accountId, contactId): Promise<ContactProfile>;
  onMessage(handler): void;
  onStatusChange(handler): void;
  getActiveAccounts(): string[];
  shutdown(): Promise<void>;
}
```

**Supported Channels (planned):**
- WhatsApp (via Baileys) - ✅ Implemented
- Telegram - Adapter interface ready
- TikTok Shop DM - Adapter interface ready
- Instagram/Messenger - Adapter interface ready (Meta API)

**Unified Message Format:**
```typescript
interface IncomingMessage {
  channelType: ChannelType;
  channelAccountId: string;
  channelMessageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  contentType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker';
  content?: string;
  mediaUrl?: string;
  isGroup: boolean;
  replyToMessageId?: string;
  timestamp: Date;
}
```

### 2.3 Real-Time Communication (Socket.io)

**Room Structure:**
```
user:{userId}           - Personal notifications
account:{accountId}     - All agents sharing an account
conversation:{convId}   - Specific conversation (legacy)
```

**Server → Client Events:**
| Event | Purpose |
|-------|---------|
| `message:new` | New incoming/outgoing message |
| `message:status` | Send status update (sent/delivered/read/failed) |
| `message:reaction` | Emoji reaction added |
| `message:edited` | Message was edited |
| `typing:start/stop` | Typing indicators |
| `qr:update` | WhatsApp QR code for pairing |
| `account:status` | Connection status change |
| `sync:progress` | History sync progress |
| `group:update` | Group metadata changed |
| `scheduled:sent/failed` | Scheduled message result |
| `orderops:result` | OrderOps integration result |

**Client → Server Events:**
| Event | Purpose |
|-------|---------|
| `join:account` | Subscribe to account updates |
| `leave:account` | Unsubscribe |
| `typing:start/stop` | Notify typing status |

### 2.4 Features Implemented

**Templates System:**
- Shared templates across team
- Variable substitution ({{name}}, {{phone}})
- Categories for organization
- Quick insert in chat

**Scheduled Messages:**
- Schedule future sends
- Processor runs every minute
- Status tracking (pending/sent/failed)
- Timezone-aware scheduling

**Auto-Reply:**
- Keyword-based triggers
- Match types: exact, contains, starts_with, regex
- Account-level rules
- Toggle active/inactive

**AI Reply (Knowledge Bank):**
- OpenAI integration
- Knowledge entries as context
- Per-user knowledge base
- Vector embedding search (planned)

**OrderOps Integration:**
- Send orders to external OrderOps system
- Real-time result via Socket.io
- Driver info fetching
- Order linking to conversations

**Notes/Context Panel:**
- Per-contact notes
- Agent attribution
- Timeline view
- Quick context for customer service

**Media Handling:**
- Images, videos, documents, voice notes
- Media URL storage
- MIME type tracking
- Sticker support
- Quoted message with media preview

### 2.5 Multi-Account Support

**Current Implementation:**
- Single user can own multiple WhatsApp accounts
- `account_access` table enables team sharing
- Socket rooms per account for multi-agent sync
- Session isolation per account
- Cached access control (5-minute TTL)

**Account Access Levels:**
- Owner: Full control
- Agent: Can view/send messages
- Admin: Can manage account settings

---

## Part 3: Baileys v7.0.0-rc.9 Changes

### 3.1 Breaking Changes (v6 → v7)

**Source:** [Baileys Migration Guide](https://baileys.wiki/docs/migration/to-v7.0.0)

1. **LID (Local Identifier) System**
   - WhatsApp replaced phone numbers with LIDs for privacy
   - New `Contact` type uses `id` field instead of `jid`/`lid`
   - `lid-mapping.update` event for LID/PN mapping
   - Must store mappings: `sock.signalRepository.lidMapping`
   - `isJidUser()` replaced with `isPnUser()`

2. **ACK Removal**
   - No longer send ACKs on message delivery (causes bans)
   - Read receipts handled differently

3. **ESM Migration**
   - Library is now ESM-only (no CommonJS)
   - Use `import` instead of `require`
   - Or use dynamic `await import()`

4. **Protobuf Changes**
   - Only `.create()`, `.encode()`, `.decode()` methods remain
   - Use `decodeAndHydrate()` for proper decoding

5. **Meta Coexistence**
   - Experimental support for WhatsApp Business + Meta API

### 3.2 Current Baileys Version Issues

The codebase uses v7.0.0-rc.6. Recent commits show:
- Media sending issues with Sharp thumbnails
- Session recreation for reliability
- Buffer-based image sending as workaround

**Recommendation:** Update to v7.0.0-rc.9 with careful testing.

---

## Part 4: Twilio Conversations Architecture (Reference)

**Source:** [Twilio Conversations Docs](https://www.twilio.com/docs/conversations)

### 4.1 Key Concepts to Adopt

**Conversation = Room Model:**
- Conversations are containers for participants and messages
- Participants can be from any channel (WhatsApp, SMS, Chat)
- Messages are unified across channels

**Participant-Centric Design:**
- Each participant has unique identity
- Role-based permissions
- Can join multiple conversations

**Service Isolation:**
- Conversation Services are isolated
- Messaging Services handle channel routing
- Clear separation of concerns

### 4.2 Patterns to Implement

```
┌─────────────────────────────────────────────────────────────┐
│                    ChatUncle V2 (Twilio-inspired)           │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │   WhatsApp    │  │   Telegram    │  │   TikTok DM   │   │
│  │   Adapter     │  │   Adapter     │  │   Adapter     │   │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘   │
│          │                  │                  │            │
│          └──────────────────┼──────────────────┘            │
│                             ▼                               │
│              ┌──────────────────────────┐                   │
│              │    Message Router        │                   │
│              │    (Unified Pipeline)    │                   │
│              └────────────┬─────────────┘                   │
│                           ▼                                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Conversation Service                   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │  Conv 1  │  │  Conv 2  │  │  Conv 3  │         │    │
│  │  │ (WA+TG)  │  │ (WA only)│  │(TikTok)  │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘         │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                 │
│                           ▼                                 │
│              ┌──────────────────────────┐                   │
│              │    Real-time Engine      │                   │
│              │    (Socket.io)           │                   │
│              └──────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 5: Anti-Ban Best Practices (Updated)

**Sources:**
- [Pally Systems Guide](https://blog.pallysystems.com/2025/12/04/whatsapp-automation-using-baileys-js-a-complete-guide/)
- [WaDesk Strategies](https://wadesk.io/en/tutorial/strategies-to-avoid-whatsapp-ban)
- WhatsApp Pair Rate Limit: 1 message per 6 seconds to same contact
- WhatsApp Per-Second Rate Limit: ~80 messages/second per business number

### 5.1 Message Delays (Optimized for Speed)

**Two-Mode System:** Different delays for conversations vs broadcasts.

| Mode | Min Delay | Max Delay | Use Case |
|------|-----------|-----------|----------|
| **Reply Mode** | 0.3s | 1.5s | Conversational replies (customer is waiting) |
| **Bulk Mode** | 2.0s | 5.0s | Scheduled/broadcast messages to different contacts |
| **Same Contact** | 6.0s | - | WhatsApp pair rate limit (enforced) |

```typescript
// apps/api/src/channels/whatsapp/anti-ban.ts
export const RATE_LIMITS = {
  // === REPLY MODE: Fast conversational responses ===
  REPLY_MIN_DELAY_MS: 300,   // 0.3 seconds
  REPLY_MAX_DELAY_MS: 1500,  // 1.5 seconds

  // === BULK MODE: Scheduled/broadcast (more cautious) ===
  BULK_MIN_DELAY_MS: 2000,   // 2 seconds
  BULK_MAX_DELAY_MS: 5000,   // 5 seconds

  // === SAME CONTACT LIMIT (WhatsApp enforced) ===
  MIN_SAME_CONTACT_DELAY_MS: 6000,  // 6 seconds

  // === OVERALL RATE LIMIT ===
  MESSAGES_PER_MINUTE: 15,  // Conservative (WhatsApp allows ~80/sec)

  // === TYPING SIMULATION ===
  MIN_TYPING_MS: 500,   // 0.5 seconds
  MAX_TYPING_MS: 2000,  // 2 seconds (presence expires at 10s)
};
```

### 5.2 Rate Limiting Strategy

```typescript
// Pre-send check flow
async function preSendCheck(accountId: string, jid: string): Promise<boolean> {
  // 1. Check per-contact rate limit (6s same contact)
  const contactCheck = canSendToContact(accountId, jid);
  if (!contactCheck.allowed) await sleep(contactCheck.waitMs);

  // 2. Check new contact daily limit (based on account age)
  if (isNewContact) {
    const newContactCheck = await canSendToNewContact(accountId);
    if (!newContactCheck.allowed) return false;
  }

  // 3. Check batch cooldown (50 messages, then 5min pause)
  const batchCheck = needsBatchCooldown(accountId);
  if (batchCheck.needed) await sleep(batchCheck.waitMs);

  // 4. Check messages-per-minute limit
  await waitForRateLimit(accountId);

  return true;
}
```

### 5.3 Daily Limits by Account Age

| Account Age | Max New Contacts/Day |
|-------------|---------------------|
| Day 0-1 | 30 |
| Day 1-3 | 50 |
| Day 3-7 | 100 |
| Day 7-14 | 200 |
| Day 14-30 | 500 |
| Day 30+ | 1000 |

### 5.4 Behavioral Patterns

- **Typing Simulation:** 40-80ms per character + random pause (0-500ms)
- **Message Variation:** Avoid identical messages
- **Response Rate:** Aim for 50%+ response rate
- **Stale Contacts:** Avoid contacts who haven't responded in 30+ days

### 5.5 Warm-Up Protocol (First 10 Days)

1. Day 0: Wait 24 hours after registration before linking
2. Days 1-3: Manual messaging only, max 20 contacts
3. Days 4-7: Light automation, max 50 contacts
4. Days 8-14: Gradual increase, monitor for warnings
5. Day 14+: Normal operation with rate limits

---

## Part 6: Environment Variables (Consolidated)

### 6.1 Complete Environment Configuration

```bash
# apps/api/.env

# === SERVER ===
PORT=3001
NODE_ENV=production

# === DATABASE ===
DATABASE_URL=postgresql://user:pass@host:5432/chatuncle

# === AUTHENTICATION ===
JWT_SECRET=your-secure-jwt-secret-key
JWT_EXPIRES_IN=7d

# === CORS ===
CORS_ORIGIN=https://chatuncle.vercel.app
FRONTEND_URL=https://chatuncle.vercel.app

# === CLOUDINARY (Media Storage) ===
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# === ORDEROPS INTEGRATION ===
ORDEROPS_API_URL=https://api.orderops.com
ORDEROPS_USERNAME=your-username
ORDEROPS_PASSWORD=your-password

# === OPENAI (AI Reply) ===
OPENAI_API_KEY=sk-your-openai-key

# === META (Instagram/Messenger) ===
META_APP_ID=your-app-id
META_APP_SECRET=your-app-secret
META_VERIFY_TOKEN=your-webhook-verify-token

# === TIKTOK SHOP ===
TIKTOK_APP_KEY=your-app-key
TIKTOK_APP_SECRET=your-app-secret

# === REDIS (Optional - for scaling) ===
REDIS_URL=redis://localhost:6379
```

### 6.2 Environment Config Module

```typescript
// apps/api/src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Auth
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  // OrderOps
  orderops: {
    apiUrl: process.env.ORDEROPS_API_URL,
    username: process.env.ORDEROPS_USERNAME,
    password: process.env.ORDEROPS_PASSWORD,
  },

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Meta
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.META_VERIFY_TOKEN,
  },

  // TikTok
  tiktok: {
    appKey: process.env.TIKTOK_APP_KEY,
    appSecret: process.env.TIKTOK_APP_SECRET,
  },

  // Redis
  redisUrl: process.env.REDIS_URL,
};
```

---

## Part 7: Deployment Architecture (Render + Vercel)

### 6.1 Infrastructure Blueprint

**Source:** [Render Blueprints](https://render.com/docs/blueprint-spec)

```yaml
# render.yaml
services:
  - type: web
    name: chatuncle-api
    runtime: node
    region: singapore
    plan: starter  # or standard for production
    buildCommand: cd backend && npm install && npm run build
    startCommand: cd backend && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: chatuncle-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: FRONTEND_URL
        value: https://chatuncle.vercel.app
    healthCheckPath: /health

databases:
  - name: chatuncle-db
    region: singapore
    plan: starter  # 1GB RAM, 1GB storage
    postgresMajorVersion: 16
    ipAllowList: []  # Allow all (use internal URL)
```

**Frontend (Vercel):**
```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/.next",
  "framework": "nextjs",
  "regions": ["sin1"]  // Singapore
}
```

### 6.2 Connection Strategy

- Backend uses PostgreSQL internal URL (same region = low latency)
- Frontend connects to backend via HTTPS + WSS
- CORS configured for Vercel domain
- WebSocket sticky sessions (Render handles automatically)

### 6.3 Scaling Considerations

**Single Instance (Current):**
- One Node.js process handles all WhatsApp sessions
- Sessions stored in memory + PostgreSQL
- Suitable for up to ~50 concurrent accounts

**Future Scaling:**
- Redis for session state sharing
- Horizontal scaling with session affinity
- Message queue (Bull/BullMQ) for async processing
- Separate worker processes for heavy tasks

---

## Part 7: ChatUncle V2 Implementation Plan

### 7.1 Phase 1: Foundation (Week 1-2)

#### 7.1.1 Project Structure
```
chatuncle-v2/
├── apps/
│   ├── api/                    # Express + Socket.io backend
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   │   ├── migrations/
│   │   │   │   └── schema.ts   # Drizzle ORM schema
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── accounts/
│   │   │   │   ├── conversations/
│   │   │   │   ├── messages/
│   │   │   │   ├── contacts/
│   │   │   │   └── channels/
│   │   │   ├── channels/       # Channel adapters
│   │   │   │   ├── base.ts
│   │   │   │   ├── whatsapp/
│   │   │   │   ├── telegram/
│   │   │   │   ├── tiktok/
│   │   │   │   └── meta/
│   │   │   ├── realtime/       # Socket.io handlers
│   │   │   ├── queue/          # BullMQ jobs
│   │   │   └── utils/
│   │   └── package.json
│   └── web/                    # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── stores/         # Zustand stores
│       └── package.json
├── packages/
│   └── shared/                 # Shared types & utils
│       ├── src/
│       │   ├── types/
│       │   └── utils/
│       └── package.json
├── legacy/                     # Old codebase (read-only)
├── turbo.json                  # Turborepo config
├── render.yaml
└── package.json
```

#### 7.1.2 Technology Upgrades

| Current | V2 |
|---------|-----|
| Raw SQL | Drizzle ORM |
| pg driver | Drizzle + pg |
| Manual migrations | Drizzle-kit |
| Express routes | Express + Zod validation |
| Socket.io (basic) | Socket.io + typed events |
| React state | Zustand |
| No caching | Redis (optional) |
| No job queue | BullMQ |

#### 7.1.3 Database Migration

```typescript
// packages/shared/src/types/index.ts
export type ChannelType = 'whatsapp' | 'telegram' | 'tiktok' | 'instagram' | 'messenger';

export type MessageStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type ContentType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location';
```

### 7.2 Phase 2: Channel Adapters (Week 3-4)

#### 7.2.1 Base Adapter Interface

```typescript
// apps/api/src/channels/base.ts
export interface ChannelAdapter {
  readonly type: ChannelType;

  // Lifecycle
  initialize(config: ChannelConfig): Promise<void>;
  connect(accountId: string, credentials: unknown): Promise<ConnectionResult>;
  disconnect(accountId: string): Promise<void>;
  shutdown(): Promise<void>;

  // Messaging
  sendMessage(params: SendMessageParams): Promise<SendResult>;
  sendMedia(params: SendMediaParams): Promise<SendResult>;

  // Status
  getStatus(accountId: string): ConnectionStatus;
  isConnected(accountId: string): boolean;
  getActiveAccounts(): string[];

  // Events
  on(event: 'message', handler: MessageHandler): void;
  on(event: 'status', handler: StatusHandler): void;
  on(event: 'connection', handler: ConnectionHandler): void;
}
```

#### 7.2.2 WhatsApp Adapter (Baileys v7.0.0-rc.9)

```typescript
// apps/api/src/channels/whatsapp/adapter.ts
export class WhatsAppAdapter implements ChannelAdapter {
  readonly type = 'whatsapp';
  private sessions = new Map<string, WASocket>();
  private authStates = new Map<string, AuthState>();

  async connect(accountId: string, options?: ConnectOptions): Promise<ConnectionResult> {
    // 1. Load or create auth state from PostgreSQL
    // 2. Create socket with proper Baileys v7 config
    // 3. Handle QR/pairing code
    // 4. Set up event listeners
    // 5. Store LID/PN mappings
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    // 1. Get socket for account
    // 2. Resolve LID if needed
    // 3. Apply anti-ban delay
    // 4. Send via Baileys
    // 5. Return result
  }
}
```

#### 7.2.3 Telegram Adapter

```typescript
// apps/api/src/channels/telegram/adapter.ts
export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram';
  private bots = new Map<string, TelegramBot>();

  // Use node-telegram-bot-api or grammy
}
```

#### 7.2.4 TikTok DM Adapter

```typescript
// apps/api/src/channels/tiktok/adapter.ts
export class TikTokAdapter implements ChannelAdapter {
  readonly type = 'tiktok';

  // TikTok Shop API for DMs
  // Requires business account and API access
}
```

#### 7.2.5 Meta Adapter (Instagram/Messenger)

```typescript
// apps/api/src/channels/meta/adapter.ts
export class MetaAdapter implements ChannelAdapter {
  // Unified adapter for Instagram and Messenger
  // Uses Meta Graph API
  // Requires Facebook Page and Instagram Business account
}
```

### 7.3 Phase 3: Real-Time Engine (Week 5)

#### 7.3.1 Typed Socket Events

```typescript
// packages/shared/src/types/socket.ts
export interface ServerToClientEvents {
  'message:new': (data: NewMessageEvent) => void;
  'message:status': (data: MessageStatusEvent) => void;
  'message:reaction': (data: ReactionEvent) => void;
  'typing:update': (data: TypingEvent) => void;
  'account:status': (data: AccountStatusEvent) => void;
  'qr:update': (data: QRUpdateEvent) => void;
}

export interface ClientToServerEvents {
  'join:account': (accountId: string) => void;
  'leave:account': (accountId: string) => void;
  'typing:start': (data: TypingData) => void;
  'typing:stop': (data: TypingData) => void;
}
```

#### 7.3.2 Event Payload Optimization

```typescript
// Minimal payloads for speed
interface NewMessageEvent {
  accountId: string;
  conversationId: string;
  channelType: ChannelType;
  message: {
    id: string;
    tempId?: string;  // For optimistic UI
    senderType: 'agent' | 'contact';
    contentType: ContentType;
    content?: string;
    mediaUrl?: string;
    timestamp: string;
    status: MessageStatus;
  };
  contact?: {
    id: string;
    name: string;
  };
}
```

### 7.4 Phase 4: Features (Week 6-7)

#### 7.4.1 Templates System
- Shared templates with team
- Variable interpolation
- Media template support
- Quick replies

#### 7.4.2 Sequences
- Multi-step automated flows
- Trigger conditions
- Delay between steps
- Stop conditions

#### 7.4.3 Scheduled Messages
- Calendar-based scheduling
- Timezone support
- Recurring messages
- Queue management

#### 7.4.4 AI Reply
- Knowledge bank management
- Vector embeddings (pgvector)
- Context-aware responses
- Fallback to human agent

#### 7.4.5 OrderOps Integration
- Order parsing from messages
- Driver assignment
- Status updates
- Conversation linking

### 7.5 Phase 5: Polish & Deploy (Week 8)

#### 7.5.1 Testing
- Unit tests for adapters
- Integration tests for message flow
- E2E tests for critical paths

#### 7.5.2 Monitoring
- Health check endpoints
- Error tracking (Sentry)
- Performance metrics
- Session health monitoring

#### 7.5.3 Documentation
- API documentation (Swagger/OpenAPI)
- Deployment guide
- Configuration reference

---

## Part 8: File Migration Plan

### 8.1 Legacy Files (Move to /legacy)

```
legacy/
├── backend/              # Complete current backend
├── frontend/             # Complete current frontend
└── README.md             # Notes on legacy system
```

### 8.2 Files to Reference During Rewrite

| Legacy File | Purpose | V2 Location |
|-------------|---------|-------------|
| `SessionManager.ts` | WhatsApp session logic | `channels/whatsapp/session.ts` |
| `PostgresAuthState.ts` | Baileys auth storage | `channels/whatsapp/auth.ts` |
| `antiBan.ts` | Rate limiting logic | `channels/whatsapp/anti-ban.ts` |
| `MessageQueue.ts` | Queue implementation | `queue/message-queue.ts` |
| `BufferedEventHandler.ts` | Event batching | `channels/whatsapp/events.ts` |
| `socket.ts` | Socket.io setup | `realtime/socket.ts` |
| `migrate.ts` | DB schema | `db/schema.ts` (Drizzle) |

---

## Part 9: Key Decisions

### 9.1 ORM Choice: Drizzle

**Why Drizzle over Prisma:**
- TypeScript-first, better type inference
- Lighter weight, faster cold starts
- SQL-like query builder
- Better for raw SQL when needed
- Excellent migration tooling

### 9.2 State Management: Zustand

**Why Zustand over Redux:**
- Simpler API, less boilerplate
- Better TypeScript support
- Easier to test
- Smaller bundle size
- Natural React patterns

### 9.3 Monorepo: Turborepo

**Why Turborepo:**
- Fast incremental builds
- Shared types between frontend/backend
- Parallel execution
- Remote caching support

### 9.4 Job Queue: BullMQ

**Why BullMQ:**
- Redis-backed, reliable
- Delayed jobs support
- Rate limiting built-in
- Good for scheduled messages
- Progress tracking

---

## Part 10: Success Metrics

### 10.1 Performance Targets

| Metric | Target |
|--------|--------|
| Message send latency | < 2 seconds |
| Socket event delivery | < 100ms |
| API response time | < 200ms (p95) |
| QR code display | < 3 seconds |
| Session restore | < 5 seconds |

### 10.2 Reliability Targets

| Metric | Target |
|--------|--------|
| Message delivery rate | > 99.5% |
| Uptime | > 99.9% |
| Session stability | > 99% |
| Auto-reconnect success | > 95% |

---

## Part 11: Parallel Processing & Performance Optimization

### 11.1 Database Batch Operations

**Problem:** Individual INSERT/UPDATE statements are slow for bulk operations.

**Solution:** Batch inserts with PostgreSQL `UNNEST` for parallel processing.

```typescript
// apps/api/src/db/batch-operations.ts

/**
 * Batch insert contacts (up to 200 at a time)
 * Uses PostgreSQL UNNEST for single-query bulk insert
 */
export async function batchInsertContacts(
  contacts: ContactInsert[]
): Promise<string[]> {
  if (contacts.length === 0) return [];

  const result = await query<{ id: string }>(`
    INSERT INTO contacts (account_id, wa_id, name, phone_number, channel_type, jid_type)
    SELECT * FROM UNNEST(
      $1::uuid[],
      $2::text[],
      $3::text[],
      $4::text[],
      $5::text[],
      $6::text[]
    )
    ON CONFLICT (account_id, wa_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, contacts.name),
      phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number)
    RETURNING id
  `, [
    contacts.map(c => c.accountId),
    contacts.map(c => c.waId),
    contacts.map(c => c.name),
    contacts.map(c => c.phoneNumber),
    contacts.map(c => c.channelType),
    contacts.map(c => c.jidType),
  ]);

  return result.map(r => r.id);
}

/**
 * Batch insert messages (up to 100 at a time)
 */
export async function batchInsertMessages(
  messages: MessageInsert[]
): Promise<string[]> {
  if (messages.length === 0) return [];

  const result = await query<{ id: string }>(`
    INSERT INTO messages (
      conversation_id, wa_message_id, sender_type, content_type,
      content, media_url, status, channel_type, created_at
    )
    SELECT * FROM UNNEST(
      $1::uuid[], $2::text[], $3::text[], $4::text[],
      $5::text[], $6::text[], $7::text[], $8::text[], $9::timestamptz[]
    )
    ON CONFLICT (wa_message_id) DO NOTHING
    RETURNING id
  `, [
    messages.map(m => m.conversationId),
    messages.map(m => m.waMessageId),
    messages.map(m => m.senderType),
    messages.map(m => m.contentType),
    messages.map(m => m.content),
    messages.map(m => m.mediaUrl),
    messages.map(m => m.status),
    messages.map(m => m.channelType),
    messages.map(m => m.createdAt),
  ]);

  return result.map(r => r.id);
}
```

### 11.2 Parallel Message Processing Configuration

```typescript
// apps/api/src/channels/whatsapp/batch-config.ts

/**
 * Batch processing configuration
 * Optimized for 2GB RAM + Speed
 */
export const BATCH_CONFIG = {
  // === LIVE MESSAGE PROCESSING ===
  MESSAGE_BATCH_SIZE: 50,        // Process 50 messages in parallel
  CONTACT_BATCH_SIZE: 200,       // Batch insert 200 contacts
  GROUP_BATCH_SIZE: 20,          // Process 20 groups in parallel
  BATCH_DELAY_MS: 10,            // Minimal delay between batches

  // === HISTORY SYNC (Background) ===
  // Higher parallelism - doesn't affect live performance
  HISTORY_MESSAGE_BATCH_SIZE: 100,
  HISTORY_GROUP_BATCH_SIZE: 50,
  HISTORY_CONTACT_BATCH_SIZE: 500,

  // === DATABASE CONNECTION POOL ===
  DB_POOL_SIZE: 20,              // Max concurrent connections
  DB_IDLE_TIMEOUT_MS: 30000,     // 30 seconds idle timeout
};
```

### 11.3 Parallel Processing Pattern

```typescript
// apps/api/src/utils/parallel.ts

/**
 * Process items in parallel batches with controlled concurrency
 */
export async function processInParallelBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  options: { delayMs?: number; onBatchComplete?: (batch: number) => void } = {}
): Promise<R[]> {
  const results: R[] = [];
  const batches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batch = items.slice(i * batchSize, (i + 1) * batchSize);

    // Process batch in parallel
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    options.onBatchComplete?.(i + 1);

    // Small delay between batches (not within)
    if (options.delayMs && i < batches - 1) {
      await sleep(options.delayMs);
    }
  }

  return results;
}

// Usage example: Process 500 messages in batches of 50
const savedMessages = await processInParallelBatches(
  incomingMessages,
  50,
  async (msg) => saveMessage(msg),
  { delayMs: 10 }
);
```

### 11.4 History Sync - Background Processing

**Key Principle:** History sync should NEVER block live message processing.

```typescript
// apps/api/src/channels/whatsapp/history-sync.ts

/**
 * Process history sync in background with low priority
 * Does NOT affect live message latency
 */
export async function processHistorySync(
  accountId: string,
  messages: proto.IWebMessageInfo[],
  contacts: proto.IContact[]
): Promise<void> {
  console.log(`[HistorySync] Processing ${messages.length} messages, ${contacts.length} contacts`);

  // Run in background - don't await
  setImmediate(async () => {
    try {
      // 1. Batch insert contacts first (they're needed for messages)
      const contactBatches = chunk(contacts, BATCH_CONFIG.HISTORY_CONTACT_BATCH_SIZE);
      for (const batch of contactBatches) {
        await batchInsertContacts(batch.map(transformContact));
        // Yield to event loop for live messages
        await setImmediatePromise();
      }

      // 2. Batch insert messages
      const messageBatches = chunk(messages, BATCH_CONFIG.HISTORY_MESSAGE_BATCH_SIZE);
      for (const batch of messageBatches) {
        await batchInsertMessages(batch.map(transformMessage));
        // Yield to event loop
        await setImmediatePromise();
      }

      console.log(`[HistorySync] Completed for account ${accountId}`);
    } catch (error) {
      console.error(`[HistorySync] Error:`, error);
    }
  });
}

// Helper to yield to event loop
function setImmediatePromise(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
```

### 11.5 BullMQ for Scheduled & Heavy Tasks

```typescript
// apps/api/src/queue/setup.ts
import { Queue, Worker } from 'bullmq';
import { config } from '../config/env';

const connection = { url: config.redisUrl };

// === QUEUES ===
export const scheduledMessageQueue = new Queue('scheduled-messages', { connection });
export const historySyncQueue = new Queue('history-sync', { connection });
export const mediaProcessingQueue = new Queue('media-processing', { connection });

// === WORKERS ===
export const scheduledMessageWorker = new Worker(
  'scheduled-messages',
  async (job) => {
    const { accountId, conversationId, content, mediaUrl } = job.data;
    await sendScheduledMessage(accountId, conversationId, content, mediaUrl);
  },
  {
    connection,
    concurrency: 5,  // Process 5 scheduled messages in parallel
  }
);

export const historySyncWorker = new Worker(
  'history-sync',
  async (job) => {
    const { accountId, messages, contacts } = job.data;
    await processHistorySync(accountId, messages, contacts);
  },
  {
    connection,
    concurrency: 2,  // Only 2 history syncs at a time (heavy)
  }
);
```

---

## Part 12: Multi-Agent Real-Time Sync & Deduplication

### 12.1 The Problem

When multiple agents share an account:
1. **Agent A sends a message** → Message saved to DB
2. **All agents need to see it** → Socket broadcast
3. **Agent A already has it** → Don't duplicate in their UI

### 12.2 Socket.io Sender Exclusion Pattern

```typescript
// apps/api/src/realtime/socket.ts
import { Server, Socket } from 'socket.io';

/**
 * CRITICAL: Use socket.to() NOT io.to() when excluding sender
 *
 * socket.to(room).emit()  → Everyone in room EXCEPT sender
 * io.to(room).emit()      → Everyone in room INCLUDING sender
 */

// When agent sends a message
socket.on('message:send', async (data) => {
  const { accountId, conversationId, content } = data;

  // Save to DB
  const savedMessage = await saveMessage(data);

  // Broadcast to ALL agents in account room EXCEPT sender
  socket.to(`account:${accountId}`).emit('message:new', {
    ...savedMessage,
    _source: 'other',  // Tells UI this is from another agent
  });

  // Send confirmation back to sender only
  socket.emit('message:sent', {
    ...savedMessage,
    _source: 'self',   // Tells UI this is their own message
  });
});
```

### 12.3 Room Structure for Multi-Agent

```typescript
// Room naming convention
const ROOM_PATTERNS = {
  // User's personal notifications (login, logout, system)
  user: (userId: string) => `user:${userId}`,

  // All agents sharing an account (messages, typing, status)
  account: (accountId: string) => `account:${accountId}`,

  // Specific conversation (legacy, optional)
  conversation: (convId: string) => `conversation:${convId}`,
};

// On socket connection
io.on('connection', (socket) => {
  const user = socket.data.user;

  // Always join personal room
  socket.join(`user:${user.id}`);

  // Join account rooms on request (with access validation)
  socket.on('join:account', async (accountId: string) => {
    const hasAccess = await userHasAccountAccess(user.id, accountId);
    if (hasAccess) {
      socket.join(`account:${accountId}`);
      socket.emit('room:joined', { accountId });
    } else {
      socket.emit('room:error', { accountId, error: 'Access denied' });
    }
  });
});
```

### 12.4 Frontend Deduplication

```typescript
// apps/web/src/stores/messages.ts
import { create } from 'zustand';

interface MessagesStore {
  messages: Map<string, Message>;
  pendingMessages: Map<string, Message>;  // Optimistic updates

  addMessage: (message: Message, source: 'self' | 'other' | 'incoming') => void;
  confirmPending: (tempId: string, realId: string) => void;
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  messages: new Map(),
  pendingMessages: new Map(),

  addMessage: (message, source) => {
    const { messages, pendingMessages } = get();

    // Check if already exists (deduplication)
    if (messages.has(message.id)) {
      console.log('[Dedup] Message already exists:', message.id);
      return;
    }

    // Check if this is confirmation of a pending message
    if (message.tempId && pendingMessages.has(message.tempId)) {
      // Move from pending to confirmed
      set(state => {
        state.pendingMessages.delete(message.tempId!);
        state.messages.set(message.id, { ...message, status: 'sent' });
        return state;
      });
      return;
    }

    // New message
    set(state => {
      state.messages.set(message.id, message);
      return state;
    });
  },
}));
```

### 12.5 Three-Layer Deduplication System

```
┌─────────────────────────────────────────────────────────────┐
│                  MESSAGE DEDUPLICATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: MEMORY (Fast, In-Process)                         │
│  ├── LRU Cache: 150,000 entries                             │
│  ├── TTL: 2 hours                                           │
│  ├── Key: accountId:messageId                               │
│  └── Check: O(1) hash lookup                                │
│                                                              │
│  Layer 2: DATABASE (Persistent, After Restart)              │
│  ├── Query: SELECT id FROM messages WHERE wa_message_id=$1  │
│  ├── Cached negative results for 5 minutes                  │
│  └── Bulk check: IN (...) for batch operations              │
│                                                              │
│  Layer 3: FRONTEND (Client-Side)                            │
│  ├── Message Map by ID                                      │
│  ├── Pending message tracking (optimistic UI)               │
│  └── tempId → realId mapping                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

```typescript
// apps/api/src/services/deduplication.ts

class MessageDeduplicator {
  // Layer 1: Memory cache
  private processed = new Map<string, number>();
  private maxEntries = 150000;
  private ttlMs = 7200000; // 2 hours

  // Layer 2: DB check cache (avoid repeated queries)
  private recentDbChecks = new Map<string, number>();
  private dbCheckTtlMs = 300000; // 5 minutes

  /**
   * Check and mark - atomic operation
   * Returns true if DUPLICATE (skip), false if NEW (process)
   */
  async checkAndMark(accountId: string, messageId: string): Promise<boolean> {
    // Layer 1: Memory check (fast)
    if (this.isInMemory(accountId, messageId)) {
      return true; // Duplicate
    }

    // Layer 2: Database check (after server restart)
    if (await this.isInDatabase(accountId, messageId)) {
      this.markInMemory(accountId, messageId); // Cache for next time
      return true; // Duplicate
    }

    // New message - mark and return
    this.markInMemory(accountId, messageId);
    return false;
  }

  /**
   * Bulk check for batch processing
   * Returns array of NEW message IDs only
   */
  async filterNew(accountId: string, messageIds: string[]): Promise<string[]> {
    // Memory filter first (fast)
    const notInMemory = messageIds.filter(
      id => !this.isInMemory(accountId, id)
    );

    if (notInMemory.length === 0) return [];

    // Bulk DB check
    const existing = await query<{ wa_message_id: string }>(`
      SELECT wa_message_id FROM messages
      WHERE wa_message_id = ANY($1)
    `, [notInMemory]);

    const existingIds = new Set(existing.map(e => e.wa_message_id));

    // Mark found ones in memory
    existing.forEach(e => this.markInMemory(accountId, e.wa_message_id));

    // Return only truly new ones
    return notInMemory.filter(id => !existingIds.has(id));
  }
}
```

### 12.6 Typed Socket Events (Full)

```typescript
// packages/shared/src/types/socket.ts

// === SERVER → CLIENT ===
export interface ServerToClientEvents {
  // Messages
  'message:new': (data: {
    accountId: string;
    conversationId: string;
    message: Message;
    contact?: { id: string; name: string };
    _source: 'self' | 'other' | 'incoming';  // Critical for dedup
  }) => void;

  'message:sent': (data: {
    tempId: string;      // Client's temporary ID
    message: Message;    // Saved message with real ID
  }) => void;

  'message:status': (data: {
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    error?: string;
  }) => void;

  'message:reaction': (data: {
    messageId: string;
    reaction: string;
    reactorName?: string;
  }) => void;

  // Typing
  'typing:start': (data: {
    conversationId: string;
    userId: string;
    userName: string;
  }) => void;

  'typing:stop': (data: {
    conversationId: string;
    userId: string;
  }) => void;

  // Account
  'account:status': (data: {
    accountId: string;
    status: 'connected' | 'connecting' | 'disconnected' | 'qr_required';
    qrCode?: string;
  }) => void;

  // Rooms
  'room:joined': (data: { accountId: string }) => void;
  'room:error': (data: { accountId: string; error: string }) => void;
}

// === CLIENT → SERVER ===
export interface ClientToServerEvents {
  'join:account': (accountId: string) => void;
  'leave:account': (accountId: string) => void;
  'typing:start': (data: { accountId: string; conversationId: string }) => void;
  'typing:stop': (data: { accountId: string; conversationId: string }) => void;
}
```

### 12.7 Group & Contact Metadata Parallel Processing

```typescript
// apps/api/src/channels/whatsapp/metadata-sync.ts

/**
 * Sync group metadata in parallel batches
 * Runs in background, doesn't block messages
 */
export async function syncGroupMetadata(
  sock: WASocket,
  accountId: string,
  groupJids: string[]
): Promise<void> {
  const BATCH_SIZE = 20;

  // Process in parallel batches
  for (let i = 0; i < groupJids.length; i += BATCH_SIZE) {
    const batch = groupJids.slice(i, i + BATCH_SIZE);

    // Fetch metadata in parallel
    const metadataPromises = batch.map(async (jid) => {
      try {
        return await sock.groupMetadata(jid);
      } catch (error) {
        console.error(`Failed to fetch metadata for ${jid}:`, error);
        return null;
      }
    });

    const results = await Promise.all(metadataPromises);

    // Batch upsert to database
    const validResults = results.filter(Boolean);
    if (validResults.length > 0) {
      await batchUpsertGroups(accountId, validResults);
    }

    // Yield to event loop
    await setImmediatePromise();
  }
}

/**
 * Sync contact profiles in parallel
 * Uses cache to avoid re-fetching
 */
export async function syncContactProfiles(
  sock: WASocket,
  accountId: string,
  contactJids: string[]
): Promise<void> {
  const BATCH_SIZE = 50;
  const cache = new Map<string, ContactProfile>();

  for (let i = 0; i < contactJids.length; i += BATCH_SIZE) {
    const batch = contactJids.slice(i, i + BATCH_SIZE);

    // Filter out already cached
    const uncached = batch.filter(jid => !cache.has(jid));

    if (uncached.length > 0) {
      // Fetch profiles in parallel
      const profiles = await Promise.all(
        uncached.map(async (jid) => {
          try {
            const status = await sock.fetchStatus(jid);
            const profilePic = await sock.profilePictureUrl(jid, 'preview').catch(() => null);
            return { jid, status: status?.status, profilePic };
          } catch {
            return { jid, status: null, profilePic: null };
          }
        })
      );

      // Cache results
      profiles.forEach(p => cache.set(p.jid, p));

      // Batch update database
      await batchUpdateContactProfiles(accountId, profiles);
    }

    await setImmediatePromise();
  }
}
```

---

## Part 13: Channel Integration Guide - Telegram

### 13.1 Overview

Telegram bots are special accounts that serve as an interface for code running on your server. Users interact with bots via commands in private or group chats.

**Recommended Library:** [grammY](https://grammy.dev/) - Modern, TypeScript-first framework with excellent documentation.

**Alternative:** [Telegraf](https://telegraf.js.org/) - Mature, widely-used framework.

### 11.2 Setup & Authentication

#### Step 1: Create Bot with BotFather
```
1. Open Telegram, search for @BotFather
2. Send /newbot command
3. Follow prompts to set name and username
4. Receive bot token: 123456789:AbCdefGhIJKlmNoPQRsTUVwxyZ
```

#### Step 2: Install grammY
```bash
npm install grammy
```

#### Step 3: Basic Bot Setup
```typescript
// apps/api/src/channels/telegram/adapter.ts
import { Bot, Context, session } from 'grammy';
import { type Conversation, type ConversationFlavor, conversations, createConversation } from '@grammyjs/conversations';

interface SessionData {
  accountId: string;
  chatUncleUserId: string;
}

type MyContext = Context & ConversationFlavor & { session: SessionData };

export class TelegramAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'telegram';
  private bots = new Map<string, Bot<MyContext>>();
  private messageHandler?: MessageHandler;

  async connect(accountId: string, credentials: { botToken: string }): Promise<ConnectionResult> {
    const bot = new Bot<MyContext>(credentials.botToken);

    // Session middleware for persistence
    bot.use(session({
      initial: (): SessionData => ({
        accountId: '',
        chatUncleUserId: '',
      }),
    }));

    // Conversations plugin for multi-step flows
    bot.use(conversations());

    // Handle all incoming messages
    bot.on('message', async (ctx) => {
      const message = this.transformMessage(ctx, accountId);
      this.messageHandler?.(message);
    });

    // Handle edited messages
    bot.on('edited_message', async (ctx) => {
      // Emit edit event
    });

    // Start bot
    bot.start({
      onStart: () => console.log(`Telegram bot ${accountId} started`),
    });

    this.bots.set(accountId, bot);

    return { success: true, status: 'connected' };
  }

  private transformMessage(ctx: Context, accountId: string): IncomingMessage {
    const msg = ctx.message!;

    return {
      channelType: 'telegram',
      channelAccountId: accountId,
      channelMessageId: msg.message_id.toString(),
      chatId: msg.chat.id.toString(),
      senderId: msg.from?.id.toString() || '',
      senderName: msg.from?.first_name + (msg.from?.last_name ? ` ${msg.from.last_name}` : ''),
      contentType: this.getContentType(msg),
      content: msg.text || msg.caption,
      mediaUrl: this.getMediaUrl(msg),
      isGroup: msg.chat.type === 'group' || msg.chat.type === 'supergroup',
      groupId: msg.chat.type !== 'private' ? msg.chat.id.toString() : undefined,
      groupName: msg.chat.type !== 'private' ? msg.chat.title : undefined,
      replyToMessageId: msg.reply_to_message?.message_id.toString(),
      timestamp: new Date(msg.date * 1000),
      rawMessage: msg,
    };
  }

  private getContentType(msg: any): ContentType {
    if (msg.photo) return 'image';
    if (msg.video) return 'video';
    if (msg.audio || msg.voice) return 'audio';
    if (msg.document) return 'document';
    if (msg.sticker) return 'sticker';
    if (msg.location) return 'location';
    return 'text';
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const bot = this.bots.get(params.accountId);
    if (!bot) throw new Error('Bot not connected');

    const chatId = parseInt(params.recipientId);

    try {
      let result;

      switch (params.contentType) {
        case 'text':
          result = await bot.api.sendMessage(chatId, params.content!, {
            reply_to_message_id: params.replyToMessageId ? parseInt(params.replyToMessageId) : undefined,
          });
          break;

        case 'image':
          result = await bot.api.sendPhoto(chatId, params.mediaUrl!, {
            caption: params.content,
          });
          break;

        case 'video':
          result = await bot.api.sendVideo(chatId, params.mediaUrl!, {
            caption: params.content,
          });
          break;

        case 'audio':
          result = await bot.api.sendAudio(chatId, params.mediaUrl!);
          break;

        case 'document':
          result = await bot.api.sendDocument(chatId, params.mediaUrl!, {
            caption: params.content,
          });
          break;

        case 'sticker':
          result = await bot.api.sendSticker(chatId, params.mediaUrl!);
          break;

        case 'location':
          const [lat, lng] = params.content!.split(',').map(Number);
          result = await bot.api.sendLocation(chatId, lat, lng);
          break;
      }

      return {
        success: true,
        messageId: result.message_id.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const bot = this.bots.get(accountId);
    if (bot) {
      await bot.stop();
      this.bots.delete(accountId);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}
```

### 11.3 Webhook vs Long Polling

**Long Polling (Development):**
```typescript
bot.start(); // Uses long polling by default
```

**Webhooks (Production):**
```typescript
// Express webhook handler
import express from 'express';
import { webhookCallback } from 'grammy';

const app = express();
app.use(express.json());

app.post('/telegram/webhook/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const bot = bots.get(accountId);
  if (bot) {
    await webhookCallback(bot, 'express')(req, res);
  }
});

// Set webhook URL
await bot.api.setWebhook('https://api.chatuncle.my/telegram/webhook/' + accountId);
```

### 11.4 Telegram-Specific Features

| Feature | Support | Notes |
|---------|---------|-------|
| Text messages | ✅ | Full Markdown/HTML formatting |
| Photos | ✅ | Up to 10MB |
| Videos | ✅ | Up to 50MB |
| Documents | ✅ | Up to 50MB |
| Voice/Audio | ✅ | OGG format for voice |
| Stickers | ✅ | WebP/TGS format |
| Location | ✅ | Live location supported |
| Inline keyboards | ✅ | Interactive buttons |
| Reply keyboards | ✅ | Custom keyboard layouts |
| Groups | ✅ | Supergroups, channels |
| Reactions | ✅ | Limited emoji set |
| Edited messages | ✅ | Edit tracking |

### 11.5 Database Schema Additions

```sql
-- Telegram-specific account fields
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS telegram_bot_token VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS telegram_bot_username VARCHAR(100);

-- Telegram-specific contact fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100);

-- Index for telegram lookups
CREATE INDEX idx_contacts_telegram ON contacts(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
```

---

## Part 12: Channel Integration Guide - TikTok Shop

### 12.1 Overview

TikTok Shop Customer Service API allows sellers to manage buyer conversations programmatically.

**API Base URL:** `https://open-api.tiktokglobalshop.com`
**API Version:** `202309` (latest)
**Documentation:** [TikTok Shop Partner Center](https://partner.tiktokshop.com/docv2/page/659645f9a46cdd02bc8aeacf)

### 12.2 Prerequisites

1. **TikTok Shop Seller Account** - Active shop in supported region
2. **Developer App** - Created at [TikTok Shop Partner Center](https://partner.tiktokshop.com)
3. **API Credentials:**
   - `app_key` - Application identifier
   - `app_secret` - For signing requests
   - `access_token` - OAuth 2.0 token (90-day validity)
   - `shop_cipher` - Shop identifier

### 12.3 OAuth 2.0 Authentication

```typescript
// apps/api/src/channels/tiktok/auth.ts
import crypto from 'crypto';

interface TikTokCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher: string;
}

export function generateSignature(
  appSecret: string,
  path: string,
  timestamp: number,
  params: Record<string, string>
): string {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}${params[key]}`)
    .join('');

  // Create signature base string
  const baseString = `${appSecret}${path}${sortedParams}${appSecret}`;

  // HMAC-SHA256 signature
  return crypto
    .createHmac('sha256', appSecret)
    .update(baseString)
    .digest('hex');
}

export async function refreshAccessToken(
  appKey: string,
  appSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch('https://auth.tiktok-shops.com/api/v2/token/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      app_key: appKey,
      app_secret: appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresIn: data.data.access_token_expire_in,
  };
}
```

### 12.4 TikTok Adapter Implementation

```typescript
// apps/api/src/channels/tiktok/adapter.ts
import { generateSignature } from './auth';

interface TikTokConversation {
  conversation_id: string;
  buyer_user_id: string;
  buyer_username: string;
  last_message_time: number;
}

interface TikTokMessage {
  message_id: string;
  content: string;
  message_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'ORDER_CARD';
  create_time: number;
  sender_role: 'BUYER' | 'SELLER';
}

export class TikTokAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'tiktok';
  private credentials = new Map<string, TikTokCredentials>();
  private pollingIntervals = new Map<string, NodeJS.Timeout>();
  private messageHandler?: MessageHandler;

  private readonly API_BASE = 'https://open-api.tiktokglobalshop.com';
  private readonly API_VERSION = '202309';

  async connect(accountId: string, creds: TikTokCredentials): Promise<ConnectionResult> {
    this.credentials.set(accountId, creds);

    // Start polling for new messages (TikTok doesn't support webhooks for DMs)
    const interval = setInterval(() => {
      this.pollMessages(accountId);
    }, 30000); // Poll every 30 seconds

    this.pollingIntervals.set(accountId, interval);

    return { success: true, status: 'connected' };
  }

  private async makeRequest(
    accountId: string,
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, any>
  ): Promise<any> {
    const creds = this.credentials.get(accountId);
    if (!creds) throw new Error('Not connected');

    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      app_key: creds.appKey,
      timestamp: timestamp.toString(),
      shop_cipher: creds.shopCipher,
    };

    const signature = generateSignature(creds.appSecret, path, timestamp, params);

    const url = new URL(`${this.API_BASE}${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set('sign', signature);

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': creds.accessToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json();
  }

  private async pollMessages(accountId: string): Promise<void> {
    try {
      // Get conversations list
      const convResponse = await this.makeRequest(
        accountId,
        `/customer_service/${this.API_VERSION}/conversations`
      );

      for (const conv of convResponse.data?.conversations || []) {
        // Get messages for each conversation
        const msgResponse = await this.makeRequest(
          accountId,
          `/customer_service/${this.API_VERSION}/conversations/${conv.conversation_id}/messages`
        );

        for (const msg of msgResponse.data?.messages || []) {
          if (msg.sender_role === 'BUYER') {
            const transformed = this.transformMessage(accountId, conv, msg);
            this.messageHandler?.(transformed);
          }
        }
      }
    } catch (error) {
      console.error('TikTok polling error:', error);
    }
  }

  private transformMessage(
    accountId: string,
    conv: TikTokConversation,
    msg: TikTokMessage
  ): IncomingMessage {
    return {
      channelType: 'tiktok',
      channelAccountId: accountId,
      channelMessageId: msg.message_id,
      chatId: conv.conversation_id,
      senderId: conv.buyer_user_id,
      senderName: conv.buyer_username,
      contentType: this.mapContentType(msg.message_type),
      content: msg.content,
      mediaUrl: msg.message_type !== 'TEXT' ? msg.content : undefined,
      isGroup: false,
      timestamp: new Date(msg.create_time * 1000),
      rawMessage: msg,
    };
  }

  private mapContentType(tiktokType: string): ContentType {
    switch (tiktokType) {
      case 'IMAGE': return 'image';
      case 'VIDEO': return 'video';
      default: return 'text';
    }
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    try {
      const messageType = params.contentType === 'text' ? 'TEXT' :
                          params.contentType === 'image' ? 'IMAGE' : 'TEXT';

      const response = await this.makeRequest(
        params.accountId,
        `/customer_service/${this.API_VERSION}/conversations/${params.recipientId}/messages`,
        'POST',
        {
          message_type: messageType,
          content: params.contentType === 'text' ? params.content : params.mediaUrl,
        }
      );

      if (response.code === 0) {
        return {
          success: true,
          messageId: response.data.message_id,
        };
      }

      return {
        success: false,
        error: response.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const interval = this.pollingIntervals.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(accountId);
    }
    this.credentials.delete(accountId);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}
```

### 12.5 TikTok Shop API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/customer_service/202309/conversations` | GET | List all conversations |
| `/customer_service/202309/conversations/{id}/messages` | GET | Get messages in conversation |
| `/customer_service/202309/conversations/{id}/messages` | POST | Send message |
| `/customer_service/202309/conversations/{id}/read` | POST | Mark as read |

### 12.6 Limitations & Notes

- **No Webhooks:** Must poll for new messages
- **Rate Limits:** Respect TikTok's API rate limits
- **Media:** Image/video URLs must be accessible
- **Regional:** API availability varies by region
- **Business Only:** Requires seller account

---

## Part 13: Channel Integration Guide - Instagram & Messenger

### 13.1 Overview

Both Instagram and Facebook Messenger use Meta's Graph API. A single adapter can handle both channels with minimal differences.

**Requirements:**
- Facebook Developer Account
- Facebook Page (linked to Instagram Business/Creator account)
- App with Messenger product enabled
- Permissions: `instagram_basic`, `instagram_manage_messages`, `pages_messaging`

### 13.2 App Setup

1. **Create App at [developers.facebook.com](https://developers.facebook.com)**
   - Select "Business" app type
   - Add "Messenger" and "Webhooks" products

2. **Configure Webhooks:**
   - Callback URL: `https://api.chatuncle.my/meta/webhook`
   - Verify Token: Your secret token
   - Subscribe to: `messages`, `messaging_postbacks`

3. **Generate Page Access Token:**
   - Long-lived token required for production
   - Store securely in database

### 13.3 Meta Adapter Implementation

```typescript
// apps/api/src/channels/meta/adapter.ts
import crypto from 'crypto';

interface MetaCredentials {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  instagramAccountId?: string; // For Instagram
}

interface MetaWebhookEvent {
  object: 'page' | 'instagram';
  entry: Array<{
    id: string;
    time: number;
    messaging: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text?: string;
        attachments?: Array<{
          type: 'image' | 'video' | 'audio' | 'file';
          payload: { url: string };
        }>;
        reply_to?: { mid: string };
      };
    }>;
  }>;
}

export class MetaAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'instagram'; // or 'messenger'
  private credentials = new Map<string, MetaCredentials>();
  private messageHandler?: MessageHandler;

  private readonly GRAPH_API_VERSION = 'v21.0';
  private readonly GRAPH_API_BASE = 'https://graph.facebook.com';

  async connect(accountId: string, creds: MetaCredentials): Promise<ConnectionResult> {
    // Verify token is valid
    const response = await fetch(
      `${this.GRAPH_API_BASE}/${this.GRAPH_API_VERSION}/me?access_token=${creds.pageAccessToken}`
    );

    if (!response.ok) {
      return { success: false, error: 'Invalid access token' };
    }

    this.credentials.set(accountId, creds);
    return { success: true, status: 'connected' };
  }

  // Called by Express webhook route
  handleWebhook(accountId: string, event: MetaWebhookEvent): void {
    for (const entry of event.entry) {
      for (const messaging of entry.messaging) {
        if (messaging.message) {
          const transformed = this.transformMessage(accountId, event.object, messaging);
          this.messageHandler?.(transformed);
        }
      }
    }
  }

  private transformMessage(
    accountId: string,
    platform: 'page' | 'instagram',
    messaging: MetaWebhookEvent['entry'][0]['messaging'][0]
  ): IncomingMessage {
    const msg = messaging.message!;

    let contentType: ContentType = 'text';
    let mediaUrl: string | undefined;

    if (msg.attachments?.[0]) {
      const att = msg.attachments[0];
      contentType = att.type === 'image' ? 'image' :
                    att.type === 'video' ? 'video' :
                    att.type === 'audio' ? 'audio' : 'document';
      mediaUrl = att.payload.url;
    }

    return {
      channelType: platform === 'instagram' ? 'instagram' : 'messenger',
      channelAccountId: accountId,
      channelMessageId: msg.mid,
      chatId: messaging.sender.id,
      senderId: messaging.sender.id,
      contentType,
      content: msg.text,
      mediaUrl,
      isGroup: false,
      replyToMessageId: msg.reply_to?.mid,
      timestamp: new Date(messaging.timestamp),
      rawMessage: messaging,
    };
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const creds = this.credentials.get(params.accountId);
    if (!creds) throw new Error('Not connected');

    // Determine endpoint based on channel type
    const endpoint = params.channelType === 'instagram'
      ? `${creds.instagramAccountId}/messages`
      : `${creds.pageId}/messages`;

    try {
      // Build message payload
      let messagePayload: any;

      if (params.contentType === 'text') {
        messagePayload = { text: params.content };
      } else {
        messagePayload = {
          attachment: {
            type: params.contentType === 'image' ? 'image' :
                  params.contentType === 'video' ? 'video' :
                  params.contentType === 'audio' ? 'audio' : 'file',
            payload: {
              url: params.mediaUrl,
              is_reusable: true,
            },
          },
        };
      }

      const response = await fetch(
        `${this.GRAPH_API_BASE}/${this.GRAPH_API_VERSION}/me/messages?access_token=${creds.pageAccessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: params.recipientId },
            message: messagePayload,
            messaging_type: 'RESPONSE', // or 'MESSAGE_TAG' for outside 24h window
          }),
        }
      );

      const data = await response.json();

      if (data.message_id) {
        return {
          success: true,
          messageId: data.message_id,
        };
      }

      return {
        success: false,
        error: data.error?.message || 'Unknown error',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Verify webhook signature
  static verifySignature(signature: string, body: string, appSecret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(body)
      .digest('hex');

    return `sha256=${expectedSignature}` === signature;
  }

  async disconnect(accountId: string): Promise<void> {
    this.credentials.delete(accountId);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}
```

### 13.4 Webhook Handler (Express)

```typescript
// apps/api/src/routes/meta.ts
import express from 'express';
import { MetaAdapter } from '../channels/meta/adapter';

const router = express.Router();

// Webhook verification
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('Meta webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const body = req.body.toString();

  // Verify signature
  if (!MetaAdapter.verifySignature(signature, body, process.env.META_APP_SECRET!)) {
    return res.sendStatus(401);
  }

  const event = JSON.parse(body);

  // Route to appropriate account based on page/instagram ID
  const accountId = await findAccountByMetaId(event.entry[0].id);
  if (accountId) {
    metaAdapter.handleWebhook(accountId, event);
  }

  res.sendStatus(200);
});

export default router;
```

### 13.5 24-Hour Messaging Window

Meta enforces a 24-hour window for sending messages after the last user message.

**Within 24 hours:**
```typescript
messaging_type: 'RESPONSE'
```

**Outside 24 hours (requires approved template):**
```typescript
messaging_type: 'MESSAGE_TAG',
tag: 'HUMAN_AGENT'  // Up to 7 days after last message
```

### 13.6 Instagram-Specific Limitations

| Feature | Support | Notes |
|---------|---------|-------|
| Text messages | ✅ | Max 1000 characters |
| Images | ✅ | JPEG, PNG, GIF |
| Videos | ✅ | MP4, max 25MB |
| Audio | ❌ | Not supported |
| Documents | ❌ | Not supported |
| Quick Replies | ✅ | Max 13 options |
| Story replies | ✅ | Receive only |
| Reactions | ❌ | Not in API |

### 13.7 Messenger-Specific Features

| Feature | Support | Notes |
|---------|---------|-------|
| Text messages | ✅ | Max 2000 characters |
| Images | ✅ | Full support |
| Videos | ✅ | Up to 25MB |
| Audio | ✅ | Full support |
| Documents | ✅ | Full support |
| Templates | ✅ | Generic, button, receipt |
| Quick Replies | ✅ | Max 13 options |
| Persistent Menu | ✅ | Custom menu |
| Handover Protocol | ✅ | Bot-to-human handoff |

### 13.8 Database Schema Additions

```sql
-- Meta-specific account fields
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS meta_page_id VARCHAR(100);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS meta_page_access_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS meta_app_secret VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS instagram_account_id VARCHAR(100);

-- Contact fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram_user_id VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS messenger_user_id VARCHAR(100);

-- Indexes
CREATE INDEX idx_contacts_instagram ON contacts(instagram_user_id) WHERE instagram_user_id IS NOT NULL;
CREATE INDEX idx_contacts_messenger ON contacts(messenger_user_id) WHERE messenger_user_id IS NOT NULL;
```

---

## Part 14: Unified Channel Router

### 14.1 Architecture

```typescript
// apps/api/src/channels/router.ts
import { WhatsAppAdapter } from './whatsapp/adapter';
import { TelegramAdapter } from './telegram/adapter';
import { TikTokAdapter } from './tiktok/adapter';
import { MetaAdapter } from './meta/adapter';

export class ChannelRouter {
  private adapters: Map<ChannelType, ChannelAdapter> = new Map();
  private incomingMessageProcessor: IncomingMessageProcessor;

  constructor(processor: IncomingMessageProcessor) {
    this.incomingMessageProcessor = processor;
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    const whatsapp = new WhatsAppAdapter();
    const telegram = new TelegramAdapter();
    const tiktok = new TikTokAdapter();
    const instagram = new MetaAdapter();
    const messenger = new MetaAdapter();

    // Register message handlers
    [whatsapp, telegram, tiktok, instagram, messenger].forEach(adapter => {
      adapter.onMessage(async (message) => {
        await this.incomingMessageProcessor.process(message);
      });
    });

    this.adapters.set('whatsapp', whatsapp);
    this.adapters.set('telegram', telegram);
    this.adapters.set('tiktok', tiktok);
    this.adapters.set('instagram', instagram);
    this.adapters.set('messenger', messenger);
  }

  async connectAccount(account: Account): Promise<ConnectionResult> {
    const adapter = this.adapters.get(account.channel_type);
    if (!adapter) {
      throw new Error(`Unknown channel type: ${account.channel_type}`);
    }

    return adapter.connect(account.id, account.credentials);
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const adapter = this.adapters.get(params.channelType);
    if (!adapter) {
      throw new Error(`Unknown channel type: ${params.channelType}`);
    }

    return adapter.sendMessage(params);
  }

  async disconnectAccount(accountId: string, channelType: ChannelType): Promise<void> {
    const adapter = this.adapters.get(channelType);
    if (adapter) {
      await adapter.disconnect(accountId);
    }
  }

  getAdapter(channelType: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channelType);
  }
}
```

### 14.2 Startup Restoration

```typescript
// apps/api/src/startup.ts
export async function restoreAllChannelSessions(router: ChannelRouter): Promise<void> {
  const accounts = await db.query(`
    SELECT * FROM accounts
    WHERE status = 'connected' OR status = 'disconnected'
  `);

  for (const account of accounts) {
    try {
      console.log(`Restoring ${account.channel_type} account: ${account.id}`);
      await router.connectAccount(account);
    } catch (error) {
      console.error(`Failed to restore account ${account.id}:`, error);
      await db.query(`UPDATE accounts SET status = 'error' WHERE id = $1`, [account.id]);
    }
  }
}
```

---

## Part 15: Frontend Integration

### 15.1 Channel Selector Component

```tsx
// apps/web/src/components/channel/ChannelSelector.tsx
import { ChannelType } from '@chatuncle/shared';

const CHANNEL_CONFIG = {
  whatsapp: { icon: '💬', label: 'WhatsApp', color: 'green' },
  telegram: { icon: '✈️', label: 'Telegram', color: 'blue' },
  tiktok: { icon: '🎵', label: 'TikTok Shop', color: 'pink' },
  instagram: { icon: '📷', label: 'Instagram', color: 'purple' },
  messenger: { icon: '💬', label: 'Messenger', color: 'blue' },
};

export function ChannelSelector({
  selected,
  onChange
}: {
  selected: ChannelType;
  onChange: (channel: ChannelType) => void;
}) {
  return (
    <div className="flex gap-2">
      {Object.entries(CHANNEL_CONFIG).map(([key, config]) => (
        <button
          key={key}
          onClick={() => onChange(key as ChannelType)}
          className={`px-3 py-1 rounded ${
            selected === key ? `bg-${config.color}-500 text-white` : 'bg-gray-100'
          }`}
        >
          {config.icon} {config.label}
        </button>
      ))}
    </div>
  );
}
```

### 15.2 Account Connection Flow

```tsx
// apps/web/src/components/accounts/ConnectAccountModal.tsx
export function ConnectAccountModal({ channelType }: { channelType: ChannelType }) {
  switch (channelType) {
    case 'whatsapp':
      return <WhatsAppQRScanner />;

    case 'telegram':
      return <TelegramBotTokenForm />;

    case 'tiktok':
      return <TikTokOAuthFlow />;

    case 'instagram':
    case 'messenger':
      return <MetaOAuthFlow channel={channelType} />;
  }
}

function TelegramBotTokenForm() {
  const [token, setToken] = useState('');

  return (
    <div>
      <h3>Connect Telegram Bot</h3>
      <ol className="text-sm text-gray-600 mb-4">
        <li>1. Open Telegram and search for @BotFather</li>
        <li>2. Send /newbot and follow instructions</li>
        <li>3. Copy your bot token below</li>
      </ol>
      <input
        type="text"
        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="w-full p-2 border rounded"
      />
      <Button onClick={() => connectTelegram(token)}>Connect</Button>
    </div>
  );
}

function MetaOAuthFlow({ channel }: { channel: 'instagram' | 'messenger' }) {
  const startOAuth = () => {
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_META_APP_ID!,
      redirect_uri: `${window.location.origin}/auth/meta/callback`,
      scope: channel === 'instagram'
        ? 'instagram_basic,instagram_manage_messages,pages_show_list'
        : 'pages_messaging,pages_show_list',
      response_type: 'code',
      state: channel,
    });

    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  };

  return (
    <div>
      <h3>Connect {channel === 'instagram' ? 'Instagram' : 'Messenger'}</h3>
      <p className="text-sm text-gray-600 mb-4">
        You'll be redirected to Facebook to authorize access.
      </p>
      <Button onClick={startOAuth}>
        Connect with Facebook
      </Button>
    </div>
  );
}
```

---

## Sources

- [Baileys Wiki](https://baileys.wiki)
- [Baileys Migration Guide](https://baileys.wiki/docs/migration/to-v7.0.0)
- [Twilio Conversations Fundamentals](https://www.twilio.com/docs/conversations)
- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [Render PostgreSQL](https://render.com/docs/postgresql)
- [Anti-Ban Strategies - Pally Systems](https://blog.pallysystems.com/2025/12/04/whatsapp-automation-using-baileys-js-a-complete-guide/)
- [WhatsApp Ban Prevention - WaDesk](https://wadesk.io/en/tutorial/strategies-to-avoid-whatsapp-ban)
- [grammY - Telegram Bot Framework](https://grammy.dev/)
- [grammY Conversations Plugin](https://grammy.dev/plugins/conversations)
- [grammY Sessions Plugin](https://grammy.dev/plugins/session)
- [Telegraf.js Documentation](https://telegraf.js.org/)
- [TikTok Shop Partner Center](https://partner.tiktokshop.com)
- [TikTok Shop Customer Service API](https://partner.tiktokshop.com/docv2/page/659645f9a46cdd02bc8aeacf)
- [TikTok API OAuth](https://developers.tiktok.com/doc/oauth-user-access-token-management)
- [Meta Messenger Platform](https://developers.facebook.com/docs/messenger-platform)
- [Instagram Messaging API - Unipile](https://www.unipile.com/instagram-messaging-api/)
- [Instagram Messaging - CM.com](https://developers.cm.com/messaging/docs/instagram-messaging)
- [messenger-node npm](https://www.npmjs.com/package/messenger-node)
