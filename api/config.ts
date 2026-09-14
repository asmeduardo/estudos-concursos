export default function handler(_req: any, res: any) {
  // URL and anon key are public Supabase client configuration. The service role
  // key is intentionally never returned to the browser.
  return res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
}
