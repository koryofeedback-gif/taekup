import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { SetupWizard } from './components/SetupWizard';
import { TaekBot, TaekBotColorScheme } from './components/TaekBot';
import { CoachDashboard } from './components/CoachDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ParentPortal } from './components/ParentPortal';
import { LobbyDisplay } from './components/LobbyDisplay';
import { MyTaekHome } from './components/MyTaekHome';
import { LoginPage } from './pages/Login';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { ResetPasswordPage } from './pages/ResetPassword';
import { LandingPage } from './pages/Landing';
import { PricingPage } from './pages/PricingPage';
import { AccountLockedPage } from './pages/AccountLockedPage';
import { SubscriptionSuccess } from './pages/SubscriptionSuccess';
import { SuperAdminLogin } from './pages/SuperAdminLogin';
import { SuperAdminDashboardRoute, SuperAdminClubsRoute, SuperAdminParentsRoute, SuperAdminPaymentsRoute, SuperAdminAnalyticsRoute, SuperAdminTrainingRoute } from './components/SuperAdminRoutes';
import { TrialBanner } from './components/TrialBanner';
import { ImpersonationBanner, isImpersonating } from './components/ImpersonationBanner';
import { DEMO_MODE_KEY, isDemoModeEnabled } from './components/demoData';
import {
    getOnboardingMessage,
} from './services/geminiService';
import {
    initSubscription,
    loadSubscription,
    saveSubscription,
    updateSubscriptionPlan,
    checkAccountStatus,
} from './services/subscriptionService';
import { SEO } from './components/SEO';
import AwakeningRitual from './components/AwakeningRitual';
import type { SignupData, WizardData, Student, SubscriptionStatus, SubscriptionPlanId } from './types';

// Wizard Route Component - Handles both fresh signups and returning owners
interface WizardRouteProps {
    signupData: SignupData | null;
    loggedInUserType: 'owner' | 'coach' | 'parent' | null;
    onSetupComplete: (data: WizardData) => void;
}

const WizardRoute: React.FC<WizardRouteProps> = ({ signupData, loggedInUserType, onSetupComplete }) => {
    // Check impersonation mode FIRST during initialization - sessionStorage takes priority over props/localStorage
    const [initialData, setInitialData] = useState<SignupData | null>(() => {
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        console.log('[WizardRoute] Initializing, isImpersonating:', isImpersonating);
        if (isImpersonating) {
            const impersonationData = sessionStorage.getItem('impersonation_signup_data');
            if (impersonationData) {
                try {
                    const parsed = JSON.parse(impersonationData);
                    console.log('[WizardRoute] Using impersonation signup data:', parsed.clubName);
                    return parsed;
                } catch (e) {
                    console.error('Failed to parse impersonation signup data', e);
                }
            }
            console.log('[WizardRoute] Impersonating but no signup data found');
        }
        // Fall back to prop or localStorage
        if (signupData) {
            console.log('[WizardRoute] Using signupData prop');
            return signupData;
        }
        const saved = localStorage.getItem('taekup_signup_data');
        console.log('[WizardRoute] Using localStorage signup data:', !!saved);
        return saved ? JSON.parse(saved) : null;
    });
    
    React.useEffect(() => {
        // Only run this effect for non-impersonation mode when data is missing
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        if (isImpersonating) return; // Already handled in useState initializer
        
        if (!initialData && loggedInUserType === 'owner') {
            const saved = localStorage.getItem('taekup_signup_data');
            if (saved) {
                try {
                    setInitialData(JSON.parse(saved));
                } catch (e) {
                    console.error('Failed to parse saved signup data', e);
                }
            }
        }
    }, [initialData, loggedInUserType]);
    
    const navigate = useNavigate();
    
    // Check if impersonating - during impersonation we stay on wizard, don't allow skip to demo
    const isImpersonatingCheck = !!sessionStorage.getItem('impersonationToken');
    console.log('[WizardRoute] Render - hasInitialData:', !!initialData, 'isImpersonating:', isImpersonatingCheck);
    
    if (initialData) {
        return (
            <>
                <SEO title="Setup | TaekUp" />
                <SetupWizard 
                    initialData={initialData} 
                    clubId={initialData.clubId}
                    onComplete={onSetupComplete}
                    onSkipToDemo={isImpersonatingCheck ? undefined : () => {
                        // Ensure session is persisted before navigating
                        localStorage.setItem('taekup_user_type', 'owner');
                        localStorage.setItem('taekup_user_name', initialData.clubName || 'Owner');
                        if (initialData.clubId) {
                            localStorage.setItem('taekup_club_id', initialData.clubId);
                        }
                        // Force page reload to ensure React state picks up localStorage changes
                        window.location.href = '/app/admin';
                    }}
                />
            </>
        );
    }
    
    if (loggedInUserType === 'owner') {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading your setup...</p>
                </div>
            </div>
        );
    }
    
    return <Navigate to="/landing" replace />;
};

// Demo Mode Banner - compact indicator when demo mode is active
const DemoModeBanner: React.FC = () => {
    const [isDemo, setIsDemo] = useState(() => isDemoModeEnabled());
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Check if user is logged in - demo badge should only show when logged in
    const isLoggedIn = localStorage.getItem('taekup_user_type') !== null;
    
    // Don't show if demo mode is off OR if user is not logged in
    if (!isDemo || !isLoggedIn) return null;
    
    const handleExitDemo = () => {
        localStorage.setItem(DEMO_MODE_KEY, 'false');
        window.location.href = '/wizard';
    };
    
    return (
        <div className="fixed top-20 right-4 z-50">
            {isExpanded ? (
                <div className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-purple-500/30 shadow-xl p-3 w-56">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-xs font-semibold">Demo Mode</span>
                        <button onClick={() => setIsExpanded(false)} className="text-gray-400 hover:text-white">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-gray-400 text-xs mb-3">Sample data only. No saves.</p>
                    <button
                        onClick={handleExitDemo}
                        className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-xs rounded-lg transition-all hover:opacity-90"
                    >
                        Start My Own Dojo
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-600/90 backdrop-blur-sm text-white text-xs font-medium rounded-full shadow-lg hover:bg-purple-500 transition-all"
                >
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                    Demo
                </button>
            )}
        </div>
    );
};

// Main App Component with Router
const App: React.FC = () => {
    const [signupData, setSignupDataState] = useState<SignupData | null>(() => {
        const saved = localStorage.getItem('taekup_signup_data');
        return saved ? JSON.parse(saved) : null;
    });
    const [finalWizardData, setFinalWizardDataState] = useState<WizardData | null>(() => {
        // Check sessionStorage first for impersonation mode (Super Admin "View As")
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        console.log('[App] Initializing finalWizardData, isImpersonating:', isImpersonating);
        if (isImpersonating) {
            const impersonationData = sessionStorage.getItem('impersonation_wizard_data');
            console.log('[App] Impersonation wizard data:', impersonationData ? 'found' : 'NOT FOUND');
            if (impersonationData) {
                const parsed = JSON.parse(impersonationData);
                console.log('[App] Using impersonation wizard data, clubName:', parsed.clubName);
                return parsed;
            }
            // During impersonation, return null if no impersonation_wizard_data
            // We should NOT fall back to localStorage
            console.log('[App] Impersonating but no wizard data - returning null');
            return null;
        }
        // Regular mode: use localStorage
        const saved = localStorage.getItem('taekup_wizard_data');
        console.log('[App] Regular mode, localStorage wizard data:', saved ? 'found' : 'NOT FOUND');
        return saved ? JSON.parse(saved) : null;
    });
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(() => {
        return loadSubscription();
    });
    const [onboardingMessage, setOnboardingMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [loggedInUserType, setLoggedInUserType] = useState<'owner' | 'coach' | 'parent' | null>(() => {
        // Check sessionStorage first for impersonation mode
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        if (isImpersonating) {
            const impersonationType = sessionStorage.getItem('impersonation_user_type');
            if (impersonationType === 'owner' || impersonationType === 'coach' || impersonationType === 'parent') {
                return impersonationType;
            }
        }
        // Regular mode: use localStorage
        const savedType = localStorage.getItem('taekup_user_type');
        if (savedType === 'owner' || savedType === 'coach' || savedType === 'parent') {
            return savedType;
        }
        return null;
    });
    const [loggedInUserName, setLoggedInUserName] = useState<string | null>(() => {
        // Check sessionStorage first for impersonation mode
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        if (isImpersonating) {
            return sessionStorage.getItem('impersonation_user_name');
        }
        return localStorage.getItem('taekup_user_name');
    });
    const [parentStudentId, setParentStudentId] = useState<string | null>(() => {
        return localStorage.getItem('taekup_student_id');
    });
    const [showPricing, setShowPricing] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isVerifyingSubscription, setIsVerifyingSubscription] = useState(true);

    const setSignupData = useCallback((data: SignupData | null) => {
        setSignupDataState(data);
        if (data) {
            localStorage.setItem('taekup_signup_data', JSON.stringify(data));
        } else {
            localStorage.removeItem('taekup_signup_data');
        }
    }, []);

    const setFinalWizardData = useCallback((data: WizardData | null) => {
        setFinalWizardDataState(data);
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        if (data) {
            if (isImpersonating) {
                sessionStorage.setItem('impersonation_wizard_data', JSON.stringify(data));
            } else {
                localStorage.setItem('taekup_wizard_data', JSON.stringify(data));
            }
        } else {
            if (isImpersonating) {
                sessionStorage.removeItem('impersonation_wizard_data');
            } else {
                localStorage.removeItem('taekup_wizard_data');
            }
        }
    }, []);

    const handleSignupSuccess = useCallback((data: SignupData) => {
        const dataWithTrial = {
            ...data,
            trialStartDate: new Date().toISOString()
        };
        setSignupData(dataWithTrial);
        
        const newSubscription = initSubscription(dataWithTrial.trialStartDate);
        setSubscription(newSubscription);
        saveSubscription(newSubscription);
    }, [setSignupData]);

    const handleSelectPlan = useCallback((planId: SubscriptionPlanId) => {
        if (subscription) {
            const updated = updateSubscriptionPlan(subscription, planId);
            setSubscription(updated);
            setShowPricing(false);
        }
    }, [subscription]);

    // Auto-verify subscription status on app load for owners - ALWAYS verify with server
    useEffect(() => {
        if (loggedInUserType === 'owner') {
            // Check for impersonation mode first (Super Admin "View As")
            const isImpersonatingNow = !!sessionStorage.getItem('impersonationToken');
            const clubId = isImpersonatingNow 
                ? sessionStorage.getItem('impersonationClubId')
                : localStorage.getItem('taekup_club_id');
            if (clubId) {
                setIsVerifyingSubscription(true);
                console.log('[App] Verifying subscription status with server (always)...');
                fetch(`/api/club/${clubId}/verify-subscription`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                .then(res => res.json())
                .then(result => {
                    console.log('[App] Subscription verification result:', result);
                    const existingSub = loadSubscription();
                    
                    // Use server's trial end date (source of truth)
                    // If server has trial_end, use it; if not but has trial_start, calculate from start
                    // Only use 14-day-from-now fallback for brand new clubs with no trial data
                    let trialEndDate: string;
                    if (result.trialEnd) {
                        trialEndDate = new Date(result.trialEnd).toISOString();
                    } else if (result.trialStart) {
                        // Calculate trial end from trial start (14 days)
                        const trialStart = new Date(result.trialStart);
                        trialEndDate = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
                    } else if (existingSub?.trialEndDate) {
                        trialEndDate = existingSub.trialEndDate;
                    } else {
                        // Last resort: new trial
                        trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
                    }
                    
                    // Trust the server's trial status - it handles timezone correctly
                    const isTrialExpired = result.trialStatus === 'expired';
                    
                    if (result.success && result.hasActiveSubscription) {
                        // Has active paid subscription
                        const updatedSubscription = {
                            ...existingSub,
                            planId: (result.planId || 'starter') as any,
                            isTrialActive: false,
                            isLocked: false,
                            trialEndDate
                        };
                        setSubscription(updatedSubscription);
                        saveSubscription(updatedSubscription);
                        console.log('[App] Active subscription found - dashboard unlocked');
                    } else if (result.success && !result.hasActiveSubscription) {
                        // No active subscription - check if trial expired
                        const updatedSubscription = {
                            ...existingSub,
                            planId: undefined,
                            isTrialActive: !isTrialExpired,
                            isLocked: isTrialExpired,
                            trialEndDate
                        };
                        setSubscription(updatedSubscription);
                        saveSubscription(updatedSubscription);
                        console.log('[App] No subscription - trial expired:', isTrialExpired, 'trialEndDate:', trialEndDate);
                    }
                })
                .catch(err => console.error('[App] Verification failed:', err))
                .finally(() => setIsVerifyingSubscription(false));
            } else {
                setIsVerifyingSubscription(false);
            }
        } else {
            setIsVerifyingSubscription(false);
        }
        
        // Also check for Stripe checkout success URL params
        const params = new URLSearchParams(window.location.search);
        const checkoutSuccess = params.get('checkout') === 'success' || params.get('session_id');
        if (checkoutSuccess) {
            // Clean up URL parameters
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
        }
    }, [loggedInUserType]);

    // Listen for subscription updates from BillingTab
    useEffect(() => {
        const handleSubscriptionUpdate = () => {
            console.log('[App] Received subscription-updated event, reloading from localStorage');
            const updated = loadSubscription();
            if (updated) {
                setSubscription(updated);
            }
        };
        window.addEventListener('subscription-updated', handleSubscriptionUpdate);
        return () => window.removeEventListener('subscription-updated', handleSubscriptionUpdate);
    }, []);

    const handleSetupComplete = useCallback(async (data: WizardData) => {
        setIsProcessing(true);
        setFinalWizardData(data);

        // Get clubId from signupData
        const clubId = signupData?.clubId;

        // Invite coaches via backend API (sends real emails via SendGrid)
        if (clubId && data.coaches.length > 0) {
            const coachInvitePromises = data.coaches.map(coach =>
                fetch('/api/invite-coach', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clubId,
                        name: coach.name,
                        email: coach.email,
                        location: coach.location,
                        assignedClasses: coach.assignedClasses
                    })
                }).catch(err => console.error('Failed to invite coach:', coach.email, err))
            );
            await Promise.all(coachInvitePromises);
        }

        // Add students via backend API (sends real emails via SendGrid)
        // - Notifies owner when student is added
        // - Sends parent welcome email if parent email provided
        if (clubId && data.students.length > 0) {
            const studentAddPromises = data.students.map(student => {
                const belt = data.belts.find(b => b.id === student.beltId);
                return fetch('/api/students', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clubId,
                        name: student.name,
                        parentEmail: student.parentEmail || null,
                        parentName: student.parentName || null,
                        parentPhone: student.parentPhone || null,
                        belt: belt?.name || 'White',
                        birthdate: student.birthday || null
                    })
                }).catch(err => console.error('Failed to add student:', student.name, err));
            });
            await Promise.all(studentAddPromises);
        }

        // Save wizard data to database for persistence across logins
        if (clubId) {
            try {
                await fetch('/api/club/save-wizard-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clubId, wizardData: data })
                });
                console.log('[Wizard] Saved wizard data to database');
            } catch (err) {
                console.error('Failed to save wizard data:', err);
            }
        }

        const message = await getOnboardingMessage();
        setOnboardingMessage(message);

        await new Promise(resolve => setTimeout(resolve, 500));

        setIsProcessing(false);
        setLoggedInUserType('owner');
        setLoggedInUserName(data.ownerName);
        
        // Save login state to localStorage for persistence
        localStorage.setItem('taekup_user_type', 'owner');
        localStorage.setItem('taekup_user_name', data.ownerName);
        if (clubId) {
            localStorage.setItem('taekup_club_id', clubId);
        }
    }, [signupData]);

    const handleStudentDataUpdate = useCallback((updatedStudents: Student[]) => {
        setFinalWizardDataState(prevData => {
            if (!prevData) return null;
            const updated = {
                ...prevData,
                students: updatedStudents,
            };
            localStorage.setItem('taekup_wizard_data', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const handleWizardDataUpdate = useCallback(
        (updates: Partial<WizardData>) => {
            setFinalWizardDataState(prevData => {
                if (!prevData) return null;
                const updated = {
                    ...prevData,
                    ...updates,
                };
                
                // Check if in impersonation mode (Super Admin "View As")
                const isImpersonating = !!sessionStorage.getItem('impersonationToken');
                if (isImpersonating) {
                    sessionStorage.setItem('impersonation_wizard_data', JSON.stringify(updated));
                } else {
                    localStorage.setItem('taekup_wizard_data', JSON.stringify(updated));
                }
                
                // Also save to database for persistence across logins
                // Check both regular clubId and impersonation clubId (for Super Admin view-as mode)
                const clubId = isImpersonating 
                    ? sessionStorage.getItem('impersonationClubId')
                    : (localStorage.getItem('taekup_club_id') || localStorage.getItem('clubId'));
                if (clubId) {
                    fetch('/api/club/save-wizard-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clubId, wizardData: updated })
                    }).catch(err => console.error('Failed to save wizard data:', err));
                }
                
                return updated;
            });
        },
        []
    );

    const handleViewStudentPortal = useCallback((studentId: string) => {
        setParentStudentId(studentId);
    }, []);

    const handleLoginSuccess = useCallback(
        async (userType: 'owner' | 'coach' | 'parent', userName: string, studentId?: string, userData?: any) => {
            setIsLoadingData(true);
            setLoggedInUserType(userType);
            setLoggedInUserName(userName);
            
            // Clear any impersonation data on normal login
            // This ensures the yellow banner only shows during Super Admin impersonation
            sessionStorage.removeItem('impersonationToken');
            sessionStorage.removeItem('impersonationClubId');
            sessionStorage.removeItem('impersonationClubName');
            sessionStorage.removeItem('impersonation_wizard_data');
            sessionStorage.removeItem('impersonation_user_type');
            sessionStorage.removeItem('impersonation_user_name');
            sessionStorage.removeItem('impersonation_club_id');
            
            // Save login state to localStorage
            localStorage.setItem('taekup_user_type', userType);
            localStorage.setItem('taekup_user_name', userName);
            if (studentId) {
                setParentStudentId(studentId);
                localStorage.setItem('taekup_student_id', studentId);
            }
            if (userData?.clubId) {
                // Store clubId directly for reliable access
                localStorage.setItem('taekup_club_id', userData.clubId);
                setSignupDataState(prev => {
                    const newData = {
                        clubName: prev?.clubName || userData.clubName || '',
                        email: prev?.email || userData.email || '',
                        country: prev?.country || 'US',
                        clubId: userData.clubId,
                        trialStartDate: prev?.trialStartDate
                    };
                    localStorage.setItem('taekup_signup_data', JSON.stringify(newData));
                    return newData;
                });
                
                // For owners, verify subscription status with Stripe directly
                if (userType === 'owner') {
                    try {
                        const verifyResponse = await fetch(`/api/club/${userData.clubId}/verify-subscription`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const verifyResult = await verifyResponse.json();
                        console.log('[Login] Subscription verification:', verifyResult);
                        
                        const existingSubscription = loadSubscription();
                        if (verifyResult.success && verifyResult.hasActiveSubscription) {
                            const updatedSubscription = {
                                ...existingSubscription,
                                planId: 'starter' as const,
                                isTrialActive: false,
                                isLocked: false,
                                trialEndDate: existingSubscription?.trialEndDate || new Date().toISOString()
                            };
                            setSubscription(updatedSubscription);
                            saveSubscription(updatedSubscription);
                            console.log('[Login] Updated subscription: active Stripe subscription found');
                        } else if (verifyResult.success && !verifyResult.hasActiveSubscription) {
                            // No active subscription - ensure trial banner shows
                            const updatedSubscription = {
                                ...existingSubscription,
                                planId: undefined,
                                isTrialActive: true,
                                isLocked: false,
                                trialEndDate: existingSubscription?.trialEndDate || new Date().toISOString()
                            };
                            setSubscription(updatedSubscription);
                            saveSubscription(updatedSubscription);
                            console.log('[Login] No active subscription - trial banner should show');
                        }
                    } catch (verifyErr) {
                        console.error('[Login] Subscription verification failed:', verifyErr);
                        // Fall back to checking trialStatus from login response
                        if (userData.trialStatus === 'converted') {
                            const existingSubscription = loadSubscription();
                            if (existingSubscription && !existingSubscription.planId) {
                                const updatedSubscription = {
                                    ...existingSubscription,
                                    planId: 'starter' as const,
                                    isTrialActive: false,
                                    isLocked: false
                                };
                                setSubscription(updatedSubscription);
                                saveSubscription(updatedSubscription);
                                console.log('[Login] Updated subscription from trialStatus fallback');
                            }
                        }
                    }
                } else if (userData.trialStatus === 'converted') {
                    // For non-owners, still check trialStatus from login response
                    const existingSubscription = loadSubscription();
                    if (existingSubscription && !existingSubscription.planId) {
                        const updatedSubscription = {
                            ...existingSubscription,
                            planId: 'starter' as const,
                            isTrialActive: false,
                            isLocked: false
                        };
                        setSubscription(updatedSubscription);
                        saveSubscription(updatedSubscription);
                        console.log('[Login] Updated subscription status: trial converted to paid');
                    }
                }

                // For owners, try to fetch wizard data from database OR use localStorage fallback
                if (userType === 'owner') {
                    try {
                        const response = await fetch(`/api/club/${userData.clubId}/data`);
                        const data = await response.json();
                        if (data.success && data.wizardData) {
                            // Merge club settings (like worldRankingsEnabled) into wizardData
                            const mergedData = {
                                ...data.wizardData,
                                worldRankingsEnabled: data.club?.worldRankingsEnabled || false
                            };
                            setFinalWizardData(mergedData);
                            localStorage.setItem('taekup_wizard_data', JSON.stringify(mergedData));
                            console.log('[Login] Restored wizard data from database, worldRankingsEnabled:', mergedData.worldRankingsEnabled);
                        } else {
                            // Fallback to localStorage if database doesn't have wizard data
                            const localData = localStorage.getItem('taekup_wizard_data');
                            if (localData) {
                                setFinalWizardData(JSON.parse(localData));
                                console.log('[Login] Using localStorage wizard data as fallback');
                            }
                        }
                    } catch (err) {
                        console.error('[Login] Failed to fetch wizard data:', err);
                        // Fallback to localStorage on error
                        const localData = localStorage.getItem('taekup_wizard_data');
                        if (localData) {
                            setFinalWizardData(JSON.parse(localData));
                            console.log('[Login] Using localStorage wizard data after fetch error');
                        }
                    }
                } else {
                    // CRITICAL: For non-owners (coaches, parents), update React state with fresh wizard data
                    // Login.tsx saves fresh wizard data to localStorage, we need to pick it up here
                    const freshWizardData = localStorage.getItem('taekup_wizard_data');
                    if (freshWizardData) {
                        try {
                            const parsed = JSON.parse(freshWizardData);
                            setFinalWizardData(parsed);
                            console.log('[Login] Updated wizard data state with fresh localStorage data for', userType);
                        } catch (e) {
                            console.error('[Login] Failed to parse fresh wizard data:', e);
                        }
                    }
                }
            } else {
                // No clubId - still try to refresh wizard data from localStorage for all user types
                const freshWizardData = localStorage.getItem('taekup_wizard_data');
                if (freshWizardData) {
                    try {
                        const parsed = JSON.parse(freshWizardData);
                        setFinalWizardData(parsed);
                        console.log('[Login] Updated wizard data state from localStorage for', userType);
                    } catch (e) {
                        console.error('[Login] Failed to parse fresh wizard data:', e);
                    }
                }
            }
            setIsLoadingData(false);
        },
        [setFinalWizardData, setSubscription]
    );

    const handleLogout = useCallback(() => {
        // Clear React state
        setLoggedInUserType(null);
        setLoggedInUserName(null);
        setParentStudentId(null);
        setSignupData(null);
        setFinalWizardData(null);
        setSubscription(null);
        
        // Clear ALL login and session data from localStorage
        localStorage.removeItem('taekup_user_type');
        localStorage.removeItem('taekup_user_name');
        localStorage.removeItem('taekup_student_id');
        localStorage.removeItem('taekup_signup_data');
        localStorage.removeItem('taekup_wizard_data');
        localStorage.removeItem('taekup_wizard_draft');
        localStorage.removeItem('taekup_club_id');
        localStorage.removeItem('taekup_wizard_complete');
        localStorage.removeItem('taekup_subscription');
        localStorage.removeItem('taekup_user_email');
        
        // Clear impersonation data (sessionStorage)
        sessionStorage.removeItem('impersonationToken');
        sessionStorage.removeItem('impersonationClubId');
        sessionStorage.removeItem('impersonationClubName');
        sessionStorage.removeItem('impersonation_wizard_data');
        sessionStorage.removeItem('impersonation_user_type');
        sessionStorage.removeItem('impersonation_user_name');
        sessionStorage.removeItem('impersonation_club_id');
        
        // Clear demo mode flag on logout
        localStorage.removeItem(DEMO_MODE_KEY);
        
        console.log('[Logout] Cleared all session data including demo mode');
        
        // Redirect to home page
        window.location.href = '/';
    }, [setSignupData, setFinalWizardData]);

    return (
        <BrowserRouter>
            <AppContent
                signupData={signupData}
                finalWizardData={finalWizardData}
                subscription={subscription}
                showPricing={showPricing}
                onboardingMessage={onboardingMessage}
                isProcessing={isProcessing}
                loggedInUserType={loggedInUserType}
                loggedInUserName={loggedInUserName}
                parentStudentId={parentStudentId}
                onSignupSuccess={handleSignupSuccess}
                onSetupComplete={handleSetupComplete}
                onStudentDataUpdate={handleStudentDataUpdate}
                onWizardDataUpdate={handleWizardDataUpdate}
                onViewStudentPortal={handleViewStudentPortal}
                onLoginSuccess={handleLoginSuccess}
                onLogout={handleLogout}
                onSelectPlan={handleSelectPlan}
                onShowPricing={() => setShowPricing(true)}
                onHidePricing={() => setShowPricing(false)}
                isLoadingData={isLoadingData}
                isVerifyingSubscription={isVerifyingSubscription}
            />
        </BrowserRouter>
    );
};

interface AppContentProps {
    signupData: SignupData | null;
    finalWizardData: WizardData | null;
    subscription: SubscriptionStatus | null;
    showPricing: boolean;
    onboardingMessage: string;
    isProcessing: boolean;
    loggedInUserType: 'owner' | 'coach' | 'parent' | null;
    loggedInUserName: string | null;
    parentStudentId: string | null;
    onSignupSuccess: (data: SignupData) => void;
    onSetupComplete: (data: WizardData) => void;
    onStudentDataUpdate: (students: Student[]) => void;
    onWizardDataUpdate: (updates: Partial<WizardData>) => void;
    onViewStudentPortal: (studentId: string) => void;
    onLoginSuccess: (userType: 'owner' | 'coach' | 'parent', userName: string, studentId?: string, userData?: any) => void;
    onLogout: () => void;
    onSelectPlan: (planId: SubscriptionPlanId) => void;
    onShowPricing: () => void;
    onHidePricing: () => void;
    isLoadingData: boolean;
    isVerifyingSubscription: boolean;
}

const AppContent: React.FC<AppContentProps> = ({
    signupData,
    finalWizardData,
    subscription,
    showPricing,
    onboardingMessage,
    isProcessing,
    loggedInUserType,
    loggedInUserName,
    parentStudentId,
    onSignupSuccess,
    onSetupComplete,
    onStudentDataUpdate,
    onWizardDataUpdate,
    onViewStudentPortal,
    onLoginSuccess,
    onLogout,
    onSelectPlan,
    onShowPricing,
    onHidePricing,
    isLoadingData,
    isVerifyingSubscription,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isAppSubdomain = window.location.hostname.startsWith('app.');
    const isDojangTV = location.pathname === '/app/tv';
    const isMyTaekHome = location.pathname === '/';
    const isMyTaekPage = location.pathname === '/';
    const isSuperAdmin = location.pathname.startsWith('/super-admin');
    const taekBotColorScheme: TaekBotColorScheme = isMyTaekPage ? 'red' : 'cyan';
    
    const accountStatus = finalWizardData && subscription 
        ? checkAccountStatus(finalWizardData.students, subscription)
        : { isLocked: false, requiredPlan: null, daysRemaining: 14 };
    
    if (showPricing && finalWizardData) {
        const clubId = signupData?.clubId || localStorage.getItem('taekup_club_id') || undefined;
        // Use actual club owner email from wizard data (most reliable), fallback to signupData/localStorage
        const email = finalWizardData.ownerEmail || signupData?.email || localStorage.getItem('taekup_user_email') || undefined;
        console.log('[App] PricingPage email:', email, 'ownerEmail:', finalWizardData.ownerEmail);
        return (
            <PricingPage
                students={finalWizardData.students}
                currentPlanId={subscription?.planId}
                onSelectPlan={onSelectPlan}
                onBack={onHidePricing}
                clubId={clubId}
                email={email}
            />
        );
    }
    
    // Only show locked page AFTER subscription verification completes
    if (!isVerifyingSubscription && accountStatus.isLocked && finalWizardData && loggedInUserType) {
        const isOwner = loggedInUserType === 'owner';
        const isTrialExpired = !subscription?.planId;
        const clubId = signupData?.clubId || localStorage.getItem('taekup_club_id') || undefined;
        const ownerEmail = finalWizardData.ownerEmail || signupData?.email || localStorage.getItem('taekup_user_email') || undefined;
        return (
            <AccountLockedPage
                students={finalWizardData.students}
                clubName={finalWizardData.clubName}
                clubId={clubId}
                email={ownerEmail}
                isOwner={isOwner}
                isTrialExpired={isTrialExpired}
                onLogout={onLogout}
            />
        );
    }

    const showImpersonationPadding = isImpersonating();
    
    return (
        <div className={`min-h-screen bg-gray-900 text-gray-100 font-sans ${showImpersonationPadding ? 'pt-12' : ''}`}>
            <ImpersonationBanner />
            <DemoModeBanner />
            {subscription && loggedInUserType === 'owner' && finalWizardData && !isDojangTV && !isMyTaekHome && !isSuperAdmin && (
                <TrialBanner 
                    subscription={subscription} 
                    onUpgradeClick={onShowPricing}
                />
            )}
            {!isDojangTV && !isMyTaekHome && (
                <Header
                    isLoggedIn={!!loggedInUserType}
                    hasSignedUp={!!signupData}
                    hasCompletedWizard={!!finalWizardData}
                    userType={loggedInUserType}
                    onLogout={onLogout}
                />
            )}
            <main>
                <Routes>
                    {/* Home / Landing */}
                    <Route
                        path="/"
                        element={
                            isAppSubdomain ? (
                                <Navigate to="/login" replace />
                            ) : loggedInUserType === 'owner' && !finalWizardData ? (
                                <Navigate to="/wizard" replace />
                            ) : (
                                <MyTaekHome onNavigate={() => {}} />
                            )
                        }
                    />

                    {/* Landing Page */}
                    <Route
                        path="/landing"
                        element={<LandingPage onSignupSuccess={onSignupSuccess} />}
                    />

                    {/* Public Pricing Page */}
                    <Route
                        path="/pricing"
                        element={
                            <>
                                <SEO title="Pricing | TaekUp" />
                                <PricingPage
                                    students={[]}
                                    onSelectPlan={() => navigate('/login')}
                                />
                            </>
                        }
                    />

                    {/* Subscription Success Page (after Stripe checkout) */}
                    <Route
                        path="/subscription-success"
                        element={<SubscriptionSuccess />}
                    />

                    {/* Login Page */}
                    <Route
                        path="/login"
                        element={
                            <LoginPage
                                signupData={signupData}
                                finalWizardData={finalWizardData}
                                onLoginSuccess={onLoginSuccess}
                            />
                        }
                    />

                    {/* Forgot Password Page */}
                    <Route
                        path="/forgot-password"
                        element={<ForgotPasswordPage />}
                    />

                    {/* Reset Password Page */}
                    <Route
                        path="/reset-password"
                        element={<ResetPasswordPage />}
                    />

                    {/* Setup Wizard */}
                    <Route
                        path="/wizard"
                        element={
                            <WizardRoute 
                                signupData={signupData}
                                loggedInUserType={loggedInUserType}
                                onSetupComplete={onSetupComplete}
                            />
                        }
                    />

                    {/* App Routes (Protected) */}
                    <Route
                        path="/app"
                        element={
                            finalWizardData && loggedInUserType ? (
                                <DashboardView
                                    data={finalWizardData}
                                    onboardingMessage={onboardingMessage}
                                />
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />

                    <Route
                        path="/app/coach"
                        element={
                            finalWizardData && (loggedInUserType === 'coach' || loggedInUserType === 'owner') ? (
                                <CoachDashboardRoute
                                    data={finalWizardData}
                                    onUpdateStudents={onStudentDataUpdate}
                                    onUpdateData={onWizardDataUpdate}
                                    coachName={loggedInUserName || finalWizardData.ownerName}
                                    onBack={onLogout}
                                    userType={loggedInUserType}
                                    clubId={signupData?.clubId || localStorage.getItem('taekup_club_id') || sessionStorage.getItem('impersonate_clubId') || undefined}
                                />
                            ) : loggedInUserType === 'parent' ? (
                                <Navigate to={`/app/parent/${parentStudentId || 'unknown'}`} replace />
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />

                    <Route
                        path="/app/admin"
                        element={
                            <AdminRouteGuard
                                finalWizardData={finalWizardData}
                                loggedInUserType={loggedInUserType}
                                isLoadingData={isLoadingData}
                                signupData={signupData}
                                onWizardDataUpdate={onWizardDataUpdate}
                                onViewStudentPortal={onViewStudentPortal}
                            />
                        }
                    />

                    <Route
                        path="/app/parent/:studentId"
                        element={
                            finalWizardData && loggedInUserType ? (
                                <ParentPortalRoute
                                    data={finalWizardData}
                                    parentStudentId={parentStudentId}
                                    loggedInUserType={loggedInUserType}
                                    onLogout={onLogout}
                                    onUpdateStudents={onStudentDataUpdate}
                                />
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />

                    <Route
                        path="/app/tv"
                        element={
                            finalWizardData && loggedInUserType === 'owner' ? (
                                <>
                                    <SEO title="TV Mode | TaekUp" />
                                    <LobbyDisplay
                                        data={finalWizardData}
                                        onClose={() => window.history.back()}
                                    />
                                </>
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />

                    {/* Super Admin Routes */}
                    <Route
                        path="/super-admin/login"
                        element={
                            <SuperAdminLogin
                                onLoginSuccess={(token) => {
                                    localStorage.setItem('superAdminToken', token);
                                    window.location.href = '/super-admin/dashboard';
                                }}
                            />
                        }
                    />
                    <Route
                        path="/super-admin/dashboard"
                        element={
                            <SuperAdminDashboardRoute />
                        }
                    />
                    <Route
                        path="/super-admin/clubs"
                        element={
                            <SuperAdminClubsRoute />
                        }
                    />
                    <Route
                        path="/super-admin/parents"
                        element={
                            <SuperAdminParentsRoute />
                        }
                    />
                    <Route
                        path="/super-admin/payments"
                        element={
                            <SuperAdminPaymentsRoute />
                        }
                    />
                    <Route
                        path="/super-admin/analytics"
                        element={
                            <SuperAdminAnalyticsRoute />
                        }
                    />
                    <Route
                        path="/super-admin/training"
                        element={
                            <SuperAdminTrainingRoute />
                        }
                    />
                    <Route
                        path="/super-admin"
                        element={<Navigate to="/super-admin/login" replace />}
                    />

                    {/* Awakening Ritual redirect to main page */}
                    <Route path="/awakening" element={<Navigate to="/" replace />} />

                    {/* Catch-all redirect */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            {!isDojangTV && <Footer />}
            {!isDojangTV && <TaekBot colorScheme={taekBotColorScheme} />}
        </div>
    );
};

// Coach Dashboard Route Component
interface CoachDashboardRouteProps {
    data: WizardData;
    coachName: string;
    onUpdateStudents: (students: Student[]) => void;
    onUpdateData?: (data: Partial<WizardData>) => void;
    onBack: () => void;
    userType: 'owner' | 'coach' | 'parent';
    clubId?: string;
}

const CoachDashboardRoute: React.FC<CoachDashboardRouteProps> = ({
    data,
    coachName,
    onUpdateStudents,
    onUpdateData,
    onBack,
    userType,
    clubId,
}) => {
    const navigate = useNavigate();
    
    const handleGoToAdmin = () => {
        navigate('/app/admin');
    };

    return (
        <>
            <SEO title="Coach Dashboard | TaekUp" />
            <CoachDashboard
                data={data}
                onUpdateStudents={onUpdateStudents}
                onUpdateData={onUpdateData}
                coachName={coachName}
                onBack={onBack}
                userType={userType}
                onGoToAdmin={handleGoToAdmin}
                clubId={clubId}
            />
        </>
    );
};

// Parent Portal Route Component
interface ParentPortalRouteProps {
    data: WizardData;
    parentStudentId: string | null;
    loggedInUserType: 'owner' | 'coach' | 'parent' | null;
    onLogout: () => void;
    onUpdateStudents: (students: Student[]) => void;
}

const ParentPortalRoute: React.FC<ParentPortalRouteProps> = ({
    data,
    parentStudentId,
    loggedInUserType,
    onLogout,
    onUpdateStudents,
}) => {
    const { studentId: urlStudentId } = useParams<{ studentId: string }>();
    const navigate = useNavigate();
    
    // Get student ID from localStorage - NEVER generate random IDs
    const getStoredStudentId = (): string | null => {
        const stored = localStorage.getItem("taekup_student_id");
        if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) {
            return stored;
        }
        console.warn('[ParentPortal] No valid student ID in localStorage');
        return null;
    };
    
    const studentId = urlStudentId || parentStudentId || getStoredStudentId();
    
    const [resolvedStudentId, setResolvedStudentId] = React.useState<string | null>(studentId);
    
    let studentToShow: Student | undefined;

    const effectiveStudentId = studentId;
    
    // Check if ID looks like a database UUID
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    console.log('[ParentPortal] Using student ID:', studentId);
    
    // Use resolved UUID if available, otherwise fall back to effectiveStudentId
    const finalStudentId = resolvedStudentId || effectiveStudentId;
    
    // Find the wizard student data first
    const wizardStudent = effectiveStudentId 
        ? data.students.find(s => s.id === effectiveStudentId) || data.students[0]
        : data.students[0];
    
    // Get clubId from localStorage (stored during login)
    const storedClubId = localStorage.getItem('taekup_club_id');
    
    if (wizardStudent) {
        // ALWAYS use resolvedStudentId if available (it's the database UUID)
        // This ensures habits/XP are saved to the correct database record
        // Also include clubId from localStorage for leaderboard API calls
        studentToShow = resolvedStudentId 
            ? { ...wizardStudent, id: resolvedStudentId, clubId: storedClubId || wizardStudent.clubId }
            : { ...wizardStudent, clubId: storedClubId || wizardStudent.clubId };
    }

    if (!studentToShow || !studentId) {
        // No valid student ID - redirect to login
        console.error('[ParentPortal] No valid student ID available, redirecting to login');
        return <Navigate to="/login" replace />;
    }
    
    // ALWAYS wait for resolvedStudentId before rendering - this ensures we have a verified DB UUID
    // This fixes the issue where stale UUIDs that look valid but don't exist in DB cause 500 errors
    if (!resolvedStudentId) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading student data...</p>
                </div>
            </div>
        );
    }

    const handleUpdateStudent = (updatedStudent: Student) => {
        // The updatedStudent.id is the resolvedStudentId (database UUID)
        // But data.students contains the original wizardStudent with local ID
        // We need to update by matching the original local student ID
        const originalLocalId = effectiveStudentId;
        const updatedStudents = data.students.map(s => 
            s.id === originalLocalId ? { ...updatedStudent, id: originalLocalId } : s
        );
        onUpdateStudents(updatedStudents);
    };

    const handleBack = () => {
        if (loggedInUserType === 'owner') {
            navigate('/app/admin');
        } else {
            onLogout();
        }
    };

    return (
        <>
            <SEO title={`Parent Portal - ${studentToShow.name} | TaekUp`} />
            <ParentPortal
                key={studentToShow.id}
                student={studentToShow}
                data={data}
                onBack={handleBack}
                onUpdateStudent={handleUpdateStudent}
            />
        </>
    );
};

// Admin Route Guard - handles loading states and error cases
interface AdminRouteGuardProps {
    finalWizardData: WizardData | null;
    loggedInUserType: 'owner' | 'coach' | 'parent' | null;
    isLoadingData: boolean;
    signupData: SignupData | null;
    onWizardDataUpdate: (updates: Partial<WizardData>) => void;
    onViewStudentPortal: (studentId: string) => void;
}

const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({
    finalWizardData,
    loggedInUserType,
    isLoadingData,
    signupData,
    onWizardDataUpdate,
    onViewStudentPortal,
}) => {
    // Check if in impersonation mode (Super Admin "View As")
    const isImpersonatingSession = !!sessionStorage.getItem('impersonationToken');
    
    // Read user type: check sessionStorage first for impersonation, then props/localStorage
    const localUserType = isImpersonatingSession 
        ? sessionStorage.getItem('impersonation_user_type')
        : localStorage.getItem('taekup_user_type');
    const effectiveUserType = loggedInUserType || localUserType as 'owner' | 'coach' | 'parent' | null;
    
    // Get wizard data: check sessionStorage first for impersonation, then props/localStorage
    let dataToUse = finalWizardData;
    let dataSource = finalWizardData ? 'props' : 'none';
    
    if (!dataToUse) {
        try {
            const saved = isImpersonatingSession 
                ? sessionStorage.getItem('impersonation_wizard_data')
                : localStorage.getItem('taekup_wizard_data');
            if (saved) {
                dataToUse = JSON.parse(saved);
                dataSource = isImpersonatingSession ? 'sessionStorage' : 'localStorage';
            }
        } catch (e) {
            console.error('[AdminRouteGuard] Parse error:', e);
        }
    }
    
    console.log('[AdminRouteGuard] Data source:', dataSource, 'isImpersonating:', isImpersonatingSession, 'clubName:', dataToUse?.clubName);
    
    // Ensure required arrays exist to prevent crashes
    if (dataToUse) {
        dataToUse = {
            ...dataToUse,
            students: dataToUse.students || [],
            coaches: dataToUse.coaches || [],
            belts: dataToUse.belts || [],
            schedule: dataToUse.schedule || [],
            events: dataToUse.events || [],
            curriculum: dataToUse.curriculum || [],
            classes: dataToUse.classes || [],
        };
    }
    
    console.log('[AdminRouteGuard] Render:', { effectiveUserType, hasData: !!dataToUse, isLoadingData });
    
    // Show loading only when explicitly loading from API
    if (isLoadingData) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading your dashboard...</p>
                </div>
            </div>
        );
    }
    
    // Owner with data - show dashboard
    if (dataToUse && effectiveUserType === 'owner') {
        return (
            <AdminDashboardWrapper
                data={dataToUse}
                clubId={signupData?.clubId}
                onUpdateData={onWizardDataUpdate}
                onViewStudentPortal={onViewStudentPortal}
            />
        );
    }
    
    // Owner without data - show setup required
    if (effectiveUserType === 'owner' && !dataToUse) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-bold text-white mb-4">Setup Required</h2>
                    <p className="text-gray-400 mb-6">It looks like you haven't completed your club setup yet. Please complete the setup wizard to access your dashboard.</p>
                    <a href="/wizard" className="inline-block px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors">
                        Complete Setup
                    </a>
                </div>
            </div>
        );
    }
    
    // Coach - redirect to coach dashboard
    if (effectiveUserType === 'coach') {
        return <Navigate to="/app/coach" replace />;
    }
    
    // Parent - redirect to parent portal
    if (effectiveUserType === 'parent') {
        const studentId = localStorage.getItem('taekup_student_id') || 'unknown';
        return <Navigate to={`/app/parent/${studentId}`} replace />;
    }
    
    // Not logged in - redirect to login
    return <Navigate to="/login" replace />;
};

// Admin Dashboard Wrapper with Navigation
interface AdminDashboardWrapperProps {
    data: WizardData;
    clubId?: string;
    onUpdateData: (updates: Partial<WizardData>) => void;
    onViewStudentPortal: (studentId: string) => void;
}

const AdminDashboardWrapper: React.FC<AdminDashboardWrapperProps> = ({
    data,
    clubId,
    onUpdateData,
    onViewStudentPortal,
}) => {
    const navigate = useNavigate();
    
    // Check if in impersonation mode (Super Admin "View As")
    const isImpersonatingSession = !!sessionStorage.getItem('impersonationToken');
    
    console.log('[AdminDashboardWrapper] Rendering with data:', { 
        hasData: !!data, 
        clubName: data?.clubName,
        studentCount: data?.students?.length,
        isImpersonating: isImpersonatingSession
    });
    
    // Use clubId from props, or fall back to sessionStorage/localStorage based on impersonation mode
    const effectiveClubId = clubId 
        || (isImpersonatingSession ? sessionStorage.getItem('impersonationClubId') : null)
        || localStorage.getItem('taekup_club_id') 
        || undefined;
    
    // Persist clubId to appropriate storage for use after page refresh
    React.useEffect(() => {
        if (effectiveClubId) {
            if (isImpersonatingSession) {
                sessionStorage.setItem('impersonationClubId', effectiveClubId);
            } else {
                localStorage.setItem('taekup_club_id', effectiveClubId);
            }
        }
    }, [effectiveClubId, isImpersonatingSession]);
    
    const handleNavigate = (view: 'coach-dashboard' | 'admin-dashboard' | 'parent-portal' | 'dojang-tv') => {
        switch (view) {
            case 'coach-dashboard':
                navigate('/app/coach');
                break;
            case 'admin-dashboard':
                navigate('/app/admin');
                break;
            case 'parent-portal':
                navigate(`/app/parent/${data.students[0]?.id || ''}`);
                break;
            case 'dojang-tv':
                navigate('/app/tv');
                break;
        }
    };

    const handleViewStudentPortalWithNav = (studentId: string) => {
        onViewStudentPortal(studentId);
        navigate(`/app/parent/${studentId}`);
    };
    
    return (
        <>
            <SEO title="Admin Command Center | TaekUp" />
            <AdminDashboard
                data={data}
                clubId={effectiveClubId}
                onBack={() => navigate('/app')}
                onUpdateData={onUpdateData}
                onNavigate={handleNavigate}
                onViewStudentPortal={handleViewStudentPortalWithNav}
            />
        </>
    );
};

// Dashboard View Component
interface DashboardViewProps {
    data: WizardData;
    onboardingMessage: string;
}

const DashboardView: React.FC<DashboardViewProps> = ({ data, onboardingMessage }) => {
    const navigate = useNavigate();

    const hasStudents = data.students && data.students.length > 0;
    const firstStudentId = hasStudents ? data.students[0].id : null;

    const handleParentPortalClick = () => {
        if (!hasStudents) {
            alert('No students added yet. Add a student first to preview the Parent Portal.');
            return;
        }
        navigate(`/app/parent/${firstStudentId}`);
    };

    const roleCards = [
        {
            id: 'coach',
            title: 'Coach Dashboard',
            subtitle: 'Train & Track',
            description: 'Award HonorXP™, track attendance, manage classes, and watch your students grow.',
            icon: (
                <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3"/>
                    <path d="M24 8L28 16H36L30 22L32 30L24 26L16 30L18 22L12 16H20L24 8Z" fill="currentColor"/>
                    <circle cx="24" cy="38" r="4" fill="currentColor" opacity="0.6"/>
                </svg>
            ),
            gradient: 'from-amber-500 via-orange-500 to-red-500',
            glowColor: 'rgba(245, 158, 11, 0.4)',
            borderColor: 'border-amber-500/30',
            href: '/app/coach',
            buttonText: 'Enter Dojo',
        },
        {
            id: 'admin',
            title: 'Admin Dashboard',
            subtitle: 'Command Center',
            description: 'Full control over students, staff, schedules, billing, and DojoMint™ Protocol.',
            icon: (
                <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="8" y="20" width="32" height="20" rx="2" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3"/>
                    <path d="M12 8H36L40 20H8L12 8Z" fill="currentColor" opacity="0.6"/>
                    <path d="M16 28H32M16 34H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="24" cy="14" r="3" fill="currentColor"/>
                </svg>
            ),
            gradient: 'from-cyan-400 via-blue-500 to-indigo-600',
            glowColor: 'rgba(6, 182, 212, 0.5)',
            borderColor: 'border-cyan-400/40',
            href: '/app/admin',
            buttonText: 'Command Center',
            featured: true,
        },
        {
            id: 'parent',
            title: 'Parent Portal',
            subtitle: 'Family View',
            description: hasStudents 
                ? "See your child's journey, achievements, and progress through their martial arts path."
                : "Add a student first to preview the Parent Portal experience.",
            icon: (
                <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="14" r="8" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3"/>
                    <circle cx="24" cy="14" r="4" fill="currentColor"/>
                    <path d="M12 42C12 34 17 28 24 28C31 28 36 34 36 42" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.6"/>
                    <path d="M18 36L24 42L30 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            ),
            gradient: 'from-emerald-400 via-teal-500 to-cyan-500',
            glowColor: 'rgba(16, 185, 129, 0.4)',
            borderColor: 'border-emerald-500/30',
            href: hasStudents ? `/app/parent/${firstStudentId}` : '#',
            buttonText: hasStudents ? 'Preview Portal' : 'Add Student First',
            disabled: !hasStudents,
            onClick: handleParentPortalClick,
        },
    ];

    return (
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-cyan-500/5 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-cyan-500/5 rounded-full"></div>
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIHN0cm9rZT0icmdiYSg2LDE4MiwyMTIsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvZz48L3N2Zz4=')] opacity-30"></div>
            </div>

            <div className="relative z-10 container mx-auto px-6 py-16">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-sm font-medium mb-6">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                        Welcome to Your Dojo
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        {data.clubName || 'Your Martial Arts Academy'}
                    </h1>
                    <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                        "{onboardingMessage}"
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
                    {roleCards.map((card, index) => (
                        <div
                            key={card.id}
                            onClick={card.onClick || undefined}
                            className={`group relative ${card.featured ? 'md:-mt-4 md:mb-4' : ''}`}
                        >
                            {card.featured && (
                                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
                                    <span className="px-4 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold rounded-full shadow-lg shadow-cyan-500/30">
                                        RECOMMENDED
                                    </span>
                                </div>
                            )}
                            
                            <Link
                                to={card.disabled ? '#' : card.href}
                                onClick={(e) => {
                                    if (card.disabled) {
                                        e.preventDefault();
                                        card.onClick?.();
                                    }
                                }}
                                className={`block h-full relative overflow-hidden rounded-2xl transition-all duration-500 
                                    ${card.featured 
                                        ? 'bg-gradient-to-br from-slate-800/90 via-slate-800/80 to-slate-900/90 border-2 border-cyan-500/40 shadow-2xl shadow-cyan-500/20' 
                                        : 'bg-slate-800/60 border border-slate-700/50 hover:border-slate-600/80'}
                                    ${card.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                                    group-hover:shadow-2xl group-hover:-translate-y-2`}
                                style={{
                                    boxShadow: card.featured ? `0 25px 50px -12px ${card.glowColor}` : undefined,
                                }}
                            >
                                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}></div>
                                
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/5 to-transparent rounded-bl-full"></div>
                                
                                <div className="relative p-8">
                                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br ${card.gradient} text-white mb-6 shadow-lg transform group-hover:scale-110 transition-transform duration-300`}
                                        style={{ boxShadow: `0 10px 30px -5px ${card.glowColor}` }}>
                                        {card.icon}
                                    </div>
                                    
                                    <div className="mb-2">
                                        <span className={`text-xs font-semibold uppercase tracking-wider bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                                            {card.subtitle}
                                        </span>
                                    </div>
                                    
                                    <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-cyan-100 transition-colors">
                                        {card.title}
                                    </h2>
                                    
                                    <p className="text-gray-400 text-sm leading-relaxed mb-8 min-h-[60px]">
                                        {card.description}
                                    </p>
                                    
                                    <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300
                                        ${card.featured 
                                            ? `bg-gradient-to-r ${card.gradient} text-white shadow-lg group-hover:shadow-xl` 
                                            : `bg-slate-700/50 text-gray-300 group-hover:bg-gradient-to-r group-hover:${card.gradient} group-hover:text-white`}
                                        ${card.disabled ? '' : 'group-hover:gap-3'}`}
                                        style={card.featured ? { boxShadow: `0 10px 30px -5px ${card.glowColor}` } : undefined}>
                                        {card.buttonText}
                                        {!card.disabled && (
                                            <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                                
                                <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left`}></div>
                            </Link>
                        </div>
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <div className="inline-flex items-center gap-8 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                                </svg>
                            </div>
                            <span>{data.students?.length || 0} Students</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                                </svg>
                            </div>
                            <span>{data.coaches?.length || 0} Coaches</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                                </svg>
                            </div>
                            <span>{data.schedule?.length || 0} Classes</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Header Component
interface HeaderProps {
    isLoggedIn: boolean;
    hasSignedUp?: boolean;
    hasCompletedWizard?: boolean;
    userType?: 'owner' | 'coach' | 'parent' | null;
    onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ isLoggedIn, hasSignedUp, hasCompletedWizard, userType, onLogout }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const isAuthenticated = isLoggedIn || hasSignedUp;
    const isInWizard = location.pathname.includes('/wizard') || location.pathname.includes('/app/setup');
    
    const getLogoDestination = () => {
        if (!isAuthenticated) return '/landing';
        if (isInWizard || !hasCompletedWizard) return '/wizard';
        if (userType === 'owner') return '/app/admin';
        if (userType === 'coach') return '/app/coach';
        if (userType === 'parent') return '/app';
        return '/wizard';
    };

    return (
        <header className="bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-800">
            <div className="w-full px-6 py-3 flex justify-between items-center">
                <div style={{ position: 'relative', zIndex: 99999, pointerEvents: 'auto' }}>
                    <img 
                        src="/taekup-logo.png" 
                        alt="TaekUp" 
                        className="h-16 md:h-[70px] w-auto cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => window.location.href = getLogoDestination()}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    />
                </div>
                <nav className="flex items-center space-x-3 md:space-x-6">
                    {!isAuthenticated && (
                        <>
                            <Link
                                to="/"
                                className="text-gray-300 hover:text-white transition-colors text-xs md:text-sm font-medium"
                            >
                                MyTaek
                            </Link>
                            <a
                                href="#features"
                                className="text-gray-300 hover:text-white transition-colors text-xs md:text-sm font-medium"
                            >
                                Features
                            </a>
                            <Link
                                to="/pricing"
                                className="text-gray-300 hover:text-white transition-colors text-xs md:text-sm font-medium"
                            >
                                Pricing
                            </Link>
                            <Link
                                to="/login"
                                className="text-white hover:text-sky-400 font-bold text-xs md:text-sm transition-colors"
                            >
                                Log In
                            </Link>
                        </>
                    )}
                    {isAuthenticated && (
                        <button
                            onClick={onLogout}
                            className="text-red-400 hover:text-red-300 font-bold text-xs md:text-sm transition-colors"
                        >
                            Log Out
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
};

// Footer Component
const Footer: React.FC = () => (
    <footer className="bg-gray-900 border-t border-gray-800">
        <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
            <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between md:gap-0">
                <div className="text-gray-500 text-xs md:text-sm text-center md:text-left">
                    &copy; {new Date().getFullYear()} MyTaek™. All rights reserved.
                    <span className="hidden sm:inline"> The Martial Arts Revolution.</span>
                </div>
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4 md:gap-6">
                    <div className="flex space-x-4 sm:mr-4 sm:border-r sm:border-gray-700 sm:pr-4 md:mr-6 md:pr-6">
                        <a
                            href="https://youtube.com/@MyTaek"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-red-600 transition-colors p-1"
                            title="YouTube"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                        </a>
                        <a
                            href="https://instagram.com/mytaekofficial"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-pink-500 transition-colors p-1"
                            title="Instagram"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    fillRule="evenodd"
                                    d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.468.99c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </a>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs md:text-sm text-gray-500">
                        <a href="#" className="hover:text-white transition-colors">
                            Privacy
                        </a>
                        <a href="#" className="hover:text-white transition-colors">
                            Terms
                        </a>
                        <a href="#" className="hover:text-white transition-colors whitespace-nowrap">
                            Contact Support
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </footer>
);

export default App;
