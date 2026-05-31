'use client'

import { useState, useEffect } from 'react'
import { MapPin, Navigation, Search, Star, Phone, X, Zap, User, List, Home } from 'lucide-react'
import { calculatePrice, calculateCommission, calculateETA, formatPrice, formatDistance, formatETA, haversineDistance, DESTINATIONS_SENEGAL } from '../lib/utils'

type Screen = 'splash' | 'home' | 'searching' | 'active-ride' | 'driver' | 'history' | 'profile'
type Service = 'moto' | 'livraison'
type PayMethod = 'cash' | 'wave' | 'orange'
type RideStatus = 'accepted' | 'en_route' | 'in_progress' | 'completed'

interface Destination {
  name: string
  address: string
  lat: number
  lng: number
}

const MOCK_DRIVER = {
  name: 'Moussa Diallo',
  vehicle: 'Jakarta 125cc',
  plate: 'DK-4821-AB',
  rating: 4.8,
  reviews: 234,
  phone: '+221771234567',
}

const MOCK_HISTORY = [
  { id: '1', dest: 'Marché Sandaga', price: 2200, date: "Aujourd'hui 14:30", pay: 'Cash', rating: 5 },
  { id: '2', dest: 'Aéroport AIBD', price: 5500, date: 'Hier 09:15', pay: 'Wave', rating: 5 },
  { id: '3', dest: 'Université UCAD', price: 1800, date: 'Hier 07:45', pay: 'Orange', rating: 4 },
  { id: '4', dest: 'Plateau, Dakar', price: 3000, date: 'Il y a 2 jours', pay: 'Cash', rating: 5 },
]

export default function TiakTiak() {
  const [screen, setScreen] = useState<Screen>('splash')
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'profile'>('home')
  const [service, setService] = useState<Service>('moto')
  const [payment, setPayment] = useState<PayMethod>('cash')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null)
  const [userLocation, setUserLocation] = useState('Détection GPS...')
  const [priceInfo, setPriceInfo] = useState<{ price: number; km: number; eta: number } | null>(null)
  const [rideStatus, setRideStatus] = useState<RideStatus>('accepted')
  const [etaSeconds, setEtaSeconds] = useState(180)
  const [isOnline, setIsOnline] = useState(false)
  const [rideRequest, setRideRequest] = useState<{ toAddress: string; price: number; commission: number; km: number } | null>(null)
  const [reqTimer, setReqTimer] = useState(30)
  const [driverStats, setDriverStats] = useState({ courses: 0, gains: 0 })
  const [driverHistory, setDriverHistory] = useState<typeof MOCK_HISTORY>([])
  const [mode, setMode] = useState<'client' | 'driver'>('client')

  useEffect(() => {
    const t = setTimeout(() => {
      setScreen('home')
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => setUserLocation('Commune de Rufisque Est, Rufisque'),
          () => setUserLocation('Rufisque, Dakar, Sénégal')
        )
      }
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (selectedDest && priceInfo) {
      const price = calculatePrice(priceInfo.km, service)
      setPriceInfo(prev => prev ? { ...prev, price } : null)
    }
  }, [service])

  const filteredDests = searchQuery.length >= 2
    ? DESTINATIONS_SENEGAL.filter(d =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.address.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 7)
    : []

  const selectDestination = (dest: Destination) => {
    setSelectedDest(dest)
    setSearchQuery(dest.name)
    setSearchOpen(false)
    const km = haversineDistance(14.7167, -17.2833, dest.lat, dest.lng)
    const price = calculatePrice(km, service)
    const eta = calculateETA(km)
    setPriceInfo({ price, km, eta })
  }

  const commander = () => {
    if (!selectedDest) return
    setScreen('searching')
    setTimeout(() => {
      setScreen('active-ride')
      setRideStatus('accepted')
      setEtaSeconds(180)
      const interval = setInterval(() => {
        setEtaSeconds(prev => {
          if (prev <= 1) { clearInterval(interval); setRideStatus('completed'); return 0 }
          if (prev === 120) setRideStatus('en_route')
          if (prev === 60) setRideStatus('in_progress')
          return prev - 1
        })
      }, 1000)
    }, 3500)
  }

  const toggleOnline = () => {
    const newVal = !isOnline
    setIsOnline(newVal)
    if (newVal) {
      setTimeout(() => {
        const dest = DESTINATIONS_SENEGAL[Math.floor(Math.random() * 5)]
        const km = 3 + Math.random() * 8
        const price = calculatePrice(km, 'moto')
        setRideRequest({ toAddress: dest.name, price, commission: calculateCommission(price), km: Math.round(km * 10) / 10 })
        setReqTimer(30)
        const interval = setInterval(() => {
          setReqTimer(prev => {
            if (prev <= 1) { clearInterval(interval); setRideRequest(null); return 0 }
            return prev - 1
          })
        }, 1000)
      }, 3000)
    } else {
      setRideRequest(null)
    }
  }

  const acceptRide = () => {
    if (!rideRequest) return
    setDriverStats(prev => ({ courses: prev.courses + 1, gains: prev.gains + rideRequest.price - rideRequest.commission }))
    setDriverHistory(prev => [{ id: Date.now().toString(), dest: rideRequest.toAddress, price: rideRequest.price, date: "À l'instant", pay: 'Cash', rating: 5 }, ...prev])
    setRideRequest(null)
  }

  const statusSteps = [
    { key: 'accepted', label: 'Accepté' },
    { key: 'en_route', label: 'En route' },
    { key: 'in_progress', label: 'En course' },
    { key: 'completed', label: 'Terminé' },
  ]
  const currentStepIdx = statusSteps.findIndex(s => s.key === rideStatus)
  const etaDisplay = etaSeconds > 60 ? `${Math.ceil(etaSeconds / 60)} min` : etaSeconds > 0 ? `${etaSeconds}s` : 'Arrivé !'

  const navTo = (tab: 'home' | 'history' | 'profile') => {
    setActiveTab(tab)
    setScreen(tab === 'home' ? 'home' : tab === 'history' ? 'history' : 'profile')
  }

  const switchMode = (m: 'client' | 'driver') => {
    setMode(m)
    if (m === 'driver') setScreen('driver')
    else { setScreen('home'); setActiveTab('home') }
  }

  if (screen === 'splash') {
    return (
      <div className="fixed inset-0 bg-green-800 flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <div className="text-7xl font-black text-white tracking-widest mb-1">
            TIAK<span className="text-green-300"> TIAK</span>
          </div>
          <p className="text-green-200 text-sm tracking-widest uppercase">Moto Taxi Sénégal</p>
        </div>
        <div className="w-32 h-1 bg-green-900 rounded-full overflow-hidden">
          <div className="h-full bg-green-300 rounded-full animate-pulse" style={{ width: '100%' }} />
        </div>
        <p className="text-green-400 text-xs absolute bottom-10">Le Tiak Tiak de ta génération</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 overflow-hidden">

      {screen === 'home' && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="text-2xl font-black text-green-800 tracking-wider">
              TIAK<span className="text-green-500"> TIAK</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => switchMode('client')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'client' ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-500'}`}>🧑 Client</button>
              <button onClick={() => switchMode('driver')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'driver' ? 'bg-green-800 text-white' : 'bg-gray-100 text-gray-500'}`}>🛵 Chauffeur</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div>
              <p className="text-gray-500 text-sm">Bonjour 👋</p>
              <h1 className="text-xl font-black text-gray-900">Omar Ngalla</h1>
            </div>

            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              <span className="text-green-800 text-xs font-semibold">{userLocation}</span>
            </div>

            <div className="w-full h-44 rounded-2xl overflow-hidden border border-gray-100">
              <iframe
                src="https://www.openstreetmap.org/export/embed.html?bbox=-17.50,14.65,-17.40,14.75&layer=mapnik"
                className="w-full h-full border-0"
                style={{ filter: 'saturate(0.5) brightness(1.1) hue-rotate(60deg)' }}
              />
            </div>

            <p className="text-sm font-semibold text-green-800">🛵 4 motos disponibles près de vous</p>

            <div className="grid grid-cols-2 gap-3">
              {(['moto', 'livraison'] as Service[]).map(s => (
                <button key={s} onClick={() => setService(s)}
                  className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 transition-all text-left ${service === s ? 'border-green-700 bg-green-50' : 'border-gray-100 bg-white'}`}>
                  <span className="text-2xl">{s === 'moto' ? '🛵' : '📦'}</span>
                  <div>
                    <p className={`text-sm font-bold ${service === s ? 'text-green-800' : 'text-gray-900'}`}>{s === 'moto' ? 'Moto Course' : 'Livraison'}</p>
                    <p className="text-xs text-gray-400">{s === 'moto' ? 'Déplacement rapide' : 'Colis & courses'}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="bg-white border-2 border-gray-100 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Départ</p>
                <p className="text-sm font-semibold text-gray-900">{userLocation}</p>
              </div>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Destination au Sénégal..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                className="w-full pl-9 pr-4 py-3.5 bg-white border-2 border-gray-100 rounded-2xl text-sm text-gray-900 placeholder-gray-300 focus:border-green-600 outline-none transition-colors"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSelectedDest(null); setPriceInfo(null) }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300">
                  <X size={16} />
                </button>
              )}
              {searchOpen && filteredDests.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
                  {filteredDests.map((d, i) => (
                    <button key={i} onClick={() => selectDestination(d)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-green-50 transition-colors text-left">
                      <MapPin size={16} className="text-green-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                        <p className="text-xs text-gray-400">{d.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {priceInfo && (
              <div className="bg-white border-2 border-green-100 rounded-2xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-gray-500">Distance</span>
                  <span className="text-sm font-bold">{formatDistance(priceInfo.km)}</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-xs text-gray-500">Durée estimée</span>
                  <span className="text-sm font-bold">{formatETA(priceInfo.eta)}</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-900">Prix estimé</span>
                  <span className="text-xl font-black text-green-700">{formatPrice(priceInfo.price)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'wave', 'orange'] as PayMethod[]).map(p => (
                <button key={p} onClick={() => setPayment(p)}
                  className={`py-3 rounded-2xl border-2 text-center transition-all ${payment === p ? 'border-green-700 bg-green-50' : 'border-gray-100 bg-white'}`}>
                  <span className="block text-lg mb-1">{p === 'cash' ? '💵' : p === 'wave' ? '📱' : '🟠'}</span>
                  <span className={`text-xs font-bold ${payment === p ? 'text-green-800' : 'text-gray-500'}`}>{p === 'cash' ? 'Cash' : p === 'wave' ? 'Wave' : 'Orange'}</span>
                </button>
              ))}
            </div>

            <div className="pb-4">
              <button onClick={commander} disabled={!selectedDest}
                className={`w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all ${selectedDest ? 'bg-green-800 text-white shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                <Navigation size={18} />
                Commander un TIAK TIAK
              </button>
            </div>
          </div>

          <BottomNav active={activeTab} onNav={navTo} />
        </div>
      )}

      {screen === 'searching' && (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-white px-6">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100 border-t-green-700 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-4xl">🛵</div>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-black text-gray-900 mb-1">Recherche d&apos;un chauffeur</h2>
            <p className="text-gray-500 text-sm">Vers {selectedDest?.name}</p>
          </div>
          <button onClick={() => setScreen('home')} className="px-8 py-3 rounded-full border-2 border-gray-200 text-gray-500 text-sm font-semibold">Annuler</button>
        </div>
      )}

      {screen === 'active-ride' && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="h-48 relative flex-shrink-0">
            <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=-17.50,14.65,-17.40,14.75&layer=mapnik" className="w-full h-full border-0" style={{ filter: 'saturate(0.5) hue-rotate(60deg)' }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50 pointer-events-none" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="-mt-4 relative z-10">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 border-2 border-green-600 flex items-center justify-center text-2xl flex-shrink-0">🧑</div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{MOCK_DRIVER.name}</p>
                    <p className="text-xs text-gray-500">{MOCK_DRIVER.vehicle} • {MOCK_DRIVER.plate}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star size={12} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-xs text-gray-600">{MOCK_DRIVER.rating} ({MOCK_DRIVER.reviews} courses)</span>
                    </div>
                  </div>
                  <a href={`tel:${MOCK_DRIVER.phone}`} className="w-10 h-10 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                    <Phone size={18} className="text-green-700" />
                  </a>
                </div>

                <div className="relative mb-4">
                  <div className="absolute top-3.5 left-3.5 right-3.5 h-0.5 bg-gray-100" />
                  <div className="absolute top-3.5 left-3.5 h-0.5 bg-green-600 transition-all duration-700" style={{ width: `${(currentStepIdx / 3) * 100}%` }} />
                  <div className="relative flex justify-between">
                    {statusSteps.map((step, i) => (
                      <div key={step.key} className="flex flex-col items-center gap-1.5">
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 transition-all ${i < currentStepIdx ? 'bg-green-600 border-green-600 text-white' : i === currentStepIdx ? 'bg-white border-green-600 text-green-700' : 'bg-white border-gray-200 text-gray-300'}`}>
                          {i < currentStepIdx ? '✓' : i === 0 ? '✓' : i === 1 ? '🛵' : i === 2 ? '↗' : '🏁'}
                        </div>
                        <span className="text-[10px] text-gray-400 w-14 text-center leading-tight">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500">Arrivée estimée</p>
                    <p className="text-xl font-black text-green-800">{etaDisplay}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Prix</p>
                    <p className="text-xl font-black text-green-800">{formatPrice(priceInfo?.price || 0)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><MapPin size={16} className="text-green-700" /></div>
                <div><p className="text-xs text-gray-400">Départ</p><p className="text-sm font-semibold">{userLocation}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><Navigation size={16} className="text-green-700" /></div>
                <div><p className="text-xs text-gray-400">Destination</p><p className="text-sm font-semibold">{selectedDest?.name}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {screen === 'driver' && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="bg-green-800 px-4 py-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="text-2xl font-black text-white tracking-wider">TIAK<span className="text-green-300"> TIAK</span></div>
              <button onClick={() => switchMode('client')} className="text-green-300 text-sm font-semibold">← Client</button>
            </div>
            <div className="flex items-center justify-between bg-green-900 rounded-2xl p-3">
              <div>
                <p className="text-white font-bold text-sm">{isOnline ? '🟢 En ligne' : '🔴 Hors ligne'}</p>
                <p className="text-green-400 text-xs">{isOnline ? 'Vous recevez des courses' : 'Activez pour recevoir'}</p>
              </div>
              <button onClick={toggleOnline} className={`w-14 h-7 rounded-full relative transition-all duration-300 ${isOnline ? 'bg-green-400' : 'bg-green-950'}`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-300 ${isOnline ? 'left-7' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-gray-100 flex-shrink-0 bg-white">
            {[{ val: driverStats.courses, label: 'Courses' }, { val: driverStats.gains.toLocaleString('fr-FR'), label: 'FCFA aujourd\'hui' }, { val: '4.9', label: 'Ma note ⭐' }].map((s, i) => (
              <div key={i} className="py-4 text-center border-r border-gray-100 last:border-0">
                <p className="text-xl font-black text-green-800">{s.val}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {rideRequest && (
            <div className="mx-4 mt-4 flex-shrink-0">
              <div className="bg-white border-2 border-green-600 rounded-2xl overflow-hidden shadow-lg">
                <div className="bg-green-600 px-4 py-2.5 flex justify-between items-center">
                  <div className="flex items-center gap-2"><Zap size={16} className="text-white" /><span className="text-white text-sm font-bold">Nouvelle course !</span></div>
                  <span className="text-white font-black text-xl">{reqTimer}s</span>
                </div>
                <div className="p-4">
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-600" /><span className="text-sm text-gray-900">Commune de Rufisque Est</span></div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-sm text-gray-900">{rideRequest.toAddress}</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[{ val: `${rideRequest.km} km`, label: 'Distance' }, { val: formatPrice(rideRequest.price), label: 'Prix course' }, { val: formatPrice(rideRequest.price - rideRequest.commission), label: 'Vous recevez' }].map((m, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className={`text-sm font-black ${i === 2 ? 'text-green-700' : 'text-gray-900'}`}>{m.val}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{m.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setRideRequest(null)} className="py-3 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-bold">✕ Refuser</button>
                    <button onClick={acceptRide} className="py-3 rounded-xl bg-green-700 text-white text-sm font-bold">✓ Accepter</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Courses aujourd&apos;hui</p>
            {driverHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><span className="text-4xl block mb-3">🛵</span><p className="text-sm">Passez en ligne pour recevoir des courses</p></div>
            ) : (
              <div className="space-y-2">
                {driverHistory.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-3.5">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold">{r.dest}</p>
                      <p className="text-sm font-black text-green-700">{formatPrice(r.price)}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{r.date} • Commission: {formatPrice(calculateCommission(r.price))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'history' && (
        <div className="flex flex-col h-full">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
            <div className="text-2xl font-black text-green-800 tracking-wider">TIAK<span className="text-green-500"> TIAK</span></div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Mes courses récentes</p>
            <div className="space-y-2">
              {MOCK_HISTORY.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-bold text-gray-900">🎯 {r.dest}</p>
                    <p className="text-sm font-black text-green-700">{formatPrice(r.price)}</p>
                  </div>
                  <p className="text-xs text-gray-400">{r.date} • {r.pay} • {'★'.repeat(r.rating)}</p>
                </div>
              ))}
            </div>
          </div>
          <BottomNav active={activeTab} onNav={navTo} />
        </div>
      )}

      {screen === 'profile' && (
        <div className="flex flex-col h-full">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
            <div className="text-2xl font-black text-green-800 tracking-wider">TIAK<span className="text-green-500"> TIAK</span></div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="flex flex-col items-center mb-6 pb-6 border-b border-gray-100">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl mb-3">👤</div>
              <h2 className="text-xl font-black text-gray-900">Omar Ngalla</h2>
              <p className="text-gray-400 text-sm mt-0.5">+221 77 XXX XX XX</p>
            </div>
            {[
              { icon: '🛵', title: 'Mes courses', sub: 'Historique complet' },
              { icon: '💳', title: 'Paiement', sub: 'Wave, Orange Money, Cash' },
              { icon: '🔔', title: 'Notifications', sub: 'Activées' },
              { icon: '🇸🇳', title: 'À propos', sub: 'Le Tiak Tiak de ta génération' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5 border-b border-gray-50 cursor-pointer">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
                <span className="text-gray-300 text-lg">›</span>
              </div>
            ))}
          </div>
          <BottomNav active={activeTab} onNav={navTo} />
        </div>
      )}
    </div>
  )
}

function BottomNav({ active, onNav }: { active: 'home' | 'history' | 'profile', onNav: (tab: 'home' | 'history' | 'profile') => void }) {
  return (
    <div className="bg-white border-t border-gray-100 flex flex-shrink-0">
      {([{ key: 'home', icon: Home, label: 'Commander' }, { key: 'history', icon: List, label: 'Courses' }, { key: 'profile', icon: User, label: 'Profil' }] as const).map(({ key, icon: Icon, label }) => (
        <button key={key} onClick={() => onNav(key)} className="flex-1 py-3 flex flex-col items-center gap-1">
          <Icon size={22} className={active === key ? 'text-green-700' : 'text-gray-300'} />
          <span className={`text-[10px] font-semibold ${active === key ? 'text-green-700' : 'text-gray-300'}`}>{label}</span>
        </button>
      ))}
    </div>
  )
}