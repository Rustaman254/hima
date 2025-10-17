import { Router, type Router as ExpressRouter } from 'express';
import { registerUser, sendOTPToPhone, verifyOTP } from '../controllers/authController';


const router: ExpressRouter = Router();

router.post('/register', registerUser);
router.post('/send-otp', sendOTPToPhone);
router.post('/verify-otp', verifyOTP);

// POST /api/users/onboard      — Complete onboarding with extra user details/info
// router.post('/onboard', onboardUser);

// GET /api/users/profile/:phone  — Get user profile by phone number
// router.get('/profile/:phone', getUserProfile);

// PUT /api/users/profile/:phone  — Update user profile fields
// router.put('/profile/:phone', updateUser);

// DELETE /api/users/profile/:phone — Delete a user
// router.delete('/profile/:phone', deleteUser);

export default router;
