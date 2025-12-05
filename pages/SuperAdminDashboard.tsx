import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, Users, TrendingUp, AlertTriangle, 
  Clock, DollarSign, ChevronRight, LogOut,
  RefreshCw, Crown, UserCheck, UserX
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/super-admin/overview', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        onLogout();
        navigate('/super-admin/login');
        return;
      }

      const text = await response.text();
      if (!text) {
        throw new Error('Server returned empty response');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid server response');
      }

      setStats(data.stats);
      setRecentSignups(data.recentSignups || []);
      setExpiringTrials(data.expiringTrials || []);
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

  const getDaysUntil = (dateString: string) => {
    const diff = new Date(dateString).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
          <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
              <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-400" />
              </div>
              <span className="text-2xl font-bold text-white">${stats?.mrr?.toFixed(2) || '0.00'}</span>
            </div>
            <p className="text-gray-400">Monthly Recurring Revenue</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-400" />
              </div>
              <span className="text-2xl font-bold text-white">{stats?.totalStudents || 0}</span>
            </div>
            <p className="text-gray-400">Total Students</p>
            <div className="mt-2 text-sm">
              <span className="text-cyan-400">{stats?.premiumParents || 0} premium parents</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-red-600/20 rounded-lg flex items-center justify-center">
                <UserX className="w-6 h-6 text-red-400" />
              </div>
              <span className="text-2xl font-bold text-white">{stats?.churnedClubs || 0}</span>
            </div>
            <p className="text-gray-400">Churned Clubs</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    to={`/super-admin/clubs/${club.id}`}
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
                    to={`/super-admin/clubs/${club.id}`}
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
        </div>
      </main>
    </div>
  );
};
