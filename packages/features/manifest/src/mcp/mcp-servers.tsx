/**
 * The "MCP servers" block of the Manifest screen: mounted status, the unbound-server
 * health section, and the manifest `mcp` config editor.
 */
import { Card, DirtyGuardBoundary } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { McpConfigSection } from './mcp-config-editor';
import { McpStatusSection, UnboundServersSection } from './mcp-status';

/**
 * Every sourced MCP server: mounted status plus the manifest `mcp` config
 * (hand-authored, marketplace-installed, and connector-managed entries, each showing
 * how it was added).
 */
export function McpServersSection(): ReactNode {
  return (
    // The config editor arms its dirty guard against this boundary (`useRegisterDirty`),
    // so leaving the page — or closing the tab — with unsaved MCP edits confirms first.
    <DirtyGuardBoundary>
      <section aria-labelledby="manifest-mcp-servers-heading">
        <h2 id="manifest-mcp-servers-heading" className="tai-section-title">
          MCP servers
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
          <Card>
            <h3 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
              Mounted servers
            </h3>
            <McpStatusSection />
          </Card>
          <UnboundServersSection />
          <Card>
            <h3 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
              Configuration
            </h3>
            <McpConfigSection />
          </Card>
        </div>
      </section>
    </DirtyGuardBoundary>
  );
}
