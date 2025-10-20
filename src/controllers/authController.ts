import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { createPublicClient, http, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";
import dotenv from 'dotenv';
import { PrivyClient } from "@privy-io/node";

import OTP from '../models/user/OTP.js';
import { generateJWT } from '../utils/jwtUtil';
import { sendOTP } from '../utils/smsUtil.js';
import User, { OnboardingStepKeys } from '../models/user/User.js';
import type { IUser } from '../models/user/User.js';
import { createPrivyWallet, createPolkadotWallet, createSmartWallet } from '../utils/privyUtil.js';
import { deployWalletOnNetworks } from '../utils/blockchainDeploy.js';
import { BlockchainNetwork, getChainConfig } from '../configs/blockchain.js';
import { sendTransactionWithGasSponsorship, fundMerchantWallet } from '../utils/paymasterutil.js';

dotenv.config();

type CountryMeta = {
  name: string;
  code: string;
  regex: RegExp;
  localLength: number;
  e164Length: number;
};

const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!
});

const COUNTRY_METADATA: CountryMeta[] = [
  { name: "Kenya", code: "254", regex: /^(\+?254|0|254)?([17]\d{8})$/, localLength: 10, e164Length: 13 },
  { name: "Nigeria", code: "234", regex: /^(\+?234|0|234)?([789]\d{9})$/, localLength: 11, e164Length: 14 },
  { name: "Tanzania", code: "255", regex: /^(\+?255|0|255)?([67]\d{8})$/, localLength: 9, e164Length: 12 },
  { name: "Uganda", code: "256", regex: /^(\+?256|0|256)?([7]\d{8})$/, localLength: 10, e164Length: 13 },
  { name: "Rwanda", code: "250", regex: /^(\+?250|0|250)?([7]\d{8})$/, localLength: 10, e164Length: 13 },
  { name: "United States", code: "1", regex: /^(\+?1)?(\d{10})$/, localLength: 10, e164Length: 12 },
  { name: "United Kingdom", code: "44", regex: /^(\+?44|0|44)?(7\d{9})$/, localLength: 11, e164Length: 13 }
];

function getCountryLeadingZeroLength(code: string): number {
  switch (code) {
    case "KE": return 10; // 07XXXXXXXX or 01XXXXXXXXX
    case "NG": return 11; // 08012345678 (11 for Nigeria mobile)
    case "TZ": return 9;  // 07XXXXXXX, 06XXXXXXX, 08XXXXXXX
    case "UG": return 10; // 07XXXXXXXX
    case "RW": return 10; // 07XXXXXXXX
    case "US": return 10; // 1234567890, (area code + 7)
    case "GB": return 11; // 07XXXXXXXXX
    default: return 0;
  }
}

function normalizePhone(input: string): { phone: string; country: string } {
  if (!input || typeof input !== 'string')
    throw new Error('Phone number must be a non-empty string.');

  // Remove all non-digit or plus, preserve + for country detection
  let raw = input.trim().replace(/[\s\-()]/g, '');

  for (const meta of COUNTRY_METADATA) {
    // Try multiple patterns for country match
    // Priority: E.164 (+code...), national (code...), local (0...)
    let match = raw.match(meta.regex);

    if (match) {
      let numberBody = match[2]; // local part
      // Always normalize as '+code' + numberBody
      let normalized = "+" + meta.code + numberBody;

      // Verify correct E.164 length (country code plus number body)
      if (normalized.length === meta.e164Length) {
        return { phone: normalized, country: meta.name };
      }
    }
  }

  throw new Error(
    `Unable to normalize or detect country for phone: ${input}. Supported: Kenya, Nigeria, Tanzania, Uganda, Rwanda, United States, United Kingdom.`
  );
}



/**
 * Build user operation for EVM chains (BASE)
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

      const publicClient = createPublicClient({
        chain: chain === BlockchainNetwork.BASE ? baseSepolia : baseSepolia,
        transport: http(rpcUrl)
      }) as any;

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

function setOnboardingStep(user: any, key: string, value: boolean) {
  if (
    user.onboardingSteps instanceof Map ||
    (typeof user.onboardingSteps?.set === 'function')
  ) {
    user.onboardingSteps.set(key, value);
  } else {
    user.onboardingSteps[key] = value;
  }
}

function getOnboardingStep(user: any, key: string): boolean {
  if (
    user.onboardingSteps instanceof Map ||
    (typeof user.onboardingSteps?.get === 'function')
  ) {
    return user.onboardingSteps.get(key);
  } else {
    return user.onboardingSteps[key];
  }
}

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    let { phone: formattedPhone, country } = normalizePhone(phone)

    const privyWallet = await createPrivyWallet(formattedPhone);
    if (!privyWallet || typeof privyWallet.walletId !== 'string' || !privyWallet.walletId) {
      return res.status(500).json({ message: 'Failed to create Privy wallet. Try again.' });
    }

    const { address: walletAddress, walletId } = privyWallet;

    const { address: polkadotAddress, mnemonic } = await createPolkadotWallet();

    let smartWalletAddress: string = '';
    try {
      console.log('[Register] Creating smart wallet for user...');
      smartWalletAddress = await createSmartWallet(walletId, walletAddress);
    } catch (error) {
      console.warn('[Register] Smart wallet creation failed, will retry on OTP verification:', error);
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

    res.status(200).json({
      message: 'OTP sent to phone',
      smsResponse
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP', error: error instanceof Error ? error.message : error });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { phone, otp, blockchainNetworks } = req.body;
    if (!phone || !otp || !Array.isArray(blockchainNetworks) || blockchainNetworks.length === 0) {
      return res.status(400).json({ message: 'Phone, OTP, and blockchainNetworks are required' });
    }

    let normalizedPhone: string;
    let country: string;
    try {
      const result = normalizePhone(phone);
      normalizedPhone = result.phone;
      country = result.country;
      console.log('[verifyOTP] Normalized phone:', normalizedPhone);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid phone format';
      console.error('[verifyOTP] Phone normalization failed:', errorMessage);
      return res.status(400).json({
        message: 'Invalid phone number format',
        details: errorMessage,
        receivedPhone: phone
      });
    }

    const otpDoc = await OTP.findOne({ phone: normalizedPhone, otp, verified: false }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'Invalid code' });
    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });

    otpDoc.verified = true;
    await otpDoc.save();


    const user = await User.findOne({ phone: normalizedPhone });
    const token = generateJWT({ userId: user?._id, phone: user?.phone });

    if (!user) return res.status(404).json({ message: 'User not found' });

    user.phoneVerified = true;
    user.onboardingSteps['phoneVerified'] = true;
    user.onboardingSteps['mobileMoneyLinked'] = true;

    if (!user.smartWalletAddress) {
      try {
        console.log('[OTP Verification] Creating smart wallet...');
        user.smartWalletAddress = await createSmartWallet(user.walletId, user.walletAddress);
        console.log('[OTP Verification] Smart wallet created:', user.smartWalletAddress);
      } catch (error) {
        console.error('[OTP Verification] Failed to create smart wallet:', error);
      }
    }

    await user.save();

    const boundBuildUserOp = createBoundBuildUserOp();
    const boundSendSponsoredOp = await createBoundSendSponsoredOp(user.walletId, user.walletAddress);

    console.log(`[Deployment] Deploying to chains: ${blockchainNetworks.join(', ')}`);

    const deployResults = await deployWalletOnNetworks(
      user.walletId,
      user.walletAddress,
      user.polkadotMnemonic,
      blockchainNetworks as BlockchainNetwork[],
      boundBuildUserOp,
      boundSendSponsoredOp
    );

    const successCount = Object.values(deployResults).filter(
      (r) => typeof r === 'string' && !r.startsWith('Error')
    ).length;
    const failureCount = blockchainNetworks.length - successCount;

    res.status(200).json({
      message: 'OTP verified, phone number confirmed',
      token,
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

export const onboard = async (req: Request, res: Response) => {
  try {
    const {
      phone,
      name,
      photoUrl,
      nationalId,
      bodaRegNo,
      mobileMoneyNumber,
      coverageLevel
    } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone is required.' });
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let anyFieldProvided = false;

    if (phone) {
      user.phone = phone;
      setOnboardingStep(user, 'phoneVerified', true);
      anyFieldProvided = true;
    }
    if (name) {
      user.name = name;
      setOnboardingStep(user, 'nameAdded', true);
      anyFieldProvided = true;
    }
    if (photoUrl) {
      user.photoUrl = photoUrl;
      setOnboardingStep(user, 'photoAdded', true);
      anyFieldProvided = true;
    }
    if (nationalId) {
      user.nationalId = nationalId;
      setOnboardingStep(user, 'nationalIdAdded', true);
      anyFieldProvided = true;
    }
    if (bodaRegNo) {
      user.bodaRegNo = bodaRegNo;
      setOnboardingStep(user, 'bodaRegNoAdded', true);
      anyFieldProvided = true;
    }
    if (mobileMoneyNumber) {
      user.mobileMoneyNumber = mobileMoneyNumber;
      setOnboardingStep(user, 'mobileMoneyLinked', true);
      anyFieldProvided = true;
    }
    if (coverageLevel) {
      user.coverageLevel = coverageLevel;
      anyFieldProvided = true;
    }

    const completedSteps = OnboardingStepKeys.filter((key) =>
      getOnboardingStep(user, key) === true
    );
    user.onboardingStage = Math.min(completedSteps.length + 1, OnboardingStepKeys.length);

    if (anyFieldProvided) {
      user.onboardingCompleted = true;
    }

    await user.save();

    res.status(200).json({
      message: 'User onboarding fields updated.',
      onboardingStage: user.onboardingStage,
      onboardingCompleted: user.onboardingCompleted,
      onboardingSteps: user.onboardingSteps,
      user: {
        phone: user.phone,
        name: user.name,
        photoUrl: user.photoUrl,
        nationalId: user.nationalId,
        bodaRegNo: user.bodaRegNo,
        mobileMoneyNumber: user.mobileMoneyNumber,
        coverageLevel: user.coverageLevel
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Onboard failed',
      error: (error instanceof Error ? error.message : error)
    });
  }
};

export const loginRequestOTP = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone is required.' });

    let normalizedPhone: string;
    let country: string;
    try {
      const result = normalizePhone(phone);
      normalizedPhone = result.phone;
      country = result.country;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid phone format';
      return res.status(400).json({
        message: 'Invalid phone number format',
        details: errorMessage,
        receivedPhone: phone
      });
    }

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      return res.status(404).json({ message: 'User not found, please register first.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    console.log(otp)

    await OTP.deleteMany({ phone: normalizedPhone, verified: false });
    await OTP.create({ phone: normalizedPhone, otp, expiresAt });

    await sendOTP(normalizedPhone, otp);

    res.status(200).json({
      message: `OTP sent to ${normalizedPhone}`,
      country
    });
  } catch (error) {
    res.status(500).json({
      message: 'Login failed',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const loginVerifyOTP = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP required.' });

    let normalizedPhone: string;
    let country: string;
    try {
      const result = normalizePhone(phone);
      normalizedPhone = result.phone;
      country = result.country;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid phone format';
      return res.status(400).json({
        message: 'Invalid phone number format',
        details: errorMessage,
        receivedPhone: phone
      });
    }

    const otpDoc = await OTP.findOne({ phone: normalizedPhone, otp, verified: false }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'Invalid or expired OTP.' });
    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired.' });

    otpDoc.verified = true;
    await otpDoc.save();

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Now issue JWT
    const token = generateJWT({ userId: user._id, phone: user.phone });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        walletAddress: user.walletAddress,
        smartWalletAddress: user.smartWalletAddress,
        onboardingSteps: user.onboardingSteps
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'OTP verification failed',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { phone, id } = req.query;

    let user;
    if (phone) {
      user = await User.findOne({ phone });
    } else if (id) {
      user = await User.findById(id);
    } else {
      return res.status(400).json({ message: 'Phone or id query parameter required.' });
    }

    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.status(200).json({
      user: {
        _id: user._id,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        walletAddress: user.walletAddress,
        walletId: user.walletId,
        smartWalletAddress: user.smartWalletAddress,
        polkadotAddress: user.polkadotAddress,
        polkadotMnemonic: user.polkadotMnemonic,
        name: user.name,
        photoUrl: user.photoUrl,
        nationalId: user.nationalId,
        bodaRegNo: user.bodaRegNo,
        mobileMoneyNumber: user.mobileMoneyNumber,
        onboardingStage: user.onboardingStage,
        onboardingSteps: user.onboardingSteps,
        onboardingCompleted: user.onboardingCompleted,
        coverageLevel: user.coverageLevel,
        rewards: user.rewards,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Get user failed', error: (error instanceof Error ? error.message : error) });
  }
};