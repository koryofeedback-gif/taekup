import React, { useState } from 'react';
import { Sparkles, Users, Loader2 } from 'lucide-react';
import { DEMO_MODE_KEY } from '../demoData';

interface StepDemoChoiceProps {
  clubId: string;
  onChooseFresh: () => void;
  onChooseDemo: () => void;
}

export const StepDemoChoice: React.FC<StepDemoChoiceProps> = ({ clubId, onChooseFresh, onChooseDemo }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLoadDemo = async () => {
    // Validate clubId before proceeding
    if (!clubId) {
      setError('Your account was not created properly. Please sign up again.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/demo/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Clear old data first, then save fresh wizard data
        if (result.wizardData) {
          localStorage.removeItem('taekup_wizard_data');
          localStorage.removeItem('taekup_wizard_draft');
          localStorage.setItem('taekup_wizard_data', JSON.stringify(result.wizardData));
          
          // CRITICAL: Set session keys so App.tsx recognizes user as logged in
          localStorage.setItem('taekup_user_type', 'owner');
          localStorage.setItem('taekup_user_name', result.wizardData.ownerName || 'Demo Owner');
          localStorage.setItem('taekup_club_id', clubId);
          localStorage.setItem('taekup_wizard_complete', 'true');
          
          // Enable demo mode toggle automatically
          localStorage.setItem(DEMO_MODE_KEY, 'true');
          
          // Force full page reload to ensure App state re-initializes with fresh data
          window.location.href = '/app/admin';
          return;
        }
        onChooseDemo();
      } else {
        setError(result.message || 'Failed to load demo data');
        setLoading(false);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="text-center py-8">
      <h2 className="text-3xl font-bold text-white mb-4">
        How would you like to start?
      </h2>
      <p className="text-gray-400 mb-12 max-w-lg mx-auto">
        Choose to explore with sample data first, or start building your real academy right away.
      </p>

      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <button
          onClick={handleLoadDemo}
          disabled={loading}
          className="group bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 hover:from-cyan-800/60 hover:to-cyan-700/40 border-2 border-cyan-500/50 hover:border-cyan-400 rounded-2xl p-8 transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              {loading ? (
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              ) : (
                <Sparkles className="w-6 h-6 text-cyan-400" />
              )}
            </div>
            <span className="text-xs font-bold text-cyan-400 bg-cyan-500/20 px-2 py-1 rounded">RECOMMENDED</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Load Demo Dojo</h3>
          <p className="text-gray-400 text-sm">
            See a fully populated academy with 18 students, active leaderboards, and revenue projections. Perfect for exploring features first.
          </p>
        </button>

        <button
          onClick={onChooseFresh}
          disabled={loading}
          className="group bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-600 hover:border-gray-500 rounded-2xl p-8 transition-all duration-300 text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gray-600/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Start Fresh</h3>
          <p className="text-gray-400 text-sm">
            Configure your academy from scratch. Add your real students and customize everything to match your dojo.
          </p>
        </button>
      </div>

      {error && (
        <p className="text-red-400 mt-6 text-sm">{error}</p>
      )}

      <p className="text-gray-500 text-xs mt-8">
        Demo data can be cleared anytime from your dashboard settings.
      </p>
    </div>
  );
};
