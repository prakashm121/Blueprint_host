# -*- coding: utf-8 -*-
import os

file_path = r"E:\WebSite\Blueprint_host\frontend\src\pages\Planner\Planner.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
import_target = """import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';"""

import_replacement = """import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../api';"""

content = content.replace(import_target, import_replacement)

# Replace Logic
logic_target = """  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [activeDayFilter, setActiveDayFilter] = useState("All");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [roadmap, setRoadmap] = useState(null);

  const [newTask, setNewTask] = useState({
    title: '',
    category: 'Custom',
    priority: 'Medium',
    estimated_minutes: 30
  });

  const fetchPlan = async () => {
    try {
      const res = await api.get('/api/v1/planner/plans');
      setPlan(res.data);
    } catch (err) {
      console.error("Failed to load plan track:", err);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/v1/profile/');
      if (res.data?.target_role) {
        setTargetRole(res.data.target_role);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoadmap = async () => {
    try {
      const res = await api.get('/api/v1/roadmap');
      setRoadmap(res.data);
    } catch (err) {
      console.error("Failed to load roadmap:", err);
    }
  };

  useEffect(() => {
    fetchPlan();
    fetchProfile();
    fetchRoadmap();
  }, []);"""

logic_replacement = """  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [activeDayFilter, setActiveDayFilter] = useState("All");

  const [newTask, setNewTask] = useState({
    title: '',
    category: 'Custom',
    priority: 'Medium',
    estimated_minutes: 30
  });

  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ['plannerPlan'],
    queryFn: async () => {
      const res = await api.get('/api/v1/planner/plans');
      return res.data;
    }
  });
  
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').limit(1).single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000
  });
  
  const { data: roadmap } = useQuery({
    queryKey: ['roadmap'],
    queryFn: async () => {
      const res = await api.get('/api/v1/roadmap');
      return res.data;
    },
    staleTime: 5 * 60 * 1000
  });

  const targetRole = profile?.target_role || "Software Engineer";
  const loading = loadingPlan;

  const fetchPlan = () => queryClient.invalidateQueries(['plannerPlan']);"""

content = content.replace(logic_target, logic_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Planner.jsx updated successfully!")
