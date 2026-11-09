import { describe,expect,it,vi } from "vitest";
import { retryAfterSeconds,retryDelay,searchPlaces } from "../src/lib/providers";
import { isPublicAddress,pinAddress,requestTarget } from "../src/lib/reader";
describe("Proteção SSRF",()=>{
  it("rejeita IPs privados, especiais, mapeados e metadata",()=>{
    for(const ip of ["127.0.0.1","0.0.0.0","10.3.2.1","100.64.0.1","169.254.169.254","172.16.2.1","192.168.1.1","192.0.0.5","198.18.0.1","224.0.0.1","255.255.255.255","::1","::ffff:8.8.8.8","fe80::1","fc00::1","2001:db8::1","3fff::1"]){
      expect(isPublicAddress(ip),ip).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(pinAddress([{address:"8.8.8.8",family:4},{address:"10.0.0.8",family:4}])).toBeNull();
  });
  it("valida alvos, portas e esquemas antes de resolver DNS",()=>{
    for(const input of ["http://localhost","http://a.localhost","http://app.home.arpa","http://2130706433","http://0x7f000001","http://[::1]","http://169.254.169.254","ftp://example.com","https://user@site.com","http://site.com:9999"]) {
      expect(requestTarget(input),input).toBeNull();
    }
    expect(requestTarget("https://www.example.com/servicos")?.pathname).toBe("/servicos");
  });
});
describe("Google Places com transporte simulado",()=>{
  it("solicita somente IDs e ignora metadados não autorizados",async()=>{
    const provider=vi.fn(async (...args:Parameters<typeof fetch>)=>{ expect(args[0]).toBeTruthy();return new Response(JSON.stringify({
      places:[{id:"Place_1",displayName:{text:"Dado externo descartado"}}],nextPageToken:"next"
    }));});
    const data=await searchPlaces("Pilates, São Luís",10,null,"credential-for-mock",provider);
    expect(data).toEqual({places:[{id:"Place_1"}],nextPageToken:"next"});
    expect(provider.mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(provider.mock.calls[0][1]?.headers).toMatchObject({"X-Goog-FieldMask":"places.id,nextPageToken"});
    expect(provider.mock.calls[0][1]?.cache).toBe("no-store");
  });
  it("interpreta Retry-After e limita o atraso",async()=>{
    const provider=vi.fn(async()=>new Response("",{status:429,headers:{"Retry-After":"75"}}));
    await expect(searchPlaces("Teste",1,null,"credential-for-mock",provider)).rejects.toMatchObject({code:"provider_limit",retriable:true,retryAfter:75});
    expect(retryAfterSeconds("Thu, 01 Jan 1970 00:02:00 GMT",0)).toBe(120);
    expect(retryDelay(3,0)).toBe(20);
    expect(retryDelay(2,75)).toBe(75);
    expect(retryDelay(2,5000)).toBe(3600);
  });
});
