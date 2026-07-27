/**
 * The reference Studio plugin's front-end bundle.
 *
 * This is a REAL minimal Studio plugin: it exports a `register(context)` entry
 * that registers one page and one tool panel. The three shared modules (react,
 * react-dom, @tai42/studio-sdk) are marked EXTERNAL by the build and resolved by
 * the host's server-injected import map, so this bundle binds the host's
 * singletons — the same React instance and the same `ApiProvider` context the
 * shell built. A second React copy would make `useApi()` throw a missing-provider
 * error across the plugin boundary; this bundle proving `useApi()` works is the
 * singleton contract in action.
 *
 * It doubles as author documentation (the smallest complete plugin) and as the
 * e2e test subject the boot recipe drives.
 */
import * as React from 'react';
import { useState } from 'react';
import {
  Button,
  Card,
  ErrorState,
  JsonTree,
  Spinner,
  TextInput,
  Checkbox,
  useApi,
  type PluginContext,
  type PluginPageProps,
  type SettingsTabProps,
  type ToolPanelProps,
} from '@tai42/studio-sdk';

// The plugin's own scoped stylesheet. Importing it makes the build emit one CSS
// asset, which the host injects (SRI'd) before this bundle's JS runs.
import './styles.css';

/**
 * Expose this bundle's React reference so the e2e singleton test can assert it is
 * IDENTICAL to the host's `/vendor/react.js` module — the proof that the import
 * map bound one React instance across the plugin boundary rather than shipping a
 * second copy.
 */
declare global {
  interface Window {
    __pluginReact?: typeof React;
  }
}
window.__pluginReact = React;

/** The tool this plugin's custom panel targets. */
const DEMO_TOOL = 'studio_demo_echo';

interface EchoResult {
  readonly original: string;
  readonly echoed: string;
  readonly shouted: boolean;
}

function isEchoResult(value: unknown): value is EchoResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.original === 'string' &&
    typeof record.echoed === 'string' &&
    typeof record.shouted === 'boolean'
  );
}

/**
 * The custom run panel for `studio_demo_echo`. It drives the tool through
 * `useApi().runTool` (reaching the host's ApiProvider singleton), holds a running
 * state while the request is open, and renders the typed result — the rich
 * alternative to the auto-form that a plugin ships for a tool worth a bespoke UI.
 */
function EchoPanel(_props: ToolPanelProps): React.ReactElement {
  const api = useApi();
  const [message, setMessage] = useState('hello from the reference plugin');
  const [shout, setShout] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running'>('idle');
  const [result, setResult] = useState<EchoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRun = (): void => {
    setStatus('running');
    setError(null);
    setResult(null);
    api
      .runTool({ tool: DEMO_TOOL, kwargs: { message, shout } })
      .then((raw) => {
        if (!isEchoResult(raw)) {
          throw new Error('studio_demo_echo returned an unexpected shape');
        }
        setResult(raw);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setStatus('idle');
      });
  };

  return (
    <Card>
      <div
        data-testid="reference-echo-panel"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <strong>Reference plugin panel — {DEMO_TOOL}</strong>
        <TextInput
          aria-label="message"
          data-testid="echo-message"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
        <Checkbox checked={shout} onCheckedChange={setShout} label="Shout (upper-case the echo)" />
        <Button
          variant="primary"
          data-testid="echo-run"
          disabled={status === 'running'}
          onClick={onRun}
        >
          {status === 'running' ? 'Running…' : 'Run echo'}
        </Button>
        {status === 'running' && <Spinner />}
        {error !== null && <ErrorState message={error} />}
        {result !== null && (
          <div data-testid="echo-result">
            {/* `label` names the pane while it overflows. Left unset every JsonTree
                on a screen is announced as "JSON", so a keyboard user tabbing
                between panes cannot tell them apart — name it after what it holds. */}
            <JsonTree data={result} label={`${DEMO_TOOL} result`} />
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * A neutral inline-SVG icon for the plugin's nav entry. It draws with
 * `currentColor` and fills its box, so the host's fixed, color-inheriting icon
 * slot styles it; its bytes ship inside this bundle, so no external fetch.
 */
function DemoIcon(): React.ReactElement {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <path d="M5.5 8h5M8 5.5v5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The plugin's full page, mounted by the shell at `/plugins/{pluginId}/demo`. It
 * carries a stable testid the cold-deep-link e2e asserts renders on first paint.
 */
function DemoPage({ pluginId }: PluginPageProps): React.ReactElement {
  return (
    <Card>
      <div
        data-testid="reference-demo-page"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <h1>Reference Studio plugin</h1>
        <p>
          This page is contributed by the <code>{pluginId}</code> Studio plugin. It renders inside
          the host shell using the host&rsquo;s React and design-system singletons, loaded through
          the server-injected import map.
        </p>
        <p>
          Open the <code>{DEMO_TOOL}</code> tool to see the custom panel this plugin registers;
          other tools fall back to the auto-generated form.
        </p>
        {/* Styled ONLY by the plugin's own scoped stylesheet (token values), the
            proof that the host injected it — the e2e reads a token-derived
            computed property here. */}
        <div className="reference_plugin-demo" data-testid="reference-demo-scoped">
          This box is styled by the plugin&rsquo;s scoped stylesheet, using design-system tokens.
        </div>
      </div>
    </Card>
  );
}

/**
 * The plugin's settings tab, mounted by the shell in the Settings workbench after
 * the core tabs. It carries a stable testid the settings-surface e2e asserts
 * renders once the tab is selected — the smallest complete `registerSettingsTab`
 * contribution.
 */
function DemoSettingsTab({ pluginId }: SettingsTabProps): React.ReactElement {
  return (
    <Card>
      <div
        data-testid="reference-settings-tab"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <strong>Reference plugin settings</strong>
        <p>
          This tab is contributed by the <code>{pluginId}</code> Studio plugin through
          <code> registerSettingsTab</code>; the host mounts it in the Settings workbench after the
          core tabs.
        </p>
      </div>
    </Card>
  );
}

/**
 * The plugin entry the host calls with a {@link PluginContext} bound to this
 * plugin's identity. It contributes the tool panel, page, settings tab, and nav
 * entry; the host commits them atomically once this returns.
 */
export function register(context: PluginContext): void {
  context.registerToolPanel({ toolName: DEMO_TOOL, component: EchoPanel });
  context.registerPage({ path: 'demo', title: 'Reference', component: DemoPage });
  // A sidebar nav entry linking to the page above (its `path` matches).
  context.registerNavEntry({ path: 'demo', title: 'Reference', icon: DemoIcon });
  // A settings tab in the Settings workbench.
  context.registerSettingsTab({ id: 'demo', title: 'Reference', component: DemoSettingsTab });
}
