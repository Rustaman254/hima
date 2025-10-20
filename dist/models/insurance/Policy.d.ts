import mongoose, { Document, Types } from 'mongoose';
export interface IBodaInsurancePolicy extends Document {
    user: Types.ObjectId;
    bodaRegNo: string;
    plan: Types.ObjectId;
    policyNumber: string;
    startDate: Date;
    endDate: Date;
    premiumPaid: number;
    coverageAmount: number;
    insuredBikeDetails?: {
        make: string;
        model: string;
        year: number;
        chassisNumber?: string;
        color?: string;
    };
    status: 'active' | 'paused' | 'expired' | 'cancelled';
    isActive: boolean;
    claims: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const BodaInsurancePolicy: mongoose.Model<IBodaInsurancePolicy, {}, {}, {}, mongoose.Document<unknown, {}, IBodaInsurancePolicy, {}, {}> & IBodaInsurancePolicy & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Policy.d.ts.map