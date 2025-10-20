import { Router, type Router as ExpressRouter } from 'express';

import { registerUser, sendOTPToPhone, verifyOTP, onboard, loginRequestOTP, loginVerifyOTP } from '../controllers/authController.js';


const router: ExpressRouter = Router();

router.post('/register', registerUser);
router.post('/send-otp', sendOTPToPhone);
router.post('/verify-otp', verifyOTP);
router.post('/onboard', onboard);
router.post('/login/request-otp', loginRequestOTP);
router.post('/login/verify-otp', loginVerifyOTP);

export default router;
