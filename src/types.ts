export interface Task {
  id: number;
  title: string;
  clientName: string;
  projectName: string;
  description: string;
  status: 'To Do' | 'In Progress' | 'Review' | 'Done';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  category: 'Produk' | 'Interior' | 'Motif' | 'Drafter';
  stage: string;
  assignee: string;
  deadline: string;
  created_at: string;
}

export interface Crew {
  id: number;
  name: string;
  role: string;
  photo?: string;
  phone?: string;
  address?: string;
  joinDate: string;
  performance?: number; // 0-100
}

export interface Client {
  id: number;
  name: string;
}

export interface SpreadsheetSettings {
  spreadsheetId: string;
  lastSync: string;
  isConnected: boolean;
}

export type TaskStatus = Task['status'];
export type TaskPriority = Task['priority'];
export type TaskCategory = Task['category'];

export const CATEGORY_STAGES: Record<TaskCategory, string[]> = {
  'Produk': ['Inbox', 'Layout', 'Space', 'Model', 'Render', 'Approval', 'Pola', 'Estimasi', 'Gamker', 'Gamkem', 'Pengawalan', 'Finish'],
  'Interior': ['Inbox', 'Layout', 'Space', 'Model', 'Render', 'Approval', 'Pola', 'Estimasi', 'Gamker', 'Pengawalan', 'Finish'],
  'Motif': ['Inbox', 'Layout', 'Approval', 'Motif', 'Film', 'Warna', 'Matras', 'Pengawalan', 'Finish'],
  'Drafter': ['Inbox', 'Film', 'Matras', 'Grafis', 'Pola', 'Estimasi', 'Gamker', 'Gamkem', 'Pengawalan', 'Finish']
};
