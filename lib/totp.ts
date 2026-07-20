import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "TangPortfolio";

export { generateSecret };

export function getKeyUri(secret: string, label: string): string {
  return generateURI({ secret, issuer: ISSUER, label });
}

export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  if (!secret || token.length !== 6) return false;
  try {
    const result = await verify({ token, secret });
    return result.valid;
  } catch {
    return false;
  }
}
