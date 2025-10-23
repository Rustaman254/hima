import type { Request, Response } from 'express';
import { BodaInsuranceClaim } from '../models/insurance/Claim.js';
import { BodaInsurancePolicy } from '../models/insurance/Policy.js';

export const createClaim = async (req: Request, res: Response) => {
  try {
    const {
      policy,
      user,
      claimNumber,
      claimType,
      bodaRegNo,
      incidentDate,
      description,
      location,
      policeAbstractUrl,
      supportingDocuments,
      amountClaimed,
      amountApproved,
      status,
      auditTrail
    } = req.body;

    if (!policy || !user || !claimNumber || !claimType || !bodaRegNo || !incidentDate || !amountClaimed) {
      return res.status(400).json({
        message: "Missing required fields"
      });
    }

    const newClaim = new BodaInsuranceClaim({
      policy,
      user,
      claimNumber,
      claimType,
      bodaRegNo,
      incidentDate,
      description,
      location,
      policeAbstractUrl,
      supportingDocuments,
      amountClaimed,
      amountApproved,
      status,
      auditTrail
    });

    await newClaim.save();

    await BodaInsurancePolicy.findByIdAndUpdate(
      policy,
      { $push: { claims: newClaim._id } }
    );

    res.status(201).json({ message: "Claim created and linked", claim: newClaim });
  } catch (error) {
    res.status(500).json({ message: "Failed to create claim", error: error instanceof Error ? error.message : error });
  }
};

export const listClaims = async (req: Request, res: Response) => {
  try {
    const { policy, user, status, claimType } = req.query;
    const filter: any = {};
    if (policy) filter.policy = policy;
    if (user) filter.user = user;
    if (status) filter.status = status;
    if (claimType) filter.claimType = claimType;

    const claims = await BodaInsuranceClaim.find(filter)
      .populate('policy')
      .populate('user')
      .sort({ createdAt: -1 });

    res.status(200).json({ claims });
  } catch (error) {
    res.status(500).json({ message: "Failed to list claims", error: error instanceof Error ? error.message : error });
  }
};

export const getClaim = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const claim = await BodaInsuranceClaim.findById(id)
      .populate('policy')
      .populate('user');
    if (!claim) return res.status(404).json({ message: "Claim not found." });
    res.status(200).json({ claim });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch claim", error: error instanceof Error ? error.message : error });
  }
};

export const updateClaim = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await BodaInsuranceClaim.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Claim not found." });
    res.status(200).json({ message: "Claim updated", claim: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update claim", error: error instanceof Error ? error.message : error });
  }
};

export const deleteClaim = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await BodaInsuranceClaim.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Claim not found." });

    // Optionally remove from policy.claims array
    await BodaInsurancePolicy.findByIdAndUpdate(deleted.policy, { $pull: { claims: deleted._id } });

    res.status(200).json({ message: "Claim deleted", claim: deleted });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete claim", error: error instanceof Error ? error.message : error });
  }
};
