import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || "your_default_secret"; // Use env var in production

export function generateJWT(payload: object, expiresIn: string | number = "24h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyJWT(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
