import { Router, type Router as ExpressRouter } from 'express';
import { getUserProfile, updateUserProfile } from '../controllers/userManagementController';


const router: ExpressRouter = Router();

router.get('/profile/:phone', getUserProfile);
router.patch('/profile/:phone', updateUserProfile);
// router.delete('/profile/:phone', deleteUser);

export default router;
