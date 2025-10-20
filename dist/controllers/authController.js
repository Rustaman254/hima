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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = exports.onboard = exports.verifyOTP = exports.sendOTPToPhone = exports.registerUser = void 0;
const ethers_1 = require("ethers");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const dotenv_1 = __importDefault(require("dotenv"));
const OTP_1 = __importDefault(require("../models/user/OTP"));
const smsUtil_1 = require("../utils/smsUtil");
const User_1 = __importStar(require("../models/user/User"));
const privyUtil_1 = require("../utils/privyUtil");
const blockchainDeploy_1 = require("../utils/blockchainDeploy");
const blockchain_1 = require("../configs/blockchain");
const paymasterutil_1 = require("../utils/paymasterutil");
const node_1 = require("@privy-io/node");
dotenv_1.default.config();
const privy = new node_1.PrivyClient({
    appId: process.env.PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET
});
function normalizeKenyanPhone(phone) {
    if (!phone || typeof phone !== 'string') {
        throw new Error('Phone must be a non-empty string');
    }
    let normalized = phone.trim().replace(/\D/g, '');
    console.log('[normalizeKenyanPhone] Input:', phone);
    console.log('[normalizeKenyanPhone] After removing non-digits:', normalized);
    if (normalized.startsWith('07') && normalized.length === 10) {
        return '+254' + normalized.slice(1);
    }
    if (normalized.startsWith('7') && normalized.length === 9) {
        return '+254' + normalized;
    }
    if (normalized.startsWith('254') && normalized.length === 12) {
        return '+' + normalized;
    }
    if (normalized.startsWith('1') && normalized.length === 9) {
        return '+254' + normalized;
    }
    if (normalized.startsWith('+254') || (normalized.startsWith('254') && normalized.length === 13)) {
        return normalized.startsWith('+') ? normalized : '+' + normalized;
    }
    throw new Error(`Unable to normalize phone: ${phone}. Expected formats: 07XXXXXXXXX, 7XXXXXXXXX, 254XXXXXXXXXX, +254XXXXXXXXXX, or 01XXXXXXXXX`);
}
const registerUser = async (req, res) => {
    try {
        const { phone } = req.body;
        let formattedPhone = normalizeKenyanPhone(phone);
        const privyWallet = await (0, privyUtil_1.createPrivyWallet)(formattedPhone);
        if (!privyWallet || typeof privyWallet.walletId !== 'string' || !privyWallet.walletId) {
            return res.status(500).json({ message: 'Failed to create Privy wallet. Try again.' });
        }
        const { address: walletAddress, walletId } = privyWallet;
        const { address: polkadotAddress, mnemonic } = await (0, privyUtil_1.createPolkadotWallet)();
        let smartWalletAddress = '';
        try {
            console.log('[Register] Creating smart wallet for user...');
            smartWalletAddress = await (0, privyUtil_1.createSmartWallet)(walletId, walletAddress);
        }
        catch (error) {
            console.warn('[Register] Smart wallet creation failed, will retry on OTP verification:', error);
        }
        const onboardingSteps = User_1.OnboardingStepKeys.reduce((obj, key) => ({ ...obj, [key]: false }), {});
        const user = new User_1.default({
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
    }
    catch (error) {
        res.status(500).json({
            message: 'Server error',
            error: (error instanceof Error ? error.message : error)
        });
    }
};
exports.registerUser = registerUser;
const sendOTPToPhone = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone)
            return res.status(400).json({ message: 'Phone required' });
        const otp = Math.floor(100000 + Math.random() * 900000).toString().padStart(6, '0');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await OTP_1.default.deleteMany({ phone, verified: false });
        await OTP_1.default.create({ phone, otp, expiresAt });
        console.log(otp, phone);
        const smsResponse = await (0, smsUtil_1.sendOTP)(phone, otp);
        res.status(200).json({
            message: 'OTP sent to phone',
            smsResponse
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to send OTP', error: error instanceof Error ? error.message : error });
    }
};
exports.sendOTPToPhone = sendOTPToPhone;
/**
 * Build user operation for EVM chains (BASE)
 */
async function buildUserOp(walletAddress, chain) {
    const config = (0, blockchain_1.getChainConfig)(chain);
    if (!config || !('rpc' in config)) {
        throw new Error(`No RPC URL for chain ${chain}`);
    }
    const rpcUrl = config.rpc;
    if (!rpcUrl) {
        throw new Error(`RPC URL not configured for chain ${chain}`);
    }
    const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
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
async function createBoundSendSponsoredOp(privyWalletId, evmAddress) {
    return async (userOp, chain) => {
        try {
            const config = (0, blockchain_1.getChainConfig)(chain);
            if (!config || !('rpc' in config)) {
                throw new Error(`No RPC URL for chain ${chain}`);
            }
            const rpcUrl = config.rpc;
            if (!rpcUrl) {
                throw new Error(`RPC URL not configured for chain ${chain}`);
            }
            const publicClient = (0, viem_1.createPublicClient)({
                chain: chain === blockchain_1.BlockchainNetwork.BASE ? chains_1.baseSepolia : chains_1.baseSepolia,
                transport: (0, viem_1.http)(rpcUrl)
            });
            // Send transaction with gas sponsorship from funder wallet
            const result = await (0, paymasterutil_1.sendTransactionWithGasSponsorship)(userOp, publicClient, privy, privyWalletId, evmAddress);
            if (!result?.hash && !result?.userOpHash) {
                throw new Error('No transaction hash returned from sponsored operation');
            }
            console.log(`[Deployment] ${chain} tx: ${result.hash || result.userOpHash}`);
            return result.hash || result.userOpHash;
        }
        catch (error) {
            console.error(`[Deployment] Error sending sponsored op on ${chain}:`, error);
            throw error;
        }
    };
}
/**
 * Create bound build user operation function
 */
function createBoundBuildUserOp() {
    return async (walletAddress, chain) => {
        return buildUserOp(walletAddress, chain);
    };
}
const verifyOTP = async (req, res) => {
    try {
        const { phone, otp, blockchainNetworks } = req.body;
        if (!phone || !otp || !Array.isArray(blockchainNetworks) || blockchainNetworks.length === 0) {
            return res.status(400).json({ message: 'Phone, OTP, and blockchainNetworks are required' });
        }
        let normalizedPhone;
        try {
            normalizedPhone = normalizeKenyanPhone(phone);
            console.log('[verifyOTP] Normalized phone:', normalizedPhone);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid phone format';
            console.error('[verifyOTP] Phone normalization failed:', errorMessage);
            return res.status(400).json({
                message: 'Invalid phone number format',
                details: errorMessage,
                receivedPhone: phone
            });
        }
        const otpDoc = await OTP_1.default.findOne({ phone: normalizedPhone, otp, verified: false }).sort({ createdAt: -1 });
        if (!otpDoc)
            return res.status(400).json({ message: 'Invalid code' });
        if (otpDoc.expiresAt < new Date())
            return res.status(400).json({ message: 'OTP expired' });
        otpDoc.verified = true;
        await otpDoc.save();
        const user = await User_1.default.findOne({ phone: normalizedPhone });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        user.phoneVerified = true;
        user.onboardingSteps['phoneVerified'] = true;
        user.onboardingSteps['mobileMoneyLinked'] = true;
        if (!user.smartWalletAddress) {
            try {
                console.log('[OTP Verification] Creating smart wallet...');
                user.smartWalletAddress = await (0, privyUtil_1.createSmartWallet)(user.walletId, user.walletAddress);
                console.log('[OTP Verification] Smart wallet created:', user.smartWalletAddress);
            }
            catch (error) {
                console.error('[OTP Verification] Failed to create smart wallet:', error);
            }
        }
        await user.save();
        const boundBuildUserOp = createBoundBuildUserOp();
        const boundSendSponsoredOp = await createBoundSendSponsoredOp(user.walletId, user.walletAddress);
        console.log(`[Deployment] Deploying to chains: ${blockchainNetworks.join(', ')}`);
        const deployResults = await (0, blockchainDeploy_1.deployWalletOnNetworks)(user.walletId, user.walletAddress, user.polkadotMnemonic, blockchainNetworks, boundBuildUserOp, boundSendSponsoredOp);
        const successCount = Object.values(deployResults).filter((r) => typeof r === 'string' && !r.startsWith('Error')).length;
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
    }
    catch (error) {
        res.status(500).json({ message: 'Verification failed', error: error instanceof Error ? error.message : error });
    }
};
exports.verifyOTP = verifyOTP;
function setOnboardingStep(user, key, value) {
    if (user.onboardingSteps instanceof Map ||
        (typeof user.onboardingSteps?.set === 'function')) {
        user.onboardingSteps.set(key, value);
    }
    else {
        user.onboardingSteps[key] = value;
    }
}
function getOnboardingStep(user, key) {
    if (user.onboardingSteps instanceof Map ||
        (typeof user.onboardingSteps?.get === 'function')) {
        return user.onboardingSteps.get(key);
    }
    else {
        return user.onboardingSteps[key];
    }
}
const onboard = async (req, res) => {
    try {
        const { phone, name, photoUrl, nationalId, bodaRegNo, mobileMoneyNumber, coverageLevel } = req.body;
        if (!phone) {
            return res.status(400).json({ message: 'Phone is required.' });
        }
        const user = await User_1.default.findOne({ phone });
        if (!user)
            return res.status(404).json({ message: 'User not found.' });
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
        const completedSteps = User_1.OnboardingStepKeys.filter((key) => getOnboardingStep(user, key) === true);
        user.onboardingStage = Math.min(completedSteps.length + 1, User_1.OnboardingStepKeys.length);
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
    }
    catch (error) {
        res.status(500).json({
            message: 'Onboard failed',
            error: (error instanceof Error ? error.message : error)
        });
    }
};
exports.onboard = onboard;
const getUser = async (req, res) => {
    try {
        const { phone, id } = req.query;
        let user;
        if (phone) {
            user = await User_1.default.findOne({ phone });
        }
        else if (id) {
            user = await User_1.default.findById(id);
        }
        else {
            return res.status(400).json({ message: 'Phone or id query parameter required.' });
        }
        if (!user)
            return res.status(404).json({ message: 'User not found.' });
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
    }
    catch (error) {
        res.status(500).json({ message: 'Get user failed', error: (error instanceof Error ? error.message : error) });
    }
};
exports.getUser = getUser;
//# sourceMappingURL=authController.js.map