import mongoose, { Schema, Document } from 'mongoose';
export const OnboardingStepKeys = [
    'phoneVerified', 'nameAdded', 'photoAdded', 'mobileMoneyLinked',
    'nationalIdAdded', 'bodaRegNoAdded', 'communityEndorsements'
];
const UserSchema = new Schema({
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
export default mongoose.model('User', UserSchema);
//# sourceMappingURL=User.js.map