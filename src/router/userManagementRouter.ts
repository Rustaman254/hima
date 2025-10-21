import { Router, type Router as ExpressRouter } from 'express';
import { getUserProfile, updateUserProfile, deleteUser } from '../controllers/userManagementController.js';
import {authenticateJWT} from '../middleware/authMiddleware.js'

const router: ExpressRouter = Router();

router.get('/profile/:phone', authenticateJWT, getUserProfile);
router.patch('/profile/:phone', authenticateJWT, updateUserProfile);
router.delete('/profile/:phone', authenticateJWT, deleteUser);

export default router;
