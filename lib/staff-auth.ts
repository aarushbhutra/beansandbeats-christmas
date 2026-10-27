"use client";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
let client:SupabaseClient|undefined;
export function authClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error("Supabase is not configured. Set the environment variables and create staff accounts first.");return client??=createClient(url,key);}
