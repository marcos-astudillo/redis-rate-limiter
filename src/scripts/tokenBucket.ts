/**
 * Token Bucket Lua script — executed atomically in Redis.
 *
 * KEYS[1]  — bucket key (e.g., "bucket:user:123")
 * ARGV[1]  — capacity        (max tokens)
 * ARGV[2]  — refill_per_sec  (tokens added per second)
 * ARGV[3]  — now_ms          (current epoch time in milliseconds)
 * ARGV[4]  — ttl_sec         (Redis key TTL in seconds)
 *
 * Returns: {allowed (0|1), remaining (int), retry_after_ms (int)}
 */
export const TOKEN_BUCKET_SCRIPT = `
local key           = KEYS[1]
local capacity      = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now_ms        = tonumber(ARGV[3])
local ttl_sec       = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
local tokens        = tonumber(bucket[1])
local last_refill_ms = tonumber(bucket[2])

-- Initialize a brand-new bucket full of tokens
if tokens == nil then
  tokens        = capacity
  last_refill_ms = now_ms
end

-- Refill: add tokens proportional to elapsed time
local elapsed_sec = math.max(0, (now_ms - last_refill_ms) / 1000)
tokens = math.min(capacity, tokens + elapsed_sec * refill_per_sec)

local allowed        = 0
local remaining      = math.floor(tokens)
local retry_after_ms = 0

if tokens >= 1 then
  tokens    = tokens - 1
  allowed   = 1
  remaining = math.floor(tokens)
else
  -- How long until the next token becomes available?
  retry_after_ms = math.ceil((1 - tokens) / refill_per_sec * 1000)
end

-- Persist updated state and reset TTL
redis.call('HSET', key, 'tokens', tostring(tokens), 'last_refill_ms', tostring(now_ms))
redis.call('EXPIRE', key, ttl_sec)

return {allowed, remaining, retry_after_ms}
`;
