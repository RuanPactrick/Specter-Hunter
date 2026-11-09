"use server";
import { context } from "./auth";
import { leadPath,loadLead } from "./data";
import { message,saveError } from "./forms";
export async function deleteLead(id:string,data:FormData){
  const path=leadPath(id,"historico");
  const lead=await loadLead(id);
  const {db,org,role}=await context();
  const confirmation=data.get("confirmation");
  if(role!=="owner"||data.get("acknowledge")!=="on"||confirmation!==lead.name)message(path,"Confirme o nome exato da empresa e a exclusão.");
  const {error}=await db.rpc("remove_lead",{p_org:org.id,p_lead:id,p_confirm:confirmation});
  if(error?.code==="P2006")message(path,"Há materiais vinculados. O administrador deve tratar os arquivos antes da exclusão.");
  saveError(path,error);
  message("/app/oportunidades","Registro removido. Restrições de não contato existentes foram preservadas.",true);
}
