import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MetricsPage } from './pages/MetricsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <MetricsPage /> },
    ],
  },
]);
