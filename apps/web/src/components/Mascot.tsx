"use client";

import React, { useEffect, useRef, useState } from "react";

export type MascotState = "idle" | "typing" | "thinking" | "excited" | "completed" | "error";

interface MascotProps {
  state?: MascotState;
  customMessage?: string;
  className?: string;
}

const DEFAULT_QUOTES = [
  "Hi, I'm Light",
  "Ready to automate tasks",
  "Private & on-device 🛡️",
  "Type your task below 🚀",
];

export function Mascot({ state = "idle", customMessage, className = "" }: MascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);
  const [speechText, setSpeechText] = useState(customMessage || DEFAULT_QUOTES[0]);
  const [isClickExcited, setIsClickExcited] = useState(false);

  // Mouse eye-tracking logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const distance = Math.min(6, Math.hypot(e.clientX - centerX, e.clientY - centerY) / 40);

      const pupilX = Math.cos(angle) * distance;
      const pupilY = Math.sin(angle) * distance;

      if (leftPupilRef.current) {
        leftPupilRef.current.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
      }
      if (rightPupilRef.current) {
        rightPupilRef.current.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Update speech when state or customMessage changes
  useEffect(() => {
    if (customMessage) {
      setSpeechText(customMessage);
      return;
    }
    switch (state) {
      case "typing":
        setSpeechText("Ooh, I see you typing! Let's get this task done ✍️");
        break;
      case "thinking":
        setSpeechText("Analyzing the webpage & planning actions... 🧠");
        break;
      case "excited":
        setSpeechText("Task is running live in your browser! ⚡");
        break;
      case "completed":
        setSpeechText("All done! Here are your results 🎉");
        break;
      case "error":
        setSpeechText("Oops! We hit an obstacle. Let's try again 🛠️");
        break;
      default:
        setSpeechText(DEFAULT_QUOTES[0]);
        break;
    }
  }, [state, customMessage]);

  const handleMascotClick = () => {
    const randomQuote = DEFAULT_QUOTES[Math.floor(Math.random() * DEFAULT_QUOTES.length)];
    setSpeechText(randomQuote);
    setIsClickExcited(true);
    setTimeout(() => setIsClickExcited(false), 2000);
  };

  // Determine mouth path
  let mouthD = "M 88 112 Q 100 122 112 112"; // regular smile
  if (state === "typing" || isClickExcited) {
    mouthD = "M 82 108 Q 100 130 118 108"; // wide excited grin
  } else if (state === "thinking") {
    mouthD = "M 90 114 Q 100 112 110 114"; // concentrated flat smile
  } else if (state === "completed") {
    mouthD = "M 84 108 Q 100 128 116 108"; // happy open smile
  } else if (state === "error") {
    mouthD = "M 88 118 Q 100 108 112 118"; // concerned mouth
  }

  const isExcited = state === "excited" || state === "typing" || isClickExcited;
  const isThinking = state === "thinking";

  return (
    <div
      ref={containerRef}
      onClick={handleMascotClick}
      className={`relative flex flex-col items-center select-none cursor-pointer group ${className}`}
      title="Click me for tips & fun!"
    >
      {/* Speech Bubble */}
      <div className="mascot-speech-card relative mb-2 flex items-center gap-2 rounded-full border border-[rgba(99,102,241,0.4)] bg-[#141724] px-4 py-1.5 text-xs font-semibold text-slate-200 shadow-[0_4px_20px_rgba(99,102,241,0.25)] animate-float-bubble pointer-events-none transition-all">
        <i className="ri-chat-smile-2-fill text-[#06b6d4]" />
        <span>{speechText}</span>
        {/* Pointer Arrow */}
        <div className="mascot-speech-arrow absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#141724]" />
      </div>

      {/* Mascot Character Body */}
      <div
        className={`relative h-[110px] w-[110px] drop-shadow-[0_10px_15px_rgba(99,102,241,0.3)] transition-transform duration-200 group-hover:scale-110 group-hover:rotate-1 ${
          isExcited
            ? "animate-mascot-excited"
            : isThinking
              ? "animate-mascot-thinking"
              : "animate-mascot-hover"
        }`}
      >
        <svg className="h-full w-full" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="robotBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Antenna Glow Orb */}
          <circle cx="100" cy="22" r="10" fill="#06b6d4" filter="url(#glow)" />
          <line x1="100" y1="32" x2="100" y2="52" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" />

          {/* Robot Ears */}
          <rect x="38" y="78" width="12" height="24" rx="6" fill="#475569" />
          <rect x="150" y="78" width="12" height="24" rx="6" fill="#475569" />

          {/* Main Robot Head */}
          <rect
            x="46"
            y="50"
            width="108"
            height="88"
            rx="28"
            fill="url(#robotBodyGrad)"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
          />

          {/* Face Screen */}
          <rect
            x="58"
            y="64"
            width="84"
            height="60"
            rx="18"
            fill="url(#screenGrad)"
            stroke="rgba(99,102,241,0.5)"
            strokeWidth="2"
          />

          {/* Left Eye Socket */}
          <circle cx="82" cy="90" r="14" fill="#ffffff" />
          {/* Left Pupil (Mouse Interactive) */}
          <circle
            ref={leftPupilRef}
            cx="82"
            cy="90"
            r="7"
            fill="#090b10"
            className="transition-transform duration-75"
          />
          <circle cx="80" cy="87" r="3" fill="#ffffff" />

          {/* Right Eye Socket */}
          <circle cx="118" cy="90" r="14" fill="#ffffff" />
          {/* Right Pupil (Mouse Interactive) */}
          <circle
            ref={rightPupilRef}
            cx="118"
            cy="90"
            r="7"
            fill="#090b10"
            className="transition-transform duration-75"
          />
          <circle cx="116" cy="87" r="3" fill="#ffffff" />

          {/* Cheeks */}
          <ellipse cx="70" cy="108" rx="7" ry="4" fill="#ec4899" opacity="0.6" />
          <ellipse cx="130" cy="108" rx="7" ry="4" fill="#ec4899" opacity="0.6" />

          {/* Dynamic Mouth */}
          <path
            d={mouthD}
            stroke="#06b6d4"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            className="transition-all duration-300"
          />

          {/* Hands holding sparkle */}
          <g>
            <circle cx="44" cy="142" r="10" fill="url(#robotBodyGrad)" />
            <circle cx="156" cy="142" r="10" fill="url(#robotBodyGrad)" />
            {/* Sparkle */}
            <path
              d="M 166 130 L 168 134 L 172 136 L 168 138 L 166 142 L 164 138 L 160 136 L 164 134 Z"
              fill="#f59e0b"
            />
          </g>
        </svg>
      </div>

      {/* Ground Shadow */}
      <div className="h-3 w-16 -mt-1 rounded-full bg-black/40 blur-[3px] animate-shadow-pulse" />
    </div>
  );
}
