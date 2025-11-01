import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AISMapPage } from './pages/AISMapPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <AISMapPage /> },
    ],
  },
]);
