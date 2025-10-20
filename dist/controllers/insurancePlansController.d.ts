import type { Request, Response } from 'express';
export declare const createDefaultPlans: (req: Request, res: Response) => Promise<void>;
export declare const listPlans: (req: Request, res: Response) => Promise<void>;
export declare const addPlan: (req: Request, res: Response) => Promise<void>;
export declare const updatePlan: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deletePlan: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=insurancePlansController.d.ts.map