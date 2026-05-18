import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginScreen from './LoginScreen';
import React from 'react';

describe('LoginScreen', () => {
  it('renders the PANSORI title', () => {
    render(<LoginScreen />);
    expect(screen.getByText(/PANSORI/i)).toBeTruthy();
  });

  it('renders the sign-in call-to-action text', () => {
    render(<LoginScreen />);
    expect(screen.getByText(/SIGN IN TO CONTINUE/i)).toBeTruthy();
  });

  it('renders a Google sign-in link', () => {
    render(<LoginScreen />);
    const link = screen.getByRole('link', { name: /sign in with google/i });
    expect(link).toBeTruthy();
  });

  it('Google sign-in link points to the auth route', () => {
    render(<LoginScreen />);
    const link = screen.getByRole('link', { name: /sign in with google/i }) as HTMLAnchorElement;
    expect(link.href).toContain('/api/auth/google');
  });
});
