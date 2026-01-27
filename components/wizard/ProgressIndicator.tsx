
import React from 'react';

interface ProgressIndicatorProps {
  totalSteps: number;
  currentStep: number;
  onStepClick: (step: number) => void;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ totalSteps, currentStep, onStepClick }) => {
  return (
    <div className="flex items-center justify-between">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;

        return (
          <React.Fragment key={step}>
            <div className="flex items-center relative group">
              {/* Tooltip for step number (Optional visual enhancement) */}
              <button
                onClick={() => onStepClick(step)}
                className={`w-8 h-8 md:w-10 md:h-10 text-sm md:text-base rounded-full flex items-center justify-center font-bold transition-all duration-300 border-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900
                  ${isActive 
                    ? 'bg-sky-500 border-blue-600 text-white scale-110 shadow-[0_0_15px_rgba(37,99,235,0.5)]' 
                    : isCompleted 
                        ? 'bg-green-500 border-green-500 text-white hover:bg-green-600' 
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'
                  }
                `}
                title={`Go to Step ${step}`}
              >
                {isCompleted ? (
                    <svg className="w-4 h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                ) : (
                    step
                )}
              </button>
              
              {/* Mobile Label (Hidden on small screens usually, but good for accessibility) */}
              <span className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
                Step {step}
              </span>
            </div>
            {step < totalSteps && (
              <div className={`flex-1 h-1 mx-2 rounded transition-colors duration-500 ${isCompleted ? 'bg-green-500' : 'bg-gray-700'}`}></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
