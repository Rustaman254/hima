import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  phone: string;
  phoneVerified: boolean;
  walletAddress: string;
  walletId: string;
  smartWalletAddress: string;
  polkadotAddress: string;
  polkadotMnemonic: string;
  name?: string;
  photoUrl?: string;
  nationalId?: string;
  bodaRegNo?: string;
  mobileMoneyNumber?: string;
  onboardingStage: number; 
  onboardingSteps: { [key: string]: boolean }; 
  onboardingCompleted: boolean;
  rewards: { type: Schema.Types.ObjectId, ref: 'Reward' }[];
  coverageLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const OnboardingStepKeys = [
  'phoneVerified', 'nameAdded', 'photoAdded', 'mobileMoneyLinked',
  'nationalIdAdded', 'bodaRegNoAdded', 'communityEndorsements'
];

const UserSchema: Schema = new Schema({
  phone: { type: String, required: true, unique: true, index: true },
  phoneVerified: { type: Boolean, default: false },
  name: { type: String },
  photoUrl: { type: String },
  nationalId: { type: String },
  walletAddress: { type: String, unique: true },
  walletId: { type: String, unique: true, required: true },
  smartWalletAddress: { type: String, unique: true },
  polkadotAddress: { type: String, unique: true },
  polkadotMnemonic: { type: String, required: true },
  bodaRegNo: { type: String },
  mobileMoneyNumber: { type: String },
  onboardingStage: { type: Number, default: 1 },
  onboardingSteps: {
    type: Map,
    of: Boolean,
    default: () => OnboardingStepKeys.reduce((obj, k) => ({ ...obj, [k]: false }), {})
  },
  onboardingCompleted: { type: Boolean, default: false },
  rewards: [{ type: Schema.Types.ObjectId, ref: 'Reward' }],
  coverageLevel: { type: String, default: 'basic' }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
