import { Pool } from 'pg';
import { RateLimitPolicy, CreatePolicyDto, UpdatePolicyDto } from '../models/policy.types';

function mapRow(row: Record<string, unknown>): RateLimitPolicy {
  return {
    id:           row.id as number,
    name:         row.name as string,
    capacity:     row.capacity as number,
    refillPerSec: parseFloat(row.refill_per_sec as string),
    createdAt:    row.created_at as Date,
    updatedAt:    row.updated_at as Date,
  };
}

export class PolicyRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<RateLimitPolicy[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM rate_limit_policies ORDER BY name',
    );
    return rows.map(mapRow);
  }

  async findByName(name: string): Promise<RateLimitPolicy | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM rate_limit_policies WHERE name = $1',
      [name],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(dto: CreatePolicyDto): Promise<RateLimitPolicy> {
    const { rows } = await this.pool.query(
      `INSERT INTO rate_limit_policies (name, capacity, refill_per_sec)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.name, dto.capacity, dto.refillPerSec],
    );
    return mapRow(rows[0]);
  }

  async update(name: string, dto: UpdatePolicyDto): Promise<RateLimitPolicy | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.capacity !== undefined)     { fields.push(`capacity = $${idx++}`);     values.push(dto.capacity); }
    if (dto.refillPerSec !== undefined) { fields.push(`refill_per_sec = $${idx++}`); values.push(dto.refillPerSec); }

    if (fields.length === 0) return this.findByName(name);

    fields.push(`updated_at = NOW()`);
    values.push(name);

    const { rows } = await this.pool.query(
      `UPDATE rate_limit_policies SET ${fields.join(', ')} WHERE name = $${idx} RETURNING *`,
      values,
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async delete(name: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM rate_limit_policies WHERE name = $1',
      [name],
    );
    return (rowCount ?? 0) > 0;
  }
}
