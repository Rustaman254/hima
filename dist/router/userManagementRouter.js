import { Router } from 'express';
import { getUserProfile, updateUserProfile, deleteUser } from '../controllers/userManagementController';
const router = Router();
router.get('/profile/:phone', getUserProfile);
router.patch('/profile/:phone', updateUserProfile);
router.delete('/profile/:phone', deleteUser);
export default router;
//# sourceMappingURL=userManagementRouter.js.map