
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SignupData, WizardData } from '../types';
import { ProgressIndicator } from './wizard/ProgressIndicator';
import { Step1ClubInfo } from './wizard/Step1ClubInfo';
import { Step2BeltSystem } from './wizard/Step2BeltSystem';
import { Step3Skills } from './wizard/Step3Skills';
import { Step4Rules } from './wizard/Step4Rules';
import { Step5AddPeople } from './wizard/Step5AddPeople';
import { Step6Branding } from './wizard/Step6Branding';
import { SetupComplete } from './wizard/SetupComplete';
import { StepDemoChoice } from './wizard/StepDemoChoice';
import { WT_BELTS } from '../constants';

interface SetupWizardProps {
  initialData: SignupData;
  clubId?: string;
  onComplete: (data: WizardData) => void;
  onSkipToDemo?: () => void;
}

const STORAGE_KEY = 'taekup_wizard_draft';

export const SetupWizard: React.FC<SetupWizardProps> = ({ initialData, clubId, onComplete, onSkipToDemo }) => {
  const navigate = useNavigate();
  const [showDemoChoice, setShowDemoChoice] = useState(true);
  const [formKey, setFormKey] = useState(0);

  // Initialize state from LocalStorage if available, otherwise use defaults
  const [wizardData, setWizardData] = useState<WizardData>(() => {
      const savedData = localStorage.getItem(STORAGE_KEY);
      
      // Default initial state
      const defaults: Partial<WizardData> = {
        ownerName: '',
        city: '',
        language: 'English',
        branches: 1,
        branchNames: ['Main Location'], // Default branch name
        branchAddresses: [''],
        logo: null,
        slogan: '',
        beltSystemType: 'wt',
        belts: WT_BELTS,
        stripesPerBelt: 4,
        skills: [
          { id: 'skill-1', name: 'Technique', isActive: true, isCustom: false },
          { id: 'skill-2', name: 'Effort', isActive: true, isCustom: false },
          { id: 'skill-3', name: 'Focus', isActive: true, isCustom: false },
          { id: 'skill-4', name: 'Discipline', isActive: true, isCustom: false },
        ],
        homeworkBonus: false,
        coachBonus: false,
        pointsPerStripe: 64,
        useCustomPointsPerBelt: false,
        pointsPerBelt: {},
        useColorCodedStripes: false,
        stripeColors: ['#000000', '#000000', '#000000', '#000000'],
        gradingRequirementEnabled: false,
        gradingRequirementName: '',
        coaches: [],
        students: [],
        primaryColor: '#3B82F6',
        themeStyle: 'modern',
        clubPhoto: null,
        welcomeBanner: `Welcome to the ${initialData.clubName} Family!`,
        curriculum: [],
        classes: ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'],
        locationClasses: { 'Main Location': ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'] },
        schedule: [],
        events: [],
        privateSlots: [],
        clubSponsoredPremium: false,
        challenges: [],
        customChallenges: [],
        holidaySchedule: 'minimal',
        customHolidayWeeks: 4,
      };

      if (savedData) {
          try {
              const parsed = JSON.parse(savedData);
              // robust merge: defaults <- parsed <- initialData
              return { ...defaults, ...parsed, ...initialData }; 
          } catch (e) {
              console.error("Failed to parse saved wizard data", e);
          }
      }
      return { ...initialData, ...defaults } as WizardData;
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [isComplete, setIsComplete] = useState(false);

  // Auto-Save Effect
  useEffect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wizardData));
  }, [wizardData]);

  // Keyboard Shortcuts Effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ctrl/Cmd + Enter to go Next
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (currentStep < 6) setCurrentStep(p => p + 1);
        }
        // Ctrl/Cmd + Backspace to go Back
        if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
             if (currentStep > 1) setCurrentStep(p => p - 1);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  const handleUpdate = (data: Partial<WizardData>) => {
    setWizardData(prev => ({ ...prev, ...data }));
  };

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };
  
  const handleFinish = () => {
    console.log('Wizard Finished! Final Data:', wizardData);
    localStorage.removeItem(STORAGE_KEY); // Clear draft on successful completion
    setIsComplete(true);
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (step: number) => {
      setCurrentStep(step);
  };
  
  const handleClearDraft = () => {
      if(confirm("Are you sure? This will clear all entered data and restart the wizard.")) {
          localStorage.removeItem(STORAGE_KEY);
          
          // Reset to default state
          setWizardData({
            ...initialData,
            ownerName: '',
            city: '',
            language: 'English',
            branches: 1,
            branchNames: ['Main Location'],
            branchAddresses: [''],
            logo: null,
            slogan: '',
            beltSystemType: 'wt',
            belts: WT_BELTS,
            stripesPerBelt: 4,
            skills: [
              { id: 'skill-1', name: 'Technique', isActive: true, isCustom: false },
              { id: 'skill-2', name: 'Effort', isActive: true, isCustom: false },
              { id: 'skill-3', name: 'Focus', isActive: true, isCustom: false },
              { id: 'skill-4', name: 'Discipline', isActive: true, isCustom: false },
            ],
            homeworkBonus: false,
            coachBonus: false,
            pointsPerStripe: 64,
            useCustomPointsPerBelt: false,
            pointsPerBelt: {},
            useColorCodedStripes: false,
            stripeColors: ['#000000', '#000000', '#000000', '#000000'],
            gradingRequirementEnabled: false,
            gradingRequirementName: '',
            coaches: [],
            students: [],
            primaryColor: '#3B82F6',
            themeStyle: 'modern',
            clubPhoto: null,
            welcomeBanner: `Welcome to the ${initialData.clubName} Family!`,
            curriculum: [],
            classes: ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'],
            locationClasses: { 'Main Location': ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'] },
            schedule: [],
            events: [],
            privateSlots: [],
            clubSponsoredPremium: false,
            challenges: [],
            customChallenges: [],
            holidaySchedule: 'minimal',
            customHolidayWeeks: 4,
          });
          setCurrentStep(1);
          setFormKey(prev => prev + 1); // Force re-mount of all step components
      }
  }

  if (isComplete) {
    return <SetupComplete onGoToDashboard={() => onComplete(wizardData)} />;
  }

  if (showDemoChoice && clubId) {
    return (
      <div className="container mx-auto px-6 py-12 md:py-20">
        <div className="max-w-4xl mx-auto bg-gray-800/50 rounded-lg border border-gray-700 shadow-2xl">
          <div className="p-6 md:p-8">
            <StepDemoChoice 
              clubId={clubId}
              onChooseFresh={() => setShowDemoChoice(false)}
              onChooseDemo={() => {
                if (onSkipToDemo) {
                  onSkipToDemo();
                } else {
                  navigate('/admin');
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1ClubInfo data={wizardData} onUpdate={handleUpdate} />;
      case 2: return <Step2BeltSystem data={wizardData} onUpdate={handleUpdate} />;
      case 3: return <Step3Skills data={wizardData} onUpdate={handleUpdate} />;
      case 4: return <Step4Rules data={wizardData} onUpdate={handleUpdate} />;
      case 5: return <Step5AddPeople data={wizardData} onUpdate={handleUpdate} />;
      case 6: return <Step6Branding data={wizardData} onUpdate={handleUpdate} />;
      default: return <Step1ClubInfo data={wizardData} onUpdate={handleUpdate} />;
    }
  };

  return (
    <div className="container mx-auto px-6 py-12 md:py-20">
      <div className="max-w-4xl mx-auto bg-gray-800/50 rounded-lg border border-gray-700 shadow-2xl relative">
        
        {/* Helper Actions for Demo/Dev */}
        <div className="absolute -top-10 right-0 text-xs text-gray-500 flex items-center space-x-4">
             <span className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span> Auto-save active</span>
             <button onClick={handleClearDraft} className="hover:text-red-400 underline">Start Over</button>
        </div>

        <div className="p-6 md:p-8 border-b border-gray-700 relative z-20 bg-gray-800/50 rounded-t-lg">
          <ProgressIndicator 
            totalSteps={6} 
            currentStep={currentStep} 
            onStepClick={handleStepClick}
          />
        </div>
        
        {/* Key prop ensures the component tree inside is completely rebuilt on form reset */}
        <div className="p-6 md:p-8 min-h-[500px] animate-fade-in" key={formKey}>
            {renderStep()}
        </div>
        
        <div className="relative z-20 bg-gray-800 p-6 md:p-8 rounded-b-lg border-t border-gray-700 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Ctrl + Backspace"
            >
                Back
            </button>
            <div className="text-xs text-gray-500 hidden md:block">
                Tip: Press <span className="font-mono bg-gray-700 px-1 rounded">Ctrl + Enter</span> to continue
            </div>
            <button
                onClick={handleNext}
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-6 rounded-md transition-colors shadow-lg shadow-blue-900/20"
                title="Ctrl + Enter"
            >
                {currentStep === 6 ? 'Finish Setup' : 'Next'}
            </button>
        </div>
      </div>
    </div>
  );
};