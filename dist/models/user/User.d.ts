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
    onboardingSteps: {
        [key: string]: boolean;
    };
    onboardingCompleted: boolean;
    rewards: {
        type: Schema.Types.ObjectId;
        ref: 'Reward';
    }[];
    coverageLevel?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const OnboardingStepKeys: string[];
declare const _default: mongoose.Model<IUser, {}, {}, {}, mongoose.Document<unknown, {}, IUser, {}, {}> & IUser & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=User.d.ts.map