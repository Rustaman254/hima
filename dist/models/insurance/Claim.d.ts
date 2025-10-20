import mongoose, { Document, Types } from 'mongoose';
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
export declare const BodaInsuranceClaim: mongoose.Model<IBodaInsuranceClaim, {}, {}, {}, mongoose.Document<unknown, {}, IBodaInsuranceClaim, {}, {}> & IBodaInsuranceClaim & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Claim.d.ts.map