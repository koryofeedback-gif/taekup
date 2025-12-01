/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_API_KEY: string | undefined;
  readonly VITE_OPENAI_API_KEY: string | undefined;
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
