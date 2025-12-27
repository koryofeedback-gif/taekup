import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Crown, LogOut, RefreshCw, Save, Video, Play, Trash2, Check, X, Plus, Users, Dumbbell } from 'lucide-react';

interface FamilyChallenge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'Strength' | 'Speed' | 'Focus';
  demo_video_url: string | null;
  is_active: boolean;
  display_order: number;
}

interface GauntletChallenge {
  id: string;
  day_of_week: string;
  day_theme: string;
  name: string;
  description: string;
  icon: string;
  score_type: string;
  sort_order: string;
  target_value: number | null;
  demo_video_url: string | null;
  is_active: boolean;
  display_order: number;
}

interface SuperAdminTrainingProps {
  token: string;
  onLogout: () => void;
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_THEMES: Record<string, string> = {
  MONDAY: 'Engine',
  TUESDAY: 'Foundation',
  WEDNESDAY: 'Evasion',
  THURSDAY: 'Explosion',
  FRIDAY: 'Animal',
  SATURDAY: 'Defense',
  SUNDAY: 'Flow'
};

export const SuperAdminTraining: React.FC<SuperAdminTrainingProps> = ({ token, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'gauntlet' | 'family'>('gauntlet');
  const [challenges, setChallenges] = useState<GauntletChallenge[]>([]);
  const [familyChallenges, setFamilyChallenges] = useState<FamilyChallenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<GauntletChallenge>>({});
  const [editingFamily, setEditingFamily] = useState<string | null>(null);
  const [familyForm, setFamilyForm] = useState<Partial<FamilyChallenge>>({});
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchFamilyChallenges = async () => {
    try {
      const response = await fetch('/api/family-challenges?active=false');
      if (!response.ok) throw new Error('Failed to fetch family challenges');
      const data = await response.json();
      setFamilyChallenges(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchChallenges = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/super-admin/gauntlet-challenges', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch challenges');
      }
      
      const data = await response.json();
      setChallenges(data.challenges || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
    fetchFamilyChallenges();
  }, [token]);

  const handleFamilyEdit = (challenge: FamilyChallenge) => {
    setEditingFamily(challenge.id);
    setFamilyForm({
      name: challenge.name,
      description: challenge.description,
      icon: challenge.icon,
      category: challenge.category,
      demo_video_url: challenge.demo_video_url || '',
      is_active: challenge.is_active,
      display_order: challenge.display_order
    });
  };

  const handleFamilySave = async (challengeId: string) => {
    setSaving(challengeId);
    try {
      const response = await fetch(`/api/admin/family-challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: familyForm.name,
          description: familyForm.description,
          icon: familyForm.icon,
          category: familyForm.category,
          demoVideoUrl: familyForm.demo_video_url || null,
          isActive: familyForm.is_active,
          displayOrder: familyForm.display_order
        })
      });
      
      if (!response.ok) throw new Error('Failed to save');
      setSuccessMessage('Family challenge updated!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setEditingFamily(null);
      fetchFamilyChallenges();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleFamilyAdd = async () => {
    if (!familyForm.name || !familyForm.description || !familyForm.category) {
      setError('Name, description, and category are required');
      return;
    }
    
    setSaving('new');
    try {
      const response = await fetch('/api/admin/family-challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: familyForm.name,
          description: familyForm.description,
          icon: familyForm.icon || '🎯',
          category: familyForm.category,
          demoVideoUrl: familyForm.demo_video_url || null,
          isActive: familyForm.is_active !== false,
          displayOrder: familyForm.display_order || 0
        })
      });
      
      if (!response.ok) throw new Error('Failed to create');
      setSuccessMessage('Family challenge created!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setShowAddFamily(false);
      setFamilyForm({});
      fetchFamilyChallenges();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleFamilyDelete = async (id: string) => {
    if (!confirm('Delete this family challenge?')) return;
    
    setSaving(id);
    try {
      const response = await fetch(`/api/admin/family-challenges/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      setSuccessMessage('Family challenge deleted!');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchFamilyChallenges();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const toggleFamilyActive = async (challenge: FamilyChallenge) => {
    setSaving(challenge.id);
    try {
      const response = await fetch(`/api/admin/family-challenges/${challenge.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !challenge.is_active })
      });
      
      if (!response.ok) throw new Error('Failed to toggle status');
      fetchFamilyChallenges();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleEdit = (challenge: GauntletChallenge) => {
    setEditingChallenge(challenge.id);
    setEditForm({
      name: challenge.name,
      description: challenge.description,
      icon: challenge.icon,
      demo_video_url: challenge.demo_video_url || '',
      is_active: challenge.is_active
    });
  };

  const handleSave = async (challengeId: string) => {
    setSaving(challengeId);
    try {
      const response = await fetch(`/api/super-admin/gauntlet-challenges/${challengeId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editForm)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      setSuccessMessage('Challenge updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setEditingChallenge(null);
      fetchChallenges();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleCancel = () => {
    setEditingChallenge(null);
    setEditForm({});
  };

  const toggleActive = async (challenge: GauntletChallenge) => {
    setSaving(challenge.id);
    try {
      const response = await fetch(`/api/super-admin/gauntlet-challenges/${challenge.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !challenge.is_active })
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle status');
      }
      
      fetchChallenges();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const groupedChallenges = DAY_ORDER.reduce((acc, day) => {
    acc[day] = challenges.filter(c => c.day_of_week === day).sort((a, b) => a.display_order - b.display_order);
    return acc;
  }, {} as Record<string, GauntletChallenge[]>);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading challenges...</p>
        </div>
      </div>
    );
  }

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
            <Link to="/super-admin/analytics" className="text-gray-400 hover:text-white">Analytics</Link>
            <Link to="/super-admin/training" className="text-purple-400 font-medium">Training</Link>
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
            <h2 className="text-2xl font-bold text-white">Training Manager</h2>
            <p className="text-gray-400 text-sm mt-1">Manage challenges shown to all clubs worldwide</p>
          </div>
          <button
            onClick={() => { fetchChallenges(); fetchFamilyChallenges(); }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('gauntlet')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'gauntlet' 
                ? 'bg-orange-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Dumbbell className="w-4 h-4" />
            Daily Gauntlet
          </button>
          <button
            onClick={() => setActiveTab('family')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'family' 
                ? 'bg-pink-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Users className="w-4 h-4" />
            Family Challenges ({familyChallenges.length})
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 text-sm mt-2 hover:underline">Dismiss</button>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4 mb-6">
            <p className="text-green-300">{successMessage}</p>
          </div>
        )}

        {activeTab === 'family' && (
          <div className="space-y-6">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => { setShowAddFamily(true); setFamilyForm({ category: 'Strength', is_active: true, display_order: familyChallenges.length + 1 }); }}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Challenge
              </button>
            </div>

            {showAddFamily && (
              <div className="bg-gray-800 rounded-xl border border-pink-500/50 p-6 mb-6">
                <h3 className="text-lg font-bold text-white mb-4">New Family Challenge</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Name</label>
                    <input
                      type="text"
                      value={familyForm.name || ''}
                      onChange={(e) => setFamilyForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                      placeholder="Challenge name"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Icon (emoji)</label>
                    <input
                      type="text"
                      value={familyForm.icon || ''}
                      onChange={(e) => setFamilyForm(prev => ({ ...prev, icon: e.target.value }))}
                      className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                      placeholder="🎯"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-gray-400 text-sm block mb-1">Description</label>
                  <textarea
                    value={familyForm.description || ''}
                    onChange={(e) => setFamilyForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                    rows={3}
                    placeholder="Describe the challenge..."
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Category</label>
                    <select
                      value={familyForm.category || 'Strength'}
                      onChange={(e) => setFamilyForm(prev => ({ ...prev, category: e.target.value as any }))}
                      className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                    >
                      <option value="Strength">Strength</option>
                      <option value="Speed">Speed</option>
                      <option value="Focus">Focus</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Display Order</label>
                    <input
                      type="number"
                      value={familyForm.display_order || 0}
                      onChange={(e) => setFamilyForm(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Demo Video URL</label>
                    <input
                      type="text"
                      value={familyForm.demo_video_url || ''}
                      onChange={(e) => setFamilyForm(prev => ({ ...prev, demo_video_url: e.target.value }))}
                      className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleFamilyAdd}
                    disabled={saving === 'new'}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {saving === 'new' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Create
                  </button>
                  <button
                    onClick={() => { setShowAddFamily(false); setFamilyForm({}); }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {['Strength', 'Speed', 'Focus'].map(category => (
              <div key={category} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className={`px-6 py-4 border-b border-gray-700 ${
                  category === 'Strength' ? 'bg-gradient-to-r from-red-900/50 to-orange-900/50' :
                  category === 'Speed' ? 'bg-gradient-to-r from-blue-900/50 to-cyan-900/50' :
                  'bg-gradient-to-r from-purple-900/50 to-pink-900/50'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{category === 'Strength' ? '💪' : category === 'Speed' ? '⚡' : '🧠'}</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">{category} Battles</h3>
                      <p className="text-gray-400 text-sm">{familyChallenges.filter(c => c.category === category).length} challenges</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-gray-700">
                  {familyChallenges.filter(c => c.category === category).map(challenge => (
                    <div key={challenge.id} className="p-4">
                      {editingFamily === challenge.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={familyForm.name || ''}
                              onChange={(e) => setFamilyForm(prev => ({ ...prev, name: e.target.value }))}
                              className="bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                              placeholder="Name"
                            />
                            <input
                              type="text"
                              value={familyForm.icon || ''}
                              onChange={(e) => setFamilyForm(prev => ({ ...prev, icon: e.target.value }))}
                              className="bg-gray-700 text-white p-2 rounded-lg border border-gray-600 w-20"
                              placeholder="Icon"
                            />
                          </div>
                          <textarea
                            value={familyForm.description || ''}
                            onChange={(e) => setFamilyForm(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                            rows={2}
                          />
                          <input
                            type="text"
                            value={familyForm.demo_video_url || ''}
                            onChange={(e) => setFamilyForm(prev => ({ ...prev, demo_video_url: e.target.value }))}
                            className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
                            placeholder="Demo video URL"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleFamilySave(challenge.id)}
                              disabled={saving === challenge.id}
                              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm disabled:opacity-50"
                            >
                              {saving === challenge.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingFamily(null); setFamilyForm({}); }}
                              className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <span className="text-3xl">{challenge.icon}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white">{challenge.name}</h4>
                                {!challenge.is_active && (
                                  <span className="text-[10px] bg-red-600/30 text-red-400 px-2 py-0.5 rounded-full">DISABLED</span>
                                )}
                                {challenge.demo_video_url && (
                                  <a 
                                    href={challenge.demo_video_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] bg-pink-600/30 text-pink-400 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-pink-600/50"
                                  >
                                    <Play className="w-3 h-3" /> Demo
                                  </a>
                                )}
                              </div>
                              <p className="text-gray-400 text-sm mt-1">{challenge.description}</p>
                              <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded mt-2 inline-block">
                                Order: {challenge.display_order}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleFamilyEdit(challenge)}
                              className="px-3 py-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleFamilyActive(challenge)}
                              disabled={saving === challenge.id}
                              className={`px-3 py-2 rounded-lg transition-colors text-sm ${
                                challenge.is_active
                                  ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                              }`}
                            >
                              {saving === challenge.id ? '...' : challenge.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleFamilyDelete(challenge.id)}
                              disabled={saving === challenge.id}
                              className="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors text-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {familyChallenges.filter(c => c.category === category).length === 0 && (
                    <div className="p-6 text-center text-gray-500">
                      No challenges in this category
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'gauntlet' && <div className="space-y-6">
          {DAY_ORDER.map(day => (
            <div key={day} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="bg-gradient-to-r from-orange-900/50 to-red-900/50 px-6 py-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚔️</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">{day.charAt(0) + day.slice(1).toLowerCase()}</h3>
                      <p className="text-orange-300 text-sm">{DAY_THEMES[day]} Day</p>
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">{groupedChallenges[day]?.length || 0} challenges</span>
                </div>
              </div>
              
              <div className="divide-y divide-gray-700">
                {(groupedChallenges[day] || []).map(challenge => (
                  <div key={challenge.id} className="p-4">
                    {editingChallenge === challenge.id ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-gray-400 text-xs block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-gray-400 text-xs block mb-1">Icon (emoji)</label>
                            <input
                              type="text"
                              value={editForm.icon || ''}
                              onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
                              className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs block mb-1">Description</label>
                          <textarea
                            value={editForm.description || ''}
                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            rows={2}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs block mb-1">Demo Video URL (YouTube, etc.)</label>
                          <input
                            type="text"
                            value={editForm.demo_video_url || ''}
                            onChange={e => setEditForm({ ...editForm, demo_video_url: e.target.value })}
                            placeholder="https://youtube.com/watch?v=..."
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleSave(challenge.id)}
                            disabled={saving === challenge.id}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            {saving === challenge.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-3xl">{challenge.icon}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-white">{challenge.name}</h4>
                              {!challenge.is_active && (
                                <span className="text-[10px] bg-red-600/30 text-red-400 px-2 py-0.5 rounded-full">DISABLED</span>
                              )}
                              {challenge.demo_video_url && (
                                <a 
                                  href={challenge.demo_video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] bg-cyan-600/30 text-cyan-400 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-cyan-600/50"
                                >
                                  <Play className="w-3 h-3" /> Demo
                                </a>
                              )}
                            </div>
                            <p className="text-gray-400 text-sm mt-1">{challenge.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                {challenge.score_type}
                              </span>
                              <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                {challenge.sort_order === 'ASC' ? 'Lower is better' : 'Higher is better'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(challenge)}
                            className="px-3 py-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(challenge)}
                            disabled={saving === challenge.id}
                            className={`px-3 py-2 rounded-lg transition-colors text-sm ${
                              challenge.is_active
                                ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                                : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                            }`}
                          >
                            {saving === challenge.id ? '...' : challenge.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {(!groupedChallenges[day] || groupedChallenges[day].length === 0) && (
                  <div className="p-6 text-center text-gray-500">
                    No challenges for this day
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>}
      </main>
    </div>
  );
};

export default SuperAdminTraining;
