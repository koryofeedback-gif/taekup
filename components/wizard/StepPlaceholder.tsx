
import React from 'react';

interface StepPlaceholderProps {
  step: number;
  title: string;
}

export const StepPlaceholder: React.FC<StepPlaceholderProps> = ({ step, title }) => {
  return (
    <div className="text-center py-8">
      <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-gray-700 mb-4">
        <span className="text-xl font-bold text-sky-300">{step}</span>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-gray-400">
        This section is under construction. Click "Next" to continue the setup process.
      </p>
    </div>
  );
};
