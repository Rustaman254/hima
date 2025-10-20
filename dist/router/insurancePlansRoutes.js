"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const insurancePlansController_1 = require("../controllers/insurancePlansController");
const router = (0, express_1.Router)();
router.post('/plans/default', insurancePlansController_1.createDefaultPlans);
router.get('/plans', insurancePlansController_1.listPlans);
router.post('/plans', insurancePlansController_1.addPlan);
router.patch('/plans/:id', insurancePlansController_1.updatePlan);
router.delete('/plans/:id', insurancePlansController_1.deletePlan);
exports.default = router;
//# sourceMappingURL=insurancePlansRoutes.js.map