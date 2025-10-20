"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BodaInsuranceClaim = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const BodaInsuranceClaimSchema = new mongoose_1.Schema({
    policy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'BodaInsurancePolicy', required: true },
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
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
            user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            note: { type: String }
        }]
}, { timestamps: true });
exports.BodaInsuranceClaim = mongoose_1.default.model('BodaInsuranceClaim', BodaInsuranceClaimSchema);
//# sourceMappingURL=Claim.js.map