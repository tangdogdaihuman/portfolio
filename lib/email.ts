import nodemailer from "nodemailer";

const ALLOWED_EMAIL = "1193662756@qq.com";

// QQ SMTP 真实 IP（绕过被污染的 DNS），按优先级排列
const QQ_SMTP_IPS = ["120.232.69.34", "120.233.18.201"];

function createTransport(host: string, port: number): nodemailer.Transporter {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    tls: {
      servername: "smtp.qq.com",
    },
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function trySendMail(mailOptions: nodemailer.SendMailOptions): Promise<boolean> {
  const port = Number(process.env.EMAIL_PORT) || 587;

  // Respect EMAIL_HOST if configured; fall back to hardcoded IPs (DNS pollution workaround)
  const hosts: string[] = process.env.EMAIL_HOST
    ? [process.env.EMAIL_HOST, ...QQ_SMTP_IPS]
    : QQ_SMTP_IPS;

  for (const host of hosts) {
    try {
      const t = createTransport(host, port);
      await t.sendMail(mailOptions);
      return true;
    } catch (err) {
      console.error(`[email] SMTP ${host}:${port} failed:`, (err as Error).message);
    }
  }
  return false;
}

export async function sendVerificationCode(code: string): Promise<boolean> {
  const user = process.env.EMAIL_USER;
  if (!user || user !== ALLOWED_EMAIL) {
    console.error("[email] EMAIL_USER not configured or not allowed");
    return false;
  }

  if (!process.env.EMAIL_PASS) {
    console.error("[email] EMAIL_PASS not configured");
    return false;
  }

  const sent = await trySendMail({
    from: `"个人网站管理" <${user}>`,
    to: ALLOWED_EMAIL,
    subject: "管理后台验证码",
    text: `您的验证码是：${code}，有效期5分钟。`,
    html: `
      <div style="max-width:400px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;">
        <h2 style="color:#333;">管理后台验证码</h2>
        <p style="font-size:14px;color:#666;">您正在登录个人网站管理后台，验证码如下：</p>
        <div style="background:#f5f5f5;padding:16px;text-align:center;margin:20px 0;border-radius:4px;">
          <span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#111;">${code}</span>
        </div>
        <p style="font-size:12px;color:#999;">有效期5分钟。如非本人操作请忽略。</p>
      </div>
    `,
  });

  if (sent) {
    console.log(`[email] Verification code sent to ${ALLOWED_EMAIL}`);
  }
  return sent;
}
