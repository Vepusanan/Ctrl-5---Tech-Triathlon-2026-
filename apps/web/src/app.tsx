import { getHomeRoute, type Role, type User } from '@waypoint/shared';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/auth';
import { SignIn } from './features/auth/login';
import { DesignSystem } from './features/design-system/design-system';
import { DispatchWorkspaceApp } from './features/dispatch/workspace';
import { DriverWorkspaceApp } from './features/driver/workspace';
import { LoaderWorkspaceApp } from './features/loader/workspace';
import { StoreWorkspaceApp } from './features/store/workspace';
import './features/store/store.css';

function RoleGuard<R extends Role>({
  allowedRole,
  children,
}: {
  allowedRole: R;
  children: (user: Extract<User, { role: R }>) => ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== allowedRole) return <Navigate to={getHomeRoute(user.role)} replace />;
  return children(user as Extract<User, { role: R }>);
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? getHomeRoute(user.role) : '/login'} replace />;
}
function Login() {
  const { user } = useAuth();
  return user ? <Navigate to={getHomeRoute(user.role)} replace /> : <SignIn />;
}
function LegacyDispatcher() {
  const location = useLocation();
  return (
    <Navigate
      to={`${location.pathname.replace(/^\/dispatch(?=\/|$)/, '/dispatcher')}${location.search}`}
      replace
    />
  );
}
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dev/design-system" element={<DesignSystem />} />
        <Route
          path="*"
          element={
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/dispatcher/*"
                  element={
                    <RoleGuard allowedRole="dispatcher">
                      {(user) => <DispatchWorkspaceApp user={user} />}
                    </RoleGuard>
                  }
                />
                <Route
                  path="/loader/*"
                  element={
                    <RoleGuard allowedRole="loader">
                      {(user) => <LoaderWorkspaceApp user={user} />}
                    </RoleGuard>
                  }
                />
                <Route
                  path="/driver/*"
                  element={
                    <RoleGuard allowedRole="driver">
                      {(user) => <DriverWorkspaceApp user={user} />}
                    </RoleGuard>
                  }
                />
                <Route
                  path="/store/*"
                  element={
                    <RoleGuard allowedRole="store_manager">
                      {(user) => <StoreWorkspaceApp user={user} />}
                    </RoleGuard>
                  }
                />
                <Route path="/dispatch/*" element={<LegacyDispatcher />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
