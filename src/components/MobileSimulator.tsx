import React from 'react';

interface MobileSimulatorProps {
  children: React.ReactNode;
}

export const MobileSimulator: React.FC<MobileSimulatorProps> = ({ children }) => {
  return (
    <div className="app-container">
      <div className="phone-screen">
        {children}
      </div>
    </div>
  );
};
