import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, Search, Filter, ChevronRight, Crown, LogOut,
  RefreshCw, Eye, Users, Calendar, DollarSign, Clock, 
  Mail, Percent, X, Heart, AlertTriangle, Download
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
  healthScore?: number;
  riskLevel?: string;
  issues?: string[];
}

interface SuperAdminClubsProps {
  token: string;
  onLogout: () => void;
  onImpersonate: (clubId: string) => void;
}

type ModalType = 'extend' | 'discount' | 'email' | null;

export const SuperAdminClubs: React.FC<SuperAdminClubsProps> = ({ token, onLogout, onImpersonate }) => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [trialFilter, setTrialFilter] = useState('');
  const [showHealthScores, setShowHealthScores] = useState(false);
  const navigate = useNavigate();

  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [extendDays, setExtendDays] = useState(7);
  const [extendReason, setExtendReason] = useState('');
  const [discountPercent, setDiscountPercent] = useState(20);
  const [discountDuration, setDiscountDuration] = useState('once');
  const [emailTemplate, setEmailTemplate] = useState('trial-ending');

  const fetchClubs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (trialFilter) params.set('trial_status', trialFilter);

      const [clubsRes, healthRes] = await Promise.all([
        fetch(`/api/super-admin/clubs?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        showHealthScores ? fetch('/api/super-admin/health', {
          headers: { 'Authorization': `Bearer ${token}` }
        }) : Promise.resolve(null)
      ]);

      if (clubsRes.status === 401) {
        onLogout();
        navigate('/super-admin/login');
        return;
      }

      const clubsData = await clubsRes.json();
      let healthData = null;
      if (healthRes) {
        healthData = await healthRes.json();
      }

      let clubsList = clubsData.clubs || [];
      
      if (healthData?.clubs) {
        const healthMap = new Map(healthData.clubs.map((c: any) => [c.id, c]));
        clubsList = clubsList.map((club: Club) => {
          const health = healthMap.get(club.id) as Record<string, any> | undefined;
          return health ? { ...club, ...health } : club;
        });
      }

      setClubs(clubsList);
      setTotal(clubsData.total || 0);
    } catch (err) {
      console.error('Failed to fetch clubs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClubs();
  }, [token, statusFilter, trialFilter, showHealthScores]);

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

      if (data.success && data.token) {
        localStorage.setItem('impersonationToken', data.token);
        localStorage.setItem('impersonationClubId', clubId);
        onImpersonate(clubId);
      } else {
        alert(data.error || 'Failed to start impersonation session');
      }
    } catch (err) {
      console.error('Failed to impersonate:', err);
      alert('Failed to start impersonation session. Network error.');
    }
  };

  const openModal = (type: ModalType, club: Club) => {
    setSelectedClub(club);
    setModalType(type);
    setActionMessage(null);
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedClub(null);
    setActionMessage(null);
    setExtendDays(7);
    setExtendReason('');
    setDiscountPercent(20);
    setDiscountDuration('once');
    setEmailTemplate('trial-ending');
  };

  const handleExtendTrial = async () => {
    if (!selectedClub) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/super-admin/extend-trial', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clubId: selectedClub.id,
          days: extendDays,
          reason: extendReason || 'Support extension'
        })
      });

      const data = await response.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `Trial extended by ${extendDays} days!` });
        fetchClubs();
        setTimeout(closeModal, 2000);
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to extend trial' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!selectedClub) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/super-admin/apply-discount', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clubId: selectedClub.id,
          percentOff: discountPercent,
          duration: discountDuration,
          reason: 'Support discount'
        })
      });

      const data = await response.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `${discountPercent}% discount applied!` });
        setTimeout(closeModal, 2000);
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to apply discount' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedClub) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/super-admin/send-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clubId: selectedClub.id,
          template: emailTemplate
        })
      });

      const data = await response.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `Email sent to ${data.recipient}!` });
        setTimeout(closeModal, 2000);
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to send email' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-600/20 text-red-400';
      case 'at-risk': return 'bg-orange-600/20 text-orange-400';
      case 'warning': return 'bg-yellow-600/20 text-yellow-400';
      default: return 'bg-green-600/20 text-green-400';
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/super-admin/export/clubs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Export failed');
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clubs-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">All Clubs</h2>
            <p className="text-gray-400">{total} total clubs</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => setShowHealthScores(!showHealthScores)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showHealthScores 
                  ? 'bg-pink-600 hover:bg-pink-700 text-white' 
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              <Heart className="w-4 h-4" />
              Health Scores
            </button>
            <button
              onClick={fetchClubs}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
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
                  {showHealthScores && (
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Health</th>
                  )}
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Students</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Plan</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Joined</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={showHealthScores ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading...
                    </td>
                  </tr>
                ) : clubs.length === 0 ? (
                  <tr>
                    <td colSpan={showHealthScores ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
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
                          {club.trial_status === 'active' ? (
                            <span className="text-xs px-2 py-1 rounded-full inline-block w-fit bg-yellow-600/20 text-yellow-400">
                              In Trial
                            </span>
                          ) : club.trial_status === 'converted' ? (
                            <span className="text-xs px-2 py-1 rounded-full inline-block w-fit bg-green-600/20 text-green-400">
                              Paying
                            </span>
                          ) : club.trial_status === 'expired' ? (
                            <span className="text-xs px-2 py-1 rounded-full inline-block w-fit bg-red-600/20 text-red-400">
                              Expired
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full inline-block w-fit bg-gray-600/20 text-gray-400">
                              {club.trial_status || 'Unknown'}
                            </span>
                          )}
                          {club.status === 'churned' && (
                            <span className="text-xs px-2 py-1 rounded-full inline-block w-fit bg-red-600/20 text-red-400">
                              Churned
                            </span>
                          )}
                        </div>
                      </td>
                      {showHealthScores && (
                        <td className="px-4 py-4">
                          {club.healthScore !== undefined ? (
                            <div>
                              <span className={`text-xs px-2 py-1 rounded-full ${getRiskBadgeColor(club.riskLevel || 'healthy')}`}>
                                {club.healthScore}
                              </span>
                              {club.issues && club.issues.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1 max-w-[150px] truncate" title={club.issues.join(', ')}>
                                  {club.issues[0]}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      )}
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
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openModal('extend', club)}
                            className="p-2 hover:bg-blue-600/20 rounded-lg text-blue-400 hover:text-blue-300 transition-colors"
                            title="Extend Trial"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openModal('discount', club)}
                            className="p-2 hover:bg-green-600/20 rounded-lg text-green-400 hover:text-green-300 transition-colors"
                            title="Apply Discount"
                          >
                            <Percent className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openModal('email', club)}
                            className="p-2 hover:bg-purple-600/20 rounded-lg text-purple-400 hover:text-purple-300 transition-colors"
                            title="Send Email"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewAs(club.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View As
                          </button>
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

      {/* Extend Trial Modal */}
      {modalType === 'extend' && selectedClub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                Extend Trial
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-400 mb-4">Extending trial for <span className="text-white font-medium">{selectedClub.name}</span></p>
            
            {actionMessage && (
              <div className={`p-3 rounded-lg mb-4 ${
                actionMessage.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {actionMessage.text}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Days to Extend</label>
                <select
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Reason (optional)</label>
                <input
                  type="text"
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="e.g., Customer requested more time"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExtendTrial}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Extending...' : `Extend by ${extendDays} Days`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Discount Modal */}
      {modalType === 'discount' && selectedClub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Percent className="w-5 h-5 text-green-400" />
                Apply Discount
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-400 mb-4">Applying discount for <span className="text-white font-medium">{selectedClub.name}</span></p>
            
            {actionMessage && (
              <div className={`p-3 rounded-lg mb-4 ${
                actionMessage.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {actionMessage.text}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Discount Percentage</label>
                <select
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value={10}>10% off</option>
                  <option value={15}>15% off</option>
                  <option value={20}>20% off</option>
                  <option value={25}>25% off</option>
                  <option value={30}>30% off</option>
                  <option value={50}>50% off</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Duration</label>
                <select
                  value={discountDuration}
                  onChange={(e) => setDiscountDuration(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="once">One-time (first payment)</option>
                  <option value="repeating">3 months</option>
                  <option value="forever">Forever</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyDiscount}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Applying...' : `Apply ${discountPercent}% Discount`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {modalType === 'email' && selectedClub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-purple-400" />
                Send Email
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-400 mb-4">Sending email to <span className="text-white font-medium">{selectedClub.owner_email}</span></p>
            
            {actionMessage && (
              <div className={`p-3 rounded-lg mb-4 ${
                actionMessage.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {actionMessage.text}
              </div>
            )}
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email Template</label>
              <select
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="trial-ending">Trial Ending Soon</option>
                <option value="win_back">We Miss You (Win-back)</option>
                <option value="churn-risk">Need Help? (Churn Risk)</option>
              </select>
              
              <p className="text-sm text-gray-500 mt-3">
                {emailTemplate === 'trial-ending' && 'Reminds the user their trial is ending and encourages upgrade.'}
                {emailTemplate === 'win_back' && 'Offers 25% discount for 3 months to churned or inactive users.'}
                {emailTemplate === 'churn-risk' && 'Offers help and support to at-risk users.'}
              </p>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
