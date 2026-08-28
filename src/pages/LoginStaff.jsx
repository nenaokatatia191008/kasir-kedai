import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function LoginStaff() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    setLoading(false);

    if (error) {
      alert('❌ Email atau password salah!');
      return;
    }

    localStorage.setItem('staff', JSON.stringify(data));
    window.location.href = '/dashboard';
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#1C1815',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#2D241F',
        padding: '40px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h2 style={{ color: '#F5E6D3', textAlign: 'center', marginBottom: '30px' }}>
          🔐 Login Kasir
        </h2>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ color: '#C4A88A', display: 'block', marginBottom: '8px' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="admin@kedai.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #4A3728',
                backgroundColor: '#1C1815',
                color: '#F5E6D3',
                fontSize: '16px'
              }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ color: '#C4A88A', display: 'block', marginBottom: '8px' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #4A3728',
                backgroundColor: '#1C1815',
                color: '#F5E6D3',
                fontSize: '16px'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#D4A373',
              color: '#1C1815',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {loading ? 'Loading...' : 'Login'}
          </button>
        </form>
        <p style={{ color: '#8A6E56', textAlign: 'center', marginTop: '20px', fontSize: '14px' }}>
          👤 admin@kedai.com / admin123
        </p>
      </div>
    </div>
  );
}
