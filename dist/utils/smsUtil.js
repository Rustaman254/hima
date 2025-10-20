"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsNetworkProvider = void 0;
exports.sendOTP = sendOTP;
exports.sendOTPViaNetwork = sendOTPViaNetwork;
const africastalking_1 = __importDefault(require("africastalking"));
var SmsNetworkProvider;
(function (SmsNetworkProvider) {
    SmsNetworkProvider["SAFARICOM"] = "safaricom";
    SmsNetworkProvider["AIRTEL"] = "airtel";
})(SmsNetworkProvider || (exports.SmsNetworkProvider = SmsNetworkProvider = {}));
const credentials = {
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
};
const africastalking = (0, africastalking_1.default)(credentials);
const sms = africastalking.SMS;
async function sendOTP(phone, otp) {
    const from = process.env.AT_SENDER_ID;
    if (!from)
        throw new Error("AT_SENDER_ID not set in environment variables");
    try {
        return await sms.send({
            to: [phone],
            message: `Your verification code: ${otp}`,
            from,
        });
    }
    catch (error) {
        throw error;
    }
}
async function sendOTPViaNetwork(phone, otp, network) {
    switch (network) {
        case SmsNetworkProvider.SAFARICOM:
        case SmsNetworkProvider.AIRTEL:
            return await sendOTP(phone, otp);
        default:
            throw new Error('Unsupported SMS network/provider');
    }
}
//# sourceMappingURL=smsUtil.js.map