// Keep the factory mounted when switching CRM tabs so unsaved work stays in place.
(()=>{
 const frame=document.getElementById('contentFactory');
 window.VoyageContent={open(){if(!frame.getAttribute('src'))frame.src=frame.dataset.src;},close(){}};
})();
