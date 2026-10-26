import { describe, expect, it } from 'vitest';

import { inviteRow, memberActionDescriptor, memberDirectory, memberRow } from './schemas/members';

const member = {
  id: 'm-1',
  email: 'alice@example.com',
  role: 'editor',
  created_at: '2026-07-11T00:00:00Z',
  principals: [{ user_id: 'p-1', disabled: false, role: 'editor' }],
  disabled: false,
  handle: 'handle-m-1',
  provider_name: 'Alpha',
  action_keys: [],
};

const invite = {
  id: 'i-1',
  email: 'bob@example.com',
  role: 'viewer',
  created_at: '2026-07-12T00:00:00Z',
  expires_at: '2026-07-19T00:00:00Z',
  handle: 'handle-i-1',
  provider_name: 'Alpha',
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

  it("carry each principal's own role, a name or null", () => {
    const row = memberRow.parse({
      ...member,
      role: null,
      principals: [
        { user_id: 'p-1', disabled: false, role: 'viewer' },
        { user_id: 'p-2', disabled: false, role: null },
      ],
    });
    expect(row.principals.map((principal) => principal.role)).toEqual(['viewer', null]);
  });

  it("carry the owning provider's declared name on both rows", () => {
    expect(memberRow.parse(member).provider_name).toBe('Alpha');
    expect(inviteRow.parse({ ...invite, provider_name: 'Beta' }).provider_name).toBe('Beta');
  });

  it('reject a row without a provider name', () => {
    const { provider_name: _memberName, ...memberWithoutName } = member;
    const { provider_name: _inviteName, ...inviteWithoutName } = invite;
    expect(memberRow.safeParse(memberWithoutName).success).toBe(false);
    expect(inviteRow.safeParse(inviteWithoutName).success).toBe(false);
  });

  it('reject an empty provider name on a row', () => {
    expect(memberRow.safeParse({ ...member, provider_name: '' }).success).toBe(false);
    expect(inviteRow.safeParse({ ...invite, provider_name: '' }).success).toBe(false);
  });

  it('reject a principal without its role', () => {
    expect(
      memberRow.safeParse({ ...member, principals: [{ user_id: 'p-1', disabled: false }] }).success,
    ).toBe(false);
  });
});

const descriptor = {
  key: 'act-1',
  label: 'Invite',
  provider_name: 'Alpha',
  scope: 'page',
  destructive: false,
  input_schema: { type: 'object', properties: {} },
  result_schema: { type: 'object' },
};

describe('member action descriptor schema', () => {
  it("carries the owning provider's declared name", () => {
    expect(memberActionDescriptor.parse(descriptor).provider_name).toBe('Alpha');
  });

  it('reject a descriptor without a provider name', () => {
    const { provider_name: _name, ...withoutName } = descriptor;
    expect(memberActionDescriptor.safeParse(withoutName).success).toBe(false);
  });

  it('reject an empty provider name', () => {
    expect(memberActionDescriptor.safeParse({ ...descriptor, provider_name: '' }).success).toBe(
      false,
    );
  });
});
