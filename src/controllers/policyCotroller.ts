import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import axios from 'axios';

import { BodaInsurancePolicy } from '../models/insurance/Policy.js';
import HimaEscrowABI from '../../contracts/abi/escrow.json';

// Setup blockchain, payment, and environment variables
const rpc = process.env.NODE_ENV == "development" ? process.env.BASE_TESTNET_RPC : process.env.BASE_MAINNET_RPC;
const escrowAddress: string = process.env.ESCROW_ADDRESS as string;
if (!escrowAddress) {
  throw new Error('ESCROW_ADDRESS environment variable not set');
}
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(process.env.PAYMASTER_WALLET_PRIVATE_KEY!, provider);
const escrow = new ethers.Contract(escrowAddress, HimaEscrowABI, wallet);

const BASE_URL = 'https://sandbox.elementpay.net/api/v1';
const order_api_key = process.env.ELEMENTpAY_API_KEY;

// Util to generate a unique policy number
const generatePolicyNumber = async (): Promise<string> => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  let policyNumber: string;
  let exists = true;
  while (exists) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    policyNumber = `BODA-${dateStr}-${randomNum}`;
    const existingPolicy = await BodaInsurancePolicy.findOne({ policyNumber });
    exists = !!existingPolicy;
  }
  return policyNumber!;
};

// Util for polling payment status
const pollOrderStatus = async (
  orderId: string,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<any> => {
  const isTxHash = orderId.startsWith('0x') && orderId.length === 66;
  const endpoint = isTxHash
    ? `${BASE_URL}/orders/tx/${orderId}`
    : `${BASE_URL}/orders/tx/${orderId}`;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await axios.get(endpoint, {
        headers: {
          "x-api-key": order_api_key,
          "Content-Type": "application/json"
        }
      });
      const orderData = resp.data;
      const dataStatus = orderData?.data?.status;
      if (
        orderData?.status === "success" &&
        (dataStatus === "completed" || dataStatus === "submitted" || dataStatus === "settled")
      ) {
        return orderData;
      }
      if (orderData?.status === "error" || dataStatus === "failed") {
        throw new Error(
          `Payment failed: ${orderData?.message || "Unknown error"}`
        );
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (err: any) {
      if (err.message.includes("Payment failed")) throw err;
    }
  }
  throw new Error("Payment timeout: User did not complete payment within expected time");
};

/** 
 * Initiate Policy: Only the logged in user can create/initiate. 
 * Requires authenticateJWT middleware to set req.user.
 */
export const initiatePolicy = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const {
      bodaRegNo,
      plan,
      startDate,
      endDate,
      premiumPaid,
      coverageAmount,
      insuredBikeDetails,
      status,
      claims,
      rider,
      token,
      premium,
      user_address,
      amount_fiat,
      phone_number,
      currency,
      narrative,
      client_ref
    } = req.body;

    if (!bodaRegNo || !plan || !startDate || !endDate || !premiumPaid || !coverageAmount) {
      return res.status(400).json({
        message: "Missing required fields: bodaRegNo, plan, startDate, endDate, premiumPaid, coverageAmount"
      });
    }

    if (!user_address || !token || !amount_fiat || !phone_number || !currency) {
      return res.status(400).json({
        message: "Missing ElementPay required fields",
        missing: {
          user_address: !user_address,
          token: !token,
          amount_fiat: !amount_fiat,
          phone_number: !phone_number,
          currency: !currency
        }
      });
    }

    const policyNumber = await generatePolicyNumber();

    const orderPayload = {
      user_address,
      token,
      order_type: 0,
      fiat_payload: {
        amount_fiat: typeof amount_fiat === 'string' ? parseFloat(amount_fiat) : amount_fiat,
        cashout_type: "PHONE",
        phone_number: phone_number.replace('+', ''),
        currency,
        narrative: narrative || "Boda insurance premium payment",
        client_ref: client_ref || policyNumber
      }
    };

    let orderResult;
    let orderId: string;
    try {
      const resp = await axios.post(
        `${BASE_URL}/orders/create`,
        orderPayload,
        {
          headers: {
            "x-api-key": order_api_key,
            "Content-Type": "application/json"
          }
        }
      );
      orderResult = resp.data;
      orderId = orderResult?.data?.order_id || orderResult?.data?.tx_hash;
      if (!orderId || orderResult?.status !== "success") {
        return res.status(400).json({
          message: "Failed to create ElementPay order",
          orderResult
        });
      }
    } catch (err: any) {
      return res.status(502).json({
        message: "Order API call failed",
        error: err.response?.data || err.message
      });
    }

    const pendingPolicy = new BodaInsurancePolicy({
      user: userId,
      bodaRegNo,
      plan,
      policyNumber,
      startDate,
      endDate,
      premiumPaid,
      coverageAmount,
      insuredBikeDetails,
      status: 'paused',
      isActive: false,
      claims: claims || [],
      rider,
      token,
      premium,
      orderEscrowId: orderId,
      orderEscrowStatus: orderResult.data.status || 'pending',
      orderEscrowDetails: orderResult
    });

    await pendingPolicy.save();

    res.status(202).json({
      message: "Payment order created. Please complete payment on your phone.",
      policyNumber,
      orderId,
      policyId: pendingPolicy._id,
      status: "pending_payment",
      orderDetails: orderResult
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to initiate policy",
      error: error instanceof Error ? error.message : error
    });
  }
};

/** 
 * Complete Policy: Only the logged in user can complete their own policy.
 * Requires authenticateJWT middleware to set req.user.
 */
export const completePolicy = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { policyId, orderId } = req.body;
    if (!policyId || !orderId) {
      return res.status(400).json({ message: "Missing policyId or orderId" });
    }

    const policy = await BodaInsurancePolicy.findOne({ _id: policyId, user: userId });
    if (!policy) {
      return res.status(403).json({ message: "Not authorized to complete this policy" });
    }

    if (policy.status === 'active' && policy.policyId) {
      return res.status(200).json({
        message: "Policy already completed",
        policy
      });
    }

    let confirmedOrder;
    try {
      confirmedOrder = await pollOrderStatus(orderId);
    } catch (err: any) {
      return res.status(400).json({
        message: "Payment not completed",
        error: err.message
      });
    }

    const rider = policy.rider || confirmedOrder.data.user_address;
    const token = policy.token || confirmedOrder.data.token;
    const amountFiat = confirmedOrder.data.amount_fiat;

    if (amountFiat === undefined || amountFiat === null) {
      return res.status(500).json({
        message: "No amount_fiat found in confirmedOrder data.",
        orderData: confirmedOrder
      });
    }

    const premiumWei = ethers.parseUnits(amountFiat.toString(), 6);

    let tx, receipt, onChainPolicyId;
    try {
      const ERC20 = new ethers.Contract(token, [
        "function approve(address,uint256) public returns (bool)"
      ], wallet);

      await ERC20.approve(escrowAddress, premiumWei);
      tx = await escrow.createPolicy(token, premiumWei, rider);
      receipt = await tx.wait();

      const event = receipt.logs
        .map((log: any) => {
          try { return escrow.interface.parseLog(log); } catch { return null; }
        })
        .find((e: any) => e && e.name === "PolicyCreated");
      if (!event || !event.args || !event.args.policyId) {
        return res.status(500).json({
          message: "Failed to retrieve on-chain policyId",
          event,
          logs: receipt.logs
        });
      }
      onChainPolicyId = event.args.policyId.toString();
    } catch (err) {
      return res.status(502).json({
        message: "Blockchain escrow failed",
        error: err instanceof Error ? err.message : err
      });
    }

    policy.policyId = onChainPolicyId;
    policy.chainTx = receipt.transactionHash;
    policy.orderEscrowStatus = confirmedOrder.data.status;
    policy.orderEscrowDetails = confirmedOrder;
    policy.status = 'active';
    policy.isActive = true;
    await policy.save();

    res.status(200).json({
      message: "Policy created successfully",
      policy,
      blockchain: {
        policyId: onChainPolicyId,
        transactionHash: receipt.transactionHash
      },
      payment: confirmedOrder
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to complete policy",
      error: error instanceof Error ? error.message : error
    });
  }
};


/**
 * Check payment status
 */
export const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const resp = await axios.get(
      `${BASE_URL}/orders/${orderId}`,
      {
        headers: {
          "x-api-key": order_api_key,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json(resp.data);
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to check payment status",
      error: error.response?.data || error.message
    });
  }
};

export const listUserPolicies = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const userId = user?._id || user?.id || user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Missing or invalid user id in JWT payload." });
    }

    const policies = await BodaInsurancePolicy
      .find({ user: userId })
      .populate('plan')
      .populate('user')
      .populate('claims')
      .sort({ createdAt: -1 });

    res.status(200).json({ policies });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to list user policies',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const listPolicies = async (req: Request, res: Response) => {
  try {
    const { user, bodaRegNo, plan, status, active } = req.query;
    const filter: any = {};
    if (user) filter.user = user;
    if (bodaRegNo) filter.bodaRegNo = bodaRegNo;
    if (plan) filter.plan = plan;
    if (status) filter.status = status;
    if (active !== undefined) filter.isActive = active === 'true';
    const policies = await BodaInsurancePolicy.find(filter)
      .populate('plan')
      .populate('user')
      .populate('claims')
      .sort({ createdAt: -1 });
    res.status(200).json({ policies });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list policies', error: error instanceof Error ? error.message : error });
  }
};

export const getPolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const policy = await BodaInsurancePolicy.findById(id)
      .populate('plan')
      .populate('user')
      .populate('claims');
    if (!policy) return res.status(404).json({ message: 'Policy not found.' });
    res.status(200).json({ policy });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch policy', error: error instanceof Error ? error.message : error });
  }
};

export const updatePolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await BodaInsurancePolicy.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Policy not found.' });
    res.status(200).json({ message: 'Policy updated', policy: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update policy', error: error instanceof Error ? error.message : error });
  }
};

export const deactivatePolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deactivated = await BodaInsurancePolicy.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!deactivated) return res.status(404).json({ message: 'Policy not found.' });
    res.status(200).json({ message: 'Policy deactivated', policy: deactivated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to deactivate policy', error: error instanceof Error ? error.message : error });
  }
};
