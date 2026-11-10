"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { context } from "./auth";
import { leadPath, loadLead } from "./data";
import { assetKinds, fileType, maxAssetBytes } from "./files";
import { message, optionalText, parse, saveError, text } from "./forms";
export async function uploadMaterial(id:string,data:FormData) {
  const path=leadPath(id,"previa");
  await loadLead(id);
  const {db,org}=await context();
  const f=parse(z.object({kind:z.enum(Object.keys(assetKinds) as [keyof typeof assetKinds]),origin:text(240),holder:text(180),
    permission_note:text(1000,3),purpose:text(300),restrictions:optionalText(1000),authorized_on:z.iso.date()}),data,path);
  if(data.get("permission")!=="on")message(path,"Confirme a autorização para a finalidade informada.");
  const file=data.get("file");
  if(!(file instanceof File)||file.size===0||file.size>maxAssetBytes)message(path,"Selecione um arquivo de até 5 MiB.");
  const mime=fileType(file.name,file.type,new Uint8Array(await file.slice(0,16).arrayBuffer()),f.kind);
  if(!mime)message(path,"Tipo, extensão ou assinatura do arquivo incompatível com a categoria.");
  const assetId=randomUUID();
  const object_path=[org.id,id,assetId].join("/");
  const filename=file.name.replace(/[^\p{L}\p{N} ._-]/gu,"_").slice(0,180)||"material";
  const {error}=await db.from("brand_assets").insert({...f,id:assetId,lead_id:id,organization_id:org.id,object_path,mime,filename,bytes:file.size});
  saveError(path,error);
  const storage=await db.storage.from("specter-materials").upload(object_path,file,{contentType:mime,upsert:false,cacheControl:"0"});
  if(storage.error){
    await db.from("brand_assets").delete().eq("organization_id",org.id).eq("id",assetId);
    message(path,"O armazenamento rejeitou o arquivo. Verifique a configuração e tente novamente.");
  }
  message(path,"Material e autorização registrados.",true);
}
export async function revokeMaterial(id:string,assetId:string,data:FormData){
  const path=leadPath(id,"previa");
  await loadLead(id);
  const {db,org}=await context();
  if(!z.uuid().safeParse(assetId).success||data.get("confirm")!=="on")message(path,"Confirme a revogação.");
  const {data:asset,error}=await db.from("brand_assets").update({revoked_at:new Date().toISOString()}).eq("organization_id",org.id).eq("lead_id",id).eq("id",assetId).is("revoked_at",null).select("id").maybeSingle();
  saveError(path,error);
  if(!asset)message(path,"O material já foi revogado ou você não tem permissão.");
  message(path,"Autorização revogada. Links emitidos anteriormente expiram em até um minuto.",true);
}
