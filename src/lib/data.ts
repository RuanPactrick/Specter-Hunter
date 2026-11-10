import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { context } from "./auth";
import { nameKey, regions, stages, sites, type Lead, type Evidence, type Contact, type Assessment, type Preview } from "./domain";
import { param, type Search } from "@/components/ui";

export const leadFields = "id,name,sector,city,region,district,address,domain,notes,source_label,source_url,consulted_on,stage,website_status,priority,assignee_id,next_action,follow_up,loss_reason,contract_value,updated_at";
export const pageSize=20;
const contains = (value:string) => "%" + value.replace(/[%_\\]/g,"\\$&") + "%";
const ilikeText = (value:string) => value.trim().replace(/[,*().%"_\\]/g," ").replace(/\s+/g," ").slice(0,100);
export function leadFilters(params:Search) {
  const get=(key:string)=>param(params,key)?.trim().slice(0,120) ?? "";
  const positivePage=Number(get("page"));
  const uid=z.uuid().safeParse(get("owner"));
  const date=z.iso.date().safeParse(get("date"));
  return {
    q:get("q"), region:(regions as readonly string[]).includes(get("region"))?get("region"):"", city:get("city"), sector:get("sector"), district:get("district"), priority:["alta","media","baixa"].includes(get("priority"))?get("priority"):"",
    stage:Object.hasOwn(stages,get("stage"))?get("stage"):"", site:Object.hasOwn(sites,get("site"))?get("site"):"",
    owner:uid.success?uid.data:"", date:date.success?date.data:"", pending:get("pending")==="1", confidence:["suficiente","pendente","insuficiente"].includes(get("confidence"))?get("confidence"):"",
    order:["updated","name","consulted"].includes(get("order"))?get("order"):"updated",
    page:Number.isSafeInteger(positivePage)&&positivePage>0 ? Math.min(positivePage,50000) : 1
  };
}
export async function queryLeads(params:Search,limit=pageSize,offset?:number) {
  const { db,org }=await context();
  const filters=leadFilters(params);
  const search=ilikeText(filters.q);
  let query=db.from("lead_directory").select("*",{count:"exact"}).eq("organization_id",org.id);
  if(search) query=query.or("name_key.ilike."+contains(nameKey(search))+",sector.ilike."+contains(search)+",domain.ilike."+contains(search));
  if(filters.region) query=query.eq("region",filters.region);
  if(filters.city) query=query.ilike("city",contains(filters.city));
  if(filters.sector) query=query.ilike("sector",contains(filters.sector));
  if(filters.district) query=query.ilike("district",contains(filters.district));
  if(filters.stage) query=query.eq("stage",filters.stage);
  if(filters.site) query=query.eq("effective_website_status",filters.site);
  if(filters.priority) query=query.eq("priority",filters.priority);
  if(filters.owner) query=query.eq("assignee_id",filters.owner);
  if(filters.date) query=query.gte("consulted_on",filters.date);
  if(filters.pending) query=query.eq("has_pending",true);
  if(filters.confidence) query=query.eq("confidence",filters.confidence);
  const sort={name:"name",consulted:"consulted_on",updated:"updated_at"}[filters.order] ?? "updated_at";
  const from=offset ?? (filters.page-1)*pageSize;
  const { data,count,error }=await query.order(sort,{ascending:filters.order==="name"}).order("id").range(from,from+limit-1);
  if(error) throw new Error("Falha ao carregar oportunidades");
  return { leads:((data??[]) as DirectoryLead[]).map(withCurrentSite), total:count??0, filters };
}
export function withCurrentSite<T extends Lead & {effective_website_status?:Lead["website_status"]}>(lead:T):T {
  return { ...lead, website_status:lead.effective_website_status??lead.website_status };
}
export type DirectoryLead = Lead & { effective_website_status?:Lead["website_status"]; observed:number; coverage:number; confidence:"suficiente"|"pendente"|"insuficiente"; has_pending:boolean };
export const loadLead = cache(async (id:string) => {
  const { db,org }=await context();
  if(!z.uuid().safeParse(id).success) notFound();
  const { data,error }=await db.from("lead_directory").select(leadFields+",effective_website_status").eq("organization_id",org.id).eq("id",id).maybeSingle();
  if(error) throw new Error("Falha ao carregar lead");
  if(!data) notFound();
  return withCurrentSite(data as unknown as Lead & {effective_website_status?:Lead["website_status"]});
});
export const loadEvidence = cache(async (id:string) => {
  const { db,org }=await context();
  const { data,error }=await db.from("evidence_items").select("*").eq("organization_id",org.id).eq("lead_id",id).order("consulted_on",{ascending:false}).limit(100);
  if(error) throw new Error("Falha ao carregar evidências");
  return (data??[]) as Evidence[];
});
export const loadContacts = cache(async (id:string) => {
  const { db,org }=await context();
  const { data,error }=await db.from("lead_contacts").select("id,kind,value,normalized,source_label,consulted_on,confirmed").eq("organization_id",org.id).eq("lead_id",id).order("created_at").limit(100);
  if(error) throw new Error("Falha ao carregar contatos");
  return (data??[]) as Contact[];
});
export const loadAssessment = cache(async (id:string) => {
  const { db,org }=await context();
  const { data,error }=await db.from("opportunity_assessments").select("criterion,points,rationale,evidence_id").eq("organization_id",org.id).eq("lead_id",id);
  if(error) throw new Error("Falha ao carregar avaliação");
  return (data??[]) as Assessment[];
});
export const loadPreview = cache(async (id:string) => {
  const { db,org }=await context();
  const { data,error }=await db.from("previews").select("*").eq("organization_id",org.id).eq("lead_id",id).maybeSingle();
  if(error) throw new Error("Falha ao carregar prévia");
  return data as Preview|null;
});
export function leadPath(id:string,tab?:string) {
  return "/app/oportunidades/" + id + (tab ? "?aba="+tab : "");
}
