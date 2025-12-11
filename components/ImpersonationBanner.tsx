import React, { useState, useEffect } from 'react';
import { Eye, X, AlertTriangle } from 'lucide-react';

interface ImpersonationInfo {
  clubName: string;
  clubId: string;
  expiresAt: string;
}

export const isImpersonating = (): boolean => {
  return !!localStorage.getItem('impersonationToken');
};

export const ImpersonationBanner: React.FC = () => {
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(null);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('impersonate');
    const storedToken = localStorage.getItem('impersonationToken');
    
    // If there's a NEW token in URL, verify and set up impersonation
    if (urlToken) {
      verifyAndSetupImpersonation(urlToken);
      return;
    }
    
    // If we already have impersonation data stored, just show the banner
    if (storedToken) {
      const storedClubId = localStorage.getItem('impersonationClubId');
      const storedClubName = localStorage.getItem('impersonationClubName');
      const storedWizardData = localStorage.getItem('taekup_wizard_data');
      
      // Try to get club name from multiple sources
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
        
        // Store impersonation session info
        localStorage.setItem('impersonationToken', token);
        localStorage.setItem('impersonationClubId', data.clubId);
        localStorage.setItem('impersonationClubName', data.clubName || 'Club');
        
        // The API now returns complete wizardData with students, coaches, belts, etc.
        const wizardData = data.wizardData;
        
        if (wizardData) {
          // Store the complete club data so AdminDashboard can use it
          localStorage.setItem('taekup_wizard_data', JSON.stringify(wizardData));
          localStorage.setItem('taekup_club_id', data.clubId);
          localStorage.setItem('taekup_user_type', 'owner');
          localStorage.setItem('taekup_user_name', data.ownerName || data.clubName || 'Club Owner');
          
          // Remove impersonate param from URL and redirect to admin
          // Use window.location.replace to avoid infinite loop
          window.location.replace('/app/admin');
          return;
        }
        
        // Set impersonation info for the banner (fallback)
        setImpersonation({
          clubName: data.clubName || 'Unknown Club',
          clubId: data.clubId,
          expiresAt: data.expiresAt
        });
      } else {
        // Token invalid - clean up
        localStorage.removeItem('impersonationToken');
        localStorage.removeItem('impersonationClubId');
        localStorage.removeItem('impersonationClubName');
        // Remove param and stay on current page
        const url = new URL(window.location.href);
        url.searchParams.delete('impersonate');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } catch (err) {
      console.error('Failed to verify impersonation:', err);
      localStorage.removeItem('impersonationToken');
      localStorage.removeItem('impersonationClubId');
      localStorage.removeItem('impersonationClubName');
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
    
    // Clean up all impersonation-related localStorage
    localStorage.removeItem('impersonationToken');
    localStorage.removeItem('impersonationClubId');
    localStorage.removeItem('impersonationClubName');
    localStorage.removeItem('taekup_wizard_data');
    localStorage.removeItem('taekup_user_type');
    localStorage.removeItem('taekup_user_name');
    localStorage.removeItem('taekup_club_id');
    localStorage.removeItem('taekup_subscription');
    localStorage.removeItem('taekup_signup_data');
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
