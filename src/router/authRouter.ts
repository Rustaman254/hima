import { Router, type Router as ExpressRouter } from 'express';
import { registerUser, sendOTPToPhone, verifyOTP, onboard } from '../controllers/authController';


const router: ExpressRouter = Router();

router.post('/register', registerUser);
router.post('/send-otp', sendOTPToPhone);
router.post('/verify-otp', verifyOTP);
router.post('/onboard', onboard);

// PUT /api/users/profile/:phone  — Update user profile fields
// router.put('/profile/:phone', updateUser);

// DELETE /api/users/profile/:phone — Delete a user
// router.delete('/profile/:phone', deleteUser);

export default router;
