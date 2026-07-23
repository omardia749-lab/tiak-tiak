importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBo8KLlNuJ8C54cJFMPelfGX_sl3cR_h1E',
  authDomain: 'tiak-tiak-e8649.firebaseapp.com',
  projectId: 'tiak-tiak-e8649',
  messagingSenderId: '799762491201',
  appId: '1:799762491201:web:d99bd6b6de50920533e3c0',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}
  self.registration.showNotification(title || 'TIAK TIAK', {
    body: body || 'Nouvelle notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
  })
})