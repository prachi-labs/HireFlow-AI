import React, { useEffect, useState } from 'react';

export type AiraAvatarState =
  | 'Idle'
  | 'Greeting'
  | 'Listening'
  | 'Thinking'
  | 'Speaking'
  | 'Smiling'
  | 'Processing'
  | 'Error';

interface AiraAvatarProps {
  state: AiraAvatarState;
  mouthLevel?: number; // 0..1 driven by real output audio ONLY
  isAudioPlaying?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AiraAvatar({
  state,
  mouthLevel = 0,
  isAudioPlaying = false,
  className = '',
  size = 'md',
}: AiraAvatarProps) {
  const [blinkPhase, setBlinkPhase] = useState<'open' | 'half' | 'closed'>('open');

  // Random natural blinking every 2-6 seconds
  useEffect(() => {
    let active = true;
    let timer: number;

    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 4000;
      timer = window.setTimeout(() => {
        if (!active) return;
        setBlinkPhase('half');
        window.setTimeout(() => {
          if (!active) return;
          setBlinkPhase('closed');
          window.setTimeout(() => {
            if (!active) return;
            setBlinkPhase('half');
            window.setTimeout(() => {
              if (!active) return;
              setBlinkPhase('open');
              scheduleBlink();
            }, 45);
          }, 75);
        }, 45);
      }, delay);
    };

    scheduleBlink();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Mouth MUST never move unless real audio is actively playing
  const activeMouth = isAudioPlaying && state === 'Speaking' ? Math.max(0, Math.min(1, mouthLevel)) : 0;

  const sizeClass =
    size === 'sm' ? 'w-44 h-48' : size === 'lg' ? 'w-80 h-[22rem]' : 'w-60 h-64';

  const eyeClosureScale = blinkPhase === 'closed' ? 1 : blinkPhase === 'half' ? 0.55 : 0;

  const stateBorderGlow =
    state === 'Listening'
      ? 'ring-2 ring-[#39C98A]/60 shadow-[0_0_32px_rgba(57,201,138,0.22)]'
      : state === 'Speaking' || state === 'Greeting'
        ? 'ring-2 ring-[#C26A8A]/70 shadow-[0_0_36px_rgba(194,106,138,0.28)]'
        : state === 'Thinking' || state === 'Processing'
          ? 'ring-2 ring-[#E8B45C]/60 shadow-[0_0_28px_rgba(232,180,92,0.2)]'
          : state === 'Error'
            ? 'ring-2 ring-[#EF6677]/65'
            : 'ring-1 ring-white/15';

  return (
    <div
      className={`relative select-none overflow-hidden rounded-2xl bg-gradient-to-b from-[#2B0D1A]/75 via-[#1A1017] to-[#10090D] ${sizeClass} ${stateBorderGlow} transition-shadow duration-200 ${className}`}
      data-aira-state={state}
      data-mouth-active={activeMouth > 0.05 ? 'true' : 'false'}
    >
      {/* Subtle studio burgundy ambient rim light */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 46% 35%, rgba(123,41,72,0.45) 0%, rgba(43,13,26,0.2) 55%, transparent 80%)',
        }}
      />

      {/* Breathing torso + face wrapper */}
      <div
        className="relative h-full w-full"
        style={{
          animation: 'airaBreathe 4.2s ease-in-out infinite',
          transformOrigin: '50% 90%',
        }}
      >
        <img
          src="/assets/aira-avatar-bust.png"
          alt="Aira AI Recruiter"
          className="h-full w-full object-contain object-bottom pointer-events-none"
          draggable={false}
        />

        {/* Phase 1 Eyelid Blinking Overlays aligned to measured eye coordinates */}
        {eyeClosureScale > 0 && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full"
              style={{
                left: '25.9%',
                top: '31.1%',
                width: '6.6%',
                height: `${3.8 * eyeClosureScale}%`,
                transform: 'rotate(-8deg)',
                background: 'linear-gradient(180deg, #C78C6E 0%, #DFAA8D 85%, #4A2921 100%)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full"
              style={{
                left: '38.4%',
                top: '27.9%',
                width: '6.9%',
                height: `${3.8 * eyeClosureScale}%`,
                transform: 'rotate(-8deg)',
                background: 'linear-gradient(180deg, #C78C6E 0%, #DFAA8D 85%, #4A2921 100%)',
              }}
            />
          </>
        )}

        {/* Phase 1 Audio-Driven Lip-Sync Aperture Layer (only active during real playback) */}
        {activeMouth > 0.04 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: '33.6%',
              top: '39.4%',
              width: '7.6%',
              height: `${1.1 + activeMouth * 2.2}%`,
              transform: 'rotate(-8deg)',
              borderRadius: '42% 42% 55% 55%',
              background: 'radial-gradient(ellipse at 50% 45%, #3B1218 0%, #642129 68%, rgba(204,104,98,0.85) 100%)',
              boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.45)',
              opacity: Math.min(0.92, 0.35 + activeMouth * 0.65),
              transition: 'height 55ms linear, opacity 65ms linear',
            }}
          />
        )}
      </div>

      {/* State label footer */}
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-medium tracking-wide text-[#C8B9C0]">
        <span className="rounded-md bg-[#10090D]/80 px-2 py-0.5 backdrop-blur-md border border-white/10">
          Aira · {state}
        </span>
        {state === 'Listening' && (
          <span className="text-[#39C98A] font-medium">Mic Active</span>
        )}
      </div>

      <style>{`
        @keyframes airaBreathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.006); }
        }
      `}</style>
    </div>
  );
}
