import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBodaInsuranceClaim extends Document {
  policy: Types.ObjectId;
  user: Types.ObjectId;
  claimNumber: string;
  claimType: 'accident' | 'medical' | 'theft' | 'damage' | 'third_party' | 'device';
  bodaRegNo: string;
  claimDate: Date;
  incidentDate: Date;
  description: string;
  location: string;
  policeAbstractUrl?: string;
  supportingDocuments: string[];
  amountClaimed: number;
  amountApproved?: number;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'closed';
  auditTrail: {
    date: Date;
    action: string;
    user?: Types.ObjectId;
    note?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const BodaInsuranceClaimSchema = new Schema<IBodaInsuranceClaim>({
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

export const BodaInsuranceClaim = mongoose.model<IBodaInsuranceClaim>('BodaInsuranceClaim', BodaInsuranceClaimSchema);
