import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'zh' | 'en';
export type Theme = 'dark' | 'light';

interface SettingsStore {
    locale: Locale;
    theme: Theme;
    setLocale: (locale: Locale) => void;
    setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            locale: 'zh',
            theme: 'dark',
            setLocale: (locale: Locale) => set({ locale }),
            setTheme: (theme: Theme) => set({ theme }),
        }),
        {
            name: 'lumenx-settings',
        }
    )
);
