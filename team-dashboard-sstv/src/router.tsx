import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SSTVDecodePage } from './pages/SSTVDecodePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <SSTVDecodePage /> },
    ],
  },
]);
