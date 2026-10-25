// The CRM owns workspace navigation. This document isolates the factory styles only.
(()=>{
 const embedded=window.parent!==window&&window.parent.location.origin===location.origin;
 if(!embedded){const destination=new URL('/?view=content',location.origin);const item=new URL(location.href).searchParams.get('contentItem');if(item)destination.searchParams.set('contentItem',item);location.replace(destination.href);return;}
 document.documentElement.dataset.crmEmbedded='true';
 const theme=()=>{const value=localStorage.getItem('voyage-theme');if(value)document.documentElement.dataset.theme=value;else delete document.documentElement.dataset.theme;};
 theme();window.addEventListener('storage',event=>{if(event.key==='voyage-theme')theme();});
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||link.target==='_blank'||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
  if(url.pathname==='/'){
   const view=url.searchParams.get('view')||'dash';if(!['dash','accounts','company','content'].includes(view))return;
   event.preventDefault();window.parent.dispatchEvent(new CustomEvent('voyage-content-navigate',{detail:{view,contentItem:url.searchParams.get('contentItem')}}));
  }else if(url.pathname==='/login'){link.target='_top';}
 });
})();
