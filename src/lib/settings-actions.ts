"use server";
import { z } from "zod";
import { context } from "./auth";
import { organizationSchema, message, parse, saveError, text } from "./forms";
const path="/app/configuracoes";
export async function saveOrganization(data:FormData){
  const { db,org,role }=await context();
  if(role!=="owner")message(path,"Somente o proprietário pode editar esta organização.");
  const fields=parse(organizationSchema.omit({responsible:true,start:true}).extend({retention_days:z.coerce.number().int().min(30).max(3650)}),data,path);
  const {error}=await db.from("organizations").update(fields).eq("id",org.id);
  saveError(path,error);message(path,"Configurações salvas.",true);
}
export async function addExclusion(data:FormData){
  const {db,org,role}=await context();
  if(role!=="owner")message(path,"Somente o proprietário pode editar exclusões.");
  const {name}=parse(z.object({name:text(160)}),data,path);
  const {error}=await db.from("exclusions").insert({organization_id:org.id,name});
  saveError(path,error);message(path,"Exclusão adicionada.",true);
}
export async function removeExclusion(id:string){
  const {db,org,role}=await context();
  if(role!=="owner"||!z.uuid().safeParse(id).success)message(path,"Exclusão indisponível.");
  const {error}=await db.from("exclusions").delete().eq("organization_id",org.id).eq("id",id);
  saveError(path,error);message(path,"Exclusão removida.",true);
}
