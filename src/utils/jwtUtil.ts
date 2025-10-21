import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || "";

export function generateJWT(payload: object, expiresIn: string | number = "24h"): string {
  const signOptions: SignOptions = { expiresIn }; 
  return jwt.sign(payload, JWT_SECRET, signOptions);
}

export function verifyJWT(token: string) {
  return jwt.verify(token, JWT_SECRET);
}