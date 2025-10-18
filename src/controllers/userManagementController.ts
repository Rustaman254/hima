import type { Request, Response } from 'express';
import User, { OnboardingStepKeys } from '../models/user/User';

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return res.status(400).json({ message: 'Phone parameter is required.' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

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
    res.status(500).json({
      message: 'Get user failed',
      error: error instanceof Error ? error.message : error
    });
  }
};

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

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return res.status(400).json({ message: 'Phone parameter is required.' });
    }

    const {
      name,
      photoUrl,
      nationalId,
      bodaRegNo,
      mobileMoneyNumber,
      coverageLevel,
      onboardingSteps: incomingSteps,
      onboardingStage,
      onboardingCompleted
    } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (name !== undefined) user.name = name;
    if (photoUrl !== undefined) user.photoUrl = photoUrl;
    if (nationalId !== undefined) user.nationalId = nationalId;
    if (bodaRegNo !== undefined) user.bodaRegNo = bodaRegNo;
    if (mobileMoneyNumber !== undefined) user.mobileMoneyNumber = mobileMoneyNumber;
    if (coverageLevel !== undefined) user.coverageLevel = coverageLevel;

    if (typeof incomingSteps === 'object' && incomingSteps !== null) {
      for (const key of Object.keys(incomingSteps)) {
        if (OnboardingStepKeys.includes(key)) {
          setOnboardingStep(user, key, Boolean(incomingSteps[key]));
        }
      }
    }
    if (onboardingStage !== undefined) user.onboardingStage = onboardingStage;
    if (onboardingCompleted !== undefined) user.onboardingCompleted = onboardingCompleted;

    user.updatedAt = new Date();

    await user.save();

    res.status(200).json({
      message: 'User profile updated.',
      user: {
        _id: user._id,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        walletAddress: user.walletAddress,
        walletId: user.walletId,
        smartWalletAddress: user.smartWalletAddress,
        polkadotAddress: user.polkadotAddress,
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
    res.status(500).json({
      message: 'Update user failed',
      error: (error instanceof Error ? error.message : error)
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return res.status(400).json({ message: 'Phone parameter is required.' });
    }

    const user = await User.findOneAndDelete({ phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: `User with phone ${phone} deleted.`,
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Delete user failed',
      error: error instanceof Error ? error.message : error
    });
  }
};