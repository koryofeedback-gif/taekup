import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, Users, AlertTriangle, DollarSign, Target,
  Zap, RefreshCw, ChevronDown, ChevronUp, BarChart3,
  Clock, Filter, Download, Crown, LogOut
} from 'lucide-react';

interface CohortData {
  cohort_month: string;
  total_signups: number;
  converted: number;
  churned: number;
  still_trial: number;
  conversion_rate: number;
  churn_rate: number;
}

interface LTVData {
  cohort_month: string;
  total_revenue: number;
  club_count: number;
  avg_ltv: number;
}

interface OnboardingFunnel {
  total_started: number;
  step1_completed: number;
  step2_completed: number;
  step3_completed: number;
  step4_completed: number;
  step5_completed: number;
  step6_completed: number;
  wizard_completed: number;
  avg_time_seconds: number;
}

interface ChurnBreakdown {
  category: string;
  count: number;
  avg_rating: number;
  would_recommend: number;
}

interface PaymentRecoveryStats {
  total_attempts: number;
  recovered_count: number;
  recovered_amount: number;
  recovery_rate: number;
}

interface MRRGoal {
  id: string;
  month: string;
  target_mrr: number;
  notes: string;
}

interface AutomationRule {
  id: string;
  rule_type: string;
  name: string;
  description: string;
  is_active: boolean;
  slack_enabled: boolean;
  email_enabled: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
}

const API_BASE = '/api/super-admin';

export default function SuperAdminAnalytics() {
  const [activeTab, setActiveTab] = useState<'cohorts' | 'onboarding' | 'churn' | 'recovery' | 'goals' | 'automations'>('cohorts');
  const [loading, setLoading] = useState(false);
  
  const [cohorts, setCohorts] = useState<CohortData[]>([]);
  const [ltvData, setLtvData] = useState<LTVData[]>([]);
  
  const [funnel, setFunnel] = useState<OnboardingFunnel | null>(null);
  const [incompleteOnboardings, setIncompleteOnboardings] = useState<any[]>([]);
  
  const [churnBreakdown, setChurnBreakdown] = useState<ChurnBreakdown[]>([]);
  const [recentChurns, setRecentChurns] = useState<any[]>([]);
  
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [recoveryStats, setRecoveryStats] = useState<PaymentRecoveryStats | null>(null);
  
  const [mrrGoals, setMrrGoals] = useState<MRRGoal[]>([]);
  const [currentMrr, setCurrentMrr] = useState(0);
  const [newGoal, setNewGoal] = useState({ month: '', targetMrr: 0, notes: '' });
  
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);

  const fetchData = async (endpoint: string) => {
    const token = localStorage.getItem('superAdminToken');
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
    return response.json();
  };

  const loadCohorts = async () => {
    setLoading(true);
    try {
      const data = await fetchData('cohorts');
      setCohorts(data.cohorts || []);
      setLtvData(data.ltvByCohort || []);
    } catch (error) {
      console.error('Error loading cohorts:', error);
    }
    setLoading(false);
  };

  const loadOnboarding = async () => {
    setLoading(true);
    try {
      const data = await fetchData('onboarding');
      setFunnel(data.funnel || null);
      setIncompleteOnboardings(data.incomplete || []);
    } catch (error) {
      console.error('Error loading onboarding:', error);
    }
    setLoading(false);
  };

  const loadChurnReasons = async () => {
    setLoading(true);
    try {
      const data = await fetchData('churn-reasons');
      setChurnBreakdown(data.breakdown || []);
      setRecentChurns(data.recent || []);
    } catch (error) {
      console.error('Error loading churn reasons:', error);
    }
    setLoading(false);
  };

  const loadPaymentRecovery = async () => {
    setLoading(true);
    try {
      const data = await fetchData('payment-recovery');
      setFailedPayments(data.failedPayments || []);
      setRecoveryStats(data.stats || null);
    } catch (error) {
      console.error('Error loading payment recovery:', error);
    }
    setLoading(false);
  };

  const loadMrrGoals = async () => {
    setLoading(true);
    try {
      const data = await fetchData('mrr-goals');
      setMrrGoals(data.goals || []);
      setCurrentMrr(data.currentMrr || 0);
    } catch (error) {
      console.error('Error loading MRR goals:', error);
    }
    setLoading(false);
  };

  const loadAutomations = async () => {
    setLoading(true);
    try {
      const data = await fetchData('automations');
      setAutomations(data.rules || []);
      setExecutions(data.executions || []);
    } catch (error) {
      console.error('Error loading automations:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    switch (activeTab) {
      case 'cohorts': loadCohorts(); break;
      case 'onboarding': loadOnboarding(); break;
      case 'churn': loadChurnReasons(); break;
      case 'recovery': loadPaymentRecovery(); break;
      case 'goals': loadMrrGoals(); break;
      case 'automations': loadAutomations(); break;
    }
  }, [activeTab]);

  const toggleAutomation = async (id: string, field: 'isActive' | 'slackEnabled' | 'emailEnabled', value: boolean) => {
    const token = localStorage.getItem('superAdminToken');
    await fetch(`${API_BASE}/automations/${id}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ [field]: value })
    });
    loadAutomations();
  };

  const saveGoal = async () => {
    if (!newGoal.month || !newGoal.targetMrr) return;
    const token = localStorage.getItem('superAdminToken');
    await fetch(`${API_BASE}/mrr-goals`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newGoal)
    });
    setNewGoal({ month: '', targetMrr: 0, notes: '' });
    loadMrrGoals();
  };

  const tabs = [
    { id: 'cohorts', label: 'Cohort Analytics', icon: BarChart3 },
    { id: 'onboarding', label: 'Onboarding Funnel', icon: Users },
    { id: 'churn', label: 'Churn Analysis', icon: AlertTriangle },
    { id: 'recovery', label: 'Payment Recovery', icon: DollarSign },
    { id: 'goals', label: 'MRR Goals', icon: Target },
    { id: 'automations', label: 'Automations', icon: Zap }
  ];

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const churnCategoryLabels: Record<string, string> = {
    'too_expensive': 'Too Expensive',
    'missing_features': 'Missing Features',
    'switched_competitor': 'Switched to Competitor',
    'closed_business': 'Closed Business',
    'not_enough_time': 'Not Enough Time',
    'technical_issues': 'Technical Issues',
    'poor_support': 'Poor Support',
    'other': 'Other'
  };

  const stepLabels = ['Club Info', 'Belt System', 'Skills', 'Scoring', 'People', 'Branding'];

  const handleLogout = () => {
    localStorage.removeItem('superAdminToken');
    localStorage.removeItem('superAdminEmail');
    window.location.href = '/super-admin/login';
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
            <Link to="/super-admin/payments" className="text-gray-400 hover:text-white">Payments</Link>
            <Link to="/super-admin/analytics" className="text-purple-400 font-medium">Analytics</Link>
            <Link to="/super-admin/training" className="text-gray-400 hover:text-white">Training</Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-gray-400 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 text-white">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Advanced Analytics</h2>
            <p className="text-gray-400">Deep insights into platform performance</p>
          </div>
          <button
            onClick={() => {
              switch (activeTab) {
                case 'cohorts': loadCohorts(); break;
                case 'onboarding': loadOnboarding(); break;
                case 'churn': loadChurnReasons(); break;
                case 'recovery': loadPaymentRecovery(); break;
                case 'goals': loadMrrGoals(); break;
                case 'automations': loadAutomations(); break;
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id 
                  ? 'bg-cyan-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw size={32} className="animate-spin text-cyan-400" />
          </div>
        )}

        {!loading && activeTab === 'cohorts' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Monthly Cohort Retention</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-3">Cohort</th>
                      <th className="pb-3">Signups</th>
                      <th className="pb-3">Converted</th>
                      <th className="pb-3">Churned</th>
                      <th className="pb-3">In Trial</th>
                      <th className="pb-3">Conv. Rate</th>
                      <th className="pb-3">Churn Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((cohort, i) => (
                      <tr key={i} className="border-b border-gray-700/50">
                        <td className="py-3 font-medium">{cohort.cohort_month}</td>
                        <td className="py-3">{cohort.total_signups}</td>
                        <td className="py-3 text-green-400">{cohort.converted}</td>
                        <td className="py-3 text-red-400">{cohort.churned}</td>
                        <td className="py-3 text-yellow-400">{cohort.still_trial}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-sm ${
                            cohort.conversion_rate >= 30 ? 'bg-green-500/20 text-green-400' :
                            cohort.conversion_rate >= 15 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {cohort.conversion_rate}%
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-sm ${
                            cohort.churn_rate <= 10 ? 'bg-green-500/20 text-green-400' :
                            cohort.churn_rate <= 25 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {cohort.churn_rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Lifetime Value by Cohort</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-3">Cohort</th>
                      <th className="pb-3">Clubs</th>
                      <th className="pb-3">Total Revenue</th>
                      <th className="pb-3">Avg LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ltvData.map((data, i) => (
                      <tr key={i} className="border-b border-gray-700/50">
                        <td className="py-3 font-medium">{data.cohort_month}</td>
                        <td className="py-3">{data.club_count}</td>
                        <td className="py-3">{formatCurrency(data.total_revenue)}</td>
                        <td className="py-3 text-cyan-400">{formatCurrency(data.avg_ltv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'onboarding' && funnel && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Setup Wizard Funnel</h2>
              <div className="space-y-4">
                {stepLabels.map((label, i) => {
                  const stepKey = `step${i + 1}_completed` as keyof OnboardingFunnel;
                  const completed = funnel[stepKey] as number || 0;
                  const percentage = funnel.total_started > 0 
                    ? Math.round((completed / funnel.total_started) * 100) 
                    : 0;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-32 text-gray-300">Step {i + 1}: {label}</div>
                      <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="w-20 text-right">
                        <span className="text-lg font-semibold">{completed}</span>
                        <span className="text-gray-400 text-sm ml-1">({percentage}%)</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 pt-4 border-t border-gray-700">
                  <div className="w-32 text-green-400 font-semibold">Completed</div>
                  <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full"
                      style={{ width: `${funnel.total_started > 0 ? Math.round((funnel.wizard_completed / funnel.total_started) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="w-20 text-right">
                    <span className="text-lg font-semibold text-green-400">{funnel.wizard_completed}</span>
                    <span className="text-gray-400 text-sm ml-1">
                      ({funnel.total_started > 0 ? Math.round((funnel.wizard_completed / funnel.total_started) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  Avg. Time: {Math.round((funnel.avg_time_seconds || 0) / 60)} minutes
                </div>
                <div>
                  Total Started: {funnel.total_started}
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Incomplete Onboardings</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-3">Club</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Last Step</th>
                      <th className="pb-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incompleteOnboardings.map((club, i) => (
                      <tr key={i} className="border-b border-gray-700/50">
                        <td className="py-3 font-medium">{club.name}</td>
                        <td className="py-3 text-gray-400">{club.owner_email}</td>
                        <td className="py-3">
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-sm">
                            Step {club.last_active_step}: {stepLabels[club.last_active_step - 1]}
                          </span>
                        </td>
                        <td className="py-3 text-gray-400">
                          {new Date(club.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'churn' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Churn Reasons Breakdown</h2>
              {churnBreakdown.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No churn data collected yet</p>
              ) : (
                <div className="space-y-4">
                  {churnBreakdown.map((reason, i) => {
                    const maxCount = Math.max(...churnBreakdown.map(r => r.count));
                    const percentage = Math.round((reason.count / maxCount) * 100);
                    return (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-40 text-gray-300">{churnCategoryLabels[reason.category] || reason.category}</div>
                        <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-red-600 to-orange-400 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="w-16 text-right font-semibold">{reason.count}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Recent Churn Feedback</h2>
              {recentChurns.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No feedback collected yet</p>
              ) : (
                <div className="space-y-4">
                  {recentChurns.map((churn, i) => (
                    <div key={i} className="p-4 bg-gray-700/50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium">{churn.club_name || 'Unknown Club'}</span>
                          <span className="text-gray-400 ml-2">{churn.owner_email}</span>
                        </div>
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-sm">
                          {churnCategoryLabels[churn.category] || churn.category}
                        </span>
                      </div>
                      {churn.additional_feedback && (
                        <p className="text-gray-300 mt-2">{churn.additional_feedback}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-sm text-gray-400">
                        {churn.rating && <span>Rating: {churn.rating}/5</span>}
                        {churn.would_recommend !== null && (
                          <span>Would recommend: {churn.would_recommend ? 'Yes' : 'No'}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && activeTab === 'recovery' && (
          <div className="space-y-6">
            {recoveryStats && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-xl p-6">
                  <p className="text-gray-400 text-sm mb-1">Total Attempts</p>
                  <p className="text-2xl font-bold">{recoveryStats.total_attempts}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-6">
                  <p className="text-gray-400 text-sm mb-1">Recovered</p>
                  <p className="text-2xl font-bold text-green-400">{recoveryStats.recovered_count}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-6">
                  <p className="text-gray-400 text-sm mb-1">Amount Recovered</p>
                  <p className="text-2xl font-bold text-cyan-400">{formatCurrency(recoveryStats.recovered_amount)}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-6">
                  <p className="text-gray-400 text-sm mb-1">Recovery Rate</p>
                  <p className="text-2xl font-bold">{recoveryStats.recovery_rate}%</p>
                </div>
              </div>
            )}

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Failed Payments</h2>
              {failedPayments.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No failed payments</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="pb-3">Club</th>
                        <th className="pb-3">Email</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Attempts</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedPayments.map((payment, i) => (
                        <tr key={i} className="border-b border-gray-700/50">
                          <td className="py-3 font-medium">{payment.club_name}</td>
                          <td className="py-3 text-gray-400">{payment.owner_email}</td>
                          <td className="py-3">{formatCurrency(payment.amount / 100)}</td>
                          <td className="py-3">{payment.attempt_number || 1}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-sm ${
                              payment.recovered ? 'bg-green-500/20 text-green-400' :
                              payment.email_sent ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {payment.recovered ? 'Recovered' : payment.email_sent ? 'Email Sent' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3 text-gray-400">
                            {new Date(payment.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && activeTab === 'goals' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-semibold">Current MRR</h2>
                  <p className="text-4xl font-bold text-cyan-400 mt-2">{formatCurrency(currentMrr)}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400">This Month's Target</p>
                  {mrrGoals.length > 0 && (
                    <>
                      <p className="text-2xl font-bold">{formatCurrency(mrrGoals[0].target_mrr / 100)}</p>
                      <div className="mt-2">
                        {currentMrr >= mrrGoals[0].target_mrr / 100 ? (
                          <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full">On Track</span>
                        ) : (
                          <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full">
                            {formatCurrency((mrrGoals[0].target_mrr / 100) - currentMrr)} to go
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Set New Goal</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Month (YYYY-MM)</label>
                  <input
                    type="text"
                    placeholder="2025-01"
                    value={newGoal.month}
                    onChange={(e) => setNewGoal({ ...newGoal, month: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Target MRR ($)</label>
                  <input
                    type="number"
                    placeholder="1000"
                    value={newGoal.targetMrr || ''}
                    onChange={(e) => setNewGoal({ ...newGoal, targetMrr: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Notes</label>
                  <input
                    type="text"
                    placeholder="Q1 target"
                    value={newGoal.notes}
                    onChange={(e) => setNewGoal({ ...newGoal, notes: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <button
                onClick={saveGoal}
                className="mt-4 px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium"
              >
                Save Goal
              </button>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Historical Goals</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-3">Month</th>
                      <th className="pb-3">Target</th>
                      <th className="pb-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mrrGoals.map((goal, i) => (
                      <tr key={i} className="border-b border-gray-700/50">
                        <td className="py-3 font-medium">{goal.month}</td>
                        <td className="py-3">{formatCurrency(goal.target_mrr / 100)}</td>
                        <td className="py-3 text-gray-400">{goal.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'automations' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Automation Rules ({automations.length})</h2>
              {automations.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No automation rules found. Loading data...</p>
              ) : (
                <div className="space-y-4">
                  {automations.map((rule) => (
                    <div key={rule.id} className="p-5 bg-gray-700/50 rounded-lg border border-gray-600">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{rule.name}</h3>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${rule.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                              {rule.is_active ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <p className="text-gray-400 text-sm">{rule.description}</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 bg-gray-800/50 p-3 rounded-lg">
                          <button
                            onClick={() => toggleAutomation(rule.id, 'isActive', !rule.is_active)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              rule.is_active 
                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                            }`}
                          >
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </button>
                          
                          <button
                            onClick={() => toggleAutomation(rule.id, 'emailEnabled', !rule.email_enabled)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              rule.email_enabled 
                                ? 'bg-cyan-600 hover:bg-cyan-700 text-white' 
                                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                            }`}
                          >
                            Email {rule.email_enabled ? 'ON' : 'OFF'}
                          </button>
                          
                          <button
                            onClick={() => toggleAutomation(rule.id, 'slackEnabled', !rule.slack_enabled)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              rule.slack_enabled 
                                ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                            }`}
                          >
                            Slack {rule.slack_enabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        
                        <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                          <span className={`px-2 py-1 rounded ${
                            rule.rule_type === 'health_score_email' ? 'bg-orange-500/20 text-orange-400' :
                            rule.rule_type === 'trial_reminder' ? 'bg-blue-500/20 text-blue-400' :
                            rule.rule_type === 'payment_dunning' ? 'bg-yellow-500/20 text-yellow-400' :
                            rule.rule_type === 'churn_alert' ? 'bg-red-500/20 text-red-400' :
                            rule.rule_type === 'conversion_alert' ? 'bg-green-500/20 text-green-400' :
                            'bg-cyan-500/20 text-cyan-400'
                          }`}>
                            {rule.rule_type.replace(/_/g, ' ')}
                          </span>
                          <span>Triggered: {rule.trigger_count} times</span>
                          {rule.last_triggered_at && (
                            <span>Last: {new Date(rule.last_triggered_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Recent Executions</h2>
              {executions.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No automation executions yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="pb-3">Rule</th>
                        <th className="pb-3">Club</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Executed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executions.map((exec, i) => (
                        <tr key={i} className="border-b border-gray-700/50">
                          <td className="py-3 font-medium">{exec.rule_name}</td>
                          <td className="py-3">{exec.club_name || 'N/A'}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-sm ${
                              exec.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {exec.success ? 'Success' : 'Failed'}
                            </span>
                          </td>
                          <td className="py-3 text-gray-400">
                            {new Date(exec.executed_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
