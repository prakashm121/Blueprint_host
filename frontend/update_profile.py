import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\Profile\Profile.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';"""

import_replacement = """import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """  useEffect(() => {
    api.get('/api/v1/profile/')
      .then(res => {
        const d = res.data;
        setForm({
          full_name: d.full_name || '',
          phone_number: d.phone_number || '',
          bio: d.bio || '',
          college_name: d.college_name || '',
          degree: d.degree || '',
          specialization: d.specialization || '',
          graduation_year: d.graduation_year ? String(d.graduation_year) : '',
          cgpa: d.cgpa !== null && d.cgpa !== undefined ? String(d.cgpa) : '',
          target_role: d.target_role || '',
          target_companies: d.target_companies || [],
          preparation_status: d.preparation_status || 'early',
          linkedin_url: d.linkedin_url || '',
          github_username: d.github_username || '',
          avatar_url: d.avatar_url || '',
        });
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);"""

logic_replacement = """  const queryClient = useQueryClient();

  const { data: profileData, isLoading: profileLoading, isError: profileError } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      // RLS will automatically filter this to the authenticated user's profile
      const { data, error } = await supabase.from('profiles').select('*').limit(1).single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (profileData) {
      const d = profileData;
      setForm({
        full_name: d.full_name || '',
        phone_number: d.phone_number || '',
        bio: d.bio || '',
        college_name: d.college_name || '',
        degree: d.degree || '',
        specialization: d.specialization || '',
        graduation_year: d.graduation_year ? String(d.graduation_year) : '',
        cgpa: d.cgpa !== null && d.cgpa !== undefined ? String(d.cgpa) : '',
        target_role: d.target_role || '',
        target_companies: d.target_companies || [],
        preparation_status: d.preparation_status || 'early',
        linkedin_url: d.linkedin_url || '',
        github_username: d.github_username || '',
        avatar_url: d.avatar_url || '',
      });
      setLoading(false);
    }
  }, [profileData]);

  useEffect(() => {
    if (profileError) {
      setError('Failed to load profile.');
      setLoading(false);
    }
  }, [profileError]);"""

update_target = """  const handleSave = async e => {
    e.preventDefault();
    const cgpaErr = validateCgpa(form.cgpa);
    if (cgpaErr) { setCgpaError(cgpaErr); return; }
    setCgpaError('');
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.patch('/api/v1/profile/', {
        ...form,
        cgpa: form.cgpa ? parseFloat(form.cgpa) : null,
        graduation_year: form.graduation_year ? parseInt(form.graduation_year) : null,
      });
      setSuccess('Profile saved successfully! If you changed your target role, regenerate your roadmap.');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {"""

update_replacement = """  const updateMutation = useMutation({
    mutationFn: async (updatedData) => {
      // Rely on RLS to only update the authenticated user's row
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('profiles')
        .update(updatedData)
        .eq('user_id', profileData.user_id); // we have the user_id from the initial fetch
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['profile']);
      setSuccess('Profile saved successfully! If you changed your target role, regenerate your roadmap.');
      setTimeout(() => setSuccess(''), 6000);
      setSaving(false);
    },
    onError: () => {
      setError('Failed to save profile. Please try again.');
      setSaving(false);
    }
  });

  const handleSave = async e => {
    e.preventDefault();
    const cgpaErr = validateCgpa(form.cgpa);
    if (cgpaErr) { setCgpaError(cgpaErr); return; }
    setCgpaError('');
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateMutation.mutateAsync({
        ...form,
        cgpa: form.cgpa ? parseFloat(form.cgpa) : null,
        graduation_year: form.graduation_year ? parseInt(form.graduation_year) : null,
      });
    } catch (err) {"""

content = content.replace(logic_target, logic_replacement)
content = content.replace(update_target, update_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Profile.jsx updated successfully!")
