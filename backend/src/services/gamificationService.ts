import { query, queryOne, execute } from '../config/database';

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

interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  total_points: number;
  messages_sent: number;
  current_streak: number;
  avatar_initial: string;
}

class GamificationService {
  /**
   * Record agent activity and update daily stats
   */
  async recordMessageSent(agentId: string, responseTimeMs?: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Upsert daily stats
    await execute(`
      INSERT INTO agent_daily_stats (agent_id, stat_date, messages_sent, avg_response_time_ms, points_earned)
      VALUES ($1, $2, 1, $3, 10)
      ON CONFLICT (agent_id, stat_date) DO UPDATE SET
        messages_sent = agent_daily_stats.messages_sent + 1,
        avg_response_time_ms = CASE
          WHEN $3 IS NOT NULL THEN
            COALESCE((agent_daily_stats.avg_response_time_ms * agent_daily_stats.messages_sent + $3) / (agent_daily_stats.messages_sent + 1), $3)
          ELSE agent_daily_stats.avg_response_time_ms
        END,
        points_earned = agent_daily_stats.points_earned + 10,
        updated_at = NOW()
    `, [agentId, today, responseTimeMs]);

    // Add points transaction
    await this.addPoints(agentId, 10, 'message_sent');

    // Update streak
    await this.updateStreak(agentId);

    // Check for new achievements
    await this.checkAchievements(agentId);
  }

  /**
   * Record conversation handled
   */
  async recordConversationHandled(agentId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await execute(`
      INSERT INTO agent_daily_stats (agent_id, stat_date, conversations_handled, points_earned)
      VALUES ($1, $2, 1, 25)
      ON CONFLICT (agent_id, stat_date) DO UPDATE SET
        conversations_handled = agent_daily_stats.conversations_handled + 1,
        points_earned = agent_daily_stats.points_earned + 25,
        updated_at = NOW()
    `, [agentId, today]);

    await this.addPoints(agentId, 25, 'conversation_handled');
  }

  /**
   * Record first response in a conversation
   */
  async recordFirstResponse(agentId: string, responseTimeMs: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Bonus points for fast response (under 1 minute)
    const bonusPoints = responseTimeMs < 60000 ? 50 : 20;

    await execute(`
      INSERT INTO agent_daily_stats (agent_id, stat_date, first_response_count, points_earned)
      VALUES ($1, $2, 1, $3)
      ON CONFLICT (agent_id, stat_date) DO UPDATE SET
        first_response_count = agent_daily_stats.first_response_count + 1,
        points_earned = agent_daily_stats.points_earned + $3,
        updated_at = NOW()
    `, [agentId, today, bonusPoints]);

    await this.addPoints(agentId, bonusPoints, responseTimeMs < 60000 ? 'fast_first_response' : 'first_response');
  }

  /**
   * Update agent streak
   */
  async updateStreak(agentId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const streak = await queryOne(`
      SELECT * FROM agent_streaks WHERE agent_id = $1
    `, [agentId]);

    if (!streak) {
      // Create new streak record
      await execute(`
        INSERT INTO agent_streaks (agent_id, current_streak, longest_streak, last_activity_date, streak_start_date)
        VALUES ($1, 1, 1, $2, $2)
      `, [agentId, today]);
      return;
    }

    const lastActivity = streak.last_activity_date;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastActivity === today) {
      // Already recorded today, no change
      return;
    } else if (lastActivity === yesterdayStr) {
      // Consecutive day - increase streak
      const newStreak = streak.current_streak + 1;
      const newLongest = Math.max(newStreak, streak.longest_streak);

      await execute(`
        UPDATE agent_streaks SET
          current_streak = $1,
          longest_streak = $2,
          last_activity_date = $3,
          updated_at = NOW()
        WHERE agent_id = $4
      `, [newStreak, newLongest, today, agentId]);

      // Bonus points for streak milestones
      if (newStreak === 7) {
        await this.addPoints(agentId, 100, 'week_streak_bonus');
      } else if (newStreak === 30) {
        await this.addPoints(agentId, 500, 'month_streak_bonus');
      }
    } else {
      // Streak broken - reset
      await execute(`
        UPDATE agent_streaks SET
          current_streak = 1,
          last_activity_date = $1,
          streak_start_date = $1,
          updated_at = NOW()
        WHERE agent_id = $2
      `, [today, agentId]);
    }
  }

  /**
   * Add points with transaction record
   */
  async addPoints(agentId: string, points: number, reason: string, referenceType?: string, referenceId?: string): Promise<void> {
    await execute(`
      INSERT INTO points_transactions (agent_id, points, reason, reference_type, reference_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [agentId, points, reason, referenceType, referenceId]);
  }

  /**
   * Check and award achievements
   */
  async checkAchievements(agentId: string): Promise<Achievement[]> {
    const newAchievements: Achievement[] = [];

    // Get agent's total stats
    const stats = await queryOne(`
      SELECT
        COALESCE(SUM(messages_sent), 0) as total_messages,
        COALESCE(SUM(conversations_handled), 0) as total_conversations,
        COALESCE(AVG(avg_response_time_ms), 0) as avg_response_time
      FROM agent_daily_stats
      WHERE agent_id = $1
    `, [agentId]);

    const streak = await queryOne(`
      SELECT current_streak, longest_streak FROM agent_streaks WHERE agent_id = $1
    `, [agentId]);

    // Get all achievements not yet earned by this agent
    const unearnedAchievements = await query(`
      SELECT a.* FROM achievements a
      WHERE a.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM agent_achievements aa
        WHERE aa.achievement_id = a.id AND aa.agent_id = $1
      )
    `, [agentId]);

    for (const achievement of unearnedAchievements) {
      let earned = false;

      switch (achievement.criteria_type) {
        case 'messages_sent':
          earned = stats.total_messages >= achievement.criteria_value;
          break;
        case 'conversations_handled':
          earned = stats.total_conversations >= achievement.criteria_value;
          break;
        case 'avg_response_ms':
          earned = stats.avg_response_time > 0 && stats.avg_response_time <= achievement.criteria_value;
          break;
        case 'streak_days':
          earned = (streak?.current_streak || 0) >= achievement.criteria_value;
          break;
      }

      if (earned) {
        await execute(`
          INSERT INTO agent_achievements (agent_id, achievement_id)
          VALUES ($1, $2)
          ON CONFLICT (agent_id, achievement_id) DO NOTHING
        `, [agentId, achievement.id]);

        await this.addPoints(agentId, achievement.points, `achievement_${achievement.code}`, 'achievement', achievement.id);

        newAchievements.push({
          id: achievement.id,
          code: achievement.code,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          color: achievement.color,
          points: achievement.points,
          earned_at: new Date().toISOString()
        });
      }
    }

    return newAchievements;
  }

  /**
   * Get agent's complete stats
   */
  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    const result = await queryOne(`
      SELECT
        u.id as agent_id,
        u.name as agent_name,
        COALESCE((SELECT SUM(points) FROM points_transactions WHERE agent_id = u.id), 0) as total_points,
        COALESCE(s.current_streak, 0) as current_streak,
        COALESCE(s.longest_streak, 0) as longest_streak,
        COALESCE((SELECT SUM(messages_sent) FROM agent_daily_stats WHERE agent_id = u.id), 0) as messages_sent,
        COALESCE((SELECT SUM(conversations_handled) FROM agent_daily_stats WHERE agent_id = u.id), 0) as conversations_handled,
        COALESCE((SELECT AVG(avg_response_time_ms) FROM agent_daily_stats WHERE agent_id = u.id AND avg_response_time_ms IS NOT NULL), 0) as avg_response_time_ms,
        COALESCE((SELECT COUNT(*) FROM agent_achievements WHERE agent_id = u.id), 0) as achievements_count
      FROM users u
      LEFT JOIN agent_streaks s ON s.agent_id = u.id
      WHERE u.id = $1
    `, [agentId]);

    return result;
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(period: 'daily' | 'weekly' | 'monthly' | 'all' = 'weekly', limit: number = 10): Promise<LeaderboardEntry[]> {
    let dateFilter = '';
    switch (period) {
      case 'daily':
        dateFilter = `AND ads.stat_date = CURRENT_DATE`;
        break;
      case 'weekly':
        dateFilter = `AND ads.stat_date >= CURRENT_DATE - INTERVAL '7 days'`;
        break;
      case 'monthly':
        dateFilter = `AND ads.stat_date >= CURRENT_DATE - INTERVAL '30 days'`;
        break;
      case 'all':
        dateFilter = '';
        break;
    }

    const results = await query(`
      SELECT
        u.id as agent_id,
        u.name as agent_name,
        UPPER(LEFT(u.name, 1)) as avatar_initial,
        COALESCE(SUM(ads.points_earned), 0) as total_points,
        COALESCE(SUM(ads.messages_sent), 0) as messages_sent,
        COALESCE(s.current_streak, 0) as current_streak
      FROM users u
      LEFT JOIN agent_daily_stats ads ON ads.agent_id = u.id ${dateFilter}
      LEFT JOIN agent_streaks s ON s.agent_id = u.id
      WHERE u.role IN ('agent', 'admin')
      GROUP BY u.id, u.name, s.current_streak
      ORDER BY total_points DESC, messages_sent DESC
      LIMIT $1
    `, [limit]);

    return results.map((r: any, index: number) => ({
      ...r,
      rank: index + 1,
      total_points: parseInt(r.total_points) || 0,
      messages_sent: parseInt(r.messages_sent) || 0,
      current_streak: parseInt(r.current_streak) || 0
    }));
  }

  /**
   * Get agent's achievements
   */
  async getAgentAchievements(agentId: string): Promise<{ earned: Achievement[]; available: Achievement[] }> {
    const earned = await query(`
      SELECT a.*, aa.earned_at
      FROM achievements a
      JOIN agent_achievements aa ON aa.achievement_id = a.id
      WHERE aa.agent_id = $1
      ORDER BY aa.earned_at DESC
    `, [agentId]);

    const available = await query(`
      SELECT a.*
      FROM achievements a
      WHERE a.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM agent_achievements aa
        WHERE aa.achievement_id = a.id AND aa.agent_id = $1
      )
      ORDER BY a.points ASC
    `, [agentId]);

    return { earned, available };
  }

  /**
   * Get active challenges
   */
  async getActiveChallenges(agentId?: string): Promise<any[]> {
    const challenges = await query(`
      SELECT
        tc.*,
        CASE WHEN cp.agent_id IS NOT NULL THEN TRUE ELSE FALSE END as is_participating,
        cp.current_value as my_progress
      FROM team_challenges tc
      LEFT JOIN challenge_participants cp ON cp.challenge_id = tc.id AND cp.agent_id = $1
      WHERE tc.status = 'active' AND tc.end_date > NOW()
      ORDER BY tc.end_date ASC
    `, [agentId]);

    return challenges;
  }

  /**
   * Join a challenge
   */
  async joinChallenge(challengeId: string, agentId: string): Promise<boolean> {
    try {
      await execute(`
        INSERT INTO challenge_participants (challenge_id, agent_id)
        VALUES ($1, $2)
        ON CONFLICT (challenge_id, agent_id) DO NOTHING
      `, [challengeId, agentId]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get points history
   */
  async getPointsHistory(agentId: string, limit: number = 50): Promise<any[]> {
    return query(`
      SELECT * FROM points_transactions
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [agentId, limit]);
  }
}

export const gamificationService = new GamificationService();
