import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, type CurrentUser } from '../api/client';

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  /** Seed the cache directly (e.g. right after login/logout) so consumers see the new state immediately. */
  setUser: (user: CurrentUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const res = await fetchCurrentUser();
        return res.user;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const value: AuthContextValue = {
    user: data ?? null,
    isLoading,
    setUser: (user) => {
      queryClient.setQueryData(['currentUser'], user);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
