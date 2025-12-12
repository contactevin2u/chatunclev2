# ChatUncle V2 Implementation Review & Baileys Fix Plan

## Overview

Reviewed V2 implementation against architecture documentation and legacy code. Found critical gaps in the WhatsApp/Baileys integration that need immediate attention.

---

## IMPLEMENTATION STATUS SUMMARY

| Component | Status | Completion |
|-----------|--------|------------|
| Database Schema | Complete | 100% |
| API Routes | Good | 85% |
| WhatsApp Adapter | **Critical Issues** | 40% |
| Other Adapters | Not Started | 0% |
| Socket.io | Infrastructure Only | 70% |
| Job Queue | Setup Complete | 90% |
| Frontend | Partial | 60% |

**Overall: ~72% Complete**

---

## CRITICAL BAILEYS ISSUES FOUND

### 1. LID/PN Event Handler is COMMENTED OUT
**File:** `apps/api/src/channels/whatsapp/adapter.ts:422-425`
```typescript
// LID/PN mapping (Baileys v7)
// sock.ev.on('lid-mapping.update', async (mapping) => {
//   await this.handleLidMapping(accountId, mapping);
// });
```
**Impact:** Duplicate message processing, broken deduplication for WhatsApp v7

### 2. Message Queue Never Wired to sendMessage()
**File:** `apps/api/src/channels/whatsapp/adapter.ts:75, 178`
- Queue instantiated at line 75 but never used
- `setSendHandler()` defined but never called
- Direct socket.sendMessage() bypasses queue entirely

### 3. Missing Critical Baileys v7 Configurations
**File:** `apps/api/src/channels/whatsapp/adapter.ts:87-98`
Missing:
- `msgRetryCounterCache` - CRITICAL (prevents decryption loops)
- `getMessage` callback - for message retry
- `cachedGroupMetadata` callback - for performance
- `markProfilePhotoCalled: true`

### 4. No Buffered Event Processing
**Legacy uses:** `sock.ev.process()` for batched events
**V2 uses:** Individual `.on()` listeners (less efficient, no batching)

### 5. Incomplete Quoted Message Context
**File:** `apps/api/src/channels/whatsapp/adapter.ts:217-220`
Current implementation missing full message context required by Baileys v7

### 6. Missing Session Ready State
- No ready promise/timeout pattern
- No graceful shutdown handlers (SIGTERM/SIGINT)

### 7. Anti-Ban Service Gaps
**File:** `apps/api/src/channels/whatsapp/anti-ban.ts`
Missing from legacy:
- REPLY vs BULK mode distinction
- Typing duration based on message length
- Post-send recording hooks

---

## LEGACY PATTERNS TO PORT

### Must-Have (Production Critical):

1. **Message Retry Counter Cache**
   ```typescript
   import NodeCache from 'node-cache';
   const msgRetryCounterCache = new NodeCache({ stdTTL: 300 });
   // Pass to makeWASocket config
   ```

2. **getMessage Callback**
   ```typescript
   getMessage: async (key) => {
     // Check cache first, then DB fallback
     return messageStore.get(key.id) || await db.query...
   }
   ```

3. **Buffered Event Processing**
   ```typescript
   sock.ev.process(async (events) => {
     if (events['messages.upsert']) { ... }
     if (events['creds.update']) { ... }
   });
   ```

4. **Session Ready State**
   ```typescript
   const readyPromise = new Promise((resolve) => {
     resolveReady = resolve;
   });
   // Timeout after 30 seconds
   ```

5. **LID/PN Mapping Handler**
   - Uncomment and implement properly
   - Store mappings in `lid_pn_mappings` table

---

## FIX PLAN

### Phase 1: Critical Baileys Fixes (Priority: URGENT)

#### 1.1 Add Message Retry Counter Cache
**File:** `apps/api/src/channels/whatsapp/adapter.ts`
- Add NodeCache import
- Create cache instance per account
- Pass to makeWASocket config

#### 1.2 Implement getMessage Callback
**File:** `apps/api/src/channels/whatsapp/adapter.ts`
- Create message store/cache
- Implement callback that checks cache + DB

#### 1.3 Enable LID/PN Handler
**File:** `apps/api/src/channels/whatsapp/adapter.ts`
- Uncomment lines 422-425
- Implement `handleLidMapping()` method
- Use existing `batchUpsertLidPnMappings()` from batch-operations.ts

#### 1.4 Wire Message Queue
**File:** `apps/api/src/channels/whatsapp/adapter.ts`
- Call `queue.setSendHandler()` after socket creation
- Route all sendMessage calls through queue
- Apply anti-ban delays in queue processor

### Phase 2: Performance Improvements

#### 2.1 Add Buffered Event Processing
- Replace individual `.on()` listeners with `sock.ev.process()`
- Batch message processing

#### 2.2 Add cachedGroupMetadata Callback
- Implement 5-minute TTL cache
- Return cached metadata or fetch fresh

#### 2.3 Session Ready State Management
- Add ready promise with 30-second timeout
- Implement graceful shutdown handlers

### Phase 3: Anti-Ban Enhancements

#### 3.1 Add REPLY vs BULK Mode
**File:** `apps/api/src/channels/whatsapp/anti-ban.ts`
- Distinguish between conversational replies and bulk sends
- Different delay ranges for each mode

#### 3.2 Typing Duration Calculation
- Calculate based on message length (~80ms per char)
- Add random thinking pauses

#### 3.3 Post-Send Recording
- Track message counts after successful send
- Update rate limit state

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `apps/api/src/channels/whatsapp/adapter.ts` | Add retry cache, getMessage, enable LID, wire queue |
| `apps/api/src/channels/whatsapp/anti-ban.ts` | Add REPLY/BULK modes, typing calc |
| `apps/api/src/channels/whatsapp/message-queue.ts` | Integrate anti-ban delays |
| `apps/api/package.json` | Add node-cache dependency |

---

## DEPENDENCIES TO ADD

```json
{
  "node-cache": "^5.1.2"
}
```

---

## ESTIMATED EFFORT

- Phase 1 (Critical): 2-3 hours
- Phase 2 (Performance): 2-3 hours
- Phase 3 (Anti-Ban): 1-2 hours

**Total: 5-8 hours**

---

## TESTING CHECKLIST

After fixes:
- [ ] QR code scanning works
- [ ] Pairing code works
- [ ] Text messages send without errors
- [ ] Media (images/videos) send reliably
- [ ] Incoming messages deduplicated properly
- [ ] No decryption loop errors
- [ ] Rate limiting prevents bans
- [ ] Session persists across restarts
