import type { Request, Response } from 'express';
export declare const addPolicy: (req: Request, res: Response) => Promise<void>;
export declare const listPolicies: (req: Request, res: Response) => Promise<void>;
export declare const getPolicy: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updatePolicy: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deactivatePolicy: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=policyCotroller.d.ts.map