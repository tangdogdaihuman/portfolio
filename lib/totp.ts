import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "TangPortfolio";

export { generateSecret };

/** 生成 otpauth URI（用于扫码绑定） */
export function getKeyUri(secret: string, label: string): string {
  return generateURI({ secret, issuer: ISSUER, label });
}

/** 验证 TOTP 令牌（异步） */
export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  if (!secret || token.length !== 6) return false;
  try {
    const result = await verify({ token, secret });
    return result.valid;
  } catch {
    return false;
  }
}
