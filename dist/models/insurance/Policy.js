import mongoose, { Schema, Document, Types } from 'mongoose';
const BodaInsurancePolicySchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bodaRegNo: { type: String, required: true }, // motorbike registration number
    plan: { type: Schema.Types.ObjectId, ref: 'BodaInsurancePlan', required: true },
    policyNumber: { type: String, unique: true, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    premiumPaid: { type: Number, required: true },
    coverageAmount: { type: Number, required: true },
    insuredBikeDetails: {
        make: { type: String },
        model: { type: String },
        year: { type: Number },
        chassisNumber: { type: String },
        color: { type: String }
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'expired', 'cancelled'],
        default: 'active'
    },
    isActive: { type: Boolean, default: true },
    claims: [{ type: Schema.Types.ObjectId, ref: 'BodaInsuranceClaim' }],
}, { timestamps: true });
export const BodaInsurancePolicy = mongoose.model('BodaInsurancePolicy', BodaInsurancePolicySchema);
//# sourceMappingURL=Policy.js.map