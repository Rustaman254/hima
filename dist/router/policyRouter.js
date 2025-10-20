"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const policyCotroller_1 = require("../controllers/policyCotroller");
const router = (0, express_1.Router)();
router.post('/new', policyCotroller_1.addPolicy);
router.get('/policies', policyCotroller_1.listPolicies);
router.get('/policies/:id', policyCotroller_1.getPolicy);
router.patch('/policies/:id', policyCotroller_1.updatePolicy);
router.delete('/policies/:id', policyCotroller_1.deactivatePolicy);
exports.default = router;
//# sourceMappingURL=policyRouter.js.map