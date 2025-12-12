'use client';

import { useEffect, useState } from 'react';
import { Trophy, Star, Flame, Zap, Crown, Clock, MessageSquare, Users, Award, X } from 'lucide-react';

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  points: number;
}

interface AchievementToastProps {
  achievements: Achievement[];
  onDismiss: () => void;
}

const iconMap: { [key: string]: any } = {
  'trophy': Trophy,
  'medal': Award,
  'flame': Flame,
  'zap': Zap,
  'crown': Crown,
  'star': Star,
  'clock': Clock,
  'message-circle': MessageSquare,
  'users': Users,
  'award': Award,
};

const colorMap: { [key: string]: string } = {
  'gold': 'from-yellow-400 to-yellow-600',
  'blue': 'from-blue-400 to-blue-600',
  'green': 'from-green-400 to-green-600',
  'purple': 'from-purple-400 to-purple-600',
  'orange': 'from-orange-400 to-orange-600',
  'teal': 'from-teal-400 to-teal-600',
  'yellow': 'from-yellow-400 to-amber-600',
};

export default function AchievementToast({ achievements, onDismiss }: AchievementToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (achievements.length > 0) {
      // Animate in
      setTimeout(() => setIsVisible(true), 100);

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [achievements, onDismiss]);

  if (achievements.length === 0) return null;

  const achievement = achievements[currentIndex];
  const IconComponent = iconMap[achievement.icon] || Trophy;
  const gradientClass = colorMap[achievement.color] || colorMap['gold'];

  return (
    <div
      className={`fixed top-4 right-4 z-[100] transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm">
        {/* Header with gradient */}
        <div className={`bg-gradient-to-r ${gradientClass} px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 text-white">
            <Star className="h-5 w-5 animate-pulse" />
            <span className="font-bold text-sm">Achievement Unlocked!</span>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="text-white/80 hover:text-white p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white shadow-lg animate-bounce`}>
            <IconComponent className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">{achievement.name}</h3>
            <p className="text-sm text-gray-500">{achievement.description}</p>
            <div className="mt-1 flex items-center gap-1">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-bold text-yellow-600">+{achievement.points} points</span>
            </div>
          </div>
        </div>

        {/* Multiple achievements indicator */}
        {achievements.length > 1 && (
          <div className="px-4 pb-3 flex items-center justify-center gap-1">
            {achievements.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentIndex ? 'bg-gray-800' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
