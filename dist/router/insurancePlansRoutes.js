import { Router } from 'express';
import { createDefaultPlans, listPlans, addPlan, updatePlan, deletePlan } from '../controllers/insurancePlansController';
const router = Router();
router.post('/plans/default', createDefaultPlans);
router.get('/plans', listPlans);
router.post('/plans', addPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);
export default router;
//# sourceMappingURL=insurancePlansRoutes.js.map