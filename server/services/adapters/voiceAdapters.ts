export interface VoiceOption {
  id: string;
  label: string;
  provider: 'azure' | 'elevenlabs' | 'browser';
  locale: string;
  gender: 'female';
  description: string;
  recommended?: boolean;
}

export const AIRA_VOICE_OPTIONS: VoiceOption[] = [
  {
    id: 'en-IN-NeerjaNeural',
    label: 'Aira Warm (Azure en-IN Neerja Neural)',
    provider: 'azure',
    locale: 'en-IN',
    gender: 'female',
    description:
      'Recommended default: warm, calm Indian English neural voice with native viseme timestamps and low cost.',
    recommended: true,
  },
  {
    id: 'en-IN-KavyaNeural',
    label: 'Aira Conversational (Azure en-IN Kavya Neural)',
    provider: 'azure',
    locale: 'en-IN',
    gender: 'female',
    description: 'Clear conversational en-IN tone tuned for natural turn-taking and crisp technical terms.',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    label: 'Aira Studio (ElevenLabs Sarah / Custom)',
    provider: 'elevenlabs',
    locale: 'en-IN',
    gender: 'female',
    description: 'Ultra-natural expressive neural synthesis with character alignment timestamps.',
  },
  {
    id: 'hi-IN-SwaraNeural',
    label: 'Aira Hindi (Azure hi-IN Swara Neural)',
    provider: 'azure',
    locale: 'hi-IN',
    gender: 'female',
    description: 'Natural Hindi female neural voice when candidate chooses Hindi.',
  },
];

export function getVoiceIntegrationStatus() {
  const deepgramConfigured = Boolean(process.env.DEEPGRAM_API_KEY);
  const elevenLabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);
  const azureConfigured = Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);

  return {
    stt: {
      deepgram: deepgramConfigured,
      azure: azureConfigured,
      configured: deepgramConfigured || azureConfigured,
      label: deepgramConfigured
        ? 'Connected (Deepgram)'
        : azureConfigured
          ? 'Connected (Azure Speech)'
          : 'Not configured (browser microphone fallback active in Web Interview)',
    },
    tts: {
      elevenlabs: elevenLabsConfigured,
      azure: azureConfigured,
      configured: elevenLabsConfigured || azureConfigured,
      label: elevenLabsConfigured
        ? 'Connected (ElevenLabs)'
        : azureConfigured
          ? 'Connected (Azure Neural TTS)'
          : 'Not configured (Web Speech browser synthesis fallback available)',
    },
  };
}

export async function synthesizeNeuralSpeech(params: {
  text: string;
  voiceId: string;
  speechRate?: number;
}): Promise<
  | { ok: true; audioBuffer: Buffer; mimeType: string; provider: string }
  | { ok: false; configured: boolean; error: string }
> {
  const rate = params.speechRate ?? 0.95;

  // Prefer ElevenLabs if that voice is selected and key exists
  const isElevenVoice = !params.voiceId.includes('Neural');
  if (isElevenVoice && process.env.ELEVENLABS_API_KEY) {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(params.voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: params.text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.55, similarity_boost: 0.78, speed: rate },
        }),
      }
    );
    if (!resp.ok) {
      return { ok: false, configured: true, error: `ElevenLabs error (${resp.status})` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    return { ok: true, audioBuffer: buf, mimeType: 'audio/mpeg', provider: 'elevenlabs' };
  }

  // Azure Neural TTS with SSML pauses and gentle rate
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
    const azureVoice = params.voiceId.includes('Neural') ? params.voiceId : 'en-IN-NeerjaNeural';
    const lang = azureVoice.startsWith('hi-IN') ? 'hi-IN' : 'en-IN';
    const ratePct = `${Math.round((rate - 1) * 100)}%`;
    const escaped = params.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\. /g, '. <break time="300ms"/> ');

    const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${azureVoice}"><prosody rate="${ratePct}" pitch="-2%">${escaped}</prosody></voice></speak>`;

    const resp = await fetch(
      `https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        },
        body: ssml,
      }
    );
    if (!resp.ok) {
      return { ok: false, configured: true, error: `Azure TTS error (${resp.status})` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    return { ok: true, audioBuffer: buf, mimeType: 'audio/mpeg', provider: 'azure' };
  }

  return {
    ok: false,
    configured: false,
    error: 'Cloud neural TTS (ElevenLabs or Azure Speech) is not configured.',
  };
}
