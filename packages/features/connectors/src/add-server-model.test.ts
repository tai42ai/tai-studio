/**
 * The add-server pure model: the address rule checked before the look-up, the
 * identifier and name rules, scope parsing, the add request, the issuer's host, and
 * which sign-in service the client-credentials form preselects.
 */
import { describe, expect, it } from 'vitest';

import {
  ADDRESS_ERROR,
  addressError,
  buildAddServerArgs,
  IDENTIFIER_ERROR,
  identifierError,
  issuerHost,
  NAME_ERROR,
  nameError,
  parseScopes,
  signInChoice,
} from './add-server-model';
import { discovered } from './test-utils';

describe('addressError', () => {
  it('accepts an https address', () => {
    expect(addressError('https://mcp.example.com/mcp')).toBeNull();
    expect(addressError('  https://mcp.example.com/mcp  ')).toBeNull();
  });

  it('accepts http only on localhost and 127.0.0.1', () => {
    expect(addressError('http://localhost:8080/mcp')).toBeNull();
    expect(addressError('http://127.0.0.1:9000/mcp')).toBeNull();
    expect(addressError('http://mcp.example.com/mcp')).toBe(ADDRESS_ERROR);
  });

  it('refuses an unparseable address and any other scheme', () => {
    expect(addressError('')).toBe(ADDRESS_ERROR);
    expect(addressError('mcp.example.com')).toBe(ADDRESS_ERROR);
    expect(addressError('ftp://mcp.example.com')).toBe(ADDRESS_ERROR);
    expect(addressError('javascript:alert(1)')).toBe(ADDRESS_ERROR);
  });
});

describe('identifierError and nameError', () => {
  it('holds the identifier to the platform slug rule', () => {
    expect(identifierError('remote_files2')).toBeNull();
    expect(identifierError('')).toBe(IDENTIFIER_ERROR);
    expect(identifierError('2files')).toBe(IDENTIFIER_ERROR);
    expect(identifierError('Remote')).toBe(IDENTIFIER_ERROR);
    expect(identifierError('remote-files')).toBe(IDENTIFIER_ERROR);
  });

  it('requires a name', () => {
    expect(nameError('Remote files')).toBeNull();
    expect(nameError('   ')).toBe(NAME_ERROR);
  });
});

describe('parseScopes', () => {
  it('splits on any whitespace and drops empty runs', () => {
    expect(parseScopes('  files.read \n files.write\tmail ')).toEqual([
      'files.read',
      'files.write',
      'mail',
    ]);
    expect(parseScopes('   ')).toEqual([]);
  });
});

describe('buildAddServerArgs', () => {
  it('sends the looked-up address, the trimmed name and identifier, and the parsed scopes', () => {
    expect(
      buildAddServerArgs({
        url: 'https://mcp.example.com/mcp',
        name: ' Remote files ',
        identifier: ' remote_files ',
        scopes: 'files.read files.write',
      }),
    ).toEqual({
      url: 'https://mcp.example.com/mcp',
      id: 'remote_files',
      display_name: 'Remote files',
      scopes: ['files.read', 'files.write'],
    });
  });
});

describe('issuerHost', () => {
  it("names the issuer's host, with its port when it has one", () => {
    expect(issuerHost('https://login.example.com/tenant/v2')).toBe('login.example.com');
    expect(issuerHost('http://127.0.0.1:9000')).toBe('127.0.0.1:9000');
  });
});

describe('signInChoice', () => {
  it('uses the one listed service', () => {
    expect(signInChoice(discovered())).toEqual({
      issuer: 'https://login.example.com',
      unlisted: null,
    });
  });

  it('preselects the stored credentials’ service when the server still lists it', () => {
    const lookup = discovered({
      authorization_servers: ['https://auth-a.example.net', 'https://auth-b.example.net'],
      client_issuer: 'https://auth-b.example.net',
    });
    expect(signInChoice(lookup)).toEqual({ issuer: 'https://auth-b.example.net', unlisted: null });
  });

  it('preselects nothing among several when no credentials are set', () => {
    const lookup = discovered({
      authorization_servers: ['https://auth-a.example.net', 'https://auth-b.example.net'],
    });
    expect(signInChoice(lookup)).toEqual({ issuer: null, unlisted: null });
  });

  it('preselects nothing and names the service the credentials were set for when it is gone', () => {
    const lookup = discovered({
      authorization_servers: ['https://auth-a.example.net', 'https://auth-b.example.net'],
      client_issuer: 'https://auth-old.example.net',
    });
    expect(signInChoice(lookup)).toEqual({
      issuer: null,
      unlisted: 'https://auth-old.example.net',
    });
  });

  it('names a gone service beside a single listed one, which stays the service used', () => {
    const lookup = discovered({ client_issuer: 'https://auth-old.example.net' });
    expect(signInChoice(lookup)).toEqual({
      issuer: 'https://login.example.com',
      unlisted: 'https://auth-old.example.net',
    });
  });
});
