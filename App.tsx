
import React, { useState, useCallback, useEffect } from 'react';
import { SignupForm } from './components/SignupForm';
import { SetupWizard } from './components/SetupWizard';
import { TaekBot } from './components/TaekBot';
import { CoachDashboard } from './components/CoachDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ParentPortal } from './components/ParentPortal';
import { LobbyDisplay } from './components/LobbyDisplay';
import { MyTaekHome } from './components/MyTaekHome'; // Import the new Home
import { sendWelcomeEmail, sendCoachWelcomeEmail, sendParentWelcomeEmail, getOnboardingMessage } from './services/geminiService';
import { BeltIcon, CalendarIcon, UsersIcon } from './components/icons/FeatureIcons';
import { SEO } from './components/SEO';
import type { SignupData, WizardData, Student } from './types';

// --- Login Component ---
interface LoginScreenProps {
    onLogin: (email: string, password: string) => void;
    onCancel: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onCancel }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }
        onLogin(email, password);
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
            <SEO title="Login | TaekUp" description="Log in to your TaekUp Dashboard." />
            <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 relative">
                <button onClick={onCancel} className="absolute top-4 right-4 text-gray-400 hover:text-white">&times;</button>
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
                    <p className="text-gray-400">Log in to TaekUp</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={e => setEmail(e.target.value)} 
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="user@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)} 
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="••••••••"
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors">
                        Log In
                    </button>
                </form>
                <div className="mt-6 text-center text-xs text-gray-500 border-t border-gray-700 pt-4">
                    <p className="mb-1">Demo Credentials:</p>
                    <p>Owner: (Use Signup Email & Password)</p>
                    <p>Coach: (Use Email & Password from Step 5)</p>
                    <p>Parent: (Use Parent Email, Password: <span className="font-mono text-gray-300">1234</span>)</p>
                </div>
            </div>
        </div>
    );
};

// --- Dashboard Components ---

interface DashboardViewProps {
  data: WizardData;
  onboardingMessage: string;
  onNavigate: (view: 'coach-dashboard' | 'admin-dashboard' | 'parent-portal' | 'dojang-tv') => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ data, onboardingMessage, onNavigate }) => {
    const themeStyles = {
        modern: 'rounded-lg',
        classic: 'rounded-none',
        minimal: 'rounded-lg border-none shadow-none bg-gray-800/50',
    };
    
    const bgStyle = data.clubPhoto && data.clubPhoto instanceof File ? {
        backgroundImage: `url(${URL.createObjectURL(data.clubPhoto)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    } : {};
    
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
                        onClick={() => onNavigate('coach-dashboard')}
                    />
                    
                    <DashboardCard
                        title="Parent Portal"
                        description="Automatically linked to each student. See what parents see with this preview."
                        buttonText="Preview Portal"
                        themeStyle={themeStyles[data.themeStyle]}
                        primaryColor={data.primaryColor}
                        onClick={() => onNavigate('parent-portal')}
                    />
                    
                    <DashboardCard
                        title="Admin Dashboard"
                        description="Summary metrics, financial overviews, and full system controls are ready."
                        buttonText="Go to Admin Panel"
                        themeStyle={themeStyles[data.themeStyle]}
                        primaryColor={data.primaryColor}
                        onClick={() => onNavigate('admin-dashboard')}
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
    onClick?: () => void;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, description, buttonText, themeStyle, primaryColor, onClick }) => (
    <button 
        onClick={onClick}
        disabled={!onClick}
        className={`bg-gray-800 border border-gray-700/50 shadow-lg flex flex-col p-8 transition-all duration-300 ${themeStyle} text-left w-full 
                   hover:enabled:border-white/20 hover:enabled:-translate-y-1
                   disabled:opacity-60 disabled:cursor-not-allowed`}
    >
        <h2 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>{title}</h2>
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
    </button>
);


// --- Main App Component ---

const App: React.FC = () => {
  // 'mytaek-home' is the new default view for the branding site
  const [view, setView] = useState<'mytaek-home' | 'landing' | 'login' | 'wizard' | 'dashboard' | 'coach-dashboard' | 'admin-dashboard' | 'parent-portal' | 'dojang-tv'>('mytaek-home');
  const [showSignup, setShowSignup] = useState(false);
  const [signupData, setSignupData] = useState<SignupData | null>(null);
  const [finalWizardData, setFinalWizardData] = useState<WizardData | null>(null);
  const [onboardingMessage, setOnboardingMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loggedInUserType, setLoggedInUserType] = useState<'owner' | 'coach' | 'parent' | null>(null);
  const [loggedInUserName, setLoggedInUserName] = useState<string | null>(null);
  const [parentStudentId, setParentStudentId] = useState<string | null>(null);

  // --- SMART ROUTING & DEEP LINKING ---
  useEffect(() => {
      // 1. Check URL Query Parameters (e.g. ?mode=signup from WordPress)
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      
      // 2. Check Subdomain (e.g. app.mytaek.com vs mytaek.com)
      const hostname = window.location.hostname;
      const isAppSubdomain = hostname.startsWith('app.');

      if (mode === 'signup') {
          setView('landing'); 
          setShowSignup(true);
      } else if (mode === 'login') {
          setView('login');
      } else if (isAppSubdomain) {
          // If visitor is on 'app.mytaek.com', default to Login instead of Marketing Home
          setView('login');
      } else {
          // Default to MyTaek Brand Home
          setView('mytaek-home');
      }
      
      // Clean up URL if needed
      if (mode) {
          window.history.replaceState({}, '', window.location.pathname);
      }
  }, []);

  const handleSignupSuccess = useCallback(async (data: SignupData) => {
    setSignupData(data);
    await sendWelcomeEmail(data.clubName);
    setView('wizard');
  }, []);

  const handleSetupComplete = useCallback(async (data: WizardData) => {
    setIsProcessing(true);
    setFinalWizardData(data);

    // Simulate sending emails...
    const emailPromises = [
      ...data.coaches.map(coach => sendCoachWelcomeEmail(coach.name, data.clubName)),
      ...data.students
        .filter(student => student.parentEmail)
        .map(student => sendParentWelcomeEmail(student.parentEmail, student.name, data.clubName))
    ];
    await Promise.all(emailPromises);
    
    const message = await getOnboardingMessage();
    setOnboardingMessage(message);

    await new Promise(resolve => setTimeout(resolve, 500));
    
    setIsProcessing(false);
    setLoggedInUserType('owner');
    setLoggedInUserName(data.ownerName);
    setView('dashboard');
  }, []);
  
  const handleStudentDataUpdate = useCallback((updatedStudents: Student[]) => {
    if (!finalWizardData) return;
    setFinalWizardData(prevData => {
        if (!prevData) return null;
        return {
            ...prevData,
            students: updatedStudents,
        };
    });
  }, [finalWizardData]);

  const handleWizardDataUpdate = useCallback((updates: Partial<WizardData>) => {
    if (!finalWizardData) return;
    setFinalWizardData(prevData => {
        if (!prevData) return null;
        return {
            ...prevData,
            ...updates
        };
    });
  }, [finalWizardData]);

  // Handler for Admin to View Student Portal
  const handleViewStudentPortal = useCallback((studentId: string) => {
      setParentStudentId(studentId);
      setView('parent-portal');
  }, []);

  const handleLogin = (email: string, password: string) => {
      if (!finalWizardData && !signupData) {
          alert("No club data found. Please sign up or complete the wizard first.");
          return;
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // 1. Owner Check
      if (signupData && normalizedEmail === signupData.email.toLowerCase()) {
          if (password === signupData.password) {
              setLoggedInUserType('owner');
              setLoggedInUserName(finalWizardData ? finalWizardData.ownerName : signupData.clubName);
              if (!finalWizardData) {
                  setView('wizard');
              } else {
                  setView('admin-dashboard');
              }
              return;
          }
      }

      if (!finalWizardData) {
           alert("Invalid credentials or account not fully set up.");
           return;
      }

      // 2. Coach Check
      const coach = finalWizardData.coaches.find(c => c.email.toLowerCase() === normalizedEmail);
      if (coach) {
          if (coach.password && password === coach.password) {
              setLoggedInUserType('coach');
              setLoggedInUserName(coach.name);
              setView('coach-dashboard');
              return;
          }
          if (!coach.password) {
               alert("Security Error: This coach account has no password set.");
               return;
          }
      }

      // 3. Parent Check
      const student = finalWizardData.students.find(s => s.parentEmail.toLowerCase() === normalizedEmail);
      if (student) {
          if (password === '1234') {
              setLoggedInUserType('parent');
              setParentStudentId(student.id);
              setView('parent-portal');
              return;
          }
      }

      alert("Invalid email or password. Please try again.");
  };

  const handleLogout = () => {
      setLoggedInUserType(null);
      setLoggedInUserName(null);
      setParentStudentId(null);
      setView('landing');
  }

  const renderContent = () => {
    if (isProcessing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh]">
          <svg className="animate-spin h-10 w-10 text-blue-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h2 className="text-2xl font-bold text-white">Finalizing your system...</h2>
          <p className="text-gray-400">Generating dashboards and sending notifications.</p>
        </div>
      );
    }

    switch (view) {
      case 'mytaek-home':
          return (
            <>
              <SEO title="MyTaek | Your Martial Arts Companion" description="The complete ecosystem for modern Dojangs. TaekUp, TaekFunDo, and TikTaek." />
              <MyTaekHome onNavigate={setView as any} />
            </>
          );
      case 'login':
          return <LoginScreen onLogin={handleLogin} onCancel={() => setView('landing')} />;
      case 'wizard':
        return signupData && (
            <>
                <SEO title="Setup | TaekUp" />
                <SetupWizard initialData={signupData} onComplete={handleSetupComplete} />
            </>
        );
      case 'dashboard':
        return finalWizardData && <DashboardView data={finalWizardData} onboardingMessage={onboardingMessage} onNavigate={setView} />;
      case 'coach-dashboard':
        return finalWizardData && (
            <>
                <SEO title="Coach Dashboard | TaekUp" />
                <CoachDashboard 
                    data={finalWizardData} 
                    onUpdateStudents={handleStudentDataUpdate} 
                    onUpdateData={handleWizardDataUpdate}
                    coachName={loggedInUserName || finalWizardData.ownerName} 
                    onBack={() => loggedInUserType === 'owner' ? setView('dashboard') : handleLogout()} 
                />
            </>
        );
      case 'admin-dashboard':
        return finalWizardData && (
            <>
                <SEO title="Admin Command Center | TaekUp" />
                <AdminDashboard 
                    data={finalWizardData} 
                    onBack={() => setView('dashboard')} 
                    onUpdateData={handleWizardDataUpdate}
                    onNavigate={setView}
                    onViewStudentPortal={handleViewStudentPortal} // Pass the handler
                />
            </>
        );
      case 'dojang-tv':
        return finalWizardData && (
            <>
                <SEO title="TV Mode | TaekUp" />
                <LobbyDisplay 
                    data={finalWizardData} 
                    onClose={() => setView('admin-dashboard')} 
                />
            </>
        );
      case 'parent-portal':
        let studentToShow: Student | undefined;
        // If logged in as parent, show their student. If owner/admin, show selected student.
        if (parentStudentId) {
            studentToShow = finalWizardData?.students.find(s => s.id === parentStudentId);
        } else {
             studentToShow = finalWizardData?.students[0];
        }

        if (!studentToShow || !finalWizardData) {
            return <div className="text-center py-20 text-white">No students available.</div>
        }
        return (
            <>
                <SEO title={`Parent Portal - ${studentToShow.name} | TaekUp`} />
                <ParentPortal 
                    student={studentToShow} 
                    data={finalWizardData} 
                    onBack={() => loggedInUserType === 'owner' ? setView('admin-dashboard') : handleLogout()} 
                />
            </>
        );
      case 'landing':
      default:
        return (
          <>
            <SEO title="TaekUp - Management Software | MyTaek" description="The Operating System for Modern Dojangs. Manage Students. Automate Growth. The only software that PAYS you to use it." />
            <HeroSection showSignup={showSignup} onStartTrial={() => setShowSignup(true)} onSignupSuccess={handleSignupSuccess} />
            <FeaturesSection />
            <MarketingSection />
            <ProfitEngineSection />
            <TrustSection />
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Hide Header on MyTaek Home to allow custom branding layout */}
      {view !== 'dojang-tv' && view !== 'mytaek-home' && (
          <Header 
            onViewLogin={() => setView('login')} 
            isLoggedIn={!!loggedInUserType} 
            onLogout={handleLogout} 
            onGoHome={() => setView('mytaek-home')} // Allow navigating back to MyTaek root
          />
      )}
      <main>
        {renderContent()}
      </main>
      {view !== 'dojang-tv' && <Footer />}
      {view !== 'dojang-tv' && <TaekBot />}
    </div>
  );
};

const Header: React.FC<{ onViewLogin: () => void, isLoggedIn: boolean, onLogout: () => void, onGoHome: () => void }> = ({ onViewLogin, isLoggedIn, onLogout, onGoHome }) => (
  <header className="bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-800">
    <div className="w-full px-6 py-3 flex justify-between items-center">
      <div className="w-full">
          {/* Clicking Logo now goes to MyTaek Home */}
          <button onClick={onGoHome} className="flex text-4xl font-black tracking-tighter leading-none select-none hover:scale-105 transition-transform cursor-pointer" style={{ fontFamily: 'Arial, sans-serif' }}>
            <span className="text-white drop-shadow-sm">T</span>
            <span className="text-[#FFD700] drop-shadow-sm">A</span>
            <span className="text-[#00A000] drop-shadow-sm">E</span>
            <span className="text-[#0040FF] drop-shadow-sm">K</span>
            <span className="text-[#FF0000] drop-shadow-sm">U</span>
            <span className="text-black" style={{ WebkitTextStroke: '1.2px white', textShadow: '0 0 1px rgba(255,255,255,0.5)' }}>P</span>
          </button>
      </div>
      <nav className="hidden md:flex items-center space-x-6">
        {!isLoggedIn && (
            <>
                <button onClick={onGoHome} className="text-gray-300 hover:text-white transition-colors text-sm font-medium">MyTaek</button>
                <a href="#features" className="text-gray-300 hover:text-white transition-colors text-sm font-medium">Features</a>
                <button onClick={onViewLogin} className="text-white hover:text-blue-400 font-bold text-sm transition-colors">Log In</button>
            </>
        )}
        {isLoggedIn && (
             <button onClick={onLogout} className="text-red-400 hover:text-red-300 font-bold text-sm transition-colors">Log Out</button>
        )}
      </nav>
    </div>
  </header>
);


// ... (Rest of component remains unchanged)
interface HeroSectionProps {
  showSignup: boolean;
  onStartTrial: () => void;
  onSignupSuccess: (data: SignupData) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ showSignup, onStartTrial, onSignupSuccess }) => (
  <div className="relative text-center py-20 md:py-32 px-6 bg-dots-pattern">
     <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-900/80 to-gray-900"></div>
    <div className="relative z-10 max-w-4xl mx-auto">
      {showSignup ? (
        <>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Start Your <span className="text-blue-400">14-Day</span> Free Trial</h1>
          <p className="text-lg text-gray-300 mb-8">No credit card required. Unlock your dojang's full potential today.</p>
          <SignupForm onSignupSuccess={onSignupSuccess} />
        </>
      ) : (
        <>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 leading-tight">
            Every Step Takes You Up.
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
             The ultimate management platform for your Martial Arts school.
          </p>
          <div className="flex flex-col items-center">
             <button
                onClick={onStartTrial}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full text-lg transition-transform transform hover:scale-105 shadow-lg shadow-blue-600/30"
              >
                Start Free Trial
              </button>
              <div className="mt-4 text-xs text-gray-500 font-semibold tracking-widest uppercase opacity-70">
                Powered by MyTaek
              </div>
          </div>
        </>
      )}
    </div>
  </div>
);

const FeaturesSection: React.FC = () => (
    <div id="features" className="py-20 bg-gray-900">
        <div className="container mx-auto px-6">
            <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-extrabold text-white">Built for Modern Dojangs</h2>
                <p className="text-gray-400 mt-4">Everything you need to run a successful martial arts school.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <FeatureCard
                    icon="🥋"
                    title="Made for All Arts"
                    description="Whether you teach Taekwondo, Karate, BJJ, or Judo—our preset belt systems adapt to you instantly."
                />
                <FeatureCard
                    icon={<BeltIcon />}
                    title="Gamified Rank Tracking"
                    description="Visual progress bars, automated grading requirements, and one-click digital certificate generation."
                />
                <FeatureCard
                    icon={<CalendarIcon />}
                    title="Smart Scheduling"
                    description="Revenue-focused calendar with belt-gated classes and integrated Private Lesson upsells."
                />
                <FeatureCard
                    icon="✨"
                    title="AI Dojo Assistant"
                    description="Multi-language coach feedback, retention radar, and 30-second class grading workflow."
                />
            </div>
            <div className="mt-12 bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-3xl mx-auto text-center">
                <h3 className="font-bold text-white text-lg mb-2">Looking for Website & Payments?</h3>
                <p className="text-gray-400 text-sm">
                    Yes, we have them too. TaekUp includes a <strong className="text-blue-400">Parent Web App</strong> (no more generic websites) and <strong className="text-green-400">Integrated Payments</strong> (via Stripe) at no extra cost.
                </p>
            </div>
        </div>
    </div>
);

const MarketingSection: React.FC = () => (
    <div className="py-24 bg-gray-800 border-y border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none"></div>
        <div className="container mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">Grow Your Empire, Not Your Bills.</h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-12">
                Unlike competitors who nickel-and-dime you for every new location or staff member, TaekUp scales with your success.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">🌍</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Unlimited Locations</h3>
                    <p className="text-gray-400">Open 10 new branches? No extra fee. Manage your entire franchise from one screen.</p>
                </div>
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">🥋</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Unlimited Staff</h3>
                    <p className="text-gray-400">Add as many coaches, admins, and assistants as you need. We don't charge per user.</p>
                </div>
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">⏰</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Unlimited Classes</h3>
                    <p className="text-gray-400">Run 100 classes a week? Great. Schedule as much as you want without limits.</p>
                </div>
            </div>
            
            <div className="mt-16 bg-blue-900/20 inline-block py-2 px-6 rounded-full border border-blue-500/30">
                <span className="text-blue-400 font-bold uppercase tracking-wide text-sm">The TaekUp Guarantee</span>
            </div>
        </div>
    </div>
);

const ProfitEngineSection: React.FC = () => (
    <div className="py-24 bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
        {/* Gold accent glow */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[800px] h-[400px] bg-yellow-600/10 blur-[120px] rounded-full pointer-events-none"></div>
        
        <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-4xl mx-auto text-center border border-yellow-600/30 bg-gray-800/40 backdrop-blur-sm rounded-3xl p-8 md:p-12 shadow-2xl">
                <div className="inline-block mb-4 p-3 bg-yellow-500/10 rounded-full border border-yellow-500/50">
                    <span className="text-3xl">💸</span>
                </div>
                
                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
                    Stop Paying for Software. <span className="text-yellow-500">Let Software Pay You.</span>
                </h2>
                <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-8 leading-relaxed">
                    Our proprietary <span className="font-bold text-white">Club Revenue Engine™</span> is designed to offset your costs entirely.
                </p>
                
                <div className="flex flex-col md:flex-row items-center justify-center gap-6 mt-8 mb-8">
                    <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full md:w-auto min-w-[220px] opacity-70">
                        <p className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Every Other App</p>
                        <p className="text-red-400 text-2xl font-bold">Monthly Expense</p>
                    </div>
                    <div className="text-gray-600 font-bold text-2xl">VS</div>
                    <div className="bg-gray-900 p-6 rounded-xl border-2 border-yellow-500/60 w-full md:w-auto min-w-[240px] shadow-[0_0_30px_rgba(234,179,8,0.2)] scale-105">
                        <p className="text-yellow-500 text-xs uppercase font-bold tracking-wider mb-1">TaekUp</p>
                        <p className="text-green-400 text-2xl font-bold">Profit Center</p>
                    </div>
                </div>

                <div className="mt-8">
                    <button className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3 px-8 rounded-full shadow-lg transform hover:scale-105 transition-all">
                        Start Trial to See the Math
                    </button>
                </div>
            </div>
        </div>
    </div>
);

interface FeatureCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
    <div className="bg-gray-800 p-8 rounded-lg border border-gray-700/50 shadow-lg hover:border-blue-500/50 hover:-translate-y-1 transition-all duration-300">
        <div className="bg-gray-700 text-blue-400 rounded-full h-12 w-12 flex items-center justify-center mb-6 text-2xl">
            {icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed text-sm">{description}</p>
    </div>
);

const TrustSection: React.FC = () => (
    <div className="bg-gray-900 py-16">
        <div className="container mx-auto px-6 text-center">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">Your Martial Arts Companion</p>
            <div className="flex justify-center items-center opacity-60">
                <span className="text-2xl font-bold text-white">MyTaek</span>
            </div>
        </div>
    </div>
);

const Footer: React.FC = () => (
  <footer className="bg-gray-900 border-t border-gray-800">
    <div className="container mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center">
      <div className="text-gray-500 text-sm mb-4 md:mb-0">
        &copy; {new Date().getFullYear()} MyTaek. All rights reserved. Your Martial Arts Companion.
      </div>
      <div className="flex items-center space-x-6">
          <div className="flex space-x-4 mr-6 border-r border-gray-700 pr-6">
              <a href="https://youtube.com/@MyTaek" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-red-600 transition-colors" title="YouTube">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
              <a href="https://instagram.com/mytaek" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-pink-500 transition-colors" title="Instagram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.468.99c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" /></svg>
              </a>
          </div>
          <div className="flex space-x-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white">Privacy</a>
              <a href="#" className="hover:text-white">Terms</a>
              <a href="#" className="hover:text-white">Contact Support</a>
          </div>
      </div>
    </div>
  </footer>
);


export default App;
