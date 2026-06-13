import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type User } from '../context/AuthContext';
import api, { API_BASE_URL } from '../services/api';
import { MessageSquare, LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();

  const [isRegister, setIsRegister] = useState(false);
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'oauth2' ? 'Google Sign-in failed. Please try again.' : null
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    // Redirect to Spring Boot OAuth2 authorization endpoint
    window.location.href = `${API_BASE_URL}/oauth2/authorization/google`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!isOtpStep) {
          // Step 1: Request OTP
          const response = await api.post('/api/auth/register/request-otp', { email, displayName, password });
          setSuccess(response.data);
          setIsOtpStep(true);
        } else {
          // Step 2: Verify OTP and complete registration
          await api.post('/api/auth/register', { email, displayName, password, otp });
          setSuccess('Registration successful! Please login.');
          setIsRegister(false);
          setIsOtpStep(false);
          setOtp('');
          setPassword('');
        }
      } else {
        const response = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
        login(response.data.token, response.data.user);
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      console.error(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyErr = err as any;
      if (anyErr.response && typeof anyErr.response.data === 'string') {
        setError(anyErr.response.data);
      } else if (anyErr.response?.data?.message) {
        setError(anyErr.response.data.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="glass-panel animate-fade-in login-card">
        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
            padding: '12px',
            borderRadius: '50%',
            marginBottom: '12px',
            boxShadow: '0 0 20px var(--color-primary-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <MessageSquare size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.5px' }}>
            Aether<span style={{ color: 'var(--color-secondary)' }}>Chat</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
            {isRegister ? (isOtpStep ? 'Verify your email address' : 'Create an account to get started') : 'Sign in to connect with friends'}
          </p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="custom-alert error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="custom-alert success">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {isRegister && isOtpStep ? (
            // OTP verification view
            <div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                We've sent a 6-digit verification code to <strong style={{ color: 'var(--text-main)' }}>{email}</strong>. 
                Please enter it below to complete your registration.
              </p>
              <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                Verification Code (6-digit OTP)
              </label>
              <input
                type="text"
                className="glass-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '8px', fontWeight: '700' }}
              />
              <button 
                type="button" 
                onClick={() => {
                  setIsOtpStep(false);
                  setOtp('');
                  setError(null);
                  setSuccess(null);
                }}
                className="btn-secondary"
                style={{ width: '100%', marginTop: '16px', padding: '10px' }}
              >
                Back to Sign Up
              </button>
            </div>
          ) : (
            // Standard login / sign up inputs
            <>
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  className="glass-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>

              {isRegister && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    className="glass-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Smith"
                    required
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                  Password
                </label>
                <input
                  type="password"
                  className="glass-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </>
          )}

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
            {loading ? 'Processing...' : isRegister ? (
              isOtpStep ? (
                <>Verify & Register</>
              ) : (
                <>
                  <UserPlus size={18} /> Create Account
                </>
              )
            ) : (
              <>
                <LogIn size={18} /> Sign In
              </>
            )}
          </button>
        </form>

        {!isOtpStep && (
          <>
            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }}></div>
              <span style={{ padding: '0 10px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-glass)' }}></div>
            </div>

            {/* Google OAuth Button */}
            <button onClick={handleGoogleLogin} className="btn-google">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.8 2.17c1.63-1.5 2.58-3.7 2.58-6.5z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.8-2.17c-.78.52-1.78.83-3.16.83-2.43 0-4.49-1.64-5.22-3.85l-2.9 2.25C2.37 15.34 5.4 18 9 18z" fill="#34A853"/>
                <path d="M3.78 10.63c-.19-.57-.3-1.17-.3-1.79 0-.62.11-1.22.3-1.79l-2.9-2.25C.3 5.79 0 7.35 0 9c0 1.65.3 3.21.88 4.79l2.9-2.25z" fill="#FBBC05"/>
                <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.47.89 11.43 0 9 0 5.4 0 2.37 2.66.88 6.57l2.9 2.25c.73-2.21 2.79-3.85 5.22-3.85z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            {/* Toggle link */}
            <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-muted)' }}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <span
                onClick={() => {
                  setIsRegister(!isRegister);
                  setIsOtpStep(false);
                  setOtp('');
                  setError(null);
                  setSuccess(null);
                }}
                style={{ color: 'var(--color-secondary)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}
              >
                {isRegister ? 'Sign In' : 'Sign Up'}
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
