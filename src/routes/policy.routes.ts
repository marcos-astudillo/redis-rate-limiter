import { Router } from 'express';
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
} from '../controllers/policy.controller';

export const policyRoutes = Router();

policyRoutes.get('/',          listPolicies);
policyRoutes.get('/:name',     getPolicy);
policyRoutes.post('/',         createPolicy);
policyRoutes.patch('/:name',   updatePolicy);
policyRoutes.delete('/:name',  deletePolicy);
