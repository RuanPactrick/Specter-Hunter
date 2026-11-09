import { z } from "zod";
import { context } from "@/lib/auth";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const {db,org}=await context();
  if(!z.uuid().safeParse(id).success)return new Response("Material indisponível.",{status:404});
  const {data,error}=await db.from("brand_assets").select("filename,object_path").eq("organization_id",org.id).eq("id",id).is("revoked_at",null).maybeSingle();
  if(error||!data)return new Response("Material indisponível.",{status:404});
  const signed=await db.storage.from("specter-materials").createSignedUrl(data.object_path,60,{download:data.filename});
  if(signed.error)return new Response("O arquivo está indisponível. Verifique o armazenamento.",{status:404});
  return new Response(null,{status:303,headers:{Location:signed.data.signedUrl,"Cache-Control":"private, no-store"}});
}
