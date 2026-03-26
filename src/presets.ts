import type { GradientParams } from './renderer';

export interface Preset {
  id: string;
  name: string;
  params: GradientParams;
  builtin?: boolean;
}

const STORAGE_KEY = 'gradient-app-presets';

// Built-in presets (cannot be deleted)
export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'keplr-1',
    name: 'Keplr 1',
    builtin: true,
    params: {
      colors: ['#B2ACF4', '#797DFF', '#14AFEB', '#006EE5'],
      complexity: 35,
      smoothness: 80,
      distortion: 40,
      seed: 137,
      flow: 0,
      starAmount: 50,
      starGlow: 0,
      starScale: 100,
      cloudSize: 50,
      cloudAmount: 40,
      scale: 50,
      mixing: 50,
      waveX: 50,
      waveY: 50,
      warpProportion: 38,
      warpSoftness: 100,
      warpDistortion: 0,
      warpSwirl: 57,
      warpShapeScale: 40,
    },
  },
];

export function loadUserPresets(): Preset[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function getAllPresets(): Preset[] {
  return [...BUILTIN_PRESETS, ...loadUserPresets()];
}

export function addUserPreset(name: string, params: GradientParams): Preset {
  const preset: Preset = {
    id: `user-${Date.now()}`,
    name,
    params: { ...params, colors: [...params.colors] },
  };
  const userPresets = loadUserPresets();
  userPresets.push(preset);
  saveUserPresets(userPresets);
  return preset;
}

export function deleteUserPreset(id: string) {
  const userPresets = loadUserPresets().filter(p => p.id !== id);
  saveUserPresets(userPresets);
}
