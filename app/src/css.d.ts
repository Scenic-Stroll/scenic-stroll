// Lets TypeScript accept `import '….css'` (the web map's stylesheet) even on a fresh checkout,
// where Expo's generated expo-env.d.ts doesn't exist yet (CI).
declare module '*.css';
