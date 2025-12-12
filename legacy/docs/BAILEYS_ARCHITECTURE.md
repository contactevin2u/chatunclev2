# ChatUncle Baileys Architecture

## High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CHATUNCLE SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Frontend  │────▶│   Backend   │────▶│   Baileys   │────▶ WhatsApp     │
│  │  (Next.js)  │◀────│  (Express)  │◀────│   Socket    │◀──── Servers      │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│         │                   │                   │                           │
│         │            ┌──────┴──────┐            │                           │
│         │            │             │            │                           │
│         ▼            ▼             ▼            ▼                           │
│  ┌─────────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐                     │
│  │  Socket.io  │ │ PostgreSQL │ │  Redis   │ │ Cloudinary│                     │
│  │  (Realtime) │ │   (Data)   │ │ (Cache)  │ │  (Media)  │                     │
│  └─────────────┘ └────────┘ └──────────┘ └───────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Baileys Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SESSION MANAGER (Orchestrator)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        SOCKET CREATION                                │  │
│  │  makeWASocket({                                                       │  │
│  │    auth: PostgresAuthState,     // DB-persisted credentials          │  │
│  │    browser: Browsers.macOS(),   // Desktop emulation                 │  │
│  │    syncFullHistory: true,       // Get chat history                  │  │
│  │    getMessage: MessageStore,    // For retries & polls               │  │
│  │    cachedGroupMetadata,         // Performance optimization          │  │
│  │    markOnlineOnConnect: false,  // Anti-ban                          │  │
│  │  })                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    BUFFERED EVENT PROCESSOR                           │  │
│  │                                                                       │  │
│  │  sock.ev.process(async (events) => {                                 │  │
│  │    ├── messages.upsert      → handleIncoming/OutgoingMessage()       │  │
│  │    ├── messages.update      → updateMessageStatus()                  │  │
│  │    ├── connection.update    → handleConnectionChange()               │  │
│  │    ├── creds.update         → saveCreds() to PostgreSQL              │  │
│  │    ├── groups.upsert        → handleGroupUpsert()                    │  │
│  │    ├── messaging-history    → processHistorySync() [background]      │  │
│  │    └── lid-mapping.update   → handleLidMapping()                     │  │
│  │  })                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Message Flow: Incoming

```
WhatsApp Server
      │
      ▼
┌─────────────────┐
│ Baileys Socket  │
│ messages.upsert │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   MESSAGE DEDUPLICATOR                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ L1: Memory  │─▶│ L2: DB Check│─▶│ L3: Mark    │         │
│  │   Cache     │  │  (150k max) │  │  Processed  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└────────────────────────────┬────────────────────────────────┘
                             │ (if new)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    MESSAGE HANDLER                           │
│                                                              │
│  1. Extract content (text/image/video/audio/document)       │
│  2. Download media → Cloudinary                              │
│  3. Find/Create contact                                      │
│  4. Find/Create conversation                                 │
│  5. Save message to PostgreSQL                               │
│  6. Cache in MessageStore                                    │
│  7. Emit to Socket.io rooms                                  │
│                                                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     SOCKET.IO EMIT                           │
│                                                              │
│  io.to(`account:${accountId}`).emit('message:new', {        │
│    accountId, conversationId, message                        │
│  })                                                          │
│                                                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Frontend     │
                    │  (All Agents)   │
                    └─────────────────┘
```

## Message Flow: Outgoing (with Anti-Ban)

```
Agent clicks "Send"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API: POST /messages                       │
│                                                              │
│  1. Save message to DB (status: 'pending')                  │
│  2. Emit 'message:new' immediately (optimistic UI)          │
│  3. Return response to frontend                              │
│  4. Process send in BACKGROUND ───────────────────────────▶ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      ANTI-BAN LAYER                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 PRE-SEND CHECKS                      │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │    │
│  │  │ Per-Contact │ │   Daily     │ │   Batch     │   │    │
│  │  │ Rate Limit  │ │  New Limit  │ │  Cooldown   │   │    │
│  │  │  (6 sec)    │ │ (30-1000)   │ │ (50 → 5min) │   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              TYPING SIMULATION                       │    │
│  │                                                      │    │
│  │  sendPresenceUpdate('composing', jid)               │    │
│  │           │                                          │    │
│  │           ▼                                          │    │
│  │  await sleep(40-80ms × message.length)              │    │
│  │           │                                          │    │
│  │           ▼                                          │    │
│  │  sendPresenceUpdate('paused', jid)                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 SEND MESSAGE                         │    │
│  │                                                      │    │
│  │  await sock.sendMessage(jid, content, options)      │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              POST-SEND RECORDING                     │    │
│  │  • Update rate limit counters                        │    │
│  │  • Record batch progress                             │    │
│  │  • Update per-contact timestamp                      │    │
│  │  • Mark contact as messaged                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
                 ┌───────────────────┐
                 │  WhatsApp Server  │
                 └───────────────────┘
```

## Forward Message Flow

```
┌─────────────────────────────────────────────────────────────┐
│              FORWARD MESSAGE IMPLEMENTATION                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Agent selects message → clicks Forward → selects target    │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           API: POST /messages/:id/forward             │   │
│  │                                                       │   │
│  │  1. Get original message from DB                      │   │
│  │  2. Get target conversation                           │   │
│  │  3. Validate same WhatsApp account                    │   │
│  │  4. Create pending message record                     │   │
│  │  5. Emit optimistic UI update                         │   │
│  │  6. Process forward in BACKGROUND ─────────────────▶  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                      │       │
│                                                      ▼       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           SessionManager.forwardMessage()             │   │
│  │                                                       │   │
│  │  // Get message content                               │   │
│  │  let content = await messageStore.getMessage(key)     │   │
│  │  if (!content) content = parse(raw_message)           │   │
│  │                                                       │   │
│  │  // Build WAMessage object                            │   │
│  │  const waMessage = {                                  │   │
│  │    key: messageKey,     // { remoteJid, id, fromMe }  │   │
│  │    message: content,    // proto.IMessage              │   │
│  │  }                                                    │   │
│  │                                                       │   │
│  │  // Anti-ban measures                                 │   │
│  │  await preSendCheck()                                 │   │
│  │  await sock.sendPresenceUpdate('composing')          │   │
│  │  await sleep(800-2000ms)  // Longer for forwards     │   │
│  │  await sock.sendPresenceUpdate('paused')             │   │
│  │                                                       │   │
│  │  // Forward using Baileys                             │   │
│  │  const result = await sock.sendMessage(targetJid, {  │   │
│  │    forward: waMessage                                 │   │
│  │  })                                                   │   │
│  │                                                       │   │
│  │  await postSendRecord()                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      POSTGRESQL                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ whatsapp_accounts│  │    auth_keys    │                   │
│  │ ───────────────  │  │ ─────────────── │                   │
│  │ id               │  │ account_id (FK) │                   │
│  │ user_id          │  │ key_type        │                   │
│  │ phone_number     │  │ key_id          │                   │
│  │ session_data     │◀─│ key_data (JSONB)│                   │
│  │ status           │  └─────────────────┘                   │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │    contacts     │  │  conversations  │                   │
│  │ ─────────────── │  │ ─────────────── │                   │
│  │ id              │◀─│ contact_id (FK) │                   │
│  │ wa_id           │  │ account_id (FK) │                   │
│  │ phone_number    │  │ is_group        │                   │
│  │ name            │  │ unread_count    │                   │
│  │ jid_type        │  │ last_message_at │                   │
│  └─────────────────┘  └────────┬────────┘                   │
│                                │                             │
│                                ▼                             │
│                       ┌─────────────────┐                   │
│                       │    messages     │                   │
│                       │ ─────────────── │                   │
│                       │ id              │                   │
│                       │ conversation_id │                   │
│                       │ wa_message_id   │                   │
│                       │ content_type    │                   │
│                       │ content         │                   │
│                       │ media_url       │                   │
│                       │ raw_message     │◀── For forwards   │
│                       │ status          │                   │
│                       └─────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    IN-MEMORY CACHES                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  MessageStore   │  │ GroupMetaCache  │                   │
│  │ ─────────────── │  │ ─────────────── │                   │
│  │ 5000 msg/acct   │  │ 2000 grp/acct   │                   │
│  │ 2hr TTL         │  │ 15min TTL       │                   │
│  │ LRU eviction    │  │ Per-account     │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ MsgDeduplicator │  │  AntiBan State  │                   │
│  │ ─────────────── │  │ ─────────────── │                   │
│  │ 150k entries    │  │ Rate counters   │                   │
│  │ 2hr TTL         │  │ Contact times   │                   │
│  │ 3-layer check   │  │ Batch tracking  │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Anti-Ban Rate Limiting Tiers

```
┌─────────────────────────────────────────────────────────────┐
│                    RATE LIMITING SYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              PER-ACCOUNT LIMITS                        │  │
│  │                                                        │  │
│  │   Messages/Minute: ████████████████░░░░ 15 max        │  │
│  │   Batch Counter:   ████████████████████ 50 → cooldown │  │
│  │   Cooldown:        5 minutes after batch              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              PER-CONTACT LIMITS                        │  │
│  │                                                        │  │
│  │   Min Gap: ██████░░░░░░░░░░░░░░░░░░░░░░ 6 seconds     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         DAILY NEW CONTACT LIMITS (by account age)     │  │
│  │                                                        │  │
│  │   Days 0-1:   ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░  30     │  │
│  │   Days 1-3:   █████░░░░░░░░░░░░░░░░░░░░░░░░░░  50     │  │
│  │   Days 3-7:   ██████████░░░░░░░░░░░░░░░░░░░░░  100    │  │
│  │   Days 7-14:  ████████████████████░░░░░░░░░░░  200    │  │
│  │   Days 14-30: █████████████████████████████░░  500    │  │
│  │   Days 30+:   ██████████████████████████████  1000    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              TYPING SIMULATION                         │  │
│  │                                                        │  │
│  │   Formula: (message.length × 40-80ms) + random(500ms) │  │
│  │   Min: 800ms    Max: 8000ms                           │  │
│  │                                                        │  │
│  │   "Hello" (5 chars):  ████░░░░░░░░░░░░░░  ~700ms      │  │
│  │   "How are you?" (12): ████████░░░░░░░░░  ~1200ms     │  │
│  │   Long paragraph:      ████████████████░  ~5000ms     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Health & Reconnection System

```
┌─────────────────────────────────────────────────────────────┐
│                    HEALTH MONITOR                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Every 60 seconds:                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Check: Last message time                            │    │
│  │  Check: Connection state                             │    │
│  │  Check: Memory usage                                 │    │
│  │         ├── Warning:  1.4GB (70% of 2GB)            │    │
│  │         └── Critical: 1.7GB (85% of 2GB)            │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              ▼                       ▼                      │
│        ┌──────────┐           ┌──────────┐                  │
│        │ HEALTHY  │           │ DEGRADED │                  │
│        │          │           │          │                  │
│        │ No action│           │ Trigger  │                  │
│        │ needed   │           │ reconnect│                  │
│        └──────────┘           └──────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  RECONNECT MANAGER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Exponential Backoff with Jitter:                           │
│                                                              │
│   Attempt 1: ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1s ± 30%    │
│   Attempt 2: ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  2s ± 30%    │
│   Attempt 3: ████████░░░░░░░░░░░░░░░░░░░░░░░░  4s ± 30%    │
│   Attempt 4: ████████████████░░░░░░░░░░░░░░░░  8s ± 30%    │
│   Attempt 5: ████████████████████████████░░░░  16s ± 30%   │
│   Attempt 6: ████████████████████████████████  32s ± 30%   │
│   Attempt 7+: ███████████████████████████████  60s max     │
│                                                              │
│  Circuit Breaker:                                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CLOSED ──(10 failures)──▶ OPEN ──(5 min)──▶ HALF  │    │
│  │    ▲                         │                  │    │    │
│  │    └─────────(success)───────┴──────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Comparison: Standard Baileys vs Our Implementation

```
┌────────────────────┬────────────────────┬────────────────────┐
│      Feature       │  Standard Baileys  │  Our Implementation │
├────────────────────┼────────────────────┼────────────────────┤
│ Auth Storage       │ Filesystem         │ PostgreSQL         │
│                    │ (lost on deploy)   │ (persistent)       │
├────────────────────┼────────────────────┼────────────────────┤
│ Event Handling     │ sock.ev.on()       │ sock.ev.process()  │
│                    │ (individual)       │ (batched)          │
├────────────────────┼────────────────────┼────────────────────┤
│ Message Cache      │ Memory only        │ LRU + DB fallback  │
│                    │ (lost on restart)  │ (persistent)       │
├────────────────────┼────────────────────┼────────────────────┤
│ Rate Limiting      │ None               │ Comprehensive      │
│                    │                    │ (5 layers)         │
├────────────────────┼────────────────────┼────────────────────┤
│ Typing Simulation  │ Manual             │ Automatic          │
│                    │                    │ (length-based)     │
├────────────────────┼────────────────────┼────────────────────┤
│ Reconnection       │ Basic retry        │ Exp. backoff +     │
│                    │                    │ circuit breaker    │
├────────────────────┼────────────────────┼────────────────────┤
│ Health Monitoring  │ None               │ Active (60s)       │
│                    │                    │ + auto-reconnect   │
├────────────────────┼────────────────────┼────────────────────┤
│ Memory Management  │ Unbounded          │ Monitored          │
│                    │                    │ (2GB optimized)    │
├────────────────────┼────────────────────┼────────────────────┤
│ Deduplication      │ Basic              │ 3-layer            │
│                    │                    │ (mem→DB→flag)      │
├────────────────────┼────────────────────┼────────────────────┤
│ Multi-Account      │ Manual             │ Built-in           │
│                    │                    │ (SessionManager)   │
└────────────────────┴────────────────────┴────────────────────┘
```
