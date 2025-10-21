import React, { useState, useEffect } from 'react';
import { MessageSquare, Users, Clock, Star, TrendingUp, Calendar } from 'lucide-react';
import { supabase } from '@/config/supabase';

interface ChatAnalytics {
  date: string;
  total_chats: number;
  completed_chats: number;
  authenticated_chats: number;
  guest_chats: number;
  avg_messages: number;
  avg_rating: number;
  avg_duration_minutes: number;
}

interface ChatTranscript {
  id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  started_at: string;
  ended_at: string | null;
  page_url: string;
  user_role: string | null;
  agency_name: string | null;
  is_admin: boolean;
  chat_rating: number | null;
  message_count: number;
  tags: string[];
  notes: string | null;
}

export function ChatAnalyticsTab() {
  const [analytics, setAnalytics] = useState<ChatAnalytics[]>([]);
  const [recentChats, setRecentChats] = useState<ChatTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(7);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);

      const { data: analyticsData, error: analyticsError } = await supabase
        .from('chat_analytics')
        .select('*')
        .gte('date', startDate.toISOString())
        .order('date', { ascending: false })
        .limit(dateRange);

      if (analyticsError) throw analyticsError;

      const { data: chatsData, error: chatsError } = await supabase
        .from('chat_transcripts')
        .select('*')
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: false })
        .limit(50);

      if (chatsError) throw chatsError;

      setAnalytics(analyticsData || []);
      setRecentChats(chatsData || []);
    } catch (error) {
      console.error('Error loading chat analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    if (analytics.length === 0) {
      return {
        totalChats: 0,
        avgRating: 0,
        avgDuration: 0,
        completionRate: 0,
      };
    }

    const totalChats = analytics.reduce((sum, day) => sum + day.total_chats, 0);
    const completedChats = analytics.reduce((sum, day) => sum + day.completed_chats, 0);
    const ratingsSum = analytics.reduce((sum, day) => sum + (day.avg_rating || 0) * day.total_chats, 0);
    const durationsSum = analytics.reduce((sum, day) => sum + (day.avg_duration_minutes || 0) * day.completed_chats, 0);

    return {
      totalChats,
      avgRating: totalChats > 0 ? ratingsSum / totalChats : 0,
      avgDuration: completedChats > 0 ? durationsSum / completedChats : 0,
      completionRate: totalChats > 0 ? (completedChats / totalChats) * 100 : 0,
    };
  };

  const totals = calculateTotals();

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Chat Analytics</h2>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Chats</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totals.totalChats}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-full">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Rating</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {totals.avgRating > 0 ? totals.avgRating.toFixed(1) : 'N/A'}
              </p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-full">
              <Star className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Duration</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatDuration(totals.avgDuration)}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completion Rate</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {totals.completionRate.toFixed(0)}%
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-full">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Chats</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Visitor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Page
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Messages
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentChats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No chat data available for the selected period
                  </td>
                </tr>
              ) : (
                recentChats.map((chat) => (
                  <tr key={chat.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {chat.visitor_name || 'Anonymous'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {chat.visitor_email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate" title={chat.page_url}>
                        {new URL(chat.page_url).pathname}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        chat.is_admin
                          ? 'bg-purple-100 text-purple-800'
                          : chat.user_role === 'agent'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {chat.is_admin ? 'Admin' : chat.user_role || 'Guest'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(chat.started_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {chat.message_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {chat.chat_rating ? (
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-500 mr-1" />
                          <span className="text-sm font-medium text-gray-900">{chat.chat_rating}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <MessageSquare className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">About Chat Analytics</p>
            <p>
              This dashboard tracks visitor interactions with the Tawk.to chatbot. Data includes chat sessions,
              visitor information, ratings, and conversation metrics. Use this data to improve customer support
              and identify common questions or issues.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
