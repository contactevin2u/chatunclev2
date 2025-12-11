# ChatUncle Multi-Channel Architecture Plan

## Executive Summary

This document outlines the plan to transform ChatUncle from WhatsApp-only to a unified multi-channel inbox supporting WhatsApp, Telegram, Instagram, Facebook Messenger, and TikTok Shop.

---

## Channel Comparison Matrix

| Channel | API Type | Difficulty | Cost | Ban Risk | Best For |
|---------|----------|------------|------|----------|----------|
| **WhatsApp** | Baileys (unofficial) | Medium | Free | Medium | Already done |
| **Telegram** | Bot API (official) | **Easy** | Free | **Very Low** | Start here |
| **Instagram DM** | Meta Graph API | Medium-High | Free | Medium | Business accounts |
| **Facebook Messenger** | Messenger Platform | Medium-High | Free | Medium | Page messaging |
| **TikTok Shop** | Customer Service API | Medium | Free | Medium | E-commerce |
| **TikTok DM** | Business Messaging | Hard | Free | High | Beta, region-locked |

---

## Recommended Implementation Order

### Phase 1: Telegram (Easiest Win)
- Official Bot API, no approval needed
- Create bot via @BotFather in 2 minutes
- Well-documented, great TypeScript support
- Lowest ban risk of all channels

### Phase 2: Instagram + Facebook Messenger
- Same Meta platform (one integration covers both)
- Requires app review (2-8 weeks)
- Business accounts only
- 24-hour messaging window policy

### Phase 3: TikTok Shop (If E-commerce Needed)
- Good for seller-buyer communication
- Requires TikTok Shop seller account
- Region-specific availability

---

## Detailed Channel Research

### 1. TELEGRAM BOT API

#### Best Library: **grammY**
- Superior TypeScript support
- Always up-to-date with Bot API
- Excellent documentation
- Active ecosystem with plugins

```bash
npm install grammy
```

#### Key Endpoints
| Endpoint | Purpose |
|----------|---------|
| `sendMessage` | Send text (1-4096 chars) |
| `sendPhoto` | Images up to 10MB |
| `sendVideo` | Videos up to 50MB |
| `sendDocument` | Files up to 50MB |
| `sendLocation` | Coordinates |
| `forwardMessage` | Relay messages |

#### Rate Limits
| Scenario | Limit |
|----------|-------|
| Single chat | 1 message/second |
| Group chats | 20 messages/minute |
| Bulk broadcasts | ~30 messages/second |

#### Ban Risks: **VERY LOW**
- Only risk: Ignoring 429 rate limit errors
- Solution: Implement exponential backoff
- grammY has auto-retry plugins

#### Webhook vs Long Polling
- **Long Polling**: Simpler, no SSL needed, good for <100k users
- **Webhook**: Lower latency, better for serverless

---

### 2. INSTAGRAM DM API (Meta Graph API)

#### Requirements
- Instagram Business/Creator Account
- Facebook Page linked to Instagram
- 1,000+ followers
- Meta Developer Account
- App Review approval (2-8 weeks)

#### Key Permissions
```
instagram_basic
instagram_manage_messages
pages_show_list
pages_manage_metadata
pages_messaging
business_management
```

#### Rate Limits
| API | Limit |
|-----|-------|
| Graph API | 200 requests/hour per user token |
| Send API | 100 calls/second (high-volume) |
| Per 24 hours | 4,800 × Number of Engaged Users |

#### 24-Hour Messaging Window
- Can send freely within 24 hours of user's last message
- After 24 hours: Only HUMAN_AGENT tag (extends to 7 days)
- Cannot initiate conversations (user must message first)

#### Ban Risks: **MEDIUM**
- Using unofficial APIs = immediate ban
- Rate limit violations
- Message tag misuse
- High block rates

---

### 3. FACEBOOK MESSENGER API

#### Requirements
- Facebook Business Account
- Facebook Page with admin access
- App Review (2-8 weeks, 40-60% first rejection rate)
- Business Verification (2-4 weeks)

#### Rate Limits
| API | Limit |
|-----|-------|
| Messenger Profile | 10 calls per 10 minutes per page |
| Send API | 250 requests/second |
| Per 24 hours | 200 × Number of Engaged Users |

#### Message Types Supported
- Text messages
- Media (images, video, audio, files up to 25MB)
- Quick Replies (up to 13)
- Button Templates (up to 3 buttons)
- Generic Templates (carousels)
- Receipt Templates

#### 24-Hour Window + Message Tags
Same as Instagram (Meta platform):
- `CONFIRMED_EVENT_UPDATE`
- `POST_PURCHASE_UPDATE`
- `ACCOUNT_UPDATE`
- `HUMAN_AGENT` (7-day window)

#### Ban Risks: **MEDIUM**
- Block rate > 8% triggers restrictions
- 24-hour window violations
- Message tag abuse
- High rejection rate on first approval

---

### 4. TIKTOK SHOP CUSTOMER SERVICE API

#### Requirements
- TikTok Shop seller account
- Available in: US, UK, Ireland, Spain, France, Germany, Italy, Indonesia, Malaysia, Philippines, Thailand, Singapore, Vietnam, Mexico
- Partner Center registration (2-3 business days)
- Business documentation

#### Rate Limits
| Scenario | Limit |
|----------|-------|
| Per Store | 50 requests/second |
| Multi-Store | 50/sec per store (separate limits) |

#### Ban Risks: **MEDIUM**
- Point-based violation system (0-24 points)
- 8+ points = permanent suspension
- Connected accounts can be suspended together
- Fund withholding (45-365 days)

---

## Database Schema Changes

### New Tables

```sql
-- Channel type definitions
CREATE TABLE channel_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,  -- 'whatsapp', 'telegram', 'instagram', 'messenger', 'tiktok'
  name VARCHAR(255) NOT NULL,
  icon VARCHAR(50),
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO channel_types (code, name, icon, color) VALUES
  ('whatsapp', 'WhatsApp', 'whatsapp', '#25D366'),
  ('telegram', 'Telegram', 'telegram', '#0088CC'),
  ('instagram', 'Instagram', 'instagram', '#E4405F'),
  ('messenger', 'Messenger', 'messenger', '#0084FF'),
  ('tiktok', 'TikTok Shop', 'tiktok', '#000000');

-- Unified channel accounts
CREATE TABLE channel_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel_type_id INT REFERENCES channel_types(id),
  channel_identifier VARCHAR(255) NOT NULL,  -- Phone, bot username, page ID
  account_name VARCHAR(255),
  credentials JSONB,                          -- Encrypted tokens, secrets
  status VARCHAR(50) DEFAULT 'disconnected',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, channel_type_id, channel_identifier)
);

-- Add channel_type to existing tables (backwards compatible)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'whatsapp';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'whatsapp';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'whatsapp';

-- Indexes
CREATE INDEX idx_conversations_channel ON conversations(channel_type);
CREATE INDEX idx_contacts_channel ON contacts(channel_type);
CREATE INDEX idx_channel_accounts_user ON channel_accounts(user_id, channel_type_id);
```

---

## Backend Architecture

### Channel Adapter Pattern

```typescript
// backend/src/services/channel/IChannelAdapter.ts
export interface IChannelAdapter {
  channelType: string;

  // Connection
  connect(accountId: string, credentials: any): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  getStatus(accountId: string): 'connected' | 'disconnected' | 'error';

  // Messaging
  sendMessage(accountId: string, recipientId: string, message: MessagePayload): Promise<string>;
  sendMedia(accountId: string, recipientId: string, media: MediaPayload): Promise<string>;

  // Events
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  onStatusChange(handler: (status: ConnectionStatus) => void): void;

  // Profile
  getContactProfile(accountId: string, contactId: string): Promise<ContactProfile>;
}

// Factory
export class ChannelAdapterFactory {
  private static adapters = new Map<string, IChannelAdapter>();

  static register(adapter: IChannelAdapter): void {
    this.adapters.set(adapter.channelType, adapter);
  }

  static get(channelType: string): IChannelAdapter {
    const adapter = this.adapters.get(channelType);
    if (!adapter) throw new Error(`Unknown channel: ${channelType}`);
    return adapter;
  }
}
```

### Directory Structure

```
backend/src/services/
├── channel/
│   ├── IChannelAdapter.ts       # Interface
│   ├── ChannelAdapterFactory.ts # Factory
│   ├── ChannelService.ts        # Orchestration
│   └── adapters/
│       ├── WhatsAppAdapter.ts   # Wraps SessionManager
│       ├── TelegramAdapter.ts   # Uses grammY
│       ├── InstagramAdapter.ts  # Uses Meta Graph API
│       ├── MessengerAdapter.ts  # Uses Messenger Platform
│       └── TikTokAdapter.ts     # Uses TikTok Shop API
├── whatsapp/                     # Existing (kept for now)
│   ├── SessionManager.ts
│   ├── BufferedEventHandler.ts
│   └── ...
```

---

## Socket Events (Multi-Channel)

```typescript
// Room structure stays the same: `account:${accountId}`
// Events include channelType for client filtering

socket.emit('message:new', {
  accountId: string,
  conversationId: string,
  channelType: 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'tiktok',
  message: {
    id: string,
    content: string,
    contentType: string,
    senderType: 'agent' | 'contact',
    channelMetadata: Record<string, any>  // Channel-specific data
  }
});

socket.emit('channel:status', {
  accountId: string,
  channelType: string,
  status: 'connected' | 'disconnected' | 'qr_pending' | 'error',
  error?: string
});

socket.emit('channel:qr', {
  accountId: string,
  channelType: 'whatsapp',  // Only WhatsApp uses QR
  qr: string
});
```

---

## Frontend Changes

### New Types

```typescript
export type ChannelType = 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'tiktok';

export interface ChannelAccount {
  id: string;
  channelType: ChannelType;
  channelIdentifier: string;
  accountName: string;
  status: 'connected' | 'disconnected' | 'qr_pending' | 'error';
  unreadCount: number;
}

export interface ChannelConversation extends Conversation {
  channelType: ChannelType;
}
```

### UI Components

```
frontend/src/components/
├── channel/
│   ├── ChannelIcon.tsx          # Renders correct icon per channel
│   ├── ChannelBadge.tsx         # Small badge with channel color
│   ├── ChannelSelector.tsx      # Dropdown/tabs for channel switching
│   ├── ChannelAccountCard.tsx   # Account card with channel branding
│   └── ChannelStatusBar.tsx     # Header showing all channel statuses
```

---

## Implementation Timeline

### Week 1-2: Foundation
- [ ] Create channel_types and channel_accounts tables
- [ ] Add channel_type columns to existing tables
- [ ] Create IChannelAdapter interface
- [ ] Create ChannelAdapterFactory
- [ ] Wrap WhatsAppAdapter around SessionManager

### Week 3-4: Telegram Integration
- [ ] Install grammY
- [ ] Create TelegramAdapter
- [ ] Implement send/receive messages
- [ ] Add Telegram account management UI
- [ ] Test end-to-end

### Week 5-8: Meta Platform (Instagram + Messenger)
- [ ] Register Meta Developer App
- [ ] Submit for App Review
- [ ] Create InstagramAdapter
- [ ] Create MessengerAdapter
- [ ] Handle 24-hour window logic
- [ ] Add Meta account connection flow

### Week 9+: TikTok Shop (Optional)
- [ ] Register at TikTok Partner Center
- [ ] Create TikTokAdapter
- [ ] Implement customer messaging

---

## Risk Mitigation

### WhatsApp (Current)
- Already using Baileys (unofficial)
- Existing anti-ban measures in place
- Continue monitoring ban patterns

### Telegram
- **Risk: Very Low**
- Official API, no approval needed
- Just respect rate limits (1 msg/sec)
- Use grammY auto-retry plugin

### Instagram/Messenger
- **Risk: Medium**
- Must use official Meta APIs only
- App review can take weeks
- 24-hour window limits reach
- Monitor block rates (<8%)

### TikTok Shop
- **Risk: Medium**
- Point-based violation system
- Keep Account Health Rating high
- Respond to messages within 24 hours

---

## Reusable Patterns from WhatsApp

| Pattern | Reuse For |
|---------|-----------|
| SessionManager (per-account sessions) | All channels need session management |
| BufferedEventHandler (batching) | Telegram, Meta have event batching |
| MessageQueue (rate limiting) | All channels need rate limiting |
| MessageDeduplicator | All channels can have duplicate events |
| Socket.io room-based broadcasting | Works for all channels |
| AutoReplyProcessor | Works for all text-based channels |
| Template system | All channels support templates |
| Profile picture caching | All channels have profile pics |

---

## Sources

### Telegram
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [grammY Documentation](https://grammy.dev/)
- [grammY GitHub](https://github.com/grammyjs/grammY)

### Instagram/Facebook
- [Meta Graph API](https://developers.facebook.com/docs/instagram-api/)
- [Messenger Platform](https://developers.facebook.com/docs/messenger-platform/)
- [Instagram Messaging API Guide](https://www.brevo.com/blog/instagram-dm-api/)

### TikTok
- [TikTok Shop Partner Center](https://partner.tiktokshop.com/)
- [TikTok Business API](https://business-api.tiktok.com/portal)
- [EcomPHP/tiktokshop-php](https://github.com/EcomPHP/tiktokshop-php)
