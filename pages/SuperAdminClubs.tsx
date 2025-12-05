import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, Search, Filter, ChevronRight, Crown, LogOut,
  RefreshCw, Eye, Users, Calendar, DollarSign
} from 'lucide-react';

interface Club {
  id: string;
  name: string;
  owner_email: string;
  owner_name: string;
  trial_status: 'active' | 'expired' | 'converted';
  status: 'active' | 'churned' | 'paused';
  created_at: string;
  trial_end: string;
  student_count: number;
  coach_count: number;
  subscription_status: string;
  plan_name: string;
  monthly_amount: number;
}

interface SuperAdminClubsProps {
  token: string;
  onLogout: () => void;
  onImpersonate: (clubId: string) => void;
}

export const SuperAdminClubs: React.FC<SuperAdminClubsProps> = ({ token, onLogout, onImpersonate }) => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [trialFilter, setTrialFilter] = useState('');
  const navigate = useNavigate();

  const fetchClubs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (trialFilter) params.set('trial_status', trialFilter);

      const response = await fetch(`/api/super-admin/clubs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        onLogout();
        navigate('/super-admin/login');
        return;
      }

      const data = await response.json();
      setClubs(data.clubs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch clubs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClubs();
  }, [token, statusFilter, trialFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClubs();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleViewAs = async (clubId: string) => {
    try {
      const response = await fetch('/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clubId, reason: 'Support access' })
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem('impersonationToken', data.token);
        localStorage.setItem('impersonationClubId', clubId);
        onImpersonate(clubId);
      }
    } catch (err) {
      console.error('Failed to impersonate:', err);
    }
  };

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
            <Link to="/super-admin/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
            <Link to="/super-admin/clubs" className="text-purple-400 font-medium">Clubs</Link>
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">All Clubs</h2>
            <p className="text-gray-400">{total} total clubs</p>
          </div>
          <button
            onClick={fetchClubs}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6">
          <div className="p-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="churned">Churned</option>
              <option value="paused">Paused</option>
            </select>
            
            <select
              value={trialFilter}
              onChange={(e) => setTrialFilter(e.target.value)}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Trials</option>
              <option value="active">Trial Active</option>
              <option value="expired">Trial Expired</option>
              <option value="converted">Converted</option>
            </select>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Club</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Students</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Plan</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Joined</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading...
                    </td>
                  </tr>
                ) : clubs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No clubs found
                    </td>
                  </tr>
                ) : (
                  clubs.map((club) => (
                    <tr key={club.id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-white">{club.name}</p>
                          <p className="text-sm text-gray-400">{club.owner_email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-1 rounded-full inline-block w-fit ${
                            club.trial_status === 'active'
                              ? 'bg-yellow-600/20 text-yellow-400'
                              : club.trial_status === 'converted'
                              ? 'bg-green-600/20 text-green-400'
                              : 'bg-red-600/20 text-red-400'
                          }`}>
                            {club.trial_status}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full inline-block w-fit ${
                            club.status === 'active'
                              ? 'bg-blue-600/20 text-blue-400'
                              : club.status === 'churned'
                              ? 'bg-red-600/20 text-red-400'
                              : 'bg-gray-600/20 text-gray-400'
                          }`}>
                            {club.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-gray-300">
                          <Users className="w-4 h-4" />
                          {club.student_count || 0}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {club.plan_name ? (
                          <div>
                            <p className="text-white">{club.plan_name}</p>
                            <p className="text-sm text-green-400">${(club.monthly_amount || 0) / 100}/mo</p>
                          </div>
                        ) : (
                          <span className="text-gray-500">No plan</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-400 text-sm">
                        {formatDate(club.created_at)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewAs(club.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View As
                          </button>
                          <Link
                            to={`/super-admin/clubs/${club.id}`}
                            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
