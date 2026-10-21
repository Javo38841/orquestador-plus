import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type OrquestadorApi } from '../shared/ipc';

const api: OrquestadorApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo),
};

contextBridge.exposeInMainWorld('orquestador', api);
