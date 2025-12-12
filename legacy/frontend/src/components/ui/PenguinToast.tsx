'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface PenguinToastProps {
  onDismiss: () => void;
}

const motivationalMessages = [
  { text: "You're crushing it! 🔥", subtext: "Keep those messages flowing!" },
  { text: "Sales superstar! ⭐", subtext: "Your customers love you!" },
  { text: "On fire today! 🚀", subtext: "Nothing can stop you!" },
  { text: "Amazing work! 💪", subtext: "You're making magic happen!" },
  { text: "Keep going! 🎯", subtext: "Every message counts!" },
  { text: "You're a legend! 👑", subtext: "Top performer energy!" },
  { text: "Fantastic pace! ⚡", subtext: "Speed + quality = you!" },
  { text: "Killing it! 🏆", subtext: "Champion vibes only!" },
  { text: "Unstoppable! 💥", subtext: "Watch out, world!" },
  { text: "Pure excellence! ✨", subtext: "Your dedication shows!" },
  { text: "Wow, impressive! 🌟", subtext: "You make it look easy!" },
  { text: "Sales machine! 🤖", subtext: "Efficiency level: MAX!" },
  { text: "Customer hero! 🦸", subtext: "Saving the day, one chat at a time!" },
  { text: "Momentum! 🌊", subtext: "Ride that wave!" },
  { text: "Beast mode! 🐯", subtext: "Absolutely dominating!" },
];

const penguinExpressions = [
  "🐧", // Classic penguin
  "(・∀・)🐧", // Happy penguin
  "🐧✨", // Sparkle penguin
  "🐧💪", // Strong penguin
  "🐧🎉", // Party penguin
];

export default function PenguinToast({ onDismiss }: PenguinToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [message] = useState(() =>
    motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)]
  );
  const [penguin] = useState(() =>
    penguinExpressions[Math.floor(Math.random() * penguinExpressions.length)]
  );

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 100);

    // Auto-dismiss after 4 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, 4000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-24 md:bottom-6 left-4 z-[100] transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100 scale-100' : '-translate-x-full opacity-0 scale-95'
      }`}
    >
      <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl shadow-2xl overflow-hidden max-w-xs animate-bounce-subtle">
        {/* Penguin bubble */}
        <div className="relative px-4 py-3">
          {/* Close button */}
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="absolute top-2 right-2 text-white/70 hover:text-white p-1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3">
            {/* Penguin avatar */}
            <div className="flex-shrink-0 w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-3xl animate-wiggle">
              {penguin}
            </div>

            {/* Message */}
            <div className="flex-1 pr-4">
              <p className="font-bold text-white text-lg leading-tight">
                {message.text}
              </p>
              <p className="text-white/80 text-sm">
                {message.subtext}
              </p>
            </div>
          </div>

          {/* Fun decorative elements */}
          <div className="absolute -top-1 -right-1 text-2xl animate-spin-slow">❄️</div>
          <div className="absolute -bottom-1 -left-1 text-xl opacity-50">🧊</div>
        </div>
      </div>
    </div>
  );
}
