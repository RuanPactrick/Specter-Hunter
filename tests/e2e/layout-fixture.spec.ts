import { expect,test } from "@playwright/test";
const enabled=process.env.RUN_BROWSER_FIXTURE==="1";
test.skip(!enabled,"Ative o servidor HTTP de fixture para verificar a composição autenticada.");
test("carteira e detalhe respondem às cinco larguras com Auth e REST simulados",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("E-mail",{exact:true}).fill("layout@example.test");
  await page.getByLabel("Senha",{exact:true}).fill("Fixture-test-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Visão geral",exact:true})).toBeVisible();
  for(const width of [360,390,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto("/app/oportunidades");
    await expect(page.getByRole("heading",{name:"Oportunidades",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    const surface=width<=720?page.locator(".mobile-list"):page.locator(".desktop-leads");
    await surface.getByRole("link",{name:/Empresa fictícia de teste/}).click();
    await expect(page.getByRole("heading",{name:"Empresa fictícia de teste"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole("navigation",{name:"Seções do lead"}).getByRole("link",{name:"Evidências",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Evidências digitais"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  }
  expect(errors).toEqual([]);
});
