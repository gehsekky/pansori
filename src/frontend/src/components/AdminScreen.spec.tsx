import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminScreen from './AdminScreen';
import type { AuthUser } from '../lib/api';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: {
    listCampaigns: vi.fn(),
    listCampaignMembers: vi.fn(),
    addCampaignMember: vi.fn(),
    setCampaignMemberRole: vi.fn(),
    removeCampaignMember: vi.fn(),
    setCampaignVisibility: vi.fn(),
    createCampaign: vi.fn(),
    // Used by the nested CampaignContentEditor.
    listCampaignSections: vi.fn(),
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
    deleteCampaignSection: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const OWNER_USER: AuthUser = {
  id: 'u-alice',
  email: 'alice@test',
  display_name: 'Alice',
  avatar_url: null,
  is_admin: false,
};

const MEMBERS = [
  {
    user_id: 'u-alice',
    role: 'owner',
    added_at: '2026-01-01T00:00:00Z',
    display_name: 'Alice',
    email: 'alice@test',
    avatar_url: null,
  },
  {
    user_id: 'u-bob',
    role: 'editor',
    added_at: '2026-01-02T00:00:00Z',
    display_name: 'Bob',
    email: 'bob@test',
    avatar_url: null,
  },
];

function mockCampaigns(
  myRole: 'owner' | 'editor' | 'player' | null,
  visibility: 'global' | 'private' = 'global'
) {
  mocked.listCampaigns.mockResolvedValue([
    { id: 'malgovia', name: 'Malgovia', visibility, my_role: myRole },
    { id: 'sandbox', name: 'Dev Sandbox', visibility: 'global', my_role: null },
  ]);
  mocked.listCampaignMembers.mockResolvedValue(MEMBERS);
}

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  // The content editor renders whenever a campaign is selected — give it a
  // quiet default so member-management tests don't trip over it.
  mocked.listCampaignSections.mockResolvedValue([]);
});

describe('AdminScreen', () => {
  it('lists campaigns with role badges and disables no-access ones', async () => {
    mockCampaigns('owner');
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    const malgoviaCard = (await screen.findByText('Malgovia')).closest('button')!;
    expect(within(malgoviaCard).getByText('OWNER')).toBeTruthy();
    expect(screen.getByText('NO ACCESS')).toBeTruthy();
    const sandboxCard = screen.getByText('Dev Sandbox').closest('button')!;
    expect(sandboxCard.disabled).toBe(true);
  });

  it('auto-selects the first manageable campaign and shows its members', async () => {
    mockCampaigns('owner');
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    expect(await screen.findByText('MEMBERS — MALGOVIA')).toBeTruthy();
    expect(mocked.listCampaignMembers).toHaveBeenCalledWith('malgovia');
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(screen.getByText('(YOU)')).toBeTruthy();
  });

  it('owners get the add form; submitting calls the api and reloads members', async () => {
    mockCampaigns('owner');
    mocked.addCampaignMember.mockResolvedValue(MEMBERS[1]);
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    const email = await screen.findByLabelText('ADD MEMBER BY EMAIL');
    fireEvent.change(email, { target: { value: 'carol@test' } });
    fireEvent.click(screen.getByText('ADD'));
    // 'player' is the add-form default — inviting friends to play.
    await waitFor(() =>
      expect(mocked.addCampaignMember).toHaveBeenCalledWith('malgovia', 'carol@test', 'player')
    );
    // Initial load + reload after the add.
    await waitFor(() => expect(mocked.listCampaignMembers).toHaveBeenCalledTimes(2));
  });

  it('editors get a read-only member list (no add form, no role selects)', async () => {
    mockCampaigns('editor');
    render(<AdminScreen user={{ ...OWNER_USER, id: 'u-bob' }} onBack={vi.fn()} />);
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(screen.queryByLabelText('ADD MEMBER BY EMAIL')).toBeNull();
    expect(screen.queryByLabelText('Role for Bob')).toBeNull();
    // Roles render as plain text instead.
    expect(screen.getAllByText('EDITOR').length).toBeGreaterThan(0);
  });

  it('maps the last_owner failure to a readable message', async () => {
    mockCampaigns('owner');
    mocked.setCampaignMemberRole.mockRejectedValue({ error: 'last_owner' });
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    const roleSelect = await screen.findByLabelText('Role for Alice');
    fireEvent.change(roleSelect, { target: { value: 'editor' } });
    expect(
      await screen.findByText(/cannot lose its last owner/i, undefined, { timeout: 2000 })
    ).toBeTruthy();
  });

  it('confirms before removing a member and calls the api', async () => {
    mockCampaigns('owner');
    mocked.removeCampaignMember.mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText('Remove Bob'));
    await waitFor(() =>
      expect(mocked.removeCampaignMember).toHaveBeenCalledWith('malgovia', 'u-bob')
    );
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an error card when the campaign list fails to load', async () => {
    mocked.listCampaigns.mockRejectedValue(new Error('boom'));
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    expect(await screen.findByText('Could not load campaigns.')).toBeTruthy();
  });

  it('treats player membership as no-admin: card disabled, PLAYER badge', async () => {
    mockCampaigns('player');
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    const card = (await screen.findByText('Malgovia')).closest('button')!;
    expect(card.disabled).toBe(true);
    expect(within(card).getByText('PLAYER')).toBeTruthy();
    // Nothing auto-selected → no members panel.
    expect(screen.queryByText(/^MEMBERS — /)).toBeNull();
  });

  it('creator mode shows only owner/editor campaigns with its own title', async () => {
    mocked.listCampaigns.mockResolvedValue([
      { id: 'malgovia', name: 'Malgovia', visibility: 'global', my_role: 'owner' },
      { id: 'sandbox', name: 'Dev Sandbox', visibility: 'global', my_role: null },
      { id: 'secret', name: 'Secret Realm', visibility: 'private', my_role: 'player' },
    ]);
    mocked.listCampaignMembers.mockResolvedValue(MEMBERS);
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} mode="creator" />);
    expect(await screen.findByText('CAMPAIGN CREATOR')).toBeTruthy();
    expect(await screen.findByText('Malgovia')).toBeTruthy();
    // No-access and player-only campaigns don't belong on the creator surface.
    expect(screen.queryByText('Dev Sandbox')).toBeNull();
    expect(screen.queryByText('Secret Realm')).toBeNull();
  });

  it('creator mode creates a campaign: name → derived slug id, selected on success', async () => {
    mocked.listCampaigns.mockResolvedValue([
      { id: 'malgovia', name: 'Malgovia', visibility: 'global', my_role: 'owner' },
    ]);
    mocked.listCampaignMembers.mockResolvedValue(MEMBERS);
    mocked.createCampaign.mockResolvedValue({
      id: 'the-mistwood',
      name: 'The Mistwood!',
      visibility: 'private',
      my_role: 'owner',
    });
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} mode="creator" />);
    fireEvent.click(await screen.findByTestId('new-campaign-btn'));
    fireEvent.change(screen.getByLabelText('CAMPAIGN NAME'), {
      target: { value: 'The Mistwood!' },
    });
    expect(screen.getByText(/ID: the-mistwood/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('create-campaign-btn'));
    await waitFor(() =>
      expect(mocked.createCampaign).toHaveBeenCalledWith('the-mistwood', 'The Mistwood!')
    );
    // The new campaign joins the list and becomes the selection.
    expect(await screen.findByText('MEMBERS — THE MISTWOOD!')).toBeTruthy();
  });

  it('surfaces a taken-id conflict on create', async () => {
    mocked.listCampaigns.mockResolvedValue([]);
    mocked.createCampaign.mockRejectedValue({ error: 'campaign_exists' });
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} mode="creator" />);
    fireEvent.click(await screen.findByTestId('new-campaign-btn'));
    fireEvent.change(screen.getByLabelText('CAMPAIGN NAME'), { target: { value: 'Malgovia' } });
    fireEvent.click(screen.getByTestId('create-campaign-btn'));
    expect(await screen.findByText(/"malgovia" is taken/)).toBeTruthy();
  });

  it('deep-links select the initial campaign and report selection changes', async () => {
    mocked.listCampaigns.mockResolvedValue([
      { id: 'malgovia', name: 'Malgovia', visibility: 'global', my_role: 'owner' },
      { id: 'sandbox', name: 'Dev Sandbox', visibility: 'global', my_role: 'owner' },
    ]);
    mocked.listCampaignMembers.mockResolvedValue(MEMBERS);
    const onSelectCampaign = vi.fn();
    render(
      <AdminScreen
        user={OWNER_USER}
        onBack={vi.fn()}
        mode="creator"
        initialCampaignId="sandbox"
        onSelectCampaign={onSelectCampaign}
      />
    );
    // The deep-linked campaign wins over the first-workable default…
    expect(await screen.findByText('MEMBERS — DEV SANDBOX')).toBeTruthy();
    await waitFor(() => expect(onSelectCampaign).toHaveBeenLastCalledWith('sandbox'));
    // …and clicking another campaign reports the new selection.
    fireEvent.click(screen.getByText('Malgovia'));
    await waitFor(() => expect(onSelectCampaign).toHaveBeenLastCalledWith('malgovia'));
  });

  it('falls back to the first workable campaign when the deep link is unknown', async () => {
    mockCampaigns('owner');
    render(
      <AdminScreen user={OWNER_USER} onBack={vi.fn()} mode="creator" initialCampaignId="nope" />
    );
    expect(await screen.findByText('MEMBERS — MALGOVIA')).toBeTruthy();
  });

  it('creator mode shows an empty state when the user works on nothing', async () => {
    mocked.listCampaigns.mockResolvedValue([
      { id: 'malgovia', name: 'Malgovia', visibility: 'global', my_role: null },
    ]);
    render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} mode="creator" />);
    expect(await screen.findByText('NO CAMPAIGNS YET')).toBeTruthy();
    expect(screen.queryByText('Malgovia')).toBeNull();
  });

  it('shows the visibility badge and an admin-only promote/demote toggle', async () => {
    mockCampaigns('owner', 'private');
    mocked.setCampaignVisibility.mockResolvedValue({ ok: true, visibility: 'global' });
    const { unmount } = render(<AdminScreen user={OWNER_USER} onBack={vi.fn()} />);
    // Non-admin owner: badge yes, toggle no.
    const card = (await screen.findByText('Malgovia')).closest('button')!;
    expect(within(card).getByText('PRIVATE')).toBeTruthy();
    await screen.findByText('MEMBERS — MALGOVIA');
    expect(screen.queryByText('MAKE GLOBAL')).toBeNull();
    unmount();

    mockCampaigns('owner', 'private');
    render(<AdminScreen user={{ ...OWNER_USER, is_admin: true }} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByText('MAKE GLOBAL'));
    await waitFor(() =>
      expect(mocked.setCampaignVisibility).toHaveBeenCalledWith('malgovia', 'global')
    );
    // Local state flips without a refetch — button now offers the demote.
    expect(await screen.findByText('MAKE PRIVATE')).toBeTruthy();
  });
});
