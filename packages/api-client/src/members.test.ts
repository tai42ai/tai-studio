import { describe, expect, it } from 'vitest';

import { inviteRow, memberDirectory, memberRow } from './schemas/members';

const member = {
  id: 'm-1',
  email: 'alice@example.com',
  role: 'editor',
  created_at: '2026-07-11T00:00:00Z',
  principals: [{ user_id: 'p-1', disabled: false }],
  disabled: false,
  handle: 'handle-m-1',
  action_keys: [],
};

const invite = {
  id: 'i-1',
  email: 'bob@example.com',
  role: 'viewer',
  created_at: '2026-07-12T00:00:00Z',
  expires_at: '2026-07-19T00:00:00Z',
  handle: 'handle-i-1',
  action_keys: [],
};

describe('members schemas', () => {
  it('accept a role name', () => {
    expect(memberRow.parse(member).role).toBe('editor');
    expect(inviteRow.parse(invite).role).toBe('viewer');
  });

  it('accept a null role (access not written from a role)', () => {
    const directory = memberDirectory.parse({
      members: [{ ...member, role: null }],
      invites: [{ ...invite, role: null }],
    });
    expect(directory.members[0]?.role).toBeNull();
    expect(directory.invites[0]?.role).toBeNull();
  });

  it('reject a missing role', () => {
    const { role: _role, ...withoutRole } = member;
    expect(memberRow.safeParse(withoutRole).success).toBe(false);
  });
});
