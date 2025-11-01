
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { ThemeProvider } from './contexts/ThemeContext'
import { InjectProvider } from './contexts/InjectContext'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <InjectProvider>
        <RouterProvider router={router} />
      </InjectProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
