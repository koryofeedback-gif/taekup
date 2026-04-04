
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Loader2, Calendar, X, Users, CheckSquare, Brain } from 'lucide-react';
import type { WizardData, Student, Coach, Belt, CalendarEvent, ScheduleItem, CurriculumItem } from '../types';
import { generateParentingAdvice } from '../services/geminiService';
import { WT_BELTS, ITF_BELTS, KARATE_BELTS, BJJ_BELTS, JUDO_BELTS, HAPKIDO_BELTS, TANGSOODO_BELTS, AIKIDO_BELTS, KRAVMAGA_BELTS, KUNGFU_BELTS } from '../constants';
import { CSVImport, ImportedStudent } from './CSVImport';
import { StripeConnectModal } from './StripeConnectModal';
import { useTranslation } from '../i18n/useTranslation';

interface AdminDashboardProps {
  data: WizardData;
  clubId?: string;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
  onNavigate: (view: 'coach-dashboard' | 'admin-dashboard' | 'parent-portal' | 'dojang-tv') => void;
  onViewStudentPortal?: (studentId: string) => void;
  onShowPricing?: () => void;
}

// --- PRICING CONSTANTS ---
// STRATEGY: Undercut Kicksite ($49/$99/$149/$199) at every level
const PRICING_TIERS = [
    { name: 'Starter', limit: 25, price: 24.99 },
    { name: 'Pro', limit: 50, price: 39.99 },
    { name: 'Standard', limit: 80, price: 69.00 },
    { name: 'Growth', limit: 150, price: 129.00 },
    { name: 'Empire', limit: Infinity, price: 199.00 },
];

// --- HELPER COMPONENTS ---

const SidebarItem: React.FC<{ icon: string; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${active ? 'bg-sky-500 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
    >
        <span className="text-xl">{icon}</span>
        <span className="font-medium">{label}</span>
    </button>
);

const StatCard: React.FC<{ label: string; value: string | number; subtext?: string; icon: string; color?: string }> = ({ label, value, subtext, icon, color = 'blue' }) => (
    <div className={`bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg relative overflow-hidden group hover:border-${color}-500/50 transition-colors`}>
        <div className={`absolute top-0 right-0 p-4 opacity-10 text-6xl text-${color}-400 group-hover:scale-110 transition-transform`}>{icon}</div>
        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">{label}</h3>
        <p className="text-3xl font-bold text-white mb-1">{value}</p>
        {subtext && <p className={`text-xs text-${color}-400 font-medium`}>{subtext}</p>}
    </div>
);

const SectionHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> = ({ title, description, action }) => (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-700 pb-4">
        <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-gray-400 text-sm mt-1">{description}</p>
        </div>
        {action && <div className="mt-4 md:mt-0">{action}</div>}
    </div>
);

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; title: string }> = ({ children, onClose, title }) => (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
        <div className="bg-gray-800 rounded-lg border border-gray-700 max-w-md w-full shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-3 sm:p-4 border-b border-gray-700 flex-shrink-0">
                <h3 className="text-white font-bold text-base sm:text-lg">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                {children}
            </div>
        </div>
    </div>
);

// --- DEMO MARGIN CALCULATOR CARD (Demo Mode - Matches Real but with LOCKED values for FOMO) ---
const DemoMarginCalculatorCard: React.FC<{
    totalStudents: number;
    clubSponsoredPremium: boolean;
    onToggle: () => void;
}> = ({ totalStudents, clubSponsoredPremium, onToggle }) => {
    const [tuitionIncrease, setTuitionIncrease] = useState(10.00);
    const displayStudents = totalStudents > 0 ? totalStudents : 50;
    
    return (
        <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-4 md:p-6 rounded-lg border border-indigo-500/30">
            <div className="flex flex-col md:flex-row md:items-start md:space-x-4">
                <div className="bg-indigo-600 p-3 rounded-lg text-2xl mb-3 md:mb-0 self-start">💎</div>
                <div className="flex-1">
                    <h3 className="text-lg md:text-xl font-bold text-white mb-1">DojoMint™ Universal Access</h3>
                    <p className="text-xs md:text-sm text-gray-300 mb-4">
                        Sponsor the app for your students. You pay a flat "Club Rate," and the app becomes FREE for all parents.
                    </p>
                    
                    <div className="bg-gray-900/60 p-3 md:p-5 rounded-lg border border-gray-700 mb-4">
                        {/* Tuition Increase Input */}
                        <div className="mb-4 md:mb-6">
                            <label className="text-xs text-gray-400 uppercase font-bold tracking-wider">Projected Tuition Increase</label>
                            <div className="flex items-baseline mt-2">
                                <span className="text-white text-2xl md:text-3xl font-bold mr-1">$</span>
                                <input 
                                    type="number" 
                                    value={tuitionIncrease}
                                    onChange={(e) => setTuitionIncrease(Math.max(2, Math.min(50, parseFloat(e.target.value) || 0)))}
                                    step="1.00"
                                    min="2"
                                    max="50"
                                    className="bg-gray-800 border-2 border-indigo-500/50 rounded-lg px-3 py-2 md:px-4 md:py-3 text-white font-extrabold text-2xl md:text-3xl w-24 md:w-28 focus:outline-none focus:border-indigo-400 text-center"
                                />
                                <span className="text-gray-400 ml-2 text-xs md:text-sm">/student/mo</span>
                            </div>
                        </div>
                        
                        {/* Cost Breakdown - Stacked on mobile */}
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-4 gap-3">
                            {/* Club Rate - LOCKED */}
                            <div className="text-center md:text-left">
                                <p className="text-[9px] text-gray-600 uppercase">DojoMint™ Club Rate</p>
                                <p className="text-gray-400 text-lg font-medium flex items-center justify-center md:justify-start">
                                    <span className="mr-1 text-amber-400">🔒</span>
                                    <span className="text-amber-400">B2B Rate</span>
                                </p>
                            </div>
                            
                            {/* Equals Sign - Hidden on mobile */}
                            <div className="hidden md:block text-gray-600 text-lg pb-3">=</div>
                            
                            {/* Net Profit - LOCKED */}
                            <div className="flex-1 bg-green-900/30 p-3 md:p-4 rounded-lg border border-green-500/40 text-center">
                                <p className="text-[10px] text-green-300 uppercase tracking-wider font-bold mb-1">Net Profit</p>
                                <p className="text-amber-400 text-xl md:text-2xl font-black flex items-center justify-center">
                                    <span className="mr-1">🔒</span>
                                </p>
                            </div>
                        </div>
                        
                        {/* Free for Students Banner */}
                        <div className="bg-sky-900/30 p-2 md:p-3 rounded-lg border border-sky-500/30 text-center mb-4">
                            <p className="text-sky-300 text-xs md:text-sm font-medium flex items-center justify-center">
                                <span className="mr-2">✨</span>
                                App becomes FREE for students
                            </p>
                        </div>
                        
                        {/* Monthly Projection - LOCKED */}
                        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 p-3 md:p-4 rounded-lg border border-green-500/30 text-center">
                            <p className="text-xs text-green-300/80 uppercase tracking-wider mb-1">
                                Monthly Profit ({displayStudents} students)
                            </p>
                            <p className="text-2xl md:text-3xl font-black text-amber-400 flex items-center justify-center">
                                <span className="mr-2">🔒</span>
                                Unlock
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center">
                            <button 
                                onClick={onToggle}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${clubSponsoredPremium ? 'bg-green-500' : 'bg-gray-600'}`}
                            >
                                <span className={`${clubSponsoredPremium ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                            </button>
                            <span className="ml-3 text-sm font-medium text-white">
                                {clubSponsoredPremium ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                        {clubSponsoredPremium && (
                            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded self-start md:self-auto">Universal Access Active</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- TUITION INCREASE SIMULATOR (Real Mode - Wholesale Model) ---
const MarginCalculatorCard: React.FC<{
    totalStudents: number;
    clubSponsoredPremium: boolean;
    onToggle: () => void;
    loading?: boolean;
}> = ({ totalStudents, clubSponsoredPremium, onToggle, loading }) => {
    const [tuitionIncrease, setTuitionIncrease] = useState(10.00);
    const CLUB_RATE = 1.99;
    
    const netProfit = Math.max(0, tuitionIncrease - CLUB_RATE);
    const monthlyProfit = netProfit * (totalStudents > 0 ? totalStudents : 50);
    const displayStudents = totalStudents > 0 ? totalStudents : 50;
    
    return (
        <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-4 md:p-6 rounded-lg border border-indigo-500/30">
            <div className="flex flex-col md:flex-row md:items-start md:space-x-4">
                <div className="bg-indigo-600 p-3 rounded-lg text-2xl mb-3 md:mb-0 self-start">💎</div>
                <div className="flex-1">
                    <h3 className="text-lg md:text-xl font-bold text-white mb-1">DojoMint™ Universal Access</h3>
                    <p className="text-xs md:text-sm text-gray-300 mb-4">
                        Sponsor the app for your students. You pay a flat "Club Rate," and the app becomes FREE for all parents.
                    </p>
                    
                    <div className="bg-gray-900/60 p-3 md:p-5 rounded-lg border border-gray-700 mb-4">
                        {/* Tuition Increase Input */}
                        <div className="mb-4 md:mb-6">
                            <label className="text-xs text-gray-400 uppercase font-bold tracking-wider">Projected Tuition Increase</label>
                            <div className="flex items-baseline mt-2">
                                <span className="text-white text-2xl md:text-3xl font-bold mr-1">$</span>
                                <input 
                                    type="number" 
                                    value={tuitionIncrease}
                                    onChange={(e) => setTuitionIncrease(Math.max(2, Math.min(50, parseFloat(e.target.value) || 0)))}
                                    step="1.00"
                                    min="2"
                                    max="50"
                                    placeholder="Amount you add to membership"
                                    className="bg-gray-800 border-2 border-indigo-500/50 rounded-lg px-3 py-2 md:px-4 md:py-3 text-white font-extrabold text-2xl md:text-3xl w-24 md:w-28 focus:outline-none focus:border-indigo-400 text-center"
                                />
                                <span className="text-gray-400 ml-2 text-xs md:text-sm">/student/mo</span>
                            </div>
                        </div>
                        
                        {/* Cost Breakdown - Stacked on mobile */}
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-4 gap-3">
                            {/* Club Rate - Static Cost */}
                            <div className="text-center md:text-left">
                                <p className="text-[9px] text-gray-600 uppercase">DojoMint™ Club Rate</p>
                                <p className="text-gray-400 text-lg font-medium">-${CLUB_RATE.toFixed(2)}</p>
                                <p className="text-[9px] text-gray-500">(Billed to Club)</p>
                            </div>
                            
                            {/* Equals Sign - Hidden on mobile */}
                            <div className="hidden md:block text-gray-600 text-lg pb-3">=</div>
                            
                            {/* Net Profit */}
                            <div className="flex-1 bg-green-900/30 p-3 md:p-4 rounded-lg border border-green-500/40 text-center">
                                <p className="text-[10px] text-green-300 uppercase tracking-wider font-bold mb-1">Net Profit</p>
                                <p className="text-green-400 text-2xl md:text-3xl font-black">${netProfit.toFixed(2)}</p>
                                <p className="text-green-300/60 text-[10px] mt-1">per student/mo</p>
                            </div>
                        </div>
                        
                        {/* Free for Students Banner */}
                        <div className="bg-sky-900/30 p-2 md:p-3 rounded-lg border border-sky-500/30 text-center mb-4">
                            <p className="text-sky-300 text-xs md:text-sm font-medium flex items-center justify-center">
                                <span className="mr-2">✨</span>
                                App becomes FREE for students
                            </p>
                        </div>
                        
                        {/* Monthly Projection */}
                        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 p-3 md:p-4 rounded-lg border border-green-500/30 text-center">
                            <p className="text-xs text-green-300/80 uppercase tracking-wider mb-1">
                                Monthly Profit ({displayStudents} students)
                            </p>
                            <p className="text-3xl md:text-4xl font-black text-green-400">${monthlyProfit.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center">
                            <button 
                                onClick={onToggle}
                                disabled={loading}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${clubSponsoredPremium ? 'bg-green-500' : 'bg-gray-600'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className={`${clubSponsoredPremium ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                            </button>
                            <span className="ml-3 text-sm font-medium text-white">
                                {loading ? 'Updating...' : (clubSponsoredPremium ? 'Enabled' : 'Disabled')}
                            </span>
                        </div>
                        {clubSponsoredPremium && !loading && (
                            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded self-start md:self-auto">Universal Access Active</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- PLAN LIMIT MODAL ---
const PlanLimitModal: React.FC<{
    type: 'hard-limit' | 'trial-expired';
    currentCount: number;
    currentPlan?: string;
    neededTier: typeof PRICING_TIERS[0];
    upgradeTier?: typeof PRICING_TIERS[0];
    onClose: () => void;
    onGoBilling: () => void;
}> = ({ type, currentCount, currentPlan, neededTier, upgradeTier, onClose, onGoBilling }) => (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-gray-800 rounded-2xl border border-gray-700 max-w-sm w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`px-6 py-5 ${type === 'hard-limit' ? 'bg-gradient-to-r from-orange-900/40 to-red-900/40 border-b border-orange-500/30' : 'bg-gradient-to-r from-yellow-900/40 to-amber-900/40 border-b border-yellow-500/30'}`}>
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{type === 'hard-limit' ? '🚫' : '⏰'}</span>
                    <div>
                        <h3 className="text-white font-bold text-lg leading-tight">
                            {type === 'hard-limit' ? 'Student Limit Reached' : 'Trial Period Ended'}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {type === 'hard-limit'
                                ? `Your ${currentPlan} plan supports up to ${neededTier.limit === Infinity ? '∞' : neededTier.limit} students`
                                : 'Subscribe to continue managing your students'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-6 py-5 space-y-4">
                {type === 'hard-limit' && upgradeTier ? (
                    <>
                        <div className="flex items-center justify-between bg-gray-900/60 rounded-xl p-4 border border-gray-700">
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Current plan</p>
                                <p className="text-white font-bold">{currentPlan}</p>
                                <p className="text-gray-400 text-sm">Up to {neededTier.limit} students</p>
                            </div>
                            <span className="text-2xl text-gray-500">→</span>
                            <div className="text-right">
                                <p className="text-xs text-sky-400 uppercase font-semibold">Upgrade to</p>
                                <p className="text-sky-400 font-bold">{upgradeTier.name}</p>
                                <p className="text-sky-300 text-sm">${upgradeTier.price}/mo</p>
                            </div>
                        </div>
                        <p className="text-gray-400 text-sm text-center">
                            You have <span className="text-white font-bold">{currentCount} students</span> — upgrade to add more.
                        </p>
                    </>
                ) : (
                    <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700 text-center">
                        <p className="text-gray-300 text-sm mb-2">Your 14-day free trial has ended.</p>
                        <p className="text-gray-400 text-sm">Subscribe to any plan to keep adding students. All your existing data is safe.</p>
                        <div className="mt-3 flex justify-center gap-3 text-xs text-gray-500">
                            <span>Starter from <span className="text-white font-semibold">$24.99/mo</span></span>
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors">
                        Cancel
                    </button>
                    <button onClick={onGoBilling} className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5">
                        <span>💳</span> View Plans
                    </button>
                </div>
            </div>
        </div>
    </div>
);

// --- SUB-SECTIONS ---

const OverviewTab: React.FC<{ data: WizardData, onNavigate: (view: any) => void, onOpenModal: (type: string) => void, onNavigateTab?: (tab: 'overview' | 'students' | 'staff' | 'schedule' | 'creator' | 'settings' | 'billing') => void }> = ({ data, onNavigate, onOpenModal, onNavigateTab }) => {
    const { t } = useTranslation(data.language);
    const totalStudents = data.students.length;
    
    // Revenue Simulator State
    // Stripe micropayment rate: 5% + $0.05 = ~$0.30 on $4.99
    // Fee split: club pays 70% of Stripe fee ($0.21), MyTaek pays 30% ($0.09)
    // application_fee_percent = 34.3% → club nets $3.28, MyTaek nets $1.41
    const PREMIUM_PRICE = 4.99;
    const STRIPE_FEE = parseFloat((PREMIUM_PRICE * 0.05 + 0.05).toFixed(2)); // ~$0.30
    const TAEKUP_FEE = parseFloat((PREMIUM_PRICE * 0.343 - STRIPE_FEE * 0.30).toFixed(2)); // ~$1.41 net
    const CLUB_COMMISSION = parseFloat((PREMIUM_PRICE - PREMIUM_PRICE * 0.343).toFixed(2)); // ~$3.28 net
    
    // Plan selection for simulator - use saved plan or default to first plan (Starter)
    const [selectedPlanIndex, setSelectedPlanIndex] = useState<number>(
        data.selectedPlanIndex !== undefined ? data.selectedPlanIndex : 0
    );
    const selectedTier = PRICING_TIERS[selectedPlanIndex];
    
    // For display purposes, show recommended tier based on student count
    const recommendedTier = PRICING_TIERS.find(t => totalStudents <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
    
    const [adoptionRate, setAdoptionRate] = useState(40);
    
    // Use the plan's student limit for simulation (not actual student count)
    // This shows potential earnings at full capacity for each plan
    const simulatedStudents = selectedTier.limit === Infinity ? 250 : selectedTier.limit;
    
    const revenue = useMemo(() => {
        const subscribers = Math.round(simulatedStudents * (adoptionRate / 100));
        const totalRevenue = subscribers * PREMIUM_PRICE; // Total collected from parents
        const taekupCut = subscribers * TAEKUP_FEE; // MyTaek net (~$1.41 after paying Stripe fee)
        const clubRevenue = subscribers * CLUB_COMMISSION; // Club net (~$3.28 after 34.3% app fee)
        const profit = clubRevenue - selectedTier.price; // Net after plan cost
        return { 
            subscribers, 
            totalRevenue, 
            taekupCut, 
            clubRevenue, 
            profit,
            baseStudents: simulatedStudents 
        };
    }, [simulatedStudents, adoptionRate, selectedTier, PREMIUM_PRICE, TAEKUP_FEE, CLUB_COMMISSION]);

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard label={t('admin.overview.totalStudents')} value={totalStudents} subtext={selectedTier ? `${selectedTier.limit === Infinity ? t('admin.overview.unlimited') : t('admin.overview.spotsLeft', { count: selectedTier.limit - totalStudents })} ${t('admin.overview.inPlan', { plan: selectedTier.name })}` : t('admin.overview.recommended', { plan: recommendedTier.name })} icon="🥋" color="blue" />
                <StatCard label={t('admin.overview.premiumFamilies')} value={data.students.filter((s: any) => s.premiumStatus === 'parent_paid' || s.premiumStatus === 'club_sponsored').length} subtext={t('admin.overview.moRevenue', { amount: (data.students.filter((s: any) => s.premiumStatus === 'parent_paid').length * 4.99).toFixed(2) })} icon="⭐" color="green" />
                <StatCard label={t('admin.overview.activeStaff')} value={data.coaches.length + 1} subtext={t('admin.overview.oneOwner')} icon="👥" color="purple" />
                <StatCard label={t('admin.overview.locations')} value={data.branches} subtext={t('admin.overview.unlimitedPlan')} icon="🌍" color="orange" />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button onClick={() => onOpenModal('student')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all hover:-translate-y-1">
                    <span className="text-2xl mb-2">👤</span>
                    <span className="font-bold text-white text-sm">{t('admin.overview.addStudent')}</span>
                </button>
                <button onClick={() => onOpenModal('coach')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all hover:-translate-y-1">
                    <span className="text-2xl mb-2">🥋</span>
                    <span className="font-bold text-white text-sm">{t('admin.overview.addCoach')}</span>
                </button>
                <button onClick={() => onNavigate('coach-dashboard')} className="bg-blue-900/30 hover:bg-blue-900/50 p-4 rounded-lg border border-sky-500/30 flex flex-col items-center justify-center transition-all hover:-translate-y-1">
                    <span className="text-2xl mb-2">📋</span>
                    <span className="font-bold text-blue-200 text-sm">{t('admin.overview.coachDashboard')}</span>
                </button>
                <button onClick={() => onNavigate('dojang-tv')} className="bg-purple-900/30 hover:bg-purple-900/50 p-4 rounded-lg border border-purple-500/30 flex flex-col items-center justify-center transition-all hover:-translate-y-1 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-purple-500/10 animate-pulse"></div>
                    <span className="text-2xl mb-2 relative z-10">📺</span>
                    <span className="font-bold text-purple-200 text-sm relative z-10">{t('admin.overview.launchLobbyTV')}</span>
                </button>
            </div>

            {/* Mobile Navigation - Sections */}
            <div className="md:hidden grid grid-cols-2 gap-3">
                <button onClick={() => onNavigateTab('students')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all">
                    <span className="text-2xl mb-2">👥</span>
                    <span className="font-bold text-white text-sm">{t('admin.sidebar.students')}</span>
                </button>
                <button onClick={() => onNavigateTab('staff')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all">
                    <span className="text-2xl mb-2">🥋</span>
                    <span className="font-bold text-white text-sm">{t('admin.sidebar.staff')}</span>
                </button>
                <button onClick={() => onNavigateTab('schedule')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all">
                    <span className="text-2xl mb-2">📅</span>
                    <span className="font-bold text-white text-sm">{t('admin.sidebar.schedule')}</span>
                </button>
                <button onClick={() => onNavigateTab('creator')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all">
                    <span className="text-2xl mb-2">🎥</span>
                    <span className="font-bold text-white text-sm">{t('admin.sidebar.creatorHub')}</span>
                </button>
                <button onClick={() => onNavigateTab('settings')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all">
                    <span className="text-2xl mb-2">⚙️</span>
                    <span className="font-bold text-white text-sm">{t('admin.sidebar.settings')}</span>
                </button>
                <button onClick={() => onNavigateTab('billing')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all">
                    <span className="text-2xl mb-2">💳</span>
                    <span className="font-bold text-white text-sm">{t('admin.sidebar.billing')}</span>
                </button>
            </div>

            {/* Revenue Simulator */}
            {!data.clubSponsoredPremium && (
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 p-4 md:p-6 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
                        <div>
                            <h3 className="text-lg md:text-xl font-bold text-white flex items-center"><span className="mr-2">🏦</span> SenseiVault™ Live Projection</h3>
                            <p className="text-gray-400 text-xs md:text-sm">Monitor your active DojoMint™ revenue against your platform fees.</p>
                        </div>
                        <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-700 self-start">
                            <span className="text-xs text-gray-500 uppercase block">Your Plan</span>
                            <select 
                                value={selectedPlanIndex} 
                                onChange={(e) => setSelectedPlanIndex(parseInt(e.target.value))}
                                className="bg-transparent text-white font-bold cursor-pointer focus:outline-none text-sm md:text-base"
                            >
                                {PRICING_TIERS.map((tier, idx) => (
                                    <option key={tier.name} value={idx} className="bg-gray-800">
                                        {tier.name} - ${tier.price}/mo
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                        <div>
                            <label className="block text-xs md:text-sm text-gray-300 mb-4">
                                If <span className="text-sky-300 font-bold text-lg">{adoptionRate}%</span> of your <span className="text-white font-semibold">{simulatedStudents}</span> students become Active Legacy Activations...
                            </label>
                            <input 
                                type="range" 
                                min="0" max="100" 
                                value={adoptionRate} 
                                onChange={(e) => setAdoptionRate(parseInt(e.target.value))}
                                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-2">
                                <span>0%</span>
                                <span>50%</span>
                                <span>100%</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-3">
                                <span className="text-white font-semibold">{revenue.subscribers}</span> Legacy Activation{revenue.subscribers !== 1 ? 's' : ''}
                            </p>
                        </div>

                        <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700 text-center relative overflow-hidden">
                            {revenue.profit > 0 && (
                                <div className="absolute top-0 right-0 bg-green-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg shadow-lg animate-pulse">
                                    {t('admin.overview.hundredPercentCovered')}
                                </div>
                            )}
                            <div className="mb-4 space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Your Platform Cost:</span>
                                    <span>
                                        {revenue.profit > 0 ? (
                                            <>
                                                <span className="line-through text-gray-500">${selectedTier.price.toFixed(2)}</span>
                                                <span className="ml-2 text-green-400 font-bold">(FREE) ✅</span>
                                            </>
                                        ) : (
                                            <span className="text-white font-semibold">${selectedTier.price.toFixed(2)}</span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Your DojoMint™ Revenue:</span>
                                    <span className="text-green-400 font-semibold">+${revenue.clubRevenue.toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="border-t border-gray-700 pt-4">
                                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Net Monthly Profit</p>
                                <p className={`text-4xl font-extrabold ${revenue.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {revenue.profit >= 0 ? '+' : '-'}${Math.abs(revenue.profit).toFixed(2)} {revenue.profit > 0 && '🚀'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const StudentsTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void, onViewPortal?: (id: string) => void, onEditStudent?: (student: Student) => void, clubId?: string }> = ({ data, onUpdateData, onOpenModal, onViewPortal, onEditStudent, clubId }) => {
    const { t } = useTranslation(data.language);
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('All Locations');
    const [classFilter, setClassFilter] = useState('All Classes');
    const [beltFilter, setBeltFilter] = useState('All Belts');
    const [showTransfers, setShowTransfers] = useState(false);
    const [transfers, setTransfers] = useState<any[]>([]);
    const [transfersLoading, setTransfersLoading] = useState(false);
    
    const [transfersError, setTransfersError] = useState('');
    
    const loadTransfers = async () => {
        if (!clubId) return;
        setTransfersLoading(true);
        setTransfersError('');
        try {
            const response = await fetch(`/api/club/${clubId}/transfers`);
            if (response.ok) {
                const result = await response.json();
                setTransfers(result.transfers || []);
            } else {
                const err = await response.json();
                setTransfersError(err.error || 'Failed to load transfers');
            }
        } catch (e: any) {
            console.error('Failed to load transfers:', e);
            setTransfersError(e.message || 'Failed to load transfers');
        } finally {
            setTransfersLoading(false);
        }
    };
    
    const handleTransferAction = async (transferId: string, action: 'approve' | 'reject') => {
        try {
            const response = await fetch(`/api/transfers/${transferId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, clubId })
            });
            if (response.ok) {
                loadTransfers();
                if (action === 'approve') {
                    window.location.reload();
                }
            } else {
                const err = await response.json();
                alert(err.error || 'Failed to process transfer');
            }
        } catch (e: any) {
            alert(e.message || 'Failed to process transfer');
        }
    };

    useEffect(() => {
        if (showTransfers && clubId) {
            loadTransfers();
        }
    }, [showTransfers, clubId]);
    
    // Derived available classes based on selected location
    const availableClasses = useMemo(() => {
        if (locationFilter === 'All Locations') {
            return data.classes || [];
        }
        return data.locationClasses?.[locationFilter] || [];
    }, [locationFilter, data.locationClasses, data.classes]);

    const filtered = data.students.filter(s => {
        const matchName = s.name.toLowerCase().includes(search.toLowerCase());
        const matchLoc = locationFilter === 'All Locations' || s.location === locationFilter;
        const matchClass = classFilter === 'All Classes' || s.assignedClass === classFilter;
        const matchBelt = beltFilter === 'All Belts' || s.beltId === beltFilter;
        return matchName && matchLoc && matchClass && matchBelt;
    });

    const handleDelete = async (id: string) => {
        if(confirm(t('common.areYouSure'))) {
            try {
                const response = await fetch(`/api/students/${id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete student');
                }
                
                // Update local state on success
                const newStudents = data.students.filter(s => s.id !== id);
                onUpdateData({ students: newStudents });
                
                // Sync Universal Access quantity if enabled
                if (data.clubSponsoredPremium && clubId) {
                    fetch(`/api/club/${clubId}/universal-access/sync`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ studentCount: newStudents.length || 1 })
                    }).catch(e => console.log('[UniversalAccess] Sync after delete:', e.message));
                }
            } catch (err: any) {
                console.error('Failed to delete student:', err);
                alert(err.message || t('admin.students.failedToDeleteStudent'));
            }
        }
    }

    return (
        <div>
            <SectionHeader 
                title={t('admin.students.studentRoster')} 
                description={t('admin.students.manageStudents')} 
                action={
                    <div className="flex gap-2">
                        <button onClick={() => setShowTransfers(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded shadow-lg">
                            {t('admin.students.transfers')}
                        </button>
                        <button onClick={() => onOpenModal('student')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded shadow-lg">
                            {t('admin.students.addStudent')}
                        </button>
                    </div>
                }
            />
            
            {showTransfers && (
                <Modal title={t('admin.students.transferRequests')} onClose={() => setShowTransfers(false)}>
                    {transfersError && (
                        <div className="bg-red-900/30 border border-red-500/30 p-3 rounded text-red-300 text-sm mb-4">
                            {transfersError}
                        </div>
                    )}
                    {transfersLoading ? (
                        <div className="text-center py-8 text-gray-400">{t('admin.students.loadingTransfers')}</div>
                    ) : transfers.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-400 mb-4">{t('admin.students.noTransferRequests')}</p>
                            <p className="text-sm text-gray-500">{t('admin.students.requestTransfersFrom')}</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                            {transfers.map(tr => (
                                <div key={tr.id} className={`p-4 rounded-lg border ${
                                    tr.status === 'pending' ? 'bg-yellow-900/20 border-yellow-500/30' :
                                    tr.status === 'approved' ? 'bg-green-900/20 border-green-500/30' :
                                    'bg-red-900/20 border-red-500/30'
                                }`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="font-bold text-white">{tr.student.name}</p>
                                            <p className="text-xs text-cyan-400 font-mono">{tr.student.mytaekId}</p>
                                        </div>
                                        <div className={`px-2 py-1 rounded text-xs font-bold ${
                                            tr.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                                            tr.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                                            'bg-red-500/20 text-red-300'
                                        }`}>
                                            {tr.status.toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-400 mb-2">
                                        {tr.direction === 'outgoing' ? (
                                            <><span className="text-orange-400">{t('admin.students.outgoing')}:</span> {t('admin.students.outgoingDesc', { club: tr.toClub.name })}</>
                                        ) : (
                                            <><span className="text-cyan-400">{t('admin.students.incoming')}:</span> {t('admin.students.incomingDesc', { club: tr.fromClub?.name || 'Unknown' })}</>
                                        )}
                                    </div>
                                    <div className="flex gap-2 text-xs text-gray-500 mb-2">
                                        <span>{t('admin.students.belt')}: {tr.beltAtTransfer}</span>
                                        <span>|</span>
                                        <span>XP: {(tr.xpAtTransfer || 0).toLocaleString()}</span>
                                    </div>
                                    {tr.status === 'pending' && tr.fromClub?.id === clubId && (
                                        <div className="flex gap-2 mt-3">
                                            <button 
                                                onClick={() => handleTransferAction(tr.id, 'approve')}
                                                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded font-bold text-sm"
                                            >
                                                {t('admin.students.approveTransfer')}
                                            </button>
                                            <button 
                                                onClick={() => handleTransferAction(tr.id, 'reject')}
                                                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded font-bold text-sm"
                                            >
                                                {t('admin.students.reject')}
                                            </button>
                                        </div>
                                    )}
                                    {tr.status === 'pending' && tr.toClub?.id === clubId && (
                                        <div className="text-xs text-yellow-300 mt-2">
                                            {t('admin.students.waitingForApproval', { club: tr.fromClub?.name || 'current club' })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>
            )}
            <div className="flex flex-wrap gap-4 mb-4">
                <input 
                    type="text" 
                    placeholder={t('admin.students.searchStudents')} 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500 w-full md:w-64"
                />
                <select 
                    value={locationFilter} 
                    onChange={e => {
                        setLocationFilter(e.target.value);
                        setClassFilter('All Classes'); // Reset class when location changes
                    }}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500"
                >
                    <option>{t('common.allLocations')}</option>
                    {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select 
                    value={classFilter} 
                    onChange={e => setClassFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500"
                    disabled={locationFilter === 'All Locations' && (!data.classes || data.classes.length === 0)}
                >
                    <option>{t('common.allClasses')}</option>
                    {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select 
                    value={beltFilter} 
                    onChange={e => setBeltFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500"
                >
                    <option>{t('common.allBelts')}</option>
                    {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3">{t('common.name')}</th>
                            <th className="px-6 py-3">{t('admin.students.belt')}</th>
                            <th className="px-6 py-3">{t('admin.students.locationClass')}</th>
                            <th className="px-6 py-3">{t('admin.students.joined')}</th>
                            <th className="px-6 py-3 text-right">{t('common.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filtered.map(s => (
                            <tr key={s.id} className="hover:bg-gray-700/50">
                                <td className="px-6 py-4 font-medium text-white">{s.name}</td>
                                <td className="px-6 py-4">{data.belts.find(b => b.id === s.beltId)?.name}</td>
                                <td className="px-6 py-4">
                                    <div className="text-white">{s.location}</div>
                                    <div className="text-xs text-gray-500">{s.assignedClass}</div>
                                </td>
                                <td className="px-6 py-4">{s.joinDate ? new Date(s.joinDate).toLocaleDateString() : 'N/A'}</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                    {onEditStudent && (
                                        <button onClick={() => onEditStudent(s)} className="text-yellow-400 hover:text-yellow-300 font-bold text-xs" title={t('admin.students.editStudentModal.title')}>
                                            {t('common.edit')}
                                        </button>
                                    )}
                                    {onViewPortal && (
                                        <button onClick={() => onViewPortal(s.id)} className="text-sky-300 hover:text-blue-300 font-bold text-xs" title={t('admin.students.viewAsParent')}>
                                            👁️ {t('admin.students.portal')}
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300 font-bold text-xs">{t('common.delete')}</button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">{t('admin.students.noStudentsFound')}</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
                {filtered.map(s => (
                    <div key={s.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-white text-lg">{s.name}</h3>
                                <span className="inline-block bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded mt-1">
                                    {data.belts.find(b => b.id === s.beltId)?.name || 'No Belt'}
                                </span>
                            </div>
                            <span className="text-xs text-gray-500">
                                {s.joinDate ? new Date(s.joinDate).toLocaleDateString() : 'N/A'}
                            </span>
                        </div>
                        <div className="text-sm text-gray-400 mb-3">
                            <span className="text-white">{s.location}</span>
                            {s.assignedClass && <span className="text-gray-500"> · {s.assignedClass}</span>}
                        </div>
                        <div className="flex gap-3 pt-2 border-t border-gray-700">
                            {onEditStudent && (
                                <button onClick={() => onEditStudent(s)} className="text-yellow-400 hover:text-yellow-300 font-bold text-xs">
                                    {t('common.edit')}
                                </button>
                            )}
                            {onViewPortal && (
                                <button onClick={() => onViewPortal(s.id)} className="text-sky-300 hover:text-blue-300 font-bold text-xs">
                                    👁️ {t('admin.students.portal')}
                                </button>
                            )}
                            <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300 font-bold text-xs ml-auto">
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-500">
                        {t('admin.students.noStudentsFound')}
                    </div>
                )}
            </div>
        </div>
    )
}

const StaffTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void, onEditCoach?: (coach: any) => void }> = ({ data, onUpdateData, onOpenModal, onEditCoach }) => {
    const { t } = useTranslation(data.language);
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if(!confirm(t('admin.staff.removeCoachConfirm'))) return;
        
        setDeleting(id);
        try {
            const response = await fetch(`/api/coaches/${id}`, { method: 'DELETE' });
            if (response.ok) {
                onUpdateData({ coaches: data.coaches.filter(c => c.id !== id) });
            } else {
                alert(t('admin.staff.failedToRemoveCoach'));
            }
        } catch (error) {
            console.error('Delete coach error:', error);
            alert(t('admin.staff.failedToRemoveCoach'));
        } finally {
            setDeleting(null);
        }
    }

    return (
        <div>
            <SectionHeader 
                title={t('admin.staff.staffManagement')} 
                description={t('admin.staff.manageCoaches')} 
                action={
                    <button onClick={() => onOpenModal('coach')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded shadow-lg">
                        {t('admin.staff.addCoach')}
                    </button>
                }
            />
            
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3">{t('admin.staff.tableHeaders.name')}</th>
                            <th className="px-6 py-3">{t('admin.staff.tableHeaders.email')}</th>
                            <th className="px-6 py-3">{t('admin.staff.tableHeaders.location')}</th>
                            <th className="px-6 py-3">{t('admin.staff.tableHeaders.classes')}</th>
                            <th className="px-6 py-3 text-right">{t('admin.staff.tableHeaders.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        <tr className="bg-blue-900/10">
                            <td className="px-6 py-4 font-bold text-white">{data.ownerName} <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-0.5 rounded ml-2">{t('common.owner')}</span></td>
                            <td className="px-6 py-4 text-gray-400">{t('admin.staff.accountAdmin')}</td>
                            <td className="px-6 py-4">{t('common.allLocations')}</td>
                            <td className="px-6 py-4">{t('common.allClasses')}</td>
                            <td className="px-6 py-4 text-right"></td>
                        </tr>
                        {data.coaches.map(c => (
                            <tr key={c.id} className="hover:bg-gray-700/50">
                                <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                                <td className="px-6 py-4">{c.email}</td>
                                <td className="px-6 py-4">{c.location || '-'}</td>
                                <td className="px-6 py-4 text-xs">{c.assignedClasses?.join(', ') || t('admin.staff.none')}</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                    {onEditCoach && (
                                        <button onClick={() => onEditCoach(c)} className="text-yellow-400 hover:text-yellow-300 font-bold text-xs">{t('common.edit')}</button>
                                    )}
                                    <button 
                                        onClick={() => handleDelete(c.id)} 
                                        disabled={deleting === c.id}
                                        className="text-red-400 hover:text-red-300 font-bold text-xs disabled:opacity-50"
                                    >
                                        {deleting === c.id ? t('common.removing') : t('common.remove')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {data.coaches.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No coaches added yet.</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
                {/* Owner Card */}
                <div className="bg-blue-900/20 rounded-lg border border-blue-800/50 p-4">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="font-bold text-white text-lg">{data.ownerName}</h3>
                            <span className="inline-block bg-blue-900 text-blue-300 text-[10px] px-2 py-0.5 rounded mt-1">{t('common.owner')}</span>
                        </div>
                    </div>
                    <div className="text-sm text-gray-400">
                        <div>{t('common.allLocations')} · {t('common.allClasses')}</div>
                    </div>
                </div>

                {/* Coach Cards */}
                {data.coaches.map(c => (
                    <div key={c.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-white text-lg">{c.name}</h3>
                        </div>
                        <div className="text-sm text-gray-400 mb-3 space-y-1">
                            <div className="truncate">{c.email}</div>
                            <div>
                                <span className="text-white">{c.location || t('admin.staff.noLocation')}</span>
                                {c.assignedClasses?.length > 0 && (
                                    <span className="text-gray-500"> · {c.assignedClasses.join(', ')}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2 border-t border-gray-700">
                            {onEditCoach && (
                                <button onClick={() => onEditCoach(c)} className="text-yellow-400 hover:text-yellow-300 font-bold text-xs">
                                    {t('common.edit')}
                                </button>
                            )}
                            <button 
                                onClick={() => handleDelete(c.id)} 
                                disabled={deleting === c.id}
                                className="text-red-400 hover:text-red-300 font-bold text-xs ml-auto disabled:opacity-50"
                            >
                                {deleting === c.id ? t('common.removing') : t('common.remove')}
                            </button>
                        </div>
                    </div>
                ))}
                {data.coaches.length === 0 && (
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-500">
                        {t('admin.staff.noCoachesAdded')}
                    </div>
                )}
            </div>
        </div>
    )
}

interface DbClassSession {
    id: string; class_name: string; day: string; time: string;
    instructor: string | null; location: string | null;
    belt_requirement: string; capacity: number;
    enrolled_count: number; is_active: boolean;
}

const BELT_COLORS: Record<string, string> = {
    White: 'bg-gray-200 text-gray-800', Yellow: 'bg-yellow-400 text-yellow-900',
    Orange: 'bg-orange-500 text-white', Green: 'bg-green-500 text-white',
    Blue: 'bg-blue-500 text-white', Purple: 'bg-purple-600 text-white',
    Red: 'bg-red-600 text-white', Brown: 'bg-yellow-800 text-white',
    Black: 'bg-gray-900 text-white border border-gray-600', All: 'bg-sky-600 text-white',
};

const ScheduleTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void, clubId?: string }> = ({ data, onUpdateData, onOpenModal, clubId }) => {
    const { t } = useTranslation(data.language);
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayKeys: Record<string, string> = { Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday', Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday' };

    // DB-backed class sessions
    const [dbSessions, setDbSessions] = React.useState<DbClassSession[]>([]);
    const [sessionsLoaded, setSessionsLoaded] = React.useState(false);

    // Roster panel state
    const [rosterSession, setRosterSession] = React.useState<DbClassSession | null>(null);
    const [roster, setRoster] = React.useState<any[]>([]);
    const [rosterLoading, setRosterLoading] = React.useState(false);
    const [addStudentId, setAddStudentId] = React.useState('');

    // Attendance modal state
    const [attendSession, setAttendSession] = React.useState<DbClassSession | null>(null);
    const [attendDate, setAttendDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [attendList, setAttendList] = React.useState<{ studentId: string; name: string; belt: string; present: boolean }[]>([]);
    const [attendLoading, setAttendLoading] = React.useState(false);
    const [attendSaving, setAttendSaving] = React.useState(false);

    // AI Lesson Plan state
    const [aiPlanSession, setAiPlanSession] = React.useState<DbClassSession | null>(null);
    const [aiPlanFocus, setAiPlanFocus] = React.useState('General Training');
    const [aiPlanDuration, setAiPlanDuration] = React.useState(60);
    const [aiPlanResult, setAiPlanResult] = React.useState('');
    const [aiPlanLoading, setAiPlanLoading] = React.useState(false);

    const [mobileDay, setMobileDay] = React.useState('Monday');

    const migrationDoneRef = React.useRef(false);

    const loadSessions = React.useCallback(async () => {
        if (!clubId) return;
        try {
            const res = await fetch(`/api/clubs/${clubId}/class-sessions`);
            if (res.ok) {
                const d = await res.json();
                // Auto-migrate legacy wizard_data.schedule entries into DB on first load (runs once)
                if (d.length === 0 && !migrationDoneRef.current && data.schedule && data.schedule.length > 0) {
                    migrationDoneRef.current = true;
                    await Promise.all(data.schedule.map((c: any) =>
                        fetch(`/api/clubs/${clubId}/class-sessions`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                className: c.className, day: c.day, time: c.time,
                                instructor: c.instructor || data.ownerName || '',
                                location: c.location || data.branchNames?.[0] || 'Main Dojang',
                                beltRequirement: c.beltRequirement || 'All',
                                capacity: c.capacity || 20
                            })
                        }).catch(() => {})
                    ));
                    // Reload after migration
                    const res2 = await fetch(`/api/clubs/${clubId}/class-sessions`);
                    if (res2.ok) { const d2 = await res2.json(); setDbSessions(d2); }
                } else {
                    setDbSessions(d);
                }
            }
        } catch {}
        setSessionsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clubId]);

    React.useEffect(() => { loadSessions(); }, [loadSessions]);

    // Listen for new class added from parent component
    React.useEffect(() => {
        const handler = () => loadSessions();
        window.addEventListener('reloadClassSessions', handler);
        return () => window.removeEventListener('reloadClassSessions', handler);
    }, [loadSessions]);

    const handleDeleteSession = async (id: string) => {
        if (!confirm('Remove this class from the schedule?')) return;
        await fetch(`/api/class-sessions/${id}`, { method: 'DELETE' });
        setDbSessions(prev => prev.filter(s => s.id !== id));
        onUpdateData({ schedule: data.schedule.filter(s => s.id !== id) });
    };

    // Roster
    const openRoster = async (session: DbClassSession) => {
        setRosterSession(session); setRosterLoading(true); setAddStudentId('');
        const res = await fetch(`/api/class-sessions/${session.id}/roster`);
        if (res.ok) setRoster(await res.json());
        setRosterLoading(false);
    };
    const enrollStudent = async () => {
        if (!addStudentId || !rosterSession || !clubId) return;
        await fetch(`/api/class-sessions/${rosterSession.id}/enroll`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: addStudentId, clubId })
        });
        setAddStudentId('');
        await openRoster(rosterSession);
        setDbSessions(prev => prev.map(s => s.id === rosterSession.id ? { ...s, enrolled_count: s.enrolled_count + 1 } : s));
    };
    const unenrollStudent = async (studentId: string) => {
        if (!rosterSession) return;
        await fetch(`/api/class-sessions/${rosterSession.id}/enroll/${studentId}`, { method: 'DELETE' });
        setRoster(prev => prev.filter(s => s.id !== studentId));
        setDbSessions(prev => prev.map(s => s.id === rosterSession!.id ? { ...s, enrolled_count: Math.max(0, s.enrolled_count - 1) } : s));
    };

    // Attendance
    const openAttendance = async (session: DbClassSession, date?: string) => {
        const d = date || attendDate;
        setAttendSession(session); setAttendLoading(true); setAttendDate(d);
        const rosterRes = await fetch(`/api/class-sessions/${session.id}/roster`);
        const rosterData = rosterRes.ok ? await rosterRes.json() : [];
        const attendRes = await fetch(`/api/class-sessions/${session.id}/attendance/${d}`);
        const attendData = attendRes.ok ? await attendRes.json() : [];
        const attendMap: Record<string, boolean> = {};
        attendData.forEach((a: any) => { attendMap[a.student_id] = a.present; });
        setAttendList(rosterData.map((s: any) => ({ studentId: s.id, name: s.name, belt: s.belt, present: attendMap[s.id] ?? false })));
        setAttendLoading(false);
    };
    const saveAttendance = async () => {
        if (!attendSession || !clubId) return;
        setAttendSaving(true);
        await fetch(`/api/class-sessions/${attendSession.id}/attendance`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: attendDate, attendance: attendList.map(a => ({ studentId: a.studentId, present: a.present })), clubId })
        });
        setAttendSaving(false); setAttendSession(null);
    };

    const handleRemovePrivateSlot = (id: string) => {
        if(confirm(t('admin.schedule.removeSlotConfirm'))) {
            onUpdateData({ privateSlots: (data.privateSlots || []).filter(s => s.id !== id) });
        }
    };

    const notEnrolledStudents = (data.students || []).filter(s => !roster.some((r: any) => r.id === s.id));
    const formatTime = (t: string) => { try { const [h, m] = t.split(':'); const h12 = parseInt(h) % 12 || 12; return `${h12}:${m} ${parseInt(h) < 12 ? 'AM' : 'PM'}`; } catch { return t; } };
    const fillPct = (sess: DbClassSession) => sess.capacity > 0 ? Math.min(100, Math.round((sess.enrolled_count / sess.capacity) * 100)) : 0;
    const fillColor = (pct: number) => pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';

    const DAY_SHORT_LABELS: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

    const openAiPlan = (session: DbClassSession) => {
        setAiPlanSession(session);
        setAiPlanFocus('General Training');
        setAiPlanDuration(60);
        setAiPlanResult('');
    };

    const generateAiPlan = async () => {
        if (!aiPlanSession) return;
        setAiPlanLoading(true);
        try {
            const res = await fetch('/api/ai/class-plan', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    beltLevel: aiPlanSession.belt_requirement || 'All Levels',
                    focusArea: aiPlanFocus || 'General Training',
                    classDuration: aiPlanDuration,
                    studentCount: aiPlanSession.enrolled_count || 10,
                    language: data.language || 'en',
                })
            });
            if (res.ok) { const d = await res.json(); setAiPlanResult(d.plan || ''); }
            else setAiPlanResult('Failed to generate plan. Please try again.');
        } catch { setAiPlanResult('Failed to generate plan. Please try again.'); }
        setAiPlanLoading(false);
    };

    const ClassCard = ({ session }: { session: DbClassSession }) => {
        const pct = fillPct(session);
        const beltKey = session.belt_requirement || 'All';
        const beltColor = BELT_COLORS[beltKey] || 'bg-sky-700 text-white';
        const timeRange = (session as any).end_time
            ? `${formatTime(session.time)} – ${formatTime((session as any).end_time)}`
            : formatTime(session.time);
        const isFull = pct >= 100;
        const isNearFull = pct >= 80;
        return (
            <div className="bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-xl p-3 group transition-colors">
                <div className="flex items-start justify-between gap-1 mb-2">
                    <div className="min-w-0">
                        <p className="text-white font-bold text-sm leading-tight truncate">{session.class_name}</p>
                        <p className="text-cyan-400 text-xs font-medium mt-0.5">{timeRange}</p>
                    </div>
                    <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-all p-0.5 rounded"
                        title="Remove class"
                    >
                        <X size={14} />
                    </button>
                </div>
                {session.instructor && (
                    <p className="text-gray-500 text-xs truncate mb-2">{session.instructor}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${beltColor}`}>
                        {beltKey === 'All' ? 'All Belts' : beltKey}
                    </span>
                    {session.location && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">{session.location}</span>
                    )}
                </div>
                {/* Fill rate */}
                <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-medium ${isFull ? 'text-red-400' : isNearFull ? 'text-yellow-400' : 'text-gray-400'}`}>
                            {session.enrolled_count}/{session.capacity} enrolled
                        </span>
                        <span className={`text-xs font-bold ${isFull ? 'text-red-400' : isNearFull ? 'text-yellow-400' : 'text-green-400'}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${fillColor(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                </div>
                {/* Actions — icon-only buttons with tooltips */}
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-700/60">
                    <div className="relative group/tip">
                        <button
                            onClick={() => openRoster(session)}
                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-all"
                        >
                            <Users size={14} />
                        </button>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-200 text-[11px] font-medium whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50">Roster</span>
                    </div>
                    <div className="relative group/tip2">
                        <button
                            onClick={() => openAttendance(session)}
                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-800 hover:bg-blue-900/50 border border-gray-700 hover:border-blue-700 text-gray-400 hover:text-blue-300 transition-all"
                        >
                            <CheckSquare size={14} />
                        </button>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-200 text-[11px] font-medium whitespace-nowrap opacity-0 group-hover/tip2:opacity-100 transition-opacity z-50">Attend</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            {/* Weekly Schedule */}
            <div>
                <SectionHeader
                    title={t('admin.schedule.weeklyClassSchedule')}
                    description="Manage your weekly classes, rosters and attendance"
                    action={
                        <button onClick={() => onOpenModal('class')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-colors">
                            {t('admin.schedule.addClass')}
                        </button>
                    }
                />

                {!sessionsLoaded && clubId && (
                    <div className="text-center py-12 text-gray-500">
                        <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                        <p className="text-sm">Loading schedule...</p>
                    </div>
                )}

                {sessionsLoaded && dbSessions.length === 0 && (data.schedule || []).length === 0 && (
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700 border-dashed p-12 text-center">
                        <Calendar size={40} className="mx-auto mb-3 text-gray-600" />
                        <p className="text-gray-300 font-semibold">No classes scheduled yet</p>
                        <p className="text-gray-600 text-sm mt-1">Add your first class to start building your weekly schedule</p>
                        <button onClick={() => onOpenModal('class')} className="mt-5 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                            Add First Class
                        </button>
                    </div>
                )}

                {(sessionsLoaded || !clubId) && (dbSessions.length > 0 || (data.schedule || []).length > 0) && (
                    <>
                        {/* ── Mobile: horizontal day tabs ── */}
                        <div className="md:hidden">
                            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                                {days.map(day => {
                                    const count = dbSessions.filter(s => s.day === day).length;
                                    const isActive = mobileDay === day;
                                    return (
                                        <button
                                            key={day}
                                            onClick={() => setMobileDay(day)}
                                            className={`flex-shrink-0 flex flex-col items-center px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                isActive
                                                    ? 'bg-cyan-600 border-cyan-500 text-white'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                                            }`}
                                        >
                                            <span>{DAY_SHORT_LABELS[day]}</span>
                                            {count > 0 && (
                                                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-cyan-500'}`} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="space-y-3">
                                {(() => {
                                    const dbClasses = dbSessions.filter(s => s.day === mobileDay).sort((a, b) => a.time.localeCompare(b.time));
                                    const legacyClasses = (data.schedule || []).filter(s => s.day === mobileDay && !dbSessions.some(db => db.class_name === s.className && db.day === s.day));
                                    if (dbClasses.length === 0 && legacyClasses.length === 0) {
                                        return (
                                            <div className="text-center py-10 text-gray-600">
                                                <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-sm">No classes on {mobileDay}</p>
                                                <button onClick={() => onOpenModal('class')} className="mt-3 text-xs text-cyan-500 hover:text-cyan-400 font-medium">+ Add class</button>
                                            </div>
                                        );
                                    }
                                    return (
                                        <>
                                            {dbClasses.map(session => <ClassCard key={session.id} session={session} />)}
                                            {legacyClasses.map(c => (
                                                <div key={c.id} className="bg-gray-800/50 border border-dashed border-gray-700 rounded-xl p-3 text-xs">
                                                    <p className="font-bold text-gray-400">{formatTime(c.time)}</p>
                                                    <p className="text-white font-medium">{c.className}</p>
                                                    <p className="text-yellow-600 mt-1 italic">Legacy — re-add to upgrade</p>
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* ── Desktop: 7-column grid ── */}
                        <div className="hidden md:grid grid-cols-7 gap-2.5">
                            {days.map(day => {
                                const dbClasses = dbSessions.filter(s => s.day === day).sort((a, b) => a.time.localeCompare(b.time));
                                const legacyClasses = (data.schedule || []).filter(s => s.day === day && !dbSessions.some(db => db.class_name === s.className && db.day === s.day)).sort((a, b) => a.time.localeCompare(b.time));
                                const hasClasses = dbClasses.length > 0 || legacyClasses.length > 0;
                                return (
                                    <div key={day} className={`rounded-xl border p-2.5 min-h-[180px] ${hasClasses ? 'bg-gray-800 border-gray-700' : 'bg-gray-800/30 border-gray-800'}`}>
                                        <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-gray-700/50">
                                            <h4 className="font-bold text-gray-400 text-xs uppercase tracking-wide">{DAY_SHORT_LABELS[day]}</h4>
                                            {dbClasses.length > 0 && (
                                                <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{dbClasses.length}</span>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            {dbClasses.map(session => <ClassCard key={session.id} session={session} />)}
                                            {legacyClasses.map(c => (
                                                <div key={c.id} className="bg-gray-700/30 border border-dashed border-gray-700 rounded-lg p-2 text-xs">
                                                    <p className="font-bold text-gray-500">{formatTime(c.time)}</p>
                                                    <p className="text-gray-300 font-medium truncate">{c.className}</p>
                                                    <p className="text-yellow-700 mt-1 italic">Legacy</p>
                                                </div>
                                            ))}
                                            {!hasClasses && (
                                                <p className="text-gray-800 text-xs italic text-center py-6">Empty</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ─── Roster Panel (slide-in overlay) ─── */}
            {rosterSession && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRosterSession(null)} />
                    <div className="relative w-full max-w-sm bg-gray-900 border-l border-gray-700 flex flex-col h-full shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-gray-700">
                            <div>
                                <h3 className="font-bold text-white">{rosterSession.class_name}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {rosterSession.day} · {formatTime(rosterSession.time)} · {roster.length}/{rosterSession.capacity} enrolled
                                </p>
                            </div>
                            <button onClick={() => setRosterSession(null)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        {/* Fill bar in panel header */}
                        <div className="px-4 pt-3 pb-1">
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${fillColor(fillPct(rosterSession))}`}
                                    style={{ width: `${fillPct(rosterSession)}%` }}
                                />
                            </div>
                        </div>
                        {/* Add student */}
                        <div className="p-4 border-b border-gray-800">
                            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Add student to roster</p>
                            <div className="flex gap-2">
                                <select
                                    value={addStudentId}
                                    onChange={e => setAddStudentId(e.target.value)}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-600 outline-none"
                                >
                                    <option value="">Select student...</option>
                                    {notEnrolledStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <button
                                    onClick={enrollStudent}
                                    disabled={!addStudentId}
                                    className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                        {/* Roster list */}
                        <div className="flex-1 overflow-y-auto">
                            {rosterLoading && (
                                <div className="text-center text-gray-500 py-10">
                                    <Loader2 className="animate-spin mx-auto mb-2" size={20} />
                                </div>
                            )}
                            {!rosterLoading && roster.length === 0 && (
                                <div className="text-center text-gray-600 py-10 px-4">
                                    <Users size={28} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">No students enrolled yet</p>
                                </div>
                            )}
                            {!rosterLoading && roster.map((s: any) => (
                                <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-800/80 hover:bg-gray-800/30 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                                            {s.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">{s.name}</p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${BELT_COLORS[s.belt] || 'bg-gray-700 text-gray-300'}`}>{s.belt}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => unenrollStudent(s.id)}
                                        className="text-gray-600 hover:text-red-400 text-xs font-bold px-2 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-gray-700">
                            <button
                                onClick={() => { setAttendSession(rosterSession); openAttendance(rosterSession); setRosterSession(null); }}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                            >
                                <CheckSquare size={16} /> Take Today's Attendance
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Attendance Modal ─── */}
            {attendSession && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAttendSession(null)} />
                    <div className="relative bg-gray-900 rounded-t-2xl sm:rounded-xl border border-gray-700 w-full sm:max-w-md shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-gray-700">
                            <div>
                                <h3 className="font-bold text-white">Attendance</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{attendSession.class_name} · {attendSession.day}</p>
                            </div>
                            <button onClick={() => setAttendSession(null)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 border-b border-gray-800">
                            <label className="text-xs text-gray-500 uppercase font-semibold tracking-wide block mb-1.5">Date</label>
                            <input
                                type="date"
                                value={attendDate}
                                onChange={e => { setAttendDate(e.target.value); openAttendance(attendSession, e.target.value); }}
                                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm w-full focus:border-cyan-600 outline-none"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {attendLoading && (
                                <div className="text-center text-gray-500 py-10">
                                    <Loader2 className="animate-spin mx-auto" size={20} />
                                </div>
                            )}
                            {!attendLoading && attendList.length === 0 && (
                                <div className="text-center text-gray-600 py-10 px-4 text-sm">
                                    No students enrolled — add students via Roster first
                                </div>
                            )}
                            {!attendLoading && attendList.map((s, i) => (
                                <div
                                    key={s.studentId}
                                    className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800/80"
                                    onClick={() => setAttendList(prev => prev.map((a, j) => j === i ? { ...a, present: !a.present } : a))}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 ${s.present ? 'bg-green-600 border-green-500' : 'border-gray-600 bg-gray-800'}`}>
                                            {s.present && <span className="text-white text-xs font-bold">✓</span>}
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">{s.name}</p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${BELT_COLORS[s.belt] || 'bg-gray-700 text-gray-300'}`}>{s.belt}</span>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-bold ${s.present ? 'text-green-400' : 'text-gray-600'}`}>
                                        {s.present ? 'Present' : 'Absent'}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-gray-700 flex items-center gap-3">
                            <div className="text-sm text-gray-500 flex-1">
                                <span className="font-bold text-white">{attendList.filter(a => a.present).length}</span>/{attendList.length} present
                            </div>
                            <button onClick={() => setAttendSession(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
                            <button
                                onClick={saveAttendance}
                                disabled={attendSaving || attendList.length === 0}
                                className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-5 rounded-lg text-sm transition-colors"
                            >
                                {attendSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* ─── AI Lesson Plan Panel ─── */}
            {aiPlanSession && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAiPlanSession(null)} />
                    <div className="relative ml-auto w-full max-w-lg bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-y-auto shadow-2xl">
                        <div className="flex items-center justify-between p-5 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Brain size={18} className="text-purple-400" />
                                    <h3 className="font-bold text-white">AI Lesson Plan</h3>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {aiPlanSession.class_name} · {aiPlanSession.belt_requirement || 'All Belts'} · {aiPlanSession.enrolled_count} students
                                </p>
                            </div>
                            <button onClick={() => setAiPlanSession(null)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 flex-1">
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Focus Area</label>
                                <select
                                    value={aiPlanFocus}
                                    onChange={e => setAiPlanFocus(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                                >
                                    {['General Training', 'Kicks & Footwork', 'Sparring & Combat', 'Forms / Poomsae', 'Self-Defence', 'Conditioning & Fitness', 'Belt Test Prep', 'Fun Games & Warm-Up'].map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Class Duration (minutes)</label>
                                <input
                                    type="number"
                                    value={aiPlanDuration}
                                    onChange={e => setAiPlanDuration(parseInt(e.target.value) || 60)}
                                    min={15} max={180} step={5}
                                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <button
                                onClick={generateAiPlan}
                                disabled={aiPlanLoading}
                                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors"
                            >
                                {aiPlanLoading ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Brain size={16} /> Generate Plan</>}
                            </button>
                            {aiPlanResult && (
                                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mt-2">
                                    <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">{aiPlanResult}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void; }> = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={onChange}
        className={`${checked ? 'bg-sky-500' : 'bg-gray-600'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-gray-800`}
        role="switch"
        aria-checked={checked}
    >
        <span className={`${checked ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}/>
    </button>
);


const SettingsTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, clubId?: string }> = ({ data, onUpdateData, clubId }) => {
    const { t } = useTranslation(data.language);
    const [activeSubTab, setActiveSubTab] = useState<'general' | 'belts' | 'locations' | 'rules'>('general');
    const settingsTabLabels: Record<string, string> = { general: t('admin.settings.tabs.general'), belts: t('admin.settings.tabs.belts'), locations: t('admin.settings.tabs.locations'), rules: t('admin.settings.tabs.rules') };

    return (
        <div>
            <SectionHeader title={t('admin.settings.systemSettings')} description={t('admin.settings.configureClub')} />
            
            {/* Sub-Nav */}
            <div className="flex space-x-4 border-b border-gray-700 mb-6">
                {['general', 'belts', 'locations', 'rules'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveSubTab(tab as any)}
                        className={`pb-2 px-2 text-sm font-medium capitalize transition-colors ${activeSubTab === tab ? 'text-sky-300 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        {settingsTabLabels[tab] || tab}
                    </button>
                ))}
            </div>

            {activeSubTab === 'general' && (
                <div className="space-y-6 max-w-2xl">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">{t('admin.settings.general.clubLogo')}</label>
                        <div className="flex items-center space-x-4">
                            {data.logo && typeof data.logo === 'string' && data.logo.startsWith('data:') ? (
                                <img 
                                    src={data.logo} 
                                    alt="Club Logo" 
                                    className="w-20 h-20 rounded-lg object-cover border border-gray-600"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            ) : (
                                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center text-white font-bold text-2xl">
                                    {data.clubName?.charAt(0) || 'C'}
                                </div>
                            )}
                            <div className="flex flex-col space-y-2">
                                <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                                    {t('admin.settings.general.uploadLogo')}
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    onUpdateData({ logo: reader.result as string });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </label>
                                {data.logo && (
                                    <button 
                                        onClick={() => onUpdateData({ logo: null })}
                                        className="text-red-400 hover:text-red-300 text-sm"
                                    >
                                        {t('admin.settings.general.removeLogo')}
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{t('admin.settings.general.logoRecommendation')}</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.general.clubName')}</label>
                        <input type="text" value={data.clubName} onChange={e => onUpdateData({ clubName: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.general.slogan')}</label>
                        <input type="text" value={data.slogan} onChange={e => onUpdateData({ slogan: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.general.language')}</label>
                        <p className="text-xs text-gray-500 mb-2">{t('admin.settings.general.languageDesc')}</p>
                        <select
                            value={data.language || 'English'}
                            onChange={e => onUpdateData({ language: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        >
                            <option value="English">{t('admin.settings.general.languageEnglish')}</option>
                            <option value="French">{t('admin.settings.general.languageFrench')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.general.primaryBrandColor')}</label>
                        <div className="flex items-center space-x-2">
                            <input type="color" value={data.primaryColor} onChange={e => onUpdateData({ primaryColor: e.target.value })} className="h-10 w-10 bg-gray-800 border border-gray-700 rounded cursor-pointer" />
                            <span className="text-gray-300">{data.primaryColor}</span>
                        </div>
                    </div>
                    
                    {/* Holiday Schedule Setting - Improves ChronosBelt™ Predictor accuracy */}
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.general.holidaySchedule')}</label>
                        <p className="text-xs text-gray-500 mb-3">{t('admin.settings.general.holidayScheduleDesc')}</p>
                        <select 
                            value={data.holidaySchedule || 'minimal'} 
                            onChange={e => onUpdateData({ holidaySchedule: e.target.value as any })}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white mb-3"
                        >
                            <option value="minimal">{t('admin.settings.general.holidayMinimal')}</option>
                            <option value="school_holidays">{t('admin.settings.general.holidaySchool')}</option>
                            <option value="extended">{t('admin.settings.general.holidayExtended')}</option>
                            <option value="custom">{t('admin.settings.general.holidayCustom')}</option>
                        </select>
                        
                        {data.holidaySchedule === 'custom' && (
                            <div className="flex items-center gap-3">
                                <label className="text-sm text-gray-400">{t('admin.settings.general.weeksClosedPerYear')}</label>
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="20" 
                                    value={data.customHolidayWeeks || 4}
                                    onChange={e => onUpdateData({ customHolidayWeeks: parseInt(e.target.value) || 4 })}
                                    className="w-20 bg-gray-700 border border-gray-600 rounded p-2 text-white text-center"
                                />
                            </div>
                        )}
                        
                        <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
                            <span className="text-blue-400">i</span>
                            <span>
                                {data.holidaySchedule === 'minimal' && t('admin.settings.general.holidayMinimalDesc')}
                                {data.holidaySchedule === 'school_holidays' && t('admin.settings.general.holidaySchoolDesc')}
                                {data.holidaySchedule === 'extended' && t('admin.settings.general.holidayExtendedDesc')}
                                {data.holidaySchedule === 'custom' && t('admin.settings.general.holidayCustomDesc', { weeks: data.customHolidayWeeks || 4 })}
                                {!data.holidaySchedule && t('admin.settings.general.holidayMinimalDesc')}
                            </span>
                        </div>
                    </div>
                    
                    {/* World Rankings Opt-In */}
                    <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 p-4 rounded-lg border border-cyan-700/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🌍</span>
                                <div>
                                    <label className="block text-sm font-bold text-white">{t('admin.settings.general.worldRankings')}</label>
                                    <p className="text-xs text-gray-400">{t('admin.settings.general.worldRankingsDesc')}</p>
                                </div>
                            </div>
                            <ToggleSwitch 
                                checked={data.worldRankingsEnabled || false} 
                                onChange={async () => {
                                    const newValue = !data.worldRankingsEnabled;
                                    onUpdateData({ worldRankingsEnabled: newValue });
                                    // Also persist to database
                                    if (clubId) {
                                        try {
                                            await fetch(`/api/clubs/${clubId}/world-rankings`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ enabled: newValue })
                                            });
                                            console.log('[AdminDashboard] World Rankings toggled:', newValue);
                                        } catch (err) {
                                            console.error('[AdminDashboard] Failed to save world rankings setting:', err);
                                        }
                                    }
                                }}
                            />
                        </div>
                        {data.worldRankingsEnabled && (
                            <div className="mt-4 pt-4 border-t border-gray-700">
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                    <h4 className="text-sm font-bold text-cyan-300 mb-2">{t('admin.settings.general.howItWorks')}</h4>
                                    <ul className="text-xs text-gray-400 space-y-1">
                                        <li>• {t('admin.settings.general.worldRankingsPoint1')}</li>
                                        <li>• {t('admin.settings.general.worldRankingsPoint2')}</li>
                                        <li>• {t('admin.settings.general.worldRankingsPoint3')}</li>
                                        <li>• {t('admin.settings.general.worldRankingsPoint4')}</li>
                                    </ul>
                                </div>
                                <div className="mt-3 flex items-center gap-2 text-xs text-cyan-400">
                                    <span>✓</span>
                                    <span>{t('admin.settings.general.worldRankingsActive')}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    
                                    </div>
            )}

            {activeSubTab === 'belts' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">{t('admin.settings.belts.beltSystem')}</h3>
                        <p className="text-xs text-gray-500 mb-3">{t('admin.settings.belts.choosePreset')}</p>
                        <select 
                            value={data.beltSystemType}
                            onChange={(e) => {
                                const system = e.target.value as WizardData['beltSystemType'];
                                let newBelts: Belt[] = data.belts;
                                switch (system) {
                                    case 'wt': newBelts = WT_BELTS; break;
                                    case 'itf': newBelts = ITF_BELTS; break;
                                    case 'karate': newBelts = KARATE_BELTS; break;
                                    case 'bjj': newBelts = BJJ_BELTS; break;
                                    case 'judo': newBelts = JUDO_BELTS; break;
                                    case 'hapkido': newBelts = HAPKIDO_BELTS; break;
                                    case 'tangsoodo': newBelts = TANGSOODO_BELTS; break;
                                    case 'aikido': newBelts = AIKIDO_BELTS; break;
                                    case 'kravmaga': newBelts = KRAVMAGA_BELTS; break;
                                    case 'kungfu': newBelts = KUNGFU_BELTS; break;
                                    case 'custom': break;
                                }
                                if (system !== 'custom') {
                                    const customBelts = data.belts.filter(b => b.id.startsWith('custom-'));
                                    onUpdateData({ beltSystemType: system, belts: [...newBelts, ...customBelts] });
                                } else {
                                    onUpdateData({ beltSystemType: 'custom' });
                                }
                            }}
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white mb-4"
                        >
                            <option value="wt">{t('admin.settings.belts.taekwondoWT')}</option>
                            <option value="itf">{t('admin.settings.belts.taekwondoITF')}</option>
                            <option value="karate">{t('admin.settings.belts.karate')}</option>
                            <option value="bjj">{t('admin.settings.belts.bjj')}</option>
                            <option value="judo">{t('admin.settings.belts.judo')}</option>
                            <option value="hapkido">{t('admin.settings.belts.hapkido')}</option>
                            <option value="tangsoodo">{t('admin.settings.belts.tangSooDo')}</option>
                            <option value="aikido">{t('admin.settings.belts.aikido')}</option>
                            <option value="kravmaga">{t('admin.settings.belts.kravMaga')}</option>
                            <option value="kungfu">{t('admin.settings.belts.kungFu')}</option>
                            <option value="custom">{t('admin.settings.belts.custom')}</option>
                        </select>
                    </div>
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">{t('admin.settings.belts.editBeltRanks')}</h3>
                        <p className="text-xs text-gray-500 mb-3">{t('admin.settings.belts.customizeBelts')}</p>
                        <div className="space-y-2">
                            {data.belts.map((belt, idx) => (
                                <div key={belt.id} className="flex items-center space-x-3 bg-gray-900/50 p-2 rounded">
                                    <div className="w-6 h-6 rounded border border-gray-600" style={{ background: belt.color2 ? `linear-gradient(to right, ${belt.color1} 50%, ${belt.color2} 50%)` : belt.color1 }}></div>
                                    <input 
                                        type="text" 
                                        value={belt.name} 
                                        onChange={(e) => {
                                            const newBelts = [...data.belts];
                                            newBelts[idx] = { ...belt, name: e.target.value };
                                            onUpdateData({ belts: newBelts });
                                        }}
                                        className="bg-transparent border-none text-white focus:ring-0 flex-1"
                                    />
                                    <input 
                                        type="color" 
                                        value={belt.color1}
                                        onChange={(e) => {
                                            const newBelts = [...data.belts];
                                            newBelts[idx] = { ...belt, color1: e.target.value };
                                            onUpdateData({ belts: newBelts });
                                        }}
                                        className="w-8 h-8 p-0 border-none bg-transparent"
                                    />
                                    {(data.beltSystemType === 'custom' || belt.id.startsWith('custom-')) && (
                                        <button 
                                            onClick={() => onUpdateData({ belts: data.belts.filter(b => b.id !== belt.id) })}
                                            className="text-gray-500 hover:text-red-400"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg border border-dashed border-gray-600 p-4">
                        <h3 className="font-bold text-white mb-1">{data.beltSystemType === 'custom' ? t('admin.settings.belts.addBeltLevel') : t('admin.settings.belts.addCustomAfterTop')}</h3>
                        <p className="text-xs text-gray-500 mb-3">
                            {data.beltSystemType === 'custom' 
                                ? t('admin.settings.belts.buildFromScratch')
                                : t('admin.settings.belts.addExtraRanks', { topBelt: data.belts.length > 0 ? data.belts[data.belts.length - 1]?.name : '' })}
                        </p>
                        <div className="flex items-center space-x-2">
                            <input 
                                type="text" 
                                placeholder={t('admin.settings.belts.beltNamePlaceholder')}
                                id="admin-new-belt-name"
                                className="flex-1 bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm"
                            />
                            <input 
                                type="color" 
                                defaultValue="#ffffff"
                                id="admin-new-belt-color"
                                className="w-10 h-10 p-1 bg-gray-700 border border-gray-600 rounded cursor-pointer"
                            />
                            <button 
                                onClick={() => {
                                    const nameInput = document.getElementById('admin-new-belt-name') as HTMLInputElement;
                                    const colorInput = document.getElementById('admin-new-belt-color') as HTMLInputElement;
                                    if (!nameInput?.value.trim()) return;
                                    onUpdateData({ belts: [...data.belts, { id: `custom-${Date.now()}`, name: nameInput.value.trim(), color1: colorInput?.value || '#ffffff' }] });
                                    nameInput.value = '';
                                    colorInput.value = '#ffffff';
                                }}
                                className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded text-sm"
                            >
                                {t('common.add')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'locations' && (
                <div className="space-y-6">
                    <div className="grid gap-4">
                        {data.branchNames?.map((branch, idx) => (
                            <div key={idx} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                                <label className="block text-xs text-gray-500 uppercase mb-1">{t('admin.settings.locations.location')} {idx + 1}</label>
                                <input 
                                    type="text" 
                                    value={branch}
                                    onChange={(e) => {
                                        const newBranches = [...data.branchNames];
                                        newBranches[idx] = e.target.value;
                                        onUpdateData({ branchNames: newBranches });
                                    }}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white font-bold mb-2"
                                />
                                <input 
                                    type="text" 
                                    value={data.branchAddresses?.[idx] || ''}
                                    placeholder={t('admin.settings.locations.address')}
                                    onChange={(e) => {
                                        const newAddrs = [...(data.branchAddresses || [])];
                                        newAddrs[idx] = e.target.value;
                                        onUpdateData({ branchAddresses: newAddrs });
                                    }}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-gray-300 text-sm"
                                />
                            </div>
                        ))}
                    </div>
                    <button 
                        onClick={() => {
                            onUpdateData({ 
                                branches: data.branches + 1,
                                branchNames: [...data.branchNames, `Location ${data.branches + 1}`],
                                branchAddresses: [...(data.branchAddresses || []), '']
                            })
                        }}
                        className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 px-4 rounded"
                    >
                        {t('admin.settings.locations.addNewLocation')}
                    </button>
                </div>
            )}

            {activeSubTab === 'rules' && (
                <div className="space-y-6 max-w-2xl">
                    {/* Promotion Pace */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">{t('admin.settings.rules.promotionPace')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.rules.stripesPerBelt')}</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="10"
                                    value={data.stripesPerBelt} 
                                    onChange={e => onUpdateData({ stripesPerBelt: parseInt(e.target.value, 10) || 4 })} 
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                />
                            </div>
                        </div>
                        
                        {/* Stripe Progress Rule — Per Belt */}
                        <div className="bg-gray-700/30 p-4 rounded-md border border-gray-700">
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium text-gray-300">{t('admin.settings.rules.stripeProgressRule')}</label>
                                <span className="text-xs bg-sky-900/50 text-sky-300 px-2 py-1 rounded border border-sky-700/40">Per Belt</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-300">
                                    <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                                        <tr>
                                            <th className="px-4 py-2">{t('admin.students.belt')}</th>
                                            <th className="px-4 py-2">{t('admin.settings.rules.pointsPerStripe')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.belts.map(belt => (
                                            <tr key={belt.id} className="border-b border-gray-700 bg-gray-800">
                                                <td className="px-4 py-2 flex items-center">
                                                    <div className="w-4 h-4 rounded-sm mr-2" style={{ background: belt.color2 ? `linear-gradient(to right, ${belt.color1} 50%, ${belt.color2} 50%)` : belt.color1, border: belt.color1 === '#FFFFFF' ? '1px solid #666' : 'none' }}></div>
                                                    {belt.name}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input 
                                                        type="number"
                                                        value={data.pointsPerBelt?.[belt.id] ?? 64}
                                                        onChange={e => {
                                                            const newMap = { ...(data.pointsPerBelt || {}), [belt.id]: parseInt(e.target.value) || 0 };
                                                            onUpdateData({ useCustomPointsPerBelt: true, pointsPerBelt: newMap });
                                                        }}
                                                        className="w-24 bg-gray-900 border border-gray-600 rounded p-1 text-center text-white focus:ring-sky-500"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-xs text-sky-400 mt-3">💡 {t('admin.settings.rules.perBeltHint')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Stripe Colors */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-white">{t('admin.settings.rules.colorCodedStripes')}</h3>
                                <p className="text-sm text-gray-400">{t('admin.settings.rules.colorCodedStripesDesc')}</p>
                            </div>
                            <ToggleSwitch checked={data.useColorCodedStripes} onChange={() => onUpdateData({ useColorCodedStripes: !data.useColorCodedStripes })} />
                        </div>
                        {data.useColorCodedStripes && (
                            <div className="flex flex-wrap gap-3 mt-4">
                                {Array.from({ length: data.stripesPerBelt }).map((_, index) => {
                                    const currentColor = data.stripeColors?.[index] || '#FFFFFF';
                                    return (
                                        <div key={index} className="flex flex-col items-center space-y-1">
                                            <input
                                                type="color"
                                                value={currentColor}
                                                onChange={(e) => {
                                                    const newColors = [...(data.stripeColors || [])];
                                                    for(let i = 0; i <= index; i++) {
                                                        if(!newColors[i]) newColors[i] = '#FFFFFF';
                                                    }
                                                    newColors[index] = e.target.value;
                                                    onUpdateData({ stripeColors: newColors });
                                                }}
                                                className="w-10 h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"
                                            />
                                            <span className="text-xs text-gray-500">#{index + 1}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Bonus Point Sources */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">{t('admin.settings.rules.bonusPointSources')}</h3>
                        <p className="text-sm text-gray-400 mb-4">{t('admin.settings.rules.bonusPointSourcesDesc')}</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-white">{t('admin.settings.rules.coachBonus')}</p>
                                    <p className="text-sm text-gray-400">{t('admin.settings.rules.coachBonusDesc')}</p>
                                </div>
                                <ToggleSwitch checked={data.coachBonus} onChange={() => onUpdateData({ coachBonus: !data.coachBonus })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-white">{t('admin.settings.rules.homework')}</p>
                                    <p className="text-sm text-gray-400">{t('admin.settings.rules.homeworkDesc')}</p>
                                </div>
                                <ToggleSwitch checked={data.homeworkBonus} onChange={() => onUpdateData({ homeworkBonus: !data.homeworkBonus })} />
                            </div>
                        </div>
                    </div>

                    {/* Grading Requirement */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">{t('admin.settings.rules.gradingRequirement')}</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-white">{t('admin.settings.rules.requireSpecificSkill')}</p>
                                    <p className="text-sm text-gray-400">{t('admin.settings.rules.requireSpecificSkillDesc')}</p>
                                </div>
                                <ToggleSwitch checked={data.gradingRequirementEnabled} onChange={() => onUpdateData({ gradingRequirementEnabled: !data.gradingRequirementEnabled })} />
                            </div>
                            {data.gradingRequirementEnabled && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">{t('admin.settings.rules.requirementName')}</label>
                                    <input 
                                        type="text" 
                                        value={data.gradingRequirementName || ''} 
                                        onChange={e => onUpdateData({ gradingRequirementName: e.target.value })}
                                        placeholder={t('admin.settings.rules.requirementPlaceholder')}
                                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                    />
                                </div>
                            )}
                            {!data.gradingRequirementEnabled && (
                                <p className="text-xs text-gray-500">{t('admin.settings.rules.requirementExamples')}</p>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-center">
                        <p className="text-lg text-gray-300">
                            <span className="font-bold text-white">{t('admin.settings.rules.promotionRule')} </span>
                            {t('admin.settings.rules.stripesEqualsNewBelt', { stripes: data.stripesPerBelt, requirement: data.gradingRequirementEnabled ? t('admin.settings.rules.plusRequirementReady', { requirement: data.gradingRequirementName || 'Requirement' }) : '' })}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

const DEFAULT_VIDEO_TAGS = [
    { id: 'forms', name: 'Forms', icon: '🥋' },
    { id: 'sparring', name: 'Sparring', icon: '⚔️' },
    { id: 'self-defense', name: 'Self-Defense', icon: '🛡️' },
    { id: 'beginner', name: 'Beginner', icon: '🟢' },
    { id: 'intermediate', name: 'Intermediate', icon: '🟡' },
    { id: 'advanced', name: 'Advanced', icon: '🔴' },
    { id: 'black-belt', name: 'Black Belt', icon: '⬛' },
];

const CreatorHubTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, clubId?: string, onOpenModal?: (type: string) => void }> = ({ data, onUpdateData, clubId, onOpenModal }) => {
    const { t } = useTranslation(data.language);

    // ── Event management state ──
    const [manageEvent, setManageEvent] = React.useState<import('../types').CalendarEvent | null>(null);
    const [eventResponses, setEventResponses] = React.useState<import('../types').EventResponse[]>([]);
    const [responsesLoading, setResponsesLoading] = React.useState(false);
    const [approvingId, setApprovingId] = React.useState<string | null>(null);
    const [rsvpCounts, setRsvpCounts] = React.useState<Record<string, number>>({});
    const [rewardFeedback, setRewardFeedback] = React.useState<{ id: string; xp: number; pts: number } | null>(null);

    const loadResponses = React.useCallback(async (evt: import('../types').CalendarEvent) => {
        if (!clubId) return;
        setResponsesLoading(true);
        const res = await fetch(`/api/clubs/${clubId}/events/${evt.id}/responses`);
        if (res.ok) {
            const rows = await res.json();
            setEventResponses(rows);
            setRsvpCounts(prev => ({ ...prev, [evt.id]: rows.filter((r: any) => r.rsvp_status === 'coming').length }));
        }
        setResponsesLoading(false);
    }, [clubId]);

    const openManageEvent = (evt: import('../types').CalendarEvent) => {
        setManageEvent(evt);
        loadResponses(evt);
    };

    const approveAttendance = async (response: import('../types').EventResponse) => {
        if (!clubId || !manageEvent) return;
        setApprovingId(response.id);
        setRewardFeedback(null);
        try {
            const res = await fetch(`/api/clubs/${clubId}/events/${manageEvent.id}/responses/${response.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    xpReward: manageEvent.xpReward || 0,
                    pointsReward: manageEvent.pointsReward || 0,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if ((data.xpGiven || 0) > 0 || (data.pointsGiven || 0) > 0) {
                    setRewardFeedback({ id: response.id, xp: data.xpGiven || 0, pts: data.pointsGiven || 0 });
                    setTimeout(() => setRewardFeedback(null), 4000);
                }
            }
        } catch {}
        await loadResponses(manageEvent);
        setApprovingId(null);
    };

    const handleRemoveEvent = (id: string) => {
        if (confirm('Cancel this event? Parents will no longer see it.')) {
            onUpdateData({ events: (data.events || []).filter(e => e.id !== id) });
        }
    };

    React.useEffect(() => {
        if (!clubId || !(data.events || []).length) return;
        (data.events || []).forEach(async (evt) => {
            try {
                const res = await fetch(`/api/clubs/${clubId}/events/${evt.id}/responses`);
                if (res.ok) {
                    const rows = await res.json();
                    const count = rows.filter((r: any) => r.rsvp_status === 'coming').length;
                    setRsvpCounts(prev => ({ ...prev, [evt.id]: count }));
                }
            } catch {}
        });
    }, [clubId, data.events]);

    const [newVideo, setNewVideo] = useState({ 
        title: '', 
        url: '', 
        beltId: 'all', 
        tags: [] as string[],
        tagsInput: '', // Raw input value for tags field
        contentType: 'video' as 'video' | 'document',
        status: 'live' as 'draft' | 'live',
        pricingType: 'free' as 'free' | 'premium',
        xpReward: 10,
        description: '',
        publishAt: '', // Scheduled publishing date
        requiresVideo: false, // Requires video proof of technique
        videoAccess: 'premium' as 'premium' | 'free', // Who can submit video proof
        maxPerWeek: null as number | null, // Limit completions per week (null = unlimited)
        locationFilter: 'all', // 'all' or a specific location name
        classFilter: 'all',    // 'all' or a specific class name
    });
    const [editingContentId, setEditingContentId] = useState<string | null>(null);
    const [activeContentTab, setActiveContentTab] = useState<'video' | 'document' | 'event'>('video');
    
    const customTags = data.customVideoTags || [];
    const allTags = [...DEFAULT_VIDEO_TAGS, ...customTags.map(t => ({ id: t, name: t, icon: '🏷️' }))];
    const curriculum = data.curriculum || [];

    const toggleTag = (tagId: string) => {
        const updated = newVideo.tags.includes(tagId)
            ? newVideo.tags.filter(t => t !== tagId)
            : [...newVideo.tags, tagId];
        setNewVideo({...newVideo, tags: updated});
    };

    const handleAddContent = async () => {
        if(!newVideo.title) return;
        const finalStatus = newVideo.publishAt ? 'draft' : newVideo.status;
        const item: CurriculumItem = {
            id: `vid-${Date.now()}`,
            title: newVideo.title,
            url: newVideo.url,
            beltId: newVideo.beltId,
            category: newVideo.tags.join(','),
            description: newVideo.description || 'Uploaded by Instructor',
            authorName: data.ownerName,
            contentType: newVideo.contentType,
            status: finalStatus, // If scheduled, start as draft
            pricingType: newVideo.pricingType,
            xpReward: newVideo.xpReward,
            viewCount: 0,
            completionCount: 0,
            publishAt: newVideo.publishAt || undefined,
            requiresVideo: newVideo.requiresVideo,
            videoAccess: newVideo.requiresVideo ? newVideo.videoAccess : undefined,
            maxPerWeek: newVideo.maxPerWeek || undefined,
            locationFilter: newVideo.locationFilter || 'all',
            classFilter: newVideo.classFilter || 'all',
        };
        onUpdateData({ curriculum: [...curriculum, item] });
        setNewVideo({ title: '', url: '', beltId: 'all', tags: [], tagsInput: '', contentType: 'video', status: 'live', pricingType: 'free', xpReward: 10, description: '', publishAt: '', requiresVideo: false, videoAccess: 'premium', maxPerWeek: null, locationFilter: 'all', classFilter: 'all' });
        
        if (clubId) {
            try {
                const syncResp = await fetch('/api/content/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clubId, content: item })
                });
                const syncResult = await syncResp.json();
                if (syncResult.contentId) {
                    const updatedCurriculum = [...curriculum, { ...item, id: syncResult.contentId }];
                    onUpdateData({ curriculum: updatedCurriculum });
                }
                if (finalStatus === 'live') {
                    fetch('/api/content/notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clubId,
                            contentId: syncResult.contentId || item.id,
                            title: item.title,
                            description: item.description,
                            beltId: item.beltId,
                            pricingType: item.pricingType,
                            locationFilter: item.locationFilter,
                            classFilter: item.classFilter,
                            contentType: item.contentType,
                        })
                    }).catch(err => console.error('Failed to send content notifications:', err));
                }
            } catch (err) {
                console.error('Failed to sync content:', err);
            }
        }
    };

    const filterContent = (items: CurriculumItem[]) => items;

    // Check for scheduled content that should be published
    const checkScheduledPublishing = () => {
        const now = new Date();
        const updatedCurriculum = curriculum.map(item => {
            if (item.publishAt && item.status === 'draft') {
                const publishDate = new Date(item.publishAt);
                if (publishDate <= now) {
                    return { ...item, status: 'live' as const, publishAt: undefined };
                }
            }
            return item;
        });
        if (JSON.stringify(updatedCurriculum) !== JSON.stringify(curriculum)) {
            onUpdateData({ curriculum: updatedCurriculum });
        }
    };

    React.useEffect(() => {
        checkScheduledPublishing();
        const interval = setInterval(checkScheduledPublishing, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [curriculum]);

    const toggleContentStatus = async (contentId: string) => {
        const content = curriculum.find(c => c.id === contentId);
        if (!content) return;
        
        const newStatus = content.status === 'live' ? 'draft' : 'live';
        const updated = curriculum.map(c => 
            c.id === contentId ? { ...c, status: newStatus as 'draft' | 'live' } : c
        );
        onUpdateData({ curriculum: updated });
        
        // Sync to database whenever status changes
        if (clubId) {
            try {
                console.log('[CreatorHub] Syncing content to database:', { clubId, title: content.title, newStatus });
                const response = await fetch('/api/content/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clubId,
                        content: { ...content, status: newStatus }
                    })
                });
                const result = await response.json();
                console.log('[CreatorHub] Sync result:', result);
            } catch (err) {
                console.error('[CreatorHub] Failed to sync content:', err);
            }
        }
    };

    const videoItems = curriculum.filter(c => c.contentType !== 'document');
    const docItems   = curriculum.filter(c => c.contentType === 'document');
    const liveContent = curriculum.filter(c => c.status === 'live');
    const draftContent = curriculum.filter(c => c.status !== 'live');
    const scheduledContent = draftContent.filter(c => c.publishAt);

    const tabItems = activeContentTab === 'video' ? videoItems : activeContentTab === 'document' ? docItems : [];
    const tabLive = tabItems.filter(c => c.status === 'live');
    const tabDraft = tabItems.filter(c => c.status !== 'live');

    const CONTENT_TABS: { id: 'video' | 'document' | 'event'; label: string; icon: string; count: number }[] = [
        { id: 'video',    label: t('admin.creatorHub.videos'),    icon: '📹', count: videoItems.length },
        { id: 'document', label: t('admin.creatorHub.documents'),  icon: '📄', count: docItems.length },
        { id: 'event',    label: 'Events',                         icon: '📅', count: (data.events || []).length },
    ];

    return (
        <div className="space-y-6">
            <SectionHeader title={t('admin.creatorHub.title')} description={t('admin.creatorHub.description')} />

            {/* ── Quick Stats ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: t('admin.creatorHub.totalItems'),  value: curriculum.length,                                           color: 'text-white' },
                    { label: t('admin.creatorHub.published'),   value: liveContent.length,                                          color: 'text-emerald-400' },
                    { label: t('common.premium'),              value: curriculum.filter(c => c.pricingType === 'premium').length,   color: 'text-yellow-400' },
                    { label: t('admin.creatorHub.drafts'),      value: draftContent.length,                                         color: 'text-gray-400' },
                ].map(s => (
                    <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                        <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Tab navigation ── */}
            <div className="flex bg-gray-800/60 rounded-xl p-1 border border-gray-700 gap-1">
                {CONTENT_TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveContentTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 sm:px-4 rounded-lg text-sm font-semibold transition-all ${
                            activeContentTab === tab.id
                                ? 'bg-gray-900 text-white shadow border border-gray-600'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700/40'
                        }`}
                    >
                        <span>{tab.icon}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                            activeContentTab === tab.id ? 'bg-gray-700 text-gray-300' : 'bg-gray-700/50 text-gray-500'
                        }`}>{tab.count}</span>
                    </button>
                ))}
            </div>

            {/* ── Content tabs: Video & Document ── */}
            {activeContentTab !== 'event' && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                    {/* Content list — left 3 cols */}
                    <div className="lg:col-span-3 space-y-4">
                        {/* Live content */}
                        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-700/60">
                                <h3 className="font-bold text-white text-sm">{t('admin.creatorHub.publishedContent')} <span className="text-gray-500 font-normal">({tabLive.length})</span></h3>
                            </div>
                            {tabLive.length === 0 ? (
                                <p className="text-gray-500 italic text-sm px-4 sm:px-5 py-6 text-center">{t('admin.creatorHub.noPublishedContent')}</p>
                            ) : (
                                <div className="divide-y divide-gray-700/50">
                                    {tabLive.map(vid => (
                                        <div key={vid.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 sm:px-5 py-3 hover:bg-gray-700/20 transition-colors">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-semibold text-white text-sm truncate">{vid.title}</p>
                                                    <span className="text-xs px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded-full font-semibold">{t('admin.creatorHub.liveLabel')}</span>
                                                    {vid.pricingType === 'premium' && <span className="text-xs px-1.5 py-0.5 bg-yellow-600/20 text-yellow-400 rounded-full font-semibold">{t('admin.creatorHub.premiumLabel')}</span>}
                                                    {vid.requiresVideo && <span className="text-xs px-1.5 py-0.5 bg-purple-600/20 text-purple-400 rounded-full">🎥</span>}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {vid.beltId === 'all' ? t('common.allBelts') : data.belts.find(b => b.id === vid.beltId)?.name}
                                                    <span className="mx-1.5">·</span>{t('admin.creatorHub.xpLabel', { xp: vid.xpReward || 10 })}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button onClick={() => toggleContentStatus(vid.id)} className="text-yellow-400 hover:text-yellow-300 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">{t('admin.creatorHub.unpublish')}</button>
                                                <button onClick={() => onUpdateData({ curriculum: curriculum.filter(c => c.id !== vid.id) })} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">{t('common.delete')}</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Drafts */}
                        {tabDraft.length > 0 && (
                            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden opacity-80">
                                <div className="px-4 sm:px-5 py-3.5 border-b border-gray-700/60">
                                    <h3 className="font-bold text-white text-sm">
                                        {t('admin.creatorHub.drafts')} <span className="text-gray-500 font-normal">({tabDraft.length})</span>
                                        {scheduledContent.length > 0 && <span className="text-sky-400 text-xs font-normal ml-2">· {scheduledContent.length} {t('admin.creatorHub.scheduledLabel')}</span>}
                                    </h3>
                                </div>
                                <div className="divide-y divide-gray-700/50">
                                    {tabDraft.map(vid => (
                                        <div key={vid.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 sm:px-5 py-3 hover:bg-gray-700/20 transition-colors ${vid.publishAt ? 'border-l-2 border-sky-500' : ''}`}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-semibold text-white text-sm truncate">{vid.title}</p>
                                                    {vid.publishAt ? (
                                                        <span className="text-xs px-1.5 py-0.5 bg-sky-600/20 text-sky-400 rounded-full">📅 {new Date(vid.publishAt).toLocaleDateString()}</span>
                                                    ) : (
                                                        <span className="text-xs px-1.5 py-0.5 bg-gray-600/50 text-gray-400 rounded-full">{t('admin.creatorHub.draftLabel')}</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {vid.beltId === 'all' ? t('common.allBelts') : data.belts.find(b => b.id === vid.beltId)?.name}
                                                    {vid.publishAt && <span className="ml-2 text-sky-400">{t('admin.creatorHub.publishes')} {new Date(vid.publishAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button onClick={() => toggleContentStatus(vid.id)} className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
                                                    {vid.publishAt ? t('admin.creatorHub.publishNow') : t('admin.creatorHub.publish')}
                                                </button>
                                                <button onClick={() => onUpdateData({ curriculum: curriculum.filter(c => c.id !== vid.id) })} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">{t('common.delete')}</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Add new content form — right 2 cols */}
                    <div className="lg:col-span-2">
                        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 lg:sticky top-4">
                            <h3 className="font-bold text-white text-sm mb-1">{t('admin.creatorHub.addNewContent')}</h3>
                            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                                {t('admin.creatorHub.contentAppearsIn')}
                            </p>
                            <div className="space-y-3">
                                {/* Content type toggle */}
                                <div className="flex gap-1.5 bg-gray-900/60 p-1 rounded-lg">
                                    <button
                                        onClick={() => { setNewVideo({...newVideo, contentType: 'video'}); setActiveContentTab('video'); }}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${newVideo.contentType === 'video' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >📹 {t('admin.creatorHub.videoType')}</button>
                                    <button
                                        onClick={() => { setNewVideo({...newVideo, contentType: 'document'}); setActiveContentTab('document'); }}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${newVideo.contentType === 'document' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >📄 {t('admin.creatorHub.documentType')}</button>
                                </div>
                                <input
                                    type="text"
                                    placeholder={t('admin.creatorHub.titlePlaceholder')}
                                    value={newVideo.title}
                                    onChange={e => setNewVideo({...newVideo, title: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 transition-colors"
                                />
                                <input
                                    type="text"
                                    placeholder={newVideo.contentType === 'video' ? t('admin.creatorHub.videoUrlPlaceholder') : t('admin.creatorHub.documentUrlPlaceholder')}
                                    value={newVideo.url}
                                    onChange={e => setNewVideo({...newVideo, url: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 transition-colors"
                                />
                                <textarea
                                    placeholder={t('admin.creatorHub.descriptionPlaceholder')}
                                    value={newVideo.description}
                                    onChange={e => setNewVideo({...newVideo, description: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm h-16 resize-none focus:outline-none focus:border-sky-500 transition-colors"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.beltLevel')}</label>
                                        <select value={newVideo.beltId} onChange={e => setNewVideo({...newVideo, beltId: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500">
                                            <option value="all">{t('common.allBelts')}</option>
                                            {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.xpReward')}</label>
                                        <input type="number" min="0" max="100" value={newVideo.xpReward} onChange={e => setNewVideo({...newVideo, xpReward: parseInt(e.target.value) || 0})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500" />
                                    </div>
                                </div>
                                {(data.branchNames?.length > 0 || data.classes?.length > 0) && (
                                    <div className="grid grid-cols-2 gap-3">
                                        {data.branchNames?.length > 0 && (
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.locationLabel')}</label>
                                                <select value={newVideo.locationFilter} onChange={e => setNewVideo({...newVideo, locationFilter: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500">
                                                    <option value="all">{t('admin.creatorHub.allLocations')}</option>
                                                    {data.branchNames.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                </select>
                                            </div>
                                        )}
                                        {data.classes?.length > 0 && (
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.classLabel')}</label>
                                                <select value={newVideo.classFilter} onChange={e => setNewVideo({...newVideo, classFilter: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500">
                                                    <option value="all">{t('admin.creatorHub.allClasses')}</option>
                                                    {(newVideo.locationFilter !== 'all' && data.locationClasses?.[newVideo.locationFilter]
                                                        ? data.locationClasses[newVideo.locationFilter]
                                                        : data.classes
                                                    ).map(cls => <option key={cls} value={cls}>{cls}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.access')}</label>
                                        <select value={newVideo.pricingType} onChange={e => setNewVideo({...newVideo, pricingType: e.target.value as 'free' | 'premium'})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500">
                                            <option value="free">{t('admin.creatorHub.freeForAll')}</option>
                                            <option value="premium">{t('admin.creatorHub.premiumOnly')}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.statusLabel')}</label>
                                        <select value={newVideo.status} onChange={e => setNewVideo({...newVideo, status: e.target.value as 'draft' | 'live', publishAt: ''})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500">
                                            <option value="draft">{t('admin.creatorHub.draftHidden')}</option>
                                            <option value="live">{t('admin.creatorHub.livePublished')}</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Scheduled Publishing */}
                                <div className="bg-gray-700/40 p-3 rounded-lg border border-gray-600/50">
                                    <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-2"><span>📅</span> {t('admin.creatorHub.schedulePublishing')}</label>
                                    <input type="datetime-local" value={newVideo.publishAt} onChange={e => setNewVideo({...newVideo, publishAt: e.target.value, status: 'draft'})} min={new Date().toISOString().slice(0, 16)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500" />
                                    {newVideo.publishAt && <p className="text-xs text-sky-400 mt-1">{t('admin.creatorHub.contentWillAutoPublish')} {new Date(newVideo.publishAt).toLocaleString()}</p>}
                                </div>

                                {/* Video Proof */}
                                <div className="bg-gray-700/40 p-3 rounded-lg border border-gray-600/50">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={newVideo.requiresVideo} onChange={e => setNewVideo({...newVideo, requiresVideo: e.target.checked})} className="w-4 h-4 rounded border-gray-500 bg-gray-600 text-cyan-500 focus:ring-cyan-500" />
                                        <span className="text-xs text-white font-medium">{t('admin.creatorHub.requireVideoProof')}</span>
                                    </label>
                                    {newVideo.requiresVideo && (
                                        <div className="mt-2 pl-6">
                                            <select value={newVideo.videoAccess} onChange={e => setNewVideo({...newVideo, videoAccess: e.target.value as 'premium' | 'free'})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-sky-500">
                                                <option value="premium">{t('admin.creatorHub.premiumOnly')}</option>
                                                <option value="free">{t('admin.creatorHub.freeForAll')}</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Weekly Limit */}
                                <div className="bg-gray-700/40 p-3 rounded-lg border border-gray-600/50">
                                    <label className="block text-xs text-gray-400 mb-1.5">{t('admin.creatorHub.weeklyLimit')}</label>
                                    <select value={newVideo.maxPerWeek === null ? '' : newVideo.maxPerWeek} onChange={e => setNewVideo({...newVideo, maxPerWeek: e.target.value ? parseInt(e.target.value) : null})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-sky-500">
                                        <option value="">{t('admin.creatorHub.unlimitedNoLimit')}</option>
                                        {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{t('admin.creatorHub.perWeek', { count: n })}</option>)}
                                        <option value="7">{t('admin.creatorHub.dailyPerWeek')}</option>
                                    </select>
                                </div>

                                {/* Tags */}
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">{t('admin.creatorHub.tagsLabel')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('admin.creatorHub.tagsPlaceholder')}
                                        value={newVideo.tagsInput ?? newVideo.tags.join(', ')}
                                        onChange={e => {
                                            const raw = e.target.value;
                                            setNewVideo({...newVideo, tags: raw.split(',').map(t => t.trim()).filter(Boolean), tagsInput: raw});
                                        }}
                                        onBlur={e => {
                                            const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                            setNewVideo({...newVideo, tags, tagsInput: tags.join(', ')});
                                        }}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
                                    />
                                </div>

                                <button
                                    onClick={handleAddContent}
                                    disabled={!newVideo.title}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
                                >
                                    {newVideo.publishAt ? t('admin.creatorHub.scheduleContent') : (newVideo.status === 'live' ? t('admin.creatorHub.publishContent') : t('admin.creatorHub.saveAsDraft'))}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Events tab ── */}
            {activeContentTab === 'event' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                        <p className="text-sm text-gray-400">Competitions, belt tests, seminars — parents RSVP from their Training Ops tab</p>
                        <button
                            onClick={() => onOpenModal?.('event')}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-colors flex items-center gap-2 text-sm whitespace-nowrap self-start sm:self-auto"
                        >
                            + Add Event
                        </button>
                    </div>

                    <div className="flex items-start gap-2.5 bg-purple-900/20 border border-purple-800/40 rounded-xl p-3">
                        <span className="text-purple-400 mt-0.5 shrink-0">📲</span>
                        <p className="text-xs text-purple-300 leading-relaxed">
                            Events appear in the <strong>parent portal → Training Ops tab</strong>. Parents can RSVP, and attendance rewards (HonorXP™ &amp; Belt Points) are issued when you approve attendance.
                        </p>
                    </div>

                    {(data.events || []).length === 0 ? (
                        <div className="bg-gray-800/50 rounded-xl border border-dashed border-gray-700 p-12 text-center">
                            <p className="text-4xl mb-3">📅</p>
                            <p className="text-gray-400 font-semibold">No upcoming events</p>
                            <p className="text-gray-600 text-sm mt-1 mb-4">Add competitions, belt tests or socials so parents can RSVP</p>
                            <button onClick={() => onOpenModal?.('event')} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-colors">
                                + Add your first event
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(data.events || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(evt => {
                                const comingCount = rsvpCounts[evt.id] || 0;
                                const hasReward = (evt.xpReward || 0) > 0 || (evt.pointsReward || 0) > 0;
                                const TYPE_COLORS: Record<string, string> = {
                                    competition: 'bg-red-900/50 text-red-300 border-red-800',
                                    test: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
                                    seminar: 'bg-blue-900/50 text-blue-300 border-blue-800',
                                    social: 'bg-green-900/50 text-green-300 border-green-800',
                                };
                                const typeColor = TYPE_COLORS[evt.type] || 'bg-gray-700 text-gray-300 border-gray-600';
                                const d = new Date(evt.date);
                                return (
                                    <div key={evt.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className="flex-shrink-0 w-12 sm:w-14 bg-gray-900 rounded-xl text-center py-2 border border-gray-700">
                                                <p className="text-gray-500 text-xs uppercase font-bold">{d.toLocaleString('default', { month: 'short' })}</p>
                                                <p className="text-white text-lg sm:text-xl font-bold leading-none mt-0.5">{d.getDate()}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <h4 className="font-bold text-white text-sm sm:text-base">{evt.title}</h4>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase ${typeColor}`}>{evt.type}</span>
                                                            {comingCount > 0 && (
                                                                <span className="text-xs bg-emerald-900/50 border border-emerald-700 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                                                                    ✓ {comingCount}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-gray-400 text-xs sm:text-sm">{evt.time} · {evt.location}</p>
                                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                            {evt.pricingType === 'premium' && <span className="text-xs bg-yellow-900/40 border border-yellow-800 text-yellow-300 px-2 py-0.5 rounded-full">⭐ Premium</span>}
                                                            {evt.beltFilter && evt.beltFilter !== 'all' && <span className="text-xs bg-sky-900/40 border border-sky-800 text-sky-300 px-2 py-0.5 rounded-full">🥋 {data.belts.find(b => b.id === evt.beltFilter)?.name || evt.beltFilter}</span>}
                                                            {evt.locationFilter && evt.locationFilter !== 'all' && <span className="text-xs bg-gray-700 border border-gray-600 text-gray-300 px-2 py-0.5 rounded-full">📍 {evt.locationFilter}</span>}
                                                            {evt.classFilter && evt.classFilter !== 'all' && <span className="text-xs bg-gray-700 border border-gray-600 text-gray-300 px-2 py-0.5 rounded-full">🎓 {evt.classFilter}</span>}
                                                            {(evt.xpReward || 0) > 0 && <span className="text-xs bg-purple-900/40 border border-purple-800 text-purple-300 px-2 py-0.5 rounded-full">+{evt.xpReward} HonorXP™</span>}
                                                            {(evt.pointsReward || 0) > 0 && <span className="text-xs bg-amber-900/40 border border-amber-800 text-amber-300 px-2 py-0.5 rounded-full">+{evt.pointsReward} Belt Pts</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                        <button onClick={() => openManageEvent(evt)} className="bg-gray-700 hover:bg-purple-800 border border-gray-600 hover:border-purple-600 text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1">
                                                            <Users size={11} /> Responses
                                                        </button>
                                                        <button onClick={() => handleRemoveEvent(evt.id)} className="text-gray-600 hover:text-red-400 text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-red-900/20 transition-colors text-right">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Manage Responses slide-over ─── */}
            {manageEvent && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setManageEvent(null)} />
                    <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-700 flex flex-col h-full shadow-2xl">
                        <div className="flex items-start justify-between p-5 border-b border-gray-700">
                            <div>
                                <h3 className="font-bold text-white text-lg">{manageEvent.title}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{new Date(manageEvent.date).toLocaleDateString()} · {manageEvent.time} · {manageEvent.location}</p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {(manageEvent.xpReward || 0) > 0 && <span className="text-xs bg-purple-900/40 border border-purple-800 text-purple-300 px-2 py-0.5 rounded-full">+{manageEvent.xpReward} HonorXP™</span>}
                                    {(manageEvent.pointsReward || 0) > 0 && <span className="text-xs bg-amber-900/40 border border-amber-800 text-amber-300 px-2 py-0.5 rounded-full">+{manageEvent.pointsReward} Belt Points</span>}
                                </div>
                                <p className="text-xs text-cyan-400/70 mt-2">After the event, click <strong className="text-cyan-300">Award Rewards</strong> next to each attendee to grant their XP & Belt Points.</p>
                            </div>
                            <button onClick={() => { setManageEvent(null); setRewardFeedback(null); }} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors mt-0.5"><X size={20} /></button>
                        </div>
                        {rewardFeedback && (
                            <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-900/40 border border-emerald-700 rounded-lg px-3 py-2">
                                <span className="text-emerald-400 text-lg">🎉</span>
                                <p className="text-xs text-emerald-300 font-medium">
                                    Rewards awarded!
                                    {rewardFeedback.xp > 0 && <span className="ml-1 text-purple-300">+{rewardFeedback.xp} HonorXP™</span>}
                                    {rewardFeedback.pts > 0 && <span className="ml-1 text-amber-300">+{rewardFeedback.pts} Belt Points</span>}
                                </p>
                            </div>
                        )}
                        <div className="grid grid-cols-3 divide-x divide-gray-800 border-b border-gray-800">
                            {(['coming', 'not_coming', 'pending'] as const).map(status => {
                                const count = eventResponses.filter(r => r.rsvp_status === status).length;
                                const label = status === 'coming' ? t('admin.schedule.rsvp.coming') : status === 'not_coming' ? t('admin.schedule.rsvp.notComing') : t('admin.schedule.rsvp.pending');
                                const color = status === 'coming' ? 'text-emerald-400' : status === 'not_coming' ? 'text-red-400' : 'text-gray-400';
                                return (
                                    <div key={status} className="p-3 text-center">
                                        <p className={`text-xl font-bold ${color}`}>{count}</p>
                                        <p className="text-xs text-gray-500">{label}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {responsesLoading && <div className="text-center py-8"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
                            {!responsesLoading && eventResponses.length === 0 && <p className="text-center text-gray-500 py-8 text-sm">No responses yet</p>}
                            {!responsesLoading && eventResponses.length > 0 && (
                                <div className="space-y-2">
                                    {(['coming', 'not_coming'] as const).map(status => {
                                        const group = eventResponses.filter(r => r.rsvp_status === status);
                                        if (!group.length) return null;
                                        return (
                                            <div key={status}>
                                                <p className="text-xs text-gray-500 uppercase font-semibold mb-2">{status === 'coming' ? t('admin.schedule.rsvp.coming') : t('admin.schedule.rsvp.notComing')} ({group.length})</p>
                                                {group.map(resp => (
                                                    <div key={resp.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between gap-3 mb-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-white truncate">{resp.student_name || t('admin.schedule.rsvp.unknownStudent')}</p>
                                                            <p className="text-xs text-gray-400 truncate">{resp.parent_email}</p>
                                                            {resp.student_belt && <p className="text-xs text-cyan-400">{resp.student_belt}</p>}
                                                        </div>
                                                        {status === 'coming' && (() => {
                                                            const xpPending = !resp.reward_issued && (manageEvent?.xpReward || 0) > 0;
                                                            const ptsPending = !resp.points_issued && (manageEvent?.pointsReward || 0) > 0;
                                                            const needsAward = !resp.attendance_confirmed || xpPending || ptsPending;
                                                            if (needsAward) return (
                                                                <button disabled={approvingId === resp.id} onClick={() => approveAttendance(resp)} className="shrink-0 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                                                                    {approvingId === resp.id ? '…' : '🏅 Award Rewards'}
                                                                </button>
                                                            );
                                                            return <span className="shrink-0 text-xs bg-emerald-900/50 border border-emerald-700 text-emerald-300 px-2 py-1 rounded-lg">✓ All Rewarded</span>;
                                                        })()}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const BillingTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, clubId?: string, onShowPricing?: () => void }> = ({ data, onUpdateData, clubId, onShowPricing }) => {
    const { t } = useTranslation(data.language);
    const totalStudents = data.students.length;
    const recommendedTier = PRICING_TIERS.find(tier => totalStudents <= tier.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
    const [subscribedPlanId, setSubscribedPlanId] = useState<string | null>(() => {
        // Initialize from localStorage if available
        try {
            const saved = localStorage.getItem('taekup_subscription');
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.planId || null;
            }
        } catch (e) {}
        return null;
    });
    // Use actual subscribed plan if available, otherwise fall back to recommended based on student count
    const currentTier = subscribedPlanId 
        ? (PRICING_TIERS.find(tier => tier.name.toLowerCase() === subscribedPlanId.toLowerCase()) || recommendedTier)
        : recommendedTier;
    const [connectingBank, setConnectingBank] = useState(false);
    const [showStripeConnectModal, setShowStripeConnectModal] = useState(false);
    const [verifiedStatus, setVerifiedStatus] = useState<{ status: string; label: string; color: string; daysLeft: number } | null>(null);
    const [toggleLoading, setToggleLoading] = useState(false);
    const [stripeConnectStatus, setStripeConnectStatus] = useState<{ connected: boolean; isComplete?: boolean; payoutsEnabled?: boolean; accountId?: string } | null>(null);

    const [backfillLoading, setBackfillLoading] = useState(false);
    const [backfillResult, setBackfillResult] = useState<{ updated: number; skipped: number } | null>(null);

    const runBackfill = async (effectiveClubId: string) => {
        setBackfillLoading(true);
        try {
            const r = await fetch('/api/stripe/connect/backfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId: effectiveClubId }),
            });
            const d = await r.json();
            if (d.success) setBackfillResult({ updated: d.updated, skipped: d.skipped });
        } catch {}
        setBackfillLoading(false);
    };

    useEffect(() => {
        const effectiveClubId = clubId || localStorage.getItem('taekup_club_id');
        if (!effectiveClubId) return;
        fetch(`/api/stripe/connect/status?clubId=${effectiveClubId}`)
            .then(r => r.json())
            .then(statusData => {
                setStripeConnectStatus(statusData);
                // Auto-backfill existing subscriptions when club is connected
                if (statusData.connected) runBackfill(effectiveClubId);
            })
            .catch(() => {});
        // Clear the ?stripe_connect=success from URL if present
        if (window.location.search.includes('stripe_connect=success')) {
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [clubId]);
    
    const bulkCost = data.clubSponsoredPremium ? (totalStudents * 1.99) : 0;
    
    const [showUniversalAccessModal, setShowUniversalAccessModal] = useState(false);

    const handleUniversalAccessToggle = () => {
        setShowUniversalAccessModal(true);
    };

    const confirmUniversalAccessToggle = async () => {
        setShowUniversalAccessModal(false);
        
        const effectiveClubId = clubId || localStorage.getItem('taekup_club_id');
        if (!effectiveClubId) {
            alert(t('admin.billing.noStripeCustomer'));
            return;
        }
        
        setToggleLoading(true);
        try {
            const newState = !data.clubSponsoredPremium;
            const res = await fetch(`/api/club/${effectiveClubId}/universal-access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    enabled: newState, 
                    studentCount: totalStudents || 1 
                })
            });
            const result = await res.json();
            
            if (result.success) {
                onUpdateData({ clubSponsoredPremium: newState });
                console.log('[BillingTab] Universal Access toggled:', result);
            } else {
                console.error('[BillingTab] Universal Access toggle failed:', result);
                alert(result.error || t('admin.billing.universalAccess.failedToUpdate'));
            }
        } catch (err: any) {
            console.error('[BillingTab] Universal Access toggle error:', err);
            alert(t('admin.billing.universalAccess.failedToUpdateSubscription'));
        } finally {
            setToggleLoading(false);
        }
    };
    const totalBill = currentTier.price + bulkCost;

    useEffect(() => {
        const effectiveClubId = clubId || localStorage.getItem('taekup_club_id');
        if (effectiveClubId) {
            fetch(`/api/club/${effectiveClubId}/verify-subscription`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            .then(res => res.json())
            .then(result => {
                console.log('[BillingTab] Subscription verification result:', result);
                if (result.success && result.hasActiveSubscription) {
                    setVerifiedStatus({ status: 'active', label: 'Active', color: 'bg-green-600 text-green-100', daysLeft: -1 });
                    // Force update localStorage with active subscription - use actual plan from Stripe
                    const actualPlan = result.planId || 'starter';
                    setSubscribedPlanId(actualPlan); // Update state to reflect actual plan
                    const existingSub = localStorage.getItem('taekup_subscription');
                    let sub = existingSub ? JSON.parse(existingSub) : { trialEndDate: new Date().toISOString() };
                    sub.planId = actualPlan;
                    sub.isTrialActive = false;
                    sub.isLocked = false;
                    localStorage.setItem('taekup_subscription', JSON.stringify(sub));
                    console.log('[BillingTab] Updated localStorage subscription to active with plan:', actualPlan);
                    // Dispatch event to notify App.tsx to refresh subscription state and hide trial banner
                    window.dispatchEvent(new Event('subscription-updated'));
                } else if (result.success && !result.hasActiveSubscription && result.trialStatus === 'active') {
                    // User is in trial - clear any stale planId and set trial active
                    const existingSub = localStorage.getItem('taekup_subscription');
                    let sub = existingSub ? JSON.parse(existingSub) : {};
                    // Calculate trial end date from signup data
                    const savedSignup = localStorage.getItem('taekup_signup_data');
                    let trialEndDate = sub.trialEndDate;
                    if (savedSignup) {
                        try {
                            const parsed = JSON.parse(savedSignup);
                            if (parsed.trialStartDate) {
                                const start = new Date(parsed.trialStartDate);
                                trialEndDate = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
                            }
                        } catch (e) {}
                    }
                    if (!trialEndDate) {
                        trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
                    }
                    sub.planId = null;
                    sub.isTrialActive = true;
                    sub.isLocked = false;
                    sub.trialEndDate = trialEndDate;
                    localStorage.setItem('taekup_subscription', JSON.stringify(sub));
                    console.log('[BillingTab] Updated localStorage subscription to trial mode:', sub);
                    // Dispatch event to notify App.tsx to refresh subscription state
                    window.dispatchEvent(new Event('subscription-updated'));
                }
            })
            .catch(err => console.error('[BillingTab] Subscription verification failed:', err));
        }
    }, [clubId]);

    const getSubscriptionStatus = () => {
        // First check if user has an active subscription (paid)
        const savedSubscription = localStorage.getItem('taekup_subscription');
        if (savedSubscription) {
            try {
                const sub = JSON.parse(savedSubscription);
                if (sub.planId && !sub.isTrialActive) {
                    return { status: 'active', label: 'Active', color: 'bg-green-600 text-green-100', daysLeft: -1 };
                }
            } catch (e) {}
        }
        
        // Fall back to trial logic
        const savedSignup = localStorage.getItem('taekup_signup_data');
        let trialStartDate: string | null = null;
        if (savedSignup) {
            try {
                const parsed = JSON.parse(savedSignup);
                trialStartDate = parsed.trialStartDate;
            } catch (e) {}
        }
        
        if (!trialStartDate) return { status: 'trial', label: 'Trial', color: 'bg-yellow-600 text-yellow-100', daysLeft: 14 };
        
        const trialStart = new Date(trialStartDate);
        const now = new Date();
        const trialEndDate = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        
        if (daysLeft > 0) {
            return { status: 'trial', label: `Trial (${daysLeft} days left)`, color: 'bg-yellow-600 text-yellow-100', daysLeft };
        } else {
            return { status: 'expired', label: 'Trial Expired', color: 'bg-red-600 text-red-100', daysLeft: 0 };
        }
    };

    const subscriptionStatus = verifiedStatus || getSubscriptionStatus();

    const handleConnectBank = async () => {
        setShowStripeConnectModal(true);
    };

    return (
        <div className="space-y-6">
            {showStripeConnectModal && (
                <StripeConnectModal
                    clubId={clubId || localStorage.getItem('taekup_club_id') || localStorage.getItem('clubId') || ''}
                    ownerEmail={localStorage.getItem('taekup_user_email') || data.ownerEmail || ''}
                    clubName={data.clubName || ''}
                    clubCountry={data.country || ''}
                    onClose={() => setShowStripeConnectModal(false)}
                    onSuccess={(url) => {
                        setShowStripeConnectModal(false);
                        window.location.href = url;
                    }}
                    t={t}
                />
            )}

            {/* Page Header */}
            <div className="border-b border-gray-700 pb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-white">{t('admin.billing.billingAndSubscription')}</h2>
                <p className="text-gray-400 text-sm mt-1">{t('admin.billing.managePlan')}</p>
            </div>

            {/* Current Plan Card */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {/* Card Header */}
                <div className="bg-gradient-to-r from-sky-900/40 to-cyan-900/40 px-5 py-4 border-b border-gray-700 flex flex-wrap gap-3 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-sky-500/20 p-2 rounded-lg">
                            <span className="text-xl">📋</span>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{t('admin.billing.currentPlan')}</p>
                            <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">{currentTier.name}</h3>
                        </div>
                    </div>
                    <span className={`${subscriptionStatus.color} px-3 py-1.5 rounded-full text-xs font-bold shrink-0`}>
                        {subscriptionStatus.label}
                    </span>
                </div>

                <div className="p-5 space-y-5">
                    {/* Student usage bar */}
                    <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-400">{t('admin.billing.usage')}</span>
                            <span className="text-gray-300 font-medium">
                                {t('admin.billing.usageCount', { current: totalStudents, limit: currentTier.limit === Infinity ? '∞' : currentTier.limit })}
                            </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div
                                className="bg-sky-400 h-2.5 rounded-full transition-all"
                                style={{ width: `${Math.min((totalStudents / (currentTier.limit === Infinity ? 1000 : currentTier.limit)) * 100, 100)}%` }}
                            />
                        </div>
                    </div>

                    {/* Billing breakdown */}
                    <div className="bg-gray-900/60 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
                            <span className="text-gray-400 text-sm">{t('admin.billing.baseSubscription')}</span>
                            <span className="text-white font-semibold text-sm">${currentTier.price}/mo</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-900/30">
                            <span className="text-white font-bold">{t('admin.billing.totalMonthly')}</span>
                            <span className="text-2xl font-extrabold text-white">${currentTier.price.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* CTA */}
                    {subscriptionStatus.status === 'active' ? (
                        <button
                            onClick={async () => {
                                try {
                                    const effectiveClubId = clubId || localStorage.getItem('taekup_club_id');
                                    const verifyRes = await fetch(`/api/club/${effectiveClubId}/verify-subscription`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' }
                                    });
                                    const verifyResult = await verifyRes.json();
                                    if (!verifyResult.customerId) {
                                        alert(t('admin.billing.noStripeCustomer'));
                                        return;
                                    }
                                    const res = await fetch('/api/customer-portal', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ customerId: verifyResult.customerId })
                                    });
                                    const result = await res.json();
                                    if (result.url) {
                                        window.location.href = result.url;
                                    } else {
                                        alert(result.error || t('admin.billing.failedToOpenPortal'));
                                    }
                                } catch (err) {
                                    alert(t('admin.billing.failedToOpenPortal'));
                                }
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm"
                        >
                            <span>⚙️</span> {t('admin.billing.managePaymentMethod')}
                        </button>
                    ) : (
                        <button
                            onClick={() => onShowPricing ? onShowPricing() : (window.location.href = '/pricing')}
                            className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                        >
                            <span>🚀</span> {t('admin.billing.viewPlansAndSubscribe') || 'View Plans & Subscribe'}
                        </button>
                    )}
                </div>
            </div>

            {/* Revenue Share Card */}
            <div className="bg-gray-800 rounded-xl border border-purple-500/30 overflow-hidden">
                {/* Card Header */}
                <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 px-5 py-4 border-b border-purple-500/20 flex items-center gap-3">
                    <div className="bg-purple-500/20 p-2 rounded-lg">
                        <span className="text-xl">💰</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-base sm:text-lg leading-tight">
                            {t('admin.billing.revenueShare.parentPremiumRevenueShare')}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">{t('admin.billing.revenueShare.earnPercentage')}</p>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {/* Revenue split chips */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: 'Parent pays', value: '$4.99', color: 'bg-gray-700 text-gray-200' },
                            { label: 'Your share', value: '$3.28', color: 'bg-green-900/50 text-green-300 border border-green-500/30' },
                            { label: 'Platform fee', value: '$1.71', color: 'bg-gray-700/60 text-gray-400' },
                        ].map((item, i) => (
                            <div key={i} className={`${item.color} rounded-xl p-3 text-center`}>
                                <p className="text-xs opacity-70 mb-1 leading-tight">{item.label}</p>
                                <p className="font-bold text-base sm:text-lg">{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* How it works steps */}
                    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-4">
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-3">{t('admin.billing.revenueShare.howItWorks')}</p>
                        <ol className="space-y-2.5">
                            {[
                                t('admin.billing.revenueShare.step1'),
                                t('admin.billing.revenueShare.step2'),
                                t('admin.billing.revenueShare.step3'),
                            ].map((step, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold mt-0.5">
                                        {i + 1}
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* Bank connect section */}
                    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-4">
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-3">
                            {t('admin.billing.revenueShare.connectYourBank')}
                        </p>

                        {stripeConnectStatus?.connected ? (
                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl mt-0.5">{stripeConnectStatus.payoutsEnabled ? '✅' : '⚠️'}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-semibold ${stripeConnectStatus.payoutsEnabled ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {stripeConnectStatus.payoutsEnabled ? 'Bank Connected' : 'Verification Required'}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                                            {stripeConnectStatus.payoutsEnabled
                                                ? '$3.28 of each $4.99 goes directly to your bank'
                                                : 'Complete identity verification — payouts are on hold until done'}
                                        </p>
                                    </div>
                                </div>

                                {backfillLoading && (
                                    <p className="text-xs text-yellow-400">⏳ Linking existing subscriptions…</p>
                                )}
                                {!backfillLoading && backfillResult && (
                                    <p className="text-xs" style={{ color: backfillResult.updated > 0 ? '#86efac' : backfillResult.skipped === 0 ? '#fbbf24' : '#86efac' }}>
                                        {backfillResult.updated > 0
                                            ? `✅ ${backfillResult.updated} subscription${backfillResult.updated > 1 ? 's' : ''} linked — 70% share active for next billing`
                                            : backfillResult.skipped === 0
                                                ? '⚠️ No active subscriptions found. Complete Stripe verification first.'
                                                : `✅ ${backfillResult.skipped} subscription${backfillResult.skipped !== 1 ? 's' : ''} already linked`}
                                    </p>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleConnectBank}
                                        className="flex-1 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white text-sm font-semibold py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <span>⚙️</span> Manage
                                    </button>
                                    <button
                                        onClick={() => { const id = clubId || localStorage.getItem('taekup_club_id'); if (id) runBackfill(id); }}
                                        disabled={backfillLoading}
                                        className="flex-1 bg-indigo-700 hover:bg-indigo-600 active:bg-indigo-800 disabled:bg-gray-600 text-white text-sm font-semibold py-2.5 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <span>🔄</span> Sync
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-300">{t('admin.billing.revenueShare.connectBankDesc')}</p>
                                <button
                                    onClick={handleConnectBank}
                                    disabled={connectingBank}
                                    className="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    {connectingBank ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                            {t('common.loading')}
                                        </>
                                    ) : (
                                        <>
                                            <span>🔗</span>
                                            {t('admin.billing.revenueShare.connectStripeAccount')}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Example callout */}
                    <div className="bg-indigo-900/30 rounded-xl border border-indigo-500/20 px-4 py-3">
                        <p className="text-xs text-indigo-300 leading-relaxed">
                            <span className="font-bold">{t('admin.billing.revenueShare.example')}</span>{' '}
                            {t('admin.billing.revenueShare.exampleText')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- MAIN COMPONENT ---

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ data, clubId, onBack, onUpdateData, onNavigate, onViewStudentPortal, onShowPricing }) => {
    const { t } = useTranslation(data?.language);
    const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'staff' | 'schedule' | 'creator' | 'settings' | 'billing'>('overview');
    
    
    // Modal State
    const [modalType, setModalType] = useState<string | null>(null);
    
    // Class sessions fetched from DB for the Add Student modal dropdown
    const [modalDbClasses, setModalDbClasses] = useState<{id: number; class_name: string; location: string; day: string; time: string}[]>([]);
    useEffect(() => {
        if (!clubId) return;
        fetch(`/api/clubs/${clubId}/class-sessions`)
            .then(r => r.ok ? r.json() : [])
            .then(rows => setModalDbClasses(Array.isArray(rows) ? rows : []))
            .catch(() => {});
    }, [clubId]);

    // Temporary state for forms
    const [tempStudent, setTempStudent] = useState<Partial<Student>>({});
    const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
    const [tempCoach, setTempCoach] = useState<Partial<Coach>>({});
    const [editingCoachId, setEditingCoachId] = useState<string | null>(null);
    const [tempClass, setTempClass] = useState<Partial<ScheduleItem>>({});
    const [tempEvent, setTempEvent] = useState<Partial<CalendarEvent>>({});
    const [isCustomEventType, setIsCustomEventType] = useState(false);
    const [tempPrivate, setTempPrivate] = useState<{coachName: string, date: string, time: string, price: number}>({coachName: '', date: '', time: '', price: 50});
    
    // Bulk Import State
    const [studentImportMethod, setStudentImportMethod] = useState<'single' | 'bulk' | 'excel' | 'google' | 'transfer'>('single');
    const [transferSearchId, setTransferSearchId] = useState('');
    const [transferStudent, setTransferStudent] = useState<any>(null);
    const [transferLoading, setTransferLoading] = useState(false);
    const [transferError, setTransferError] = useState('');
    const [showCSVImport, setShowCSVImport] = useState(false);
    const [bulkStudentData, setBulkStudentData] = useState('');
    const [parsedBulkStudents, setParsedBulkStudents] = useState<Student[]>([]);
    const [bulkError, setBulkError] = useState('');
    const [bulkLocation, setBulkLocation] = useState(data.branchNames?.[0] || 'Main Location');
    const [bulkClass, setBulkClass] = useState('');
    const excelFileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [importStatus, setImportStatus] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [planLimitModal, setPlanLimitModal] = useState<{
        type: 'hard-limit' | 'trial-expired';
        currentCount: number;
        currentPlan?: string;
        neededTier: typeof PRICING_TIERS[0];
        upgradeTier?: typeof PRICING_TIERS[0];
    } | null>(null);
    const [clearingDemo, setClearingDemo] = useState(false);

    const getSubState = () => {
        let planId: string | null = null;
        let isTrialActive = false;
        try {
            const saved = localStorage.getItem('taekup_subscription');
            if (saved) { const p = JSON.parse(saved); planId = p.planId || null; isTrialActive = p.isTrialActive || false; }
        } catch {}
        let trialDaysLeft = 14;
        try {
            const signup = localStorage.getItem('taekup_signup_data');
            if (signup) {
                const p = JSON.parse(signup);
                if (p.trialStartDate) {
                    const end = new Date(new Date(p.trialStartDate).getTime() + 14 * 24 * 60 * 60 * 1000);
                    trialDaysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
                }
            }
        } catch {}
        const inTrial = isTrialActive || (!planId && trialDaysLeft > 0);
        const trialExpired = !planId && !inTrial;
        const subscribedTier = planId ? PRICING_TIERS.find(t => t.name.toLowerCase() === planId!.toLowerCase()) || null : null;
        return { planId, inTrial, trialExpired, subscribedTier, trialDaysLeft };
    };

    const handleClearDemo = async () => {
        if (!clubId) return;
        setClearingDemo(true);
        try {
            const res = await fetch('/api/demo/clear', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId }),
            });
            const result = await res.json();
            if (result.success) {
                localStorage.removeItem('taekup_wizard_complete');
                localStorage.removeItem('taekup_wizard_data');
                localStorage.removeItem('taekup_wizard_draft');
                window.location.href = '/app/setup';
            } else {
                setClearingDemo(false);
                alert('Failed to clear demo data. Please try again.');
            }
        } catch {
            setClearingDemo(false);
            alert('Network error. Please try again.');
        }
    };

    const handleExcelUpload = (file: File) => {
        console.log('[AdminDashboard] File upload started:', file.name, file.type, file.size);
        setUploadedFileName(file.name);
        setBulkError('');
        setParsedBulkStudents([]);
        
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        
        if (isExcel) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    console.log('[AdminDashboard] Excel file loaded, parsing...');
                    const arrayBuffer = e.target?.result;
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
                    
                    console.log('[AdminDashboard] Excel parsed, rows:', jsonData.length);
                    const csvText = jsonData.map(row => row.join(',')).join('\n');
                    setBulkStudentData(csvText);
                    parseExcelStudents(jsonData);
                } catch (err: any) {
                    console.error('[AdminDashboard] Excel parse error:', err);
                    setBulkError(`Failed to parse Excel file: ${err.message || 'Unknown error'}`);
                }
            };
            reader.onerror = (e) => {
                console.error('[AdminDashboard] File read error:', e);
                setBulkError('Failed to read file. Please try again.');
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                console.log('[AdminDashboard] CSV file loaded');
                const text = e.target?.result as string;
                setBulkStudentData(text);
                parseBulkStudents(text);
            };
            reader.onerror = (e) => {
                console.error('[AdminDashboard] File read error:', e);
                setBulkError('Failed to read file. Please try again.');
            };
            reader.readAsText(file);
        }
    };

    const parseExcelStudents = (rows: string[][]) => {
        const newStudents: Student[] = [];
        
        // Skip header row if it looks like headers
        const startRow = rows[0]?.some(cell => 
            typeof cell === 'string' && 
            ['name', 'student', 'age', 'belt', 'parent'].some(h => cell.toLowerCase().includes(h))
        ) ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
            const cols = rows[i];
            if (!cols || !cols[0]) continue;
            
            const name = String(cols[0] || '').trim();
            if (!name) continue;

            const beltName = String(cols[4] || '').trim();
            let belt = data.belts.find(b => b.name.toLowerCase() === beltName?.toLowerCase());
            if (!belt) {
                const beltIdx = parseInt(beltName) - 1;
                if (!isNaN(beltIdx) && data.belts[beltIdx]) belt = data.belts[beltIdx];
            }

            newStudents.push({
                id: `student-${Date.now()}-${i}`,
                name,
                age: parseInt(String(cols[1])) || undefined,
                birthday: String(cols[2] || ''),
                gender: (['Male', 'Female', 'Other', 'Prefer not to say'].includes(String(cols[3])) ? String(cols[3]) : 'Male') as 'Male' | 'Female' | 'Other' | 'Prefer not to say',
                beltId: belt?.id || data.belts[0]?.id || 'white',
                stripes: parseInt(String(cols[5])) || 0,
                parentName: String(cols[6] || ''),
                parentEmail: String(cols[7] || ''),
                parentPhone: String(cols[8] || ''),
                location: bulkLocation,
                assignedClass: bulkClass || 'General Class',
                joinDate: new Date().toISOString().split('T')[0],
                totalPoints: 0,
                totalXP: 0,
                attendanceCount: 0,
                lastPromotionDate: new Date().toISOString(),
                isReadyForGrading: false,
                performanceHistory: [],
                feedbackHistory: [],
                photo: null,
                medicalInfo: '',
                badges: [],
                sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
                lifeSkillsHistory: [],
                customHabits: [
                    { id: 'h1', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
                    { id: 'h2', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
                    { id: 'h3', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
                ]
            });
        }

        setParsedBulkStudents(newStudents);
        setBulkError(newStudents.length === 0 ? 'No valid student data found. Check column order.' : '');
    };

    const parseBulkStudents = (csv: string) => {
        const lines = csv.split('\n').filter(l => l.trim());
        const newStudents: Student[] = [];
        let hasError = false;

        lines.forEach((line, i) => {
            const cols = line.split(/[,\t]/).map(c => c.trim());
            const name = cols[0];
            const beltName = cols[4];
            
            if (!name) return;

            let belt = data.belts.find(b => b.name.toLowerCase() === beltName?.toLowerCase());
            if (!belt) {
                const beltIdx = parseInt(beltName) - 1;
                if (!isNaN(beltIdx) && data.belts[beltIdx]) belt = data.belts[beltIdx];
            }

            newStudents.push({
                id: `student-${Date.now()}-${i}`,
                name: cols[0],
                age: parseInt(cols[1]) || undefined,
                birthday: cols[2] || '',
                gender: (['Male', 'Female', 'Other', 'Prefer not to say'].includes(cols[3]) ? cols[3] : 'Male') as 'Male' | 'Female' | 'Other' | 'Prefer not to say',
                beltId: belt?.id || 'INVALID_BELT',
                stripes: parseInt(cols[5]) || 0,
                parentName: cols[6] || '',
                parentEmail: cols[7] || '',
                parentPhone: cols[8] || '',
                location: bulkLocation,
                assignedClass: bulkClass || 'General Class',
                joinDate: new Date().toISOString().split('T')[0],
                totalPoints: 0,
                totalXP: 0,
                attendanceCount: 0,
                lastPromotionDate: new Date().toISOString(),
                isReadyForGrading: false,
                performanceHistory: [],
                feedbackHistory: [],
                photo: null,
                medicalInfo: '',
                badges: [],
                sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
                lifeSkillsHistory: [],
                customHabits: [
                    { id: 'h1', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
                    { id: 'h2', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
                    { id: 'h3', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
                ]
            });
        });

        setParsedBulkStudents(newStudents);
        setBulkError(newStudents.length === 0 ? 'No valid data found' : '');
    };

    const handleCSVImport = async (importedStudents: ImportedStudent[]) => {
        const totalStudents = data.students.length;
        const { inTrial, trialExpired, subscribedTier } = getSubState();

        if (trialExpired) {
            const neededTier = PRICING_TIERS.find(t => (totalStudents + importedStudents.length) <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
            setPlanLimitModal({ type: 'trial-expired', currentCount: totalStudents, neededTier });
            return;
        }

        if (!inTrial && subscribedTier && subscribedTier.limit !== Infinity) {
            const afterCount = totalStudents + importedStudents.length;
            if (afterCount > subscribedTier.limit) {
                const upgradeTier = PRICING_TIERS.find(t => t.limit >= afterCount) || PRICING_TIERS[PRICING_TIERS.length - 1];
                setPlanLimitModal({ type: 'hard-limit', currentCount: totalStudents, currentPlan: subscribedTier.name, neededTier: subscribedTier, upgradeTier });
                return;
            }
        }

        setIsImporting(true);
        const studentsWithDbIds: Student[] = [];

        for (const imported of importedStudents) {
            const newStudent: Student = {
                id: crypto.randomUUID(),
                name: imported.name,
                beltId: imported.beltId,
                stripes: 0,
                parentEmail: imported.parentEmail,
                parentName: imported.parentName,
                parentPhone: imported.parentPhone,
                birthday: imported.birthday || '',
                joinDate: new Date().toISOString(),
                location: bulkLocation,
                assignedClass: bulkClass || data.classes?.[0] || 'General Class',
                totalPoints: imported.totalPoints,
                totalXP: imported.totalXP,
                lifetimeXp: imported.totalXP + imported.globalXP,
                attendanceCount: 0,
                performanceHistory: [],
                gender: 'Prefer not to say',
                lastPromotionDate: new Date().toISOString(),
                isReadyForGrading: false,
                feedbackHistory: [],
                badges: [],
                lifeSkillsHistory: [],
                customHabits: []
            };
            if (clubId) {
                try {
                    const beltName = data.belts.find(b => b.id === newStudent.beltId)?.name || 'White';
                    const response = await fetch('/api/students', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clubId: clubId,
                            name: newStudent.name,
                            belt: beltName,
                            parentEmail: newStudent.parentEmail,
                            parentName: newStudent.parentName,
                            parentPhone: newStudent.parentPhone,
                            birthdate: newStudent.birthday || null,
                            location: newStudent.location,
                            assignedClass: newStudent.assignedClass,
                            totalPoints: newStudent.totalPoints,
                            totalXP: newStudent.totalXP,
                            lifetimeXp: newStudent.lifetimeXp
                        })
                    });
                    const result = await response.json();
                    if (response.ok && result.student?.id) {
                        studentsWithDbIds.push({ ...newStudent, id: result.student.id });
                    } else {
                        studentsWithDbIds.push(newStudent);
                    }
                } catch (err) {
                    console.error('Failed to save student to database:', newStudent.name, err);
                    studentsWithDbIds.push(newStudent);
                }
            } else {
                studentsWithDbIds.push(newStudent);
            }
        }

        onUpdateData({ students: [...data.students, ...studentsWithDbIds] });
        setIsImporting(false);
        setShowCSVImport(false);
        setModalType(null);
        alert(`Successfully imported ${studentsWithDbIds.length} students with their points and XP!`);
    };

    const confirmBulkImport = async () => {
        const validStudents = parsedBulkStudents.filter(s => s.beltId !== 'INVALID_BELT');
        const totalStudents = data.students.length;
        const { inTrial, trialExpired, subscribedTier, trialDaysLeft } = getSubState();

        if (trialExpired) {
            const neededTier = PRICING_TIERS.find(t => (totalStudents + validStudents.length) <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
            setPlanLimitModal({ type: 'trial-expired', currentCount: totalStudents, neededTier });
            return;
        }

        if (!inTrial && subscribedTier && subscribedTier.limit !== Infinity) {
            const afterCount = totalStudents + validStudents.length;
            if (afterCount > subscribedTier.limit) {
                const upgradeTier = PRICING_TIERS.find(t => t.limit >= afterCount) || PRICING_TIERS[PRICING_TIERS.length - 1];
                setPlanLimitModal({ type: 'hard-limit', currentCount: totalStudents, currentPlan: subscribedTier.name, neededTier: subscribedTier, upgradeTier });
                return;
            }
        }

        setIsImporting(true);
        setImportStatus(null);
        
        const studentsWithDbIds: Student[] = [];
        
        let emailSentCount = 0;
        let emailSkippedCount = 0;
        let noEmailCount = 0;
        let emailFailedCount = 0;
        let saveFailedCount = 0;
        
        for (const student of validStudents) {
            if (clubId) {
                try {
                    const belt = data.belts.find(b => b.id === student.beltId);
                    const hasEmail = student.parentEmail && student.parentEmail.trim() !== '';
                    
                    const response = await fetch('/api/students', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clubId,
                            name: student.name,
                            parentEmail: hasEmail ? student.parentEmail.trim() : null,
                            parentName: student.parentName,
                            parentPhone: student.parentPhone,
                            belt: belt?.name || 'White',
                            birthdate: student.birthday,
                            location: student.location || bulkLocation || data.branchNames?.[0] || null,
                            assignedClass: student.assignedClass || bulkClass || null
                        })
                    });
                    const result = await response.json();
                    if (response.ok && result.student?.id) {
                        studentsWithDbIds.push({ ...student, id: result.student.id });

                        // Create enrollment records for matching class sessions
                        const assignedCls = student.assignedClass || bulkClass;
                        const assignedLoc = student.location || bulkLocation;
                        if (assignedCls) {
                            const matchingSessions = modalDbClasses.filter(s =>
                                s.class_name === assignedCls &&
                                (!assignedLoc || s.location === assignedLoc)
                            );
                            for (const session of matchingSessions) {
                                fetch(`/api/class-sessions/${session.id}/enroll`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ studentId: result.student.id, clubId })
                                }).catch(err => console.error('[Bulk Enroll] Failed for session', session.id, err));
                            }
                        }
                        
                        if (result.welcomeEmail?.success) {
                            if (result.welcomeEmail.skipped) {
                                emailSkippedCount++;
                                console.log(`[Bulk Import] Email skipped for ${student.parentEmail}: ${result.welcomeEmail.reason || 'already sent'}`);
                            } else {
                                emailSentCount++;
                            }
                        } else if (hasEmail) {
                            emailFailedCount++;
                            console.error(`[Bulk Import] Email failed for ${student.parentEmail}:`, result.welcomeEmail?.error || 'unknown error');
                        } else {
                            noEmailCount++;
                        }
                    } else {
                        studentsWithDbIds.push(student);
                        saveFailedCount++;
                        console.error('[Bulk Import] Failed to save:', student.name, result.error);
                    }
                } catch (error) {
                    studentsWithDbIds.push(student);
                    saveFailedCount++;
                    console.error('[Bulk Import] API error:', student.name, error);
                }
            } else {
                studentsWithDbIds.push(student);
            }
        }
        
        setIsImporting(false);
        
        const statusParts = [];
        statusParts.push(`${validStudents.length - saveFailedCount} students added`);
        if (emailSentCount > 0) statusParts.push(`${emailSentCount} welcome emails sent`);
        if (emailSkippedCount > 0) statusParts.push(`${emailSkippedCount} emails skipped (already sent)`);
        if (noEmailCount > 0) statusParts.push(`${noEmailCount} without email`);
        if (emailFailedCount > 0) statusParts.push(`${emailFailedCount} email failures`);
        if (saveFailedCount > 0) statusParts.push(`${saveFailedCount} save failures`);
        
        const hasIssues = emailFailedCount > 0 || saveFailedCount > 0;
        const hasWarnings = noEmailCount > 0 || emailSkippedCount > 0;

        // Trial plan tip: inform which plan they'll need when trial ends
        const newTotal = data.students.length + (validStudents.length - saveFailedCount);
        if (inTrial && !hasIssues) {
            const planNeeded = PRICING_TIERS.find(t => newTotal <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
            if (planNeeded.limit !== Infinity) {
                statusParts.push(`📋 You'll need the ${planNeeded.name} plan ($${planNeeded.price}/mo) when your trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}`);
            }
        }
        
        setImportStatus({
            type: hasIssues ? 'error' : hasWarnings ? 'warning' : 'success',
            message: statusParts.join(', ')
        });
        
        onUpdateData({ students: [...data.students, ...studentsWithDbIds] });
        setParsedBulkStudents([]);
        setBulkStudentData('');
        setUploadedFileName('');
        
        setTimeout(() => {
            setImportStatus(null);
            setModalType(null);
        }, 4000);
    };

    const handleAddStudent = async () => {
        const totalStudents = data.students.length;
        const { inTrial, trialExpired, subscribedTier } = getSubState();

        if (trialExpired) {
            const neededTier = PRICING_TIERS.find(t => totalStudents < t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
            setPlanLimitModal({ type: 'trial-expired', currentCount: totalStudents, neededTier });
            return;
        }

        if (!inTrial && subscribedTier && totalStudents >= subscribedTier.limit && subscribedTier.limit !== Infinity) {
            const upgradeTier = PRICING_TIERS.find(t => t.limit > subscribedTier.limit);
            setPlanLimitModal({ type: 'hard-limit', currentCount: totalStudents, currentPlan: subscribedTier.name, neededTier: subscribedTier, upgradeTier });
            return;
        }

        if(!tempStudent.name || !tempStudent.beltId) return;
        
        const belt = data.belts.find(b => b.id === tempStudent.beltId);
        const pointsPerStripe = data.pointsPerBelt[belt?.id || ''] || data.pointsPerStripe || 64;
        const initialPoints = (tempStudent.stripes || 0) * pointsPerStripe;

        console.log('[AdminDashboard] handleAddStudent called with clubId:', clubId, 'parentEmail:', tempStudent.parentEmail);
        
        // Variable to store database-generated student ID
        let databaseStudentId: string | null = null;
        
        // Always try to save to database if we have clubId (not just when parentEmail exists)
        if (clubId) {
            try {
                console.log('[AdminDashboard] Sending students API request...');
                const response = await fetch('/api/students', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clubId,
                        name: tempStudent.name,
                        parentEmail: tempStudent.parentEmail || null,
                        parentName: tempStudent.parentName,
                        parentPhone: tempStudent.parentPhone,
                        parentPassword: tempStudent.parentPassword,
                        belt: belt?.name || 'White',
                        birthdate: tempStudent.birthday,
                        gender: tempStudent.gender,
                        joinDate: tempStudent.joinDate || new Date().toISOString().split('T')[0],
                        medicalInfo: tempStudent.medicalInfo,
                        stripes: tempStudent.stripes || 0,
                        totalPoints: tempStudent.totalPoints || 0,
                        totalXP: tempStudent.totalXP || 0,
                        location: tempStudent.location || data.branchNames?.[0] || 'Main Location',
                        assignedClass: tempStudent.assignedClass || 'General'
                    })
                });
                const result = await response.json();
                if (response.ok && result.student?.id) {
                    // CRITICAL: Use the database-generated UUID
                    databaseStudentId = result.student.id;
                    console.log('[AdminDashboard] Student added successfully with database ID:', databaseStudentId);

                    // Create enrollment record for each matching class session
                    if (tempStudent.assignedClass) {
                        const loc = tempStudent.location || data.branchNames?.[0] || '';
                        const matchingSessions = modalDbClasses.filter(s =>
                            s.class_name === tempStudent.assignedClass &&
                            (!loc || s.location === loc)
                        );
                        for (const session of matchingSessions) {
                            fetch(`/api/class-sessions/${session.id}/enroll`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ studentId: databaseStudentId, clubId })
                            }).catch(err => console.error('[Enroll] Failed for session', session.id, err));
                        }
                    }

                    if (tempStudent.parentEmail) {
                        alert(`Welcome email sent to parent at ${tempStudent.parentEmail}!`);
                    }
                } else {
                    console.error('[AdminDashboard] Student API error:', result);
                    if (tempStudent.parentEmail) {
                        alert(`Failed to send welcome email: ${result.error || 'Unknown error'}. Student added locally.`);
                    }
                }
            } catch (error) {
                console.error('[AdminDashboard] API call failed, continuing with local update:', error);
                if (tempStudent.parentEmail) {
                    alert('Failed to send welcome email. Student added locally.');
                }
            }
        } else {
            console.warn('[AdminDashboard] No clubId available - skipping API call');
            if (tempStudent.parentEmail) {
                alert('Unable to send welcome email. Please log out and log back in to enable email notifications.');
            }
        }

        const newStudent: Student = {
            // Use database ID if available, otherwise fall back to local ID
            id: databaseStudentId || `student-${Date.now()}`,
            name: tempStudent.name,
            beltId: tempStudent.beltId,
            stripes: tempStudent.stripes || 0,
            location: tempStudent.location || data.branchNames?.[0] || 'Main Location',
            assignedClass: tempStudent.assignedClass || 'General',
            joinDate: new Date().toISOString(),
            totalPoints: initialPoints,
            attendanceCount: 0,
            parentName: tempStudent.parentName,
            parentEmail: tempStudent.parentEmail || '',
            parentPhone: tempStudent.parentPhone,
            gender: tempStudent.gender || 'Male',
            isReadyForGrading: false,
            lastPromotionDate: new Date().toISOString(),
            performanceHistory: [],
            feedbackHistory: [],
            birthday: '',
            badges: [],
            sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
            lifeSkillsHistory: [],
            customHabits: [
                { id: 'h1', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
                { id: 'h2', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
                { id: 'h3', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
            ]
        };
        
        const newStudents = [...data.students, newStudent];
        onUpdateData({ students: newStudents });
        
        // Sync Universal Access quantity if enabled
        if (data.clubSponsoredPremium && clubId) {
            fetch(`/api/club/${clubId}/universal-access/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentCount: newStudents.length || 1 })
            }).catch(e => console.log('[UniversalAccess] Sync after add:', e.message));
        }
        
        setModalType(null);
        setTempStudent({});
    };

    const handleAddCoach = async () => {
        if(!tempCoach.name || !tempCoach.email) return;
        
        console.log('[AdminDashboard] handleAddCoach called with clubId:', clubId);
        
        if (clubId) {
            try {
                console.log('[AdminDashboard] Sending invite-coach API request...');
                const response = await fetch('/api/invite-coach', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clubId,
                        name: tempCoach.name,
                        email: tempCoach.email,
                        password: tempCoach.password,
                        location: tempCoach.location || data.branchNames?.[0] || 'Main Location',
                        assignedClasses: []
                    })
                });
                const result = await response.json();
                if (response.ok) {
                    console.log('[AdminDashboard] Coach invited successfully:', result);
                    alert(`Invitation email sent to ${tempCoach.email}!`);
                } else {
                    console.error('[AdminDashboard] Coach invite API error:', result);
                    alert(`Failed to send invitation: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('[AdminDashboard] Coach invite API failed:', error);
                alert('Failed to send invitation email. Coach added locally.');
            }
        } else {
            console.warn('[AdminDashboard] No clubId available - skipping API call');
            alert('Unable to send invitation email. Please log out and log back in to enable email notifications.');
        }

        const newCoach: Coach = {
            id: `coach-${Date.now()}`,
            name: tempCoach.name,
            email: tempCoach.email,
            password: tempCoach.password,
            location: tempCoach.location || data.branchNames?.[0] || 'Main Location',
            assignedClasses: []
        };
        onUpdateData({ coaches: [...data.coaches, newCoach] });
        setModalType(null);
        setTempCoach({});
    };

    const handleAddClass = async () => {
        if(!tempClass.className || !tempClass.day || !tempClass.time) return;
        const location = tempClass.location || data.branchNames?.[0] || 'Main Location';
        const newClass: ScheduleItem = {
            id: `sched-${Date.now()}`,
            day: tempClass.day,
            time: tempClass.time,
            className: tempClass.className,
            instructor: tempClass.instructor || data.ownerName,
            location,
            beltRequirement: (tempClass as any).beltRequirement || 'All'
        };
        
        // Save to DB if we have a clubId
        if (clubId) {
            try {
                await fetch(`/api/clubs/${clubId}/class-sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        className: tempClass.className, day: tempClass.day, time: tempClass.time,
                        instructor: tempClass.instructor || data.ownerName,
                        location, beltRequirement: (tempClass as any).beltRequirement || 'All',
                        capacity: (tempClass as any).capacity || 20
                    })
                });
                // Reload sessions from DB
                const res = await fetch(`/api/clubs/${clubId}/class-sessions`);
                if (res.ok) { /* will be refreshed by ScheduleTab on mount */ }
            } catch {}
        }
        
        // Also add to locationClasses for dropdown population
        const updatedLocationClasses = { ...(data.locationClasses || {}) };
        if (!updatedLocationClasses[location]) updatedLocationClasses[location] = [];
        if (!updatedLocationClasses[location].includes(tempClass.className)) {
            updatedLocationClasses[location] = [...updatedLocationClasses[location], tempClass.className];
        }
        
        // Also add to general classes list
        const updatedClasses = [...(data.classes || [])];
        if (!updatedClasses.includes(tempClass.className)) updatedClasses.push(tempClass.className);
        
        onUpdateData({ 
            schedule: [...(data.schedule || []), newClass],
            locationClasses: updatedLocationClasses,
            classes: updatedClasses
        });
        setModalType(null);
        setTempClass({});
        // Trigger a page refresh of sessions (ScheduleTab will reload)
        window.dispatchEvent(new CustomEvent('reloadClassSessions'));
    };

    const handleAddEvent = () => {
        if(!tempEvent.title || !tempEvent.date) return;
        const finalType = isCustomEventType
            ? (tempEvent.type || 'custom').trim() || 'custom'
            : tempEvent.type || 'social';
        const newEvent: CalendarEvent = {
            id: `evt-${Date.now()}`,
            title: tempEvent.title,
            date: tempEvent.date,
            time: tempEvent.time || '10:00',
            location: tempEvent.location || 'Dojang',
            type: finalType,
            description: tempEvent.description || '',
            xpReward: tempEvent.xpReward || 0,
            pointsReward: tempEvent.pointsReward || 0,
            beltFilter: tempEvent.beltFilter || 'all',
            locationFilter: tempEvent.locationFilter || 'all',
            classFilter: tempEvent.classFilter || 'all',
            pricingType: tempEvent.pricingType || 'free',
        };
        onUpdateData({ events: [...(data.events || []), newEvent] });
        setModalType(null);
        setTempEvent({});
        setIsCustomEventType(false);
    }

    const handleAddPrivate = () => {
        if(!tempPrivate.coachName || !tempPrivate.date || !tempPrivate.time) return;
        const newSlot = {
            id: `prv-${Date.now()}`,
            coachName: tempPrivate.coachName,
            date: tempPrivate.date,
            time: tempPrivate.time,
            price: tempPrivate.price || 50,
            isBooked: false
        };
        onUpdateData({ privateSlots: [...(data.privateSlots || []), newSlot] });
        setModalType(null);
        setTempPrivate({coachName: '', date: '', time: '', price: 50});
    }

    return (
        <div className="min-h-screen bg-gray-900 flex">
            {/* PLAN LIMIT MODAL */}
            {planLimitModal && (
                <PlanLimitModal
                    type={planLimitModal.type}
                    currentCount={planLimitModal.currentCount}
                    currentPlan={planLimitModal.currentPlan}
                    neededTier={planLimitModal.neededTier}
                    upgradeTier={planLimitModal.upgradeTier}
                    onClose={() => setPlanLimitModal(null)}
                    onGoBilling={() => { setPlanLimitModal(null); setActiveTab('billing'); setModalType(null); }}
                />
            )}
            {/* SIDEBAR */}
            <div className="w-64 bg-gray-800 border-r border-gray-700 hidden md:flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                        {data.logo && typeof data.logo === 'string' && data.logo.startsWith('data:') ? (
                            <img 
                                src={data.logo} 
                                alt="Club Logo" 
                                className="w-12 h-12 rounded-lg object-cover border border-gray-600"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center text-white font-bold text-lg">
                                {data.clubName?.charAt(0) || 'C'}
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight truncate max-w-[140px]">{data.clubName}</h2>
                            <p className="text-sky-400 text-xs">Admin Dashboard</p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-4 space-y-1">
                    <SidebarItem icon="📊" label={t('admin.sidebar.overview')} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    <SidebarItem icon="👥" label={t('admin.sidebar.students')} active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
                    <SidebarItem icon="🥋" label={t('admin.sidebar.staff')} active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} />
                    <SidebarItem icon="📅" label={t('admin.sidebar.schedule')} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
                    <SidebarItem icon="🎥" label={t('admin.sidebar.creatorHub')} active={activeTab === 'creator'} onClick={() => setActiveTab('creator')} />
                    <div className="pt-4 pb-2 px-4 text-xs font-bold text-gray-500 uppercase">Configuration</div>
                    <SidebarItem icon="⚙️" label={t('admin.sidebar.settings')} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                    <SidebarItem icon="💳" label={t('admin.sidebar.billing')} active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} />
                </div>
                <div className="p-4 border-t border-gray-700">
                    <button onClick={onBack} className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded text-sm font-bold">
                        Exit to Dashboard
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 overflow-auto">
                {/* Mobile Header */}
                <div className="md:hidden bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
                    <h1 className="font-bold text-white">Admin Panel</h1>
                    <button onClick={onBack} className="text-gray-400">Exit</button>
                </div>
                

                {data.hasDemoData && (
                    <div className="bg-amber-500/10 border-b border-amber-500/40 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="text-amber-400 text-lg">🎮</span>
                            <div>
                                <p className="text-amber-300 font-bold text-sm">{t('coach.status.demoMode')}</p>
                                <p className="text-amber-400/70 text-xs">{t('common.demoModeActive')}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleClearDemo}
                            disabled={clearingDemo}
                            className="shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            {clearingDemo ? '⏳ Clearing...' : '🗑️ Clear Demo & Start Fresh'}
                        </button>
                    </div>
                )}

                <div className="p-4 md:p-6 lg:p-12 max-w-7xl mx-auto">
                    {activeTab === 'overview' && <OverviewTab data={data} onNavigate={onNavigate} onOpenModal={setModalType} onNavigateTab={setActiveTab} />}
                    {activeTab === 'students' && <StudentsTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} onViewPortal={onViewStudentPortal} onEditStudent={(s) => { setEditingStudentId(s.id); setTempStudent(s); setModalType('editStudent'); }} clubId={clubId} />}
                    {activeTab === 'staff' && <StaffTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} onEditCoach={(c) => { setEditingCoachId(c.id); setTempCoach(c); setModalType('editCoach'); }} />}
                    {activeTab === 'schedule' && <ScheduleTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} clubId={clubId} />}
                    {activeTab === 'creator' && <CreatorHubTab data={data} onUpdateData={onUpdateData} clubId={clubId} onOpenModal={setModalType} />}
                    {activeTab === 'settings' && <SettingsTab data={data} onUpdateData={onUpdateData} clubId={clubId} />}
                    {activeTab === 'billing' && <BillingTab data={data} onUpdateData={onUpdateData} clubId={clubId} onShowPricing={onShowPricing} />}
                </div>
            </div>

            {/* MODALS */}
            {modalType === 'student' && (
                <Modal title={t('admin.students.addStudentModal.title')} onClose={() => setModalType(null)}>
                    <div className="flex bg-gray-700/50 rounded p-1 w-fit mb-4 flex-wrap gap-1">
                        <button onClick={() => setStudentImportMethod('single')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'single' ? 'bg-sky-500 text-white' : 'text-gray-400'}`}>{t('admin.students.addStudentModal.single')}</button>
                        <button onClick={() => setStudentImportMethod('transfer')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'transfer' ? 'bg-cyan-500 text-white' : 'text-gray-400'}`}>{t('admin.students.transferTab.lookupStudent')}</button>
                        <button onClick={() => setStudentImportMethod('bulk')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'bulk' ? 'bg-green-500 text-white' : 'text-gray-400'}`}>{t('admin.students.addStudentModal.bulk')}</button>
                        <button onClick={() => setStudentImportMethod('excel')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'excel' ? 'bg-green-500 text-white' : 'text-gray-400'}`}>{t('admin.students.addStudentModal.excel')}</button>
                    </div>

                    {studentImportMethod === 'transfer' ? (
                        <div className="space-y-4">
                            <div className="bg-cyan-900/30 border border-cyan-500/30 p-4 rounded-lg">
                                <h3 className="font-bold text-cyan-300 mb-2">Transfer Student by MyTaek ID</h3>
                                <p className="text-sm text-gray-300 mb-4">
                                    Enter a student's MyTaek ID to view their profile and request a transfer to your club.
                                </p>
                                <div className="flex gap-2 mb-4">
                                    <input 
                                        type="text" 
                                        placeholder="MTK-2026-XXXXXX"
                                        value={transferSearchId}
                                        onChange={e => setTransferSearchId(e.target.value.toUpperCase())}
                                        className="flex-1 bg-gray-700 rounded p-2 text-white font-mono"
                                    />
                                    <button 
                                        onClick={async () => {
                                            if (!transferSearchId || !transferSearchId.startsWith('MTK-')) {
                                                setTransferError('Please enter a valid MyTaek ID (format: MTK-YYYY-XXXXXX)');
                                                return;
                                            }
                                            setTransferLoading(true);
                                            setTransferError('');
                                            setTransferStudent(null);
                                            try {
                                                const response = await fetch(`/api/students/lookup/${transferSearchId}`);
                                                if (!response.ok) {
                                                    const err = await response.json();
                                                    throw new Error(err.error || 'Student not found');
                                                }
                                                const data = await response.json();
                                                setTransferStudent(data);
                                            } catch (err: any) {
                                                setTransferError(err.message);
                                            } finally {
                                                setTransferLoading(false);
                                            }
                                        }}
                                        disabled={transferLoading}
                                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded disabled:opacity-50"
                                    >
                                        {transferLoading ? '...' : 'Search'}
                                    </button>
                                </div>
                                {transferError && (
                                    <div className="bg-red-900/30 border border-red-500/30 p-3 rounded text-red-300 text-sm mb-4">
                                        {transferError}
                                    </div>
                                )}
                                {transferStudent && (
                                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h4 className="text-lg font-bold text-white">{transferStudent.name}</h4>
                                                <p className="text-sm text-cyan-400 font-mono">{transferStudent.mytaekId}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-gray-400">Current Belt</p>
                                                <p className="text-lg font-bold text-white">{transferStudent.currentBelt}</p>
                                            </div>
                                        </div>
                                        <div className="bg-gray-700/50 p-3 rounded mb-4">
                                            <p className="text-xs text-gray-400">Current Club</p>
                                            <p className="font-bold text-white">{transferStudent.currentClub?.name}</p>
                                            <p className="text-sm text-gray-400">{transferStudent.currentClub?.artType}</p>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3 text-center">
                                            🔒 Full details available after transfer approval
                                        </p>
                                        <button 
                                            onClick={async () => {
                                                if (!clubId) {
                                                    setTransferError('Club ID not available');
                                                    return;
                                                }
                                                setTransferLoading(true);
                                                try {
                                                    const response = await fetch('/api/transfers', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            mytaekId: transferStudent.mytaekId,
                                                            toClubId: clubId,
                                                            notes: `Transfer request from ${data.clubName || 'Club'}`
                                                        })
                                                    });
                                                    if (!response.ok) {
                                                        const err = await response.json();
                                                        throw new Error(err.error || 'Failed to request transfer');
                                                    }
                                                    alert(`Transfer request sent! The student's current club will review and approve the transfer.`);
                                                    setTransferStudent(null);
                                                    setTransferSearchId('');
                                                } catch (err: any) {
                                                    setTransferError(err.message);
                                                } finally {
                                                    setTransferLoading(false);
                                                }
                                            }}
                                            disabled={transferLoading || transferStudent.currentClub?.id === clubId}
                                            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg disabled:opacity-50"
                                        >
                                            {transferStudent.currentClub?.id === clubId 
                                                ? 'Already at your club' 
                                                : transferLoading 
                                                    ? 'Sending Request...' 
                                                    : `Request Transfer to ${data.clubName || 'Your Club'}`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : studentImportMethod === 'single' ? (
                        <div className="space-y-4">
                            <input type="text" placeholder={t('admin.students.addStudentModal.fullName')} className="w-full bg-gray-700 rounded p-2 text-white" value={tempStudent.name || ''} onChange={e => setTempStudent({...tempStudent, name: e.target.value})} />
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">{t('admin.students.addStudentModal.birthday')}</label>
                                    <input type="date" className="w-full bg-gray-700 rounded p-2 text-white" value={tempStudent.birthday || ''} onChange={e => setTempStudent({...tempStudent, birthday: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">{t('admin.students.addStudentModal.gender')}</label>
                                    <select className="w-full bg-gray-700 rounded p-2 text-white" value={tempStudent.gender || ''} onChange={e => setTempStudent({...tempStudent, gender: e.target.value as any})}>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                        <option value="Prefer not to say">Prefer not to say</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <select className="bg-gray-700 rounded p-2 text-white" value={tempStudent.beltId || ''} onChange={e => setTempStudent({...tempStudent, beltId: e.target.value})}>
                                    <option value="">{t('admin.students.addStudentModal.selectBelt')}</option>
                                    {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                <input type="number" placeholder={t('admin.students.addStudentModal.stripes')} className="bg-gray-700 rounded p-2 text-white" value={tempStudent.stripes ?? ''} onChange={e => setTempStudent({...tempStudent, stripes: parseInt(e.target.value) || 0})} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">{t('admin.students.addStudentModal.joinDate')}</label>
                                <input type="date" className="w-full bg-gray-700 rounded p-2 text-white" value={tempStudent.joinDate || new Date().toISOString().split('T')[0]} onChange={e => setTempStudent({...tempStudent, joinDate: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <select 
                                    className="bg-gray-700 rounded p-2 text-white" 
                                    value={tempStudent.location || data.branchNames?.[0] || ''}
                                    onChange={e => setTempStudent({...tempStudent, location: e.target.value, assignedClass: ''})}
                                >
                                    {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <select 
                                    className="bg-gray-700 rounded p-2 text-white" 
                                    value={tempStudent.assignedClass || ''}
                                    onChange={e => setTempStudent({...tempStudent, assignedClass: e.target.value})}
                                >
                                    <option value="">{t('admin.students.addStudentModal.selectClass')}</option>
                                    {(() => {
                                        const loc = tempStudent.location || data.branchNames?.[0] || '';
                                        const dbClassNames = Array.from(new Set(
                                            modalDbClasses.filter(s => !loc || s.location === loc).map(s => s.class_name)
                                        ));
                                        const fallbackClasses = data.locationClasses?.[loc] || data.classes || [];
                                        const classNames = dbClassNames.length > 0 ? dbClassNames : fallbackClasses;
                                        return classNames.map(c => <option key={c} value={c}>{c}</option>);
                                    })()}
                                </select>
                            </div>
                            <div className="border-t border-gray-600 pt-4">
                                <p className="text-xs text-gray-400 mb-2 uppercase font-bold">{t('admin.students.addStudentModal.parentGuardianInfo')}</p>
                                <input type="text" placeholder={t('admin.students.addStudentModal.parentName')} className="w-full bg-gray-700 rounded p-2 text-white mb-2" value={tempStudent.parentName || ''} onChange={e => setTempStudent({...tempStudent, parentName: e.target.value})} />
                                <input type="email" placeholder={t('admin.students.addStudentModal.parentEmail')} className="w-full bg-gray-700 rounded p-2 text-white mb-2" value={tempStudent.parentEmail || ''} onChange={e => setTempStudent({...tempStudent, parentEmail: e.target.value})} />
                                <input type="tel" placeholder={t('admin.students.addStudentModal.parentPhone')} className="w-full bg-gray-700 rounded p-2 text-white mb-2" value={tempStudent.parentPhone || ''} onChange={e => setTempStudent({...tempStudent, parentPhone: e.target.value})} />
                                <p className="text-xs text-gray-400">{t('admin.students.addStudentModal.defaultPassword')}</p>
                            </div>
                            <div className="border-t border-gray-600 pt-4">
                                <p className="text-xs text-gray-400 mb-2 uppercase font-bold">{t('admin.students.addStudentModal.medicalInfo')}</p>
                                <textarea placeholder={t('admin.students.addStudentModal.medicalPlaceholder')} className="w-full bg-gray-700 rounded p-2 text-white text-sm h-20" value={tempStudent.medicalInfo || ''} onChange={e => setTempStudent({...tempStudent, medicalInfo: e.target.value})} />
                            </div>
                            {data.clubSponsoredPremium && (
                                <p className="text-xs text-indigo-300 bg-indigo-900/20 p-2 rounded">
                                    {t('admin.students.addStudentModal.addsToBill')}
                                </p>
                            )}
                            {(() => {
                                const { inTrial, trialDaysLeft } = getSubState();
                                if (!inTrial) return null;
                                const afterCount = data.students.length + 1;
                                const planNeeded = PRICING_TIERS.find(t => afterCount <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
                                if (planNeeded.limit === Infinity) return null;
                                return (
                                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
                                        <span className="text-amber-400 mt-0.5 shrink-0">💡</span>
                                        <p className="text-xs text-amber-300 leading-relaxed">
                                            With {afterCount} student{afterCount !== 1 ? 's' : ''} you'll be on the <span className="font-bold">{planNeeded.name} plan (${planNeeded.price}/mo)</span> — subscription required after your trial ends in {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}.
                                        </p>
                                    </div>
                                );
                            })()}
                            <button onClick={handleAddStudent} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded">{t('admin.students.addStudentModal.addStudentButton')}</button>
                        </div>
                    ) : studentImportMethod === 'bulk' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.students.bulkImport.defaultLocation')}</label>
                                    <select value={bulkLocation} onChange={e => setBulkLocation(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.students.bulkImport.defaultClass')}</label>
                                    <select value={bulkClass} onChange={e => setBulkClass(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        <option value="">{t('admin.students.bulkImport.autoAssign')}</option>
                                        {(Array.from(new Set(modalDbClasses.filter(s => !bulkLocation || s.location === bulkLocation).map(s => s.class_name))).length > 0
                                            ? Array.from(new Set(modalDbClasses.filter(s => !bulkLocation || s.location === bulkLocation).map(s => s.class_name)))
                                            : (data.locationClasses?.[bulkLocation] || data.classes || [])
                                        ).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                <p className="text-xs text-gray-400"><span className="font-bold">{t('admin.students.bulkImport.format')}</span> {t('admin.students.bulkImport.formatDesc')}</p>
                                <button 
                                    onClick={() => {
                                        const csvContent = "Name,Age,Birthday,Gender,Belt,Stripes,Parent Name,Email,Phone\nJohn Smith,12,2014-03-15,Male,White,0,Jane Smith,jane@email.com,555-1234";
                                        const blob = new Blob([csvContent], { type: 'text/csv' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'student_import_template.csv';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
                                >
                                    {t('admin.students.bulkImport.downloadTemplateCSV')}
                                </button>
                            </div>
                            <textarea value={bulkStudentData} onChange={e => { setBulkStudentData(e.target.value); setParsedBulkStudents([]); }} placeholder={t('admin.students.bulkImport.pasteCSVData')} className="w-full h-24 bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm font-mono" />
                            <button onClick={() => parseBulkStudents(bulkStudentData)} disabled={!bulkStudentData.trim()} className="w-full bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-bold py-2 rounded">{t('admin.students.bulkImport.parseData')}</button>
                            {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}
                            {parsedBulkStudents.length > 0 && (
                                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2">
                                    <p className="text-xs text-gray-400 mb-2 font-bold">{t('admin.students.bulkImport.preview')} ({parsedBulkStudents.length}):</p>
                                    {parsedBulkStudents.map((s, i) => (
                                        <div key={i} className="text-xs text-gray-300 py-1 border-t border-gray-800 grid grid-cols-3 gap-1">
                                            <span className="truncate">{s.name}</span>
                                            <span className="text-gray-500 truncate">{data.belts.find(b => b.id === s.beltId)?.name || '?'}</span>
                                            <span className={`truncate text-right ${s.parentEmail ? 'text-green-400' : 'text-yellow-500'}`}>
                                                {s.parentEmail || t('admin.students.bulkImport.noEmail')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {importStatus && (
                                <div className={`p-3 rounded text-sm ${
                                    importStatus.type === 'success' ? 'bg-green-900/50 border border-green-600 text-green-300' :
                                    importStatus.type === 'warning' ? 'bg-yellow-900/50 border border-yellow-600 text-yellow-300' :
                                    'bg-red-900/50 border border-red-600 text-red-300'
                                }`}>
                                    {importStatus.type === 'success' ? '✓ ' : importStatus.type === 'warning' ? '⚠ ' : '✗ '}
                                    {importStatus.message}
                                </div>
                            )}
                            <button 
                                onClick={confirmBulkImport} 
                                disabled={parsedBulkStudents.length === 0 || isImporting} 
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded flex items-center justify-center gap-2"
                            >
                                {isImporting ? (
                                    <>
                                        <span className="animate-spin">⏳</span>
                                        Importing...
                                    </>
                                ) : (
                                    t('admin.students.bulkImport.importStudents', { count: parsedBulkStudents.length })
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.students.bulkImport.defaultLocation')}</label>
                                    <select value={bulkLocation} onChange={e => setBulkLocation(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">{t('admin.students.bulkImport.defaultClass')}</label>
                                    <select value={bulkClass} onChange={e => setBulkClass(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        <option value="">{t('admin.students.bulkImport.autoAssign')}</option>
                                        {(Array.from(new Set(modalDbClasses.filter(s => !bulkLocation || s.location === bulkLocation).map(s => s.class_name))).length > 0
                                            ? Array.from(new Set(modalDbClasses.filter(s => !bulkLocation || s.location === bulkLocation).map(s => s.class_name)))
                                            : (data.locationClasses?.[bulkLocation] || data.classes || [])
                                        ).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="bg-gray-900/50 p-4 rounded border border-dashed border-gray-600 text-center">
                                <input
                                    type="file"
                                    ref={excelFileInputRef}
                                    accept=".xlsx,.xls,.csv"
                                    onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])}
                                    className="hidden"
                                />
                                <div 
                                    onClick={() => excelFileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        if (e.dataTransfer.files?.[0]) handleExcelUpload(e.dataTransfer.files[0]);
                                    }}
                                    className={`cursor-pointer p-6 rounded transition-colors ${isDragging ? 'bg-sky-500/20 border-sky-500' : 'hover:bg-gray-800'}`}
                                >
                                    <div className="text-4xl mb-2">📊</div>
                                    <p className="text-white font-medium mb-1">
                                        {uploadedFileName || t('admin.students.bulkImport.clickOrDragFile')}
                                    </p>
                                    <p className="text-xs text-gray-500">{t('admin.students.bulkImport.supportsFormats')}</p>
                                </div>
                            </div>

                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                <p className="text-xs text-gray-400 font-bold mb-1">{t('admin.students.bulkImport.requiredColumnOrder')}</p>
                                <p className="text-xs text-gray-500">{t('admin.students.bulkImport.columnOrder')}</p>
                                <button 
                                    onClick={() => {
                                        const csvContent = "Name,Age,Birthday,Gender,Belt,Stripes,Parent Name,Email,Phone\nJohn Smith,12,2014-03-15,Male,White,0,Jane Smith,jane@email.com,555-1234";
                                        const blob = new Blob([csvContent], { type: 'text/csv' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'student_import_template.csv';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
                                >
                                    {t('admin.students.bulkImport.downloadTemplate')}
                                </button>
                            </div>

                            {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}
                            
                            {parsedBulkStudents.length > 0 && (
                                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2">
                                    <p className="text-xs text-gray-400 mb-2 font-bold">{t('admin.students.bulkImport.previewStudents', { count: parsedBulkStudents.length })}</p>
                                    {parsedBulkStudents.map((s, i) => (
                                        <div key={i} className="text-xs text-gray-300 py-1 border-t border-gray-800 grid grid-cols-3 gap-1">
                                            <span className="truncate">{s.name}</span>
                                            <span className="text-gray-500 truncate">{data.belts.find(b => b.id === s.beltId)?.name || 'White Belt'}</span>
                                            <span className={`truncate text-right ${s.parentEmail ? 'text-green-400' : 'text-yellow-500'}`}>
                                                {s.parentEmail || t('admin.students.bulkImport.noEmail')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {importStatus && (
                                <div className={`p-3 rounded text-sm ${
                                    importStatus.type === 'success' ? 'bg-green-900/50 border border-green-600 text-green-300' :
                                    importStatus.type === 'warning' ? 'bg-yellow-900/50 border border-yellow-600 text-yellow-300' :
                                    'bg-red-900/50 border border-red-600 text-red-300'
                                }`}>
                                    {importStatus.type === 'success' ? '✓ ' : importStatus.type === 'warning' ? '⚠ ' : '✗ '}
                                    {importStatus.message}
                                </div>
                            )}
                            
                            <button 
                                onClick={confirmBulkImport} 
                                disabled={parsedBulkStudents.length === 0 || isImporting} 
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded flex items-center justify-center gap-2"
                            >
                                {isImporting ? (
                                    <>
                                        <span className="animate-spin">⏳</span>
                                        Importing...
                                    </>
                                ) : (
                                    t('admin.students.bulkImport.importStudents', { count: parsedBulkStudents.length })
                                )}
                            </button>
                        </div>
                    )}
                </Modal>
            )}

            {modalType === 'editStudent' && editingStudentId && (
                <Modal title={t('admin.students.editStudentModal.title')} onClose={() => { setModalType(null); setEditingStudentId(null); setTempStudent({}); }}>
                    <div className="space-y-4">
                        {tempStudent.mytaekId && (
                            <div className="bg-cyan-900/30 border border-cyan-500/30 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <span className="text-xs text-cyan-400 uppercase tracking-wider font-bold">{t('admin.students.editStudentModal.myTaekId')}</span>
                                    <p className="text-lg font-mono text-white">{tempStudent.mytaekId}</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(tempStudent.mytaekId || '');
                                        alert(t('admin.students.editStudentModal.myTaekIdCopied'));
                                    }}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 rounded text-sm"
                                >
                                    Copy
                                </button>
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">Name</label>
                            <input 
                                type="text" 
                                value={tempStudent.name || ''} 
                                className="w-full bg-gray-700 rounded p-2 text-white" 
                                onChange={e => setTempStudent({...tempStudent, name: e.target.value})} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Belt</label>
                                <select 
                                    className="w-full bg-gray-700 rounded p-2 text-white" 
                                    value={tempStudent.beltId || ''}
                                    onChange={e => setTempStudent({...tempStudent, beltId: e.target.value})}
                                >
                                    <option value="">Select Belt</option>
                                    {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Stripes</label>
                                <input 
                                    type="number" 
                                    value={tempStudent.stripes ?? 0} 
                                    className="w-full bg-gray-700 rounded p-2 text-white" 
                                    onChange={e => setTempStudent({...tempStudent, stripes: parseInt(e.target.value) || 0})} 
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Location</label>
                                <select 
                                    className="w-full bg-gray-700 rounded p-2 text-white" 
                                    value={tempStudent.location || ''}
                                    onChange={e => setTempStudent({...tempStudent, location: e.target.value, assignedClass: ''})}
                                >
                                    <option value="">Select Location</option>
                                    {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Class</label>
                                <select 
                                    className="w-full bg-gray-700 rounded p-2 text-white" 
                                    value={tempStudent.assignedClass || ''}
                                    onChange={e => setTempStudent({...tempStudent, assignedClass: e.target.value})}
                                >
                                    <option value="">Select Class</option>
                                    {(() => {
                                        const loc = tempStudent.location || '';
                                        const dbClassNames = Array.from(new Set(
                                            modalDbClasses.filter(s => !loc || s.location === loc).map(s => s.class_name)
                                        ));
                                        const fallbackClasses = loc ? (data.locationClasses?.[loc] || []) : (data.classes || []);
                                        const classNames = dbClassNames.length > 0 ? dbClassNames : fallbackClasses;
                                        return classNames.map(c => <option key={c} value={c}>{c}</option>);
                                    })()}
                                </select>
                            </div>
                        </div>
                        <div className="border-t border-gray-600 pt-4">
                            <p className="text-xs text-gray-400 mb-2 uppercase font-bold">{t('admin.students.addStudentModal.parentGuardianInfo')}</p>
                            <input 
                                type="text" 
                                placeholder={t('admin.students.editStudentModal.parentName')} 
                                value={tempStudent.parentName || ''} 
                                className="w-full bg-gray-700 rounded p-2 text-white mb-2" 
                                onChange={e => setTempStudent({...tempStudent, parentName: e.target.value})} 
                            />
                            <input 
                                type="email" 
                                placeholder={t('admin.students.editStudentModal.parentEmail')} 
                                value={tempStudent.parentEmail || ''} 
                                className="w-full bg-gray-700 rounded p-2 text-white" 
                                onChange={e => setTempStudent({...tempStudent, parentEmail: e.target.value})} 
                            />
                        </div>
                        <button 
                            onClick={async () => {
                                if (!editingStudentId) return;
                                try {
                                    // Get belt name from beltId for API
                                    const beltName = tempStudent.beltId ? data.belts.find(b => b.id === tempStudent.beltId)?.name : undefined;
                                    
                                    const response = await fetch(`/api/students/${editingStudentId}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            name: tempStudent.name,
                                            belt: beltName,
                                            stripes: tempStudent.stripes,
                                            location: tempStudent.location,
                                            assignedClass: tempStudent.assignedClass,
                                            parentName: tempStudent.parentName,
                                            parentEmail: tempStudent.parentEmail
                                        })
                                    });
                                    
                                    if (!response.ok) {
                                        const error = await response.json();
                                        throw new Error(error.error || 'Failed to update student');
                                    }
                                    
                                    // Update local state on success
                                    const updatedStudents = data.students.map(s => 
                                        s.id === editingStudentId ? { ...s, ...tempStudent } : s
                                    );
                                    onUpdateData({ students: updatedStudents });
                                    setModalType(null);
                                    setEditingStudentId(null);
                                    setTempStudent({});
                                } catch (err: any) {
                                    console.error('Failed to update student:', err);
                                    alert(err.message || 'Failed to save changes');
                                }
                            }} 
                            className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded"
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </Modal>
            )}

            {modalType === 'coach' && (
                <Modal title={t('admin.staff.addCoachModal.title')} onClose={() => setModalType(null)}>
                    <div className="space-y-4">
                        <input type="text" placeholder={t('admin.staff.addCoachModal.coachName')} className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, name: e.target.value})} />
                        <input type="email" placeholder={t('admin.staff.addCoachModal.emailAddress')} className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, email: e.target.value})} />
                        <p className="text-xs text-gray-400">Default password: 1234 (coach will be prompted to change)</p>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1 font-bold">Main Location</label>
                            <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, location: e.target.value})}>
                                <option value="">Select Location</option>
                                {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1 font-bold">Assigned Classes</label>
                            <select multiple className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, assignedClasses: Array.from(e.target.selectedOptions, option => option.value)})}>
                                {((tempCoach.location ? data.locationClasses?.[tempCoach.location] : []) || data.classes || []).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple classes</p>
                        </div>
                        <button onClick={handleAddCoach} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded">Add Coach</button>
                    </div>
                </Modal>
            )}

            {modalType === 'editCoach' && editingCoachId && (
                <Modal title={t('admin.staff.editCoachModal.title')} onClose={() => { setModalType(null); setEditingCoachId(null); setTempCoach({}); }}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">Name</label>
                            <input 
                                type="text" 
                                value={tempCoach.name || ''} 
                                className="w-full bg-gray-700 rounded p-2 text-white" 
                                onChange={e => setTempCoach({...tempCoach, name: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">Email</label>
                            <input 
                                type="email" 
                                value={tempCoach.email || ''} 
                                className="w-full bg-gray-700 rounded p-2 text-white" 
                                onChange={e => setTempCoach({...tempCoach, email: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">Main Location</label>
                            <select 
                                className="w-full bg-gray-700 rounded p-2 text-white" 
                                value={tempCoach.location || ''}
                                onChange={e => setTempCoach({...tempCoach, location: e.target.value})}
                            >
                                <option value="">Select Location</option>
                                {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">Assigned Classes</label>
                            <select 
                                multiple 
                                className="w-full bg-gray-700 rounded p-2 text-white h-24" 
                                value={tempCoach.assignedClasses || []}
                                onChange={e => setTempCoach({...tempCoach, assignedClasses: Array.from(e.target.selectedOptions, option => option.value)})}
                            >
                                {((tempCoach.location ? data.locationClasses?.[tempCoach.location] : []) || data.classes || []).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple classes</p>
                        </div>
                        <button 
                            onClick={async () => {
                                if (!editingCoachId) return;
                                try {
                                    const response = await fetch(`/api/coaches/${editingCoachId}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            name: tempCoach.name,
                                            email: tempCoach.email,
                                            location: tempCoach.location,
                                            assignedClasses: tempCoach.assignedClasses
                                        })
                                    });
                                    
                                    if (!response.ok) {
                                        const error = await response.json();
                                        throw new Error(error.error || 'Failed to update coach');
                                    }
                                    
                                    const updatedCoaches = data.coaches.map(c => 
                                        c.id === editingCoachId ? { ...c, ...tempCoach } : c
                                    );
                                    onUpdateData({ coaches: updatedCoaches });
                                    setModalType(null);
                                    setEditingCoachId(null);
                                    setTempCoach({});
                                } catch (err: any) {
                                    console.error('Failed to update coach:', err);
                                    alert(err.message || 'Failed to save changes');
                                }
                            }} 
                            className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded"
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </Modal>
            )}

            {modalType === 'class' && (
                <Modal title={t('admin.schedule.addClassModal.title')} onClose={() => setModalType(null)}>
                    <div className="space-y-4">
                        <input type="text" placeholder={t('admin.schedule.addClassModal.className')} className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, className: e.target.value})} />
                        <div className="grid grid-cols-2 gap-4">
                            <select className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, day: e.target.value})}>
                                <option value="">Select Day</option>
                                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <input type="time" className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, time: e.target.value})} />
                        </div>
                        <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, instructor: e.target.value})}>
                            <option value="">Assign Instructor</option>
                            <option value={data.ownerName}>{data.ownerName} (Owner)</option>
                            {data.coaches.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, location: e.target.value})}>
                            {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, beltRequirement: e.target.value} as any)}>
                            <option value="All">All Belts</option>
                            {data.belts.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                        </select>
                        <div>
                            <label className="text-sm text-gray-400 block mb-1">Max Capacity (students)</label>
                            <input type="number" min="1" max="200" defaultValue={20} className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, capacity: parseInt(e.target.value) || 20} as any)} />
                        </div>
                        <button onClick={handleAddClass} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">Save to Schedule</button>
                    </div>
                </Modal>
            )}

            {modalType === 'event' && (
                <Modal title={t('admin.schedule.addEventModal.title')} onClose={() => { setModalType(null); setTempEvent({}); setIsCustomEventType(false); }}>
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-800/40 rounded-lg p-3">
                            <span className="text-purple-400 text-sm mt-0.5">📲</span>
                            <p className="text-xs text-purple-300 leading-relaxed">
                                Appears in <strong>parent portal → Training Ops</strong>. Parents RSVP and earn rewards when you approve attendance.
                            </p>
                        </div>

                        {/* Title */}
                        <input
                            type="text"
                            placeholder={t('admin.schedule.addEventModal.eventTitle')}
                            value={tempEvent.title || ''}
                            onChange={e => setTempEvent({...tempEvent, title: e.target.value})}
                            className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none"
                        />

                        {/* Date + Time */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Date *</label>
                                <input type="date" value={tempEvent.date || ''} onChange={e => setTempEvent({...tempEvent, date: e.target.value})} className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Time</label>
                                <input type="time" value={tempEvent.time || ''} onChange={e => setTempEvent({...tempEvent, time: e.target.value})} className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none" />
                            </div>
                        </div>

                        {/* Event Type */}
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Event Type</label>
                            <select
                                value={isCustomEventType ? '__custom__' : (tempEvent.type || 'social')}
                                onChange={e => {
                                    if (e.target.value === '__custom__') {
                                        setIsCustomEventType(true);
                                        setTempEvent({...tempEvent, type: ''});
                                    } else {
                                        setIsCustomEventType(false);
                                        setTempEvent({...tempEvent, type: e.target.value});
                                    }
                                }}
                                className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none"
                            >
                                <option value="social">🎉 Social Event</option>
                                <option value="test">🥋 Belt Test</option>
                                <option value="competition">🏆 Competition</option>
                                <option value="seminar">📚 Seminar</option>
                                <option value="__custom__">✏️ Custom…</option>
                            </select>
                            {isCustomEventType && (
                                <input
                                    type="text"
                                    placeholder="e.g. Fundraiser, Grading Camp, Demo Day…"
                                    value={tempEvent.type || ''}
                                    onChange={e => setTempEvent({...tempEvent, type: e.target.value})}
                                    className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none mt-2"
                                    autoFocus
                                />
                            )}
                        </div>

                        {/* Venue */}
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Venue / Address</label>
                            <input type="text" placeholder="e.g. Main Dojo, National Arena" value={tempEvent.location || ''} onChange={e => setTempEvent({...tempEvent, location: e.target.value})} className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none" />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Description <span className="text-gray-600">(optional)</span></label>
                            <textarea placeholder="Add details parents should know…" value={tempEvent.description || ''} onChange={e => setTempEvent({...tempEvent, description: e.target.value})} rows={2} className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none resize-none text-sm" />
                        </div>

                        {/* ── Filters ── */}
                        <div className="border-t border-gray-700 pt-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Audience Filters</p>
                            <div className="grid grid-cols-2 gap-3">
                                {/* Access */}
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Access</label>
                                    <select value={tempEvent.pricingType || 'free'} onChange={e => setTempEvent({...tempEvent, pricingType: e.target.value as 'free' | 'premium'})} className="w-full bg-gray-700 rounded-lg p-2 text-white border border-gray-600 focus:border-purple-500 outline-none text-sm">
                                        <option value="free">🌐 Free for All</option>
                                        <option value="premium">⭐ Premium Members Only</option>
                                    </select>
                                </div>
                                {/* Belt */}
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Belt Level</label>
                                    <select value={tempEvent.beltFilter || 'all'} onChange={e => setTempEvent({...tempEvent, beltFilter: e.target.value})} className="w-full bg-gray-700 rounded-lg p-2 text-white border border-gray-600 focus:border-purple-500 outline-none text-sm">
                                        <option value="all">All Belts</option>
                                        {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                {/* Location */}
                                {data.branchNames && data.branchNames.length > 0 && (
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Branch / Location</label>
                                        <select value={tempEvent.locationFilter || 'all'} onChange={e => setTempEvent({...tempEvent, locationFilter: e.target.value})} className="w-full bg-gray-700 rounded-lg p-2 text-white border border-gray-600 focus:border-purple-500 outline-none text-sm">
                                            <option value="all">All Locations</option>
                                            {data.branchNames.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                        </select>
                                    </div>
                                )}
                                {/* Class */}
                                {data.classes && data.classes.length > 0 && (
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Class</label>
                                        <select value={tempEvent.classFilter || 'all'} onChange={e => setTempEvent({...tempEvent, classFilter: e.target.value})} className="w-full bg-gray-700 rounded-lg p-2 text-white border border-gray-600 focus:border-purple-500 outline-none text-sm">
                                            <option value="all">All Classes</option>
                                            {(tempEvent.locationFilter && tempEvent.locationFilter !== 'all' && data.locationClasses?.[tempEvent.locationFilter]
                                                ? data.locationClasses[tempEvent.locationFilter]
                                                : data.classes
                                            ).map(cls => <option key={cls} value={cls}>{cls}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Rewards ── */}
                        <div className="border-t border-gray-700 pt-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Attendance Reward <span className="text-gray-600 font-normal normal-case">(awarded when you approve)</span></p>
                            <p className="text-xs text-gray-500 mb-3">Both are optional. Belt tests → Belt Points. Competitions → HonorXP™. You can set both.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">{t('admin.schedule.addEventModal.honorXpReward')} 🔥</label>
                                    <input type="number" min="0" placeholder="0" value={tempEvent.xpReward || ''} onChange={e => setTempEvent({...tempEvent, xpReward: parseInt(e.target.value) || 0})} className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">{t('admin.schedule.addEventModal.beltPointsReward')} 🥋</label>
                                    <input type="number" min="0" placeholder="0" value={tempEvent.pointsReward || ''} onChange={e => setTempEvent({...tempEvent, pointsReward: parseInt(e.target.value) || 0})} className="w-full bg-gray-700 rounded-lg p-2.5 text-white border border-gray-600 focus:border-purple-500 outline-none" />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleAddEvent}
                            disabled={!tempEvent.title || !tempEvent.date}
                            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg transition-colors"
                        >
                            Save Event
                        </button>
                    </div>
                </Modal>
            )}

            {modalType === 'private' && (
                <Modal title={t('admin.schedule.addPrivateSlotModal.title')} onClose={() => setModalType(null)}>
                    <div className="space-y-4">
                        <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempPrivate({...tempPrivate, coachName: e.target.value})}>
                            <option value="">Select Coach</option>
                            <option value={data.ownerName}>{data.ownerName} (Owner)</option>
                            {data.coaches.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-4">
                            <input type="date" className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempPrivate({...tempPrivate, date: e.target.value})} />
                            <input type="time" className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempPrivate({...tempPrivate, time: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Price ($)</label>
                            <input type="number" min="0" value={tempPrivate.price} className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempPrivate({...tempPrivate, price: parseInt(e.target.value) || 0})} />
                        </div>
                        <button onClick={handleAddPrivate} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded">Add Private Slot</button>
                    </div>
                </Modal>
            )}

            {/* CSV Import Modal for Google Sheets */}
            {showCSVImport && (
                <CSVImport
                    onImport={handleCSVImport}
                    onClose={() => setShowCSVImport(false)}
                    existingBelts={data.belts}
                />
            )}
        </div>
    );
};
