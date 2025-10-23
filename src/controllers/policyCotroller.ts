import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import axios from 'axios';

import { getSponsoredSmartWalletClient } from '../utils/paymasterutil.js';
import { BlockchainNetwork, getChainConfig } from '../configs/blockchain.js';
import { BodaInsurancePolicy } from '../models/insurance/Policy.js';
import HimaEscrowABI from '../../contracts/abi/escrow.json';

interface AuthRequest extends Request {
  user?: any;
}

const COINBASE_API_URL = 'https://api.coinbase.com/v2/exchange-rates';

// Setup blockchain, payment, and environment variables
const rpc = process.env.NODE_ENV == "development" ? process.env.BASE_TESTNET_RPC : process.env.BASE_MAINNET_RPC;
const escrowAddress: string = process.env.ESCROW_ADDRESS as string;
if (!escrowAddress) {
  throw new Error('ESCROW_ADDRESS environment variable not set');
}
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(process.env.PAYMASTER_WALLET_PRIVATE_KEY!, provider);
// const escrow = new ethers.Contract(escrowAddress, HimaEscrowABI, wallet);

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
    policyNumber = `POL-${dateStr}-${randomNum}`;
    const existingPolicy = await BodaInsurancePolicy.findOne({ policyNumber });
    exists = !!existingPolicy;
  }
  return policyNumber!;
};

const getKEStoUSDCRate = async (): Promise<number> => {
  try {
    // Get USD/KES rate from Coinbase
    const response = await axios.get(`${COINBASE_API_URL}?currency=USD`);
    const rates = response.data.data.rates;

    const kesRate = parseFloat(rates.KES); // How many KES per 1 USD

    if (!kesRate || kesRate === 0) {
      throw new Error('Invalid KES exchange rate received');
    }

    // Convert: 1 KES = (1 / kesRate) USD
    // Since USDC ≈ USD, 1 KES ≈ (1 / kesRate) USDC
    const usdcPerKes = 1 / kesRate;

    console.log(`[Exchange Rate] 1 USD = ${kesRate} KES`);
    console.log(`[Exchange Rate] 1 KES = ${usdcPerKes.toFixed(6)} USDC`);

    return usdcPerKes;
  } catch (error: any) {
    console.error('[Exchange Rate] Failed to fetch from Coinbase:', error.message);
    // Fallback rate if API fails (approximate)
    const fallbackRate = 0.0077; // ~1 KES = 0.0077 USDC (as of Oct 2024)
    console.log(`[Exchange Rate] Using fallback rate: 1 KES = ${fallbackRate} USDC`);
    return fallbackRate;
  }
};

/**
 * Convert KES amount to USDC amount in wei (6 decimals)
 */
const convertKEStoUSDC = async (kesAmount: number): Promise<bigint> => {
  const rate = await getKEStoUSDCRate();
  const usdcAmount = kesAmount * rate;

  console.log(`[Conversion] ${kesAmount} KES = ${usdcAmount.toFixed(6)} USDC`);

  // Convert to wei (6 decimals for USDC)
  const usdcWei = ethers.parseUnits(usdcAmount.toFixed(6), 6);

  return usdcWei;
};

// Util for polling payment status with better logging
const pollOrderStatus = async (
  orderId: string,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<any> => {
  const isTxHash = orderId.startsWith('0x') && orderId.length === 66;

  // Try both endpoints
  const endpoints = [
    `${BASE_URL}/orders/${orderId}`,
    `${BASE_URL}/orders/tx/${orderId}`
  ];

  console.log(`[Payment Poll] Starting poll for order: ${orderId}`);
  console.log(`[Payment Poll] Is tx hash: ${isTxHash}`);
  console.log(`[Payment Poll] Max attempts: ${maxAttempts}, Interval: ${intervalMs}ms`);

  for (let i = 0; i < maxAttempts; i++) {
    for (const endpoint of endpoints) {
      try {
        console.log(`[Payment Poll] Attempt ${i + 1}/${maxAttempts} - Checking: ${endpoint}`);

        const resp = await axios.get(endpoint, {
          headers: {
            "x-api-key": order_api_key,
            "Content-Type": "application/json"
          }
        });

        const orderData = resp.data;
        console.log(`[Payment Poll] Response:`, JSON.stringify(orderData, null, 2));

        const dataStatus = orderData?.data?.status;
        const topStatus = orderData?.status;

        console.log(`[Payment Poll] Status - Top: ${topStatus}, Data: ${dataStatus}`);

        // Success conditions
        if (
          topStatus === "success" &&
          (dataStatus === "completed" || dataStatus === "submitted" || dataStatus === "settled")
        ) {
          console.log(`[Payment Poll] ✓ Payment confirmed!`);
          return orderData;
        }

        // Failure conditions
        if (topStatus === "error" || dataStatus === "failed") {
          console.error(`[Payment Poll] ✗ Payment failed`);
          throw new Error(
            `Payment failed: ${orderData?.message || orderData?.data?.message || "Unknown error"}`
          );
        }

        // Still pending
        console.log(`[Payment Poll] Payment still pending...`);

      } catch (err: any) {
        if (err.message.includes("Payment failed")) throw err;

        // Log non-fatal errors (like 404) and try next endpoint
        console.log(`[Payment Poll] Endpoint error (trying next): ${err.message}`);
      }
    }

    // Wait before next attempt
    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  console.error(`[Payment Poll] ✗ Timeout after ${maxAttempts} attempts`);
  throw new Error("Payment timeout: User did not complete payment within expected time");
};

/** 
 * Initiate Policy: Only the logged in user can create/initiate. 
 * Requires authenticateJWT middleware to set req.user.
 */
export const initiatePolicy = async (req: AuthRequest, res: Response) => {
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

export const completePolicy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Fetch full user details from database
    const User = req.app.locals.User || (await import('../models/user/User.js')).default;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userWalletAddress = user.walletAddress;
    if (!userWalletAddress) {
      return res.status(400).json({
        message: "User wallet address not found",
        userId: user._id
      });
    }

    const { policyId, orderId, chain } = req.body;
    if (!policyId || !orderId) {
      return res.status(400).json({ message: "Missing policyId or orderId" });
    }

    const blockchainNetwork = chain || BlockchainNetwork.BASE;

    console.log(`[Policy Completion] User ID: ${userId}`);
    console.log(`[Policy Completion] User Wallet: ${userWalletAddress}`);
    console.log(`[Policy Completion] Chain: ${blockchainNetwork}`);

    // Verify policy belongs to user
    const policy = await BodaInsurancePolicy.findOne({ _id: policyId, user: userId });
    if (!policy) {
      return res.status(403).json({ message: "Not authorized to complete this policy" });
    }

    // Check if already completed
    if (policy.status === 'active' && policy.policyId) {
      return res.status(200).json({
        message: "Policy already completed",
        policy
      });
    }

    // Step 1: Verify payment completion via ElementPay
    let confirmedOrder;
    try {
      console.log(`[Payment] Checking order status: ${orderId}`);
      confirmedOrder = await pollOrderStatus(orderId, 30, 3000); // 30 attempts, 3s interval = 90s max
      console.log(`[Payment] Order confirmed: ${orderId}`);
    } catch (err: any) {
      console.error(`[Payment] Verification failed:`, err.message);

      // Provide helpful error with status check endpoint
      return res.status(400).json({
        message: "Payment not completed or not found",
        error: err.message,
        orderId: orderId,
        hint: "Check payment status manually using GET /api/v1/insurance/policies/payment-status/:orderId",
        note: "Payment may still be processing. Please wait and try again in a few moments."
      });
    }

    // Extract payment details
    const rider = policy.rider || userWalletAddress; // User's wallet is the beneficiary
    const token = policy.token || confirmedOrder.data.token;
    const amountFiat = confirmedOrder.data.amount_fiat; // This is in KES
    const currency = confirmedOrder.data.currency;
    const transactionHashes = confirmedOrder.data.transaction_hashes;
    const walletAddress = confirmedOrder.data.wallet_address;

    if (amountFiat === undefined || amountFiat === null) {
      return res.status(500).json({
        message: "No amount_fiat found in confirmedOrder data.",
        orderData: confirmedOrder
      });
    }

    if (!rider || !ethers.isAddress(rider)) {
      return res.status(400).json({
        message: "Invalid rider address",
        rider: rider
      });
    }

    console.log(`[Payment Details] Amount Fiat: ${amountFiat} ${currency}`);
    console.log(`[Payment Details] Wallet: ${walletAddress}`);
    console.log(`[Payment Details] Settlement TX: ${transactionHashes?.settlement}`);

    const config = getChainConfig(blockchainNetwork);
    if (!config || !('rpc' in config)) {
      return res.status(500).json({
        message: `Invalid chain configuration for ${blockchainNetwork}`,
        availableChains: Object.values(BlockchainNetwork)
      });
    }

    const chainConfig = config as { caip2: string; chainId: number; rpc: string | undefined };
    const rpcUrl = chainConfig.rpc;

    if (!rpcUrl) {
      return res.status(500).json({
        message: `RPC URL not configured for chain ${blockchainNetwork}`,
        envVar: process.env.DEPLOY_MAINNET === 'true'
          ? `${blockchainNetwork.toUpperCase()}_MAINNET_RPC`
          : `${blockchainNetwork.toUpperCase()}_TESTNET_RPC`
      });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Setup paymaster wallet
    const paymasterPrivateKey = process.env.PAYMASTER_WALLET_PRIVATE_KEY;
    if (!paymasterPrivateKey) {
      return res.status(500).json({
        message: "PAYMASTER_WALLET_PRIVATE_KEY not configured"
      });
    }
    // Get the actual USDC amount that was sent on-chain
    // ElementPay has already converted KES to USDC and sent it
    let premiumWei: bigint;
    try {
      if (!transactionHashes?.settlement) {
        throw new Error("No settlement transaction hash found");
      }

      // Query the actual transaction to get the real USDC amount sent
      const settlementTx = await provider.getTransaction(transactionHashes.settlement);

      if (!settlementTx) {
        throw new Error(`Settlement transaction ${transactionHashes.settlement} not found`);
      }

      console.log(`[Settlement TX] Hash: ${settlementTx.hash}`);
      console.log(`[Settlement TX] To: ${settlementTx.to}`);

      // Decode the transaction data to get the transfer amount
      const tokenContract = new ethers.Contract(token, [
        "function transfer(address to, uint256 amount) public returns (bool)",
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
      ], provider);

      // Parse the transaction input data
      const decodedData = tokenContract.interface.parseTransaction({
        data: settlementTx.data,
        value: settlementTx.value
      });

      if (!decodedData || decodedData.name !== 'transfer') {
        throw new Error("Could not decode transfer transaction");
      }

      premiumWei = decodedData.args[1]; // amount is the second argument
      const decimals = await tokenContract.decimals();
      const symbol = await tokenContract.symbol();

      console.log(`[Settlement TX] Actual USDC sent: ${ethers.formatUnits(premiumWei, decimals)} ${symbol}`);
      console.log(`[Settlement TX] Amount in wei: ${premiumWei.toString()}`);

    } catch (err: any) {
      console.error(`[Settlement TX] Error getting actual amount:`, err.message);

      // Fallback: Convert KES to USDC using Coinbase rates
      console.log(`[Fallback] Converting ${amountFiat} ${currency} to USDC using exchange rate...`);

      try {
        if (currency === 'KES') {
          premiumWei = await convertKEStoUSDC(amountFiat);
        } else {
          premiumWei = ethers.parseUnits(amountFiat.toString(), 6);
          console.log(`[Fallback] Using ${amountFiat} ${currency} directly`);
        }
      } catch (conversionErr: any) {
        return res.status(500).json({
          message: "Failed to determine USDC amount from payment",
          error: conversionErr.message,
          settlementTxError: err.message,
          amount: amountFiat,
          currency: currency,
          hint: "Could not read settlement transaction or convert currency"
        });
      }
    }


    const paymasterWallet = new ethers.Wallet(paymasterPrivateKey, provider);

    console.log(`[Paymaster] Address: ${paymasterWallet.address}`);
    console.log(`[Paymaster] Token: ${token}`);
    console.log(`[Paymaster] Premium: ${ethers.formatUnits(premiumWei, 6)} USDC`);
    console.log(`[Paymaster] Rider (beneficiary): ${rider}`);

    // Step 2: Verify paymaster has sufficient token balance
    let paymasterTokenBalance;
    try {
      const tokenContract = new ethers.Contract(token, [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
      ], provider);

      paymasterTokenBalance = await tokenContract.balanceOf(paymasterWallet.address);
      const decimals = await tokenContract.decimals();
      const symbol = await tokenContract.symbol();

      console.log(`[Paymaster] Token balance: ${ethers.formatUnits(paymasterTokenBalance, decimals)} ${symbol}`);

      if (paymasterTokenBalance < premiumWei) {
        return res.status(400).json({
          message: "Paymaster has insufficient token balance",
          token: {
            address: token,
            symbol: symbol
          },
          required: ethers.formatUnits(premiumWei, decimals),
          available: ethers.formatUnits(paymasterTokenBalance, decimals),
          paymasterAddress: paymasterWallet.address,
          note: "ElementPay should have credited tokens to paymaster. Please check ElementPay configuration."
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        message: "Failed to check paymaster token balance",
        error: err.message,
        token: token,
        paymasterAddress: paymasterWallet.address
      });
    }

    // Step 3: Approve escrow contract to spend paymaster's tokens
    let approvalTx;
    try {
      const ERC20 = new ethers.Contract(token, [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
      ], paymasterWallet);

      // Check current allowance
      const currentAllowance = await ERC20.allowance(paymasterWallet.address, escrowAddress);
      console.log(`[Paymaster] Current allowance: ${ethers.formatUnits(currentAllowance, 6)}`);

      // Only approve if allowance is insufficient
      if (currentAllowance < premiumWei) {
        console.log(`[Paymaster] Approving ${ethers.formatUnits(premiumWei, 6)} tokens for escrow...`);
        const approveTxResponse = await ERC20.approve(escrowAddress, premiumWei);
        const approveReceipt = await approveTxResponse.wait();
        approvalTx = approveReceipt.hash;
        console.log(`[Paymaster] Approval confirmed: ${approvalTx}`);
      } else {
        console.log(`[Paymaster] Sufficient allowance already exists`);
      }
    } catch (err: any) {
      console.error(`[Paymaster] Approval failed:`, err);
      return res.status(502).json({
        message: "Failed to approve tokens for escrow",
        error: err.message,
        step: "approval",
        token: token,
        escrowAddress: escrowAddress,
        amount: ethers.formatUnits(premiumWei, 6)
      });
    }

    // Step 4: Create policy on blockchain escrow
    let policyTx, receipt, onChainPolicyId;
    try {
      const escrowContract = new ethers.Contract(escrowAddress, HimaEscrowABI, paymasterWallet);

      console.log(`[Paymaster] Creating policy on blockchain escrow...`);

      // Estimate gas first
      const gasEstimate = await escrowContract.createPolicy.estimateGas(token, premiumWei, rider);
      console.log(`[Paymaster] Estimated gas: ${gasEstimate.toString()}`);

      // Create the policy
      const tx = await escrowContract.createPolicy(token, premiumWei, rider, {
        gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
      });

      console.log(`[Paymaster] Transaction sent: ${tx.hash}`);
      receipt = await tx.wait();
      policyTx = receipt.hash;
      console.log(`[Paymaster] Transaction confirmed in block: ${receipt.blockNumber}`);

      // Parse the PolicyCreated event
      const event = receipt.logs
        .map((log: any) => {
          try {
            return escrowContract.interface.parseLog({
              topics: log.topics,
              data: log.data
            });
          } catch {
            return null;
          }
        })
        .find((e: any) => e && e.name === "PolicyCreated");

      if (!event || !event.args || !event.args.policyId) {
        console.error("[Paymaster] PolicyCreated event not found");
        return res.status(500).json({
          message: "Failed to retrieve on-chain policyId from event",
          transactionHash: policyTx,
          blockNumber: receipt.blockNumber
        });
      }

      onChainPolicyId = event.args.policyId.toString();
      console.log(`[Paymaster] On-chain policy ID: ${onChainPolicyId}`);
    } catch (err: any) {
      console.error("[Paymaster] Blockchain transaction failed:", err);

      let errorDetails: any = {
        message: err.message,
        code: err.code
      };

      if (err.reason) {
        errorDetails.reason = err.reason;
      }
      if (err.data) {
        errorDetails.data = err.data;
      }

      return res.status(502).json({
        message: "Blockchain escrow transaction failed",
        error: errorDetails,
        step: "createPolicy",
        paymasterBalance: ethers.formatUnits(paymasterTokenBalance, 6),
        requiredAmount: ethers.formatUnits(premiumWei, 6),
        token: token,
        rider: rider
      });
    }

    // Step 5: Update policy in database
    try {
      policy.policyId = onChainPolicyId;
      policy.chainTx = policyTx;
      policy.orderEscrowStatus = confirmedOrder.data.status;
      policy.orderEscrowDetails = confirmedOrder;
      policy.status = 'active';
      policy.isActive = true;

      // if (approvalTx) {
      //   policy.approvalTx = approvalTx;
      // }

      await policy.save();
      console.log(`[Success] Policy ${policy.policyNumber} activated`);
    } catch (err: any) {
      console.error("[Database] Update failed:", err);
      return res.status(500).json({
        message: "Policy created on blockchain but database update failed",
        warning: "CRITICAL: Manual intervention required",
        blockchain: {
          policyId: onChainPolicyId,
          transactionHash: policyTx,
          blockNumber: receipt.blockNumber
        },
        databaseError: err.message,
        policyNumber: policy.policyNumber
      });
    }

    // Step 6: Return success response
    res.status(200).json({
      message: "Policy created successfully",
      policy: {
        _id: policy._id,
        policyNumber: policy.policyNumber,
        bodaRegNo: policy.bodaRegNo,
        plan: policy.plan,
        status: policy.status,
        isActive: policy.isActive,
        startDate: policy.startDate,
        endDate: policy.endDate,
        premiumPaid: policy.premiumPaid,
        coverageAmount: policy.coverageAmount,
        rider: policy.rider,
        createdAt: policy.createdAt
      },
      blockchain: {
        policyId: onChainPolicyId,
        transactionHash: policyTx,
        blockNumber: receipt.blockNumber,
        approvalTx: approvalTx,
        chain: blockchainNetwork,
        paymasterPaid: true
      },
      payment: {
        orderId: confirmedOrder.data.order_id,
        status: confirmedOrder.data.status,
        amount: confirmedOrder.data.amount_fiat,
        currency: confirmedOrder.data.currency
      }
    });

  } catch (error: any) {
    console.error("[Error] Unexpected error in completePolicy:", error);
    res.status(500).json({
      message: "Failed to complete policy",
      error: error.message || error,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Check payment status manually
 * GET /api/v1/insurance/policies/payment-status/:orderId
 */
export const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Missing orderId" });
    }

    console.log(`[Payment Check] Checking status for: ${orderId}`);

    // Try both endpoints
    const endpoints = [
      `${BASE_URL}/orders/${orderId}`,
      `${BASE_URL}/orders/tx/${orderId}`
    ];

    let lastError;
    for (const endpoint of endpoints) {
      try {
        console.log(`[Payment Check] Trying endpoint: ${endpoint}`);

        const resp = await axios.get(endpoint, {
          headers: {
            "x-api-key": order_api_key,
            "Content-Type": "application/json"
          }
        });

        console.log(`[Payment Check] Success!`);

        return res.status(200).json({
          message: "Payment status retrieved",
          orderId: orderId,
          endpoint: endpoint,
          data: resp.data
        });
      } catch (err: any) {
        lastError = err;
        console.log(`[Payment Check] Endpoint failed: ${err.message}`);
      }
    }

    // If all endpoints failed
    return res.status(404).json({
      message: "Payment order not found",
      orderId: orderId,
      error: lastError?.response?.data || lastError?.message,
      triedEndpoints: endpoints
    });

  } catch (error: any) {
    console.error("[Payment Check] Error:", error);
    res.status(500).json({
      message: "Failed to check payment status",
      error: error.response?.data || error.message
    });
  }
};

export const listUserPolicies = async (req: AuthRequest, res: Response) => {
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
