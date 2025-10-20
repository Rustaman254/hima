import Africastalking from 'africastalking';
export var SmsNetworkProvider;
(function (SmsNetworkProvider) {
    SmsNetworkProvider["SAFARICOM"] = "safaricom";
    SmsNetworkProvider["AIRTEL"] = "airtel";
})(SmsNetworkProvider || (SmsNetworkProvider = {}));
const credentials = {
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
};
const africastalking = Africastalking(credentials);
const sms = africastalking.SMS;
export async function sendOTP(phone, otp) {
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
export async function sendOTPViaNetwork(phone, otp, network) {
    switch (network) {
        case SmsNetworkProvider.SAFARICOM:
        case SmsNetworkProvider.AIRTEL:
            return await sendOTP(phone, otp);
        default:
            throw new Error('Unsupported SMS network/provider');
    }
}
//# sourceMappingURL=smsUtil.js.map