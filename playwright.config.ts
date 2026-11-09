import { defineConfig } from "@playwright/test";
const full=process.env.RUN_SUPABASE_E2E==="1";
const fixture=process.env.RUN_BROWSER_FIXTURE==="1";
const baseURL="http://127.0.0.1:3107";
const server={command:"npm run dev -- --hostname 127.0.0.1 --port 3107",url:baseURL,timeout:120_000,reuseExistingServer:false,
  env:{APP_URL:baseURL,...(full?{}:{NEXT_PUBLIC_SUPABASE_URL:fixture?"http://127.0.0.1:3108":"",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture?"browser-fixture-key":""})}};
export default defineConfig({
  testDir:"./tests/e2e",timeout:90_000,workers:1,
  use:{baseURL,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined}},
  webServer:fixture?[{command:"node tests/fixture-server.mjs",url:"http://127.0.0.1:3108/health",reuseExistingServer:false},server]:server
});
