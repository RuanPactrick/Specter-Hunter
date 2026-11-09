import { redirect } from "next/navigation";
import { supabaseConfig } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default function Home() { redirect(supabaseConfig()?"/app":"/configurar"); }
