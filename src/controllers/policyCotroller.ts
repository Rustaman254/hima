import type { Request, Response } from 'express';

import { BodaInsurancePolicy } from '../models/insurance/Policy.js';

export const addPolicy = async (req: Request, res: Response) => {
  try {
    const newPolicy = new BodaInsurancePolicy({ ...req.body, isActive: true });
    await newPolicy.save();
    res.status(201).json({ message: 'Policy created', policy: newPolicy });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create policy', error: error instanceof Error ? error.message : error });
  }
};

export const listPolicies = async (req: Request, res: Response) => {
  try {
    const { user, bodaRegNo, plan, status, active } = req.query;
    const filter: any = {};
    if (user) filter.user = user;
    if (bodaRegNo) filter.bodaRegNo = bodaRegNo;
    if (plan) filter.plan = plan;
    if (status) filter.status = status;
    if (active !== undefined) filter.isActive = active === 'true';
    const policies = await BodaInsurancePolicy.find(filter)
      .populate('plan')
      .populate('user')
      .populate('claims')
      .sort({ createdAt: -1 });
    res.status(200).json({ policies });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list policies', error: error instanceof Error ? error.message : error });
  }
};

export const getPolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const policy = await BodaInsurancePolicy.findById(id)
      .populate('plan')
      .populate('user')
      .populate('claims');
    if (!policy) return res.status(404).json({ message: 'Policy not found.' });
    res.status(200).json({ policy });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch policy', error: error instanceof Error ? error.message : error });
  }
};

export const updatePolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await BodaInsurancePolicy.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Policy not found.' });
    res.status(200).json({ message: 'Policy updated', policy: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update policy', error: error instanceof Error ? error.message : error });
  }
};

export const deactivatePolicy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deactivated = await BodaInsurancePolicy.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!deactivated) return res.status(404).json({ message: 'Policy not found.' });
    res.status(200).json({ message: 'Policy deactivated', policy: deactivated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to deactivate policy', error: error instanceof Error ? error.message : error });
  }
};
