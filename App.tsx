import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { SetupWizard } from './components/SetupWizard';
import { TaekBot } from './components/TaekBot';
import { CoachDashboard } from './components/CoachDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ParentPortal } from './components/ParentPortal';
import { LobbyDisplay } from './components/LobbyDisplay';
import { MyTaekHome } from './components/MyTaekHome';
import { LoginPage } from './pages/Login';
import { LandingPage } from './pages/Landing';
import {
    sendCoachWelcomeEmail,
    sendParentWelcomeEmail,
    getOnboardingMessage,
} from './services/geminiService';
import { SEO } from './components/SEO';
import type { SignupData, WizardData, Student } from './types';

// Main App Component with Router
const App: React.FC = () => {
    const [signupData, setSignupDataState] = useState<SignupData | null>(() => {
        const saved = localStorage.getItem('taekup_signup_data');
        return saved ? JSON.parse(saved) : null;
    });
    const [finalWizardData, setFinalWizardDataState] = useState<WizardData | null>(() => {
        const saved = localStorage.getItem('taekup_wizard_data');
        return saved ? JSON.parse(saved) : null;
    });
    const [onboardingMessage, setOnboardingMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [loggedInUserType, setLoggedInUserType] = useState<'owner' | 'coach' | 'parent' | null>(null);
    const [loggedInUserName, setLoggedInUserName] = useState<string | null>(null);
    const [parentStudentId, setParentStudentId] = useState<string | null>(null);

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
        if (data) {
            localStorage.setItem('taekup_wizard_data', JSON.stringify(data));
        } else {
            localStorage.removeItem('taekup_wizard_data');
        }
    }, []);

    const handleSignupSuccess = useCallback((data: SignupData) => {
        setSignupData(data);
    }, [setSignupData]);

    const handleSetupComplete = useCallback(async (data: WizardData) => {
        setIsProcessing(true);
        setFinalWizardData(data);

        const emailPromises = [
            ...data.coaches.map(coach => sendCoachWelcomeEmail(coach.name, data.clubName)),
            ...data.students
                .filter(student => student.parentEmail)
                .map(student => sendParentWelcomeEmail(student.parentEmail, student.name, data.clubName)),
        ];
        await Promise.all(emailPromises);

        const message = await getOnboardingMessage();
        setOnboardingMessage(message);

        await new Promise(resolve => setTimeout(resolve, 500));

        setIsProcessing(false);
        setLoggedInUserType('owner');
        setLoggedInUserName(data.ownerName);
    }, []);

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
                localStorage.setItem('taekup_wizard_data', JSON.stringify(updated));
                return updated;
            });
        },
        []
    );

    const handleViewStudentPortal = useCallback((studentId: string) => {
        setParentStudentId(studentId);
    }, []);

    const handleLoginSuccess = useCallback(
        (userType: 'owner' | 'coach' | 'parent', userName: string, studentId?: string) => {
            setLoggedInUserType(userType);
            setLoggedInUserName(userName);
            if (studentId) {
                setParentStudentId(studentId);
            }
        },
        []
    );

    const handleLogout = useCallback(() => {
        setLoggedInUserType(null);
        setLoggedInUserName(null);
        setParentStudentId(null);
    }, []);

    return (
        <BrowserRouter>
            <AppContent
                signupData={signupData}
                finalWizardData={finalWizardData}
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
            />
        </BrowserRouter>
    );
};

interface AppContentProps {
    signupData: SignupData | null;
    finalWizardData: WizardData | null;
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
    onLoginSuccess: (userType: 'owner' | 'coach' | 'parent', userName: string, studentId?: string) => void;
    onLogout: () => void;
}

const AppContent: React.FC<AppContentProps> = ({
    signupData,
    finalWizardData,
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
}) => {
    const location = useLocation();
    const isAppSubdomain = window.location.hostname.startsWith('app.');
    const isDojangTV = location.pathname === '/app/tv';
    const isMyTaekHome = location.pathname === '/';

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            {!isDojangTV && !isMyTaekHome && (
                <Header
                    isLoggedIn={!!loggedInUserType}
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

                    {/* Setup Wizard */}
                    <Route
                        path="/wizard"
                        element={
                            signupData ? (
                                <>
                                    <SEO title="Setup | TaekUp" />
                                    <SetupWizard initialData={signupData} onComplete={onSetupComplete} />
                                </>
                            ) : (
                                <Navigate to="/landing" replace />
                            )
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
                            finalWizardData && loggedInUserType ? (
                                <>
                                    <SEO title="Coach Dashboard | TaekUp" />
                                    <CoachDashboard
                                        data={finalWizardData}
                                        onUpdateStudents={onStudentDataUpdate}
                                        onUpdateData={onWizardDataUpdate}
                                        coachName={loggedInUserName || finalWizardData.ownerName}
                                        onBack={onLogout}
                                    />
                                </>
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />

                    <Route
                        path="/app/admin"
                        element={
                            finalWizardData && loggedInUserType === 'owner' ? (
                                <>
                                    <SEO title="Admin Command Center | TaekUp" />
                                    <AdminDashboard
                                        data={finalWizardData}
                                        onBack={() => window.history.back()}
                                        onUpdateData={onWizardDataUpdate}
                                        onNavigate={() => {}}
                                        onViewStudentPortal={onViewStudentPortal}
                                    />
                                </>
                            ) : (
                                <Navigate to="/login" replace />
                            )
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

                    {/* Catch-all redirect */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            {!isDojangTV && <Footer />}
            {!isDojangTV && <TaekBot />}
        </div>
    );
};

// Parent Portal Route Component
interface ParentPortalRouteProps {
    data: WizardData;
    parentStudentId: string | null;
    loggedInUserType: 'owner' | 'coach' | 'parent' | null;
    onLogout: () => void;
}

const ParentPortalRoute: React.FC<ParentPortalRouteProps> = ({
    data,
    parentStudentId,
    loggedInUserType,
    onLogout,
}) => {
    let studentToShow: Student | undefined;

    if (parentStudentId) {
        studentToShow = data.students.find(s => s.id === parentStudentId);
    } else {
        studentToShow = data.students[0];
    }

    if (!studentToShow) {
        return <div className="text-center py-20 text-white">No students available.</div>;
    }

    return (
        <>
            <SEO title={`Parent Portal - ${studentToShow.name} | TaekUp`} />
            <ParentPortal
                student={studentToShow}
                data={data}
                onBack={loggedInUserType === 'owner' ? () => window.history.back() : onLogout}
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
    const themeStyles = {
        modern: 'rounded-lg',
        classic: 'rounded-none',
        minimal: 'rounded-lg border-none shadow-none bg-gray-800/50',
    };

    const bgStyle =
        data.clubPhoto && data.clubPhoto instanceof File
            ? {
                  backgroundImage: `url(${URL.createObjectURL(data.clubPhoto)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
              }
            : {};

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

                    <DashboardCard
                        title="Parent Portal"
                        description="Automatically linked to each student. See what parents see with this preview."
                        buttonText="Preview Portal"
                        themeStyle={themeStyles[data.themeStyle]}
                        primaryColor={data.primaryColor}
                        href={`/app/parent/${data.students[0]?.id || ''}`}
                    />

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
    onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ isLoggedIn, onLogout }) => {
    return (
        <header className="bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-800">
            <div className="w-full px-6 py-3 flex justify-between items-center">
                <div className="w-full">
                    <Link
                        to="/"
                        className="flex hover:scale-105 transition-transform cursor-pointer"
                    >
                        <img src="/taekup-logo.png" alt="TaekUp" className="h-17" />
                    </Link>
                </div>
                <nav className="hidden md:flex items-center space-x-6">
                    {!isLoggedIn && (
                        <>
                            <Link
                                to="/"
                                className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
                            >
                                MyTaek
                            </Link>
                            <a
                                href="#features"
                                className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
                            >
                                Features
                            </a>
                            <Link
                                to="/login"
                                className="text-white hover:text-blue-400 font-bold text-sm transition-colors"
                            >
                                Log In
                            </Link>
                        </>
                    )}
                    {isLoggedIn && (
                        <button
                            onClick={onLogout}
                            className="text-red-400 hover:text-red-300 font-bold text-sm transition-colors"
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
                &copy; {new Date().getFullYear()} MyTaek. All rights reserved. Your Martial Arts Companion.
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
                        href="https://instagram.com/mytaek"
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
