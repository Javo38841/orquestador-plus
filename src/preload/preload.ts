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
  deleteSeries: (id) => ipcRenderer.invoke(IpcChannel.deleteSeries, id),
  listTags: () => ipcRenderer.invoke(IpcChannel.listTags),
  listProjects: () => ipcRenderer.invoke(IpcChannel.listProjects),
  createProject: (name) => ipcRenderer.invoke(IpcChannel.createProject, name),
  deleteProject: (id) => ipcRenderer.invoke(IpcChannel.deleteProject, id),
  listNotes: () => ipcRenderer.invoke(IpcChannel.listNotes),
  getNote: (slug) => ipcRenderer.invoke(IpcChannel.getNote, slug),
  createNote: (input) => ipcRenderer.invoke(IpcChannel.createNote, input),
  updateNote: (slug, input) => ipcRenderer.invoke(IpcChannel.updateNote, slug, input),
  deleteNote: (slug) => ipcRenderer.invoke(IpcChannel.deleteNote, slug),
};

contextBridge.exposeInMainWorld('orquestador', api);
