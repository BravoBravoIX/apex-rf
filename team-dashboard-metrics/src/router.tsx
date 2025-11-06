import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MetricsPage } from './pages/MetricsPage';
import { IQAnalysisPage } from './pages/IQAnalysisPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <MetricsPage /> },
      { path: 'iq-analysis', element: <IQAnalysisPage /> },
    ],
  },
]);
