import type { Request, Response } from 'express';

import type { IBodaInsurancePlan } from '../models/insurance/Plans.js';
import { BodaInsurancePlan } from '../models/insurance/Plans.js';

const defaultPlans: Record<string, Partial<IBodaInsurancePlan>> = {
  tpo: {
    name: 'Micro Third-Party Test Plan',
    description: 'Test plan with minimal third-party liability for boda bodas, for testing purposes only.',
    type: 'third_party',
    premium: 10,
    coverageAmount: 5000,
    coverageDurationMonths: 12,
    inclusions: [
      'third-party bodily injury (limited)'
    ],
    exclusions: [
      'third-party property damage',
      'rider injuries',
      'damage to own bike',
      'fire',
      'theft',
      'passenger liability',
      'legal liability beyond minimal claims'
    ],
    deductible: 0,
    targetVehicleType: 'boda_boda',
    maxClaims: 1,
    isActive: true
  },
  // pll: {
  //   name: 'Passenger Legal Liability (PLL)',
  //   description: 'Covers liability for passenger injuries for PSV/rider.',
  //   type: 'third_party',
  //   premium: 500,
  //   coverageAmount: 500000,
  //   coverageDurationMonths: 12,
  //   inclusions: [
  //     'liability for passenger injury',
  //     'legal liability for PSV boda bodas'
  //   ],
  //   exclusions: ['damage to own bike', 'fire', 'theft'],
  //   deductible: 0,
  //   targetVehicleType: 'boda_boda',
  //   maxClaims: 12,
  //   isActive: true
  // },
  // tpft: {
  //   name: 'Third-Party, Fire & Theft (TPFT)',
  //   description: 'Mid-level cover for theft and fire of motorcycle, plus third-party risks.',
  //   type: 'third_party',
  //   premium: 6000,
  //   coverageAmount: 200000,
  //   coverageDurationMonths: 12,
  //   inclusions: [
  //     'third-party property damage',
  //     'third-party bodily injury',
  //     'fire damage',
  //     'theft cover'
  //   ],
  //   exclusions: [
  //     'accidental damage to own bike (outside fire/theft)',
  //     'passenger liability'
  //   ],
  //   deductible: 1000,
  //   targetVehicleType: 'boda_boda',
  //   maxClaims: 8,
  //   isActive: true
  // },
  // comprehensive: {
  //   name: 'Comprehensive Boda Boda Cover',
  //   description: 'Covers bike, rider, passengers, fire, theft, accidental damage, riots, medical and more.',
  //   type: 'comprehensive',
  //   premium: 16000,
  //   coverageAmount: 200000,
  //   coverageDurationMonths: 12,
  //   inclusions: [
  //     'third-party property damage',
  //     'third-party bodily injury',
  //     'fire damage',
  //     'theft cover',
  //     'accidental damage to bike',
  //     'personal accident for rider',
  //     'riots, strikes, special perils'
  //   ],
  //   exclusions: [
  //     'unlicensed riders',
  //     'intentional damage',
  //     'non-listed accessories'
  //   ],
  //   deductible: 5000,
  //   targetVehicleType: 'boda_boda',
  //   maxClaims: 5,
  //   isActive: true
  // }
};

export const createDefaultPlans = async (req: Request, res: Response) => {
  try {
    const plansToCreate = Object.entries(defaultPlans);
    const results = [];
    for (const [, planData] of plansToCreate) {
      const alreadyExists = await BodaInsurancePlan.findOne({ name: planData.name });
      if (!alreadyExists) {
        const plan = new BodaInsurancePlan(planData);
        await plan.save();
        results.push(plan);
      }
    }
    res.status(201).json({ message: 'Default plans created', plans: results });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to create default plans',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const listPlans = async (req: Request, res: Response) => {
  try {
    const { type, active, targetVehicleType } = req.query;
    const filter: any = {};
    if (type) filter.type = type;
    if (active !== undefined) filter.isActive = active === 'true';
    if (targetVehicleType) filter.targetVehicleType = targetVehicleType;
    const plans = await BodaInsurancePlan.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ plans });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to list plans',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const addPlan = async (req: Request, res: Response) => {
  try {
    const newPlan = new BodaInsurancePlan({
      ...req.body,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    });
    await newPlan.save();
    res.status(201).json({ message: 'Plan added', plan: newPlan });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to add plan',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await BodaInsurancePlan.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Plan not found.' });
    res.status(200).json({ message: 'Plan updated', plan: updated });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update plan',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const deletePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await BodaInsurancePlan.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    if (!deleted) return res.status(404).json({ message: 'Plan not found.' });
    res.status(200).json({ message: 'Plan deactivated', plan: deleted });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to delete plan',
      error: error instanceof Error ? error.message : error
    });
  }
};
