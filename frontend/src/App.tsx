import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AppRoutes } from '@/routes/AppRoutes';

const router = createBrowserRouter([{ path: '*', element: <AuthProvider><AppRoutes /></AuthProvider> }]);

export default function App() {
  return <RouterProvider router={router} />;
}
