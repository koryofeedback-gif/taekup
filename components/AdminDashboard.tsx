
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { WizardData, Student, Coach, Belt, CalendarEvent, ScheduleItem, CurriculumItem } from '../types';
import { generateParentingAdvice } from '../services/geminiService';
import { WT_BELTS, ITF_BELTS, KARATE_BELTS, BJJ_BELTS, JUDO_BELTS, HAPKIDO_BELTS, TANGSOODO_BELTS, AIKIDO_BELTS, KRAVMAGA_BELTS, KUNGFU_BELTS } from '../constants';

interface AdminDashboardProps {
  data: WizardData;
  clubId?: string;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
  onNavigate: (view: 'coach-dashboard' | 'admin-dashboard' | 'parent-portal' | 'dojang-tv') => void;
  onViewStudentPortal?: (studentId: string) => void;
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-gray-800 rounded-lg border border-gray-700 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
                <h3 className="text-white font-bold text-lg">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
            </div>
            <div className="p-6">
                {children}
            </div>
        </div>
    </div>
);

// --- SUB-SECTIONS ---

const OverviewTab: React.FC<{ data: WizardData, onNavigate: (view: any) => void, onOpenModal: (type: string) => void }> = ({ data, onNavigate, onOpenModal }) => {
    const totalStudents = data.students.length;
    
    // Revenue Simulator State - Premium is $4.99, club owner gets 70%, TaekUp gets 30%
    const PREMIUM_PRICE = 4.99;
    const CLUB_SHARE = 0.70;
    const TAEKUP_FEE = parseFloat((PREMIUM_PRICE * 0.30).toFixed(2)); // $1.50
    const CLUB_COMMISSION = parseFloat((PREMIUM_PRICE * CLUB_SHARE).toFixed(2)); // $3.49
    
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
        const taekupCut = subscribers * TAEKUP_FEE; // TaekUp's 30% share
        const clubRevenue = subscribers * CLUB_COMMISSION; // Club's 70% share
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
                <StatCard label="Total Students" value={totalStudents} subtext={selectedTier ? `${selectedTier.limit === Infinity ? 'Unlimited' : selectedTier.limit - totalStudents + ' spots left'} in ${selectedTier.name}` : `Recommended: ${recommendedTier.name}`} icon="🥋" color="blue" />
                <StatCard label="Monthly Revenue" value={`$${(totalStudents * 120).toLocaleString()}`} subtext="Est. based on tuition" icon="💰" color="green" />
                <StatCard label="Active Staff" value={data.coaches.length + 1} subtext="1 Owner" icon="👥" color="purple" />
                <StatCard label="Locations" value={data.branches} subtext="Unlimited Plan" icon="🌍" color="orange" />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={() => onOpenModal('student')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all hover:-translate-y-1">
                    <span className="text-2xl mb-2">👤</span>
                    <span className="font-bold text-white text-sm">+ Add Student</span>
                </button>
                <button onClick={() => onOpenModal('coach')} className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg border border-gray-600 flex flex-col items-center justify-center transition-all hover:-translate-y-1">
                    <span className="text-2xl mb-2">🥋</span>
                    <span className="font-bold text-white text-sm">+ Add Coach</span>
                </button>
                <button onClick={() => onNavigate('coach-dashboard')} className="bg-blue-900/30 hover:bg-blue-900/50 p-4 rounded-lg border border-sky-500/30 flex flex-col items-center justify-center transition-all hover:-translate-y-1">
                    <span className="text-2xl mb-2">📋</span>
                    <span className="font-bold text-blue-200 text-sm">Coach Dashboard</span>
                </button>
                <button onClick={() => onNavigate('dojang-tv')} className="bg-purple-900/30 hover:bg-purple-900/50 p-4 rounded-lg border border-purple-500/30 flex flex-col items-center justify-center transition-all hover:-translate-y-1 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-purple-500/10 animate-pulse"></div>
                    <span className="text-2xl mb-2 relative z-10">📺</span>
                    <span className="font-bold text-purple-200 text-sm relative z-10">Launch Lobby TV</span>
                </button>
            </div>

            {/* Revenue Simulator */}
            {!data.clubSponsoredPremium && (
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center"><span className="mr-2">🏦</span> {data.isDemo ? 'SenseiVault™ Estimator' : 'SenseiVault™ Live Projection'}</h3>
                            <p className="text-gray-400 text-sm">{data.isDemo ? 'See how DojoMint™ protocol turns student engagement into net profit.' : 'Monitor your active DojoMint™ revenue against your platform fees.'}</p>
                        </div>
                        <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-700">
                            <span className="text-xs text-gray-500 uppercase block">Your Plan</span>
                            <select 
                                value={selectedPlanIndex} 
                                onChange={(e) => setSelectedPlanIndex(parseInt(e.target.value))}
                                className="bg-transparent text-white font-bold cursor-pointer focus:outline-none"
                            >
                                {PRICING_TIERS.map((tier, idx) => (
                                    <option key={tier.name} value={idx} className="bg-gray-800">
                                        {tier.name} - ${tier.price}/mo
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-10">
                        <div>
                            <label className="block text-sm text-gray-300 mb-4">
                                If <span className="text-sky-300 font-bold text-lg">{adoptionRate}%</span> of your <span className="text-white font-semibold">{simulatedStudents}</span> {data.isDemo ? 'Active Warriors unlock their SenseiVault™ Access...' : 'students become Active Legacy Activations...'}
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
                                    🎉 100% COVERED
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
                                    <span className="text-gray-400">{data.isDemo ? 'Your DojoMint™ Income:' : 'Your DojoMint™ Revenue:'}</span>
                                    <span className="text-green-400 font-semibold">+${revenue.clubRevenue.toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="border-t border-gray-700 pt-4">
                                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Net Monthly Profit</p>
                                <p className={`text-4xl font-extrabold ${revenue.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {revenue.profit >= 0 ? '+' : '-'}${Math.abs(revenue.profit).toFixed(2)} {revenue.profit > 0 && '🚀'}
                                </p>
                                {data.isDemo && (
                                    <p className="text-xs text-gray-500 mt-2">
                                        (Paid via Performance Royalty)
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const StudentsTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void, onViewPortal?: (id: string) => void, onEditStudent?: (student: Student) => void }> = ({ data, onUpdateData, onOpenModal, onViewPortal, onEditStudent }) => {
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('All Locations');
    const [classFilter, setClassFilter] = useState('All Classes');
    const [beltFilter, setBeltFilter] = useState('All Belts');
    
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
        if(confirm('Are you sure? This cannot be undone.')) {
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
                onUpdateData({ students: data.students.filter(s => s.id !== id) });
            } catch (err: any) {
                console.error('Failed to delete student:', err);
                alert(err.message || 'Failed to delete student');
            }
        }
    }

    return (
        <div>
            <SectionHeader 
                title="Student Roster" 
                description="Manage your students, belts, and assignments." 
                action={
                    <button onClick={() => onOpenModal('student')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded shadow-lg">
                        + Add Student
                    </button>
                }
            />
            <div className="flex flex-wrap gap-4 mb-4">
                <input 
                    type="text" 
                    placeholder="Search students..." 
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
                    <option>All Locations</option>
                    {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select 
                    value={classFilter} 
                    onChange={e => setClassFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500"
                    disabled={locationFilter === 'All Locations' && (!data.classes || data.classes.length === 0)}
                >
                    <option>All Classes</option>
                    {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select 
                    value={beltFilter} 
                    onChange={e => setBeltFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500"
                >
                    <option>All Belts</option>
                    {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">Belt</th>
                            <th className="px-6 py-3">Location / Class</th>
                            <th className="px-6 py-3">Joined</th>
                            <th className="px-6 py-3 text-right">Actions</th>
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
                                        <button onClick={() => onEditStudent(s)} className="text-yellow-400 hover:text-yellow-300 font-bold text-xs" title="Edit Student">
                                            Edit
                                        </button>
                                    )}
                                    {onViewPortal && (
                                        <button onClick={() => onViewPortal(s.id)} className="text-sky-300 hover:text-blue-300 font-bold text-xs" title="View as Parent">
                                            👁️ Portal
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300 font-bold text-xs">Delete</button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No students found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

const StaffTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void, onEditCoach?: (coach: any) => void }> = ({ data, onUpdateData, onOpenModal, onEditCoach }) => {
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if(!confirm('Remove this coach? They will lose access immediately.')) return;
        
        setDeleting(id);
        try {
            const response = await fetch(`/api/coaches/${id}`, { method: 'DELETE' });
            if (response.ok) {
                onUpdateData({ coaches: data.coaches.filter(c => c.id !== id) });
            } else {
                alert('Failed to remove coach');
            }
        } catch (error) {
            console.error('Delete coach error:', error);
            alert('Failed to remove coach');
        } finally {
            setDeleting(null);
        }
    }

    return (
        <div>
            <SectionHeader 
                title="Staff Management" 
                description="Manage coaches, permissions, and assignments." 
                action={
                    <button onClick={() => onOpenModal('coach')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded shadow-lg">
                        + Add Coach
                    </button>
                }
            />
            
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">Email</th>
                            <th className="px-6 py-3">Location</th>
                            <th className="px-6 py-3">Classes</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        <tr className="bg-blue-900/10">
                            <td className="px-6 py-4 font-bold text-white">{data.ownerName} <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-0.5 rounded ml-2">OWNER</span></td>
                            <td className="px-6 py-4 text-gray-400">Account Admin</td>
                            <td className="px-6 py-4">All Locations</td>
                            <td className="px-6 py-4">All Classes</td>
                            <td className="px-6 py-4 text-right"></td>
                        </tr>
                        {data.coaches.map(c => (
                            <tr key={c.id} className="hover:bg-gray-700/50">
                                <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                                <td className="px-6 py-4">{c.email}</td>
                                <td className="px-6 py-4">{c.location || '-'}</td>
                                <td className="px-6 py-4 text-xs">{c.assignedClasses?.join(', ') || 'None'}</td>
                                <td className="px-6 py-4 text-right space-x-3">
                                    {onEditCoach && (
                                        <button onClick={() => onEditCoach(c)} className="text-yellow-400 hover:text-yellow-300 font-bold text-xs">Edit</button>
                                    )}
                                    <button 
                                        onClick={() => handleDelete(c.id)} 
                                        disabled={deleting === c.id}
                                        className="text-red-400 hover:text-red-300 font-bold text-xs disabled:opacity-50"
                                    >
                                        {deleting === c.id ? 'Removing...' : 'Remove'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {data.coaches.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No coaches added yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

const ScheduleTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void }> = ({ data, onUpdateData, onOpenModal }) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const handleRemoveClass = (id: string) => {
        if(confirm('Remove this class from the schedule?')) {
            onUpdateData({ schedule: data.schedule.filter(s => s.id !== id) });
        }
    }

    const handleRemoveEvent = (id: string) => {
        if(confirm('Cancel this event?')) {
            onUpdateData({ events: data.events.filter(e => e.id !== id) });
        }
    }

    const handleRemovePrivateSlot = (id: string) => {
        if(confirm('Remove this private lesson slot?')) {
            onUpdateData({ privateSlots: (data.privateSlots || []).filter(s => s.id !== id) });
        }
    }

    return (
        <div className="space-y-8">
            {/* Weekly Schedule */}
            <div>
                <SectionHeader 
                    title="Weekly Class Schedule" 
                    description="Define your recurring weekly classes." 
                    action={
                        <button onClick={() => onOpenModal('class')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow-lg">
                            + Add Class
                        </button>
                    }
                />
                <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                    {days.map(day => {
                        const classes = (data.schedule || []).filter(s => s.day === day).sort((a,b) => a.time.localeCompare(b.time));
                        return (
                            <div key={day} className="bg-gray-800 rounded-lg border border-gray-700 p-3 min-h-[200px]">
                                <h4 className="font-bold text-gray-400 text-sm mb-3 border-b border-gray-700 pb-2">{day}</h4>
                                <div className="space-y-2">
                                    {classes.map(c => (
                                        <div key={c.id} className="bg-gray-700/50 p-2 rounded text-xs group relative hover:bg-gray-700 transition-colors">
                                            <p className="font-bold text-sky-300">{c.time}</p>
                                            <p className="text-white font-medium truncate">{c.className}</p>
                                            <p className="text-gray-500 truncate">{c.instructor}</p>
                                            <button 
                                                onClick={() => handleRemoveClass(c.id)}
                                                className="absolute top-1 right-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    {classes.length === 0 && <p className="text-gray-600 text-xs italic">No classes</p>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Private Lessons */}
            <div>
                <SectionHeader 
                    title="Private Lesson Slots" 
                    description="Create bookable private lesson slots for parents." 
                    action={
                        <button onClick={() => onOpenModal('private')} className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded shadow-lg">
                            + Add Private Slot
                        </button>
                    }
                />
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Time</th>
                                <th className="px-6 py-3">Coach</th>
                                <th className="px-6 py-3">Price</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {(data.privateSlots || []).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(slot => (
                                <tr key={slot.id} className="hover:bg-gray-700/50">
                                    <td className="px-6 py-4 font-medium text-white">{new Date(slot.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">{slot.time}</td>
                                    <td className="px-6 py-4">{slot.coachName}</td>
                                    <td className="px-6 py-4 text-green-400 font-bold">${slot.price}</td>
                                    <td className="px-6 py-4">
                                        {slot.isBooked ? (
                                            <span className="bg-green-900/50 text-green-400 px-2 py-1 rounded text-xs font-bold">Booked</span>
                                        ) : (
                                            <span className="bg-gray-700 text-gray-400 px-2 py-1 rounded text-xs font-bold">Available</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleRemovePrivateSlot(slot.id)} className="text-red-400 hover:text-red-300 font-bold text-xs">Remove</button>
                                    </td>
                                </tr>
                            ))}
                            {(data.privateSlots || []).length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No private lesson slots. Add slots for parents to book.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Events */}
            <div>
                <SectionHeader 
                    title="Upcoming Events" 
                    description="Competitions, belt tests, and seminars." 
                    action={
                        <button onClick={() => onOpenModal('event')} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded shadow-lg">
                            + Add Event
                        </button>
                    }
                />
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Event</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Location</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {(data.events || []).map(evt => (
                                <tr key={evt.id} className="hover:bg-gray-700/50">
                                    <td className="px-6 py-4 font-medium text-white">{evt.title}</td>
                                    <td className="px-6 py-4"><span className="bg-gray-700 px-2 py-1 rounded text-xs uppercase font-bold text-indigo-300">{evt.type}</span></td>
                                    <td className="px-6 py-4">{new Date(evt.date).toLocaleDateString()} {evt.time}</td>
                                    <td className="px-6 py-4">{evt.location}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleRemoveEvent(evt.id)} className="text-red-400 hover:text-red-300 font-bold text-xs">Cancel</button>
                                    </td>
                                </tr>
                            ))}
                            {(data.events || []).length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No upcoming events.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
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

const DemoDataSection: React.FC<{ clubId?: string }> = ({ clubId }) => {
    const [hasDemoData, setHasDemoData] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [message, setMessage] = useState('');
    
    useEffect(() => {
        if (clubId) {
            fetch(`/api/club/${clubId}/data`)
                .then(r => r.json())
                .then(data => {
                    if (data.club?.hasDemoData) {
                        setHasDemoData(true);
                    }
                })
                .catch(console.error);
        }
    }, [clubId]);
    
    const handleClearDemo = async () => {
        if (!clubId) return;
        setLoading(true);
        setMessage('');
        
        try {
            const response = await fetch('/api/demo/clear', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId }),
            });
            
            const result = await response.json();
            if (result.success) {
                setHasDemoData(false);
                setShowConfirm(false);
                window.location.reload();
            } else {
                setMessage(result.message || 'Failed to clear');
            }
        } catch (err) {
            console.error('Failed to clear demo data:', err);
            setMessage('Network error');
        } finally {
            setLoading(false);
        }
    };
    
    const handleLoadDemo = async () => {
        if (!clubId) return;
        setLoading(true);
        setMessage('');
        
        try {
            const response = await fetch('/api/demo/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId }),
            });
            
            const result = await response.json();
            if (result.success) {
                // CRITICAL: Update localStorage with fresh wizard_data so page reload uses it
                if (result.wizardData) {
                    const isImpersonating = !!sessionStorage.getItem('impersonationToken');
                    if (isImpersonating) {
                        sessionStorage.setItem('impersonation_wizard_data', JSON.stringify(result.wizardData));
                    } else {
                        localStorage.setItem('taekup_wizard_data', JSON.stringify(result.wizardData));
                    }
                }
                setHasDemoData(true);
                setMessage('Demo loaded! Refreshing...');
                setTimeout(() => window.location.reload(), 500);
            } else {
                setMessage(result.message || 'Failed to load');
            }
        } catch (err) {
            console.error('Failed to load demo data:', err);
            setMessage('Network error');
        } finally {
            setLoading(false);
        }
    };
    
    const handleReloadDemo = async () => {
        if (!clubId) {
            alert('DEBUG: No clubId available!');
            return;
        }
        alert(`DEBUG: Reloading demo for clubId: ${clubId}`);
        setLoading(true);
        setMessage('Clearing old data...');
        
        try {
            const clearRes = await fetch('/api/demo/clear', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId }),
            });
            const clearResult = await clearRes.json();
            console.log('[DemoReload] Clear result:', clearResult);
            
            setMessage('Loading fresh demo data...');
            
            const response = await fetch('/api/demo/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId }),
            });
            
            const result = await response.json();
            console.log('[DemoReload] Load result:', result);
            console.log('[DemoReload] wizardData received:', !!result.wizardData);
            
            alert(`DEBUG: API response - success: ${result.success}, schedule: ${result.wizardData?.schedule?.length || 0}, privateSlots: ${result.wizardData?.privateSlots?.length || 0}`);
            
            if (result.success) {
                // CRITICAL: Update localStorage with fresh wizard_data so page reload uses it
                if (result.wizardData) {
                    const isImpersonating = !!sessionStorage.getItem('impersonationToken');
                    if (isImpersonating) {
                        sessionStorage.setItem('impersonation_wizard_data', JSON.stringify(result.wizardData));
                    } else {
                        localStorage.setItem('taekup_wizard_data', JSON.stringify(result.wizardData));
                    }
                    
                    // Debug: Check all demo data fields
                    const studentsWithBirthday = result.wizardData.students?.filter((s: any) => s.birthday) || [];
                    console.log('[DemoReload] Students with birthday:', studentsWithBirthday.length, studentsWithBirthday.map((s: any) => ({ name: s.name, birthday: s.birthday })));
                    console.log('[DemoReload] Skills count:', result.wizardData.skills?.length);
                    console.log('[DemoReload] World Rankings count:', result.wizardData.worldRankings?.length);
                    console.log('[DemoReload] Schedule count:', result.wizardData.schedule?.length);
                    console.log('[DemoReload] Private Slots count:', result.wizardData.privateSlots?.length);
                    console.log('[DemoReload] Branches:', result.wizardData.branches, result.wizardData.branchNames);
                    console.log('[DemoReload] Location Classes:', result.wizardData.locationClasses);
                    
                    setMessage(`Demo loaded! ${studentsWithBirthday.length} birthdays found. Refreshing...`);
                } else {
                    console.error('[DemoReload] No wizardData in response!');
                    setMessage('Warning: No wizard data returned. Refreshing anyway...');
                }
                setTimeout(() => window.location.reload(), 1000);
            } else {
                setMessage(result.message || 'Failed to reload');
            }
        } catch (err) {
            console.error('Failed to reload demo data:', err);
            setMessage('Network error');
        } finally {
            setLoading(false);
        }
    };
    
    if (hasDemoData) {
        return (
            <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <label className="block text-sm font-bold text-amber-300">Demo Mode Active</label>
                            <p className="text-xs text-gray-400">Your dashboard is showing sample data. Clear it when ready to add real students.</p>
                            {message && <p className="text-xs text-cyan-400 mt-1">{message}</p>}
                        </div>
                    </div>
                    {showConfirm ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Delete all demo data?</span>
                            <button 
                                onClick={handleClearDemo}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-bold disabled:opacity-50"
                            >
                                {loading ? 'Clearing...' : 'Yes, Clear'}
                            </button>
                            <button 
                                onClick={() => setShowConfirm(false)}
                                className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleReloadDemo}
                                disabled={loading}
                                className="bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 px-4 py-2 rounded text-sm font-bold border border-cyan-600/50 disabled:opacity-50"
                            >
                                {loading ? 'Loading...' : 'Reload Demo'}
                            </button>
                            <button 
                                onClick={() => setShowConfirm(true)}
                                className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 px-4 py-2 rounded text-sm font-bold border border-amber-600/50"
                            >
                                Clear Demo
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🎭</span>
                    <div>
                        <label className="block text-sm font-bold text-gray-300">Demo Mode</label>
                        <p className="text-xs text-gray-400">Load sample data to explore all features with realistic examples.</p>
                        {message && <p className="text-xs text-cyan-400 mt-1">{message}</p>}
                    </div>
                </div>
                <button 
                    onClick={handleLoadDemo}
                    disabled={loading}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-sm font-bold disabled:opacity-50"
                >
                    {loading ? 'Loading...' : 'Load Demo Data'}
                </button>
            </div>
        </div>
    );
};

const SettingsTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, clubId?: string }> = ({ data, onUpdateData, clubId }) => {
    const [activeSubTab, setActiveSubTab] = useState<'general' | 'belts' | 'locations' | 'rules'>('general');

    return (
        <div>
            <SectionHeader title="System Settings" description="Configure your club rules, branding, and structure." />
            
            {/* Sub-Nav */}
            <div className="flex space-x-4 border-b border-gray-700 mb-6">
                {['general', 'belts', 'locations', 'rules'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveSubTab(tab as any)}
                        className={`pb-2 px-2 text-sm font-medium capitalize transition-colors ${activeSubTab === tab ? 'text-sky-300 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeSubTab === 'general' && (
                <div className="space-y-6 max-w-2xl">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Club Logo</label>
                        <div className="flex items-center space-x-4">
                            {data.logo ? (
                                <img 
                                    src={typeof data.logo === 'string' ? data.logo : (data.logo instanceof Blob ? URL.createObjectURL(data.logo) : '')} 
                                    alt="Club Logo" 
                                    className="w-20 h-20 rounded-lg object-cover border border-gray-600"
                                />
                            ) : (
                                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center text-white font-bold text-2xl">
                                    {data.clubName?.charAt(0) || 'C'}
                                </div>
                            )}
                            <div className="flex flex-col space-y-2">
                                <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                                    Upload Logo
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
                                        Remove Logo
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Recommended: Square image, at least 200x200 pixels</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Club Name</label>
                        <input type="text" value={data.clubName} onChange={e => onUpdateData({ clubName: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Slogan</label>
                        <input type="text" value={data.slogan} onChange={e => onUpdateData({ slogan: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Primary Brand Color</label>
                        <div className="flex items-center space-x-2">
                            <input type="color" value={data.primaryColor} onChange={e => onUpdateData({ primaryColor: e.target.value })} className="h-10 w-10 bg-gray-800 border border-gray-700 rounded cursor-pointer" />
                            <span className="text-gray-300">{data.primaryColor}</span>
                        </div>
                    </div>
                    
                    {/* Holiday Schedule Setting - Improves ChronosBelt™ Predictor accuracy */}
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <label className="block text-sm text-gray-400 mb-1">Holiday Schedule</label>
                        <p className="text-xs text-gray-500 mb-3">This affects the accuracy of the ChronosBelt™ Predictor for parents.</p>
                        <select 
                            value={data.holidaySchedule || 'minimal'} 
                            onChange={e => onUpdateData({ holidaySchedule: e.target.value as any })}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white mb-3"
                        >
                            <option value="minimal">Minimal - Only major holidays (~2 weeks/year)</option>
                            <option value="school_holidays">School Calendar - Summer, winter, spring breaks (~8 weeks/year)</option>
                            <option value="extended">Extended - All public holidays + long breaks (~12 weeks/year)</option>
                            <option value="custom">Custom</option>
                        </select>
                        
                        {data.holidaySchedule === 'custom' && (
                            <div className="flex items-center gap-3">
                                <label className="text-sm text-gray-400">Weeks closed per year:</label>
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
                                {data.holidaySchedule === 'minimal' && 'Your school operates year-round with minimal closures.'}
                                {data.holidaySchedule === 'school_holidays' && 'Your school follows the academic calendar with standard breaks.'}
                                {data.holidaySchedule === 'extended' && 'Your school takes extended breaks throughout the year.'}
                                {data.holidaySchedule === 'custom' && `Your school closes for ${data.customHolidayWeeks || 4} weeks per year.`}
                                {!data.holidaySchedule && 'Your school operates year-round with minimal closures.'}
                            </span>
                        </div>
                    </div>
                    
                    {/* World Rankings Opt-In */}
                    <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 p-4 rounded-lg border border-cyan-700/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🌍</span>
                                <div>
                                    <label className="block text-sm font-bold text-white">World Rankings</label>
                                    <p className="text-xs text-gray-400">Enable to participate in global martial arts rankings</p>
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
                                    <h4 className="text-sm font-bold text-cyan-300 mb-2">How it works:</h4>
                                    <ul className="text-xs text-gray-400 space-y-1">
                                        <li>• Students earn Global XP using a standardized formula (fair across all clubs)</li>
                                        <li>• Rankings update weekly and show positions by sport and country</li>
                                        <li>• Your club and students will appear in public leaderboards</li>
                                        <li>• Only rank positions are shown (not raw XP values)</li>
                                    </ul>
                                </div>
                                <div className="mt-3 flex items-center gap-2 text-xs text-cyan-400">
                                    <span>✓</span>
                                    <span>Your club is participating in World Rankings</span>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Demo Data Management */}
                    <DemoDataSection clubId={clubId} />
                </div>
            )}

            {activeSubTab === 'belts' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">Belt System</h3>
                        <p className="text-xs text-gray-500 mb-3">Choose a preset or customize your own belt ranking system.</p>
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
                                    onUpdateData({ beltSystemType: system, belts: newBelts });
                                } else {
                                    onUpdateData({ beltSystemType: 'custom' });
                                }
                            }}
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white mb-4"
                        >
                            <option value="wt">Taekwondo (WT)</option>
                            <option value="itf">Taekwondo (ITF)</option>
                            <option value="karate">Karate</option>
                            <option value="bjj">Brazilian Jiu-Jitsu</option>
                            <option value="judo">Judo</option>
                            <option value="hapkido">Hapkido</option>
                            <option value="tangsoodo">Tang Soo Do</option>
                            <option value="aikido">Aikido</option>
                            <option value="kravmaga">Krav Maga</option>
                            <option value="kungfu">Kung Fu</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">Edit Belt Ranks</h3>
                        <p className="text-xs text-gray-500 mb-3">Customize belt names and colors. You can add custom belts at any time.</p>
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
                                </div>
                            ))}
                        </div>
                        <button 
                            onClick={() => onUpdateData({ belts: [...data.belts, { id: `custom-${Date.now()}`, name: 'New Belt', color1: '#ffffff' }] })}
                            className="mt-4 text-sky-300 hover:text-blue-300 text-sm font-bold"
                        >
                            + Add Belt Level
                        </button>
                    </div>
                </div>
            )}

            {activeSubTab === 'locations' && (
                <div className="space-y-6">
                    <div className="grid gap-4">
                        {data.branchNames?.map((branch, idx) => (
                            <div key={idx} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                                <label className="block text-xs text-gray-500 uppercase mb-1">Location {idx + 1}</label>
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
                                    placeholder="Address"
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
                        + Add New Location
                    </button>
                </div>
            )}

            {activeSubTab === 'rules' && (
                <div className="space-y-6 max-w-2xl">
                    {/* Promotion Pace */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">Promotion Pace</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Stripes per Belt</label>
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
                        
                        {/* Stripe Progress Rule */}
                        <div className="bg-gray-700/30 p-4 rounded-md border border-gray-700">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
                                <label className="block text-sm font-medium text-gray-300">Stripe Progress Rule</label>
                                <div className="flex space-x-4 text-sm mt-2 sm:mt-0">
                                    <label className="flex items-center cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="pointsRuleAdmin" 
                                            checked={!data.useCustomPointsPerBelt} 
                                            onChange={() => onUpdateData({ useCustomPointsPerBelt: false })}
                                            className="form-radio text-sky-500 h-4 w-4"
                                        />
                                        <span className="ml-2 text-white">Simple (Same for all)</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="pointsRuleAdmin" 
                                            checked={data.useCustomPointsPerBelt} 
                                            onChange={() => {
                                                if (!data.useCustomPointsPerBelt && Object.keys(data.pointsPerBelt || {}).length === 0) {
                                                    const initialMap: Record<string, number> = {};
                                                    let currentPoints = data.pointsPerStripe || 64;
                                                    data.belts.forEach((belt) => {
                                                        initialMap[belt.id] = currentPoints;
                                                        currentPoints += 16;
                                                    });
                                                    onUpdateData({ useCustomPointsPerBelt: true, pointsPerBelt: initialMap });
                                                } else {
                                                    onUpdateData({ useCustomPointsPerBelt: true });
                                                }
                                            }}
                                            className="form-radio text-sky-500 h-4 w-4"
                                        />
                                        <span className="ml-2 text-white">Advanced (Per Belt)</span>
                                    </label>
                                </div>
                            </div>

                            {!data.useCustomPointsPerBelt ? (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Points per Stripe</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={data.pointsPerStripe} 
                                        onChange={e => onUpdateData({ pointsPerStripe: parseInt(e.target.value, 10) || 64 })} 
                                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                    />
                                    <p className="text-xs text-gray-500 mt-2">Standard setting for most clubs.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left text-gray-300">
                                        <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                                            <tr>
                                                <th className="px-4 py-2">Belt</th>
                                                <th className="px-4 py-2">Points per Stripe</th>
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
                                                            value={data.pointsPerBelt?.[belt.id] || data.pointsPerStripe}
                                                            onChange={e => {
                                                                const newMap = { ...(data.pointsPerBelt || {}), [belt.id]: parseInt(e.target.value) || 0 };
                                                                onUpdateData({ pointsPerBelt: newMap });
                                                            }}
                                                            className="w-24 bg-gray-900 border border-gray-600 rounded p-1 text-center text-white focus:ring-sky-500"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p className="text-xs text-gray-500 mt-2">Adjust difficulty as students advance.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stripe Colors */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-white">Color-Coded Stripes</h3>
                                <p className="text-sm text-gray-400">Add visual flair to stripe progression.</p>
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
                        <h3 className="font-bold text-white mb-4">Bonus Point Sources</h3>
                        <p className="text-sm text-gray-400 mb-4">Enable extra ways for students to earn points.</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-white">Coach Bonus</p>
                                    <p className="text-sm text-gray-400">Allow coaches to award bonus points during class.</p>
                                </div>
                                <ToggleSwitch checked={data.coachBonus} onChange={() => onUpdateData({ coachBonus: !data.coachBonus })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-white">Homework</p>
                                    <p className="text-sm text-gray-400">Students earn points by completing homework assignments.</p>
                                </div>
                                <ToggleSwitch checked={data.homeworkBonus} onChange={() => onUpdateData({ homeworkBonus: !data.homeworkBonus })} />
                            </div>
                        </div>
                    </div>

                    {/* Grading Requirement */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">Grading Requirement</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-white">Require specific skill before promotion?</p>
                                    <p className="text-sm text-gray-400">Students must pass this before the belt test.</p>
                                </div>
                                <ToggleSwitch checked={data.gradingRequirementEnabled} onChange={() => onUpdateData({ gradingRequirementEnabled: !data.gradingRequirementEnabled })} />
                            </div>
                            {data.gradingRequirementEnabled && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Requirement Name</label>
                                    <input 
                                        type="text" 
                                        value={data.gradingRequirementName || ''} 
                                        onChange={e => onUpdateData({ gradingRequirementName: e.target.value })}
                                        placeholder="e.g. Poomsae, Kata, Forms, Technique"
                                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                    />
                                </div>
                            )}
                            {!data.gradingRequirementEnabled && (
                                <p className="text-xs text-gray-500">Examples: Poomsae, Kata, Forms, Hyung, Patterns, Technique Test</p>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-center">
                        <p className="text-lg text-gray-300">
                            <span className="font-bold text-white">Promotion Rule: </span>
                            {data.stripesPerBelt} Stripes {data.gradingRequirementEnabled ? `+ ${data.gradingRequirementName || 'Requirement'} Ready ` : ''}= New Belt
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

const CreatorHubTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, clubId?: string }> = ({ data, onUpdateData, clubId }) => {
    const [activeTab, setActiveTab] = useState<'content' | 'courses' | 'analytics'>('content');
    const [newVideo, setNewVideo] = useState({ 
        title: '', 
        url: '', 
        beltId: 'all', 
        tags: [] as string[],
        contentType: 'video' as 'video' | 'document',
        status: 'draft' as 'draft' | 'live',
        pricingType: 'free' as 'free' | 'premium',
        xpReward: 10,
        description: '',
        publishAt: '' // Scheduled publishing date
    });
    const [newCourse, setNewCourse] = useState({
        title: '',
        description: '',
        beltId: 'all',
        xpReward: 50,
        status: 'draft' as 'draft' | 'live'
    });
    const [showCourseForm, setShowCourseForm] = useState(false);
    const [editingContentId, setEditingContentId] = useState<string | null>(null);
    
    // Search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterBelt, setFilterBelt] = useState('all');
    const [filterType, setFilterType] = useState<'all' | 'video' | 'document'>('all');
    const [filterAccess, setFilterAccess] = useState<'all' | 'free' | 'premium'>('all');

    const customTags = data.customVideoTags || [];
    const allTags = [...DEFAULT_VIDEO_TAGS, ...customTags.map(t => ({ id: t, name: t, icon: '🏷️' }))];
    const courses = data.courses || [];
    const curriculum = data.curriculum || [];

    const toggleTag = (tagId: string) => {
        const updated = newVideo.tags.includes(tagId)
            ? newVideo.tags.filter(t => t !== tagId)
            : [...newVideo.tags, tagId];
        setNewVideo({...newVideo, tags: updated});
    };

    const handleAddContent = () => {
        if(!newVideo.title || !newVideo.url) return;
        const item: CurriculumItem = {
            id: `vid-${Date.now()}`,
            title: newVideo.title,
            url: newVideo.url,
            beltId: newVideo.beltId,
            category: newVideo.tags.join(','),
            description: newVideo.description || 'Uploaded by Instructor',
            authorName: data.ownerName,
            contentType: newVideo.contentType,
            status: newVideo.publishAt ? 'draft' : newVideo.status, // If scheduled, start as draft
            pricingType: newVideo.pricingType,
            xpReward: newVideo.xpReward,
            viewCount: 0,
            completionCount: 0,
            publishAt: newVideo.publishAt || undefined
        };
        onUpdateData({ curriculum: [...curriculum, item] });
        setNewVideo({ title: '', url: '', beltId: 'all', tags: [], contentType: 'video', status: 'draft', pricingType: 'free', xpReward: 10, description: '', publishAt: '' });
    };

    // Filter content based on search and filters
    const filterContent = (items: CurriculumItem[]) => {
        return items.filter(item => {
            const matchesSearch = !searchQuery || 
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesBelt = filterBelt === 'all' || item.beltId === filterBelt;
            const matchesType = filterType === 'all' || item.contentType === filterType;
            const matchesAccess = filterAccess === 'all' || item.pricingType === filterAccess;
            return matchesSearch && matchesBelt && matchesType && matchesAccess;
        });
    };

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

    const handleAddCourse = () => {
        if(!newCourse.title) return;
        const course = {
            id: `course-${Date.now()}`,
            title: newCourse.title,
            description: newCourse.description,
            beltId: newCourse.beltId,
            xpReward: newCourse.xpReward,
            status: newCourse.status,
            items: []
        };
        onUpdateData({ courses: [...courses, course] });
        setNewCourse({ title: '', description: '', beltId: 'all', xpReward: 50, status: 'draft' });
        setShowCourseForm(false);
    };

    const toggleContentStatus = (contentId: string) => {
        const updated = curriculum.map(c => 
            c.id === contentId ? { ...c, status: (c.status === 'live' ? 'draft' : 'live') as 'draft' | 'live' } : c
        );
        onUpdateData({ curriculum: updated });
    };

    const toggleCourseStatus = (courseId: string) => {
        const updated = courses.map(c => 
            c.id === courseId ? { ...c, status: (c.status === 'live' ? 'draft' : 'live') as 'draft' | 'live' } : c
        );
        onUpdateData({ courses: updated });
    };

    const addContentToCourse = (contentId: string, courseId: string) => {
        const updated = curriculum.map(c => 
            c.id === contentId ? { ...c, courseId } : c
        );
        onUpdateData({ curriculum: updated });
    };

    const removeContentFromCourse = (contentId: string) => {
        const updated = curriculum.map(c => 
            c.id === contentId ? { ...c, courseId: undefined } : c
        );
        onUpdateData({ curriculum: updated });
    };

    const liveContent = filterContent(curriculum.filter(c => c.status === 'live'));
    const draftContent = filterContent(curriculum.filter(c => c.status !== 'live'));
    const scheduledContent = draftContent.filter(c => c.publishAt);
    const totalViews = curriculum.reduce((sum, c) => sum + (c.viewCount || 0), 0);
    const totalCompletions = curriculum.reduce((sum, c) => sum + (c.completionCount || 0), 0);
    const hasActiveFilters = searchQuery || filterBelt !== 'all' || filterType !== 'all' || filterAccess !== 'all';

    return (
        <div>
            <SectionHeader title="Creator Hub" description="Create courses, upload content, and track your curriculum performance." />
            
            <div className="flex gap-2 mb-6 border-b border-gray-700 pb-4">
                <button 
                    onClick={() => setActiveTab('content')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'content' ? 'bg-sky-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    📹 Content Library
                </button>
                <button 
                    onClick={() => setActiveTab('courses')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'courses' ? 'bg-sky-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    📚 Courses
                </button>
                <button 
                    onClick={() => setActiveTab('analytics')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'analytics' ? 'bg-sky-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                    📊 Analytics
                </button>
            </div>

            {activeTab === 'content' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        {/* Search and Filter Bar */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="flex-1">
                                    <input 
                                        type="text" 
                                        placeholder="Search content by title or description..." 
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                    />
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <select 
                                        value={filterBelt}
                                        onChange={e => setFilterBelt(e.target.value)}
                                        className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                                    >
                                        <option value="all">All Belts</option>
                                        {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                    <select 
                                        value={filterType}
                                        onChange={e => setFilterType(e.target.value as 'all' | 'video' | 'document')}
                                        className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                                    >
                                        <option value="all">All Types</option>
                                        <option value="video">Videos</option>
                                        <option value="document">Documents</option>
                                    </select>
                                    <select 
                                        value={filterAccess}
                                        onChange={e => setFilterAccess(e.target.value as 'all' | 'free' | 'premium')}
                                        className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                                    >
                                        <option value="all">All Access</option>
                                        <option value="free">Free</option>
                                        <option value="premium">Premium</option>
                                    </select>
                                    {hasActiveFilters && (
                                        <button 
                                            onClick={() => { setSearchQuery(''); setFilterBelt('all'); setFilterType('all'); setFilterAccess('all'); }}
                                            className="px-3 py-2 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                            {hasActiveFilters && (
                                <p className="text-xs text-gray-400 mt-2">
                                    Showing {liveContent.length + draftContent.length} of {curriculum.length} items
                                </p>
                            )}
                        </div>

                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <h3 className="font-bold text-white mb-4">Add New Content</h3>
                            <div className="space-y-4">
                                <div className="flex gap-2 mb-4">
                                    <button 
                                        onClick={() => setNewVideo({...newVideo, contentType: 'video'})}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium ${newVideo.contentType === 'video' ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300'}`}
                                    >📹 Video</button>
                                    <button 
                                        onClick={() => setNewVideo({...newVideo, contentType: 'document'})}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium ${newVideo.contentType === 'document' ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300'}`}
                                    >📄 Document</button>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Title (e.g. Yellow Belt Form Tutorial)" 
                                    value={newVideo.title} 
                                    onChange={e => setNewVideo({...newVideo, title: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                />
                                <input 
                                    type="text" 
                                    placeholder={newVideo.contentType === 'video' ? "Video URL (YouTube, Vimeo, or direct link)" : "Document URL (Google Drive, Dropbox, or direct link)"} 
                                    value={newVideo.url} 
                                    onChange={e => setNewVideo({...newVideo, url: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                />
                                <textarea 
                                    placeholder="Description (optional)" 
                                    value={newVideo.description} 
                                    onChange={e => setNewVideo({...newVideo, description: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white h-20"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Belt Level</label>
                                        <select 
                                            value={newVideo.beltId}
                                            onChange={e => setNewVideo({...newVideo, beltId: e.target.value})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        >
                                            <option value="all">All Belts</option>
                                            {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">XP Reward</label>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max="100"
                                            value={newVideo.xpReward}
                                            onChange={e => setNewVideo({...newVideo, xpReward: parseInt(e.target.value) || 0})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Access</label>
                                        <select 
                                            value={newVideo.pricingType}
                                            onChange={e => setNewVideo({...newVideo, pricingType: e.target.value as 'free' | 'premium'})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        >
                                            <option value="free">Free for All</option>
                                            <option value="premium">Premium Only</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Status</label>
                                        <select 
                                            value={newVideo.status}
                                            onChange={e => setNewVideo({...newVideo, status: e.target.value as 'draft' | 'live', publishAt: ''})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        >
                                            <option value="draft">Draft (Hidden)</option>
                                            <option value="live">Live (Published)</option>
                                        </select>
                                    </div>
                                </div>
                                {/* Scheduled Publishing */}
                                <div className="bg-gray-700/50 p-3 rounded border border-gray-600">
                                    <label className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                                        <span>📅</span> Schedule Publishing (Optional)
                                    </label>
                                    <input 
                                        type="datetime-local"
                                        value={newVideo.publishAt}
                                        onChange={e => setNewVideo({...newVideo, publishAt: e.target.value, status: 'draft'})}
                                        min={new Date().toISOString().slice(0, 16)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                    />
                                    {newVideo.publishAt && (
                                        <p className="text-xs text-sky-400 mt-1">
                                            Content will auto-publish on {new Date(newVideo.publishAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">Tags</label>
                                    <div className="flex flex-wrap gap-2">
                                        {allTags.map(tag => (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => toggleTag(tag.id)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                                    newVideo.tags.includes(tag.id)
                                                        ? 'bg-sky-500 text-white'
                                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                }`}
                                            >
                                                {tag.icon} {tag.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button 
                                    onClick={handleAddContent} 
                                    disabled={!newVideo.title || !newVideo.url}
                                    className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 rounded"
                                >
                                    {newVideo.publishAt ? '📅 Schedule Content' : (newVideo.status === 'live' ? '📤 Publish Content' : '💾 Save as Draft')}
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-white">Published Content ({liveContent.length})</h3>
                            </div>
                            <div className="space-y-2">
                                {liveContent.length === 0 && <p className="text-gray-500 italic text-sm">No published content yet.</p>}
                                {liveContent.map(vid => {
                                    const tags = vid.category?.split(',').filter(Boolean) || [];
                                    return (
                                        <div key={vid.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded border border-gray-700">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{vid.contentType === 'document' ? '📄' : '📹'}</span>
                                                <div>
                                                    <p className="font-bold text-white text-sm flex items-center gap-2">
                                                        {vid.title}
                                                        <span className="text-xs px-2 py-0.5 bg-green-600/20 text-green-400 rounded">LIVE</span>
                                                        {vid.pricingType === 'premium' && <span className="text-xs px-2 py-0.5 bg-yellow-600/20 text-yellow-400 rounded">PREMIUM</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {vid.beltId === 'all' ? 'All Belts' : data.belts.find(b => b.id === vid.beltId)?.name}
                                                        <span className="mx-2">•</span>
                                                        {vid.xpReward || 10} XP
                                                        <span className="mx-2">•</span>
                                                        {vid.viewCount || 0} views
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => toggleContentStatus(vid.id)} className="text-yellow-400 hover:text-yellow-300 text-xs px-2 py-1 bg-gray-700 rounded">Unpublish</button>
                                                <button onClick={() => onUpdateData({ curriculum: curriculum.filter(c => c.id !== vid.id) })} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-gray-700 rounded">Delete</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <h3 className="font-bold text-white mb-4">
                                Drafts ({draftContent.length})
                                {scheduledContent.length > 0 && (
                                    <span className="text-xs font-normal text-sky-400 ml-2">
                                        ({scheduledContent.length} scheduled)
                                    </span>
                                )}
                            </h3>
                            <div className="space-y-2">
                                {draftContent.length === 0 && <p className="text-gray-500 italic text-sm">No drafts.</p>}
                                {draftContent.map(vid => (
                                    <div key={vid.id} className={`flex justify-between items-center bg-gray-900/50 p-3 rounded border ${vid.publishAt ? 'border-sky-500/50' : 'border-gray-700'} opacity-75`}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{vid.contentType === 'document' ? '📄' : '📹'}</span>
                                            <div>
                                                <p className="font-bold text-white text-sm flex items-center gap-2">
                                                    {vid.title}
                                                    {vid.publishAt ? (
                                                        <span className="text-xs px-2 py-0.5 bg-sky-600/20 text-sky-400 rounded">
                                                            📅 {new Date(vid.publishAt).toLocaleDateString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-0.5 bg-gray-600/50 text-gray-400 rounded">DRAFT</span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {vid.beltId === 'all' ? 'All Belts' : data.belts.find(b => b.id === vid.beltId)?.name}
                                                    {vid.publishAt && (
                                                        <span className="ml-2 text-sky-400">
                                                            publishes {new Date(vid.publishAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => toggleContentStatus(vid.id)} className="text-green-400 hover:text-green-300 text-xs px-2 py-1 bg-gray-700 rounded">
                                                {vid.publishAt ? 'Publish Now' : 'Publish'}
                                            </button>
                                            <button onClick={() => onUpdateData({ curriculum: curriculum.filter(c => c.id !== vid.id) })} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-gray-700 rounded">Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-sky-600 to-blue-700 p-6 rounded-lg">
                            <h3 className="font-bold text-white mb-2">Quick Stats</h3>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="bg-white/10 p-3 rounded">
                                    <p className="text-3xl font-bold text-white">{curriculum.length}</p>
                                    <p className="text-xs text-white/70">Total Items</p>
                                </div>
                                <div className="bg-white/10 p-3 rounded">
                                    <p className="text-3xl font-bold text-white">{liveContent.length}</p>
                                    <p className="text-xs text-white/70">Published</p>
                                </div>
                                <div className="bg-white/10 p-3 rounded">
                                    <p className="text-3xl font-bold text-white">{totalViews}</p>
                                    <p className="text-xs text-white/70">Total Views</p>
                                </div>
                                <div className="bg-white/10 p-3 rounded">
                                    <p className="text-3xl font-bold text-white">{courses.length}</p>
                                    <p className="text-xs text-white/70">Courses</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <h3 className="font-bold text-white mb-3 text-sm">XP Rewards Guide</h3>
                            <div className="space-y-2 text-xs text-gray-400">
                                <p>Students earn XP when they complete your content:</p>
                                <div className="bg-gray-900/50 p-2 rounded space-y-1">
                                    <p>📹 Short video: <span className="text-sky-400">5-10 XP</span></p>
                                    <p>📹 Full tutorial: <span className="text-sky-400">15-25 XP</span></p>
                                    <p>📄 Practice sheet: <span className="text-sky-400">5 XP</span></p>
                                    <p>📚 Complete course: <span className="text-sky-400">50-100 XP</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'courses' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <p className="text-gray-400">Bundle your content into structured courses for better learning paths.</p>
                        <button 
                            onClick={() => setShowCourseForm(!showCourseForm)}
                            className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 px-4 rounded"
                        >
                            + Create Course
                        </button>
                    </div>

                    {showCourseForm && (
                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <h3 className="font-bold text-white mb-4">New Course</h3>
                            <div className="space-y-4">
                                <input 
                                    type="text" 
                                    placeholder="Course Title (e.g. Yellow Belt Mastery)" 
                                    value={newCourse.title} 
                                    onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                />
                                <textarea 
                                    placeholder="Course Description" 
                                    value={newCourse.description} 
                                    onChange={e => setNewCourse({...newCourse, description: e.target.value})}
                                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white h-20"
                                />
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Belt Level</label>
                                        <select 
                                            value={newCourse.beltId}
                                            onChange={e => setNewCourse({...newCourse, beltId: e.target.value})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        >
                                            <option value="all">All Belts</option>
                                            {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Course XP</label>
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={newCourse.xpReward}
                                            onChange={e => setNewCourse({...newCourse, xpReward: parseInt(e.target.value) || 0})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Status</label>
                                        <select 
                                            value={newCourse.status}
                                            onChange={e => setNewCourse({...newCourse, status: e.target.value as 'draft' | 'live'})}
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="live">Live</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleAddCourse} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded">
                                        Create Course
                                    </button>
                                    <button onClick={() => setShowCourseForm(false)} className="bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-6">
                        {courses.length === 0 && !showCourseForm && (
                            <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
                                <p className="text-4xl mb-4">📚</p>
                                <p className="text-white font-bold mb-2">No Courses Yet</p>
                                <p className="text-gray-400 text-sm mb-4">Create your first course to bundle content into a structured learning path.</p>
                                <button 
                                    onClick={() => setShowCourseForm(true)}
                                    className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 px-4 rounded"
                                >
                                    Create Your First Course
                                </button>
                            </div>
                        )}
                        {courses.map(course => {
                            const courseContent = curriculum.filter(c => c.courseId === course.id);
                            return (
                                <div key={course.id} className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                                📚 {course.title}
                                                <span className={`text-xs px-2 py-0.5 rounded ${course.status === 'live' ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/50 text-gray-400'}`}>
                                                    {course.status === 'live' ? 'LIVE' : 'DRAFT'}
                                                </span>
                                            </h3>
                                            <p className="text-gray-400 text-sm mt-1">{course.description || 'No description'}</p>
                                            <p className="text-xs text-gray-500 mt-2">
                                                {course.beltId === 'all' ? 'All Belts' : data.belts.find(b => b.id === course.beltId)?.name}
                                                <span className="mx-2">•</span>
                                                {course.xpReward} XP on completion
                                                <span className="mx-2">•</span>
                                                {courseContent.length} items
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => toggleCourseStatus(course.id)}
                                                className={`text-xs px-3 py-1 rounded ${course.status === 'live' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-green-600/20 text-green-400'}`}
                                            >
                                                {course.status === 'live' ? 'Unpublish' : 'Publish'}
                                            </button>
                                            <button 
                                                onClick={() => onUpdateData({ courses: courses.filter(c => c.id !== course.id) })}
                                                className="text-xs px-3 py-1 rounded bg-red-600/20 text-red-400"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-700 pt-4">
                                        <p className="text-xs text-gray-500 mb-2">COURSE CONTENT</p>
                                        {courseContent.length === 0 ? (
                                            <p className="text-gray-500 italic text-sm">No content added yet. Add content from the library below.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {courseContent.map((item, idx) => (
                                                    <div key={item.id} className="flex items-center justify-between bg-gray-900/50 p-2 rounded">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500 text-sm w-6">{idx + 1}.</span>
                                                            <span>{item.contentType === 'document' ? '📄' : '📹'}</span>
                                                            <span className="text-white text-sm">{item.title}</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => removeContentFromCourse(item.id)}
                                                            className="text-red-400 hover:text-red-300 text-xs"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {curriculum.filter(c => !c.courseId).length > 0 && (
                                            <div className="mt-4">
                                                <p className="text-xs text-gray-500 mb-2">ADD CONTENT</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {curriculum.filter(c => !c.courseId).map(item => (
                                                        <button 
                                                            key={item.id}
                                                            onClick={() => addContentToCourse(item.id, course.id)}
                                                            className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded flex items-center gap-1"
                                                        >
                                                            + {item.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'analytics' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <p className="text-gray-400 text-sm">Total Content</p>
                            <p className="text-3xl font-bold text-white mt-1">{curriculum.length}</p>
                            <p className="text-xs text-gray-500 mt-1">{liveContent.length} published</p>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <p className="text-gray-400 text-sm">Total Views</p>
                            <p className="text-3xl font-bold text-white mt-1">{totalViews}</p>
                            <p className="text-xs text-gray-500 mt-1">All time</p>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <p className="text-gray-400 text-sm">Completions</p>
                            <p className="text-3xl font-bold text-white mt-1">{totalCompletions}</p>
                            <p className="text-xs text-gray-500 mt-1">{totalViews > 0 ? Math.round((totalCompletions / totalViews) * 100) : 0}% completion rate</p>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                            <p className="text-gray-400 text-sm">Courses</p>
                            <p className="text-3xl font-bold text-white mt-1">{courses.length}</p>
                            <p className="text-xs text-gray-500 mt-1">{courses.filter(c => c.status === 'live').length} live</p>
                        </div>
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h3 className="font-bold text-white mb-4">Content Performance</h3>
                        {curriculum.length === 0 ? (
                            <p className="text-gray-500 italic">No content to analyze yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {[...curriculum].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 10).map((item, idx) => (
                                    <div key={item.id} className="flex items-center gap-4">
                                        <span className="text-gray-500 w-6 text-right">{idx + 1}.</span>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-white text-sm font-medium">{item.title}</p>
                                                <p className="text-gray-400 text-sm">{item.viewCount || 0} views</p>
                                            </div>
                                            <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                                                <div 
                                                    className="bg-sky-500 h-2 rounded-full" 
                                                    style={{ width: `${totalViews > 0 ? ((item.viewCount || 0) / totalViews) * 100 : 0}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h3 className="font-bold text-white mb-4">Content by Belt Level</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {['all', ...data.belts.map(b => b.id)].map(beltId => {
                                const count = curriculum.filter(c => c.beltId === beltId).length;
                                const belt = beltId === 'all' ? null : data.belts.find(b => b.id === beltId);
                                return (
                                    <div key={beltId} className="bg-gray-900/50 p-3 rounded text-center">
                                        {belt ? (
                                            <div className="w-8 h-8 rounded-full mx-auto mb-2" style={{ backgroundColor: belt.color1 }}></div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full mx-auto mb-2 bg-gradient-to-r from-sky-500 to-purple-500"></div>
                                        )}
                                        <p className="text-white font-bold">{count}</p>
                                        <p className="text-xs text-gray-500">{belt?.name || 'All Belts'}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const BillingTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, clubId?: string }> = ({ data, onUpdateData, clubId }) => {
    const totalStudents = data.students.length;
    const currentTier = PRICING_TIERS.find(t => totalStudents <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
    const [connectingBank, setConnectingBank] = useState(false);
    
    const bulkCost = data.clubSponsoredPremium ? (totalStudents * 1.99) : 0;
    const totalBill = currentTier.price + bulkCost;

    const getSubscriptionStatus = () => {
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

    const subscriptionStatus = getSubscriptionStatus();

    const handleConnectBank = async () => {
        setConnectingBank(true);
        try {
            const effectiveClubId = clubId || localStorage.getItem('taekup_club_id') || localStorage.getItem('clubId');
            if (!effectiveClubId) {
                alert('Club not found. Please log in again.');
                setConnectingBank(false);
                return;
            }
            const response = await fetch('/api/stripe-connect/onboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId: effectiveClubId })
            });
            const result = await response.json();
            if (result.url) {
                window.location.href = result.url;
            } else {
                alert(result.error || 'Failed to create bank connection link. Please try again.');
            }
        } catch (error) {
            console.error('Error connecting bank:', error);
            alert('Error connecting bank account. Please try again.');
        } finally {
            setConnectingBank(false);
        }
    };

    return (
        <div>
            <SectionHeader title="Billing & Subscription" description="Manage your TaekUp plan and payouts." />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Current Plan Card */}
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm text-gray-400 uppercase">Current Plan</p>
                            <h3 className="text-2xl font-bold text-white">{currentTier.name}</h3>
                        </div>
                        <span className={`${subscriptionStatus.color} px-3 py-1 rounded-full text-xs font-bold`}>{subscriptionStatus.label}</span>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                        <div>
                            <div className="flex justify-between text-sm mb-1 text-gray-400">
                                <span>Usage</span>
                                <span>{totalStudents} / {currentTier.limit === Infinity ? '∞' : currentTier.limit} Students</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div 
                                    className="bg-sky-400 h-2 rounded-full" 
                                    style={{ width: `${Math.min((totalStudents / (currentTier.limit === Infinity ? 1000 : currentTier.limit)) * 100, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                        
                        <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-gray-300">Base Subscription</span>
                                <span className="text-white font-bold">${currentTier.price}/mo</span>
                            </div>
                            {data.clubSponsoredPremium && (
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-indigo-300">{data.isDemo ? 'DojoMint™ Reseller' : 'DojoMint™ Protocol Cost'}</span>
                                    <span className="text-indigo-300 font-bold">+${bulkCost.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-gray-600 mt-2">
                                <span className="text-white font-bold">Total Monthly</span>
                                <span className="text-xl font-extrabold text-white">${totalBill.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded">Manage Payment Method</button>
                </div>

                {/* Parent Premium / DojoMint Reseller Card */}
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-6 rounded-lg border border-indigo-500/30">
                    <div className="flex items-start space-x-4">
                        <div className="bg-indigo-600 p-3 rounded-lg text-2xl">💎</div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-1">
                                {data.isDemo ? 'DojoMint™ Digital Reseller' : 'DojoMint™ Gateway'}
                            </h3>
                            <p className="text-sm text-gray-300 mb-4">
                                {data.isDemo 
                                    ? <>Monetize your student base. Enable the <span className="text-indigo-300 font-semibold">DojoMint™ Gateway</span> to collect revenue automatically. You control the pricing; the protocol handles the rest.</>
                                    : <>Activate the <span className="text-indigo-300 font-semibold">DojoMint™ Gateway</span> to unlock parent premium subscriptions. You set the Student Fee; the protocol handles the rest.</>
                                }
                            </p>
                            
                            <div className="bg-indigo-950/50 p-4 rounded border border-indigo-500/30 mb-4">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-gray-400 uppercase font-bold">
                                            {data.isDemo ? 'Student Access Fee' : 'Student Fee'}
                                        </label>
                                        <div className="flex items-center mt-1">
                                            <span className="text-white text-xl font-bold mr-2">$</span>
                                            <input 
                                                type="number" 
                                                defaultValue="7.00" 
                                                step="0.50"
                                                min="3"
                                                max="15"
                                                className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-bold text-lg w-24 focus:outline-none focus:border-indigo-500"
                                            />
                                            <span className="text-gray-400 ml-2">/student/mo</span>
                                        </div>
                                    </div>
                                    
                                    {data.isDemo ? (
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase font-bold">DojoMint™ Protocol Fee</label>
                                            <div className="flex items-center mt-1">
                                                <span className="text-gray-500 flex items-center">
                                                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                                    Standard Rate
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase font-bold">DojoMint™ Protocol Fee</label>
                                            <div className="flex items-center mt-1">
                                                <span className="text-amber-400 font-bold">$1.99</span>
                                                <span className="text-gray-400 ml-1">/student/mo</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">You earn: $7.00 - $1.99 = <span className="text-green-400 font-bold">$5.01</span> per student</p>
                                        </div>
                                    )}
                                    
                                    {totalStudents > 0 && (
                                        <div className="bg-green-900/30 p-4 rounded border border-green-500/30">
                                            <label className="text-xs text-green-300 uppercase font-bold">
                                                {data.isDemo ? `Your Monthly Generation (${totalStudents} students)` : `Your Monthly Profit (${totalStudents} students)`}
                                            </label>
                                            <p className="text-3xl font-extrabold text-green-400 mt-1">${(totalStudents * 5.01).toFixed(2)}</p>
                                            <p className="text-xs text-green-300/70 mt-1">
                                                {data.isDemo ? 'Net Margin: ~72%' : `$7.00 Student Fee - $1.99 Protocol Fee = $5.01 × ${totalStudents}`}
                                            </p>
                                        </div>
                                    )}
                                    
                                    {totalStudents === 0 && (
                                        <div className="bg-green-900/30 p-4 rounded border border-green-500/30">
                                            <label className="text-xs text-green-300 uppercase font-bold">
                                                {data.isDemo ? 'Your Monthly Generation (50 students example)' : 'Example: 50 Students'}
                                            </label>
                                            <p className="text-3xl font-extrabold text-green-400 mt-1">$250.50</p>
                                            <p className="text-xs text-green-300/70 mt-1">
                                                {data.isDemo ? 'Net Margin: ~72%' : '$7.00 Student Fee - $1.99 Protocol Fee = $5.01 × 50'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <button 
                                        onClick={() => onUpdateData({ clubSponsoredPremium: !data.clubSponsoredPremium })}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${data.clubSponsoredPremium ? 'bg-green-500' : 'bg-gray-600'}`}
                                    >
                                        <span className={`${data.clubSponsoredPremium ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                                    </button>
                                    <span className="ml-3 text-sm font-medium text-white">
                                        {data.clubSponsoredPremium ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                                {data.clubSponsoredPremium && (
                                    <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
                                        {data.isDemo ? 'Reseller Mode Active' : 'Gateway Active'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Club Wallet */}
            <div className="mt-8">
                <div className="bg-gradient-to-b from-yellow-900/20 to-gray-800 p-6 rounded-xl border border-yellow-600/30">
                    <div className="flex items-center mb-4">
                        <span className="text-3xl mr-2">💰</span>
                        <div>
                            <h3 className="font-bold text-white text-lg">Club Wallet</h3>
                            <p className="text-sm text-gray-400">{data.isDemo ? 'Your DojoMint™ earnings' : 'Your DojoMint™ payouts'}</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gray-900 p-4 rounded-lg text-center border border-gray-700">
                            <p className="text-xs text-gray-500 uppercase">Available Payout</p>
                            <p className="text-3xl font-bold text-green-400">$0.00</p>
                        </div>
                        
                        <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                            <div className="text-sm text-gray-300 space-y-2">
                                <div className="flex justify-between">
                                    <span>{data.isDemo ? 'Legacy Activations' : 'Active Legacy Holders'}</span>
                                    <span className="font-bold text-white">0</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Your Net Margin</span>
                                    <span className="font-bold text-green-400">~72%</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center">
                            <button 
                                onClick={handleConnectBank}
                                disabled={connectingBank}
                                className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-gray-600 text-white font-bold py-3 rounded text-sm"
                            >
                                {connectingBank ? 'Connecting...' : 'Connect Bank Account'}
                            </button>
                            <p className="text-[10px] text-gray-500 text-center mt-2">Secure payouts via Stripe Connect</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- MAIN COMPONENT ---

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ data, clubId, onBack, onUpdateData, onNavigate, onViewStudentPortal }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'staff' | 'schedule' | 'creator' | 'settings' | 'billing'>('overview');
    
    // Modal State
    const [modalType, setModalType] = useState<string | null>(null);
    
    // Temporary state for forms
    const [tempStudent, setTempStudent] = useState<Partial<Student>>({});
    const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
    const [tempCoach, setTempCoach] = useState<Partial<Coach>>({});
    const [editingCoachId, setEditingCoachId] = useState<string | null>(null);
    const [tempClass, setTempClass] = useState<Partial<ScheduleItem>>({});
    const [tempEvent, setTempEvent] = useState<Partial<CalendarEvent>>({});
    const [tempPrivate, setTempPrivate] = useState<{coachName: string, date: string, time: string, price: number}>({coachName: '', date: '', time: '', price: 50});
    
    // Bulk Import State
    const [studentImportMethod, setStudentImportMethod] = useState<'single' | 'bulk' | 'excel'>('single');
    const [bulkStudentData, setBulkStudentData] = useState('');
    const [parsedBulkStudents, setParsedBulkStudents] = useState<Student[]>([]);
    const [bulkError, setBulkError] = useState('');
    const [bulkLocation, setBulkLocation] = useState(data.branchNames?.[0] || 'Main Location');
    const [bulkClass, setBulkClass] = useState('');
    const excelFileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState('');

    const handleExcelUpload = (file: File) => {
        setUploadedFileName(file.name);
        setBulkError('');
        
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        
        if (isExcel) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
                    
                    // Convert to CSV format for parsing
                    const csvText = jsonData.map(row => row.join(',')).join('\n');
                    setBulkStudentData(csvText);
                    parseExcelStudents(jsonData);
                } catch (err) {
                    setBulkError('Failed to parse Excel file. Please check the format.');
                }
            };
            reader.readAsBinaryString(file);
        } else {
            // CSV file
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                setBulkStudentData(text);
                parseBulkStudents(text);
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
                totalPoints: (parseInt(cols[5]) || 0) * (belt ? 64 : 0),
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

    const confirmBulkImport = async () => {
        const validStudents = parsedBulkStudents.filter(s => s.beltId !== 'INVALID_BELT');
        
        // Save each student to database and get proper UUIDs
        const studentsWithDbIds: Student[] = [];
        
        for (const student of validStudents) {
            if (clubId) {
                try {
                    const belt = data.belts.find(b => b.id === student.beltId);
                    const response = await fetch('/api/students', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clubId,
                            name: student.name,
                            parentEmail: student.parentEmail || null,
                            parentName: student.parentName,
                            parentPhone: student.parentPhone,
                            belt: belt?.name || 'White',
                            birthdate: student.birthday
                        })
                    });
                    const result = await response.json();
                    if (response.ok && result.student?.id) {
                        // Use database-generated UUID
                        studentsWithDbIds.push({ ...student, id: result.student.id });
                        console.log('[AdminDashboard] Bulk import: Student saved with database ID:', result.student.id);
                    } else {
                        // Fallback to local ID if API fails
                        studentsWithDbIds.push(student);
                        console.error('[AdminDashboard] Bulk import: Failed to save student:', student.name);
                    }
                } catch (error) {
                    // Fallback to local ID on error
                    studentsWithDbIds.push(student);
                    console.error('[AdminDashboard] Bulk import: API error for student:', student.name, error);
                }
            } else {
                // No clubId, use local ID
                studentsWithDbIds.push(student);
            }
        }
        
        onUpdateData({ students: [...data.students, ...studentsWithDbIds] });
        setParsedBulkStudents([]);
        setBulkStudentData('');
        setModalType(null);
    };

    const handleAddStudent = async () => {
        const totalStudents = data.students.length;
        const currentTier = PRICING_TIERS.find(t => totalStudents < t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
        
        if(totalStudents >= currentTier.limit && currentTier.limit !== Infinity) {
            alert(`Tier Limit Reached! Please upgrade to the ${PRICING_TIERS.find(t => t.limit > currentTier.limit)?.name} plan to add more students.`);
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
                        location: tempStudent.location || data.branchNames?.[0] || 'Main Location',
                        assignedClass: tempStudent.assignedClass || 'General'
                    })
                });
                const result = await response.json();
                if (response.ok && result.student?.id) {
                    // CRITICAL: Use the database-generated UUID
                    databaseStudentId = result.student.id;
                    console.log('[AdminDashboard] Student added successfully with database ID:', databaseStudentId);
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
        
        onUpdateData({ students: [...data.students, newStudent] });
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

    const handleAddClass = () => {
        if(!tempClass.className || !tempClass.day || !tempClass.time) return;
        const location = tempClass.location || data.branchNames?.[0] || 'Main Location';
        const newClass: ScheduleItem = {
            id: `sched-${Date.now()}`,
            day: tempClass.day,
            time: tempClass.time,
            className: tempClass.className,
            instructor: tempClass.instructor || data.ownerName,
            location,
            beltRequirement: tempClass.beltRequirement || 'All'
        };
        
        // Also add to locationClasses for dropdown population
        const updatedLocationClasses = { ...(data.locationClasses || {}) };
        if (!updatedLocationClasses[location]) {
            updatedLocationClasses[location] = [];
        }
        if (!updatedLocationClasses[location].includes(tempClass.className)) {
            updatedLocationClasses[location] = [...updatedLocationClasses[location], tempClass.className];
        }
        
        // Also add to general classes list
        const updatedClasses = [...(data.classes || [])];
        if (!updatedClasses.includes(tempClass.className)) {
            updatedClasses.push(tempClass.className);
        }
        
        onUpdateData({ 
            schedule: [...(data.schedule || []), newClass],
            locationClasses: updatedLocationClasses,
            classes: updatedClasses
        });
        setModalType(null);
        setTempClass({});
    };

    const handleAddEvent = () => {
        if(!tempEvent.title || !tempEvent.date) return;
        const newEvent: CalendarEvent = {
            id: `evt-${Date.now()}`,
            title: tempEvent.title,
            date: tempEvent.date,
            time: tempEvent.time || '10:00',
            location: tempEvent.location || 'Dojang',
            type: tempEvent.type || 'social',
            description: ''
        };
        onUpdateData({ events: [...(data.events || []), newEvent] });
        setModalType(null);
        setTempEvent({});
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
            {/* SIDEBAR */}
            <div className="w-64 bg-gray-800 border-r border-gray-700 hidden md:flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                        {data.logo ? (
                            <img 
                                src={typeof data.logo === 'string' ? data.logo : (data.logo instanceof Blob ? URL.createObjectURL(data.logo) : '')} 
                                alt="Club Logo" 
                                className="w-12 h-12 rounded-lg object-cover border border-gray-600"
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
                    <SidebarItem icon="📊" label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    <SidebarItem icon="👥" label="Students" active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
                    <SidebarItem icon="🥋" label="Staff" active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} />
                    <SidebarItem icon="📅" label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
                    <SidebarItem icon="🎥" label="Creator Hub" active={activeTab === 'creator'} onClick={() => setActiveTab('creator')} />
                    <div className="pt-4 pb-2 px-4 text-xs font-bold text-gray-500 uppercase">Configuration</div>
                    <SidebarItem icon="⚙️" label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                    <SidebarItem icon="💳" label="Billing" active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} />
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

                <div className="p-6 md:p-12 max-w-7xl mx-auto">
                    {data.isDemo && (
                        <div className="mb-4 bg-gradient-to-r from-amber-600/90 to-orange-600/90 text-white py-2 px-4 rounded-lg shadow-lg text-center font-bold text-sm flex items-center justify-center gap-2">
                            <span className="text-lg">🎮</span> DEMO MODE - Sample data for demonstration purposes
                        </div>
                    )}
                    {activeTab === 'overview' && <OverviewTab data={data} onNavigate={onNavigate} onOpenModal={setModalType} />}
                    {activeTab === 'students' && <StudentsTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} onViewPortal={onViewStudentPortal} onEditStudent={(s) => { setEditingStudentId(s.id); setTempStudent(s); setModalType('editStudent'); }} />}
                    {activeTab === 'staff' && <StaffTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} onEditCoach={(c) => { setEditingCoachId(c.id); setTempCoach(c); setModalType('editCoach'); }} />}
                    {activeTab === 'schedule' && <ScheduleTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} />}
                    {activeTab === 'creator' && <CreatorHubTab data={data} onUpdateData={onUpdateData} clubId={clubId} />}
                    {activeTab === 'settings' && <SettingsTab data={data} onUpdateData={onUpdateData} clubId={clubId} />}
                    {activeTab === 'billing' && <BillingTab data={data} onUpdateData={onUpdateData} clubId={clubId} />}
                </div>
            </div>

            {/* MODALS */}
            {modalType === 'student' && (
                <Modal title="Add Students" onClose={() => setModalType(null)}>
                    <div className="flex bg-gray-700/50 rounded p-1 w-fit mb-4">
                        <button onClick={() => setStudentImportMethod('single')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'single' ? 'bg-sky-500 text-white' : 'text-gray-400'}`}>Single</button>
                        <button onClick={() => setStudentImportMethod('bulk')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'bulk' ? 'bg-sky-500 text-white' : 'text-gray-400'}`}>Paste CSV</button>
                        <button onClick={() => setStudentImportMethod('excel')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'excel' ? 'bg-sky-500 text-white' : 'text-gray-400'}`}>Excel Upload</button>
                    </div>

                    {studentImportMethod === 'single' ? (
                        <div className="space-y-4">
                            <input type="text" placeholder="Full Name" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, name: e.target.value})} />
                            <div className="grid grid-cols-2 gap-4">
                                <select className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, beltId: e.target.value})}>
                                    <option value="">Select Belt</option>
                                    {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                <input type="number" placeholder="Stripes" className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, stripes: parseInt(e.target.value)})} />
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
                                    <option value="">Select Class</option>
                                    {(() => {
                                        const loc = tempStudent.location || data.branchNames?.[0] || '';
                                        const classes = data.locationClasses?.[loc] || data.classes || [];
                                        return classes.map(c => <option key={c} value={c}>{c}</option>);
                                    })()}
                                </select>
                            </div>
                            <div className="border-t border-gray-600 pt-4">
                                <p className="text-xs text-gray-400 mb-2 uppercase font-bold">Parent Info</p>
                                <input type="text" placeholder="Parent Name" className="w-full bg-gray-700 rounded p-2 text-white mb-2" onChange={e => setTempStudent({...tempStudent, parentName: e.target.value})} />
                                <input type="email" placeholder="Parent Email" className="w-full bg-gray-700 rounded p-2 text-white mb-2" onChange={e => setTempStudent({...tempStudent, parentEmail: e.target.value})} />
                                <input type="password" placeholder="Parent Password (for login)" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, parentPassword: e.target.value})} />
                            </div>
                            {data.clubSponsoredPremium && (
                                <p className="text-xs text-indigo-300 bg-indigo-900/20 p-2 rounded">
                                    Adds $1.99/mo to your bill (Sponsored Premium active).
                                </p>
                            )}
                            <button onClick={handleAddStudent} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded">Add Student</button>
                        </div>
                    ) : studentImportMethod === 'bulk' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Default Location</label>
                                    <select value={bulkLocation} onChange={e => setBulkLocation(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Default Class</label>
                                    <select value={bulkClass} onChange={e => setBulkClass(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        <option value="">Auto-assign</option>
                                        {(data.locationClasses?.[bulkLocation] || data.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                <p className="text-xs text-gray-400"><span className="font-bold">Format:</span> Name, Age, Birthday, Gender, Belt, Stripes, Parent, Email, Phone</p>
                            </div>
                            <textarea value={bulkStudentData} onChange={e => { setBulkStudentData(e.target.value); setParsedBulkStudents([]); }} placeholder="Paste CSV data here..." className="w-full h-24 bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm font-mono" />
                            <button onClick={() => parseBulkStudents(bulkStudentData)} disabled={!bulkStudentData.trim()} className="w-full bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-bold py-2 rounded">Parse Data</button>
                            {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}
                            {parsedBulkStudents.length > 0 && (
                                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2">
                                    <p className="text-xs text-gray-400 mb-2 font-bold">Preview ({parsedBulkStudents.length}):</p>
                                    {parsedBulkStudents.map((s, i) => (
                                        <div key={i} className="text-xs text-gray-300 py-1 border-t border-gray-800">
                                            {s.name} - {data.belts.find(b => b.id === s.beltId)?.name || '?'}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={confirmBulkImport} disabled={parsedBulkStudents.length === 0} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded">Import {parsedBulkStudents.length} Students</button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Default Location</label>
                                    <select value={bulkLocation} onChange={e => setBulkLocation(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1">Default Class</label>
                                    <select value={bulkClass} onChange={e => setBulkClass(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                        <option value="">Auto-assign</option>
                                        {(data.locationClasses?.[bulkLocation] || data.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
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
                                        {uploadedFileName || 'Click or drag Excel/CSV file'}
                                    </p>
                                    <p className="text-xs text-gray-500">Supports .xlsx, .xls, .csv</p>
                                </div>
                            </div>

                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                <p className="text-xs text-gray-400 font-bold mb-1">Required Column Order:</p>
                                <p className="text-xs text-gray-500">Name | Age | Birthday | Gender | Belt | Stripes | Parent Name | Email | Phone</p>
                            </div>

                            {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}
                            
                            {parsedBulkStudents.length > 0 && (
                                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2">
                                    <p className="text-xs text-gray-400 mb-2 font-bold">Preview ({parsedBulkStudents.length} students):</p>
                                    {parsedBulkStudents.map((s, i) => (
                                        <div key={i} className="text-xs text-gray-300 py-1 border-t border-gray-800 flex justify-between">
                                            <span>{s.name}</span>
                                            <span className="text-gray-500">{data.belts.find(b => b.id === s.beltId)?.name || 'White Belt'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <button 
                                onClick={confirmBulkImport} 
                                disabled={parsedBulkStudents.length === 0} 
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded"
                            >
                                Import {parsedBulkStudents.length} Students
                            </button>
                        </div>
                    )}
                </Modal>
            )}

            {modalType === 'editStudent' && editingStudentId && (
                <Modal title="Edit Student" onClose={() => { setModalType(null); setEditingStudentId(null); setTempStudent({}); }}>
                    <div className="space-y-4">
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
                                        const classes = loc ? (data.locationClasses?.[loc] || []) : (data.classes || []);
                                        return classes.map(c => <option key={c} value={c}>{c}</option>);
                                    })()}
                                </select>
                            </div>
                        </div>
                        <div className="border-t border-gray-600 pt-4">
                            <p className="text-xs text-gray-400 mb-2 uppercase font-bold">Parent Info</p>
                            <input 
                                type="text" 
                                placeholder="Parent Name" 
                                value={tempStudent.parentName || ''} 
                                className="w-full bg-gray-700 rounded p-2 text-white mb-2" 
                                onChange={e => setTempStudent({...tempStudent, parentName: e.target.value})} 
                            />
                            <input 
                                type="email" 
                                placeholder="Parent Email" 
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
                            Save Changes
                        </button>
                    </div>
                </Modal>
            )}

            {modalType === 'coach' && (
                <Modal title="Add New Coach" onClose={() => setModalType(null)}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Coach Name" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, name: e.target.value})} />
                        <input type="email" placeholder="Email Address" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, email: e.target.value})} />
                        <input type="password" placeholder="Temp Password" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempCoach({...tempCoach, password: e.target.value})} />
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
                <Modal title="Edit Coach" onClose={() => { setModalType(null); setEditingCoachId(null); setTempCoach({}); }}>
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
                            Save Changes
                        </button>
                    </div>
                </Modal>
            )}

            {modalType === 'class' && (
                <Modal title="Add Weekly Class" onClose={() => setModalType(null)}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Class Name (e.g. Tiny Tigers)" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, className: e.target.value})} />
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
                        <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempClass({...tempClass, beltRequirement: e.target.value})}>
                            <option value="All">All Belts</option>
                            {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <button onClick={handleAddClass} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">Save to Schedule</button>
                    </div>
                </Modal>
            )}

            {modalType === 'event' && (
                <Modal title="Add Club Event" onClose={() => setModalType(null)}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Event Title" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempEvent({...tempEvent, title: e.target.value})} />
                        <div className="grid grid-cols-2 gap-4">
                            <input type="date" className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempEvent({...tempEvent, date: e.target.value})} />
                            <input type="time" className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempEvent({...tempEvent, time: e.target.value})} />
                        </div>
                        <select className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempEvent({...tempEvent, type: e.target.value as any})}>
                            <option value="social">Social Event</option>
                            <option value="test">Belt Test</option>
                            <option value="competition">Competition</option>
                            <option value="seminar">Seminar</option>
                        </select>
                        <input type="text" placeholder="Location" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempEvent({...tempEvent, location: e.target.value})} />
                        <button onClick={handleAddEvent} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded">Save Event</button>
                    </div>
                </Modal>
            )}

            {modalType === 'private' && (
                <Modal title="Add Private Lesson Slot" onClose={() => setModalType(null)}>
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
        </div>
    );
};
