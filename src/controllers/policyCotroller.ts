import { raw, type Request, type Response } from 'express';
import { ethers } from 'ethers';
import axios from 'axios';

import { getSponsoredSmartWalletClient } from '../utils/paymasterutil.js';
import { BlockchainNetwork, getChainConfig } from '../configs/blockchain.js';
import { BodaInsurancePolicy } from '../models/insurance/Policy.js';
import HimaEscrowABI from '../../contracts/abi/escrow.json';

interface AuthRequest extends Request {
  user?: any;
}

// Pretium API Response Types
interface PretiumTransactionData {
  transaction_id?: string;
  transaction_code?: string;
  id?: string;
  reference?: string;
  status?: string;
  amount_kes?: number;
  amount_usdc?: number;
  tx_hash?: string;
  transaction_hash?: string;
  rate_used?: number;
  amount_sent?: number;
  fiat_paid?: number;
  user_address?: string;
  token?: string;
  [key: string]: any; // Allow additional properties
}

interface PretiumResponse {
  code: number;
  message?: string;
  data?: PretiumTransactionData;
  status?: string;
}

interface OrderEscrowDetails {
  code?: number;
  message?: string;
  data?: PretiumTransactionData;
  status?: string;
  callback?: any;
  callbackReceivedAt?: Date;
  [key: string]: any; // Allow additional dynamic properties
}

// Pretium Configuration
const PRETIUM_API_URL = process.env.PRETIUM_API_URL || 'https://api.xwift.africa';
const PRETIUM_API_KEY = process.env.PRETIUM_API_KEY;
const PRETIUM_CALLBACK_URL = process.env.PRETIUM_CALLBACK_URL
  || 'https://unmeet-meghan-displeasedly.ngrok-free.dev/api/v1/insurance/policies/pretium-callback';

// Setup blockchain, payment, and environment variables
const rpc = process.env.NODE_ENV === 'development'
  ? process.env.BASE_MAINNET_RPC
  : process.env.BASE_MAINNET_RPC;
const escrowAddress: string = process.env.ESCROW_ADDRESS as string;
if (!escrowAddress) throw new Error('ESCROW_ADDRESS environment variable not set');
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(process.env.PAYMASTER_WALLET_PRIVATE_KEY!, provider);

/**
 * Generate a unique policy number
 */
const generatePolicyNumber = async (): Promise<string> => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  let policyNumber: string;
  let exists = true;
  while (exists) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    policyNumber = `POL-${dateStr}-${randomNum}`;
    exists = !!(await BodaInsurancePolicy.findOne({ policyNumber }));
  }
  return policyNumber!;
};

/**
 * Get exchange rates for KES
 */
const getPretiumExchangeRate = async (): Promise<{ buying_rate: number; selling_rate: number; quoted_rate: number }> => {
  try {
    const response = await axios.post(`${PRETIUM_API_URL}/v1/exchange-rate`,
      { currency_code: 'KES' },
      {
        headers: {
          'x-api-key': process.env.PRETIUM_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    if (response.data.code !== 200) throw new Error('Failed to fetch exchange rate');
    return response.data.data;
  } catch (err: any) {
    console.error('[Pretium Exchange Rate] Error:', err.message);
    const fallback = 129.0;
    return { buying_rate: fallback - 1, selling_rate: fallback + 1, quoted_rate: fallback };
  }
};

/**
 * Convert KES to USDC
 */
const convertKEStoUSDC = async (kesAmount: number): Promise<bigint> => {
  const rates = await getPretiumExchangeRate();
  const usdcAmount = kesAmount / rates.buying_rate;
  return ethers.parseUnits(usdcAmount.toFixed(6), 6);
};

/**
 * Initiate payment with Xwift Pretium
 */
const initiatePretiumOnramp = async (
  phoneNumber: string,
  kesAmount: number,
  mobileNetwork: string,
  walletAddress: string,
  policyNumber: string
): Promise<PretiumResponse> => {
  try {
    // Normalize phone
    let cleanPhone = phoneNumber.trim();
    if (cleanPhone.startsWith('+254')) cleanPhone = '0' + cleanPhone.slice(4);
    else if (cleanPhone.startsWith('254')) cleanPhone = '0' + cleanPhone.slice(3);
    if (/^7\d{8}$/.test(cleanPhone)) cleanPhone = '0' + cleanPhone;
    if (!/^07\d{8}$/.test(cleanPhone)) throw new Error('Invalid phone format: must start with 07 and be 10 digits');

    const onrampPayload = {
      shortcode: cleanPhone,
      amount: kesAmount,
      mobile_network: mobileNetwork,
      chain: 'BASE',
      asset: 'USDC',
      address: walletAddress,
      callback_url: `${PRETIUM_CALLBACK_URL}?policyNumber=${policyNumber}`,
      fee: 1
    };

    const response = await axios.post<PretiumResponse>(
      `${PRETIUM_API_URL}/v1/onramp/KES`,
      onrampPayload,
      {
        headers: {
          'x-api-key': process.env.PRETIUM_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[Pretium Onramp Response]:', response.data);

    // Treat code 200 with 'PENDING' as success (prompt sent)
    if (response.data.code === 200 && response.data.data?.status === 'PENDING') {
      console.log('[Pretium Onramp] Prompt sent: awaiting user confirmation.');
      return response.data;
    } else {
      throw new Error(response.data.message || 'Unexpected Pretium API response');
    }
  } catch (err: any) {
    console.error('[Pretium Onramp] Error:', err.response?.data || err.message);
    throw err;
  }
};

/**
 * Poll Pretium transaction status
 */
const pollPretiumStatus = async (
  transactionId: string,
  maxAttempts = 60,
  intervalMs = 5000,
  currencyCode: string = "KES"
): Promise<PretiumResponse> => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.post(
        `${PRETIUM_API_URL}/v1/status/${currencyCode}`,
        { transaction_code: transactionId },
        {
          headers: {
            'x-api-key': process.env.PRETIUM_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const status = response.data?.data?.status?.toUpperCase();
      console.log(`[Pretium Poll Attempt ${i + 1}] Status: ${status}`);

      if (status === "COMPLETE" || status === "COMPLETED" || status === "SUCCESS")
        return response.data;
      if (status === "FAILED" || status === "REJECTED")
        throw new Error(`Payment failed: ${response.data.message}`);

    } catch (err: any) {
      console.warn(`[Pretium Poll Attempt ${i + 1}] Error:`, err.message);
      // Keep retrying unless it's a fatal error
      if (err.response?.status === 404) {
        console.warn(`Transaction ${transactionId} not found yet, retrying...`);
      } else if (err.message?.includes("Payment failed")) {
        throw err; // stop retrying if payment failed
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Payment timeout: User did not complete payment within expected time");
};

/**
 * Initiate insurance policy purchase
 */
export const initiatePolicy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const { bodaRegNo, plan, startDate, endDate, premiumPaid, coverageAmount, insuredBikeDetails, rider, phone_number, mobile_network, amount_kes } = req.body;

    if (!bodaRegNo || !plan || !startDate || !endDate || !premiumPaid || !coverageAmount)
      return res.status(400).json({ message: 'Missing required fields' });
    if (!phone_number || !mobile_network || !amount_kes)
      return res.status(400).json({ message: 'Missing mobile money payment fields' });

    const validNetworks = ['Safaricom', 'Airtel'];
    if (!validNetworks.includes(mobile_network))
      return res.status(400).json({ message: "Invalid network, use 'Safaricom' or 'Airtel'" });

    const policyNumber = await generatePolicyNumber();
    const paymaster = new ethers.Wallet(process.env.PAYMASTER_WALLET_PRIVATE_KEY!);

    const result = await initiatePretiumOnramp(
      phone_number,
      amount_kes,
      mobile_network,
      paymaster.address,
      policyNumber
    );

    // Detect proper transaction reference key
    const transactionId =
      result.data?.transaction_id ||
      result.data?.transaction_code ||
      result.data?.id ||
      result.data?.reference;

    console.log(`[Pretium] Transaction initiated: ${transactionId}`);

    // Prepare order escrow details with proper typing
    const orderEscrowDetails: OrderEscrowDetails = {
      code: result.code,
      message: result.message,
      data: result.data,
      status: result.data?.status
    };

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
      claims: [],
      rider,
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      premium: amount_kes,
      orderEscrowId: transactionId,
      orderEscrowStatus: result.data?.status || 'pending',
      orderEscrowDetails: orderEscrowDetails,
      paymentProvider: 'pretium',
      paymentPhone: phone_number,
      paymentNetwork: mobile_network
    });

    await pendingPolicy.save();

    res.status(202).json({
      message: 'Payment initiated successfully. Awaiting user confirmation on mobile.',
      policyNumber,
      transactionId,
      policyId: pendingPolicy._id,
      status: 'pending_payment',
      instructions: 'Please check your phone for M-PESA or Airtel Money prompt and enter PIN to confirm payment.'
    });
  } catch (err: any) {
    console.error('[Initiate Policy Error]', err.message);
    res.status(500).json({ message: 'Failed to initiate Pretium onramp', error: err.message });
  }
};


/**
 * Complete Policy after Pretium payment confirmation
 */
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

    const { policyId, transactionId, chain } = req.body;
    if (!policyId || !transactionId) {
      return res.status(400).json({ message: "Missing policyId or transactionId" });
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

    // Step 1: Verify payment completion via Pretium
    let confirmedTransaction: PretiumResponse;
    try {
      console.log(`[Pretium Payment] Checking transaction status: ${transactionId}`);
      confirmedTransaction = await pollPretiumStatus(transactionId, 30, 3000);
      console.log(`[Pretium Payment] Transaction confirmed: ${transactionId}`);
    } catch (err: any) {
      console.error(`[Pretium Payment] Verification failed:`, err.message);

      return res.status(400).json({
        message: "Payment not completed or not found",
        error: err.message,
        transactionId: transactionId,
        hint: "Check payment status manually using GET /api/v1/insurance/policies/payment-status/:transactionId",
        note: "Payment may still be processing. Please wait and try again in a few moments."
      });
    }

    // Extract payment details from Pretium response
    const transactionData = confirmedTransaction.data;
    if (!transactionData) {
      return res.status(500).json({
        message: "Invalid transaction data received from Pretium",
        confirmedTransaction
      });
    }

    const rider = policy.rider || userWalletAddress;
    const token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
    const amountKES = transactionData.amount_kes || transactionData.amount || policy.premium;

    // const amountUSDC = transactionData.amount_usdc; // Actual USDC amount from Pretium
    const amountUSDC =
      transactionData.amount_usdc ||
      transactionData.amount_in_usd ||
      (transactionData.amount ? Number(transactionData.amount) / 130 : 0);

    const txHash = transactionData.tx_hash || transactionData.transaction_hash;

    if (!amountUSDC || Number(amountUSDC) === 0) {
      return res.status(500).json({
        message: "No USDC amount found in Pretium transaction data.",
        transactionData: transactionData
      });
    }

    if (!rider || !ethers.isAddress(rider)) {
      return res.status(400).json({
        message: "Invalid rider address",
        rider: rider
      });
    }

    console.log(`[Pretium Payment Details] Amount KES: ${amountKES}`);
    console.log(`[Pretium Payment Details] Amount USDC: ${amountUSDC}`);
    console.log(`[Pretium Payment Details] TX Hash: ${txHash}`);

    // Convert USDC amount to wei (6 decimals)
    const premiumWei = ethers.parseUnits(amountUSDC.toString(), 6);
    console.log(`[Pretium Payment] Premium in wei: ${premiumWei.toString()}`);

    // Normalize network to lowercase
    const normalizedChain = (blockchainNetwork || BlockchainNetwork.BASE).toString().toLowerCase();
    console.log(`[Policy Completion] Normalized chain: ${normalizedChain}`);

    // Retrieve chain config
    const config = getChainConfig(normalizedChain);
    if (!config || !('rpc' in config)) {
      return res.status(500).json({
        message: `Invalid chain configuration for '${normalizedChain}'.`,
        availableChains: Object.values(BlockchainNetwork)
      });
    }

    const chainConfig = config as { caip2: string; chainId: number; rpc: string | undefined };
    const rpcUrl = chainConfig.rpc;

    if (!rpcUrl) {
      return res.status(500).json({
        message: `RPC URL not configured for chain '${normalizedChain}'.`,
        envVar:
          process.env.DEPLOY_MAINNET === 'true'
            ? `${normalizedChain.toUpperCase()}_MAINNET_RPC`
            : `${normalizedChain.toUpperCase()}_TESTNET_RPC`
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

    const paymasterWallet = new ethers.Wallet(paymasterPrivateKey, provider);

    console.log(`[Paymaster] Address: ${paymasterWallet.address}`);
    console.log(`[Paymaster] Token: ${token}`);
    console.log(`[Paymaster] Premium: ${ethers.formatUnits(premiumWei, 6)} USDC`);
    console.log(`[Paymaster] Rider (beneficiary): ${rider}`);

    // Step 2: Verify paymaster has sufficient token balance
    let paymasterTokenBalance: bigint;
    try {
      const tokenContract = new ethers.Contract(token, [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
      ], provider);

      paymasterTokenBalance = await tokenContract.balanceOf(paymasterWallet.address) as bigint;
      const decimals = await tokenContract.decimals() as number;
      const symbol = await tokenContract.symbol() as string;

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
          note: "Pretium should have sent USDC to paymaster. Please verify Pretium transaction completed successfully."
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
    let approvalTx: string | undefined;
    try {
      const ERC20 = new ethers.Contract(token, [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
      ], paymasterWallet);

      const currentAllowance = await ERC20.allowance(paymasterWallet.address, escrowAddress) as bigint;
      console.log(`[Paymaster] Current allowance: ${ethers.formatUnits(currentAllowance, 6)}`);

      if (currentAllowance < premiumWei) {
        console.log(`[Paymaster] Approving ${ethers.formatUnits(premiumWei, 6)} tokens for escrow...`);
        const approveTxResponse = await ERC20.approve(escrowAddress, premiumWei);
        const approveReceipt = await approveTxResponse.wait();
        approvalTx = approveReceipt?.hash;
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
    let policyTx: string;
    let receipt: any;
    let onChainPolicyId: string;
    try {
      const escrowContract = new ethers.Contract(escrowAddress, HimaEscrowABI, paymasterWallet);

      console.log(`[Paymaster] Creating policy on blockchain escrow...`);

      const gasEstimate = await escrowContract.createPolicy.estimateGas(token, premiumWei, rider) as bigint;
      console.log(`[Paymaster] Estimated gas: ${gasEstimate.toString()}`);

      const tx = await escrowContract.createPolicy(token, premiumWei, rider, {
        gasLimit: gasEstimate * 120n / 100n
      });

      console.log(`[Paymaster] Transaction sent: ${tx.hash}`);
      receipt = await tx.wait();
      policyTx = receipt.hash;
      console.log(`[Paymaster] Transaction confirmed in block: ${receipt.blockNumber}`);

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

      if (err.reason) errorDetails.reason = err.reason;
      if (err.data) errorDetails.data = err.data;

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
      // Update order escrow details with proper typing
      const updatedEscrowDetails: OrderEscrowDetails = {
        ...policy.orderEscrowDetails,
        ...confirmedTransaction,
        completedAt: new Date()
      };

      policy.policyId = onChainPolicyId;
      policy.chainTx = policyTx;
      policy.orderEscrowStatus = transactionData.status;
      policy.orderEscrowDetails = updatedEscrowDetails;
      policy.status = 'active';
      policy.isActive = true;

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
        transactionId: transactionData.transaction_id || transactionId,
        status: transactionData.status,
        amountKES: amountKES,
        amountUSDC: amountUSDC,
        provider: 'pretium'
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
 * Pretium Webhook/Callback Handler
 * POST /api/v1/insurance/policies/pretium-callback
 */
export const handlePretiumCallback = async (req: Request, res: Response) => {
  try {
    console.log('[Pretium Callback] Received webhook:', req.body);
    const { policyNumber } = req.query;
    const callbackData = req.body;

    if (!policyNumber) {
      console.error('[Pretium Callback] Missing policyNumber in query');
      return res.status(400).json({ message: "Missing policyNumber" });
    }

    // Find policy by policy number
    const policy = await BodaInsurancePolicy.findOne({ policyNumber: policyNumber as string });
    if (!policy) {
      console.error(`[Pretium Callback] Policy not found: ${policyNumber}`);
      return res.status(404).json({ message: "Policy not found" });
    }

    // Update policy with callback data with proper typing
    const updatedEscrowDetails: OrderEscrowDetails = {
      ...(policy.orderEscrowDetails || {}),
      callback: callbackData,
      callbackReceivedAt: new Date()
    };

    policy.orderEscrowDetails = updatedEscrowDetails;

    const status = callbackData.status || callbackData.data?.status;
    if (status) {
      policy.orderEscrowStatus = status;
    }

    await policy.save();

    console.log(`[Pretium Callback] Updated policy ${policyNumber} with status: ${status}`);

    res.status(200).json({
      message: "Callback received and processed",
      policyNumber: policyNumber
    });
  } catch (error: any) {
    console.error('[Pretium Callback] Error:', error);
    res.status(500).json({
      message: "Failed to process callback",
      error: error.message
    });
  }
};

export const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { transactionId, currencyCode = "KES" } = req.params;

    if (!transactionId) {
      return res.status(400).json({ message: "Missing transactionId" });
    }

    console.log(`[Pretium Payment Check] Checking status for: ${transactionId} (${currencyCode})`);

    try {
      const response = await axios.post(
        `${PRETIUM_API_URL}/v1/status/${currencyCode}`,
        { transaction_code: transactionId },
        {
          headers: {
            "x-api-key": PRETIUM_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      console.log(`[Pretium Payment Check] Success!`, response.data);

      // Extract key fields for clarity
      const data = response.data.data;
      const transactionStatus = data?.status || "UNKNOWN";

      return res.status(200).json({
        message: "Payment status retrieved successfully",
        transactionId: transactionId,
        status: transactionStatus,
        details: data
      });
    } catch (err: any) {
      console.error(`[Pretium Payment Check] API Error:`, err.response?.data || err.message);
      return res.status(err.response?.status || 400).json({
        message: "Failed to retrieve transaction status from Pretium",
        transactionId: transactionId,
        error: err.response?.data || err.message
      });
    }
  } catch (error: any) {
    console.error("[Pretium Payment Check] Internal Error:", error);
    return res.status(500).json({
      message: "Internal server error while checking payment status",
      error: error.message || error
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

/**
 * Get Pretium exchange rate for quote calculation
 * GET /api/v1/insurance/policies/exchange-rate
 */
export const getExchangeRate = async (req: Request, res: Response) => {
  try {
    const rates = await getPretiumExchangeRate();

    res.status(200).json({
      message: "Exchange rates retrieved successfully",
      currency: "KES",
      rates: {
        buying_rate: rates.buying_rate,
        selling_rate: rates.selling_rate,
        quoted_rate: rates.quoted_rate
      },
      note: "Use buying_rate to calculate USDC equivalent when user pays KES"
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch exchange rates",
      error: error.message
    });
  }
};