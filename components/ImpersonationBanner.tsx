import React, { useState, useEffect } from 'react';
import { Eye, X, AlertTriangle } from 'lucide-react';

interface ImpersonationInfo {
  clubName: string;
  clubId: string;
  expiresAt: string;
}

export const ImpersonationBanner: React.FC = () => {
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(null);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const impersonateToken = urlParams.get('impersonate') || localStorage.getItem('impersonationToken');
    
    if (impersonateToken) {
      verifyImpersonation(impersonateToken);
    }
  }, []);

  const verifyImpersonation = async (token: string) => {
    try {
      const response = await fetch(`/api/super-admin/impersonate/verify/${token}`);
      if (response.ok) {
        const data = await response.json();
        setImpersonation({
          clubName: data.clubName || 'Unknown Club',
          clubId: data.clubId,
          expiresAt: data.expiresAt
        });
        localStorage.setItem('impersonationToken', token);
        localStorage.setItem('impersonationClubId', data.clubId);
        
        const url = new URL(window.location.href);
        url.searchParams.delete('impersonate');
        window.history.replaceState({}, '', url.pathname + url.search);
      } else {
        localStorage.removeItem('impersonationToken');
        localStorage.removeItem('impersonationClubId');
        const url = new URL(window.location.href);
        url.searchParams.delete('impersonate');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } catch (err) {
      console.error('Failed to verify impersonation:', err);
      localStorage.removeItem('impersonationToken');
      localStorage.removeItem('impersonationClubId');
    }
  };

  const endImpersonation = async () => {
    setIsEnding(true);
    const token = localStorage.getItem('impersonationToken');
    const superAdminToken = localStorage.getItem('superAdminToken');
    
    if (token && superAdminToken) {
      try {
        await fetch('/api/super-admin/impersonate/end', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${superAdminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token })
        });
      } catch (err) {
        console.error('Failed to end impersonation:', err);
      }
    }
    
    localStorage.removeItem('impersonationToken');
    localStorage.removeItem('impersonationClubId');
    window.location.href = '/super-admin/clubs';
  };

  if (!impersonation) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-600 text-white z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-amber-700 rounded-full px-3 py-1">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">VIEWING AS</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold">{impersonation.clubName}</span>
            <span className="text-amber-200 text-sm">
              (Support Session - All actions are logged)
            </span>
          </div>
        </div>
        
        <button
          onClick={endImpersonation}
          disabled={isEnding}
          className="flex items-center gap-2 bg-amber-800 hover:bg-amber-900 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          {isEnding ? 'Ending...' : 'End Session'}
        </button>
      </div>
    </div>
  );
};
