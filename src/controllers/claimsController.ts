import type { Request, Response } from "express";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { BodaInsuranceClaim } from "../models/insurance/Claim.js";
import { BodaInsurancePolicy } from "../models/insurance/Policy.js";
import HimaEscrowABI from "../../contracts/abi/escrow.json";

interface AuthRequest extends Request {
  user?: any;
}

const rpc = process.env.NODE_ENV === "development" ? process.env.BASE_TESTNET_RPC : process.env.BASE_MAINNET_RPC;
const provider = new ethers.JsonRpcProvider(rpc);
const escrowAddress = process.env.ESCROW_ADDRESS!;
const paymasterPrivateKey = process.env.PAYMASTER_WALLET_PRIVATE_KEY!;
const paymasterWallet = new ethers.Wallet(paymasterPrivateKey, provider);
const escrowContract = new ethers.Contract(escrowAddress, HimaEscrowABI, paymasterWallet);

//----------------------------------------------------//
// Blockchain Escrow Payout Handler
//----------------------------------------------------//
const payoutFromEscrow = async (claimId: number) => {
  const gasEstimate = await escrowContract.payoutClaim.estimateGas(claimId);
  const tx = await escrowContract.payoutClaim(claimId, {
    gasLimit: gasEstimate * 120n / 100n,
  });
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

//----------------------------------------------------//
// Create Claim — Logged-in User Only
//----------------------------------------------------//
export const createClaim = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { policyId, claimType, incidentDate, description, location, amountClaimed } = req.body;
    if (!policyId || !claimType || !incidentDate || !amountClaimed)
      return res.status(400).json({ message: "Missing required fields." });

    const policy = await BodaInsurancePolicy.findOne({ _id: policyId, user: userId })
      .populate("user")
      .populate("plan");
    if (!policy)
      return res.status(404).json({ message: "Policy not found or not owned by this user." });
    if (!policy.isActive || policy.status !== "active")
      return res.status(400).json({ message: `Policy ${policy.policyNumber} is inactive.` });

    const timestamp = Date.now().toString().slice(-6);
    const claimNumber = `CLM-${policy.policyNumber}-${timestamp}`;

    const newClaim = new BodaInsuranceClaim({
      user: userId,
      policy: policy._id,
      claimNumber,
      claimType,
      bodaRegNo: policy.bodaRegNo,
      incidentDate,
      description,
      location,
      amountClaimed,
      status: "submitted",
      auditTrail: [
        {
          date: new Date(),
          action: "claim_created",
          user: userId,
          note: `Claim created by user ${userId} under policy ${policy.policyNumber}`,
        },
      ],
    });

    await newClaim.save();
    await BodaInsurancePolicy.findByIdAndUpdate(policy._id, { $push: { claims: newClaim._id } });

    res.status(201).json({ message: "Claim created successfully", claim: newClaim });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create claim", error: error.message });
  }
};

//----------------------------------------------------//
// Approve Claim + Escrow Payout — Authenticated User
//----------------------------------------------------//
export const approveClaimAndPayout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { id } = req.params;
    const { approvedAmount } = req.body;

    const claim = await BodaInsuranceClaim.findOne({ _id: id, user: userId })
      .populate("policy user");
    if (!claim) return res.status(404).json({ message: "Claim not found or unauthorized" });

    const policy: any = claim.policy;
    const riderAddress = policy?.rider;
    if (!riderAddress || !ethers.isAddress(riderAddress))
      return res.status(400).json({ message: "Invalid wallet address for payout" });

    const escrowClaimId = policy.claimId || 0;
    const { txHash, blockNumber } = await payoutFromEscrow(escrowClaimId);

    claim.status = "paid";
    claim.amountApproved = approvedAmount;
    claim.auditTrail.push({
      date: new Date(),
      action: "payout_completed",
      user: userId,
      note: `Payout from escrow success. TxHash: ${txHash}`,
    });
    await claim.save();

    res.status(200).json({
      message: "Payout executed successfully",
      claim,
      blockchain: { txHash, blockNumber, beneficiary: riderAddress },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to execute payout", error: error.message });
  }
};

//----------------------------------------------------//
// List Claims — Only for Logged-In User
//----------------------------------------------------//
export const listClaims = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const claims = await BodaInsuranceClaim.find({ user: userId })
      .populate("policy")
      .populate("user")
      .sort({ createdAt: -1 });

    res.status(200).json({ claims });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to list claims", error: error.message });
  }
};

//----------------------------------------------------//
// Get Specific Claim — Validate Ownership
//----------------------------------------------------//
export const getClaim = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid claim ID." });

    const claim = await BodaInsuranceClaim.findOne({ _id: id, user: userId })
      .populate("policy")
      .populate("user");
    if (!claim)
      return res.status(404).json({ message: "Claim not found or unauthorized." });

    res.status(200).json({ claim });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch claim", error: error.message });
  }
};
