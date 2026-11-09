import { test, expect } from "@playwright/test";
const active=process.env.RUN_SUPABASE_E2E==="1"||process.env.RUN_BROWSER_FIXTURE==="1";
test.describe("Acesso sem configuração",()=>{
  test.skip(active,"O projeto de teste tem autenticação real configurada.");
  for(const width of [360,390,768,1024,1440]){
    test("exibe configuração e preserva o layout em "+width+" px",async({page})=>{
      await page.setViewportSize({width,height:844});
      const errors:string[]=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.goto("/app/oportunidades");
      await expect(page).toHaveURL(/\/configurar$/);
      await expect(page.getByRole("heading",{name:"Conecte o banco e a autenticação"})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      expect(errors).toEqual([]);
    });
  }
});
