import type { StyleConfig } from '../../types/project';

export const EDITORIAL_BURGUNDY: StyleConfig = {
  presetName: 'Editorial Burgundy',
  primaryBg: '#3F0707',
  secondaryBg: '#F3E8D5',
  primaryTextColor: '#F5E4C4',
  secondaryTextColor: '#3F0707',
  accentColor: '#936B53',
  fontFamily: 'Playfair Display',
  fontSizeRatio: 1.0,
  lineHeight: 1.18,
  letterSpacing: -0.5,
  textAlign: 'center',
  grainIntensity: 0.22,
  vignetteIntensity: 0.32,
  alternatingScenes: true,
  showStarDecoration: true,
  maxLinesOnScreen: 2,
};

export const CREAM_EDITORIAL: StyleConfig = {
  presetName: 'Cream Editorial',
  primaryBg: '#F5ECE0',
  secondaryBg: '#3B0909',
  primaryTextColor: '#3B0909',
  secondaryTextColor: '#F5ECE0',
  accentColor: '#8E6349',
  fontFamily: 'DM Serif Display',
  fontSizeRatio: 1.0,
  lineHeight: 1.15,
  letterSpacing: -0.5,
  textAlign: 'center',
  grainIntensity: 0.16,
  vignetteIntensity: 0.18,
  alternatingScenes: false,
  showStarDecoration: true,
  maxLinesOnScreen: 2,
};

export const MIDNIGHT_VINTAGE: StyleConfig = {
  presetName: 'Midnight Vintage',
  primaryBg: '#181413',
  secondaryBg: '#E9E0CF',
  primaryTextColor: '#ECE3D1',
  secondaryTextColor: '#181413',
  accentColor: '#A88B70',
  fontFamily: 'Cormorant Garamond',
  fontSizeRatio: 1.1,
  lineHeight: 1.15,
  letterSpacing: 0,
  textAlign: 'center',
  grainIntensity: 0.25,
  vignetteIntensity: 0.42,
  alternatingScenes: false,
  showStarDecoration: true,
  maxLinesOnScreen: 2,
};

export const STYLE_PRESETS: Record<string, StyleConfig> = {
  'Editorial Burgundy': EDITORIAL_BURGUNDY,
  'Cream Editorial': CREAM_EDITORIAL,
  'Midnight Vintage': MIDNIGHT_VINTAGE,
};
