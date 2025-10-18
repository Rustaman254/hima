const isProduction = process.env.NODE_ENV == 'production';
const port = process.env.PORT;
const baseUrl = isProduction
  ? process.env.RENDER_BASE_URL || ''
  : `http://localhost:${port}/api/v1`;

export const configENV = {
    baseUrl,
    ATApiKey: process.env.AT_API_KEy,
    ATUsername: process.env.AT_USERNAME,
    ATSenderId: process.env.AT_SENDER_ID,
    priviSecret: process.env.PRIVY_APP_SECRET,
    privyAppId: process.env.PRIVY_APP_ID
}