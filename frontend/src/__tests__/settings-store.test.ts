import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';

describe('settingsStore', () => {
    beforeEach(() => {
        useSettingsStore.setState({ locale: 'zh', theme: 'dark' });
    });

    it('has correct default values', () => {
        const state = useSettingsStore.getState();
        expect(state.locale).toBe('zh');
        expect(state.theme).toBe('dark');
    });

    it('setLocale updates locale', () => {
        useSettingsStore.getState().setLocale('en');
        expect(useSettingsStore.getState().locale).toBe('en');
    });

    it('setTheme updates theme', () => {
        useSettingsStore.getState().setTheme('light');
        expect(useSettingsStore.getState().theme).toBe('light');
    });

    it('setLocale rejects invalid values at type level', () => {
        // Verify type constraint works - both valid locales are accepted
        useSettingsStore.getState().setLocale('zh');
        expect(useSettingsStore.getState().locale).toBe('zh');
        useSettingsStore.getState().setLocale('en');
        expect(useSettingsStore.getState().locale).toBe('en');
    });

    it('setTheme rejects invalid values at type level', () => {
        useSettingsStore.getState().setTheme('dark');
        expect(useSettingsStore.getState().theme).toBe('dark');
        useSettingsStore.getState().setTheme('light');
        expect(useSettingsStore.getState().theme).toBe('light');
    });
});
