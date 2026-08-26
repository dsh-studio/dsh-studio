/**
 * The settings page section for the `at-file` namespace: one clearly labeled
 * enable checkbox over the durable settings scope. The checkbox is the native
 * browser control (uncontrolled), so clicking it flips instantly; the scope
 * write persists the value. The same scope value also gates the picker and
 * the dock, so this one checkbox is the whole switch. Product copy rides the
 * `at-file` locale namespace.
 */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { AtFileSettings } from '../contract.ts';
/** Injected business face: the live scope (bound to `useScope`) and the write verb. */
export interface AtFileSectionInjected {
    hooks: {
        scope: SettingsScope<AtFileSettings>;
    };
    setEnabled: (enabled: boolean) => Promise<void>;
}
/** Full section props: runtime share + injected face + the locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>;
/**
 * Render the section: one labeled enable checkbox.
 * @param props - runtime share, the bound scope hook, the write verb, and `t`.
 * @returns the section element tree.
 */
export declare function AtFileSection({ useScope, setEnabled, t }: AtFileSectionProps): import("react").JSX.Element;
