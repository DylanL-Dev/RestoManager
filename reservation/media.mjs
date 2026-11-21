const pathPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/;
export function coverURL(origin,path){
 if(!pathPattern.test(path||''))return null;let base;try{base=new URL(origin);}catch{return null;}
 if(base.username||base.password||base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))return null;
 return base.origin+'/storage/v1/object/public/rm015-covers/'+path;
}
export function presentCover(profile,origin,root=document){
 const image=root.querySelector('.cover img'),caption=root.querySelector('.cover-caption');if(!image)return;
 const fallback=()=>{image.onerror=null;image.src='dining.svg';image.alt='Illustration d’une table dressée dans un intérieur végétal';if(caption)caption.hidden=false;};
 const url=coverURL(origin,profile.coverPath);if(!url){fallback();return;}
 image.onerror=fallback;image.onload=()=>{if(caption)caption.hidden=image.src===url;};image.alt=String(profile.coverAlt||'Photo du restaurant').slice(0,160);image.src=url;
}
