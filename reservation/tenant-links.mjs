// Tenant-bound public links: never substitute a pilot restaurant for an unknown link.
const slugRule=/^(?=.{3,80}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function restaurantSlug(href){
 const params=new URL(href).searchParams,values=params.getAll('restaurant');
 return values.length===1&&slugRule.test(values[0])?values[0]:null;
}
export function demoURL(href){
 const url=new URL('index.html',href);url.search='';url.hash='';
 return url.href;
}
