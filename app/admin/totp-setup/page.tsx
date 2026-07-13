import { generateSecret, getKeyUri } from "@/lib/totp";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export default async function TotpSetupPage() {
  const secret = generateSecret();
  const uri = getKeyUri(secret, "1193662756@qq.com");
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 2 });

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-text text-center mb-3">绑定动态口令</h1>
        <p className="text-center text-sm text-text-muted mb-8">
          用 Authenticator App 扫描二维码，然后将密钥填入 .env.local
        </p>

        <div className="bg-white p-4 rounded-sm mb-6 flex justify-center">
          <img src={qrDataUrl} alt="TOTP QR Code" width={200} height={200} />
        </div>

        <div className="bg-surface border border-border p-4 rounded-sm mb-6">
          <p className="text-xs text-text-muted mb-2">密钥（手动复制）：</p>
          <code className="text-sm text-accent break-all select-all">{secret}</code>
        </div>

        <div className="bg-amber-900/20 border border-amber-700/30 p-4 rounded-sm">
          <p className="text-xs text-amber-300 leading-relaxed">
            将上方密钥添加到 <code className="text-amber-200 bg-amber-900/40 px-1 rounded">.env.local</code>：
            <br />
            <code className="text-amber-200 block mt-1 break-all">TOTP_SECRET={secret}</code>
          </p>
        </div>

        <p className="text-xs text-text-muted mt-4 text-center">
          每次刷新页面会生成新密钥，之前的会失效
        </p>
      </div>
    </div>
  );
}
