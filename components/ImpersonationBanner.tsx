import React, { useState, useEffect } from 'react';
import { Eye, X, AlertTriangle } from 'lucide-react';

interface ImpersonationInfo {
  clubName: string;
  clubId: string;
  expiresAt: string;
}

export const isImpersonating = (): boolean => {
  return !!sessionStorage.getItem('impersonationToken');
};

export const ImpersonationBanner: React.FC = () => {
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(null);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('impersonate');
    const storedToken = sessionStorage.getItem('impersonationToken');
    
    if (urlToken) {
      verifyAndSetupImpersonation(urlToken);
      return;
    }
    
    if (storedToken) {
      const storedClubId = sessionStorage.getItem('impersonationClubId');
      const storedClubName = sessionStorage.getItem('impersonationClubName');
      const storedWizardData = sessionStorage.getItem('impersonation_wizard_data');
      
      let clubName = 'Club';
      if (storedClubName) {
        clubName = storedClubName;
      } else if (storedWizardData) {
        try {
          const wizardData = JSON.parse(storedWizardData);
          clubName = wizardData.clubName || 'Club';
        } catch (e) {
          console.error('Failed to parse stored wizard data');
        }
      }
      
      if (storedClubId) {
        setImpersonation({
          clubName,
          clubId: storedClubId,
          expiresAt: ''
        });
      }
    }
  }, []);

  const verifyAndSetupImpersonation = async (token: string) => {
    try {
      const response = await fetch(`/api/super-admin/impersonate/verify/${token}`);
      if (response.ok) {
        const data = await response.json();
        
        sessionStorage.setItem('impersonationToken', token);
        sessionStorage.setItem('impersonationClubId', data.clubId);
        sessionStorage.setItem('impersonationClubName', data.clubName || 'Club');
        
        const wizardData = data.wizardData;
        
        if (wizardData) {
          sessionStorage.setItem('impersonation_wizard_data', JSON.stringify(wizardData));
          sessionStorage.setItem('impersonation_club_id', data.clubId);
          sessionStorage.setItem('impersonation_user_type', 'owner');
          sessionStorage.setItem('impersonation_user_name', data.ownerName || data.clubName || 'Club Owner');
          
          // Don't redirect - let the current page (wizard) handle the flow
          // The user should see the wizard to review club setup status
          console.log('[ImpersonationBanner] Loaded wizard data for impersonation, NOT redirecting');
        }
        
        setImpersonation({
          clubName: data.clubName || 'Unknown Club',
          clubId: data.clubId,
          expiresAt: data.expiresAt
        });
      } else {
        sessionStorage.removeItem('impersonationToken');
        sessionStorage.removeItem('impersonationClubId');
        sessionStorage.removeItem('impersonationClubName');
        const url = new URL(window.location.href);
        url.searchParams.delete('impersonate');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } catch (err) {
      console.error('Failed to verify impersonation:', err);
      sessionStorage.removeItem('impersonationToken');
      sessionStorage.removeItem('impersonationClubId');
      sessionStorage.removeItem('impersonationClubName');
    }
  };

  const endImpersonation = async () => {
    setIsEnding(true);
    const token = sessionStorage.getItem('impersonationToken');
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
    
    sessionStorage.removeItem('impersonationToken');
    sessionStorage.removeItem('impersonationClubId');
    sessionStorage.removeItem('impersonationClubName');
    sessionStorage.removeItem('impersonation_wizard_data');
    sessionStorage.removeItem('impersonation_user_type');
    sessionStorage.removeItem('impersonation_user_name');
    sessionStorage.removeItem('impersonation_club_id');
    sessionStorage.removeItem('impersonation_subscription');
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
          className="flex items-center gap-2 bg-amber-700 hover:bg-amber-800 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">
            {isEnding ? 'Ending...' : 'End Session'}
          </span>
        </button>
      </div>
    </div>
  );
};
