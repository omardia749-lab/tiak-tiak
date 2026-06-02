'use client'

import { useState, useRef } from 'react'
import { Menu, User, ChevronRight, Home, List, Wallet, Search, X, MapPin, ArrowLeft } from 'lucide-react'
import { searchPlaces, Place } from '../lib/search'
import { calculatePrice, formatPrice, formatDistance, calculateETA, formatETA, haversineDistance } from '../lib/utils'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('./components/MapView'), { ssr: false })

export default function TiakTiak() {
  const [service, setService] = useState('moto')
  const [tab, setTab] = useState('accueil')
  const [screen, setScreen] = useState('accueil')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  const onSearch = (val: string) => {
    setQuery(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (val.length < 2) { setResults([]); return }
    setLoading(true)
    searchTimeout.current = setTimeout(async () => {
      const places = await searchPlaces(val)
      setResults(places)
      setLoading(false)
    }, 500)
  }

  const selectPlace = (place: Place) => {
    setSelected(place)
    setScreen('confirm')
  }

  const km = selected ? haversineDistance(14.7167, -17.2833, selected.lat, selected.lng) : 0
  const price = selected ? calculatePrice(km, service as 'moto' | 'livraison') : 0
  const eta = selected ? calculateETA(km) : 0

  if (screen === 'recherche') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="bg-white px-4 py-4 flex items-center gap-3 flex-shrink-0 border-b border-gray-100">
          <button onClick={() => { setScreen('accueil'); setQuery(''); setResults([]) }}>
            <ArrowLeft size={24} color="#0F5138" />
          </button>
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2.5">
            <Search size={18} className="text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Rue, hopital, boutique, mosquee..."
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]) }}>
                <X size={18} className="text-gray-400" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-center text-gray-400 text-sm">Recherche en cours...</div>}
          {!loading && results.map((place, i) => (
            <button
              key={i}
              onClick={() => selectPlace(place)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#E8F5E9' }}>
                <MapPin size={18} color="#1DB954" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-black truncate">{place.name}</p>
                <p className="text-xs text-gray-400 truncate">{place.address}</p>
              </div>
            </button>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">Aucun lieu trouve</div>
          )}
          {query.length < 2 && (
            <div className="p-6 text-center text-gray-300 text-sm">Tape le nom d&apos;un lieu au Senegal</div>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'confirm' && selected) {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 flex-shrink-0 border-b border-gray-100">
          <button onClick={() => setScreen('recherche')}>
            <ArrowLeft size={24} color="#0F5138" />
          </button>
          <span className="font-bold text-black">Confirmer la course</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="h-56 relative">
            <MapView fromLat={14.7167} fromLng={-17.2833} toLat={selected.lat} toLng={selected.lng} />
          </div>

          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                <div>
                  <p className="text-xs text-gray-400">Depart</p>
                  <p className="text-sm font-semibold">Rufisque, Dakar</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-500" />
                <div>
                  <p className="text-xs text-gray-400">Destination</p>
                  <p className="text-sm font-semibold">{selected.name}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setService('moto')}
                className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm"
                style={{ border: service === 'moto' ? '2px solid #1DB954' : '2px solid white' }}
              >
                <span className="text-2xl">🏍️</span>
                <span className="font-bold text-sm" style={{ color: service === 'moto' ? '#0F5138' : '#9CA3AF' }}>Moto-taxi</span>
              </button>
              <button
                onClick={() => setService('livraison')}
                className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm"
                style={{ border: service === 'livraison' ? '2px solid #1DB954' : '2px solid white' }}
              >
                <span className="text-2xl">📦</span>
                <span className="font-bold text-sm" style={{ color: service === 'livraison' ? '#0F5138' : '#9CA3AF' }}>Livraison</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">Distance</span>
                <span className="text-sm font-bold">{formatDistance(km)}</span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-sm text-gray-500">Duree estimee</span>
                <span className="text-sm font-bold">{formatETA(eta)}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                <span className="font-bold">Prix total</span>
                <span className="text-2xl font-black" style={{ color: '#0F5138' }}>{formatPrice(price)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-100">
          <button className="w-full py-4 rounded-2xl font-bold text-white text-base" style={{ background: '#0F5138' }}>
            Commander un TIAK TIAK
          </button>
        </div>
      </div>
    )
  }

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

        <button
          onClick={() => setScreen('recherche')}
          className="w-full bg-white rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm"
        >
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