export declare enum SmsNetworkProvider {
    SAFARICOM = "safaricom",
    AIRTEL = "airtel"
}
export declare function sendOTP(phone: string, otp: string): Promise<any>;
export declare function sendOTPViaNetwork(phone: string, otp: string, network: SmsNetworkProvider): Promise<any>;
//# sourceMappingURL=smsUtil.d.ts.map