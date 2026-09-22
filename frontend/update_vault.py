import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\Vault\VaultDashboard.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect } from 'react';
import { api } from '../../api';"""

import_replacement = """import { useState, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """  const [items, setItems] = useState([]);
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
  };"""


logic_replacement = """  const queryClient = useQueryClient();
  
  // Client-side filtering tabs
  const [activeTab, setActiveTab] = useState('ALL');

  // Create Note Modal State
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '' });

  const fetchVaultItems = async ({ pageParam = 0 }) => {
    let query = supabase.from('vault_items').select('*');
    if (pageParam > 0) {
      query = query.lt('id', pageParam); // Assuming descending order by id, so we use less than
    }
    // RLS handles the user_id filtering implicitly, but we must order descending
    query = query.order('id', { ascending: false }).limit(20);
    
    const { data, error } = await query;
    if (error) throw error;
    
    const next_cursor = data.length === 20 ? data[19].id : null;
    return { items: data, next_cursor };
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    status
  } = useInfiniteQuery({
    queryKey: ['vaultItems'],
    queryFn: fetchVaultItems,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 5 * 60 * 1000,
  });

  const items = data ? data.pages.flatMap(page => page.items) : [];
  const loading = status === 'pending';
  const nextCursor = hasNextPage;

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('vault_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(['vaultItems']),
    onError: () => alert('Failed to delete the item.')
  });

  const handleDelete = (id) => {
    deleteMutation.mutate(id);
  };

  const createMutation = useMutation({
    mutationFn: async (note) => {
      // Must fetch user context to append user_id since it's required for insert
      const { data: userData } = await supabase.auth.getUser();
      
      // Need to query user_id from users table to link to profiles/vault
      const { data: userRow } = await supabase.from('users').select('id').eq('supabase_id', userData.user.id).single();
      
      const { data, error } = await supabase.from('vault_items').insert([{
        user_id: userRow.id,
        item_type: 'PERSONAL_NOTE',
        reference_type: 'NONE',
        title: note.title,
        content: note.content
      }]);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vaultItems']);
      setShowNoteModal(false);
      setNewNote({ title: '', content: '' });
    },
    onError: () => alert('Failed to save your note.')
  });

  const handleCreateNote = (e) => {
    e.preventDefault();
    if (!newNote.title.trim()) return;
    createMutation.mutate(newNote);
  };
  
  const creating = createMutation.isPending;"""

# Fix the button for Load Older Items since nextCursor is now a boolean `hasNextPage`
ui_target = """          {/* Load More Trigger */}
          {nextCursor && !loading && (
            <div className="text-center pt-4">
              <button 
                onClick={() => fetchVaultItems(nextCursor, false)}"""

ui_replacement = """          {/* Load More Trigger */}
          {hasNextPage && !loading && (
            <div className="text-center pt-4">
              <button 
                onClick={() => fetchNextPage()}"""

content = content.replace(logic_target, logic_replacement)
content = content.replace(ui_target, ui_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("VaultDashboard.jsx updated successfully!")
