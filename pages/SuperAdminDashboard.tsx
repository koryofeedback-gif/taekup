import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, Users, TrendingUp, AlertTriangle, 
  Clock, DollarSign, ChevronRight, LogOut,
  RefreshCw, Crown, UserCheck, UserX, Activity,
  Heart, CreditCard, Download, Mail, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

interface OverviewStats {
  totalClubs: number;
  trialClubs: number;
  activeClubs: number;
  churnedClubs: number;
  totalStudents: number;
  premiumParents: number;
  mrr: number;
}

interface RevenueData {
  mrrTrend: { date: string; mrr: number }[];
  currentMrr: number;
  churnRate: number;
  conversionRate: number;
  totalTrials: number;
  convertedTrials: number;
  newMrr: number;
  churnedMrr: number;
}

interface ActivityItem {
  id: string;
  event_type: string;
  event_title: string;
  event_description: string;
  club_name: string;
  actor_email: string;
  created_at: string;
}

interface HealthClub {
  id: string;
  name: string;
  owner_email: string;
  healthScore: number;
  riskLevel: string;
  issues: string[];
  daysSinceLogin: number | null;
  student_count: number;
}

interface Club {
  id: string;
  name: string;
  owner_email: string;
  trial_status: string;
  status: string;
  created_at: string;
  trial_end: string;
}

interface SuperAdminDashboardProps {
  token: string;
  onLogout: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ token, onLogout }) => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recentSignups, setRecentSignups] = useState<Club[]>([]);
  const [expiringTrials, setExpiringTrials] = useState<Club[]>([]);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [healthClubs, setHealthClubs] = useState<HealthClub[]>([]);
  const [healthSummary, setHealthSummary] = useState({ healthy: 0, warning: 0, atRisk: 0, critical: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'health' | 'activity'>('overview');
  const navigate = useNavigate();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [overviewRes, revenueRes, activityRes, healthRes] = await Promise.all([
        fetch('/api/super-admin/overview', { headers }),
        fetch('/api/super-admin/revenue', { headers }),
        fetch('/api/super-admin/activity?limit=10', { headers }),
        fetch('/api/super-admin/health-scores', { headers })
      ]);

      if (overviewRes.status === 401) {
        onLogout();
        navigate('/super-admin/login');
        return;
      }

      const [overviewData, revenueData, activityData, healthData] = await Promise.all([
        overviewRes.json(),
        revenueRes.ok ? revenueRes.json() : null,
        activityRes.ok ? activityRes.json() : null,
        healthRes.ok ? healthRes.json() : null
      ]);

      setStats(overviewData.stats);
      setRecentSignups(overviewData.recentSignups || []);
      setExpiringTrials(overviewData.expiringTrials || []);
      
      if (revenueData) setRevenue(revenueData);
      if (activityData) setActivities(activityData.activities || []);
      if (healthData) {
        setHealthClubs(healthData.clubs || []);
        setHealthSummary(healthData.summary || { healthy: 0, warning: 0, atRisk: 0, critical: 0 });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysUntil = (dateString: string) => {
    const diff = new Date(dateString).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-600/20 text-red-400 border-red-500/30';
      case 'at-risk': return 'bg-orange-600/20 text-orange-400 border-orange-500/30';
      case 'warning': return 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-green-600/20 text-green-400 border-green-500/30';
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'trial_extended': return <Clock className="w-4 h-4 text-blue-400" />;
      case 'discount_applied': return <DollarSign className="w-4 h-4 text-green-400" />;
      case 'email_sent': return <Mail className="w-4 h-4 text-purple-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const MRRChart = () => {
    if (!revenue?.mrrTrend?.length) return null;
    
    const validTrend = revenue.mrrTrend.filter(d => d && typeof d.mrr === 'number');
    if (!validTrend.length) return null;
    
    const maxMrr = Math.max(...validTrend.map(d => d.mrr || 0), 1);
    const chartHeight = 120;
    
    return (
      <div className="relative h-32">
        <div className="absolute inset-0 flex items-end justify-between gap-1">
          {validTrend.slice(-30).map((point, i) => {
            const mrrValue = point.mrr || 0;
            const height = (mrrValue / maxMrr) * chartHeight;
            return (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                style={{ height: `${Math.max(height, 2)}px` }}
                title={`$${mrrValue.toFixed(2)} on ${point.date || 'N/A'}`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading && !stats) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Super Admin</h1>
              <p className="text-xs text-gray-400">TaekUp Control Center</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-6">
            <Link to="/super-admin/dashboard" className="text-purple-400 font-medium">Dashboard</Link>
            <Link to="/super-admin/clubs" className="text-gray-400 hover:text-white">Clubs</Link>
            <Link to="/super-admin/parents" className="text-gray-400 hover:text-white">Parents</Link>
            <Link to="/super-admin/payments" className="text-gray-400 hover:text-white">Payments</Link>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-gray-400 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
            <p className="text-gray-400 text-sm mt-1">Real-time business metrics and insights</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/api/super-admin/export/clubs"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Clubs
            </a>
            <a
              href="/api/super-admin/export/revenue"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Revenue
            </a>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-400" />
              </div>
              <span className="text-2xl font-bold text-white">${revenue?.currentMrr?.toFixed(2) || stats?.mrr?.toFixed(2) || '0.00'}</span>
            </div>
            <p className="text-gray-400">Monthly Recurring Revenue</p>
            {revenue && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                {revenue.newMrr > 0 && (
                  <span className="text-green-400 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />+${revenue.newMrr.toFixed(2)}
                  </span>
                )}
                {revenue.churnedMrr > 0 && (
                  <span className="text-red-400 flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" />-${revenue.churnedMrr.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-2xl font-bold text-white">{stats?.totalClubs || 0}</span>
            </div>
            <p className="text-gray-400">Total Clubs</p>
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className="text-yellow-400">{stats?.trialClubs || 0} trial</span>
              <span className="text-green-400">{stats?.activeClubs || 0} active</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-cyan-600/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-cyan-400" />
              </div>
              <span className="text-2xl font-bold text-white">{revenue?.conversionRate || 0}%</span>
            </div>
            <p className="text-gray-400">Trial Conversion Rate</p>
            <div className="mt-2 text-sm text-gray-500">
              {revenue?.convertedTrials || 0} of {revenue?.totalTrials || 0} trials converted
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-red-600/20 rounded-lg flex items-center justify-center">
                <UserX className="w-6 h-6 text-red-400" />
              </div>
              <span className="text-2xl font-bold text-white">{revenue?.churnRate || 0}%</span>
            </div>
            <p className="text-gray-400">Monthly Churn Rate</p>
            <div className="mt-2 text-sm">
              <span className="text-red-400">{stats?.churnedClubs || 0} churned clubs</span>
            </div>
          </div>
        </div>

        {/* MRR Trend Chart */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              MRR Trend (Last 30 Days)
            </h3>
          </div>
          <MRRChart />
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Health Scores Summary */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-400" />
              Club Health Scores
            </h3>
            <Link to="/super-admin/clubs" className="text-purple-400 text-sm hover:underline">
              View Details
            </Link>
          </div>
          
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-green-900/20 rounded-lg border border-green-500/30">
              <div className="text-2xl font-bold text-green-400">{healthSummary.healthy}</div>
              <div className="text-sm text-gray-400">Healthy</div>
            </div>
            <div className="text-center p-4 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
              <div className="text-2xl font-bold text-yellow-400">{healthSummary.warning}</div>
              <div className="text-sm text-gray-400">Warning</div>
            </div>
            <div className="text-center p-4 bg-orange-900/20 rounded-lg border border-orange-500/30">
              <div className="text-2xl font-bold text-orange-400">{healthSummary.atRisk}</div>
              <div className="text-sm text-gray-400">At Risk</div>
            </div>
            <div className="text-center p-4 bg-red-900/20 rounded-lg border border-red-500/30">
              <div className="text-2xl font-bold text-red-400">{healthSummary.critical}</div>
              <div className="text-sm text-gray-400">Critical</div>
            </div>
          </div>

          {/* At-Risk Clubs List */}
          {healthClubs.filter(c => c.riskLevel === 'critical' || c.riskLevel === 'at-risk').length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 mb-2">Clubs Needing Attention:</p>
              {healthClubs
                .filter(c => c.riskLevel === 'critical' || c.riskLevel === 'at-risk')
                .slice(0, 5)
                .map(club => (
                  <div key={club.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                    <div>
                      <p className="font-medium text-white">{club.name}</p>
                      <p className="text-xs text-gray-400">{club.issues.join(' • ')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${getRiskBadgeColor(club.riskLevel)}`}>
                        Score: {club.healthScore}
                      </span>
                      <Link 
                        to="/super-admin/clubs" 
                        className="text-purple-400 hover:text-purple-300"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Signups */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-green-400" />
                Recent Signups
              </h3>
              <Link to="/super-admin/clubs" className="text-purple-400 text-sm hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-gray-700">
              {recentSignups.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No signups yet</div>
              ) : (
                recentSignups.map((club) => (
                  <Link
                    key={club.id}
                    to="/super-admin/clubs"
                    className="flex items-center justify-between p-4 hover:bg-gray-700/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-white">{club.name}</p>
                      <p className="text-sm text-gray-400">{club.owner_email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">{formatDate(club.created_at)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        club.trial_status === 'active' 
                          ? 'bg-yellow-600/20 text-yellow-400'
                          : club.trial_status === 'converted'
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-red-600/20 text-red-400'
                      }`}>
                        {club.trial_status}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                Recent Activity
              </h3>
            </div>
            <div className="divide-y divide-gray-700 max-h-80 overflow-y-auto">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No recent activity</div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">{getEventIcon(activity.event_type)}</div>
                      <div className="flex-1">
                        <p className="text-white text-sm">{activity.event_title}</p>
                        {activity.club_name && (
                          <p className="text-gray-400 text-xs">{activity.club_name}</p>
                        )}
                        <p className="text-gray-500 text-xs mt-1">
                          {formatDate(activity.created_at)} at {formatTime(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Expiring Trials */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                Expiring Trials
              </h3>
            </div>
            <div className="divide-y divide-gray-700">
              {expiringTrials.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No expiring trials</div>
              ) : (
                expiringTrials.map((club) => (
                  <Link
                    key={club.id}
                    to="/super-admin/clubs"
                    className="flex items-center justify-between p-4 hover:bg-gray-700/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-white">{club.name}</p>
                      <p className="text-sm text-gray-400">{club.owner_email}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${
                        getDaysUntil(club.trial_end) <= 1 ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {getDaysUntil(club.trial_end)} days left
                      </p>
                      <p className="text-xs text-gray-500">Expires {formatDate(club.trial_end)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                Platform Stats
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Total Students</span>
                <span className="text-white font-medium">{stats?.totalStudents || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Premium Parents</span>
                <span className="text-cyan-400 font-medium">{stats?.premiumParents || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Active Clubs</span>
                <span className="text-green-400 font-medium">{stats?.activeClubs || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Trial Clubs</span>
                <span className="text-yellow-400 font-medium">{stats?.trialClubs || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Churned Clubs</span>
                <span className="text-red-400 font-medium">{stats?.churnedClubs || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
