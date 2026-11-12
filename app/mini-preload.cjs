const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('soundSyncMini',{command:(action,value,id)=>ipcRenderer.invoke('mini-player-command',action,value,id),onState:fn=>ipcRenderer.on('mini-player-state',(_,state)=>fn(state))});
