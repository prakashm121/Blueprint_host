import { useState, useEffect } from 'react';
import { api } from '../../api';

// Metadata mapping for aesthetic styling of Vault item types
const TYPE_METADATA = {
  'BOOKMARK': { icon: 'bookmark', label: 'Bookmark', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
  'AI_INSIGHT': { icon: 'lightbulb', label: 'AI Insight', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  'PERSONAL_NOTE': { icon: 'edit_note', label: 'Personal Note', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }
};

// Badges for the hub references
const REF_METADATA = {
  'DSA': { label: 'Coding Problem', icon: 'code' },
  'QUIZ': { label: 'Quiz MCQ', icon: 'quiz' },
  'INTERVIEW': { label: 'Interview Q&A', icon: 'forum' },
  'NONE': { label: 'General', icon: 'folder' }
};

export default function VaultDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  
  // Client-side filtering tabs
  const [activeTab, setActiveTab] = useState('ALL');

  // Create Note Modal State
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [creating, setCreating] = useState(false);

  // Initial Fetch
  useEffect(() => {
    fetchVaultItems(0, true);
  }, []);

  const fetchVaultItems = async (lastId = 0, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      // Assuming your router is mounted at /api/v1/vault
      const res = await api.get('/api/v1/vault/', {
        params: { last_id: lastId, limit: 20 }
      });
      
      if (isInitial) {
        setItems(res.data.items);
      } else {
        setItems(prev => [...prev, ...res.data.items]);
      }
      setNextCursor(res.data.next_cursor);
    } catch (err) {
      setError('Failed to load vault items. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/v1/vault/${id}`);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      alert('Failed to delete the item.');
    }
  };

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!newNote.title.trim()) return;
    
    setCreating(true);
    try {
      await api.post('/api/v1/vault/', {
        item_type: 'PERSONAL_NOTE',
        reference_type: 'NONE',
        title: newNote.title,
        content: newNote.content
      });
      
      setShowNoteModal(false);
      setNewNote({ title: '', content: '' });
      // Refresh list to show the newest item at the top (or re-fetch)
      fetchVaultItems(0, true);
    } catch (err) {
      alert('Failed to save your note.');
    } finally {
      setCreating(false);
    }
  };

  // Filter items based on active tab
  const filteredItems = activeTab === 'ALL' 
    ? items 
    : items.filter(item => item.item_type === activeTab);

  return (
    <div className="bg-background-deep text-on-surface font-body-base antialiased min-h-screen relative">
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          
          {/* Header Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
            <div>
              <h2 className="text-2xl font-bold text-on-surface tracking-tight">Knowledge Vault</h2>
              <p className="text-xs text-on-surface-variant">Review your saved bookmarks, AI insights, and personal notes.</p>
            </div>
            
            <button 
              onClick={() => setShowNoteModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:brightness-110 shadow-sm transition-all flex items-center gap-2 self-start lg:self-center"
            >
              <span className="material-symbols-outlined text-sm">add</span> Add Personal Note
            </button>
          </div>

          {/* Filtering Tabs */}
          <div className="flex bg-surface-container-low p-1 rounded-xl border border-border-subtle self-start inline-flex gap-1">
            {['ALL', 'BOOKMARK', 'AI_INSIGHT', 'PERSONAL_NOTE'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs transition-all ${
                  activeTab === tab 
                    ? 'font-bold text-primary bg-primary/10 border border-primary/20 shadow-sm' 
                    : 'font-medium text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab === 'ALL' ? 'All Items' : TYPE_METADATA[tab].label}s
              </button>
            ))}
          </div>

          {/* Vault Grid */}
          {loading ? (
             <div className="p-16 text-center text-xs text-on-surface-variant flex flex-col items-center gap-3 bg-surface-container rounded-2xl border border-border-subtle">
               <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
               Decrypting vault records...
             </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-surface-container border border-border-subtle border-dashed rounded-2xl p-16 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">inventory_2</span>
              <h3 className="text-sm font-bold text-on-surface">Your Vault is Empty</h3>
              <p className="text-xs text-on-surface-variant">Save problems, bookmark interview questions, or write notes to see them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {filteredItems.map(item => {
                const typeMeta = TYPE_METADATA[item.item_type] || TYPE_METADATA['PERSONAL_NOTE'];
                const refMeta = REF_METADATA[item.reference_type] || REF_METADATA['NONE'];
                
                return (
                  <div key={item.id} className="bg-surface-container border border-border-subtle rounded-2xl p-5 hover:border-border-strong transition-all flex flex-col h-full space-y-4 group">
                    
                    {/* Card Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest border flex items-center gap-1 ${typeMeta.bg} ${typeMeta.color} ${typeMeta.border}`}>
                        <span className="material-symbols-outlined text-[11px]">{typeMeta.icon}</span>
                        {typeMeta.label}
                      </div>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="text-on-surface-variant hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                        title="Delete from Vault"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>

                    {/* Card Body */}
                    <div className="flex-1 space-y-2">
                      <h4 className="text-sm font-bold text-on-surface leading-snug">{item.title}</h4>
                      {item.content && (
                        <p className="text-xs text-on-surface-variant line-clamp-4 whitespace-pre-line leading-relaxed">
                          {item.content}
                        </p>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3 border-t border-border-subtle/50 flex justify-between items-center mt-auto">
                      <div className="flex items-center gap-1.5 text-on-surface-variant text-[10px]">
                        <span className="material-symbols-outlined text-[12px]">{refMeta.icon}</span>
                        <span>{refMeta.label}</span>
                      </div>
                      <span className="text-[10px] text-on-surface-variant/60 font-mono">
                        {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More Trigger */}
          {nextCursor && !loading && (
            <div className="text-center pt-4">
              <button 
                onClick={() => fetchVaultItems(nextCursor, false)}
                disabled={loadingMore}
                className="px-6 py-2 bg-surface-container-low border border-border-subtle hover:border-primary/50 text-xs font-medium text-on-surface-variant hover:text-primary rounded-xl transition-all disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load Older Items'}
              </button>
            </div>
          )}

        </main>
      </div>

      {/* Quick Add Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-container w-full max-w-lg rounded-2xl border border-border-subtle shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-4 border-b border-border-subtle flex justify-between items-center bg-surface-container-low">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400">edit_note</span> Create Personal Note
              </h3>
              <button onClick={() => setShowNoteModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleCreateNote} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Note Title <span className="text-rose-400">*</span></label>
                <input 
                  type="text" 
                  required
                  value={newNote.title}
                  onChange={(e) => setNewNote({...newNote, title: e.target.value})}
                  className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition-all placeholder:text-on-surface-variant/40"
                  placeholder="E.g., Reminders for System Design"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Body Content</label>
                <textarea 
                  rows={5}
                  value={newNote.content}
                  onChange={(e) => setNewNote({...newNote, content: e.target.value})}
                  className="w-full bg-surface-container-low border border-border-subtle rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/50 transition-all placeholder:text-on-surface-variant/40 custom-scrollbar resize-none"
                  placeholder="Write your thoughts, code snippets, or takeaways here..."
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowNoteModal(false)}
                  className="px-4 py-2 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={creating || !newNote.title.trim()}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {creating ? 'Saving...' : 'Save to Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}