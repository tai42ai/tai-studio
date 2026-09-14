/**
 * The MCP-servers surface of the unified Connectors page: mounted status, the
 * failed-server health section, and the manifest `mcp` config editor, so the operator
 * sees every tool source beside the provider connections.
 */
import { Card, DirtyGuardBoundary } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { McpConfigSection } from './mcp-config-editor';
import { FailedServersSection, McpStatusSection } from './mcp-status';

/**
 * Every sourced MCP server — mounted status plus the manifest `mcp` config
 * (hand-authored, marketplace-installed, and connector-managed entries, each showing
 * how it was added) — in one section, so the operator sees all tool sources beside the
 * provider connections below.
 */
export function McpServersSection(): ReactNode {
  return (
    // The config editor arms its dirty guard against this boundary (`useRegisterDirty`),
    // so leaving the page — or closing the tab — with unsaved MCP edits confirms first.
    <DirtyGuardBoundary>
      <section aria-label="MCP servers">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
          <Card>
            <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
              Mounted servers
            </h2>
            <McpStatusSection />
          </Card>
          <FailedServersSection />
          <Card>
            <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
              Configuration
            </h2>
            <McpConfigSection />
          </Card>
        </div>
      </section>
    </DirtyGuardBoundary>
  );
}
