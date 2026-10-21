import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type OrquestadorApi } from '../shared/ipc';

const api: OrquestadorApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo),
  captureInbox: (text) => ipcRenderer.invoke(IpcChannel.captureInbox, text),
  listInbox: () => ipcRenderer.invoke(IpcChannel.listInbox),
  convertInboxItem: (id, input) => ipcRenderer.invoke(IpcChannel.convertInboxItem, id, input),
  discardInboxItem: (id) => ipcRenderer.invoke(IpcChannel.discardInboxItem, id),
  listTasks: () => ipcRenderer.invoke(IpcChannel.listTasks),
  createTask: (input) => ipcRenderer.invoke(IpcChannel.createTask, input),
  updateTask: (id, input) => ipcRenderer.invoke(IpcChannel.updateTask, id, input),
  setTaskStatus: (id, status) => ipcRenderer.invoke(IpcChannel.setTaskStatus, id, status),
  setTaskForToday: (id, forToday) => ipcRenderer.invoke(IpcChannel.setTaskForToday, id, forToday),
  deleteTask: (id) => ipcRenderer.invoke(IpcChannel.deleteTask, id),
  listProjects: () => ipcRenderer.invoke(IpcChannel.listProjects),
  createProject: (name) => ipcRenderer.invoke(IpcChannel.createProject, name),
  deleteProject: (id) => ipcRenderer.invoke(IpcChannel.deleteProject, id),
};

contextBridge.exposeInMainWorld('orquestador', api);
