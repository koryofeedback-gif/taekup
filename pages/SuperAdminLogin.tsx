import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';

interface SuperAdminLoginProps {
  onLoginSuccess: (token: string) => void;
}

export const SuperAdminLogin: React.FC<SuperAdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('Starting secure GET-based login via API...');
      
      // Step 1: Initialize login session via API server
      const initRes = await fetch('/api/sa-init', { cache: 'no-store' });
      if (!initRes.ok) {
        throw new Error('Failed to initialize login');
      }
      const { sessionId } = await initRes.json();
      console.log('Session initialized:', sessionId);
      
      // Step 2: Encode and submit credentials via GET to API server
      const encoded = btoa(JSON.stringify({ email, password }));
      const submitRes = await fetch(`/api/sa-submit?s=${sessionId}&d=${encodeURIComponent(encoded)}`, {
        cache: 'no-store'
      });
      
      const data = await submitRes.json();
      
      if (!submitRes.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      console.log('Login successful');
      const { token, email: userEmail } = data;
      localStorage.setItem('superAdminToken', token);
      localStorage.setItem('superAdminEmail', userEmail);
      onLoginSuccess(token);
      navigate('/super-admin/dashboard');
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Super Admin</h1>
            <p className="text-gray-400 mt-2">TaekUp Platform Control Center</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="admin@mytaek.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center mt-6 space-y-2">
            <div className="flex items-center justify-center gap-2 text-green-400 text-xs">
              <Shield className="w-3 h-3" />
              <span>Secure WebSocket Authentication</span>
            </div>
            <p className="text-gray-500 text-xs">
              Authorized personnel only. All access is logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
