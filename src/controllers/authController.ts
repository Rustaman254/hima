import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

import OTP from '../models/user/OTP';
import { sendOTP } from '../utils/smsUtil';
import User from '../models/user/User';
import type { IUser } from '../models/user/User';
import { createPrivyWallet, createPolkadotWallet } from '../utils/privyUtil';
import { deployWalletOnNetwork } from '../utils/blockchainDeploy';
import { BlockchainNetwork } from '../configs/blockchain';

dotenv.config();

export const OnboardingStepKeys = [
  'phoneVerified', 'nameAdded', 'photoAdded', 'mobileMoneyLinked',
  'nationalIdAdded', 'bodaRegNoAdded', 'communityEndorsements'
];

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

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({ message: 'User already registered' });
    }

    const privyWallet = await createPrivyWallet(phone);
    const { address: polkadotAddress, mnemonic } = await createPolkadotWallet();

    if (!privyWallet || typeof privyWallet.walletId !== 'string' || !privyWallet.walletId) {
      return res.status(500).json({ message: 'Failed to create Privy wallet. Try again.' });
    }
    const { address: walletAddress, walletId } = privyWallet;
    const onboardingSteps = OnboardingStepKeys.reduce(
      (obj, key) => ({ ...obj, [key]: false }),
      {} as Record<string, boolean>
    );

    const user: IUser = new User({
      phone,
      walletAddress,
      polkadotAddress,
      polkadotMnemonic: mnemonic,
      walletId,
      phoneVerified: false,
      onboardingStage: 1,
      onboardingSteps,
      onboardingCompleted: false
    });

    await user.save();

    const userObj = user.toObject();

    res.status(201).json({
      message: `User with phone ${phone} registered successfully`,
      user: {
        phone: userObj.phone,
        walletAddress: userObj.walletAddress,
        polkadotAddress: userObj.polkadotAddress,
        walletId: userObj.walletId,
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

    console.log(otp);

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

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { phone, otp, blockchainNetwork } = req.body;

    if (!phone || !otp || !blockchainNetwork) {
      return res.status(400).json({ message: 'Phone, OTP, and blockchainNetwork required' });
    }

    // Find and verify OTP
    const otpDoc = await OTP.findOne({ phone, otp, verified: false }).sort({ createdAt: -1 });
    if (!otpDoc) return res.status(400).json({ message: 'Invalid code' });
    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired' });
    otpDoc.verified = true;
    await otpDoc.save();

    // Find user
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update onboarding steps
    user.phoneVerified = true;
    user.onboardingSteps['phoneVerified'] = true;
    user.onboardingSteps['mobileMoneyLinked'] = true;
    await user.save();

    // Deploy wallet on selected blockchain
    let txHash: string | undefined = undefined;
    try {
      txHash = await deployWalletOnNetwork(
        user.walletId,
        user.walletAddress,
        blockchainNetwork as BlockchainNetwork
      );
    } catch (onchainError) {
      // Do not block onboarding on onchain failure, but log it for admins
      console.error('Onchain wallet activation error:', onchainError);
    }

    // Respond
    res.status(200).json({
      message: 'OTP verified, phone number confirmed',
      txHash,
      user: {
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        onboardingSteps: user.onboardingSteps
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Verification failed', error: error instanceof Error ? error.message : error });
  }
};
