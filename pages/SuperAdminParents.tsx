import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Users, Search, Crown, LogOut, RefreshCw, 
  AlertTriangle, Star, Clock
} from 'lucide-react';

interface Parent {
  id: string;
  student_name: string;
  parent_email: string;
  parent_name: string;
  parent_phone: string;
  premium_status: 'none' | 'club_sponsored' | 'parent_paid';
  last_class_at: string;
  total_points: number;
  belt: string;
  club_name: string;
  club_id: string;
  days_since_last_class: number;
}

interface SuperAdminParentsProps {
  token: string;
  onLogout: () => void;
}

export const SuperAdminParents: React.FC<SuperAdminParentsProps> = ({ token, onLogout }) => {
  const [parents, setParents] = useState<Parent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const navigate = useNavigate();

  const fetchParents = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (premiumOnly) params.set('premium_only', 'true');
      if (atRiskOnly) params.set('at_risk', 'true');

      const response = await fetch(`/api/super-admin/parents?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        onLogout();
        navigate('/super-admin/login');
        return;
      }

      const data = await response.json();
      setParents(data.parents || []);
    } catch (err) {
      console.error('Failed to fetch parents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, [token, premiumOnly, atRiskOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchParents();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPremiumBadge = (status: string) => {
    switch (status) {
      case 'parent_paid':
        return <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded-full">Premium</span>;
      case 'club_sponsored':
        return <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded-full">Sponsored</span>;
      default:
        return <span className="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs rounded-full">Free</span>;
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
            <Link to="/super-admin/clubs" className="text-gray-400 hover:text-white">Clubs</Link>
            <Link to="/super-admin/parents" className="text-purple-400 font-medium">Parents</Link>
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
            <h2 className="text-2xl font-bold text-white">Parents & Students</h2>
            <p className="text-gray-400">Monitor engagement and premium status</p>
          </div>
          <button
            onClick={fetchParents}
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
                  placeholder="Search by parent/student name or email..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            
            <button
              onClick={() => setPremiumOnly(!premiumOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                premiumOnly
                  ? 'bg-green-600/20 border-green-500 text-green-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Star className="w-4 h-4" />
              Premium Only
            </button>
            
            <button
              onClick={() => setAtRiskOnly(!atRiskOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                atRiskOnly
                  ? 'bg-red-600/20 border-red-500 text-red-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              At Risk (14+ days)
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Student</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Parent</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Club</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Belt / XP</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Last Class</th>
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
                ) : parents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No parents found
                    </td>
                  </tr>
                ) : (
                  parents.map((parent) => (
                    <tr key={parent.id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">{parent.student_name}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-white">{parent.parent_name || '-'}</p>
                          <p className="text-sm text-gray-400">{parent.parent_email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          to={`/super-admin/clubs/${parent.club_id}`}
                          className="text-purple-400 hover:underline"
                        >
                          {parent.club_name}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        {getPremiumBadge(parent.premium_status)}
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-white">{parent.belt || 'White'}</p>
                          <p className="text-sm text-cyan-400">{parent.total_points || 0} XP</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className={`${
                          parent.days_since_last_class > 14 
                            ? 'text-red-400' 
                            : parent.days_since_last_class > 7
                            ? 'text-yellow-400'
                            : 'text-gray-300'
                        }`}>
                          <p>{formatDate(parent.last_class_at)}</p>
                          {parent.days_since_last_class > 0 && (
                            <p className="text-sm flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {Math.round(parent.days_since_last_class)} days ago
                            </p>
                          )}
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
