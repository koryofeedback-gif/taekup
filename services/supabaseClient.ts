
import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// SUPABASE CONFIGURATION
// ------------------------------------------------------------------
// To connect your real database:
// 1. Go to https://supabase.com -> Create Project
// 2. Go to Settings -> API
// 3. Paste the URL and ANON KEY into your .env file or environment variables
//    VITE_SUPABASE_URL=...
//    VITE_SUPABASE_ANON_KEY=...
// ------------------------------------------------------------------

// Safely access process.env to prevent ReferenceError in browser
const getEnv = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || '';
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

// We check if keys exist. If not, we are in "Demo Mode".
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Create the client only if keys exist to prevent runtime errors
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// --- HELPER FUNCTIONS ---

/**
 * Checks if the user is connected to a real backend.
 */
export const checkConnection = async () => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('clubs').select('count', { count: 'exact', head: true });
    return !error;
  } catch (e) {
    return false;
  }
};

/**
 * MOCK DB FUNCTIONS (Used when no DB is connected)
 * These simulate the database so the UI works in the preview.
 */
export const mockDb = {
  saveClub: async (data: any) => {
    console.log("MOCK DB: Saving Club...", data);
    await new Promise(r => setTimeout(r, 800));
    return { success: true, id: 'mock-club-id' };
  },
  saveStudent: async (data: any) => {
    console.log("MOCK DB: Saving Student...", data);
    return { success: true, id: `mock-student-${Date.now()}` };
  },
  updateScores: async (studentId: string, scores: any) => {
    console.log(`MOCK DB: Updating scores for ${studentId}`, scores);
    return { success: true };
  }
};
