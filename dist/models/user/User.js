"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingStepKeys = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.OnboardingStepKeys = [
    'phoneVerified', 'nameAdded', 'photoAdded', 'mobileMoneyLinked',
    'nationalIdAdded', 'bodaRegNoAdded', 'communityEndorsements'
];
const UserSchema = new mongoose_1.Schema({
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
        default: () => exports.OnboardingStepKeys.reduce((obj, k) => ({ ...obj, [k]: false }), {})
    },
    onboardingCompleted: { type: Boolean, default: false },
    rewards: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Reward' }],
    coverageLevel: { type: String, default: 'basic' }
}, { timestamps: true });
exports.default = mongoose_1.default.model('User', UserSchema);
//# sourceMappingURL=User.js.map