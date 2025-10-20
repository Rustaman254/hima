import mongoose, { Schema, Document } from 'mongoose';
const OTPSchema = new Schema({
    phone: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false }
}, { timestamps: true });
export default mongoose.model('OTP', OTPSchema);
//# sourceMappingURL=OTP.js.map