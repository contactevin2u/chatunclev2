'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { gamification } from '@/lib/api';
import {
  Trophy, Medal, Flame, Zap, Crown, Star, Clock, MessageSquare,
  Users, Award, Target, ChevronRight, RefreshCw
} from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  total_points: number;
  messages_sent: number;
  current_streak: number;
  avatar_initial: string;
}

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  points: number;
  earned_at?: string;
}

interface AgentStats {
  agent_id: string;
  agent_name: string;
  total_points: number;
  current_streak: number;
  longest_streak: number;
  messages_sent: number;
  conversations_handled: number;
  avg_response_time_ms: number;
  achievements_count: number;
}

const iconMap: { [key: string]: any } = {
  'trophy': Trophy,
  'medal': Medal,
  'flame': Flame,
  'zap': Zap,
  'crown': Crown,
  'star': Star,
  'clock': Clock,
  'message-circle': MessageSquare,
  'users': Users,
  'award': Award,
  'target': Target,
};

const colorMap: { [key: string]: string } = {
  'gold': 'text-yellow-500 bg-yellow-100',
  'blue': 'text-blue-500 bg-blue-100',
  'green': 'text-green-500 bg-green-100',
  'purple': 'text-purple-500 bg-purple-100',
  'orange': 'text-orange-500 bg-orange-100',
  'teal': 'text-teal-500 bg-teal-100',
  'yellow': 'text-yellow-600 bg-yellow-100',
};

export default function LeaderboardPage() {
  const { token, user } = useAuth();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('weekly');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<AgentStats | null>(null);
  const [achievements, setAchievements] = useState<{ earned: Achievement[]; available: Achievement[] }>({ earned: [], available: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, period]);

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [leaderboardRes, statsRes, achievementsRes] = await Promise.all([
        gamification.getLeaderboard(token, period, 10),
        gamification.getStats(token),
        gamification.getAchievements(token),
      ]);
      setLeaderboard(leaderboardRes.leaderboard || []);
      setMyStats(statsRes.stats);
      setAchievements(achievementsRes);
    } catch (error) {
      console.error('Failed to load gamification data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatResponseTime = (ms: number) => {
    if (!ms) return '-';
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white';
      case 2: return 'bg-gradient-to-r from-gray-300 to-gray-400 text-white';
      case 3: return 'bg-gradient-to-r from-orange-400 to-orange-500 text-white';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="h-5 w-5" />;
      case 2: return <Medal className="h-5 w-5" />;
      case 3: return <Award className="h-5 w-5" />;
      default: return <span className="text-sm font-bold">{rank}</span>;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="h-7 w-7 text-yellow-500" />
            Leaderboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">Track your performance and earn achievements</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 hover:bg-gray-100 rounded-lg"
          disabled={isLoading}
        >
          <RefreshCw className={`h-5 w-5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* My Stats Card */}
      {myStats && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-green-100 text-sm">Your Stats</p>
              <h2 className="text-2xl font-bold">{myStats.agent_name}</h2>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">{myStats.total_points.toLocaleString()}</p>
              <p className="text-green-100 text-sm">Total Points</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-300" />
                <span className="text-2xl font-bold">{myStats.current_streak}</span>
              </div>
              <p className="text-green-100 text-xs">Day Streak</p>
            </div>
            <div className="bg-white/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-300" />
                <span className="text-2xl font-bold">{myStats.messages_sent.toLocaleString()}</span>
              </div>
              <p className="text-green-100 text-xs">Messages</p>
            </div>
            <div className="bg-white/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-300" />
                <span className="text-2xl font-bold">{myStats.conversations_handled}</span>
              </div>
              <p className="text-green-100 text-xs">Conversations</p>
            </div>
            <div className="bg-white/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-300" />
                <span className="text-2xl font-bold">{formatResponseTime(myStats.avg_response_time_ms)}</span>
              </div>
              <p className="text-green-100 text-xs">Avg Response</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Rankings</h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['daily', 'weekly', 'monthly', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      period === p
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-gray-300" />
                <p>Loading leaderboard...</p>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Trophy className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No data yet. Start sending messages!</p>
              </div>
            ) : (
              leaderboard.map((entry) => (
                <div
                  key={entry.agent_id}
                  className={`flex items-center gap-4 p-4 ${
                    entry.agent_id === user?.id ? 'bg-green-50' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getRankStyle(entry.rank)}`}>
                    {getRankIcon(entry.rank)}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                    {entry.avatar_initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {entry.agent_name}
                      {entry.agent_id === user?.id && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">You</span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {entry.messages_sent}
                      </span>
                      {entry.current_streak > 0 && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <Flame className="h-3 w-3" />
                          {entry.current_streak}d
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{entry.total_points.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">points</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Achievements */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Achievements
            </h3>
          </div>

          <div className="p-4 space-y-4">
            {/* Earned */}
            {achievements.earned.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Earned ({achievements.earned.length})</p>
                <div className="space-y-2">
                  {achievements.earned.map((achievement) => {
                    const IconComponent = iconMap[achievement.icon] || Trophy;
                    const colorClass = colorMap[achievement.color] || colorMap['gold'];
                    return (
                      <div key={achievement.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{achievement.name}</p>
                          <p className="text-xs text-gray-500 truncate">{achievement.description}</p>
                        </div>
                        <span className="text-xs font-bold text-yellow-600">+{achievement.points}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available */}
            {achievements.available.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Available ({achievements.available.length})</p>
                <div className="space-y-2">
                  {achievements.available.slice(0, 5).map((achievement) => {
                    const IconComponent = iconMap[achievement.icon] || Trophy;
                    return (
                      <div key={achievement.id} className="flex items-center gap-3 p-2 bg-gray-50/50 rounded-lg opacity-60">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 text-gray-400">
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-600 text-sm">{achievement.name}</p>
                          <p className="text-xs text-gray-400 truncate">{achievement.description}</p>
                        </div>
                        <span className="text-xs font-medium text-gray-400">+{achievement.points}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {achievements.earned.length === 0 && achievements.available.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Award className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No achievements yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
