import { Request, Response, NextFunction } from 'express';
import { getPolicyService, PolicyNotFoundError, PolicyConflictError } from '../services/policy.service';

export async function listPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const policies = await getPolicyService().listPolicies();
    res.json(policies);
  } catch (err) { next(err); }
}

export async function getPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await getPolicyService().getPolicy(req.params.name);
    res.json(policy);
  } catch (err) {
    if (err instanceof PolicyNotFoundError) { res.status(404).json({ error: err.message }); return; }
    next(err);
  }
}

export async function createPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, capacity, refill_per_sec } = req.body as Record<string, unknown>;
    const errors: string[] = [];
    if (!name || typeof name !== 'string')                              errors.push('name is required');
    if (typeof capacity !== 'number' || capacity <= 0)                  errors.push('capacity must be a positive number');
    if (typeof refill_per_sec !== 'number' || refill_per_sec <= 0)      errors.push('refill_per_sec must be a positive number');
    if (errors.length > 0) { res.status(400).json({ error: 'Validation failed', details: errors }); return; }

    const policy = await getPolicyService().createPolicy({
      name: name as string,
      capacity: capacity as number,
      refillPerSec: refill_per_sec as number,
    });
    res.status(201).json(policy);
  } catch (err) {
    if (err instanceof PolicyConflictError) { res.status(409).json({ error: err.message }); return; }
    next(err);
  }
}

export async function updatePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { capacity, refill_per_sec } = req.body as Record<string, unknown>;

    if (capacity === undefined && refill_per_sec === undefined) {
      res.status(400).json({ error: 'At least one field (capacity, refill_per_sec) must be provided' });
      return;
    }

    const errors: string[] = [];
    if (capacity !== undefined && (typeof capacity !== 'number' || capacity <= 0)) {
      errors.push('capacity must be a positive number');
    }
    if (refill_per_sec !== undefined && (typeof refill_per_sec !== 'number' || refill_per_sec <= 0)) {
      errors.push('refill_per_sec must be a positive number');
    }
    if (errors.length > 0) { res.status(400).json({ error: 'Validation failed', details: errors }); return; }

    const dto: Record<string, unknown> = {};
    if (capacity !== undefined)       dto.capacity     = capacity;
    if (refill_per_sec !== undefined) dto.refillPerSec = refill_per_sec;

    const policy = await getPolicyService().updatePolicy(req.params.name, dto);
    res.json(policy);
  } catch (err) {
    if (err instanceof PolicyNotFoundError) { res.status(404).json({ error: err.message }); return; }
    next(err);
  }
}

export async function deletePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await getPolicyService().deletePolicy(req.params.name);
    res.status(204).send();
  } catch (err) {
    if (err instanceof PolicyNotFoundError) { res.status(404).json({ error: err.message }); return; }
    next(err);
  }
}
