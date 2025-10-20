"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userManagementController_1 = require("../controllers/userManagementController");
const router = (0, express_1.Router)();
router.get('/profile/:phone', userManagementController_1.getUserProfile);
router.patch('/profile/:phone', userManagementController_1.updateUserProfile);
router.delete('/profile/:phone', userManagementController_1.deleteUser);
exports.default = router;
//# sourceMappingURL=userManagementRouter.js.map