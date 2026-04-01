import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Crown, LogOut, RefreshCw, CreditCard, Download,
  CheckCircle, XCircle, Clock, AlertTriangle, DollarSign
} from 'lucide-react';

interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  description: string;
  customerEmail: string;
  createdAt: string;
  failureMessage: string | null;
}

interface SuperAdminPaymentsProps {
  token: string;
  onLogout: () => void;
}

export const SuperAdminPayments: React.FC<SuperAdminPaymentsProps> = ({ token, onLogout }) => {
  const [stripeCharges, setStripeCharges] = useState<StripeCharge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/super-admin/payments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        onLogout();
        navigate('/super-admin/login');
        return;
      }

      const data = await response.json();
      setStripeCharges(data.stripeCharges || []);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [token]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status: string, paid?: boolean) => {
    if (paid === true || status === 'paid' || status === 'succeeded') {
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    }
    if (status === 'failed' || status === 'unpaid') {
      return <XCircle className="w-4 h-4 text-red-400" />;
    }
    if (status === 'pending' || status === 'open') {
      return <Clock className="w-4 h-4 text-yellow-400" />;
    }
    return <AlertTriangle className="w-4 h-4 text-gray-400" />;
  };

  const getStatusColor = (status: string, paid?: boolean) => {
    if (paid === true || status === 'paid' || status === 'succeeded') {
      return 'bg-green-600/20 text-green-400';
    }
    if (status === 'failed' || status === 'unpaid') {
      return 'bg-red-600/20 text-red-400';
    }
    if (status === 'pending' || status === 'open') {
      return 'bg-yellow-600/20 text-yellow-400';
    }
    return 'bg-gray-600/20 text-gray-400';
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/super-admin/export/revenue', {
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
      a.download = `revenue-export-${new Date().toISOString().split('T')[0]}.csv`;
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
            <Link to="/super-admin/clubs" className="text-gray-400 hover:text-white">Clubs</Link>
            <Link to="/super-admin/parents" className="text-gray-400 hover:text-white">Parents</Link>
            <Link to="/super-admin/payments" className="text-purple-400 font-medium">Payments</Link>
            <Link to="/super-admin/analytics" className="text-gray-400 hover:text-white">Analytics</Link>
            <Link to="/super-admin/training" className="text-gray-400 hover:text-white">Training</Link>
            <Link to="/super-admin/broadcast" className="text-gray-400 hover:text-white">Broadcast</Link>
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
            <h2 className="text-2xl font-bold text-white">Payment History</h2>
            <p className="text-gray-400">All Stripe charges</p>
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
              onClick={fetchPayments}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Customer</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Amount</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Date</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Charge ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading...
                    </td>
                  </tr>
                ) : stripeCharges.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No Stripe charges found
                    </td>
                  </tr>
                ) : (
                  stripeCharges.map((charge) => (
                    <tr key={charge.id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm text-white">{charge.description || 'Subscription'}</p>
                          <p className="text-sm text-gray-400">{charge.customerEmail || 'Unknown'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-white font-medium">
                          <DollarSign className="w-4 h-4 text-green-400" />
                          {charge.amount.toFixed(2)} {charge.currency?.toUpperCase()}
                        </div>
                        {charge.refunded && (
                          <span className="text-xs text-red-400">Refunded</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(charge.status, charge.paid)}
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(charge.status, charge.paid)}`}>
                            {charge.paid ? 'Paid' : charge.status}
                          </span>
                        </div>
                        {charge.failureMessage && (
                          <p className="text-xs text-red-400 mt-1">{charge.failureMessage}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-400 text-sm">
                        {formatDate(charge.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-gray-500 text-xs font-mono">
                        {charge.id.slice(0, 20)}...
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
