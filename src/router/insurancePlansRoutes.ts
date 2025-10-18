import { Router, type Router as ExpressRouter } from 'express';
import {
  createDefaultPlans,
  listPlans,
  addPlan,
  updatePlan,
  deletePlan
} from '../controllers/insurancePlansController';

const router: ExpressRouter = Router();

router.post('/plans/default', createDefaultPlans);
router.get('/plans', listPlans);
router.post('/plans', addPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

export default router;
