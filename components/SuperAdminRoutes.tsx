import React from 'react';
import { Navigate } from 'react-router-dom';
import { SuperAdminDashboard } from '../pages/SuperAdminDashboard';
import { SuperAdminClubs } from '../pages/SuperAdminClubs';
import { SuperAdminParents } from '../pages/SuperAdminParents';
import { SuperAdminPayments } from '../pages/SuperAdminPayments';
import SuperAdminAnalytics from '../pages/SuperAdminAnalytics';
import { SuperAdminTraining } from '../pages/SuperAdminTraining';

export const SuperAdminDashboardRoute: React.FC = () => {
    const [isValid, setIsValid] = React.useState<boolean | null>(null);
    const token = localStorage.getItem('superAdminToken');
    
    React.useEffect(() => {
        if (!token) {
            setIsValid(false);
            return;
        }
        fetch('/api/super-admin/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? setIsValid(true) : setIsValid(false))
            .catch(() => setIsValid(false));
    }, [token]);
    
    if (isValid === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Verifying access...</p>
                </div>
            </div>
        );
    }
    
    if (!isValid) {
        return <Navigate to="/super-admin/login" replace />;
    }
    
    const handleLogout = () => {
        localStorage.removeItem('superAdminToken');
        localStorage.removeItem('superAdminEmail');
        window.location.href = '/super-admin/login';
    };
    
    return <SuperAdminDashboard token={token || ''} onLogout={handleLogout} />;
};

export const SuperAdminClubsRoute: React.FC = () => {
    const [isValid, setIsValid] = React.useState<boolean | null>(null);
    const token = localStorage.getItem('superAdminToken');
    
    React.useEffect(() => {
        if (!token) {
            setIsValid(false);
            return;
        }
        fetch('/api/super-admin/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? setIsValid(true) : setIsValid(false))
            .catch(() => setIsValid(false));
    }, [token]);
    
    if (isValid === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Verifying access...</p>
                </div>
            </div>
        );
    }
    
    if (!isValid) {
        return <Navigate to="/super-admin/login" replace />;
    }
    
    const handleLogout = () => {
        localStorage.removeItem('superAdminToken');
        localStorage.removeItem('superAdminEmail');
        window.location.href = '/super-admin/login';
    };
    
    const handleImpersonate = (clubId: string) => {
        const impersonationToken = sessionStorage.getItem('impersonationToken');
        if (impersonationToken) {
            window.location.href = `/?impersonate=${impersonationToken}`;
        }
    };
    
    return (
        <SuperAdminClubs 
            token={token || ''} 
            onLogout={handleLogout} 
            onImpersonate={handleImpersonate} 
        />
    );
};

export const SuperAdminParentsRoute: React.FC = () => {
    const [isValid, setIsValid] = React.useState<boolean | null>(null);
    const token = localStorage.getItem('superAdminToken');
    
    React.useEffect(() => {
        if (!token) {
            setIsValid(false);
            return;
        }
        fetch('/api/super-admin/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? setIsValid(true) : setIsValid(false))
            .catch(() => setIsValid(false));
    }, [token]);
    
    if (isValid === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Verifying access...</p>
                </div>
            </div>
        );
    }
    
    if (!isValid) {
        return <Navigate to="/super-admin/login" replace />;
    }
    
    const handleLogout = () => {
        localStorage.removeItem('superAdminToken');
        localStorage.removeItem('superAdminEmail');
        window.location.href = '/super-admin/login';
    };
    
    return <SuperAdminParents token={token || ''} onLogout={handleLogout} />;
};

export const SuperAdminPaymentsRoute: React.FC = () => {
    const [isValid, setIsValid] = React.useState<boolean | null>(null);
    const token = localStorage.getItem('superAdminToken');
    
    React.useEffect(() => {
        if (!token) {
            setIsValid(false);
            return;
        }
        fetch('/api/super-admin/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? setIsValid(true) : setIsValid(false))
            .catch(() => setIsValid(false));
    }, [token]);
    
    if (isValid === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Verifying access...</p>
                </div>
            </div>
        );
    }
    
    if (!isValid) {
        return <Navigate to="/super-admin/login" replace />;
    }
    
    const handleLogout = () => {
        localStorage.removeItem('superAdminToken');
        localStorage.removeItem('superAdminEmail');
        window.location.href = '/super-admin/login';
    };
    
    return <SuperAdminPayments token={token || ''} onLogout={handleLogout} />;
};

export const SuperAdminAnalyticsRoute: React.FC = () => {
    const [isValid, setIsValid] = React.useState<boolean | null>(null);
    const token = localStorage.getItem('superAdminToken');
    
    React.useEffect(() => {
        if (!token) {
            setIsValid(false);
            return;
        }
        fetch('/api/super-admin/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? setIsValid(true) : setIsValid(false))
            .catch(() => setIsValid(false));
    }, [token]);
    
    if (isValid === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Verifying access...</p>
                </div>
            </div>
        );
    }
    
    if (!isValid) {
        return <Navigate to="/super-admin/login" replace />;
    }
    
    return <SuperAdminAnalytics />;
};

export const SuperAdminTrainingRoute: React.FC = () => {
    const [isValid, setIsValid] = React.useState<boolean | null>(null);
    const token = localStorage.getItem('superAdminToken');
    
    React.useEffect(() => {
        if (!token) {
            setIsValid(false);
            return;
        }
        fetch('/api/super-admin/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? setIsValid(true) : setIsValid(false))
            .catch(() => setIsValid(false));
    }, [token]);
    
    if (isValid === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Verifying access...</p>
                </div>
            </div>
        );
    }
    
    if (!isValid) {
        return <Navigate to="/super-admin/login" replace />;
    }
    
    const handleLogout = () => {
        localStorage.removeItem('superAdminToken');
        localStorage.removeItem('superAdminEmail');
        window.location.href = '/super-admin/login';
    };
    
    return <SuperAdminTraining token={token || ''} onLogout={handleLogout} />;
};
