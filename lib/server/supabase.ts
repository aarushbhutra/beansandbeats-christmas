import "server-only";
import {createClient} from "@supabase/supabase-js";
export function serverDatabase() {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) throw new Error("Configure Supabase server credentials before enabling database routes");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
