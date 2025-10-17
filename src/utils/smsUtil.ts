import Africastalking from 'africastalking';

export enum SmsNetworkProvider {
  SAFARICOM = "safaricom",
  AIRTEL = "airtel"
}

const credentials = {
  apiKey: process.env.AT_API_KEY as string,
  username: process.env.AT_USERNAME as string,
};

const africastalking = Africastalking(credentials);
const sms = africastalking.SMS;

export async function sendOTP(phone: string, otp: string): Promise<any> {
  const from = process.env.AT_SENDER_ID;
  if (!from) throw new Error("AT_SENDER_ID not set in environment variables");

  try {
    return await sms.send({
      to: [phone],
      message: `Your verification code: ${otp}`,
      from,
    });
  } catch (error) {
    throw error;
  }
}

export async function sendOTPViaNetwork(phone: string, otp: string, network: SmsNetworkProvider) {
  switch (network) {
    case SmsNetworkProvider.SAFARICOM:
    case SmsNetworkProvider.AIRTEL:
      return await sendOTP(phone, otp);
    default:
      throw new Error('Unsupported SMS network/provider');
  }
}