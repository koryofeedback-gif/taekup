
import React, { useState, useMemo, useRef } from 'react';
import type { WizardData, Student, Coach, Belt, CalendarEvent, ScheduleItem, CurriculumItem } from '../types';
import { generateParentingAdvice } from '../services/geminiService';

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
    { name: 'Starter', limit: 25, price: 24.99 }, // Kicksite is $49
    { name: 'Standard', limit: 75, price: 59.00 }, // Kicksite is $99 (for 50)
    { name: 'Growth', limit: 150, price: 129.00 }, // Kicksite is $199 (for 101+)
    { name: 'Empire', limit: Infinity, price: 199.00 }, // Kicksite requires demo/custom
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
    const currentTier = PRICING_TIERS.find(t => totalStudents <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
    
    // Revenue Simulator State
    const [adoptionRate, setAdoptionRate] = useState(40);
    const revenue = useMemo(() => {
        const subscribers = Math.ceil(totalStudents * (adoptionRate / 100));
        const gross = subscribers * 4.99;
        const net = gross * 0.70; // 70% to club
        const profit = net - currentTier.price;
        return { subscribers, net, profit };
    }, [totalStudents, adoptionRate, currentTier]);

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard label="Total Students" value={totalStudents} subtext={`${currentTier.limit === Infinity ? 'Unlimited' : currentTier.limit - totalStudents + ' spots left'} in ${currentTier.name}`} icon="🥋" color="blue" />
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
                            <h3 className="text-xl font-bold text-white flex items-center"><span className="mr-2">💸</span> Profit Engine Simulator</h3>
                            <p className="text-gray-400 text-sm">See how Premium Subscriptions offset your software costs.</p>
                        </div>
                        <div className="bg-gray-900 px-4 py-2 rounded-lg border border-gray-700">
                            <span className="text-xs text-gray-500 uppercase block">Current Plan Cost</span>
                            <span className="text-red-400 font-mono font-bold">-${currentTier.price}/mo</span>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-10">
                        <div>
                            <label className="block text-sm text-gray-300 mb-4">
                                If <span className="text-sky-300 font-bold text-lg">{adoptionRate}%</span> of your students subscribe to Premium...
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
                        </div>

                        <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700 text-center relative overflow-hidden">
                            {revenue.profit > 0 && (
                                <div className="absolute top-0 right-0 bg-green-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg shadow-lg">
                                    SOFTWARE IS FREE
                                </div>
                            )}
                            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Your Net Monthly Profit</p>
                            <p className={`text-4xl font-extrabold ${revenue.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {revenue.profit >= 0 ? '+' : '-'}${Math.abs(revenue.profit).toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                                ({revenue.subscribers} parents × $3.50 commission) - ${currentTier.price} cost
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const StudentsTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void, onViewPortal?: (id: string) => void }> = ({ data, onUpdateData, onOpenModal, onViewPortal }) => {
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

    const handleDelete = (id: string) => {
        if(confirm('Are you sure? This cannot be undone.')) {
            onUpdateData({ students: data.students.filter(s => s.id !== id) });
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
                                <td className="px-6 py-4">{new Date(s.joinDate).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right space-x-3">
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

const StaffTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void, onOpenModal: (type: string) => void }> = ({ data, onUpdateData, onOpenModal }) => {
    const handleDelete = (id: string) => {
        if(confirm('Remove this coach? They will lose access immediately.')) {
            onUpdateData({ coaches: data.coaches.filter(c => c.id !== id) });
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
                                <td className="px-6 py-4">{c.location}</td>
                                <td className="px-6 py-4 text-xs">{c.assignedClasses?.join(', ') || 'None'}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-300 font-bold text-xs">Remove</button>
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

const SettingsTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void }> = ({ data, onUpdateData }) => {
    const [activeSubTab, setActiveSubTab] = useState<'general' | 'belts' | 'locations'>('general');

    return (
        <div>
            <SectionHeader title="System Settings" description="Configure your club rules, branding, and structure." />
            
            {/* Sub-Nav */}
            <div className="flex space-x-4 border-b border-gray-700 mb-6">
                {['general', 'belts', 'locations'].map(tab => (
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
                    
                    {/* Holiday Schedule Setting - Improves Black Belt Time Machine accuracy */}
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <label className="block text-sm text-gray-400 mb-1">Holiday Schedule</label>
                        <p className="text-xs text-gray-500 mb-3">This affects the accuracy of the Black Belt Time Machine prediction for parents.</p>
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
                </div>
            )}

            {activeSubTab === 'belts' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="font-bold text-white mb-4">Edit Belt Ranks</h3>
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
        </div>
    );
}

const CreatorHubTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void }> = ({ data, onUpdateData }) => {
    const [newVideo, setNewVideo] = useState({ title: '', url: '', beltId: data.belts[0]?.id || '' });

    const handleAddVideo = () => {
        if(!newVideo.title || !newVideo.url) return;
        const item: CurriculumItem = {
            id: `vid-${Date.now()}`,
            title: newVideo.title,
            url: newVideo.url,
            beltId: newVideo.beltId,
            description: 'Uploaded by Instructor',
            authorName: data.ownerName
        };
        onUpdateData({ curriculum: [...(data.curriculum || []), item] });
        setNewVideo({ title: '', url: '', beltId: data.belts[0]?.id || '' });
    };

    return (
        <div>
            <SectionHeader title="Creator Hub" description="Upload curriculum videos and manage your passive income." />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Upload */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h3 className="font-bold text-white mb-4">Upload New Video</h3>
                        <div className="space-y-4">
                            <input 
                                type="text" 
                                placeholder="Video Title (e.g. Yellow Belt Pattern)" 
                                value={newVideo.title} 
                                onChange={e => setNewVideo({...newVideo, title: e.target.value})}
                                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                            />
                            <input 
                                type="text" 
                                placeholder="Video Link (YouTube / Vimeo)" 
                                value={newVideo.url} 
                                onChange={e => setNewVideo({...newVideo, url: e.target.value})}
                                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                            />
                            <select 
                                value={newVideo.beltId} 
                                onChange={e => setNewVideo({...newVideo, beltId: e.target.value})}
                                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                            >
                                {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <button onClick={handleAddVideo} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">
                                📤 Publish to App
                            </button>
                        </div>
                    </div>

                    {/* Library */}
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h3 className="font-bold text-white mb-4">Video Library</h3>
                        <div className="space-y-2">
                            {(data.curriculum || []).length === 0 && <p className="text-gray-500 italic">No videos uploaded yet.</p>}
                            {(data.curriculum || []).map(vid => (
                                <div key={vid.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded border border-gray-700">
                                    <div>
                                        <p className="font-bold text-white text-sm">{vid.title}</p>
                                        <p className="text-xs text-gray-500">{data.belts.find(b => b.id === vid.beltId)?.name}</p>
                                    </div>
                                    <button onClick={() => onUpdateData({ curriculum: data.curriculum.filter(c => c.id !== vid.id) })} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Wallet */}
                <div>
                    <div className="bg-gradient-to-b from-yellow-900/20 to-gray-800 p-6 rounded-xl border border-yellow-600/30 sticky top-6">
                        <div className="flex items-center mb-4">
                            <span className="text-3xl mr-2">💰</span>
                            <h3 className="font-bold text-white text-lg">Club Wallet</h3>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="bg-gray-900 p-4 rounded-lg text-center border border-gray-700">
                                <p className="text-xs text-gray-500 uppercase">Available Payout</p>
                                <p className="text-3xl font-bold text-green-400">$0.00</p>
                            </div>
                            
                            <div className="text-sm text-gray-300 space-y-2 border-t border-gray-700 pt-4">
                                <div className="flex justify-between">
                                    <span>Active Subscribers</span>
                                    <span className="font-bold text-white">0</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Commission Rate</span>
                                    <span className="font-bold text-green-400">70%</span>
                                </div>
                            </div>

                            <button className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded text-sm">
                                Connect Bank Account
                            </button>
                            <p className="text-[10px] text-gray-500 text-center">Secure payouts via Stripe Connect</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const BillingTab: React.FC<{ data: WizardData, onUpdateData: (d: Partial<WizardData>) => void }> = ({ data, onUpdateData }) => {
    const totalStudents = data.students.length;
    const currentTier = PRICING_TIERS.find(t => totalStudents <= t.limit) || PRICING_TIERS[PRICING_TIERS.length - 1];
    
    const bulkCost = data.clubSponsoredPremium ? (totalStudents * 1.99) : 0;
    const totalBill = currentTier.price + bulkCost;

    return (
        <div>
            <SectionHeader title="Billing & Subscription" description="Manage your TaekUp plan and features." />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Current Plan Card */}
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm text-gray-400 uppercase">Current Plan</p>
                            <h3 className="text-2xl font-bold text-white">{currentTier.name}</h3>
                        </div>
                        <span className="bg-blue-900 text-blue-200 px-3 py-1 rounded-full text-xs font-bold">Active</span>
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
                                    <span className="text-indigo-300">Club-Sponsored Premium</span>
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

                {/* Sponsored Premium Toggle */}
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-6 rounded-lg border border-indigo-500/30">
                    <div className="flex items-start space-x-4">
                        <div className="bg-indigo-600 p-3 rounded-lg text-2xl">💎</div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-1">Club-Sponsored Premium</h3>
                            <p className="text-sm text-gray-300 mb-4">
                                Give ALL your parents the full Premium experience (Videos, Analytics, Journey) for free.
                            </p>
                            
                            <div className="bg-indigo-950/50 p-3 rounded border border-indigo-500/30 mb-4 text-sm text-indigo-200">
                                <p className="font-bold mb-1">✨ The Benefit:</p>
                                Higher retention, happier parents, and you look like a hero.
                                <br/><br/>
                                <p className="font-bold mb-1">💰 The Cost:</p>
                                We charge you a bulk rate of <span className="text-white font-bold">$1.99 / student</span> (instead of parents paying $4.99).
                            </div>

                            <div className="flex items-center">
                                <button 
                                    onClick={() => onUpdateData({ clubSponsoredPremium: !data.clubSponsoredPremium })}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${data.clubSponsoredPremium ? 'bg-indigo-500' : 'bg-gray-600'}`}
                                >
                                    <span className={`${data.clubSponsoredPremium ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                                </button>
                                <span className="ml-3 text-sm font-medium text-white">
                                    {data.clubSponsoredPremium ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
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
    const [tempCoach, setTempCoach] = useState<Partial<Coach>>({});
    const [tempClass, setTempClass] = useState<Partial<ScheduleItem>>({});
    const [tempEvent, setTempEvent] = useState<Partial<CalendarEvent>>({});
    
    // Bulk Import State
    const [studentImportMethod, setStudentImportMethod] = useState<'single' | 'bulk'>('single');
    const [bulkStudentData, setBulkStudentData] = useState('');
    const [parsedBulkStudents, setParsedBulkStudents] = useState<Student[]>([]);
    const [bulkError, setBulkError] = useState('');
    const [bulkLocation, setBulkLocation] = useState(data.branchNames?.[0] || 'Main Location');
    const [bulkClass, setBulkClass] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setBulkStudentData(text);
            parseBulkStudents(text);
        };
        reader.readAsText(file);
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

    const confirmBulkImport = () => {
        const validStudents = parsedBulkStudents.filter(s => s.beltId !== 'INVALID_BELT');
        onUpdateData({ students: [...data.students, ...validStudents] });
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
        
        if (clubId && tempStudent.parentEmail) {
            try {
                console.log('[AdminDashboard] Sending students API request...');
                const response = await fetch('/api/students', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clubId,
                        name: tempStudent.name,
                        parentEmail: tempStudent.parentEmail,
                        parentName: tempStudent.parentName,
                        parentPhone: tempStudent.parentPhone,
                        belt: belt?.name || 'White',
                        birthdate: tempStudent.birthday
                    })
                });
                const result = await response.json();
                if (response.ok) {
                    console.log('[AdminDashboard] Student added successfully:', result);
                    alert(`Welcome email sent to parent at ${tempStudent.parentEmail}!`);
                } else {
                    console.error('[AdminDashboard] Student API error:', result);
                    alert(`Failed to send welcome email: ${result.error || 'Unknown error'}. Student added locally.`);
                }
            } catch (error) {
                console.error('[AdminDashboard] API call failed, continuing with local update:', error);
                alert('Failed to send welcome email. Student added locally.');
            }
        } else if (!clubId && tempStudent.parentEmail) {
            console.warn('[AdminDashboard] No clubId available - skipping API call');
            alert('Unable to send welcome email. Please log out and log back in to enable email notifications.');
        }

        const newStudent: Student = {
            id: `student-${Date.now()}`,
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
        const newClass: ScheduleItem = {
            id: `sched-${Date.now()}`,
            day: tempClass.day,
            time: tempClass.time,
            className: tempClass.className,
            instructor: tempClass.instructor || data.ownerName,
            location: tempClass.location || data.branchNames?.[0] || 'Main Location',
            beltRequirement: tempClass.beltRequirement || 'All'
        };
        onUpdateData({ schedule: [...(data.schedule || []), newClass] });
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

    return (
        <div className="min-h-screen bg-gray-900 flex">
            {/* SIDEBAR */}
            <div className="w-64 bg-gray-800 border-r border-gray-700 hidden md:flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-xl font-black text-white tracking-tight">TAEKUP <span className="text-sky-400 text-xs align-top">ADMIN</span></h2>
                    <p className="text-gray-500 text-xs mt-1 truncate">{data.clubName}</p>
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
                    {activeTab === 'overview' && <OverviewTab data={data} onNavigate={onNavigate} onOpenModal={setModalType} />}
                    {activeTab === 'students' && <StudentsTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} onViewPortal={onViewStudentPortal} />}
                    {activeTab === 'staff' && <StaffTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} />}
                    {activeTab === 'schedule' && <ScheduleTab data={data} onUpdateData={onUpdateData} onOpenModal={setModalType} />}
                    {activeTab === 'creator' && <CreatorHubTab data={data} onUpdateData={onUpdateData} />}
                    {activeTab === 'settings' && <SettingsTab data={data} onUpdateData={onUpdateData} />}
                    {activeTab === 'billing' && <BillingTab data={data} onUpdateData={onUpdateData} />}
                </div>
            </div>

            {/* MODALS */}
            {modalType === 'student' && (
                <Modal title="Add Students" onClose={() => setModalType(null)}>
                    <div className="flex bg-gray-700/50 rounded p-1 w-fit mb-4">
                        <button onClick={() => setStudentImportMethod('single')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'single' ? 'bg-sky-500 text-white' : 'text-gray-400'}`}>Single</button>
                        <button onClick={() => setStudentImportMethod('bulk')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'bulk' ? 'bg-sky-500 text-white' : 'text-gray-400'}`}>Bulk Import</button>
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
                                <select className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, location: e.target.value})}>
                                    {data.branchNames?.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <select className="bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, assignedClass: e.target.value})}>
                                    <option value="">Select Class</option>
                                    {((tempStudent.location ? data.locationClasses?.[tempStudent.location] : []) || data.classes || []).map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="border-t border-gray-600 pt-4">
                                <p className="text-xs text-gray-400 mb-2 uppercase font-bold">Parent Info</p>
                                <input type="text" placeholder="Parent Name" className="w-full bg-gray-700 rounded p-2 text-white mb-2" onChange={e => setTempStudent({...tempStudent, parentName: e.target.value})} />
                                <input type="email" placeholder="Parent Email" className="w-full bg-gray-700 rounded p-2 text-white" onChange={e => setTempStudent({...tempStudent, parentEmail: e.target.value})} />
                            </div>
                            {data.clubSponsoredPremium && (
                                <p className="text-xs text-indigo-300 bg-indigo-900/20 p-2 rounded">
                                    💰 Adds $1.99/mo to your bill (Sponsored Premium active).
                                </p>
                            )}
                            <button onClick={handleAddStudent} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded">Add Student</button>
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
                                            {s.name} - {data.belts.find(b => b.id === s.beltId)?.name || '❌'}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button onClick={confirmBulkImport} disabled={parsedBulkStudents.length === 0} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded">Import {parsedBulkStudents.length} Students</button>
                        </div>
                    )}
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
        </div>
    );
};
