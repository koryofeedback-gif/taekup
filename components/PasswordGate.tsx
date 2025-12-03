import React, { useState, useEffect } from 'react';

const SESSION_KEY = 'taekup_site_access';

interface PasswordGateProps {
  children: React.ReactNode;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const savedAccess = sessionStorage.getItem(SESSION_KEY);
      if (savedAccess === 'granted') {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      try {
        const baseUrl = window.location.hostname.includes('mytaek.com') 
          ? 'https://www.mytaek.com' 
          : '';
        const response = await fetch(`${baseUrl}/api/verify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: '' }),
        });
        const data = await response.json();
        if (data.valid) {
          sessionStorage.setItem(SESSION_KEY, 'granted');
          setIsAuthenticated(true);
        }
      } catch (err) {
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    };

    checkAccess();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const baseUrl = window.location.hostname.includes('mytaek.com') 
        ? 'https://www.mytaek.com' 
        : '';
      const response = await fetch(`${baseUrl}/api/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (data.valid) {
        sessionStorage.setItem(SESSION_KEY, 'granted');
        setIsAuthenticated(true);
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-white mb-2">Site Under Development</h1>
          <p className="text-gray-400">Enter password to access the site</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {isSubmitting ? 'Checking...' : 'Enter Site'}
          </button>
        </form>

        <p className="text-gray-500 text-xs text-center mt-6">
          TaekUp - Coming Soon
        </p>
      </div>
    </div>
  );
};
