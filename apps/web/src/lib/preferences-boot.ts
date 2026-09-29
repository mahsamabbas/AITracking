/** Storage key for display preferences (lib/preferences.ts). */
export const PREFS_STORAGE_KEY = "techlio-prefs";

/**
 * Inline boot script for app/layout.tsx: sets accent, density and motion on
 * <html> before first paint so a saved accent never flashes the default.
 * A plain module (not "use client") so the server layout can inline it.
 */
export const PREFS_BOOT = `(function(){try{var p=JSON.parse(localStorage.getItem("${PREFS_STORAGE_KEY}")||"{}")||{};var r=document.documentElement;r.dataset.accent=["indigo","violet","blue","teal","rose"].indexOf(p.accent)>=0?p.accent:"indigo";r.dataset.density=p.density==="compact"?"compact":"comfortable";if(p.reduceMotion===true)r.dataset.motion="reduce";}catch(e){}})();`;
