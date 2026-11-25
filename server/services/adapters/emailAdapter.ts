import nodemailer from 'nodemailer';
import { db, createId } from '../../db/database.ts';

export interface EmailRequest {
  candidateId?: string | null;
  jobId?: string | null;
  to: string;
  subject: string;
  body: string;
  templateType?: string;
  meetingDetails?: Record<string, unknown>;
  sentBy?: string | null;
}

export interface EmailResult {
  logId: string;
  sent: boolean;
  configured: boolean;
  status: 'sent' | 'failed' | 'not_configured';
  providerMessageId?: string;
  error?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmailMessage(req: EmailRequest): Promise<EmailResult> {
  const logId = createId('eml');
  const configured = isSmtpConfigured();

  if (!configured) {
    const errorMsg =
      'SMTP provider is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in environment variables). Email was not sent.';
    db.prepare(
      `INSERT INTO email_logs (
        id, candidate_id, job_id, recipient_email, subject, body, template_type,
        meeting_details, provider, status, error_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'smtp', 'not_configured', ?, ?)`
    ).run(
      logId,
      req.candidateId ?? null,
      req.jobId ?? null,
      req.to,
      req.subject,
      req.body,
      req.templateType || 'level2_invite',
      JSON.stringify(req.meetingDetails || {}),
      errorMsg,
      req.sentBy ?? null
    );
    return { logId, sent: false, configured: false, status: 'not_configured', error: errorMsg };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
      secure: Number.parseInt(process.env.SMTP_PORT || '587', 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: req.to,
      subject: req.subject,
      text: req.body,
    });

    db.prepare(
      `INSERT INTO email_logs (
        id, candidate_id, job_id, recipient_email, subject, body, template_type,
        meeting_details, provider, status, provider_message_id, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'smtp', 'sent', ?, ?)`
    ).run(
      logId,
      req.candidateId ?? null,
      req.jobId ?? null,
      req.to,
      req.subject,
      req.body,
      req.templateType || 'level2_invite',
      JSON.stringify(req.meetingDetails || {}),
      info.messageId,
      req.sentBy ?? null
    );

    return {
      logId,
      sent: true,
      configured: true,
      status: 'sent',
      providerMessageId: info.messageId,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || 'SMTP transport error';
    db.prepare(
      `INSERT INTO email_logs (
        id, candidate_id, job_id, recipient_email, subject, body, template_type,
        meeting_details, provider, status, error_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'smtp', 'failed', ?, ?)`
    ).run(
      logId,
      req.candidateId ?? null,
      req.jobId ?? null,
      req.to,
      req.subject,
      req.body,
      req.templateType || 'level2_invite',
      JSON.stringify(req.meetingDetails || {}),
      errorMsg,
      req.sentBy ?? null
    );
    return { logId, sent: false, configured: true, status: 'failed', error: errorMsg };
  }
}

export function buildLevel2InvitationTemplate(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  date: string;
  time: string;
  timeZone: string;
  mode: string;
  interviewerName: string;
  meetingLink: string;
  instructions: string;
}): { subject: string; body: string } {
  const subject = `Invitation for Level 2 Interview – ${params.jobTitle}`;
  const body = [
    `Dear ${params.candidateName},`,
    '',
    `Congratulations! Following your Level 1 evaluation with ${params.companyName}, our recruitment team is pleased to invite you to the Level 2 interview for the ${params.jobTitle} position.`,
    '',
    'Interview Details:',
    `- Date: ${params.date}`,
    `- Time: ${params.time} (${params.timeZone})`,
    `- Mode: ${params.mode}`,
    `- Interviewer: ${params.interviewerName}`,
    params.meetingLink ? `- Meeting Link / Location: ${params.meetingLink}` : '',
    params.instructions ? `- Instructions: ${params.instructions}` : '',
    '',
    'Please reply to confirm your availability for this slot.',
    '',
    'Warm regards,',
    'Recruitment Team, HireFlow AI',
  ]
    .filter((line) => line !== undefined && line !== null)
    .join('\n');

  return { subject, body };
}
