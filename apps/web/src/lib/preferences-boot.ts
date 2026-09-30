/**
 * Display settings shared by the pre-paint boot scripts (inlined by the
 * server layout) and the client code that reads/writes them. A plain module —
 * not "use client" — so app/layout.tsx can import it.
 */

/** localStorage key for the theme preference (lib/theme.tsx). */
export const THEME_STORAGE_KEY = "techlio-theme";
/** localStorage key for display preferences (lib/preferences.ts). */
export const PREFS_STORAGE_KEY = "techlio-prefs";
/** Accent colours; the first is the default. */
export const ACCENT_IDS = ["indigo", "violet", "blue", "teal", "rose"] as const;

/** Applies light/dark before first paint so a dark user never flashes light. */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

/** Applies accent, density and motion before first paint so a saved accent never flashes the default. */
export const PREFS_BOOT = `(function(){try{var p=JSON.parse(localStorage.getItem("${PREFS_STORAGE_KEY}")||"{}")||{};var r=document.documentElement;r.dataset.accent=${JSON.stringify(ACCENT_IDS)}.indexOf(p.accent)>=0?p.accent:"${ACCENT_IDS[0]}";r.dataset.density=p.density==="compact"?"compact":"comfortable";if(p.reduceMotion===true)r.dataset.motion="reduce";}catch(e){}})();`;
