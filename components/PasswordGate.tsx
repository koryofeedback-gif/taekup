import React from 'react';

interface PasswordGateProps {
  children: React.ReactNode;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  // Password protection disabled - site is now public
  return <>{children}</>;
};
