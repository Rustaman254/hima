"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const router = (0, express_1.Router)();
router.post('/register', authController_1.registerUser);
router.post('/send-otp', authController_1.sendOTPToPhone);
router.post('/verify-otp', authController_1.verifyOTP);
router.post('/onboard', authController_1.onboard);
// PUT /api/users/profile/:phone  — Update user profile fields
// router.put('/profile/:phone', updateUser);
// DELETE /api/users/profile/:phone — Delete a user
// router.delete('/profile/:phone', deleteUser);
exports.default = router;
//# sourceMappingURL=authRouter.js.map