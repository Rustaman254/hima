import mongoose, { Schema, Document, Types } from 'mongoose';

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
  
  // Blockchain fields
  rider?: string;                   // User's wallet address (rider)
  token?: string;                   // Token contract address
  premium?: string;                 // Premium amount in token units
  policyId?: string;                // On-chain policy ID
  chainTx?: string;                 // Blockchain transaction hash
  
  // ElementPay order/escrow fields
  orderEscrowId?: string;           // ElementPay order_id or tx_hash
  orderEscrowStatus?: string;       // ElementPay status (pending, submitted, completed, etc)
  orderEscrowDetails?: {            // Full ElementPay response
    status?: string;
    message?: string;
    data?: {
      order_id?: string;
      tx_hash?: string;
      status?: string;
      rate_used?: number;
      amount_sent?: number;
      fiat_paid?: number;
      user_address?: string;
      token?: string;
    };
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const BodaInsurancePolicySchema = new Schema<IBodaInsurancePolicy>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  bodaRegNo: { type: String, required: true },
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

  // Blockchain tracking fields
  rider: { type: String },                     // Ethereum address of rider/user
  token: { type: String },                     // Token contract address
  premium: { type: String },                   // Premium in token units (wei/smallest unit)
  policyId: { type: String },                  // Blockchain smart contract policyId
  chainTx: { type: String },                   // Blockchain transaction hash

  // ElementPay tracking
  orderEscrowId: { type: String },             // order_id or tx_hash from ElementPay
  orderEscrowStatus: { type: String },         // status from ElementPay
  orderEscrowDetails: { 
    type: Schema.Types.Mixed,
    default: {}
  }

}, { timestamps: true });

export const BodaInsurancePolicy = mongoose.model<IBodaInsurancePolicy>('BodaInsurancePolicy', BodaInsurancePolicySchema);