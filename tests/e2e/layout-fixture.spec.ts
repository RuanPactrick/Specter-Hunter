import { expect,test } from "@playwright/test";
const enabled=process.env.RUN_BROWSER_FIXTURE==="1";
test.skip(!enabled,"Ative o servidor HTTP de fixture para verificar a composição autenticada.");
test("carteira e detalhe respondem no mobile, tablet e desktop com Auth e REST simulados",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  const setFixture=async(resource:"leads"|"evidence",present:boolean)=>{
    const response=await page.request.post("http://127.0.0.1:3108/__fixture/"+resource+"?present="+present);
    expect(response.ok()).toBe(true);
  };
  await setFixture("leads",false);
  await setFixture("evidence",false);
  await page.goto("/login");
  await page.getByLabel("E-mail",{exact:true}).fill("layout@example.test");
  await page.getByLabel("Senha",{exact:true}).fill("Fixture-test-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Visão geral",exact:true})).toBeVisible();
  await expect(page.locator(".sidebar .org")).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Configurações",exact:true})).toHaveAttribute("href","/app/configuracoes");
  await expect(page.getByText("Encontre empresas, registre evidências e organize a próxima abordagem.")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Da busca à abordagem"})).toBeVisible();
  await expect(page.getByRole("list").getByText(/Registre evidências\./)).toBeVisible();
  await expect(page.getByRole("link",{name:"Cadastrar empresa",exact:true})).toHaveCount(1);
  await expect(page.getByRole("link",{name:"Configure a integração",exact:true})).toHaveAttribute("href","/app/integracoes");
  await expect(page.locator(".metrics")).toHaveCount(0);
  await setFixture("leads",true);
  await page.goto("/app");
  await expect(page.getByText("Etapas mostram a situação atual das empresas; interações e prévias são totais acumulados neste espaço.")).toBeVisible();
  await expect(page.locator(".metric")).toHaveCount(6);
  await expect(page.getByText("Sem evidência em aberto; confira a presença digital.")).toBeVisible();
  await expect(page.getByRole("link",{name:"Ver presença",exact:true})).toHaveAttribute("href","/app/oportunidades/f0000000-0000-4000-8000-000000000003?aba=presenca");
  await setFixture("evidence",true);
  await page.goto("/app");
  await expect(page.getByText("A página oficial não é atualizada desde 2023.")).toBeVisible();
  await expect(page.getByText("Fonte: Fixture de teste visual · 09/11/2026")).toBeVisible();
  await expect(page.getByRole("link",{name:"Ver evidência",exact:true})).toHaveAttribute("href","/app/oportunidades/f0000000-0000-4000-8000-000000000003?aba=evidencias");
  for(const label of ["Empresas em análise","Empresas qualificadas","Interações registradas","Prévias enviadas","Empresas em proposta ou negociação","Empresas conquistadas"]){
    await expect(page.locator(".metrics")).toContainText(label);
  }
  for(const width of [360,390,720,721,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto("/app");
    await expect(page.getByRole("heading",{name:"Visão geral",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    const columns=await page.locator(".metrics").evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width<=720?2:width<=1179?3:6);
    expect(await page.locator(".review-row").evaluate(element=>getComputedStyle(element).flexDirection)).toBe(width<=720?"column":"row");
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
  await page.setViewportSize({width:1280,height:712});
  await page.goto("/app");
  expect(await page.locator(".sidebar .profile").evaluate(element=>element.getBoundingClientRect().bottom<=element.parentElement!.getBoundingClientRect().bottom)).toBe(true);
  expect(errors).toEqual([]);
});
