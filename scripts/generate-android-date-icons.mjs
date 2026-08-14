#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const drawableDir = join(root, 'android/app/src/main/res/drawable');
const legacyDir = join(root, 'android/app/src/main/res/mipmap-anydpi');
const adaptiveDir = join(root, 'android/app/src/main/res/mipmap-anydpi-v26');

for (const directory of [drawableDir, legacyDir, adaptiveDir])
  mkdirSync(directory, { recursive: true });

const glyphs = {
  0: {
    width: 16.31,
    path: 'M8.15,3.33 Q6.12,3.33 5.05,5.44 Q3.97,7.54 3.97,12.01 Q3.97,16.46 5.05,18.56 Q6.12,20.67 8.15,20.67 Q10.20,20.67 11.27,18.56 Q12.35,16.46 12.35,12.01 Q12.35,7.54 11.27,5.44 Q10.20,3.33 8.15,3.33 Z M8.15,0 Q12.14,0 14.22,3.12 Q16.31,6.24 16.31,12.01 Q16.31,17.76 14.22,20.88 Q12.14,24 8.15,24 Q4.17,24 2.08,20.88 Q0,17.76 0,12.01 Q0,6.24 2.08,3.12 Q4.17,0 8.15,0 Z',
  },
  1: {
    width: 14.69,
    path: 'M0.45,20.39 L5.53,20.39 L5.53,3.93 L0,5.04 L0,1.20 L5.95,0 L9.60,0 L9.60,20.39 L14.69,20.39 L14.69,24 L0.45,24 Z',
  },
  2: {
    width: 15.33,
    path: 'M5.32,20.46 L15.33,20.46 L15.33,24 L0,24 L0,20.75 Q1.88,18.80 4.88,15.77 Q7.89,12.73 8.65,11.86 Q10.08,10.25 10.62,9.19 Q11.17,8.13 11.17,7.14 Q11.17,5.55 10.05,4.55 Q8.94,3.54 7.09,3.54 Q5.72,3.54 4.18,4.02 Q2.65,4.50 0.15,5.91 L0.15,1.65 Q2.34,0.78 3.99,0.39 Q5.64,0 7.03,0 Q10.72,0 12.96,1.89 Q15.21,3.77 15.21,6.94 Q15.21,8.43 14.66,9.76 Q14.10,11.08 12.67,12.84 Q12.28,13.29 10.24,15.40 Q8.21,17.51 5.32,20.46 Z',
  },
  3: {
    width: 15.57,
    path: 'M12.58,11.07 Q12.94,11.14 14.25,12.73 Q15.57,14.32 15.57,16.63 Q15.57,20.15 13.15,22.08 Q10.74,24 6.41,24 Q4.97,24 3.45,23.71 Q1.93,23.43 0,22.76 L0,18.69 Q1.90,19.80 3.33,20.16 Q4.76,20.51 6.32,20.51 Q8.99,20.51 10.31,19.52 Q11.63,18.52 11.63,16.63 Q11.63,14.90 10.41,13.92 Q9.19,12.93 6.90,12.93 L3.84,12.93 L3.84,9.51 L7.02,9.51 Q9.08,9.51 10.09,8.74 Q11.11,7.97 11.11,6.55 Q11.11,5.08 10.06,4.28 Q9,3.48 6.90,3.48 Q5.71,3.48 4.33,3.74 Q2.96,4 0.67,4.76 L0.67,1.07 Q2.76,0.49 4.28,0.24 Q5.81,0 7.17,0 Q10.76,0 12.90,1.68 Q15.05,3.35 15.05,6.23 Q15.05,8.25 13.89,9.65 Q12.73,11.05 12.58,11.07 Z',
  },
  4: {
    width: 17.76,
    path: 'M10.39,4.89 L3.92,15 L10.39,15 Z M9.80,0 L14.47,0 L14.47,15 L17.76,15 L17.76,18.57 L14.47,18.57 L14.47,24 L10.39,24 L10.39,18.57 L0,18.57 L0,14.93 Z',
  },
  5: {
    width: 15.59,
    path: 'M0.95,0 L13.92,0 L13.92,3.54 L4.72,3.54 L4.72,7.92 Q4.78,7.90 5.49,7.78 Q6.19,7.66 6.90,7.66 Q10.87,7.66 13.23,9.87 Q15.59,12.08 15.59,15.83 Q15.59,19.69 13.16,21.85 Q10.74,24 6.43,24 Q4.97,24 3.46,23.75 Q1.95,23.51 0,22.91 L0,18.66 Q2.02,19.76 3.41,20.11 Q4.81,20.46 6.37,20.46 Q8.80,20.46 10.18,19.22 Q11.56,17.97 11.56,15.83 Q11.56,13.68 10.18,12.44 Q8.80,11.20 6.37,11.20 Q5.20,11.20 4.03,11.46 Q2.86,11.72 0.95,12.58 Z',
  },
  6: {
    width: 16.29,
    path: 'M8.41,11.26 Q6.60,11.26 5.55,12.50 Q4.49,13.73 4.49,15.96 Q4.49,18.18 5.55,19.42 Q6.60,20.67 8.41,20.67 Q10.21,20.67 11.26,19.42 Q12.32,18.18 12.32,15.96 Q12.32,13.73 11.26,12.50 Q10.21,11.26 8.41,11.26 Z M14.85,1.03 L14.85,4.86 Q13.08,4.02 11.98,3.75 Q10.88,3.48 9.80,3.48 Q7.06,3.48 5.61,5.34 Q4.16,7.20 3.98,9.55 Q4.01,9.42 5.45,8.68 Q6.88,7.93 8.58,7.93 Q12.14,7.93 14.21,10.11 Q16.29,12.28 16.29,15.96 Q16.29,19.58 14.13,21.79 Q11.97,24 8.41,24 Q4.30,24 2.15,20.88 Q0,17.76 0,12.01 Q0,6.57 2.62,3.29 Q5.25,0 9.68,0 Q10.86,0 12.05,0.23 Q13.24,0.46 14.85,1.03 Z',
  },
  7: {
    width: 15.78,
    path: 'M0,0 L15.78,0 L15.78,1.91 L7.27,24 L2.96,24 L10.83,3.61 L0,3.61 Z',
  },
  8: {
    width: 16.19,
    path: 'M8.09,13.02 Q6.14,13.02 5.06,14.03 Q3.98,15.04 3.98,16.84 Q3.98,18.64 5.06,19.66 Q6.14,20.67 8.09,20.67 Q10.05,20.67 11.14,19.65 Q12.23,18.63 12.23,16.84 Q12.23,15.04 11.15,14.03 Q10.07,13.02 8.09,13.02 Z M3.05,11.25 Q2.89,11.21 1.70,9.76 Q0.52,8.31 0.52,6.23 Q0.52,3.35 2.57,1.68 Q4.62,0 8.09,0 Q11.58,0 13.63,1.68 Q15.67,3.35 15.67,6.23 Q15.67,8.31 14.49,9.76 Q13.31,11.21 13.15,11.25 Q13.55,11.34 14.87,12.95 Q16.19,14.54 16.19,16.84 Q16.19,20.29 14.07,22.14 Q11.95,24 8.09,24 Q4.24,24 2.12,22.14 Q0,20.29 0,16.84 Q0,14.54 1.33,12.95 Q2.66,11.34 3.05,11.25 Z M4.47,6.52 Q4.47,8.03 5.39,8.86 Q6.33,9.70 8.09,9.70 Q9.85,9.70 10.79,8.86 Q11.74,8.03 11.74,6.52 Q11.74,5 10.79,4.17 Q9.85,3.33 8.09,3.33 Q6.33,3.33 5.39,4.17 Q4.47,5 4.47,6.52 Z',
  },
  9: {
    width: 16.28,
    path: 'M1.43,22.96 L1.43,19.14 Q3.20,19.98 4.30,20.25 Q5.41,20.51 6.47,20.51 Q9.22,20.51 10.67,18.67 Q12.12,16.82 12.30,14.43 Q12.28,14.56 10.85,15.30 Q9.41,16.04 7.69,16.04 Q4.16,16.04 2.08,13.88 Q0,11.72 0,8.03 Q0,4.42 2.16,2.21 Q4.32,0 7.88,0 Q11.99,0 14.14,3.12 Q16.28,6.24 16.28,12.01 Q16.28,17.43 13.66,20.71 Q11.05,24 6.61,24 Q5.43,24 4.23,23.77 Q3.03,23.54 1.43,22.96 Z M7.88,12.74 Q9.69,12.74 10.74,11.50 Q11.80,10.27 11.80,8.03 Q11.80,5.81 10.74,4.58 Q9.69,3.33 7.88,3.33 Q6.08,3.33 5.03,4.58 Q3.98,5.81 3.98,8.03 Q3.98,10.27 5.03,11.50 Q6.08,12.74 7.88,12.74 Z',
  },
};

function numberPaths(day) {
  const digits = String(day)
    .split('')
    .map((digit) => glyphs[digit]);
  const gap = digits.length === 1 ? 0 : 4;
  const totalWidth = digits.reduce((sum, glyph) => sum + glyph.width, 0) + gap;
  let x = 54 - totalWidth / 2;

  return digits
    .map((glyph) => {
      const path = `    <path
        android:fillColor="#1F2937"
        android:pathData="${glyph.path}" />`;
      const translateX = Number(x.toFixed(3));
      const translated = `    <group android:translateX="${translateX}" android:translateY="56">\n${path}\n    </group>`;
      x += glyph.width + gap;
      return translated;
    })
    .join('\n');
}

function artwork(day) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/generate-android-date-icons.mjs. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#2563EB"
        android:pathData="M22,0 H86 Q108,0 108,22 V86 Q108,108 86,108 H22 Q0,108 0,86 V22 Q0,0 22,0 Z" />
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M27,29 H81 Q88,29 88,36 V81 Q88,88 81,88 H27 Q20,88 20,81 V36 Q20,29 27,29 Z" />
    <path
        android:fillColor="#1E40AF"
        android:pathData="M27,29 H81 Q88,29 88,36 V47 H20 V36 Q20,29 27,29 Z" />
    <path
        android:fillColor="#FFFFFF"
        android:fillAlpha="0.9"
        android:pathData="M28,36 H43 Q45,36 45,38 Q45,40 43,40 H28 Q26,40 26,38 Q26,36 28,36 Z" />
    <path
        android:fillColor="#FFFFFF"
        android:fillAlpha="0.55"
        android:pathData="M28,42 H37 Q38.5,42 38.5,43.5 Q38.5,45 37,45 H28 Q26.5,45 26.5,43.5 Q26.5,42 28,42 Z" />
    <path
        android:fillColor="#1E3A8A"
        android:pathData="M36,21 H42 Q45,21 45,24 V36 Q45,39 42,39 H36 Q33,39 33,36 V24 Q33,21 36,21 Z M66,21 H72 Q75,21 75,24 V36 Q75,39 72,39 H66 Q63,39 63,36 V24 Q63,21 66,21 Z" />
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M37,20 H41 Q43,20 43,22 V34 Q43,36 41,36 H37 Q35,36 35,34 V22 Q35,20 37,20 Z M67,20 H71 Q73,20 73,22 V34 Q73,36 71,36 H67 Q65,36 65,34 V22 Q65,20 67,20 Z" />
${numberPaths(day)}
</vector>
`;
}

function legacy(dayName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/generate-android-date-icons.mjs. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@drawable/ic_launcher_${dayName}_artwork" />
</layer-list>
`;
}

function adaptive(dayName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/generate-android-date-icons.mjs. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_${dayName}_artwork" />
</adaptive-icon>
`;
}

for (let day = 1; day <= 31; day += 1) {
  const dayName = `day_${String(day).padStart(2, '0')}`;
  writeFileSync(join(drawableDir, `ic_launcher_${dayName}_artwork.xml`), artwork(day));
  writeFileSync(join(legacyDir, `ic_launcher_${dayName}.xml`), legacy(dayName));
  writeFileSync(join(adaptiveDir, `ic_launcher_${dayName}.xml`), adaptive(dayName));
}
