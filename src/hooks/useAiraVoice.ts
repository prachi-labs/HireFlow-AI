import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function useAiraVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0); // 0..1 ONLY while audio is playing
  const [micSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  });
  const [micError, setMicError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const speechActiveRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<number | null>(null);

  const stopMouthImmediately = useCallback(() => {
    speechActiveRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setMouthLevel(0);
    setIsSpeaking(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    stopMouthImmediately();
  }, [stopMouthImmediately]);

  const speak = useCallback(
    async (text: string, options?: { voiceId?: string; speechRate?: number; language?: string }) => {
      if (muted || !text.trim()) return;
      stopSpeaking();

      const voiceId = options?.voiceId || 'en-IN-NeerjaNeural';
      const speechRate = options?.speechRate ?? 0.95;

      // Check once whether cloud TTS (ElevenLabs / Azure Neural) is configured before calling /api/voice/tts
      try {
        const w = window as unknown as { __hireflowCloudTts?: boolean };
        if (typeof w.__hireflowCloudTts === 'undefined') {
          const optResp = await fetch('/api/voice/options');
          if (optResp.ok) {
            const optData = (await optResp.json()) as { cloudTtsConfigured?: boolean };
            w.__hireflowCloudTts = Boolean(optData.cloudTtsConfigured);
          } else {
            w.__hireflowCloudTts = false;
          }
        }

        if (w.__hireflowCloudTts) {
          const resp = await fetch('/api/voice/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceId, speechRate }),
          });

          if (resp.ok) {
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;

            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = audioCtxRef.current || new AudioCtx();
            audioCtxRef.current = ctx;
            if (ctx.state === 'suspended') await ctx.resume();

            const src = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 128;
            src.connect(analyser);
            analyser.connect(ctx.destination);

            const dataArr = new Uint8Array(analyser.frequencyBinCount);
            speechActiveRef.current = true;
            setIsSpeaking(true);

            const tickAnalyser = () => {
              if (!speechActiveRef.current || audio.paused || audio.ended) {
                stopMouthImmediately();
                return;
              }
              analyser.getByteFrequencyData(dataArr);
              let sum = 0;
              for (let i = 1; i < Math.min(20, dataArr.length); i++) sum += dataArr[i];
              const avg = sum / 19;
              setMouthLevel(Math.min(1, Math.max(0, (avg - 8) / 95)));
              rafRef.current = requestAnimationFrame(tickAnalyser);
            };

            await new Promise<void>((resolve) => {
              audio.onended = () => {
                URL.revokeObjectURL(url);
                stopMouthImmediately();
                resolve();
              };
              audio.onerror = () => {
                URL.revokeObjectURL(url);
                stopMouthImmediately();
                resolve();
              };
              void audio.play().then(() => {
                rafRef.current = requestAnimationFrame(tickAnalyser);
              });
            });
            return;
          }
        }
      } catch {
        // Cloud TTS not configured; use browser SpeechSynthesis fallback below
      }

      // Browser SpeechSynthesis fallback (real spoken audio with utterance lifecycle gating)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        await new Promise<void>((resolve) => {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = options?.language || 'en-IN';
          utter.rate = speechRate;
          utter.pitch = 1.02;

          const voices = window.speechSynthesis.getVoices();
          const preferred =
            voices.find((v) => v.lang.toLowerCase().includes('en-in') && /female|neerja|heera|raveena|samantha|google/i.test(v.name)) ||
            voices.find((v) => v.lang.toLowerCase().includes('en-in')) ||
            voices.find((v) => /female|samantha|victoria|karen|zira/i.test(v.name));
          if (preferred) utter.voice = preferred;

          let lastWordPulse = Date.now();
          speechActiveRef.current = true;
          setIsSpeaking(true);

          utter.onboundary = () => {
            lastWordPulse = Date.now();
          };
          utter.onend = () => {
            stopMouthImmediately();
            resolve();
          };
          utter.onerror = () => {
            stopMouthImmediately();
            resolve();
          };

          const tickBoundary = () => {
            if (!speechActiveRef.current || !window.speechSynthesis.speaking) {
              stopMouthImmediately();
              return;
            }
            const age = Date.now() - lastWordPulse;
            // Envelope rises at real utterance word boundaries and closes smoothly between pauses
            const lvl = age < 220 ? 0.45 + 0.4 * Math.abs(Math.sin(Date.now() * 0.022)) : 0.12;
            setMouthLevel(lvl);
            rafRef.current = requestAnimationFrame(tickBoundary);
          };

          window.speechSynthesis.speak(utter);
          rafRef.current = requestAnimationFrame(tickBoundary);

          // Safety timeout if browser speechSynthesis silently drops events
          setTimeout(() => {
            if (speechActiveRef.current && !window.speechSynthesis.speaking) {
              stopMouthImmediately();
              resolve();
            }
          }, Math.max(2500, text.length * 85));
        });
      }
    },
    [muted, stopMouthImmediately, stopSpeaking]
  );

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (
      onTranscript: (finalText: string) => void,
      options?: { language?: string; onInterim?: (text: string) => void; onSilenceTimeout?: () => void }
    ) => {
      setMicError(null);
      const w = window as unknown as Record<string, new () => SpeechRecognitionInstance>;
      const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!Rec) {
        setMicError('Browser microphone speech recognition is unavailable here; use text input below.');
        return;
      }

      stopSpeaking(); // Barge-in support: stop Aira speaking when user listens/speaks
      stopListening();

      try {
        const rec = new Rec();
        rec.lang = options?.language || 'en-IN';
        rec.continuous = false;
        rec.interimResults = true;
        recognitionRef.current = rec;
        setIsListening(true);

        if (options?.onSilenceTimeout) {
          silenceTimerRef.current = window.setTimeout(() => {
            options.onSilenceTimeout?.();
          }, 6500);
        }

        rec.onresult = (ev) => {
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          // Immediate barge-in stop if audio is playing
          stopSpeaking();
          let interim = '';
          let finalStr = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) finalStr += res[0].transcript;
            else interim += res[0].transcript;
          }
          if (interim && options?.onInterim) options.onInterim(interim);
          if (finalStr.trim()) {
            setIsListening(false);
            onTranscript(finalStr.trim());
          }
        };

        rec.onerror = (ev) => {
          setIsListening(false);
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            setMicError('Microphone permission was denied. You can continue using text chat below.');
          } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
            setMicError(`Microphone status: ${ev.error}. Text input remains active.`);
          }
        };

        rec.onend = () => {
          setIsListening(false);
        };

        rec.start();
      } catch {
        setIsListening(false);
        setMicError('Could not start microphone capture; please use text input.');
      }
    },
    [stopListening, stopSpeaking]
  );

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
    };
  }, [stopListening, stopSpeaking]);

  return {
    isSpeaking,
    isListening,
    mouthLevel,
    micSupported,
    micError,
    muted,
    setMuted,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
  };
}
