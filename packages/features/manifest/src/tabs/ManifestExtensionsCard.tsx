/**
 * The Manifest screen's Extensions section: the extensions this server loaded, by kind
 * (`LoadedExtensions`), and the extension settings the manifest declares
 * (`ExtensionSettings`). Read-only: extensions are attached to a tool on its Tools page
 * or in a preset.
 */
import { Card } from '@tai42/studio-sdk';
import { type ReactNode, useId } from 'react';

import { ExtensionSettings } from './ExtensionSettings';
import { LoadedExtensions } from './LoadedExtensions';

export function ManifestExtensionsCard(): ReactNode {
  const titleId = useId();
  return (
    <Card>
      <section aria-labelledby={titleId} className="tai-stack">
        <h2 id={titleId} className="tai-section-title">
          Extensions
        </h2>
        <p className="tai-muted" style={{ margin: 0 }}>
          The extensions this server loaded, and the extension settings the manifest declares.
        </p>
        <LoadedExtensions />
        <ExtensionSettings />
      </section>
    </Card>
  );
}
