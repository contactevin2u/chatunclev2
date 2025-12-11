# AI Auto-Reply & Knowledge Bank - Fix & Improvement Plan

## Executive Summary

The AI auto-reply system has **two parallel paths** that are inconsistent:
1. **Rule-based AI** (`use_ai: true` on rules) - **BROKEN** (stub function)
2. **General AI fallback** (when no rules match) - **WORKS** but uses hardcoded prompt

The knowledge bank works but is underutilized and has inefficient search.

---

## Current Architecture

```
Incoming Message
       ↓
┌─────────────────────────────────────┐
│ processAutoReply()                  │
│ autoReplyProcessor.ts               │
├─────────────────────────────────────┤
│ 1. Loop through auto_reply_rules    │
│    ├─ Match: keyword/regex/all      │
│    ├─ If use_ai=true:               │
│    │   └─ generateAIResponse() ←────┼── BROKEN STUB (returns "")
│    ├─ Else: use static template     │
│    └─ Send response, return         │
├─────────────────────────────────────┤
│ 2. If no rules matched:             │
│    └─ generateResponse() ←──────────┼── WORKS (ai.ts)
│        ├─ Check ai_settings         │
│        ├─ Rate limit checks         │
│        ├─ searchKnowledge() ←───────┼── Knowledge bank used HERE only
│        ├─ HARDCODED prompt          │
│        └─ OpenAI API call           │
└─────────────────────────────────────┘
```

---

## Issues Identified

### CRITICAL (Breaking)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| 1 | Stub `generateAIResponse()` returns empty | autoReplyProcessor.ts | 8-10 | Rules with `use_ai=true` send nothing |
| 2 | Rule AI doesn't use knowledge bank | autoReplyProcessor.ts | 71-79 | No context for AI responses |
| 3 | `custom_prompt` in ai_settings never used | ai.ts | 281 | Users can't customize AI personality |

### HIGH (Data/Config)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| 4 | Rate limits in memory (lost on restart) | ai.ts | 70-71 | Rate limits reset on deploy |
| 5 | Hourly limit hardcoded (4/hr) | ai.ts | 73 | Not configurable per account |
| 6 | Duplicate AI systems | autoReplyProcessor.ts | 71-79, 170-242 | Code duplication, inconsistency |

### MEDIUM (Quality)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| 7 | Knowledge search uses LIKE (slow) | ai.ts | 177 | Poor search quality, no ranking |
| 8 | No full-text search index used | ai.ts | 171-187 | Missing PostgreSQL FTS capability |
| 9 | Only 3 knowledge results | ai.ts | 180 | May miss relevant context |

### LOW (Polish)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| 10 | No logging for skipped AI | ai.ts | various | Hard to debug why AI didn't respond |
| 11 | Test endpoint doesn't test AI | auto-reply.ts | 266-310 | Can't preview AI responses |

---

## Solution Plan

### Phase 1: Fix Critical Bugs (PRIORITY)

#### 1.1 Fix Rule-based AI (use_ai flag)

**File:** `autoReplyProcessor.ts`

Replace the broken stub with a proper implementation that:
- Uses `generateResponse()` from ai.ts OR
- Creates new `generateRuleAIResponse()` that accepts custom prompt

```typescript
// BEFORE (broken stub - lines 8-10)
async function generateAIResponse(conversationId: string, content: string, aiPrompt?: string) {
  return { content: '' };
}

// AFTER (proper implementation)
async function generateRuleAIResponse(
  accountId: string,
  conversationId: string,
  customerMessage: string,
  customPrompt: string
): Promise<string | null> {
  // 1. Search knowledge bank
  const knowledge = await searchKnowledge(accountId, customerMessage);

  // 2. Build prompt with custom instructions + knowledge
  const systemPrompt = customPrompt + (knowledge.length > 0
    ? '\n\nBusiness info:\n' + knowledge.map(k => '- ' + k.content).join('\n')
    : '');

  // 3. Call OpenAI
  const completion = await openai.chat.completions.create({...});

  return completion.choices[0]?.message?.content || null;
}
```

**Changes needed:**
- Import `searchKnowledge` from ai.ts (already exported)
- Import OpenAI client or use existing `generateResponse` with custom prompt param
- Update call site at line 73

#### 1.2 Use custom_prompt from ai_settings

**File:** `ai.ts` (line 281)

```typescript
// BEFORE
const systemPrompt = MALAYSIAN_STYLE_PROMPT + knowledgeContext;

// AFTER
const customPrompt = settings.custom_prompt;
const basePrompt = customPrompt || MALAYSIAN_STYLE_PROMPT;
const systemPrompt = basePrompt + knowledgeContext;
```

---

### Phase 2: Unify AI Systems

#### 2.1 Create unified AI response function

**File:** `ai.ts`

Add a new function that handles both:
- General AI auto-reply (no custom prompt)
- Rule-based AI (with custom prompt)

```typescript
export async function generateAIResponseUnified(
  accountId: string,
  conversationId: string,
  customerMessage: string,
  options?: {
    customPrompt?: string;      // From rule.ai_prompt
    contactName?: string;
    skipRateLimits?: boolean;   // For testing
  }
): Promise<string | null> {
  // All checks (rate limit, human takeover, consecutive replies)
  // Knowledge search
  // Prompt building (custom or default)
  // OpenAI call
  // Rate limit recording
  // Logging
}
```

#### 2.2 Update autoReplyProcessor.ts

Replace both AI paths with single call:

```typescript
// For rules with use_ai=true (line 71-79)
if (rule.use_ai && rule.ai_prompt) {
  responseContent = await generateAIResponseUnified(accountId, conversationId, content, {
    customPrompt: rule.ai_prompt,
  });
}

// For general AI fallback (line 179-184)
const aiResponse = await generateAIResponseUnified(accountId, conversationId, content, {
  contactName: contact?.name,
});
```

---

### Phase 3: Improve Rate Limiting

#### 3.1 Move rate limits to database

**New table or use existing ai_settings:**

```sql
-- Option A: Add columns to ai_settings
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS hourly_limit INT DEFAULT 4;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS cooldown_seconds INT DEFAULT 10;

-- Option B: New table for rate tracking (persistent)
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  conversation_id UUID PRIMARY KEY,
  last_reply_at TIMESTAMPTZ,
  hourly_count INT DEFAULT 0,
  hourly_reset_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.2 Update rate limit functions

**File:** `ai.ts`

```typescript
// BEFORE (memory-based)
const conversationCooldowns = new Map<string, number>();

// AFTER (database-based)
async function isRateLimited(conversationId: string): Promise<boolean> {
  const limits = await queryOne(`
    SELECT last_reply_at, hourly_count, hourly_reset_at
    FROM ai_rate_limits WHERE conversation_id = $1
  `, [conversationId]);

  if (!limits) return false;

  // Check cooldown
  const cooldownMs = 10000; // or from settings
  if (Date.now() - new Date(limits.last_reply_at).getTime() < cooldownMs) {
    return true;
  }

  // Check hourly
  if (new Date() < new Date(limits.hourly_reset_at) && limits.hourly_count >= 4) {
    return true;
  }

  return false;
}
```

---

### Phase 4: Improve Knowledge Search

#### 4.1 Add PostgreSQL full-text search

**File:** `ai.ts` - `searchKnowledge()`

```typescript
// BEFORE (LIKE-based, slow)
const placeholders = words.map((_, i) => `LOWER(content) LIKE $${i + 2}`).join(' OR ');

// AFTER (Full-text search with ranking)
async function searchKnowledge(accountId: string, searchQuery: string): Promise<any[]> {
  // Clean and prepare search terms
  const terms = searchQuery.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .join(' & '); // PostgreSQL tsquery format

  if (!terms) return [];

  const results = await query(`
    SELECT content, document_name,
      ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', $2)) as rank
    FROM knowledge_chunks
    WHERE whatsapp_account_id = $1
      AND to_tsvector('simple', content) @@ plainto_tsquery('simple', $2)
    ORDER BY rank DESC
    LIMIT 5
  `, [accountId, searchQuery]);

  return results || [];
}
```

#### 4.2 Add text search index (migration)

```sql
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_fts
  ON knowledge_chunks USING GIN (to_tsvector('simple', content));
```

---

## Implementation Order

### Step 1: Fix the critical bug (30 min)
- [ ] Replace stub `generateAIResponse` with working implementation
- [ ] Test: Create rule with `use_ai=true`, verify response sent

### Step 2: Add custom_prompt support (15 min)
- [ ] Use `settings.custom_prompt` in `generateResponse()`
- [ ] Test: Set custom prompt in UI, verify AI uses it

### Step 3: Unify AI systems (1 hr)
- [ ] Create `generateAIResponseUnified()` function
- [ ] Refactor autoReplyProcessor to use it
- [ ] Remove duplicate code
- [ ] Test both paths work

### Step 4: Database rate limits (45 min)
- [ ] Add migration for rate limit columns/table
- [ ] Update rate limit functions to use DB
- [ ] Test: Restart server, verify limits persist

### Step 5: Improve knowledge search (30 min)
- [ ] Add FTS index migration
- [ ] Update `searchKnowledge()` to use FTS
- [ ] Increase result limit to 5
- [ ] Test: Upload document, verify search quality

---

## Testing Checklist

- [ ] Rule with `use_ai=false` + static content → sends static
- [ ] Rule with `use_ai=true` + ai_prompt → sends AI response with knowledge
- [ ] No rules matched + AI enabled → sends AI response
- [ ] No rules matched + AI disabled → no response
- [ ] Rate limit (10s cooldown) → skips if too fast
- [ ] Rate limit (4/hr) → skips if exceeded
- [ ] Human takeover → skips AI for 30 min
- [ ] Max consecutive (2) → skips if already replied twice
- [ ] Knowledge search → returns relevant chunks
- [ ] Custom prompt in settings → AI uses it
- [ ] Server restart → rate limits persist

---

## Files to Modify

| File | Changes |
|------|---------|
| `backend/src/services/autoReplyProcessor.ts` | Fix stub, unify AI calls |
| `backend/src/services/ai.ts` | Add unified function, use custom_prompt, improve search |
| `backend/src/db/migrate.ts` | Add FTS index, rate limit table |
| `backend/src/routes/auto-reply.ts` | Update test endpoint for AI preview |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing auto-reply | Keep static rules path unchanged |
| OpenAI API errors | Existing fallback to static content |
| Rate limit migration | Default values match current behavior |
| Search quality change | FTS is more accurate, not breaking |
