/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  MoreVertical, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  LayoutDashboard,
  ListTodo,
  Settings,
  Menu,
  X,
  ChevronRight,
  Trash2,
  Edit2,
  Trello,
  LayoutList,
  FileSpreadsheet,
  Download,
  FileText,
  Printer,
  Database,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Task, TaskStatus, TaskPriority, TaskCategory, CATEGORY_STAGES, Crew, Client, SpreadsheetSettings } from './types';

const socket = io();

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCrewModalOpen, setIsCrewModalOpen] = useState(false);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'Dashboard' | 'List' | 'Kanban'>('Dashboard');
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory>('Produk');

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    clientName: '',
    projectName: '',
    description: '',
    status: 'To Do' as TaskStatus,
    priority: 'Medium' as TaskPriority,
    category: 'Produk' as TaskCategory,
    stage: 'Inbox',
    assignee: '',
    deadline: ''
  });

  const [crewFormData, setCrewFormData] = useState({
    name: '',
    role: '',
    photo: '',
    phone: '',
    address: '',
    joinDate: new Date().toISOString().split('T')[0],
    performance: 0
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [spreadsheetSettings, setSpreadsheetSettings] = useState<SpreadsheetSettings>({
    spreadsheetId: '',
    lastSync: '',
    isConnected: false
  });
  const [testEmailBody, setTestEmailBody] = useState(`Kode: SPK-2024-088
Klien: Kriya Nusantara
Proyek: Souvenir Eksklusif G20
Penanggung Jawab: Ahmad
Deskripsi: Segera buatkan desain motif batik parang untuk plat logam.`);

  const simulateEmail = async () => {
    try {
      const res = await fetch('/api/webhooks/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'marketing@kriyanusantara.com',
          subject: 'PENGAJUAN SPK BARU: SPK-2024-088',
          body: testEmailBody
        })
      });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (res.ok) {
          alert('Email simulasi berhasil diproses! Pekerjaan baru telah muncul di Inbox.');
        } else {
          alert('Gagal: ' + data.error);
        }
      } else {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        alert('Server Error: Pastikan server telah berjalan dengan benar (Restart Dev Server jika perlu).');
      }
    } catch (err) {
      console.error('Simulation failed', err);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchCrew();
    fetchClients();
    fetchSpreadsheetSettings();
    
    // Auto-seed if empty
    fetch('/api/seed', { method: 'POST' }).catch(() => {});

    // Socket.io listeners
    socket.on('tasks_updated', (updatedTasks: Task[]) => {
      setTasks(updatedTasks);
    });

    socket.on('sync_status', ({ lastSync }: { lastSync: string }) => {
      setSpreadsheetSettings(prev => ({ ...prev, lastSync }));
    });

    // Listen for OAuth success
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchSpreadsheetSettings();
      }
    };
    window.addEventListener('message', handleOAuthMessage);

    return () => {
      socket.off('tasks_updated');
      socket.off('sync_status');
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, []);

  const fetchSpreadsheetSettings = async () => {
    try {
      const res = await fetch('/api/settings/spreadsheet');
      const data = await res.json();
      setSpreadsheetSettings(data);
    } catch (err) {
      console.error('Failed to fetch spreadsheet settings', err);
    }
  };

  const connectGoogleSheets = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_oauth', 'width=600,height=700');
    } catch (err) {
      console.error('Failed to get auth URL', err);
    }
  };

  const saveSpreadsheetId = async () => {
    try {
      const res = await fetch('/api/settings/spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: spreadsheetSettings.spreadsheetId })
      });
      if (res.ok) {
        alert('Spreadsheet ID berhasil disimpan! Sinkronisasi dimulai.');
      }
    } catch (err) {
      console.error('Failed to save spreadsheet ID', err);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text('Laporan Daftar Pekerjaan R&D - Kriya Nusantara', 14, 20);
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 28);

    const tableData = tasks.map(t => [
      t.title,
      t.clientName,
      t.projectName,
      t.status,
      t.priority,
      t.category,
      t.assignee,
      t.deadline || '-'
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Kode', 'Klien', 'Proyek', 'Status', 'Prioritas', 'Kategori', 'PIC', 'Deadline']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241] },
      styles: { fontSize: 8 }
    });

    doc.save(`Laporan_RND_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  };

  const fetchCrew = async () => {
    try {
      const res = await fetch('/api/crew');
      const data = await res.json();
      setCrew(data);
    } catch (err) {
      console.error('Failed to fetch crew', err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error('Failed to fetch clients', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingTask ? `/api/tasks/${editingTask.id}` : '/api/tasks';
    const method = editingTask ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        fetchTasks();
        setIsModalOpen(false);
        setEditingTask(null);
        resetForm();
      }
    } catch (err) {
      console.error('Failed to save task', err);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      clientName: '',
      projectName: '',
      description: '',
      status: 'To Do',
      priority: 'Medium',
      category: 'Produk',
      stage: 'Inbox',
      assignee: '',
      deadline: ''
    });
  };

  const handleCrewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crewFormData)
      });
      if (res.ok) {
        fetchCrew();
        setCrewFormData({
          name: '',
          role: '',
          photo: '',
          phone: '',
          address: '',
          joinDate: new Date().toISOString().split('T')[0],
          performance: 0
        });
      }
    } catch (err) {
      console.error('Failed to save crew', err);
    }
  };

  const getTenureInfo = (joinDate: string) => {
    const join = new Date(joinDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - join.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    let category = 'Pemula';
    let color = 'bg-slate-100 text-slate-600';
    
    if (diffYears >= 5) {
      category = 'Senior';
      color = 'bg-indigo-100 text-indigo-600';
    } else if (diffYears >= 1) {
      category = 'Junior';
      color = 'bg-blue-100 text-blue-600';
    } else {
      category = 'Pemula';
      color = 'bg-emerald-100 text-emerald-600';
    }
    
    return { 
      years: diffYears.toFixed(1), 
      category, 
      color 
    };
  };

  const deleteCrew = async (id: number) => {
    if (!confirm('Hapus anggota tim ini?')) return;
    try {
      await fetch(`/api/crew/${id}`, { method: 'DELETE' });
      fetchCrew();
    } catch (err) {
      console.error('Failed to delete crew', err);
    }
  };

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName })
      });
      if (res.ok) {
        await fetchClients();
        setFormData({ ...formData, clientName: newClientName });
        setIsAddingClient(false);
        setNewClientName('');
      }
    } catch (err) {
      console.error('Failed to add client', err);
    }
  };

  const deleteTask = async (id: number) => {
    if (!confirm('Hapus pekerjaan ini?')) return;
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      fetchTasks();
    } catch (err) {
      console.error('Failed to delete task', err);
    }
  };

  const updateTaskStage = async (task: Task, newStage: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, stage: newStage })
      });
      if (res.ok) fetchTasks();
    } catch (err) {
      console.error('Failed to update stage', err);
    }
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      clientName: task.clientName || '',
      projectName: task.projectName || '',
      description: task.description,
      status: task.status,
      priority: task.priority,
      category: task.category,
      stage: task.stage,
      assignee: task.assignee,
      deadline: task.deadline
    });
    setIsModalOpen(true);
  };

  const filteredTasks = tasks.filter(task => {
    const matchesStatus = filterStatus === 'All' || task.status === filterStatus;
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         task.assignee.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = viewMode === 'List' || task.category === selectedCategory;
    return matchesStatus && matchesSearch && matchesCategory;
  });

  const getStatusClass = (status: TaskStatus) => {
    switch (status) {
      case 'To Do': return 'status-todo';
      case 'In Progress': return 'status-progress';
      case 'Review': return 'status-review';
      case 'Done': return 'status-done';
      default: return '';
    }
  };

  const getPriorityIcon = (priority: TaskPriority) => {
    switch (priority) {
      case 'Urgent': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'High': return <Clock className="w-4 h-4 text-orange-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar - Desktop */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
                K
              </div>
              <div>
                <h1 className="font-bold text-slate-900 leading-tight">Kriya R&D</h1>
                <p className="text-xs text-slate-500">Job Manager</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

            <nav className="flex-1 px-4 space-y-1">
              <NavItem icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" active={viewMode === 'Dashboard'} onClick={() => setViewMode('Dashboard')} />
              <NavItem icon={<LayoutList className="w-5 h-5" />} label="Daftar Pekerjaan" active={viewMode === 'List'} onClick={() => setViewMode('List')} />
              <NavItem icon={<Trello className="w-5 h-5" />} label="Kanban Board" active={viewMode === 'Kanban'} onClick={() => setViewMode('Kanban')} />
              <NavItem icon={<User className="w-5 h-5" />} label="Tim R&D" onClick={() => setIsCrewModalOpen(true)} />
              <NavItem icon={<Settings className="w-5 h-5" />} label="Pengaturan" onClick={() => setIsSettingsOpen(true)} />
            </nav>

          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-sm">
                AD
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">Admin R&D</p>
                <p className="text-xs text-slate-500 truncate">Kriya Nusantara</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-w-0 flex flex-col h-screen">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-600">
                <Menu className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-slate-900">{viewMode === 'Kanban' ? 'Kanban Board' : 'Daftar Pekerjaan'}</h2>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button 
                onClick={() => { setEditingTask(null); resetForm(); setIsModalOpen(true); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm shadow-indigo-200"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Tambah</span>
              </button>
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'Dashboard' ? (
            <DashboardView tasks={tasks} crew={crew} onEditTask={openEditModal} />
          ) : viewMode === 'Kanban' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Category Selector */}
              <div className="px-4 lg:px-8 py-4 bg-white border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(Object.keys(CATEGORY_STAGES) as TaskCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                      selectedCategory === cat 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Kanban Board */}
              <div className="flex-1 overflow-x-auto p-4 lg:p-8 flex gap-6 items-start">
                {CATEGORY_STAGES[selectedCategory].map(stage => (
                  <div key={stage} className="flex-shrink-0 w-80 flex flex-col max-h-full">
                    <div className="flex items-center justify-between mb-4 px-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900">{stage}</h3>
                        <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {filteredTasks.filter(t => t.stage === stage).length}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                      {filteredTasks.filter(t => t.stage === stage).map(task => (
                        <motion.div
                          key={task.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={`status-badge text-[10px] ${getStatusClass(task.status)}`}>
                              {task.status}
                            </span>
                            <div className="relative group/menu">
                              <button className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              <div className="absolute right-0 top-full mt-1 hidden group-hover/menu:block bg-white border border-slate-200 rounded-xl shadow-xl z-10 w-32 overflow-hidden">
                                <button onClick={() => openEditModal(task)} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 flex items-center gap-2">
                                  <Edit2 className="w-3 h-3" /> Edit
                                </button>
                                <button onClick={() => deleteTask(task.id)} className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                                  <Trash2 className="w-3 h-3" /> Hapus
                                </button>
                              </div>
                            </div>
                          </div>

                          <h4 className="font-bold text-slate-900 text-sm mb-1">{task.title}</h4>
                          <div className="mb-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Klien</p>
                            <p className="text-[11px] font-bold text-indigo-600">{task.clientName}</p>
                          </div>
                          <div className="mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Proyek</p>
                            <p className="text-[11px] font-bold text-slate-700">{task.projectName}</p>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mb-3">{task.description}</p>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                {task.assignee ? task.assignee.charAt(0).toUpperCase() : '?'}
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium truncate max-w-[80px]">{task.assignee || 'Unassigned'}</span>
                            </div>
                            
                            {/* Stage Dropdown for easy switching */}
                            <div className="relative group/stage">
                              <button className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold transition-all">
                                Pindah <ChevronDown className="w-3 h-3" />
                              </button>
                              <div className="absolute right-0 bottom-full mb-1 hidden group-hover/stage:block bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-40 max-h-48 overflow-y-auto custom-scrollbar">
                                {CATEGORY_STAGES[selectedCategory].map(s => (
                                  <button
                                    key={s}
                                    onClick={() => updateTaskStage(task, s)}
                                    className={`w-full text-left px-4 py-2 text-[10px] hover:bg-indigo-50 transition-colors ${task.stage === s ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-600'}`}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 lg:p-8 overflow-y-auto">
              {/* List View Content (Existing) */}
              <div className="grid gap-4">
                {filteredTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer"
                    onClick={() => openEditModal(task)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-12 rounded-full ${getStatusClass(task.status).replace('text-', 'bg-').replace('bg-slate-100', 'bg-slate-300')}`} />
                        <div>
                          <h3 className="font-bold text-slate-900">{task.title}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{task.category}</span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500">{task.stage}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs font-bold text-slate-900">{task.assignee}</p>
                          <p className="text-[10px] text-slate-400">{task.deadline}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal - Add/Edit Task */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingTask ? 'Edit Pekerjaan' : 'Tambah Pekerjaan Baru'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kode SPK/SPD</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                      placeholder="Contoh: SPK-001"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Klien</label>
                      {!isAddingClient ? (
                        <div className="flex gap-2">
                          <select 
                            required
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={formData.clientName}
                            onChange={(e) => {
                              if (e.target.value === 'ADD_NEW') {
                                setIsAddingClient(true);
                              } else {
                                setFormData({...formData, clientName: e.target.value});
                              }
                            }}
                          >
                            <option value="">Pilih Klien</option>
                            {clients.map(client => (
                              <option key={client.id} value={client.name}>{client.name}</option>
                            ))}
                            <option value="ADD_NEW" className="text-indigo-600 font-bold">+ Tambah Klien Baru</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input 
                            autoFocus
                            type="text" 
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="Nama Klien Baru..."
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                          />
                          <button 
                            type="button"
                            onClick={handleAddClient}
                            className="px-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setIsAddingClient(false)}
                            className="px-3 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Judul Proyek</label>
                      <input 
                        required
                        type="text" 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                        placeholder="Contoh: Interior Lobby"
                        value={formData.projectName}
                        onChange={(e) => setFormData({...formData, projectName: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kategori</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={formData.category}
                      onChange={(e) => {
                        const cat = e.target.value as TaskCategory;
                        setFormData({...formData, category: cat, stage: CATEGORY_STAGES[cat][0]});
                      }}
                    >
                      <option value="Produk">Produk</option>
                      <option value="Interior">Interior</option>
                      <option value="Motif">Motif</option>
                      <option value="Drafter">Drafter</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tahap (Stage)</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={formData.stage}
                      onChange={(e) => setFormData({...formData, stage: e.target.value})}
                    >
                      {CATEGORY_STAGES[formData.category].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status Umum</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Review">Review</option>
                      <option value="Done">Done</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prioritas</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value as any})}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Penanggung Jawab</label>
                      <select 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                        value={formData.assignee}
                        onChange={(e) => setFormData({...formData, assignee: e.target.value})}
                      >
                        <option value="">Pilih Crew / Departemen</option>
                        <optgroup label="Departemen">
                          <option value="Produk">Produk</option>
                          <option value="Motif">Motif</option>
                          <option value="Drafter">Drafter</option>
                        </optgroup>
                        <optgroup label="Anggota Tim">
                          {crew.map(c => (
                            <option key={c.id} value={c.name}>{c.name} - {c.role}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deadline</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={formData.deadline}
                      onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deskripsi</label>
                  <textarea 
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                  >
                    {editingTask ? 'Simpan' : 'Buat'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - Settings & Automation Test */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Pengaturan & Otomasi</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                <div className="space-y-6">
                  {/* Google Sheets Sync */}
                  <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Sinkronisasi Google Sheets
                      </h3>
                      <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${spreadsheetSettings.isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {spreadsheetSettings.isConnected ? 'Terhubung' : 'Terputus'}
                      </div>
                    </div>
                    
                    {!spreadsheetSettings.isConnected ? (
                      <button 
                        onClick={connectGoogleSheets}
                        className="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                      >
                        Hubungkan ke Google Sheets
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Spreadsheet ID</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 transition-all"
                              placeholder="Masukkan ID Spreadsheet..."
                              value={spreadsheetSettings.spreadsheetId}
                              onChange={(e) => setSpreadsheetSettings({...spreadsheetSettings, spreadsheetId: e.target.value})}
                            />
                            <button 
                              onClick={saveSpreadsheetId}
                              className="px-4 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all"
                            >
                              Simpan
                            </button>
                          </div>
                        </div>
                        {spreadsheetSettings.lastSync && (
                          <p className="text-[10px] text-slate-400 italic">
                            Terakhir sinkron: {new Date(spreadsheetSettings.lastSync).toLocaleString('id-ID')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Export & Print */}
                  <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Download className="w-5 h-5 text-indigo-600" /> Ekspor & Cetak
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={generatePDF}
                        className="py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <FileText className="w-4 h-4 text-red-500" /> Simpan PDF
                      </button>
                      <button 
                        onClick={handlePrint}
                        className="py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Printer className="w-4 h-4 text-slate-500" /> Cetak Laporan
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Otomasi Email SPK/SPD
                    </h3>
                    <p className="text-xs text-indigo-700 mt-1">
                      Sistem akan otomatis membuat pekerjaan baru jika menerima email dari <strong>marketing@kriyanusantara.com</strong> dengan subjek mengandung "SPK" atau "SPD".
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Simulasi Email Masuk</label>
                    <textarea 
                      rows={6}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 transition-all"
                      value={testEmailBody}
                      onChange={(e) => setTestEmailBody(e.target.value)}
                    />
                    <button 
                      onClick={simulateEmail}
                      className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      Kirim Simulasi Email
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Panduan Format Email:</h4>
                    <ul className="text-[10px] text-slate-500 space-y-1 list-disc pl-4">
                      <li><strong>Kode:</strong> SPK-XXX atau SPD-XXX</li>
                      <li><strong>Klien:</strong> Nama Klien (Otomatis terdaftar jika baru)</li>
                      <li><strong>Proyek:</strong> Nama Proyek</li>
                      <li><strong>Penanggung Jawab:</strong> Nama Crew (Harus sesuai dengan daftar tim)</li>
                      <li><strong>Deskripsi:</strong> Detail pekerjaan</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isCrewModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCrewModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Manajemen Tim R&D</h2>
                <button onClick={() => setIsCrewModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <form onSubmit={handleCrewSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama</label>
                      <input 
                        required
                        type="text" 
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        value={crewFormData.name}
                        onChange={(e) => setCrewFormData({...crewFormData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jabatan</label>
                      <input 
                        required
                        type="text" 
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        value={crewFormData.role}
                        onChange={(e) => setCrewFormData({...crewFormData, role: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">No HP</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        value={crewFormData.phone}
                        onChange={(e) => setCrewFormData({...crewFormData, phone: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal Gabung</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        value={crewFormData.joinDate}
                        onChange={(e) => setCrewFormData({...crewFormData, joinDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alamat</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={crewFormData.address}
                      onChange={(e) => setCrewFormData({...crewFormData, address: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Foto URL</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        value={crewFormData.photo}
                        onChange={(e) => setCrewFormData({...crewFormData, photo: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Performa (%)</label>
                      <input 
                        type="number" 
                        min="0" max="100"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        value={crewFormData.performance}
                        onChange={(e) => setCrewFormData({...crewFormData, performance: parseInt(e.target.value)})}
                      />
                    </div>
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                    Tambah Anggota
                  </button>
                </form>

                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                  {crew.map(c => {
                    const tenure = getTenureInfo(c.joinDate);
                    return (
                      <div key={c.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all group">
                        <div className="flex items-start gap-4">
                          <img 
                            src={c.photo || `https://ui-avatars.com/api/?name=${c.name}&background=random`} 
                            alt={c.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-slate-900 truncate">{c.name}</h4>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${tenure.color}`}>
                                {tenure.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">{c.role}</p>
                            
                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-400">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {tenure.years} Tahun
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {new Date(c.joinDate).toLocaleDateString('id-ID')}
                              </div>
                              {c.phone && (
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3" /> {c.phone}
                                </div>
                              )}
                            </div>

                            <div className="mt-3 space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="text-slate-500 uppercase">Performa</span>
                                <span className="text-indigo-600">{c.performance}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                  style={{ width: `${c.performance}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteCrew(c.id)} 
                            className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          .sidebar, .top-nav, .no-print, button, .modal-backdrop { display: none !important; }
          .main-content { padding: 0 !important; margin: 0 !important; }
          .print-only { display: block !important; }
          .card { break-inside: avoid; border: 1px solid #eee !important; box-shadow: none !important; }
          body { background: white !important; color: black !important; }
        }
        .print-only { display: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

function DashboardView({ tasks, crew, onEditTask }: { tasks: Task[], crew: Crew[], onEditTask: (t: Task) => void }) {
  const inboxCount = tasks.filter(t => t.stage === 'Inbox').length;
  const finishCount = tasks.filter(t => t.stage === 'Finish').length;
  const progressCount = tasks.length - inboxCount - finishCount;

  const categoryData = (Object.keys(CATEGORY_STAGES) as TaskCategory[]).map(cat => ({
    name: cat,
    value: tasks.filter(t => t.category === cat).length
  }));

  const COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#10b981'];

  const recentTasks = [...tasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
  
  const upcomingTasks = tasks
    .filter(t => t.deadline && t.stage !== 'Finish')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 5);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 custom-scrollbar">
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inbox</p>
            <h4 className="text-3xl font-bold text-slate-900">{inboxCount}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Progres</p>
            <h4 className="text-3xl font-bold text-slate-900">{progressCount}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Finish</p>
            <h4 className="text-3xl font-bold text-slate-900">{finishCount}</h4>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Charts Section */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Distribusi Kategori</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Pekerjaan Terbaru</h3>
            <div className="space-y-4">
              {recentTasks.map(task => (
                <div 
                  key={task.id} 
                  onClick={() => onEditTask(task)}
                  className="flex items-center justify-between p-4 rounded-2xl border border-slate-50 hover:border-indigo-100 hover:bg-slate-50 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                      {task.title.substring(0, 2)}
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{task.title}</h5>
                      <p className="text-[10px] text-slate-500">{task.clientName} • {task.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                      {task.stage}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Stats Section */}
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Deadline Terdekat</h3>
            <div className="space-y-4">
              {upcomingTasks.map(task => (
                <div key={task.id} className="flex items-start gap-3">
                  <div className="mt-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">{task.title}</h5>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}
                    </p>
                  </div>
                </div>
              ))}
              {upcomingTasks.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Tidak ada deadline terdekat</p>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Tim R&D</h3>
            <div className="space-y-4">
              {crew.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  {c.photo ? (
                    <img 
                      src={c.photo} 
                      alt={c.name} 
                      className="w-8 h-8 rounded-full object-cover border border-slate-100"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                      {c.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">{c.name}</h5>
                    <p className="text-[10px] text-slate-500">{c.role}</p>
                  </div>
                </div>
              ))}
              <button className="w-full py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                Lihat Semua Tim
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
        active 
        ? 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100' 
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 shadow-sm">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-end justify-between">
        <h4 className="text-2xl lg:text-3xl font-bold text-slate-900">{value}</h4>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${color}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

