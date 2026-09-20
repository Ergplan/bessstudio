import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react()],
  server:{port:5178,strictPort:true},
  build:{
    chunkSizeWarningLimit:1100,
    rollupOptions:{output:{manualChunks(id){
      if(id.includes('node_modules/firebase')||id.includes('node_modules/@firebase'))return 'firebase';
      if(id.includes('node_modules/three'))return 'three';
      if(id.includes('node_modules/react')||id.includes('node_modules/scheduler'))return 'react';
    }}},
  },
});
