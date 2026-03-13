import { Router } from 'express';
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
} from '../controllers/policy.controller';

export const policyRoutes = Router();

/**
 * @openapi
 * /policies:
 *   get:
 *     summary: List all rate limit policies
 *     description: Returns all named plans stored in PostgreSQL (e.g. free, pro, enterprise).
 *     tags: [Policies]
 *     responses:
 *       '200':
 *         description: Array of policies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Policy'
 *   post:
 *     summary: Create a new rate limit policy
 *     tags: [Policies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PolicyCreate'
 *           examples:
 *             free:
 *               summary: Free tier
 *               value: { name: "free", capacity: 60, refill_per_sec: 1 }
 *             pro:
 *               summary: Pro tier
 *               value: { name: "pro", capacity: 500, refill_per_sec: 50 }
 *     responses:
 *       '201':
 *         description: Policy created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Policy'
 *       '400':
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error400'
 *       '409':
 *         description: A policy with that name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error409'
 */
policyRoutes.get('/',  listPolicies);
policyRoutes.post('/', createPolicy);

/**
 * @openapi
 * /policies/{name}:
 *   get:
 *     summary: Get a policy by name
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *         example: pro
 *     responses:
 *       '200':
 *         description: Policy found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Policy'
 *       '404':
 *         description: Policy not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error404'
 *   patch:
 *     summary: Update capacity and/or refill rate of a policy
 *     description: |
 *       Partial update — supply at least one field.
 *       The in-process policy cache is invalidated immediately so the new limits
 *       take effect within one request.
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *         example: pro
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PolicyUpdate'
 *           example:
 *             capacity: 1000
 *     responses:
 *       '200':
 *         description: Updated policy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Policy'
 *       '400':
 *         description: No fields provided or invalid values
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error400'
 *       '404':
 *         description: Policy not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error404'
 *   delete:
 *     summary: Delete a policy by name
 *     tags: [Policies]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *         example: startup
 *     responses:
 *       '204':
 *         description: Deleted successfully (no body)
 *       '404':
 *         description: Policy not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error404'
 */
policyRoutes.get('/:name',    getPolicy);
policyRoutes.patch('/:name',  updatePolicy);
policyRoutes.delete('/:name', deletePolicy);
