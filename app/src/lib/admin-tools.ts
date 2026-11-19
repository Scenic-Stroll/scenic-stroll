/**
 * Team-only tools: Diagnostics (Test backend, Simulate weather / rush hour / walk, Test smart
 * routing), data-collection mode and the answers saved for the demo.
 *
 * On in development (Expo Go, `npm run web`) and in builds made with EXPO_PUBLIC_ADMIN_TOOLS=1
 * (team demo builds). Off in the public web app: simulated weather or saved demo answers could be
 * mistaken for live data there. Hiding a switch isn't security — these tools only change what this
 * device shows, and the server never trusts them.
 */
export const ADMIN_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_ADMIN_TOOLS === '1';
