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
    const [initialData, setInitialData] = useState<SignupData | null>(signupData);
    
    React.useEffect(() => {
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
    
    if (initialData) {
        return (
            <>
                <SEO title="Setup | TaekUp" />
                <SetupWizard 
                    initialData={initialData} 
                    clubId={initialData.clubId}
                    onComplete={onSetupComplete}
                    onSkipToDemo={() => {
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

// Main App Component with Router
const App: React.FC = () => {
    const [signupData, setSignupDataState] = useState<SignupData | null>(() => {
        const saved = localStorage.getItem('taekup_signup_data');
        return saved ? JSON.parse(saved) : null;
    });
    const [finalWizardData, setFinalWizardDataState] = useState<WizardData | null>(() => {
        // Check sessionStorage first for impersonation mode (Super Admin "View As")
        const isImpersonating = !!sessionStorage.getItem('impersonationToken');
        if (isImpersonating) {
            const impersonationData = sessionStorage.getItem('impersonation_wizard_data');
            return impersonationData ? JSON.parse(impersonationData) : null;
        }
        // Regular mode: use localStorage
        const saved = localStorage.getItem('taekup_wizard_data');
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

    // Auto-verify subscription status on app load for owners
    useEffect(() => {
        if (loggedInUserType === 'owner') {
            const clubId = localStorage.getItem('taekup_club_id');
            if (clubId) {
                // Check if subscription already shows as active
                const currentSub = loadSubscription();
                if (currentSub?.planId && !currentSub?.isTrialActive) {
                    return; // Already active, no need to verify
                }
                
                console.log('[App] Verifying subscription status with Stripe...');
                fetch(`/api/club/${clubId}/verify-subscription`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                .then(res => res.json())
                .then(result => {
                    console.log('[App] Subscription verification result:', result);
                    const existingSub = loadSubscription();
                    if (result.success && result.hasActiveSubscription) {
                        const updatedSubscription = {
                            ...existingSub,
                            planId: 'starter' as const,
                            isTrialActive: false,
                            isLocked: false,
                            trialEndDate: existingSub?.trialEndDate || new Date().toISOString()
                        };
                        setSubscription(updatedSubscription);
                        saveSubscription(updatedSubscription);
                        console.log('[App] Subscription updated - trial banner should now be hidden');
                    } else if (result.success && !result.hasActiveSubscription) {
                        // No active subscription - ensure trial banner shows
                        // Calculate proper trial end date from signup data
                        let trialEndDate = existingSub?.trialEndDate;
                        if (!trialEndDate || trialEndDate === new Date().toISOString().split('T')[0]) {
                            const savedSignup = localStorage.getItem('taekup_signup_data');
                            if (savedSignup) {
                                try {
                                    const parsed = JSON.parse(savedSignup);
                                    if (parsed.trialStartDate) {
                                        const start = new Date(parsed.trialStartDate);
                                        trialEndDate = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
                                    }
                                } catch (e) {}
                            }
                        }
                        if (!trialEndDate) {
                            // Fallback: assume trial started now (14 days from now)
                            trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
                        }
                        const updatedSubscription = {
                            ...existingSub,
                            planId: undefined,
                            isTrialActive: true,
                            isLocked: false,
                            trialEndDate
                        };
                        setSubscription(updatedSubscription);
                        saveSubscription(updatedSubscription);
                        console.log('[App] No active subscription - trial banner should show, trialEndDate:', trialEndDate);
                    }
                })
                .catch(err => console.error('[App] Verification failed:', err));
            }
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
        // Save wizard data before clearing anything (backup)
        const wizardDataBackup = localStorage.getItem('taekup_wizard_data');
        const signupDataBackup = localStorage.getItem('taekup_signup_data');
        const clubIdBackup = localStorage.getItem('taekup_club_id');
        
        setLoggedInUserType(null);
        setLoggedInUserName(null);
        setParentStudentId(null);
        
        // Clear ONLY login session state - NOT app data
        localStorage.removeItem('taekup_user_type');
        localStorage.removeItem('taekup_user_name');
        localStorage.removeItem('taekup_student_id');
        
        // Clear impersonation data (sessionStorage)
        sessionStorage.removeItem('impersonationToken');
        sessionStorage.removeItem('impersonationClubId');
        sessionStorage.removeItem('impersonationClubName');
        sessionStorage.removeItem('impersonation_wizard_data');
        sessionStorage.removeItem('impersonation_user_type');
        sessionStorage.removeItem('impersonation_user_name');
        sessionStorage.removeItem('impersonation_club_id');
        
        // CRITICAL: Restore wizard data if it was accidentally cleared
        if (wizardDataBackup) {
            localStorage.setItem('taekup_wizard_data', wizardDataBackup);
        }
        if (signupDataBackup) {
            localStorage.setItem('taekup_signup_data', signupDataBackup);
        }
        if (clubIdBackup) {
            localStorage.setItem('taekup_club_id', clubIdBackup);
        }
        
        console.log('[Logout] Preserved wizard data:', !!wizardDataBackup);
        
        // Redirect to login page
        window.location.href = '/login';
    }, []);

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
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isAppSubdomain = window.location.hostname.startsWith('app.');
    const isDojangTV = location.pathname === '/app/tv';
    const isMyTaekHome = location.pathname === '/';
    const isMyTaekPage = location.pathname === '/';
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
    
    if (accountStatus.isLocked && finalWizardData && loggedInUserType) {
        const isOwner = loggedInUserType === 'owner';
        const isTrialExpired = !subscription?.planId;
        return (
            <AccountLockedPage
                students={finalWizardData.students}
                clubName={finalWizardData.clubName}
                onSelectPlan={isOwner ? onSelectPlan : undefined}
                isOwner={isOwner}
                isTrialExpired={isTrialExpired}
            />
        );
    }

    const showImpersonationPadding = isImpersonating();
    
    return (
        <div className={`min-h-screen bg-gray-900 text-gray-100 font-sans ${showImpersonationPadding ? 'pt-12' : ''}`}>
            <ImpersonationBanner />
            {subscription && loggedInUserType === 'owner' && !isDojangTV && !isMyTaekHome && (
                <TrialBanner 
                    subscription={subscription} 
                    onUpgradeClick={onShowPricing}
                />
            )}
            {!isDojangTV && !isMyTaekHome && (
                <Header
                    isLoggedIn={!!loggedInUserType}
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
    if (!dataToUse) {
        try {
            const saved = isImpersonatingSession 
                ? sessionStorage.getItem('impersonation_wizard_data')
                : localStorage.getItem('taekup_wizard_data');
            if (saved) {
                dataToUse = JSON.parse(saved);
            }
        } catch (e) {
            console.error('[AdminRouteGuard] Parse error:', e);
        }
    }
    
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
    const themeStyles = {
        modern: 'rounded-lg',
        classic: 'rounded-none',
        minimal: 'rounded-lg border-none shadow-none bg-gray-800/50',
    };

    const bgStyle =
        data.clubPhoto && (data.clubPhoto instanceof Blob)
            ? {
                  backgroundImage: `url(${URL.createObjectURL(data.clubPhoto)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
              }
            : (typeof data.clubPhoto === 'string' && data.clubPhoto
                ? {
                      backgroundImage: `url(${data.clubPhoto})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                  }
                : {});

    const hasStudents = data.students && data.students.length > 0;
    const firstStudentId = hasStudents ? data.students[0].id : null;

    const handleParentPortalClick = (e: React.MouseEvent) => {
        if (!hasStudents) {
            e.preventDefault();
            alert('No students added yet. Add a student first to preview the Parent Portal.');
            return;
        }
        navigate(`/app/parent/${firstStudentId}`);
    };

    return (
        <div className="min-h-[80vh] relative" style={bgStyle}>
            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm"></div>
            <div className="relative z-10 container mx-auto px-6 py-12">
                <div className="max-w-3xl mx-auto text-center bg-gray-800/50 border border-gray-700 p-6 rounded-lg shadow-lg mb-12">
                    <p className="text-xl italic text-gray-300">"{onboardingMessage}"</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    <DashboardCard
                        title="Coach Dashboard"
                        description="Ready to add class points, track attendance, and manage your students."
                        buttonText="Go to Coach View"
                        themeStyle={themeStyles[data.themeStyle]}
                        primaryColor={data.primaryColor}
                        href="/app/coach"
                    />

                    <div 
                        onClick={handleParentPortalClick}
                        className={`bg-gray-800 border border-gray-700/50 shadow-lg flex flex-col p-8 transition-all duration-300 ${themeStyles[data.themeStyle]} text-left w-full
                               hover:border-white/20 hover:-translate-y-1 cursor-pointer ${!hasStudents ? 'opacity-60' : ''}`}
                    >
                        <h2 className="text-2xl font-bold mb-4" style={{ color: data.primaryColor }}>
                            Parent Portal
                        </h2>
                        <p className="text-gray-400 flex-grow mb-6">
                            {hasStudents 
                                ? "Automatically linked to each student. See what parents see with this preview."
                                : "Add a student first to preview the Parent Portal."}
                        </p>
                        <div
                            className="mt-auto text-center font-bold py-2 px-6 rounded-md text-white"
                            style={{
                                backgroundColor: data.primaryColor,
                                boxShadow: `0 4px 14px 0 ${data.primaryColor}40`,
                            }}
                        >
                            {hasStudents ? 'Preview Portal' : 'No Students Yet'}
                        </div>
                    </div>

                    <DashboardCard
                        title="Admin Dashboard"
                        description="Summary metrics, financial overviews, and full system controls are ready."
                        buttonText="Go to Admin Panel"
                        themeStyle={themeStyles[data.themeStyle]}
                        primaryColor={data.primaryColor}
                        href="/app/admin"
                    />
                </div>
            </div>
        </div>
    );
};

interface DashboardCardProps {
    title: string;
    description: string;
    buttonText: string;
    themeStyle: string;
    primaryColor: string;
    href: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
    title,
    description,
    buttonText,
    themeStyle,
    primaryColor,
    href,
}) => {
    return (
        <Link
            to={href}
            className={`bg-gray-800 border border-gray-700/50 shadow-lg flex flex-col p-8 transition-all duration-300 ${themeStyle} text-left w-full
                   hover:border-white/20 hover:-translate-y-1 block`}
        >
            <h2 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>
                {title}
            </h2>
            <p className="text-gray-400 flex-grow mb-6">{description}</p>
            <div
                className="mt-auto text-center font-bold py-2 px-6 rounded-md text-white"
                style={{
                    backgroundColor: primaryColor,
                    boxShadow: `0 4px 14px 0 ${primaryColor}40`,
                }}
            >
                {buttonText}
            </div>
        </Link>
    );
};

// Header Component
interface HeaderProps {
    isLoggedIn: boolean;
    userType?: 'owner' | 'coach' | 'parent' | null;
    onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ isLoggedIn, userType, onLogout }) => {
    const getLogoDestination = () => {
        if (!isLoggedIn) return '/login';
        if (userType === 'owner') return '/app/admin';
        if (userType === 'coach') return '/app/coach';
        if (userType === 'parent') return '/app';
        return '/app';
    };

    return (
        <header className="bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-800">
            <div className="w-full px-6 py-3 flex justify-between items-center">
                <div>
                    <Link
                        to={getLogoDestination()}
                        className="flex hover:scale-105 transition-transform cursor-pointer"
                    >
                        <img src="/taekup-logo.png" alt="TaekUp" style={{ height: '70px' }} />
                    </Link>
                </div>
                <nav className="flex items-center space-x-3 md:space-x-6">
                    {!isLoggedIn && (
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
                    {isLoggedIn && (
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
        <div className="container mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center">
            <div className="text-gray-500 text-sm mb-4 md:mb-0">
                &copy; {new Date().getFullYear()} MyTaek™. All rights reserved. The Martial Arts Revolution.
            </div>
            <div className="flex items-center space-x-6">
                <div className="flex space-x-4 mr-6 border-r border-gray-700 pr-6">
                    <a
                        href="https://youtube.com/@MyTaek"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-red-600 transition-colors"
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
                        className="text-gray-500 hover:text-pink-500 transition-colors"
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
                <div className="flex space-x-6 text-sm text-gray-500">
                    <a href="#" className="hover:text-white">
                        Privacy
                    </a>
                    <a href="#" className="hover:text-white">
                        Terms
                    </a>
                    <a href="#" className="hover:text-white">
                        Contact Support
                    </a>
                </div>
            </div>
        </div>
    </footer>
);

export default App;
