export interface RateLimitPolicy {
  id: number;
  name: string;         // e.g., "free" | "pro" | "enterprise"
  capacity: number;     // max tokens
  refillPerSec: number; // tokens refilled per second
  createdAt: Date;
  updatedAt: Date;
}

export type CreatePolicyDto = Pick<RateLimitPolicy, 'name' | 'capacity' | 'refillPerSec'>;
export type UpdatePolicyDto = Partial<Pick<RateLimitPolicy, 'capacity' | 'refillPerSec'>>;
