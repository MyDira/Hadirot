import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User, Building2 } from 'lucide-react';
import { Profile } from '@/config/supabase';
import { profilesService } from '@/services/profiles';

interface UserSearchSelectProps {
  selectedUser: Profile | null;
  onSelect: (user: Profile | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UserSearchSelect({
  selectedUser,
  onSelect,
  placeholder = 'Search users by name, email, or agency...',
  disabled = false,
}: UserSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const profiles = await profilesService.searchProfiles(query, 10);
        setResults(profiles);
      } catch (error) {
        console.error('Error searching profiles:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (user: Profile) => {
    onSelect(user);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: Record<string, string> = {
      agent: 'Agent',
      landlord: 'Landlord',
      tenant: 'Tenant',
    };
    return roleMap[role] || role;
  };

  if (selectedUser) {
    return (
      <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            {selectedUser.role === 'agent' ? (
              <Building2 className="w-5 h-5 text-gray-500" />
            ) : (
              <User className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <div>
            <div className="font-medium text-gray-900">{selectedUser.full_name}</div>
            <div className="text-sm text-gray-500">
              {selectedUser.email} • {getRoleDisplay(selectedUser.role)}
              {selectedUser.agency && ` • ${selectedUser.agency}`}
            </div>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && (query.length >= 2 || results.length > 0) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {results.length === 0 && !loading && query.length >= 2 && (
            <div className="p-4 text-center text-gray-500">
              No users found matching "{query}"
            </div>
          )}
          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-0"
            >
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                {user.role === 'agent' ? (
                  <Building2 className="w-5 h-5 text-gray-500" />
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate">{user.full_name}</div>
                <div className="text-sm text-gray-500 truncate">
                  {user.email} • {getRoleDisplay(user.role)}
                  {user.agency && ` • ${user.agency}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
