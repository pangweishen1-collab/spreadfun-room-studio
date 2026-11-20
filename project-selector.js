/* Shared local project cards for tools that use the resource library logos. */
(() => {
  'use strict';
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const {target,isIntersecting} of entries)if(isIntersecting){target.src=target.dataset.projectSrc;observer.unobserve(target);}
  }):null;
  function render(container,projects,{getName=project=>project.name,selectLabel='',onSelect,selectedId}={}){
    if(observer)for(const image of container.querySelectorAll('img'))observer.unobserve(image);
    container.classList.add('project-selector');container.replaceChildren();
    for(const project of projects){
      const name=getName(project),button=document.createElement('button');
      button.type='button';button.className='resource-project';button.dataset.project=project.id;
      button.setAttribute('aria-label',`${selectLabel} ${name}`.trim());
      button.setAttribute('aria-pressed',String(project.id===selectedId));
      const thumb=document.createElement('span');thumb.className='resource-project-art';
      const image=document.createElement('img');image.dataset.projectSrc=`assets/resources/${project.id}-256.webp`;image.alt='';image.width=256;image.height=256;image.decoding='async';image.loading='lazy';if(!observer)image.src=image.dataset.projectSrc;thumb.append(image);
      const label=document.createElement('span');label.className='resource-project-name';label.textContent=name;
      const check=document.createElement('span');check.className='resource-project-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
      button.append(thumb,label,check);button.addEventListener('click',()=>onSelect?.(project));container.append(button);
      observer?.observe(image);
    }
  }
  window.ProjectSelector={render};
})();
