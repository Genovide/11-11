(()=>{
 const libraryButton=document.querySelector('.sidebar .nav[data-view=tracks]');
 if(libraryButton){for(const child of [...libraryButton.childNodes])if(child.nodeType===Node.TEXT_NODE&&child.textContent.trim()){const label=node('span','library-nav-label',child.textContent.trim());child.replaceWith(label)}}
 const actions=node('div','immersive-track-actions');
 actions.setAttribute('role','group');actions.setAttribute('aria-label','Действия с треком');
 immersiveInfo.append(actions);
 actions.append(immersiveDownload,currentTrackMenu,dislikeImmersive);
})();
