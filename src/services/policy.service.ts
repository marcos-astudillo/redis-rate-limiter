import { PolicyRepository } from '../repositories/policy.repository';
import { RateLimitPolicy, CreatePolicyDto, UpdatePolicyDto } from '../models/policy.types';
import { getDbPool } from '../config/database';

export class PolicyService {
  constructor(private readonly repo: PolicyRepository) {}

  async listPolicies(): Promise<RateLimitPolicy[]> {
    return this.repo.findAll();
  }

  async getPolicy(name: string): Promise<RateLimitPolicy> {
    const policy = await this.repo.findByName(name);
    if (!policy) throw new PolicyNotFoundError(name);
    return policy;
  }

  async createPolicy(dto: CreatePolicyDto): Promise<RateLimitPolicy> {
    const existing = await this.repo.findByName(dto.name);
    if (existing) throw new PolicyConflictError(dto.name);
    return this.repo.create(dto);
  }

  async updatePolicy(name: string, dto: UpdatePolicyDto): Promise<RateLimitPolicy> {
    const updated = await this.repo.update(name, dto);
    if (!updated) throw new PolicyNotFoundError(name);
    return updated;
  }

  async deletePolicy(name: string): Promise<void> {
    const deleted = await this.repo.delete(name);
    if (!deleted) throw new PolicyNotFoundError(name);
  }
}

export class PolicyNotFoundError extends Error {
  constructor(name: string) {
    super(`Policy '${name}' not found`);
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyConflictError extends Error {
  constructor(name: string) {
    super(`Policy '${name}' already exists`);
    this.name = 'PolicyConflictError';
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: PolicyService | null = null;

export function getPolicyService(): PolicyService {
  if (!_instance) {
    const { PolicyRepository } = require('../repositories/policy.repository');
    const repo = new PolicyRepository(getDbPool());
    _instance = new PolicyService(repo);
  }
  return _instance;
}
