import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type OrquestadorApi } from '../shared/ipc';

const api: OrquestadorApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo),
  captureInbox: (text) => ipcRenderer.invoke(IpcChannel.captureInbox, text),
  listInbox: () => ipcRenderer.invoke(IpcChannel.listInbox),
};

contextBridge.exposeInMainWorld('orquestador', api);
