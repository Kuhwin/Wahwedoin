import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "");
  }
  return _resend;
}

type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  link?: string;
};

export async function sendEmail({ to, subject, body, link }: EmailPayload) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set, skipping email");
    return { success: false, error: new Error("RESEND_API_KEY not configured") };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wahwedoin.com";

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const htmlBody = escapeHtml(body).replace(/\n/g, "<br>");
  const htmlSubject = escapeHtml(subject);
  const href = link ? `${appUrl}${escapeHtml(link)}` : "";
  const appUrlHtml = escapeHtml(appUrl);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:20px;">
      <span style="font-size:20px;font-weight:600;color:#6366f1;">Wah We Doin</span>
    </div>
    <p style="font-size:15px;line-height:1.6;">${htmlBody}</p>
    ${href ? `<p><a href="${href}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">View on Wah We Doin</a></p>` : ""}
    <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:12px;font-size:12px;color:#94a3b8;">
      <p>Sent from <a href="${appUrlHtml}" style="color:#6366f1;">Wah We Doin</a></p>
    </div>
  </div>
</body>
</html>`;

  const resend = getResend();
  const from = process.env.NOTIFICATION_EMAIL_FROM || "Wah We Doin <notifications@wahwedoin.com>";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: htmlSubject,
    html,
  });

  if (error) {
    console.error("[email] Failed to send:", error);
    return { success: false, error };
  }

  return { success: true };
}

export function buildNotificationEmail(userName: string, title: string, body: string, link?: string) {
  return {
    subject: title,
    body: body ? `Hi ${userName},\n\n${body}` : `Hi ${userName},\n\n${title}`,
    link,
  };
}
