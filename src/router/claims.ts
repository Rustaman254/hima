import express from 'express';
import {
  createClaim,
  listClaims,
  getClaim,
  approveClaimAndPayout
} from '../controllers/claimsController.js';
import { authenticateJWT } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/claims/new-claim", authenticateJWT, createClaim);
router.get('/claims', authenticateJWT, listClaims);
router.post('/claims/:id/approve', authenticateJWT, approveClaimAndPayout);
router.get('/claims/:id', authenticateJWT, getClaim);

export default router;
