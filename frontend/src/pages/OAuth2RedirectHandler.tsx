import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth, type User } from '../context/AuthContext';
import api from '../services/api';

export const OAuth2RedirectHandler: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // Store temporarily so subsequent api.get utilizes it via interceptor
      localStorage.setItem('token', token);
      
      api.get<User>('/api/auth/me')
        .then((response) => {
          login(token, response.data);
          navigate('/dashboard');
        })
        .catch((error) => {
          console.error('OAuth2 authentication redirect failed:', error);
          localStorage.removeItem('token');
          navigate('/login?error=oauth2');
        });
    } else {
      navigate('/login');
    }
  }, [searchParams, login, navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
        <h2 style={{ color: 'var(--color-secondary)' }}>Authenticating...</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>
          Finalizing Google sign-in credentials. Please wait.
        </p>
      </div>
    </div>
  );
};
