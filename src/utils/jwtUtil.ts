import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || "your-fallback-secret-key";

export function generateJWT(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyJWT(token: string) {
  return jwt.verify(token, JWT_SECRET);
}