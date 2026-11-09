const formats = {
  png:{mime:"image/png",signature:[137,80,78,71,13,10,26,10],offset:0},
  jpg:{mime:"image/jpeg",signature:[255,216,255],offset:0},
  webp:{mime:"image/webp",signature:[87,69,66,80],offset:8},
  pdf:{mime:"application/pdf",signature:[37,80,68,70,45],offset:0},
  mp4:{mime:"video/mp4",signature:[102,116,121,112],offset:4}
} as const;
export const assetKinds={logo:"Logo",image:"Imagem",video:"Vídeo",document:"Documento de marca",screenshot:"Captura da prévia"} as const;
export const maxAssetBytes=5*1024*1024;
export function fileType(filename:string,claimed:string,bytes:Uint8Array,kind:keyof typeof assetKinds) {
  const ext=filename.toLowerCase().split(".").at(-1);
  const key=ext==="jpeg"?"jpg":ext;
  if(!key||!Object.hasOwn(formats,key))return null;
  const format=formats[key as keyof typeof formats];
  if(claimed!==format.mime||!format.signature.every((part,i)=>bytes[format.offset+i]===part))return null;
  if(key==="webp"&&![82,73,70,70].every((part,i)=>bytes[i]===part))return null;
  if(kind==="document"&&key!=="pdf"||kind==="video"&&key!=="mp4"||!["video","document"].includes(kind)&&!format.mime.startsWith("image/"))return null;
  return format.mime;
}
