import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LoginScreen from './LoginScreen';
import React from 'react';
import { api } from '../lib/api';

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the PANSORI title', () => {
    vi.spyOn(api, 'listProviders').mockResolvedValue([]);
    render(<LoginScreen onAbout={vi.fn()} />);
    expect(screen.getByText(/PANSORI/i)).toBeTruthy();
  });

  it('renders the sign-in call-to-action text', () => {
    vi.spyOn(api, 'listProviders').mockResolvedValue([]);
    render(<LoginScreen onAbout={vi.fn()} />);
    expect(screen.getByText(/SIGN IN TO CONTINUE/i)).toBeTruthy();
  });

  it('renders a button per configured provider', async () => {
    vi.spyOn(api, 'listProviders').mockResolvedValue([
      { id: 'google', label: 'Sign in with Google' },
      { id: 'discord', label: 'Sign in with Discord' },
    ]);
    render(<LoginScreen onAbout={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('auth-provider-google')).toBeTruthy();
      expect(screen.getByTestId('auth-provider-discord')).toBeTruthy();
    });
  });

  it('provider button points to /api/auth/<provider>', async () => {
    vi.spyOn(api, 'listProviders').mockResolvedValue([
      { id: 'google', label: 'Sign in with Google' },
    ]);
    render(<LoginScreen onAbout={vi.fn()} />);
    await waitFor(() => {
      const link = screen.getByTestId('auth-provider-google') as HTMLAnchorElement;
      expect(link.href).toContain('/api/auth/google');
    });
  });

  it('shows an empty-state message when no providers are configured', async () => {
    vi.spyOn(api, 'listProviders').mockResolvedValue([]);
    render(<LoginScreen onAbout={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/NO AUTH PROVIDERS CONFIGURED/i)).toBeTruthy();
    });
  });
});
