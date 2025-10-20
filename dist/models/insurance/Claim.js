import mongoose, { Schema, Document, Types } from 'mongoose';
const BodaInsuranceClaimSchema = new Schema({
    policy: { type: Schema.Types.ObjectId, ref: 'BodaInsurancePolicy', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    claimNumber: { type: String, unique: true, required: true },
    claimType: {
        type: String,
        enum: ['accident', 'medical', 'theft', 'damage', 'third_party', 'device'],
        required: true
    },
    bodaRegNo: { type: String, required: true },
    claimDate: { type: Date, default: Date.now },
    incidentDate: { type: Date, required: true },
    description: { type: String },
    location: { type: String },
    policeAbstractUrl: { type: String },
    supportingDocuments: [{ type: String }],
    amountClaimed: { type: Number, required: true },
    amountApproved: { type: Number },
    status: {
        type: String,
        enum: ['submitted', 'under_review', 'approved', 'rejected', 'paid', 'closed'],
        default: 'submitted'
    },
    auditTrail: [{
            date: { type: Date, default: Date.now },
            action: { type: String, required: true },
            user: { type: Schema.Types.ObjectId, ref: 'User' },
            note: { type: String }
        }]
}, { timestamps: true });
export const BodaInsuranceClaim = mongoose.model('BodaInsuranceClaim', BodaInsuranceClaimSchema);
//# sourceMappingURL=Claim.js.map