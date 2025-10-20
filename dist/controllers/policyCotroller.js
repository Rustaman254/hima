"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivatePolicy = exports.updatePolicy = exports.getPolicy = exports.listPolicies = exports.addPolicy = void 0;
const Policy_1 = require("../models/insurance/Policy");
const addPolicy = async (req, res) => {
    try {
        const newPolicy = new Policy_1.BodaInsurancePolicy({ ...req.body, isActive: true });
        await newPolicy.save();
        res.status(201).json({ message: 'Policy created', policy: newPolicy });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to create policy', error: error instanceof Error ? error.message : error });
    }
};
exports.addPolicy = addPolicy;
const listPolicies = async (req, res) => {
    try {
        const { user, bodaRegNo, plan, status, active } = req.query;
        const filter = {};
        if (user)
            filter.user = user;
        if (bodaRegNo)
            filter.bodaRegNo = bodaRegNo;
        if (plan)
            filter.plan = plan;
        if (status)
            filter.status = status;
        if (active !== undefined)
            filter.isActive = active === 'true';
        const policies = await Policy_1.BodaInsurancePolicy.find(filter)
            .populate('plan')
            .populate('user')
            .populate('claims')
            .sort({ createdAt: -1 });
        res.status(200).json({ policies });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to list policies', error: error instanceof Error ? error.message : error });
    }
};
exports.listPolicies = listPolicies;
const getPolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const policy = await Policy_1.BodaInsurancePolicy.findById(id)
            .populate('plan')
            .populate('user')
            .populate('claims');
        if (!policy)
            return res.status(404).json({ message: 'Policy not found.' });
        res.status(200).json({ policy });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to fetch policy', error: error instanceof Error ? error.message : error });
    }
};
exports.getPolicy = getPolicy;
const updatePolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Policy_1.BodaInsurancePolicy.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated)
            return res.status(404).json({ message: 'Policy not found.' });
        res.status(200).json({ message: 'Policy updated', policy: updated });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to update policy', error: error instanceof Error ? error.message : error });
    }
};
exports.updatePolicy = updatePolicy;
const deactivatePolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const deactivated = await Policy_1.BodaInsurancePolicy.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!deactivated)
            return res.status(404).json({ message: 'Policy not found.' });
        res.status(200).json({ message: 'Policy deactivated', policy: deactivated });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to deactivate policy', error: error instanceof Error ? error.message : error });
    }
};
exports.deactivatePolicy = deactivatePolicy;
//# sourceMappingURL=policyCotroller.js.map