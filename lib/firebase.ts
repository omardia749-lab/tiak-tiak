import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const getFCMToken = async (): Promise<string | null> => {
  try {
    const supported = await isSupported()
    if (!supported) return null
    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    })
    return token || null
  } catch {
    return null
  }
}

export const onForegroundMessage = async (callback: (payload: any) => void) => {
  try {
    const supported = await isSupported()
    if (!supported) return
    const messaging = getMessaging(app)
    onMessage(messaging, callback)
  } catch {}
}