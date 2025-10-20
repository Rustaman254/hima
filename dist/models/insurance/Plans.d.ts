import mongoose, { Document } from 'mongoose';
export interface IBodaInsurancePlan extends Document {
    name: string;
    description: string;
    type: 'accident' | 'medical' | 'theft' | 'damage' | 'third_party' | 'device' | 'comprehensive';
    premium: number;
    coverageAmount: number;
    coverageDurationMonths: number;
    inclusions: string[];
    exclusions: string[];
    deductible?: number;
    targetVehicleType?: 'boda_boda' | 'tuk_tuk' | 'other';
    maxClaims?: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const BodaInsurancePlan: mongoose.Model<IBodaInsurancePlan, {}, {}, {}, mongoose.Document<unknown, {}, IBodaInsurancePlan, {}, {}> & IBodaInsurancePlan & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Plans.d.ts.map