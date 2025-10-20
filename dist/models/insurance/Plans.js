import mongoose, { Schema, Document } from 'mongoose';
const BodaInsurancePlanSchema = new Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    type: {
        type: String,
        enum: [
            'accident',
            'medical',
            'theft',
            'damage',
            'third_party',
            'device',
            'comprehensive'
        ],
        required: true
    },
    premium: { type: Number, required: true },
    coverageAmount: { type: Number, required: true },
    coverageDurationMonths: { type: Number, required: true },
    inclusions: [{ type: String }],
    exclusions: [{ type: String }],
    deductible: { type: Number },
    targetVehicleType: { type: String, enum: ['boda_boda', 'tuk_tuk', 'other'] },
    maxClaims: { type: Number },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
export const BodaInsurancePlan = mongoose.model('BodaInsurancePlan', BodaInsurancePlanSchema);
//# sourceMappingURL=Plans.js.map