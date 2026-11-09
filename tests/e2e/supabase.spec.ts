import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect,test } from "@playwright/test";

const enabled=process.env.RUN_SUPABASE_E2E==="1";
test.skip(!enabled,"Requer um Supabase local de teste e credenciais reais.");
test("login, cadastro, evidência, tarefa, pipeline, abordagem, prévia, CSV e isolamento",async({page,browser})=>{
  const api=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!api||!key||!["localhost","127.0.0.1","[::1]"].includes(new URL(api).hostname))throw new Error("Use apenas uma instância local dedicada para as fixtures.");
  const admin=createClient(api,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const password="Test-only-"+randomUUID();
  const users:string[]=[];
  const unique=randomUUID().slice(0,8);
  async function newUser(label:string) {
    const email="specter-"+label+"-"+unique+"@example.test";
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
    if(created.error)throw created.error;
    users.push(created.data.user.id);
    return email;
  }
  async function signIn(target:typeof page,email:string,name:string){
    await target.goto("/login");
    await target.getByLabel("E-mail",{exact:true}).fill(email);
    await target.getByLabel("Senha",{exact:true}).fill(password);
    await target.getByRole("button",{name:"Entrar",exact:true}).click();
    await expect(target.getByRole("heading",{name:"Crie seu espaço de trabalho"})).toBeVisible();
    await target.getByLabel("Nome da organização").fill(name);
    await target.getByLabel("Responsável",{exact:true}).fill("Pessoa de teste");
    await target.getByLabel("Nome nas mensagens").fill("Equipe de teste");
    await target.getByRole("button",{name:"Criar organização"}).click();
    await expect(target.getByRole("heading",{name:"Oportunidades",exact:true})).toBeVisible();
  }
  try{
    await signIn(page,await newUser("a"),"Organização de teste A");
    await page.goto("/app/oportunidades/novo");
    await page.getByLabel("Nome da empresa").fill("Empresa Fictícia de Teste");
    await page.getByLabel("Segmento",{exact:true}).fill("Serviços");
    await page.getByLabel("Fonte",{exact:true}).fill("Fixture isolada");
    await page.getByRole("button",{name:"Cadastrar empresa",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Empresa Fictícia de Teste"})).toBeVisible();
    const lead=new URL(page.url()).pathname;
    for(const width of [360,390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    }
    await page.goto(lead+"?aba=evidencias");
    await page.getByLabel("Tipo",{exact:true}).fill("Página oficial");
    await page.getByLabel("Informação observada").fill("Observação de teste");
    await page.getByLabel("Fonte",{exact:true}).fill("Material de teste");
    await page.getByLabel("Método",{exact:true}).fill("Verificação local");
    await page.getByRole("button",{name:"Adicionar evidência",exact:true}).click();
    await expect(page.getByText("Evidência adicionada para revisão.")).toBeVisible();
    await page.getByText("Página oficial · Material de teste").click();
    await page.getByLabel("Status de revisão").selectOption("confirmed");
    await page.getByRole("button",{name:"Salvar revisão",exact:true}).click();
    await expect(page.getByText("Revisão registrada.",{exact:true})).toBeVisible();
    await page.goto(lead);
    await page.locator("summary").filter({hasText:"Criar tarefa"}).click();
    await page.getByLabel("Título da tarefa").fill("Revisar cadastro");
    await page.getByRole("button",{name:"Criar tarefa",exact:true}).click();
    await expect(page.getByText("Tarefa criada.",{exact:true})).toBeVisible();
    await page.locator("summary").filter({hasText:"Mover para etapa"}).click();
    await page.getByLabel("Etapa",{exact:true}).selectOption("qualified");
    await page.getByRole("button",{name:"Confirmar etapa",exact:true}).click();
    await expect(page.getByText("Etapa atualizada.",{exact:true})).toBeVisible();
    await page.goto(lead+"?aba=previa");
    await page.getByLabel("URL da prévia").fill("https://previa.example/projeto");
    await page.getByLabel("Status",{exact:true}).selectOption("ready");
    await page.getByRole("button",{name:"Registrar prévia",exact:true}).click();
    await expect(page.getByText("Prévia registrada.",{exact:true})).toBeVisible();
    await page.goto(lead+"?aba=abordagem");
    await expect(page.getByLabel("Mensagem",{exact:true})).toHaveValue(/criação de sites/);
    await page.getByLabel("O que registrar").selectOption("sent");
    await page.getByLabel("Canal",{exact:true}).selectOption("E-mail");
    await page.getByLabel("Confirmo que enviei esta mensagem manualmente.").check();
    await page.getByRole("button",{name:"Registrar interação"}).click();
    await expect(page.getByText("Interação registrada manualmente.",{exact:true})).toBeVisible();
    const exported=await page.request.get("/api/exportar");
    expect(exported.ok()).toBe(true);
    expect(await exported.text()).toContain("Empresa Fictícia de Teste");
    const other=await browser.newPage();
    try{
      await signIn(other,await newUser("b"),"Organização de teste B");
      await other.goto(lead);
      await expect(other.getByRole("heading",{name:"Registro indisponível"})).toBeVisible();
      expect(await (await other.request.get("/api/exportar")).text()).not.toContain("Empresa Fictícia de Teste");
    }finally{await other.close();}
  }finally{
    for(const user of users){
      await admin.from("organizations").delete().eq("created_by",user);
      await admin.auth.admin.deleteUser(user);
    }
  }
});
