import crypto from 'node:crypto';
import { isWithinCallingWindow } from '../../../src/lib/recruitmentRules.ts';

export interface TelephonyStatus {
  provider: 'twilio' | 'exotel' | 'none';
  configured: boolean;
  twilioConfigured: boolean;
  exotelConfigured: boolean;
  publicUrlConfigured: boolean;
  reason?: string;
}

export function getTelephonyStatus(): TelephonyStatus {
  const twilioConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
  const exotelConfigured = Boolean(
    process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_SID &&
      process.env.EXOTEL_CALLER_ID
  );
  const appUrl = process.env.APP_URL || '';
  const publicUrlConfigured =
    appUrl.startsWith('https://') && !appUrl.includes('MY_APP_URL') && !appUrl.includes('localhost');

  if (twilioConfigured) {
    return {
      provider: 'twilio',
      configured: true,
      twilioConfigured,
      exotelConfigured,
      publicUrlConfigured,
      reason: publicUrlConfigured
        ? undefined
        : 'Twilio credentials present, but APP_URL must be a publicly reachable HTTPS URL for Media Streams callbacks.',
    };
  }
  if (exotelConfigured) {
    return {
      provider: 'exotel',
      configured: true,
      twilioConfigured,
      exotelConfigured,
      publicUrlConfigured,
    };
  }
  return {
    provider: 'none',
    configured: false,
    twilioConfigured: false,
    exotelConfigured: false,
    publicUrlConfigured,
    reason:
      'Telephony provider is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER or Exotel credentials). Use Web Interview (test mode) for browser interviews.',
  };
}

export function verifyTwilioSignature(
  authToken: string,
  signatureHeader: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken || !signatureHeader) return false;
  const keys = Object.keys(params).sort();
  let data = url;
  for (const key of keys) {
    data += key + params[key];
  }
  const digest = crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
  if (digest.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
}

export async function placeOutboundCall(params: {
  callId: string;
  interviewId: string;
  toNumber: string;
  candidateName: string;
  callingStartHour: number;
  callingEndHour: number;
  activeCallCount: number;
  maxConcurrency: number;
  appliedVerified: boolean;
  campaignAuthorized: boolean;
}): Promise<{
  ok: boolean;
  providerCallSid?: string;
  status: string;
  error?: string;
}> {
  if (!params.appliedVerified || !params.campaignAuthorized) {
    return {
      ok: false,
      status: 'failed',
      error: 'Call blocked: candidate application verification and campaign authorization are required.',
    };
  }

  if (params.activeCallCount >= params.maxConcurrency) {
    return {
      ok: false,
      status: 'queued',
      error: `Concurrency limit (${params.maxConcurrency}) reached; call remains queued.`,
    };
  }

  if (!isWithinCallingWindow(new Date(), params.callingStartHour, params.callingEndHour, 'Asia/Kolkata')) {
    return {
      ok: false,
      status: 'queued',
      error: `Outside allowed calling window (${params.callingStartHour}:00–${params.callingEndHour}:00 IST). Call remains queued.`,
    };
  }

  const telStatus = getTelephonyStatus();
  if (!telStatus.configured) {
    return {
      ok: false,
      status: 'failed',
      error: telStatus.reason || 'Telephony provider not configured.',
    };
  }

  if (telStatus.provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_PHONE_NUMBER!;
    const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    if (!baseUrl.startsWith('https://') || baseUrl.includes('MY_APP_URL')) {
      return {
        ok: false,
        status: 'failed',
        error: 'APP_URL must be a publicly reachable HTTPS URL (e.g. ngrok) for Twilio webhooks.',
      };
    }

    const body = new URLSearchParams({
      To: params.toNumber,
      From: from,
      Url: `${baseUrl}/api/telephony/twilio/twiml/${params.interviewId}`,
      StatusCallback: `${baseUrl}/api/telephony/twilio/status/${params.callId}`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      MachineDetection: 'DetectMessageEnd',
    });

    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = (await resp.json()) as { sid?: string; message?: string };
    if (!resp.ok || !data.sid) {
      return {
        ok: false,
        status: 'failed',
        error: data.message || `Twilio API error (${resp.status})`,
      };
    }
    return { ok: true, providerCallSid: data.sid, status: 'queued' };
  }

  return {
    ok: false,
    status: 'failed',
    error: 'Exotel call placement requires EXOTEL_APP_ID flow URL configured.',
  };
}
