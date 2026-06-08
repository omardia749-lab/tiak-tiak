'use client'

import { useState, useEffect, useRef } from 'react'
import { Menu, User, ChevronRight, ChevronDown, Home, List, Search, X, MapPin, ArrowLeft, LogOut, Navigation, Zap, Phone, Gift, HelpCircle, Info, Share2, MessageCircle, CreditCard, Check, Settings, Globe, Bell, Shield, FileText, Clock, XCircle, Power } from 'lucide-react'
import { searchPlaces, Place } from '../lib/search'
import { calculatePrice, formatPrice, formatDistance, calculateETA, formatETA, haversineDistance } from '../lib/utils'
import { CONDITIONS_UTILISATION, POLITIQUE_CONFIDENTIALITE } from '../lib/legal'
import { supabase } from '../lib/supabase'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('./components/MapView'), { ssr: false })

interface AppUser {
  id?: string
  role: 'client' | 'chauffeur' | 'admin'
  name: string
  phone: string
}

interface GpsPosition {
  lat: number
  lng: number
  address: string
}

interface Ride {
  id: string
  created_at: string
  service_type: string
  from_address: string
  to_address: string
  from_lat: number
  from_lng: number
  to_lat: number
  to_lng: number
  distance_km: number
  price: number
  status: string
  cancel_reason?: string
  driver_id?: string
  client_id?: string
}

const SUPPORT_WHATSAPP = 'https://wa.me/221770970100?text=' + encodeURIComponent("Bonjour TIAK TIAK Support, j'ai besoin d'aide.")
const DEFAULT_POS: GpsPosition = { lat: 14.7167, lng: -17.2833, address: 'Rufisque, Dakar' }

const CANCEL_REASONS = [
  "J'ai trouvé un autre moyen de transport",
  "Le chauffeur tarde trop",
  "J'ai fait une erreur de destination",
  "Problème personnel",
  "Autre raison",
]

// ===== SON TIAK TIAK =====
const playTiakTiakSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notes = [523, 659, 523, 659, 784]
    const times = [0, 0.15, 0.35, 0.5, 0.7]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime + times[i])
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + times[i] + 0.05)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + times[i] + 0.2)
      osc.start(ctx.currentTime + times[i])
      osc.stop(ctx.currentTime + times[i] + 0.25)
    })
  } catch {}
}

export default function TiakTiak() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [authScreen, setAuthScreen] = useState('roles')
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [loaded, setLoaded] = useState(false)

  const [gpsAsked, setGpsAsked] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [position, setPosition] = useState<GpsPosition>(DEFAULT_POS)

  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formMoto, setFormMoto] = useState('')
  const [formColor, setFormColor] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [service, setService] = useState('moto')
  const [screen, setScreen] = useState('accueil')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const [payment, setPayment] = useState('cash')
  const [faqOpen, setFaqOpen] = useState<number | null>(null)
  const [lang, setLang] = useState('fr')
  const [notif, setNotif] = useState(true)
  const [commandLoading, setCommandLoading] = useState(false)
  const [currentRideId, setCurrentRideId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [rides, setRides] = useState<Ride[]>([])
  const [ridesLoading, setRidesLoading] = useState(false)

  // Chauffeur
  const [isOnline, setIsOnline] = useState(false)
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null)
  const [currentDriverRide, setCurrentDriverRide] = useState<Ride | null>(null)
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [driverPosition, setDriverPosition] = useState<GpsPosition>(DEFAULT_POS)

  // Client — suivi chauffeur
  const [currentClientRide, setCurrentClientRide] = useState<Ride | null>(null)
  const [driverLat, setDriverLat] = useState<number | null>(null)
  const [driverLng, setDriverLng] = useState<number | null>(null)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')

  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const rideChannelRef = useRef<any>(null)

  useEffect(() => {
    const saved = localStorage.getItem('tiaktiak_user')
    if (saved) setUser(JSON.parse(saved))
    const savedLang = localStorage.getItem('tiaktiak_lang')
    if (savedLang) setLang(savedLang)
    const gpsOk = localStorage.getItem('tiaktiak_gps_asked')
    if (gpsOk) setGpsAsked(true)
    setLoaded(true)
  }, [])

  // ===== SUIVI GPS CHAUFFEUR EN TEMPS REEL =====
  useEffect(() => {
    if (!user || user.role !== 'chauffeur' || !isOnline) {
      if (gpsWatchRef.current) navigator.geolocation.clearWatch(gpsWatchRef.current)
      return
    }
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setDriverPosition(prev => ({ ...prev, lat: latitude, lng: longitude }))
        if (user.id) {
          await supabase.from('users').update({ current_lat: latitude, current_lng: longitude }).eq('id', user.id)
        }
        // Vérifier si proche de la destination (20m)
        if (currentDriverRide) {
          const dist = haversineDistance(latitude, longitude, currentDriverRide.to_lat, currentDriverRide.to_lng)
          if (dist * 1000 < 20) {
            await terminerCourse()
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => {
      if (gpsWatchRef.current) navigator.geolocation.clearWatch(gpsWatchRef.current)
    }
  }, [isOnline, user, currentDriverRide])

  // ===== REALTIME CHAUFFEUR — écoute nouvelles courses =====
  useEffect(() => {
    if (!user || user.role !== 'chauffeur' || !isOnline) return

    const channel = supabase
      .channel('new-rides')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'rides',
        filter: 'status=eq.pending',
      }, (payload) => {
        if (!currentDriverRide) {
          setIncomingRide(payload.new as Ride)
          playTiakTiakSound()
          if (navigator.vibrate) navigator.vibrate([300, 100, 300])
        }
      })
      .subscribe()

    rideChannelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [isOnline, user, currentDriverRide])

  // ===== REALTIME CLIENT — suivi chauffeur =====
  useEffect(() => {
    if (!currentRideId) return

    const channel = supabase
      .channel('ride-updates-' + currentRideId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rides',
        filter: `id=eq.${currentRideId}`,
      }, async (payload) => {
        const updated = payload.new as Ride
        if (updated.status === 'accepted' && updated.driver_id) {
          setCurrentClientRide(updated)
          // Récupérer infos chauffeur
          const { data } = await supabase.from('users').select('name, phone, current_lat, current_lng').eq('id', updated.driver_id).single()
          if (data) {
            setDriverName(data.name)
            setDriverPhone(data.phone)
            setDriverLat(data.current_lat)
            setDriverLng(data.current_lng)
          }
          setScreen('suivi')
        }
        if (updated.status === 'completed') {
          setScreen('course_terminee')
        }
      })
      .subscribe()

    // Suivi position chauffeur
    const posChannel = supabase
      .channel('driver-pos-' + currentRideId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
      }, (payload) => {
        if (currentClientRide?.driver_id && payload.new.id === currentClientRide.driver_id) {
          setDriverLat(payload.new.current_lat)
          setDriverLng(payload.new.current_lng)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(posChannel)
    }
  }, [currentRideId, currentClientRide])

  const saveUser = (u: AppUser) => {
    localStorage.setItem('tiaktiak_user', JSON.stringify(u))
    setUser(u)
  }

  const changeLang = (code: string) => {
    setLang(code)
    localStorage.setItem('tiaktiak_lang', code)
  }

  const logout = async () => {
    if (user?.id && user.role === 'chauffeur') {
      await supabase.from('users').update({ is_online: false }).eq('id', user.id)
    }
    localStorage.removeItem('tiaktiak_user')
    setUser(null)
    setAuthScreen('roles')
    setAuthMode('signup')
    setMenuOpen(false)
    setScreen('accueil')
    setIsOnline(false)
    setFormName(''); setFormPhone(''); setAdminPass(''); setAuthError('')
  }

  const activerGPS = () => {
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=fr`)
          const data = await res.json()
          const address = data.address?.suburb || data.address?.neighbourhood || data.address?.city || 'Ma position'
          setPosition({ lat: latitude, lng: longitude, address })
        } catch {
          setPosition({ lat: latitude, lng: longitude, address: 'Ma position' })
        }
        localStorage.setItem('tiaktiak_gps_asked', '1')
        setGpsAsked(true)
        setGpsLoading(false)
      },
      () => {
        localStorage.setItem('tiaktiak_gps_asked', '1')
        setGpsAsked(true)
        setGpsLoading(false)
      },
      { timeout: 10000 }
    )
  }

  const passerSansGPS = () => {
    localStorage.setItem('tiaktiak_gps_asked', '1')
    setGpsAsked(true)
  }

  const toggleOnline = async () => {
    if (!user?.id) return
    setOnlineLoading(true)
    const newStatus = !isOnline
    await supabase.from('users').update({ is_online: newStatus }).eq('id', user.id)
    setIsOnline(newStatus)
    setOnlineLoading(false)
  }

  const accepterCourse = async () => {
    if (!incomingRide || !user?.id) return
    setAcceptLoading(true)
    const { data, error } = await supabase
      .from('rides')
      .update({ status: 'accepted', driver_id: user.id, accepted_at: new Date().toISOString() })
      .eq('id', incomingRide.id)
      .eq('status', 'pending')
      .select()
      .single()

    if (error || !data) {
      alert('Course déjà prise par un autre chauffeur ! 🏍️')
      setIncomingRide(null)
    } else {
      setCurrentDriverRide(data as Ride)
      setIncomingRide(null)
      setScreen('driver_course')
    }
    setAcceptLoading(false)
  }

  const refuserCourse = () => {
    setIncomingRide(null)
  }

  const terminerCourse = async () => {
    if (!currentDriverRide?.id) return
    await supabase.from('rides').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', currentDriverRide.id)
    setCurrentDriverRide(null)
    setScreen('chauffeur_accueil')
  }

  const loginClient = async () => {
    if (!formPhone) { setAuthError('Entre ton numero de telephone'); return }
    setAuthLoading(true); setAuthError('')
    try {
      const { data, error } = await supabase.from('users').select('id, name, phone, role').eq('phone', formPhone.trim()).eq('role', 'client').single()
      if (error || !data) { setAuthError('Numero introuvable. Inscris-toi dabord.') }
      else { saveUser({ id: data.id, role: 'client', name: data.name, phone: data.phone }) }
    } catch { setAuthError('Erreur reseau. Verifie ta connexion.') }
    setAuthLoading(false)
  }

  const loginDriver = async () => {
    if (!formPhone) { setAuthError('Entre ton numero de telephone'); return }
    setAuthLoading(true); setAuthError('')
    try {
      const { data, error } = await supabase.from('users').select('id, name, phone, role').eq('phone', formPhone.trim()).eq('role', 'chauffeur').single()
      if (error || !data) { setAuthError('Numero introuvable. Inscris-toi dabord.') }
      else { saveUser({ id: data.id, role: 'chauffeur', name: data.name, phone: data.phone }) }
    } catch { setAuthError('Erreur reseau. Verifie ta connexion.') }
    setAuthLoading(false)
  }

  const signupClient = async () => {
    if (!formName || !formPhone) { setAuthError('Remplis tous les champs'); return }
    setAuthLoading(true); setAuthError('')
    try {
      const { data, error } = await supabase.from('users').insert({ name: formName.trim(), phone: formPhone.trim(), role: 'client' }).select('id').single()
      if (error) {
        if (error.code === '23505') { setAuthError('Ce numero est deja utilise. Connecte-toi.'); setAuthMode('login') }
        else { setAuthError('Erreur de connexion. Reessaie.') }
        setAuthLoading(false); return
      }
      saveUser({ id: data.id, role: 'client', name: formName.trim(), phone: formPhone.trim() })
    } catch { setAuthError('Erreur reseau. Verifie ta connexion.') }
    setAuthLoading(false)
  }

  const signupDriver = async () => {
    if (!formName || !formPhone || !formMoto || !formColor) { setAuthError('Remplis tous les champs'); return }
    setAuthLoading(true); setAuthError('')
    try {
      const { data, error } = await supabase.from('users').insert({ name: formName.trim(), phone: formPhone.trim(), role: 'chauffeur', moto_type: formMoto.trim(), moto_color: formColor.trim() }).select('id').single()
      if (error) {
        if (error.code === '23505') { setAuthError('Ce numero est deja utilise. Connecte-toi.'); setAuthMode('login') }
        else { setAuthError('Erreur de connexion. Reessaie.') }
        setAuthLoading(false); return
      }
      saveUser({ id: data.id, role: 'chauffeur', name: formName.trim(), phone: formPhone.trim() })
    } catch { setAuthError('Erreur reseau. Verifie ta connexion.') }
    setAuthLoading(false)
  }

  const loginAdmin = () => {
    const ADMIN_PASS = (process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '').trim()
    if (adminPass.trim() === ADMIN_PASS) { saveUser({ role: 'admin', name: 'Omar', phone: '' }) }
    else { setAuthError('Mot de passe incorrect') }
  }

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

  const selectPlace = (place: Place) => { setSelected(place); setScreen('confirm') }
  const goTo = (s: string) => { setScreen(s); setMenuOpen(false) }

  const km = selected ? haversineDistance(position.lat, position.lng, selected.lat, selected.lng) : 0
  const price = selected ? calculatePrice(km, service as 'moto' | 'livraison') : 0
  const eta = selected ? calculateETA(km) : 0
  const referralCode = user ? 'TIAK-' + (user.phone.replace(/[^0-9]/g, '').slice(-4) || '0000') : 'TIAK-0000'

  const shareReferral = () => {
    const text = 'Rejoins TIAK TIAK avec mon code ' + referralCode + ' et profite de -50% sur ta premiere course ! https://tiak-tiak-zeta.vercel.app'
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      (navigator as any).share({ title: 'TIAK TIAK', text }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => alert('Lien copie !')).catch(() => {})
    }
  }

  const commanderCourse = async () => {
    if (!selected || !user) return
    setCommandLoading(true)
    try {
      const { data: rideData, error } = await supabase.from('rides').insert({
        client_id: user.id || null,
        service_type: service,
        from_lat: position.lat,
        from_lng: position.lng,
        from_address: position.address,
        to_lat: selected.lat,
        to_lng: selected.lng,
        to_address: selected.name,
        distance_km: Math.round(km * 100) / 100,
        price: price,
        commission: 100,
        payment_method: payment,
        status: 'pending',
      }).select('id').single()
      if (error) { alert('Erreur: ' + JSON.stringify(error)) }
      else { setCurrentRideId(rideData?.id || null); setScreen('attente') }
    } catch { alert('Erreur reseau. Verifie ta connexion.') }
    setCommandLoading(false)
  }

  const confirmerAnnulation = async () => {
    if (!cancelReason) return
    setCancelLoading(true)
    if (currentRideId) {
      await supabase.from('rides').update({ status: 'cancelled', cancel_reason: cancelReason }).eq('id', currentRideId)
    }
    setScreen('accueil')
    setSelected(null)
    setCurrentRideId(null)
    setCancelReason('')
    setCancelLoading(false)
  }

  const loadRides = async () => {
    if (!user?.id) return
    setRidesLoading(true)
    const { data } = await supabase
      .from('rides')
      .select('id, created_at, service_type, from_address, to_address, from_lat, from_lng, to_lat, to_lng, distance_km, price, status, cancel_reason, driver_id, client_id')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setRides(data)
    setRidesLoading(false)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return { text: 'En attente', color: '#F59E0B' }
      case 'accepted': return { text: 'Acceptee', color: '#1DB954' }
      case 'completed': return { text: 'Terminee', color: '#0F5138' }
      case 'cancelled': return { text: 'Annulee', color: '#EF4444' }
      default: return { text: status, color: '#9CA3AF' }
    }
  }

  const languages = [
    { code: 'fr', flag: '🇫🇷', name: 'Francais' },
    { code: 'wo', flag: '🇸🇳', name: 'Wolof' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'ar', flag: '🇸🇦', name: 'Arabe' },
    { code: 'es', flag: '🇪🇸', name: 'Espagnol' },
  ]

  // ===== SPLASH =====
  if (!loaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0F5138' }}>
        <span className="text-3xl font-black italic text-white">TIAK TIAK</span>
      </div>
    )
  }

  // ===== GPS =====
  if (!gpsAsked) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <div className="relative flex items-center justify-center">
            <div className="absolute rounded-full animate-pulse" style={{ background: '#1DB954', opacity: 0.15, width: '140px', height: '140px' }} />
            <div className="relative w-28 h-28 rounded-full flex items-center justify-center" style={{ background: '#0F5138' }}>
              <Navigation size={48} color="white" fill="white" style={{ transform: 'rotate(45deg)' }} />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-black tracking-widest mb-2" style={{ color: '#0F5138' }}>TIAK TIAK</h1>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Activez votre localisation</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Pour trouver les chauffeurs pres de vous et calculer le prix de votre course.</p>
          </div>
          <div className="w-full rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#1DB954' }}><MapPin size={16} color="white" /></div>
              <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>Pourquoi cette autorisation ?</p>
            </div>
            <p className="text-xs text-gray-500 ml-11">Votre position sert uniquement a calculer la distance et le prix. Elle n&apos;est jamais partagee sans votre accord.</p>
          </div>
        </div>
        <div className="px-8 pb-10 space-y-3">
          <button onClick={activerGPS} disabled={gpsLoading} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: gpsLoading ? '#7aaa94' : '#0F5138' }}>
            <Navigation size={20} color="white" />
            {gpsLoading ? 'Localisation en cours...' : 'Activer ma localisation'}
          </button>
          <button onClick={passerSansGPS} className="w-full text-center text-gray-400 text-sm py-2">Continuer sans localisation</button>
        </div>
      </div>
    )
  }

  // ===== NON CONNECTE =====
  if (!user) {
    if (authScreen === 'roles') {
      return (
        <div className="fixed inset-0 flex flex-col bg-white">
          <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
            <div className="relative flex items-center justify-center">
              <div className="absolute rounded-full" style={{ background: '#1DB954', opacity: 0.15, width: '130px', height: '130px' }} />
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: '#0F5138' }}>
                <Navigation size={40} color="white" fill="white" style={{ transform: 'rotate(45deg)' }} />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-black tracking-widest" style={{ color: '#0F5138' }}>TIAK TIAK</h1>
              <p className="text-gray-400 text-sm mt-3 leading-relaxed">Transport moto rapide<br />a votre service</p>
            </div>
          </div>
          <div className="px-8 pb-10 space-y-3">
            <button onClick={() => { setAuthScreen('client'); setAuthMode('signup'); setAuthError(''); setFormName(''); setFormPhone('') }} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#0F5138' }}>
              <User size={20} /> Je suis un Client
            </button>
            <button onClick={() => { setAuthScreen('chauffeur'); setAuthMode('signup'); setAuthError(''); setFormName(''); setFormPhone(''); setFormMoto(''); setFormColor('') }} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#111111' }}>
              <Zap size={20} color="#1DB954" /> Je suis un Chauffeur
            </button>
            <button onClick={() => { setAuthScreen('admin'); setAuthError('') }} className="w-full text-center text-gray-400 text-sm pt-2">Acces administrateur</button>
          </div>
        </div>
      )
    }

    if (authScreen === 'client') {
      return (
        <div className="fixed inset-0 flex flex-col bg-white">
          <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
            <button onClick={() => setAuthScreen('roles')}><ArrowLeft size={24} color="#0F5138" /></button>
            <span className="font-bold text-black">{authMode === 'signup' ? 'Inscription Client' : 'Connexion Client'}</span>
          </header>
          <div className="px-6 pt-5">
            <div className="flex bg-gray-100 rounded-2xl p-1">
              <button onClick={() => { setAuthMode('signup'); setAuthError('') }} className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all" style={{ background: authMode === 'signup' ? '#0F5138' : 'transparent', color: authMode === 'signup' ? 'white' : '#9CA3AF' }}>S&apos;inscrire</button>
              <button onClick={() => { setAuthMode('login'); setAuthError('') }} className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all" style={{ background: authMode === 'login' ? '#0F5138' : 'transparent', color: authMode === 'login' ? 'white' : '#9CA3AF' }}>Se connecter</button>
            </div>
          </div>
          <div className="flex-1 p-6 space-y-4">
            <div className="text-center mb-2"><span className="text-5xl">🧑</span></div>
            {authMode === 'signup' && (
              <div>
                <label className="text-sm font-semibold text-gray-600">Nom complet</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Omar Ngalla" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-gray-600">Numero de telephone</label>
              <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Ex: 77 097 01 00" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
            </div>
            {authMode === 'login' && <p className="text-xs text-gray-400 text-center">Entre le numero avec lequel tu t&apos;es inscrit</p>}
            {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
          </div>
          <div className="p-4 border-t border-gray-100">
            <button onClick={authMode === 'signup' ? signupClient : loginClient} disabled={authLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: authLoading ? '#7aaa94' : '#0F5138' }}>
              {authLoading ? 'Chargement...' : authMode === 'signup' ? 'Creer mon compte' : 'Se connecter'}
            </button>
          </div>
        </div>
      )
    }

    if (authScreen === 'chauffeur') {
      return (
        <div className="fixed inset-0 flex flex-col bg-white">
          <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
            <button onClick={() => setAuthScreen('roles')}><ArrowLeft size={24} color="#0F5138" /></button>
            <span className="font-bold text-black">{authMode === 'signup' ? 'Inscription Chauffeur' : 'Connexion Chauffeur'}</span>
          </header>
          <div className="px-6 pt-5">
            <div className="flex bg-gray-100 rounded-2xl p-1">
              <button onClick={() => { setAuthMode('signup'); setAuthError('') }} className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all" style={{ background: authMode === 'signup' ? '#111111' : 'transparent', color: authMode === 'signup' ? 'white' : '#9CA3AF' }}>S&apos;inscrire</button>
              <button onClick={() => { setAuthMode('login'); setAuthError('') }} className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all" style={{ background: authMode === 'login' ? '#111111' : 'transparent', color: authMode === 'login' ? 'white' : '#9CA3AF' }}>Se connecter</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="text-center mb-2"><span className="text-5xl">🛵</span></div>
            {authMode === 'login' ? (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Numero de telephone</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Ex: 77 123 45 67" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
                </div>
                <p className="text-xs text-gray-400 text-center">Entre le numero avec lequel tu t&apos;es inscrit</p>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Nom complet</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Moussa Diallo" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Numero de telephone</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Ex: 77 123 45 67" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Type de moto</label>
                  <input value={formMoto} onChange={e => setFormMoto(e.target.value)} placeholder="Ex: Jakarta 125cc" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Couleur de la moto</label>
                  <input value={formColor} onChange={e => setFormColor(e.target.value)} placeholder="Ex: Rouge" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
                </div>
                <div className="rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
                  <p className="font-bold text-sm mb-2" style={{ color: '#0F5138' }}>📋 Regles de commission</p>
                  <p className="text-xs text-gray-600 mb-1">• Commission de 100 FCFA par course</p>
                  <p className="text-xs text-gray-600 mb-1">• Paiement obligatoire avant 23h59 chaque jour</p>
                  <p className="text-xs text-gray-600 mb-1">• Paiement via Wave ou Orange Money au 77 097 01 00</p>
                  <p className="text-xs text-gray-600 mt-2 font-semibold">En cas de non-paiement :</p>
                  <p className="text-xs text-gray-600">1er manquement → Avertissement</p>
                  <p className="text-xs text-gray-600">2eme → Suspension 14 jours</p>
                  <p className="text-xs text-gray-600">3eme → Exclusion definitive</p>
                </div>
              </>
            )}
            {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
          </div>
          <div className="p-4 border-t border-gray-100">
            <button onClick={authMode === 'signup' ? signupDriver : loginDriver} disabled={authLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: authLoading ? '#7aaa94' : '#111111' }}>
              {authLoading ? 'Chargement...' : authMode === 'signup' ? "J'accepte et je rejoins TIAK TIAK" : 'Se connecter'}
            </button>
          </div>
        </div>
      )
    }

    if (authScreen === 'admin') {
      return (
        <div className="fixed inset-0 flex flex-col bg-white">
          <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
            <button onClick={() => setAuthScreen('roles')}><ArrowLeft size={24} color="#0F5138" /></button>
            <span className="font-bold text-black">Connexion Admin</span>
          </header>
          <div className="flex-1 p-6 space-y-4">
            <div className="text-center mb-4"><span className="text-5xl">👑</span></div>
            <div>
              <label className="text-sm font-semibold text-gray-600">Mot de passe admin</label>
              <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Entre ton mot de passe" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" />
            </div>
            {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
          </div>
          <div className="p-4 border-t border-gray-100">
            <button onClick={loginAdmin} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>Acceder au dashboard</button>
          </div>
        </div>
      )
    }
  }

  // ===== ADMIN =====
  if (user && user.role === 'admin') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <span className="text-xl font-black italic" style={{ color: '#0F5138' }}>TIAK TIAK Admin</span>
          <button onClick={logout} className="flex items-center gap-1 text-red-500 text-sm font-semibold"><LogOut size={18} /> Deconnexion</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h2 className="text-lg font-bold">Bonjour Omar 👑</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>0</p><p className="text-xs text-gray-400">Courses aujourd&apos;hui</p></div>
            <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>0</p><p className="text-xs text-gray-400">Chauffeurs actifs</p></div>
            <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>0 F</p><p className="text-xs text-gray-400">Commissions du jour</p></div>
            <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>0</p><p className="text-xs text-gray-400">Clients inscrits</p></div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-sm mb-1">Numero commission</p>
            <p className="text-sm text-gray-500">Wave / Orange : 77 097 01 00</p>
          </div>
        </div>
      </div>
    )
  }

  // ===== CHAUFFEUR : DASHBOARD =====
  if (user && user.role === 'chauffeur') {

    // Notification course entrante
    if (incomingRide) {
      return (
        <div className="fixed inset-0 flex flex-col" style={{ background: '#0F5138' }}>
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
            <div className="relative flex items-center justify-center">
              <div className="absolute rounded-full" style={{ width: '140px', height: '140px', background: 'rgba(29,185,84,0.2)', animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
              <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <span className="text-5xl">🛵</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-green-200 text-sm font-semibold mb-1">NOUVELLE COURSE !</p>
              <h2 className="text-2xl font-black text-white mb-1">{formatPrice(incomingRide.price)}</h2>
              <p className="text-green-200 text-sm">{incomingRide.distance_km} km • {incomingRide.service_type === 'moto' ? 'Moto-taxi' : 'Livraison'}</p>
            </div>
            <div className="w-full rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                <div><p className="text-green-200 text-xs">Prise en charge</p><p className="text-white text-sm font-semibold">{incomingRide.from_address}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-400" />
                <div><p className="text-green-200 text-xs">Destination</p><p className="text-white text-sm font-semibold">{incomingRide.to_address}</p></div>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.2}s`, opacity: 0.7 }} />
              ))}
            </div>
          </div>
          <div className="p-6 space-y-3">
            <button onClick={accepterCourse} disabled={acceptLoading} className="w-full py-4 rounded-2xl font-black text-lg" style={{ background: '#1DB954', color: '#0F5138' }}>
              {acceptLoading ? 'Acceptation...' : '✅ Accepter la course'}
            </button>
            <button onClick={refuserCourse} className="w-full py-4 rounded-2xl font-bold text-white border-2" style={{ borderColor: 'rgba(255,255,255,0.3)' }}>
              ❌ Refuser
            </button>
          </div>
        </div>
      )
    }

    // Écran de course en cours (chauffeur)
    if (screen === 'driver_course' && currentDriverRide) {
      return (
        <div className="fixed inset-0 flex flex-col bg-gray-100">
          <header className="px-4 py-4 flex items-center justify-between" style={{ background: '#0F5138' }}>
            <span className="text-xl font-black italic text-white">Course en cours</span>
            <span className="text-green-200 text-sm font-bold">{formatPrice(currentDriverRide.price)}</span>
          </header>
          <div className="flex-1 overflow-y-auto">
            <div className="h-64 relative">
              <MapView
                fromLat={driverPosition.lat}
                fromLng={driverPosition.lng}
                toLat={currentDriverRide.to_lat}
                toLng={currentDriverRide.to_lng}
              />
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                  <div><p className="text-xs text-gray-400">Ta position</p><p className="text-sm font-semibold">{driverPosition.address || 'En route...'}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-500" />
                  <div><p className="text-xs text-gray-400">Destination client</p><p className="text-sm font-semibold">{currentDriverRide.to_address}</p></div>
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
                <p className="text-xs text-gray-500 mb-1">La course se terminera automatiquement à 20m de la destination.</p>
                <p className="font-bold text-sm" style={{ color: '#0F5138' }}>Commission due : 100 FCFA</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white border-t border-gray-100">
            <button onClick={terminerCourse} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>
              Terminer la course manuellement
            </button>
          </div>
        </div>
      )
    }

    // Dashboard principal chauffeur
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="px-4 py-4 flex items-center justify-between" style={{ background: '#0F5138' }}>
          <span className="text-xl font-black italic text-white">TIAK TIAK</span>
          <button onClick={logout} className="flex items-center gap-1 text-green-200 text-sm font-semibold"><LogOut size={18} /> Quitter</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-lg font-bold">Bonjour {user.name} 🛵</h2>

          {/* Toggle En ligne */}
          <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-bold text-base">{isOnline ? 'En ligne' : 'Hors ligne'}</p>
              <p className="text-xs text-gray-400 mt-0.5">{isOnline ? 'Tu recois les courses' : 'Active pour recevoir des courses'}</p>
            </div>
            <button
              onClick={toggleOnline}
              disabled={onlineLoading}
              className="w-16 h-8 rounded-full relative transition-all flex items-center"
              style={{ background: isOnline ? '#1DB954' : '#D1D5DB' }}
            >
              <div className="absolute w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: isOnline ? '34px' : '2px' }} />
            </button>
          </div>

          {isOnline ? (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#1DB954' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>En attente de courses...</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center py-10">
              <Power size={40} color="#D1D5DB" className="mx-auto mb-3" />
              <p className="text-sm text-gray-400">Active le toggle pour commencer a recevoir des courses</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== CLIENT : SUIVI CHAUFFEUR EN TEMPS REEL =====
  if (screen === 'suivi' && currentClientRide) {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <span className="font-bold text-black flex-1">Chauffeur en route 🛵</span>
          <a href={`tel:+221${driverPhone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-sm font-bold" style={{ color: '#0F5138' }}>
            <Phone size={18} /> Appeler
          </a>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="h-64 relative">
            <MapView
              fromLat={driverLat || position.lat}
              fromLng={driverLng || position.lng}
              toLat={currentClientRide.to_lat}
              toLng={currentClientRide.to_lng}
            />
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#0F5138' }}>
                <span className="text-2xl">🛵</span>
              </div>
              <div className="flex-1">
                <p className="font-black text-base">{driverName}</p>
                <p className="text-sm text-gray-400">{driverPhone}</p>
              </div>
              <a href={`tel:+221${driverPhone.replace(/\s/g, '')}`} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#E8F5E9' }}>
                <Phone size={18} color="#0F5138" />
              </a>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                <p className="text-sm text-gray-600">{position.address}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-400" />
                <p className="text-sm text-gray-600">{currentClientRide.to_address}</p>
              </div>
            </div>
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#1DB954' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>Le chauffeur se dirige vers toi...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== CLIENT : COURSE TERMINEE =====
  if (screen === 'course_terminee') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-6" style={{ background: '#0F5138' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <Check size={48} color="white" />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-black text-white mb-2">Course terminée !</h2>
          <p className="text-green-200 text-sm">Merci d&apos;avoir utilise TIAK TIAK 🙏</p>
        </div>
        <button onClick={() => { setScreen('accueil'); setCurrentClientRide(null); setCurrentRideId(null) }} className="w-full py-4 rounded-2xl font-bold text-lg" style={{ background: '#1DB954', color: '#0F5138' }}>
          Retour a l&apos;accueil
        </button>
      </div>
    )
  }

  // ===== CLIENT : ATTENTE CHAUFFEUR =====
  if (screen === 'attente') {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: '#0F5138' }}>
        <header className="px-4 py-4 flex items-center justify-between">
          <span className="text-xl font-black italic text-white">TIAK TIAK</span>
          <button onClick={() => setScreen('annulation')} className="text-green-200 text-sm font-semibold">Annuler</button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
          <div className="relative flex items-center justify-center">
            <div className="absolute rounded-full" style={{ width: '160px', height: '160px', background: 'rgba(29,185,84,0.15)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
            <div className="absolute rounded-full" style={{ width: '120px', height: '120px', background: 'rgba(29,185,84,0.2)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.5s' }} />
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <span className="text-5xl">🛵</span>
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black text-white mb-2">Recherche en cours...</h2>
            <p className="text-green-200 text-sm">Nous cherchons le chauffeur le plus proche de toi</p>
          </div>
          {selected && (
            <div className="w-full rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                <div><p className="text-green-200 text-xs">Depart</p><p className="text-white text-sm font-semibold">{position.address}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-400" />
                <div><p className="text-green-200 text-xs">Destination</p><p className="text-white text-sm font-semibold">{selected.name}</p></div>
              </div>
              <div className="border-t border-white border-opacity-20 pt-3 flex justify-between">
                <span className="text-green-200 text-sm">Prix</span>
                <span className="text-white font-black text-lg">{formatPrice(price)}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-3 h-3 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.2}s`, opacity: 0.8 }} />
            ))}
          </div>
        </div>
        <div className="p-6">
          <button onClick={() => setScreen('annulation')} className="w-full py-4 rounded-2xl font-bold text-white border-2" style={{ borderColor: 'rgba(255,255,255,0.3)' }}>
            Annuler la course
          </button>
        </div>
      </div>
    )
  }

  // ===== CLIENT : MOTIF D'ANNULATION =====
  if (screen === 'annulation') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('attente')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Motif d&apos;annulation</span>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="text-center mb-2">
            <XCircle size={48} color="#EF4444" className="mx-auto mb-3" />
            <p className="font-bold text-gray-800">Pourquoi veux-tu annuler ?</p>
            <p className="text-sm text-gray-400 mt-1">Aide-nous a ameliorer notre service</p>
          </div>
          <div className="space-y-3">
            {CANCEL_REASONS.map((reason) => (
              <button key={reason} onClick={() => setCancelReason(reason)} className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all" style={{ borderColor: cancelReason === reason ? '#1DB954' : '#F3F4F6', background: cancelReason === reason ? '#E8F5E9' : 'white' }}>
                <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: cancelReason === reason ? '#1DB954' : '#D1D5DB', background: cancelReason === reason ? '#1DB954' : 'white' }}>
                  {cancelReason === reason && <Check size={14} color="white" />}
                </div>
                <span className="text-sm font-medium text-gray-700">{reason}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 space-y-2">
          <button onClick={confirmerAnnulation} disabled={!cancelReason || cancelLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: !cancelReason || cancelLoading ? '#D1D5DB' : '#EF4444' }}>
            {cancelLoading ? 'Annulation...' : "Confirmer l'annulation"}
          </button>
          <button onClick={() => setScreen('attente')} className="w-full py-3 text-sm text-gray-400 font-medium">Retour — continuer a attendre</button>
        </div>
      </div>
    )
  }

  // ===== CLIENT : RECHERCHE =====
  if (screen === 'recherche') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => { setScreen('accueil'); setQuery(''); setResults([]) }}><ArrowLeft size={24} color="#0F5138" /></button>
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2.5">
            <Search size={18} className="text-gray-400" />
            <input autoFocus value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Rue, hopital, boutique, mosquee..." className="flex-1 bg-transparent outline-none text-sm" />
            {query && <button onClick={() => { setQuery(''); setResults([]) }}><X size={18} className="text-gray-400" /></button>}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-center text-gray-400 text-sm">Recherche en cours...</div>}
          {!loading && results.map((place, i) => (
            <button key={i} onClick={() => selectPlace(place)} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#E8F5E9' }}><MapPin size={18} color="#1DB954" /></div>
              <div className="flex-1 min-w-0"><p className="font-semibold text-sm text-black truncate">{place.name}</p><p className="text-xs text-gray-400 truncate">{place.address}</p></div>
            </button>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">Aucun lieu trouve</div>}
          {query.length < 2 && <div className="p-6 text-center text-gray-300 text-sm">Tape le nom d&apos;un lieu au Senegal</div>}
        </div>
      </div>
    )
  }

  // ===== CLIENT : CONFIRMATION =====
  if (screen === 'confirm' && selected) {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('recherche')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Confirmer la course</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="h-56 relative">
            <MapView fromLat={position.lat} fromLng={position.lng} toLat={selected.lat} toLng={selected.lng} />
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                <div><p className="text-xs text-gray-400">Depart</p><p className="text-sm font-semibold">{position.address}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-500" />
                <div><p className="text-xs text-gray-400">Destination</p><p className="text-sm font-semibold">{selected.name}</p></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setService('moto')} className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm" style={{ border: service === 'moto' ? '2px solid #1DB954' : '2px solid white' }}>
                <span className="text-2xl">🏍️</span><span className="font-bold text-sm" style={{ color: service === 'moto' ? '#0F5138' : '#9CA3AF' }}>Moto-taxi</span>
              </button>
              <button onClick={() => setService('livraison')} className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm" style={{ border: service === 'livraison' ? '2px solid #1DB954' : '2px solid white' }}>
                <span className="text-2xl">📦</span><span className="font-bold text-sm" style={{ color: service === 'livraison' ? '#0F5138' : '#9CA3AF' }}>Livraison</span>
              </button>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between mb-2"><span className="text-sm text-gray-500">Distance</span><span className="text-sm font-bold">{formatDistance(km)}</span></div>
              <div className="flex justify-between mb-3"><span className="text-sm text-gray-500">Duree estimee</span><span className="text-sm font-bold">{formatETA(eta)}</span></div>
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center"><span className="font-bold">Prix total</span><span className="text-2xl font-black" style={{ color: '#0F5138' }}>{formatPrice(price)}</span></div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-100">
          <button onClick={commanderCourse} disabled={commandLoading} className="w-full py-4 rounded-2xl font-bold text-white text-base" style={{ background: commandLoading ? '#7aaa94' : '#0F5138' }}>
            {commandLoading ? 'Envoi en cours...' : 'Commander un TIAK TIAK'}
          </button>
        </div>
      </div>
    )
  }

  // ===== CLIENT : MON PROFIL =====
  if (screen === 'profil') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Mon profil</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-3" style={{ background: '#0F5138' }}><User size={36} color="white" /></div>
            <p className="font-black text-lg">{user?.name}</p>
            <p className="text-gray-400 text-sm">{user?.phone}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>0</p><p className="text-xs text-gray-400">Courses</p></div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>5.0 ⭐</p><p className="text-xs text-gray-400">Ma note</p></div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setScreen('courses')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><List size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Mes courses</span><ChevronRight size={18} className="text-gray-300" /></button>
            <button onClick={() => setScreen('paiement')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><CreditCard size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Moyens de paiement</span><ChevronRight size={18} className="text-gray-300" /></button>
            <button onClick={() => setScreen('parametres')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><Settings size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Parametres</span><ChevronRight size={18} className="text-gray-300" /></button>
            <button onClick={() => setScreen('aide')} className="w-full flex items-center gap-3 px-4 py-3.5 text-left"><HelpCircle size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Aide et Support</span><ChevronRight size={18} className="text-gray-300" /></button>
          </div>
          <button onClick={logout} className="w-full bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-3.5 text-red-500"><LogOut size={20} /><span className="text-sm font-bold">Deconnexion</span></button>
        </div>
      </div>
    )
  }

  // ===== CLIENT : MOYENS DE PAIEMENT =====
  if (screen === 'paiement') {
    const methods = [
      { id: 'cash', icon: '💵', name: 'Especes', desc: 'Payer en liquide au chauffeur' },
      { id: 'wave', icon: '📱', name: 'Wave', desc: 'Paiement mobile Wave' },
      { id: 'orange', icon: '🟠', name: 'Orange Money', desc: 'Paiement mobile Orange' },
    ]
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Moyens de paiement</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {methods.map(m => (
            <button key={m.id} onClick={() => setPayment(m.id)} className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3" style={{ border: payment === m.id ? '2px solid #1DB954' : '2px solid white' }}>
              <span className="text-2xl">{m.icon}</span>
              <div className="flex-1 text-left"><p className="font-bold text-sm">{m.name}</p><p className="text-xs text-gray-400">{m.desc}</p></div>
              {payment === m.id && <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#1DB954' }}><Check size={14} color="white" /></div>}
            </button>
          ))}
          <p className="text-xs text-gray-400 text-center px-4 mt-2">Le mode de paiement choisi sera utilise par defaut pour tes prochaines courses.</p>
        </div>
      </div>
    )
  }

  // ===== CLIENT : PARRAINAGE =====
  if (screen === 'parrainage') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Parrainer un ami</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl p-6 text-center" style={{ background: '#0F5138' }}>
            <Gift size={40} color="white" className="mx-auto mb-3" />
            <p className="text-white font-black text-lg mb-1">Gagne des courses gratuites</p>
            <p className="text-green-200 text-sm">Invite tes amis et vous gagnez tous les deux -50% sur une course</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-xs text-gray-400 mb-2">TON CODE DE PARRAINAGE</p>
            <p className="text-2xl font-black tracking-widest" style={{ color: '#0F5138' }}>{referralCode}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm">Comment ca marche</p>
            <div className="flex items-start gap-3"><div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#1DB954' }}>1</div><p className="text-sm text-gray-600">Partage ton code avec tes amis</p></div>
            <div className="flex items-start gap-3"><div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#1DB954' }}>2</div><p className="text-sm text-gray-600">Ils s&apos;inscrivent avec ton code</p></div>
            <div className="flex items-start gap-3"><div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: '#1DB954' }}>3</div><p className="text-sm text-gray-600">Vous gagnez tous les deux une reduction</p></div>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-100">
          <button onClick={shareReferral} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#0F5138' }}><Share2 size={20} /> Partager mon code</button>
        </div>
      </div>
    )
  }

  // ===== CLIENT : AIDE =====
  if (screen === 'aide') {
    const faqs = [
      { q: 'Comment commander une course ?', a: 'Choisis ta destination dans la barre de recherche, verifie le prix affiche, puis appuie sur Commander. Un chauffeur proche recevra ta demande.' },
      { q: 'Quels sont les moyens de paiement ?', a: 'Tu peux payer en especes, par Wave ou par Orange Money.' },
      { q: 'Comment est calcule le prix ?', a: 'Le prix depend de la distance. Moto-taxi : 500 + 200 FCFA par km. Livraison : 700 + 250 FCFA par km.' },
      { q: 'Dans quelles villes fonctionne TIAK TIAK ?', a: 'TIAK TIAK couvre tout le Senegal : Dakar, Thies, Touba, Saint-Louis, Kaolack et partout ailleurs.' },
      { q: 'Comment devenir chauffeur ?', a: "Deconnecte-toi, puis choisis Je suis un Chauffeur sur l'ecran d'accueil et remplis ton dossier." },
    ]
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Aide et Support</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#1DB954' }}><MessageCircle size={20} color="white" /></div>
            <div><p className="font-bold text-sm" style={{ color: '#0F5138' }}>Service client 7j/7</p><p className="text-xs text-gray-600">Nous sommes la pour t&apos;aider a tout moment</p></div>
          </div>
          <p className="font-bold text-sm text-gray-500">Questions frequentes</p>
          {faqs.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <span className="flex-1 text-sm font-semibold">{f.q}</span>
                <ChevronDown size={18} className="text-gray-400" style={{ transform: faqOpen === i ? 'rotate(180deg)' : 'none' }} />
              </button>
              {faqOpen === i && <p className="px-4 pb-4 text-sm text-gray-600">{f.a}</p>}
            </div>
          ))}
          <p className="font-bold text-sm text-gray-500 pt-2">Nous contacter</p>
          <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-3.5"><MessageCircle size={20} color="#1DB954" /><span className="flex-1 text-sm font-medium">WhatsApp</span><ChevronRight size={18} className="text-gray-300" /></a>
          <a href="tel:+221770970100" className="bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-3.5"><Phone size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Appeler le support</span><ChevronRight size={18} className="text-gray-300" /></a>
        </div>
      </div>
    )
  }

  // ===== CLIENT : PARAMETRES =====
  if (screen === 'parametres') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Parametres</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="font-bold text-sm text-gray-500 mb-2 flex items-center gap-2"><Globe size={16} color="#0F5138" /> Langue</p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {languages.map((l, i) => (
                <button key={l.code} onClick={() => changeLang(l.code)} className={"w-full flex items-center gap-3 px-4 py-3.5 text-left " + (i < languages.length - 1 ? 'border-b border-gray-50' : '')}>
                  <span className="text-xl">{l.flag}</span>
                  <span className="flex-1 text-sm font-medium">{l.name}</span>
                  {lang === l.code && <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#1DB954' }}><Check size={14} color="white" /></div>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-bold text-sm text-gray-500 mb-2 flex items-center gap-2"><Bell size={16} color="#0F5138" /> Notifications</p>
            <div className="bg-white rounded-2xl shadow-sm flex items-center px-4 py-3.5">
              <span className="flex-1 text-sm font-medium">Activer les notifications</span>
              <button onClick={() => setNotif(!notif)} className="w-12 h-6 rounded-full relative transition-all" style={{ background: notif ? '#1DB954' : '#D1D5DB' }}>
                <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: notif ? '26px' : '2px' }} />
              </button>
            </div>
          </div>
          <div>
            <p className="font-bold text-sm text-gray-500 mb-2">Legal</p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => setScreen('conditions')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><FileText size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Conditions d&apos;utilisation</span><ChevronRight size={18} className="text-gray-300" /></button>
              <button onClick={() => setScreen('confidentialite')} className="w-full flex items-center gap-3 px-4 py-3.5 text-left"><Shield size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Politique de confidentialite</span><ChevronRight size={18} className="text-gray-300" /></button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== CLIENT : CONDITIONS =====
  if (screen === 'conditions') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('parametres')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Conditions d&apos;utilisation</span>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{CONDITIONS_UTILISATION}</p>
        </div>
      </div>
    )
  }

  // ===== CLIENT : CONFIDENTIALITE =====
  if (screen === 'confidentialite') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('parametres')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Confidentialite</span>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{POLITIQUE_CONFIDENTIALITE}</p>
        </div>
      </div>
    )
  }

  // ===== CLIENT : A PROPOS =====
  if (screen === 'apropos') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">A propos</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-col items-center py-4">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-3" style={{ background: '#0F5138' }}><Navigation size={36} color="white" fill="white" style={{ transform: 'rotate(45deg)' }} /></div>
            <h1 className="text-2xl font-black tracking-widest" style={{ color: '#0F5138' }}>TIAK TIAK</h1>
            <p className="text-gray-400 text-sm mt-1">Le Tiak Tiak de ta generation</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-sm mb-2" style={{ color: '#0F5138' }}>Notre mission</p>
            <p className="text-sm text-gray-600 leading-relaxed">TIAK TIAK est nee d&apos;une idee simple : rendre le transport en moto-taxi rapide, sur et accessible a tous les Senegalais.</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-sm mb-2" style={{ color: '#0F5138' }}>Notre vision</p>
            <p className="text-sm text-gray-600 leading-relaxed">Devenir la reference du transport moto et de la livraison au Senegal, en offrant un service fiable qui ameliore le quotidien des clients et fait vivre dignement des milliers de chauffeurs.</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <p className="font-bold text-sm mb-1" style={{ color: '#0F5138' }}>Ce que nous offrons</p>
            <p className="text-sm text-gray-600">🏍️ Courses moto-taxi rapides</p>
            <p className="text-sm text-gray-600">📦 Livraison express de colis</p>
            <p className="text-sm text-gray-600">💳 Paiement Cash, Wave ou Orange Money</p>
            <p className="text-sm text-gray-600">📍 Prix transparent calcule a l&apos;avance</p>
            <p className="text-sm text-gray-600">🇸🇳 Couverture dans tout le Senegal</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setScreen('conditions')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><FileText size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Conditions d&apos;utilisation</span><ChevronRight size={18} className="text-gray-300" /></button>
            <button onClick={() => setScreen('confidentialite')} className="w-full flex items-center gap-3 px-4 py-3.5 text-left"><Shield size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Politique de confidentialite</span><ChevronRight size={18} className="text-gray-300" /></button>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-sm text-gray-600">Fierement senegalais 🇸🇳</p>
            <p className="text-xs text-gray-400 mt-1">Version 1.0.0</p>
          </div>
        </div>
      </div>
    )
  }

  // ===== CLIENT : MES COURSES =====
  if (screen === 'courses') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-3 flex items-center justify-center border-b border-gray-100">
          <span className="text-xl font-black italic" style={{ color: '#0F5138' }}>Mes courses</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {ridesLoading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div>
          ) : rides.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm text-center py-16 px-6">
              <span className="text-5xl block mb-4">🛵</span>
              <p className="font-bold text-gray-700 mb-1">Aucune course pour le moment</p>
              <p className="text-sm text-gray-400 mb-5">Tes trajets apparaitront ici apres ta premiere course</p>
              <button onClick={() => setScreen('accueil')} className="px-6 py-3 rounded-full font-bold text-white text-sm" style={{ background: '#0F5138' }}>Commander maintenant</button>
            </div>
          ) : (
            rides.map(ride => {
              const st = statusLabel(ride.status)
              return (
                <div key={ride.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ride.service_type === 'moto' ? '🏍️' : '📦'}</span>
                      <span className="font-bold text-sm">{ride.service_type === 'moto' ? 'Moto-taxi' : 'Livraison'}</span>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: st.color }}>{st.text}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
                      <span className="text-xs text-gray-500 truncate">{ride.from_address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400" />
                      <span className="text-xs text-gray-500 truncate">{ride.to_address}</span>
                    </div>
                  </div>
                  {ride.cancel_reason && <p className="text-xs text-red-400 italic">Motif : {ride.cancel_reason}</p>}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                    <div className="flex items-center gap-1 text-gray-400">
                      <Clock size={12} />
                      <span className="text-xs">{formatDate(ride.created_at)}</span>
                    </div>
                    <span className="font-black text-sm" style={{ color: '#0F5138' }}>{formatPrice(ride.price)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <nav className="bg-white flex border-t border-gray-100">
          <button onClick={() => setScreen('accueil')} className="flex-1 py-3 flex flex-col items-center gap-1"><Home size={22} color="#9CA3AF" /><span className="text-xs font-semibold text-gray-400">Accueil</span></button>
          <button onClick={() => { setScreen('courses'); loadRides() }} className="flex-1 py-3 flex flex-col items-center gap-1"><List size={22} color="#1DB954" /><span className="text-xs font-semibold" style={{ color: '#0F5138' }}>Mes courses</span></button>
        </nav>
      </div>
    )
  }

  // ===== CLIENT : ACCUEIL =====
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => setMenuOpen(false)} />
          <div className="relative bg-white w-72 h-full flex flex-col">
            <div className="p-5" style={{ background: '#0F5138' }}>
              <div className="w-16 h-16 rounded-full bg-white bg-opacity-20 flex items-center justify-center mb-3"><User size={28} color="white" /></div>
              <p className="text-white font-bold text-lg">{user?.name}</p>
              <p className="text-green-200 text-sm">{user?.phone}</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <button onClick={() => goTo('profil')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><User size={20} color="#0F5138" /><span className="text-sm font-medium">Mon profil</span></button>
              <button onClick={() => { goTo('courses'); loadRides() }} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><List size={20} color="#0F5138" /><span className="text-sm font-medium">Mes courses</span></button>
              <button onClick={() => goTo('paiement')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><CreditCard size={20} color="#0F5138" /><span className="text-sm font-medium">Moyens de paiement</span></button>
              <button onClick={() => goTo('parrainage')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><Gift size={20} color="#0F5138" /><span className="text-sm font-medium">Parrainer un ami</span></button>
              <button onClick={() => goTo('aide')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><HelpCircle size={20} color="#0F5138" /><span className="text-sm font-medium">Aide et Support</span></button>
              <button onClick={() => goTo('parametres')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><Settings size={20} color="#0F5138" /><span className="text-sm font-medium">Parametres</span></button>
              <button onClick={() => goTo('apropos')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><Info size={20} color="#0F5138" /><span className="text-sm font-medium">A propos</span></button>
            </div>
            <button onClick={logout} className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 text-red-500"><LogOut size={20} /><span className="text-sm font-bold">Deconnexion</span></button>
          </div>
        </div>
      )}
      <header className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button onClick={() => setMenuOpen(true)} className="w-10 h-10 flex items-center justify-center"><Menu size={24} color="#0F5138" /></button>
        <span className="text-2xl font-black italic" style={{ color: '#0F5138' }}>TIAK TIAK</span>
        <button onClick={() => setScreen('profil')} className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center"><User size={20} className="text-gray-400" /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-black mb-3">Services disponibles</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setService('moto')} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm" style={{ border: service === 'moto' ? '2px solid #1DB954' : '2px solid white' }}>
              <span className="text-4xl">🏍️</span><span className="font-bold" style={{ color: service === 'moto' ? '#0F5138' : '#9CA3AF' }}>Moto-taxi</span><span className="text-xs text-gray-400">2 min</span>
            </button>
            <button onClick={() => setService('livraison')} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm" style={{ border: service === 'livraison' ? '2px solid #1DB954' : '2px solid white' }}>
              <span className="text-4xl">📦</span><span className="font-bold" style={{ color: service === 'livraison' ? '#0F5138' : '#9CA3AF' }}>Livraison</span><span className="text-xs text-gray-400">10 min</span>
            </button>
          </div>
        </div>
        <button onClick={() => setScreen('recherche')} className="w-full bg-white rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
          <span className="flex-1 text-left text-gray-400">Ou allons-nous ?</span>
          <ChevronRight size={20} color="#0F5138" />
        </button>
        <button onClick={() => setScreen('parrainage')} className="w-full rounded-2xl p-5 relative overflow-hidden text-left" style={{ background: '#0F5138' }}>
          <h3 className="text-white font-black italic text-xl mb-1">-50% SUR TA 1ERE COURSE</h3>
          <p className="text-white text-sm opacity-90 mb-4">Rejoins des milliers de Senegalais qui roulent malin</p>
          <span className="inline-block bg-white px-5 py-2 rounded-full font-bold text-sm" style={{ color: '#0F5138' }}>J EN PROFITE</span>
        </button>
      </div>
      <nav className="bg-white flex border-t border-gray-100">
        <button onClick={() => setScreen('accueil')} className="flex-1 py-3 flex flex-col items-center gap-1"><Home size={22} color="#1DB954" /><span className="text-xs font-semibold" style={{ color: '#0F5138' }}>Accueil</span></button>
        <button onClick={() => { setScreen('courses'); loadRides() }} className="flex-1 py-3 flex flex-col items-center gap-1"><List size={22} color="#9CA3AF" /><span className="text-xs font-semibold text-gray-400">Mes courses</span></button>
      </nav>
    </div>
  )
}