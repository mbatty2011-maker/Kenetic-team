import { Resend } from "resend";

interface EmailOptions {
  to: string;
  subject: string;
  body: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "knetc <noreply@knetc.team>";

export async function sendEmail({ to, subject, body }: EmailOptions) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text: body,
  });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}

export async function draftEmail({ to, subject, body }: EmailOptions) {
  await sendEmail({ to, subject, body });
}
