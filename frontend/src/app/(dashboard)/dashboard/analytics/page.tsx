'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { analytics, accounts as accountsApi } from '@/lib/api';
import {
  BarChart3,
  MessageSquare,
  Users,
  Clock,
  TrendingUp,
  Bot,
} from 'lucide-react';
import { format, subDays } from 'date-fns';

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [overview, setOverview] = useState<any>(null);
  const [agentStats, setAgentStats] = useState<any[]>([]);
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [hourlyStats, setHourlyStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (!token) return;
    loadAccounts();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadAnalytics();
  }, [token, selectedAccount, dateRange]);

  const loadAccounts = async () => {
    try {
      const { accounts: accs } = await accountsApi.list(token!);
      setAccounts(accs);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const [overviewRes, agentsRes, dailyRes, hourlyRes] = await Promise.all([
        analytics.getOverview(token!, {
          accountId: selectedAccount || undefined,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }),
        analytics.getByAgent(token!, {
          startDate: dateRange.start,
          endDate: dateRange.end,
        }),
        analytics.getByDay(token!, {
          accountId: selectedAccount || undefined,
          days: 30,
        }),
        analytics.getHourlyActivity(token!, selectedAccount || undefined),
      ]);

      setOverview(overviewRes.overview);
      setAgentStats(agentsRes.agents || []);
      setDailyStats(dailyRes.days || []);
      setHourlyStats(hourlyRes.hours || []);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatResponseTime = (ms: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const StatCard = ({ title, value, icon: Icon, subtitle, color }: any) => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color || 'bg-blue-100'}`}>
          <Icon className={`h-6 w-6 ${color ? 'text-white' : 'text-blue-600'}`} />
        </div>
      </div>
    </div>
  );

  if (isLoading && !overview) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-500">Track your messaging performance</p>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name || acc.phone_number || 'Unnamed'}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Overview Stats */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Total Messages"
              value={overview.total_messages?.toLocaleString() || 0}
              icon={MessageSquare}
              subtitle={`${overview.messages_sent || 0} sent / ${overview.messages_received || 0} received`}
            />
            <StatCard
              title="Conversations"
              value={overview.total_conversations?.toLocaleString() || 0}
              icon={Users}
              color="bg-green-500"
            />
            <StatCard
              title="Avg Response Time"
              value={formatResponseTime(overview.avg_response_time_ms)}
              icon={Clock}
              color="bg-purple-500"
            />
            <StatCard
              title="Auto Replies"
              value={overview.auto_replies?.toLocaleString() || 0}
              icon={Bot}
              subtitle={`${((overview.auto_replies / overview.messages_sent) * 100 || 0).toFixed(1)}% of sent`}
              color="bg-orange-500"
            />
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Daily Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Activity (Last 30 Days)</h3>
            <div className="h-64 flex items-end space-x-1">
              {dailyStats.slice(-30).map((day, i) => {
                const maxVal = Math.max(...dailyStats.map(d => d.messages_sent + d.messages_received));
                const height = maxVal > 0 ? ((day.messages_sent + day.messages_received) / maxVal) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                      title={`${format(new Date(day.date), 'MMM d')}: ${day.messages_sent + day.messages_received} messages`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{dailyStats[0]?.date ? format(new Date(dailyStats[0].date), 'MMM d') : ''}</span>
              <span>{dailyStats[dailyStats.length - 1]?.date ? format(new Date(dailyStats[dailyStats.length - 1].date), 'MMM d') : ''}</span>
            </div>
          </div>

          {/* Hourly Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Hourly Activity</h3>
            <div className="h-64 flex items-end space-x-1">
              {Array.from({ length: 24 }, (_, hour) => {
                const hourData = hourlyStats.find(h => h.hour === hour);
                const count = hourData?.messages || 0;
                const maxVal = Math.max(...hourlyStats.map(h => h.messages || 0));
                const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-green-500 rounded-t"
                      style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                      title={`${hour}:00 - ${count} messages`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
          </div>
        </div>

        {/* Agent Performance */}
        {agentStats.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b">
                    <th className="pb-3 font-medium">Agent</th>
                    <th className="pb-3 font-medium">Messages Sent</th>
                    <th className="pb-3 font-medium">Conversations</th>
                    <th className="pb-3 font-medium">Avg Response</th>
                    <th className="pb-3 font-medium">Auto Replies</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((agent) => (
                    <tr key={agent.agent_id} className="border-b last:border-0">
                      <td className="py-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {agent.agent_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <span className="font-medium">{agent.agent_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="py-3">{agent.messages_sent?.toLocaleString() || 0}</td>
                      <td className="py-3">{agent.conversations_handled?.toLocaleString() || 0}</td>
                      <td className="py-3">{formatResponseTime(agent.avg_response_time_ms)}</td>
                      <td className="py-3">{agent.auto_replies?.toLocaleString() || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
