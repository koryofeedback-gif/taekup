import React, { useState, useEffect } from 'react';
import { Trophy, Users, Globe2, Filter, ChevronUp, ChevronDown, Minus, Building2, Medal, TrendingUp, Award, Loader2, Sparkles, Star, Flame, Crown } from 'lucide-react';

interface StudentRanking {
  rank: number;
  id: string;
  name: string;
  belt: string;
  globalXp: number;
  previousRank: number | null;
  clubName: string;
  sport: string;
  country: string;
  city: string;
  rankChange: number | null;
}

interface ClubRanking {
  rank: number;
  id: string;
  name: string;
  sport: string;
  country: string;
  city: string;
  studentCount: number;
  totalGlobalXp: number;
  avgGlobalXp: number;
  globalScore: number;
}

interface RankingsStats {
  participatingClubs: number;
  totalStudents: number;
  sportsRepresented: number;
  countriesRepresented: number;
}

interface WorldRankingsProps {
  clubId?: string;
  isAdmin?: boolean;
}

const BELT_COLORS: Record<string, { bg: string; text: string; border?: string }> = {
  'white': { bg: 'bg-white', text: 'text-gray-800', border: 'border border-gray-300' },
  'yellow': { bg: 'bg-gradient-to-r from-yellow-300 to-yellow-400', text: 'text-yellow-900' },
  'orange': { bg: 'bg-gradient-to-r from-orange-400 to-orange-500', text: 'text-white' },
  'green': { bg: 'bg-gradient-to-r from-green-500 to-green-600', text: 'text-white' },
  'blue': { bg: 'bg-gradient-to-r from-blue-500 to-blue-600', text: 'text-white' },
  'purple': { bg: 'bg-gradient-to-r from-purple-500 to-purple-600', text: 'text-white' },
  'brown': { bg: 'bg-gradient-to-r from-amber-700 to-amber-800', text: 'text-white' },
  'red': { bg: 'bg-gradient-to-r from-red-500 to-red-600', text: 'text-white' },
  'black': { bg: 'bg-gradient-to-r from-gray-800 to-gray-900', text: 'text-white' },
  'poom': { bg: 'bg-gradient-to-r from-red-500 via-red-600 to-gray-900', text: 'text-white' },
};

const SPORT_ICONS: Record<string, string> = {
  'Taekwondo': '🥋',
  'Karate': '🥋',
  'BJJ': '🤼',
  'Judo': '🥋',
  'Hapkido': '🥋',
  'Aikido': '🥋',
  'Kung Fu': '🐉',
  'Krav Maga': '🥊',
  'MMA': '🥊',
};

const COUNTRY_CODES: Record<string, string> = {
  'United States': 'us',
  'USA': 'us',
  'US': 'us',
  'Iran': 'ir',
  'IR': 'ir',
  'Iran (Islamic Republic of)': 'ir',
  'South Korea': 'kr',
  'Korea': 'kr',
  'Japan': 'jp',
  'China': 'cn',
  'Brazil': 'br',
  'Germany': 'de',
  'France': 'fr',
  'United Kingdom': 'gb',
  'UK': 'gb',
  'Spain': 'es',
  'Italy': 'it',
  'Canada': 'ca',
  'Australia': 'au',
  'Mexico': 'mx',
  'Russia': 'ru',
  'Turkey': 'tr',
  'India': 'in',
  'Netherlands': 'nl',
  'Belgium': 'be',
  'Sweden': 'se',
  'Norway': 'no',
  'Denmark': 'dk',
  'Finland': 'fi',
  'Poland': 'pl',
  'Austria': 'at',
  'Switzerland': 'ch',
  'Portugal': 'pt',
  'Greece': 'gr',
  'Argentina': 'ar',
  'Colombia': 'co',
  'Chile': 'cl',
  'Peru': 'pe',
  'Venezuela': 've',
  'Egypt': 'eg',
  'South Africa': 'za',
  'Morocco': 'ma',
  'Nigeria': 'ng',
  'Saudi Arabia': 'sa',
  'UAE': 'ae',
  'United Arab Emirates': 'ae',
  'Israel': 'il',
  'Thailand': 'th',
  'Vietnam': 'vn',
  'Philippines': 'ph',
  'Indonesia': 'id',
  'Malaysia': 'my',
  'Singapore': 'sg',
  'New Zealand': 'nz',
  'Ireland': 'ie',
  'Czech Republic': 'cz',
  'Romania': 'ro',
  'Hungary': 'hu',
  'Ukraine': 'ua',
  'Pakistan': 'pk',
  'Bangladesh': 'bd',
  'Taiwan': 'tw',
  'Hong Kong': 'hk',
};

const getCountryCode = (country: string): string => {
  if (!country) return '';
  const trimmed = country.trim();
  return COUNTRY_CODES[trimmed] || COUNTRY_CODES[trimmed.toUpperCase()] || trimmed.toLowerCase().substring(0, 2);
};

const CountryFlag: React.FC<{ country: string; size?: number }> = ({ country, size = 24 }) => {
  const code = getCountryCode(country);
  if (!code) return <span className="text-lg">🌍</span>;
  return (
    <img 
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={country}
      className="inline-block rounded shadow-sm"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};

const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name: string): string => {
  const colors = [
    'from-cyan-500 to-blue-600',
    'from-purple-500 to-pink-600',
    'from-green-500 to-emerald-600',
    'from-orange-500 to-red-600',
    'from-indigo-500 to-purple-600',
    'from-teal-500 to-cyan-600',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

export const WorldRankings: React.FC<WorldRankingsProps> = ({ clubId, isAdmin = false }) => {
  const [category, setCategory] = useState<'students' | 'clubs'>('students');
  const [sport, setSport] = useState<string>('all');
  const [country, setCountry] = useState<string>('all');
  const [studentRankings, setStudentRankings] = useState<StudentRanking[]>([]);
  const [clubRankings, setClubRankings] = useState<ClubRanking[]>([]);
  const [stats, setStats] = useState<RankingsStats | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [sportsRes, countriesRes, statsRes] = await Promise.all([
          fetch('/api/world-rankings/sports'),
          fetch('/api/world-rankings/countries'),
          fetch('/api/world-rankings/stats')
        ]);
        
        const sportsData = await sportsRes.json();
        const countriesData = await countriesRes.json();
        const statsData = await statsRes.json();
        
        setSports(sportsData.sports || []);
        setCountries(countriesData.countries || []);
        if (statsData && typeof statsData.totalStudents === 'number') {
          setStats(statsData);
        } else {
          setStats({ participatingClubs: 0, totalStudents: 0, sportsRepresented: 0, countriesRepresented: 0 });
        }
      } catch (err) {
        console.error('Failed to fetch filters:', err);
        setStats({ participatingClubs: 0, totalStudents: 0, sportsRepresented: 0, countriesRepresented: 0 });
      }
    };
    fetchFilters();
  }, []);

  useEffect(() => {
    const fetchRankings = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams({
          category,
          sport,
          country,
          limit: '100'
        });
        
        const response = await fetch(`/api/world-rankings?${params}`);
        const data = await response.json();
        
        if (data.error) {
          setError(data.error);
        } else if (category === 'students') {
          setStudentRankings(data.rankings || []);
        } else {
          setClubRankings(data.rankings || []);
        }
      } catch (err) {
        setError('Failed to load rankings');
        console.error('Rankings fetch error:', err);
      }
      
      setIsLoading(false);
    };
    
    fetchRankings();
  }, [category, sport, country]);

  const RankChangeIndicator = ({ change }: { change: number | null }) => {
    if (change === null || change === undefined || Number.isNaN(change)) {
      return (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wide">New</span>
        </div>
      );
    }
    if (change === 0) {
      return (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-600/30 border border-slate-500/30">
          <Minus className="w-3 h-3 text-slate-400" />
          <span className="text-xs font-medium text-slate-400">—</span>
        </div>
      );
    }
    if (change > 0) {
      return (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 animate-pulse">
          <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-400">+{change}</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/30">
        <ChevronDown className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs font-bold text-red-400">{change}</span>
      </div>
    );
  };

  const BeltBadge = ({ belt }: { belt: string }) => {
    const beltKey = belt.toLowerCase();
    const style = BELT_COLORS[beltKey] || { bg: 'bg-gray-600', text: 'text-white' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text} ${style.border || ''} shadow-sm`}>
        {belt}
      </span>
    );
  };

  const TopThreePodium = ({ athletes }: { athletes: StudentRanking[] }) => {
    if (athletes.length < 3) return null;
    
    const [first, second, third] = athletes;
    
    const PodiumCard = ({ athlete, position }: { athlete: StudentRanking; position: 1 | 2 | 3 }) => {
      const configs = {
        1: {
          gradient: 'from-yellow-500/20 via-amber-500/10 to-transparent',
          border: 'border-yellow-500/50',
          glow: 'shadow-yellow-500/20',
          icon: <Crown className="w-8 h-8 text-yellow-400" />,
          size: 'h-44',
          avatarSize: 'w-20 h-20',
          ring: 'ring-4 ring-yellow-500/50',
        },
        2: {
          gradient: 'from-slate-400/20 via-gray-400/10 to-transparent',
          border: 'border-slate-400/50',
          glow: 'shadow-slate-400/20',
          icon: <Medal className="w-7 h-7 text-slate-300" />,
          size: 'h-40',
          avatarSize: 'w-16 h-16',
          ring: 'ring-4 ring-slate-400/50',
        },
        3: {
          gradient: 'from-amber-700/20 via-orange-600/10 to-transparent',
          border: 'border-amber-600/50',
          glow: 'shadow-amber-600/20',
          icon: <Award className="w-6 h-6 text-amber-500" />,
          size: 'h-36',
          avatarSize: 'w-14 h-14',
          ring: 'ring-4 ring-amber-600/50',
        },
      };
      
      const config = configs[position];
      
      return (
        <div className={`relative flex flex-col items-center p-4 rounded-2xl bg-gradient-to-b ${config.gradient} border ${config.border} ${config.size} shadow-2xl ${config.glow} backdrop-blur-sm transition-all hover:scale-105 hover:shadow-3xl`}>
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-slate-800 rounded-full p-2 border-2 border-slate-600">
            {config.icon}
          </div>
          
          <div className={`mt-6 ${config.avatarSize} rounded-full bg-gradient-to-br ${getAvatarColor(athlete.name)} flex items-center justify-center text-white font-bold text-xl ${config.ring} shadow-lg`}>
            {getInitials(athlete.name)}
          </div>
          
          <div className="mt-3 text-center">
            <div className="font-bold text-white text-lg leading-tight">{athlete.name}</div>
            <div className="flex items-center justify-center gap-1 mt-1">
              <CountryFlag country={athlete.country} size={16} />
              <span className="text-slate-400 text-xs">{athlete.clubName}</span>
            </div>
          </div>
          
          <div className="mt-auto flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-cyan-400" />
            <span className="text-2xl font-black text-white">{athlete.globalXp.toLocaleString()}</span>
          </div>
          
          <div className="mt-2">
            <BeltBadge belt={athlete.belt} />
          </div>
        </div>
      );
    };
    
    return (
      <div className="mb-8">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Star className="w-5 h-5 text-yellow-400 animate-pulse" />
          <h2 className="text-xl font-bold text-white uppercase tracking-wider">Top Champions</h2>
          <Star className="w-5 h-5 text-yellow-400 animate-pulse" />
        </div>
        
        <div className="flex items-end justify-center gap-4 px-4">
          <div className="flex-1 max-w-[200px]">
            <PodiumCard athlete={second} position={2} />
          </div>
          <div className="flex-1 max-w-[220px] -mt-4">
            <PodiumCard athlete={first} position={1} />
          </div>
          <div className="flex-1 max-w-[180px]">
            <PodiumCard athlete={third} position={3} />
          </div>
        </div>
      </div>
    );
  };

  const RankBadge = ({ rank }: { rank: number }) => {
    if (rank === 1) {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-500/40 ring-2 ring-yellow-300/50">
          <Crown className="w-6 h-6 text-yellow-900" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 flex items-center justify-center shadow-lg shadow-slate-400/30 ring-2 ring-slate-200/50">
          <Medal className="w-6 h-6 text-slate-700" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-600/40 ring-2 ring-amber-400/50">
          <Award className="w-6 h-6 text-amber-100" />
        </div>
      );
    }
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-md border border-slate-500/30">
        <span className="text-xl font-black text-white">{rank}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
      
      <div className="relative max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4 px-6 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 border border-cyan-500/20">
            <Globe2 className="w-8 h-8 text-cyan-400 animate-pulse" />
            <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
              World Rankings
            </h1>
          </div>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Global martial arts leaderboard across all participating clubs worldwide
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8 justify-center">
          <button
            onClick={() => setCategory('students')}
            className={`group flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-300 ${
              category === 'students'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 scale-105'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            <Users className={`w-5 h-5 transition-transform ${category === 'students' ? 'animate-bounce' : 'group-hover:scale-110'}`} />
            Top Athletes
          </button>
          <button
            onClick={() => setCategory('clubs')}
            className={`group flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-300 ${
              category === 'clubs'
                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 scale-105'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            <Building2 className={`w-5 h-5 transition-transform ${category === 'clubs' ? 'animate-bounce' : 'group-hover:scale-110'}`} />
            Top Clubs
          </button>
        </div>

        <div className="flex flex-wrap gap-4 mb-8 justify-center items-center">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filter:</span>
          </div>
          
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="bg-slate-800/80 border border-slate-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-cyan-500 focus:border-transparent cursor-pointer hover:bg-slate-700 transition-colors"
          >
            <option value="all">All Sports</option>
            {sports.map(s => (
              <option key={s} value={s}>{SPORT_ICONS[s] || '🥋'} {s}</option>
            ))}
          </select>
          
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-slate-800/80 border border-slate-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-cyan-500 focus:border-transparent cursor-pointer hover:bg-slate-700 transition-colors"
          >
            <option value="all">All Countries</option>
            {countries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
              <p className="mt-4 text-slate-400 animate-pulse">Loading rankings...</p>
            </div>
          ) : error ? (
            <div className="text-center py-24 text-red-400">{error}</div>
          ) : category === 'students' ? (
            studentRankings.length === 0 ? (
              <div className="text-center py-24">
                <Trophy className="w-20 h-20 text-slate-600 mx-auto mb-6" />
                <p className="text-slate-300 text-xl font-medium">No rankings available yet</p>
                <p className="text-slate-500 mt-2">Clubs need to opt-in and athletes need to earn Global XP</p>
              </div>
            ) : (
              <div>
                {studentRankings.length >= 3 && (
                  <div className="p-6 border-b border-slate-700/50 bg-gradient-to-b from-slate-800/50 to-transparent">
                    <TopThreePodium athletes={studentRankings.slice(0, 3)} />
                  </div>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-800/50">
                        <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Rank</th>
                        <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Athlete</th>
                        <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Club</th>
                        <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Location</th>
                        <th className="text-right py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Global XP</th>
                        <th className="text-center py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest w-28">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRankings.map((student, index) => (
                        <tr 
                          key={student.id}
                          className={`border-b border-slate-700/30 transition-all duration-200 hover:bg-slate-700/40 hover:scale-[1.01] ${
                            index < 3 ? 'bg-gradient-to-r from-cyan-500/5 via-transparent to-transparent' : ''
                          }`}
                          style={{ height: '72px' }}
                        >
                          <td className="py-4 px-6">
                            <RankBadge rank={student.rank} />
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(student.name)} flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-white/10`}>
                                {getInitials(student.name)}
                              </div>
                              <div>
                                <div className="font-bold text-white text-lg leading-tight">{student.name}</div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <BeltBadge belt={student.belt} />
                                  <span className="text-xs text-slate-500 font-medium">{student.sport}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 hidden md:table-cell">
                            <div className="text-slate-300 font-medium">{student.clubName}</div>
                          </td>
                          <td className="py-4 px-6 hidden lg:table-cell">
                            <div className="flex items-center gap-2 text-slate-400">
                              <CountryFlag country={student.country} size={20} />
                              <span className="text-sm">{student.city}, {student.country}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <TrendingUp className="w-5 h-5 text-cyan-400" />
                              <span className="text-2xl font-black text-white tabular-nums">{student.globalXp.toLocaleString()}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex justify-center">
                              <RankChangeIndicator change={student.rankChange} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            clubRankings.length === 0 ? (
              <div className="text-center py-24">
                <Building2 className="w-20 h-20 text-slate-600 mx-auto mb-6" />
                <p className="text-slate-300 text-xl font-medium">No club rankings available yet</p>
                <p className="text-slate-500 mt-2">Clubs need to opt-in to world rankings</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-800/50">
                      <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Rank</th>
                      <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Club</th>
                      <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Sport</th>
                      <th className="text-left py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Location</th>
                      <th className="text-center py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Athletes</th>
                      <th className="text-right py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Avg XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubRankings.map((club, index) => (
                      <tr 
                        key={club.id}
                        className={`border-b border-slate-700/30 transition-all duration-200 hover:bg-slate-700/40 hover:scale-[1.01] ${
                          index < 3 ? 'bg-gradient-to-r from-purple-500/5 via-transparent to-transparent' : ''
                        }`}
                        style={{ height: '72px' }}
                      >
                        <td className="py-4 px-6">
                          <RankBadge rank={club.rank} />
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarColor(club.name)} flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-white/10`}>
                              {getInitials(club.name)}
                            </div>
                            <div className="font-bold text-white text-lg">{club.name}</div>
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{SPORT_ICONS[club.sport] || '🥋'}</span>
                            <span className="text-slate-300 font-medium">{club.sport}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden lg:table-cell">
                          <div className="flex items-center gap-2 text-slate-400">
                            <CountryFlag country={club.country} size={20} />
                            <span className="text-sm">{club.city}, {club.country}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="inline-flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-xl border border-slate-600/50">
                            <Users className="w-4 h-4 text-purple-400" />
                            <span className="text-white font-bold">{club.studentCount}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <TrendingUp className="w-5 h-5 text-purple-400" />
                            <span className="text-2xl font-black text-white tabular-nums">{club.avgGlobalXp.toLocaleString()}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
            <Globe2 className="w-4 h-4" />
            Rankings calculated using standardized global scoring for fair competition
          </p>
        </div>
      </div>
    </div>
  );
};

export default WorldRankings;
