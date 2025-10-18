import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { createPublicClient, http, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";
import dotenv from 'dotenv';

import OTP from '../models/user/OTP';
import { sendOTP } from '../utils/smsUtil';
import User from '../models/user/User';
import type { IUser } from '../models/user/User';
import { createPrivyWallet, createPolkadotWallet, createSmartWallet } from '../utils/privyUtil';
import { deployWalletOnNetworks } from '../utils/blockchainDeploy';
import { BlockchainNetwork, getChainConfig } from '../configs/blockchain';
import { sendTransactionWithGasSponsorship, fundMerchantWallet } from '../utils/paymasterutil';
import { PrivyClient } from "@privy-io/node";

dotenv.config();

// Initialize Privy client
const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!
});

export const OnboardingStepKeys = [
  'phoneVerified', 'nameAdded', 'photoAdded', 'mobileMoneyLinked',
  'nationalIdAdded', 'bodaRegNoAdded', 'communityEndorsements'
];

function normalizeKenyanPhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('07') && normalized.length === 10) return '+254' + normalized.slice(1);
  if (normalized.startsWith('7') && normalized.length === 9) return '+254' + normalized;
  if (normalized.startsWith('254') && normalized.length === 12) return '+' + normalized;
  if (normalized.startsWith('01') && normalized.length === 10) return '+254' + normalized.slice(1);
  if (normalized.startsWith('+254') && normalized.length === 13) return normalized;
  throw new Error('Invalid Kenyan phone number');
}

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    let formattedPhone = phone;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    if (!phone.match(/^(\+254|254|0|07)\d{9}$/)) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }
    if (phone.startsWith('7') && phone.length === 9) {
      formattedPhone = '254' + phone;
    } else if (phone.startsWith('07') && phone.length === 10) {
      formattedPhone = '+254' + phone.slice(1);
    } else if (phone.startsWith('+254') && phone.length === 13) {
      formattedPhone = phone
    } else if (phone.startsWith('254') && phone.length === 12) {
      formattedPhone = '+254' + phone.slice(1);
    } else {
      return res.status(400).json({ message: 'Phone number must be in +254, 254, 07, or 7 format followed by 9 digits' });
    }

    const existingUser = await User.findOne({ phone: formattedPhone });
    if (existingUser) {
      return res.status(409).json({ message: 'User already registered' });
    }

    // Create Privy EVM wallet
    const privyWallet = await createPrivyWallet(formattedPhone);
    if (!privyWallet || typeof privyWallet.walletId !== 'string' || !privyWallet.walletId) {
      return res.status(500).json({ message: 'Failed to create Privy wallet. Try again.' });
    }

    const { address: walletAddress, walletId } = privyWallet;

    // Create Polkadot wallet
    const { address: polkadotAddress, mnemonic } = await createPolkadotWallet();

    // Create permissionless smart wallet
    let smartWalletAddress: string = '';
    try {
      console.log('[Register] Creating smart wallet for user...');
      smartWalletAddress = await createSmartWallet(walletId, walletAddress);
    } catch (error) {
      console.warn('[Register] Smart wallet creation failed, will retry on OTP verification:', error);
      // Continue with registration - smart wallet will be created on OTP verification
    }

    const onboardingSteps = OnboardingStepKeys.reduce(
      (obj, key) => ({ ...obj, [key]: false }),
      {} as Record<string, boolean>
    );

    const user: IUser = new User({
      phone: formattedPhone,
      walletAddress,
      polkadotAddress,
      polkadotMnemonic: mnemonic,
      walletId,
      smartWalletAddress: smartWalletAddress || undefined,
      phoneVerified: false,
      onboardingStage: 1,
      onboardingSteps,
      onboardingCompleted: false
    });

    await user.save();

    const userObj = user.toObject();

    res.status(201).json({
      message: `User with phone ${formattedPhone} registered successfully`,
      user: {
        phone: userObj.phone,
        walletAddress: userObj.walletAddress,
        polkadotAddress: userObj.polkadotAddress,
        walletId: userObj.walletId,
        smartWalletAddress: userObj.smartWalletAddress,
        onboardingStage: userObj.onboardingStage,
        onboardingSteps: userObj.onboardingSteps
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: (error instanceof Error ? error.message : error)
    });
  }
};

export const sendOTPToPhone = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTP.deleteMany({ phone, verified: false });

    await OTP.create({ phone, otp, expiresAt });

    console.log(otp, phone);

    const smsResponse = await sendOTP(phone, otp);
    console.log(smsResponse);

    res.status(200).json({
      message: 'OTP sent to phone',
      smsResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP', error: error instanceof Error ? error.message : error });
  }
};

/**
 * Build user operation for EVM chains (BASE, CELO)
 */
async function buildUserOp(walletAddress: string, chain: BlockchainNetwork): Promise<any> {
  const config = getChainConfig(chain);
  if (!config || !('rpc' in config)) {
    throw new Error(`No RPC URL for chain ${chain}`);
  }

  const rpcUrl = config.rpc;
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for chain ${chain}`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Simple transfer operation for wallet initialization
  const gasEstimate = await provider.estimateGas({
    to: walletAddress,
    from: walletAddress,
    value: "0"
  });

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || BigInt(1000000000);

  return {
    to: walletAddress,
    data: "0x",
    value: "0",
    gasPrice: gasPrice.toString(),
    gasLimit: gasEstimate.toString()
  };
}

/**
 * Create bound sponsorship function with user context using paymasterUtil
 */
async function createBoundSendSponsoredOp(privyWalletId: string, evmAddress: string) {
  return async (userOp: any, chain: BlockchainNetwork): Promise<string> => {
    try {
      const config = getChainConfig(chain);
      if (!config || !('rpc' in config)) {
        throw new Error(`No RPC URL for chain ${chain}`);
      }

      const rpcUrl = config.rpc;
      if (!rpcUrl) {
        throw new Error(`RPC URL not configured for chain ${chain}`);
      }

      // Create public client for the specific chain
      const publicClient = createPublicClient({
        chain: chain === BlockchainNetwork.BASE ? baseSepolia : baseSepolia, // adjust as needed
        transport: http(rpcUrl)
      });

      // Send transaction with gas sponsorship from funder wallet
      const result = await sendTransactionWithGasSponsorship(
        userOp,
        publicClient,
        privy,
        privyWalletId,
        evmAddress
      );

      if (!result?.hash && !result?.userOpHash) {
        throw new Error('No transaction hash returned from sponsored operation');
      }

      console.log(`[Deployment] ${chain} tx: ${result.hash || result.userOpHash}`);
      return result.hash || result.userOpHash;
    } catch (error) {
      console.error(`[Deployment] Error sending sponsored op on ${chain}:`, error);
      throw error;
    }
  };
}

/**
 * Create bound build user operation function
 */
function createBoundBuildUserOp() {
  return async (walletAddress: string, chain: BlockchainNetwork) => {
    return buildUserOp(walletAddress, chain);
  };
}

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { phone, otp, blockchainNetworks } = req.body;
    if (!phone || !otp || !Array.isArray(blockchainNetworks) || blockchainNetworks.length === 0) {
      return res.status(400).json({ message: 'Phone, OTP, and blockchainNetworks are required' });
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeKenyanPhone(phone);
    } catch {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    const otpDoc = await OTP.findOne({ phone: normalizedPhone, otp, verified: false }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'Invalid code' });
    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });

    otpDoc.verified = true;
    await otpDoc.save();

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.phoneVerified = true;
    user.onboardingSteps['phoneVerified'] = true;
    user.onboardingSteps['mobileMoneyLinked'] = true;

    // Create smart wallet if not already created
    if (!user.smartWalletAddress) {
      try {
        console.log('[OTP Verification] Creating smart wallet...');
        user.smartWalletAddress = await createSmartWallet(user.walletId, user.walletAddress);
        console.log('[OTP Verification] Smart wallet created:', user.smartWalletAddress);
      } catch (error) {
        console.error('[OTP Verification] Failed to create smart wallet:', error);
        // Continue with deployment even if smart wallet creation fails
      }
    }

    await user.save();

    // Create bound functions with user context
    const boundBuildUserOp = createBoundBuildUserOp();
    const boundSendSponsoredOp = await createBoundSendSponsoredOp(user.walletId, user.walletAddress);

    console.log(`[Deployment] Deploying to chains: ${blockchainNetworks.join(', ')}`);

    // Deploy wallet to requested chains
    const deployResults = await deployWalletOnNetworks(
      user.walletId,
      user.walletAddress,
      user.polkadotMnemonic,
      blockchainNetworks as BlockchainNetwork[],
      boundBuildUserOp,
      boundSendSponsoredOp
    );

    // Count successes and failures
    const successCount = Object.values(deployResults).filter(
      (r) => typeof r === 'string' && !r.startsWith('Error')
    ).length;
    const failureCount = blockchainNetworks.length - successCount;

    res.status(200).json({
      message: 'OTP verified, phone number confirmed',
      deploymentSummary: {
        totalChains: blockchainNetworks.length,
        successful: successCount,
        failed: failureCount
      },
      deployResults,
      user: {
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        walletAddress: user.walletAddress,
        smartWalletAddress: user.smartWalletAddress,
        onboardingSteps: user.onboardingSteps
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Verification failed', error: error instanceof Error ? error.message : error });
  }
};