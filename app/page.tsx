'use client'

import { useState } from 'react'
import { Menu, User, ChevronRight, Home, List, Wallet } from 'lucide-react'

export default function TiakTiak() {
  const [service, setService] = useState('moto')
  const [tab, setTab] = useState('accueil')

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">

      <header className="bg-white px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
        <button className="w-10 h-10 flex items-center justify-center">
          <Menu size={24} color="#0F5138" />
        </button>
        <span className="text-2xl font-black italic" style={{ color: '#0F5138' }}>TIAK TIAK</span>
        <button className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
          <User size={20} className="text-gray-400" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

        <div>
          <h2 className="text-lg font-bold text-black mb-3">Services disponibles</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setService('moto')}
              className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm"
              style={{ border: service === 'moto' ? '2px solid #1DB954' : '2px solid white' }}
            >
              <span className="text-4xl">🏍️</span>
              <span className="font-bold" style={{ color: service === 'moto' ? '#0F5138' : '#9CA3AF' }}>Moto-taxi</span>
              <span className="text-xs text-gray-400">2 min</span>
            </button>

            <button
              onClick={() => setService('livraison')}
              className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm"
              style={{ border: service === 'livraison' ? '2px solid #1DB954' : '2px solid white' }}
            >
              <span className="text-4xl">📦</span>
              <span className="font-bold" style={{ color: service === 'livraison' ? '#0F5138' : '#9CA3AF' }}>Livraison</span>
              <span className="text-xs text-gray-400">10 min</span>
            </button>
          </div>
        </div>

        <button className="w-full bg-white rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
          <span className="flex-1 text-left text-gray-400">Ou allons-nous ?</span>
          <ChevronRight size={20} color="#0F5138" />
        </button>

        <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: '#0F5138' }}>
          <h3 className="text-white font-black italic text-xl mb-1">-50% SUR TA 1ERE COURSE</h3>
          <p className="text-white text-sm opacity-90 mb-4">Rejoins des milliers de Senegalais qui roulent malin</p>
          <button className="bg-white px-5 py-2 rounded-full font-bold text-sm" style={{ color: '#0F5138' }}>J EN PROFITE</button>
        </div>

      </div>

      <nav className="bg-white flex flex-shrink-0 border-t border-gray-100">
        <button onClick={() => setTab('accueil')} className="flex-1 py-3 flex flex-col items-center gap-1">
          <Home size={22} color={tab === 'accueil' ? '#1DB954' : '#9CA3AF'} />
          <span className="text-xs font-semibold" style={{ color: tab === 'accueil' ? '#0F5138' : '#9CA3AF' }}>Accueil</span>
        </button>
        <button onClick={() => setTab('courses')} className="flex-1 py-3 flex flex-col items-center gap-1">
          <List size={22} color={tab === 'courses' ? '#1DB954' : '#9CA3AF'} />
          <span className="text-xs font-semibold" style={{ color: tab === 'courses' ? '#0F5138' : '#9CA3AF' }}>Mes courses</span>
        </button>
        <button onClick={() => setTab('profil')} className="flex-1 py-3 flex flex-col items-center gap-1">
          <Wallet size={22} color={tab === 'profil' ? '#1DB954' : '#9CA3AF'} />
          <span className="text-xs font-semibold" style={{ color: tab === 'profil' ? '#0F5138' : '#9CA3AF' }}>Profil</span>
        </button>
      </nav>

    </div>
  )
}