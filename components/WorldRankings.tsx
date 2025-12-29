import React, { useState, useEffect } from 'react';
import { Trophy, Users, Globe2, Filter, ChevronUp, ChevronDown, Minus, Building2, Medal, TrendingUp, Flag, MapPin, Award, Loader2 } from 'lucide-react';

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

const BELT_COLORS: Record<string, string> = {
  'White': 'bg-white border-gray-300',
  'Yellow': 'bg-yellow-400',
  'Orange': 'bg-orange-400',
  'Green': 'bg-green-500',
  'Blue': 'bg-blue-500',
  'Purple': 'bg-purple-500',
  'Brown': 'bg-amber-700',
  'Red': 'bg-red-500',
  'Black': 'bg-gray-900',
  'Poom': 'bg-gradient-to-r from-red-500 to-gray-900',
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

const COUNTRY_FLAGS: Record<string, string> = {
  'Iran': '🇮🇷',
  'IR': '🇮🇷',
  'Iran (Islamic Republic of)': '🇮🇷',
  'Islamic Republic of Iran': '🇮🇷',
  'United States': '🇺🇸',
  'USA': '🇺🇸',
  'US': '🇺🇸',
  'South Korea': '🇰🇷',
  'Korea': '🇰🇷',
  'Japan': '🇯🇵',
  'China': '🇨🇳',
  'Brazil': '🇧🇷',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'United Kingdom': '🇬🇧',
  'UK': '🇬🇧',
  'Spain': '🇪🇸',
  'Italy': '🇮🇹',
  'Canada': '🇨🇦',
  'Australia': '🇦🇺',
  'Mexico': '🇲🇽',
  'Russia': '🇷🇺',
  'Turkey': '🇹🇷',
  'India': '🇮🇳',
  'Netherlands': '🇳🇱',
  'Belgium': '🇧🇪',
  'Sweden': '🇸🇪',
  'Norway': '🇳🇴',
  'Denmark': '🇩🇰',
  'Finland': '🇫🇮',
  'Poland': '🇵🇱',
  'Austria': '🇦🇹',
  'Switzerland': '🇨🇭',
  'Portugal': '🇵🇹',
  'Greece': '🇬🇷',
  'Argentina': '🇦🇷',
  'Colombia': '🇨🇴',
  'Chile': '🇨🇱',
  'Peru': '🇵🇪',
  'Venezuela': '🇻🇪',
  'Egypt': '🇪🇬',
  'South Africa': '🇿🇦',
  'Morocco': '🇲🇦',
  'Nigeria': '🇳🇬',
  'Saudi Arabia': '🇸🇦',
  'UAE': '🇦🇪',
  'United Arab Emirates': '🇦🇪',
  'Israel': '🇮🇱',
  'Thailand': '🇹🇭',
  'Vietnam': '🇻🇳',
  'Philippines': '🇵🇭',
  'Indonesia': '🇮🇩',
  'Malaysia': '🇲🇾',
  'Singapore': '🇸🇬',
  'New Zealand': '🇳🇿',
  'Ireland': '🇮🇪',
  'Czech Republic': '🇨🇿',
  'Romania': '🇷🇴',
  'Hungary': '🇭🇺',
  'Ukraine': '🇺🇦',
  'Pakistan': '🇵🇰',
  'Bangladesh': '🇧🇩',
  'Taiwan': '🇹🇼',
  'Hong Kong': '🇭🇰',
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
  if (!code) return <span>🌍</span>;
  return (
    <img 
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={country}
      className="inline-block rounded-sm"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
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
        // Only set stats if it has the expected properties (not an error response)
        if (statsData && typeof statsData.totalStudents === 'number') {
          setStats(statsData);
        } else {
          setStats({ participatingClubs: 0, totalStudents: 0, sportsRepresented: 0, countriesRepresented: 0 });
        }
      } catch (err) {
        console.error('Failed to fetch filters:', err);
        // Set default stats on error
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
      return <span className="text-xs text-cyan-400 font-medium">NEW</span>;
    }
    if (change === 0) {
      return <Minus className="w-4 h-4 text-gray-400" />;
    }
    if (change > 0) {
      return (
        <div className="flex items-center text-green-400">
          <ChevronUp className="w-4 h-4" />
          <span className="text-xs font-medium">{change}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center text-red-400">
        <ChevronDown className="w-4 h-4" />
        <span className="text-xs font-medium">{Math.abs(change)}</span>
      </div>
    );
  };

  const RankBadge = ({ rank }: { rank: number }) => {
    if (rank === 1) {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
          <Trophy className="w-5 h-5 text-yellow-900" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 flex items-center justify-center shadow-lg shadow-gray-400/30">
          <Medal className="w-5 h-5 text-gray-700" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-600/30">
          <Award className="w-5 h-5 text-amber-100" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
        <span className="text-lg font-bold text-white">{rank}</span>
      </div>
    );
  };

  const BeltBadge = ({ belt }: { belt: string }) => {
    const colorClass = BELT_COLORS[belt] || 'bg-gray-500';
    return (
      <div className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass} ${belt === 'White' ? 'text-gray-700 border' : 'text-white'}`}>
        {belt}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Globe2 className="w-10 h-10 text-cyan-400" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              World Rankings
            </h1>
          </div>
          <p className="text-slate-400 text-lg">
            Global martial arts leaderboard across all participating clubs
          </p>
        </div>

        {/* Stats Bar - Hidden until platform reaches significant scale */}

        {/* Category Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setCategory('students')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              category === 'students'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Users className="w-5 h-5" />
            Top Athletes
          </button>
          <button
            onClick={() => setCategory('clubs')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              category === 'clubs'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Building2 className="w-5 h-5" />
            Top Clubs
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm">Filter by:</span>
          </div>
          
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="all">All Sports</option>
            {sports.map(s => (
              <option key={s} value={s}>{SPORT_ICONS[s] || '🥋'} {s}</option>
            ))}
          </select>
          
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="all">All Countries</option>
            {countries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Rankings Table */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-red-400">{error}</div>
          ) : category === 'students' ? (
            studentRankings.length === 0 ? (
              <div className="text-center py-20">
                <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">No rankings available yet</p>
                <p className="text-slate-500 text-sm mt-2">Clubs need to opt-in and students need to earn Global XP</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">RANK</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">ATHLETE</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400 hidden md:table-cell">CLUB</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400 hidden lg:table-cell">LOCATION</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-slate-400">GLOBAL XP</th>
                    <th className="text-center py-4 px-6 text-sm font-medium text-slate-400 w-20">TREND</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRankings.map((student, index) => (
                    <tr 
                      key={student.id}
                      className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                        index < 3 ? 'bg-gradient-to-r from-transparent via-slate-700/20 to-transparent' : ''
                      }`}
                    >
                      <td className="py-4 px-6">
                        <RankBadge rank={student.rank} />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <CountryFlag country={student.country} size={28} />
                          <div>
                            <div className="font-medium text-white text-lg">{student.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <BeltBadge belt={student.belt} />
                              <span className="text-xs text-slate-500">{student.sport}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 hidden md:table-cell">
                        <div className="text-slate-300">{student.clubName}</div>
                      </td>
                      <td className="py-4 px-6 hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-slate-400 text-sm">
                          <CountryFlag country={student.country} size={20} />
                          {student.city}, {student.country}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <TrendingUp className="w-4 h-4 text-cyan-400" />
                          <span className="text-xl font-bold text-white">{student.globalXp.toLocaleString()}</span>
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
            )
          ) : (
            clubRankings.length === 0 ? (
              <div className="text-center py-20">
                <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">No club rankings available yet</p>
                <p className="text-slate-500 text-sm mt-2">Clubs need to opt-in to world rankings</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">RANK</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">CLUB</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400 hidden md:table-cell">SPORT</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-slate-400 hidden lg:table-cell">LOCATION</th>
                    <th className="text-center py-4 px-6 text-sm font-medium text-slate-400">ATHLETES</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-slate-400">AVG XP</th>
                  </tr>
                </thead>
                <tbody>
                  {clubRankings.map((club, index) => (
                    <tr 
                      key={club.id}
                      className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                        index < 3 ? 'bg-gradient-to-r from-transparent via-slate-700/20 to-transparent' : ''
                      }`}
                    >
                      <td className="py-4 px-6">
                        <RankBadge rank={club.rank} />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <CountryFlag country={club.country} size={28} />
                          <div className="font-medium text-white text-lg">{club.name}</div>
                        </div>
                      </td>
                      <td className="py-4 px-6 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{SPORT_ICONS[club.sport] || '🥋'}</span>
                          <span className="text-slate-300">{club.sport}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-slate-400 text-sm">
                          <CountryFlag country={club.country} size={20} />
                          {club.city}, {club.country}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-700 px-3 py-1 rounded-full">
                          <Users className="w-4 h-4 text-purple-400" />
                          <span className="text-white font-medium">{club.studentCount}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <TrendingUp className="w-4 h-4 text-purple-400" />
                          <span className="text-xl font-bold text-white">{club.avgGlobalXp.toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Rankings are calculated using standardized scoring to ensure fairness across all clubs.</p>
        </div>
      </div>
    </div>
  );
};

export default WorldRankings;
