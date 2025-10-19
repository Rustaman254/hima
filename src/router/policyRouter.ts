import { Router, type Router as ExpressRouter } from 'express';
import {
  addPolicy,
  listPolicies,
  getPolicy,
  updatePolicy,
  deactivatePolicy
} from '../controllers/policyCotroller';

const router: ExpressRouter = Router();

router.post('/new', addPolicy);
router.get('/policies', listPolicies);
router.get('/policies/:id', getPolicy);
router.patch('/policies/:id', updatePolicy);
router.delete('/policies/:id', deactivatePolicy);

export default router;
