'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Menu, User, ChevronRight, ChevronDown, Home, List, Search, X, MapPin, ArrowLeft, LogOut, Navigation, Zap, Phone, Gift, HelpCircle, Info, Share2, MessageCircle, CreditCard, Check, Settings, Globe, Bell, Shield, FileText, Clock, XCircle, Power, Users, TrendingUp, CheckCircle, Ban, AlertTriangle, Star, Award, Wallet, AlertCircle, Camera, Play, Lock, Package } from 'lucide-react'
import { searchPlaces, Place } from '../lib/search'
import { calculatePrice, formatPrice, formatDistance, calculateETA, formatETA, haversineDistance, calculateCommission, applyFirstRideDiscount, WAVE_PAYMENT_LINK } from '../lib/utils'
import { CONDITIONS_UTILISATION, POLITIQUE_CONFIDENTIALITE } from '../lib/legal'
import { supabase } from '../lib/supabase'
import dynamic from 'next/dynamic'
import { getFCMToken, onForegroundMessage } from '../lib/firebase'

const MapView = dynamic(() => import('./components/MapView'), { ssr: false })
import { LogoIcon, LogoWordmark } from './components/logo'

interface AppUser {
  id?: string
  role: 'client' | 'chauffeur' | 'admin'
  name: string
  phone: string
  verification_status?: string
verification_selfie?: string
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
  commission: number
  status: string
  cancel_reason?: string
  driver_id?: string
  client_id?: string
  payment_method?: string
  client_rating?: number
  client_comment?: string
  client_report?: string
  pin_code?: string
  pin_verified?: boolean
  client_name?: string
  client_phone?: string
}

interface Driver {
  id: string
  name: string
  phone: string
  moto_type: string
  moto_color: string
  is_online: boolean
  is_validated: boolean
  is_suspended: boolean
  is_premium: boolean
  premium_expires_at: string | null
  free_trial_used: boolean
  free_trial_start: string | null
  free_trial_end: string | null
  rating: number
  total_rides: number
  home_address: string
  profile_photo: string
  id_card_front: string
  id_card_back: string
  created_at: string
}

interface NearbyDriver {
  id: string
  lat: number
  lng: number
  name: string
  eta: number
  motoColor?: string
  rating?: number
  totalRides?: number
}

interface FreqDest {
  name: string
  address: string
  lat: number
  lng: number
  count: number
}

const SUPPORT_WHATSAPP = 'https://wa.me/221755535030?text=' + encodeURIComponent("Bonjour TIAK TIAK Support, j'ai besoin d'aide.")
const DEFAULT_POS: GpsPosition = { lat: 14.7167, lng: -17.2833, address: 'Rufisque, Dakar' }

const CANCEL_REASONS = [
  "J'ai trouvé un autre moyen de transport",
  "Le chauffeur tarde trop",
  "J'ai fait une erreur de destination",
  "Problème personnel",
  "Autre raison",
]

const REPORT_OPTIONS = [
  { id: 'dangerous', icon: '🚫', label: 'Conduite dangereuse' },
  { id: 'rude', icon: '💬', label: 'Comportement irrespectueux' },
  { id: 'price', icon: '💰', label: 'Prix incorrect' },
  { id: 'route', icon: '📍', label: 'Mauvais itineraire' },
  { id: 'perfect', icon: '✅', label: 'Tout etait parfait' },
]

const PREMIUM_BENEFITS = [
  { icon: '💰', text: 'Commission fixe 100 FCFA moto / 200 FCFA livraison' },
  { icon: '🔵', text: 'Badge bleu ✓ visible par tous les clients' },
  { icon: '⚡', text: 'Reçois les courses 1 minute avant les autres' },
  { icon: '📊', text: 'Statistiques détaillées semaine/mois' },
  { icon: '🎯', text: '3 jours gratuits sans commission inclus' },
  { icon: '💬', text: 'Support prioritaire 24h/24' },
]

const generatePIN = () => Math.floor(1000 + Math.random() * 9000).toString()

const playTiakTiakSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notes = [523, 659, 523, 659, 784]
    const times = [0, 0.15, 0.35, 0.5, 0.7]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq; osc.type = 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime + times[i])
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + times[i] + 0.05)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + times[i] + 0.2)
      osc.start(ctx.currentTime + times[i]); osc.stop(ctx.currentTime + times[i] + 0.25)
    })
  } catch {}
}

const speak = (text: string) => {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'fr-FR'; utt.rate = 0.95; utt.pitch = 1
    window.speechSynthesis.speak(utt)
  } catch {}
}

const formatCountdown = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now()
  if (diff <= 0) return 'Expiré'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}j ${hours}h ${mins}min`
  if (hours > 0) return `${hours}h ${mins}min`
  return `${mins}min`
}

const shareTrip = (driverName: string, fromAddr: string, toAddr: string) => {
  const text = `🛵 Je suis dans un TIAK TIAK !\n\nChauffeur : ${driverName}\nDe : ${fromAddr}\nVers : ${toAddr}\n\nSuis mon trajet en temps réel.`
  if ((navigator as any).share) {
    (navigator as any).share({ title: 'Mon trajet TIAK TIAK', text }).catch(() => {})
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert('Lien copié !')).catch(() => {})
  }
}

export default function TiakTiak() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [authScreen, setAuthScreen] = useState('roles')
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [loaded, setLoaded] = useState(false)
  const [splashPhase, setSplashPhase] = useState<'green' | 'white'>('green')

  const [position, setPosition] = useState<GpsPosition>(DEFAULT_POS)

  const [gpsReady, setGpsReady] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsDenied, setGpsDenied] = useState(false)

  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formMoto, setFormMoto] = useState('')
  const [formColor, setFormColor] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formIdFront, setFormIdFront] = useState('')
  const [formIdBack, setFormIdBack] = useState('')
  const [formProfilePhoto, setFormProfilePhoto] = useState('')
  const [formEmergencyName, setFormEmergencyName] = useState('')
  const [formEmergencyPhone, setFormEmergencyPhone] = useState('')
  const [signupStep, setSignupStep] = useState(1)
  const [adminPass, setAdminPass] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [service, setService] = useState('moto')
const [osrmEta, setOsrmEta] = useState(0)
const [deviationAlert, setDeviationAlert] = useState(false)
const [arretAlert, setArretAlert] = useState(false)
const [dangerZones, setDangerZones] = useState<any[]>([])
const [sosAlertsNearby, setSosAlertsNearby] = useState<any[]>([])
const [fcmToken, setFcmToken] = useState<string | null>(null)
const [isVerified, setIsVerified] = useState(false)
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
  const [clientTotalRides, setClientTotalRides] = useState(0)
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([])
  const [freqDests, setFreqDests] = useState<FreqDest[]>([])
  const [isFirstRide, setIsFirstRide] = useState(false)
  const [showAddressInput, setShowAddressInput] = useState(false)
  const [showDemandSheet, setShowDemandSheet] = useState(false)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState<Place[]>([])
  const [addressLoading, setAddressLoading] = useState(false)

  // Client PIN
  const [clientPinCode, setClientPinCode] = useState('')
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinWrongNotif, setPinWrongNotif] = useState(false)

  // Client suivi
  const [currentClientRide, setCurrentClientRide] = useState<Ride | null>(null)
  const [driverLat, setDriverLat] = useState<number | null>(null)
  const [driverLng, setDriverLng] = useState<number | null>(null)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [driverMotoType, setDriverMotoType] = useState('')
  const [driverMotoColor, setDriverMotoColor] = useState('')
  const [driverRating, setDriverRating] = useState(5.0)
  const [driverTotalRides, setDriverTotalRides] = useState(0)
  const [driverIsPremium, setDriverIsPremium] = useState(false)
  const [driverProfilePhoto, setDriverProfilePhoto] = useState('')
  const [estimatedArrival, setEstimatedArrival] = useState(0)
  const [distanceToClient, setDistanceToClient] = useState(0)
  const [driverArrived, setDriverArrived] = useState(false)
  const [driverArrivedAt, setDriverArrivedAt] = useState<number | null>(null)

  // Chauffeur
  const [isOnline, setIsOnline] = useState(false)
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null)
  const [currentDriverRide, setCurrentDriverRide] = useState<Ride | null>(null)
  const [nextIncomingRide, setNextIncomingRide] = useState<Ride | null>(null)
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [driverPosition, setDriverPosition] = useState<GpsPosition>(DEFAULT_POS)
  const [isValidated, setIsValidated] = useState(false)
  const [isSuspended, setIsSuspended] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<string | null>(null)
  const [freeTrialUsed, setFreeTrialUsed] = useState(false)
  const [freeTrialEnd, setFreeTrialEnd] = useState<string | null>(null)
  const [freeTrialActive, setFreeTrialActive] = useState(false)
  const [driverStats, setDriverStats] = useState({ todayRides: 0, todayEarnings: 0, todayCommission: 0, weekEarnings: 0, weekRides: 0, monthEarnings: 0, monthRides: 0, totalRides: 0, rating: 5.0 })
  const [driverHistory, setDriverHistory] = useState<Ride[]>([])
  const [driverTab, setDriverTab] = useState<'accueil' | 'gains' | 'historique' | 'avis'>('accueil')
  const [driverPhase, setDriverPhase] = useState<'to_client' | 'with_client'>('to_client')
  const [clientArrived, setClientArrived] = useState(false)
  const [rideCancelled, setRideCancelled] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [showPinEntry, setShowPinEntry] = useState(false)
  const [trialActivating, setTrialActivating] = useState(false)
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [navStartPos, setNavStartPos] = useState<GpsPosition>(DEFAULT_POS)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    setIsOffline(!navigator.onLine)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])
  const [showNextRideBanner, setShowNextRideBanner] = useState(false)
  const [statsTab, setStatsTab] = useState<'semaine' | 'mois'>('semaine')

  // Évaluation
  const [clientRating, setClientRating] = useState(0)
  const [clientComment, setClientComment] = useState('')
  const [clientReport, setClientReport] = useState('')
  const [evalLoading, setEvalLoading] = useState(false)

  // Admin
  const [adminTab, setAdminTab] = useState<'stats' | 'chauffeurs' | 'courses' | 'evaluations' | 'selfies'>('stats')
const [pendingSelfies, setPendingSelfies] = useState<any[]>([])
  const [adminDrivers, setAdminDrivers] = useState<Driver[]>([])
  const [adminRides, setAdminRides] = useState<Ride[]>([])
  const [adminEvals, setAdminEvals] = useState<Ride[]>([])
  const [adminStats, setAdminStats] = useState({ courses: 0, chauffeurs: 0, clients: 0, commissions: 0 })
  const [adminLoading, setAdminLoading] = useState(false)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null)

  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const nearbyInterval = useRef<NodeJS.Timeout | null>(null)
  const priorityTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const gpsRetryRef = useRef(false)
  const lastMovementRef = useRef<number | null>(null)
const lastPosRef = useRef<{ lat: number; lng: number } | null>(null)
const selfieCheckRef = useRef<NodeJS.Timeout | null>(null)
const lastSelfieCheckRef = useRef<number>(Date.now())

  // ===== SPLASH + GPS AUTO =====
  useEffect(() => {
    const t1 = setTimeout(() => setSplashPhase('white'), 1500)
    const t2 = setTimeout(() => {
      const saved = localStorage.getItem('tiaktiak_user')
      if (saved) setUser(JSON.parse(saved))
      const savedLang = localStorage.getItem('tiaktiak_lang')
      if (savedLang) setLang(savedLang)
      setLoaded(true)
    }, 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const activerGPS = () => {
    setGpsLoading(true); setGpsDenied(false)
    let resolved = false
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (resolved) return
        resolved = true
        navigator.geolocation.clearWatch(watchId)
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=fr`)
          const data = await res.json()
          const address = data.address?.suburb || data.address?.neighbourhood || data.address?.city || data.address?.town || 'Ma position'
          setPosition({ lat: latitude, lng: longitude, address })
          if (user?.role === 'chauffeur') setDriverPosition({ lat: latitude, lng: longitude, address })
        } catch {
          setPosition({ lat: latitude, lng: longitude, address: 'Ma position' })
          if (user?.role === 'chauffeur') setDriverPosition({ lat: latitude, lng: longitude, address: 'Ma position' })
        }
        setGpsReady(true); setGpsLoading(false)
      },
      () => {
        if (resolved) return
        resolved = true
        navigator.geolocation.clearWatch(watchId)
        setGpsDenied(true); setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
    setTimeout(() => {
      if (!resolved && !gpsRetryRef.current) {
        gpsRetryRef.current = true
        navigator.geolocation.clearWatch(watchId)
        activerGPS()
      }
    }, 4000)
  }

  useEffect(() => {
    if (loaded && user) activerGPS()
  }, [loaded, user])

  useEffect(() => {
    if (!user || user.role !== 'client') return
    const loadNearby = async () => {
      const { data } = await supabase.from('users').select('id, name, current_lat, current_lng, moto_color, rating, total_rides').eq('role', 'chauffeur').eq('is_online', true).eq('is_validated', true).not('current_lat', 'is', null)
      if (data && position.lat !== DEFAULT_POS.lat) {
        const drivers = data.filter(d => d.current_lat && d.current_lng).map(d => {
          const dist = haversineDistance(position.lat, position.lng, d.current_lat, d.current_lng)
          return { id: d.id, lat: d.current_lat, lng: d.current_lng, name: d.name, eta: Math.max(1, Math.round(dist * 3)), dist, motoColor: d.moto_color, rating: d.rating, totalRides: d.total_rides }
        }).filter(d => d.dist <= 5).sort((a, b) => a.eta - b.eta).slice(0, 5)
        setNearbyDrivers(drivers)
      }
    }
    loadNearby()
    nearbyInterval.current = setInterval(loadNearby, 8000)
    return () => { if (nearbyInterval.current) clearInterval(nearbyInterval.current) }
  }, [user, position])

  const loadFreqDests = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('destination_history').select('to_address, to_lat, to_lng, visit_count').eq('client_id', user.id).order('updated_at', { ascending: false }).limit(4)
    if (!data) return
    const sorted = data.map(r => ({ name: r.to_address.split(',')[0], address: r.to_address, lat: r.to_lat, lng: r.to_lng, count: r.visit_count || 1 }))
    setFreqDests(sorted)
  }, [user?.id])

  useEffect(() => { loadFreqDests() }, [loadFreqDests])

  const checkFirstRide = useCallback(async () => {
    if (!user?.id) { setIsFirstRide(false); return }
    const { count } = await supabase.from('rides').select('id', { count: 'exact', head: true }).eq('client_id', user.id).eq('status', 'completed')
    setIsFirstRide((count || 0) === 0)
  }, [user?.id])

  useEffect(() => {
    if (!user || user.role !== 'chauffeur' || !user.id) return
    const checkStatus = async () => {
      if (user?.role === 'client') {
  const { data: verif } = await supabase.from('users').select('is_verified').eq('id', user.id).single()
  if (verif) setIsVerified(verif.is_verified || false)
  return
}
      const { data } = await supabase.from('users').select('is_validated, is_suspended, is_premium, premium_expires_at, rating, total_rides, is_online, free_trial_used, free_trial_start, free_trial_end').eq('id', user.id!).single()
      if (data) {
        setIsValidated(data.is_validated || false)
        setIsSuspended(data.is_suspended || false)
        setIsOnline(data.is_online || false)
        setFreeTrialUsed(data.free_trial_used || false)
        setFreeTrialEnd(data.free_trial_end || null)
        const trialActive = data.free_trial_end && new Date(data.free_trial_end) > new Date()
        setFreeTrialActive(!!trialActive)
        if (data.is_premium && data.premium_expires_at && new Date(data.premium_expires_at) < new Date()) {
          await supabase.from('users').update({ is_premium: false, premium_expires_at: null }).eq('id', user.id!)
          setIsPremium(false); setPremiumExpiresAt(null)
        } else {
          setIsPremium(data.is_premium || false)
          setPremiumExpiresAt(data.premium_expires_at || null)
        }
        setDriverStats(prev => ({ ...prev, rating: data.rating || 5.0, totalRides: data.total_rides || 0 }))
      }
    }
    checkStatus()
    loadDriverStats()

    
    // Enregistrer le token FCM pour les notifications push
if (user?.role === 'chauffeur') {
  getFCMToken().then(async (token) => {
    if (token) {
      setFcmToken(token)
      await supabase.from('users').update({ fcm_token: token }).eq('phone', user.phone)
    }
  })
  onForegroundMessage((payload) => {
    const { title, body } = payload.notification || {}
    if (title) alert(`🔔 ${title}\n${body || ''}`)
  })
}
  }, [user])

  const loadDriverStats = useCallback(async () => {
    if (!user?.id) return
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [todayRes, weekRes, monthRes, userRes] = await Promise.all([
      supabase.from('rides').select('price, commission').eq('driver_id', user.id).gte('created_at', today).eq('status', 'completed'),
      supabase.from('rides').select('price').eq('driver_id', user.id).gte('created_at', weekAgo).eq('status', 'completed'),
      supabase.from('rides').select('price').eq('driver_id', user.id).gte('created_at', monthAgo).eq('status', 'completed'),
      supabase.from('users').select('rating, total_rides').eq('id', user.id).single(),
    ])
    const todayRides = todayRes.data || []
    const todayEarnings = todayRides.reduce((s, r) => s + (r.price || 0), 0)
    const todayCommission = freeTrialActive ? 0 : todayRides.reduce((s, r) => s + (r.commission || 0), 0)
    const weekData = weekRes.data || []
    const weekEarnings = weekData.reduce((s, r) => s + (r.price || 0), 0)
    const monthData = monthRes.data || []
    const monthEarnings = monthData.reduce((s, r) => s + (r.price || 0), 0)
    setDriverStats({
      todayRides: todayRides.length, todayEarnings, todayCommission,
      weekEarnings, weekRides: weekData.length,
      monthEarnings, monthRides: monthData.length,
      totalRides: userRes.data?.total_rides || 0, rating: userRes.data?.rating || 5.0
    })
  }, [user?.id, freeTrialActive])

  const loadDriverHistory = async () => {
    if (!user?.id) return
    const { data } = await supabase.from('rides').select('*').eq('driver_id', user.id).order('created_at', { ascending: false }).limit(20)
    if (data) setDriverHistory(data)
  }

  const activerFreeTrial = async () => {
    if (!user?.id || freeTrialUsed) return
    setTrialActivating(true)
    const now = new Date()
    const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    await supabase.from('users').update({ free_trial_used: true, free_trial_start: now.toISOString(), free_trial_end: end.toISOString() }).eq('id', user.id)
    setFreeTrialUsed(true); setFreeTrialEnd(end.toISOString()); setFreeTrialActive(true)
    setTrialActivating(false)
    speak("Vos 3 jours gratuits sont activés !")
  }

  useEffect(() => {
    if (!user || user.role !== 'chauffeur' || !isOnline) {
      if (gpsWatchRef.current) navigator.geolocation.clearWatch(gpsWatchRef.current)
      return
    }
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setDriverPosition(prev => ({ ...prev, lat: latitude, lng: longitude }))
        if (user.id) await supabase.from('users').update({ current_lat: latitude, current_lng: longitude }).eq('id', user.id)

        if (currentDriverRide) {
          if (driverPhase === 'to_client') {
            const distToClient = haversineDistance(latitude, longitude, currentDriverRide.from_lat, currentDriverRide.from_lng)
            if (distToClient * 1000 < 10 && !clientArrived) {
              setClientArrived(true)
              speak("Vous êtes arrivé chez le client. Demandez le code PIN.")
              await supabase.from('rides').update({ driver_arrived_at: new Date().toISOString() } as any).eq('id', currentDriverRide.id)
              setShowPinEntry(true)
            }
          } else {
            const distToDest = haversineDistance(latitude, longitude, currentDriverRide.to_lat, currentDriverRide.to_lng)
            if (distToDest * 1000 < 10) {
              speak("Vous êtes arrivé à destination")
              await terminerCourse()
            }


// ═══════════════════════════════════════════════════
// PROTOCOLE D'ALERTE SILENCIEUSE COMPLET
// ═══════════════════════════════════════════════════
const activerProtocoleSilencieux = async (raison: string, adresse: string) => {
  // ÉTAPE 1 — Tracking GPS renforcé toutes les 3 secondes
  const trackingInterval = setInterval(async () => {
    await fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ride_id: currentDriverRide?.id || null,
        triggered_by: 'systeme_tracking',
        triggered_by_name: `GPS Track — ${raison}`,
        triggered_by_phone: user.phone || '',
        other_party_name: currentDriverRide?.client_name || '',
        other_party_phone: currentDriverRide?.client_phone || '',
        lat: latitude,
        lng: longitude,
        address: adresse,
      }),
    })
  }, 3000)

  // ÉTAPE 2 — Audio automatique silencieux sur les 2 téléphones
  let recorder: MediaRecorder | null = null
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks: BlobPart[] = []
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = e => chunks.push(e.data)
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      const file = new File([blob], `alerte_${currentDriverRide?.id}_${Date.now()}.webm`)
      const { data } = await supabase.storage.from('sos-audio').upload(file.name, file)
      if (data) {
        const { data: url } = supabase.storage.from('sos-audio').getPublicUrl(file.name)
        await supabase.from('sos_alerts')
          .update({ audio_url: url.publicUrl })
          .eq('triggered_by_phone', user.phone || '')
          .eq('status', 'active')
      }
      stream.getTracks().forEach(t => t.stop())
    }
    recorder.start()
  } catch {}

  // ÉTAPE 3 — Alerter l'admin immédiatement
  await fetch('/api/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ride_id: currentDriverRide?.id || null,
      triggered_by: 'systeme',
      triggered_by_name: raison,
      triggered_by_phone: user.phone || '',
      other_party_name: currentDriverRide?.client_name || '',
      other_party_phone: currentDriverRide?.client_phone || '',
      lat: latitude,
      lng: longitude,
      address: adresse,
    }),
  })

  // ÉTAPE 4 — Attendre 60 secondes PUIS demander "Tout va bien ?"
  await new Promise(resolve => setTimeout(resolve, 30000))
  clearInterval(trackingInterval)
  if (recorder && recorder.state === 'recording') recorder.stop()

  // ÉTAPE 5 — Afficher la question APRÈS 60 secondes d'audio
  const toutVaBien = window.confirm(
    `🔔 Vérification de sécurité TIAK TIAK\n\n${raison}\n\nTout va bien ? Appuie OK si oui, Annuler si tu as besoin d'aide.`
  )
  if (!toutVaBien) {
    await declencherSOS('chauffeur')
  }
}

// Détection arrêt anormal
if (currentDriverRide && driverPhase === 'with_client') {
  const now = Date.now()
  if (!lastMovementRef.current) lastMovementRef.current = now
  const distMoved = haversineDistance(
    latitude, longitude,
    lastPosRef.current?.lat || latitude,
    lastPosRef.current?.lng || longitude
  ) * 1000
  if (distMoved > 20) {
    lastMovementRef.current = now
    lastPosRef.current = { lat: latitude, lng: longitude }
  } else if (now - lastMovementRef.current > 5 * 60 * 1000) {
    lastMovementRef.current = now // reset anti-spam
    activerProtocoleSilencieux(
      'Arrêt anormal détecté',
      `Immobile depuis 5 min — ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    )
  }
}

// Détection déviation d'itinéraire
if (routeCoords && routeCoords.length > 0) {
  const minDist = Math.min(...routeCoords.map(([rlat, rlng]: [number, number]) =>
    haversineDistance(latitude, longitude, rlat, rlng) * 1000
  ))
  if (minDist > 500) {
    activerProtocoleSilencieux(
      'Déviation d\'itinéraire détectée',
      `${Math.round(minDist)}m du tracé prévu`
    )
  }
}
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => { if (gpsWatchRef.current) navigator.geolocation.clearWatch(gpsWatchRef.current) }
  }, [isOnline, user, currentDriverRide, driverPhase, clientArrived, routeCoords])

  // Surveiller les alertes SOS en temps réel côté client
useEffect(() => {
  if (!currentClientRide?.id) return
  const sub = supabase
    .channel(`sos_client_${currentClientRide.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'sos_alerts',
      filter: `ride_id=eq.${currentClientRide.id}`,
    }, (payload: any) => {
      const alert = payload.new
      if (alert.triggered_by_name?.includes('Déviation')) {
        setDeviationAlert(true)
        setTimeout(() => setDeviationAlert(false), 30000)
      }
      if (alert.triggered_by_name?.includes('Arrêt')) {
        setArretAlert(true)
        setTimeout(() => setArretAlert(false), 30000)
      }
    })
    .subscribe()
  return () => { supabase.removeChannel(sub) }
}, [currentClientRide?.id])

// Surveiller les alertes SOS proches côté chauffeur
useEffect(() => {
  if (user?.role !== 'chauffeur') return
  const sub = supabase
    .channel('sos_nearby_drivers')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'sos_alerts',
      filter: `triggered_by=eq.chauffeur`,
    }, (payload: any) => {
      const alert = payload.new
      if (!alert.lat || !alert.lng) return
      const dist = haversineDistance(driverPosition.lat, driverPosition.lng, alert.lat, alert.lng)
      if (dist <= 2) {
        setSosAlertsNearby(prev => [...prev, alert])
        setTimeout(() => setSosAlertsNearby(prev => prev.filter(a => a.id !== alert.id)), 10 * 60 * 1000)
      }
    })
    .subscribe()
  return () => { supabase.removeChannel(sub) }
}, [user?.role, driverPosition])

  useEffect(() => {
    if (!user || user.role !== 'chauffeur' || !isOnline || !isValidated) return
    const channel = supabase
      .channel('driver-rides-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: 'status=eq.pending' }, (payload) => {
        const newRide = payload.new as Ride

const distToPickup = haversineDistance(driverPosition.lat, driverPosition.lng, newRide.from_lat, newRide.from_lng)
        if (distToPickup > 5) return

        const showRide = () => {
          if (!currentDriverRide) {
            setIncomingRide(newRide)
            playTiakTiakSound()
            if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300])
          } else {
            setNextIncomingRide(newRide)
            setShowNextRideBanner(true)
            playTiakTiakSound()
          }
        }

        if (isPremium) {
          showRide()
        } else {
          const t = setTimeout(async () => {
            const { data } = await supabase.from('rides').select('status').eq('id', newRide.id).single()
            if (data?.status === 'pending') showRide()
            priorityTimeouts.current.delete(newRide.id)
          }, 30000)
          priorityTimeouts.current.set(newRide.id, t)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, (payload) => {
        const updated = payload.new as Ride
        if (currentDriverRide && updated.id === currentDriverRide.id && updated.status === 'cancelled') {
          setRideCancelled(true)
          setCurrentDriverRide(null)
          setDriverPhase('to_client')
          setClientArrived(false)
          setShowPinEntry(false)
          setPinInput('')
          setScreen('chauffeur_accueil')
          playTiakTiakSound()
          speak("La course a été annulée par le client")
          if (navigator.vibrate) navigator.vibrate([500, 200, 500])
        }
        if (incomingRide && updated.id === incomingRide.id && updated.status === 'cancelled') setIncomingRide(null)
        if (updated.status !== 'pending' && priorityTimeouts.current.has(updated.id)) {
          clearTimeout(priorityTimeouts.current.get(updated.id)!)
          priorityTimeouts.current.delete(updated.id)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      priorityTimeouts.current.forEach(t => clearTimeout(t))
      priorityTimeouts.current.clear()
    }
  }, [isOnline, user, currentDriverRide, isValidated, incomingRide, isPremium])

  useEffect(() => {
    if (!currentRideId) return
    const channel = supabase
      .channel('ride-updates-' + currentRideId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${currentRideId}` }, async (payload) => {
        const updated = payload.new as Ride
        if (updated.status === 'accepted' && updated.driver_id) {
          setCurrentClientRide(updated)
          setClientPinCode(updated.pin_code || '')
          const { data: driverData } = await supabase.from('users').select('name, phone, moto_type, moto_color, rating, total_rides, is_premium, current_lat, current_lng, profile_photo').eq('id', updated.driver_id).single()
          if (driverData) {
            setDriverName(driverData.name); setDriverPhone(driverData.phone)
            setDriverMotoType(driverData.moto_type || 'Moto'); setDriverMotoColor(driverData.moto_color || '')
            setDriverRating(driverData.rating || 5.0); setDriverTotalRides(driverData.total_rides || 0)
            setDriverIsPremium(driverData.is_premium || false); setDriverProfilePhoto(driverData.profile_photo || '')
            setDriverLat(driverData.current_lat || position.lat); setDriverLng(driverData.current_lng || position.lng)
            if (driverData.current_lat && driverData.current_lng) {
              const dist = haversineDistance(driverData.current_lat, driverData.current_lng, position.lat, position.lng)
              setDistanceToClient(Math.round(dist * 10) / 10)
              setEstimatedArrival(Math.max(1, Math.round(dist * 3)))
            }
          }
          speak(`Votre chauffeur ${driverData?.name || ''} arrive bientôt. Votre code PIN est ${updated.pin_code}`)
          setShowPinModal(true)
          setScreen('suivi')
        }
        if ((updated as any).driver_arrived_at && !driverArrived) {
          setDriverArrived(true)
          setDriverArrivedAt(Date.now())
          speak("Votre chauffeur est arrivé. Donnez-lui votre code PIN.")
        }
        if ((updated as any).pin_wrong_attempt) {
          setPinWrongNotif(true)
          speak("Attention ! Un mauvais code a été saisi. Vérifiez bien votre chauffeur.")
          setTimeout(() => setPinWrongNotif(false), 5000)
        }
        if (updated.status === 'in_progress') speak("La course a démarré. Bon voyage !")
        if (updated.status === 'completed') {
          setCurrentClientRide(updated)
          speak("Vous êtes arrivé à destination. Merci d'avoir utilisé TIAK TIAK")
          setScreen('checkin')
          loadFreqDests()
        }
      })
      .subscribe()

    const posChannel = supabase
      .channel('driver-pos-' + currentRideId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        if (currentClientRide?.driver_id && payload.new.id === currentClientRide.driver_id) {
          setDriverLat(payload.new.current_lat); setDriverLng(payload.new.current_lng)
          if (payload.new.current_lat && payload.new.current_lng) {
            const dist = haversineDistance(payload.new.current_lat, payload.new.current_lng, position.lat, position.lng)
            setDistanceToClient(Math.round(dist * 10) / 10)
            setEstimatedArrival(Math.max(1, Math.round(dist * 3)))
          }
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel); supabase.removeChannel(posChannel) }
  }, [currentRideId, currentClientRide, position, driverArrived, loadFreqDests])

  const verifierPin = async () => {
    if (!currentDriverRide || !pinInput) return
    if (pinInput === currentDriverRide.pin_code) {
      await supabase.from('rides').update({ pin_verified: true } as any).eq('id', currentDriverRide.id)
      setShowPinEntry(false); setPinInput(''); setPinError(false)
      speak("Code correct ! Vous pouvez démarrer la course.")
    } else {
      setPinError(true); setPinInput('')
      await supabase.from('rides').update({ pin_wrong_attempt: true } as any).eq('id', currentDriverRide.id)
      speak("Code incorrect. Demandez à nouveau au client.")
      setTimeout(() => setPinError(false), 3000)
    }
  }

  const loadAdminData = async () => {
    setAdminLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const [ridesRes, driversRes, clientsRes, todayRidesRes, evalsRes] = await Promise.all([
      supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('users').select('*').eq('role', 'chauffeur').order('created_at', { ascending: false }),
      supabase.from('users').select('id', { count: 'exact' }).eq('role', 'client'),
      supabase.from('rides').select('id, commission').gte('created_at', today).eq('status', 'completed'),
      supabase.from('rides').select('*').not('client_rating', 'is', null).order('created_at', { ascending: false }).limit(30),
    ])
    if (ridesRes.data) setAdminRides(ridesRes.data)
    if (driversRes.data) setAdminDrivers(driversRes.data)
    if (evalsRes.data) setAdminEvals(evalsRes.data)
    const totalCommission = (todayRidesRes.data || []).reduce((s: number, r: any) => s + (r.commission || 0), 0)
    setAdminStats({ courses: todayRidesRes.data?.length || 0, chauffeurs: (driversRes.data || []).filter((d: any) => d.is_online).length, clients: clientsRes.count || 0, commissions: totalCommission })
    const selfiesRes = await supabase.from('users').select('id, name, phone, verification_selfie, verification_status').eq('verification_status', 'pending').not('verification_selfie', 'is', null)
    if (selfiesRes.data) setPendingSelfies(selfiesRes.data)
    setAdminLoading(false)
  }

  const validerChauffeur = async (id: string) => {
    await supabase.from('users').update({ is_validated: true, is_suspended: false, validated_at: new Date().toISOString() }).eq('id', id)
    setAdminDrivers(prev => prev.map(d => d.id === id ? { ...d, is_validated: true, is_suspended: false } : d))
  }
  const suspendreCharffeur = async (id: string) => {
    await supabase.from('users').update({ is_suspended: true, is_online: false }).eq('id', id)
    setAdminDrivers(prev => prev.map(d => d.id === id ? { ...d, is_suspended: true } : d))
  }
  const exclureChauffeur = async (id: string) => {
    await supabase.from('users').update({ is_suspended: true, is_validated: false, is_online: false }).eq('id', id)
    setAdminDrivers(prev => prev.map(d => d.id === id ? { ...d, is_suspended: true, is_validated: false } : d))
  }
  const activerPremium = async (id: string) => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('users').update({ is_premium: true, premium_expires_at: expiresAt }).eq('id', id)
    setAdminDrivers(prev => prev.map(d => d.id === id ? { ...d, is_premium: true, premium_expires_at: expiresAt } : d))
  }
  const desactiverPremium = async (id: string) => {
    await supabase.from('users').update({ is_premium: false, premium_expires_at: null }).eq('id', id)
    setAdminDrivers(prev => prev.map(d => d.id === id ? { ...d, is_premium: false, premium_expires_at: null } : d))
  }

  const uploadPhoto = async (dataUrl: string, path: string): Promise<string> => {
    const blob = await (await fetch(dataUrl)).blob()
    const { error } = await supabase.storage
      .from('drivers')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    const { data } = supabase.storage.from('drivers').getPublicUrl(path)
    return data.publicUrl
  }

  const processImageFile = async (
    file: File,
    maxDim: number,
    quality: number,
    checkQuality: boolean
  ): Promise<{ dataUrl: string; dark: boolean; tooSmall: boolean }> => {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file, {
        resizeWidth: maxDim,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      } as any)
      if (bitmap.height > maxDim) {
        const tall = await createImageBitmap(file, {
          resizeHeight: maxDim,
          resizeQuality: 'high',
          imageOrientation: 'from-image',
        } as any)
        bitmap.close()
        bitmap = tall
      }
    } catch {
      bitmap = await createImageBitmap(file)
    }
    const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); throw new Error('Canvas indisponible') }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    let dark = false
    if (checkQuality) {
      try {
        const pixels = ctx.getImageData(0, 0, w, h).data
        let total = 0; let count = 0
        for (let i = 0; i < pixels.length; i += 40) {
          total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
          count++
        }
        dark = count > 0 && total / count < 45
      } catch {}
    }
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const tooSmall = dataUrl.length < 8000
    canvas.width = 1
    canvas.height = 1
    return { dataUrl, dark, tooSmall }
  }

 const capturePhoto = (setter: (v: string) => void, useGallery = false, isIdCard = false) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (!useGallery) input.capture = isIdCard ? 'environment' : 'user'
    input.style.position = 'fixed'
    input.style.top = '-1000px'
    input.style.opacity = '0'
    document.body.appendChild(input)

    const cleanup = () => {
      if (document.body.contains(input)) document.body.removeChild(input)
    }

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      cleanup()
      if (!file) return
      setAuthError('')
      // Aucun décodage, aucun canvas : le fichier JPEG est gardé tel quel.
      // L'image 50MP n'est JAMAIS décodée en mémoire → crash impossible.
      const objectUrl = URL.createObjectURL(file)
      setter(objectUrl)
    }

    input.addEventListener('cancel', cleanup)
    setTimeout(() => input.click(), 100)
  }

  const saveUser = (u: AppUser) => { localStorage.setItem('tiaktiak_user', JSON.stringify(u)); setUser(u) }
  const changeLang = (code: string) => { setLang(code); localStorage.setItem('tiaktiak_lang', code) }

  const logout = async () => {
    if (user?.id && user.role === 'chauffeur') await supabase.from('users').update({ is_online: false }).eq('id', user.id)
    localStorage.removeItem('tiaktiak_user')
    setUser(null); setAuthScreen('roles'); setAuthMode('signup'); setMenuOpen(false)
    setScreen('accueil'); setIsOnline(false); setFormName(''); setFormPhone('')
    setAdminPass(''); setAuthError(''); setSignupStep(1)
    setFormIdFront(''); setFormIdBack(''); setFormProfilePhoto(''); setFormAddress('')
  }

  const loginClient = async () => {
    if (!formPhone) { setAuthError('Entre ton numero'); return }
    setAuthLoading(true); setAuthError('')
    const { data, error } = await supabase.from('users').select('id, name, phone, role').eq('phone', formPhone.trim()).eq('role', 'client').single()
    if (error || !data) setAuthError('Numero introuvable. Inscris-toi dabord.')
    else saveUser({ id: data.id, role: 'client', name: data.name, phone: data.phone })
    setAuthLoading(false)
  }

  const loginDriver = async () => {
    if (!formPhone) { setAuthError('Entre ton numero'); return }
    setAuthLoading(true); setAuthError('')
    const { data, error } = await supabase.from('users').select('id, name, phone, role').eq('phone', formPhone.trim()).eq('role', 'chauffeur').single()
    if (error || !data) setAuthError('Numero introuvable. Inscris-toi dabord.')
    else saveUser({ id: data.id, role: 'chauffeur', name: data.name, phone: data.phone })
    setAuthLoading(false)
  }

  const signupClient = async () => {
    if (!formName || !formPhone) { setAuthError('Remplis tous les champs'); return }
    setAuthLoading(true); setAuthError('')
    const { data, error } = await supabase.from('users').insert({ name: formName.trim(), phone: formPhone.trim(), role: 'client' }).select('id').single()
    if (error) {
      if (error.code === '23505') { setAuthError('Ce numero est deja utilise.'); setAuthMode('login') }
      else setAuthError('Erreur de connexion.')
      setAuthLoading(false); return
    }
    saveUser({ id: data.id, role: 'client', name: formName.trim(), phone: formPhone.trim() })
    setAuthLoading(false)
  }

 const signupDriver = async () => {
    if (!formName || !formPhone || !formMoto || !formColor || !formAddress) {
      setAuthError('Remplis tous les champs')
      return
    }
    setAuthLoading(true); setAuthError('')
    try {
      const { data, error } = await supabase.from('users').insert({
        name: formName.trim(),
        phone: formPhone.trim(),
        role: 'chauffeur',
        moto_type: formMoto.trim(),
        moto_color: formColor.trim(),
        home_address: formAddress.trim(),
      }).select('id').single()
      if (error) {
        if (error.code === '23505') {
          setAuthError('Ce numéro est déjà utilisé. Connecte-toi.')
          setAuthMode('login')
        } else {
          setAuthError('Erreur de connexion. Réessaie.')
        }
        setAuthLoading(false)
        return
      }
      saveUser({ id: data.id, role: 'chauffeur', name: formName.trim(), phone: formPhone.trim() })
    } catch {
      setAuthError('Erreur. Vérifie ta connexion et réessaie.')
    }
    setAuthLoading(false)
  }

  const loginAdmin = () => {
    if (adminPass.trim() === (process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '').trim()) saveUser({ role: 'admin', name: 'Omar', phone: '' })
    else setAuthError('Mot de passe incorrect')
  }

  const onSearch = (val: string) => {
    setQuery(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (val.length < 2) { setResults([]); return }
    setLoading(true)
   searchTimeout.current = setTimeout(async () => {
      const places = await searchPlaces(val, position.lat, position.lng)
      setResults(places)
      setLoading(false)
    }, 300)
  }

  const saveToHistory = async (place: Place) => {
    if (!user?.id) return
    const existing = await supabase.from('destination_history').select('id, visit_count').eq('client_id', user.id).eq('to_address', place.name).single()
    if (existing.data) {
      await supabase.from('destination_history').update({ visit_count: (existing.data.visit_count || 1) + 1, updated_at: new Date().toISOString() }).eq('id', existing.data.id)
    } else {
      const { data: count } = await supabase.from('destination_history').select('id', { count: 'exact' }).eq('client_id', user.id)
      if ((count?.length || 0) >= 4) {
        const { data: oldest } = await supabase.from('destination_history').select('id').eq('client_id', user.id).order('updated_at', { ascending: true }).limit(1).single()
        if (oldest) await supabase.from('destination_history').delete().eq('id', oldest.id)
      }
      await supabase.from('destination_history').insert({ client_id: user.id, to_address: place.name, to_lat: place.lat, to_lng: place.lng, visit_count: 1, updated_at: new Date().toISOString() })
    }
    loadFreqDests()
  }

  const selectPlace = (place: Place) => { setSelected(place); setQuery(''); setResults([]); checkFirstRide(); saveToHistory(place); setScreen('confirm') }
  const selectFreqDest = (dest: FreqDest) => {
    setSelected({ name: dest.address, lat: dest.lat, lng: dest.lng, address: dest.address })
    checkFirstRide()
    saveToHistory({ name: dest.address, lat: dest.lat, lng: dest.lng, address: dest.address })
    setScreen('confirm')
  }
  const goTo = (s: string) => { setScreen(s); setMenuOpen(false) }

  const km = selected ? haversineDistance(position.lat, position.lng, selected.lat, selected.lng) : 0
  const demandLevel: 'low' | 'medium' | 'high' = nearbyDrivers.length === 0 ? 'high' : nearbyDrivers.length <= 2 ? 'medium' : 'low'
  const demandMultiplier = demandLevel === 'high' ? 1.15 : 1
  const basePrice = selected ? Math.round((calculatePrice(km, service as 'moto' | 'livraison') * demandMultiplier) / 100) * 100 : 0
  const price = isFirstRide ? applyFirstRideDiscount(basePrice, true) : basePrice
  const eta = osrmEta > 0 ? osrmEta : (selected ? calculateETA(km) : 0)
  const referralCode = user ? 'TIAK-' + (user.phone.replace(/[^0-9]/g, '').slice(-4) || '0000') : 'TIAK-0000'

  useEffect(() => {
  fetch('/api/danger-zones')
    .then(r => r.json())
    .then(data => setDangerZones(data || []))
    .catch(() => {})
}, [])

  const shareReferral = () => {
    const text = 'Rejoins TIAK TIAK ! https://tiak-tiak-zeta.vercel.app'
    if ((navigator as any).share) (navigator as any).share({ title: 'TIAK TIAK', text }).catch(() => {})
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert('Lien copié !')).catch(() => {})
  }

  const declencherSOS = async (triggeredBy: 'client' | 'chauffeur') => {
    try {
      const currentRide = triggeredBy === 'client' ? currentClientRide : currentDriverRide
      const pos = triggeredBy === 'client' ? position : driverPosition

      // 1. Sauvegarder l'alerte + notifier admin
      await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ride_id: currentRide?.id || null,
          triggered_by: triggeredBy,
          triggered_by_name: user?.name || '',
          triggered_by_phone: user?.phone || '',
          other_party_name: triggeredBy === 'client' ? driverName : currentRide?.client_name || '',
          other_party_phone: triggeredBy === 'client' ? driverPhone : currentRide?.client_phone || '',
          lat: pos?.lat || null,
          lng: pos?.lng || null,
          address: pos?.address || position.address,
        }),
      })

      // 2. Envoyer WhatsApp au contact d'urgence
      if (emergencyPhone) {
        const mapsLink = `https://maps.google.com/?q=${pos?.lat},${pos?.lng}`
        const msg = encodeURIComponent(
          `🚨 URGENCE TIAK TIAK\n${user?.name} a déclenché une alerte SOS !\n📍 Position : ${mapsLink}\n📍 Adresse : ${pos?.address || position.address}\n🛵 Course : ${currentRide?.from_address || ''} → ${currentRide?.to_address || ''}\nAppelle immédiatement !`
        )
        window.open(`https://wa.me/221${emergencyPhone.replace(/\s/g, '').replace(/^0/, '')}?text=${msg}`, '_blank')
      }

      // 3. Activer enregistrement audio automatique
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        const chunks: BlobPart[] = []
        recorder.ondataavailable = e => chunks.push(e.data)
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const file = new File([blob], `sos_${Date.now()}.webm`)
          const { data } = await supabase.storage.from('sos-audio').upload(file.name, file)
          if (data) {
            const { data: url } = supabase.storage.from('sos-audio').getPublicUrl(file.name)
            await supabase.from('sos_alerts').update({ audio_url: url.publicUrl })
              .eq('triggered_by_phone', user?.phone || '')
              .eq('status', 'active')
          }
        }
        recorder.start()
        setTimeout(() => recorder.stop(), 120000) // 2 minutes d'enregistrement
      } catch {}

      alert('🚨 SOS envoyé ! Ton contact d\'urgence et l\'admin TIAK TIAK ont été alertés.')
    } catch {
      alert('Erreur SOS. Appelle directement le 17.')
    }
  }

  const commanderCourse = async () => {
    if (!selected || !user) return
    // Vérifier si le client est blacklisté
    const blackcheck = await fetch(`/api/blacklist?phone=${user.phone}`).then(r => r.json()).catch(() => ({ blacklisted: false }))
    if (blackcheck?.blacklisted) {
      alert('❌ Votre compte a été suspendu. Contactez le support TIAK TIAK.')
      return
    }
    if (position.lat === DEFAULT_POS.lat && position.lng === DEFAULT_POS.lng) {
      alert('Active ta position en haut de l\'écran avant de commander.')
      return
    }
    const hour = new Date().getHours()
    if (hour >= 22 || hour < 6) {
      if (!isVerified) {
        alert('🌙 Mode nuit sécurisé actif — vérifie ton profil pour commander la nuit.')
        return
      }
      // Selfie de contrôle client aussi la nuit
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        const video = document.createElement('video')
        video.srcObject = stream
        await video.play()
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 480
        canvas.getContext('2d')?.drawImage(video, 0, 0)
        const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.8))
        stream.getTracks().forEach(t => t.stop())
        const file = new File([blob], `controle_client_${user.phone}_${Date.now()}.jpg`, { type: 'image/jpeg' })
        await supabase.storage.from('selfies').upload(file.name, file)
        alert('✅ Contrôle de nuit validé — bonne course !')
      } catch {
        // Si caméra non disponible, on laisse passer (client vérifié suffit)
      }
    }
    setCommandLoading(true)
    const pin = generatePIN()
    const { data: rideData, error } = await supabase.from('rides').insert({
      client_id: user.id || null, client_name: user.name, client_phone: user.phone, client_is_verified: isVerified,
      service_type: service,
      from_lat: position.lat, from_lng: position.lng, from_address: position.address,
      to_lat: selected.lat, to_lng: selected.lng, to_address: selected.name,
      distance_km: Math.round(km * 100) / 100, price,
      commission: calculateCommission(price, false, service as 'moto' | 'livraison'),
      payment_method: payment, status: 'pending', pin_code: pin,
    }).select('id').single()
   if (error) alert('Erreur: ' + JSON.stringify(error))
    else {
      setCurrentRideId(rideData?.id || null)
      setClientPinCode(pin)
      setScreen('attente')

      // Envoyer notification push aux chauffeurs disponibles
      try {
        const { data: driversData } = await supabase
          .from('users')
          .select('fcm_token')
          .eq('role', 'chauffeur')
          .eq('is_online', true)
          .not('fcm_token', 'is', null)

        const tokens = (driversData || [])
          .map((d: any) => d.fcm_token)
          .filter(Boolean)

        if (tokens.length > 0) {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokens,
              title: '🛵 Nouvelle course !',
              body: `De ${position.address} → ${selected.name} — ${formatPrice(price)}`,
              data: { rideId: rideData?.id || '' },
            }),
          })
        }
      } catch {}
    }
    setCommandLoading(false)
  }

  const confirmerAnnulation = async () => {
    if (!cancelReason) return
    setCancelLoading(true)
    if (currentRideId) await supabase.from('rides').update({ status: 'cancelled', cancel_reason: cancelReason }).eq('id', currentRideId)
    setScreen('accueil'); setSelected(null); setCurrentRideId(null); setCancelReason('')
    setCurrentClientRide(null); setDriverArrived(false); setShowPinModal(false); setCancelLoading(false)
  }

  const demarrerSelfieAleatoire = () => {
    if (selfieCheckRef.current) clearTimeout(selfieCheckRef.current)
    const delai = (30 + Math.random() * 15) * 60 * 1000 // 30-45 min aléatoire
    selfieCheckRef.current = setTimeout(async () => {
      if (!isOnline || !user?.id) return
      const repondu = { value: false }
      const timeout = setTimeout(async () => {
        if (!repondu.value) {
          // Pas de réponse en 2 minutes — alerte admin
          await fetch('/api/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ride_id: currentDriverRide?.id || null,
              triggered_by: 'systeme',
              triggered_by_name: 'Selfie contrôle — pas de réponse',
              triggered_by_phone: user.phone || '',
              other_party_name: '',
              other_party_phone: '',
              lat: driverPosition.lat,
              lng: driverPosition.lng,
              address: 'Chauffeur ne répond pas au contrôle aléatoire',
            }),
          })
        }
      }, 2 * 60 * 1000)

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        const track = stream.getVideoTracks()[0]
        const imageCapture = new (window as any).ImageCapture(track)
        const blob = await imageCapture.takePhoto()
        track.stop()
        repondu.value = true
        clearTimeout(timeout)
        const file = new File([blob], `controle_aleatoire_${user.phone}_${Date.now()}.jpg`)
        await supabase.storage.from('selfies').upload(file.name, file)
        lastSelfieCheckRef.current = Date.now()
        demarrerSelfieAleatoire() // relancer le prochain contrôle
      } catch {
        repondu.value = true
        clearTimeout(timeout)
        demarrerSelfieAleatoire()
      }
    }, delai)
  }

  const toggleOnline = async () => {
    if (!user?.id) return
    setOnlineLoading(true)
    const newStatus = !isOnline

    // Mode nuit — selfie de contrôle obligatoire après 22h
    if (newStatus) {
      const hour = new Date().getHours()
      if (hour >= 22 || hour < 6) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true })
          const track = stream.getVideoTracks()[0]
          const imageCapture = new (window as any).ImageCapture(track)
          const blob = await imageCapture.takePhoto()
          track.stop()
          const file = new File([blob], `controle_${user.phone}_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const { error } = await supabase.storage.from('selfies').upload(file.name, file)
        if (error) {
            console.log('Selfie upload failed, continuing anyway')
          }
          alert('✅ Contrôle de nuit effectué — Bonne nuit de travail !')
        } catch {
          // Caméra non disponible — on laisse passer si chauffeur validé
        }
      }
    }

    await supabase.from('users').update({ is_online: newStatus }).eq('id', user.id)
    setIsOnline(newStatus)
    if (newStatus) {
      demarrerSelfieAleatoire()
    } else {
      if (selfieCheckRef.current) clearTimeout(selfieCheckRef.current)
    }
    setOnlineLoading(false)
  }

  const accepterCourse = async () => {
    if (!incomingRide || !user?.id) return
    setAcceptLoading(true)
    const rideCommission = freeTrialActive ? 0 : calculateCommission(incomingRide.price, isPremium, incomingRide.service_type as 'moto' | 'livraison')
    const { data, error } = await supabase.from('rides')
      .update({ status: 'accepted', driver_id: user.id, accepted_at: new Date().toISOString(), commission: rideCommission })
      .eq('id', incomingRide.id).eq('status', 'pending').select().single()
    if (error || !data) { alert('Course déjà prise !'); setIncomingRide(null) }
    else {
      setCurrentDriverRide(data as Ride); setIncomingRide(null)
      setNavStartPos(driverPosition)
      setDriverPhase('to_client'); setClientArrived(false); setRideCancelled(false)
      setShowPinEntry(false); setPinInput('')
      setScreen('driver_to_client')
      speak(`Course acceptée. Direction ${data.from_address}`)
    }
    setAcceptLoading(false)
  }

  const accepterCourseSuivante = async () => {
    if (!nextIncomingRide || !user?.id) return
    const rideCommission = freeTrialActive ? 0 : calculateCommission(nextIncomingRide.price, isPremium, nextIncomingRide.service_type as 'moto' | 'livraison')
    const { data, error } = await supabase.from('rides')
      .update({ status: 'accepted', driver_id: user.id, accepted_at: new Date().toISOString(), commission: rideCommission })
      .eq('id', nextIncomingRide.id).eq('status', 'pending').select().single()
    if (!error && data) {
      speak("Prochaine course confirmée !")
      setNextIncomingRide(data as Ride)
    }
    setShowNextRideBanner(false)
  }

  const refuserCourse = () => setIncomingRide(null)

  const demarrerCourse = async () => {
    if (!currentDriverRide?.id) return
    await supabase.from('rides').update({ status: 'in_progress', started_at: new Date().toISOString() } as any).eq('id', currentDriverRide.id)
    setNavStartPos(driverPosition)
    setDriverPhase('with_client'); setScreen('driver_course')
    speak(`Course démarrée. Direction ${currentDriverRide.to_address}`)
  }

  const terminerCourse = async () => {
    if (!currentDriverRide?.id) return
    await supabase.from('rides').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', currentDriverRide.id)
    if (user?.id) {
      const { data } = await supabase.from('users').select('total_rides').eq('id', user.id).single()
      if (data) await supabase.from('users').update({ total_rides: (data.total_rides || 0) + 1 }).eq('id', user.id)
    }
    await loadDriverStats()
    if (nextIncomingRide && (nextIncomingRide as any).status === 'accepted') {
      setCurrentDriverRide(nextIncomingRide as Ride)
      setNextIncomingRide(null)
      setNavStartPos(driverPosition)
      setDriverPhase('to_client'); setClientArrived(false)
      setShowPinEntry(false); setPinInput('')
      setScreen('driver_to_client')
    } else {
      setCurrentDriverRide(null); setDriverPhase('to_client'); setClientArrived(false)
      setShowPinEntry(false); setPinInput('')
      setScreen('chauffeur_accueil'); setDriverTab('accueil')
    }
  }

  const soumettreEvaluation = async () => {
    if (!currentRideId || clientRating === 0) return
    setEvalLoading(true)
    await supabase.from('rides').update({ client_rating: clientRating, client_comment: clientComment, client_report: clientReport }).eq('id', currentRideId)
    if (currentClientRide?.driver_id) {
      const { data } = await supabase.from('users').select('rating, total_rides').eq('id', currentClientRide.driver_id).single()
      if (data) {
        const totalRides = data.total_rides || 1
        const newRating = ((data.rating || 5) * (totalRides - 1) + clientRating) / totalRides
        await supabase.from('users').update({ rating: Math.round(newRating * 10) / 10 }).eq('id', currentClientRide.driver_id)
      }
    }
    setScreen('accueil'); setCurrentClientRide(null); setCurrentRideId(null)
    setClientRating(0); setClientComment(''); setClientReport(''); setEvalLoading(false); setDriverArrived(false)
  }

const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')

  const loadEmergencyContact = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('users').select('emergency_contact_name, emergency_contact_phone').eq('id', user.id).single()
    if (data) {
      setEmergencyName(data.emergency_contact_name || '')
      setEmergencyPhone(data.emergency_contact_phone || '')
    }
  }, [user?.id])

  useEffect(() => {
    if (user?.role === 'client') loadEmergencyContact()
  }, [user, loadEmergencyContact])
  const loadRides = async () => {
    if (!user?.id) return
    setRidesLoading(true)
    const { data, count } = await supabase.from('rides').select('*', { count: 'exact' }).eq('client_id', user.id).order('created_at', { ascending: false }).limit(20)
    if (data) setRides(data)
    if (count) setClientTotalRides(count)
    setRidesLoading(false)
  }

  const ouvrirWavePremium = () => window.open(WAVE_PAYMENT_LINK, '_blank')
  const ouvrirWaveCommission = () => window.open(WAVE_PAYMENT_LINK, '_blank')

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return { text: 'En attente', color: '#F59E0B' }
      case 'accepted': return { text: 'Acceptee', color: '#1DB954' }
      case 'in_progress': return { text: 'En cours', color: '#3B82F6' }
      case 'completed': return { text: 'Terminee', color: '#0F5138' }
      case 'cancelled': return { text: 'Annulee', color: '#EF4444' }
      default: return { text: status, color: '#9CA3AF' }
    }
  }

 const paymentLabel = (p: string) => {
    if (p === 'wave') return { icon: '/images/wave.png', name: 'Wave' }
    if (p === 'orange') return { icon: '/images/orange-money.png', name: 'Orange Money' }
    return { icon: '💵', name: 'Especes' }
  }

  const languages = [
    { code: 'fr', flag: '🇫🇷', name: 'Francais' },
    { code: 'wo', flag: '🇸🇳', name: 'Wolof' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'ar', flag: '🇸🇦', name: 'Arabe' },
    { code: 'es', flag: '🇪🇸', name: 'Espagnol' },
  ]

const OfflineBanner = () => isOffline ? (
    <div className="fixed top-0 left-0 right-0 z-[100] py-2 text-center text-xs font-bold text-white" style={{ background: '#EF4444' }}>
      📡 Connexion perdue — reconnexion en cours...
    </div>
  ) : null

  // ===== SPLASH =====
  if (!loaded) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5" style={{ background: '#0F5138' }}>
      <LogoIcon size={96} />
      <LogoWordmark size={42} onDark={true} />
    </div>
  )

 // ===== GPS OBLIGATOIRE =====
  
   // ===== AUTH =====
  if (!user) {
    if (authScreen === 'roles') return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
          <LogoIcon size={88} />
          <LogoWordmark size={38} onDark={false} />
          <p className="text-gray-400 text-sm text-center">Transport moto rapide à votre service</p>
        </div>
        <div className="px-8 pb-10 space-y-3">
          <button onClick={() => { setAuthScreen('client'); setAuthMode('signup'); setAuthError(''); setFormName(''); setFormPhone('') }} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#0F5138' }}>
            <User size={20} /> Je suis un Client
          </button>
          <button onClick={() => { setAuthScreen('chauffeur'); setAuthMode('signup'); setAuthError(''); setFormName(''); setFormPhone(''); setFormMoto(''); setFormColor(''); setSignupStep(1) }} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#111111' }}>
            <Zap size={20} color="#1DB954" /> Je suis un Chauffeur
          </button>
          <button onClick={() => { setAuthScreen('admin'); setAuthError('') }} className="w-full text-center text-gray-400 text-sm pt-2">Acces administrateur</button>
        </div>
      </div>
    )

    if (authScreen === 'client') return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setAuthScreen('roles')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">{authMode === 'signup' ? 'Inscription Client' : 'Connexion Client'}</span>
        </header>
        <div className="px-6 pt-5">
          <div className="flex bg-gray-100 rounded-2xl p-1">
            <button onClick={() => { setAuthMode('signup'); setAuthError('') }} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: authMode === 'signup' ? '#0F5138' : 'transparent', color: authMode === 'signup' ? 'white' : '#9CA3AF' }}>S&apos;inscrire</button>
            <button onClick={() => { setAuthMode('login'); setAuthError('') }} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: authMode === 'login' ? '#0F5138' : 'transparent', color: authMode === 'login' ? 'white' : '#9CA3AF' }}>Se connecter</button>
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
         <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: '#E8F5E9' }}><User size={28} color="#0F5138" /></div>
          {authMode === 'signup' && <div><label className="text-sm font-semibold text-gray-600">Nom complet</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Omar Ngalla" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>}
          <div><label className="text-sm font-semibold text-gray-600">Telephone</label><input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Ex: 77 097 01 00" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
          {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={authMode === 'signup' ? signupClient : loginClient} disabled={authLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: authLoading ? '#7aaa94' : '#0F5138' }}>
            {authLoading ? 'Chargement...' : authMode === 'signup' ? 'Creer mon compte' : 'Se connecter'}
          </button>
        </div>
      </div>
    )

    if (authScreen === 'chauffeur') return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => { setAuthScreen('roles'); setAuthError('') }}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">{authMode === 'signup' ? 'Inscription Chauffeur' : 'Connexion Chauffeur'}</span>
        </header>
        {authMode === 'login' ? (
          <>
            <div className="flex-1 p-6 space-y-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: '#E8F5E9' }}><Zap size={28} color="#0F5138" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Telephone</label><input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Ex: 77 123 45 67" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
              {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
              <button onClick={() => { setAuthMode('signup'); setAuthError('') }} className="w-full text-center text-sm" style={{ color: '#0F5138' }}>Pas encore inscrit ?</button>
            </div>
            <div className="p-4 border-t border-gray-100"><button onClick={loginDriver} disabled={authLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#111111' }}>{authLoading ? 'Chargement...' : 'Se connecter'}</button></div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: '#E8F5E9' }}><Zap size={28} color="#0F5138" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Nom complet</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Moussa Diallo" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Telephone</label><input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="Ex: 77 123 45 67" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Adresse domicile</label><input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Ex: Pikine, Dakar" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Type de moto</label><input value={formMoto} onChange={e => setFormMoto(e.target.value)} placeholder="Ex: Jakarta 125cc" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Couleur moto</label><input value={formColor} onChange={e => setFormColor(e.target.value)} placeholder="Ex: Rouge" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
              <div className="rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
                <p className="font-bold text-sm mb-2" style={{ color: '#0F5138' }}>Commission</p>
                <p className="text-xs text-gray-600">Moto &lt; 2000F → 100F · 2000-4999F → 200F · ≥5000F → 400F</p>
                <p className="text-xs text-gray-600">Livraison &lt; 3000F → 200F · ≥3000F → 500F</p>
                <p className="text-xs text-gray-600">Premium → 100F moto / 200F livraison fixe</p>
              </div>
              {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
              <button onClick={() => { setAuthMode('login'); setAuthError('') }} className="w-full text-center text-sm" style={{ color: '#0F5138' }}>Deja inscrit ? Se connecter</button>
            </div>
            <div className="p-4 border-t border-gray-100">
              <button onClick={signupDriver} disabled={authLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: authLoading ? '#7aaa94' : '#111111' }}>
                {authLoading ? 'Inscription...' : "S'inscrire"}
              </button>
            </div>
          </>
        )}
      </div>
    )

    if (authScreen === 'admin') return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setAuthScreen('roles')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Connexion Admin</span>
        </header>
        <div className="flex-1 p-6 space-y-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: '#E8F5E9' }}><Shield size={28} color="#0F5138" /></div>
          <div><label className="text-sm font-semibold text-gray-600">Mot de passe</label><input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Mot de passe admin" className="w-full mt-1 px-4 py-3 bg-gray-100 rounded-xl outline-none" /></div>
          {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={loginAdmin} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>Acceder</button>
        </div>
      </div>
    )
  }

  // ===== ADMIN =====
  if (user && user.role === 'admin') {
    if (selectedRide) return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setSelectedRide(null)}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Détail course</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>👤 Client</p>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Nom</span><span className="text-sm font-bold">{selectedRide.client_name || 'Inconnu'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Telephone</span><span className="text-sm font-bold">{selectedRide.client_phone || 'Inconnu'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">ID Client</span><span className="text-xs font-mono">{selectedRide.client_id || '-'}</span></div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>🛵 Chauffeur</p>
            <div className="flex justify-between"><span className="text-sm text-gray-500">ID Chauffeur</span><span className="text-xs font-mono">{selectedRide.driver_id || 'Non assigné'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">PIN verifie</span><span className="text-sm font-bold">{selectedRide.pin_verified ? '✅ Oui' : '❌ Non'}</span></div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>📍 Trajet</p>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: '#1DB954' }} /><span className="text-sm">{selectedRide.from_address}</span></div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-sm">{selectedRide.to_address}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Distance</span><span className="text-sm font-bold">{selectedRide.distance_km} km</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Coordonnees depart</span><span className="text-xs font-mono">{selectedRide.from_lat?.toFixed(5)}, {selectedRide.from_lng?.toFixed(5)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Coordonnees arrivee</span><span className="text-xs font-mono">{selectedRide.to_lat?.toFixed(5)}, {selectedRide.to_lng?.toFixed(5)}</span></div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>💰 Financier</p>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Service</span><span className="text-sm font-bold">{selectedRide.service_type === 'moto' ? '🏍️ Moto-taxi' : '📦 Livraison'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Prix</span><span className="text-sm font-bold" style={{ color: '#0F5138' }}>{formatPrice(selectedRide.price)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Commission</span><span className="text-sm font-bold text-orange-500">{formatPrice(selectedRide.commission || 0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Paiement</span><span className="text-sm font-bold">{paymentLabel(selectedRide.payment_method || 'cash').name}</span></div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>ℹ️ Statut</p>
            <div className="flex justify-between"><span className="text-sm text-gray-500">ID Course</span><span className="text-xs font-mono">{selectedRide.id}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Statut</span><span className="text-sm font-bold">{statusLabel(selectedRide.status).text}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Date</span><span className="text-sm font-bold">{formatDate(selectedRide.created_at)}</span></div>
            {selectedRide.cancel_reason && <div className="flex justify-between"><span className="text-sm text-gray-500">Annulation</span><span className="text-sm font-bold text-red-500">{selectedRide.cancel_reason}</span></div>}
          </div>
          {selectedRide.client_rating && (
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <p className="font-bold text-sm" style={{ color: '#0F5138' }}>⭐ Évaluation</p>
              <div className="flex items-center gap-1">{[1,2,3,4,5].map(s => <Star key={s} size={16} color="#F59E0B" fill={s <= selectedRide.client_rating! ? '#F59E0B' : 'none'} />)}</div>
              {selectedRide.client_comment && <p className="text-sm text-gray-600 italic">&quot;{selectedRide.client_comment}&quot;</p>}
              {selectedRide.client_report && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">{REPORT_OPTIONS.find(r => r.id === selectedRide.client_report)?.label}</span>}
            </div>
          )}
        </div>
      </div>
    )

    if (selectedDriver) return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setSelectedDriver(null)}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Profil Chauffeur</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center gap-3">
            {selectedDriver.profile_photo ? <img src={selectedDriver.profile_photo} alt="Profil" className="w-24 h-24 rounded-full object-cover border-4" style={{ borderColor: '#0F5138' }} /> : <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl" style={{ background: '#0F5138' }}>🛵</div>}
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center">
                <p className="font-black text-xl">{selectedDriver.name}</p>
                {selectedDriver.is_premium && <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#1D6BF5' }}>✓ PREMIUM</span>}
              </div>
              <div className="flex items-center gap-1 justify-center mt-1">
                {[1,2,3,4,5].map(s => <Star key={s} size={14} color="#F59E0B" fill={s <= Math.round(selectedDriver.rating || 5) ? '#F59E0B' : 'none'} />)}
                <span className="text-sm text-gray-500 ml-1">{(selectedDriver.rating || 5).toFixed(1)} • {selectedDriver.total_rides || 0} courses</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>Informations complètes</p>
            <div className="flex justify-between"><span className="text-sm text-gray-500">ID</span><span className="text-xs font-mono">{selectedDriver.id}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Telephone</span><span className="text-sm font-bold">{selectedDriver.phone}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Domicile</span><span className="text-sm font-bold text-right flex-1 ml-4">{selectedDriver.home_address || 'Non renseigne'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Moto</span><span className="text-sm font-bold">{selectedDriver.moto_type} • {selectedDriver.moto_color}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Inscrit le</span><span className="text-sm font-bold">{formatDate(selectedDriver.created_at)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Statut</span><span className="text-sm font-bold">{selectedDriver.is_suspended ? '🔴 Suspendu' : selectedDriver.is_validated ? '🟢 Valide' : '🟡 En attente'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">En ligne</span><span className="text-sm font-bold">{selectedDriver.is_online ? '🟢 Oui' : '⚫ Non'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">3J Gratuits</span><span className="text-sm font-bold">{selectedDriver.free_trial_used ? (selectedDriver.free_trial_end && new Date(selectedDriver.free_trial_end) > new Date() ? `✅ Actif — ${formatCountdown(selectedDriver.free_trial_end)}` : '✅ Utilisé') : '❌ Non utilisé'}</span></div>
            {selectedDriver.is_premium && selectedDriver.premium_expires_at && <div className="flex justify-between"><span className="text-sm text-gray-500">Premium expire</span><span className="text-sm font-bold text-blue-500">{new Date(selectedDriver.premium_expires_at).toLocaleDateString('fr-FR')}</span></div>}
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>Pièce d&apos;identité</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-gray-400 mb-1">Recto</p>{selectedDriver.id_card_front ? <img src={selectedDriver.id_card_front} alt="CNI recto" className="w-full h-28 object-cover rounded-xl" /> : <div className="w-full h-28 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Non fourni</div>}</div>
              <div><p className="text-xs text-gray-400 mb-1">Verso</p>{selectedDriver.id_card_back ? <img src={selectedDriver.id_card_back} alt="CNI verso" className="w-full h-28 object-cover rounded-xl" /> : <div className="w-full h-28 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Non fourni</div>}</div>
            </div>
          </div>
          <div className="space-y-2">
            {!selectedDriver.is_validated && !selectedDriver.is_suspended && <button onClick={() => { validerChauffeur(selectedDriver.id); setSelectedDriver({ ...selectedDriver, is_validated: true }) }} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#0F5138' }}><CheckCircle size={18} /> Valider</button>}
            {selectedDriver.is_validated && !selectedDriver.is_suspended && <button onClick={() => { suspendreCharffeur(selectedDriver.id); setSelectedDriver({ ...selectedDriver, is_suspended: true }) }} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 bg-yellow-500"><AlertTriangle size={18} /> Suspendre</button>}
            {selectedDriver.is_suspended && <button onClick={() => { validerChauffeur(selectedDriver.id); setSelectedDriver({ ...selectedDriver, is_suspended: false, is_validated: true }) }} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#0F5138' }}><CheckCircle size={18} /> Reactiver</button>}
            {!selectedDriver.is_premium ? <button onClick={() => { activerPremium(selectedDriver.id); const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); setSelectedDriver({ ...selectedDriver, is_premium: true, premium_expires_at: exp }) }} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#1D6BF5' }}><Award size={18} /> Activer Premium</button> : <button onClick={() => { desactiverPremium(selectedDriver.id); setSelectedDriver({ ...selectedDriver, is_premium: false, premium_expires_at: null }) }} className="w-full py-3 rounded-2xl font-bold bg-blue-50 text-blue-500 flex items-center justify-center gap-2"><X size={18} /> Retirer Premium</button>}
            <button onClick={() => { exclureChauffeur(selectedDriver.id); setSelectedDriver(null) }} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 bg-red-500"><Ban size={18} /> Exclure</button>
          </div>
        </div>
      </div>
    )

    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <span className="text-xl font-black italic" style={{ color: '#0F5138' }}>TIAK TIAK Admin</span>
          <button onClick={logout} className="flex items-center gap-1 text-red-500 text-sm font-semibold"><LogOut size={18} /> Quitter</button>
        </header>
        <div className="bg-white px-3 pb-3 flex gap-1.5 border-b border-gray-100">
          {[{ key: 'stats', label: 'Stats', icon: TrendingUp }, { key: 'chauffeurs', label: 'Chauffeurs', icon: Users }, { key: 'courses', label: 'Courses', icon: List }, { key: 'evaluations', label: 'Avis', icon: Star }, { key: 'selfies', label: 'Selfies', icon: Camera }].map(tab => (
            <button key={tab
              .key} onClick={() => { setAdminTab(tab.key as any); loadAdminData() }} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl font-bold text-xs" style={{ background: adminTab === tab.key ? '#0F5138' : '#F5F5F5', color: adminTab === tab.key ? 'white' : '#9CA3AF' }}>
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {adminTab === 'stats' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-700">Aujourd&apos;hui</h2>
                <button onClick={loadAdminData} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#E8F5E9', color: '#0F5138' }}>{adminLoading ? '...' : 'Actualiser'}</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>{adminStats.courses}</p><p className="text-xs text-gray-400">Courses</p></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>{adminStats.chauffeurs}</p><p className="text-xs text-gray-400">En ligne</p></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>{adminStats.clients}</p><p className="text-xs text-gray-400">Clients</p></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(adminStats.commissions)}</p><p className="text-xs text-gray-400">Commissions</p></div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="font-bold text-sm mb-1">Paiements</p><p className="text-sm text-gray-500">Wave / Orange : 77 097 01 00</p></div>
            </>
          )}
          {adminTab === 'chauffeurs' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-700">Chauffeurs ({adminDrivers.length})</h2>
                <button onClick={loadAdminData} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#E8F5E9', color: '#0F5138' }}>Actualiser</button>
              </div>
              {adminLoading ? <div className="text-center py-10 text-gray-400 text-sm">Chargement...</div> : adminDrivers.map(driver => (
                <button key={driver.id} onClick={() => setSelectedDriver(driver)} className="w-full bg-white rounded-2xl p-4 shadow-sm text-left">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {driver.profile_photo ? <img src={driver.profile_photo} alt="" className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#0F5138' }}><span className="text-xl">🛵</span></div>}
                      {driver.is_premium && <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs" style={{ background: '#1D6BF5' }}>✓</div>}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{driver.name}</p>
                      <p className="text-xs text-gray-400">{driver.phone} • {driver.moto_type}</p>
                      <div className="flex items-center gap-1 mt-0.5"><Star size={10} color="#F59E0B" fill="#F59E0B" /><span className="text-xs text-gray-500">{(driver.rating || 5).toFixed(1)} • {driver.total_rides || 0} courses</span></div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {driver.is_suspended ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-500">Suspendu</span> : driver.is_validated ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600">Valide</span> : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-600">En attente</span>}
                      {driver.is_online && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#E8F5E9', color: '#1DB954' }}>En ligne</span>}
                      <ChevronRight size={16} color="#D1D5DB" />
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
          {adminTab === 'courses' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-700">Courses</h2>
                <button onClick={loadAdminData} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#E8F5E9', color: '#0F5138' }}>Actualiser</button>
              </div>
              {adminRides.map(ride => {
                const st = statusLabel(ride.status)
                return (
                  <button key={ride.id} onClick={() => setSelectedRide(ride)} className="w-full bg-white rounded-2xl p-4 shadow-sm text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{ride.service_type === 'moto' ? '🏍️' : '📦'} {ride.service_type === 'moto' ? 'Moto-taxi' : 'Livraison'}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: st.color }}>{st.text}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: '#1DB954' }} /><span className="text-xs text-gray-500 truncate">{ride.from_address}</span></div>
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-gray-500 truncate">{ride.to_address}</span></div>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-gray-50">
                      <div><p className="text-xs text-gray-400">{formatDate(ride.created_at)}</p><p className="text-xs text-gray-500 font-semibold">{ride.client_name || 'Client'}</p></div>
                      <div className="flex items-center gap-2"><span className="font-black text-sm" style={{ color: '#0F5138' }}>{formatPrice(ride.price)}</span><ChevronRight size={14} color="#D1D5DB" /></div>
                    </div>
                  </button>
                )
              })}
            </>
          )}
          {adminTab === 'evaluations' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-700">Avis clients</h2>
                <button onClick={loadAdminData} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#E8F5E9', color: '#0F5138' }}>Actualiser</button>
              </div>
              {adminEvals.map(eval_ => {
                const driver = adminDrivers.find(d => d.id === eval_.driver_id)
                return (
                  <div key={eval_.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                    {driver && (
                      <button onClick={() => setSelectedDriver(driver)} className="w-full flex items-center gap-3 pb-3 border-b border-gray-50 text-left">
                        {driver.profile_photo ? <img src={driver.profile_photo} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#0F5138' }}><Zap size={16} color="white" /></div>}
                        <div className="flex-1">
                          <p className="font-bold text-sm">{driver.name}</p>
                          <p className="text-xs text-gray-400">{driver.phone} • {driver.moto_type}</p>
                        </div>
                        <ChevronRight size={16} color="#D1D5DB" />
                      </button>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">{[1,2,3,4,5].map(s => <Star key={s} size={14} color="#F59E0B" fill={s <= (eval_.client_rating || 0) ? '#F59E0B' : 'none'} />)}<span className="text-xs font-bold ml-1" style={{ color: '#0F5138' }}>{eval_.client_rating}/5</span></div>
                      <span className="text-xs text-gray-400">{formatDate(eval_.created_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500">{eval_.from_address} → {eval_.to_address}</p>
                    {eval_.client_comment && <div className="rounded-xl p-3" style={{ background: '#F9FAFB' }}><p className="text-sm text-gray-700 italic">&quot;{eval_.client_comment}&quot;</p></div>}
                    {eval_.client_report && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">{REPORT_OPTIONS.find(r => r.id === eval_.client_report)?.label}</span>}
                  </div>
                )
              })}
            </>
          )}
          {adminTab === 'selfies' && (
            <div className="space-y-3">
              <p className="font-black text-sm text-gray-800">🪪 Selfies à valider ({pendingSelfies.length})</p>
              {pendingSelfies.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Aucun selfie en attente</p>}
              {pendingSelfies.map(u => (
                <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><User size={20} color="#9CA3AF" /></div>
                    <div><p className="font-bold text-sm">{u.name}</p><p className="text-xs text-gray-400">{u.phone}</p></div>
                  </div>
                  {u.verification_selfie && (
                    <img src={u.verification_selfie} alt="Selfie" className="w-full h-48 object-cover rounded-xl" />
                  )}
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      await supabase.from('users').update({ is_verified: true, verified_at: new Date().toISOString(), verification_status: 'approved' }).eq('id', u.id)
                      setPendingSelfies(prev => prev.filter(s => s.id !== u.id))
                    }} className="flex-1 py-2 rounded-xl font-bold text-white text-sm" style={{ background: '#1DB954' }}>✅ Valider</button>
                    <button onClick={async () => {
                      await supabase.from('users').update({ verification_status: 'rejected' }).eq('id', u.id)
                      setPendingSelfies(prev => prev.filter(s => s.id !== u.id))
                    }} className="flex-1 py-2 rounded-xl font-bold text-white text-sm bg-red-500">❌ Rejeter</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  // ===== CHAUFFEUR =====
  if (user && user.role === 'chauffeur') {

    if (screen === 'premium_page') return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="px-4 py-4 flex items-center gap-3 border-b bg-white border-gray-100">
          <button onClick={() => setScreen('chauffeur_accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Plan Premium</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 text-center" style={{ background: 'linear-gradient(135deg, #1D6BF5, #0F5138)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(255,255,255,0.15)' }}><Award size={32} color="white" /></div>
            <p className="text-blue-100 text-sm font-semibold mb-1">ABONNEMENT MENSUEL</p>
            <div className="flex items-end justify-center gap-1 mb-1">
              <span className="text-5xl font-black text-white">5 000</span>
              <span className="text-white text-xl font-bold mb-1">FCFA</span>
            </div>
            <p className="text-blue-200 text-sm">par mois</p>
          </div>
          <div className="p-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="font-black text-sm mb-3" style={{ color: '#0F5138' }}>Ce que tu obtiens :</p>
              <div className="space-y-3">
                {PREMIUM_BENEFITS.map((b, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{b.icon}</span>
                    <p className="text-sm text-gray-700">{b.text}</p>
                  </div>
                ))}
              </div>
            </div>
            {isPremium && !freeTrialUsed && (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                <div className="flex items-center gap-2"><span className="text-2xl">🎯</span><div><p className="font-black text-white">3 Jours GRATUITS</p><p className="text-yellow-100 text-xs">Activer une seule fois </p></div></div>
                <button onClick={activerFreeTrial} disabled={trialActivating} className="w-full py-3 rounded-xl font-black text-orange-600 bg-white">
                  {trialActivating ? 'Activation...' : '🚀 Activer mes 3 jours gratuits'}
                </button>
              </div>
            )}
            {isPremium && freeTrialActive && freeTrialEnd && (
              <div className="rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
                <p className="font-black text-sm" style={{ color: '#0F5138' }}>🎯 3J Gratuits actifs !</p>
                <p className="text-2xl font-black mt-1" style={{ color: '#0F5138' }}>{formatCountdown(freeTrialEnd)}</p>
              </div>
            )}
            {!isPremium && <button onClick={ouvrirWavePremium} className="w-full py-4 rounded-2xl font-black text-white text-lg flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #1D6BF5, #0F5138)' }}>📱 Souscrire via Wave — 5000 FCFA</button>}
            {isPremium && premiumExpiresAt && (
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <p className="text-xs text-gray-400">Premium actif jusqu&apos;au</p>
                <p className="font-black text-base" style={{ color: '#1D6BF5' }}>{new Date(premiumExpiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                <p className="text-xs text-gray-400 mt-1">Reste : {formatCountdown(premiumExpiresAt)}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 text-center px-4">Après paiement Wave, envoie une capture à l&apos;admin pour activation</p>
          </div>
        </div>
      </div>
    )

    if (showPinEntry && clientArrived) return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#E8F5E9' }}><Lock size={36} color="#0F5138" /></div>
          <div className="text-center">
            <h2 className="text-2xl font-black" style={{ color: '#0F5138' }}>Code PIN client</h2>
            <p className="text-gray-400 text-sm mt-2">Demande le code PIN au client</p>
          </div>
          <div className="flex gap-3">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black border-2" style={{ borderColor: pinError ? '#EF4444' : pinInput.length > i ? '#1DB954' : '#E5E7EB', background: pinInput.length > i ? '#E8F5E9' : 'white', color: '#0F5138' }}>
                {pinInput.length > i ? '●' : ''}
              </div>
            ))}
          </div>
          {pinError && <p className="text-red-500 font-bold text-sm">❌ Code incorrect !</p>}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
              <button key={i} onClick={() => {
                if (k === '⌫') setPinInput(p => p.slice(0, -1))
                else if (k !== '' && pinInput.length < 4) setPinInput(p => p + k)
              }} className="h-14 rounded-2xl font-black text-xl flex items-center justify-center" style={{ background: k === '' ? 'transparent' : '#F5F5F5', color: '#111' }}>{k}</button>
            ))}
          </div>
          <button onClick={verifierPin} disabled={pinInput.length < 4} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: pinInput.length < 4 ? '#D1D5DB' : '#0F5138' }}>Valider</button>
        </div>
      </div>
    )

    if (rideCancelled) return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-6 bg-gray-100">
        <div className="w-24 h-24 rounded-full flex items-center justify-center bg-red-100"><XCircle size={48} color="#EF4444" /></div>
        <h2 className="text-2xl font-black text-gray-800 text-center">Course annulée !</h2>
        <p className="text-sm text-gray-500 text-center">Le client a annulé.</p>
        <button onClick={() => { setRideCancelled(false); setDriverTab('accueil') }} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>Retour au dashboard</button>
      </div>
    )

    if (isSuspended) return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="px-4 py-4 flex items-center justify-between" style={{ background: '#0F5138' }}>
          <span className="text-xl font-black italic text-white">TIAK TIAK</span>
          <button onClick={logout} className="flex items-center gap-1 text-green-200 text-sm"><LogOut size={18} /> Quitter</button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
          <Ban size={60} color="#EF4444" />
          <h2 className="text-xl font-black text-gray-800 text-center">Compte suspendu</h2>
          <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="w-full py-4 rounded-2xl font-bold text-white text-center" style={{ background: '#0F5138' }}>Contacter le support</a>
        </div>
      </div>
    )

    if (!isValidated && !isSuspended) {
      const dossierComplet = !!(formIdFront && formIdBack && formProfilePhoto)
      return (
        <div className="fixed inset-0 flex flex-col bg-gray-100">
          <header className="px-4 py-4 flex items-center justify-between" style={{ background: '#0F5138' }}>
            <span className="text-xl font-black italic text-white">TIAK TIAK</span>
            <button onClick={logout} className="flex items-center gap-1 text-green-200 text-sm"><LogOut size={16} /> Quitter</button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#E8F5E9' }}><FileText size={28} color="#0F5138" /></div>
              <p className="font-black text-lg" style={{ color: '#0F5138' }}>Complete ton dossier</p>
              <p className="text-gray-400 text-sm mt-1">Uploade tes documents pour être validé</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-600">CNI Recto</p>
                  {formIdFront && <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: '#E8F5E9' }}><CheckCircle size={12} color="#1DB954" /><span className="text-xs font-bold" style={{ color: '#0F5138' }}>Approuvé</span></div>}
                </div>
                {formIdFront ? (
                  <div className="relative">
                    <img src={formIdFront} alt="CNI recto" className="w-full h-44 object-cover rounded-2xl" style={{ border: '2px solid #1DB954' }} />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#1DB954' }}><CheckCircle size={16} color="white" /></div>
                      <button onClick={() => setFormIdFront('')} className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center"><X size={14} color="white" /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => capturePhoto(setFormIdFront, false, true)} className="w-full h-44 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-3 relative" style={{ background: '#FAFAFA' }}>
                    <Camera size={28} color="#9CA3AF" />
                    <span className="text-sm text-gray-400 font-medium">Prendre la photo recto</span>
                    <span className="text-xs text-gray-300">Place la CNI dans le cadre</span>
                  </button>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-600">CNI Verso</p>
                  {formIdBack && <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: '#E8F5E9' }}><CheckCircle size={12} color="#1DB954" /><span className="text-xs font-bold" style={{ color: '#0F5138' }}>Approuvé</span></div>}
                </div>
                {formIdBack ? (
                  <div className="relative">
                    <img src={formIdBack} alt="CNI verso" className="w-full h-44 object-cover rounded-2xl" style={{ border: '2px solid #1DB954' }} />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#1DB954' }}><CheckCircle size={16} color="white" /></div>
                      <button onClick={() => setFormIdBack('')} className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center"><X size={14} color="white" /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => capturePhoto(setFormIdBack, false, true)} className="w-full h-44 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-3" style={{ background: '#FAFAFA' }}>
                    <Camera size={28} color="#9CA3AF" />
                    <span className="text-sm text-gray-400 font-medium">Prendre la photo verso</span>
                    <span className="text-xs text-gray-300">Place la CNI dans le cadre</span>
                  </button>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-600">Photo de profil</p>
                  {formProfilePhoto && <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: '#E8F5E9' }}><CheckCircle size={12} color="#1DB954" /><span className="text-xs font-bold" style={{ color: '#0F5138' }}>Approuvé</span></div>}
                </div>
                {formProfilePhoto ? (
                  <div className="relative flex justify-center">
                    <img src={formProfilePhoto} alt="Profil" className="w-40 h-40 object-cover rounded-full border-4" style={{ borderColor: '#0F5138' }} />
                    <button onClick={() => setFormProfilePhoto('')} className="absolute top-0 right-12 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center"><X size={16} color="white" /></button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={() => capturePhoto(setFormProfilePhoto)} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center gap-3"><Camera size={24} color="#9CA3AF" /><span className="text-sm text-gray-500 font-semibold">Prendre une photo</span></button>
                    <button onClick={() => capturePhoto(setFormProfilePhoto, true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center gap-3"><Globe size={22} color="#9CA3AF" /><span className="text-sm text-gray-500 font-semibold">Choisir depuis la galerie</span></button>
                  </div>
                )}
              </div>
              {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
            </div>
          </div>
          <div className="p-4 bg-white border-t border-gray-100">
            <button
              onClick={async () => {
                if (!dossierComplet) { setAuthError('Uploade les 3 documents'); return }
                setAuthLoading(true); setAuthError('')
                try {
                  const [frontUrl, backUrl, profileUrl] = await Promise.all([
                    uploadPhoto(formIdFront, `${user.id}/id_front.jpg`),
                    uploadPhoto(formIdBack, `${user.id}/id_back.jpg`),
                    uploadPhoto(formProfilePhoto, `${user.id}/profile.jpg`),
                  ])
                  await supabase.from('users').update({
                    id_card_front: frontUrl,
                    id_card_back: backUrl,
                    profile_photo: profileUrl
                  }).eq('id', user.id!)
                  setScreen('chauffeur_accueil')
                } catch {
                  setAuthError('Erreur upload. Vérifie ta connexion.')
                }
                setAuthLoading(false)
              }}
              disabled={!dossierComplet || authLoading}
              className="w-full py-4 rounded-2xl font-bold text-white"
              style={{ background: !dossierComplet || authLoading ? '#D1D5DB' : '#0F5138' }}
            >
              {authLoading ? 'Upload en cours...' : 'Soumettre mon dossier'}
            </button>
          </div>
        </div>
      )
    }
    
    if (!isValidated) return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="px-4 py-4 flex items-center justify-between" style={{ background: '#0F5138' }}>
          <span className="text-xl font-black italic text-white">TIAK TIAK</span>
          <button onClick={logout} className="flex items-center gap-1 text-green-200 text-sm"><LogOut size={18} /> Quitter</button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#E8F5E9' }}><Clock size={40} color="#0F5138" /></div>
          <h2 className="text-xl font-black text-gray-800 text-center">Dossier en cours de validation</h2>
          <p className="text-sm text-gray-500 text-center">Bonjour {user.name} ! Vérification sous 24h.</p>
          <div className="w-full rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
            <div className="flex items-center gap-2 mb-1"><Check size={14} color="#1DB954" /><span className="text-xs text-gray-600">Inscription soumise</span></div>
            <div className="flex items-center gap-2 mb-1"><Clock size={14} color="#F59E0B" /><span className="text-xs text-gray-600">Vérification en cours</span></div>
            <div className="flex items-center gap-2"><Clock size={14} color="#D1D5DB" /><span className="text-xs text-gray-400">Activation du compte</span></div>
          </div>
          <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="text-sm font-bold" style={{ color: '#0F5138' }}>Contacter le support</a>
        </div>
      </div>
    )

    if (incomingRide) return (
      <div className="fixed inset-0 flex flex-col" style={{ background: '#0F5138' }}>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="relative flex items-center justify-center">
            <div className="absolute rounded-full" style={{ width: '140px', height: '140px', background: 'rgba(29,185,84,0.2)', animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}><span className="text-5xl">{incomingRide.service_type === 'livraison' ? '📦' : '🛵'}</span></div>
          </div>
          <div className="text-center">
            <p className="text-green-200 text-sm font-semibold mb-1">NOUVELLE {incomingRide.service_type === 'livraison' ? 'LIVRAISON' : 'COURSE'} !</p>
{(incomingRide as any).client_is_verified && (
  <div className="flex items-center gap-1 bg-green-400 bg-opacity-20 px-3 py-1 rounded-full mb-1">
    <CheckCircle size={12} color="#1DB954" />
    <span className="text-xs font-bold text-green-300">Client vérifié ✓</span>
  </div>
)}
            <h2 className="text-2xl font-black text-white mb-1">{formatPrice(incomingRide.price)}</h2>
            <p className="text-green-200 text-sm">{incomingRide.distance_km} km • {incomingRide.service_type === 'moto' ? 'Moto-taxi' : 'Livraison'}</p>
            <p className="text-green-300 text-xs mt-1">Commission : {freeTrialActive ? '0 FCFA 🎉' : formatPrice(calculateCommission(incomingRide.price, isPremium, incomingRide.service_type as 'moto' | 'livraison'))}</p>
          </div>
          <div className="w-full rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: '#1DB954' }} /><div><p className="text-green-200 text-xs">Client</p><p className="text-white text-sm font-semibold">{incomingRide.from_address}</p></div></div>
            <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-red-400" /><div><p className="text-green-200 text-xs">Destination</p><p className="text-white text-sm font-semibold">{incomingRide.to_address}</p></div></div>
          </div>
        </div>
        <div className="p-6 space-y-3">
          <button onClick={accepterCourse} disabled={acceptLoading} className="w-full py-4 rounded-2xl font-black text-lg" style={{ background: '#1DB954', color: '#0F5138' }}>{acceptLoading ? 'Acceptation...' : '✅ Accepter'}</button>
          <button onClick={refuserCourse} className="w-full py-4 rounded-2xl font-bold text-white border-2" style={{ borderColor: 'rgba(255,255,255,0.3)' }}>❌ Refuser</button>
        </div>
      </div>
    )

    if (screen === 'driver_to_client' && currentDriverRide) return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        {showNextRideBanner && nextIncomingRide && (
          <div className="fixed top-0 left-0 right-0 z-50 p-3" style={{ background: '#1DB954' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-black text-sm">{nextIncomingRide.service_type === 'livraison' ? '📦' : '🛵'} Nouvelle {nextIncomingRide.service_type === 'livraison' ? 'livraison' : 'course'} !</p>
                <p className="text-green-100 text-xs">{formatPrice(nextIncomingRide.price)} • {nextIncomingRide.to_address}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={accepterCourseSuivante} className="px-3 py-1.5 rounded-xl font-black text-xs bg-white" style={{ color: '#0F5138' }}>Accepter</button>
                <button onClick={() => { setShowNextRideBanner(false); setNextIncomingRide(null) }} className="px-3 py-1.5 rounded-xl font-black text-xs bg-green-700 text-white">Ignorer</button>
              </div>
            </div>
          </div>
        )}
        <header className="px-4 py-3 flex items-center justify-between" style={{ background: '#0F5138', marginTop: showNextRideBanner ? '68px' : '0' }}>
          <div><p className="text-white font-black">{currentDriverRide.service_type === 'livraison' ? '📦 Vers le client' : '🛵 Vers le client'}</p><p className="text-green-200 text-xs truncate">{currentDriverRide.from_address}</p></div>
          <span className="text-green-200 text-sm font-bold">{formatPrice(currentDriverRide.price)}</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="h-64 relative">
            <MapView fromLat={navStartPos.lat} fromLng={navStartPos.lng} toLat={currentDriverRide.from_lat} toLng={currentDriverRide.from_lng} driverLat={driverPosition.lat} driverLng={driverPosition.lng} showDriver={true} mode="driver" onRouteCoords={setRouteCoords} sosAlerts={sosAlertsNearby} />
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: '#1DB954' }} /><div><p className="text-xs text-gray-400">Ta position</p><p className="text-sm font-semibold">En route...</p></div></div>
              <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-blue-500" /><div><p className="text-xs text-gray-400">Client</p><p className="text-sm font-semibold">{currentDriverRide.from_address}</p></div></div>
              {currentDriverRide.client_name && <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-gray-300" /><div><p className="text-xs text-gray-400">Nom client</p><p className="text-sm font-semibold">{currentDriverRide.client_name}</p></div></div>}
              {currentDriverRide.client_phone && <a href={`tel:+221${currentDriverRide.client_phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-sm font-bold" style={{ color: '#0F5138' }}><Phone size={14} /> Appeler le client</a>}
            </div>
            {clientArrived ? (
              <div className="rounded-2xl p-4" style={{ background: '#E8F5E9' }}>
                <p className="font-black text-base mb-1" style={{ color: '#0F5138' }}>✅ Arrivé ! Demandez le code PIN</p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#1DB954' }} />
                <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>En route vers le client...</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center"><p className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(currentDriverRide.price)}</p><p className="text-xs text-gray-400">Prix</p></div>
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center"><p className="text-xl font-black" style={{ color: freeTrialActive ? '#1DB954' : '#F59E0B' }}>{freeTrialActive ? '0F 🎉' : formatPrice(currentDriverRide.commission || 0)}</p><p className="text-xs text-gray-400">Commission</p></div>
            </div>
             <button onClick={async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    const chunks: BlobPart[] = []
    recorder.ondataavailable = e => chunks.push(e.data)
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      const file = new File([blob], `audio_course_${currentDriverRide?.id}_${Date.now()}.webm`)
      await supabase.storage.from('sos-audio').upload(file.name, file)
      alert('✅ Audio enregistré et sauvegardé.')
    }
    recorder.start()
    alert('🎙️ Enregistrement démarré — il s\'arrêtera dans 5 minutes.')
    setTimeout(() => { recorder.stop(); stream.getTracks().forEach(t => t.stop()) }, 5 * 60 * 1000)
  } catch {
    alert('❌ Autorise le micro pour activer l\'enregistrement.')
  }
}} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#6B7280' }}>
  🎙️ Activer enregistrement audio
  <button onClick={async () => {
  const types = ['danger', 'vol', 'agression', 'accident']
  const type = prompt('Type de danger :\n1. Danger général\n2. Vol\n3. Agression\n4. Accident\n\nEntre le numéro :')
  const zoneType = types[(parseInt(type || '1') - 1)] || 'danger'
  const desc = prompt('Décris brièvement la situation (optionnel) :') || ''
  try {
    const res = await fetch('/api/danger-zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reported_by: user?.phone,
        reported_by_name: user?.name,
        lat: driverPosition.lat,
        lng: driverPosition.lng,
        description: desc,
        zone_type: zoneType,
      }),
    })
    const data = await res.json()
    alert(`✅ ${data.message || 'Zone signalée avec succès !'}`)
  } catch {
    alert('❌ Erreur lors du signalement.')
  }
}} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#F59E0B' }}>
  ⚠️ Signaler zone dangereuse
</button>
</button>
            <button onClick={() => declencherSOS('chauffeur')} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 bg-red-500"><AlertCircle size={18} /> 🚨 SOS Urgence</button>
          </div>
        </div>
        {clientArrived && (
          <div className="p-4 bg-white border-t border-gray-100">
            <button onClick={() => setShowPinEntry(true)} className="w-full py-4 rounded-2xl font-black text-white text-lg flex items-center justify-center gap-2" style={{ background: '#0F5138' }}>
              <Lock size={22} /> Saisir le code PIN
            </button>
          </div>
        )}
      </div>
    )

    if (screen === 'driver_course' && currentDriverRide) return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        {showNextRideBanner && nextIncomingRide && (
          <div className="fixed top-0 left-0 right-0 z-50 p-3" style={{ background: '#1DB954' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-black text-sm">{nextIncomingRide.service_type === 'livraison' ? '📦' : '🛵'} Prochaine {nextIncomingRide.service_type === 'livraison' ? 'livraison' : 'course'} !</p>
                <p className="text-green-100 text-xs">{formatPrice(nextIncomingRide.price)} • {nextIncomingRide.to_address}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={accepterCourseSuivante} className="px-3 py-1.5 rounded-xl font-black text-xs bg-white" style={{ color: '#0F5138' }}>Accepter</button>
                <button onClick={() => { setShowNextRideBanner(false); setNextIncomingRide(null) }} className="px-3 py-1.5 rounded-xl font-black text-xs bg-green-700 text-white">Ignorer</button>
              </div>
            </div>
          </div>
        )}
        <header className="px-4 py-3 flex items-center justify-between" style={{ background: '#0F5138', marginTop: showNextRideBanner ? '68px' : '0' }}>
          <div><p className="text-white font-black">{currentDriverRide.service_type === 'livraison' ? '📦 Livraison en cours' : '🛵 Course en cours'}</p><p className="text-green-200 text-xs truncate">{currentDriverRide.to_address}</p></div>
          <span className="text-green-200 text-sm font-bold">{formatPrice(currentDriverRide.price)}</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="h-64 relative">
            <MapView fromLat={driverPosition.lat} fromLng={driverPosition.lng} toLat={currentDriverRide.to_lat} toLng={currentDriverRide.to_lng} mode="driver" onRouteCoords={setRouteCoords} />
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: '#1DB954' }} /><div><p className="text-xs text-gray-400">Depart</p><p className="text-sm font-semibold">{currentDriverRide.from_address}</p></div></div>
              <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-red-500" /><div><p className="text-xs text-gray-400">Destination</p><p className="text-sm font-semibold">{currentDriverRide.to_address}</p></div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center"><p className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(currentDriverRide.price)}</p><p className="text-xs text-gray-400">Prix</p></div>
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center"><p className="text-xl font-black" style={{ color: freeTrialActive ? '#1DB954' : '#F59E0B' }}>{freeTrialActive ? '0F 🎉' : formatPrice(currentDriverRide.commission || 0)}</p><p className="text-xs text-gray-400">Commission</p></div>
            </div>
            <button onClick={() => declencherSOS('chauffeur')} className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 bg-red-500"><AlertCircle size={18} /> 🚨 SOS Urgence</button>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-100">
          <button onClick={terminerCourse} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>Terminer manuellement</button>
        </div>
      </div>
    )

    // Dashboard chauffeur
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <OfflineBanner />
        <header className="px-4 py-3 flex items-center justify-between" style={{ background: '#0F5138' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black italic text-white">TIAK TIAK</span>
            {isPremium && <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#1D6BF5' }}>✓ PREMIUM</span>}
            {freeTrialActive && <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#F59E0B' }}>3J GRATUITS</span>}
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-green-200 text-sm"><LogOut size={16} /> Quitter</button>
        </header>
        <div className="bg-white flex border-b border-gray-100">
          {[{ key: 'accueil', label: 'Accueil', icon: Home }, { key: 'gains', label: 'Gains', icon: Wallet }, { key: 'historique', label: 'Historique', icon: List }, { key: 'avis', label: 'Mes avis', icon: Star }].map(tab => ( 
            <button key={tab.key} onClick={() => { setDriverTab(tab.key as any); if (tab.key === 'historique') loadDriverHistory(); if (tab.key === 'gains') loadDriverStats() }} className="flex-1 flex items-center justify-center gap-1 py-3 font-bold text-xs border-b-2" style={{ borderBottomColor: driverTab === tab.key ? '#0F5138' : 'transparent', color: driverTab === tab.key ? '#0F5138' : '#9CA3AF' }}>
              <tab.icon size={15} /> {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {driverTab === 'accueil' && (
            <>
              <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden" style={{ background: '#0F5138' }}><span className="text-2xl">🛵</span></div>
                  {isPremium && <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ background: '#1D6BF5' }}>✓</div>}
                </div>
                <div className="flex-1">
                  <p className="font-black text-base">{user.name}</p>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(s => <Star key={s} size={11} color="#F59E0B" fill={s <= Math.round(driverStats.rating) ? '#F59E0B' : 'none'} />)}
                    <span className="text-xs text-gray-500 ml-1">{driverStats.rating.toFixed(1)} • {driverStats.totalRides} courses</span>
                  </div>
                  {freeTrialActive && freeTrialEnd && <p className="text-xs font-bold text-orange-500 mt-0.5">🎯 {formatCountdown(freeTrialEnd)} gratuits restants</p>}
                  {isPremium && <p className="text-xs font-bold mt-0.5" style={{ color: '#1D6BF5' }}>⚡ Priorité 1 min sur les courses</p>}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-bold text-base">{isOnline ? '🟢 En ligne' : '⚫ Hors ligne'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{isOnline ? 'Tu recois moto-taxi et livraisons' : 'Active pour recevoir'}</p>
                </div>
                <button onClick={toggleOnline} disabled={onlineLoading} className="w-16 h-8 rounded-full relative flex items-center" style={{ background: isOnline ? '#1DB954' : '#D1D5DB' }}>
                  <div className="absolute w-6 h-6 rounded-full bg-white shadow" style={{ left: isOnline ? '34px' : '2px' }} />
                </button>
              </div>

              {isOnline ? (
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
                  <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#1DB954' }} />
                  <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>En attente de courses 🛵 et livraisons 📦...</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-4 shadow-sm text-center py-8">
                  <Power size={36} color="#D1D5DB" className="mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Active le toggle pour recevoir des courses</p>
                </div>
              )}

              {!freeTrialActive && driverStats.todayCommission > 0 && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: '#FFF3E0' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-orange-700">Commission du jour</p>
                      <p className="text-2xl font-black text-orange-600">{formatPrice(driverStats.todayCommission)}</p>
                    </div>
                    <AlertCircle size={24} color="#F59E0B" />
                  </div>
                  <button onClick={ouvrirWaveCommission} className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#1D6BF5' }}>📱 Payer avec Wave</button>
                </div>
              )}

              <button onClick={() => setScreen('premium_page')} className="w-full rounded-2xl p-4 flex items-center gap-3" style={{ background: isPremium ? 'linear-gradient(135deg, #1D6BF5, #0a4db5)' : 'linear-gradient(135deg, #1D6BF5, #0F5138)' }}>
                <Award size={24} color="white" />
                <div className="flex-1 text-left">
                  <p className="font-black text-white">{isPremium ? '✓ PREMIUM ACTIF' : 'Passe en Premium !'}</p>
                  <p className="text-blue-100 text-xs">{isPremium ? (premiumExpiresAt ? `Expire le ${new Date(premiumExpiresAt).toLocaleDateString('fr-FR')}` : '') : '5 000 FCFA/mois • Priorité + commission reduite'}</p>
                </div>
                <ChevronRight size={20} color="rgba(255,255,255,0.7)" />
              </button>

              <a href="tel:+221755535030" className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 bg-red-500"><AlertCircle size={18} /> SOS — Urgence</a>
            </>
          )}

          {driverTab === 'gains' && (
            <>
              <h2 className="font-bold text-gray-700">Mes gains</h2>
              {freeTrialActive && <div className="rounded-2xl p-3" style={{ background: '#E8F5E9' }}><p className="text-sm font-bold" style={{ color: '#0F5138' }}>🎯 Commission 0 FCFA actif !</p></div>}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>{driverStats.todayRides}</p><p className="text-xs text-gray-400">Courses aujourd&apos;hui</p></div>
                <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(driverStats.todayEarnings)}</p><p className="text-xs text-gray-400">Gains aujourd&apos;hui</p></div>
              </div>

              <div className="flex bg-gray-100 rounded-2xl p-1">
                <button onClick={() => setStatsTab('semaine')} className="flex-1 py-2 rounded-xl font-bold text-sm" style={{ background: statsTab === 'semaine' ? '#0F5138' : 'transparent', color: statsTab === 'semaine' ? 'white' : '#9CA3AF' }}>7 jours</button>
                <button onClick={() => setStatsTab('mois')} className="flex-1 py-2 rounded-xl font-bold text-sm" style={{ background: statsTab === 'mois' ? '#0F5138' : 'transparent', color: statsTab === 'mois' ? 'white' : '#9CA3AF' }}>30 jours</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xl font-black" style={{ color: '#0F5138' }}>{statsTab === 'semaine' ? driverStats.weekRides : driverStats.monthRides}</p>
                  <p className="text-xs text-gray-400">Courses {statsTab === 'semaine' ? 'semaine' : 'mois'}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(statsTab === 'semaine' ? driverStats.weekEarnings : driverStats.monthEarnings)}</p>
                  <p className="text-xs text-gray-400">Gains {statsTab === 'semaine' ? 'semaine' : 'mois'}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-bold text-sm">Gain net du jour</p>
                  <p className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(driverStats.todayEarnings - driverStats.todayCommission)}</p>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Brut : {formatPrice(driverStats.todayEarnings)}</span>
                  <span>Commission : -{freeTrialActive ? '0F' : formatPrice(driverStats.todayCommission)}</span>
                </div>
              </div>

              {!freeTrialActive && driverStats.todayCommission > 0 && (
                <button onClick={ouvrirWaveCommission} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#1D6BF5' }}>
                  📱 Payer {formatPrice(driverStats.todayCommission)} via Wave
                </button>
              )}

              <button onClick={() => setScreen('premium_page')} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #1D6BF5, #0F5138)' }}>
                <Award size={18} /> {isPremium ? 'Voir mon plan Premium' : 'Passer Premium — 5000F/mois'}
              </button>
            </>
          )}

          {driverTab === 'historique' && (
            <>
              <h2 className="font-bold text-gray-700">Mes courses</h2>
              {driverHistory.length === 0 ? <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">Aucune course</div> : driverHistory.map(ride => {
                const st = statusLabel(ride.status)
                return (
                  <div key={ride.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{ride.service_type === 'moto' ? '🏍️' : '📦'} {ride.service_type === 'moto' ? 'Moto-taxi' : 'Livraison'}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: st.color }}>{st.text}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: '#1DB954' }} /><span className="text-xs text-gray-500 truncate">{ride.from_address}</span></div>
                      <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-gray-500 truncate">{ride.to_address}</span></div>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-50">
                      <div className="flex items-center gap-1 text-gray-400"><Clock size={12} /><span className="text-xs">{formatDate(ride.created_at)}</span></div>
                      <div className="text-right"><p className="font-black text-sm" style={{ color: '#0F5138' }}>{formatPrice(ride.price)}</p><p className="text-xs text-orange-500">-{formatPrice(ride.commission || 0)}</p></div>
                    </div>
                    {ride.client_rating && (
                      <div className="flex items-center gap-1 pt-1">
                        {[1,2,3,4,5].map(s => <Star key={s} size={11} color="#F59E0B" fill={s <= ride.client_rating! ? '#F59E0B' : 'none'} />)}
                        {ride.client_comment && <span className="text-xs text-gray-500 ml-1 italic">&quot;{ride.client_comment}&quot;</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
       {driverTab === 'avis' && (
            <>
              <h2 className="font-bold text-gray-700">Avis de mes clients</h2>
              {driverHistory.filter(r => r.client_rating).length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center">
                  <Star size={36} color="#D1D5DB" className="mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Aucun avis pour le moment</p>
                </div>
              ) : driverHistory.filter(r => r.client_rating).map(ride => (
                <div key={ride.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(s => <Star key={s} size={16} color="#F59E0B" fill={s <= (ride.client_rating || 0) ? '#F59E0B' : 'none'} />)}
                      <span className="text-sm font-bold ml-1" style={{ color: '#0F5138' }}>{ride.client_rating}/5</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(ride.created_at)}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: '#1DB954' }} /><span className="text-xs text-gray-500 truncate">{ride.from_address}</span></div>
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-gray-500 truncate">{ride.to_address}</span></div>
                  </div>
                  {ride.client_comment && (
                    <div className="rounded-xl p-3" style={{ background: '#F9FAFB' }}>
                      <p className="text-sm text-gray-700 italic">&quot;{ride.client_comment}&quot;</p>
                    </div>
                  )}
                  {ride.client_report && ride.client_report !== 'perfect' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                      {REPORT_OPTIONS.find(r => r.id === ride.client_report)?.label}
                    </span>
                  )}
                  {ride.client_report === 'perfect' && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                      Tout etait parfait
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    )
  }
  // ===== CLIENT SUIVI =====
  if (screen === 'suivi' && currentClientRide) {
    const pmLabel = paymentLabel(payment)
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        {pinWrongNotif && (
          <div className="fixed top-4 left-4 right-4 z-50 rounded-2xl p-4 flex items-center gap-3" style={{ background: '#EF4444' }}>
            <AlertCircle size={24} color="white" />
            <div><p className="text-white font-black text-sm">⚠️ Mauvais code saisi !</p><p className="text-red-100 text-xs">Vérifiez bien votre chauffeur</p></div>
          </div>
        )}
        {showPinModal && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-3xl p-6 mx-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: '#E8F5E9' }}><Lock size={28} color="#0F5138" /></div>
              <h3 className="font-black text-xl" style={{ color: '#0F5138' }}>Votre code PIN</h3>
              <p className="text-gray-500 text-sm">Donnez ce code à votre chauffeur</p>
              <div className="flex gap-3 justify-center">
                {clientPinCode.split('').map((d, i) => (
                  <div key={i} className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black border-2" style={{ borderColor: '#1DB954', background: '#E8F5E9', color: '#0F5138' }}>{d}</div>
                ))}
              </div>
              <button onClick={() => setShowPinModal(false)} className="w-full py-3 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>J&apos;ai compris</button>
            </div>
          </div>
        )}
        <div className="h-48 relative">
          <MapView fromLat={driverLat || position.lat} fromLng={driverLng || position.lng} toLat={position.lat} toLng={position.lng} driverLat={driverLat || undefined} driverLng={driverLng || undefined} driverMotoColor={driverMotoColor} showDriver={true} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: driverArrived ? '#1DB954' : '#0F5138' }}>
            <div>
              {driverArrived ? <p className="text-white font-black text-lg">🎉 Chauffeur arrivé !</p> : <p className="text-white font-black text-lg">Arrive dans ~{estimatedArrival} min</p>}
              <p className="text-green-200 text-sm">{distanceToClient > 0 ? `${distanceToClient} km • ` : ''}{driverMotoType} {driverMotoColor}</p>
            </div>
            <a href={`tel:+221${driverPhone.replace(/\s/g, '')}`} className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}><Phone size={22} color="white" /></a>
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="relative">
                {driverProfilePhoto ? <img src={driverProfilePhoto} alt="Chauffeur" className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: '#0F5138' }} /> : <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: '#0F5138' }}>🛵</div>}
                {driverIsPremium && <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ background: '#1D6BF5' }}>✓</div>}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1"><p className="font-black text-lg">{driverName}</p>{driverIsPremium && <span className="text-xs font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: '#1D6BF5' }}>✓</span>}</div>
                <div className="flex items-center gap-1 mt-0.5">{[1,2,3,4,5].map(s => <Star key={s} size={13} color="#F59E0B" fill={s <= Math.round(driverRating) ? '#F59E0B' : 'none'} />)}<span className="text-sm font-bold text-gray-600 ml-1">{driverRating.toFixed(1)}</span></div>
                <p className="text-xs text-gray-400 mt-0.5">{driverMotoType} • {driverMotoColor}</p>
              </div>
              <a href={`tel:+221${driverPhone.replace(/\s/g, '')}`} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#E8F5E9' }}><Phone size={18} color="#0F5138" /></a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowPinModal(true)} className="py-3 rounded-2xl font-bold flex items-center justify-center gap-2 bg-white border-2" style={{ borderColor: '#0F5138', color: '#0F5138' }}>
                <Lock size={16} /> Voir PIN
              </button>
              <button onClick={() => shareTrip(driverName, position.address, currentClientRide.to_address)} className="py-3 rounded-2xl font-bold flex items-center justify-center gap-2 bg-white border-2" style={{ borderColor: '#1DB954', color: '#0F5138' }}>
                <Share2 size={16} /> Partager
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#E8F5E9' }}><span className="w-3 h-3 rounded-full" style={{ background: '#1DB954', display: 'block' }} /></div>
                <div><p className="text-xs text-gray-400">Prise en charge</p><p className="text-sm font-semibold">{position.address}</p></div>
              </div>
              <div className="ml-4 border-l-2 border-dashed border-gray-200 h-4" />
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50"><span className="w-3 h-3 rounded-full bg-red-500" style={{ display: 'block' }} /></div>
                <div><p className="text-xs text-gray-400">Destination</p><p className="text-sm font-semibold">{currentClientRide.to_address}</p></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-2">{pmLabel.icon.startsWith('/') ? <img src={pmLabel.icon} alt={pmLabel.name} className="w-6 h-6 rounded-full object-cover" /> : <span className="text-lg">{pmLabel.icon}</span>}<span className="text-sm font-bold text-gray-600">{pmLabel.name}</span></div>
              <span className="text-xl font-black" style={{ color: '#0F5138' }}>{formatPrice(currentClientRide.price)}</span>
            </div>

            {driverArrived ? (
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
                <span className="text-2xl">🎉</span>
                <p className="text-sm font-bold" style={{ color: '#0F5138' }}>Ton chauffeur est là ! Donne-lui ton PIN.</p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#E8F5E9' }}>
                <div className="w-3 h-3 rounded-full animate-pulse flex-shrink-0" style={{ background: '#1DB954' }} />
                <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>Le chauffeur se dirige vers toi... 🛵</p>
              </div>
            )}
            <button onClick={() => setScreen('annulation_suivi')} className="w-full py-3 rounded-2xl font-bold text-red-500 border-2 border-red-100 bg-white text-sm">Annuler la course</button>
          </div>
        </div>
      </div>
    )
  }

 const cancellationFeeApplies = driverArrivedAt ? (Date.now() - driverArrivedAt) > 3 * 60 * 1000 : false
 
  if (screen === 'annulation_suivi') return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setScreen('suivi')}><ArrowLeft size={24} color="#0F5138" /></button>
        <span className="font-bold text-black">Motif d&apos;annulation</span>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="text-center mb-2"><XCircle size={48} color="#EF4444" className="mx-auto mb-3" /><p className="font-bold text-gray-800">Pourquoi veux-tu annuler ?</p></div>
        {cancellationFeeApplies && (
          <div className="rounded-2xl p-4" style={{ background: '#FEF3C7' }}>
            <p className="text-sm font-bold text-orange-700">⚠️ Frais d&apos;annulation</p>
            <p className="text-xs text-orange-600 mt-1">Ton chauffeur attend depuis plus de 3 minutes. En cas d&apos;annulation, merci de lui donner 200 FCFA en especes pour le deplacement.</p>
          </div>
        )}
        <div className="space-y-3">
          {CANCEL_REASONS.map(reason => (
            <button key={reason} onClick={() => setCancelReason(reason)} className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left" style={{ borderColor: cancelReason === reason ? '#1DB954' : '#F3F4F6', background: cancelReason === reason ? '#E8F5E9' : 'white' }}>
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
        <button onClick={() => setScreen('suivi')} className="w-full py-3 text-sm text-gray-400 font-medium">Retour</button>
      </div>
    </div>
  )

  if (screen === 'checkin') return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-6" style={{ background: '#0F5138' }}>
      <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <CheckCircle size={48} color="white" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-black text-white mb-2">Tu es arrivé(e) !</h2>
        <p className="text-green-200 text-sm">Es-tu bien arrivé(e) en sécurité ?</p>
      </div>
      <div className="w-full space-y-3">
        <button
          onClick={() => setScreen('evaluation')}
          className="w-full py-4 rounded-2xl font-black text-lg"
          style={{ background: '#1DB954', color: '#0F5138' }}
        >
          Oui, tout va bien
        </button>
       {emergencyPhone && (
          <a href={`https://wa.me/${emergencyPhone.replace(/\s/g, '').replace(/^0/, '221')}?text=${encodeURIComponent(`⚠️ J'ai un problème, je viens d'arriver avec un TIAK TIAK à ${currentClientRide?.to_address || 'destination'}. Appelle-moi !`)}`} target="_blank" rel="noreferrer" className="w-full py-4 rounded-2xl font-bold text-white border-2 flex items-center justify-center" style={{ borderColor: 'rgba(255,255,255,0.3)' }}>
            J&apos;ai un problème
          </a>
        )}
      </div>
    </div>
  )

  if (screen === 'evaluation') return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="text-center pt-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#0F5138' }}><Check size={36} color="white" /></div>
          <h2 className="text-2xl font-black" style={{ color: '#0F5138' }}>Course terminee !</h2>
          <p className="text-gray-400 text-sm mt-1">Note ton chauffeur</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="relative">
            {driverProfilePhoto ? <img src={driverProfilePhoto} alt="Chauffeur" className="w-14 h-14 rounded-full object-cover" /> : <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: '#0F5138' }}>🛵</div>}
            {driverIsPremium && <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs" style={{ background: '#1D6BF5' }}>✓</div>}
          </div>
          <div><p className="font-black text-base">{driverName}</p><p className="text-sm text-gray-400">{driverMotoType} • {driverMotoColor}</p></div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-bold text-sm text-gray-700 mb-3 text-center">Comment etait ta course ?</p>
          <div className="flex justify-center gap-3">
            {[1,2,3,4,5].map(s => <button key={s} onClick={() => setClientRating(s)}><Star size={36} color="#F59E0B" fill={s <= clientRating ? '#F59E0B' : 'none'} strokeWidth={1.5} /></button>)}
          </div>
          {clientRating > 0 && <p className="text-center text-sm font-bold mt-2" style={{ color: '#0F5138' }}>{clientRating === 5 ? 'Excellent ! 🎉' : clientRating === 4 ? 'Tres bien 👍' : clientRating === 3 ? 'Correct' : clientRating === 2 ? 'Peut mieux faire' : 'Mauvais 😞'}</p>}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-sm text-gray-700 mb-2">Commentaire (optionnel)</p>
          <textarea value={clientComment} onChange={e => setClientComment(e.target.value)} placeholder="Decris ton experience..." className="w-full px-3 py-2 bg-gray-50 rounded-xl outline-none text-sm resize-none" rows={3} />
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-bold text-sm text-gray-700 mb-3">Signalement</p>
          <div className="space-y-2">
            {REPORT_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setClientReport(clientReport === opt.id ? '' : opt.id)} className="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left" style={{ borderColor: clientReport === opt.id ? '#1DB954' : '#F3F4F6', background: clientReport === opt.id ? '#E8F5E9' : 'white' }}>
                <span className="text-lg">{opt.icon}</span>
                <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                {clientReport === opt.id && <Check size={16} color="#1DB954" className="ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 bg-white border-t border-gray-100 space-y-2">
        <button onClick={soumettreEvaluation} disabled={clientRating === 0 || evalLoading} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: clientRating === 0 || evalLoading ? '#D1D5DB' : '#0F5138' }}>
          {evalLoading ? 'Envoi...' : clientRating === 0 ? 'Selectionne une note' : 'Soumettre'}
        </button>
        <button onClick={() => { setScreen('accueil'); setCurrentClientRide(null); setCurrentRideId(null); setClientRating(0); setClientComment(''); setClientReport(''); setDriverArrived(false) }} className="w-full py-3 text-sm text-gray-400 font-medium">Passer</button>
      </div>
    </div>
  )

  if (screen === 'attente') return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0F5138' }}>
    {deviationAlert && (
  <div className="absolute top-20 left-4 right-4 z-50 bg-red-600 text-white rounded-2xl p-4 shadow-xl flex items-center gap-3">
    <AlertCircle size={24} color="white" />
    <div className="flex-1">
      <p className="font-black text-sm">⚠️ Déviation détectée</p>
      <p className="text-xs text-red-100">Ton chauffeur a quitté l'itinéraire prévu</p>
    </div>
    <button onClick={() => declencherSOS('client')} className="bg-white text-red-600 px-3 py-1 rounded-xl font-bold text-xs">SOS</button>
  </div>
)}
{arretAlert && (
  <div className="absolute top-20 left-4 right-4 z-50 bg-orange-500 text-white rounded-2xl p-4 shadow-xl flex items-center gap-3">
    <AlertCircle size={24} color="white" />
    <div className="flex-1">
      <p className="font-black text-sm">⏸️ Arrêt anormal</p>
      <p className="text-xs text-orange-100">Ton chauffeur est immobile depuis 5 minutes</p>
    </div>
    <button onClick={() => declencherSOS('client')} className="bg-white text-orange-600 px-3 py-1 rounded-xl font-bold text-xs">SOS</button>
  </div>
)}
      <header className="px-4 py-4 flex items-center justify-between">
        <span className="text-xl font-black italic text-white">TIAK TIAK</span>
        <div className="flex items-center gap-2"><button onClick={() => declencherSOS('client')} className="bg-red-600 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 text-xs"><AlertCircle size={14} /> SOS</button><button onClick={() => setScreen('annulation')} className="text-green-200 text-sm font-semibold">Annuler</button></div>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        <div className="relative flex items-center justify-center">
          <div className="absolute rounded-full" style={{ width: '160px', height: '160px', background: 'rgba(29,185,84,0.15)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
          <div className="absolute rounded-full" style={{ width: '120px', height: '120px', background: 'rgba(29,185,84,0.2)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.5s' }} />
          <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}><span className="text-5xl">{service === 'livraison' ? '📦' : '🛵'}</span></div>
        </div>
        <div className="text-center"><h2 className="text-2xl font-black text-white mb-2">Recherche en cours...</h2><p className="text-green-200 text-sm">Nous cherchons le chauffeur le plus proche</p></div>
        {selected && (
          <div className="w-full rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: '#1DB954' }} /><div><p className="text-green-200 text-xs">Depart</p><p className="text-white text-sm font-semibold">{position.address}</p></div></div>
            <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-red-400" /><div><p className="text-green-200 text-xs">Destination</p><p className="text-white text-sm font-semibold">{selected.name}</p></div></div>
            {isFirstRide && (
              <div className="rounded-xl p-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <span className="text-lg">🎉</span>
                <span className="text-white text-xs font-bold">-10% appliqué — Première course !</span>
              </div>
            )}
            <div className="border-t border-white border-opacity-20 pt-3 flex justify-between"><span className="text-green-200 text-sm">Prix</span><span className="text-white font-black text-lg">{formatPrice(price)}</span></div>
            <div className="flex justify-center gap-3">
              {clientPinCode.split('').map((d, i) => (
                <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>{d}</div>
              ))}
            </div>
            <p className="text-green-200 text-xs text-center">Ton code PIN — garde-le pour ton chauffeur</p>
          </div>
        )}
        <div className="flex gap-2">{[0,1,2].map(i => <div key={i} className="w-3 h-3 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.2}s`, opacity: 0.8 }} />)}</div>
      </div>
      <div className="p-6"><button onClick={() => setScreen('annulation')} className="w-full py-4 rounded-2xl font-bold text-white border-2" style={{ borderColor: 'rgba(255,255,255,0.3)' }}>Annuler la course</button></div>
    </div>
  )

  if (screen === 'annulation') return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setScreen('attente')}><ArrowLeft size={24} color="#0F5138" /></button>
        <span className="font-bold text-black">Motif d&apos;annulation</span>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="text-center mb-2"><XCircle size={48} color="#EF4444" className="mx-auto mb-3" /><p className="font-bold text-gray-800">Pourquoi veux-tu annuler ?</p></div>
        <div className="space-y-3">
          {CANCEL_REASONS.map(reason => (
            <button key={reason} onClick={() => setCancelReason(reason)} className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left" style={{ borderColor: cancelReason === reason ? '#1DB954' : '#F3F4F6', background: cancelReason === reason ? '#E8F5E9' : 'white' }}>
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
        <button onClick={() => setScreen('attente')} className="w-full py-3 text-sm text-gray-400 font-medium">Retour</button>
      </div>
    </div>
  )
  if (screen === 'recherche') return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => { setScreen('accueil'); setQuery(''); setResults([]) }}><ArrowLeft size={24} color="#0F5138" /></button>
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2.5">
          <Search size={18} className="text-gray-400" />
          <input autoFocus value={query} onChange={e => onSearch(e.target.value)} placeholder="Rue, hopital, boutique, mosquee..." className="flex-1 bg-transparent outline-none text-sm" />
          {query && <button onClick={() => { setQuery(''); setResults([]) }}><X size={18} className="text-gray-400" /></button>}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {!query && freqDests.length > 0 && (
          <div className="p-4">
            <p className="text-xs font-bold text-gray-400 mb-3">DESTINATIONS FRÉQUENTES</p>
            {freqDests.map((dest, i) => (
              <button key={i} onClick={() => selectFreqDest(dest)} className="w-full flex items-center gap-3 py-3 border-b border-gray-50 text-left">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#E8F5E9' }}><Clock size={18} color="#0F5138" /></div>
                <div className="flex-1 min-w-0"><p className="font-semibold text-sm text-black truncate">{dest.name}</p><p className="text-xs text-gray-400 truncate">{dest.address}</p></div>
                <span className="text-xs text-gray-300">{dest.count}x</span>
              </button>
            ))}
          </div>
        )}
        {loading && <div className="p-4 text-center text-gray-400 text-sm">Recherche en cours...</div>}
        {!loading && results.map((place, i) => (
          <button key={i} onClick={() => selectPlace(place)} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl" style={{ background: '#F3F4F6' }}>
              {place.icon || '📍'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-black truncate">{place.name}</p>
              <p className="text-xs text-gray-400 truncate">{place.category ? `${place.category} · ` : ''}{place.address}</p>
            </div>
            {place.distance !== undefined && (
              <span className="text-xs text-gray-400 font-medium flex-shrink-0">
                {place.distance < 1 ? `${Math.round(place.distance * 1000)} m` : `${place.distance} km`}
              </span>
            )}
          </button>
        ))}
        {!loading && query.length >= 2 && results.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">Aucun lieu trouve</div>}
        {query.length < 2 && freqDests.length === 0 && <div className="p-6 text-center text-gray-300 text-sm">Tape le nom d&apos;un lieu au Senegal</div>}
      </div>
    </div>
  )

  if (screen === 'confirm' && selected) {
    const methods = [{ id: 'cash', icon: '💵', name: 'Especes' }, { id: 'wave', icon: '/images/wave.png', name: 'Wave' }, { id: 'orange', icon: '/images/orange-money.png', name: 'Orange Money' }]
    return (
      <div className="fixed inset-0 bg-gray-100">
        {/* ===== CARTE PLEIN ÉCRAN (comme Yango) ===== */}
        <div className="absolute inset-0 z-0">
          <MapView fromLat={position.lat} fromLng={position.lng} toLat={selected.lat} toLng={selected.lng} nearbyDrivers={nearbyDrivers} showNearby={true} bottomOffset={320} onDuration={(seconds) => setOsrmEta(Math.max(1, Math.round(seconds / 60)))}
                dangerZones={dangerZones} />
        </div>

        {/* Bouton retour flottant */}
        <button onClick={() => setScreen('recherche')} className="absolute top-4 left-4 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center z-[600]">
          <ArrowLeft size={20} color="#0F5138" />
        </button>

        {/* Badge demande flottant */}
        <button onClick={() => setShowDemandSheet(true)} className="absolute top-4 right-4 bg-white rounded-full shadow-lg flex items-center gap-1.5 px-3 py-2 z-[600]">
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: demandLevel === 'high' ? '#EF4444' : demandLevel === 'medium' ? '#F59E0B' : '#1DB954' }}>
            <Zap size={11} color="white" fill="white" />
          </div>
          <span className="text-xs font-bold" style={{ color: '#111' }}>{demandLevel === 'high' ? 'Forte' : demandLevel === 'medium' ? 'Modérée' : 'Normale'}</span>
        </button>

        {/* ===== BOTTOM SHEET par-dessus la carte ===== */}
        <div className="absolute bottom-0 left-0 right-0 z-[600] bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: '58%', boxShadow: '0 -8px 30px rgba(0,0,0,0.15)' }}>
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mt-3 flex-shrink-0" />
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2 space-y-3">
            {nearbyDrivers.length > 0 && (
              <div className="rounded-2xl p-3 flex items-center gap-2" style={{ background: '#E8F5E9' }}>
                <span className="text-lg">🛵</span>
                <p className="text-sm font-semibold" style={{ color: '#0F5138' }}>{nearbyDrivers.length} chauffeur{nearbyDrivers.length > 1 ? 's' : ''} dispo • Plus proche : {nearbyDrivers[0].eta} min</p>
              </div>
            )}
            {isFirstRide && (
              <div className="rounded-2xl p-3 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, #F59E0B, #1DB954)' }}>
                <span className="text-lg">🎉</span>
                <p className="text-sm font-bold text-white">-10% sur ta première course !</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} /><div className="min-w-0"><p className="text-xs text-gray-400">Depart</p><p className="text-sm font-semibold truncate">{position.address}</p></div></div>
              <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" /><div className="min-w-0"><p className="text-xs text-gray-400">Destination</p><p className="text-sm font-semibold truncate">{selected.name}</p></div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setService('moto')} className="bg-white rounded-2xl shadow-sm flex flex-col items-center gap-1 overflow-hidden" style={{ border: service === 'moto' ? '2px solid #1DB954' : '2px solid #F3F4F6' }}>
                <img src="/images/moto-taxi.png" alt="Moto-taxi" style={{ width: '100%', height: '70px', objectFit: 'contain', opacity: service === 'moto' ? 1 : 0.45 }} />
                <div className="pb-2 flex flex-col items-center">
                  <span className="font-bold text-sm" style={{ color: service === 'moto' ? '#0F5138' : '#9CA3AF' }}>Moto-taxi</span>
                  {nearbyDrivers.length > 0 && nearbyDrivers[0].eta <= 3 ? (
                    <span className="text-xs font-black px-2 py-0.5 rounded-full text-white mt-0.5" style={{ background: '#1DB954' }}>⚡ RAPIDE • {nearbyDrivers[0].eta} min</span>
                  ) : (
                    <span className="text-xs text-gray-400">{nearbyDrivers.length > 0 ? nearbyDrivers[0].eta : 2} min</span>
                  )}
                </div>
              </button>
              <button onClick={() => setService('livraison')} className="bg-white rounded-2xl shadow-sm flex flex-col items-center gap-1 overflow-hidden" style={{ border: service === 'livraison' ? '2px solid #1DB954' : '2px solid #F3F4F6' }}>
                <img src="/images/livraison.png" alt="Livraison" style={{ width: '100%', height: '70px', objectFit: 'contain', opacity: service === 'livraison' ? 1 : 0.45 }} />
                <div className="pb-2 flex flex-col items-center">
                  <span className="font-bold text-sm" style={{ color: service === 'livraison' ? '#0F5138' : '#9CA3AF' }}>Livraison</span>
                  <span className="text-xs text-gray-400">10 min</span>
                </div>
              </button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="flex justify-between mb-2"><span className="text-sm text-gray-500">Distance</span><span className="text-sm font-bold">{formatDistance(km)}</span></div>
              <div className="flex justify-between mb-3"><span className="text-sm text-gray-500">Duree estimee</span><span className="text-sm font-bold">{formatETA(eta)}</span></div>
              {isFirstRide && (
                <div className="flex justify-between mb-2 text-sm"><span className="text-gray-400 line-through">{formatPrice(basePrice)}</span><span className="font-bold text-green-600">-10%</span></div>
              )}
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center"><span className="font-bold">Prix total</span><span className="text-2xl font-black" style={{ color: '#0F5138' }}>{formatPrice(price)}</span></div>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="font-bold text-sm text-gray-700 mb-3">Mode de paiement</p>
              <div className="flex gap-2">
                {methods.map(m => (
                  <button key={m.id} onClick={() => setPayment(m.id)} className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2" style={{ borderColor: payment === m.id ? '#1DB954' : '#E5E7EB', background: payment === m.id ? '#E8F5E9' : 'white' }}>
                    {m.icon.startsWith('/') ? <img src={m.icon} alt={m.name} className="w-7 h-7 rounded-full object-cover" /> : <span className="text-xl">{m.icon}</span>}
                    <span className="text-xs font-bold" style={{ color: payment === m.id ? '#0F5138' : '#9CA3AF' }}>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <button onClick={commanderCourse} disabled={commandLoading} className="w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2" style={{ background: commandLoading ? '#7aaa94' : '#0F5138' }}>
              {commandLoading ? 'Envoi...' : (
                <>
                  <svg width="22" height="22" viewBox="0 0 26 26" fill="none">
                    <ellipse cx="13" cy="6" rx="3.2" ry="3.6" fill="white"/>
                    <rect x="11" y="9" width="4" height="9" rx="2" fill="white"/>
                    <path d="M13 17 L8 23 M13 17 L18 23" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
                    <circle cx="7" cy="24" r="2" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="19" cy="24" r="2" fill="rgba(255,255,255,0.7)"/>
                    <path d="M9 11 L4 9 M17 11 L22 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Commander — {paymentLabel(payment).icon} {paymentLabel(payment).name}
                </>
              )}
            </button>
          </div>
        </div>

        {showDemandSheet && (
          <div className="fixed inset-0 z-[700] flex items-end" onClick={() => setShowDemandSheet(false)}>
            <div className="absolute inset-0 bg-black bg-opacity-40" />
            <div className="relative bg-white w-full rounded-t-3xl p-6 space-y-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: demandLevel === 'high' ? '#EF4444' : demandLevel === 'medium' ? '#F59E0B' : '#1DB954' }}>
                  <Zap size={22} color="white" fill="white" />
                </div>
                <button onClick={() => setShowDemandSheet(false)}><X size={22} color="#9CA3AF" /></button>
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{demandLevel === 'high' ? 'Prix un peu plus élevé' : 'Niveau de demande'}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{demandLevel === 'high' ? "Il y a actuellement plus de commandes que de chauffeurs disponibles dans cette zone. Les prix augmentent légèrement pour inciter plus de chauffeurs à se rendre disponibles." : "La demande est actuellement équilibrée dans ta zone. Les prix sont normaux."}</p>
              </div>
              <button onClick={() => setShowDemandSheet(false)} className="w-full py-4 rounded-2xl font-bold text-white" style={{ background: '#0F5138' }}>
                J&apos;ai compris
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (screen === 'securite') return (
  <div className="fixed inset-0 flex flex-col bg-gray-100">
    <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
      <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
      <span className="font-bold text-black">Centre de sécurité 🛡️</span>
    </header>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">

      {/* Numéros d'urgence */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-black text-sm text-gray-800 mb-3">🚨 Numéros d'urgence</p>
        <div className="space-y-2">
          <a href="tel:17" className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
            <div className="flex items-center gap-3"><Phone size={18} color="#DC2626" /><div><p className="font-bold text-sm text-red-600">Police Secours</p><p className="text-xs text-gray-400">Appel gratuit 24h/24</p></div></div>
            <span className="text-2xl font-black text-red-600">17</span>
          </a>
          <a href="tel:18" className="flex items-center justify-between p-3 bg-orange-50 rounded-xl">
            <div className="flex items-center gap-3"><Phone size={18} color="#F59E0B" /><div><p className="font-bold text-sm text-orange-600">Pompiers</p><p className="text-xs text-gray-400">Appel gratuit 24h/24</p></div></div>
            <span className="text-2xl font-black text-orange-600">18</span>
          </a>
          <a href="tel:15" className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
            <div className="flex items-center gap-3"><Phone size={18} color="#1D6BF5" /><div><p className="font-bold text-sm text-blue-600">SAMU</p><p className="text-xs text-gray-400">Urgences médicales</p></div></div>
            <span className="text-2xl font-black text-blue-600">15</span>
          </a>
          <a href={SUPPORT_WHATSAPP} target="_blank" className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
            <div className="flex items-center gap-3"><MessageCircle size={18} color="#1DB954" /><div><p className="font-bold text-sm text-green-600">Support TIAK TIAK</p><p className="text-xs text-gray-400">WhatsApp disponible</p></div></div>
            <ChevronRight size={18} color="#1DB954" />
          </a>
        </div>
      </div>

      {/* Statut vérification */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-black text-sm text-gray-800 mb-3">✅ Mon statut de sécurité</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2"><CheckCircle size={16} color={isVerified ? '#1DB954' : '#9CA3AF'} /><span className="text-sm font-medium">Profil vérifié</span></div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${isVerified ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{isVerified ? 'Vérifié ✓' : 'Non vérifié'}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2"><Phone size={16} color="#1DB954" /><span className="text-sm font-medium">Numéro confirmé</span></div>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-600">Confirmé ✓</span>
          </div>
        </div>
      </div>

      {/* Conseils de sécurité */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-black text-sm text-gray-800 mb-3">💡 Conseils de sécurité</p>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start gap-2 p-2"><span>🛵</span><span>Vérifie toujours la plaque et la couleur de la moto avant de monter</span></div>
          <div className="flex items-start gap-2 p-2"><span>📱</span><span>Partage ton trajet avec un proche avant de démarrer</span></div>
          <div className="flex items-start gap-2 p-2"><span>🌙</span><span>La nuit, préfère les zones éclairées pour ta prise en charge</span></div>
          <div className="flex items-start gap-2 p-2"><span>🔴</span><span>En cas de danger, utilise le bouton SOS dans l'app</span></div>
          <div className="flex items-start gap-2 p-2"><span>📸</span><span>Note le numéro du chauffeur visible dans l'app avant de démarrer</span></div>
        </div>
      </div>

      {/* Mode nuit */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2"><span>🌙</span><p className="font-black text-sm text-gray-800">Mode nuit sécurisé</p></div>
        <p className="text-xs text-gray-500">Après 22h, seuls les profils vérifiés peuvent commander. Cette protection est automatique et s'applique pour ta sécurité et celle des chauffeurs.</p>
      </div>

    </div>
  </div>
)

  if (screen === 'profil') return (
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
          {isVerified ? (
  <div className="mt-2 flex items-center gap-1 bg-green-50 px-3 py-1.5 rounded-full">
    <CheckCircle size={14} color="#1DB954" />
    <span className="text-xs font-bold text-green-600">Profil vérifié ✓</span>
  </div>
) : user?.verification_status === 'pending' ? (
  <div className="mt-2 flex items-center gap-1 bg-yellow-50 px-3 py-1.5 rounded-full">
    <AlertCircle size={14} color="#F59E0B" />
    <span className="text-xs font-bold text-yellow-600">Vérification en cours...</span>
  </div>
) : (  <button onClick={async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      const imageCapture = new (window as any).ImageCapture(track)
      const blob = await imageCapture.takePhoto()
      track.stop()
      const file = new File([blob], `selfie_${user?.phone}_${Date.now()}.jpg`, { type: 'image/jpeg' })
      const { data, error } = await supabase.storage.from('selfies').upload(file.name, file)
      if (!error && data) {
        const { data: url } = supabase.storage.from('selfies').getPublicUrl(file.name)
        await supabase.from('users').update({ verification_selfie: url.publicUrl, verification_status: 'pending' }).eq('id', user!.id)
        alert('✅ Selfie envoyé ! Ton profil sera vérifié par l\'admin sous 24h.')
      }
    } catch {
      await supabase.from('users').update({ verification_status: 'pending' }).eq('id', user!.id)
      alert('✅ Demande envoyée ! Ton profil sera vérifié par l\'admin sous 24h.')
    }
  }} className="mt-2 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full">
    <Shield size={14} color="#1D6BF5" />
    <span className="text-xs font-bold text-blue-600">Vérifier mon profil</span>
  </button>
)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center"><p className="text-2xl font-black" style={{ color: '#0F5138' }}>{clientTotalRides}</p><p className="text-xs text-gray-400">Courses</p></div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            {clientTotalRides === 0 ? (
              <><p className="text-lg font-black" style={{ color: '#1DB954' }}>🎉 -10%</p><p className="text-xs text-gray-400">1ère course</p></>
            ) : (
              <><p className="text-2xl font-black" style={{ color: '#0F5138' }}>🛵</p><p className="text-xs text-gray-400">Membre TIAK TIAK</p></>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={18} color="#0F5138" />
            <p className="font-bold text-sm" style={{ color: '#0F5138' }}>Contact d&apos;urgence SOS</p>
          </div>
          <input value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Nom du contact" className="w-full px-4 py-3 bg-gray-100 rounded-xl outline-none text-sm" />
          <input value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="Téléphone (ex: 77 123 45 67)" className="w-full px-4 py-3 bg-gray-100 rounded-xl outline-none text-sm" />
          <button onClick={async () => {
            if (!user?.id) return
            await supabase.from('users').update({ emergency_contact_name: emergencyName.trim(), emergency_contact_phone: emergencyPhone.trim() }).eq('id', user.id)
            alert('Contact d\'urgence sauvegardé !')
          }} className="w-full py-3 rounded-2xl font-bold text-white text-sm" style={{ background: '#0F5138' }}>
            Sauvegarder
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => { setScreen('courses'); loadRides() }} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><List size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Mes courses</span><ChevronRight size={18} className="text-gray-300" /></button>
          <button onClick={() => setScreen('paiement')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><CreditCard size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Moyens de paiement</span><ChevronRight size={18} className="text-gray-300" /></button>
          <button onClick={() => setScreen('parametres')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><Settings size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Parametres</span><ChevronRight size={18} className="text-gray-300" /></button>
          <button onClick={() => setScreen('aide')} className="w-full flex items-center gap-3 px-4 py-3.5 text-left"><HelpCircle size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Aide</span><ChevronRight size={18} className="text-gray-300" /></button>
        </div>
        <button onClick={logout} className="w-full bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-3.5 text-red-500"><LogOut size={20} /><span className="text-sm font-bold">Deconnexion</span></button>
      </div>
    </div>
  )

  if (screen === 'paiement') {
    const methods = [{ id: 'cash', icon: '💵', name: 'Especes', desc: 'Payer en liquide au chauffeur' }, { id: 'wave', icon: '/images/wave.png', name: 'Wave', desc: 'Paiement mobile Wave' }, { id: 'orange', icon: '/images/orange-money.png', name: 'Orange Money', desc: 'Paiement mobile Orange' }]
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
        </div>
      </div>
    )
  }

  if (screen === 'parrainage') return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
        <span className="font-bold text-black">Parrainer un ami</span>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-2xl p-6 text-center" style={{ background: '#0F5138' }}>
          <Gift size={40} color="white" className="mx-auto mb-3" />
          <p className="text-white font-black text-lg mb-1">Gagne des courses gratuites</p>
          <p className="text-green-200 text-sm">Invite tes amis et vous gagnez -50%</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-2">TON CODE</p>
          <p className="text-2xl font-black tracking-widest" style={{ color: '#0F5138' }}>{referralCode}</p>
        </div>
      </div>
      <div className="p-4 bg-white border-t border-gray-100">
        <button onClick={shareReferral} className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2" style={{ background: '#0F5138' }}><Share2 size={20} /> Partager</button>
      </div>
    </div>
  )

  if (screen === 'aide') {
    const faqs = [
      { q: 'Comment commander ?', a: 'Choisis ta destination, vérifie le prix, puis appuie sur Commander.' },
      { q: "C'est quoi le code PIN ?", a: 'Un code 4 chiffres envoyé après acceptation. Donne-le au chauffeur pour confirmer ton identité.' },
      { q: 'Badge bleu ?', a: 'Le ✓ bleu = chauffeur Premium certifié par TIAK TIAK.' },
      { q: 'Zones couvertes ?', a: 'Tout le Senegal : Dakar, Thies, Touba, Saint-Louis, Kaolack...' },
      { q: 'Comment partager mon trajet ?', a: "Sur l'écran de suivi, appuie sur Partager pour envoyer ta position à un proche." },
      { q: 'La réduction -10% ?', a: "Automatiquement appliquée sur ta toute première course. Aucun code à entrer." },
    ]
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-100">
        <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
          <span className="font-bold text-black">Aide et Support</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <span className="flex-1 text-sm font-semibold">{f.q}</span>
                <ChevronDown size={18} className="text-gray-400" style={{ transform: faqOpen === i ? 'rotate(180deg)' : 'none' }} />
              </button>
              {faqOpen === i && <p className="px-4 pb-4 text-sm text-gray-600">{f.a}</p>}
            </div>
          ))}
          <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-3.5"><MessageCircle size={20} color="#1DB954" /><span className="flex-1 text-sm font-medium">WhatsApp Support</span><ChevronRight size={18} className="text-gray-300" /></a>
          <a href="tel:+221755535030" className="bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-3.5"><Phone size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Appeler</span><ChevronRight size={18} className="text-gray-300" /></a>
        </div>
      </div>
    )
  }

  if (screen === 'parametres') return (
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
                <span className="text-xl">{l.flag}</span><span className="flex-1 text-sm font-medium">{l.name}</span>
                {lang === l.code && <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#1DB954' }}><Check size={14} color="white" /></div>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="font-bold text-sm text-gray-500 mb-2 flex items-center gap-2"><Bell size={16} color="#0F5138" /> Notifications</p>
          <div className="bg-white rounded-2xl shadow-sm flex items-center px-4 py-3.5">
            <span className="flex-1 text-sm font-medium">Activer</span>
            <button onClick={() => setNotif(!notif)} className="w-12 h-6 rounded-full relative" style={{ background: notif ? '#1DB954' : '#D1D5DB' }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white" style={{ left: notif ? '26px' : '2px' }} />
            </button>
          </div>
        </div>
        <div>
          <p className="font-bold text-sm text-gray-500 mb-2">Legal</p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setScreen('conditions')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 text-left"><FileText size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Conditions</span><ChevronRight size={18} className="text-gray-300" /></button>
            <button onClick={() => setScreen('confidentialite')} className="w-full flex items-center gap-3 px-4 py-3.5 text-left"><Shield size={20} color="#0F5138" /><span className="flex-1 text-sm font-medium">Confidentialite</span><ChevronRight size={18} className="text-gray-300" /></button>
          </div>
        </div>
      </div>
    </div>
  )

  if (screen === 'conditions') return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setScreen('parametres')}><ArrowLeft size={24} color="#0F5138" /></button>
        <span className="font-bold text-black">Conditions</span>
      </header>
      <div className="flex-1 overflow-y-auto p-5"><p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{CONDITIONS_UTILISATION}</p></div>
    </div>
  )

  if (screen === 'confidentialite') return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setScreen('parametres')}><ArrowLeft size={24} color="#0F5138" /></button>
        <span className="font-bold text-black">Confidentialite</span>
      </header>
      <div className="flex-1 overflow-y-auto p-5"><p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{POLITIQUE_CONFIDENTIALITE}</p></div>
    </div>
  )

  if (screen === 'apropos') return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      <header className="bg-white px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setScreen('accueil')}><ArrowLeft size={24} color="#0F5138" /></button>
        <span className="font-bold text-black">A propos</span>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-col items-center py-6 gap-3">
          <LogoIcon size={72} />
          <LogoWordmark size={32} onDark={false} />
          <p className="text-gray-400 text-sm mt-1">Le Tiak Tiak de ta génération</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <p className="font-bold text-sm mb-1" style={{ color: '#0F5138' }}>Ce que nous offrons</p>
         <div className="flex items-center gap-2 text-sm text-gray-600"><Zap size={16} color="#0F5138" /><span>Courses moto-taxi rapides</span></div>
          <div className="flex items-center gap-2 text-sm text-gray-600"><Package size={16} color="#0F5138" /><span>Livraison express</span></div>
          <div className="flex items-center gap-2 text-sm text-gray-600"><CreditCard size={16} color="#0F5138" /><span>Cash, Wave, Orange Money</span></div>
          <div className="flex items-center gap-2 text-sm text-gray-600"><Award size={16} color="#0F5138" /><span>Chauffeurs Premium certifies</span></div>
          <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin size={16} color="#0F5138" /><span>Tout le Senegal</span></div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm text-center"><p className="text-sm text-gray-600">Fierement senegalais 🇸🇳</p><p className="text-xs text-gray-400 mt-1">Version 1.0.0</p></div>
      </div>
    </div>
  )

  if (screen === 'courses') return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      <header className="bg-white px-4 py-3 flex items-center justify-center border-b border-gray-100">
        <span className="text-xl font-black italic" style={{ color: '#0F5138' }}>Mes courses</span>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {ridesLoading ? <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div> : rides.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm text-center py-16 px-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#E8F5E9' }}><Zap size={28} color="#0F5138" /></div>
            <p className="font-bold text-gray-700 mb-1">Aucune course</p>
            <button onClick={() => setScreen('accueil')} className="px-6 py-3 rounded-full font-bold text-white text-sm mt-4" style={{ background: '#0F5138' }}>Commander</button>
          </div>
        ) : rides.map(ride => {
          const st = statusLabel(ride.status)
          return (
            <div key={ride.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">{ride.service_type === 'moto' ? '🏍️' : '📦'}</span><span className="font-bold text-sm">{ride.service_type === 'moto' ? 'Moto-taxi' : 'Livraison'}</span></div>
                <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: st.color }}>{st.text}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: '#1DB954' }} /><span className="text-xs text-gray-500 truncate">{ride.from_address}</span></div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-gray-500 truncate">{ride.to_address}</span></div>
              </div>
              {ride.cancel_reason && <p className="text-xs text-red-400 italic">Motif : {ride.cancel_reason}</p>}
              <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-gray-400"><Clock size={12} /><span className="text-xs">{formatDate(ride.created_at)}</span></div>
                  {ride.payment_method && <span className="text-xs">{paymentLabel(ride.payment_method).icon}</span>}
                </div>
                <span className="font-black text-sm" style={{ color: '#0F5138' }}>{formatPrice(ride.price)}</span>
              </div>
            </div>
          )
        })}
      </div>
      <nav className="bg-white flex border-t border-gray-100">
        <button onClick={() => setScreen('accueil')} className="flex-1 py-3 flex flex-col items-center gap-1"><Home size={22} color="#9CA3AF" /><span className="text-xs font-semibold text-gray-400">Accueil</span></button>
        <button onClick={() => { setScreen('courses'); loadRides() }} className="flex-1 py-3 flex flex-col items-center gap-1"><List size={22} color="#1DB954" /><span className="text-xs font-semibold" style={{ color: '#0F5138' }}>Mes courses</span></button>
      </nav>
    </div>
  )

  // ===== ACCUEIL CLIENT =====
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      <OfflineBanner />
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
              <button onClick={() => goTo('aide')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><HelpCircle size={20} color="#0F5138" /><span className="text-sm font-medium">Aide</span></button>
              <button onClick={() => goTo('parametres')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><Settings size={20} color="#0F5138" /><span className="text-sm font-medium">Parametres</span></button>
              <button onClick={() => goTo('apropos')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left"><Info size={20} color="#0F5138" /><span className="text-sm font-medium">A propos</span></button>
            </div>
            <button onClick={logout} className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 text-red-500"><LogOut size={20} /><span className="text-sm font-bold">Deconnexion</span></button>
          </div>
        </div>
      )}
      <header className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button onClick={() => setMenuOpen(true)} className="w-10 h-10 flex items-center justify-center"><Menu size={24} color="#0F5138" /></button>
      <div className="flex items-center gap-2">
          <LogoIcon size={28} />
          <LogoWordmark size={18} onDark={false} />
        </div>
        <button onClick={() => setScreen('profil')} className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center"><User size={20} className="text-gray-400" /></button>
      </header>

      {!gpsReady && (
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden shadow-lg" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3f4f6' }}>
                <Navigation size={20} color="#0F5138" />
              </div>
              <div>
                <p className="font-black text-base text-gray-900">Activez les services de géolocalisation</p>
                <p className="text-gray-400 text-xs mt-0.5">Nous ne savons pas où vous êtes</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddressInput(!showAddressInput)} className="flex-1 py-3 rounded-xl font-bold text-sm" style={{ background: '#f3f4f6', color: '#111' }}>
                Saisir une adresse
              </button>
              <button onClick={activerGPS} disabled={gpsLoading} className="flex-1 py-3 rounded-xl font-bold text-white text-sm" style={{ background: '#0F5138' }}>
                {gpsLoading ? 'Localisation...' : 'Activer'}
              </button>
            </div>
          </div>
          {showAddressInput && (
            <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <Search size={16} color="#9CA3AF" />
                <input
                  autoFocus
                  value={addressQuery}
                  onChange={async (e) => {
                    setAddressQuery(e.target.value)
                    if (e.target.value.length < 2) { setAddressResults([]); return }
                    setAddressLoading(true)
                    const places = await searchPlaces(e.target.value)
                    setAddressResults(places)
                    setAddressLoading(false)
                  }}
                  placeholder="Ex: Pikine, Dakar..."
                  className="flex-1 outline-none text-sm text-gray-700 bg-transparent"
                />
                {addressLoading && <span className="text-xs text-gray-400">...</span>}
              </div>
              {addressResults.length > 0 && (
                <div className="bg-white rounded-xl overflow-hidden border border-gray-100 max-h-48 overflow-y-auto">
                  {addressResults.slice(0, 5).map((place, i) => (
                    <button key={i} onClick={() => {
                      setPosition({ lat: place.lat, lng: place.lng, address: place.name })
                      setGpsReady(true)
                      setShowAddressInput(false)
                      setAddressQuery('')
                      setAddressResults([])
                    }} className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 text-left">
                      <MapPin size={14} color="#1DB954" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{place.name}</p>
                        <p className="text-xs text-gray-400 truncate">{place.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
          {nearbyDrivers.length > 0 ? (
            <><div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#1DB954' }} /><span className="text-xs font-bold" style={{ color: '#0F5138' }}>{nearbyDrivers.length} chauffeur{nearbyDrivers.length > 1 ? 's' : ''} dispo • Plus proche : {nearbyDrivers[0]?.eta} min</span></>
          ) : (
            <><div className="w-2 h-2 rounded-full bg-gray-300" /><span className="text-xs text-gray-400">Aucun chauffeur disponible pour le moment</span></>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-black mb-3">Services disponibles</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setService('moto')} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm" style={{ border: service === 'moto' ? '2px solid #1DB954' : '2px solid white' }}>
              <Zap size={32} color={service === 'moto' ? '#0F5138' : '#9CA3AF'} /><span className="font-bold" style={{ color: service === 'moto' ? '#0F5138' : '#9CA3AF' }}>Moto-taxi</span><span className="text-xs text-gray-400">2 min</span>
            </button>
            <button onClick={() => setService('livraison')} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm" style={{ border: service === 'livraison' ? '2px solid #1DB954' : '2px solid white' }}>
              <Package size={32} color={service === 'livraison' ? '#0F5138' : '#9CA3AF'} /><span className="font-bold" style={{ color: service === 'livraison' ? '#0F5138' : '#9CA3AF' }}>Livraison</span><span className="text-xs text-gray-400">10 min</span>
            </button>
          </div>
        </div>

        {isFirstRide && (
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #F59E0B, #1DB954)' }}>
            <span className="text-2xl">🎉</span>
            <div><p className="font-black text-white text-sm">-10% sur ta première course</p><p className="text-white text-xs opacity-90">Applique automatiquement à la commande</p></div>
          </div>
        )}

        <button onClick={() => { checkFirstRide(); setScreen('recherche') }} className="w-full bg-white rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1DB954' }} />
          <span className="flex-1 text-left text-gray-400">Ou allons-nous ?</span>
          <ChevronRight size={20} color="#0F5138" />
        </button>

        {freqDests.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2">VOS DESTINATIONS</p>
            <div className="space-y-2">
              {freqDests.map((dest, i) => (
                <button key={i} onClick={() => selectFreqDest(dest)} className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm text-left">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#E8F5E9' }}><Clock size={16} color="#0F5138" /></div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-sm text-black truncate">{dest.name}</p><p className="text-xs text-gray-400 truncate">{dest.address}</p></div>
                  <ChevronRight size={16} color="#D1D5DB" />
                </button>
              ))}
            </div>
          </div>
        )}

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