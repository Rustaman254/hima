import mongoose, { Document } from 'mongoose';
export interface IOTP extends Document {
    phone: string;
    otp: string;
    expiresAt: Date;
    verified: boolean;
}
declare const _default: mongoose.Model<IOTP, {}, {}, {}, mongoose.Document<unknown, {}, IOTP, {}, {}> & IOTP & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=OTP.d.ts.map