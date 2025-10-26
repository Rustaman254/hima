import { Router, type Router as ExpressRouter } from 'express';
import {
  initiatePolicy,
  completePolicy,
  checkPaymentStatus,
  listPolicies,
  getPolicy,
  updatePolicy,
  listUserPolicies,
  deactivatePolicy
} from '../controllers/policyCotroller.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const router: ExpressRouter = Router();

router.post('/policies/initiate', authenticateJWT, initiatePolicy);
router.post('/policies/complete', authenticateJWT, completePolicy);
router.post('/policies/payment-status/:transactionId', checkPaymentStatus);
router.get('/policies/me', authenticateJWT, listUserPolicies);
router.get('/policies', listPolicies);
router.get('/policies/:id',authenticateJWT, getPolicy);
router.patch('/policies/:id',authenticateJWT, updatePolicy);
router.delete('/policies/:id',authenticateJWT, deactivatePolicy);

export default router;
