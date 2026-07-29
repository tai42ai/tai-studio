/**
 * @tai42/feature-extensions — the tool-extensions surface.
 *
 * `ExtensionsPage` is the shell-mounted read-only catalog; `ApplyExtensionsPanel`
 * is the apply-an-extension-to-a-tool flow; the sub-components are exported for
 * direct unit testing. The extension grouping helpers live in `@tai42/studio-sdk`
 * (shared with its `ExtensionPicker`) and are imported from there directly.
 */
export {
  ExtensionsPage,
  ExtensionEntry,
  ExtensionFamilyCard,
  extensionsQueryKey,
} from './extensions';
export { ApplyExtensionsPanel } from './apply-extensions';
