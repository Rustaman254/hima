import type { Request, Response } from 'express';
export declare const registerUser: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const sendOTPToPhone: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const verifyOTP: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const onboard: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUser: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=authController.d.ts.map